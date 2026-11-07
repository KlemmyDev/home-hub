//! Pictures for the Travel map's places, from Wikimedia Commons (free, no account or key, openly licensed).
//!
//! The screen names a Commons file ("Nerima Gardens Boardwalk.jpg"); the hub asks Commons for an 800 px copy and who
//! took it, downloads it once into data/travel-photos/ and serves it from there, so the tablet never has to reach
//! Wikimedia itself and each picture is fetched only once. A picture that couldn't be fetched is tried again a day later.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{process::Command, time::timeout};

const UA: &str = "HomeHub/0.1 (self-hosted family dashboard; https://github.com/KlemmyDev/home-hub)";
const RETRY_AFTER: u64 = 86_400;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Photo {
    /// Where the screen gets the picture from the hub, or empty if there isn't one.
    #[serde(default)]
    pub img: String,
    /// Who made it and its licence, for the credit line under it.
    #[serde(default)]
    pub credit: String,
    #[serde(default)]
    pub licence: String,
    /// Its page on Wikimedia Commons.
    #[serde(default)]
    pub page: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub error: String,
    /// When a failed fetch happened (unix seconds), so it's retried later rather than every time.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub failed_at: u64,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

/// A Commons file name the hub will ask for: a picture's name, nothing that could reach outside it.
pub fn file_ok(f: &str) -> bool {
    let lower = f.to_ascii_lowercase();
    !f.is_empty() && f.len() <= 200 && !f.chars().any(|c| c.is_control() || matches!(c, '/' | '\\' | '|' | '#' | '?' | '<' | '>' | '[' | ']' | '{' | '}'))
        && [".jpg", ".jpeg", ".png", ".webp"].iter().any(|e| lower.ends_with(e))
}

/// A short, stable name for a file's copy on disk (FNV-1a).
pub fn key(f: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in f.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// A key the screen sent back: exactly what `key` makes.
pub fn key_ok(k: &str) -> bool {
    k.len() == 16 && k.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

pub fn dir(data: &Path) -> PathBuf {
    data.join("travel-photos")
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Percent-encode for a web address.
fn encode(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// Commons gives the author as a bit of HTML; keep just the words.
fn plain(html: &str) -> String {
    let mut out = String::new();
    let mut tag = false;
    for c in html.chars() {
        match c {
            '<' => tag = true,
            '>' => tag = false,
            _ if !tag => out.push(c),
            _ => {}
        }
    }
    let out = out.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">");
    let out = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if out.chars().count() > 80 { out.chars().take(77).collect::<String>() + "…" } else { out }
}

async fn curl(url: &str, max: &str) -> Result<Vec<u8>, String> {
    let run = Command::new("curl")
        .args(["-fsSL", "--max-time", "20", "--max-filesize", max, "--proto", "=https", "--proto-redir", "=https", "-A", UA, "--", url])
        .kill_on_drop(true)
        .output();
    let out = timeout(Duration::from_secs(25), run).await.map_err(|_| "Wikimedia took too long.".to_string())?.map_err(|_| "Couldn't run curl.".to_string())?;
    if !out.status.success() {
        return Err("Couldn't reach Wikimedia.".into());
    }
    Ok(out.stdout)
}

/// The picture for a Commons file: from the hub's own copy, or fetched now (and kept).
pub async fn get(data: &Path, file: &str) -> Photo {
    let k = key(file);
    let d = dir(data);
    let meta = d.join(format!("{k}.json"));
    if let Ok(bytes) = tokio::fs::read(&meta).await {
        if let Ok(p) = serde_json::from_slice::<Photo>(&bytes) {
            if p.failed_at == 0 || now() - p.failed_at < RETRY_AFTER {
                return p;
            }
        }
    }
    let p = match fetch(&d, file, &k).await {
        Ok(p) => p,
        Err(e) => Photo { error: e, failed_at: now(), ..Default::default() },
    };
    let _ = tokio::fs::create_dir_all(&d).await;
    let _ = crate::write_atomic(&meta, &serde_json::to_vec_pretty(&p).unwrap()).await;
    p
}

async fn fetch(d: &Path, file: &str, k: &str) -> Result<Photo, String> {
    let api = format!(
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=Artist|LicenseShortName&iiurlwidth=800&titles={}",
        encode(&format!("File:{file}"))
    );
    let j: Value = serde_json::from_slice(&curl(&api, "200000").await?).map_err(|_| "Wikimedia sent something unexpected.".to_string())?;
    let page = j["query"]["pages"].as_object().and_then(|m| m.values().next()).cloned().unwrap_or_default();
    let ii = &page["imageinfo"][0];
    let thumb = ii["thumburl"].as_str().or(ii["url"].as_str()).ok_or("That picture isn't on Wikimedia Commons.")?;
    if !["https://upload.wikimedia.org/", "https://thumb.wikimedia.org/"].iter().any(|h| thumb.starts_with(h)) {
        return Err("That picture is somewhere unexpected.".into());
    }
    let thumb = thumb.split('?').next().unwrap_or(thumb);      // without the tracking words Commons adds
    let lower = thumb.to_ascii_lowercase();
    let ext = if lower.ends_with(".png") { "png" } else if lower.ends_with(".webp") { "webp" } else { "jpg" };
    let bytes = curl(thumb, "4000000").await?;
    if bytes.len() < 500 {
        return Err("The picture came back empty.".into());
    }
    tokio::fs::create_dir_all(d).await.map_err(|_| "Couldn't save the picture.".to_string())?;
    crate::write_atomic(&d.join(format!("{k}.{ext}")), &bytes).await.map_err(|_| "Couldn't save the picture.".to_string())?;
    let m = &ii["extmetadata"];
    Ok(Photo {
        img: format!("/api/travel/img/{k}.{ext}"),
        credit: plain(m["Artist"]["value"].as_str().unwrap_or("")),
        licence: plain(m["LicenseShortName"]["value"].as_str().unwrap_or("")),
        page: ii["descriptionurl"].as_str().filter(|u| u.starts_with("https://commons.wikimedia.org/")).unwrap_or("").to_string(),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_names() {
        assert!(file_ok("Nerima Gardens Boardwalk.jpg"));
        assert!(file_ok("Brown Lake (North Stradbroke Island).JPG"));
        assert!(!file_ok("../config.json"));
        assert!(!file_ok("a/b.jpg"));
        assert!(!file_ok("map.svg"));
        assert!(key_ok(&key("Nerima Gardens Boardwalk.jpg")));
        assert!(!key_ok("../../etc/passwd"));
        assert_eq!(plain("<a href=\"x\">Kerry&amp;Co</a> <span>Raymond</span>"), "Kerry&Co Raymond");
    }
}
