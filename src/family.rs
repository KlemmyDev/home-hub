//! The family: who is in it, and the events made right on the hub (data/family.json).
//! Hub events use the same repeat engine as imported calendars, so they show up beside them.

use crate::calendar::{Event, Kind};
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};

pub const MAX_PEOPLE: usize = 12;
pub const MAX_EVENTS: usize = 2000;
const DAYS: [&str; 7] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Person {
    pub id: String,
    pub name: String,
    pub color: String,
    /// Their birthday as a date like 2016-05-14 (the year gives their age). Empty: none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub birthday: Option<String>,
}

/// How an event repeats. `freq` is none, daily, weekly, monthly or yearly.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Repeat {
    pub freq: String,
    #[serde(default = "one")]
    pub interval: u32,
    /// For weekly repeats: MO, TU, WE, TH, FR, SA, SU. Empty means the same weekday as the start.
    #[serde(default)]
    pub days: Vec<String>,
    /// The last day it happens, like 2026-12-18. Empty means it carries on.
    #[serde(default)]
    pub until: Option<String>,
}

impl Default for Repeat {
    fn default() -> Self {
        Repeat { freq: "none".into(), interval: 1, days: vec![], until: None }
    }
}

fn one() -> u32 {
    1
}

/// An event made on the hub. Times are the family's own wall clock, like "2026-11-02T08:15".
/// An all-day event uses plain dates, and `end` is the last day it covers.
#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct HubEvent {
    #[serde(default)]
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub all_day: bool,
    pub start: String,
    pub end: String,
    /// Who it's for (person ids).
    #[serde(default)]
    pub people: Vec<String>,
    #[serde(default)]
    pub repeat: Repeat,
    /// Days of a repeating event that were skipped, written like `start`.
    #[serde(default)]
    pub skip: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
pub struct Family {
    #[serde(default)]
    pub people: Vec<Person>,
    #[serde(default)]
    pub events: Vec<HubEvent>,
}

#[derive(Deserialize)]
pub struct PersonIn {
    pub id: Option<String>,
    pub name: String,
    pub color: String,
    pub birthday: Option<String>,
}

fn parse_dt(s: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")).ok()
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

fn stamp(n: &NaiveDateTime) -> String {
    n.format("%Y%m%dT%H%M%S").to_string()
}

/// A fresh id that no `taken` id already uses.
fn new_id(prefix: &str, taken: impl Fn(&str) -> bool) -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    (0..).map(|n| format!("{prefix}{t}x{n}")).find(|id| !taken(id)).unwrap()
}

fn is_color(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|x| x.is_ascii_hexdigit())
}

impl HubEvent {
    /// The start as a moment (an all-day event starts at midnight).
    fn start_at(&self) -> Option<NaiveDateTime> {
        if self.all_day {
            parse_date(&self.start)?.and_hms_opt(0, 0, 0)
        } else {
            parse_dt(&self.start)
        }
    }

    fn check(&self, people: &[Person]) -> Result<(), &'static str> {
        let title = self.title.trim();
        if title.is_empty() || title.chars().count() > 80 {
            return Err("Give it a name (up to 80 letters).");
        }
        if self.location.chars().count() > 80 {
            return Err("The place is a bit long (up to 80 letters).");
        }
        let start = self.start_at().ok_or("That start time doesn't look right.")?;
        let end = if self.all_day {
            parse_date(&self.end).and_then(|d| d.and_hms_opt(0, 0, 0)).ok_or("That last day doesn't look right.")?
        } else {
            parse_dt(&self.end).ok_or("That end time doesn't look right.")?
        };
        if end < start || (!self.all_day && end == start) {
            return Err("It should end after it starts.");
        }
        if end - start > Duration::days(60) {
            return Err("An event can last up to about two months.");
        }
        if self.people.len() > MAX_PEOPLE || self.people.iter().any(|p| !people.iter().any(|x| &x.id == p)) {
            return Err("One of those people isn't in the family any more.");
        }
        let r = &self.repeat;
        if !["none", "daily", "weekly", "monthly", "yearly"].contains(&r.freq.as_str()) {
            return Err("That isn't a way to repeat.");
        }
        if r.interval == 0 || r.interval > 30 {
            return Err("Repeat every 1 to 30.");
        }
        if r.days.iter().any(|d| !DAYS.contains(&d.as_str())) {
            return Err("Those days don't look right.");
        }
        if let Some(u) = r.until.as_deref().filter(|u| !u.is_empty()) {
            let until = parse_date(u).ok_or("That 'until' day doesn't look right.")?;
            if until < start.date() {
                return Err("It can't repeat until before it starts.");
            }
        }
        Ok(())
    }

    /// The event as the calendar engine understands it, with repeats and skipped days.
    pub fn to_event(&self) -> Option<Event> {
        let start = self.start_at()?;
        let (end, kind) = if self.all_day {
            (parse_date(&self.end)?.and_hms_opt(0, 0, 0)? + Duration::days(1), Kind::AllDay)
        } else {
            (parse_dt(&self.end)?, Kind::Floating)
        };
        let r = &self.repeat;
        let recur = (r.freq != "none").then(|| {
            let mut rule = format!("FREQ={};INTERVAL={}", r.freq.to_ascii_uppercase(), r.interval.max(1));
            if r.freq == "weekly" && !r.days.is_empty() {
                rule.push_str(&format!(";BYDAY={}", r.days.join(",")));
            }
            if let Some(u) = r.until.as_deref().filter(|u| !u.is_empty()).and_then(parse_date) {
                rule.push_str(&format!(";UNTIL={}T235959Z", u.format("%Y%m%d")));
            }
            let mut s = format!("DTSTART:{}Z\nRRULE:{}\n", stamp(&start), rule);
            for k in &self.skip {
                let n = if self.all_day { parse_date(k).and_then(|d| d.and_hms_opt(0, 0, 0)) } else { parse_dt(k) };
                if let Some(n) = n {
                    s.push_str(&format!("EXDATE:{}Z\n", stamp(&n)));
                }
            }
            s
        });
        Some(Event { uid: self.id.clone(), title: self.title.trim().to_string(), location: self.location.trim().to_string(), start, end, kind, recur, replaces: None })
    }
}

/// A person's birthday that falls on a day in a range: the person's index, the day, and the age they turn (if the year is known).
pub struct Birthday {
    pub person: usize,
    pub day: NaiveDate,
    pub turns: Option<i32>,
}

impl Family {
    /// Birthdays on days from `from` to `to` (both included). 29 February is kept on the 28th in other years.
    pub fn birthdays(&self, from: NaiveDate, to: NaiveDate) -> Vec<Birthday> {
        let mut out = Vec::new();
        for (i, p) in self.people.iter().enumerate() {
            let Some(b) = p.birthday.as_deref().and_then(parse_date) else { continue };
            for year in from.year()..=to.year() {
                let day = NaiveDate::from_ymd_opt(year, b.month(), b.day()).or_else(|| NaiveDate::from_ymd_opt(year, b.month(), 28));
                let Some(day) = day.filter(|d| *d >= from && *d <= to && *d >= b) else { continue };
                out.push(Birthday { person: i, day, turns: Some(year - b.year()).filter(|n| *n > 0) });
            }
        }
        out
    }

    /// Replace the family. An entry with an id keeps it; people left out are taken off any events.
    pub fn set_people(&mut self, list: Vec<PersonIn>) -> Result<(), &'static str> {
        if list.len() > MAX_PEOPLE {
            return Err("Up to 12 people, please.");
        }
        let mut people: Vec<Person> = Vec::new();
        for p in list {
            let name = p.name.trim().to_string();
            if name.is_empty() || name.chars().count() > 30 {
                return Err("Give everyone a name (up to 30 letters).");
            }
            if people.iter().any(|x| x.name.to_lowercase() == name.to_lowercase()) {
                return Err("Two people have the same name.");
            }
            if !is_color(&p.color) {
                return Err("That colour isn't one we know.");
            }
            let id = match p.id.filter(|id| self.people.iter().any(|x| &x.id == id)) {
                Some(id) => id,
                None => new_id("p", |id| self.people.iter().chain(people.iter()).any(|x| x.id == id)),
            };
            let birthday = match p.birthday.map(|b| b.trim().to_string()).filter(|b| !b.is_empty()) {
                Some(b) if parse_date(&b).is_some() => Some(b),
                Some(_) => return Err("That birthday isn't a date we know."),
                None => None,
            };
            people.push(Person { id, name, color: p.color, birthday });
        }
        for e in &mut self.events {
            e.people.retain(|id| people.iter().any(|p| &p.id == id));
        }
        self.people = people;
        Ok(())
    }

    /// Add an event, or change the one with the same id. Returns its id.
    pub fn save_event(&mut self, mut ev: HubEvent) -> Result<String, &'static str> {
        ev.check(&self.people)?;
        ev.title = ev.title.trim().to_string();
        ev.location = ev.location.trim().to_string();
        ev.people.dedup();
        if ev.repeat.freq == "none" {
            ev.repeat = Repeat::default();
        }
        match self.events.iter().position(|e| e.id == ev.id) {
            Some(i) => {
                // Skipped days only still make sense if the start is where it was.
                ev.skip = if self.events[i].start == ev.start && ev.repeat.freq != "none" { self.events[i].skip.clone() } else { vec![] };
                self.events[i] = ev.clone();
            }
            None => {
                if self.events.len() >= MAX_EVENTS {
                    return Err("That's a lot of events. Remove some old ones first.");
                }
                ev.id = new_id("h", |id| self.events.iter().any(|e| e.id == id));
                ev.skip = vec![];
                self.events.push(ev.clone());
            }
        }
        Ok(ev.id)
    }

    /// Remove an event, or (with `only`, for a repeating one) just the occurrence starting then.
    pub fn remove_event(&mut self, id: &str, only: Option<&str>) -> Result<(), &'static str> {
        let i = self.events.iter().position(|e| e.id == id).ok_or("That event has gone already.")?;
        match only.filter(|_| self.events[i].repeat.freq != "none") {
            Some(when) => {
                let w = if self.events[i].all_day { when.get(..10).unwrap_or(when) } else { when.get(..16).unwrap_or(when) };
                if !self.events[i].skip.iter().any(|s| s == w) {
                    self.events[i].skip.push(w.to_string());
                }
            }
            None => {
                self.events.remove(i);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::between;
    use chrono::{DateTime, Utc};

    fn dad() -> Family {
        let mut f = Family::default();
        f.set_people(vec![PersonIn { id: None, name: "Dad".into(), color: "#2f6fe0".into(), birthday: None }]).unwrap();
        f
    }

    #[test]
    fn birthdays_come_round_every_year_with_the_age() {
        let mut f = dad();
        f.set_people(vec![PersonIn { id: None, name: "Kid".into(), color: "#2f6fe0".into(), birthday: Some("2016-11-05".into()) }]).unwrap();
        let d = |y, m, dd| NaiveDate::from_ymd_opt(y, m, dd).unwrap();
        let b = f.birthdays(d(2026, 11, 1), d(2026, 11, 30));
        assert_eq!((b.len(), b[0].day, b[0].turns), (1, d(2026, 11, 5), Some(10)));
        assert!(f.birthdays(d(2026, 11, 6), d(2026, 12, 31)).is_empty());
        assert!(f.birthdays(d(2016, 1, 1), d(2016, 11, 4)).is_empty());
        assert!(f.set_people(vec![PersonIn { id: None, name: "X".into(), color: "#2f6fe0".into(), birthday: Some("soon".into()) }]).is_err());
    }

    fn ev(f: &Family) -> HubEvent {
        HubEvent { title: "Swim".into(), start: "2026-11-02T16:00".into(), end: "2026-11-02T17:00".into(), people: vec![f.people[0].id.clone()], ..Default::default() }
    }

    fn day(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(&format!("{s}T00:00:00Z")).unwrap().into()
    }

    #[test]
    fn a_weekly_event_repeats_on_its_days_until_the_end_date() {
        let mut f = dad();
        let mut e = ev(&f);
        e.repeat = Repeat { freq: "weekly".into(), interval: 1, days: vec!["MO".into(), "WE".into()], until: Some("2026-11-11".into()) };
        let id = f.save_event(e).unwrap();
        let events: Vec<_> = f.events.iter().filter_map(|e| e.to_event()).collect();
        let starts: Vec<_> = between(&events, day("2026-11-01"), day("2026-11-30"), "hub").into_iter().map(|o| o.start).collect();
        assert_eq!(starts, vec!["2026-11-02T16:00:00", "2026-11-04T16:00:00", "2026-11-09T16:00:00", "2026-11-11T16:00:00"]);
        assert!(id.starts_with('h'));
    }

    #[test]
    fn skipping_one_day_leaves_the_rest() {
        let mut f = dad();
        let mut e = ev(&f);
        e.repeat = Repeat { freq: "daily".into(), interval: 2, ..Default::default() };
        let id = f.save_event(e).unwrap();
        f.remove_event(&id, Some("2026-11-04T16:00:00")).unwrap();
        let events: Vec<_> = f.events.iter().filter_map(|e| e.to_event()).collect();
        let starts: Vec<_> = between(&events, day("2026-11-01"), day("2026-11-09"), "hub").into_iter().map(|o| o.start).collect();
        assert_eq!(starts, vec!["2026-11-02T16:00:00", "2026-11-06T16:00:00", "2026-11-08T16:00:00"]);
        f.remove_event(&id, None).unwrap();
        assert!(f.events.is_empty());
    }

    #[test]
    fn all_day_events_cover_their_last_day() {
        let mut f = dad();
        let e = HubEvent { title: "Camp".into(), all_day: true, start: "2026-11-05".into(), end: "2026-11-07".into(), ..Default::default() };
        f.save_event(e).unwrap();
        let events: Vec<_> = f.events.iter().filter_map(|e| e.to_event()).collect();
        let out = between(&events, day("2026-11-01"), day("2026-11-30"), "hub");
        assert_eq!((out[0].start.as_str(), out[0].end.as_str(), out[0].all_day), ("2026-11-05", "2026-11-08", true));
    }

    #[test]
    fn monthly_and_yearly_repeats_work() {
        let mut f = dad();
        let mut e = ev(&f);
        e.repeat = Repeat { freq: "monthly".into(), ..Default::default() };
        f.save_event(e).unwrap();
        let events: Vec<_> = f.events.iter().filter_map(|e| e.to_event()).collect();
        let n = between(&events, day("2026-11-01"), day("2027-02-01"), "hub").len();
        assert_eq!(n, 3);
    }

    #[test]
    fn bad_events_are_turned_away() {
        let mut f = dad();
        let ok = ev(&f);
        let bad = |change: &dyn Fn(&mut HubEvent)| { let mut e = ok.clone(); change(&mut e); e };
        assert!(f.save_event(bad(&|e| e.title = "  ".into())).is_err());
        assert!(f.save_event(bad(&|e| e.end = "2026-11-02T16:00".into())).is_err());
        assert!(f.save_event(bad(&|e| e.people = vec!["nobody".into()])).is_err());
        assert!(f.save_event(bad(&|e| e.repeat.freq = "hourly".into())).is_err());
        assert!(f.save_event(bad(&|e| e.repeat.interval = 0)).is_err());
        assert!(f.save_event(bad(&|e| e.repeat = Repeat { freq: "weekly".into(), days: vec!["XX".into()], ..Default::default() })).is_err());
        assert!(f.save_event(bad(&|e| e.start = "tomorrow".into())).is_err());
        assert!(f.events.is_empty());
    }

    #[test]
    fn people_are_validated_and_removed_from_events() {
        let mut f = dad();
        let id = f.people[0].id.clone();
        f.save_event(ev(&f)).unwrap();
        assert!(f.set_people(vec![PersonIn { id: Some(id.clone()), name: "Dad".into(), color: "red".into(), birthday: None }]).is_err());
        let two = |a: &str, b: &str| vec![PersonIn { id: None, name: a.into(), color: "#112233".into(), birthday: None }, PersonIn { id: None, name: b.into(), color: "#112233".into(), birthday: None }];
        assert!(f.set_people(two("Mum", "mum")).is_err(), "names must differ");
        f.set_people(vec![PersonIn { id: None, name: "Mum".into(), color: "#e5487f".into(), birthday: None }]).unwrap();
        assert!(f.events[0].people.is_empty(), "Dad left, so he's off the event");
    }

    #[test]
    fn editing_keeps_skips_only_when_the_start_is_unchanged() {
        let mut f = dad();
        let mut e = ev(&f);
        e.repeat = Repeat { freq: "daily".into(), ..Default::default() };
        let id = f.save_event(e.clone()).unwrap();
        f.remove_event(&id, Some("2026-11-03T16:00:00")).unwrap();
        e.id = id.clone();
        e.title = "Swim club".into();
        f.save_event(e.clone()).unwrap();
        assert_eq!(f.events[0].skip, vec!["2026-11-03T16:00"]);
        e.start = "2026-11-02T17:00".into();
        e.end = "2026-11-02T18:00".into();
        f.save_event(e).unwrap();
        assert!(f.events[0].skip.is_empty());
    }
}
