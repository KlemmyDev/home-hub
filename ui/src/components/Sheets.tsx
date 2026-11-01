import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { addDays, dayDiff, fmtT, fromYmd, hmOf, longDay, shortDate, startOfDay, ymd } from "../lib/dates";
import { calOf, fetchEvents, type Ev, type EvData } from "../lib/events";
import { useDinners } from "../data";
import { quickAdd } from "../lib/quickadd";
import { useHub, type EventDraft, type Sheet } from "../hub";
import { FamilyEditor } from "./Family";
import { Lab, Pill, SheetFrame } from "./SheetFrame";
import { StepsSheet } from "./Chores";
import { FoodIcon } from "../lib/foodicons";
import { FindSheet } from "./Find";

const DAYCODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const dot = (c: string) => <i style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />;

export function newEventDraft(day: Date, hour: number | undefined, now: Date, who: string | null): EventDraft {
  const h = hour !== undefined ? hour : ymd(day) === ymd(now) ? Math.min(20, Math.max(8, now.getHours() + 1)) : 9;
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(h), (h % 1) * 60), e = new Date(+s + 3600000);
  return { id: "", title: "", location: "", allDay: false, sd: ymd(s), st: hmOf(s), ned: ymd(e), net: hmOf(e), people: who ? [who] : [], freq: "none", interval: 1, days: [DAYCODES[(s.getDay() + 6) % 7]], untilOn: false, until: ymd(addDays(s, 90)), notes: "", link: "", travel: 0, checklist: [], icon: "", remind: null };
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
    notes: h.notes || "", link: h.link || "", travel: h.travel || 0, checklist: (h.checklist || []).slice(), icon: h.icon || "", remind: h.remind ?? null,
  };
}

const joinNames = (n: string[]) => n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1];
const QUICK_TIMES: [string, string][] = [["Morning", "09:00"], ["Lunchtime", "12:00"], ["After school", "15:30"], ["Evening", "18:00"]];
const ICONS = ["⚽", "🏊", "🎹", "🦷", "🎂", "🏥", "🛒", "🚌", "📚", "🎭", "🐶", "✈️", "🍽️", "🎉", "💼", "🏃"];
const TRAVEL: [number, string][] = [[0, "None"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"]];
const REMIND: [number | null, string][] = [[null, "The usual"], [0, "None"], [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hour"]];
const LENGTHS: [number, string][] = [[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [180, "3 hours"]];

/** Opens and closes a part of the sheet smoothly instead of popping it in. */
const Reveal = ({ open, children }: { open: boolean; children: React.ReactNode }) => <div className={"xp" + (open ? " open" : "")} inert={!open}><div>{children}</div></div>;
/** A step of the form: slides up softly as the sheet opens, one after another. */
const Sec = ({ n, label, children }: { n: number; label: string; children: React.ReactNode }) => (
  <section className="sheetsec" style={{ "--d": n } as React.CSSProperties}><div className="cap" style={{ margin: "26px 0 10px" }}>{label}</div>{children}</section>
);

function EventSheet({ draft: start }: { draft: EventDraft }) {
  const { people, closeSheet, openSheet, now, h24 } = useHub();
  const qc = useQueryClient();
  const [t, setT] = useState(start);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState(() => !start.allDay && !LENGTHS.some(([m]) => m === Math.round((+new Date(`${start.ned}T${start.net}`) - +new Date(`${start.sd}T${start.st}`)) / 60000)) && !!start.id);
  const [quick, setQuick] = useState("");
  const [ck, setCk] = useState("");
  const [askScope, setAskScope] = useState(false);
  const { soon } = useHub();
  const daysEdited = useRef(!!start.id);       // until the weekdays are picked by hand, a weekly repeat follows the start day
  const dayOf = (ds: string) => DAYCODES[(fromYmd(ds).getDay() + 6) % 7];
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {      // the name field is ready for typing once the sheet has finished rising; focusing earlier makes the page behind scroll
    if (start.id) return;
    const id = setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 450);
    return () => clearTimeout(id);
  }, []);
  const set = (p: Partial<EventDraft>) => { setErr(""); setT(x => ({ ...x, ...p })); };
  const editing = !!t.id, rep = t.freq !== "none";
  const unit = ({ daily: "day", weekly: "week", monthly: "month", yearly: "year" } as any)[t.freq] || "";
  const startAt = () => new Date(`${t.sd}T${t.st}`);
  const endAt = () => new Date(`${t.ned}T${t.net}`);
  const dur = Math.round((+endAt() - +startAt()) / 60000);
  const dayOk = /^\d{4}-\d{2}-\d{2}$/.test(t.sd) && /^\d{4}-\d{2}-\d{2}$/.test(t.ned) && t.ned >= t.sd;
  const { data: nearby } = useQuery({ queryKey: ["clash", t.sd, t.ned], enabled: dayOk, staleTime: 30000, queryFn: () => fetchEvents(fromYmd(t.sd), addDays(fromYmd(t.ned), 1)) });
  const clash = !t.allDay && dayOk && t.people.length && dur > 0 ? (nearby?.list || []).filter(e => !e.all_day && e.hub && e.series !== t.id && (e.people || []).some(p => t.people.includes(p)) && +e.s < +endAt() && +e.e > +startAt()) : [];
  const { data: past } = useQuery({ queryKey: ["recent-events"], enabled: !start.id, staleTime: 60000, queryFn: () => fetchEvents(addDays(startOfDay(now), -60), addDays(startOfDay(now), 1)) });
  const again = (() => {
    if (start.id || !past) return [];
    const seen = new Set<string>(), out: Ev[] = [];
    for (const e of [...past.list].reverse()) { if (!e.hub || e.fixed || seen.has(e.name!)) continue; seen.add(e.name!); out.push(e); if (out.length >= 6) break; }
    return out;
  })();
  const useAgain = (e: Ev) => {
    const len = Math.max(15, Math.round((+e.e - +e.s) / 60000)), st = new Date(`${t.sd}T${t.st}`), en = new Date(+st + len * 60000);
    setCustom(false); setErr("");
    setT(x => ({ ...x, title: e.name!, people: e.people || x.people, location: e.location, icon: e.icon || "", notes: e.notes || "", link: e.link || "", travel: e.travel || 0, checklist: e.checklist || [], remind: e.remind ?? null, allDay: e.all_day, ...(e.all_day ? {} : { ned: ymd(en), net: hmOf(en) }) }));
  };
  const done = () => { closeSheet(); qc.invalidateQueries({ queryKey: ["events"] }); };
  const bodyOf = (over: Record<string, any> = {}) => ({ id: t.id, title: t.title.trim(), location: t.location, all_day: t.allDay, start: t.allDay ? t.sd : `${t.sd}T${t.st}`, end: t.allDay ? t.ned : `${t.ned}T${t.net}`, people: t.people,
    notes: t.notes.trim(), link: t.link.trim(), travel: t.travel, checklist: t.checklist, icon: t.icon, remind: t.remind,
    repeat: { freq: t.freq, interval: t.interval, days: t.freq === "weekly" ? t.days : [], until: t.freq !== "none" && t.untilOn ? t.until : null }, ...over });
  const save = async (scope: "all" | "after" = "all") => {
    if (!t.title.trim()) { setErr("Give it a name first."); titleRef.current?.focus({ preventScroll: true }); return; }
    if (t.allDay ? t.ned < t.sd : +endAt() <= +startAt()) { setErr("It ends before it starts. Change the end."); setCustom(true); return; }
    if (t.freq === "weekly" && !t.days.length) { setErr("Pick at least one day for it to repeat on."); return; }
    if (t.link.trim() && !/^https?:\/\//i.test(t.link.trim())) { setErr("A link should start with https://"); return; }
    if (editing && start.freq !== "none" && t.occ && !askScope && scope === "all" && ymd(new Date(t.occ.slice(0, 10) + "T00:00")) > start.sd) { setAskScope(true); return; }
    setBusy(true);
    try {
      if (scope === "after" && t.occ) {      // the earlier ones stay as they were; a new series carries on from this day with the changes
        const orig = await api("/api/hub-event?id=" + encodeURIComponent(t.id));
        const occDay = t.occ.slice(0, 10);
        await post("/api/hub-event", { ...orig, repeat: { ...orig.repeat, until: ymd(addDays(fromYmd(occDay), -1)) } });
        const shift = dayDiff(fromYmd(t.sd), fromYmd(start.sd)), nsd = ymd(addDays(fromYmd(occDay), shift)), len = dayDiff(fromYmd(t.ned), fromYmd(t.sd));
        const ned = ymd(addDays(fromYmd(nsd), len));
        await post("/api/hub-event", bodyOf({ id: "", start: t.allDay ? nsd : `${nsd}T${t.st}`, end: t.allDay ? ned : `${ned}T${t.net}`, repeat: { freq: t.freq, interval: t.interval, days: t.freq === "weekly" ? t.days : [], until: t.untilOn ? t.until : null } }));
      } else await post("/api/hub-event", bodyOf());
      done();
    } catch (e: any) { setErr(e.message); setBusy(false); setAskScope(false); }
  };
  const del = async (only: boolean) => {
    setBusy(true);
    try {
      let before: any = null;
      try { before = await api("/api/hub-event?id=" + encodeURIComponent(t.id)); } catch { /* no undo then */ }
      await post("/api/hub-event/delete", { id: t.id, only: only ? t.occ : null });
      done();
      soon(only ? "That day was taken off." : "Event deleted.", before ? async () => { try { await post("/api/hub-event/restore", before); qc.invalidateQueries({ queryKey: ["events"] }); } catch (e: any) { soon(e.message); } } : undefined);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const changeDate = (k: "sd" | "st" | "ned" | "net" | "until", v: string) => {
    setErr("");
    const before = +endAt() - +startAt(), n = { ...t, [k]: v };
    if (k === "sd" || k === "st") {      // keep the length when the start moves
      if (n.allDay) { if (n.ned < n.sd) n.ned = n.sd; }
      else if (before > 0 && n.sd && n.st) { const e = new Date(+new Date(`${n.sd}T${n.st}`) + before); n.ned = ymd(e); n.net = hmOf(e); }
    }
    if (!daysEdited.current && (k === "sd")) n.days = [dayOf(n.sd)];
    setT(n);
  };
  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  const pick = people.filter(p => t.people.includes(p.id));
  const day0 = ymd(now), day1 = ymd(addDays(now, 1));
  const setLen = (m: number) => { const e = new Date(+startAt() + m * 60000); setCustom(false); set({ allDay: false, ned: ymd(e), net: hmOf(e) }); };
  const repeatText = !rep ? "" : ` · repeats every ${t.interval > 1 ? t.interval + " " : ""}${unit}${t.interval > 1 ? "s" : ""}${t.freq === "monthly" ? " on the " + ord(fromYmd(t.sd).getDate()) : t.freq === "yearly" ? " on " + fromYmd(t.sd).toLocaleDateString([], { day: "numeric", month: "long" }) : ""}${t.freq === "weekly" ? " on " + DAYCODES.filter(c => t.days.includes(c)).map(c => DAYNAMES[DAYCODES.indexOf(c)].slice(0, 3)).join(", ") : ""}${t.untilOn ? " until " + fromYmd(t.until).toLocaleDateString([], { day: "numeric", month: "short" }) : ""}`;
  const whenText = t.allDay
    ? (t.ned > t.sd ? `${shortDate(fromYmd(t.sd))} to ${shortDate(fromYmd(t.ned))}, all day` : `${shortDate(fromYmd(t.sd))}, all day`)
    : `${shortDate(startAt())}, ${fmtT(startAt(), h24)} to ${fmtT(endAt(), h24)}${t.ned !== t.sd ? " (" + shortDate(endAt()) + ")" : ""}`;
  const body = (
    <>
      {editing ? null : (
        <form className="qadd" onSubmit={e => { e.preventDefault(); if (!quick.trim()) return; const q = quickAdd(quick, now, people); setCustom(false); setErr(""); daysEdited.current = !!q.days; setT(x => ({ ...x, ...q, days: q.days || [dayOf(q.sd!)], title: q.title || x.title })); setQuick(""); }}>
          <input value={quick} onChange={e => setQuick(e.target.value)} placeholder="Or just type it: Football Saturday 9am for 2 hours" aria-label="Quick add" autoComplete="off" enterKeyHint="go" maxLength={120} />
          <button type="submit" className="primary" disabled={!quick.trim()}>Fill in</button>
        </form>
      )}
      {!editing && again.length ? <div className="fx again" aria-label="Add something you've made before">{again.map(e => <button key={e.name} className="pill" onClick={() => useAgain(e)}>{e.icon ? e.icon + " " : ""}{e.name}</button>)}</div> : null}
      <div className="whobar" aria-hidden>{pick.length ? pick.map(p => <i key={p.id} style={{ background: p.color }} />) : <i style={{ background: "#d5dbe6" }} />}</div>
      <input ref={titleRef} value={t.title} onChange={e => set({ title: e.target.value })} maxLength={80} placeholder="What's happening?" autoComplete="off" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.02em", minHeight: 76, marginTop: 14 }} />

      <Sec n={1} label="Who is it for?">
        <div className="wgrid">
          {people.map(p => {
            const on = t.people.includes(p.id);
            return (
              <button key={p.id} className={"wpick" + (on ? " on" : "")} aria-pressed={on} style={{ "--pc": p.color } as React.CSSProperties} onClick={() => set({ people: toggle(t.people, p.id) })}>
                <i className="av" style={{ width: 40, height: 40, fontSize: 20, background: p.color }}>{(p.name.trim()[0] || "?").toUpperCase()}</i>
                <span className="wn">{p.name}</span>
                <span className="wtick" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              </button>
            );
          })}
          {people.length > 1 ? <button className={"wpick all" + (pick.length === people.length ? " on" : "")} onClick={() => set({ people: pick.length === people.length ? [] : people.map(p => p.id) })}>Everyone</button> : null}
          <button className="wpick add" onClick={() => openSheet({ mode: "family", back: t })}>+ Add someone</button>
        </div>
      </Sec>

      <Sec n={2} label="When">
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
          <Pill on={t.sd === day0} onClick={() => changeDate("sd", day0)}>Today</Pill>
          <Pill on={t.sd === day1} onClick={() => changeDate("sd", day1)}>Tomorrow</Pill>
          <input type="date" aria-label="Day" value={t.sd} onChange={e => changeDate("sd", e.target.value)} style={{ flex: 1, minWidth: 210, width: "auto" }} />
        </div>
        <Reveal open={!t.allDay}>
          <div style={{ paddingTop: 12 }}>
            <input type="time" aria-label="Starts at" value={t.st} onChange={e => changeDate("st", e.target.value)} />
            <div className="fx" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {QUICK_TIMES.map(([l, v]) => <Pill key={v} on={t.st === v} onClick={() => changeDate("st", v)}>{l}</Pill>)}
            </div>
          </div>
        </Reveal>
        <div className="cap" style={{ margin: "20px 0 10px" }}>How long?</div>
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
          <Pill on={t.allDay} onClick={() => set({ allDay: !t.allDay, ...(!t.allDay && t.ned < t.sd ? { ned: t.sd } : {}) })}>All day</Pill>
          {LENGTHS.map(([m, l]) => <Pill key={m} on={!t.allDay && !custom && dur === m} onClick={() => setLen(m)}>{l}</Pill>)}
          <Pill on={!t.allDay && (custom || !LENGTHS.some(([m]) => m === dur))} onClick={() => { set({ allDay: false }); setCustom(c => !c); }}>Pick the end</Pill>
        </div>
        <Reveal open={t.allDay ? t.ned >= t.sd : custom || !LENGTHS.some(([m]) => m === dur)}>
          <div style={{ paddingTop: 12 }}>
            <div className="cap" style={{ margin: "0 0 8px" }}>{t.allDay ? "Last day" : "Ends"}</div>
            <div className="fx" style={{ gap: 12 }}>
              <input type="date" aria-label="Ends on" value={t.ned} onChange={e => changeDate("ned", e.target.value)} style={t.allDay ? undefined : { flex: 3 }} />
              {t.allDay ? null : <input type="time" aria-label="Ends at" value={t.net} onChange={e => changeDate("net", e.target.value)} style={{ flex: 2 }} />}
            </div>
          </div>
        </Reveal>
      </Sec>

      <Sec n={3} label="Repeats">
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
          {[["none", "Never"], ["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]].map(([v, l]) => <Pill key={v} on={t.freq === v} onClick={() => set({ freq: v, ...(daysEdited.current ? {} : { days: [dayOf(t.sd)] }) })}>{l}</Pill>)}
        </div>
        <Reveal open={rep}>
          <div style={{ paddingTop: 14 }}>
            <div className="fx" style={{ gap: 14 }}>
              <span style={{ fontSize: 20, fontWeight: 600 }}>Every</span>
              <button className="cnav" aria-label="Fewer" onClick={() => set({ interval: Math.max(1, t.interval - 1) })}>&minus;</button>
              <span className="num" style={{ fontSize: 26, fontWeight: 700, minWidth: 34, textAlign: "center" }}>{t.interval}</span>
              <button className="cnav" aria-label="More" onClick={() => set({ interval: Math.min(30, t.interval + 1) })}>+</button>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{unit}{t.interval > 1 ? "s" : ""}</span>
            </div>
            <Reveal open={t.freq === "weekly"}>
              <div className="fx" style={{ gap: 8, paddingTop: 14 }}>
                {DAYCODES.map((c, i) => <button key={c} className={"pill dow" + (t.days.includes(c) ? " on" : "")} aria-label={DAYNAMES[i]} style={{ padding: 0, width: 52, justifyContent: "center" }} onClick={() => { daysEdited.current = true; set({ days: toggle(t.days, c) }); }}>{"MTWTFSS"[i]}</button>)}
              </div>
            </Reveal>
            <div className="fx" style={{ gap: 8, paddingTop: 14, flexWrap: "wrap" }}>
              <Pill on={!t.untilOn} onClick={() => set({ untilOn: false })}>Carries on</Pill><Pill on={t.untilOn} onClick={() => set({ untilOn: true })}>Until a day</Pill>
              {t.untilOn ? <input type="date" aria-label="Until" value={t.until} onChange={e => set({ until: e.target.value })} style={{ width: "auto", flex: 1, minWidth: 220 }} /> : null}
            </div>
            {editing ? <p style={{ fontSize: 16, color: "var(--soft)", margin: "14px 0 0" }}>Changes apply to every repeat.</p> : null}
          </div>
        </Reveal>
      </Sec>

      <Sec n={4} label="Where? (optional)">
        <input value={t.location} onChange={e => set({ location: e.target.value })} maxLength={80} placeholder="School, the park…" autoComplete="off" />
      </Sec>

      <Sec n={5} label="More (optional)">
        <div className="cap" style={{ margin: "0 0 8px" }}>A picture</div>
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className={"pill ico" + (!t.icon ? " on" : "")} aria-label="No picture" onClick={() => set({ icon: "" })}>None</button>
          {ICONS.map(i => <button key={i} className={"pill ico" + (t.icon === i ? " on" : "")} aria-label={"Picture " + i} onClick={() => set({ icon: t.icon === i ? "" : i })}>{i}</button>)}
        </div>
        <div className="cap" style={{ margin: "20px 0 8px" }}>Notes</div>
        <input value={t.notes} onChange={e => set({ notes: e.target.value })} maxLength={600} placeholder="Anything to remember" autoComplete="off" />
        <div className="cap" style={{ margin: "20px 0 8px" }}>Link</div>
        <input value={t.link} onChange={e => set({ link: e.target.value })} maxLength={300} inputMode="url" autoCapitalize="off" placeholder="https://… a map or booking page" autoComplete="off" />
        <div className="cap" style={{ margin: "20px 0 8px" }}>Time to get there</div>
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>{TRAVEL.map(([m, l]) => <Pill key={m} on={t.travel === m} onClick={() => set({ travel: m })}>{l}</Pill>)}</div>
        <div className="cap" style={{ margin: "20px 0 8px" }}>Remind us</div>
        <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>{REMIND.map(([m, l]) => <Pill key={String(m)} on={t.remind === m} onClick={() => set({ remind: m })}>{l}</Pill>)}</div>
        <div className="cap" style={{ margin: "20px 0 8px" }}>Things to take</div>
        {t.checklist.map((c, i) => (
          <div className="fx ckrow" key={i}><span>{c}</span><button className="cnav" aria-label={"Remove " + c} onClick={() => set({ checklist: t.checklist.filter((_, j) => j !== i) })}>×</button></div>
        ))}
        <form className="qadd" onSubmit={e => { e.preventDefault(); const v = ck.trim(); if (v && t.checklist.length < 20) { set({ checklist: [...t.checklist, v] }); setCk(""); } }}>
          <input value={ck} onChange={e => setCk(e.target.value)} maxLength={60} placeholder="Swim bag, towel…" aria-label="Add a thing to take" autoComplete="off" enterKeyHint="done" />
          <button type="submit" disabled={!ck.trim()}>Add</button>
        </form>
      </Sec>
    </>
  );
  const foot = askScope
    ? <><button className="primary" style={{ flex: 1 }} disabled={busy} onClick={() => save("after")}>This and the ones after</button><button style={{ flex: 1 }} disabled={busy} onClick={() => save("all")}>All of them</button><button onClick={() => setAskScope(false)}>Back</button></>
    : confirmDel
    ? (rep ? <><button className="danger" style={{ flex: 1 }} disabled={busy} onClick={() => del(true)}>Just this day</button><button className="danger" style={{ flex: 1 }} disabled={busy} onClick={() => del(false)}>Every one</button><button onClick={() => setConfirmDel(false)}>Keep it</button></>
        : <><button className="danger" style={{ flex: 1 }} disabled={busy} onClick={() => del(false)}>Yes, delete it</button><button style={{ flex: 1 }} onClick={() => setConfirmDel(false)}>Keep it</button></>)
    : <>{editing ? <button className="danger-o" onClick={() => setConfirmDel(true)}>Delete</button> : null}{editing ? <button onClick={() => openSheet({ mode: "event", draft: { ...t, id: "", occ: undefined } })}>Copy</button> : null}<button style={{ marginLeft: "auto" }} onClick={closeSheet}>Cancel</button><button className="primary" disabled={busy} style={{ minWidth: 200 }} onClick={() => save()}>{busy ? "Saving…" : editing ? "Save" : "Add to calendar"}</button></>;
  const sum = (
    <div className="evsum" aria-live="polite">
      <b>{t.title.trim() || "New event"}</b>{pick.length ? <> for {joinNames(pick.map(p => p.name))}</> : null}
      <span>{whenText}{repeatText}{t.location.trim() ? " · " + t.location.trim() : ""}</span>
      {askScope ? <span className="clash">Change just the ones from {longDay(fromYmd(t.occ!.slice(0, 10)))} onwards, or all of them?</span> : null}
      <span className="clash" style={{ minHeight: "1.4em" }}>{clash.length ? `Overlaps ${joinNames(clash.slice(0, 2).map(e => e.name + " (" + fmtT(e.s, h24) + ")"))}` : "\u00a0"}</span>
    </div>
  );
  return <SheetFrame title={editing ? "Change event" : "New event"} body={body} foot={foot} error={err} sum={confirmDel ? undefined : sum} />;
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

/** What a new dinner will look like, shown live as its name is typed. */
const NewDinner = ({ text, setText, onGo, go, placeholder }: { text: string; setText: (v: string) => void; onGo: () => void; go: string; placeholder: string }) => (
  <div className="newdin">
    <FoodIcon name={text} size={64} />
    <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && text.trim() && onGo()} maxLength={40} placeholder={placeholder} autoComplete="off" style={{ flex: 1, minWidth: 0, background: "#fff" }} />
    <button className="primary" disabled={!text.trim()} style={{ flex: "none", padding: "0 24px" }} onClick={onGo}>{go}</button>
  </div>
);
/** One dinner idea: its picture and name. */
const MealCard = ({ name, on, onClick }: { name: string; on?: boolean; onClick: () => void }) => (
  <button className={"mcard" + (on ? " on" : "")} aria-pressed={on} onClick={onClick}><FoodIcon name={name} size={56} /><span className="mn">{name}</span></button>
);

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
      {curMeal ? <div className="planned sheetsec" style={{ "--d": 0 } as React.CSSProperties}><FoodIcon name={curMeal.name} size={72} /><div><div className="cap">Planned for this day</div><div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.03em", marginTop: 2 }}>{curMeal.name}</div></div></div> : null}
      <Sec n={1} label="Who's cooking? (optional)">
        {people.length ? (
          <div className="wgrid">{people.map(p => {
            const on = cook === p.id;
            return (
              <button key={p.id} className={"wpick" + (on ? " on" : "")} aria-pressed={on} style={{ "--pc": p.color } as React.CSSProperties} onClick={() => {
                const next = on ? null : p.id; setCook(next);
                if (cur) plan({ date, meal_id: cur.meal, cook: next });      // changing the cook of a planned day saves at once
              }}>
                <i className="av" style={{ width: 40, height: 40, fontSize: 20, background: p.color }}>{(p.name.trim()[0] || "?").toUpperCase()}</i>
                <span className="wn">{p.name}</span>
                <span className="wtick" aria-hidden><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              </button>
            );
          })}</div>
        ) : <span style={{ color: "var(--soft)", fontSize: 18 }}>Add your family from the Calendar to say who's cooking.</span>}
      </Sec>
      <Sec n={2} label={meals.length ? "Pick a dinner" : "No dinners yet"}>
        <div className="mgrid">{meals.map(m => <MealCard key={m.id} name={m.name} on={cur?.meal === m.id} onClick={() => plan({ date, meal_id: m.id, cook })} />)}</div>
      </Sec>
      <Sec n={3} label={meals.length ? "Or something new" : "Add your first one"}>
        <NewDinner text={text} setText={setText} go="Use it" placeholder="Spaghetti Bolognese, Tacos…" onGo={() => plan({ date, name: text, cook })} />
      </Sec>
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
  const [edit, setEdit] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState("");
  const meals = [...(din?.meals || [])].sort((a, b) => a.name.localeCompare(b.name));
  const run = async (f: () => Promise<unknown>) => { try { await f(); await qc.invalidateQueries({ queryKey: ["dinners"] }); setEdit(null); setSure(false); setErr(""); } catch (e: any) { setErr(e.message); } };
  const add = () => run(async () => { await post("/api/meal", { name: text }); setText(""); });
  const open = (id: string, n: string) => { setEdit(edit === id ? null : id); setName(n); setSure(false); };
  const cur = meals.find(m => m.id === edit);
  return <SheetFrame title="Dinner ideas" error={err} foot={<button className="primary" onClick={closeSheet} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>} body={
    <>
      <p className="sheetsec" style={{ color: "var(--soft)", fontSize: 18, margin: "10px 0 0", "--d": 0 } as React.CSSProperties}>Everything you cook. Pick from here when you plan a day, and tap one to rename or remove it.</p>
      <Sec n={1} label="Add a dinner">
        <NewDinner text={text} setText={setText} go="Add" placeholder="Spaghetti Bolognese, Tacos…" onGo={add} />
      </Sec>
      <Sec n={2} label={meals.length ? `${meals.length} ${meals.length === 1 ? "idea" : "ideas"}` : "Your ideas"}>
        {meals.length ? <div className="mgrid">{meals.map(m => <MealCard key={m.id} name={m.name} on={edit === m.id} onClick={() => open(m.id, m.name)} />)}</div> : <p style={{ color: "var(--soft)", fontSize: 18, margin: 0 }}>No dinners yet. Add your favourites above and they will turn up here with a picture.</p>}
        <Reveal open={!!cur}>
          <div className="medit">
            <div className="fx" style={{ gap: 12 }}>
              <FoodIcon name={name || cur?.name || ""} size={64} />
              <input key={edit} value={name} onChange={e => setName(e.target.value)} maxLength={40} aria-label="Dinner name" autoComplete="off" style={{ flex: 1, minWidth: 0, background: "#fff" }} />
            </div>
            <div className="fx" style={{ gap: 10, marginTop: 12 }}>
              {sure ? <button className="danger" style={{ flex: 1 }} onClick={() => run(() => post("/api/meal/delete", { id: edit }))}>Yes, remove it</button>
                : <button className="danger-o" style={{ flex: 1 }} onClick={() => setSure(true)}>Remove</button>}
              <button className="primary" style={{ flex: 1 }} disabled={!name.trim() || name.trim() === cur?.name} onClick={() => run(() => post("/api/meal", { id: edit, name }))}>Save name</button>
            </div>
            {sure ? <p style={{ fontSize: 16, color: "var(--soft)", margin: "10px 0 0" }}>Removing a dinner also takes it off any days it was planned.</p> : null}
          </div>
        </Reveal>
      </Sec>
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
    case "find": return <FindSheet />;
  }
}

/** The bottom sheet. It keeps showing what it last held while it slides away. */
export function SheetHost() {
  const { sheet } = useHub();
  const [last, setLast] = useState<{ sheet: Sheet; n: number } | null>(null);
  if (sheet && (!last || last.sheet !== sheet)) setLast({ sheet, n: (last?.n ?? 0) + 1 });     // a new sheet starts with fresh fields
  return <section id="sheet" role="dialog" aria-label="Event">{last ? <SheetBody key={last.n} sheet={last.sheet} /> : null}</section>;
}
