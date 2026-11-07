import { useRef, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO, post } from "../lib/api";
import { addDays, dayDiff, fromYmd, startOfDay, ymd } from "../lib/dates";
import { PALETTE, tint } from "../lib/events";
import { SHEET_MS, useAutoFocus } from "../lib/focus";
import { useEvents } from "../data";
import { useHub } from "../hub";
import { Lab, Pill, SheetFrame } from "./SheetFrame";

/** A countdown on the Home page: days until a holiday, a birthday, a trip. A yearly one counts to its next time. */
export type Countdown = { id: string; title: string; date: string; icon: string; color: string; yearly: boolean };

export function useCountdowns() {
  return useQuery<{ items: Countdown[] }>({ queryKey: ["countdowns"], queryFn: () => DEMO ? Promise.resolve(demoCountdowns()) : api("/api/countdowns"), refetchInterval: 300000 });
}
function demoCountdowns() {
  const t = startOfDay(new Date());
  return { items: [
    { id: "d1", title: "Christmas", date: `${t.getFullYear()}-12-25`, icon: "🎄", color: "#14a06c", yearly: true },
    { id: "d2", title: "School holidays", date: ymd(addDays(t, 41)), icon: "🎒", color: "#f59e0b", yearly: false },
    { id: "d3", title: "Beach trip", date: ymd(addDays(t, 9)), icon: "🏖️", color: "#0ea5b7", yearly: false },
  ] };
}

/** The next time a countdown's day comes round, from today (a 29 February falls on the 28th in other years). */
export function nextOf(c: Pick<Countdown, "date" | "yearly">, today: Date): Date {
  const d = fromYmd(c.date);
  if (!c.yearly) return d;
  for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
    const last = new Date(y, d.getMonth() + 1, 0).getDate();
    const day = new Date(y, d.getMonth(), Math.min(d.getDate(), last));
    if (day >= today) return day;
  }
  return d;
}
const daysWord = (n: number) => n === 0 ? "Today!" : n === 1 ? "Tomorrow" : `${n} days to go`;

/** A picture for a countdown from its name, until one is picked. */
const GUESS: [RegExp, string][] = [
  [/christmas|xmas/i, "🎄"], [/birthday|bday/i, "🎂"], [/easter/i, "🐣"], [/hallowe/i, "🎃"], [/new year/i, "🎆"],
  [/beach|holiday|vacation/i, "🏖️"], [/school/i, "🎒"], [/flight|fly|trip|travel|overseas/i, "✈️"], [/camp/i, "⛺"],
  [/wedding|anniversary/i, "💍"], [/baby/i, "👶"], [/party/i, "🎉"], [/concert|show|gig/i, "🎵"], [/game|match|final/i, "⚽"],
];
const guessIcon = (t: string) => GUESS.find(([r]) => r.test(t))?.[1] || "";
const ICONS = ["⭐", "🎉", "🎂", "🎄", "🏖️", "✈️", "🎒", "⛺", "🐣", "🎃", "🎆", "💍", "👶", "🎵", "⚽", "🏠"];

/** The Home page card: the countdowns, soonest first, each a soft tile in its colour. Tap one to change it. */
export function CountdownCard() {
  const { now, openSheet, dim } = useHub();
  const { data } = useCountdowns();
  if (!data) return null;
  const today = startOfDay(now);
  const list = data.items.map(c => { const d = nextOf(c, today); return { c, d, n: dayDiff(d, today) }; }).filter(x => x.n >= 0).sort((a, b) => a.n - b.n);
  if (!list.length) return (
    <button className="tile-card cd-empty" onClick={() => openSheet({ mode: "countdown", id: null })}>
      <span className="cd-ico" aria-hidden>⏳</span>
      <span><b>Add a countdown</b><span>Days to go until a holiday, a birthday or a trip</span></span>
      <span className="cd-plus" aria-hidden>+</span>
    </button>
  );
  const shown = list.slice(0, dim.phone ? 4 : 6);
  return (
    <section id="countdowns" className="tile-card cdcard">
      <div className="tc-top">
        <h2 className="tc-h">Counting down</h2>
        <button className="tc-open" onClick={() => openSheet({ mode: "countdown", id: null })}>+ Add</button>
      </div>
      <div className="cd-grid" style={{ gridTemplateColumns: `repeat(${dim.phone ? 2 : Math.min(3, shown.length)},minmax(0,1fr))` }}>
        {shown.map(({ c, d, n }) => {
          const col = c.color || "#8a93a6";
          return (
            <button key={c.id} className={"cd-tile" + (n === 0 ? " now" : "")} style={{ "--cc": col, background: tint(col) } as CSSProperties}
              aria-label={`${c.title}: ${daysWord(n)}, ${d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}. Change it`}
              onClick={() => openSheet({ mode: "countdown", id: c.id })}>
              <span className="cd-top"><span className="cd-ico" aria-hidden>{c.icon || "⭐"}</span><span className="cd-t">{c.title}</span></span>
              {n > 1 ? <span className="cd-n num">{n}<small>days</small></span> : <span className="cd-n num cd-word">{n === 0 ? "Today!" : "Tomorrow"}</span>}
              <span className="cd-d">{d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Add or change a countdown. Quick picks come from the calendar (holidays, birthdays, anything all day) in the next few months. */
export function CountdownSheet({ id }: { id: string | null }) {
  const { closeSheet, soon, now, people } = useHub();
  const qc = useQueryClient();
  const { data } = useCountdowns();
  const cur = data?.items.find(c => c.id === id);
  const today = startOfDay(now);
  const [c, setC] = useState<Countdown>(() => cur || { id: "", title: "", date: "", icon: "", color: PALETTE[(data?.items.length || 0) % PALETTE.length], yearly: false });
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const pickedIcon = useRef(!!cur);
  const nameRef = useRef<HTMLInputElement>(null);
  useAutoFocus(nameRef, SHEET_MS, !cur);
  const set = (p: Partial<Countdown>) => { setErr(""); setC(x => ({ ...x, ...p, ...(p.title !== undefined && !pickedIcon.current ? { icon: guessIcon(p.title) } : {}) })); };

  const { data: evs } = useEvents(today, addDays(today, 99))      // the hub answers up to 100 days at a time;
  const picks: { title: string; date: string; yearly: boolean; key: string }[] = [];
  const seen = new Set<string>();
  const add = (title: string, date: string, yearly: boolean) => { const k = title.toLowerCase(); if (!seen.has(k)) { seen.add(k); picks.push({ title, date, yearly, key: k + date }); } };
  for (const p of people) if (p.birthday) add(`${p.name}'s birthday`, p.birthday, true);
  for (const e of (evs?.list || []).filter(e => e.all_day && e.s >= today && e.cal !== "birthdays").sort((a, b) => +a.s - +b.s)) add(e.title, ymd(e.s), false);
  add("Christmas", `${today.getFullYear()}-12-25`, true);
  const shownPicks = cur ? [] : picks.filter(p => !(data?.items || []).some(x => x.title.toLowerCase() === p.title.toLowerCase())).slice(0, 10);

  const left = c.date ? dayDiff(nextOf(c, today), today) : null;
  const save = async () => {
    if (!c.title.trim()) { setErr("Give it a name first."); nameRef.current?.focus({ preventScroll: true }); return; }
    if (!c.date) { setErr("Pick the day."); return; }
    setBusy(true);
    try { await post("/api/countdown", { ...c, title: c.title.trim(), icon: c.icon || "⭐" }); qc.invalidateQueries({ queryKey: ["countdowns"] }); closeSheet(); }
    catch (e: any) { setErr(e.message || "Couldn't save that."); setBusy(false); }
  };
  const remove = async () => {
    if (!cur) return;
    setBusy(true);
    try {
      await post("/api/countdown/delete", { id: cur.id });
      qc.invalidateQueries({ queryKey: ["countdowns"] }); closeSheet();
      soon(`${cur.title} taken off.`, async () => { await post("/api/countdown", { ...cur, id: "" }); qc.invalidateQueries({ queryKey: ["countdowns"] }); });
    } catch (e: any) { setErr(e.message || "Couldn't take that off."); setBusy(false); }
  };

  const body = (
    <>
      <div className="fx" style={{ gap: 12, marginTop: 14 }}>
        <span className="cd-big" style={{ background: tint(c.color || "#8a93a6") }} aria-hidden>{c.icon || "⭐"}</span>
        <input ref={nameRef} value={c.title} onChange={e => set({ title: e.target.value })} maxLength={40} placeholder="What are you counting down to?" aria-label="Name" autoComplete="off" enterKeyHint="done" style={{ flex: 1, minWidth: 0, fontSize: 24, fontWeight: 700, minHeight: 72 }} />
      </div>
      {shownPicks.length ? <>
        <Lab>Coming up</Lab>
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
          {shownPicks.map(p => <Pill key={p.key} onClick={() => { pickedIcon.current = false; set({ title: p.title, date: p.date, yearly: p.yearly }); }}>{guessIcon(p.title) || "⭐"} {p.title}</Pill>)}
        </div>
      </> : null}

      <Lab>Which day?</Lab>
      <div className="fx" style={{ gap: 12, flexWrap: "wrap" }}>
        <input type="date" value={c.date} min={c.yearly ? undefined : ymd(today)} max="2100-12-31" aria-label="Day" onChange={e => set({ date: e.target.value })} style={{ width: 240, fontSize: 20, fontWeight: 600 }} />
        <Pill on={!c.yearly} onClick={() => set({ yearly: false })}>Just once</Pill>
        <Pill on={c.yearly} onClick={() => set({ yearly: true })}>Every year</Pill>
      </div>
      <p className="cd-left">{left === null ? "Pick a day and it'll count down to it." : left < 0 ? "That day has already gone." : left === 0 ? "That's today!" : left === 1 ? "That's tomorrow." : `That's ${left} days away.`}</p>

      <Lab>Picture</Lab>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
        {ICONS.map(i => <Pill key={i} on={c.icon === i} style={{ fontSize: 24, padding: "0 12px" }} onClick={() => { pickedIcon.current = true; set({ icon: i }); }}>{i}</Pill>)}
      </div>

      <Lab>Colour</Lab>
      <div className="fx" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {PALETTE.map(col => <button key={col} className={"sw" + (col === c.color ? " on" : "")} aria-label={"Colour " + col} style={{ background: col }} onClick={() => set({ color: col })} />)}
      </div>
    </>
  );
  return <SheetFrame title={cur ? "Countdown" : "New countdown"} error={err} body={body} foot={<>
    {cur ? <button className="danger-o" disabled={busy} onClick={remove}>Take it off</button> : null}
    <button className="primary" disabled={busy} onClick={save} style={{ marginLeft: "auto", minWidth: 200 }}>{cur ? "Save" : "Add countdown"}</button>
  </>} />;
}
