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
