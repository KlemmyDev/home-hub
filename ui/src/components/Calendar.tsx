import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { addDays, clockT, dayDiff, fmtT, hmOf, hourLabel, longDay, nowZ, sameDay, shortDate, startOfDay, weekStart, ymd } from "../lib/dates";
import { calOf, colorsOf, onDay, peopleOf, timedOn, visibleTo, type Ev, type EvData, type Person } from "../lib/events";
import { ChevL, ChevR, SearchIcon, WeatherIcon } from "../lib/icons";
import { Ava } from "./Ava";
import { api, DEMO, post } from "../lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EMPTY_EVENTS, dinnerFor, useDinners, useEvents, usePrefetchEvents } from "../data";
import { useHub, type CalView } from "../hub";
import { useNav, usePage } from "../nav";
import { loadEventDraft, newEventDraft } from "./Sheets";

const HOUR_PX = (big: boolean, phone: boolean) => phone ? 64 : big ? 76 : 64;     // a fixed height for each hour, so the day scrolls

/** Round initials in each person's colour, so who it is can be read without reading a name. */
export const Avs = ({ ps, size, max = 4 }: { ps: Person[]; size: number; max?: number }) => ps.length ? (
  <span className="avs" aria-hidden>
    {ps.slice(0, max).map(p => <i key={p.id} className="av" style={{ width: size, height: size, fontSize: Math.round(size * .52), background: p.pal ? `color-mix(in srgb, ${p.color} 25%, #fff)` : p.color }}>{p.pal ? <iframe className="palf" src={p.pal} tabIndex={-1} scrolling="no" aria-hidden="true" loading="lazy" /> : (p.name.trim()[0] || "?").toUpperCase()}</i>)}
    {ps.length > max ? <i className="av" style={{ width: size, height: size, fontSize: Math.round(size * .46), background: "#5a6478" }}>+{ps.length - max}</i> : null}
  </span>
) : null;
const evBg = (c: string) => `color-mix(in srgb, ${c} 17%, #fff)`;
/** Names events so they can glide from one view to the next while the view transition runs. Hours scrolled out of sight are left unnamed, so nothing flies in across the header. */
const vtn = (e: Ev, day: Date, c: { vt: boolean; band: [number, number] }, hr?: number): CSSProperties => c.vt && (hr === undefined || (hr >= c.band[0] && hr <= c.band[1])) ? { viewTransitionName: "ev-" + e.id.replace(/[^a-zA-Z0-9_-]/g, "_") + "-" + ymd(day) } : {};

const stepDate = (cal: CalView, n: number) => cal.mode === "agenda" ? addDays(cal.date, 7 * n) : cal.mode === "day" || cal.mode === "schedule" ? addDays(cal.date, n) : cal.mode === "week" ? addDays(cal.date, 7 * n) : new Date(cal.date.getFullYear(), cal.date.getMonth() + n, 1);

const AGENDA_DAYS = 14;

function calRange(cal: CalView): [Date, Date] {
  const d = startOfDay(cal.date);
  if (cal.mode === "agenda") return [d, addDays(d, AGENDA_DAYS)];
  if (cal.mode === "day" || cal.mode === "schedule" || cal.mode === "week") { const w = weekStart(d); return [w, addDays(w, 7)]; }
  const first = weekStart(new Date(d.getFullYear(), d.getMonth(), 1));
  return [first, addDays(first, 42)];
}

type Ctx = { data: EvData; list: Ev[]; people: ReturnType<typeof useHub>["people"]; h24: boolean; vt: boolean; band: [number, number]; open: (e: Ev) => void; morph: (f: (c: CalView) => CalView, names?: boolean) => void };

/** Each pane of the swipe track draws its own date; the views read the date they are drawing from here. */
const PaneCal = createContext<CalView | null>(null);
const usePaneCal = () => { const p = useContext(PaneCal), { cal } = useHub(); return p || cal; };
/** The hours' scroll position, shared by the panes so the next day lines up with this one as it slides in. */
type Shared = { top: number; els: Set<HTMLElement> };

/** True while an event is being carried across the day, so the swipe track leaves the touch alone; `until` stops the lift-off from counting as a tap. */
const carrying = { on: false, until: 0 };

function Grid({ days, gutter, big, c }: { days: Date[]; gutter: number; big: boolean; c: Ctx }) {
  const { now, dim, openSheet, cal, soon } = useHub();
  const qc = useQueryClient();
  const [lift, setLift] = useState<{ id: string; dx: number; dy: number; label: string } | null>(null);
  const per = days.map(d => timedOn(c.list, d));
  const tot = 24, top = (h: number) => h / tot * 100;      // midnight to midnight
  const px = HOUR_PX(big, dim.phone);
  const showNow = days.some(d => sameDay(d, now));
  const h = now.getHours() + now.getMinutes() / 60;

  /** Press and hold an event, then carry it: up and down changes the time (in 15 minute steps), sideways changes the day. */
  const startCarry = (e: Ev, colIdx: number, ev: React.PointerEvent<HTMLElement>) => {
    if (DEMO || !e.hub || e.fixed || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    const el = ev.currentTarget, pid = ev.pointerId, x0 = ev.clientX, y0 = ev.clientY, sc = dim.s || 1;
    const col = el.closest(".gcol") as HTMLElement | null, box = el.closest(".gscroll") as HTMLElement | null;
    if (!col) return;
    const colW = col.getBoundingClientRect().width, sy0 = box?.scrollTop ?? 0;
    const startMin = e.s.getHours() * 60 + e.s.getMinutes(), len = Math.round((+e.e - +e.s) / 60000), endMin = startMin + len;
    let cx = x0, cy = y0, live = false, raf = 0, lastM = 0, lastD = 0, first = true;
    const calc = () => {
      const dyS = (cy - y0) + ((box?.scrollTop ?? 0) - sy0);
      const m = Math.max(-startMin, Math.min(1440 - endMin, Math.round(dyS / sc / px * 4) * 15));
      const dd = days.length > 1 ? Math.max(-colIdx, Math.min(days.length - 1 - colIdx, Math.round((cx - x0) / colW))) : 0;
      if (first || m !== lastM || dd !== lastD) { first = false; lastM = m; lastD = dd; setLift({ id: e.id, dx: dd * colW / sc, dy: m / 60 * px, label: fmtT(new Date(+e.s + m * 60000), c.h24) }); }
    };
    const frame = () => {
      if (!live) return;
      if (box) { const r = box.getBoundingClientRect(), edge = 70 * sc; if (cy < r.top + edge) box.scrollTop -= 10; else if (cy > r.bottom - edge) box.scrollTop += 10; }
      calc(); raf = requestAnimationFrame(frame);
    };
    const hold = (m: PointerEvent) => { cx = m.clientX; cy = m.clientY; if (!live && Math.hypot(cx - x0, cy - y0) > 10) stop(); };
    const stopTouch = (t: TouchEvent) => { if (live) t.preventDefault(); };      // once lifted, the page must not scroll under the finger
    const stop = () => { clearTimeout(timer); window.removeEventListener("pointermove", hold); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("touchmove", stopTouch); };
    const finish = (drop: boolean) => {
      const was = live; live = false; cancelAnimationFrame(raf); stop();
      if (!was) return;
      try { el.releasePointerCapture(pid); } catch { /* already let go */ }
      setLift(null); carrying.on = false; carrying.until = Date.now() + 250;
      if (drop && (lastM || lastD)) void moveTo(e, lastM, lastD);
    };
    const up = () => finish(true), cancel = () => finish(false);
    const timer = setTimeout(() => {
      if (e.s.getDate() !== new Date(+e.e - 1).getDate()) return soon("Tap a long event to change it.");
      if ((e as any).repeats) return soon("Tap a repeating event to change it.");
      live = true; carrying.on = true; navigator.vibrate?.(12);
      try { el.setPointerCapture(pid); } catch { /* fine without */ }
      calc(); raf = requestAnimationFrame(frame);
    }, 380);
    window.addEventListener("pointermove", hold); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", stopTouch, { passive: false });
  };
  const moveTo = async (e: Ev, minutes: number, dayShift: number) => {
    const shift = (str: string) => { const d = new Date(+new Date(str.slice(0, 16)) + minutes * 60000); d.setDate(d.getDate() + dayShift); return ymd(d) + "T" + hmOf(d); };
    const move = (d: Date) => { const n = new Date(+d + minutes * 60000); n.setDate(n.getDate() + dayShift); return n; };
    try {
      const was = await api("/api/hub-event?id=" + encodeURIComponent(e.series!));
      const moved = { ...was, start: shift(was.start), end: shift(was.end) };
      qc.setQueriesData<EvData>({ queryKey: ["events"] }, old => old && { ...old, list: old.list.map(x => x.id === e.id ? { ...x, s: move(x.s), e: move(x.e) } : x) });      // it settles where it was dropped while the hub saves
      await post("/api/hub-event", moved);
      qc.invalidateQueries({ queryKey: ["events"] });
      soon(`Moved to ${move(e.s).toLocaleDateString([], { weekday: "short" })} ${fmtT(move(e.s), c.h24)}.`, async () => { try { await post("/api/hub-event/restore", was); qc.invalidateQueries({ queryKey: ["events"] }); } catch (err: any) { soon(err.message); } });
    } catch (err: any) { qc.invalidateQueries({ queryKey: ["events"] }); soon(err.message || "Couldn't move that."); }
  };
  return (
    <div className="gwrap" style={{ flex: "none", height: tot * px, position: "relative" }}>
      {Array.from({ length: 24 }, (_, hr) => (
        <div key={hr} style={{ position: "absolute", left: 0, right: 0, top: top(hr) + "%", borderTop: "1px solid var(--hair)" }}>
          <span className="num ghr" style={{ width: gutter - 10 }}>{hourLabel(hr, c.h24)}</span>
        </div>
      ))}
      <div style={{ position: "absolute", left: gutter, right: 0, top: 0, bottom: 0 }}>
        {days.map((day, i) => {
          const today = sameDay(day, now), w = 100 / days.length;
          return (
            <div key={i} className="gcol" style={{ position: "absolute", top: 0, bottom: 0, left: i * w + "%", width: w + "%", borderLeft: "1px solid #edf0f5", ...(today && days.length > 1 ? { background: "#fbfaf6" } : {}) }}
              onClick={ev => {
                if (DEMO) return;
                const r = ev.currentTarget.getBoundingClientRect();
                const hr = Math.min(23, Math.floor(((ev.clientY - r.top) / r.height * tot) * 2) / 2);
                openSheet({ mode: "quick", day, hour: hr, who: cal.who });
              }}>
              {per[i].map(x => {
                const e = x.ev, cs = colorsOf(e, c.data, c.people), t0 = x.s.getHours() + x.s.getMinutes() / 60, t1 = t0 + (+x.e - +x.s) / 3600000;
                const mins = (+x.e - +x.s) / 60000, n = x.cols, tall = mins >= 55, ps = peopleOf(e, c.people);
                const who = ps.map(p => p.name).join(" · ");
                const style: CSSProperties = { top: `calc(${top(t0)}% + 2px)`, height: `calc(${top(t1) - top(t0)}% - 4px)`, left: `calc(${x.col / n * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)`, background: evBg(cs[0]), padding: big ? "7px 12px" : "5px 6px", ...vtn(e, day, c, t0) };
                return (
                  <button key={e.id + x.col} className={"evb" + (lift?.id === e.id ? " lifted" : "")} style={lift?.id === e.id ? { ...style, transform: `translate(${lift.dx}px, ${lift.dy}px)` } : style} onPointerDown={ev => startCarry(e, i, ev)} onClick={ev => { ev.stopPropagation(); if (Date.now() < carrying.until) return; c.open(e); }}>
                    {lift?.id === e.id ? <span className="dragtip">{lift.label}</span> : null}
                    
                    {big ? (tall ? (
                      <>
                        <div style={{ fontSize: n > 1 ? 16 : 19, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.1, paddingRight: n > 1 ? 0 : 4 }}>{e.title}</div>
                        <div className="fx" style={{ gap: 10, marginTop: 4, justifyContent: "space-between" }}>
                          <span className="num" style={{ fontSize: 16, fontWeight: 600, color: "#3a4358" }}>{fmtT(e.s, c.h24)} to {fmtT(e.e, c.h24)}</span>
                          {mins < 90 || n > 1 ? <Avs ps={ps} size={24} max={n > 1 ? 2 : 4} /> : null}
                        </div>
                        {ps.length && mins >= 90 && n === 1 ? <div className="fx" style={{ gap: 8, marginTop: 8 }}><Avs ps={ps} size={26} /><span style={{ fontSize: 16, fontWeight: 650, color: "#3a4358", minWidth: 0 }}>{who}</span></div> : null}
                      </>
                    ) : (
                      <div className="fx" style={{ justifyContent: "space-between", gap: 10, height: "100%" }}>
                        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                        <span className="fx" style={{ gap: 8, flex: "none" }}><Avs ps={ps} size={22} max={3} /><span className="num" style={{ fontSize: 15, fontWeight: 600, color: "#3a4358" }}>{fmtT(e.s, c.h24)}</span></span>
                      </div>
                    )) : (
                      <>
                        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "-.01em", lineHeight: 1.12 }}>{e.title}</div>
                        {tall ? <div className="num" style={{ fontSize: 12, fontWeight: 600, color: "#3a4358", marginTop: 1 }}>{fmtT(e.s, c.h24)}</div> : null}
                        {mins >= 90 && ps.length ? <div style={{ position: "absolute", left: 6, bottom: 4 }}><Avs ps={ps} size={18} max={3} /></div> : null}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {showNow ? <div style={{ position: "absolute", left: 0, right: 0, top: top(h) + "%", borderTop: "2px solid #e2523f", zIndex: 2, pointerEvents: "none" }}><span style={{ position: "absolute", left: -5, top: -6, width: 10, height: 10, borderRadius: "50%", background: "#e2523f" }} /><span className="num" style={{ position: "absolute", right: 6, bottom: 3, padding: "0 7px", borderRadius: 8, background: "rgba(255,255,255,.88)", fontSize: big ? 15 : 13, fontWeight: 800, lineHeight: 1.4, color: "#e2523f" }}>{fmtT(now, c.h24)}</span></div> : null}
      </div>
    </div>
  );
}

/** Eases a scroller to a place, frame by frame (the browser's own smooth scroll is too quick and can't be tuned). */
function glideTo(box: HTMLElement, to: number, ms: number) {
  const from = box.scrollTop, t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;     // ease in and out
    box.scrollTop = from + (to - from) * e;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** The hours scroll. Opening the calendar (or tapping Today) glides down to an hour above now; another day just starts at 8 in the morning. */
function Scroller({ keyed, anchorHour, big, opening, keep, shared, follow, children }: { keyed: string; anchorHour: number; big: boolean; opening: { current: boolean }; keep: { current: boolean }; shared: Shared; follow?: boolean; children: React.ReactNode }) {
  const { dim } = useHub();
  const el = useRef<HTMLDivElement>(null);
  const last = useRef({ key: "", top: 0, glideUntil: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const [day, nonce] = [keyed.split(":")[0], keyed.split(":")[1]];
  const prev = useRef({ day: "", nonce: "" });
  const wasFollow = useRef(!!follow);
  useLayoutEffect(() => {
    const box = el.current, l = last.current;
    if (!box) return;
    if (follow) { box.scrollTop = shared.top; wasFollow.current = true; return; }           // the panes either side just follow the one in view
    if (l.key !== keyed && keep.current && (l.key || wasFollow.current)) {        // a swipe keeps the hours where they are
      wasFollow.current = false; keep.current = false; l.key = keyed; l.top = box.scrollTop; prev.current = { day, nonce };
    } else if (l.key !== keyed) {
      const top = Math.max(0, (anchorHour - 1) * HOUR_PX(big, dim.phone));
      const first = opening.current, glide = (first || (prev.current.day === day && prev.current.nonce !== nonce)) && !matchMedia("(prefers-reduced-motion: reduce)").matches && top > 0;
      opening.current = false;
      l.key = keyed; l.top = top; prev.current = { day, nonce };
      clearTimeout(l.timer);
      if (glide) {
        const wait = first ? 500 : 0;          // let the calendar finish growing first
        l.glideUntil = Date.now() + wait + 900;
        box.scrollTop = first ? 0 : box.scrollTop;
        l.timer = setTimeout(() => glideTo(box, top, 800), wait);
      } else box.scrollTop = top;
    } else if (Date.now() > l.glideUntil) box.scrollTop = l.top;
  });
  useLayoutEffect(() => () => clearTimeout(last.current.timer), []);
  useLayoutEffect(() => { const b = el.current!; if (follow) shared.els.add(b); return () => { shared.els.delete(b); }; }, [follow]);
  return <div ref={el} className="scroll gscroll" style={{ flex: 1, minHeight: 0 }} onScroll={e => {
    const t = e.currentTarget.scrollTop;
    if (follow) return;
    last.current.top = t; shared.top = t;
    shared.els.forEach(b => { if (b.scrollTop !== t) b.scrollTop = t; });
  }}>{children}</div>;
}

function AllDay({ days, gutter, c }: { days: Date[]; gutter: number; c: Ctx }) {
  const first = days[0], n = days.length;
  const items = c.list.filter(e => e.all_day && days.some(d => onDay(e, d))).map(e => ({ e, a: Math.max(0, dayDiff(e.s, first)), b: Math.min(n - 1, dayDiff(addDays(e.e, -1), first)), l: 0 }))
    .sort((x, y) => x.a - y.a || y.b - x.b);
  if (!items.length) return null;
  const lanes: number[] = [];
  for (const it of items) {
    let l = lanes.findIndex(last => last < it.a);
    if (l < 0) { l = lanes.length; lanes.push(-1); }
    lanes[l] = it.b; it.l = l;
  }
  const keep = items.filter(it => it.l < 3), more = items.length - keep.length;
  return (
    <>
      <div className="fx" style={{ alignItems: "flex-start", padding: "0 0 8px" }}>
        <span style={{ width: gutter - 10, textAlign: "right", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: "#6b7488", flex: "none", lineHeight: "30px", whiteSpace: "nowrap" }}>ALL DAY</span>
        <div style={{ flex: 1, marginLeft: 10, display: "grid", gridTemplateColumns: `repeat(${n},minmax(0,1fr))`, rowGap: 4 }}>
          {keep.map(it => {
            const cs = colorsOf(it.e, c.data, c.people), ps = peopleOf(it.e, c.people);
            return <button key={it.e.id} className="evb" onClick={() => c.open(it.e)} style={{ position: "relative", gridColumn: `${it.a + 1}/${it.b + 2}`, gridRow: it.l + 1, height: 32, margin: "0 3px", background: evBg(cs[0]), padding: "0 8px 0 10px", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, ...vtn(it.e, addDays(first, it.a), c) }}><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{it.e.title}</span><Avs ps={ps} size={20} max={3} /></button>;
          })}
        </div>
      </div>
      {more > 0 ? <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6478", padding: `0 0 6px ${gutter}px` }}>+{more} more all day</div> : null}
    </>
  );
}

const busyColours = (c: Ctx, d: Date) => [...new Set(c.list.filter(e => onDay(e, d)).flatMap(e => colorsOf(e, c.data, c.people)))].slice(0, 5);

function DayHead({ days, size, gutter, c }: { days: Date[]; size: number; gutter: number; c: Ctx }) {
  const { now } = useHub();
  const cal = usePaneCal();
  const sel = startOfDay(cal.date);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${days.length},minmax(0,1fr))`, marginLeft: gutter, padding: "2px 0 8px" }}>
      {days.map(d => {
        const today = sameDay(d, now), on = sameDay(d, sel), cs = busyColours(c, d), wk = d.getDay() === 0 || d.getDay() === 6;
        return (
          <button key={+d} aria-label={longDay(d)} onClick={() => c.morph(x => ({ ...x, mode: "day", date: d }), false)} style={{ border: 0, background: "none", padding: 0, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: today || on ? "#101828" : wk ? "#c0392b" : "#5a6478" }}>{d.toLocaleDateString([], { weekday: "short" }).slice(0, 3).toUpperCase()}</span>
            <span className={"num dnum" + (on && cal.mode === "day" ? " ring" : "") + (today ? " now" : "")} style={{ width: size, height: size, fontSize: Math.round(size / 2) }}>{d.getDate()}</span>
            <span className="fx" style={{ gap: 3, height: 8, justifyContent: "center" }}>{cs.map(col => <i key={col} className="bz" style={{ background: col }} />)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The Schedule's columns: one for each person, then one for each calendar whose events name nobody. Asking for one person shows just theirs. */
function schedCols(c: Ctx, day: Date, who: string | null) {
  const cols: { key: string; name: string; color: string; pal?: string; person: boolean; evs: Ev[] }[] = c.people.map(p => ({ key: p.id, name: p.name, color: p.color, pal: p.pal, person: true, evs: c.list.filter(e => (e.people || []).includes(p.id)) }));
  for (const e of c.list.filter(e => onDay(e, day) && !peopleOf(e, c.people).length)) {
    const k = calOf(e, c.data, c.people), key = "c:" + (e.cal || k.name);
    let col = cols.find(x => x.key === key);
    if (!col) cols.push(col = { key, name: k.name || "Family", color: k.color, person: false, evs: [] });
    col.evs.push(e);
  }
  return cols.map(x => ({ ...x, hidden: !!who && x.key !== who }));
}
const deep = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

function SchedHead({ day, gutter, c }: { day: Date; gutter: number; c: Ctx }) {
  const { setCal } = useHub();
  const cal = usePaneCal();
  return (
    <div className="sch-head" style={{ paddingLeft: gutter }}>
      {schedCols(c, day, cal.who).map(col => (
        <div key={col.key} className="sch-col" style={{ flexGrow: col.hidden ? .0001 : 1, opacity: col.hidden ? 0 : 1 }}>
          <button className={"sch-who" + (cal.who === col.key ? " on" : "")} aria-pressed={cal.who === col.key} aria-label={(cal.who === col.key ? "Show everyone" : "Show only " + col.name)} disabled={!col.person}
            onClick={() => setCal(x => ({ ...x, who: x.who === col.key ? null : col.key }))} style={{ "--ec": col.color } as CSSProperties}>
            <Ava p={col} size={52} cls="sch-ava" /><b>{col.name}</b>
          </button>
        </div>
      ))}
    </div>
  );
}

/** Schedule: one day with a column for each person, so who is doing what reads across the hours. Tap a gap to add something for that person then. */
function Schedule({ day, gutter, c }: { day: Date; gutter: number; c: Ctx }) {
  const { now, dim, openSheet } = useHub();
  const cal = usePaneCal();
  const px = HOUR_PX(true, dim.phone), top = (h: number) => h / 24 * 100;
  const cols = schedCols(c, day, cal.who), seen = new Set<string>();
  const h = now.getHours() + now.getMinutes() / 60;
  return (
    <div className="gwrap" style={{ flex: "none", height: 24 * px, position: "relative" }}>
      {Array.from({ length: 24 }, (_, hr) => (
        <div key={hr} style={{ position: "absolute", left: 0, right: 0, top: top(hr) + "%", borderTop: "1px solid var(--hair)" }}>
          <span className="num ghr" style={{ width: gutter - 10 }}>{hourLabel(hr, c.h24)}</span>
        </div>
      ))}
      <div className="sch-body" style={{ left: gutter }}>
        {cols.map(col => (
          <div key={col.key} className="sch-col gcol" style={{ flexGrow: col.hidden ? .0001 : 1, opacity: col.hidden ? 0 : 1 }}
            onClick={ev => {
              if (DEMO) return;
              const r = ev.currentTarget.getBoundingClientRect();
              const hr = Math.min(23, Math.floor(((ev.clientY - r.top) / r.height * 24) * 2) / 2);
              openSheet({ mode: "quick", day, hour: hr, who: col.person ? col.key : cal.who });
            }}>
            {timedOn(col.evs, day).map(x => {
              const e = x.ev, t0 = x.s.getHours() + x.s.getMinutes() / 60, t1 = t0 + (+x.e - +x.s) / 3600000, n = x.cols, live = e.s <= now && now < e.e;
              const named = !seen.has(e.id); seen.add(e.id);      // an event shared by two people glides from its first column only
              return (
                <button key={e.id} className={"evb sev" + (live ? " live" : "")} onClick={ev => { ev.stopPropagation(); c.open(e); }}
                  style={{ top: `calc(${top(t0)}% + 2px)`, height: `calc(${top(t1) - top(t0)}% - 4px)`, left: `calc(${x.col / n * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, "--ec": col.color, ...(named ? vtn(e, day, c, t0) : {}) } as CSSProperties}>
                  <b>{e.title}</b>
                  {t1 - t0 >= .6 ? <span className="num" style={{ color: deep(col.color) }}>{fmtT(e.s, c.h24)} – {fmtT(e.e, c.h24)}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
        {sameDay(day, now) ? <div className="nowline" style={{ top: top(h) + "%" }}><i /></div> : null}
      </div>
    </div>
  );
}

/** Week: the seven days side by side, each a stack of cards in time order, with that night's dinner along the foot. Everyday things (school, kindy) are a quiet single line. */
function WeekCards({ c }: { c: Ctx }) {
  const { now, people, openSheet } = useHub();
  const { data: din } = useDinners();
  const { go } = useNav();
  const cal = usePaneCal();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(startOfDay(cal.date)), i));
  return (
    <div className="wkc">
      <div className="wkc-cols">
        {days.map(d => {
          const today = sameDay(d, now), wk = d.getDay() === 0 || d.getDay() === 6;
          const evs = c.list.filter(e => onDay(e, d)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s);
          return (
            <div key={+d} className={"wkc-col" + (today ? " today" : "")}>
              <button className="wkc-h" aria-label={longDay(d)} onClick={() => c.morph(x => ({ ...x, mode: "day", date: d }))}>
                <span style={wk ? { color: "#b4321f" } : undefined}>{d.toLocaleDateString([], { weekday: "short" })}</span>
                <b className={"num dnum" + (today ? " now" : "")}>{d.getDate()}</b>
              </button>
              <div className="wkc-list scroll" onClick={ev => { if (ev.target === ev.currentTarget && !DEMO) openSheet({ mode: "quick", day: d, who: cal.who }); }}>
                {evs.map(e => {
                  const cs = colorsOf(e, c.data, c.people), plain = !!e.series && !e.all_day && (+e.e - +e.s) >= 4 * 3600000;
                  return (
                    <button key={e.id} className={"wkc-ev" + (e.all_day ? " ad" : "") + (plain ? " plain" : "")} onClick={() => c.open(e)} style={{ "--ec": cs[0], ...vtn(e, d, c) } as CSSProperties}>
                      {e.all_day ? null : <span className="num t">{fmtT(e.s, c.h24)}</span>}
                      <b>{e.title}</b>
                      {plain || cs.length < 2 && !peopleOf(e, c.people).length ? null : <span className="dots">{(peopleOf(e, c.people).length ? peopleOf(e, c.people).map(p => p.color) : cs).slice(0, 5).map((col, i) => <i key={i} style={{ background: col }} />)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <button className="wkc-din" onClick={() => go("menu")} aria-label="Dinners this week">
        {days.map(d => <span key={+d}><small>Dinner</small><b>{dinnerFor(din, people, d)?.name || "–"}</b></span>)}
      </button>
    </div>
  );
}

function Month({ c }: { c: Ctx }) {
  const { now, dim, openSheet } = useHub();
  const cal = usePaneCal();
  const [first] = calRange(cal), cur = cal.date.getMonth();
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", paddingBottom: 8 }}>
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((x, i) => <span key={x} style={{ textAlign: "center", fontSize: 13, fontWeight: 700, letterSpacing: ".08em", color: i > 4 ? "#c0392b" : "#5a6478" }}>{x}</span>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gridTemplateRows: "repeat(6,minmax(0,1fr))" }}>
        {Array.from({ length: 42 }, (_, i) => {
          const day = addDays(first, i), inM = day.getMonth() === cur, today = sameDay(day, now);
          const evs = c.list.filter(e => onDay(e, day)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s);
          const keep = evs.length > 3 ? evs.slice(0, 2) : evs, rest = evs.slice(keep.length), more = rest.length;
          const sz = dim.phone ? 30 : 34;
          return (
            <button key={i} className={"mcell" + (today ? " today" : "")} aria-label={longDay(day)} onClick={() => DEMO ? c.morph(x => ({ ...x, mode: "day", date: day })) : openSheet({ mode: "quick", day, who: cal.who })} style={{ ...(i % 7 ? { borderLeft: "1px solid #edf0f5" } : {}), ...(inM ? {} : { background: "#fafbfd" }) }}>
              <span className={"num mnum" + (today ? " now" : "")} style={{ width: sz, height: sz, fontSize: dim.phone ? 16 : 18, ...(dim.phone ? { margin: "0 auto" } : {}), ...(today || inM ? {} : { color: "#7d869a" }) }}>{day.getDate()}</span>
              {dim.phone ? (
                <span className="fx" style={{ gap: 3, flexWrap: "wrap", justifyContent: "center", paddingTop: 2 }}>{evs.slice(0, 6).map(e => <i key={e.id} style={{ width: 8, height: 8, borderRadius: "50%", background: colorsOf(e, c.data, c.people)[0], opacity: inM ? 1 : .5 }} />)}</span>
              ) : (
                <>
                  {keep.map(e => {
                    const cs = colorsOf(e, c.data, c.people), ps = peopleOf(e, c.people);
                    return <span key={e.id} className="mchip" style={{ background: evBg(cs[0]), opacity: inM ? 1 : .55, ...vtn(e, day, c) }}><span className="mt">{e.title}</span><Avs ps={ps} size={16} max={2} /></span>;
                  })}
                  {more > 0 ? <span className="fx" style={{ gap: 5, fontSize: 13, fontWeight: 700, color: "#5a6478", paddingLeft: 4 }}>+{more} more<span className="fx" style={{ gap: 3 }}>{[...new Set(rest.flatMap(e => colorsOf(e, c.data, c.people)))].slice(0, 4).map(col => <i key={col} className="bz" style={{ background: col }} />)}</span></span> : null}
                </>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** A plain list of what's coming over the next two weeks: only days with something on, so it reads from a metre away. */
function Upcoming({ c }: { c: Ctx }) {
  const { now } = useHub();
  const cal = usePaneCal();
  const d = startOfDay(cal.date);
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(d, i)).map(day => ({ day, evs: c.list.filter(e => onDay(e, day)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s) }));
  const shown = days.filter(x => x.evs.length || sameDay(x.day, now));
  const none = !days.some(x => x.evs.length);
  const name = (day: Date) => sameDay(day, now) ? "Today" : sameDay(day, addDays(now, 1)) ? "Tomorrow" : day.toLocaleDateString([], { weekday: "long" });
  return (
    <div className="scroll upc" style={{ flex: 1, minHeight: 0 }}>
      {shown.map(({ day, evs }) => (
        <section key={+day} className="upd" aria-label={longDay(day)}>
          <div className="uph"><b>{name(day)}</b><span>{day.toLocaleDateString([], { day: "numeric", month: "long" })}</span></div>
          {evs.length ? evs.map(e => {
            const cs = colorsOf(e, c.data, c.people), ps = peopleOf(e, c.people), who = ps.map(p => p.name).join(" · ") || calOf(e, c.data, c.people).name;
            return (
              <button key={e.id} className="upe" onClick={() => c.open(e)} style={{ "--ec": cs[0] } as CSSProperties}>
                <span className="upt num">{e.all_day ? "All day" : <>{fmtT(e.s, c.h24)}<small>{fmtT(e.e, c.h24)}</small></>}</span>
                <span className="upb" aria-hidden />
                <span className="upm"><b>{e.title}</b>{e.location || who ? <small>{[who, e.location].filter(Boolean).join(" · ")}</small> : null}</span>
                <Avs ps={ps} size={34} max={3} />
              </button>
            );
          }) : <div className="upn">Nothing on today.</div>}
        </section>
      ))}
      {none ? <p className="upn" style={{ padding: "18px 4px" }}>Nothing planned for the next two weeks. Tap + New to add something.</p> : null}
    </div>
  );
}

function Agenda({ c }: { c: Ctx }) {
  const { now } = useHub();
  const cal = usePaneCal();
  const w = weekStart(startOfDay(cal.date));
  return (
    <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const day = addDays(w, i), today = sameDay(day, now);
        const evs = c.list.filter(e => onDay(e, day)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s);
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "58px 1fr", gap: 10, padding: "10px 0 4px", borderTop: "1px solid #edf0f5" }}>
            <button aria-label={longDay(day)} onClick={() => c.morph(x => ({ ...x, mode: "day", date: day }), false)} style={{ border: 0, background: "none", padding: 0, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "start", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: "#5a6478" }}>{day.toLocaleDateString([], { weekday: "short" }).toUpperCase()}</span>
              <span className={"num dnum" + (today ? " now" : "")} style={{ width: 40, height: 40, fontSize: 20 }}>{day.getDate()}</span>
            </button>
            <div>
              {evs.length ? evs.map(e => {
                const cs = colorsOf(e, c.data, c.people), ps = peopleOf(e, c.people), who = ps.map(p => p.name).join(" · ") || calOf(e, c.data, c.people).name;
                return (
                  <button key={e.id} className="evb" onClick={() => c.open(e)} style={{ position: "relative", width: "100%", background: evBg(cs[0]), padding: "8px 12px", marginBottom: 6, ...vtn(e, day, c) }}>
                    
                    <div className="fx" style={{ justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.02em", minWidth: 0 }}>{e.title}</span>
                      <span className="num" style={{ fontSize: 15, fontWeight: 600, color: "#3a4358", flex: "none" }}>{e.all_day ? "All day" : fmtT(e.s, c.h24)}</span>
                    </div>
                    {who ? <div className="fx" style={{ gap: 8, marginTop: 4, fontSize: 14, fontWeight: 600, color: "#3a4358" }}><Avs ps={ps} size={22} />{who}</div> : null}
                  </button>
                );
              }) : <div style={{ fontSize: 16, color: "#6b7488", padding: "12px 0 14px" }}>Nothing on</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Yesterday, today and tomorrow (or the weeks or months either side) sit side by side on one track. Drag and the neighbours slide in already drawn,
    so it reads as one long calendar; let go past a fifth of the way (or flick) and the track settles on the next one. */
function SwipePane({ onStep, api, keyOf, children }: { onStep: (n: number) => void; api: { current: (n: number) => void }; keyOf: (off: number) => string; children: (off: number) => ReactNode }) {
  const { dim } = useHub();
  const box = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  const g = useRef({ id: -1, x: 0, y: 0, t: 0, dx: 0, lock: false, swiped: false, busy: false, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const move = (x: number, ms: number) => { const b = track.current; if (!b) return; b.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : "none"; b.style.transform = x ? `translate3d(${x}px,0,0)` : ""; };
  const settle = (dir: number) => {
    const s = g.current, w = box.current?.offsetWidth || 0;
    if (s.busy || !w) return;
    s.busy = true;
    const ms = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 340;
    move(-dir * w, ms);
    s.timer = setTimeout(() => { flushSync(() => onStep(dir)); move(0, 0); s.busy = false; }, ms);     // the neighbour was already drawn, so nothing jumps
  };
  api.current = settle;
  useEffect(() => () => clearTimeout(g.current.timer), []);
  const end = (e: React.PointerEvent) => {
    const s = g.current, b = box.current;
    if (e.pointerId !== s.id) return;
    s.id = -1;
    if (!s.lock || !b) return;
    s.lock = false; s.swiped = true; setTimeout(() => { s.swiped = false; }, 60);
    const w = b.offsetWidth, v = s.dx / Math.max(1, e.timeStamp - s.t), go = Math.abs(s.dx) > w * .2 || Math.abs(v) > .5;
    if (!go) return move(0, 260);
    settle(s.dx < 0 ? 1 : -1);
  };
  return (
    <div ref={box} style={{ flex: 1, minHeight: 0, position: "relative", touchAction: "pan-y", overflow: "hidden" }}
      onPointerDown={e => { const s = g.current; if (carrying.on || s.busy || (e.pointerType === "mouse" && e.button !== 0)) return; Object.assign(s, { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, lock: false }); }}
      onPointerMove={e => {
        const s = g.current;
        if (carrying.on || e.pointerId !== s.id) return;
        const dx = (e.clientX - s.x) / dim.s, dy = (e.clientY - s.y) / dim.s;
        if (!s.lock) {
          if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s.id = -1; return; }
          if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
          s.lock = true; e.currentTarget.setPointerCapture(e.pointerId);
        }
        s.dx = dx; move(dx, 0);
      }}
      onPointerUp={end} onPointerCancel={end}
      onClickCapture={e => { if (g.current.swiped) { e.stopPropagation(); e.preventDefault(); } }}>
      <div ref={track} style={{ position: "absolute", inset: 0, willChange: "transform" }}>
        {[-1, 0, 1].map(off => (
          <div key={keyOf(off)} inert={off !== 0} aria-hidden={off !== 0} style={{ position: "absolute", top: 0, bottom: 0, left: `${off * 100}%`, width: "100%", display: "flex", flexDirection: "column" }}>{children(off)}</div>
        ))}
      </div>
    </div>
  );
}

function calTitle(cal: CalView, phone: boolean) {
  const d = cal.date, w = phone ? "short" : "long";
  if (cal.mode === "agenda") { const a = startOfDay(d), b = addDays(a, AGENDA_DAYS - 1), m = (x: Date) => x.toLocaleDateString([], { month: "short" }); return sameDay(a, nowZ()) ? (phone ? "Next 2 weeks" : "Next two weeks") : `${a.getDate()} ${m(a)} to ${b.getDate()} ${m(b)}`; }
  if (cal.mode === "day" || cal.mode === "schedule") return d.toLocaleDateString([], { weekday: w, day: "numeric", month: w });
  if (cal.mode === "week") {
    const a = weekStart(d), b = addDays(a, 6), m = (x: Date) => x.toLocaleDateString([], { month: w });
    return a.getMonth() === b.getMonth() ? `${a.getDate()} to ${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} to ${b.getDate()} ${m(b)}`;
  }
  return d.toLocaleDateString([], { month: "long", year: phone && d.getFullYear() === nowZ().getFullYear() ? undefined : "numeric" });
}

/* The tablet has Schedule (a column for each person); a phone is too narrow for it, so it keeps the List instead. */
const MODES_TAB = ["day", "schedule", "week", "month"] as const;
const MODES_PHONE = ["day", "week", "month", "agenda"] as const;

type Base = Pick<Ctx, "people" | "h24" | "vt" | "band" | "morph">;

/** One screenful of the swipe track: a day, week or month, with its own events. */
function Pane({ off, pc, k, keep, opening, shared, nonce }: { off: number; pc: CalView; k: Base; keep: { current: boolean }; opening: { current: boolean }; shared: Shared; nonce: number }) {
  const { now, dim, openSheet, soon } = useHub();
  const P = dim.phone, follow = off !== 0;
  const [from, to] = calRange(pc);
  const { data = EMPTY_EVENTS } = useEvents(from, to);
  const c: Ctx = {
    ...k, data, list: data.list.filter(e => visibleTo(e, pc.who)), vt: k.vt && !follow,
    open: e => openSheet({ mode: "details", e }),
  };
  const d = startOfDay(pc.date), weekOf = Array.from({ length: 7 }, (_, i) => addDays(weekStart(d), i));
  const anchor = (days: Date[]) => days.some(x => sameDay(x, now)) ? now.getHours() + now.getMinutes() / 60 : 8;
  const key = pc.mode + ymd(pc.date) + ":" + nonce;
  return (
    <PaneCal.Provider value={pc}>
      {pc.mode === "agenda" ? <Upcoming c={c} />
        : pc.mode === "month" ? <Month c={c} />
        : pc.mode === "week" && P ? <Agenda c={c} />
        : pc.mode === "week" ? <WeekCards c={c} />
        : pc.mode === "schedule" ? <><SchedHead day={d} gutter={56} c={c} /><AllDay days={[d]} gutter={56} c={c} /><Scroller keyed={key} anchorHour={anchor([d])} big opening={opening} keep={keep} shared={shared} follow={follow}><Schedule day={d} gutter={56} c={c} /></Scroller></>
        : <><AllDay days={[d]} gutter={P ? 48 : 60} c={c} /><Scroller keyed={key} anchorHour={anchor([d])} big opening={opening} keep={keep} shared={shared} follow={follow}><Grid days={[d]} gutter={P ? 48 : 60} big c={c} /></Scroller></>}
    </PaneCal.Provider>
  );
}

export function CalendarPanel() {
  const { cal, setCal, now, dim, h24, people, openSheet, S } = useHub();
  const P = dim.phone;
  const [from, to] = calRange(cal);
  const { data = EMPTY_EVENTS } = useEvents(from, to);
  const [nonce, setNonce] = useState(0);
  const [vt, setVt] = useState(false);     // true only while views are morphing, so events carry a transition name just then
  const keep = useRef(false);        // set by a swipe, so the hours stay put
  const opening = useRef(true);      // true until the hours have glided down to now, so only opening the calendar glides
  const page = usePage(), onPage = useRef(page === "calendar");
  useEffect(() => {      // coming back to the Calendar from another tab glides down to now again
    if (page === "calendar" && !onPage.current) { opening.current = true; setNonce(n => n + 1); }
    onPage.current = page === "calendar";
  }, [page]);
  const list = data.list.filter(e => visibleTo(e, cal.who));
  const shared = useRef<Shared>({ top: 0, els: new Set() }).current;
  const slide = useRef<(n: number) => void>(() => {});     // set by the swipe track, so the arrows slide it too
  const d = startOfDay(cal.date);
  const weekOf = Array.from({ length: 7 }, (_, i) => addDays(weekStart(d), i));
  const anchor = (days: Date[]) => days.some(x => sameDay(x, now)) ? now.getHours() + now.getMinutes() / 60 : 8;
  /** Changes the view; where the browser can, events glide from their old place to their new one (day to week to month). */
  const morph = (f: (c: CalView) => CalView, names = true) => {
    const start = (document as any).startViewTransition?.bind(document);
    if (!start || matchMedia("(prefers-reduced-motion: reduce)").matches) return setCal(f);
    flushSync(() => setVt(names));
    const t = start(() => { flushSync(() => setCal(f)); });
    t.ready?.catch(() => {}); t.updateCallbackDone?.catch(() => {});      // a transition the browser drops is fine: the view still changes
    t.finished.catch(() => {}).finally(() => setVt(false));
  };
  const band: [number, number] = [Math.min(anchor([d]), anchor(weekOf)) - 1, Math.max(anchor([d]), anchor(weekOf)) + 10];
  const c: Ctx = {
    data, list, people, h24, vt, morph, band,
    open: e => openSheet({ mode: "details", e }),
  };
  const prefetch = usePrefetchEvents();
  useEffect(() => { prefetch([-1, 1].map(n => calRange({ ...cal, date: stepDate(cal, n) })).concat([calRange({ ...cal, mode: "month" }), calRange({ ...cal, mode: "week" })])); }, [cal.mode, +startOfDay(cal.date)]);
  const key = cal.mode + ymd(cal.date) + ":" + nonce;
  const { data: w } = useQuery({ queryKey: ["weather"], queryFn: () => api<any>("/api/weather"), enabled: !!S.config.weather?.connected, refetchInterval: 600000, staleTime: 300000 });
  const today = nowZ();
  const onNow = cal.mode === "month" ? cal.date.getMonth() === today.getMonth() && cal.date.getFullYear() === today.getFullYear()
    : cal.mode === "week" || cal.mode === "agenda" ? sameDay(weekStart(startOfDay(cal.date)), weekStart(startOfDay(today))) : sameDay(cal.date, today);
  const cals = Object.values(data.cals);
  const MODES = P ? MODES_PHONE : MODES_TAB;
  const idx = Math.max(0, (MODES as readonly string[]).indexOf(cal.mode));
  useEffect(() => {      // a phone has no Schedule and a tablet no List: each falls back to its nearest view
    if (P && cal.mode === "schedule") setCal(x => ({ ...x, mode: "day" }));
    if (!P && cal.mode === "agenda") setCal(x => ({ ...x, mode: "week" }));
  }, [P, cal.mode]);
  const arrows = <><button className="cnav" aria-label="Back" onClick={() => slide.current(-1)}><ChevL /></button><button className="cnav" aria-label="Forward" onClick={() => slide.current(1)}><ChevR /></button></>;
  return (
    <div className="calp" style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: `${(P ? 14 : 24) + dim.st}px ${P ? 14 : 24}px 0` }}>
      <div className="chd1">
        <div className="chd-t"><h1 key={cal.mode + ymd(cal.date)} className="ctitle">{calTitle(cal, P)}</h1>{arrows}{onNow ? null : <button className="cbtn ctoday" onClick={() => { morph(x => ({ ...x, date: nowZ() }), false); setNonce(n => n + 1); }}>Today</button>}</div>
        <div className="chd-r">
          <button className="cnav plain" aria-label="Search, or find a free time" onClick={() => openSheet({ mode: "find" })}><SearchIcon /></button>
          {w && !P ? <span className="cwx"><WeatherIcon kind={w.icon} size={28} /><span className="num">{w.temp}°</span></span> : null}
          {w && !P ? <i className="csep" /> : null}
          <span className="num cclock">{clockT(now, h24)}{h24 ? null : <small>{now.getHours() < 12 ? "am" : "pm"}</small>}</span>
        </div>
      </div>
      <div className="chd2">
        <div className="segc" role="tablist" style={{ "--n": MODES.length, "--i": idx } as CSSProperties}>
          <span className="segthumb" aria-hidden />
          {MODES.map(m => <button key={m} role="tab" aria-selected={cal.mode === m} className={"sg big" + (cal.mode === m ? " on" : "")} onClick={() => cal.mode !== m && morph(x => ({ ...x, mode: m }))}>{m === "agenda" ? "List" : m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>
        <div className="cwho">
          <button className={"call" + (cal.who ? "" : " on")} aria-pressed={!cal.who} onClick={() => setCal(x => ({ ...x, who: null }))}>All</button>
          {people.map(p => {
            const on = cal.who === p.id;
            return <button key={p.id} className={"cface" + (on ? " on" : cal.who ? " dim" : "")} aria-pressed={on} aria-label={on ? "Show everyone" : "Show only " + p.name} style={{ "--pc": p.color } as CSSProperties} onClick={() => setCal(x => ({ ...x, who: x.who === p.id ? null : p.id }))}><Ava p={p} size={P ? 40 : 44} /></button>;
          })}
        </div>
      </div>
      {cal.mode === "day" ? <DayHead days={weekOf} size={P ? 40 : 44} gutter={0} c={c} /> : null}
      <SwipePane api={slide} keyOf={off => cal.mode + ymd(stepDate(cal, off))} onStep={n => { keep.current = true; setCal(x => ({ ...x, date: stepDate(x, n) })); }}>
        {off => <Pane off={off} pc={{ ...cal, date: stepDate(cal, off) }} k={{ people, h24, vt, band, morph }} keep={keep} opening={opening} shared={shared} nonce={nonce} />}
      </SwipePane>
      <div style={{ flex: "none", padding: `6px 0 ${(P ? 74 : 104) + dim.sb}px` }}>
        {cals.length ? <div className="fx legend" style={{ gap: 14, flexWrap: "wrap", padding: "6px 4px 0" }}>{cals.map(x => <span key={x.id} className="pp" style={{ fontSize: 15 }}><i style={{ background: x.color }} />{x.name + (x.ok ? "" : " (can't reach)")}</span>)}</div> : null}
      </div>
    </div>
  );
}
