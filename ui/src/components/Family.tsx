import { useState } from "react";
import { post } from "../lib/api";
import { PALETTE } from "../lib/events";
import { queryClient, useHub } from "../hub";
import { DIETS } from "../data";

/** Family members: used in the sheet and in Settings. */
export function FamilyEditor({ onChanged, onAdded }: { onChanged?: () => void; onAdded?: (id: string) => void }) {
  const { people, refreshState } = useHub();
  const [color, setColor] = useState(PALETTE[0]);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const keep = () => people.map(p => ({ id: p.id, name: p.name, color: p.color, birthday: p.birthday || "", diet: p.diet || [] }));
  const save = async (list: any[]) => { await post("/api/people", list); await refreshState(); onChanged?.(); };
  const run = async (f: () => Promise<void>) => { try { await f(); setErr(""); } catch (e: any) { setErr(e.message); } };
  return (
    <div style={{ marginTop: 8 }}>
      {people.length ? people.map(p => (
        <div className="fx" key={p.id} style={{ gap: 12, padding: "10px 0", borderTop: "1px solid #edf0f5", flexWrap: "wrap" }}>
          <button aria-label={`Change ${p.name}'s colour`} className="sw" style={{ background: p.color, flex: "none", borderColor: "transparent" }}
            onClick={() => run(() => save(keep().map(x => x.id === p.id ? { ...x, color: PALETTE[(PALETTE.indexOf(x.color) + 1) % PALETTE.length] } : x)))} />
          <input key={p.name} defaultValue={p.name} maxLength={30} aria-label="Name" autoComplete="off" style={{ flex: 1, minWidth: 0 }}
            onBlur={e => e.target.value !== p.name && run(() => save(keep().map(x => x.id === p.id ? { ...x, name: e.target.value } : x)))} />
          <button style={{ minHeight: 52, padding: "0 18px" }} onClick={() => run(() => save(keep().filter(x => x.id !== p.id)))}>Remove</button>
          <div className="fx" style={{ gap: 8, flexWrap: "wrap", width: "100%" }} aria-label={`${p.name}'s diet`}>
            <span className="dietlab">Needs</span>
            {DIETS.map(d => { const on = (p.diet || []).includes(d); return <button key={d} className={"pill" + (on ? " on" : "")} aria-pressed={on} style={{ height: 44, fontSize: 15 }} onClick={() => run(() => save(keep().map(x => x.id === p.id ? { ...x, diet: on ? x.diet.filter((y: string) => y !== d) : [...x.diet, d] } : x)))}>{d}</button>; })}
          </div>
          <label className="bday"><span>Birthday</span><input type="date" key={p.birthday || ""} defaultValue={p.birthday || ""} aria-label={`${p.name}'s birthday`} max="2100-12-31"
            onBlur={e => e.target.value !== (p.birthday || "") && run(() => save(keep().map(x => x.id === p.id ? { ...x, birthday: e.target.value } : x)))} /></label>
        </div>
      )) : <p style={{ color: "var(--soft)" }}>No one yet. Add the people in your family and you can give events to them.</p>}
      <div style={{ marginTop: 14, borderTop: "1px solid #edf0f5", paddingTop: 14 }}>
        <p style={{ margin: "0 0 8px" }}><strong>Add someone</strong></p>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Name" autoComplete="off" style={{ marginBottom: 12 }} />
        <div className="fx" style={{ gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {PALETTE.map(c => <button key={c} className={"sw" + (c === color ? " on" : "")} aria-label={"Colour " + c} style={{ background: c }} onClick={() => setColor(c)} />)}
        </div>
        <div className="err" role="alert" style={{ marginTop: 0 }}>{err}</div>
        <button className="primary" onClick={() => run(async () => {
          await save([...keep(), { name, color }]);
          const made = queryClient.getQueryData<any>(["state"]).people.find((p: any) => p.name === name.trim());
          setName(""); setColor(PALETTE[(PALETTE.indexOf(color) + 1) % PALETTE.length]);
          if (made) onAdded?.(made.id);
        })}>Add to family</button>
        <p style={{ fontSize: 16, color: "var(--soft)", marginTop: 14 }}>Taking someone out also takes them off their events.</p>
      </div>
    </div>
  );
}
