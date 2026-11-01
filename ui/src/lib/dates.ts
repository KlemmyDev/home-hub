export const DAY_MS = 86400000;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));       // weeks start on Monday
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hmOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dayDiff = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / DAY_MS);
export const fromYmd = (s: string) => new Date(s + "T00:00");

const timeOpts = (h24: boolean): Intl.DateTimeFormatOptions => ({ hour: h24 ? "2-digit" : "numeric", minute: "2-digit", hourCycle: h24 ? "h23" : "h12" });
export const clockT = (d: Date, h24: boolean) => d.toLocaleTimeString([], timeOpts(h24)).replace(/\s?[ap]\.?m\.?/i, "");    // the big clock has no am or pm
export const fmtT = (d: Date, h24: boolean) => d.toLocaleTimeString([], timeOpts(h24)).replace(/\s?([ap])\.?m\.?/i, (_, x) => x.toLowerCase() + "m");
export const hourLabel = (h: number, h24: boolean) => h24 ? pad(h) : (h % 12 || 12) + (h < 12 ? "am" : "pm");
export const longDay = (d: Date) => d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
export const shortDate = (d: Date) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

/* ---------- The family's time zone ----------
   Settings can name a zone (like Australia/Brisbane). Every time on the screen then reads as the wall clock in that zone,
   whatever the tablet's own clock is set to: an instant becomes a Date whose local fields are that wall clock (toZoned),
   and a wall-clock Date becomes the real instant again when it's sent to the hub (fromZoned). Empty zone: the screen's own. */
let ZONE = "";
export const setZone = (z: string) => { ZONE = z || ""; };
export const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } };
const dtfs = new Map<string, Intl.DateTimeFormat>();
function parts(d: Date, zone: string) {
  let f = dtfs.get(zone);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }); dtfs.set(zone, f); }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = +p.value;
  return o;
}
export function toZoned(d: Date): Date {
  if (!ZONE) return d;
  try { const o = parts(d, ZONE); return new Date(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second, d.getMilliseconds()); } catch { return d; }
}
export function fromZoned(w: Date): Date {
  if (!ZONE) return w;
  const wall = Date.UTC(w.getFullYear(), w.getMonth(), w.getDate(), w.getHours(), w.getMinutes(), w.getSeconds(), w.getMilliseconds());
  const off = (t: number) => { const z = toZoned(new Date(t)); return Date.UTC(z.getFullYear(), z.getMonth(), z.getDate(), z.getHours(), z.getMinutes(), z.getSeconds(), z.getMilliseconds()) - t; };
  return new Date(wall - off(wall - off(wall)));
}
export const nowZ = () => toZoned(new Date());
/** The time right now in some zone, for the Settings picker. */
export const clockIn = (zone: string, h24: boolean) => { try { return new Date().toLocaleTimeString([], { timeZone: zone || undefined, hour: h24 ? "2-digit" : "numeric", minute: "2-digit", hourCycle: h24 ? "h23" : "h12" }); } catch { return ""; } };
