import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEMO, post } from "../lib/api";
import { addDays, clockT, fromYmd, nowZ, sameDay, shortDate, startOfDay, weekStart, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR } from "../lib/icons";
import { NO_CHORES, useChores, usePatchChores, type Chores, type Job, type Kid } from "../data";
import { palColor } from "../lib/pals";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { SheetFrame } from "./SheetFrame";

const kidColor = palColor;
export const jobDone = (j: Job) => j.status === "pending" || j.status === "approved";
const jobTally = (jobs: Job[]) => [jobs.filter(jobDone).length, jobs.length];

function jobsByKid(c: Chores, day: Date) {
  const d = c.days[ymd(day)] || { jobs: [], away: [] };
  return c.kids.map(k => ({ kid: k, away: (d.away || []).includes(k.id), jobs: d.jobs.filter(j => j.kid_id === k.id) })).filter(g => g.jobs.length || g.away);
}
const jobCounts = (c: Chores, day: Date) => { let left = 0, done = 0; for (const g of jobsByKid(c, day)) for (const j of g.jobs) jobDone(j) ? done++ : left++; return { left, done }; };

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
function Ring({ n, t, col, size, children }: { n: number; t: number; col: string; size: number; children: React.ReactNode }) {
  const r = size / 2 - 4, C = 2 * Math.PI * r, f = t ? n / t : 0;
  return (
    <span className="ppring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e9e5fb" strokeWidth="5" />
        <circle className="ppring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - f)} style={{ "--C": C } as any} />
      </svg>
      <span className="ppring-in">{children}</span>
    </span>
  );
}

type PillKind = "ok" | "wait" | "todo";
const Pill = ({ kind, children }: { kind: PillKind; children: React.ReactNode }) => <span className={"cp-pill " + kind}>{children}</span>;

/** Where a job has got to, the way the parent portal says it. */
function jobStatus(j: Job): { kind: PillKind; long: string; short: string } | null {
  if (j.status === "approved") return { kind: "ok", long: "Checked", short: "Checked" };
  if (j.status === "pending") return { kind: "wait", long: "Waiting for a grown-up", short: "Waiting" };
  return null;
}

/** One job, as a row (on the Chores page) or a small chip (on the Overview). Tapping ticks it; a job with steps opens its list. */
function JobItem({ j, day, color, row, acts, c }: { j: Job; day: Date; color: string; row: boolean; acts: ReturnType<typeof useJobActions>; c: Chores }) {
  const key = `${j.kid_id}|${j.chore_id}|${ymd(day)}`, done = jobDone(j), st = jobStatus(j);
  const [burst, setBurst] = useState(0);
  const steps = j.steps && j.steps.length ? j.steps : null, n = steps ? steps.filter(x => x.done).length : 0;
  const locked = !steps && (j.status === "approved" || (!done && !j.tickable) || !c.tick);
  const cls = (row ? "cp-row" : "cp-chip") + (done ? " done" : "") + (st ? " s-" + st.kind : "");
  const stars = burst ? <span className="ppburst" key={burst} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} style={{ "--a": i * 60 + "deg" } as any}><Star size={13} /></i>)}</span> : null;
  const tick = <span className="cp-tick" style={{ "--kc": color } as any}>{done ? <span className="ppcheck"><Check /></span> : steps ? <small className="num">{n}/{steps.length}</small> : null}</span>;
  const click = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (steps) return acts.openSteps(key);
    if (!done && !locked) setBurst(x => x + 1);
    acts.tick(key);
  };
  return (
    <button className={cls} aria-pressed={steps ? undefined : done} data-locked={locked ? "1" : undefined} onClick={click}>
      {stars}{tick}
      <span className="cp-jt">{j.title}{row && steps && !done ? <small>{n} of {steps.length} steps</small> : null}</span>
      {st ? <Pill kind={st.kind}>{row ? st.long : st.short}</Pill> : row && !steps ? <Pill kind="todo">To do</Pill> : null}
      {row && steps ? <span className="cp-chev"><Chev /></span> : null}
    </button>
  );
}

function DoneToggle({ c, day }: { c: Chores; day: Date }) {
  const { showDone, setShowDone } = useHub();
  const { done } = jobCounts(c, day);
  return done ? <button className="cp-btn" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide done" : `Show done · ${done}`}</button> : null;
}

/* The Overview's Chores card: today's jobs for each child, in the parent portal's calm look. */
export function ChoresCard() {
  const { ppOn, now, showDone } = useHub();
  const { go } = useNav();
  const today = startOfDay(now);
  const { data: c = NO_CHORES } = useChores(today, today);
  const acts = useJobActions(c);
  if (!ppOn) return null;
  const { left, done } = jobCounts(c, today), groups = jobsByKid(c, today);
  return (
    <section id="chorescard" className="tile-card cpcard">
      <div className="cp-head">
        <div><div className="cp-eyebrow">Today</div><h2 className="cp-h">Chores</h2></div>
        <div className="fx" style={{ gap: 10 }}>
          {groups.length ? <span key={left}><Pill kind={left ? "wait" : "ok"}>{left ? `${left} to do` : <><Check /> All done</>}</Pill></span> : null}
          <button className="cp-btn" id="ch-open" onClick={() => go("chores")}>All chores<Chev /></button>
        </div>
      </div>
      <div className="cp-kids">
        {groups.length ? groups.map((g, gi) => {
          const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), todo = g.jobs.filter(j => !jobDone(j)), got = g.jobs.filter(jobDone);
          const shown = showDone ? g.jobs : todo;
          return (
            <div className="cp-kid pprise" key={g.kid.id} style={{ "--i": gi } as any}>
              <Ring n={g.away ? 0 : n} t={g.away ? 1 : t} col={col} size={72}>
                <span className="ppav" style={{ "--kc": col } as any}><KidFace kid={g.kid} col={col} head /></span>
              </Ring>
              <div className="cp-kb">
                <div className="fx" style={{ gap: 10, alignItems: "baseline" }}><b className="cp-kn">{g.kid.name}</b>{g.away ? null : <small className="num cp-ks">{n} of {t} done</small>}</div>
                <div className="cp-chips">
                  {g.away ? <span className="cp-note">Away today</span>
                    : shown.length ? shown.map(j => <JobItem key={j.chore_id} j={j} day={today} color={col} row={false} acts={acts} c={c} />)
                    : <span className="cp-note ok"><Check /> All done{got.length ? ` · ${got.length} jobs` : ""}</span>}
                </div>
              </div>
            </div>
          );
        }) : <div className="cp-note" style={{ padding: "14px 0 6px" }}>{c.error ? "Can't reach PocketPals" : "No jobs today"}</div>}
      </div>
      {done ? <div className="fx" style={{ marginTop: 6 }}><DoneToggle c={c} day={today} /></div> : null}
    </section>
  );
}

/* ---------- Chores screen ---------- */
export function ChoresPanel() {
  const { dim, now, h24, choreDay, setChoreDay, showDone } = useHub();
  const P = dim.phone, day = startOfDay(choreDay), today = startOfDay(now), isToday = sameDay(day, today);
  const wk = weekStart(day), week = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const { data: c = NO_CHORES } = useChores(wk, addDays(wk, 6));
  const acts = useJobActions(c);
  const groups = jobsByKid(c, day);
  const dir = useRef(1);
  const pick = (d: Date) => { dir.current = d >= day ? 1 : -1; setChoreDay(d); };
  const { left, done } = jobCounts(c, day), total = left + done, pct = total ? Math.round(done / total * 100) : 0;
  const short = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short" });
  return (
    <div className="cppage" style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: (P ? "14px 14px" : "18px 18px") + " 0" }}>
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 4px 14px", gap: 12 }}>
        <div className="fx" style={{ gap: 14 }}><span className="clk num" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: P ? 44 : 54, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .9, WebkitTextStroke: "1.8px #1c1a33", paintOrder: "stroke fill" }}>{clockT(now, h24)}</span><span className="cdt" style={{ fontSize: P ? 16 : 20, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1 }}>{shortDate(now)}</span></div>
      </div>
      <div className="fx" style={{ justifyContent: "space-between", alignItems: "flex-end", padding: "0 4px 14px", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="cp-eyebrow">{short(wk)} to {short(week[6])}</div>
          <h1 className="cp-h cp-h1">Chores</h1>
        </div>
        <div className="fx" style={{ gap: 8 }}><DoneToggle c={c} day={day} />{isToday ? null : <button className="cp-btn solid" onClick={() => pick(today)}>Today</button>}</div>
      </div>
      <div className="fx" style={{ gap: 6, padding: "0 0 14px" }}>
        <button className="cp-nav" aria-label="Previous week" onClick={() => pick(addDays(day, -7))}><ChevL /></button>
        <div className="cp-days" role="group" aria-label="Days this week">
          {week.map(d => {
            const jobs = (c.days[ymd(d)]?.jobs || []), lf = jobs.filter(j => !jobDone(j)).length, on = sameDay(d, day);
            return (
              <button key={+d} className={"cp-day" + (on ? " on" : "") + (sameDay(d, today) ? " now" : "")} aria-pressed={on} aria-label={`${d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}, ${lf} to do`} onClick={() => pick(d)}>
                {d.toLocaleDateString([], { weekday: "short" }).slice(0, P ? 1 : 3)}
                <b className="num">{d.getDate()}</b>
                <i className={"cp-dot" + (jobs.length ? (lf ? "" : " ok") : " none")} />
              </button>
            );
          })}
        </div>
        <button className="cp-nav" aria-label="Next week" onClick={() => pick(addDays(day, 7))}><ChevR /></button>
      </div>
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div key={ymd(day)} className={dir.current > 0 ? "ppflowr" : "ppflowl"}>
          {groups.length ? (
            <div className="cp-card cp-sum pprise" style={{ "--i": 0 } as any}>
              <div className="fx" style={{ justifyContent: "space-between", gap: 10 }}>
                <span className="cp-cn" style={{ fontSize: P ? 19 : 22 }}>{left ? `${done} of ${total} jobs done` : "Every job is done"}</span>
                <Pill kind={left ? "wait" : "ok"}>{left ? `${left} to go` : <><Check /> All done</>}</Pill>
              </div>
              <div className="cp-bar"><div className={"ppfill" + (left ? "" : " ok")} style={{ width: pct + "%", background: left ? "var(--cp-vt)" : "var(--cp-okfg)" }} /></div>
            </div>
          ) : null}
          {groups.length ? groups.map((g, gi) => {
            const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), shown = showDone ? g.jobs : g.jobs.filter(j => !jobDone(j)), all = !g.away && t > 0 && n === t, lf = t - n;
            return (
              <section className="cp-card pprise" key={g.kid.id} style={{ "--i": gi + 1 } as any}>
                <div className="cp-ch">
                  <Ring n={g.away ? 0 : n} t={g.away ? 1 : t} col={col} size={P ? 60 : 68}>
                    <span className="ppav" style={{ "--kc": col } as any}><KidFace kid={g.kid} col={col} head /></span>
                  </Ring>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cp-cn">{g.kid.name}</div>
                    {g.away ? <div className="cp-cs">Away today</div> : <div className="cp-cs num">{n} of {t} done</div>}
                  </div>
                  {g.away ? <Pill kind="todo">Away</Pill> : <Pill kind={all ? "ok" : "wait"}>{all ? <><Check /> All done</> : `${lf} to do`}</Pill>}
                </div>
                {g.away ? <div className="cp-note" style={{ padding: "4px 0 14px" }}>No jobs while they're away.</div>
                  : shown.length ? shown.map(j => <JobItem key={j.chore_id} j={j} day={day} color={col} row acts={acts} c={c} />)
                  : <div className="cp-note ok" style={{ padding: "8px 0 14px" }}><Check /> Everything is done for today.</div>}
              </section>
            );
          }) : (
            <div className="cp-card pprise" style={{ textAlign: "center", padding: "40px 20px", "--i": 0 } as any}>
              <div className="cp-cn">{c.error ? "Can't reach PocketPals" : "No jobs this day"}</div>
              <div className="cp-cs" style={{ marginTop: 6 }}>{c.error || "Nothing is set for anyone."}</div>
            </div>
          )}
          <div className="cp-cs" style={{ padding: "6px 4px 124px" }}>Ticks wait for a grown-up to check them in PocketPals.</div>
        </div>
      </div>
    </div>
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
