import { useMemo, useRef, useState } from "react";
import { SHEET_MS, useAutoFocus } from "../lib/focus";
import { useQuery } from "@tanstack/react-query";
import { addDays, fmtT, hmOf, longDay, nowZ, sameDay, startOfDay, ymd } from "../lib/dates";
import { calOf, fetchEvents, type Ev, type EvData } from "../lib/events";
import { useHub } from "../hub";
import { loadEventDraft, newEventDraft } from "./Sheets";
import { Pill, SheetFrame } from "./SheetFrame";

/** Everything from about three months back to ten months ahead, in four requests the hub is happy with. */
async function everything(): Promise<EvData> {
  const d = startOfDay(nowZ());
  const parts = await Promise.all([[-100, 0], [0, 100], [100, 200], [200, 300]].map(([a, b]) => fetchEvents(addDays(d, a), addDays(d, b))));
  const seen = new Set<string>(), list: Ev[] = [];
  for (const p of parts) for (const e of p.list) if (!seen.has(e.id + e.start)) { seen.add(e.id + e.start); list.push(e); }
  return { list, cals: Object.assign({}, ...parts.map(p => p.cals)) };
}

/** Search the whole calendar, or find a time when the people you pick are all free. */
export function FindSheet() {
  const [tab, setTab] = useState<"search" | "free">("search");
  return <SheetFrame title={tab === "search" ? "Search" : "Find a free time"} body={tab === "search" ? <Search tab={tab} setTab={setTab} /> : <Free tab={tab} setTab={setTab} />} foot={<Done />} />;
}
const Done = () => { const { closeSheet } = useHub(); return <button className="primary" onClick={closeSheet} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>; };
const Tabs = ({ tab, setTab }: { tab: string; setTab: (t: "search" | "free") => void }) => (
  <div className="fx" style={{ gap: 8, margin: "6px 0 14px" }}><Pill on={tab === "search"} onClick={() => setTab("search")}>Search</Pill><Pill on={tab === "free"} onClick={() => setTab("free")}>Find a free time</Pill></div>
);

function Search({ tab, setTab }: { tab: string; setTab: (t: "search" | "free") => void }) {
  const { people, h24, openSheet, soon, now } = useHub();
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useAutoFocus(searchRef, SHEET_MS);
  const { data, isLoading } = useQuery({ queryKey: ["search-all"], queryFn: everything, staleTime: 60000 });
  const term = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (term.length < 2 || !data) return { next: [] as Ev[], earlier: [] as Ev[] };
    const m = data.list.filter(e => [e.name || e.title, e.location, e.notes].some(x => (x || "").toLowerCase().includes(term)));
    const t0 = +startOfDay(now);
    const once = (l: Ev[]) => { const seen = new Set<string>(); return l.filter(e => { const k = e.series || (e.name + "|" + e.cal); return seen.has(k) ? false : (seen.add(k), true); }); };      // a repeating event is listed once
    return { next: once(m.filter(e => +e.e >= t0)).slice(0, 40), earlier: once(m.filter(e => +e.e < t0).reverse()).slice(0, 20) };
  }, [term, data, now]);
  const open = async (e: Ev) => {
    if (!e.hub || e.fixed) return openSheet({ mode: "view", e, cal: calOf(e, data!, people) });
    try { openSheet({ mode: "event", draft: await loadEventDraft(e) }); } catch (err: any) { soon(err.message); }
  };
  const row = (e: Ev) => (
    <button key={e.id + e.start} className="srow" onClick={() => open(e)}>
      <span className="sd num"><b>{e.s.toLocaleDateString([], { day: "numeric" })}</b><small>{e.s.toLocaleDateString([], { month: "short" })}</small></span>
      <span className="sm"><b>{e.title}</b><small>{e.s.toLocaleDateString([], { weekday: "long" })}{e.all_day ? "" : " · " + fmtT(e.s, h24)}{e.location ? " · " + e.location : ""}{(e as any).repeats ? " · repeats" : ""}</small></span>
    </button>
  );
  return (
    <>
      <Tabs tab={tab} setTab={setTab} />
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search events, places and notes" aria-label="Search" autoComplete="off" ref={searchRef} enterKeyHint="search" />
      {isLoading ? <p className="upn" style={{ marginTop: 16 }}>Looking through the calendar…</p> : null}
      {term.length >= 2 && data && !hits.next.length && !hits.earlier.length ? <p className="upn" style={{ marginTop: 16 }}>Nothing found for “{q.trim()}”.</p> : null}
      {hits.next.length ? <><div className="cap" style={{ margin: "20px 0 6px" }}>Coming up</div>{hits.next.map(row)}</> : null}
      {hits.earlier.length ? <><div className="cap" style={{ margin: "20px 0 6px" }}>Earlier</div>{hits.earlier.map(row)}</> : null}
    </>
  );
}

const HOURS: [number, string][] = [[0.5, "30 min"], [1, "1 hour"], [2, "2 hours"], [3, "3 hours"]];

function Free({ tab, setTab }: { tab: string; setTab: (t: "search" | "free") => void }) {
  const { people, h24, openSheet, now } = useHub();
  const [who, setWho] = useState<string[]>(() => people.map(p => p.id));
  const [len, setLen] = useState(1);
  const d0 = startOfDay(now);
  const { data } = useQuery({ queryKey: ["free", ymd(d0)], queryFn: () => fetchEvents(d0, addDays(d0, 8)), staleTime: 30000 });
  const slots = useMemo(() => {
    const out: { s: Date; e: Date }[] = [];
    if (!data || !who.length) return out;
    const mine = data.list.filter(e => !e.all_day && e.hub && (e.people || []).some(p => who.includes(p)));
    for (let i = 0; i < 8 && out.length < 10; i++) {
      const day = addDays(d0, i), open = new Date(+day + 8 * 3600000), close = new Date(+day + 21 * 3600000);
      let cur = sameDay(day, now) && +now > +open ? new Date(Math.ceil(+now / 900000) * 900000) : open;
      const busy = mine.filter(e => +e.s < +close && +e.e > +cur).sort((a, b) => +a.s - +b.s);
      for (const b of busy) { if (+b.s - +cur >= len * 3600000) out.push({ s: cur, e: b.s }); if (+b.e > +cur) cur = b.e; }
      if (+close - +cur >= len * 3600000) out.push({ s: cur, e: close });
    }
    return out.slice(0, 10);
  }, [data, who, len, now]);
  const pick = (s: Date) => {
    const e = new Date(+s + len * 3600000), draft = newEventDraft(startOfDay(s), s.getHours() + s.getMinutes() / 60, now, null);
    openSheet({ mode: "event", draft: { ...draft, people: who.length === people.length ? [] : who, ned: ymd(e), net: hmOf(e) } });
  };
  const mins = (a: Date, b: Date) => { const m = Math.round((+b - +a) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? " " + (m % 60) + "m" : ""} free` : `${m} min free`; };
  return (
    <>
      <Tabs tab={tab} setTab={setTab} />
      <div className="cap" style={{ margin: "6px 0 8px" }}>Who needs to be there?</div>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
        {people.map(p => <button key={p.id} className={"pill" + (who.includes(p.id) ? " on" : "")} style={{ height: 52 }} onClick={() => setWho(w => w.includes(p.id) ? w.filter(x => x !== p.id) : [...w, p.id])}>{p.name}</button>)}
      </div>
      <div className="cap" style={{ margin: "20px 0 8px" }}>For how long?</div>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>{HOURS.map(([h, l]) => <Pill key={h} on={len === h} onClick={() => setLen(h)}>{l}</Pill>)}</div>
      <div className="cap" style={{ margin: "22px 0 6px" }}>Free times, between 8am and 9pm</div>
      {!people.length ? <p className="upn">Add the family first, then this can find a time.</p>
        : !who.length ? <p className="upn">Pick at least one person.</p>
        : slots.length ? slots.map((x, i) => (
          <button key={i} className="srow" onClick={() => pick(x.s)}>
            <span className="sd num"><b>{x.s.toLocaleDateString([], { day: "numeric" })}</b><small>{x.s.toLocaleDateString([], { month: "short" })}</small></span>
            <span className="sm"><b>{sameDay(x.s, now) ? "Today" : longDay(x.s).split(" ")[0]} {fmtT(x.s, h24)} to {fmtT(x.e, h24)}</b><small>{mins(x.s, x.e)} · tap to plan something</small></span>
          </button>
        )) : <p className="upn">{data ? "No free time that long in the next week." : "Looking…"}</p>}
    </>
  );
}
