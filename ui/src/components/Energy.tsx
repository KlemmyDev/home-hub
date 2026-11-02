import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DEMO } from "../lib/api";
import { addDays, fmtT, hourLabel, sameDay, startOfDay, fromYmd } from "../lib/dates";
import { Chev, DockIcon, WeatherIcon } from "../lib/icons";
import { useEnergy, type Series } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { PageHead, wrap } from "./Panels";

/* WattsMyPower's readings, in the hub's calm style. Power is in watts: grid is positive when buying, battery positive when it's being used. */
const ON = 50;
const kw = (w?: number | null) => (Math.abs(w ?? 0) / 1000).toFixed(1);
const kwh = (n?: number | null) => (n ?? 0).toFixed(1);
const money = (n?: number | null) => n === undefined || n === null ? "" : `$${Math.abs(n).toFixed(2)}`;
const secs = (d: Date) => Math.round(+d / 1000);

type Snap = { pv_power?: number; load_power?: number; battery_power?: number; battery_soc?: number; grid_power?: number; daily_pv?: number; daily_import?: number; daily_export?: number; daily_charge?: number; daily_discharge?: number };

/** What the key may read: the Energy page only asks for (and draws) those. */
function useScopes() {
  const { S } = useHub();
  const s = S.config.wattsmypower?.scopes || [];
  return (scope: string) => DEMO || s.includes(scope);
}
/** The readings every widget shares: power now, today's totals and today's costs. */
function useToday() {
  const { wmOn } = useHub();
  const { data: t } = useEnergy("today", "", wmOn);
  return { t, p: t?.data?.live?.snapshot as Snap | undefined, costs: t?.data?.costs as { net_cost?: number; saved?: number } | undefined };
}
/** Today's readings, midnight to midnight, a point every five minutes. */
function useTodayCurve(on: boolean) {
  const { now } = useHub();
  const mid = startOfDay(now);
  const { data } = useEnergy<{ series: Series }>("history", `start=${secs(mid)}&end=${secs(addDays(mid, 1))}&points=288`, on, 120000);
  return { s: data?.data?.series, mid };
}

/** The width an element is drawn at, so charts can draw their words at their real size. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Where the house's power is coming from and going, in plain words. */
function story(p: Snap) {
  const pv = p.pv_power ?? 0, bat = p.battery_power ?? 0, grid = p.grid_power ?? 0, soc = Math.round(p.battery_soc ?? 0);
  const from = [pv > ON && "the sun", bat > ON && "the battery", grid > ON && "the grid"].filter(Boolean) as string[];
  const list = from.length > 1 ? from.slice(0, -1).join(", ") + " and " + from[from.length - 1] : from[0];
  const out = [`The house is using ${kw(p.load_power)} kW${list ? `, from ${list}` : ""}.`];
  if (bat < -ON) out.push(`The battery is filling up (${soc}%).`);
  if (grid < -ON) out.push(`${kw(grid)} kW is going back to the grid.`);
  return out.join(" ");
}

/* ---------- the Home card ---------- */

/**
 * The house's power right now: a sentence saying where it's coming from, WattsMyPower's four tiles (amber solar,
 * blue battery), today's curve when the key may read history, and the day's totals. Tapping it opens the Energy page.
 */
export function EnergyCard() {
  const { wmOn } = useHub();
  const { go } = useNav();
  const may = useScopes();
  const { t, p, costs } = useToday();
  const { s, mid } = useTodayCurve(wmOn && may("history:read"));
  if (!wmOn || !t?.allowed || !p) return null;
  const pv = p.pv_power ?? 0, soc = Math.max(0, Math.min(100, p.battery_soc ?? 0));
  const totals: [string, string][] = [["Made", `${kwh(p.daily_pv)} kWh`], ["Bought", `${kwh(p.daily_import)} kWh`], ["Sold", `${kwh(p.daily_export)} kWh`]];
  if (costs?.net_cost !== undefined && costs?.net_cost !== null) totals.push([costs.net_cost < 0 ? "Credit" : "Bill so far", money(costs.net_cost)]);
  return (
    <button className="tile-card wm" onClick={() => go("energy")} aria-label={`Energy: solar ${kw(pv)} kW, home ${kw(p.load_power)} kW, battery ${Math.round(soc)}%. Open the energy page`}>
      <div className="tc-top">
        <div className="tc-hd">
          <h2 className="tc-h">Energy</h2>
          <span className="wm-live"><i />Live</span>
        </div>
        <span className="fx" style={{ gap: 10 }}>
          {costs?.saved ? <span className="wm-save">Saved {money(costs.saved)} today</span> : null}
          <span className="tc-open">Energy<Chev /></span>
        </span>
      </div>
      <p className="wm-story">{story(p)}</p>
      <Tiles p={p} />
      {s ? <DayChart s={s} mid={mid} small /> : null}
      <div className="wm-foot">{totals.map(([l, v]) => <span key={l}>{l} <b className="num">{v}</b></span>)}</div>
    </button>
  );
}

/** WattsMyPower's four tiles: solar, home, battery (with its charge as a bar) and grid. */
function Tiles({ p }: { p: Snap }) {
  const pv = p.pv_power ?? 0, bat = p.battery_power ?? 0, grid = p.grid_power ?? 0, soc = Math.max(0, Math.min(100, p.battery_soc ?? 0));
  const tiles: { id: string; label: string; value: string; unit: string; note: string }[] = [
    { id: "solar", label: "Solar", value: kw(pv), unit: "kW", note: `${kwh(p.daily_pv)} kWh today` },
    { id: "home", label: "Home", value: kw(p.load_power), unit: "kW", note: "using now" },
    { id: "battery", label: "Battery", value: String(Math.round(soc)), unit: "%", note: bat < -ON ? `charging ${kw(bat)} kW` : bat > ON ? `using ${kw(bat)} kW` : "resting" },
    { id: grid < -ON ? "grid sell" : "grid", label: "Grid", value: kw(grid), unit: "kW", note: grid > ON ? "buying" : grid < -ON ? "selling" : "not used" },
  ];
  return (
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
  );
}

/* ---------- the Energy page ---------- */

/** A white card with a heading, like every card on the calm pages. */
const Card = ({ title, sub, wide, i, children, cls }: { title: string; sub?: ReactNode; wide?: boolean; i: number; children: ReactNode; cls?: string }) => (
  <section className={"encard pprise" + (wide ? " wide" : "") + (cls ? " " + cls : "")} style={{ "--i": i } as CSSProperties}>
    <div className="encard-h"><h2>{title}</h2>{sub ? <span>{sub}</span> : null}</div>
    {children}
  </section>
);
const Sorry = ({ error }: { error?: string }) => <p className="ennote">{error || "WattsMyPower hasn't sent this yet."}</p>;

/** The Energy page: a page of widgets from WattsMyPower. Each shows only when the hub's key may read it. */
export function EnergyPanel() {
  const { dim, S } = useHub();
  const P = dim.phone;
  const may = useScopes();
  const { t, p } = useToday();
  const url = S.config.wattsmypower?.url || S.config.widgets.find(w => w.id === "wattsmypower")?.url;
  const missing = ([["history:read", "today's graph and the week"], ["costs:read", "what it costs"], ["forecast:read", "the solar forecast"], ["insights:read", "the last 30 days"]] as [string, string][]).filter(([s]) => !may(s)).map(([, w]) => w);
  let i = 0;
  return (
    <div className="enpage" style={wrap(P)}>
      <PageHead title="Energy" sub={p ? <span className="wm-live"><i />Live from WattsMyPower</span> : undefined} />
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div className="engrid">
          {!t ? <Card title="Right now" wide i={i++}><p className="ennote">Asking WattsMyPower…</p></Card>
            : !t.allowed ? <Card title="Right now" wide i={i++}><p className="ennote">This key can't read the power right now. Make one in WattsMyPower that can read live power.</p></Card>
            : !p ? <Card title="Right now" wide i={i++}><Sorry error={t.error} /></Card>
            : <NowCard p={p} i={i++} />}
          {may("history:read") ? <TodayGraph p={p} i={i++} /> : null}
          {p ? <BatteryCard p={p} i={i++} forecast={may("forecast:read")} /> : null}
          {may("costs:read") ? <MoneyCard i={i++} /> : null}
          {may("forecast:read") ? <ForecastCard i={i++} /> : null}
          {may("history:read") ? <WeekCard i={i++} /> : null}
          {may("insights:read") ? <MonthCard i={i++} /> : null}
          {missing.length ? <p className="ennote wide">To see {missing.join(", ")} here too, give the hub's key those permissions in WattsMyPower (Settings, then Developers).</p> : null}
          {url ? <a className="dvbtn wide enopen" href={url}><DockIcon name="energy" size={18} />Open WattsMyPower<Chev /></a> : null}
        </div>
      </div>
    </div>
  );
}

/** The house as a picture: solar above, the grid on the left, the home on the right and the battery below, with power moving along the lines. */
function NowCard({ p, i }: { p: Snap; i: number }) {
  const { dim } = useHub();
  if (dim.phone) return <Card title="Right now" sub={story(p)} wide i={i} cls="ennow"><Tiles p={p} /></Card>;      // too narrow for the picture's words
  const pv = p.pv_power ?? 0, bat = p.battery_power ?? 0, grid = p.grid_power ?? 0, load = p.load_power ?? 0, soc = Math.max(0, Math.min(100, p.battery_soc ?? 0));
  const cx = 360, cy = 150;
  // Each line: where it starts, whether power runs towards the middle (in) or away (out), and how much.
  const lines: { id: string; x: number; y: number; w: number; dir: "in" | "out" | "" }[] = [
    { id: "solar", x: cx, y: 60, w: pv, dir: pv > ON ? "in" : "" },
    { id: "grid", x: 120, y: cy, w: grid, dir: grid > ON ? "in" : grid < -ON ? "out" : "" },
    { id: "home", x: 600, y: cy, w: load, dir: load > ON ? "out" : "" },
    { id: "battery", x: cx, y: 240, w: bat, dir: bat > ON ? "in" : bat < -ON ? "out" : "" },
  ];
  const node = (id: string, x: number, y: number, icon: ReactNode, label: string, value: string, note: string, side: "r" | "b") => (
    <g className={"ennode " + id} transform={`translate(${x} ${y})`}>
      <circle r="40" className="ennode-bg" />
      <g transform="translate(-14 -14)">{icon}</g>
      <g transform={side === "r" ? "translate(56 -8)" : "translate(0 64)"} textAnchor={side === "r" ? "start" : "middle"}>
        <text className="ennode-l">{label}</text>
        <text className="ennode-v num" y="30">{value}</text>
        <text className="ennode-n" y="52">{note}</text>
      </g>
    </g>
  );
  const ic = (d: ReactNode) => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
  return (
    <Card title="Right now" sub={story(p)} wide i={i} cls="ennow">
      <svg className="enflow" viewBox="0 0 720 300" role="img" aria-label={story(p)}>
        {lines.map(l => {
          const d = l.dir === "out" ? `M${cx} ${cy}L${l.x} ${l.y}` : `M${l.x} ${l.y}L${cx} ${cy}`;
          const width = l.dir ? 3 + Math.min(5, Math.abs(l.w) / 1000) : 3;
          return <g key={l.id}><path d={d} className="enline-bg" /><path d={d} className={"enline " + l.id + (l.dir ? " on" : "")} style={{ strokeWidth: width } as CSSProperties} /></g>;
        })}
        <circle cx={cx} cy={cy} r="7" className="enhub" />
        {node("solar", cx, 60, ic(<><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></>), "Solar", `${kw(pv)} kW`, `${kwh(p.daily_pv)} kWh today`, "r")}
        {node("grid", 120, cy, ic(<path d="M8 22l4-20 4 20M6 9h12M5 15h14M9.5 9L15 15M14.5 9L9 15" />), "Grid", `${kw(grid)} kW`, grid > ON ? "buying" : grid < -ON ? "selling" : "not used", "b")}
        {node("home", 600, cy, ic(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />), "Home", `${kw(load)} kW`, "using now", "b")}
        {node("battery", cx, 240, ic(<><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M22 11v2" /><path d={`M6 10v4`} /><path d={`M9.5 10v4`} /></>), "Battery", `${Math.round(soc)}%`, bat < -ON ? `charging ${kw(bat)} kW` : bat > ON ? `using ${kw(bat)} kW` : "resting", "r")}
      </svg>
    </Card>
  );
}

/** A day's power as a graph: solar as an amber hill, the house's use as a dark line, the battery's charge dashed blue (right-hand scale). */
function DayChart({ s, mid, small }: { s: Series; mid: Date; small?: boolean }) {
  const { now, h24 } = useHub();
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = small ? 92 : 230, L = small ? 0 : 40, R = small ? 0 : 40, T = 10, B = small ? 4 : 26;
  const t0 = secs(mid), span = 86400;
  const pv = s.pv_power || [], load = s.load_power || [], soc = s.battery_soc || [];
  const top = Math.max(1000, ...pv.map(v => v ?? 0), ...load.map(v => v ?? 0));
  const step = top > 6000 ? 2000 : 1000, max = Math.ceil(top * 1.08 / step) * step;
  const x = (ts: number) => L + (ts - t0) / span * (W - L - R), y = (v: number) => T + (1 - v / max) * (H - T - B), yp = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = (vals: (number | null)[], fy: (v: number) => number) => { let d = "", pen = false; s.t.forEach((ts, k) => { const v = vals[k]; if (v === null || v === undefined) { pen = false; return; } d += (pen ? "L" : "M") + x(ts).toFixed(1) + " " + fy(v).toFixed(1); pen = true; }); return d; };
  const area = (() => { const pts = s.t.map((ts, k) => [ts, pv[k]] as const).filter(([, v]) => v !== null && v !== undefined); if (!pts.length) return ""; return `M${x(pts[0][0])} ${y(0)}` + pts.map(([ts, v]) => `L${x(ts).toFixed(1)} ${y(v!).toFixed(1)}`).join("") + `L${x(pts[pts.length - 1][0])} ${y(0)}Z`; })();
  const nx = x(Math.min(secs(now), t0 + span));
  return (
    <div ref={ref} className={"enchart" + (small ? " sm" : "")} style={{ height: H }}>
      {W ? (
        <svg width={W} height={H} aria-hidden="true">
          {small ? null : Array.from({ length: max / step + 1 }, (_, k) => k * step).map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="engrid-l" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="enaxis">{v / 1000}{v ? "" : " kW"}</text></g>)}
          {small ? null : [0, 50, 100].map(v => <text key={v} x={W - R + 8} y={yp(v) + 4} className="enaxis bat">{v}%</text>)}
          {small ? null : [0, 6, 12, 18, 24].map(h => <text key={h} x={x(t0 + h * 3600)} y={H - 6} textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"} className="enaxis">{hourLabel(h % 24, h24)}</text>)}
          {small ? null : <rect x={nx} y={T} width={Math.max(0, W - R - nx)} height={H - T - B} className="enfuture" />}
          <path d={area} className="enarea" />
          <path d={path(pv, y)} className="enpv" />
          <path d={path(load, y)} className="enload" />
          {soc.length ? <path d={path(soc, yp)} className="ensoc" /> : null}
          <line x1={nx} x2={nx} y1={T - 4} y2={H - B} className="ennow-l" />
        </svg>
      ) : null}
    </div>
  );
}

function TodayGraph({ p, i }: { p?: Snap; i: number }) {
  const { s, mid } = useTodayCurve(true);
  const used = p ? Math.max(0, (p.daily_pv ?? 0) + (p.daily_import ?? 0) - (p.daily_export ?? 0) + (p.daily_discharge ?? 0) - (p.daily_charge ?? 0)) : null;
  return (
    <Card title="Today" sub={<span className="enkey"><i className="pv" />Solar<i className="load" />Home<i className="soc" />Battery</span>} wide i={i}>
      {s ? <DayChart s={s} mid={mid} /> : <div className="enchart" style={{ height: 230 }} />}
      {p ? (
        <div className="entotals">
          <span><small>Made</small><b className="num">{kwh(p.daily_pv)}<em>kWh</em></b></span>
          {used !== null && (p.daily_charge !== undefined || DEMO) ? <span><small>Used</small><b className="num">{kwh(used)}<em>kWh</em></b></span> : null}
          <span><small>Bought</small><b className="num">{kwh(p.daily_import)}<em>kWh</em></b></span>
          <span><small>Sold</small><b className="num">{kwh(p.daily_export)}<em>kWh</em></b></span>
        </div>
      ) : null}
    </Card>
  );
}

/** The battery: how full it is as a big ring, what it's doing, and (with the forecast) when it'll be full and how low it goes tonight. */
function BatteryCard({ p, i, forecast }: { p: Snap; i: number; forecast: boolean }) {
  const { h24, now } = useHub();
  const { data: f } = useEnergy("forecast", "", forecast, 900000);
  const soc = Math.max(0, Math.min(100, p.battery_soc ?? 0)), bat = p.battery_power ?? 0;
  const sum = f?.data?.summary, r = 62, C = 2 * Math.PI * r;
  const full = sum?.full_at ? new Date(sum.full_at * 1000) : null;
  return (
    <Card title="Battery" i={i} cls="enbat">
      <div className="enbat-b">
        <span className="enring">
          <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r={r} className="enring-bg" /><circle cx="75" cy="75" r={r} className="enring-f" strokeDasharray={C} strokeDashoffset={C * (1 - soc / 100)} /></svg>
          <b className="num">{Math.round(soc)}<small>%</small></b>
        </span>
        <div className="enbat-m">
          <b>{bat < -ON ? "Charging" : bat > ON ? "Running the house" : soc >= 99 ? "Full" : "Resting"}</b>
          <span>{bat < -ON ? `${kw(bat)} kW going in` : bat > ON ? `${kw(bat)} kW coming out` : "Not charging or being used"}</span>
          {full && full > now ? <span className="enfact">Full by <b>{sameDay(full, now) ? fmtT(full, h24) : `${full.toLocaleDateString([], { weekday: "short" })} ${fmtT(full, h24)}`}</b></span> : null}
          {sum?.min_soc_tonight != null ? <span className="enfact">Lowest tonight about <b>{sum.min_soc_tonight}%</b></span> : null}
        </div>
      </div>
    </Card>
  );
}

/** Today's bill so far (or credit), what solar and the battery saved, and the last seven days of cost as bars. */
function MoneyCard({ i }: { i: number }) {
  const { now } = useHub();
  const mid = startOfDay(now);
  const { data } = useEnergy<{ days: { date: string; net_cost: number; saved: number }[] }>("costs", `start=${secs(addDays(mid, -6))}&end=${secs(addDays(mid, 1))}`, true, 300000);
  const days = data?.data?.days || [], today = days.find(d => sameDay(fromYmd(d.date), now));
  const max = Math.max(0.01, ...days.map(d => Math.abs(d.net_cost)));
  const week = days.reduce((a, d) => a + d.net_cost, 0), saved = days.reduce((a, d) => a + d.saved, 0);
  return (
    <Card title="Cost" sub="today" i={i}>
      {data?.error ? <Sorry error={data.error} /> : !today ? <Sorry /> : (
        <>
          <div className="enbig">
            <b className="num">{money(today.net_cost)}</b>
            <span>{today.net_cost < 0 ? "credit so far" : "on the bill so far"}</span>
          </div>
          {today.saved ? <span className="wm-save">Saved {money(today.saved)} today</span> : null}
          <div className="enbars" aria-label="The last seven days">
            {days.map(d => (
              <span key={d.date} className={d.net_cost < 0 ? "cr" : ""}>
                <small className="num">{d.net_cost < 0 ? "+" : ""}{money(d.net_cost).replace(".00", "")}</small>
                <i style={{ height: Math.max(3, Math.abs(d.net_cost) / max * 64) }} className={sameDay(fromYmd(d.date), now) ? "now" : ""} />
                <em>{fromYmd(d.date).toLocaleDateString([], { weekday: "narrow" })}</em>
              </span>
            ))}
          </div>
          <p className="ennote">This week: {week < 0 ? `${money(week)} credit` : `${money(week)} on the bill`}, {money(saved)} saved.</p>
        </>
      )}
    </Card>
  );
}

/* Open-Meteo weather codes, the same pictures as the weather under the clock. */
const wxKind = (code?: number) => code === undefined || code === null ? "cloud" : code <= 1 ? "sun" : code === 2 ? "partly" : code === 3 ? "cloud" : code < 50 ? "fog" : code < 70 || (code >= 80 && code < 83) ? "rain" : code < 90 ? "snow" : "storm";

/** The next few days: the weather, how much solar to expect, and whether the battery will fill. */
function ForecastCard({ i }: { i: number }) {
  const { now, h24 } = useHub();
  const { data } = useEnergy<{ days: { date: string; pv_kwh: number; load_kwh: number; code?: number; temp_min?: number; temp_max?: number; full_at?: number | null; max_soc?: number }[] }>("forecast", "", true, 900000);
  const days = (data?.data?.days || []).slice(0, 3);
  const best = Math.max(1, ...days.map(d => d.pv_kwh));
  return (
    <Card title="Solar forecast" i={i}>
      {data?.error ? <Sorry error={data.error} /> : !days.length ? <Sorry /> : (
        <div className="enfc">
          {days.map(d => {
            const day = fromYmd(d.date), full = d.full_at ? new Date(d.full_at * 1000) : null;
            return (
              <div key={d.date} className="enfc-r">
                <WeatherIcon kind={wxKind(d.code)} size={40} />
                <span className="enfc-d"><b>{sameDay(day, now) ? "Rest of today" : sameDay(day, addDays(now, 1)) ? "Tomorrow" : day.toLocaleDateString([], { weekday: "long" })}</b><small>{d.temp_max != null ? `${Math.round(d.temp_max)}° · ` : ""}{full ? `full by ${fmtT(full, h24)}` : d.max_soc != null ? `battery to ${Math.round(d.max_soc)}%` : ""}</small></span>
                <span className="enfc-v"><b className="num">{kwh(d.pv_kwh)}<em>kWh</em></b><i><i style={{ width: d.pv_kwh / best * 100 + "%" }} /></i></span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** The last seven days: what the panels made (amber) beside what the house used (dark). */
function WeekCard({ i }: { i: number }) {
  const { now } = useHub();
  const mid = startOfDay(now);
  const { data } = useEnergy<{ date: string; daily_pv: number | null; daily_import: number | null; daily_export: number | null; daily_charge: number | null; daily_discharge: number | null }[]>("daily", `start=${secs(addDays(mid, -6))}&end=${secs(addDays(mid, 1))}`, true, 600000);
  const days = (Array.isArray(data?.data) ? data!.data! : []).map(d => ({ date: d.date, made: d.daily_pv ?? 0, used: Math.max(0, (d.daily_pv ?? 0) + (d.daily_import ?? 0) - (d.daily_export ?? 0) + (d.daily_discharge ?? 0) - (d.daily_charge ?? 0)) }));
  const max = Math.max(1, ...days.flatMap(d => [d.made, d.used]));
  const made = days.reduce((a, d) => a + d.made, 0), used = days.reduce((a, d) => a + d.used, 0);
  return (
    <Card title="This week" sub={<span className="enkey"><i className="pv" />Made<i className="load" />Used</span>} i={i}>
      {data?.error ? <Sorry error={data.error} /> : !days.length ? <Sorry /> : (
        <>
          <div className="enpairs">
            {days.map(d => (
              <span key={d.date}>
                <span className="enpair"><i className="pv" style={{ height: d.made / max * 100 + "%" }} /><i className="load" style={{ height: d.used / max * 100 + "%" }} /></span>
                <em className={sameDay(fromYmd(d.date), now) ? "now" : ""}>{fromYmd(d.date).toLocaleDateString([], { weekday: "narrow" })}</em>
              </span>
            ))}
          </div>
          <p className="ennote">Made <b>{Math.round(made)} kWh</b>, used <b>{Math.round(used)} kWh</b> over seven days.</p>
        </>
      )}
    </Card>
  );
}

/** The last 30 days: how much of the house's power came from the sun or the battery, and how that compares with the 30 before. */
function MonthCard({ i }: { i: number }) {
  const { data } = useEnergy<{ last30?: { pv: number; imp: number; exp: number; self_pct: number | null }; prev30?: { self_pct: number | null } }>("insights", "", true, 3600000);
  const l = data?.data?.last30, pr = data?.data?.prev30;
  const diff = l?.self_pct != null && pr?.self_pct != null ? Math.round(l.self_pct - pr.self_pct) : null;
  return (
    <Card title="Last 30 days" wide i={i} cls="enmonth">
      {data?.error ? <Sorry error={data.error} /> : !l ? <Sorry /> : (
        <div className="enmonth-b">
          <div className="enbig">
            <b className="num">{l.self_pct != null ? Math.round(l.self_pct) : "–"}<small>%</small></b>
            <span>of the power the house used came from the sun or the battery{diff ? `, ${diff > 0 ? "up" : "down"} ${Math.abs(diff)} on the month before` : ""}.</span>
          </div>
          <div className="entotals">
            <span><small>Made</small><b className="num">{Math.round(l.pv)}<em>kWh</em></b></span>
            <span><small>Bought</small><b className="num">{Math.round(l.imp)}<em>kWh</em></b></span>
            <span><small>Sold</small><b className="num">{Math.round(l.exp)}<em>kWh</em></b></span>
          </div>
        </div>
      )}
    </Card>
  );
}
