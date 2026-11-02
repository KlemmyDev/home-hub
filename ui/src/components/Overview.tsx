import { useEffect, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, DEMO } from "../lib/api";
import { addDays, clockT, fmtT, longDay, nowZ, sameDay, startOfDay, weekStart } from "../lib/dates";
import { calOf, colorsOf, onDay, peopleOf, tint, type Ev, type EvData } from "../lib/events";
import { FoodIcon, foodFor } from "../lib/foodicons";
import { Chev, DinnerIcon, PpLogo, WeatherIcon } from "../lib/icons";
import { EMPTY_EVENTS, dinnerFor, useDinners, useEnergy, useEvents } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { ChoresCard } from "./Chores";
import { Avs } from "./Calendar";

const fx = (extra?: CSSProperties): CSSProperties => ({ display: "flex", alignItems: "center", ...extra });

function Weather() {
  const { S } = useHub();
  const { data: w } = useQuery({ queryKey: ["weather"], queryFn: () => api<any>("/api/weather"), enabled: !!S.config.weather?.connected, refetchInterval: 600000, staleTime: 300000 });
  if (!S.config.weather?.connected || !w || w.error || w.temp === undefined) return null;
  return (
    <div className="fx" aria-label={`Weather in ${w.place}: ${w.summary}, ${w.temp} degrees`} style={{ gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
      <WeatherIcon kind={w.icon} size={44} />
      <div style={{ textAlign: "right" }}>
        <div className="fx" style={{ gap: 8, justifyContent: "flex-end", alignItems: "baseline" }}>
          <span className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1 }}>{w.temp}°</span>
          <span style={{ fontSize: 19, fontWeight: 600, color: "#3a4358" }}>{w.summary}</span>
        </div>
        {w.high != null && w.low != null ? <div className="num" style={{ fontSize: 15, fontWeight: 600, color: "#6b7488", marginTop: 3 }}>H {w.high}° · L {w.low}°</div> : null}
      </div>
    </div>
  );
}

function Greeting() {
  const { now, S } = useHub();
  const g = now.getHours() < 12 ? "Good morning!" : now.getHours() < 17 ? "Good afternoon!" : "Good evening!";
  const [a, b] = g.split(" ");
  return (
    <div className="fx" style={{ justifyContent: "space-between", alignItems: "flex-end", padding: "0 8px" }}>
      <div>
        <div id="date" className="cap">{now.toLocaleDateString([], { weekday: "long" }) + " · " + now.toLocaleDateString([], { day: "numeric", month: "long" })}</div>
        <div id="greeting" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: b.length > 8 ? 56 : 66, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1.04, marginTop: 12 }}>{a}<br />{b}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div id="clock" className="num clk" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: 128, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .88, WebkitTextStroke: "4px #101828", paintOrder: "stroke fill" }}>{clockT(now, !!S.config.hour24)}</div>
        <Weather />
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
  const bg = t || DEMO ? foodFor(name).bg : "#ffeadf", ink = `color-mix(in srgb, ${bg}, #000 62%)`;      // the banner wears the colour of tonight's dinner
  return (
    <button className="tile-card fx dinner" id="dinner" aria-label="Dinner tonight. Open the dinners" onClick={() => go("menu")}
      style={{ gap: 18, padding: "18px 26px 18px 18px", background: bg, transition: "background-color .5s ease", border: 0, minHeight: 0, width: "100%", textAlign: "left", color: "inherit", borderRadius: 30 }}>
      {t || DEMO ? <FoodIcon name={DEMO ? "Spaghetti bolognese" : t!.name} size={64} style={{ background: "#fff" }} /> : <div style={{ width: 64, height: 64, borderRadius: 20, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><DinnerIcon color="#c2410c" /></div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="cap" style={{ color: ink }}>Dinner tonight</div>
        <div className="dn" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1.08, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</div>
        {t || DEMO ? null : <div style={{ fontSize: 16, fontWeight: 600, color: ink, marginTop: 3 }}>Tap to plan the week</div>}
      </div>
      {sub ? <div style={{ textAlign: "right", fontSize: 17, fontWeight: 600, color: ink, flex: "none" }}>{sub}</div> : null}
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
          {nextTxt && !wk ? <span className="fx" style={{ gap: 7, fontSize: 15, fontWeight: 600, color: "var(--hub-text)" }}><span className="live" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--hub-text)" }} />{nextTxt}</span> : null}
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
            <div className="otl" style={{ marginTop: 6 }}>
              {shown.map((e, i) => {
                const c = calOf(e, data, people), ps = peopleOf(e, people), color = colorsOf(e, data, people)[0], live = !e.all_day && e.s <= now, next = i === 0 && !e.all_day;
                const sub = [ps.map(p => p.name).join(" and ") || c.name, e.location].filter(Boolean).join(" · ");
                return (
                  <button key={e.id} className={"orow" + (live ? " live" : next ? " next" : "")} style={{ "--ec": color } as CSSProperties} onClick={() => openCal("day", e.s)} aria-label={`${e.title}, ${e.all_day ? "all day" : fmtT(e.s, h24)}`}>
                    <span className="ot num">{e.all_day ? "All day" : live ? "Now" : fmtT(e.s, h24)}</span>
                    <span className="orail" aria-hidden><i /></span>
                    <span className="ocard">
                      <span className="om"><b>{e.title}</b>{sub ? <small>{sub}</small> : null}</span>
                      <Avs ps={ps} size={34} max={3} />
                    </span>
                  </button>
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
        <button className="fx" onClick={() => openCal(wk ? "week" : "day", nowZ())} style={{ gap: 6, flex: "none", height: 48, minHeight: 0, padding: "0 18px", borderRadius: 999, border: 0, background: "#101828", color: "#fff", fontSize: 16, fontWeight: 650 }}>Open calendar<Chev /></button>
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
/* WattsMyPower's line icons (Lucide), for the Energy card. */
const WM_ICONS: Record<string, string[]> = {
  solar: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
  battery: ["M4 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z", "M22 11v2", "M11 9.5 8.5 12h3L9 14.5"],
  home: ["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  grid: ["M12 2v20", "M2 5h20", "M3 3v2", "M7 3v2", "M17 3v2", "M21 3v2", "m19 5-7 7-7-7"],
};
const WmIcon = ({ name }: { name: string }) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{WM_ICONS[name].map(d => <path key={d} d={d} />)}</svg>;

/**
 * The house's power right now and today's totals, from WattsMyPower (when it's connected and its key may read live
 * power), dressed as WattsMyPower itself: dark, Geist figures, Nunito heading, amber solar and blue battery. Solar,
 * the battery, the home and the grid sit on one wire, each lit while in use, with sparks running the way the power goes.
 */
function EnergyCard() {
  const { S } = useHub();
  const wm = S.config.wattsmypower;
  const { data: t } = useEnergy("today", "", DEMO || !!wm?.connected);
  const e = t?.data, p = e?.live?.snapshot, costs = e?.costs;
  if (!(DEMO || wm?.connected) || !t?.allowed || !p) return null;
  const ON = 50, kw = (w?: number) => (Math.abs(w ?? 0) / 1000).toFixed(1), kwh = (n?: number) => (n ?? 0).toFixed(1);
  const pv = p.pv_power ?? 0, bat = p.battery_power ?? 0, grid = p.grid_power ?? 0, soc = Math.max(0, Math.min(100, p.battery_soc ?? 0));
  const money = (n?: number) => n === undefined || n === null ? "" : `$${Math.abs(n).toFixed(2)}`;
  const charging = bat < -ON, using = bat > ON;
  type Node = { id: string; label: string; value: string; unit: string; note: string; on: boolean; color: string };
  const nodes: Node[] = [
    { id: "solar", label: "Solar", value: kw(pv), unit: "kW", note: `${kwh(p.daily_pv)} kWh today`, on: pv > ON, color: "#ffb547" },
    { id: "battery", label: "Battery", value: String(Math.round(soc)), unit: "%", note: charging ? `↑ charging ${kw(bat)} kW` : using ? `↓ using ${kw(bat)} kW` : "resting", on: charging || using, color: using ? "#ffc777" : "#8fa6ff" },
    { id: "home", label: "Home", value: kw(p.load_power), unit: "kW", note: "using now", on: true, color: "#f5f5f5" },
    { id: "grid", label: "Grid", value: kw(grid), unit: "kW", note: grid > ON ? "buying" : grid < -ON ? "selling" : "not used", on: Math.abs(grid) > ON, color: grid < -ON ? "#f2a65a" : "#b4b4bc" },
  ];
  // The wire between each pair: lit while power runs along it, and which way (rev runs right to left).
  const wires = [
    { on: pv > ON, rev: false, color: "#ffb547" },
    { on: pv > ON || using, rev: charging && pv <= ON, color: using ? "#ffc777" : "#ffb547" },
    { on: Math.abs(grid) > ON, rev: grid > ON, color: grid < -ON ? "#f2a65a" : "#9aa4ff" },
  ];
  const head = costs ? <><b className="wm-good">{money(costs.saved)}</b><span>saved today</span></> : <><b>{kwh(p.daily_pv)}<i>kWh</i></b><span>made today</span></>;
  const totals: [string, string][] = [["Made", `${kwh(p.daily_pv)} kWh`], ["Bought", `${kwh(p.daily_import)} kWh`], ["Sold", `${kwh(p.daily_export)} kWh`]];
  if (costs?.net_cost !== undefined && costs?.net_cost !== null) totals.push([costs.net_cost < 0 ? "Credit" : "Bill", money(costs.net_cost)]);
  return (
    <a className="tile-card wm" href={wm?.url} aria-label={`Energy: solar ${kw(pv)} kW, home ${kw(p.load_power)} kW, battery ${Math.round(soc)}%. Open WattsMyPower`}>
      <div className="wm-head">
        <span className="wm-mark"><svg width="20" height="20" viewBox="0 0 24 24" fill="#ffb547" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg></span>
        <div className="wm-title"><b>Energy</b><span><i className="wm-live" />Live from Watts<em>My</em>Power</span></div>
        <div className="wm-sum">{head}</div>
      </div>
      <div className="wm-flow">
        {wires.map((w, i) => <i key={i} className={"wm-wire" + (w.on ? " on" : "") + (w.rev ? " rev" : "")} style={{ "--i": i, "--wc": w.color } as CSSProperties} />)}
        {nodes.map(n => (
          <div key={n.id} className={"wm-node" + (n.on ? " on" : "")} style={{ "--nc": n.color } as CSSProperties}>
            <span className="wm-dot" style={n.id === "battery" ? { "--soc": `${soc * 3.6}deg` } as CSSProperties : undefined}>{n.id === "battery" && <i className="wm-ring" />}<WmIcon name={n.id} /></span>
            <small>{n.label}</small>
            <b className="num">{n.value}<i>{n.unit}</i></b>
            <span>{n.note}</span>
          </div>
        ))}
      </div>
      <div className="wm-foot">{totals.map(([l, v]) => <span key={l}><small>{l}</small>{v}</span>)}</div>
    </a>
  );
}

function WidgetCards() {
  const { S } = useHub();
  const ws = S.config.widgets.filter(w => w.id === "pocketpals" || w.id === "wattsmypower");
  if (!ws.length) return (
    <div className="tile-card" style={{ padding: 22, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.03em" }}>No apps added yet</div>
      <div style={{ fontSize: 19, color: "#6b7488", marginTop: 6 }}>Open Settings in the menu below to add PocketPals or WattsMyPower.</div>
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
        <EnergyCard />
        <WidgetCards />
      </div>
    </div>
  );
}
