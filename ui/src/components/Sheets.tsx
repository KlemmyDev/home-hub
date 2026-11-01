import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { addDays, dayDiff, fmtT, fromYmd, hmOf, longDay, ymd } from "../lib/dates";
import type { Ev } from "../lib/events";
import { useDinners } from "../data";
import { useHub, type EventDraft, type Sheet } from "../hub";
import { FamilyEditor } from "./Family";
import { Lab, Pill, SheetFrame } from "./SheetFrame";
import { StepsSheet } from "./Chores";

const DAYCODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const dot = (c: string) => <i style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />;

export function newEventDraft(day: Date, hour: number | undefined, now: Date, who: string | null): EventDraft {
  const h = hour !== undefined ? hour : ymd(day) === ymd(now) ? Math.min(20, Math.max(8, now.getHours() + 1)) : 9;
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(h), (h % 1) * 60), e = new Date(+s + 3600000);
  return { id: "", title: "", location: "", allDay: false, sd: ymd(s), st: hmOf(s), ned: ymd(e), net: hmOf(e), people: who ? [who] : [], freq: "none", interval: 1, days: [DAYCODES[(s.getDay() + 6) % 7]], untilOn: false, until: ymd(addDays(s, 90)) };
}
export async function loadEventDraft(e: Ev): Promise<EventDraft> {
  const h = await api("/api/hub-event?id=" + encodeURIComponent(e.series!));
  const s = h.all_day ? null : new Date(h.start), en = h.all_day ? null : new Date(h.end);
  const first = h.all_day ? new Date(h.start + "T00:00") : s!;
  return {
    id: h.id, occ: e.start, title: h.title, location: h.location, allDay: h.all_day,
    sd: h.all_day ? h.start : ymd(s!), st: h.all_day ? "09:00" : hmOf(s!), ned: h.all_day ? h.end : ymd(en!), net: h.all_day ? "10:00" : hmOf(en!),
    people: h.people.slice(), freq: h.repeat.freq, interval: h.repeat.interval,
    days: h.repeat.days.length ? h.repeat.days.slice() : [DAYCODES[(first.getDay() + 6) % 7]],
    untilOn: !!h.repeat.until, until: h.repeat.until || ymd(addDays(first, 90)),
  };
}

function EventSheet({ draft: start }: { draft: EventDraft }) {
  const { people, closeSheet, openSheet } = useHub();
  const qc = useQueryClient();
  const [t, setT] = useState(start);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<EventDraft>) => setT(x => ({ ...x, ...p }));
  const editing = !!t.id, rep = t.freq !== "none";
  const unit = ({ daily: "day", weekly: "week", monthly: "month", yearly: "year" } as any)[t.freq] || "";
  const startAt = () => new Date(`${t.sd}T${t.st}`);
  const dur = Math.round((+new Date(`${t.ned}T${t.net}`) - +startAt()) / 60000);
  const done = () => { closeSheet(); qc.invalidateQueries({ queryKey: ["events"] }); };
  const save = async () => {
    const body = { id: t.id, title: t.title, location: t.location, all_day: t.allDay, start: t.allDay ? t.sd : `${t.sd}T${t.st}`, end: t.allDay ? t.ned : `${t.ned}T${t.net}`, people: t.people,
      repeat: { freq: t.freq, interval: t.interval, days: t.freq === "weekly" ? t.days : [], until: t.freq !== "none" && t.untilOn ? t.until : null } };
    try { await post("/api/hub-event", body); done(); } catch (e: any) { setErr(e.message); }
  };
  const del = async (only: boolean) => { try { await post("/api/hub-event/delete", { id: t.id, only: only ? t.occ : null }); done(); } catch (e: any) { setErr(e.message); } };
  const changeDate = (k: "sd" | "st" | "ned" | "net" | "until", v: string) => {
    const before = +new Date(`${t.ned}T${t.net}`) - +startAt(), n = { ...t, [k]: v };
    if (k === "sd" || k === "st") {      // keep the length when the start moves
      if (n.allDay) { if (n.ned < n.sd) n.ned = n.sd; }
      else if (before > 0 && n.sd && n.st) { const e = new Date(+new Date(`${n.sd}T${n.st}`) + before); n.ned = ymd(e); n.net = hmOf(e); }
    }
    setT(n);
  };
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  const dateRow = (a: "sd" | "ned", b: "st" | "net") => (
    <div className="fx" style={{ gap: 12 }}>
      <input type="date" value={t[a]} onChange={e => changeDate(a, e.target.value)} style={t.allDay ? undefined : { flex: 3 }} />
      {t.allDay ? null : <input type="time" value={t[b]} onChange={e => changeDate(b, e.target.value)} style={{ flex: 2 }} />}
    </div>
  );
  const body = (
    <>
      <input value={t.title} onChange={e => set({ title: e.target.value })} maxLength={80} placeholder="What's happening?" autoComplete="off" style={{ fontSize: 28, fontWeight: 650, minHeight: 72, marginTop: 8 }} />
      <div className="fx" style={{ justifyContent: "space-between", marginTop: 20 }}>
        <span style={{ fontSize: 22, fontWeight: 650 }}>All day</span>
        <button role="switch" aria-checked={t.allDay} className={"sw2" + (t.allDay ? " on" : "")} onClick={() => set({ allDay: !t.allDay, ...(!t.allDay && t.ned < t.sd ? { ned: t.sd } : {}) })}><i /></button>
      </div>
      <Lab>Starts</Lab>{dateRow("sd", "st")}
      <Lab>{t.allDay ? "Last day" : "Ends"}</Lab>{dateRow("ned", "net")}
      {t.allDay ? null : (
        <div className="fx" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {([[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [180, "3 hours"]] as const).map(([m, l]) =>
            <Pill key={m} on={dur === m} onClick={() => { const e = new Date(+startAt() + m * 60000); set({ ned: ymd(e), net: hmOf(e) }); }}>{l}</Pill>)}
        </div>
      )}
      <Lab>Repeats</Lab>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
        {[["none", "Never"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]].map(([v, l]) => <Pill key={v} on={t.freq === v} onClick={() => set({ freq: v })}>{l}</Pill>)}
      </div>
      {rep ? (
        <div className="fx" style={{ gap: 14, marginTop: 14 }}>
          <span style={{ fontSize: 20, fontWeight: 600 }}>Every</span>
          <button className="cnav" aria-label="Fewer" onClick={() => set({ interval: Math.max(1, t.interval - 1) })}>&minus;</button>
          <span className="num" style={{ fontSize: 26, fontWeight: 700, minWidth: 34, textAlign: "center" }}>{t.interval}</span>
          <button className="cnav" aria-label="More" onClick={() => set({ interval: Math.min(30, t.interval + 1) })}>+</button>
          <span style={{ fontSize: 20, fontWeight: 600 }}>{unit}{t.interval > 1 ? "s" : ""}</span>
        </div>
      ) : null}
      {t.freq === "weekly" ? (
        <div className="fx" style={{ gap: 8, marginTop: 14 }}>
          {DAYCODES.map((c, i) => <button key={c} className={"pill dow" + (t.days.includes(c) ? " on" : "")} aria-label={DAYNAMES[i]} style={{ padding: 0, width: 52, justifyContent: "center" }} onClick={() => set({ days: toggle(t.days, c) })}>{"MTWTFSS"[i]}</button>)}
        </div>
      ) : null}
      {rep ? (
        <div className="fx" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <Pill on={!t.untilOn} onClick={() => set({ untilOn: false })}>Carries on</Pill><Pill on={t.untilOn} onClick={() => set({ untilOn: true })}>Until a day</Pill>
          {t.untilOn ? <input type="date" value={t.until} onChange={e => set({ until: e.target.value })} style={{ width: "auto", flex: 1, minWidth: 220 }} /> : null}
        </div>
      ) : null}
      <Lab>Who is it for?</Lab>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
        {people.map(p => <Pill key={p.id} on={t.people.includes(p.id)} onClick={() => set({ people: toggle(t.people, p.id) })}>{dot(p.color)}{p.name}</Pill>)}
        <button className="pill" onClick={() => openSheet({ mode: "family", back: t })}>+ Add someone</button>
      </div>
      <Lab>Where? (optional)</Lab>
      <input value={t.location} onChange={e => set({ location: e.target.value })} maxLength={80} placeholder="School, the park…" autoComplete="off" />
      {editing && rep ? <p style={{ fontSize: 16, color: "var(--soft)", margin: "18px 0 0" }}>Changes apply to every repeat.</p> : null}
    </>
  );
  const foot = confirmDel
    ? (rep ? <><button className="danger" style={{ flex: 1 }} onClick={() => del(true)}>Just this day</button><button className="danger" style={{ flex: 1 }} onClick={() => del(false)}>Every one</button><button onClick={() => setConfirmDel(false)}>Keep it</button></>
        : <><button className="danger" style={{ flex: 1 }} onClick={() => del(false)}>Yes, delete it</button><button style={{ flex: 1 }} onClick={() => setConfirmDel(false)}>Keep it</button></>)
    : <>{editing ? <button className="danger-o" onClick={() => setConfirmDel(true)}>Delete</button> : null}<button style={{ marginLeft: "auto" }} onClick={closeSheet}>Cancel</button><button className="primary" style={{ minWidth: 200 }} onClick={save}>{editing ? "Save" : "Add to calendar"}</button></>;
  return <SheetFrame title={editing ? "Change event" : "New event"} body={body} foot={foot} error={err} />;
}

function ViewSheet({ e, cal: c }: { e: Ev; cal: { name: string; color: string } }) {
  const { h24, closeSheet } = useHub();
  const last = addDays(e.e, -1);
  const when = e.all_day
    ? (dayDiff(last, e.s) > 0 ? <>{longDay(e.s)} to {last.toLocaleDateString([], { day: "numeric", month: "long" })}</> : <>{longDay(e.s)} · all day</>)
    : <>{longDay(e.s)}<br />{fmtT(e.s, h24)} to {fmtT(e.e, h24)}</>;
  return <SheetFrame title="Event" foot={<button className="primary" onClick={closeSheet} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>} body={
    <>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-.04em", lineHeight: 1.1, marginTop: 12 }}>{e.title}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 14, color: "#3a4358" }}>{when}</div>
      {e.location ? <div style={{ fontSize: 22, marginTop: 10, color: "#3a4358" }}>{e.location}</div> : null}
      {c.name ? <div className="pp" style={{ fontSize: 20, marginTop: 18 }}><i style={{ background: c.color }} />{c.name} calendar</div> : null}
      <p style={{ fontSize: 18, color: "var(--soft)", marginTop: 22 }}>This one comes from a calendar you follow, so change it there.</p>
    </>
  } />;
}

function FamilySheet({ back }: { back?: EventDraft }) {
  const { closeSheet, openSheet, people } = useHub();
  const [draft, setDraft] = useState(back);
  const finish = () => back ? openSheet({ mode: "event", draft: { ...draft!, people: draft!.people.filter(id => people.some(p => p.id === id)) } }) : closeSheet();
  return <SheetFrame title="Family" body={<FamilyEditor onAdded={id => setDraft(d => d && { ...d, people: [...d.people, id] })} />}
    foot={<button className="primary" onClick={finish} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>} />;
}

function DinnerSheet({ date, cook: startCook }: { date: string; cook: string | null }) {
  const { people, closeSheet } = useHub();
  const qc = useQueryClient();
  const { data: din } = useDinners();
  const [cook, setCook] = useState(startCook);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const cur = din?.plan[date], curMeal = cur && din?.meals.find(m => m.id === cur.meal);
  const meals = [...(din?.meals || [])].sort((a, b) => a.name.localeCompare(b.name));
  const plan = async (body: any) => { try { await post("/api/dinner-plan", body); await qc.invalidateQueries({ queryKey: ["dinners"] }); closeSheet(); } catch (e: any) { setErr(e.message); } };
  const body = (
    <>
      {curMeal ? <><div className="cap" style={{ marginTop: 14 }}>Planned</div><div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.03em", marginTop: 2 }}>{curMeal.name}</div></> : null}
      <Lab>Who's cooking? (optional)</Lab>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
        {people.length ? people.map(p => <Pill key={p.id} on={cook === p.id} onClick={() => {
          const next = cook === p.id ? null : p.id; setCook(next);
          if (cur) plan({ date, meal_id: cur.meal, cook: next });      // changing the cook of a planned day saves at once
        }}>{dot(p.color)}{p.name}</Pill>) : <span style={{ color: "var(--soft)", fontSize: 18 }}>Add your family from the Calendar to say who's cooking.</span>}
      </div>
      <Lab>{meals.length ? "Pick a dinner" : "No dinners yet"}</Lab>
      <div className="mealgrid">{meals.map(m => <Pill key={m.id} on={cur?.meal === m.id} onClick={() => plan({ date, meal_id: m.id, cook })}>{m.name}</Pill>)}</div>
      <Lab>{meals.length ? "Or something new" : "Add your first one"}</Lab>
      <div className="fx" style={{ gap: 10 }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && plan({ date, name: text, cook })} maxLength={40} placeholder="Spaghetti Bolognese, Tacos…" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
        <button className="primary" style={{ flex: "none", padding: "0 22px" }} onClick={() => plan({ date, name: text, cook })}>Use it</button>
      </div>
    </>
  );
  return <SheetFrame title={longDay(fromYmd(date))} body={body} error={err}
    foot={<>{cur ? <button className="danger-o" onClick={() => plan({ date })}>Clear this day</button> : null}<button style={{ marginLeft: "auto" }} onClick={closeSheet}>Cancel</button></>} />;
}

function MealsSheet() {
  const { closeSheet } = useHub();
  const qc = useQueryClient();
  const { data: din } = useDinners();
  const [text, setText] = useState("");
  const [sure, setSure] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const meals = [...(din?.meals || [])].sort((a, b) => a.name.localeCompare(b.name));
  const run = async (f: () => Promise<unknown>) => { try { await f(); await qc.invalidateQueries({ queryKey: ["dinners"] }); setSure(null); setErr(""); } catch (e: any) { setErr(e.message); } };
  const add = () => run(async () => { await post("/api/meal", { name: text }); setText(""); });
  return <SheetFrame title="Dinner ideas" error={err} foot={<button className="primary" onClick={closeSheet} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>} body={
    <>
      <p style={{ color: "var(--soft)", fontSize: 18, margin: "10px 0 0" }}>Everything you cook. Pick from this list when you plan a day.</p>
      <div style={{ marginTop: 8 }}>
        {meals.length ? meals.map(m => (
          <div className="fx" key={m.id} style={{ gap: 10, padding: "8px 0", borderTop: "1px solid #edf0f5" }}>
            <input key={m.name} defaultValue={m.name} maxLength={40} aria-label="Dinner name" autoComplete="off" style={{ flex: 1, minWidth: 0 }} onBlur={e => e.target.value !== m.name && run(() => post("/api/meal", { id: m.id, name: e.target.value }))} />
            {sure === m.id ? <button className="danger" style={{ minHeight: 52, padding: "0 16px" }} onClick={() => run(() => post("/api/meal/delete", { id: m.id }))}>Yes, remove</button>
              : <button style={{ minHeight: 52, padding: "0 18px" }} onClick={() => setSure(m.id)}>Remove</button>}
          </div>
        )) : <p>No dinners yet. Add your favourites below.</p>}
      </div>
      <Lab>Add a dinner</Lab>
      <div className="fx" style={{ gap: 10 }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} maxLength={40} placeholder="Spaghetti Bolognese, Tacos…" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
        <button className="primary" style={{ flex: "none", padding: "0 22px" }} onClick={add}>Add</button>
      </div>
      {sure ? <p style={{ fontSize: 16, color: "var(--soft)" }}>Removing a dinner also takes it off any days it was planned.</p> : null}
    </>
  } />;
}

function SheetBody({ sheet }: { sheet: Sheet }) {
  switch (sheet.mode) {
    case "event": return <EventSheet draft={sheet.draft} />;
    case "view": return <ViewSheet e={sheet.e} cal={sheet.cal} />;
    case "family": return <FamilySheet back={sheet.back} />;
    case "steps": return <StepsSheet k={sheet.key} />;
    case "dinner": return <DinnerSheet date={sheet.date} cook={sheet.cook} />;
    case "meals": return <MealsSheet />;
  }
}

/** The bottom sheet. It keeps showing what it last held while it slides away. */
export function SheetHost() {
  const { sheet } = useHub();
  const [last, setLast] = useState<{ sheet: Sheet; n: number } | null>(null);
  if (sheet && (!last || last.sheet !== sheet)) setLast({ sheet, n: (last?.n ?? 0) + 1 });     // a new sheet starts with fresh fields
  return <section id="sheet" role="dialog" aria-label="Event">{last ? <SheetBody key={last.n} sheet={last.sheet} /> : null}</section>;
}
