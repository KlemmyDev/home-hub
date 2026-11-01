import { useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { addDays, clockT, fromYmd, shortDate, sameDay, startOfDay, ymd } from "../lib/dates";
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

function JobChip({ j, day, color, big, acts, c }: { j: Job; day: Date; color: string; big: boolean; acts: ReturnType<typeof useJobActions>; c: Chores }) {
  const key = `${j.kid_id}|${j.chore_id}|${ymd(day)}`, done = jobDone(j);
  const cls = (j.steps && j.steps.length ? "jchip stp" : "jchip") + (done ? " done" : "") + (j.status === "approved" ? " ok" : "") + (big ? " big" : "");
  const stop = (f: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); f(); };
  if (j.steps && j.steps.length) {
    const n = j.steps.filter(x => x.done).length;
    return <button className={cls} style={{ "--kc": color } as any} onClick={stop(() => acts.openSteps(key))}><span className="jc">{done ? <Check /> : <small className="num">{n}/{j.steps.length}</small>}</span><span className="jt">{j.title}</span>{j.status === "pending" ? <span className="jw">waiting</span> : null}</button>;
  }
  const locked = j.status === "approved" || (!done && !j.tickable) || !c.tick;
  return <button className={cls} aria-pressed={done} data-locked={locked ? "1" : undefined} style={{ "--kc": color } as any} onClick={stop(() => acts.tick(key))}><span className="jc">{done ? <Check /> : null}</span><span className="jt">{j.title}</span>{j.status === "pending" ? <span className="jw">waiting</span> : null}</button>;
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
      <div className="fx" style={{ justifyContent: "space-between", gap: 12, margin: "0 4px 10px", position: "relative" }}>
        <div className="fx" style={{ gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-.03em" }}>Chores</span>
          {groups.length ? <span className={"ppbadge " + (left ? "" : "ok")}>{left ? `${left} to do` : "All done!"}</span> : null}
        </div>
        <button className="ppbtn" id="ch-open" onClick={() => go("chores")}>All chores<Chev /></button>
      </div>
      <div className="ppks">
        {groups.length ? groups.map(g => {
          const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), todo = g.jobs.filter(j => !jobDone(j)), got = g.jobs.filter(jobDone);
          const shown = showDone ? g.jobs : todo;
          return (
            <div className="ppk" key={g.kid.id}>
              <span className="ppav" style={{ "--kc": col } as any}><PalFrame kid={g.kid} head /></span>
              <div className="ppb">
                <div className="fx" style={{ gap: 8, alignItems: "baseline" }}><b className="ppn">{g.kid.name}</b>{g.away ? null : <small className="num ppc">{n}/{t}</small>}</div>
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
      {done ? <div className="fx" style={{ margin: "10px 4px 0", position: "relative" }}><DoneToggle c={c} day={today} /></div> : null}
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
  const label = day.toLocaleDateString([], { weekday: P ? "short" : "long", day: "numeric", month: P ? "short" : "long" });
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: (P ? "14px 14px" : "18px 18px") + " 0", color: "#fff", fontFamily: "'Figtree','Onest',sans-serif" }}>
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 4px 12px", gap: 12 }}>
        <div className="fx" style={{ gap: 14 }}><span className="clk num" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: P ? 44 : 54, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .9 }}>{clockT(now, h24)}</span><span className="cdt" style={{ fontSize: P ? 16 : 20, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1 }}>{shortDate(now)}</span></div>
        <span style={{ fontSize: P ? 26 : 32, fontWeight: 800, letterSpacing: "-.03em" }}>Chores</span>
      </div>
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 0 4px", gap: 10 }}>
        <div className="fx" style={{ gap: 10, minWidth: 0 }}>
          <button className="cnav" aria-label="Back" onClick={() => setChoreDay(addDays(day, -1))}><ChevL /></button>
          <span style={{ fontSize: P ? 21 : 28, fontWeight: 800, letterSpacing: "-.03em", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <button className="cnav" aria-label="Forward" onClick={() => setChoreDay(addDays(day, 1))}><ChevR /></button>
        </div>
        <div className="fx" style={{ gap: 8 }}><DoneToggle c={c} day={day} />{isToday ? null : <button className="ppbtn" onClick={() => setChoreDay(new Date())}>Today</button>}</div>
      </div>
      <div className="scroll" style={{ flex: 1, minHeight: 0, paddingTop: P ? 44 : 58 }}>
        {groups.length ? groups.map(g => {
          const col = kidColor(g.kid, c.kids), [n, t] = jobTally(g.jobs), shown = showDone ? g.jobs : g.jobs.filter(j => !jobDone(j));
          return (
            <section className="kcard pk" key={g.kid.id}>
              <div className="kpal"><PalFrame kid={g.kid} head={false} /></div>
              <div className="fx" style={{ gap: 12, marginBottom: 8, paddingRight: P ? 96 : 130 }}>
                <i style={{ width: 14, height: 14, borderRadius: "50%", background: col, flex: "none" }} />
                <span style={{ fontSize: P ? 24 : 30, fontWeight: 800, letterSpacing: "-.03em" }}>{g.kid.name}</span>
                {g.away ? null : <span className="num" style={{ fontSize: 18, fontWeight: 800, color: "#6b6890" }}>{n} of {t}</span>}
              </div>
              {g.away ? null : <div className="ptrack"><div style={{ width: (t ? Math.round(n / t * 100) : 0) + "%", background: col }} /></div>}
              <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
                {g.away ? <div style={{ fontSize: 19, color: "#6b6890", padding: "6px 0 4px" }}>Away today, so no jobs.</div>
                  : shown.length ? shown.map(j => <JobChip key={j.chore_id} j={j} day={day} color={col} big acts={acts} c={c} />)
                  : <span className="jnote ok" style={{ fontSize: 19 }}><Check /> All done</span>}
              </div>
            </section>
          );
        }) : (
          <div style={{ padding: "50px 0", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{c.error ? "Can't reach PocketPals" : "No jobs this day"}</div>
            <div style={{ fontSize: 18, opacity: .8, marginTop: 6 }}>{c.error || "Nothing is set for anyone."}</div>
          </div>
        )}
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
