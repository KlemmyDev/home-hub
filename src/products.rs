//! Product lookup from Open Food Facts: a free, shared database of supermarket products, with no account or key.
//! It knows the barcode of each product, which is what lets a dinner's ingredient be matched to the same product at any shop later.
//! Coverage of Australian products is partial (people add them), so a search can come back short.

use serde_json::{json, Value};
use std::time::Duration;
use tokio::{process::Command, time::timeout};

async fn get(url: &str) -> Result<Value, String> {
    let run = Command::new("curl")
        .args(["-fsSL", "--max-time", "8", "--max-filesize", "600000", "--proto", "=https", "--proto-redir", "=https", "-A", "HomeHub/1.0 (family dashboard)", "--", url])
        .kill_on_drop(true)
        .output();
    let out = timeout(Duration::from_secs(10), run)
        .await
        .map_err(|_| "The product list took too long to answer.".to_string())?
        .map_err(|_| "Couldn't look up products on this machine.".to_string())?;
    if !out.status.success() {
        return Err("Couldn't reach the product list.".into());
    }
    serde_json::from_slice(&out.stdout).map_err(|_| "The product list sent something unexpected.".to_string())
}

/// Percent-encode text so it can sit in a web address.
fn encode(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

const FIELDS: &str = "code,product_name,brands,quantity,image_small_url";

fn tidy(hit: &Value) -> Option<Value> {
    let code = hit["code"].as_str()?.trim().to_string();
    let name = hit["product_name"].as_str()?.trim().to_string();
    if name.is_empty() || code.is_empty() || !code.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let brand = match &hit["brands"] {
        Value::Array(a) => a.iter().filter_map(|b| b.as_str()).next().unwrap_or("").to_string(),
        Value::String(s) => s.split(',').next().unwrap_or("").trim().to_string(),
        _ => String::new(),
    };
    let image = hit["image_small_url"].as_str().filter(|u| u.starts_with("https://images.openfoodfacts.org/")).unwrap_or("");
    Some(json!({
        "code": code,
        "name": name.chars().take(120).collect::<String>(),
        "brand": brand.chars().take(80).collect::<String>(),
        "quantity": hit["quantity"].as_str().unwrap_or("").trim().chars().take(30).collect::<String>(),
        "image": image,
    }))
}

/// Products matching what was typed (Australian ones first), or the one with that barcode when digits are typed.
pub async fn search(q: &str) -> Result<Value, String> {
    let q = q.split_whitespace().collect::<Vec<_>>().join(" ");
    if q.chars().count() < 2 || q.chars().count() > 60 {
        return Err("Type at least two letters, or a barcode.".into());
    }
    let base = "https://search.openfoodfacts.org/search";
    let barcode = q.bytes().all(|b| b.is_ascii_digit()) && (8..=14).contains(&q.len());
    let query = |text: String| format!("{base}?q={}&page_size=12&fields={FIELDS}", encode(&text));
    let (au, any) = if barcode {
        let u = query(format!("code:{q}"));
        (get(&u).await, Err(String::new()))
    } else {
        // Characters that mean something to the search itself are left out.
        let safe: String = q.chars().filter(|c| !"\":()[]{}\\/^~*?!+-".contains(*c)).collect();
        let (u1, u2) = (query(format!("{safe} countries_tags:\"en:australia\"")), query(safe.clone()));
        tokio::join!(get(&u1), get(&u2))
    };
    if au.is_err() && any.is_err() {
        return Err(au.err().filter(|e| !e.is_empty()).unwrap_or_else(|| "Couldn't reach the product list.".into()));
    }
    // Australian ones first; within each, the ones that say a brand and a size, and have a picture, come first.
    let score = |h: &Value| ["brand", "quantity", "image"].iter().filter(|k| h[**k].as_str().is_some_and(|v| !v.is_empty())).count();
    let mut out: Vec<Value> = Vec::new();
    for r in [au, any].into_iter().flatten() {
        let mut found: Vec<Value> = r["hits"].as_array().into_iter().flatten().filter_map(tidy).collect();
        found.sort_by_key(|h| std::cmp::Reverse(score(h)));
        for h in found {
            if !out.iter().any(|o| o["code"] == h["code"]) {
                out.push(h);
            }
        }
    }
    out.truncate(15);
    Ok(Value::Array(out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hits_are_tidied_and_unsafe_ones_dropped() {
        let ok = tidy(&json!({"code": "9300652006520", "product_name": " Weet-Bix Blends ", "brands": ["Weetbix", "Sanitarium"], "quantity": "750 g", "image_small_url": "https://images.openfoodfacts.org/x.jpg"})).unwrap();
        assert_eq!((ok["brand"].as_str(), ok["name"].as_str(), ok["image"].as_str()), (Some("Weetbix"), Some("Weet-Bix Blends"), Some("https://images.openfoodfacts.org/x.jpg")));
        assert!(tidy(&json!({"code": "93x", "product_name": "Odd"})).is_none(), "barcodes are digits");
        assert!(tidy(&json!({"code": "1", "product_name": ""})).is_none());
        assert_eq!(tidy(&json!({"code": "1", "product_name": "A", "image_small_url": "https://evil.example/x.jpg"})).unwrap()["image"], "");
    }
}
