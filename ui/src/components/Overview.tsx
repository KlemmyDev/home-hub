import { useEffect, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, DEMO } from "../lib/api";
import { addDays, clockT, fmtT, hourLabel, longDay, nowZ, sameDay, weekStart } from "../lib/dates";
import { calOf, colorsOf, laneUp, onDay, peopleOf, tint, type Ev, type EvData } from "../lib/events";
import { FoodIcon, foodFor } from "../lib/foodicons";
import { Chev, DinnerIcon, PpLogo, WeatherIcon } from "../lib/icons";
import { EMPTY_EVENTS, dinnerFor, useDinners, useEnergy, useEvents } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { ChoresCard } from "./Chores";
import { Avs } from "./Calendar";

const fx = (extra?: CSSProperties): CSSProperties => ({ display: "flex", alignItems: "center", ...extra });

export function Weather() {
  const { S } = useHub();
  const { data: w } = useQuery({ queryKey: ["weather"], queryFn: () => api<any>("/api/weather"), enabled: !!S.config.weather?.connected, refetchInterval: 600000, staleTime: 300000 });
  if (!S.config.weather?.connected || !w || w.error || w.temp === undefined) return null;
  return (
    <div className="fx ovh-w" aria-label={`Weather in ${w.place}: ${w.summary}, ${w.temp} degrees`}>
      <WeatherIcon kind={w.icon} size={34} />
      <span className="num">{w.temp}° {w.summary}</span>
      {w.high != null && w.low != null ? <span className="num ovh-hl">H {w.high}° · L {w.low}°</span> : null}
    </div>
  );
}

function Greeting() {
  const { now, S, people } = useHub();
  const h24 = !!S.config.hour24;
  const mon = weekStart(now);
  const { data = EMPTY_EVENTS } = useEvents(mon, addDays(mon, 8));
  const chips = data.list.filter(e => e.all_day && onDay(e, now)).slice(0, 3);
  const g = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const ampm = h24 ? "" : now.getHours() < 12 ? "am" : "pm";
  return (
    <header className="ovh">
      <div style={{ minWidth: 0 }}>
        <div id="date" className="ovh-d">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 id="greeting" className="ovh-g">{g}</h1>
        {chips.length ? <div className="ovh-chips">{chips.map(e => <span key={e.id} className="ovh-chip"><i style={{ background: colorsOf(e, data, people)[0] }} />{e.title}</span>)}</div> : null}
      </div>
      <div className="ovh-r">
        <div id="clock" className="num ovh-c">{clockT(now, h24)}{ampm ? <small>{ampm}</small> : null}</div>
        <Weather />
      </div>
    </header>
  );
}

function DinnerCard() {
  const { people, now, dim } = useHub();
  const { data: din } = useDinners();
  const { go } = useNav();
  const t = dinnerFor(din, people, now);
  const name = DEMO ? "Spaghetti bolognese" : t ? t.name : "Nothing planned yet";
  const cook = DEMO ? { name: "Dad", color: people[0]?.color || "#2f6fe0" } : t && t.cook ? { name: t.cook, color: t.cookColor || "#8a93a6" } : null;
  const next = [1, 2, 3].map(i => { const d = addDays(now, i), n = DEMO ? ["Stir fry", "Tacos", "Fish and chips"][i - 1] : dinnerFor(din, people, d)?.name; return n ? { d, n } : null; }).filter(Boolean) as { d: Date; n: string }[];
  return (
    <button className="tile-card fx dinner" id="dinner" aria-label="Dinner tonight. Open the dinners" onClick={() => go("menu")}>
      {t || DEMO ? <FoodIcon name={name} size={72} /> : <span className="dn-none"><DinnerIcon color="#c2410c" /></span>}
      <span className="dn-m">
        <span className="dn-cap">Dinner tonight</span>
        <span className="dn">{name}</span>
        {cook ? <span className="dn-cook"><i style={{ background: cook.color }}>{cook.name.trim()[0]}</i>{cook.name} is cooking</span> : t || DEMO ? null : <span className="dn-cook">Tap to plan the week</span>}
      </span>
      {next.length && !dim.phone ? <span className="dn-next">{next.map(x => <span key={+x.d}>{x.d.toLocaleDateString([], { weekday: "short" })} <b>{x.n}</b></span>)}</span> : null}
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

/** Who has what for the next few hours: a row for each person, their events as bars along the time, the time gone shaded. */
/** The hours the ribbon shows: from the current hour, or, from 8pm on, tomorrow morning (the rest of tonight is mostly gone by then). */
export function ribbonWindow(now: Date, phone: boolean) {
  const span = phone ? 4 : 6, late = now.getHours() >= 20;
  const h0 = late ? 7 : Math.max(6, Math.min(24 - span, now.getHours()));
  const day = late ? addDays(now, 1) : now;
  const a = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h0);
  return { late, span, h0, a, b: new Date(+a + span * 3600000) };
}

function Ribbon({ data, now }: { data: EvData; now: Date }) {
  const { people, h24, dim } = useHub();
  const { openCal } = useNav();
  const { span, h0, a, b } = ribbonWindow(now, dim.phone);
  const pct = (d: Date) => Math.max(0, Math.min(100, (+d - +a) / (+b - +a) * 100));
  const timed = data.list.filter(e => !e.all_day && e.e > a && e.s < b).sort((x, y) => +x.s - +y.s);
  // A row for everyone in the family, then one for each calendar with events that name nobody.
  const rows: { key: string; name: string; color: string; evs: Ev[] }[] = people.map(p => ({ key: p.id, name: p.name, color: p.color, evs: timed.filter(e => (e.people || []).includes(p.id)) }));
  for (const e of timed.filter(e => !peopleOf(e, people).length)) {
    const c = calOf(e, data, people), key = "c:" + (e.cal || c.name);
    let r = rows.find(x => x.key === key);
    if (!r) rows.push(r = { key, name: c.name || "Family", color: c.color, evs: [] });
    r.evs.push(e);
  }
  const ticks = Array.from({ length: span + 1 }, (_, i) => h0 + i);
  const past = pct(now);
  return (
    <div className="rb" style={{ "--past": past + "%" } as CSSProperties}>
      <div className="rb-ticks">{ticks.map((h, i) => <span key={h} style={{ left: `${i / span * 100}%` }}>{hourLabel(h % 24, h24)}</span>)}</div>
      <div className="rb-rows">
        {rows.map(r => (
          <div key={r.key} className="rb-row">
            <span className="rb-who"><i style={{ background: r.color }}>{(r.name.trim()[0] || "?").toUpperCase()}</i><b>{r.name}</b></span>
            <span className="rb-track">
              {laneUp(r.evs.map(e => ({ ev: e, s: e.s < a ? a : e.s, e: e.e > b ? b : e.e }))).map(l => {
                const live = l.ev.s <= now && now < l.ev.e;
                return (
                  <button key={l.ev.id} className={"rb-bar" + (live ? " live" : "")} onClick={() => openCal("day", l.ev.s)} aria-label={`${l.ev.title}, ${fmtT(l.ev.s, h24)} to ${fmtT(l.ev.e, h24)}`}
                    style={{ left: pct(l.s) + "%", width: `calc(${pct(l.e) - pct(l.s)}% - 3px)`, top: `calc(6px + ${l.col} * (100% - 12px) / ${l.cols})`, height: `calc((100% - 12px) / ${l.cols} - ${l.cols > 1 ? 2 : 0}px)`, "--ec": r.color } as CSSProperties}>
                    {l.ev.title}
                  </button>
                );
              })}
            </span>
          </div>
        ))}
        {past > 0 && past < 100 ? <span className="rb-now" aria-hidden /> : null}
        <span className="rb-past" aria-hidden />
      </div>
    </div>
  );
}

function TodayCard() {
  const { now, people, h24, ovMode, setOvMode, dim } = useHub();
  const { openCal } = useNav();
  const mon = weekStart(now);
  const { data = EMPTY_EVENTS } = useEvents(mon, addDays(mon, 8));      // a day past the week, so Sunday night can show Monday morning
  const wk = ovMode === "week";
  const win = ribbonWindow(now, dim.phone), day = win.late ? addDays(now, 1) : now;
  const bad = Object.values(data.cals).find(c => !c.ok);
  const coming = data.list.filter(e => !e.all_day && onDay(e, day) && e.s > now).sort((x, y) => +x.s - +y.s);
  const whoOf = (e: Ev) => peopleOf(e, people).map(p => p.name).join(" and ");
  let nextTxt = "";
  if (coming.length) {
    const e = coming[0], m = Math.round((+e.s - +now) / 60000), w = whoOf(e);
    nextTxt = `${e.title}${w ? " for " + w : ""} ${m < 60 ? `in ${m} min` : "at " + fmtT(e.s, h24)}${coming[1] ? ` · then ${coming[1].title} at ${fmtT(coming[1].s, h24)}` : ""}`;
    if (win.late) nextTxt = `${e.title}${w ? " for " + w : ""} at ${fmtT(e.s, h24)}${coming[1] ? ` · then ${coming[1].title} at ${fmtT(coming[1].s, h24)}` : ""}`;
  }
  const weekCount = data.list.filter(e => { for (let i = 0; i < 7; i++) if (onDay(e, addDays(mon, i))) return true; return false; }).length;
  const any = data.list.some(e => onDay(e, day));
  return (
    <section id="today" className="tile-card tcard">
      <div className="fx" style={{ justifyContent: "space-between", gap: 10 }}>
        <div className="fx" style={{ gap: 12, alignItems: "baseline", minWidth: 0 }}>
          <h2 className="tc-h">{wk ? "This week" : win.late ? "Tomorrow" : "Today"}</h2>
          {!wk && !dim.phone ? <span className="tc-sub">{hourLabel(win.h0, h24)} to {hourLabel((win.h0 + win.span) % 24, h24)}</span> : null}
        </div>
        <div className="fx" style={{ gap: 8 }}>
          <div className="seg2">
            <button className={wk ? "" : "on"} onClick={() => setOvMode("day")}>Day</button>
            <button className={wk ? "on" : ""} onClick={() => setOvMode("week")}>Week</button>
          </div>
          <button className="tc-open fx" onClick={() => openCal(wk ? "week" : "day", nowZ())}>{dim.phone ? "Open" : "Open calendar"}<Chev /></button>
        </div>
      </div>
      {wk ? <div style={{ marginTop: 14 }}><WeekColumns data={data} mon={mon} now={now} people={people} /></div>
        : people.length || data.list.some(e => onDay(e, day) && !e.all_day) ? <Ribbon data={data} now={now} />
        : null}
      {wk ? null : (
        <div className={"tc-next" + (bad ? " bad" : nextTxt ? "" : " quiet")}>
          {bad ? <span>Can't reach {bad.name}</span>
            : nextTxt ? <><b>{win.late ? "First up" : "Next up"}</b><span>{nextTxt}</span></>
            : <span>{win.late ? (any ? "Nothing timed tomorrow" : "Nothing on tomorrow yet") : any ? "That's everything for today" : "Nothing on today. Open the calendar to add something."}</span>}
        </div>
      )}
      {wk ? <div className="tc-next quiet"><span>{weekCount ? `${weekCount} on this week` : "A quiet week"}</span></div> : null}
    </section>
  );
}

/* The two app cards are slim: the app's mark, its name and whether it answers. Tap to open it. */
function Status({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["status"], queryFn: () => api<Record<string, boolean>>("/api/status"), refetchInterval: 30000 });
  const up = data ? !!data[id] : undefined;
  return <span className="stat" data-up={up === undefined ? undefined : up ? "1" : "0"}><span className="sd" /><span>{up === undefined ? "Checking…" : up ? "Ready" : "Can't reach it"}</span></span>;
}
/**
 * The house's power right now and today's totals, from WattsMyPower (when it's connected and its key may read live
 * power): a white card like the others, with WattsMyPower's own colours on its four tiles (amber solar, blue battery).
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
  const tiles: { id: string; label: string; value: string; unit: string; note: string }[] = [
    { id: "solar", label: "Solar", value: kw(pv), unit: "kW", note: `${kwh(p.daily_pv)} kWh today` },
    { id: "home", label: "Home", value: kw(p.load_power), unit: "kW", note: "using now" },
    { id: using ? "battery use" : "battery", label: "Battery", value: String(Math.round(soc)), unit: "%", note: charging ? `↑ charging ${kw(bat)} kW` : using ? `↓ using ${kw(bat)} kW` : "resting" },
    { id: grid < -ON ? "grid sell" : "grid", label: "Grid", value: kw(grid), unit: "kW", note: grid > ON ? "buying" : grid < -ON ? "selling" : "not used" },
  ];
  const totals: [string, string][] = [["Made", `${kwh(p.daily_pv)} kWh`], ["Bought", `${kwh(p.daily_import)} kWh`], ["Sold", `${kwh(p.daily_export)} kWh`]];
  if (costs?.net_cost !== undefined && costs?.net_cost !== null) totals.push([costs.net_cost < 0 ? "Credit" : "Bill", money(costs.net_cost)]);
  return (
    <a className="tile-card wm" href={wm?.url} aria-label={`Energy: solar ${kw(pv)} kW, home ${kw(p.load_power)} kW, battery ${Math.round(soc)}%. Open WattsMyPower`}>
      <div className="wm-head">
        <span className="wm-mark"><svg width="17" height="17" viewBox="0 0 24 24" fill="#ffb547" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg></span>
        <b className="wm-t">Energy</b>
        <span className="wm-live"><i />Live</span>
        <span style={{ flex: 1 }} />
        {costs ? <span className="wm-save">Saved {money(costs.saved)} today</span> : null}
      </div>
      <div className="wm-tiles">
        {tiles.map(x => (
          <div key={x.label} className={"wm-tile " + x.id}>
            <small><i />{x.label}</small>
            <b className="num">{x.value}<em>{x.unit}</em></b>
            <span>{x.note}</span>
            {x.label === "Battery" ? <span className="wm-bat"><i style={{ width: soc + "%" }} /></span> : null}
          </div>
        ))}
      </div>
      <div className="wm-foot">{totals.map(([l, v]) => <span key={l}>{l} <b className="num">{v}</b></span>)}</div>
    </a>
  );
}

function WidgetCards() {
  const { S } = useHub();
  const ws = S.config.widgets.filter(w => w.id === "pocketpals" || w.id === "wattsmypower");
  if (!ws.length) return (
    <div className="tile-card" style={{ padding: 22, textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>No apps added yet</div>
      <div style={{ fontSize: 17, color: "var(--soft)", marginTop: 6 }}>Open Settings in the menu below to add PocketPals or WattsMyPower.</div>
    </div>
  );
  return (
    <div className="wgrid" style={{ display: "grid", gridTemplateColumns: `repeat(${ws.length},minmax(0,1fr))`, gap: 12 }}>
      {ws.map(w => (
        <a key={w.id} href={w.url} aria-label={"Open " + (w.id === "pocketpals" ? "PocketPals" : "WattsMyPower")} className="appcard">
          {w.id === "pocketpals" ? <PpLogo /> : <span className="appmark"><svg width="18" height="18" viewBox="0 0 24 24" fill="#ffb547" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg></span>}
          <span className="appname"><b>{w.id === "pocketpals" ? "PocketPals" : "WattsMyPower"}</b><Status id={w.id} /></span>
          <Chev />
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
