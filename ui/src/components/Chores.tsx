import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEMO, post } from "../lib/api";
import { addDays, fromYmd, sameDay, startOfDay, weekStart, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR, DockIcon } from "../lib/icons";
import { NO_CHORES, useChores, usePatchChores, type Chores, type Job, type Kid } from "../data";
import { palColor } from "../lib/pals";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { SheetFrame } from "./SheetFrame";
import { PageHead, wrap } from "./Panels";

const kidColor = palColor;
export const jobDone = (j: Job) => j.status === "pending" || j.status === "approved";
const jobTally = (jobs: Job[]) => [jobs.filter(jobDone).length, jobs.length];

function jobsByKid(c: Chores, day: Date) {
  const d = c.days[ymd(day)] || { jobs: [], away: [] };
  return c.kids.map(k => ({ kid: k, away: (d.away || []).includes(k.id), jobs: d.jobs.filter(j => j.kid_id === k.id) })).filter(g => g.jobs.length || g.away);
}
/** A day's jobs: still to do, done (ticked or checked), and ticked but waiting for a grown-up to check. Away children don't count. */
function jobCounts(c: Chores, day: Date) {
  let left = 0, done = 0, waiting = 0;
  for (const g of jobsByKid(c, day)) if (!g.away) for (const j of g.jobs) { if (jobDone(j)) done++; else left++; if (j.status === "pending") waiting++; }
  return { left, done, waiting };
}

/** When in the day a job is meant to be done, as PocketPals sets it, in the order the day goes. */
const SLOTS: [string, string][] = [["morning", "Morning"], ["school", "After school"], ["dinner", "Dinner time"], ["bed", "Bedtime"], ["any", "Any time"]];
const slotOf = (j: Job) => SLOTS.some(([id]) => id === j.slot) ? j.slot! : "any";
const bySlot = (jobs: Job[]) => SLOTS.map(([id, name]) => ({ id, name, jobs: jobs.filter(j => slotOf(j) === id) })).filter(s => s.jobs.length);
/** Jobs in the order the day goes, the ones still to do first. */
const inOrder = (jobs: Job[]) => [...jobs].sort((x, y) => (+jobDone(x) - +jobDone(y)) || SLOTS.findIndex(([id]) => id === slotOf(x)) - SLOTS.findIndex(([id]) => id === slotOf(y)));

/** PocketPals' own address, for "Open PocketPals". */
const usePpUrl = () => { const { S } = useHub(); return S.config.pocketpals?.url || S.config.widgets.find(w => w.id === "pocketpals")?.url || ""; };

function PalFrame({ kid, head, cls }: { kid: Kid; head: boolean; cls?: string }) {
  const { S } = useHub();
  if (!kid.pal_url) return null;
  const base = (S.config.pocketpals?.url || "").replace(/\/$/, "");
  return <iframe className={"palf " + (cls || "")} src={base + kid.pal_url + (head ? "&head=1" : "")} tabIndex={-1} scrolling="no" aria-hidden="true" loading="lazy" />;
}

/** Ticking a job, a job's steps, and the checks that go before. Each shows at once, then tells PocketPals (and undoes itself if it says no). */
export function useJobActions(c: Chores) {
  const qc = useQueryClient();
  const patch = usePatchChores();
  const { soon, openSheet } = useHub();
  const find = (key: string) => { const [kid, chore, day] = key.split("|"); return { j: (c.days[day]?.jobs || []).find(x => x.kid_id == +kid && x.chore_id == +chore), kid: +kid, chore: +chore, day }; };
  const edit = (key: string, f: (j: Job) => void) => patch(cc => { const { j } = (() => { const [kid, chore, day] = key.split("|"); return { j: (cc.days[day]?.jobs || []).find(x => x.kid_id == +kid && x.chore_id == +chore) }; })(); if (j) f(j); });
  const tick = async (key: string) => {
    const { j, kid, chore, day } = find(key);
    if (!j) return;
    if (j.status === "approved") return soon("A grown-up has already checked this one.");
    if (!c.tick) return soon("This key can only show jobs. Make one that can tick them.");
    if (!jobDone(j) && !j.tickable) return soon(j.steps_left ? "This one has steps. Do it in PocketPals." : "Not yet. It can be ticked on its day.");
    const was = j.status, now = jobDone(j) ? null : "pending";
    edit(key, x => { x.status = now; });
    if (DEMO) return;                                    // sample jobs only change on the screen
    try { await post("/api/chores/tick", { kid_id: kid, chore_id: chore, day, done: now !== null }); }
    catch (err: any) { edit(key, x => { x.status = was; }); soon(err.message); }
  };
  const openSteps = (key: string) => {
    const { j } = find(key);
    if (!j) return;
    if (!c.tick) return soon("This key can only show jobs. Make one that can tick them.");
    if (!jobDone(j) && !j.steps_tickable) return soon("Not yet. It can be ticked on its day.");
    openSheet({ mode: "steps", key });
  };
  const tickStep = async (key: string, id: number) => {
    const { j, kid, chore, day } = find(key), st = j?.steps?.find(x => x.id === id);
    if (!j || !st) return;
    const was = { status: j.status, left: j.steps_left, done: st.done };
    const done = !st.done;
    edit(key, x => {
      const s = x.steps!.find(y => y.id === id)!; s.done = done;
      x.steps_left = x.steps!.filter(y => !y.done).length;
      if (x.steps_left === 0 && done) x.status = "pending"; else if (!done && x.status === "pending") x.status = null;
    });
    if (DEMO) return;
    try {
      await post("/api/chores/step", { kid_id: kid, chore_id: chore, step_id: id, day, done });
      await qc.invalidateQueries({ queryKey: ["chores"] });             // PocketPals has the last word
    } catch (err: any) {
      edit(key, x => { const s = x.steps!.find(y => y.id === id)!; s.done = was.done; x.status = was.status; x.steps_left = was.left; });
      soon(err.message);
    }
  };
  return { tick, openSteps, tickStep, find };
}

const Star = ({ size = 16, color = "#ffc21a" }: { size?: number; color?: string }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.3l-5.9 3.2 1.2-6.6L2.5 9.3l6.6-.9z" fill={color} stroke="rgba(150,90,0,.35)" strokeWidth="1" strokeLinejoin="round" /></svg>;

/** The child's pal from PocketPals, or (before it loads, or with no pal) their colour with their first letter. */
function KidFace({ kid, col, head }: { kid: Kid; col: string; head: boolean }) {
  return <>{kid.pal_url ? <PalFrame kid={kid} head={head} /> : <span className="ppini" style={{ background: col }}>{(kid.name.trim()[0] || "?").toUpperCase()}</span>}</>;
}

/** A ring that fills as jobs get done, springing to its new place when one is ticked. */
function Ring({ n, t, col, size, w = 5, children }: { n: number; t: number; col: string; size: number; w?: number; children: ReactNode }) {
  const r = size / 2 - w / 2 - 1, C = 2 * Math.PI * r, f = t ? n / t : 0;
  return (
    <span className="ppring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ebe9e4" strokeWidth={w} />
        <circle className="ppring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - f)} style={{ "--C": C } as CSSProperties} />
      </svg>
      <span className="ppring-in">{children}</span>
    </span>
  );
}
/** The child's pal inside their ring. */
const KidRing = ({ kid, col, n, t, size }: { kid: Kid; col: string; n: number; t: number; size: number }) => (
  <Ring n={n} t={t} col={col} size={size} w={size > 70 ? 6 : 5}>
    <span className="ppav" style={{ "--kc": col, width: size - (size > 70 ? 20 : 16), height: size - (size > 70 ? 20 : 16) } as CSSProperties}><KidFace kid={kid} col={col} head /></span>
  </Ring>
);

type PillKind = "ok" | "wait" | "todo";
export const ChPill = ({ kind, children }: { kind: PillKind; children: ReactNode }) => <span className={"chpill " + kind}>{children}</span>;

/** Where a job has got to, the way the parent portal says it. */
function jobStatus(j: Job): { kind: PillKind; long: string } | null {
  if (j.status === "approved") return { kind: "ok", long: "Checked" };
  if (j.status === "pending") return { kind: "wait", long: "Waiting for a grown-up" };
  if (j.status === "rejected") return { kind: "todo", long: "Sent back to do again" };
  return null;
}

/** One job, as a tile. Tapping ticks it at once; a job with steps opens its checklist. `small` is the Home card's size. */
function JobItem({ j, day, color, small, acts, c }: { j: Job; day: Date; color: string; small?: boolean; acts: ReturnType<typeof useJobActions>; c: Chores }) {
  const key = `${j.kid_id}|${j.chore_id}|${ymd(day)}`, done = jobDone(j), st = jobStatus(j);
  const [burst, setBurst] = useState(0);
  const steps = j.steps && j.steps.length ? j.steps : null, n = steps ? steps.filter(x => x.done).length : 0;
  const locked = !steps && (j.status === "approved" || (!done && !j.tickable) || !c.tick);
  const when = SLOTS.find(([id]) => id === slotOf(j))![1];
  const sub = st ? st.long : steps ? `${n} of ${steps.length} steps` : small ? "" : when;
  const click = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (steps) return acts.openSteps(key);
    if (!done && !locked) setBurst(x => x + 1);
    acts.tick(key);
  };
  return (
    <button className={"job" + (small ? " sm" : "") + (done ? " done" : "") + (st ? " s-" + st.kind : "")} style={{ "--kc": color } as CSSProperties} aria-pressed={steps ? undefined : done} data-locked={locked ? "1" : undefined} onClick={click}>
      {burst ? <span className="ppburst" key={burst} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} style={{ "--a": i * 60 + "deg" } as CSSProperties}><Star size={13} /></i>)}</span> : null}
      <span className="job-tick">{done ? <span className="ppcheck"><Check /></span> : steps ? <small className="num">{n}/{steps.length}</small> : null}</span>
      <span className="job-t"><b>{j.title}</b>{sub ? <small>{small && st?.kind === "wait" ? "Waiting" : sub}</small> : null}</span>
      {steps && !done ? <span className="job-chev"><Chev /></span> : null}
    </button>
  );
}

/* ---------- the Home card ---------- */

/** The Overview's Chores card: a tile for each child with their pal and ring, and what's left for them today (tap to tick). */
export function ChoresCard() {
  const { ppOn, now, showDone, setShowDone, dim } = useHub();
  const { go } = useNav();
  const today = startOfDay(now);
  const { data: c = NO_CHORES } = useChores(today, today);
  const acts = useJobActions(c);
  if (!ppOn) return null;
  const { left, done, waiting } = jobCounts(c, today), groups = jobsByKid(c, today), total = left + done;
  const cols = dim.phone ? 1 : Math.min(groups.length, 3) || 1, max = cols >= 3 ? 3 : 4;
  return (
    <section id="chorescard" className="tile-card chc">
      <div className="tc-top">
        <div className="tc-hd">
          <h2 className="tc-h">Chores</h2>
          <span className="tc-sub">{!groups.length ? "Today" : left ? `${done} of ${total} done today` : "Every job's done today"}</span>
        </div>
        <button className="tc-open" id="ch-open" onClick={() => go("chores")}>All chores<Chev /></button>
      </div>
      {groups.length ? (
        <div className="chc-kids" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
          {groups.map((g, gi) => {
            const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), lf = t - n;
            const shown = inOrder(showDone ? g.jobs : g.jobs.filter(j => !jobDone(j))), more = shown.length - max;
            return (
              <div className="chc-kid pprise" key={g.kid.id} style={{ "--kc": col, "--i": gi } as CSSProperties}>
                <div className="chc-top">
                  <KidRing kid={g.kid} col={col} n={g.away ? 0 : n} t={g.away ? 1 : t} size={64} />
                  <div className="chc-who"><b>{g.kid.name}</b><small>{g.away ? "Away today" : lf ? `${lf} left · ${n} of ${t} done` : <><Check /> All done</>}</small></div>
                </div>
                {g.away ? null : (
                  <div className="chc-jobs">
                    {shown.slice(0, more > 0 ? max - 1 : max).map(j => <JobItem key={j.chore_id} j={j} day={today} color={col} small acts={acts} c={c} />)}
                    {more > 0 ? <button className="chc-more" onClick={() => go("chores")}>{more + 1} more<Chev /></button> : null}
                    {!shown.length ? <span className="chc-done">Nothing left. Well done!</span> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : <div className="tc-next"><b>Today</b><span>{c.error ? "Can't reach PocketPals" : "No jobs today"}</span></div>}
      {done || waiting ? (
        <div className="chc-foot">
          {waiting ? <span className="chc-wait"><i />{waiting} waiting for a grown-up to check in PocketPals</span> : <span />}
          {done ? <button className={"chip" + (showDone ? " on" : "")} aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide done" : `Show done · ${done}`}</button> : null}
        </div>
      ) : null}
    </section>
  );
}

/* ---------- the Chores page ---------- */
type Tab = "day" | "week";
const SAVED = "chores-tab";

/** The Chores page, in the hub's calm style: a day at a time (each child's jobs by time of day), or the whole week. */
export function ChoresPanel() {
  const { dim, now, choreDay, setChoreDay, showDone, setShowDone } = useHub();
  const P = dim.phone, day = startOfDay(choreDay), today = startOfDay(now);
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem(SAVED) as Tab) || "day"; } catch { return "day"; } });
  const pickTab = (t: Tab) => { setTab(t); try { localStorage.setItem(SAVED, t); } catch { /* fine without it */ } };
  const wk = weekStart(day), week = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const { data: c = NO_CHORES } = useChores(wk, addDays(wk, 6));
  const dir = useRef(1);
  const pick = (d: Date) => { dir.current = d >= day ? 1 : -1; setChoreDay(d); };
  const ppUrl = usePpUrl();
  const { done } = jobCounts(c, day);
  const short = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short" });
  const sub = tab === "week" ? `${short(wk)} to ${short(week[6])}` : sameDay(day, today) ? "Today" : day.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  return (
    <div className="chpage" style={wrap(P)}>
      <PageHead title="Chores" sub={sub} />
      <div className="dvtabs">
        <div className="dvseg" role="tablist" aria-label="Chores">
          {([["day", "Day"], ["week", "This week"]] as [Tab, string][]).map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => pickTab(t)}>{l}</button>)}
        </div>
        <div className="fx" style={{ gap: 8 }}>
          {tab === "day" && done ? <button className={"chip" + (showDone ? " on" : "")} aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide done" : P ? `Done · ${done}` : `Show done · ${done}`}</button> : null}
          {ppUrl && !P ? <a className="dvbtn chpp" href={ppUrl}><DockIcon name="chores" size={18} />PocketPals</a> : null}
        </div>
      </div>
      {tab === "day" ? <DayStrip c={c} day={day} today={today} week={week} pick={pick} /> : null}
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div key={tab + ymd(tab === "day" ? day : wk)} className={dir.current > 0 ? "ppflowr" : "ppflowl"}>
          {tab === "day" ? <DayJobs c={c} day={day} /> : <WeekBoard c={c} week={week} today={today} pick={d => { pick(d); pickTab("day"); }} shift={n => pick(addDays(day, n))} />}
          <p className="chfoot">Ticks wait for a grown-up to check them in PocketPals.</p>
        </div>
      </div>
    </div>
  );
}

/** The week as a row of white tiles: the chosen day dark, today outlined, and a bar for how much of each day is done. */
function DayStrip({ c, day, today, week, pick }: { c: Chores; day: Date; today: Date; week: Date[]; pick: (d: Date) => void }) {
  const { dim } = useHub();
  return (
    <div className="chstrip">
      <button className="chnav" aria-label="Previous week" onClick={() => pick(addDays(day, -7))}><ChevL /></button>
      <div className="chdays" role="group" aria-label="Days this week">
        {week.map(d => {
          const { left, done } = jobCounts(c, d), t = left + done, on = sameDay(d, day);
          return (
            <button key={+d} className={"chday" + (on ? " on" : "") + (sameDay(d, today) ? " now" : "")} aria-pressed={on} aria-label={`${d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}, ${t ? left ? `${left} to do` : "all done" : "no jobs"}`} onClick={() => pick(d)}>
              <small>{d.toLocaleDateString([], { weekday: "short" }).slice(0, dim.phone ? 1 : 3)}</small>
              <b className="num">{d.getDate()}</b>
              <i className={"chday-bar" + (t && !left ? " ok" : "")}><i style={{ width: t ? done / t * 100 + "%" : 0 }} /></i>
            </button>
          );
        })}
      </div>
      <button className="chnav" aria-label="Next week" onClick={() => pick(addDays(day, 7))}><ChevR /></button>
    </div>
  );
}

/** A day: how the family is going (and by time of day), then a card for each child with their jobs by time of day. */
function DayJobs({ c, day }: { c: Chores; day: Date }) {
  const { showDone, dim } = useHub();
  const acts = useJobActions(c);
  const groups = jobsByKid(c, day);
  const { left, done, waiting } = jobCounts(c, day), total = left + done, pct = total ? Math.round(done / total * 100) : 0;
  if (!groups.length) return (
    <div className="chcard chempty pprise">
      <b>{c.error ? "Can't reach PocketPals" : "No jobs this day"}</b>
      <span>{c.error || "Nothing is set for anyone."}</span>
    </div>
  );
  const all = groups.filter(g => !g.away).flatMap(g => g.jobs);
  return (
    <>
      <section className="chcard chsum pprise" style={{ "--i": 0 } as CSSProperties}>
        <Ring n={done} t={total || 1} col={left ? "#1f2430" : "#3f9b6e"} size={dim.phone ? 84 : 104} w={dim.phone ? 8 : 10}><b className="num chsum-pct">{pct}<small>%</small></b></Ring>
        <div className="chsum-m">
          <b>{left ? `${done} of ${total} jobs done` : "Every job is done"}</b>
          <span>{left ? `${left} to go` : "Nice work, everyone."}{waiting ? ` · ${waiting} waiting for a grown-up` : ""}</span>
          <div className="chsum-slots">
            {bySlot(all).map(s => { const n = s.jobs.filter(jobDone).length, ok = n === s.jobs.length; return <span key={s.id} className={"chslot" + (ok ? " ok" : "")}>{ok ? <Check /> : null}{s.name}<b className="num">{n}/{s.jobs.length}</b></span>; })}
          </div>
        </div>
      </section>
      {groups.map((g, gi) => {
        const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), lf = t - n, shown = showDone ? g.jobs : g.jobs.filter(j => !jobDone(j));
        return (
          <section className="chcard chkid pprise" key={g.kid.id} style={{ "--kc": col, "--i": gi + 1 } as CSSProperties}>
            <div className="chkid-h">
              <KidRing kid={g.kid} col={col} n={g.away ? 0 : n} t={g.away ? 1 : t} size={dim.phone ? 64 : 76} />
              <div className="chkid-n"><b>{g.kid.name}</b><span className="num">{g.away ? "Away today" : `${n} of ${t} done`}</span></div>
              {g.away ? <ChPill kind="todo">Away</ChPill> : <ChPill kind={lf ? "wait" : "ok"}>{lf ? `${lf} to do` : <><Check /> All done</>}</ChPill>}
            </div>
            {g.away ? <p className="chnote">No jobs while they're away.</p>
              : shown.length ? <div className="chjobs">{inOrder(shown).map(j => <JobItem key={j.chore_id} j={j} day={day} color={col} acts={acts} c={c} />)}</div>
              : <p className="chnote ok"><Check /> Everything is done for today.</p>}
          </section>
        );
      })}
    </>
  );
}

/**
 * The week at a glance: a row for each child with how much of each day is done (tap a day to open it), then what's waiting
 * for a grown-up to check, and how many days each child has finished everything.
 */
function WeekBoard({ c, week, today, pick, shift }: { c: Chores; week: Date[]; today: Date; pick: (d: Date) => void; shift: (n: number) => void }) {
  const { dim } = useHub();
  const ppUrl = usePpUrl();
  const P = dim.phone;
  const kids = c.kids.filter(k => week.some(d => (c.days[ymd(d)]?.jobs || []).some(j => j.kid_id === k.id)));
  const cell = (k: Kid, d: Date) => {
    const cd = c.days[ymd(d)], away = (cd?.away || []).includes(k.id), jobs = (cd?.jobs || []).filter(j => j.kid_id === k.id);
    return { away, n: jobs.filter(jobDone).length, t: jobs.length };
  };
  const waiting = week.flatMap(d => (c.days[ymd(d)]?.jobs || []).filter(j => j.status === "pending").map(j => ({ d, j })));
  const sofar = week.filter(d => d <= today);
  return (
    <>
      <section className="chcard chboard pprise" style={{ "--i": 0 } as CSSProperties}>
        <div className="chboard-h">
          <h2>The week</h2>
          <div className="fx" style={{ gap: 8 }}>
            {week.some(d => sameDay(d, today)) ? null : <button className="chip" onClick={() => pick(today)}>Today</button>}
            <button className="chnav sm" aria-label="Previous week" onClick={() => shift(-7)}><ChevL /></button>
            <button className="chnav sm" aria-label="Next week" onClick={() => shift(7)}><ChevR /></button>
          </div>
        </div>
        {kids.length ? (
          <div className="chgrid" style={{ gridTemplateColumns: `${P ? 52 : 150}px repeat(7,minmax(0,1fr))${P ? "" : " 74px"}` }}>
            <span />
            {week.map(d => <span key={+d} className={"chgrid-d" + (sameDay(d, today) ? " now" : "")}>{d.toLocaleDateString([], { weekday: "short" }).slice(0, P ? 1 : 3)}<b className="num">{d.getDate()}</b></span>)}
            {P ? null : <span className="chgrid-d">So far</span>}
            {kids.map(k => {
              const col = kidColor(k, c.kids), cells = week.map(d => cell(k, d)), past = cells.filter((x, i) => !x.away && week[i] <= today);
              const n = past.reduce((a, x) => a + x.n, 0), t = past.reduce((a, x) => a + x.t, 0);
              return [
                <span key={k.id + "n"} className="chgrid-k"><span className="ppav" style={{ "--kc": col, width: 40, height: 40 } as CSSProperties}><KidFace kid={k} col={col} head /></span>{P ? null : <b>{k.name}</b>}</span>,
                ...week.map((d, i) => {
                  const x = cells[i], future = d > today, all = x.t > 0 && x.n === x.t;
                  return (
                    <button key={k.id + "c" + i} className={"chcell" + (x.away ? " away" : !x.t ? " none" : all ? " all" : future ? " later" : "") + (sameDay(d, today) ? " now" : "")} style={{ "--kc": col, "--f": x.t ? x.n / x.t : 0 } as CSSProperties}
                      aria-label={`${k.name}, ${d.toLocaleDateString([], { weekday: "long" })}: ${x.away ? "away" : !x.t ? "no jobs" : future ? `${x.t} jobs` : `${x.n} of ${x.t} done`}`} onClick={() => pick(d)}>
                      {x.away ? <small>Away</small> : !x.t ? null : all ? <Check /> : future ? <small className="num">{x.t}</small> : <small className="num">{x.n}/{x.t}</small>}
                    </button>
                  );
                }),
                P ? null : <span key={k.id + "t"} className="chgrid-t num">{n}<small>/{t}</small></span>,
              ];
            })}
          </div>
        ) : <p className="chnote">{c.error ? "Can't reach PocketPals" : "No jobs this week."}</p>}
      </section>
      {kids.length ? (
        <div className="chpair">
          <section className="chcard pprise" style={{ "--i": 1 } as CSSProperties}>
            <h3 className="chcard-h">Waiting for a grown-up</h3>
            {waiting.length ? (
              <>
                <div className="chwait">
                  {waiting.slice(0, 6).map(({ d, j }) => { const k = c.kids.find(x => x.id === j.kid_id); const col = k ? kidColor(k, c.kids) : "#8a93a6"; return (
                    <div key={ymd(d) + j.kid_id + "-" + j.chore_id} className="chwait-r">
                      {k ? <span className="ppav" style={{ "--kc": col, width: 36, height: 36 } as CSSProperties}><KidFace kid={k} col={col} head /></span> : null}
                      <span><b>{j.title}</b><small>{k?.name} · {sameDay(d, today) ? "today" : d.toLocaleDateString([], { weekday: "long" })}</small></span>
                    </div>
                  ); })}
                  {waiting.length > 6 ? <span className="chnote">and {waiting.length - 6} more</span> : null}
                </div>
                {ppUrl ? <a className="dvbtn dark chcheck" href={ppUrl}>Check them in PocketPals<Chev /></a> : null}
              </>
            ) : <p className="chnote ok"><Check /> Nothing to check.</p>}
          </section>
          <section className="chcard pprise" style={{ "--i": 2 } as CSSProperties}>
            <h3 className="chcard-h">Days with every job done</h3>
            <div className="chstars">
              {kids.map(k => {
                const col = kidColor(k, c.kids), had = sofar.filter(d => cell(k, d).t && !cell(k, d).away), full = had.filter(d => { const x = cell(k, d); return x.n === x.t; }).length;
                return (
                  <div key={k.id} className="chstar" style={{ "--kc": col } as CSSProperties}>
                    <span className="ppav" style={{ "--kc": col, width: 44, height: 44 } as CSSProperties}><KidFace kid={k} col={col} head /></span>
                    <b>{k.name}</b>
                    <span className="chstar-n num">{full}<small> of {had.length}</small></span>
                    <span className="chstar-dots" aria-hidden>{had.map(d => { const x = cell(k, d); return <i key={+d} className={x.n === x.t ? "on" : ""} />; })}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

/** The checklist for a job with steps. */
export function StepsSheet({ k }: { k: string }) {
  const { ppOn, closeSheet } = useHub();
  const qc = useQueryClient();
  const day = fromYmd(k.split("|")[2]);
  const { data: fresh } = useChores(day, day);
  // The jobs the screen already holds are used at once, so the sheet opens full instead of empty and then filling in.
  const held = qc.getQueriesData<Chores>({ queryKey: ["chores"] }).map(([, d]) => d).find(d => d?.days[ymd(day)]);
  const c = fresh ?? held ?? NO_CHORES;
  const acts = useJobActions(c);
  const { j } = acts.find(k);
  if (!j || !ppOn) return <SheetFrame title="Job" foot={<button className="primary" onClick={closeSheet} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>} body={<p style={{ fontSize: 20, color: "#6b7488", marginTop: 18 }}>Loading the steps…</p>} />;
  const kid = c.kids.find(x => x.id === j.kid_id), col = kid ? kidColor(kid, c.kids) : "#101828", locked = j.status === "approved", done = jobDone(j);
  return (
    <SheetFrame title={j.title} foot={<button className="primary" onClick={closeSheet} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>} body={
      <>
        <div className="fx" style={{ gap: 10, margin: "12px 0 8px" }}><i style={{ width: 14, height: 14, borderRadius: "50%", background: col }} /><span style={{ fontSize: 20, fontWeight: 700 }}>{kid?.name}</span></div>
        {j.steps!.map(st => (
          <div className={"srow" + (st.done ? " done" : "")} key={st.id}>
            <button className="stk" aria-pressed={st.done} disabled={locked} onClick={() => acts.tickStep(k, st.id)}>
              <span className="chk" aria-hidden="true" style={{ borderColor: col, ...(st.done ? { background: col } : {}) }}>{st.done ? <Check /> : null}</span><span className="sn">{st.title}</span>
            </button>
          </div>
        ))}
        {done ? <p style={{ fontSize: 18, fontWeight: 600, color: "#14a06c", margin: "16px 0 0" }}>{locked ? "A grown-up has checked this." : "All done. It's waiting for a grown-up to check."}</p> : null}
      </>
    } />
  );
}
