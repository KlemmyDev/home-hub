import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { addDays, clockT, dayDiff, fmtT, hourLabel, longDay, sameDay, shortDate, startOfDay, weekStart, ymd } from "../lib/dates";
import { calOf, colorsOf, onDay, peopleOf, tint, timedOn, visibleTo, type Ev, type EvData } from "../lib/events";
import { ChevL, ChevR } from "../lib/icons";
import { DEMO } from "../lib/api";
import { EMPTY_EVENTS, useEvents } from "../data";
import { useHub, type CalView } from "../hub";
import { loadEventDraft, newEventDraft } from "./Sheets";

const HOUR_PX = (big: boolean, phone: boolean) => phone ? 64 : big ? 76 : 64;     // a fixed height for each hour, so the day scrolls

const Dots = ({ cs, size, top, mid }: { cs: string[]; size: number; top?: number; mid?: boolean }) => (
  <span style={{ position: "absolute", left: 9, ...(mid ? { top: 0, bottom: 0, justifyContent: "center" } : { top }), display: "flex", flexDirection: "column", gap: 3 }}>
    {cs.map((c, i) => <i key={i} style={{ width: size, height: size, borderRadius: "50%", background: c, flex: "none" }} />)}
  </span>
);

function calRange(cal: CalView): [Date, Date] {
  const d = startOfDay(cal.date);
  if (cal.mode === "day") return [d, addDays(d, 1)];
  if (cal.mode === "week") { const w = weekStart(d); return [w, addDays(w, 7)]; }
  const first = weekStart(new Date(d.getFullYear(), d.getMonth(), 1));
  return [first, addDays(first, 42)];
}

type Ctx = { data: EvData; list: Ev[]; people: ReturnType<typeof useHub>["people"]; h24: boolean; open: (e: Ev) => void };

function Grid({ days, gutter, big, c }: { days: Date[]; gutter: number; big: boolean; c: Ctx }) {
  const { now, dim, openSheet, cal } = useHub();
  const per = days.map(d => timedOn(c.list, d));
  const tot = 24, top = (h: number) => h / tot * 100;      // midnight to midnight
  const px = HOUR_PX(big, dim.phone);
  const showNow = days.some(d => sameDay(d, now));
  const h = now.getHours() + now.getMinutes() / 60;
  return (
    <div className="gwrap" style={{ flex: "none", height: tot * px, position: "relative" }}>
      {Array.from({ length: 24 }, (_, hr) => (
        <div key={hr} style={{ position: "absolute", left: 0, right: 0, top: top(hr) + "%", borderTop: "1px solid #edf0f5" }}>
          <span className="num" style={{ position: "absolute", left: 0, top: 4, width: gutter - 10, textAlign: "right", fontSize: big ? 14 : 13, fontWeight: 600, color: "#6b7488" }}>{hourLabel(hr, c.h24)}</span>
        </div>
      ))}
      <div style={{ position: "absolute", left: gutter, right: 0, top: 0, bottom: 0 }}>
        {days.map((day, i) => {
          const today = sameDay(day, now), w = 100 / days.length;
          return (
            <div key={i} className="gcol" style={{ position: "absolute", top: 0, bottom: 0, left: i * w + "%", width: w + "%", borderLeft: "1px solid #edf0f5", ...(today ? { background: "rgba(47,111,224,.045)" } : {}) }}
              onClick={ev => {
                if (DEMO) return;
                const r = ev.currentTarget.getBoundingClientRect();
                const hr = Math.min(23, Math.floor(((ev.clientY - r.top) / r.height * tot) * 2) / 2);
                openSheet({ mode: "event", draft: newEventDraft(day, hr, now, cal.who) });
              }}>
              {per[i].map(x => {
                const e = x.ev, cs = colorsOf(e, c.data, c.people), t0 = x.s.getHours() + x.s.getMinutes() / 60, t1 = t0 + (+x.e - +x.s) / 3600000;
                const mins = (+x.e - +x.s) / 60000, n = x.cols, tall = mins >= 55;
                const who = peopleOf(e, c.people).map(p => p.name).join(" · ");
                const style: CSSProperties = { top: `calc(${top(t0)}% + 2px)`, height: `calc(${top(t1) - top(t0)}% - 4px)`, left: `calc(${x.col / n * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)`, background: tint(cs[0]), padding: big ? "6px 12px 6px 28px" : "5px 6px 5px 20px" };
                return (
                  <button key={e.id + x.col} className="evb" style={style} onClick={ev => { ev.stopPropagation(); c.open(e); }}>
                    <Dots cs={cs} size={10} top={8} />
                    {big ? (tall ? (
                      <>
                        <div style={{ fontSize: n > 1 ? 19 : 22, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.1 }}>{e.title}</div>
                        <div className="num" style={{ fontSize: 15, fontWeight: 600, color: "#3a4358", marginTop: 3 }}>{fmtT(e.s, c.h24)} to {fmtT(e.e, c.h24)}</div>
                        {who ? <div style={{ fontSize: 15, fontWeight: 600, color: "#3a4358", marginTop: 4 }}>{who}</div> : null}
                      </>
                    ) : (
                      <div className="fx" style={{ justifyContent: "space-between", gap: 10, height: "100%" }}>
                        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                        <span className="num" style={{ fontSize: 15, fontWeight: 600, color: "#3a4358", flex: "none" }}>{fmtT(e.s, c.h24)}</span>
                      </div>
                    )) : (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", lineHeight: 1.12 }}>{e.title}</div>
                        {tall ? <div className="num" style={{ fontSize: 12, fontWeight: 600, color: "#3a4358", marginTop: 1 }}>{fmtT(e.s, c.h24)}</div> : null}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {showNow ? <div style={{ position: "absolute", left: 0, right: 0, top: top(h) + "%", borderTop: "2px solid #e2523f", zIndex: 2, pointerEvents: "none" }}><span style={{ position: "absolute", left: -5, top: -6, width: 10, height: 10, borderRadius: "50%", background: "#e2523f" }} /></div> : null}
      </div>
    </div>
  );
}

/** The hours scroll; a new day starts an hour above now (or at 8 in the morning). */
function Scroller({ keyed, anchorHour, big, children }: { keyed: string; anchorHour: number; big: boolean; children: React.ReactNode }) {
  const { dim } = useHub();
  const el = useRef<HTMLDivElement>(null);
  const last = useRef<{ key: string; top: number }>({ key: "", top: 0 });
  useLayoutEffect(() => {
    if (!el.current) return;
    if (last.current.key !== keyed) last.current = { key: keyed, top: Math.max(0, (anchorHour - 1) * HOUR_PX(big, dim.phone)) };
    el.current.scrollTop = last.current.top;
  });
  return <div ref={el} className="scroll gscroll" style={{ flex: 1, minHeight: 0 }} onScroll={e => { last.current.top = e.currentTarget.scrollTop; }}>{children}</div>;
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
            const cs = colorsOf(it.e, c.data, c.people);
            return <button key={it.e.id} className="evb" onClick={() => c.open(it.e)} style={{ position: "relative", gridColumn: `${it.a + 1}/${it.b + 2}`, gridRow: it.l + 1, height: 30, margin: "0 3px", background: tint(cs[0]), padding: "0 8px 0 24px", fontSize: 14, fontWeight: 650, lineHeight: "30px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" }}><Dots cs={cs} size={9} mid />{it.e.title}</button>;
          })}
        </div>
      </div>
      {more > 0 ? <div style={{ fontSize: 13, fontWeight: 700, color: "#5a6478", padding: `0 0 6px ${gutter}px` }}>+{more} more all day</div> : null}
    </>
  );
}

function DayHead({ days, size, gutter }: { days: Date[]; size: number; gutter: number }) {
  const { now, cal, setCal } = useHub();
  const sel = startOfDay(cal.date);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${days.length},minmax(0,1fr))`, marginLeft: gutter, padding: "2px 0 8px" }}>
      {days.map(d => {
        const today = sameDay(d, now), on = sameDay(d, sel);
        return (
          <button key={+d} aria-label={longDay(d)} onClick={() => setCal(c => ({ ...c, mode: "day", date: d }))} style={{ border: 0, background: "none", padding: 0, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: today || on ? "#101828" : "#6b7488" }}>{d.toLocaleDateString([], { weekday: "short" }).slice(0, 3).toUpperCase()}</span>
            <span className="num" style={{ width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size / 2), fontWeight: 700, ...(today ? { background: "#101828", color: "#fff" } : on && cal.mode === "day" ? { boxShadow: "inset 0 0 0 2.5px #101828" } : {}) }}>{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}

function Month({ c }: { c: Ctx }) {
  const { now, cal, dim, setCal } = useHub();
  const [first] = calRange(cal), cur = cal.date.getMonth();
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", paddingBottom: 8 }}>
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(x => <span key={x} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "#6b7488" }}>{x}</span>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gridTemplateRows: "repeat(6,minmax(0,1fr))" }}>
        {Array.from({ length: 42 }, (_, i) => {
          const day = addDays(first, i), inM = day.getMonth() === cur, today = sameDay(day, now);
          const evs = c.list.filter(e => onDay(e, day)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s);
          const keep = evs.length > 3 ? evs.slice(0, 2) : evs, more = evs.length - keep.length;
          const sz = dim.phone ? 30 : 34;
          return (
            <button key={i} className="mcell" aria-label={longDay(day)} onClick={() => setCal(x => ({ ...x, mode: "day", date: day }))} style={{ ...(i % 7 ? { borderLeft: "1px solid #edf0f5" } : {}), ...(today ? { background: "rgba(47,111,224,.06)" } : {}) }}>
              <span className="num" style={{ width: sz, height: sz, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: dim.phone ? 16 : 18, fontWeight: 700, flex: "none", ...(dim.phone ? { margin: "0 auto" } : {}), ...(today ? { background: "#101828", color: "#fff" } : inM ? {} : { color: "#8a93a6" }) }}>{day.getDate()}</span>
              {dim.phone ? (
                <span className="fx" style={{ gap: 3, flexWrap: "wrap", justifyContent: "center", paddingTop: 2 }}>{evs.slice(0, 6).map(e => <i key={e.id} style={{ width: 7, height: 7, borderRadius: "50%", background: colorsOf(e, c.data, c.people)[0], opacity: inM ? 1 : .5 }} />)}</span>
              ) : (
                <>
                  {keep.map(e => <span key={e.id} className="mchip" style={{ background: tint(colorsOf(e, c.data, c.people)[0]), ...(inM ? {} : { opacity: .55 }) }}>{e.title}</span>)}
                  {more > 0 ? <span style={{ fontSize: 13, fontWeight: 700, color: "#5a6478", paddingLeft: 4 }}>+{more} more</span> : null}
                </>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Agenda({ c }: { c: Ctx }) {
  const { cal, now, setCal } = useHub();
  const w = weekStart(startOfDay(cal.date));
  return (
    <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const day = addDays(w, i), today = sameDay(day, now);
        const evs = c.list.filter(e => onDay(e, day)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s);
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "58px 1fr", gap: 10, padding: "10px 0 4px", borderTop: "1px solid #edf0f5" }}>
            <button aria-label={longDay(day)} onClick={() => setCal(x => ({ ...x, mode: "day", date: day }))} style={{ border: 0, background: "none", padding: 0, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", alignSelf: "start", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: "#6b7488" }}>{day.toLocaleDateString([], { weekday: "short" }).toUpperCase()}</span>
              <span className="num" style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, ...(today ? { background: "#101828", color: "#fff" } : {}) }}>{day.getDate()}</span>
            </button>
            <div>
              {evs.length ? evs.map(e => {
                const cs = colorsOf(e, c.data, c.people), who = peopleOf(e, c.people).map(p => p.name).join(" · ") || calOf(e, c.data, c.people).name;
                return (
                  <button key={e.id} className="evb" onClick={() => c.open(e)} style={{ position: "relative", width: "100%", background: tint(cs[0]), padding: "8px 12px 8px 30px", marginBottom: 6 }}>
                    <Dots cs={cs} size={11} top={12} />
                    <div className="fx" style={{ justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em", minWidth: 0 }}>{e.title}</span>
                      <span className="num" style={{ fontSize: 15, fontWeight: 600, color: "#3a4358", flex: "none" }}>{e.all_day ? "All day" : fmtT(e.s, c.h24)}</span>
                    </div>
                    {who ? <div style={{ fontSize: 14, fontWeight: 600, color: "#3a4358", marginTop: 2 }}>{who}</div> : null}
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

function calTitle(cal: CalView, phone: boolean) {
  const d = cal.date, w = phone ? "short" : "long";
  if (cal.mode === "day") return d.toLocaleDateString([], { weekday: w, day: "numeric", month: w });
  if (cal.mode === "week") {
    const a = weekStart(d), b = addDays(a, 6), m = (x: Date) => x.toLocaleDateString([], { month: w });
    return a.getMonth() === b.getMonth() ? `${a.getDate()} to ${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} to ${b.getDate()} ${m(b)}`;
  }
  return d.toLocaleDateString([], { month: "long", year: phone && d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function CalendarPanel() {
  const { cal, setCal, now, dim, h24, people, openSheet, soon } = useHub();
  const P = dim.phone;
  const [from, to] = calRange(cal);
  const { data = EMPTY_EVENTS } = useEvents(from, to);
  const [nonce, setNonce] = useState(0);
  const list = data.list.filter(e => visibleTo(e, cal.who));
  const c: Ctx = {
    data, list, people, h24,
    open: async e => {
      if (DEMO) return;
      if (!e.hub) return openSheet({ mode: "view", e, cal: calOf(e, data, people) });
      try { openSheet({ mode: "event", draft: await loadEventDraft(e) }); } catch (err: any) { soon(err.message); }
    },
  };
  const d = startOfDay(cal.date);
  const step = (n: number) => setCal(x => ({ ...x, date: x.mode === "day" ? addDays(x.date, n) : x.mode === "week" ? addDays(x.date, 7 * n) : new Date(x.date.getFullYear(), x.date.getMonth() + n, 1) }));
  const weekOf = Array.from({ length: 7 }, (_, i) => addDays(weekStart(d), i));
  const key = cal.mode + ymd(cal.date) + ":" + nonce;
  const anchor = (days: Date[]) => days.some(x => sameDay(x, now)) ? now.getHours() + now.getMinutes() / 60 : 8;
  const nextEv = data.list.filter(e => visibleTo(e, cal.who) && !e.all_day && e.s > now && sameDay(e.s, now)).sort((a, b) => +a.s - +b.s)[0];
  const chip = (id: string, label: string, color?: string) => (
    <button key={id} className={"pill" + ((cal.who || "") === id ? " on" : "")} style={{ height: 40, fontSize: 15, padding: "0 16px" }} onClick={() => setCal(x => ({ ...x, who: id || null }))}>
      {color ? <i style={{ width: 10, height: 10, borderRadius: "50%", background: color }} /> : null}{label}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: (P ? "14px 14px" : "18px 18px") + " 0" }}>
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 4px 12px", gap: 12 }}>
        <div className="fx" style={{ gap: 14 }}>
          <span className="clk num" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: P ? 44 : 54, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .9, WebkitTextStroke: "1.8px #101828", paintOrder: "stroke fill" }}>{clockT(now, h24)}</span>
          <span className="cdt" style={{ fontSize: P ? 16 : 20, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1 }}>{shortDate(now)}</span>
        </div>
        <div className="fx" style={{ gap: 3, background: "#f1f4f9", borderRadius: 999, padding: 3, flex: "none" }}>
          {(["day", "week", "month"] as const).map(m => <button key={m} className={"sg big" + (cal.mode === m ? " on" : "")} onClick={() => setCal(x => ({ ...x, mode: m }))}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>
      </div>
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 0 10px", gap: 10 }}>
        <div className="fx" style={{ gap: 10, minWidth: 0 }}>
          <button className="cnav" aria-label="Back" onClick={() => step(-1)}><ChevL /></button>
          <span style={{ fontSize: P ? 21 : cal.mode === "day" ? 25 : 28, fontWeight: 700, letterSpacing: "-.04em", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{calTitle(cal, P)}</span>
          <button className="cnav" aria-label="Forward" onClick={() => step(1)}><ChevR /></button>
        </div>
        <div className="fx" style={{ gap: 8, flex: "none" }}>
          {DEMO ? null : <button className="cbtn" id="c-new" aria-label="New event" style={{ padding: "0 22px" }} onClick={() => openSheet({ mode: "event", draft: newEventDraft(startOfDay(cal.mode === "month" ? new Date() : cal.date), undefined, now, cal.who) })}>{P ? "+" : "+ New"}</button>}
          <button className="cbtn" style={{ background: "#fff", color: "#101828", border: "1.5px solid #d5dbe6" }} onClick={() => { setCal(x => ({ ...x, date: new Date() })); setNonce(n => n + 1); }}>Today</button>
        </div>
      </div>
      <div className="fx" style={{ gap: 8, padding: "0 0 10px", overflowX: "auto", scrollbarWidth: "none" }}>
        {chip("", "Everyone")}{people.map(p => chip(p.id, p.name, p.color))}
        {DEMO ? null : <button className="pill" aria-label="Add or change family members" style={{ height: 40, fontSize: 15, padding: "0 16px" }} onClick={() => openSheet({ mode: "family" })}>+ Family</button>}
      </div>
      {cal.mode === "month" ? <Month c={c} />
        : cal.mode === "week" && P ? <Agenda c={c} />
        : cal.mode === "week" ? <><DayHead days={weekOf} size={44} gutter={52} /><AllDay days={weekOf} gutter={52} c={c} /><Scroller keyed={key} anchorHour={anchor(weekOf)} big={false}><Grid days={weekOf} gutter={52} big={false} c={c} /></Scroller></>
        : <><DayHead days={weekOf} size={P ? 40 : 44} gutter={0} /><AllDay days={[d]} gutter={P ? 48 : 60} c={c} /><Scroller keyed={key} anchorHour={anchor([d])} big><Grid days={[d]} gutter={P ? 48 : 60} big c={c} /></Scroller></>}
      <div className="fx" style={{ flex: "none", height: 140, padding: "8px 4px 0", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          {nextEv ? (() => { const m = Math.round((+nextEv.s - +now) / 60000); return (
            <><div className="fx" style={{ gap: 7, fontSize: 15, fontWeight: 650, color: "#1d4ed8" }}><span className="live" style={{ width: 7, height: 7, borderRadius: "50%", background: "#1d4ed8" }} />{m < 60 ? `Next in ${m} min` : `Next at ${fmtT(nextEv.s, h24)}`}</div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nextEv.title} · {fmtT(nextEv.s, h24)}</div></>); })() : null}
        </div>
        <div className="fx legend" style={{ gap: 14, flexWrap: "wrap", justifyContent: "flex-end", maxHeight: 60, overflow: "hidden" }}>
          {[...people.map(p => [p.name, p.color]), ...Object.values(data.cals).map(x => [x.name + (x.ok ? "" : " (can't reach)"), x.color])].map(([n, col]) => <span key={n + col} className="pp" style={{ fontSize: 15 }}><i style={{ background: col }} />{n}</span>)}
        </div>
      </div>
    </div>
  );
}
