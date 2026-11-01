import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { PALETTE } from "../lib/events";
import { FamilyEditor } from "../components/Family";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { DockIcon } from "../lib/icons";

const TINT: Record<string, [string, string]> = { clock: ["#e6edfb", "#1d4ed8"], chores: ["#ece8fe", "#5b3bf0"], family: ["#fde8ef", "#d6336c"], weather: ["#fff3d6", "#d98a00"], calendar: ["#e1f5ec", "#14a06c"], update: ["#eef1f6", "#101828"] };
const Box = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => {
  const [bg, fg] = TINT[icon] || TINT.update;
  return <section className="box"><div className="bh"><span className="bi" style={icon === "chores" ? undefined : { background: bg, color: fg }}><DockIcon name={icon} size={22} /></span><h3>{title}</h3></div>{children}</section>;
};
/** Two or three choices in one rounded track, like the calendar's Day, Week, Month switch. */
const Seg = ({ items, value, onPick }: { items: [string, string][]; value: string; onPick: (v: string) => void }) => (
  <div className="seg">{items.map(([v, label]) => <button key={v} className={"sg big" + (v === value ? " on" : "")} onClick={() => onPick(v)}>{label}</button>)}</div>
);

function Time() {
  const { h24, refreshState } = useHub();
  return (
    <Box title="Time" icon="clock">
      <p>How should the clock and event times look?</p>
      <Seg items={[["12", "12-hour (3:30pm)"], ["24", "24-hour (15:30)"]]} value={h24 ? "24" : "12"} onPick={async v => { try { await post("/api/clock", { hour24: v === "24" }); await refreshState(); } catch { /* keep the old choice */ } }} />
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
  const [waiting, setWaiting] = useState(false);
  const { data: u, isError, refetch } = useQuery({ queryKey: ["update", fresh], queryFn: () => api("/api/update" + (fresh ? "?fresh=1" : "")), refetchInterval: waiting ? 5000 : false, retry: false });
  useEffect(() => {      // After asking, wait for the hub to restart on the new version, then reload to pick up the new screen.
    if (waiting && u?.status?.state === "done" && !u.requested) location.reload();
    if (waiting && u?.status?.state === "failed") setWaiting(false);
  }, [u, waiting]);
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
              : <div className="row"><button className="primary" onClick={async () => { try { await post("/api/update/request"); } catch { /* the check below shows what happened */ } setWaiting(true); refetch(); }}>Update now</button></div>}
          </>
        ) : <p>You're up to date.</p>}
      {st && st.state === "failed" ? <p style={{ color: "var(--bad)" }}>The last update didn't work: {st.message || "see data/update/update.log"}</p> : null}
      <div className="row"><button onClick={() => { setFresh(true); refetch(); }}>Check again</button></div>
    </Box>
  );
}

export function Settings() {
  const { go } = useNav();
  return (
    <div className="page settings">
      <header className="shead"><div><h1>Settings</h1><p className="lead">Everything for your hub in one place.</p></div><button className="primary" onClick={() => go("overview")}>Done</button></header>
      <Time />
      <PocketPals />
      <Box title="Family" icon="family"><FamilyEditor /></Box>
      <Weather />
      <Calendars />
      <Updates />
      <div className="row"><button onClick={() => go("setup")}>Change widgets</button></div>
    </div>
  );
}
