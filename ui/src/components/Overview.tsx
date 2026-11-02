import { useEffect, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, DEMO } from "../lib/api";
import { addDays, clockT, fmtT, hourLabel, longDay, nowZ, sameDay, weekStart } from "../lib/dates";
import { calOf, colorsOf, laneUp, onDay, peopleOf, tint, type Ev, type EvData } from "../lib/events";
import { FoodIcon, foodFor } from "../lib/foodicons";
import { Chev, DinnerIcon, PpLogo, WeatherIcon } from "../lib/icons";
import { EMPTY_EVENTS, dinnerFor, useDinners, useEvents } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { ChoresCard } from "./Chores";
import { EnergyCard } from "./Energy";
import { Avs } from "./Calendar";
import { Ava } from "./Ava";

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

/** The ribbon's six hours: from the start of the current hour, running past midnight in the evening. */
function ribbonWindow(now: Date) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  return { a, b: new Date(+a + 6 * 3600000), h0: now.getHours() };
}
const partOfDay = (h: number) => h < 12 ? "This morning" : h < 17 ? "This afternoon" : "This evening";
/** A time as short as it reads: 7am, 3:45pm (or 07:00, 15:45). */
const shortT = (d: Date, h24: boolean) => fmtT(d, h24).replace(/:00(?=[ap]m)/, "");

/**
 * The time ribbon: six hours from now, a row for each person (and one for each calendar whose events name nobody), their
 * events as soft bars in their colour, the time already gone hatched behind a red now line. It's always drawn, events or not.
 */
function Ribbon({ data, now }: { data: EvData; now: Date }) {
  const { people, h24 } = useHub();
  const { openCal } = useNav();
  const { a, b, h0 } = ribbonWindow(now);
  const pct = (d: Date) => Math.max(0, Math.min(100, (+d - +a) / (+b - +a) * 100));
  const timed = data.list.filter(e => !e.all_day && e.e > a && e.s < b).sort((x, y) => +x.s - +y.s);
  const rows: { key: string; name: string; color: string; pal?: string; evs: Ev[] }[] = people.map(p => ({ key: p.id, name: p.name, color: p.color, pal: p.pal, evs: timed.filter(e => (e.people || []).includes(p.id)) }));
  for (const e of timed.filter(e => !peopleOf(e, people).length)) {
    const c = calOf(e, data, people), key = "c:" + (e.cal || c.name);
    let r = rows.find(x => x.key === key);
    if (!r) rows.push(r = { key, name: c.name || "Family", color: c.color, evs: [] });
    r.evs.push(e);
  }
  if (!rows.length) rows.push({ key: "all", name: "Family", color: "#8a93a6", evs: [] });
  const ticks = Array.from({ length: 7 }, (_, i) => ({ h: (h0 + i) % 24, left: i === 0 ? 3 : i === 6 ? 96 : i / 6 * 100 }));
  return (
    <div className="rb" style={{ "--past": (pct(now) / 100).toFixed(4) } as CSSProperties}>
      <div className="rb-ticks">{ticks.map(t => <span key={t.left} style={{ left: t.left + "%" }}>{hourLabel(t.h, h24)}</span>)}</div>
      <div className="rb-rows">
        {rows.map(r => (
          <div key={r.key} className="rb-row" style={{ "--ec": r.color } as CSSProperties}>
            <span className="rb-who"><Ava p={r} size={36} /><b>{r.name}</b></span>
            <span className="rb-track">
              {laneUp(r.evs.map(e => ({ ev: e, s: e.s < a ? a : e.s, e: e.e > b ? b : e.e }))).map(l => (
                <button key={l.ev.id} className={"rb-bar" + (l.ev.s <= now && now < l.ev.e ? " live" : "")} onClick={() => openCal("day", l.ev.s)} aria-label={`${l.ev.title}, ${fmtT(l.ev.s, h24)} to ${fmtT(l.ev.e, h24)}`}
                  style={{ left: pct(l.s) + "%", width: `calc(${pct(l.e) - pct(l.s)}% - 2px)`, top: `calc(8px + ${l.col} * (100% - 16px) / ${l.cols})`, height: `calc((100% - 16px) / ${l.cols} - ${l.cols > 1 ? 2 : 0}px)` }}>
                  <span>{l.ev.title}</span>
                </button>
              ))}
            </span>
          </div>
        ))}
        <span className="rb-past" aria-hidden />
        <span className="rb-now" aria-hidden />
      </div>
    </div>
  );
}

function TodayCard() {
  const { now, people, h24 } = useHub();
  const { openCal } = useNav();
  const mon = weekStart(now);
  const { data = EMPTY_EVENTS } = useEvents(mon, addDays(mon, 8));      // a day past the week, so Sunday can show Monday
  const { h0, b } = ribbonWindow(now);
  const bad = Object.values(data.cals).find(c => !c.ok);
  const whoOf = (e: Ev) => peopleOf(e, people).map(p => p.name).join(" and ");
  const coming = data.list.filter(e => !e.all_day && e.s > now && onDay(e, now)).sort((x, y) => +x.s - +y.s);
  let next = "";
  if (coming.length) {
    const e = coming[0], m = Math.round((+e.s - +now) / 60000), w = whoOf(e);
    next = `${e.title}${w ? " for " + w : ""} ${m < 60 ? `in ${m} min` : "at " + shortT(e.s, h24)}${coming[1] ? ` · then ${coming[1].title} at ${shortT(coming[1].s, h24)}` : ""}`;
  }
  const tmr = addDays(now, 1);
  const tmrEvs = data.list.filter(e => onDay(e, tmr)).sort((x, y) => (+y.all_day - +x.all_day) || +x.s - +y.s);
  const tmrTxt = tmrEvs.slice(0, 3).map(e => e.all_day ? e.title : `${e.title} ${shortT(e.s, h24)}`).join(" · ") + (tmrEvs.length > 3 ? ` · and ${tmrEvs.length - 3} more` : "");
  return (
    <section id="today" className="tile-card tcard">
      <div className="tc-top">
        <div className="tc-hd">
          <h2 className="tc-h">Today</h2>
          <span className="tc-sub">{partOfDay(h0)}, {hourLabel(h0, h24)} to {hourLabel(b.getHours(), h24)}</span>
        </div>
        <button className="tc-open" onClick={() => openCal("day", nowZ())}>Open calendar<Chev /></button>
      </div>
      <Ribbon data={data} now={now} />
      <div className={"tc-next" + (bad ? " bad" : "")}>
        {bad ? <span>Can't reach {bad.name}</span>
          : next ? <><b>Next up</b><span>{next}</span></>
          : <><b>Next up</b><span>Nothing else on today</span></>}
      </div>
      <div className="tc-tmr"><b>Tomorrow</b><span>{tmrEvs.length ? tmrTxt : "Nothing on yet"}</span></div>
    </section>
  );
}

/* The two app cards are slim: the app's mark, its name and whether it answers. Tap to open it. */
function Status({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["status"], queryFn: () => api<Record<string, boolean>>("/api/status"), refetchInterval: 30000 });
  const up = data ? !!data[id] : undefined;
  return <span className="stat" data-up={up === undefined ? undefined : up ? "1" : "0"}><span className="sd" /><span>{up === undefined ? "Checking…" : up ? "Ready" : "Can't reach it"}</span></span>;
}
/** Apps added by address only get a slim strip; one connected with a key has its own widget above instead. */
function WidgetCards() {
  const { S, ppOn, wmOn } = useHub();
  const all = S.config.widgets.filter(w => w.id === "pocketpals" || w.id === "wattsmypower");
  const ws = all.filter(w => w.id === "pocketpals" ? !ppOn : !wmOn);
  if (!ws.length && (all.length || ppOn || wmOn)) return null;
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
