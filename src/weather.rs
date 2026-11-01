//! Weather from Open-Meteo: free, no account and no key. The hub only sends it a place's rounded coordinates.

use serde_json::{json, Value};
use std::time::Duration;
use tokio::{process::Command, time::timeout};

async fn get(url: &str) -> Result<Value, String> {
    let run = Command::new("curl")
        .args(["-fsSL", "--max-time", "10", "--max-filesize", "200000", "--proto", "=https", "--proto-redir", "=https", "-A", "HomeHub", "--", url])
        .kill_on_drop(true)
        .output();
    let out = timeout(Duration::from_secs(12), run)
        .await
        .map_err(|_| "The weather service took too long to answer.".to_string())?
        .map_err(|_| "Couldn't fetch the weather on this machine.".to_string())?;
    if !out.status.success() {
        return Err("Couldn't reach the weather service.".into());
    }
    serde_json::from_slice(&out.stdout).map_err(|_| "The weather service sent something unexpected.".to_string())
}

/// Percent-encode a search so it can sit in a web address.
fn encode(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// Places that match what was typed: a name, where it is, and its coordinates.
pub async fn search(q: &str) -> Result<Value, String> {
    let q = q.trim();
    if q.len() < 2 || q.len() > 60 {
        return Err("Type the name of a town or city.".into());
    }
    let r = get(&format!("https://geocoding-api.open-meteo.com/v1/search?name={}&count=6&language=en&format=json", encode(q))).await?;
    let places: Vec<Value> = r["results"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|p| {
                    let (lat, lon) = (p["latitude"].as_f64()?, p["longitude"].as_f64()?);
                    let detail = [p["admin1"].as_str(), p["country"].as_str()].iter().flatten().copied().collect::<Vec<_>>().join(", ");
                    Some(json!({"name": p["name"].as_str()?, "detail": detail, "lat": lat, "lon": lon}))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(json!(places))
}

/// What a weather code means, in plain words, and which picture goes with it.
pub fn describe(code: i64, day: bool) -> (&'static str, &'static str) {
    match code {
        0 => (if day { "Sunny" } else { "Clear" }, if day { "sun" } else { "moon" }),
        1 => (if day { "Mostly sunny" } else { "Mostly clear" }, if day { "sun" } else { "moon" }),
        2 => ("Partly cloudy", if day { "partly" } else { "partly-night" }),
        3 => ("Cloudy", "cloud"),
        45 | 48 => ("Foggy", "fog"),
        51 | 53 | 55 | 56 | 57 => ("Drizzle", "rain"),
        61 | 63 | 80 | 81 => ("Rain", "rain"),
        65 | 82 => ("Heavy rain", "rain"),
        66 | 67 => ("Freezing rain", "rain"),
        71 | 73 | 77 | 85 => ("Snow", "snow"),
        75 | 86 => ("Heavy snow", "snow"),
        95 | 96 | 99 => ("Thunderstorm", "storm"),
        _ => ("Unsettled", "cloud"),
    }
}

/// Now, and today's high and low, for a place.
pub async fn forecast(lat: f64, lon: f64, fahrenheit: bool) -> Result<Value, String> {
    let unit = if fahrenheit { "&temperature_unit=fahrenheit" } else { "" };
    let r = get(&format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat:.2}&longitude={lon:.2}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto{unit}"
    ))
    .await?;
    let temp = r["current"]["temperature_2m"].as_f64().ok_or("The weather service didn't have the weather for that place.")?;
    let code = r["current"]["weather_code"].as_i64().unwrap_or(-1);
    let day = r["current"]["is_day"].as_i64().unwrap_or(1) == 1;
    let (summary, icon) = describe(code, day);
    Ok(json!({
        "temp": temp.round(),
        "high": r["daily"]["temperature_2m_max"][0].as_f64().map(f64::round),
        "low": r["daily"]["temperature_2m_min"][0].as_f64().map(f64::round),
        "summary": summary,
        "icon": icon,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_and_pictures() {
        assert_eq!(describe(0, true), ("Sunny", "sun"));
        assert_eq!(describe(0, false), ("Clear", "moon"));
        assert_eq!(describe(63, true).1, "rain");
        assert_eq!(describe(95, false).0, "Thunderstorm");
        assert_eq!(describe(1234, true).1, "cloud");
    }

    #[test]
    fn searches_are_encoded() {
        assert_eq!(encode("St Albans"), "St%20Albans");
        assert_eq!(encode("Zürich"), "Z%C3%BCrich");
    }
}
