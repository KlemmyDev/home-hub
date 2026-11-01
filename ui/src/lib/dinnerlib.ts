import { useMemo } from "react";
import { addDays, fromYmd, startOfDay, ymd } from "./dates";
import type { Dinners, Meal, Product } from "../data";
import type { Ev } from "./events";

export type Stat = { count: number; last: string | null; next: string | null };
/** How often each dinner has been had, when it was last, and when it is next planned, from the plan. */
export function useStats(din: Dinners | undefined, today: Date): Record<string, Stat> {
  return useMemo(() => {
    const out: Record<string, Stat> = {}, t = ymd(today);
    for (const [date, p] of Object.entries(din?.plan || {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (!p.meal) continue;
      const s = (out[p.meal] ||= { count: 0, last: null, next: null });
      if (date < t) { s.count++; s.last = date; } else if (!s.next) s.next = date;
    }
    return out;
  }, [din, ymd(today)]);
}
export const ago = (date: string, now: Date) => { const d = Math.round((+startOfDay(now) - +fromYmd(date)) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`; };
export const dayName = (date: string, now: Date) => { const d = fromYmd(date), n = Math.round((+d - +startOfDay(now)) / 864e5); return n === 0 ? "tonight" : n === 1 ? "tomorrow" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }); };
export const productLine = (p: Product) => [p.brand, p.name, p.quantity].filter(Boolean).join(" · ");
export const metaLine = (m: Meal) => [m.ingredients?.length ? `${m.ingredients.length} ingredient${m.ingredients.length === 1 ? "" : "s"}` : "", m.serves ? `serves ${m.serves}` : "", m.minutes ? `${m.minutes} min` : ""].filter(Boolean).join(" · ");

/* ---------- amounts that scale ---------- */
const FRAC: Record<string, number> = { "½": .5, "¼": .25, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3 };
const PRETTY: [number, string][] = [[.25, "¼"], [.5, "½"], [.75, "¾"]];
/** "500 g" for twice the people becomes "1 kg"-ish: the leading number is scaled and tidied; text with no number is left alone. */
export function scaleAmount(text: string, factor: number): string {
  const t = text.trim();
  if (!t || Math.abs(factor - 1) < 0.01) return t;
  const m = t.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+)|([½¼¾⅓⅔]))?\s*(.*)$/);
  if (!m || (m[1] === undefined && m[2] === undefined && m[4] === undefined)) return t;
  const whole = m[1] ? parseFloat(m[1]) : 0, frac = m[2] ? parseInt(m[2]) / parseInt(m[3]) : m[4] ? FRAC[m[4]] : 0, rest = m[5];
  let n = (whole + frac) * factor;
  const unit = rest.toLowerCase();
  if (/^g\b/.test(unit) && n >= 1000) return `${trim(n / 1000)} kg${rest.slice(1)}`;
  if (/^ml\b/.test(unit) && n >= 1000) return `${trim(n / 1000)} L${rest.slice(2)}`;
  if (n >= 100) n = Math.round(n / 10) * 10; else if (n >= 10) n = Math.round(n); else n = Math.round(n * 4) / 4;
  const w = Math.floor(n), f = n - w, fs = PRETTY.find(([v]) => Math.abs(v - f) < .01)?.[1];
  const num = f < .01 ? String(w) : fs ? (w ? `${w}${fs}` : fs) : trim(n);
  return `${num}${rest ? " " + rest : ""}`;
}
const trim = (n: number) => String(Math.round(n * 100) / 100);

/* ---------- diets ---------- */
/** People whose diet this dinner isn't marked as suiting (so it should be checked before cooking it for them). */
export function dietClash(meal: Meal | undefined, home: { name: string; diet?: string[] }[]): { name: string; need: string }[] {
  if (!meal) return [];
  const out: { name: string; need: string }[] = [];
  for (const p of home) for (const d of p.diet || []) if (!(meal.suits || []).includes(d)) out.push({ name: p.name, need: d });
  return out;
}
export const clashText = (c: { name: string; need: string }[]) => c.length ? "Not marked " + [...new Set(c.map(x => x.need))].join(", ") + " (" + [...new Set(c.map(x => x.name))].join(", ") + ")" : "";

/* ---------- who's home, and how many to cook for ---------- */
export function homeFor<T extends { id: string }>(din: Dinners | undefined, people: T[], date: string): T[] {
  const away = din?.plan[date]?.away || [];
  return people.filter(p => !away.includes(p.id));
}
export function cookingFor(din: Dinners | undefined, people: { id: string }[], date: string, meal?: Meal): number {
  return din?.plan[date]?.serves || homeFor(din, people, date).length || meal?.serves || 4;
}

/* ---------- filling the week ---------- */
export type Pick = { meal?: Meal; kind?: string; why: string };
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };

/** Is anyone at something over dinner time? Returns what, for the hint on the day. */
export function busyAt(events: Ev[], day: Date): Ev | undefined {
  const a = +day + (16.5 * 3600e3), b = +day + 19.5 * 3600e3;
  return events.find(e => !e.all_day && e.hub && +e.s < b && +e.e > a);
}

/** Suggests a dinner for each empty night: not had lately, liked, quick when it's a busy night, nothing someone dislikes or can't eat. */
export function suggestWeek(o: { days: Date[]; din: Dinners; people: { id: string; name: string; diet?: string[] }[]; events: Ev[]; today: Date; seed: number }): Record<string, Pick> {
  const { days, din, people, events, today, seed } = o;
  const out: Record<string, Pick> = {}, used = new Set<string>();
  const stats: Record<string, string | null> = {};
  for (const [date, p] of Object.entries(din.plan)) if (p.meal && date < ymd(today) && (!stats[p.meal] || date > stats[p.meal]!)) stats[p.meal] = date;
  const inWeek = new Set(days.map(d => din.plan[ymd(d)]?.meal).filter(Boolean) as string[]);
  for (const day of days) {
    const key = ymd(day);
    if (din.plan[key]) continue;
    const rule = din.rules?.[String((day.getDay() + 6) % 7)];
    if (rule && (rule.kind || din.meals.some(m => m.id === rule.meal))) {
      out[key] = rule.kind ? { kind: rule.kind, why: "A fixed night" } : { meal: din.meals.find(m => m.id === rule.meal)!, why: "A fixed night" };
      if (rule.meal) used.add(rule.meal);
      continue;
    }
    const home = homeFor(din, people, key), busy = busyAt(events, day);
    let best: { m: Meal; score: number; why: string } | null = null;
    for (const m of din.meals) {
      if (used.has(m.id) || inWeek.has(m.id)) continue;
      if (home.some(p => (m.ratings?.[p.id] ?? 0) < 0)) continue;
      if (dietClash(m, home).length) continue;
      const last = stats[m.id], since = last ? Math.round((+day - +fromYmd(last)) / 864e5) : 90;
      let score = hash(`${seed}|${key}|${m.id}`) * 1.5 + (m.favourite ? 3 : 0) + home.reduce((n, p) => n + ((m.ratings?.[p.id] ?? 0) > 0 ? 1.5 : 0), 0) + Math.min(since, 60) / 15 - (since < 10 ? 4 : 0) + ((m.ingredients?.length || 0) ? .5 : 0);
      let why = since >= 28 ? (last ? `Not had for ${Math.round(since / 7)} weeks` : "Not had yet") : m.favourite ? "A favourite" : "Something different";
      if (busy) { const quick = (m.tags || []).includes("Quick") || (m.minutes && m.minutes <= 30); score += quick ? 4 : -3; if (quick) why = `Quick: someone's busy at ${busy.s.getHours() % 12 || 12}${busy.s.getHours() < 12 ? "am" : "pm"}`; }
      if (!best || score > best.score) best = { m, score, why };
    }
    if (best) { out[key] = { meal: best.m, why: best.why }; used.add(best.m.id); }
  }
  return out;
}

/** The steps of a dinner, from its notes: a step to a line (or a sentence, when it's all one line). */
export function stepsOf(notes: string): string[] {
  const lines = notes.split(/\n+/).map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return (lines[0] || "").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

export const nextDays = (from: Date, n: number) => Array.from({ length: n }, (_, i) => addDays(startOfDay(from), i));
