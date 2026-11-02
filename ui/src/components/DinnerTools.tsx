import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { addDays, fromYmd, startOfDay, weekStart, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR, XIcon } from "../lib/icons";
import { KINDS, type Dinners, type Meal } from "../data";
import { EMPTY_EVENTS, NO_PANTRY, useEvents, usePantry } from "../data";
import { planUse } from "../lib/pantrylib";
import { useHold } from "../lib/power";
import { useHub } from "../hub";
import { FoodIcon } from "../lib/foodicons";
import { ago, busyAt, cookingFor, dayName, scaleAmount, stepsOf, suggestWeek, useStats, type Pick } from "../lib/dinnerlib";
import { Top, wrap } from "./Panels";
import { useMealSave } from "./Dinners";

const Bell = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></svg>;

/* ---------- fill the week ---------- */
export function Suggest({ din }: { din: Dinners | undefined }) {
  const { dim, now, people, menuWeek, setDview, soon } = useHub();
  const qc = useQueryClient();
  const P = dim.phone, w = weekStart(startOfDay(menuWeek)), days = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter(d => d >= startOfDay(now));
  const { data: ev = EMPTY_EVENTS } = useEvents(w, addDays(w, 7));
  const make = (seed: number) => din ? suggestWeek({ days, din, people, events: ev.list, today: now, seed }) : {};
  const [picks, setPicks] = useState<Record<string, Pick>>(() => make(1));
  const [seed, setSeed] = useState(1), [busy, setBusy] = useState(false);
  useEffect(() => { if (din && !Object.keys(picks).length) setPicks(make(seed)); }, [din, ev.list.length]);
  const shuffle = () => { const n = seed + 1; setSeed(n); setPicks(make(n)); };
  const swap = (key: string) => {
    if (!din) return;
    const others: Dinners["plan"] = {};
    for (const [k, p] of Object.entries(picks)) if (k !== key && p.meal) others[k] = { meal: p.meal.id };
    const next = suggestWeek({ days: days.filter(d => ymd(d) === key), din: { ...din, plan: { ...din.plan, ...others }, rules: {} }, people, events: ev.list, today: now, seed: Math.floor(Math.random() * 1e6) });
    setPicks(p => ({ ...p, [key]: next[key] || p[key] }));
  };
  const chosen = Object.entries(picks).filter(([, p]) => p.meal || p.kind);
  const use = async () => {
    setBusy(true);
    try { await post("/api/dinner-plan/many", chosen.map(([date, p]) => ({ date, meal_id: p.meal?.id || "", kind: p.kind || "" }))); await qc.invalidateQueries({ queryKey: ["dinners"] }); soon(`${chosen.length} dinners planned.`); setDview({ v: "week" }); }
    catch (e: any) { soon(e.message); setBusy(false); }
  };
  return (
    <div style={wrap(P)}>
      <Top back="This week" to={{ v: "week" }} title="Fill the week" right={<button className="dvbtn" onClick={shuffle}>Shuffle</button>} />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 150 }}>
        <p className="dvintro">Ideas for the empty nights, using what you've had lately, what everyone likes, and who's busy. Nothing is saved until you choose.</p>
        {days.map(d => {
          const key = ymd(d), have = din?.plan[key], p = picks[key], busyEv = busyAt(ev.list, d);
          const planned = have && (have.meal ? din?.meals.find(m => m.id === have.meal)?.name : KINDS[have.kind || ""]);
          return (
            <div key={key} className={"dvsug" + (have ? " set" : "")}>
              <span className="dvsd num"><b>{d.getDate()}</b><small>{d.toLocaleDateString([], { weekday: "short" })}</small></span>
              {have ? <span className="dvsm"><b>{planned}</b><small>Already planned</small></span>
                : p ? (
                  <>
                    <FoodIcon name={p.meal?.name || KINDS[p.kind || ""]} size={52} />
                    <span className="dvsm"><b>{p.meal?.name || KINDS[p.kind || ""]}</b><small>{p.why}{busyEv && !p.why.startsWith("Quick") ? ` · ${busyEv.title} at ${busyEv.s.getHours() % 12 || 12}${busyEv.s.getHours() < 12 ? "am" : "pm"}` : ""}</small></span>
                    {p.meal ? <button className="dvswap" onClick={() => swap(key)}>Swap</button> : null}
                  </>
                ) : <span className="dvsm"><b style={{ color: "#8a93a6" }}>Nothing suits</b><small>Add more dinners, or check the diets</small></span>}
            </div>
          );
        })}
      </div>
      <div className="dvbar"><button className="primary" disabled={!chosen.length || busy} onClick={use}>{chosen.length === 1 ? "Plan this one" : chosen.length ? `Plan these ${chosen.length}` : "Nothing to add"}</button></div>
    </div>
  );
}

/** Copy last week's dinners into the empty nights of the week being looked at. */
export async function copyLastWeek(din: Dinners | undefined, week: Date): Promise<number> {
  const w = weekStart(startOfDay(week)), nights = [];
  for (let i = 0; i < 7; i++) {
    const from = din?.plan[ymd(addDays(w, i - 7))];
    if (from && (from.meal || from.kind)) nights.push({ date: ymd(addDays(w, i)), meal_id: from.meal || "", kind: from.kind || "" });
  }
  if (!nights.length) throw new Error("Last week has no dinners to copy.");
  const r = await post("/api/dinner-plan/many", nights);
  return r.added as number;
}

/* ---------- fixed nights ---------- */
export function Rules({ din }: { din: Dinners | undefined }) {
  const { dim, setDview, openSheet } = useHub();
  const P = dim.phone, days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <div style={wrap(P)}>
      <Top back="This week" to={{ v: "week" }} title="Fixed nights" />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 130 }}>
        <p className="dvintro">Nights that are usually the same, like pizza on Fridays. "Fill the week" starts from these.</p>
        <section className="dvsec">
          {days.map((n, i) => {
            const r = din?.rules?.[String(i)], name = r ? (r.meal ? din?.meals.find(m => m.id === r.meal)?.name : KINDS[r.kind]) : null;
            return (
              <button key={n} className="fn-row" onClick={() => openSheet({ mode: "rule", weekday: i })}>
                <span className="fn-d">{n.slice(0, 3)}</span>
                <span className="dvit"><b>{n}s</b><small>{name || "Nothing fixed"}</small></span>
                {name ? <FoodIcon name={name} size={52} /> : <span className="dplus" aria-hidden>+</span>}
              </button>
            );
          })}
        </section>
        <button className="dvbtn dark" style={{ marginTop: 16, alignSelf: "flex-start" }} onClick={() => setDview({ v: "suggest" })}>Fill the week from these</button>
      </div>
    </div>
  );
}

/* ---------- what we've eaten ---------- */
export function History({ din }: { din: Dinners | undefined }) {
  const { dim, now, setDview } = useHub();
  const P = dim.phone, stats = useStats(din, now);
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const nextM = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const days = Object.entries(din?.plan || {}).filter(([d]) => d >= ymd(month) && d < ymd(nextM)).sort(([a], [b]) => b.localeCompare(a));
  const top = Object.entries(stats).filter(([, s]) => s.count).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const t = ymd(now), cutoff = ymd(addDays(startOfDay(now), -56));
  const lapsed = (din?.meals || []).filter(m => { const s = stats[m.id]; return !s?.next && (!s?.last || s.last < cutoff); }).sort((a, b) => (stats[a.id]?.last || "").localeCompare(stats[b.id]?.last || "")).slice(0, 8);
  const name = (n: { meal: string; kind?: string }) => n.meal ? din?.meals.find(m => m.id === n.meal)?.name : KINDS[n.kind || ""];
  return (
    <div style={wrap(P)}>
      <Top back="This week" to={{ v: "week" }} title="What we've eaten" />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 130 }}>
        <div className="fx dvweek">
          <button className="cnav" aria-label="Earlier month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevL /></button>
          <span className="dvweek-t">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</span>
          <button className="cnav" aria-label="Later month" onClick={() => setMonth(nextM)}><ChevR /></button>
        </div>
        {days.length ? (
          <section className="dvsec">{days.map(([d, n]) => { const nm = name(n); return (
            <button key={d} className="fn-row" disabled={!n.meal} onClick={() => n.meal && setDview({ v: "meal", id: n.meal })}>
              <span className="fn-d hd"><small>{fromYmd(d).toLocaleDateString([], { weekday: "short" })}</small>{fromYmd(d).getDate()}</span>
              <span className="dvit"><b>{nm || "A dinner that's been removed"}</b>{d > t ? <small>Planned</small> : d === t ? <small>Tonight</small> : null}</span>
              {nm ? <FoodIcon name={nm} size={48} /> : null}
            </button>
          ); })}</section>
        ) : <p className="dvintro">Nothing planned in this month.</p>}
        {top.length ? <><h3 className="dvh">Had most often</h3><section className="dvsec">{top.map(([id, s]) => { const m = din!.meals.find(x => x.id === id); return (
          <button key={id} className="fn-row" onClick={() => setDview({ v: "meal", id })}><FoodIcon name={m?.name || ""} size={48} /><span className="dvit"><b>{m?.name}</b><small>{s.count} times · last {ago(s.last!, now)}</small></span><Chev /></button>
        ); })}</section></> : null}
        {lapsed.length ? <><h3 className="dvh">Not had for a while</h3><section className="dvsec">{lapsed.map(m => (
          <button key={m.id} className="fn-row" onClick={() => setDview({ v: "meal", id: m.id })}><FoodIcon name={m.name} size={48} /><span className="dvit"><b>{m.name}</b><small>{stats[m.id]?.last ? `Last had ${ago(stats[m.id].last!, now)}` : "Not had yet"}</small></span><Chev /></button>
        ))}</section></> : null}
      </div>
    </div>
  );
}

/* ---------- cooking mode ---------- */
type Timer = { id: number; label: string; end: number; done: boolean; alerted: boolean };
let timers: Timer[] = [], tid = 0;
const subs = new Set<() => void>();
const poke = () => subs.forEach(f => f());
function beep() {
  try {
    const A = window.AudioContext || (window as any).webkitAudioContext, c = new A();
    [0, .35, .7].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(.25, c.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t + .3); o.start(c.currentTime + t); o.stop(c.currentTime + t + .3); });
  } catch { /* no sound is fine: the banner still shows */ }
}
function useTimers() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick(n => n + 1); subs.add(f);
    const t = setInterval(() => { let hit = false; timers.forEach(x => { if (!x.done && Date.now() >= x.end) { x.done = true; if (!x.alerted) { x.alerted = true; hit = true; } } }); if (hit) beep(); f(); }, 500);
    return () => { subs.delete(f); clearInterval(t); };
  }, []);
  return timers;
}
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function Cook({ din, id }: { din: Dinners | undefined; id: string }) {
  const { dim, now, setDview, openSheet, soon } = useHub();
  const qc = useQueryClient();
  const { data: pan = NO_PANTRY } = usePantry();
  const P = dim.phone, m = din?.meals.find(x => x.id === id), list = useTimers();
  useHold(true);      // cooking: the screen stays up
  const steps = useMemo(() => stepsOf(m?.notes || ""), [m?.notes]);
  const [i, setI] = useState(0), [tab, setTab] = useState<"steps" | "food">("steps"), [done, setDone] = useState<number[]>([]);
  const today = ymd(now), planned = din?.plan[today]?.meal === id;
  const [n, setN] = useState(() => planned ? cookingFor(din, [], today, m) : m?.serves || 4);
  if (!m) return <div style={wrap(P)}><Top back="Dinners" to={{ v: "home" }} title="Cooking" /></div>;
  const factor = m.serves ? n / m.serves : 1;
  /** Done cooking: take what the dinner used off the pantry (after a look, or at once with an Undo, as set on the Pantry page's Shops tab). */
  const finish = async () => {
    const rows = planUse(m, pan, factor);
    setDview({ v: "home" });
    if (!rows.length) return;
    if (pan.settings.ask_before_use) { openSheet({ mode: "usepantry", meal: m.id, factor }); return; }
    const uses = rows.filter(r => r.used > 0).map(r => ({ id: r.item.id, delta: -r.used }));
    if (!uses.length) return;
    try {
      await post("/api/pantry/use", { uses });
      qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] });
      soon(`Pantry updated: ${uses.length} ${uses.length === 1 ? "thing" : "things"} used.`, async () => { try { await post("/api/pantry/use", { uses: uses.map(u => ({ id: u.id, delta: -u.delta })) }); qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); } catch (e: any) { soon(e.message); } });
    } catch (e: any) { soon(e.message); }
  };
  const start = (mins: number) => { timers = [...timers, { id: ++tid, label: `${mins} min`, end: Date.now() + mins * 60000, done: false, alerted: false }]; poke(); };
  const alarming = list.filter(t => t.done);
  return (
    <div style={wrap(P)}>
      <Top back={m.name} to={{ v: "meal", id }} title="Cooking" right={<button className="dvbtn dark" onClick={finish}>Finish</button>} />
      {alarming.map(t => <button key={t.id} className="cktimer alarm" onClick={() => { timers = timers.filter(x => x.id !== t.id); poke(); }}><Bell />{t.label} timer is done. Tap to stop.</button>)}
      <div className="dvtabs"><div className="dvseg" role="tablist" aria-label="Cooking"><button role="tab" aria-selected={tab === "steps"} className={tab === "steps" ? "on" : ""} onClick={() => setTab("steps")}>Steps</button><button role="tab" aria-selected={tab === "food"} className={tab === "food" ? "on" : ""} onClick={() => setTab("food")}>Ingredients</button></div></div>
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 150 }}>
        {tab === "steps" ? (
          steps.length ? (
            <>
              <div className="ckstep"><small>Step {i + 1} of {steps.length}</small><p>{steps[i]}</p></div>
              <div className="ckdots" aria-hidden>{steps.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "past" : ""} />)}</div>
              <div className="fx" style={{ gap: 12, marginTop: 16 }}>
                <button className="ckbtn" disabled={i === 0} onClick={() => setI(i - 1)}><ChevL /> Back</button>
                <button className="ckbtn primary" disabled={i === steps.length - 1} onClick={() => setI(i + 1)}>Next <ChevR /></button>
              </div>
            </>
          ) : <p className="dvnone" style={{ fontSize: 22 }}>No steps yet. Put the method in the dinner's notes, one step to a line, and it shows here in big type.</p>
        ) : (
          <>
            <div className="fx dvrow"><span>Cooking for</span><div className="fx" style={{ gap: 12 }}><button className="cnav" aria-label="Fewer" onClick={() => setN(Math.max(1, n - 1))}>−</button><span className="num" style={{ minWidth: 40, textAlign: "center", fontSize: 28, fontWeight: 700 }}>{n}</span><button className="cnav" aria-label="More" onClick={() => setN(Math.min(50, n + 1))}>+</button></div></div>
            {(m.ingredients || []).map(g => { const on = done.includes(+g.id.replace(/\D/g, "")) ; return (
              <button key={g.id} className={"srow" + (on ? " done" : "")} style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: 0 }} onClick={() => setDone(on ? done.filter(x => x !== +g.id.replace(/\D/g, "")) : [...done, +g.id.replace(/\D/g, "")])}>
                <span className="stk" style={{ fontSize: 26 }}><span className="chk" aria-hidden>{on ? <Check /> : null}</span><span className="sn">{g.name}<small className="snote" style={{ fontSize: 19 }}>{scaleAmount(g.amount, factor)}</small></span></span>
              </button>
            ); })}
          </>
        )}
        <h3 className="dvh">Timers</h3>
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>{[5, 10, 15, 20, 30, 45, 60].map(mn => <button key={mn} className="chip" onClick={() => start(mn)}>{mn} min</button>)}</div>
        {list.filter(t => !t.done).map(t => <div key={t.id} className="cktimer"><span className="num">{mmss(t.end - Date.now())}</span><small>{t.label} timer</small><button className="cnav" aria-label="Cancel timer" onClick={() => { timers = timers.filter(x => x.id !== t.id); poke(); }}><XIcon /></button></div>)}
      </div>
    </div>
  );
}
