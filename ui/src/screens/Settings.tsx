import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { PALETTE } from "../lib/events";
import { FamilyEditor } from "../components/Family";
import { useHub } from "../hub";
import { useNav } from "../nav";

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="box"><h3>{title}</h3>{children}</div>;

function Time() {
  const { h24, refreshState } = useHub();
  return (
    <Box title="Time">
      <p>How should the clock and event times look?</p>
      <div className="fx" style={{ gap: 12, marginTop: 12 }}>
        {[false, true].map(v => <button key={String(v)} className={h24 === v ? "primary" : ""} onClick={async () => { try { await post("/api/clock", { hour24: v }); await refreshState(); } catch { /* keep the old choice */ } }}>{v ? "24-hour (15:30)" : "12-hour (3:30pm)"}</button>)}
      </div>
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
    <Box title="PocketPals">
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
    <Box title="Calendars">
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
  if (isError) return <Box title="Updates"><p>Couldn't check for updates.</p></Box>;
  if (!u) return <Box title="Updates"><p>Checking…</p></Box>;
  const st = u.status, up = u.updater, alive = up && (Date.now() / 1000 - up.seen_at) < 180;
  return (
    <Box title="Updates">
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
    <div className="page">
      <h1>Settings</h1>
      <Time />
      <PocketPals />
      <Box title="Family"><FamilyEditor /></Box>
      <Calendars />
      <Updates />
      <div className="row"><button onClick={() => go("setup")}>Change widgets</button><button className="primary" onClick={() => go("overview")}>Done</button></div>
    </div>
  );
}
