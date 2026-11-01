//! Calendars: read the private iCal addresses people paste in (Google, iCloud, Outlook all offer one),
//! work out which events fall in a window (including repeating ones), and hand them to the screen.

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz as Zone;
use rrule::{RRuleSet, Tz};
use std::{collections::HashMap, time::Duration as StdDuration};
use tokio::{process::Command, time::timeout};

/// How a calendar entry says when it happens.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Kind {
    /// A moment in time (stored as UTC).
    Timed,
    /// "8:15" with no time zone: the same wall-clock time wherever you are (stored as is).
    Floating,
    /// A whole day, or several (stored as midnight of the first day; `end` is the day after the last).
    AllDay,
}

#[derive(Clone, Debug)]
pub struct Event {
    pub uid: String,
    pub title: String,
    pub location: String,
    pub start: NaiveDateTime,
    pub end: NaiveDateTime,
    pub kind: Kind,
    /// The lines the recurrence library reads (DTSTART, RRULE, EXDATE), present for repeating events.
    pub recur: Option<String>,
    /// For a changed single occurrence of a repeating event: the start it replaces.
    pub replaces: Option<NaiveDateTime>,
}

/// One event as the screen receives it.
#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Out {
    pub id: String,
    pub title: String,
    pub location: String,
    /// "2026-11-02" (all day), "2026-11-02T08:15:00Z" (a moment) or "2026-11-02T08:15:00" (the screen's own clock).
    pub start: String,
    pub end: String,
    pub all_day: bool,
}

const MAX_PER_EVENT: u16 = 1500;

/// Download an iCal address. Uses curl (already needed to install the hub), with limits.
pub async fn fetch(url: &str) -> Result<String, String> {
    let url = url.trim().replacen("webcal://", "https://", 1);
    let run = Command::new("curl")
        .args(["-fsSL", "--max-time", "20", "--max-filesize", "8000000", "--proto", "=http,https", "--proto-redir", "=http,https", "-A", "HomeHub", "--", &url])
        .kill_on_drop(true)
        .output();
    let out = timeout(StdDuration::from_secs(25), run)
        .await
        .map_err(|_| "That calendar took too long to answer.".to_string())?
        .map_err(|_| "Couldn't fetch the calendar on this machine.".to_string())?;
    if !out.status.success() {
        return Err("Couldn't reach that calendar address.".into());
    }
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    if !text.contains("BEGIN:VCALENDAR") {
        return Err("That address isn't a calendar (it should be an iCal address ending in .ics).".into());
    }
    Ok(text)
}

struct Prop {
    name: String,
    params: Vec<(String, String)>,
    value: String,
}

impl Prop {
    fn param(&self, key: &str) -> Option<&str> {
        self.params.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }
}

/// Join folded lines and split each into name, parameters and value.
fn props(text: &str) -> Vec<Prop> {
    let mut lines: Vec<String> = Vec::new();
    for raw in text.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        if (raw.starts_with(' ') || raw.starts_with('\t')) && !lines.is_empty() {
            lines.last_mut().unwrap().push_str(&raw[1..]);
        } else {
            lines.push(raw.to_string());
        }
    }
    lines.iter().filter_map(|l| parse_line(l)).collect()
}

fn parse_line(line: &str) -> Option<Prop> {
    let mut in_quote = false;
    let mut colon = None;
    for (i, c) in line.char_indices() {
        match c {
            '"' => in_quote = !in_quote,
            ':' if !in_quote => {
                colon = Some(i);
                break;
            }
            _ => {}
        }
    }
    let (head, value) = line.split_at(colon?);
    let mut parts = head.split(';');
    let name = parts.next()?.trim().to_ascii_uppercase();
    let params = parts
        .filter_map(|p| p.split_once('='))
        .map(|(k, v)| (k.trim().to_ascii_uppercase(), v.trim_matches('"').to_string()))
        .collect();
    Some(Prop { name, params, value: value[1..].to_string() })
}

fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push(' '),
                Some(o) => out.push(o),
                None => {}
            }
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

/// A date or date-time value: its kind, and the time in the basis that kind uses (see `Kind`).
/// `zone` is a time zone name the recurrence library can use, if the value had one.
fn when(p: &Prop) -> Option<(NaiveDateTime, Kind, Option<Zone>)> {
    let v = p.value.trim();
    if p.param("VALUE") == Some("DATE") || (v.len() == 8 && !v.contains('T')) {
        let d = NaiveDate::parse_from_str(v, "%Y%m%d").ok()?;
        return Some((d.and_hms_opt(0, 0, 0)?, Kind::AllDay, None));
    }
    if let Some(utc) = v.strip_suffix('Z') {
        let n = NaiveDateTime::parse_from_str(utc, "%Y%m%dT%H%M%S").ok()?;
        return Some((n, Kind::Timed, None));
    }
    let n = NaiveDateTime::parse_from_str(v, "%Y%m%dT%H%M%S").ok()?;
    match p.param("TZID").and_then(|z| z.parse::<Zone>().ok()) {
        Some(zone) => {
            let utc = zone.from_local_datetime(&n).earliest()?.with_timezone(&Utc).naive_utc();
            Some((utc, Kind::Timed, Some(zone)))
        }
        None => Some((n, Kind::Floating, None)),
    }
}

fn stamp(n: &NaiveDateTime) -> String {
    n.format("%Y%m%dT%H%M%S").to_string()
}

/// Read every event in an iCal file.
pub fn parse(text: &str) -> Vec<Event> {
    let all = props(text);
    let mut events = Vec::new();
    let mut i = 0;
    while i < all.len() {
        if all[i].name == "BEGIN" && all[i].value.eq_ignore_ascii_case("VEVENT") {
            let start = i + 1;
            let mut depth = 1;
            i += 1;
            while i < all.len() && depth > 0 {
                if all[i].name == "BEGIN" {
                    depth += 1;
                } else if all[i].name == "END" {
                    depth -= 1;
                }
                i += 1;
            }
            let end = i.saturating_sub(1);
            if let Some(e) = event(&all[start..end]) {
                events.push(e);
            }
        } else {
            i += 1;
        }
    }
    events
}

fn event(ps: &[Prop]) -> Option<Event> {
    let get = |n: &str| ps.iter().find(|p| p.name == n);
    if get("STATUS").is_some_and(|s| s.value.eq_ignore_ascii_case("CANCELLED")) {
        return None;
    }
    let dtstart = get("DTSTART")?;
    let (start, kind, zone) = when(dtstart)?;
    let end = match (get("DTEND").and_then(when), get("DURATION")) {
        (Some((e, ..)), _) if e >= start => e,
        (_, Some(d)) => start + iso_duration(&d.value).unwrap_or_else(Duration::zero),
        _ if kind == Kind::AllDay => start + Duration::days(1),
        _ => start,
    };
    let end = if kind == Kind::AllDay && end <= start { start + Duration::days(1) } else { end };
    let replaces = get("RECURRENCE-ID").and_then(when).map(|(n, ..)| n);

    // Repeating: hand the library DTSTART, RRULE and EXDATE in one basis (UTC), or the event's own zone.
    let recur = get("RRULE").map(|r| {
        let mut s = match zone {
            Some(z) => format!("DTSTART;TZID={}:{}\n", z.name(), local_stamp(&start, z)),
            None => format!("DTSTART:{}Z\n", stamp(&start)),
        };
        s.push_str(&format!("RRULE:{}\n", r.value));
        for ex in ps.iter().filter(|p| p.name == "EXDATE") {
            for v in ex.value.split(',') {
                let one = Prop { name: ex.name.clone(), params: ex.params.clone(), value: v.to_string() };
                if let Some((n, ..)) = when(&one) {
                    match zone {
                        Some(z) => s.push_str(&format!("EXDATE;TZID={}:{}\n", z.name(), local_stamp(&n, z))),
                        None => s.push_str(&format!("EXDATE:{}Z\n", stamp(&n))),
                    }
                }
            }
        }
        s
    });

    Some(Event {
        uid: get("UID").map(|u| u.value.clone()).unwrap_or_default(),
        title: get("SUMMARY").map(|s| unescape(&s.value)).filter(|s| !s.is_empty()).unwrap_or_else(|| "Busy".into()),
        location: get("LOCATION").map(|s| unescape(&s.value)).unwrap_or_default(),
        start,
        end,
        kind,
        recur,
        replaces,
    })
}

/// A UTC instant as the wall-clock time it was in `zone` (what a TZID line wants).
fn local_stamp(utc: &NaiveDateTime, zone: Zone) -> String {
    stamp(&Utc.from_utc_datetime(utc).with_timezone(&zone).naive_local())
}

/// "PT1H30M", "P1D", "P1W" and so on.
fn iso_duration(s: &str) -> Option<Duration> {
    let s = s.trim().trim_start_matches('+');
    let (neg, s) = match s.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, s),
    };
    let mut total = Duration::zero();
    let mut num = String::new();
    let mut in_time = false;
    for c in s.strip_prefix('P')?.chars() {
        match c {
            'T' => in_time = true,
            '0'..='9' => num.push(c),
            _ => {
                let n: i64 = num.parse().ok()?;
                num.clear();
                total += match (c, in_time) {
                    ('W', _) => Duration::weeks(n),
                    ('D', _) => Duration::days(n),
                    ('H', true) => Duration::hours(n),
                    ('M', true) => Duration::minutes(n),
                    ('S', true) => Duration::seconds(n),
                    _ => return None,
                };
            }
        }
    }
    Some(if neg { -total } else { total })
}

/// The events (with repeats worked out) that touch the window [from, to), in time order.
/// Dates are compared as stored, so a day-long event near the edge may come back one day early or late;
/// the screen picks the exact day by its own clock.
pub fn between(events: &[Event], from: DateTime<Utc>, to: DateTime<Utc>, cal: &str) -> Vec<Out> {
    let (from_n, to_n) = (from.naive_utc() - Duration::days(1), to.naive_utc() + Duration::days(1));
    let replaced: HashMap<(&str, NaiveDateTime), ()> =
        events.iter().filter_map(|e| e.replaces.map(|r| ((e.uid.as_str(), r), ()))).collect();
    let mut out: Vec<(NaiveDateTime, Out)> = Vec::new();
    let mut push = |e: &Event, start: NaiveDateTime| {
        let end = start + (e.end - e.start);
        if start < to_n && (end > from_n || (end == start && start >= from_n)) {
            out.push((start, render(e, start, end, cal)));
        }
    };
    for e in events {
        match &e.recur {
            None => push(e, e.start),
            Some(lines) if e.replaces.is_none() => {
                let Ok(set) = lines.parse::<RRuleSet>() else {
                    push(e, e.start);
                    continue;
                };
                let width = e.end - e.start;
                let lo = Utc.from_utc_datetime(&(from_n - width)).with_timezone(&Tz::UTC);
                let hi = Utc.from_utc_datetime(&to_n).with_timezone(&Tz::UTC);
                for d in set.after(lo).before(hi).all(MAX_PER_EVENT).dates {
                    let start = d.with_timezone(&Utc).naive_utc();
                    if !replaced.contains_key(&(e.uid.as_str(), start)) {
                        push(e, start);
                    }
                }
            }
            Some(_) => push(e, e.start),
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.title.cmp(&b.1.title)));
    out.into_iter().map(|(_, o)| o).collect()
}

fn render(e: &Event, start: NaiveDateTime, end: NaiveDateTime, cal: &str) -> Out {
    let f = |n: &NaiveDateTime| match e.kind {
        Kind::AllDay => n.format("%Y-%m-%d").to_string(),
        Kind::Timed => format!("{}Z", n.format("%Y-%m-%dT%H:%M:%S")),
        Kind::Floating => n.format("%Y-%m-%dT%H:%M:%S").to_string(),
    };
    Out {
        id: format!("{cal}:{}:{}", e.uid, stamp(&start)),
        title: e.title.clone(),
        location: e.location.clone(),
        start: f(&start),
        end: f(&end),
        all_day: e.kind == Kind::AllDay,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn win(a: &str, b: &str) -> (DateTime<Utc>, DateTime<Utc>) {
        (DateTime::parse_from_rfc3339(a).unwrap().into(), DateTime::parse_from_rfc3339(b).unwrap().into())
    }

    const ICS: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n\
BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Dentist\\, High Street\r\nDTSTART:20261102T041500Z\r\nDTEND:20261102T050000Z\r\nEND:VEVENT\r\n\
BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Swim\r\nDTSTART;TZID=Australia/Melbourne:20261103T160000\r\nDTEND;TZID=Australia/Melbourne:20261103T170000\r\nRRULE:FREQ=WEEKLY;BYDAY=TU\r\nEXDATE;TZID=Australia/Melbourne:20261110T160000\r\nEND:VEVENT\r\n\
BEGIN:VEVENT\r\nUID:c\r\nSUMMARY:Library books\r\nDTSTART;VALUE=DATE:20261103\r\nDTEND;VALUE=DATE:20261104\r\nEND:VEVENT\r\n\
BEGIN:VEVENT\r\nUID:d\r\nSUMMARY:Called off\r\nSTATUS:CANCELLED\r\nDTSTART:20261104T000000Z\r\nEND:VEVENT\r\n\
END:VCALENDAR\r\n";

    #[test]
    fn reads_plain_all_day_and_cancelled_events() {
        let evs = parse(ICS);
        assert_eq!(evs.len(), 3, "the cancelled one is dropped");
        let (a, b) = win("2026-11-01T00:00:00Z", "2026-11-09T00:00:00Z");
        let out = between(&evs, a, b, "x");
        let titles: Vec<_> = out.iter().map(|o| o.title.as_str()).collect();
        assert!(titles.contains(&"Dentist, High Street"));
        let lib = out.iter().find(|o| o.title == "Library books").unwrap();
        assert!(lib.all_day);
        assert_eq!((lib.start.as_str(), lib.end.as_str()), ("2026-11-03", "2026-11-04"));
        let d = out.iter().find(|o| o.title.starts_with("Dentist")).unwrap();
        assert_eq!(d.start, "2026-11-02T04:15:00Z");
    }

    #[test]
    fn repeats_in_the_events_own_time_zone_and_skips_exceptions() {
        let evs = parse(ICS);
        let (a, b) = win("2026-11-01T00:00:00Z", "2026-11-25T00:00:00Z");
        let swims: Vec<_> = between(&evs, a, b, "x").into_iter().filter(|o| o.title == "Swim").map(|o| o.start).collect();
        // 4pm in Melbourne is 5am UTC (daylight time, UTC+11), every Tuesday, but not the 10th.
        assert_eq!(swims, vec!["2026-11-03T05:00:00Z", "2026-11-17T05:00:00Z", "2026-11-24T05:00:00Z"]);
    }

    #[test]
    fn a_changed_occurrence_replaces_the_original() {
        let ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:r\nSUMMARY:Cubs\nDTSTART:20261105T070000Z\nDTEND:20261105T080000Z\nRRULE:FREQ=WEEKLY\nEND:VEVENT\n\
BEGIN:VEVENT\nUID:r\nSUMMARY:Cubs (moved)\nRECURRENCE-ID:20261112T070000Z\nDTSTART:20261112T090000Z\nDTEND:20261112T100000Z\nEND:VEVENT\nEND:VCALENDAR\n";
        let evs = parse(ics);
        let (a, b) = win("2026-11-10T00:00:00Z", "2026-11-20T00:00:00Z");
        let out = between(&evs, a, b, "x");
        let got: Vec<_> = out.iter().map(|o| (o.title.as_str(), o.start.as_str())).collect();
        assert_eq!(got, vec![("Cubs (moved)", "2026-11-12T09:00:00Z"), ("Cubs", "2026-11-19T07:00:00Z")]);
    }

    #[test]
    fn durations_and_folded_lines() {
        assert_eq!(iso_duration("PT1H30M"), Some(Duration::minutes(90)));
        assert_eq!(iso_duration("P1W"), Some(Duration::weeks(1)));
        let evs = parse("BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:f\nSUMMARY:A very long\n  title\nDTSTART:20261102T010000\nDURATION:PT2H\nEND:VEVENT\nEND:VCALENDAR\n");
        assert_eq!(evs[0].title, "A very long title");
        assert_eq!(evs[0].kind, Kind::Floating);
        assert_eq!(evs[0].end - evs[0].start, Duration::hours(2));
    }
}
