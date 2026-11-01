import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { PALETTE } from "../lib/events";
import { clockIn, deviceZone } from "../lib/dates";
import { FamilyEditor } from "../components/Family";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { askUpdate } from "../lib/pulse";
import { dimNow, savePower, usePower } from "../lib/power";
import { ChevL, ChevR, DockIcon } from "../lib/icons";

const TINT: Record<string, [string, string]> = { clock: ["#e6edfb", "#1d4ed8"], chores: ["#ece8fe", "#5b3bf0"], family: ["#fde8ef", "#d6336c"], weather: ["#fff3d6", "#d98a00"], calendar: ["#e1f5ec", "#14a06c"], update: ["#eef1f6", "#101828"] };
const Box = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => {
  const [bg, fg] = TINT[icon] || TINT.update;
  return <section className="box"><div className="bh"><span className="bi" style={icon === "chores" || icon === "energy" ? undefined : { background: bg, color: fg }}><DockIcon name={icon} size={22} /></span><h3>{title}</h3></div>{children}</section>;
};
/** Two or three choices in one rounded track, like the calendar's Day, Week, Month switch. */
const Seg = ({ items, value, onPick }: { items: [string, string][]; value: string; onPick: (v: string) => void }) => (
  <div className="seg">{items.map(([v, label]) => <button key={v} className={"sg big" + (v === value ? " on" : "")} onClick={() => onPick(v)}>{label}</button>)}</div>
);

const COMMON_ZONES = ["Australia/Brisbane", "Australia/Sydney", "Australia/Melbourne", "Australia/Adelaide", "Australia/Perth", "Australia/Darwin", "Australia/Hobart", "Pacific/Auckland", "Europe/London", "America/New_York", "America/Los_Angeles"];
const allZones = (): string[] => { try { return (Intl as any).supportedValuesOf("timeZone") as string[]; } catch { return COMMON_ZONES; } };
const zoneName = (z: string) => { const [region, ...rest] = z.split("/"), city = (rest.pop() || region).replace(/_/g, " "); return rest.length || region !== city ? { city, region: region.replace(/_/g, " ") } : { city, region: "" }; };

/** Pick the family's time zone by searching for a city, and see what time it is there before choosing. */
function Zone() {
  const { S, h24 } = useHub();
  const [q, setQ] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const current = S.config.timezone || "", device = deviceZone();
  const shown = (() => {
    const t = q.trim().toLowerCase().replace(/\s+/g, "_");
    if (!t) return COMMON_ZONES;
    return allZones().filter(z => z.toLowerCase().includes(t)).slice(0, 8);
  })();
  const choose = async (z: string) => {
    setBusy(true); setErr("");
    try { await post("/api/timezone", { timezone: z }); location.reload(); }      // reload so every screen reads the new zone from the start
    catch (e: any) { setErr(e.message || "Couldn't save that."); setBusy(false); }
  };
  const label = (z: string) => { const n = zoneName(z); return n.region ? `${n.city}, ${n.region}` : n.city; };
  return (
    <Box title="Time zone" icon="clock">
      <p>Every time on the hub follows this, whatever the tablet's own clock says. Pick it if event times look wrong.</p>
      <div className="zcur">
        <span className="zt num">{clockIn(current || device, h24)}</span>
        <span className="zn"><b>{current ? label(current) : "The tablet's own zone"}</b><small>{current ? "Set for the whole hub" : device ? `Following ${label(device)}` : "Following the tablet"}</small></span>
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search for your city, like Brisbane or London" autoComplete="off" aria-label="Search time zones" style={{ marginTop: 14 }} />
      <div className="zlist">
        {shown.length ? shown.map(z => (
          <button key={z} className={"zrow" + (z === current ? " on" : "")} disabled={busy} onClick={() => choose(z)}>
            <span className="zrn"><b>{zoneName(z).city}</b><small>{zoneName(z).region}</small></span>
            <span className="num zrt">{clockIn(z, h24)}</span>
          </button>
        )) : <p style={{ margin: "10px 0 0" }}>Nothing matches that. Try the name of a big city nearby.</p>}
      </div>
      {current ? <button className="zdev" disabled={busy} onClick={() => choose("")}>Follow the tablet's own zone{device ? ` (${label(device)})` : ""}</button> : null}
      {err ? <div className="err" role="alert">{err}</div> : null}
    </Box>
  );
}

/** Dimming the screen when nobody is using it, and letting it sleep. These belong to this screen only. */
function Power() {
  const p = usePower();
  const num = (v: string, f: (n: number) => void) => f(Number(v));
  return (
    <Box title="Screen and battery" icon="clock">
      <p>When nobody has touched this screen for a while it can show a dim clock on black and stop refreshing, which saves battery. A touch brings it back. This only changes this screen, not other tablets or phones.</p>
      <div className="cap" style={{ margin: "14px 0 8px" }}>Dim the screen after</div>
      <Seg items={[["0", "Never"], ["2", "2 min"], ["5", "5 min"], ["10", "10 min"], ["30", "30 min"]]} value={String(p.standbyMin)} onPick={v => num(v, n => savePower({ standbyMin: n }))} />
      <div className="cap" style={{ margin: "20px 0 8px" }}>Show on the dim screen</div>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className={"pill" + (p.showNext ? " on" : "")} aria-pressed={p.showNext} onClick={() => savePower({ showNext: !p.showNext })}>The next event</button>
        <button className={"pill" + (p.showWeather ? " on" : "")} aria-pressed={p.showWeather} onClick={() => savePower({ showWeather: !p.showWeather })}>The weather</button>
      </div>
      <div className="cap" style={{ margin: "20px 0 8px" }}>Let the screen turn off</div>
      <Seg items={[["never", "Never"], ["after", "After a while"], ["night", "At night"]]} value={p.screenOff} onPick={v => savePower({ screenOff: v as typeof p.screenOff })} />
      {p.screenOff === "after" ? (
        <>
          <div className="cap" style={{ margin: "14px 0 8px" }}>After being dim for</div>
          <Seg items={[["30", "30 min"], ["60", "1 hour"], ["120", "2 hours"], ["240", "4 hours"]]} value={String(p.offAfterMin)} onPick={v => num(v, n => savePower({ offAfterMin: n }))} />
        </>
      ) : null}
      {p.screenOff === "night" ? (
        <div className="fx" style={{ gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <label className="bday" style={{ width: "auto", flex: 1, minWidth: 220 }}><span>From</span><input type="time" value={p.nightFrom} onChange={e => e.target.value && savePower({ nightFrom: e.target.value })} aria-label="Screen turns off from" /></label>
          <label className="bday" style={{ width: "auto", flex: 1, minWidth: 220 }}><span>Until</span><input type="time" value={p.nightTo} onChange={e => e.target.value && savePower({ nightTo: e.target.value })} aria-label="Screen turns off until" /></label>
        </div>
      ) : null}
      <p style={{ fontSize: 16, marginTop: 14 }}>{p.screenOff === "never" ? "The screen is asked to stay on, even when dim." : "Then this page stops asking the tablet to keep the screen on, and the tablet turns it off by its own timer. Touch it, or press its button, to bring it back."}</p>
      <div className="row" style={{ marginTop: 6 }}><button onClick={() => dimNow()}>Try the dim screen now</button></div>
      <p style={{ fontSize: 16, marginTop: 14 }}>A web page can't change the tablet's brightness. For the biggest saving, set the tablet's brightness low in its quick settings, and use the night setting above.</p>
    </Box>
  );
}

function Time() {
  const { h24, refreshState } = useHub();
  return (
    <>
      <Box title="Time" icon="clock">
        <p>How should the clock and event times look?</p>
        <Seg items={[["12", "12-hour (3:30pm)"], ["24", "24-hour (15:30)"]]} value={h24 ? "24" : "12"} onPick={async v => { try { await post("/api/clock", { hour24: v === "24" }); await refreshState(); } catch { /* keep the old choice */ } }} />
      </Box>
      <Zone />
    </>
  );
}

/** A private link so a phone's own calendar app can follow the hub's events (it only reads them). */
function Share() {
  const { S, refreshState } = useHub();
  const [link, setLink] = useState(""), [err, setErr] = useState(""), [copied, setCopied] = useState(false);
  const on = !!S.config.share;
  const change = async (turnOn: boolean) => {
    try { const r = await post("/api/share", { on: turnOn }); setLink(turnOn ? `${location.origin}/api/share/${r.token}.ics` : ""); setErr(""); setCopied(false); await refreshState(); }
    catch (e: any) { setErr(e.message || "Couldn't do that."); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { (document.getElementById("share-link") as HTMLInputElement | null)?.select(); } };
  return (
    <Box title="Phone calendar link" icon="calendar">
      <p>Add the hub's events to a phone's own calendar app (Google, Apple or Outlook: choose <em>add by link</em> or <em>subscribe</em>). It only reads, so nothing on the phone changes the hub. The phone has to reach the hub's address, like at home.</p>
      {link ? (
        <>
          <input id="share-link" readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label="Calendar link" style={{ userSelect: "text" }} />
          <div className="row" style={{ marginTop: 12 }}><button className="primary" onClick={copy}>{copied ? "Copied" : "Copy the link"}</button></div>
          <p style={{ fontSize: 16 }}>Keep it private: anyone with the link can read the family's events. This is the only time it is shown.</p>
        </>
      ) : null}
      <div className="row" style={{ marginTop: 12 }}>
        {on ? <><button onClick={() => change(true)}>Make a new link</button><button onClick={() => change(false)}>Turn off</button></> : <button className="primary" onClick={() => change(true)}>Turn on</button>}
      </div>
      {on && !link ? <p style={{ fontSize: 16 }}>The link is on. Make a new one to see it again; the old one then stops working.</p> : null}
      {err ? <div className="err" role="alert">{err}</div> : null}
    </Box>
  );
}

const LEADS: [string, string][] = [["0", "Off"], ["5", "5 min"], ["15", "15 min"], ["30", "30 min"], ["60", "1 hour"]];
/** How long before an event the screen shows a banner about it. */
function Reminders() {
  const { S, refreshState } = useHub();
  const now = String(S.config.remind_min ?? 15);
  return (
    <Box title="Reminders" icon="calendar">
      <p>Show a banner on the screen this long before an event starts, so nobody is late.</p>
      <Seg items={LEADS.some(([v]) => v === now) ? LEADS : [...LEADS, [now, now + " min"]]} value={now} onPick={async v => { try { await post("/api/remind", { minutes: Number(v) }); await refreshState(); } catch { /* keep the old choice */ } }} />
    </Box>
  );
}

const COUNTRIES: [string, string][] = [["AU", "Australia"], ["NZ", "New Zealand"], ["GB", "United Kingdom"], ["IE", "Ireland"], ["US", "United States"], ["CA", "Canada"], ["ZA", "South Africa"], ["SG", "Singapore"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"]];
/** Public holidays from Nager.Date (no account). They appear in the calendar as all-day events. */
function Holidays() {
  const { S, refreshState } = useHub();
  const h = S.config.holidays || { country: "", region: "" }, [region, setRegion] = useState(h.region.split("-")[1] || ""), [err, setErr] = useState("");
  const save = async (country: string, reg: string) => {
    try { await post("/api/holidays", { country, region: country && reg ? `${country}-${reg.toUpperCase()}` : "" }); setErr(""); await refreshState(); qcInvalidate(); }
    catch (e: any) { setErr(e.message || "Couldn't save that."); }
  };
  const qc = useQueryClient(), qcInvalidate = () => qc.invalidateQueries({ queryKey: ["events"] });
  return (
    <Box title="Public holidays" icon="calendar">
      <p>Show your country's public holidays in the calendar. They come from Nager.Date, which needs no account.</p>
      <div className="fx" style={{ gap: 10, flexWrap: "wrap" }}>
        <button className={"pill" + (!h.country ? " on" : "")} style={{ height: 52 }} onClick={() => save("", "")}>None</button>
        {COUNTRIES.map(([c, n]) => <button key={c} className={"pill" + (h.country === c ? " on" : "")} style={{ height: 52 }} onClick={() => save(c, c === h.country ? region : "")}>{n}</button>)}
      </div>
      {h.country ? (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: "0 0 8px" }}>State or region (optional). Some holidays only apply in one state; type it like <em>QLD</em> or <em>ENG</em> to include those.</p>
          <input value={region} onChange={e => setRegion(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4))} onBlur={() => save(h.country, region)} placeholder="Leave empty for national holidays only" autoComplete="off" autoCapitalize="characters" aria-label="State or region" />
        </div>
      ) : null}
      {err ? <div className="err" role="alert">{err}</div> : null}
    </Box>
  );
}

function PocketPals() {
  const { S, refreshState } = useHub();
  const qc = useQueryClient();
  const pp = S.config.pocketpals || {}, saved = S.config.widgets.find(w => w.id === "pocketpals")?.url || "";
  const [url, setUrl] = useState(saved), [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ text: string; good?: boolean }>({ text: "" });
  const after = async () => { await refreshState(); qc.removeQueries({ queryKey: ["chores"] }); };
  return (
    <Box title="PocketPals" icon="chores">
      <p style={{ margin: "0 0 12px" }}>{pp.connected ? (pp.tick ? "Connected. Kids can tick their jobs on the hub." : "Connected, but this key can only show jobs.") : "Show the kids' jobs on the calendar and let them tick them off here. In PocketPals, open You, then Developers, make a key and paste it below."}</p>
      <input value={url} onChange={e => setUrl(e.target.value)} inputMode="url" autoCapitalize="off" autoComplete="off" placeholder="PocketPals address, like https://pocketpals.example.com" style={{ marginBottom: 12 }} />
      <input value={key} onChange={e => setKey(e.target.value)} autoCapitalize="off" autoComplete="off" placeholder={pp.connected ? "Key saved. Leave blank to keep it" : "Paste the key (starts with pp_)"} style={{ marginBottom: 12 }} />
      <div className="err" role="alert" style={{ marginTop: 0, ...(msg.good ? { color: "var(--good)" } : {}) }}>{msg.text}</div>
      <div className="fx" style={{ gap: 12 }}>
        <button className="primary" onClick={async () => {
          try { const r = await post("/api/pocketpals/connect", { url, key }); await after(); setKey(""); setMsg({ good: true, text: `Working. Found ${r.kids} ${r.kids === 1 ? "child" : "children"}.` }); }
          catch (e: any) { setMsg({ text: e.message }); }
        }}>{pp.connected ? "Save and test" : "Connect"}</button>
        {pp.connected ? <button onClick={async () => { try { await post("/api/pocketpals/disconnect"); await after(); setMsg({ text: "" }); } catch (e: any) { setMsg({ text: e.message }); } }}>Disconnect</button> : null}
      </div>
    </Box>
  );
}

const WMP_ABOUT: Record<string, string> = { "live:read": "live power", "history:read": "history", "costs:read": "costs and savings", "forecast:read": "the forecast", "insights:read": "insights", "system:read": "system details" };
/** WattsMyPower: the house's energy. In WattsMyPower open Settings, then Developers, make a key and choose what it may read. */
function WattsMyPower() {
  const { S, refreshState } = useHub();
  const qc = useQueryClient();
  const wm = S.config.wattsmypower || {}, saved = S.config.widgets.find(w => w.id === "wattsmypower")?.url || "";
  const [url, setUrl] = useState(saved), [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ text: string; good?: boolean }>({ text: "" });
  const after = async () => { await refreshState(); qc.removeQueries({ queryKey: ["energy"] }); };
  const can = (wm.scopes || []).map(x => WMP_ABOUT[x] || x);
  return (
    <Box title="WattsMyPower" icon="energy">
      <p style={{ margin: "0 0 12px" }}>{wm.connected ? (can.length ? `Connected. The hub can read ${can.join(", ")}.` : "Connected, but this key can't read anything.") : "Show how much power the house is using, right on the hub. In WattsMyPower, open Settings, then Developers, make a key and choose what it may read, then paste it here."}</p>
      <input value={url} onChange={e => setUrl(e.target.value)} inputMode="url" autoCapitalize="off" autoComplete="off" placeholder="WattsMyPower address, like http://192.168.1.50:8080" style={{ marginBottom: 12 }} />
      <input value={key} onChange={e => setKey(e.target.value)} autoCapitalize="off" autoComplete="off" placeholder={wm.connected ? "Key saved. Leave blank to keep it" : "Paste the key (starts with wmp_)"} style={{ marginBottom: 12 }} />
      <div className="err" role="alert" style={{ marginTop: 0, ...(msg.good ? { color: "var(--good)" } : {}) }}>{msg.text}</div>
      <div className="fx" style={{ gap: 12 }}>
        <button className="primary" onClick={async () => {
          try { const r = await post("/api/wattsmypower/connect", { url, key }); await after(); setKey(""); setMsg({ good: true, text: r.inverter_fresh ? "Working. The inverter is answering." : "Working, but WattsMyPower says the inverter isn't answering right now." }); }
          catch (e: any) { setMsg({ text: e.message }); }
        }}>{wm.connected ? "Save and test" : "Connect"}</button>
        {wm.connected ? <button onClick={async () => { try { await post("/api/wattsmypower/disconnect"); await after(); setMsg({ text: "" }); } catch (e: any) { setMsg({ text: e.message }); } }}>Disconnect</button> : null}
      </div>
    </Box>
  );
}

function Weather() {
  const { S, refreshState } = useHub();
  const qc = useQueryClient();
  const w = S.config.weather;
  const [q, setQ] = useState(""), [found, setFound] = useState<any[] | null>(null), [err, setErr] = useState("");
  const done = async () => { await refreshState(); qc.removeQueries({ queryKey: ["weather"] }); };
  const search = async () => { try { setFound(await api("/api/weather/search?q=" + encodeURIComponent(q))); setErr(""); } catch (e: any) { setErr(e.message); setFound(null); } };
  return (
    <Box title="Weather" icon="weather">
      <p style={{ margin: "0 0 12px" }}>{w?.connected ? <>Showing the weather for <strong>{w.place}</strong> under the clock.</> : "Show today's weather under the clock. Pick your town or city. It comes from Open-Meteo, which needs no account; only the place's rough location is sent."}</p>
      {w?.connected ? (
        <>
          <Seg items={[["c", "Celsius (°C)"], ["f", "Fahrenheit (°F)"]]} value={w.fahrenheit ? "f" : "c"} onPick={async v => { try { await post("/api/weather/units", { fahrenheit: v === "f" }); await done(); } catch (e: any) { setErr(e.message); } }} />
          <div className="fx" style={{ gap: 12, marginTop: 14 }}><button onClick={async () => { try { await post("/api/weather/disconnect"); await done(); setFound(null); } catch (e: any) { setErr(e.message); } }}>Remove weather</button></div>
        </>
      ) : null}
      <p style={{ margin: "16px 0 8px" }}><strong>{w?.connected ? "Change place" : "Find your place"}</strong></p>
      <form className="fx" style={{ gap: 10 }} onSubmit={e => { e.preventDefault(); search(); }}>
        <input value={q} onChange={e => setQ(e.target.value)} maxLength={60} placeholder="Town or city" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
        <button className="primary" type="submit" style={{ flex: "none" }}>Search</button>
      </form>
      <div className="err" role="alert" style={{ marginTop: 8 }}>{err}</div>
      {found ? (found.length ? found.map((p, i) => (
        <div className="fx" key={i} style={{ gap: 14, padding: "12px 0", borderTop: "1px solid #edf0f5" }}>
          <div style={{ flex: 1, minWidth: 0 }}><strong>{p.name}</strong><div style={{ fontSize: 16, color: "var(--soft)" }}>{p.detail}</div></div>
          <button style={{ minHeight: 52, padding: "0 20px" }} onClick={async () => { try { await post("/api/weather/set", { name: p.name, lat: p.lat, lon: p.lon }); await done(); setFound(null); setQ(""); } catch (e: any) { setErr(e.message); } }}>Use this</button>
        </div>
      )) : <p>No places found. Try another spelling.</p>) : null}
    </Box>
  );
}

function Calendars() {
  const { S, refreshState } = useHub();
  const [color, setColor] = useState(PALETTE[0]);
  const [name, setName] = useState(""), [url, setUrl] = useState(""), [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const { data: info = {} } = useQuery({
    queryKey: ["cal-info", tick],
    queryFn: async () => { const r = await api(`/api/events?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`); return Object.fromEntries(r.calendars.map((c: any) => [c.id, c])) as Record<string, any>; },
  });
  const list = S.config.calendars;
  const status = (c: { id: string }) => !info[c.id] ? "" : info[c.id].ok ? " · working" : info[c.id].error ? ` · ${info[c.id].error}` : " · loading…";
  const keep = () => list.map(c => ({ id: c.id, name: c.name, color: c.color }));
  const save = async (l: any[]) => { await post("/api/calendars", l); await refreshState(); };
  return (
    <Box title="Calendars" icon="calendar">
      {list.length ? list.map(c => (
        <div className="fx" key={c.id} style={{ gap: 14, padding: "12px 0", borderTop: "1px solid #edf0f5" }}>
          <i style={{ width: 18, height: 18, borderRadius: "50%", background: c.color, flex: "none" }} />
          <div style={{ flex: 1, minWidth: 0 }}><strong>{c.name}</strong><div style={{ fontSize: 16, color: "var(--soft)" }}>{c.site || ""}{status(c)}</div></div>
          <button style={{ minHeight: 52, padding: "0 20px" }} onClick={async () => { try { await save(keep().filter(x => x.id !== c.id)); setTick(t => t + 1); } catch (e: any) { setErr(e.message); } }}>Remove</button>
        </div>
      )) : <p>No calendars yet. Add one below and its events will show on the dashboard.</p>}
      <div style={{ marginTop: 18, borderTop: "1px solid #edf0f5", paddingTop: 18 }}>
        <p style={{ margin: "0 0 8px" }}><strong>Add a calendar</strong></p>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Name, like Mum or School" autoComplete="off" style={{ marginBottom: 12 }} />
        <input value={url} onChange={e => setUrl(e.target.value)} inputMode="url" placeholder="Paste its iCal address (https:// or webcal://)" autoComplete="off" autoCapitalize="off" style={{ marginBottom: 12 }} />
        <div className="fx" style={{ gap: 10, marginBottom: 14 }}>{PALETTE.map(c => <button key={c} className={"sw" + (c === color ? " on" : "")} aria-label={"Colour " + c} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
        <div className="err" role="alert" style={{ marginTop: 0 }}>{err}</div>
        <button className="primary" onClick={async () => {
          try { await save([...keep(), { name, url, color }]); setErr(""); setName(""); setUrl(""); setTimeout(() => setTick(t => t + 1), 1500); setTick(t => t + 1); }
          catch (e: any) { setErr(e.message); }
        }}>Add calendar</button>
        <p style={{ fontSize: 16, marginTop: 16 }}>Where is the address? In Google Calendar: Settings, then the calendar, then <em>Secret address in iCal format</em>. In Apple Calendar: share the calendar as a public calendar and copy its link. Anyone with the address can read that calendar, so keep it private.</p>
      </div>
    </Box>
  );
}

function Updates() {
  const [fresh, setFresh] = useState(true);
  const qc = useQueryClient();
  const { data: u, isError, refetch } = useQuery({ queryKey: ["update", fresh], queryFn: () => api("/api/update" + (fresh ? "?fresh=1" : "")), retry: false });
  if (isError) return <Box title="Updates" icon="update"><p>Couldn't check for updates.</p></Box>;
  if (!u) return <Box title="Updates" icon="update"><p>Checking…</p></Box>;
  const st = u.status, up = u.updater, alive = up && (Date.now() / 1000 - up.seen_at) < 180;
  return (
    <Box title="Updates" icon="update">
      <p>Version {u.version}{u.current ? ` (${u.current})` : ""}</p>
      {u.requested || (st && st.state === "running") ? <p><strong>Updating now… the hub will restart in a few minutes.</strong></p>
        : !u.latest ? <p>Couldn't reach GitHub to look for a newer version.</p>
        : u.available ? (
          <>
            <p><strong>A new version is ready.</strong></p>
            {!alive ? <p>The updater isn't running on this machine, so run <code>bash install.sh</code> there.</p>
              : up && !up.can_update ? <p>{up.why || "It can't update right now."}</p>
              : <div className="row"><button className="primary" onClick={async () => { try { await askUpdate(); } catch { /* the check below shows what happened */ } refetch(); }}>Update now</button></div>}
          </>
        ) : <p>You're up to date.</p>}
      {st && st.state === "failed" ? <p style={{ color: "var(--bad)" }}>The last update didn't work: {st.message || "see data/update/update.log"}</p> : null}
      <div className="row"><button onClick={() => { setFresh(true); refetch(); }}>Check again</button></div>
    </Box>
  );
}

type Section = "general" | "calendar" | "family" | "apps" | "about";
const SECTIONS: { id: Section; title: string; about: string; icon: string }[] = [
  { id: "general", title: "General", about: "Clock, time zone and weather", icon: "clock" },
  { id: "calendar", title: "Calendar", about: "Calendars, reminders and holidays", icon: "calendar" },
  { id: "family", title: "Family", about: "Who is in the family, and birthdays", icon: "family" },
  { id: "apps", title: "Apps", about: "PocketPals and the widgets on the screen", icon: "chores" },
  { id: "about", title: "Updates", about: "Version and new releases", icon: "update" },
];

/** Settings are grouped: a home list of sections, and each section opens on its own page with a way back. */
export function Settings() {
  const { go } = useNav();
  const [open, setOpen] = useState<Section | null>(() => { try { return (sessionStorage.getItem("settings-section") as Section) || null; } catch { return null; } });
  const pick = (v: Section | null) => { setOpen(v); try { v ? sessionStorage.setItem("settings-section", v) : sessionStorage.removeItem("settings-section"); } catch { /* fine without it */ } document.getElementById("setlayer")?.scrollTo({ top: 0 }); };
  const sec = SECTIONS.find(x => x.id === open);
  return (
    <div className="page settings">
      <header className="shead">
        {sec ? <button className="cnav" aria-label="Back to all settings" onClick={() => pick(null)}><ChevL /></button> : null}
        <div style={{ flex: 1, minWidth: 0 }}><h1>{sec ? sec.title : "Settings"}</h1><p className="lead">{sec ? sec.about : "Everything for your hub in one place."}</p></div>
        <button className="primary" onClick={() => { try { sessionStorage.removeItem("settings-section"); } catch { /* fine */ } go("overview"); }}>Done</button>
      </header>
      {!sec ? (
        <nav className="shome" aria-label="Settings sections">
          {SECTIONS.map(x => {
            const [bg, fg] = TINT[x.icon] || TINT.update;
            return (
              <button key={x.id} className="stile" onClick={() => pick(x.id)}>
                <span className="bi" style={x.icon === "chores" ? undefined : { background: bg, color: fg }}><DockIcon name={x.icon} size={26} /></span>
                <span className="stt"><b>{x.title}</b><small>{x.about}</small></span>
                <ChevR />
              </button>
            );
          })}
        </nav>
      ) : open === "general" ? <><Time /><Power /><Weather /></>
        : open === "calendar" ? <><Calendars /><Reminders /><Holidays /><Share /></>
        : open === "family" ? <Box title="Family" icon="family"><FamilyEditor /></Box>
        : open === "apps" ? <><PocketPals /><WattsMyPower /><div className="row"><button onClick={() => go("setup")}>Change widgets</button></div></>
        : <Updates />}
    </div>
  );
}
