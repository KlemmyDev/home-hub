import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO, post } from "../lib/api";
import { addDays, dayDiff, fmtT, fromYmd, hmOf, longDay, sameDay, shortDate, startOfDay, weekStart, ymd } from "../lib/dates";
import { calOf, colorsOf, fetchEvents, onDay, peopleOf, type Ev, type Person } from "../lib/events";
import { quickAdd } from "../lib/quickadd";
import { SHEET_MS, useAutoFocus } from "../lib/focus";
import { ChevL, ChevR, XIcon } from "../lib/icons";
import { useEvents } from "../data";
import { useHub, type EventDraft } from "../hub";
import { useNav } from "../nav";
import { Ava } from "./Ava";

/* The calendar's sheets, as drawn in the "Family Calendar Variations" design: what an event is (details), adding or
   changing one (with a date picker and a repeat picker as panels inside it), and a short sheet for adding to one day. */

export const DAYCODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const joinNames = (n: string[]) => n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1];
const dayCode = (d: Date) => DAYCODES[(d.getDay() + 6) % 7];
const soft = (c: string) => `color-mix(in srgb, ${c} 20%, #fff)`;
const deep = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;
const initial = (n: string) => (n.trim()[0] || "?").toUpperCase();
const ICONS = ["⚽", "🏊", "🎹", "🦷", "🎂", "🏥", "🛒", "🚌", "📚", "🎭", "🐶", "✈️", "🍽️", "🎉", "💼", "🏃"];
const TRAVEL: [number, string][] = [[0, "None"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"]];
const REMIND: [number | null, string][] = [[null, "The usual"], [0, "None"], [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hour"]];
const LENGTHS: [number, string][] = [[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [180, "3 hours"]];

type Rep = Pick<EventDraft, "freq" | "interval" | "days" | "untilOn" | "until" | "sd">;
/** How an event repeats, said plainly: "every Monday", "every school day", "every 2 weeks on Monday and Thursday". */
export function repeatWords(t: Rep) {
  if (t.freq === "none") return "";
  const d = fromYmd(t.sd), n = t.interval;
  let w = "";
  if (t.freq === "daily") w = n > 1 ? `every ${n} days` : "every day";
  else if (t.freq === "weekly") {
    const days = DAYCODES.filter(c => t.days.includes(c));
    const school = days.length === 5 && WEEKDAYS.every(c => days.includes(c));
    w = n === 1 && school ? "every school day" : n === 1 ? `every ${joinNames(days.map(c => DAYNAMES[DAYCODES.indexOf(c)]))}` : `every ${n} weeks on ${joinNames(days.map(c => DAYNAMES[DAYCODES.indexOf(c)]))}`;
  } else if (t.freq === "monthly") w = (n > 1 ? `every ${n} months` : "every month") + ` on the ${ord(d.getDate())}`;
  else if (t.freq === "yearly") w = (n > 1 ? `every ${n} years` : "every year") + ` on ${d.toLocaleDateString([], { day: "numeric", month: "long" })}`;
  return w + (t.untilOn ? `, until ${fromYmd(t.until).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}` : "");
}
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;

/** The repeat presets, and which of them a draft is (or "custom"). */
const PRESETS = ["none", "day", "week", "school", "month", "year", "fortnight", "custom"] as const;
type Preset = typeof PRESETS[number];
function presetOf(t: Rep): Preset {
  const days = [...t.days].sort().join();
  if (t.freq === "none") return "none";
  if (t.freq === "daily" && t.interval === 1) return "day";
  if (t.freq === "weekly" && t.interval === 1 && days === [...WEEKDAYS].sort().join()) return "school";
  if (t.freq === "weekly" && t.interval === 1 && days === dayCode(fromYmd(t.sd))) return "week";
  if (t.freq === "weekly" && t.interval === 2 && days === dayCode(fromYmd(t.sd))) return "fortnight";
  if (t.freq === "monthly" && t.interval === 1) return "month";
  if (t.freq === "yearly" && t.interval === 1) return "year";
  return "custom";
}
function applyPreset(p: Preset, t: EventDraft): Partial<EventDraft> {
  const own = [dayCode(fromYmd(t.sd))];
  switch (p) {
    case "none": return { freq: "none" };
    case "day": return { freq: "daily", interval: 1 };
    case "week": return { freq: "weekly", interval: 1, days: own };
    case "school": return { freq: "weekly", interval: 1, days: [...WEEKDAYS] };
    case "month": return { freq: "monthly", interval: 1 };
    case "year": return { freq: "yearly", interval: 1 };
    case "fortnight": return { freq: "weekly", interval: 2, days: own };
    default: return t.freq === "none" ? { freq: "weekly", interval: 1, days: own } : {};
  }
}

/** A little round initial in someone's colour. */
const Face = ({ name, color, pal, size = 40 }: { name: string; color: string; pal?: string; size?: number }) => <Ava p={{ name, color, pal }} size={size} cls="face" />;

/** The sheet's frame in the new look: a grabber, a header, the scrolling body and a footer of buttons. */
function Frame({ head, body, foot, err }: { head: ReactNode; body: ReactNode; foot?: ReactNode; err?: string }) {
  return (
    <>
      <span className="grab" aria-hidden />
      <div className="esh-head">{head}</div>
      <div className="scroll esh-body">{body}</div>
      {err ? <div className="err esh-err" role="alert">{err}</div> : null}
      {foot ? <div className="esh-foot">{foot}</div> : null}
    </>
  );
}
const Close = () => { const { closeSheet } = useHub(); return <button className="esh-x" aria-label="Close" onClick={closeSheet}><XIcon /></button>; };
const Back = ({ onClick }: { onClick: () => void }) => <button className="esh-back" onClick={onClick}><ChevL />Back</button>;
const Label = ({ children, right }: { children: ReactNode; right?: ReactNode }) => <div className="esh-lab"><span>{children}</span>{right ? <span className="esh-lab-r">{right}</span> : null}</div>;

/* ---------- Event details ---------- */

/** What an event is: when, where, who, how it repeats and its notes; a hub event can be changed or deleted from here. */
export function EventDetails({ e }: { e: Ev }) {
  const { people, h24, now, openSheet, closeSheet, soon } = useHub();
  const qc = useQueryClient();
  const { data: evs } = useEvents(weekStart(e.s), addDays(weekStart(e.s), 7));
  const editable = !!e.hub && !e.fixed && !DEMO;
  const { data: draft } = useQuery({ queryKey: ["hub-event", e.series], enabled: editable && !!e.series, queryFn: () => loadDraft(e), staleTime: 10000 });
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const ps = peopleOf(e, people);
  const cal = evs ? calOf(e, evs, people) : { name: "", color: "#8a93a6" };
  const color = ps[0]?.color || (evs ? colorsOf(e, evs, people)[0] : "#8a93a6");
  const owner = ps.length === people.length && ps.length > 2 ? "The whole family" : ps.length ? joinNames(ps.map(p => p.name)) + (ps.length === 1 ? "’s event" : "") : cal.name ? cal.name + " calendar" : "Event";
  const live = !e.all_day && e.s <= now && now < e.e;
  const day = sameDay(e.s, now) ? "Today" : sameDay(e.s, addDays(now, 1)) ? "Tomorrow" : longDay(e.s);
  const last = addDays(e.e, -1);
  const when = e.all_day ? (dayDiff(last, e.s) > 0 ? `${day} to ${last.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}` : `${day}, all day`) : `${day}, ${fmtT(e.s, h24)} to ${fmtT(e.e, h24)}`;
  const rep = draft ? repeatWords(draft) : "";
  const del = async (only: boolean) => {
    setBusy(true);
    try {
      let before: any = null;
      try { before = await api("/api/hub-event?id=" + encodeURIComponent(e.series!)); } catch { /* no undo then */ }
      await post("/api/hub-event/delete", { id: e.series, only: only ? e.start : null });
      closeSheet(); qc.invalidateQueries({ queryKey: ["events"] });
      const what = e.name || e.title, whose = ps.length === 1 ? ps[0].name + "’s " + what.toLowerCase() : what;
      soon(only ? `${cap(whose)} is off for ${day === "Today" || day === "Tomorrow" ? day.toLowerCase() : day}` : `${cap(what)} deleted`, before ? async () => { try { await post("/api/hub-event/restore", before); qc.invalidateQueries({ queryKey: ["events"] }); } catch (err: any) { soon(err.message); } } : undefined);
    } catch (err: any) { soon(err.message); setBusy(false); }
  };
  const edit = () => draft && openSheet({ mode: "event", draft });
  const weekday = e.s.toLocaleDateString([], { weekday: "long" });
  return (
    <Frame
      head={<>
        <Face name={ps.length ? ps[0].name : cal.name || e.title} color={color} pal={ps[0]?.pal} size={56} />
        <div className="esh-title"><span style={{ color: deep(color) }}>{owner}</span><h2>{e.title}</h2></div>
        <Close />
      </>}
      body={<>
        <div className="det">
          <div className="det-row"><Ico d="clock" /><b>{when}</b>{live ? <span className="det-now">Happening now</span> : null}</div>
          {e.location ? <div className="det-row"><Ico d="pin" /><span>{e.location}</span></div> : null}
          {ps.length ? <div className="det-row"><Ico d="people" /><span className="det-who">{ps.map(p => <span key={p.id} style={{ background: soft(p.color) }}><Ava p={p} size={26} cls="det-ava" />{p.name}</span>)}</span></div> : null}
          {e.hub ? <div className="det-row"><Ico d="repeat" /><span>{draft ? (rep ? cap(rep) : "Just this once") : "…"}</span></div> : null}
          {e.remind ? <div className="det-row"><Ico d="bell" /><span>Remind us {e.remind >= 60 ? "an hour" : e.remind + " minutes"} before</span></div> : null}
          {e.travel ? <div className="det-row"><Ico d="car" /><span>{e.travel} minutes to get there</span></div> : null}
          {e.checklist?.length ? <div className="det-row"><Ico d="bag" /><span>Take {joinNames(e.checklist)}</span></div> : null}
          {e.link ? <div className="det-row"><Ico d="link" /><a href={e.link} target="_blank" rel="noreferrer">{e.link.replace(/^https?:\/\//, "").slice(0, 48)}</a></div> : null}
          <div className="det-row last"><Ico d="notes" /><span className="det-notes">{e.notes || "No notes"}</span></div>
        </div>
        <div className="det-src"><Ico d="cal" size={16} />{e.hub ? "Added on the hub" : `From the ${cal.name || "family"} calendar. Change it there.`}</div>
        {ask ? (
          <div className="det-ask">
            <div className="det-ask-h"><span className="det-bin"><Ico d="bin" /></span><div><b>{cap(e.name || e.title)} happens {rep}</b><span>Take away just this one, or every one?</span></div></div>
            <button className="det-opt" disabled={busy} onClick={() => del(true)}><span><b>Just this {weekday}</b><small>{cap(e.name || e.title)} carries on as usual after</small></span><ChevR /></button>
            <button className="det-opt all" disabled={busy} onClick={() => del(false)}><span><b>Every time</b><small>Takes away the whole series</small></span><ChevR /></button>
            <button className="det-keep" onClick={() => setAsk(false)}>Keep it</button>
          </div>
        ) : null}
      </>}
      foot={editable && !ask ? <>
        <button className="esh-del" disabled={busy || !draft} onClick={() => draft && draft.freq !== "none" ? setAsk(true) : del(false)}>Delete</button>
        <button className="esh-go" disabled={!draft} onClick={edit}>Edit</button>
      </> : !editable ? <button className="esh-go" style={{ flex: 1 }} onClick={closeSheet}>Done</button> : undefined}
    />
  );
}

async function loadDraft(e: Ev): Promise<EventDraft> {
  const h = await api("/api/hub-event?id=" + encodeURIComponent(e.series!));
  const s = h.all_day ? null : new Date(h.start), en = h.all_day ? null : new Date(h.end);
  const first = h.all_day ? new Date(h.start + "T00:00") : s!;
  return {
    id: h.id, occ: e.start, title: h.title, location: h.location, allDay: h.all_day,
    sd: h.all_day ? h.start : ymd(s!), st: h.all_day ? "09:00" : hmOf(s!), ned: h.all_day ? h.end : ymd(en!), net: h.all_day ? "10:00" : hmOf(en!),
    people: h.people.slice(), freq: h.repeat.freq, interval: h.repeat.interval,
    days: h.repeat.days.length ? h.repeat.days.slice() : [dayCode(first)],
    untilOn: !!h.repeat.until, until: h.repeat.until || ymd(addDays(first, 90)),
    notes: h.notes || "", link: h.link || "", travel: h.travel || 0, checklist: (h.checklist || []).slice(), icon: h.icon || "", remind: h.remind ?? null,
  };
}
export { loadDraft as loadEventDraft };

/** Thin line icons for the details rows. */
function Ico({ d, size = 22 }: { d: string; size?: number }) {
  const P: Record<string, ReactNode> = {
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    pin: <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
    people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
    repeat: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
    car: <><path d="M5 17h14M6 17v2M18 17v2M4 13l2-6h12l2 6v4H4z" /><circle cx="8" cy="14.5" r=".8" /><circle cx="16" cy="14.5" r=".8" /></>,
    bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    link: <><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" /><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></>,
    notes: <path d="M4 6h16M4 12h16M4 18h10" />,
    cal: <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18" /></>,
    bin: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />,
  };
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[d]}</svg>;
}

/* ---------- Adding or changing an event ---------- */

type Panel = null | "date" | "end" | "until" | "repeat";

export function EventSheet({ draft: start }: { draft: EventDraft }) {
  const { people, closeSheet, openSheet, now, h24 } = useHub();
  const qc = useQueryClient();
  const [t, setT] = useState(start);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState("");
  const [ck, setCk] = useState("");
  const [more, setMore] = useState(!!(start.notes || start.link || start.travel || start.checklist.length || start.icon || start.remind !== null));
  const [panel, setPanel] = useState<Panel>(null);
  const [askScope, setAskScope] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useAutoFocus(titleRef, SHEET_MS, !start.id);
  const set = (p: Partial<EventDraft>) => { setErr(""); setT(x => ({ ...x, ...p })); };
  const editing = !!t.id, rep = t.freq !== "none", wasRep = start.freq !== "none";
  const startAt = new Date(`${t.sd}T${t.st}`), endAt = new Date(`${t.ned}T${t.net}`);
  const dur = Math.round((+endAt - +startAt) / 60000);
  const dayOk = /^\d{4}-\d{2}-\d{2}$/.test(t.sd) && /^\d{4}-\d{2}-\d{2}$/.test(t.ned) && t.ned >= t.sd;
  const { data: nearby } = useQuery({ queryKey: ["clash", t.sd, t.ned], enabled: dayOk, staleTime: 30000, queryFn: () => fetchEvents(fromYmd(t.sd), addDays(fromYmd(t.ned), 1)) });
  const clash = !t.allDay && dayOk && t.people.length && dur > 0 ? (nearby?.list || []).filter(e => !e.all_day && e.series !== t.id && (e.people || []).some(p => t.people.includes(p)) && +e.s < +endAt && +e.e > +startAt) : [];
  const clashNames = [...new Set(clash.flatMap(e => peopleOf(e, people).filter(p => t.people.includes(p.id)).map(p => p.name)))];
  const { data: past } = useQuery({ queryKey: ["recent-events"], enabled: !start.id, staleTime: 60000, queryFn: () => fetchEvents(addDays(startOfDay(now), -60), addDays(startOfDay(now), 1)) });
  const again = (() => {
    if (start.id || !past) return [];
    const seen = new Set<string>(), out: Ev[] = [];
    for (const e of [...past.list].reverse()) { if (!e.hub || e.fixed || seen.has(e.name!)) continue; seen.add(e.name!); out.push(e); if (out.length >= 5) break; }
    return out;
  })();
  const useAgain = (e: Ev) => {
    const len = Math.max(15, Math.round((+e.e - +e.s) / 60000)), en = new Date(+startAt + len * 60000);
    set({ title: e.name!, people: e.people || t.people, location: e.location, icon: e.icon || "", notes: e.notes || "", link: e.link || "", travel: e.travel || 0, checklist: e.checklist || [], remind: e.remind ?? null, allDay: e.all_day, ...(e.all_day ? {} : { ned: ymd(en), net: hmOf(en) }) });
  };

  /* times: the start moves the end with it; the end never comes before the start */
  const setStartDay = (sd: string) => {
    const days = presetOf(t) === "week" || presetOf(t) === "fortnight" ? [dayCode(fromYmd(sd))] : t.days;
    if (t.allDay) return set({ sd, ned: ymd(addDays(fromYmd(sd), Math.max(0, dayDiff(fromYmd(t.ned), fromYmd(t.sd))))), days });
    const s = new Date(`${sd}T${t.st}`), e = new Date(+s + Math.max(15, dur) * 60000);
    set({ sd, ned: ymd(e), net: hmOf(e), days });
  };
  const moveStart = (m: number) => { const s = new Date(+startAt + m * 60000), e = new Date(+s + Math.max(15, dur) * 60000); set({ sd: ymd(s), st: hmOf(s), ned: ymd(e), net: hmOf(e) }); };
  const moveEnd = (m: number) => { const e = new Date(Math.max(+startAt + 15 * 60000, +endAt + m * 60000)); set({ ned: ymd(e), net: hmOf(e) }); };
  const setLen = (m: number) => { const e = new Date(+startAt + m * 60000); set({ allDay: false, ned: ymd(e), net: hmOf(e) }); };
  const durWords = dur <= 0 ? "" : (dur >= 60 ? `${Math.floor(dur / 60)} hour${Math.floor(dur / 60) > 1 ? "s" : ""}` : "") + (dur % 60 ? `${dur >= 60 ? " " : ""}${dur % 60} min` : "");

  const done = () => { closeSheet(); qc.invalidateQueries({ queryKey: ["events"] }); };
  const bodyOf = (over: Record<string, any> = {}) => ({ id: t.id, title: t.title.trim(), location: t.location, all_day: t.allDay, start: t.allDay ? t.sd : `${t.sd}T${t.st}`, end: t.allDay ? t.ned : `${t.ned}T${t.net}`, people: t.people,
    notes: t.notes.trim(), link: t.link.trim(), travel: t.travel, checklist: t.checklist, icon: t.icon, remind: t.remind,
    repeat: { freq: t.freq, interval: t.interval, days: t.freq === "weekly" ? t.days : [], until: t.freq !== "none" && t.untilOn ? t.until : null }, ...over });
  const save = async (scope: "all" | "after" = "all") => {
    if (!t.title.trim()) { setErr("Give it a name first."); return; }
    if (t.allDay ? t.ned < t.sd : +endAt <= +startAt) { setErr("It ends before it starts. Change the end."); return; }
    if (t.freq === "weekly" && !t.days.length) { setErr("Pick at least one day for it to repeat on."); return; }
    if (t.link.trim() && !/^https?:\/\//i.test(t.link.trim())) { setErr("A link should start with https://"); return; }
    if (editing && wasRep && t.occ && !askScope && scope === "all" && ymd(new Date(t.occ.slice(0, 10) + "T00:00")) > start.sd) { setAskScope(true); return; }
    setBusy(true);
    try {
      if (scope === "after" && t.occ) {      // the earlier ones stay as they were; a new series carries on from this day with the changes
        const orig = await api("/api/hub-event?id=" + encodeURIComponent(t.id));
        const occDay = t.occ.slice(0, 10);
        await post("/api/hub-event", { ...orig, repeat: { ...orig.repeat, until: ymd(addDays(fromYmd(occDay), -1)) } });
        const shift = dayDiff(fromYmd(t.sd), fromYmd(start.sd)), nsd = ymd(addDays(fromYmd(occDay), shift)), len = dayDiff(fromYmd(t.ned), fromYmd(t.sd));
        const ned = ymd(addDays(fromYmd(nsd), len));
        await post("/api/hub-event", bodyOf({ id: "", start: t.allDay ? nsd : `${nsd}T${t.st}`, end: t.allDay ? ned : `${ned}T${t.net}` }));
      } else await post("/api/hub-event", bodyOf());
      done();
    } catch (e: any) { setErr(e.message); setBusy(false); setAskScope(false); }
  };

  const toggle = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  const pick = people.filter(p => t.people.includes(p.id));
  const sdDate = fromYmd(t.sd);
  const near = [0, 1, 2, 3, 4].map(i => addDays(startOfDay(now), i));
  const custom = !near.some(d => ymd(d) === t.sd);
  const preset = presetOf(t);
  const startWeekday = sdDate.toLocaleDateString([], { weekday: "long" });
  const saveWords = askScope ? "" : editing ? (wasRep ? `Save for ${repeatWords(start).startsWith("every ") && start.freq === "weekly" && start.interval === 1 && start.days.length === 1 ? "every " + DAYNAMES[DAYCODES.indexOf(start.days[0])] : "every time"}` : "Save") : pick.length && pick.length < people.length ? `Add for ${joinNames(pick.map(p => p.name))}` : `Add to ${sameDay(sdDate, now) ? "today" : sameDay(sdDate, addDays(now, 1)) ? "tomorrow" : startWeekday}`;

  if (panel === "date" || panel === "end" || panel === "until") {
    const key = panel === "date" ? "sd" : panel === "end" ? "ned" : "until";
    return <DatePanel value={t[key]} title={panel === "date" ? "Pick a date" : panel === "end" ? "Last day" : "Repeats until"} who={panel === "date" ? t.people : []} skip={t.id}
      onBack={() => setPanel(panel === "until" ? "repeat" : null)}
      onPick={v => { if (panel === "date") setStartDay(v); else if (panel === "end") set({ ned: v < t.sd ? t.sd : v }); else set({ until: v, untilOn: true }); setPanel(panel === "until" ? "repeat" : null); }} />;
  }
  if (panel === "repeat") return <RepeatPanel t={t} set={set} onBack={() => setPanel(null)} onUntil={() => setPanel("until")} />;

  const body = (
    <>
      {editing && wasRep ? <div className="esh-note"><Ico d="repeat" /><span>{cap(start.title)} happens <b>{repeatWords(start)}</b>. Changes here change every one of them.</span></div> : null}
      {editing ? null : (
        <form className="esh-quick" onSubmit={e => { e.preventDefault(); if (!quick.trim()) return; const q = quickAdd(quick, now, people); setErr(""); setT(x => ({ ...x, ...q, days: q.days || [dayCode(fromYmd(q.sd || x.sd))], title: q.title || x.title })); setQuick(""); }}>
          <input value={quick} onChange={e => setQuick(e.target.value)} placeholder="Or just type it: Football Saturday 9am for 2 hours" aria-label="Quick add" autoComplete="off" enterKeyHint="go" maxLength={120} />
          <button type="submit" disabled={!quick.trim()}>Fill in</button>
        </form>
      )}
      {again.length ? <div className="esh-again">{again.map(e => <button key={e.name} onClick={() => useAgain(e)}>{e.icon ? e.icon + " " : ""}{e.name}</button>)}</div> : null}

      <Label>What's happening?</Label>
      <input ref={titleRef} className="esh-name" value={t.title} onChange={e => set({ title: e.target.value })} maxLength={80} placeholder="Swimming, dentist, birthday party…" autoComplete="off" />

      <Label>Which day</Label>
      <div className="esh-days">
        {near.map((d, i) => {
          const on = ymd(d) === t.sd;
          return <button key={i} className={on ? "on" : ""} aria-pressed={on} onClick={() => setStartDay(ymd(d))}><small>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "short" })}</small><b>{i < 2 ? d.toLocaleDateString([], { weekday: "short" }) + " " + d.getDate() : d.getDate()}</b></button>;
        })}
        <button className={custom ? "on" : ""} aria-pressed={custom} onClick={() => setPanel("date")}><small>{custom ? sdDate.toLocaleDateString([], { weekday: "short" }) : "Other"}</small><b>{custom ? sdDate.toLocaleDateString([], { day: "numeric", month: "short" }) : "Pick…"}</b></button>
      </div>

      <Label right={t.allDay ? null : durWords}>When</Label>
      {t.allDay ? (
        <div className="esh-allday">
          <span><b>All day</b>{t.ned > t.sd ? ` · until ${shortDate(fromYmd(t.ned))}` : ""}</span>
          <button onClick={() => setPanel("end")}>{t.ned > t.sd ? "Change last day" : "Runs more than a day"}</button>
        </div>
      ) : (
        <div className="esh-when">
          <div className="step"><button aria-label="Start earlier" onClick={() => moveStart(-15)}>−</button><span><small>Starts</small><b className="num">{fmtT(startAt, h24)}</b></span><button aria-label="Start later" onClick={() => moveStart(15)}>+</button></div>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8d929c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <div className="step"><button aria-label="End earlier" onClick={() => moveEnd(-15)}>−</button><span><small>Ends{t.ned !== t.sd ? " " + shortDate(endAt) : ""}</small><b className="num">{fmtT(endAt, h24)}</b></span><button aria-label="End later" onClick={() => moveEnd(15)}>+</button></div>
        </div>
      )}
      <div className="esh-chips">
        <span className="esh-chips-l">Quick:</span>
        {LENGTHS.map(([m, l]) => <button key={m} className={!t.allDay && dur === m ? "on" : ""} onClick={() => setLen(m)}>{l}</button>)}
        <button className={t.allDay ? "on" : ""} onClick={() => set({ allDay: !t.allDay, ...(!t.allDay && t.ned < t.sd ? { ned: t.sd } : {}) })}>All day</button>
      </div>

      <Label>Who's going</Label>
      <div className="esh-who">
        {people.map(p => {
          const on = t.people.includes(p.id);
          return (
            <button key={p.id} className={on ? "on" : ""} aria-pressed={on} style={{ "--pc": p.color } as CSSProperties} onClick={() => set({ people: toggle(t.people, p.id) })}>
              <Face name={p.name} color={p.color} pal={p.pal} size={50} />
              <span>{p.name}</span>
              <i className="tick" aria-hidden><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></i>
            </button>
          );
        })}
        {people.length > 1 ? <button className={"plain" + (pick.length === people.length ? " all" : "")} onClick={() => set({ people: pick.length === people.length ? [] : people.map(p => p.id) })}>Everyone</button> : null}
        <button className="plain" onClick={() => openSheet({ mode: "family", back: t })}>+ Add someone</button>
      </div>

      <Label>Repeats</Label>
      <div className="esh-chips">
        {([["none", "Just once"], ["week", "Every week"], ["school", "Every school day"], ["month", "Every month"], ["year", "Every year"]] as [Preset, string][]).map(([p, l]) =>
          <button key={p} className={preset === p ? "on" : ""} onClick={() => set(applyPreset(p, t))}>{l}</button>)}
        <button className={"dash" + (["day", "fortnight", "custom"].includes(preset) ? " on" : "")} onClick={() => setPanel("repeat")}>{["day", "fortnight", "custom"].includes(preset) ? cap(repeatWords({ ...t, untilOn: false })) : "Custom…"}</button>
      </div>
      {rep ? <button className="esh-rep" onClick={() => setPanel("repeat")}><Ico d="repeat" /><span><small>Repeats</small><b>{cap(repeatWords(t))}</b></span><ChevR /></button> : null}

      <Label>Where (optional)</Label>
      <input className="esh-field" value={t.location} onChange={e => set({ location: e.target.value })} maxLength={80} placeholder="School, the park…" autoComplete="off" />

      <button className="esh-more" aria-expanded={more} onClick={() => setMore(m => !m)}>{more ? "Fewer details" : "More details: notes, a picture, reminders…"}</button>
      <div className={"xp" + (more ? " open" : "")} inert={!more}><div>
        <Label>Notes</Label>
        <textarea className="esh-field" rows={2} value={t.notes} onChange={e => set({ notes: e.target.value })} maxLength={600} placeholder="Anything to remember" />
        <Label>A picture</Label>
        <div className="esh-chips">
          <button className={!t.icon ? "on" : ""} onClick={() => set({ icon: "" })}>None</button>
          {ICONS.map(i => <button key={i} className={"ico" + (t.icon === i ? " on" : "")} aria-label={"Picture " + i} onClick={() => set({ icon: t.icon === i ? "" : i })}>{i}</button>)}
        </div>
        <Label>Remind us</Label>
        <div className="esh-chips">{REMIND.map(([m, l]) => <button key={String(m)} className={t.remind === m ? "on" : ""} onClick={() => set({ remind: m })}>{l}</button>)}</div>
        <Label>Time to get there</Label>
        <div className="esh-chips">{TRAVEL.map(([m, l]) => <button key={m} className={t.travel === m ? "on" : ""} onClick={() => set({ travel: m })}>{l}</button>)}</div>
        <Label>Things to take</Label>
        {t.checklist.map((c, i) => <div className="esh-ck" key={i}><span>{c}</span><button aria-label={"Remove " + c} onClick={() => set({ checklist: t.checklist.filter((_, j) => j !== i) })}><XIcon /></button></div>)}
        <form className="esh-quick" onSubmit={e => { e.preventDefault(); const v = ck.trim(); if (v && t.checklist.length < 20) { set({ checklist: [...t.checklist, v] }); setCk(""); } }}>
          <input value={ck} onChange={e => setCk(e.target.value)} maxLength={60} placeholder="Swim bag, towel…" aria-label="Add a thing to take" autoComplete="off" enterKeyHint="done" />
          <button type="submit" disabled={!ck.trim()}>Add</button>
        </form>
        <Label>Link</Label>
        <input className="esh-field" value={t.link} onChange={e => set({ link: e.target.value })} maxLength={300} inputMode="url" autoCapitalize="off" placeholder="https://… a map or booking page" autoComplete="off" />
      </div></div>
      {clash.length ? <div className="esh-clash"><Ico d="clock" /><span>{joinNames(clashNames)} already {clashNames.length > 1 ? "have" : "has"} <b>{joinNames(clash.slice(0, 2).map(e => `${e.name} at ${fmtT(e.s, h24)}`))}</b> then.</span></div> : null}
    </>
  );
  const foot = askScope
    ? <><button className="esh-go" disabled={busy} onClick={() => save("after")}>From {shortDate(fromYmd(t.occ!.slice(0, 10)))} on</button><button className="esh-plain" disabled={busy} onClick={() => save("all")}>Every one</button><button className="esh-plain" onClick={() => setAskScope(false)}>Back</button></>
    : <><button className="esh-plain" onClick={closeSheet}>Cancel</button><button className="esh-go wide" disabled={busy} onClick={() => save()}>{busy ? "Saving…" : saveWords}</button></>;
  return (
    <Frame
      head={<><h2 className="esh-h">{editing ? "Edit event" : "New event"}</h2>{editing && pick.length ? <span className="esh-own" style={{ background: soft(pick[0].color) }}><i style={{ color: deep(pick[0].color) }}>{initial(pick[0].name)}</i>{pick.length === 1 ? pick[0].name + "’s event" : joinNames(pick.map(p => p.name))}</span> : null}<Close /></>}
      body={body} err={err || (askScope ? `Change the ones from ${longDay(fromYmd(t.occ!.slice(0, 10)))} on, or every one?` : "")}
      foot={foot} />
  );
}

/* ---------- Pick a date ---------- */

function DatePanel({ value, title, who, skip, onPick, onBack }: { value: string; title: string; who: string[]; skip: string; onPick: (v: string) => void; onBack: () => void }) {
  const { now, people, h24 } = useHub();
  const [sel, setSel] = useState(value);
  const [month, setMonth] = useState(() => { const d = fromYmd(value || ymd(now)); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const first = weekStart(month);
  const { data } = useEvents(first, addDays(first, 42));
  const today = startOfDay(now);
  const nextSat = addDays(today, (6 - today.getDay() + 7) % 7);
  const nextMon = addDays(today, ((8 - today.getDay()) % 7) || 7);
  const quick: [string, Date][] = [["This weekend", nextSat], ["Next Monday", nextMon], ["In two weeks", addDays(today, 14)], ["Next month", new Date(today.getFullYear(), today.getMonth() + 1, 1)]];
  const pickDay = (d: Date) => { setSel(ymd(d)); if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); };
  const selDate = fromYmd(sel);
  const busy = who.length && data ? data.list.filter(e => onDay(e, selDate) && (!skip || e.series !== skip) && (e.people || []).some(p => who.includes(p))) : [];
  const busyNames = [...new Set(busy.flatMap(e => peopleOf(e, people).filter(p => who.includes(p.id)).map(p => p.name)))];
  return (
    <Frame
      head={<><Back onClick={onBack} /><h2 className="esh-h center">{title}</h2><span style={{ width: 92 }} /></>}
      body={<div className="sheetsec" style={{ "--d": 0 } as CSSProperties}>
        <div className="dp-quick">{quick.map(([l, d]) => <button key={l} className={ymd(d) === sel ? "on" : ""} onClick={() => pickDay(d)}><b>{l}</b><small>{shortDate(d)}</small></button>)}</div>
        <div className="dp">
          <div className="dp-head">
            <button aria-label="Previous month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><ChevL /></button>
            <b>{month.toLocaleDateString([], { month: "long", year: "numeric" })}</b>
            <button aria-label="Next month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}><ChevR /></button>
          </div>
          <div className="dp-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(w => <span key={w} className="dp-w">{w}</span>)}
            {Array.from({ length: 42 }, (_, i) => {
              const d = addDays(first, i), inM = d.getMonth() === month.getMonth(), on = ymd(d) === sel, isToday = sameDay(d, now);
              const dots = data ? [...new Set(data.list.filter(e => onDay(e, d)).flatMap(e => colorsOf(e, data, people)))].slice(0, 3) : [];
              return (
                <button key={i} className={"dp-d" + (on ? " on" : "") + (isToday ? " now" : "") + (inM ? "" : " out") + (d < today ? " past" : "")} aria-label={longDay(d)} aria-pressed={on} onClick={() => pickDay(d)}>
                  <b className="num">{d.getDate()}</b>
                  <span>{dots.map(c => <i key={c} style={{ background: c }} />)}</span>
                </button>
              );
            })}
          </div>
        </div>
        {busy.length ? <div className="esh-clash"><Ico d="clock" /><span>{joinNames(busyNames)} already {busyNames.length > 1 ? "have" : "has"} <b>{joinNames(busy.slice(0, 2).map(e => e.all_day ? e.title : `${e.title} at ${fmtT(e.s, h24)}`))}</b> that day.</span></div> : null}
      </div>}
      foot={<button className="esh-go" style={{ flex: 1 }} onClick={() => onPick(sel)}>Use {selDate.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</button>} />
  );
}

/* ---------- How it repeats ---------- */

function RepeatPanel({ t, set, onBack, onUntil }: { t: EventDraft; set: (p: Partial<EventDraft>) => void; onBack: () => void; onUntil: () => void }) {
  const d = fromYmd(t.sd), wd = d.toLocaleDateString([], { weekday: "long" });
  const preset = presetOf(t);
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const opts: [Preset, string, string][] = [
    ["none", "Just once", longDay(d)], ["day", "Every day", "Starting " + shortDate(d)], ["week", "Every week", "On " + wd + "s"], ["school", "Every school day", "Monday to Friday"],
    ["month", "Every month", "On the " + ord(d.getDate())], ["year", "Every year", "On " + d.toLocaleDateString([], { day: "numeric", month: "long" })], ["fortnight", "Every other week", "On " + wd + "s"], ["custom", "Custom", "Pick days and an end"],
  ];
  const showCustom = customOpen || preset === "custom";
  const units: [string, string][] = [["daily", "days"], ["weekly", "weeks"], ["monthly", "months"], ["yearly", "years"]];
  return (
    <Frame
      head={<><Back onClick={onBack} /><h2 className="esh-h center">How often?</h2><span style={{ width: 92 }} /></>}
      body={<div className="sheetsec" style={{ "--d": 0 } as CSSProperties}>
        <div className="rp-opts">
          {opts.map(([p, l, s]) => {
            const on = p === "custom" ? showCustom : !showCustom && preset === p;
            return <button key={p} className={on ? "on" : ""} aria-pressed={on} onClick={() => { if (p === "custom") { setCustomOpen(true); set(applyPreset("custom", t)); } else { setCustomOpen(false); set(applyPreset(p, t)); } }}><i /><span><b>{l}</b><small>{s}</small></span></button>;
          })}
        </div>
        <div className={"xp" + (showCustom ? " open" : "")} inert={!showCustom}><div>
          <div className="rp-custom">
            <div className="rp-row">
              <span className="rp-l">Every</span>
              <div className="rp-n"><button aria-label="Fewer" onClick={() => set({ interval: Math.max(1, t.interval - 1) })}>−</button><b className="num">{t.interval}</b><button aria-label="More" onClick={() => set({ interval: Math.min(30, t.interval + 1) })}>+</button></div>
              <div className="rp-units">{units.map(([f, l]) => <button key={f} className={t.freq === f ? "on" : ""} onClick={() => set({ freq: f, ...(f === "weekly" && !t.days.length ? { days: [dayCode(d)] } : {}) })}>{t.interval === 1 ? l.slice(0, -1) : l}</button>)}</div>
            </div>
            {t.freq === "weekly" ? (
              <div className="rp-row">
                <span className="rp-l">On</span>
                <div className="rp-days">{DAYCODES.map((c, i) => <button key={c} className={t.days.includes(c) ? "on" : ""} aria-pressed={t.days.includes(c)} aria-label={DAYNAMES[i]} onClick={() => set({ days: t.days.includes(c) ? t.days.filter(x => x !== c) : [...t.days, c] })}>{"MTWTFSS"[i]}</button>)}</div>
              </div>
            ) : null}
          </div>
        </div></div>
        {t.freq !== "none" ? (
          <div className="rp-row rp-end">
            <span className="rp-l">Ends</span>
            <div className="rp-ends">
              <button className={!t.untilOn ? "on" : ""} onClick={() => set({ untilOn: false })}><b>Never</b><small>keeps going</small></button>
              <button className={t.untilOn ? "on" : ""} onClick={onUntil}><small>On a date</small><b>{t.untilOn ? fromYmd(t.until).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "Pick…"}</b></button>
            </div>
          </div>
        ) : null}
        {t.freq !== "none" ? <div className="rp-sum"><Ico d="repeat" /><span>{cap(repeatWords(t))}.</span></div> : null}
      </div>}
      foot={<button className="esh-go" style={{ flex: 1 }} onClick={onBack}>Done</button>} />
  );
}

/* ---------- Adding to one day ---------- */

const PARTS: [string, number | null][] = [["All day", null], ["Morning", 9], ["After school", 15.5], ["Evening", 18]];

/** A short sheet for one day: what's already on, and a quick way to add something (a name, a time, who), or more options. */
export function QuickAddSheet({ day, hour, who }: { day: Date; hour?: number; who?: string | null }) {
  const { people, now, h24, openSheet, closeSheet, soon } = useHub();
  const { openCal } = useNav();
  const qc = useQueryClient();
  const d = startOfDay(day);
  const { data } = useEvents(weekStart(d), addDays(weekStart(d), 7));
  const evs = data ? data.list.filter(e => onDay(e, d)).sort((a, b) => (+b.all_day - +a.all_day) || +a.s - +b.s) : [];
  const [name, setName] = useState("");
  const [at, setAt] = useState<number | null>(hour ?? (sameDay(d, now) ? Math.min(20, now.getHours() + 1) : 15.5));
  const [whoOn, setWho] = useState<string[]>(who ? [who] : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  useAutoFocus(nameRef, SHEET_MS);
  const ahead = dayDiff(d, startOfDay(now));
  const draft = (): EventDraft => {
    const h = at ?? 9, s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(h), Math.round((h % 1) * 60)), e = new Date(+s + 3600000);
    return { id: "", title: name.trim(), location: "", allDay: at === null, sd: ymd(d), st: hmOf(s), ned: ymd(at === null ? d : e), net: hmOf(e), people: whoOn, freq: "none", interval: 1, days: [dayCode(d)], untilOn: false, until: ymd(addDays(d, 90)), notes: "", link: "", travel: 0, checklist: [], icon: "", remind: null };
  };
  const add = async () => {
    if (!name.trim()) { setErr("Give it a name first."); return; }
    const t = draft();
    setBusy(true);
    try {
      await post("/api/hub-event", { id: "", title: t.title, location: "", all_day: t.allDay, start: t.allDay ? t.sd : `${t.sd}T${t.st}`, end: t.allDay ? t.sd : `${t.ned}T${t.net}`, people: t.people, notes: "", link: "", travel: 0, checklist: [], icon: "", remind: null, repeat: { freq: "none", interval: 1, days: [], until: null } });
      closeSheet(); qc.invalidateQueries({ queryKey: ["events"] });
      soon(`${t.title} added`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const tapped = hour !== undefined && !PARTS.some(([, h]) => h === hour);
  const parts: [string, number | null][] = tapped ? [[fmtT(new Date(2000, 0, 1, Math.floor(hour!), Math.round((hour! % 1) * 60)), h24), hour!], ...PARTS] : PARTS;
  return (
    <Frame
      head={<>
        <div className="esh-title"><span>{ahead === 0 ? "Today" : ahead === 1 ? "Tomorrow" : ahead === -1 ? "Yesterday" : ahead > 0 ? `In ${ahead} days` : `${-ahead} days ago`} · {evs.length ? `${evs.length} thing${evs.length > 1 ? "s" : ""} on` : "nothing on yet"}</span><h2>{longDay(d)}</h2></div>
        <button className="esh-plain sm" onClick={() => { closeSheet(); openCal("day", d); }}>Open this day</button>
        <Close />
      </>}
      body={<>
        {evs.length ? <div className="qa-list">{evs.slice(0, 6).map(e => {
          const ps = peopleOf(e, people), c = data ? colorsOf(e, data, people)[0] : "#8a93a6";
          return (
            <button key={e.id} className="qa-ev" style={{ background: soft(c) }} onClick={() => openSheet({ mode: "details", e })}>
              <b className="num" style={{ color: deep(c) }}>{e.all_day ? "All day" : fmtT(e.s, h24)}</b>
              <span>{e.title}</span>
              <span className="qa-faces">{ps.slice(0, 3).map(p => <Ava key={p.id} p={p} size={32} cls="qa-ava" />)}</span>
            </button>
          );
        })}{evs.length > 6 ? <div className="qa-more">and {evs.length - 6} more</div> : null}</div> : null}
        <div className="qa-box">
          <form className="qa-name" onSubmit={e => { e.preventDefault(); void add(); }}>
            <input ref={nameRef} value={name} onChange={e => { setErr(""); setName(e.target.value); }} placeholder="What's happening?" aria-label="New event name" maxLength={80} autoComplete="off" enterKeyHint="done" />
            <button type="submit" className="esh-go" disabled={busy || DEMO}>Add</button>
          </form>
          <div className="esh-chips">{parts.map(([l, h]) => <button key={l} className={at === h ? "on" : ""} onClick={() => setAt(h)}><b>{l}</b>{h !== null && !tapped ? <small>{fmtT(new Date(2000, 0, 1, Math.floor(h), Math.round((h % 1) * 60)), h24)}</small> : null}</button>)}</div>
          <div className="qa-who">
            {people.map(p => { const on = whoOn.includes(p.id); return <button key={p.id} className={on ? "on" : ""} aria-pressed={on} aria-label={p.name} style={{ "--pc": p.color } as CSSProperties} onClick={() => setWho(w => on ? w.filter(x => x !== p.id) : [...w, p.id])}><Face name={p.name} color={p.color} pal={p.pal} size={46} /></button>; })}
            <span style={{ flex: 1 }} />
            <button className="qa-more-btn" onClick={() => openSheet({ mode: "event", draft: draft() })}>More options</button>
          </div>
        </div>
      </>}
      err={err} />
  );
}

/** Opening someone's event from anywhere: the details sheet. */
export const useOpenEvent = () => { const { openSheet } = useHub(); return (e: Ev) => openSheet({ mode: "details", e }); };
export type { Person };
