//! Countdowns on the Home page: days to go until a holiday, a birthday, a trip (data/countdowns.json).
//!
//! Each one is a name, a day on the family's own calendar, a little picture (an emoji) and a colour. One that
//! comes round every year (Christmas, a birthday) counts down to its next time; a one-off is tidied away a
//! week after its day has gone.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

const MAX: usize = 30;

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Countdown {
    #[serde(default)]
    pub id: String,
    pub title: String,
    /// The day, like "2026-12-25". For a yearly one only the month and day matter after the first time.
    pub date: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub yearly: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Countdowns {
    #[serde(default)]
    pub items: Vec<Countdown>,
}

fn color_ok(c: &str) -> bool {
    c.is_empty() || (c.len() == 7 && c.starts_with('#') && c[1..].bytes().all(|b| b.is_ascii_hexdigit()))
}

fn new_id(taken: impl Fn(&str) -> bool) -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    (0..).map(|n| format!("c{t}x{n}")).find(|id| !taken(id)).unwrap()
}

impl Countdowns {
    /// Add a countdown (no id, or one the hub doesn't know) or change the one with this id. Returns its id.
    pub fn save(&mut self, mut c: Countdown, today: NaiveDate) -> Result<String, &'static str> {
        c.title = c.title.trim().to_string();
        if c.title.is_empty() || c.title.chars().count() > 40 { return Err("Give it a name (up to 40 letters)."); }
        if NaiveDate::parse_from_str(&c.date, "%Y-%m-%d").is_err() { return Err("That date doesn't look right."); }
        if c.icon.chars().count() > 8 { return Err("That picture is too long."); }
        if !color_ok(&c.color) { return Err("That colour doesn't look right."); }
        self.tidy(today);
        if let Some(cur) = self.items.iter_mut().find(|x| !c.id.is_empty() && x.id == c.id) {
            *cur = c;
            return Ok(cur.id.clone());
        }
        if self.items.len() >= MAX { return Err("That's as many countdowns as the hub can keep."); }
        c.id = new_id(|id| self.items.iter().any(|x| x.id == id));
        let id = c.id.clone();
        self.items.push(c);
        Ok(id)
    }

    pub fn remove(&mut self, id: &str) -> Result<(), &'static str> {
        let n = self.items.len();
        self.items.retain(|x| x.id != id);
        if self.items.len() == n { Err("That countdown has already gone.") } else { Ok(()) }
    }

    /// Let go of one-offs whose day was more than a week ago.
    pub fn tidy(&mut self, today: NaiveDate) {
        self.items.retain(|x| x.yearly || NaiveDate::parse_from_str(&x.date, "%Y-%m-%d").map(|d| (today - d).num_days() <= 7).unwrap_or(false));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> NaiveDate { NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap() }
    fn cd(title: &str, date: &str, yearly: bool) -> Countdown { Countdown { title: title.into(), date: date.into(), yearly, icon: "🎄".into(), color: "#14a06c".into(), ..Default::default() } }

    #[test]
    fn adds_changes_and_removes() {
        let mut c = Countdowns::default();
        let id = c.save(cd(" Christmas ", "2026-12-25", true), day("2026-11-07")).unwrap();
        assert_eq!(c.items[0].title, "Christmas");
        c.save(Countdown { id: id.clone(), ..cd("Christmas Day", "2026-12-25", true) }, day("2026-11-07")).unwrap();
        assert_eq!(c.items.len(), 1);
        assert_eq!(c.items[0].title, "Christmas Day");
        c.remove(&id).unwrap();
        assert!(c.items.is_empty());
        assert!(c.remove(&id).is_err());
    }

    #[test]
    fn refuses_odd_ones() {
        let mut c = Countdowns::default();
        let t = day("2026-11-07");
        assert!(c.save(cd("", "2026-12-25", false), t).is_err());
        assert!(c.save(cd("Trip", "next week", false), t).is_err());
        assert!(c.save(Countdown { color: "red".into(), ..cd("Trip", "2026-12-25", false) }, t).is_err());
    }

    #[test]
    fn tidies_old_one_offs() {
        let mut c = Countdowns::default();
        c.items = vec![cd("Old trip", "2026-10-01", false), cd("Last week", "2026-11-01", false), cd("Birthday", "2016-05-14", true)];
        c.tidy(day("2026-11-07"));
        assert_eq!(c.items.iter().map(|x| x.title.as_str()).collect::<Vec<_>>(), ["Last week", "Birthday"]);
    }
}
