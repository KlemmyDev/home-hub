//! Public holidays from Nager.Date: free, no account and no key. The hub only sends it a country code and a year.

use serde_json::Value;
use std::time::Duration;
use tokio::{process::Command, time::timeout};

/// One holiday on one day.
#[derive(Clone, Debug, PartialEq)]
pub struct Holiday {
    pub date: String,
    pub name: String,
    /// Region codes it applies to, like "AU-QLD". Empty: the whole country.
    pub regions: Vec<String>,
}

/// A country code is two capital letters; nothing else is ever put in a web address.
pub fn is_country(c: &str) -> bool {
    c.len() == 2 && c.bytes().all(|b| b.is_ascii_uppercase())
}

pub async fn fetch(country: &str, year: i32) -> Result<Vec<Holiday>, String> {
    if !is_country(country) || !(1990..=2100).contains(&year) {
        return Err("That isn't a country code.".into());
    }
    let url = format!("https://date.nager.at/api/v3/PublicHolidays/{year}/{country}");
    let run = Command::new("curl")
        .args(["-fsSL", "--max-time", "10", "--max-filesize", "400000", "--proto", "=https", "--proto-redir", "=https", "-A", "HomeHub", "--", &url])
        .kill_on_drop(true)
        .output();
    let out = timeout(Duration::from_secs(12), run)
        .await
        .map_err(|_| "The holiday service took too long to answer.".to_string())?
        .map_err(|_| "Couldn't fetch holidays on this machine.".to_string())?;
    if !out.status.success() {
        return Err("Couldn't reach the holiday service.".into());
    }
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|_| "The holiday service sent something unexpected.".to_string())?;
    Ok(parse(&v))
}

fn parse(v: &Value) -> Vec<Holiday> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|h| {
                    let date = h["date"].as_str()?.to_string();
                    let name = h["name"].as_str().or(h["localName"].as_str())?.to_string();
                    let global = h["global"].as_bool().unwrap_or(true);
                    let regions = if global { vec![] } else { h["counties"].as_array().map(|c| c.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default() };
                    Some(Holiday { date, name, regions })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Whether a holiday applies where the family lives (`region` like "AU-QLD", or empty for the whole country).
pub fn applies(h: &Holiday, region: &str) -> bool {
    h.regions.is_empty() || (!region.is_empty() && h.regions.iter().any(|r| r == region))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn regions_decide_which_holidays_apply() {
        let v = json!([
            {"date": "2026-01-01", "name": "New Year's Day", "global": true, "counties": null},
            {"date": "2026-08-12", "name": "Ekka", "global": false, "counties": ["AU-QLD"]},
        ]);
        let hs = parse(&v);
        assert_eq!(hs.len(), 2);
        assert!(applies(&hs[0], ""));
        assert!(!applies(&hs[1], ""));
        assert!(!applies(&hs[1], "AU-NSW"));
        assert!(applies(&hs[1], "AU-QLD"));
    }

    #[test]
    fn only_two_capitals_are_a_country() {
        assert!(is_country("AU"));
        assert!(!is_country("au"));
        assert!(!is_country("AU/../x"));
    }
}
