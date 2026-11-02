import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEMO, post } from "../lib/api";
import { addDays, fromYmd, startOfDay, ymd } from "../lib/dates";
import { SearchIcon } from "../lib/icons";
import { KINDS, useDinners, type Meal } from "../data";
import { useHub } from "../hub";
import { FoodIcon } from "../lib/foodicons";
import { ago, clashText, dietClash, useStats } from "../lib/dinnerlib";
import { SheetFrame } from "./SheetFrame";

/* The sheets for planning dinners, in the calm style: one picker everywhere (search, or type a new one; Leftovers,
   Takeaway and Eating out; the family's dinners as picture tiles, favourites and the ones not had for a while first). */

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Saves a dinner-plan change, or says it isn't saved in the demo. */
function usePlan() {
  const qc = useQueryClient();
  const { soon } = useHub();
  return async (path: string, body: unknown): Promise<boolean> => {
    if (DEMO) { soon("That isn't saved in the demo."); return true; }
    try { await post(path, body); await qc.invalidateQueries({ queryKey: ["dinners"] }); return true; } catch (e: any) { soon(e.message || "Couldn't save that."); return false; }
  };
}

/** Search the dinners or type a new one; pick a kind of night; tap a tile. */
export function DinnerPicker({ current, currentKind, onMeal, onKind, onNew, none }: { current?: string; currentKind?: string; onMeal: (m: Meal) => void; onKind?: (k: string) => void; onNew?: (name: string) => void; none?: { label: string; on: boolean; pick: () => void } }) {
  const { now } = useHub();
  const { data: din } = useDinners();
  const stats = useStats(din, now);
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const meals = useMemo(() => [...(din?.meals || [])].sort((a, b) =>
    (+!!b.favourite - +!!a.favourite) || (stats[a.id]?.last || "").localeCompare(stats[b.id]?.last || "") || a.name.localeCompare(b.name)), [din, stats]);
  const shown = t ? meals.filter(m => m.name.toLowerCase().includes(t) || (m.ingredients || []).some(i => i.name.toLowerCase().includes(t))) : meals;
  const exact = meals.some(m => m.name.toLowerCase() === t);
  const meta = (m: Meal) => { const s = stats[m.id]; return s?.next ? (s.next === ymd(now) ? "On tonight" : "Planned already") : s?.last ? "Had " + ago(s.last, now) : "Not had yet"; };
  return (
    <div className="dp">
      <form className="dvsearch" onSubmit={e => { e.preventDefault(); if (onNew && t && !exact) onNew(q.trim()); else if (shown.length === 1) onMeal(shown[0]); }}>
        <SearchIcon />
        <input value={q} onChange={e => setQ(e.target.value)} maxLength={40} placeholder={onNew ? "Find a dinner, or type a new one" : "Find a dinner"} aria-label="Find a dinner" autoComplete="off" enterKeyHint="go" />
      </form>
      {onKind || none ? (
        <div className="dp-kinds">
          {none ? <button className={"chip" + (none.on ? " on" : "")} aria-pressed={none.on} onClick={none.pick}>{none.label}</button> : null}
          {onKind ? Object.entries(KINDS).map(([k, l]) => <button key={k} className={"chip" + (currentKind === k ? " on" : "")} aria-pressed={currentKind === k} onClick={() => onKind(k)}>{l}</button>) : null}
        </div>
      ) : null}
      {onNew && t && !exact ? (
        <button className="dp-new" onClick={() => onNew(q.trim())}>
          <FoodIcon name={q} size={52} />
          <span><b>{q.trim()}</b><small>Add it as a new dinner</small></span>
          <span className="dp-plus" aria-hidden>+</span>
        </button>
      ) : null}
      {shown.length ? <div className="dp-grid">{shown.map(m => (
        <button key={m.id} className={"dp-meal" + (current === m.id ? " on" : "")} aria-pressed={current === m.id} onClick={() => onMeal(m)}>
          <FoodIcon name={m.name} size={52} />
          <span><b>{m.name}{m.favourite ? <i className="dvstar" aria-label="Favourite">★</i> : null}</b><small>{current === m.id ? "Chosen" : meta(m)}</small></span>
        </button>
      ))}</div> : onNew && t && !exact ? null : <p className="dp-none">{meals.length ? "No dinners match." : onNew ? "No dinners yet. Type one above to add it." : "No dinners yet. Add some on the Dinner ideas tab."}</p>}
    </div>
  );
}

const Av = ({ name, color }: { name: string; color: string }) => <i className="ds-av" style={{ "--pc": color } as React.CSSProperties}>{(name.trim()[0] || "?").toUpperCase()}</i>;

/** One night: what's for dinner, who's cooking, who's home. */
export function DaySheet({ date, cook: startCook }: { date: string; cook: string | null }) {
  const { people, now, closeSheet, setDview } = useHub();
  const { data: din } = useDinners();
  const plan = usePlan();
  const [cook, setCook] = useState(startCook);
  const d = fromYmd(date), cur = din?.plan[date], curMeal = cur?.meal ? din?.meals.find(m => m.id === cur.meal) : undefined;
  const curName = curMeal?.name || (cur?.kind ? KINDS[cur.kind] : "");
  const away = cur?.away || [], home = people.filter(p => !away.includes(p.id));
  const clash = clashText(dietClash(curMeal, home));
  const night = { date, meal_id: cur?.meal || "", kind: cur?.kind || "", cook };
  const diff = Math.round((+startOfDay(d) - +startOfDay(now)) / 864e5);
  const when = diff === 0 ? "Tonight" : diff === 1 ? "Tomorrow" : diff === -1 ? "Last night" : d.toLocaleDateString([], { weekday: "long" });
  const pickAndClose = async (body: unknown) => { if (await plan("/api/dinner-plan", body)) closeSheet(); };
  const serves = cur?.serves || home.length || curMeal?.serves || 4;
  const body = (
    <div className="ds">
      <p className="ds-date">{d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
      {cur && curName ? (
        <section className="ds-cur">
          <FoodIcon name={curName} size={76} />
          <span className="ds-curm"><small>{when}</small><b>{curName}</b></span>
          {curMeal ? <button className="dvbtn" onClick={() => { closeSheet(); setDview({ v: "meal", id: curMeal.id }); }}>Recipe</button> : null}
        </section>
      ) : null}
      {clash ? <p className="tn-warn">{clash}</p> : null}

      {people.length ? (
        <section className="ds-sec">
          <h3>Who's cooking?</h3>
          <div className="ds-people">{people.map(p => { const on = cook === p.id; return (
            <button key={p.id} className={"ds-person" + (on ? " on" : "")} aria-pressed={on} style={{ "--pc": p.color } as React.CSSProperties} onClick={() => {
              const next = on ? null : p.id; setCook(next);
              if (cur) plan("/api/dinner-plan", { ...night, cook: next });      // a planned night changes at once
            }}><Av name={p.name} color={p.color} />{p.name}</button>
          ); })}</div>
        </section>
      ) : null}

      {cur && people.length ? (
        <section className="ds-sec">
          <h3>Who's home?</h3>
          <div className="ds-people">{people.map(p => { const out = away.includes(p.id); return (
            <button key={p.id} className={"ds-person" + (out ? " away" : " on")} aria-pressed={!out} style={{ "--pc": p.color } as React.CSSProperties} onClick={() => plan("/api/dinner-plan", { ...night, away: out ? away.filter(x => x !== p.id) : [...away, p.id] })}><Av name={p.name} color={p.color} />{p.name}{out ? <small>away</small> : null}</button>
          ); })}</div>
          <div className="ds-for">
            <span>Cooking for</span>
            <button className="cnav" aria-label="Fewer" onClick={() => plan("/api/dinner-plan", { ...night, serves: Math.max(1, serves - 1) })}>−</button>
            <b className="num">{serves}</b>
            <button className="cnav" aria-label="More" onClick={() => plan("/api/dinner-plan", { ...night, serves: Math.min(50, serves + 1) })}>+</button>
          </div>
        </section>
      ) : null}

      <section className="ds-sec">
        <h3>{cur ? "Change to" : "What's for dinner?"}</h3>
        <DinnerPicker current={cur?.meal} currentKind={cur?.kind}
          onMeal={m => pickAndClose({ date, meal_id: m.id, cook })}
          onKind={k => pickAndClose({ date, kind: k, cook })}
          onNew={name => pickAndClose({ date, name, cook })} />
      </section>
    </div>
  );
  return <SheetFrame title={when === "Tonight" ? "Tonight's dinner" : `${when}'s dinner`} body={body}
    foot={<>{cur ? <button className="danger-o" onClick={() => pickAndClose({ date })}>Clear this night</button> : null}<button className="primary" style={{ marginLeft: "auto", minWidth: 180 }} onClick={closeSheet}>Done</button></>} />;
}

/** Pick a night for this dinner: the next two weeks, free nights first to the eye. */
export function PlanMealSheet({ meal }: { meal: string }) {
  const { closeSheet, now, soon } = useHub();
  const { data: din } = useDinners();
  const plan = usePlan();
  const m = din?.meals.find(x => x.id === meal);
  const days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(now), i));
  const pick = async (d: Date) => { if (await plan("/api/dinner-plan", { date: ymd(d), meal_id: meal, cook: din?.plan[ymd(d)]?.cook || null })) { closeSheet(); if (!DEMO) soon(`${m?.name || "Dinner"} planned for ${d.toLocaleDateString([], { weekday: "long" })}.`); } };
  return <SheetFrame title={m ? `When's ${m.name}?` : "Plan it"} foot={<button className="primary" style={{ marginLeft: "auto", minWidth: 180 }} onClick={closeSheet}>Cancel</button>} body={
    <div className="ds">
      <p className="ds-date">Pick a night. A night that's already planned gets this instead.</p>
      <div className="pm-grid">{days.map((d, i) => {
        const p = din?.plan[ymd(d)], cur = p?.meal ? din?.meals.find(x => x.id === p.meal)?.name : p?.kind ? KINDS[p.kind] : "", same = p?.meal === meal;
        return (
          <button key={i} className={"pm-day" + (cur ? " taken" : "") + (same ? " on" : "")} disabled={same} onClick={() => pick(d)}>
            <span className="pm-d"><small>{i === 0 ? "Today" : d.toLocaleDateString([], { weekday: "short" })}</small><b className="num">{d.getDate()}</b></span>
            <span className="pm-m">{same ? "This one" : cur ? <>{cur}<small>Swap it</small></> : <span className="pm-free">Free</span>}</span>
          </button>
        );
      })}</div>
    </div>
  } />;
}

/** A night of the week that's usually the same (pizza on Fridays). */
export function RuleSheet({ weekday }: { weekday: number }) {
  const { closeSheet } = useHub();
  const { data: din } = useDinners();
  const plan = usePlan();
  const r = din?.rules?.[String(weekday)];
  const set = async (meal: string, kind: string) => { if (await plan("/api/dinner-rule", { weekday, meal, kind })) closeSheet(); };
  return <SheetFrame title={DAYS[weekday] + "s are…"} foot={<button className="primary" style={{ marginLeft: "auto", minWidth: 180 }} onClick={closeSheet}>Done</button>} body={
    <div className="ds">
      <p className="ds-date">"Fill the week" starts from fixed nights.</p>
      <DinnerPicker current={r?.meal} currentKind={r?.kind} none={{ label: "Nothing fixed", on: !r || (!r.meal && !r.kind), pick: () => set("", "") }}
        onMeal={m => set(m.id, "")} onKind={k => set("", k)} />
    </div>
  } />;
}
