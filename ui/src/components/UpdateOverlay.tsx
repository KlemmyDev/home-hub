import { useEffect, useRef, useState } from "react";
import { Check } from "../lib/icons";
import { updating, useJustAsked, usePulse } from "../lib/pulse";

const STEPS: [string, string][] = [["asked", "Update asked for"], ["pull", "Getting the latest version"], ["build", "Building the new version"], ["start", "Restarting the hub"], ["done", "Ready"]];
const mins = (s: number) => s < 90 ? `${Math.max(1, Math.round(s))} sec` : `${Math.round(s / 60)} min`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Shows an update as it happens, step by step, on every screen showing the hub, and takes the screen back to the
 * Overview when the hub is back on the new version (or the update has finished).
 */
export function UpdateOverlay() {
  const { data, isError, dataUpdatedAt } = usePulse();
  const askedAt = useJustAsked(), asked = askedAt > 0 && Date.now() - askedAt < 20000, [hid, setHid] = useState(0);
  const first = useRef<string>(undefined), saw = useRef(false), lastStep = useRef(0), since = useRef(0);
  const [, tick] = useState(0), [closed, setClosed] = useState("");
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);

  const st = data?.status ?? null, running = updating(data) || asked;
  if (running) saw.current = true;
  if (data && first.current === undefined) first.current = data.boot;
  const bootChanged = !!data && first.current !== undefined && data.boot !== first.current;
  const done = st?.state === "done" && saw.current, failed = st?.state === "failed" && saw.current;

  // Back on the Overview, on a fresh copy of the screen: once the hub has restarted and the updater has said it's finished.
  useEffect(() => {
    if (!saw.current && !bootChanged) return;
    if (running) { if (bootChanged && !since.current) since.current = Date.now(); if (!bootChanged || Date.now() - since.current < 30000) return; }
    if (failed || (!done && !bootChanged)) return;
    const t = setTimeout(() => location.replace("/"), done ? 1600 : 200);
    return () => clearTimeout(t);
  }, [data, bootChanged, running, done, failed]);

  if (isError && saw.current) lastStep.current = Math.max(lastStep.current, 3);      // the hub is down: it is restarting
  let idx = -1;
  if (done || (bootChanged && !running)) idx = 4;
  else if (bootChanged || (isError && saw.current)) idx = 3;
  else if (st?.state === "running") idx = ({ starting: 1, pull: 1, tools: 2, build: 2, start: 3 } as Record<string, number>)[st.step || "starting"] ?? 1;
  else if (data?.requested || asked) idx = 0;
  if (idx >= 0) lastStep.current = Math.max(lastStep.current, idx);
  idx = idx >= 0 ? Math.max(idx, lastStep.current) : -1;

  if (failed && closed !== String(st?.started_at ?? st?.message)) {
    return (
      <div id="upd" role="alertdialog" aria-label="Update didn't finish">
        <div className="upcard">
          <h2>The update didn't finish</h2>
          <p>{st?.message || "Something went wrong."} The hub is still running the version it had before.</p>
          <button className="primary" onClick={() => setClosed(String(st?.started_at ?? st?.message))}>Close</button>
        </div>
      </div>
    );
  }
  if (idx > 0 && hid) setHid(0);
  if (hid && hid === askedAt) return null;
  if (idx < 0 || (!running && !done && !(isError && saw.current) && !bootChanged)) return null;

  const total = st?.started_at && data ? (data.now - st.started_at) + (Date.now() - dataUpdatedAt) / 1000 : 0;
  const stepFor = st?.step_at && data ? (data.now - st.step_at) + (Date.now() - dataUpdatedAt) / 1000 : 0;
  const est = data?.took ? Math.max(30, data.took * .8) : 240, frac = idx === 2 ? Math.min(.95, stepFor / est) : 0;
  return (
    <div id="upd" role="status" aria-live="polite" aria-label="Updating Home Hub">
      <div className="upcard">
        <h2>{idx >= 4 ? "All done" : "Updating Home Hub"}</h2>
        <p>{idx >= 4 ? "Taking you back to the Overview…" : "You can leave this on. The screen refreshes by itself when the update is ready."}</p>
        <ol className="upsteps">
          {STEPS.map(([id, label], i) => {
            const state = i < idx || idx >= 4 ? "done" : i === idx ? "now" : "next";
            return (
              <li key={id} className={"ups " + state}>
                <span className="upi" aria-hidden>{state === "done" ? <Check /> : state === "now" ? <i className="upspin" /> : null}</span>
                <span className="upl">
                  {label}
                  {state === "now" && i === 2 ? <span className="upbar"><i style={{ width: Math.round(Math.max(.04, frac) * 100) + "%" }} /></span> : null}
                  {state === "now" && i === 2 ? <small>{stepFor < est ? `About ${mins(est - stepFor)} to go` : "Almost there…"}</small> : null}
                  {state === "now" && i === 3 ? <small>The screen goes blank for a moment</small> : null}
                </span>
                {state === "now" && i > 0 && i < 4 && total > 0 ? <span className="upt num">{clock(total)}</span> : null}
              </li>
            );
          })}
        </ol>
        {idx === 0 && askedAt && Date.now() - askedAt > 15000 ? (
          <div className="upwait"><p>Still waiting for the updater to start. If this stays here, run <code>bash install.sh</code> on the machine the hub runs on.</p><button onClick={() => setHid(askedAt)}>Hide this</button></div>
        ) : null}
        {data?.took && idx < 4 ? <p className="upnote">The last update took about {mins(data.took)}.</p> : null}
      </div>
    </div>
  );
}
