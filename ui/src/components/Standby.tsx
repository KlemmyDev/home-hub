import { api } from "../lib/api";
import { useEffect, useRef, useState } from "react";
import { focusManager, useQuery } from "@tanstack/react-query";
import { addDays, clockT, dayDiff, fmtT, startOfDay } from "../lib/dates";
import { EMPTY_EVENTS, useEvents } from "../data";
import { queryClient, useHub } from "../hub";
import { getMode, getSettings, holding, idleMs, inNight, inStandby, setMode, sinceDim, touched, useStandby, wake } from "../lib/power";

/**
 * Watches for nobody touching the screen, and shows the dim standby screen: a clock on black with the next thing on
 * and the weather, moving a little each minute. While it shows, the real screen isn't drawn and nothing is fetched
 * (see `html.standby` in styles.css). A touch brings the screen back; that touch does nothing else.
 */
export function Standby() {
  const mode = useStandby();
  const { h24, now: awakeNow } = useHub();
  const [now, setNow] = useState(() => new Date()), [leaving, setLeaving] = useState(false);
  const was = useRef<"awake" | "dim" | "sleep">("awake");

  // Anything that touches the screen counts, and resets the wait.
  useEffect(() => {
    const act = () => { if (!inStandby()) touched(); };
    const evs = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    evs.forEach(e => addEventListener(e, act, { passive: true, capture: true }));
    return () => evs.forEach(e => removeEventListener(e, act, { capture: true } as any));
  }, []);

  // Every few seconds: time to dim? time to let the screen sleep? time to wake for the day?
  useEffect(() => {
    const t = setInterval(() => {
      const s = getSettings(), m = getMode(), d = new Date();
      if (m === "awake") { if (s.standbyMin > 0 && !holding() && idleMs() >= s.standbyMin * 60000) setMode("dim"); return; }
      const asleep = (s.screenOff === "night" && inNight(d, s.nightFrom, s.nightTo)) || (s.screenOff === "after" && sinceDim() >= s.offAfterMin * 60000);
      setMode(asleep ? "sleep" : "dim");
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // Dimming stops everything from refreshing; waking refreshes it all once.
  useEffect(() => {
    const prev = was.current; was.current = mode;
    document.documentElement.classList.toggle("standby", mode !== "awake");
    if (mode !== "awake") { focusManager.setFocused(false); setNow(new Date()); }
    else if (prev !== "awake") { focusManager.setFocused(undefined); queryClient.invalidateQueries(); setLeaving(true); const t = setTimeout(() => setLeaving(false), 350); return () => clearTimeout(t); }
  }, [mode]);

  // The dim clock ticks on the minute, and only while it's showing.
  useEffect(() => {
    if (mode === "awake") return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { const d = new Date(); setNow(d); t = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds())); };
    t = setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    return () => clearTimeout(t);
  }, [mode]);

  const p = getSettings();
  const day = startOfDay(now);
  const { data: ev = EMPTY_EVENTS } = useEvents(startOfDay(awakeNow), addDays(startOfDay(awakeNow), 7));
  const { data: weather } = useQuery<any>({ queryKey: ["weather"], queryFn: () => api<any>("/api/weather"), enabled: false, staleTime: Infinity });
  const next = mode !== "awake" && p.showNext ? ev.list.filter(e => !e.all_day && e.s > now).sort((a, b) => +a.s - +b.s)[0] : undefined;
  if (mode === "awake" && !leaving) return null;
  const minute = Math.floor(+now / 60000), dx = Math.round(Math.sin(minute * 12.9898) * 40), dy = Math.round(Math.sin(minute * 78.233) * 60);      // drifts a little each minute, so nothing stays lit in one place
  return (
    <div id="standby" className={mode === "awake" ? "leaving" : mode} role="button" tabIndex={0} aria-label="Touch to wake the screen" onClick={() => wake()} onKeyDown={e => e.key === "Enter" && wake()}>
      <div className="sb-in" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        <div className="sb-time num">{clockT(now, h24)}</div>
        <div className="sb-date">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}{p.showWeather && weather && !weather.error && weather.temp !== undefined ? ` · ${Math.round(weather.temp)}°` : ""}</div>
        {next ? <div className="sb-next">{next.name || next.title}, {whenLabel(next.s, now, h24)}</div> : null}
        <div className="sb-hint">{mode === "sleep" ? "Asleep. Touch the screen to wake it" : "Touch to wake"}</div>
      </div>
    </div>
  );
}

/** "today at 7:00am", "tomorrow at 7:00am", "Saturday at 7:00am", or "Sat 14 Nov at 7:00am" past this week. */
function whenLabel(s: Date, now: Date, h24: boolean) {
  const n = dayDiff(s, now), t = fmtT(s, h24);
  if (n <= 0) return `today at ${t}`;
  if (n === 1) return `tomorrow at ${t}`;
  if (n < 7) return `${s.toLocaleDateString([], { weekday: "long" })} at ${t}`;
  return `${s.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} at ${t}`;
}
