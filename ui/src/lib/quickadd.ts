import { addDays, hmOf, ymd } from "./dates";
import type { EventDraft } from "../hub";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const find = (list: string[], w: string) => w.length >= 3 ? list.findIndex(x => x.startsWith(w)) : -1;

/**
 * Turns a sentence like "Football Saturday 9am for 2 hours with Sam" into the parts of an event.
 * Days: today, tonight, tomorrow, a weekday, "12 nov", "nov 12", "12/11". Times: 9am, 9:30pm, 14:00, noon, "at 5".
 * Lengths: "for 2 hours", "for 45 min". Repeats: "every day", "every week", "every monday and friday", "monthly".
 * Names of family members are picked out and left out of the title.
 */
export function quickAdd(text: string, now: Date, people: { id: string; name: string }[]): Partial<EventDraft> & { title: string } {
  let t = " " + text.replace(/\s+/g, " ").trim() + " ";
  const cut = (re: RegExp) => { const m = t.match(re); if (m) t = t.replace(re, " "); return m; };
  const out: Partial<EventDraft> & { title: string } = { title: "" };

  // repeats
  const days: string[] = [];
  const ev = cut(/\severy\s+((?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*|and|&|,|\s)+)\s/i);
  let freq = "none", dayStart: Date | null = null;
  if (ev) {
    const words = ev[1].toLowerCase().split(/[\s,&]+/).filter(w => w && w !== "and");
    for (const w of words) { const i = find(DAYS, w); if (i >= 0 && !days.includes(CODES[i])) days.push(CODES[i]); }
    if (days.length) { freq = "weekly"; const i = CODES.indexOf(days[0]); dayStart = nextDay(now, i, false); }
  }
  if (freq === "none") {
    const m = cut(/\s(every\s+day|daily|every\s+week|weekly|every\s+month|monthly|every\s+year|yearly|annually)\s/i);
    if (m) { const w = m[1].toLowerCase(); freq = /day|daily/.test(w) ? "daily" : /week/.test(w) ? "weekly" : /month/.test(w) ? "monthly" : "yearly"; }
  }

  // length
  let mins = 0;
  const len = cut(/\sfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\s/i);
  if (len) mins = Math.round(parseFloat(len[1]) * (/^h/i.test(len[2]) ? 60 : 1));
  const allDay = !!cut(/\sall[\s-]?day\s/i);

  // time
  let hh = -1, mm = 0, to: [number, number] | null = null;
  const clock = (h: string, m: string | undefined, ap: string | undefined): [number, number] | null => {
    let H = Number(h); const M = m ? Number(m) : 0;
    if (M > 59 || H > 24) return null;
    if (ap) { if (H < 1 || H > 12) return null; H = (H % 12) + (/p/i.test(ap) ? 12 : 0); }
    return [H % 24, M];
  };
  const range = cut(/\s(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s/i);
  if (range) {
    const ap2 = range[6], ap1 = range[3] || ap2, a = clock(range[1], range[2], ap1), b = clock(range[4], range[5], ap2);
    if (a && b) { [hh, mm] = a; to = b; }
  }
  if (hh < 0) {
    const m = cut(/\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\s/i);
    if (m) { const c = clock(m[1], m[2], m[3].replace(/\./g, "")); if (c) [hh, mm] = c; }
  }
  if (hh < 0) {
    const m = cut(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\s/);
    if (m) { hh = Number(m[1]); mm = Number(m[2]); }
  }
  if (hh < 0) {
    if (cut(/\s(?:at\s+)?(?:noon|midday)\s/i)) hh = 12;
    else if (cut(/\s(?:at\s+)?midnight\s/i)) hh = 0;
  }
  if (hh < 0) {
    const m = cut(/\sat\s+(\d{1,2})\s/i);       // "at 5": sensible guess, an afternoon unless it is 7 to 11
    if (m) { const H = Number(m[1]); if (H >= 1 && H <= 12) hh = H >= 7 && H <= 11 ? H : (H % 12) + 12; }
  }

  // day
  let day: Date | null = null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (cut(/\s(tonight|this evening)\s/i)) { day = today; if (hh < 0) hh = 18; }
  else if (cut(/\stoday\s/i)) day = today;
  else if (cut(/\s(tomorrow|tmrw|tmr)\s/i)) day = addDays(today, 1);
  if (!day) {
    const m = cut(/\s(?:on\s+)?(next\s+)?(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\s/i);
    if (m) day = nextDay(now, find(DAYS, m[2].toLowerCase().replace(/^(tues|thur|thurs)$/, x => x.slice(0, 3))), !!m[1]);
  }
  if (!day) {
    const m = cut(/\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s/i)
      || cut(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\s/i);
    if (m) {
      const [dd, mon] = /^\d/.test(m[1]) ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]];
      day = soon(now, MONTHS.findIndex(x => x.startsWith(mon.toLowerCase().slice(0, 3))), dd);
    }
  }
  if (!day) {
    const m = cut(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})\s/);      // day first, like 12/11 for 12 November
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) day = soon(now, Number(m[2]) - 1, Number(m[1]));
  }
  if (!day && dayStart) day = dayStart;
  if (!day) day = today;

  // who
  const who: string[] = [];
  if (cut(/\s(?:for\s+|with\s+)?(everyone|the family|all of us)\s/i)) people.forEach(p => who.push(p.id));
  for (const p of people) {
    const re = new RegExp(`\\s(?:(?:for|with)\\s+)?${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'s)?(?=\\s|,)`, "i");
    const m = t.match(re);
    if (m && !m[0].includes("'s")) { t = t.replace(re, " "); if (!who.includes(p.id)) who.push(p.id); }
  }
  t = t.replace(/\s(?:with|and|for|at|on|from|to)\s*$/i, " ").replace(/\s(?:with|and|for)\s+(?=\s)/gi, " ");
  const title = t.replace(/[\s,]+/g, " ").replace(/^\s*(?:and|with|for|at|on)\s+/i, "").trim();
  out.title = title ? title[0].toUpperCase() + title.slice(1) : "";

  out.allDay = allDay || (hh < 0 && !len);
  if (hh < 0) hh = 9;
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
  const e = to ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), to[0], to[1]) : new Date(+s + (mins || 60) * 60000);
  if (+e <= +s) e.setDate(e.getDate() + 1);
  out.sd = ymd(s); out.st = hmOf(s); out.ned = out.allDay ? ymd(s) : ymd(e); out.net = hmOf(e);
  if (who.length) out.people = who;
  if (freq !== "none") { out.freq = freq; if (freq === "weekly") out.days = days.length ? days : [CODES[s.getDay()]]; }
  return out;
}

function nextDay(now: Date, dow: number, next: boolean) {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let add = (dow - t.getDay() + 7) % 7;
  if (next && add === 0) add = 7;
  return addDays(t, add);
}
function soon(now: Date, month: number, dd: number) {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(t.getFullYear(), month, dd);
  if (d < t) d = new Date(t.getFullYear() + 1, month, dd);
  return d;
}
