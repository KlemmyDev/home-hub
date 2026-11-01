import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEMO, post } from "../lib/api";
import { addDays, clockT, fromYmd, nowZ, sameDay, shortDate, startOfDay, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR } from "../lib/icons";
import { NO_CHORES, useChores, usePatchChores, type Chores, type Job, type Kid } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { SheetFrame } from "./SheetFrame";

const KIDCOL = ["#14a06c", "#e5487f", "#7b5cf0", "#0ea5b7", "#f59e0b", "#2f6fe0"];
/* A child's colour is their pal's. PocketPals draws the pal itself (colour, outfit, pet) on a page the hub shows in a frame. */
const PALACC: Record<string, string> = { pig: "#F0709F", fox: "#FF8A2B", owl: "#8B5CFF", dino: "#1FB574", cat: "#F09A1A", bunny: "#A98BD8", puppy: "#A66A3C", panda: "#5B6577", frog: "#6DB82B", penguin: "#36427F" };
const kidColor = (k: Kid, kids: Kid[]) => PALACC[String(k.species || "").split("~")[0]] || KIDCOL[Math.max(0, kids.findIndex(x => x.id === k.id)) % KIDCOL.length];
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

function JobChip({ j, day, color, big, acts, c }: { j: Job; day: Date; color: string; big: boolean; acts: ReturnType<typeof useJobActions>; c: Chores }) {
  const key = `${j.kid_id}|${j.chore_id}|${ymd(day)}`, done = jobDone(j);
  const [burst, setBurst] = useState(0);
  const cls = (j.steps && j.steps.length ? "jchip stp" : "jchip") + (done ? " done" : "") + (j.status === "approved" ? " ok" : "") + (big ? " big" : "");
  const stop = (f: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); f(); };
  const stars = burst ? <span className="ppburst" key={burst} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} style={{ "--a": i * 60 + "deg" } as any}><Star size={13} /></i>)}</span> : null;
  if (j.steps && j.steps.length) {
    const n = j.steps.filter(x => x.done).length;
    return <button className={cls} style={{ "--kc": color } as any} onClick={stop(() => acts.openSteps(key))}><span className="jc">{done ? <span className="ppcheck"><Check /></span> : <small className="num">{n}/{j.steps.length}</small>}</span><span className="jt">{j.title}</span>{j.status === "pending" ? <span className="jw">waiting</span> : null}</button>;
  }
  const locked = j.status === "approved" || (!done && !j.tickable) || !c.tick;
  return <button className={cls} aria-pressed={done} data-locked={locked ? "1" : undefined} style={{ "--kc": color } as any} onClick={stop(() => { if (!done && !locked) setBurst(x => x + 1); acts.tick(key); })}>{stars}<span className="jc">{done ? <span className="ppcheck"><Check /></span> : null}</span><span className="jt">{j.title}</span>{j.status === "pending" ? <span className="jw">waiting</span> : null}</button>;
}

function DoneToggle({ c, day }: { c: Chores; day: Date }) {
  const { showDone, setShowDone } = useHub();
  const { done } = jobCounts(c, day);
  return done ? <button className="dtoggle pk" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>{showDone ? "Hide done" : `Show done · ${done}`}</button> : null;
}

/* The Overview's Chores card: today's jobs for each child, in the PocketPals look. */
export function ChoresCard() {
  const { ppOn, now, showDone } = useHub();
  const { go } = useNav();
  const today = startOfDay(now);
  const { data: c = NO_CHORES } = useChores(today, today);
  const acts = useJobActions(c);
  if (!ppOn) return null;
  const { left, done } = jobCounts(c, today), groups = jobsByKid(c, today);
  return (
    <section id="chorescard" className="tile-card ppcard">
      <span className="ppsparkle" aria-hidden="true" />
      <div className="fx" style={{ justifyContent: "space-between", gap: 12, margin: "0 4px 12px", position: "relative" }}>
        <div className="fx" style={{ gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.03em" }}>Chores</span>
          {groups.length ? <span key={left} className={"ppbadge ppbadge-pop " + (left ? "" : "ok")}>{left ? `${left} to do` : <><Star size={15} color="#fff" /> All done!</>}</span> : null}
        </div>
        <button className="ppbtn" id="ch-open" onClick={() => go("chores")}>All chores<Chev /></button>
      </div>
      <div className="ppks">
        {groups.length ? groups.map((g, gi) => {
          const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), todo = g.jobs.filter(j => !jobDone(j)), got = g.jobs.filter(jobDone);
          const shown = showDone ? g.jobs : todo;
          return (
            <div className="ppk pprise" key={g.kid.id} style={{ "--i": gi } as any}>
              <Ring n={g.away ? 0 : n} t={g.away ? 1 : t} col={col} size={84}>
                <span className="ppav" style={{ "--kc": col } as any}><KidFace kid={g.kid} col={col} head /></span>
              </Ring>
              <div className="ppb">
                <div className="fx" style={{ gap: 8, alignItems: "baseline" }}><b className="ppn">{g.kid.name}</b>{g.away ? null : <small className="num ppc">{n}/{t}</small>}{!g.away && n === t && t > 0 ? <span className="ppstar"><Star size={20} /></span> : null}</div>
                <div className="fx" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {g.away ? <span className="jnote">Away today</span>
                    : shown.length ? shown.map(j => <JobChip key={j.chore_id} j={j} day={today} color={col} big={false} acts={acts} c={c} />)
                    : <span className="jnote ok"><Check /> All done{got.length ? ` · ${got.length}` : ""}</span>}
                </div>
              </div>
            </div>
          );
        }) : <div style={{ padding: "10px 4px 8px", fontSize: 19, fontWeight: 700, color: "rgba(255,255,255,.85)" }}>{c.error ? "Can't reach PocketPals" : "No jobs today"}</div>}
      </div>
      {done ? <div className="fx" style={{ margin: "12px 4px 0", position: "relative" }}><DoneToggle c={c} day={today} /></div> : null}
    </section>
  );
}

/* ---------- Chores screen ---------- */
export function ChoresPanel() {
  const { dim, now, h24, choreDay, setChoreDay, showDone } = useHub();
  const P = dim.phone, day = startOfDay(choreDay), isToday = sameDay(day, now);
  const { data: c = NO_CHORES } = useChores(day, day);
  const acts = useJobActions(c);
  const groups = jobsByKid(c, day);
  const dir = useRef(1);
  const go = (n: number) => { dir.current = n; setChoreDay(addDays(day, n)); };
  const { left, done } = jobCounts(c, day), total = left + done, pct = total ? Math.round(done / total * 100) : 0;
  const label = day.toLocaleDateString([], { weekday: P ? "short" : "long", day: "numeric", month: P ? "short" : "long" });
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: (P ? "14px 14px" : "18px 18px") + " 0", color: "#fff", fontFamily: "'Figtree','Onest',sans-serif", position: "relative" }}>
      <span className="ppsparkle" aria-hidden="true" />
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 4px 12px", gap: 12, position: "relative" }}>
        <div className="fx" style={{ gap: 14 }}><span className="clk num" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: P ? 44 : 54, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .9 }}>{clockT(now, h24)}</span><span className="cdt" style={{ fontSize: P ? 16 : 20, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1 }}>{shortDate(now)}</span></div>
        <span style={{ fontSize: P ? 26 : 32, fontWeight: 800, letterSpacing: "-.03em" }}>Chores</span>
      </div>
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 0 12px", gap: 10, position: "relative" }}>
        <div className="fx" style={{ gap: 10, minWidth: 0 }}>
          <button className="cnav ppnav" aria-label="Back" onClick={() => go(-1)}><ChevL /></button>
          <span style={{ fontSize: P ? 21 : 28, fontWeight: 800, letterSpacing: "-.03em", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <button className="cnav ppnav" aria-label="Forward" onClick={() => go(1)}><ChevR /></button>
        </div>
        <div className="fx" style={{ gap: 8 }}><DoneToggle c={c} day={day} />{isToday ? null : <button className="ppbtn" onClick={() => { dir.current = day < startOfDay(now) ? 1 : -1; setChoreDay(nowZ()); }}>Today</button>}</div>
      </div>
      {groups.length ? (
        <div className="ppsum pprise" style={{ "--i": 0 } as any}>
          <div className="fx" style={{ justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: P ? 20 : 24, fontWeight: 800, letterSpacing: "-.02em" }}>{left ? `${done} of ${total} jobs done` : "Every job is done!"}</span>
            <span key={left} className={"ppbadge ppbadge-pop " + (left ? "" : "ok")}>{left ? `${left} to go` : <><Star size={15} color="#fff" /> Brilliant</>}</span>
          </div>
          <div className="ppsumtrack"><div style={{ width: pct + "%" }} /></div>
        </div>
      ) : null}
      <div className="scroll" style={{ flex: 1, minHeight: 0, paddingTop: P ? 52 : 66, position: "relative" }}>
        <div key={ymd(day)} className={dir.current > 0 ? "ppflowr" : "ppflowl"}>
          {groups.length ? groups.map((g, gi) => {
            const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), shown = showDone ? g.jobs : g.jobs.filter(j => !jobDone(j)), all = !g.away && t > 0 && n === t;
            return (
              <section className="kcard pk pprise" key={g.kid.id} style={{ "--i": gi + 1 } as any}>
                <div className="kpal ppbob"><KidFace kid={g.kid} col={col} head={false} /></div>
                <div className="fx" style={{ gap: 12, marginBottom: 8, paddingRight: P ? 96 : 130 }}>
                  <i style={{ width: 14, height: 14, borderRadius: "50%", background: col, flex: "none" }} />
                  <span style={{ fontSize: P ? 24 : 30, fontWeight: 800, letterSpacing: "-.03em" }}>{g.kid.name}</span>
                  {g.away ? null : all ? <span className="ppbadge ok ppbadge-pop"><Star size={14} color="#fff" /> All done</span> : <span className="num" style={{ fontSize: 18, fontWeight: 800, color: "#6b6890" }}>{n} of {t}</span>}
                </div>
                {g.away ? null : <div className="ptrack"><div className="ppfill" style={{ width: (t ? Math.round(n / t * 100) : 0) + "%", background: all ? "linear-gradient(90deg,#30c25a,#7be08f)" : col }} /></div>}
                <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
                  {g.away ? <div style={{ fontSize: 19, color: "#6b6890", padding: "6px 0 4px" }}>Away today, so no jobs.</div>
                    : shown.length ? shown.map(j => <JobChip key={j.chore_id} j={j} day={day} color={col} big acts={acts} c={c} />)
                    : <span className="jnote ok" style={{ fontSize: 19 }}><Check /> All done</span>}
                </div>
              </section>
            );
          }) : (
            <div className="pprise" style={{ padding: "50px 0", textAlign: "center", "--i": 1 } as any}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{c.error ? "Can't reach PocketPals" : "No jobs this day"}</div>
              <div style={{ fontSize: 18, opacity: .8, marginTop: 6 }}>{c.error || "Nothing is set for anyone."}</div>
            </div>
          )}
        </div>
      </div>
      <div className="fx" style={{ flex: "none", height: 140, padding: "8px 4px 0", alignItems: "flex-start" }}><span style={{ fontSize: 16, fontWeight: 600, opacity: .85 }}>Ticks wait for a grown-up to check them in PocketPals.</span></div>
    </div>
  );
}

/** The checklist for a job with steps. */
export function StepsSheet({ k }: { k: string }) {
  const { ppOn } = useHub();
  const day = fromYmd(k.split("|")[2]);
  const { data: c = NO_CHORES } = useChores(day, day);
  const acts = useJobActions(c);
  const { j } = acts.find(k);
  const { closeSheet } = useHub();
  if (!j || !ppOn) return null;
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
