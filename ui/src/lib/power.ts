import { useEffect, useSyncExternalStore } from "react";

/**
 * Saving power on a screen that's on all day. After a while with nobody touching it the hub goes to a dim standby
 * screen (a clock on black, nothing moving, no polling), and a touch brings it back. It can also let the screen go
 * to sleep altogether, at night or after a while, by no longer asking for it to stay on. These choices belong to one
 * screen (the fridge tablet and a phone want different things), so they're kept on that device.
 */
export type PowerSettings = {
  standbyMin: number;                              // minutes of nobody touching it before the dim screen; 0 = never
  showNext: boolean; showWeather: boolean;         // what the dim screen shows besides the time
  screenOff: "never" | "after" | "night";          // let the screen turn off: never, a while after dimming, or at night
  offAfterMin: number; nightFrom: string; nightTo: string;
};
export const DEFAULTS: PowerSettings = { standbyMin: 5, showNext: true, showWeather: true, screenOff: "never", offAfterMin: 60, nightFrom: "22:00", nightTo: "06:00" };
const KEY = "hub-power";

export type Mode = "awake" | "dim" | "sleep";
const load = (): PowerSettings => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; } };
let settings = load(), mode: Mode = "awake", holds = 0, lastTouch = Date.now(), dimAt = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const getMode = () => mode;
export const getSettings = () => settings;
export const inStandby = () => mode !== "awake";
export const useStandby = () => useSyncExternalStore(subscribe, getMode);
export const usePower = () => useSyncExternalStore(subscribe, getSettings);
export function savePower(p: Partial<PowerSettings>) { settings = { ...settings, ...p }; try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* it just won't be remembered */ } emit(); }

/** Somebody touched the screen (or something needs it to stay on, like a timer going). */
export function touched() { lastTouch = Date.now(); }
export const idleMs = () => Date.now() - lastTouch;
export const sinceDim = () => Date.now() - dimAt;
export function setMode(m: Mode) { if (m === mode) return; if (mode === "awake") dimAt = Date.now(); if (m === "awake") lastTouch = Date.now(); mode = m; emit(); }
export const dimNow = () => setMode("dim");
export const wake = () => setMode("awake");

/** While something is going on that needs the screen up (cooking, an update, a reminder), it doesn't dim. Returns how to let go. */
export function hold() { holds++; touched(); return () => { holds = Math.max(0, holds - 1); touched(); }; }
export const holding = () => holds > 0;
export function useHold(active: boolean) { useEffect(() => active ? hold() : undefined, [active]); }

/** Is a time of day (like "23:15") inside the night hours, which may run past midnight? */
export function inNight(now: Date, from: string, to: string): boolean {
  const m = (s: string) => { const [h, mi] = s.split(":").map(Number); return (h || 0) * 60 + (mi || 0); };
  const n = now.getHours() * 60 + now.getMinutes(), a = m(from), b = m(to);
  return a === b ? false : a < b ? n >= a && n < b : n >= a || n < b;
}
