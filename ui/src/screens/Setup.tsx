import { useState } from "react";
import { post } from "../lib/api";
import { useHub } from "../hub";
import { useNav } from "../nav";

/** First run, and "change widgets". */
export function Setup({ first }: { first: boolean }) {
  const { S, refreshState } = useHub();
  const { go } = useNav();
  const c = S.config;
  const [name, setName] = useState(c.name);
  const [urls, setUrls] = useState<Record<string, string | undefined>>(() => Object.fromEntries(c.widgets.map(w => [w.id, w.url])));
  const [err, setErr] = useState("");
  return (
    <div className="page">
      <h1>{first ? "Welcome to your Home Hub" : "Change your hub"}</h1>
      <p className="lead">{first ? "Let's set it up. It only takes a minute." : "Add or remove widgets, or rename your home."}</p>
      <p><strong>What's your home called?</strong></p>
      <input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="The Smith family" autoComplete="off" />
      <p style={{ marginTop: 32 }}><strong>Which apps should it show?</strong></p>
      {S.catalog.map(m => {
        const on = urls[m.id] !== undefined;
        return (
          <div className={"pick" + (on ? " on" : "")} key={m.id}>
            <label><input type="checkbox" checked={on} onChange={e => setUrls(u => ({ ...u, [m.id]: e.target.checked ? "" : undefined }))} /><span><strong>{m.name}</strong><small>{m.about}</small></span></label>
            {on ? (
              <div className="url">
                <small style={{ marginBottom: 8 }}>Where does it live on your network?</small>
                <input type="url" inputMode="url" placeholder="http://192.168.1.20:8080" value={urls[m.id] || ""} onChange={e => setUrls(u => ({ ...u, [m.id]: e.target.value }))} autoComplete="off" autoCapitalize="off" />
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="err" role="alert">{err}</div>
      <div className="row">
        <button className="primary" onClick={async () => {
          const widgets = S.catalog.filter(m => urls[m.id] !== undefined).map(m => ({ id: m.id, url: (urls[m.id] || "").trim() }));
          try { await post("/api/setup", { name, widgets }); await refreshState(); go("overview"); } catch (e: any) { setErr(e.message); }
        }}>{first ? "Finish setup" : "Save"}</button>
        {first ? null : <button onClick={() => go("settings")}>Cancel</button>}
      </div>
    </div>
  );
}
