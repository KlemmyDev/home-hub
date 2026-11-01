import { useEffect, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, DEMO } from "../lib/api";
import { addDays, fmtT, clockT, longDay, sameDay, startOfDay, weekStart } from "../lib/dates";
import { calOf, colorsOf, onDay, tint, type Ev, type EvData } from "../lib/events";
import { Chev, DinnerIcon, Gear, PpLogo } from "../lib/icons";
import { EMPTY_EVENTS, dinnerFor, useDinners, useEvents } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { ChoresCard } from "./Chores";

const fx = (extra?: CSSProperties): CSSProperties => ({ display: "flex", alignItems: "center", ...extra });

function Greeting() {
  const { now, S } = useHub();
  const g = now.getHours() < 12 ? "Good morning!" : now.getHours() < 17 ? "Good afternoon!" : "Good evening!";
  const [a, b] = g.split(" ");
  const { go } = useNav();
  return (
    <div className="fx" style={{ justifyContent: "space-between", alignItems: "flex-end", padding: "0 8px" }}>
      <div>
        <div id="date" className="cap">{now.toLocaleDateString([], { weekday: "long" }) + " · " + now.toLocaleDateString([], { day: "numeric", month: "long" })}</div>
        <div id="greeting" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: b.length > 8 ? 56 : 66, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1.04, marginTop: 12 }}>{a}<br />{b}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div id="clock" className="num clk" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: 128, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .88, WebkitTextStroke: "4px #101828", paintOrder: "stroke fill" }}>{clockT(now, !!S.config.hour24)}</div>
        <div className="fx" style={{ gap: 12, justifyContent: "flex-end", marginTop: 14 }}>
          <span style={{ fontSize: 19, fontWeight: 600, color: "#3a4358" }}>{S.config.name}</span>
          <button className="gear" id="gear" aria-label="Settings" onClick={() => go("settings")}><Gear /></button>
        </div>
      </div>
    </div>
  );
}

function DinnerCard() {
  const { people, now } = useHub();
  const { data: din } = useDinners();
  const { go } = useNav();
  const t = dinnerFor(din, people, now);
  const name = DEMO ? "Spaghetti bolognese" : t ? t.name : "Nothing planned yet";
  const sub = DEMO ? "Dad cooking" : t && t.cook ? t.cook + " cooking" : "";
  return (
    <button className="tile-card fx dinner" id="dinner" aria-label="Dinner tonight. Open the dinners" onClick={() => go("menu")}
      style={{ gap: 18, padding: "18px 26px 18px 18px", background: "#ffeadf", border: 0, minHeight: 0, width: "100%", textAlign: "left", color: "inherit", borderRadius: 30 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><DinnerIcon color="#c2410c" /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cap" style={{ color: "#9a4a1e" }}>Dinner tonight</div>
        <div className="dn" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1.08, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</div>
        {t || DEMO ? null : <div style={{ fontSize: 16, fontWeight: 600, color: "#9a4a1e", marginTop: 3 }}>Tap to plan the week</div>}
      </div>
      {sub ? <div style={{ textAlign: "right", fontSize: 17, fontWeight: 600, color: "#9a4a1e", flex: "none" }}>{sub}</div> : null}
    </button>
  );
}

function WeekColumns({ data, mon, now, people }: { data: EvData; mon: Date; now: Date; people: any[] }) {
  const { h24, dim } = useHub();
  const { openCal } = useNav();
  const max = 4;
  const wc = useRef<HTMLDivElement>(null), td = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (wc.current && td.current && dim.phone) wc.current.scrollLeft = Math.max(0, td.current.offsetLeft - 8); }, [dim.phone]);
  return (
    <div className="wcols" ref={wc}>
      {Array.from({ length: 7 }, (_, i) => {
        const day = addDays(mon, i), today = sameDay(day, now);
        const evs = data.list.filter(e => onDay(e, day)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s);
        return (
          <button key={i} ref={today ? td : undefined} className={"wcol" + (today ? " today" : "")} aria-label={longDay(day)} onClick={() => openCal("day", day)}>
            <span className="fx" style={{ flexDirection: "column", gap: 2, paddingBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: today ? "#101828" : "#6b7488" }}>{day.toLocaleDateString([], { weekday: "short" }).toUpperCase()}</span>
              <span className="num fx" style={{ width: 38, height: 38, borderRadius: "50%", justifyContent: "center", fontSize: 20, fontWeight: 700, ...(today ? { background: "#101828", color: "#fff" } : {}) }}>{day.getDate()}</span>
            </span>
            {evs.slice(0, max).map(e => (
              <span key={e.id} className="wchip" style={{ background: tint(colorsOf(e, data, people)[0]) }}>
                {e.all_day ? null : <span className="tm num">{fmtT(e.s, h24)}</span>}{e.title}
              </span>
            ))}
            {evs.length > max ? <span style={{ fontSize: 14, fontWeight: 700, color: "#5a6478", textAlign: "center" }}>+{evs.length - max} more</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function TodayCard() {
  const { now, people, h24, ovMode, setOvMode, dim } = useHub();
  const { openCal } = useNav();
  const mon = weekStart(now);
  const { data = EMPTY_EVENTS } = useEvents(mon, addDays(mon, 7));
  const strip = ["M", "T", "W", "T", "F", "S", "S"];
  const todays = data.list.filter(e => onDay(e, now) && (e.all_day || e.e > now || (+e.e === +e.s && e.s >= now)));
  const shown = todays.slice(0, 3), rest = todays.slice(3);
  const bad = Object.values(data.cals).find(c => !c.ok);
  const next = todays.find(e => !e.all_day && e.s > now);
  let nextTxt = "";
  if (next) { const m = Math.round((+next.s - +now) / 60000); nextTxt = m < 60 ? `Next in ${m} min` : `Next at ${fmtT(next.s, h24)}`; }
  const wk = ovMode === "week";
  const weekCount = data.list.filter(e => { for (let i = 0; i < 7; i++) if (onDay(e, addDays(mon, i))) return true; return false; }).length;
  const later = shown.length
    ? (rest.length ? `Later: ${rest[0].title}${rest[0].all_day ? "" : " " + fmtT(rest[0].s, h24)}${rest.length > 1 ? ` and ${rest.length - 1} more` : ""}` : "That's everything for today")
    : "";
  const dots = (day: Date) => { const cs: string[] = []; for (const e of data.list) if (onDay(e, day)) { const c = calOf(e, data, people).color; if (!cs.includes(c)) cs.push(c); } return cs.slice(0, 3); };
  const [h, p] = data.list.some(e => onDay(e, now)) ? ["All done for today", "Nothing else on."] : ["Nothing on today", "Open the calendar to add something."];
  return (
    <section id="today" className="tile-card" style={{ padding: "22px 26px 16px" }}>
      <div className="fx" style={{ justifyContent: "space-between" }}>
        <div className="fx" style={{ gap: 12, alignItems: "baseline" }}>
          <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-.04em" }}>{wk ? "This week" : "Today"}</span>
          {nextTxt && !wk ? <span className="fx" style={{ gap: 7, fontSize: 15, fontWeight: 600, color: "#1d4ed8" }}><span className="live" style={{ width: 7, height: 7, borderRadius: "50%", background: "#1d4ed8" }} />{nextTxt}</span> : null}
        </div>
        <div className="fx" style={{ gap: 3, background: "#f1f4f9", borderRadius: 999, padding: 3 }}>
          <button className={"sg" + (wk ? "" : " on")} onClick={() => setOvMode("day")}>Day</button>
          <button className={"sg" + (wk ? " on" : "")} onClick={() => setOvMode("week")}>Week</button>
        </div>
      </div>
      {wk ? <div style={{ marginTop: 8 }}><WeekColumns data={data} mon={mon} now={now} people={people} /></div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2, marginTop: 14, paddingBottom: 12, borderBottom: "1px solid #edf0f5" }}>
            {strip.map((w, i) => {
              const day = addDays(mon, i), today = sameDay(day, now);
              return (
                <button key={i} className="wd" style={{ border: 0, background: "none", borderRadius: 0 }} aria-label={longDay(day)} onClick={() => openCal("day", day)}>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", color: today ? "#101828" : "#8a93a6" }}>{w}</span>
                  <span className="num fx" style={{ width: 44, height: 44, borderRadius: "50%", justifyContent: "center", fontSize: 21, fontWeight: 700, ...(today ? { background: "#101828", color: "#fff" } : { color: i >= 5 ? "#8a93a6" : "#101828" }) }}>{day.getDate()}</span>
                  <span className="fx" style={{ gap: 4, height: 6 }}>{dots(day).map(c => <i key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />)}</span>
                </button>
              );
            })}
          </div>
          {shown.length ? (
            <div style={{ position: "relative", marginTop: 2 }}>
              <div style={{ position: "absolute", left: "var(--tl,105px)", top: 36, bottom: 36, borderLeft: "2px solid #e4e8f0" }} />
              {shown.map((e, i) => {
                const c = calOf(e, data, people), first = i === 0 && !e.all_day;
                return (
                  <div className="tl" key={e.id}>
                    <span className="t num" style={first ? { color: "#1d4ed8" } : undefined}>{e.all_day ? <span style={{ fontSize: 16 }}>All day</span> : fmtT(e.s, h24)}</span>
                    <span className="dotm" style={{ background: first ? "#1d4ed8" : c.color }} />
                    <span className="n">{e.title}</span>
                    {c.name ? <span className="pp"><i style={{ background: c.color }} />{c.name}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "34px 0 30px", textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{h}</div>
              <div style={{ fontSize: 18, color: "#6b7488", marginTop: 6 }}>{p}</div>
            </div>
          )}
        </>
      )}
      <div className="fx" style={{ justifyContent: "space-between", gap: 14, borderTop: "1px solid #edf0f5", paddingTop: 12, marginTop: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 500, color: bad ? "#b3321f" : "#6b7488", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {bad ? "Can't reach " + bad.name : wk ? (weekCount ? `${weekCount} on this week` : "A quiet week") : later}
        </span>
        <button className="fx" onClick={() => openCal(wk ? "week" : "day", new Date())} style={{ gap: 6, flex: "none", height: 44, minHeight: 0, padding: "0 18px", borderRadius: 999, border: 0, background: "#101828", color: "#fff", fontSize: 16, fontWeight: 650 }}>Open calendar<Chev /></button>
      </div>
    </section>
  );
}

/* The two app cards are slim: the app's mark, its name and whether it answers. Tap to open it. */
function Status({ id, color }: { id: string; color: string }) {
  const { data } = useQuery({ queryKey: ["status"], queryFn: () => api<Record<string, boolean>>("/api/status"), refetchInterval: 30000 });
  const up = data ? !!data[id] : undefined;
  return <span className="stat" data-up={up === undefined ? undefined : up ? "1" : "0"} style={{ color, marginTop: 3 }}><span className="sd" /><span>{up === undefined ? "Checking…" : up ? "Ready" : "Can't reach it"}</span></span>;
}
function WidgetCards() {
  const { S } = useHub();
  const ws = S.config.widgets.filter(w => w.id === "pocketpals" || w.id === "wattsmypower");
  if (!ws.length) return (
    <div className="tile-card" style={{ padding: 22, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.03em" }}>No apps added yet</div>
      <div style={{ fontSize: 19, color: "#6b7488", marginTop: 6 }}>Tap the cog to add PocketPals or WattsMyPower.</div>
    </div>
  );
  return (
    <div className="wgrid" style={{ display: "grid", gridTemplateColumns: `repeat(${S.config.widgets.length},minmax(0,1fr))`, gap: 10 }}>
      {ws.map(w => w.id === "pocketpals" ? (
        <a key={w.id} href={w.url} aria-label="Open PocketPals" className="pane cpane" style={{ background: "linear-gradient(165deg,#7a5cff 0%,#4326c9 100%)", color: "#fff", fontFamily: "'Figtree',sans-serif" }}>
          <PpLogo />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1 }}>PocketPals</div><Status id="pocketpals" color="#e3dcff" /></div><Chev />
        </a>
      ) : (
        <a key={w.id} href={w.url} aria-label="Open WattsMyPower" className="pane cpane" style={{ background: "linear-gradient(180deg,#171717,#0b0b0b)", border: "1px solid rgba(255,255,255,.1)", color: "#f5f5f5", fontFamily: "'Geist',sans-serif" }}>
          <span style={{ width: 34, height: 34, borderRadius: 11, background: "linear-gradient(160deg,#262626,#121212)", border: "1px solid rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="#ffb547" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg></span>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: "'Nunito',sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.1, whiteSpace: "nowrap" }}>Watts<span style={{ color: "#ffb547" }}>My</span>Power</div><Status id="wattsmypower" color="#c9c9c9" /></div><Chev />
        </a>
      ))}
    </div>
  );
}

export function Overview({ away }: { away: boolean }) {
  return (
    <div id="ov" className={"ov" + (away ? " away" : "")}>
      <Greeting />
      <div id="body" style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1, minHeight: 0 }}>
        <DinnerCard />
        <TodayCard />
        <ChoresCard />
        <WidgetCards />
      </div>
    </div>
  );
}
