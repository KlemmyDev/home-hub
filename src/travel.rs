//! Travel: which places the family has seen, and which map squares they've marked as done (data/travel.json).
//!
//! The squares are the world's map tiles at zoom 10 ("10/x/y", about 30 to 38 km across in Australia), and the
//! places in each one are listed in the screen's own code (ui/src/lib/travelplaces.ts). Only what's been ticked
//! is kept here, each with the day it was ticked on the family's own calendar.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

const MAX_TICKS: usize = 20_000;

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Travel {
    /// Place id to the day it was seen ("2026-11-07").
    #[serde(default)]
    pub seen: BTreeMap<String, String>,
    /// Square ("10/946/593") to the day the whole square was marked as done, list or not.
    #[serde(default)]
    pub squares: BTreeMap<String, String>,
}

/// A place id: short, lower case letters, digits and dashes.
fn place_ok(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// A square: "10/x/y" with x and y inside the world at zoom 10.
fn square_ok(id: &str) -> bool {
    let p: Vec<&str> = id.split('/').collect();
    p.len() == 3 && p[0] == "10" && p[1..].iter().all(|n| n.len() <= 4 && n.parse::<u32>().map(|v| v < 1024).unwrap_or(false))
}

fn date_ok(d: &str) -> bool {
    chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok()
}

impl Travel {
    fn room(&self) -> Result<(), &'static str> {
        if self.seen.len() + self.squares.len() >= MAX_TICKS { Err("That's as many as the hub can keep.") } else { Ok(()) }
    }

    /// Tick (or untick) a place as seen.
    pub fn set_seen(&mut self, id: &str, seen: bool, date: &str) -> Result<(), &'static str> {
        if !place_ok(id) { return Err("That isn't a place the hub knows."); }
        if !seen { self.seen.remove(id); return Ok(()); }
        if !date_ok(date) { return Err("That date doesn't look right."); }
        if !self.seen.contains_key(id) { self.room()?; }
        self.seen.insert(id.to_string(), date.to_string());
        Ok(())
    }

    /// Mark (or unmark) a whole square as done.
    pub fn set_square(&mut self, id: &str, done: bool, date: &str) -> Result<(), &'static str> {
        if !square_ok(id) { return Err("That isn't a square on the map."); }
        if !done { self.squares.remove(id); return Ok(()); }
        if !date_ok(date) { return Err("That date doesn't look right."); }
        if !self.squares.contains_key(id) { self.room()?; }
        self.squares.insert(id.to_string(), date.to_string());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticks_and_unticks() {
        let mut t = Travel::default();
        t.set_seen("ips-queens-park", true, "2026-11-07").unwrap();
        assert_eq!(t.seen.get("ips-queens-park").map(String::as_str), Some("2026-11-07"));
        t.set_seen("ips-queens-park", false, "").unwrap();
        assert!(t.seen.is_empty());
        t.set_square("10/946/593", true, "2026-11-07").unwrap();
        assert!(t.squares.contains_key("10/946/593"));
        t.set_square("10/946/593", false, "").unwrap();
        assert!(t.squares.is_empty());
    }

    #[test]
    fn refuses_odd_ids() {
        let mut t = Travel::default();
        assert!(t.set_seen("../etc", true, "2026-11-07").is_err());
        assert!(t.set_seen("Big Place", true, "2026-11-07").is_err());
        assert!(t.set_square("10/1024/5", true, "2026-11-07").is_err());
        assert!(t.set_square("11/5/5", true, "2026-11-07").is_err());
        assert!(t.set_square("10/5/5", true, "yesterday").is_err());
    }
}
