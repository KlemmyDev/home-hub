import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO, post } from "../lib/api";
import { addDays, fromYmd, longDay, nowZ, sameDay, startOfDay, weekStart, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR, DinnerIcon, SearchIcon, XIcon } from "../lib/icons";
import { DIETS, EMPTY_EVENTS, KINDS, dinnerFor, stockLevel, useDinners, useEvents, type Dinners, type Ingredient, type Meal, type PantryData, type PItem, type Product } from "../data";
import { useHub, type DView } from "../hub";
import { useNav } from "../nav";
import { FoodIcon } from "../lib/foodicons";
import { ItemIcon } from "../lib/pantryicons";
import { PageHead, Top, wrap } from "./Panels";
import { Pill, SheetFrame } from "./SheetFrame";
import { ago, busyAt, clashText, cookingFor, dayName, dietClash, homeFor, metaLine, productLine, scaleAmount, useStats } from "../lib/dinnerlib";
import { Cook, copyLastWeek, History, Rules, Suggest } from "./DinnerTools";
import { NO_PANTRY, usePantry } from "../data";
import { amountIn, fmtQty } from "../lib/units";
import { findItem, haveEnough } from "../lib/pantrylib";
import { Scanner, scanProblem } from "./Scanner";
import { SHEET_MS, focusRef, useAutoFocus } from "../lib/focus";

/* ---------- what the dinners know about themselves ---------- */

/** Saves a dinner's details (ingredients, notes and the rest). It shows at once, and is put back if the hub says no. */
export function useMealSave() {
  const qc = useQueryClient();
  const { soon } = useHub();
  return async (m: Meal, patch: Partial<Meal>) => {
    const next = { ...m, ...patch };
    qc.setQueryData<Dinners>(["dinners"], old => old && { ...old, meals: old.meals.map(x => x.id === m.id ? next : x) });
    try {
      await post("/api/meal/details", { id: m.id, ingredients: next.ingredients || [], notes: next.notes || "", link: next.link || "", serves: next.serves || 0, minutes: next.minutes || 0, tags: next.tags || [], favourite: !!next.favourite, ratings: next.ratings || {}, suits: next.suits || [] });
      qc.invalidateQueries({ queryKey: ["dinners"] });
    } catch (e: any) { qc.invalidateQueries({ queryKey: ["dinners"] }); soon(e.message || "Couldn't save that."); }
  };
}

/** Puts ingredients on the shopping list with what exactly to get. */
export async function addToList(items: Ingredient[], from: string, factor = 1, pan?: import("../data").PantryData) {
  await post("/api/shopping/add-many", { from, items: items.map(i => {
    const hit = pan ? findItem(pan, i) : undefined, need = hit ? amountIn(scaleAmount(i.amount, factor), hit.unit) : null;
    return { name: i.name, note: [scaleAmount(i.amount, factor), i.product ? productLine(i.product) : "", i.alt ? "or " + productLine(i.alt) : ""].filter(Boolean).join(" · "), barcode: i.product?.code || "", qty: hit && need !== null ? Math.max(0, Math.round((need - Math.max(0, hit.qty)) * 1000) / 1000) || need : 0 };
  }) });
}

/** A product's picture, or its first letter when there isn't one (or it doesn't load). */
function Thumb({ src, letter, big }: { src?: string; letter: string; big?: boolean }) {
  const [bad, setBad] = useState(false);
  return <span className={"dvthumb" + (big ? " big" : "")}>{src && !bad ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <b>{(letter || "?")[0].toUpperCase()}</b>}</span>;
}

/* ---------- the pages ---------- */

export function MenuPanel() {
  const { dview } = useHub();
  const { data: din } = useDinners();
  return (
    <div className="dvpage" key={dview.v === "meal" ? "m" + dview.id : dview.v} style={{ width: "100%", height: "100%" }}>
      {dview.v === "suggest" ? <Suggest din={din} /> : dview.v === "rules" ? <Rules din={din} /> : dview.v === "history" ? <History din={din} /> : dview.v === "cook" ? <Cook din={din} id={dview.id} /> : dview.v === "ideas" ? <Ideas din={din} /> : dview.v === "meal" ? <MealPage din={din} id={dview.id} /> : dview.v === "shop" ? <ShopWeek din={din} /> : dview.v === "week" ? <Week din={din} /> : <Tonight din={din} />}
    </div>
  );
}

/** Tonight, This week and Dinner ideas: the three faces of the Dinners page, side by side in a switch. */
function DinTabs({ right }: { right?: React.ReactNode }) {
  const { dview, setDview } = useHub();
  const tabs: [DView["v"], string][] = [["home", "Tonight"], ["week", "This week"], ["ideas", "Dinner ideas"]];
  return (
    <div className="dvtabs">
      <div className="seg2" role="tablist" aria-label="Dinners">
        {tabs.map(([v, l]) => <button key={v} role="tab" aria-selected={dview.v === v} className={dview.v === v ? "on" : ""} onClick={() => setDview({ v } as DView)}>{l}</button>)}
      </div>
      <div className="fx" style={{ gap: 8, flex: "none" }}>{right}</div>
    </div>
  );
}

const Warn = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17.2v.1" /></svg>;
const Snow = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2f5fa8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10M9 3.5l3 2 3-2M9 20.5l3-2 3 2" /></svg>;
const Cam = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
const Play = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>;

/** A per-day note kept on this screen only (thawing, listed), so it survives a reload but needs no server. Read on every render: the key can change once the dinners load. */
const dayFlags = new Set<string>();
function useDayFlag(name: string, day: string): [boolean, (v: boolean) => void] {
  const key = `hub-${name}-${day}`, [, bump] = useState(0);
  let on = dayFlags.has(key);
  try { on = on || localStorage.getItem(key) === "1"; } catch { /* fine: kept in memory only */ }
  return [on, (v: boolean) => { v ? dayFlags.add(key) : dayFlags.delete(key); try { v ? localStorage.setItem(key, "1") : localStorage.removeItem(key); } catch { /* fine */ } bump(n => n + 1); }];
}

type Need = { i: Ingredient; item?: PItem; status: string; tone: "good" | "warn" | "bad" | "quiet"; have: boolean };
/** What one ingredient looks like against the pantry: there, low, out, or not kept there at all. */
function needOf(pan: PantryData, i: Ingredient, factor: number): Need {
  const item = findItem(pan, i), where = item?.aisle && item.aisle !== "Other" ? item.aisle : "";
  if (!item) return i.staple ? { i, status: "Usually in", tone: "quiet", have: true } : { i, status: "Not in the pantry", tone: "bad", have: false };
  if (item.qty <= 0) return { i, item, status: "Out", tone: "bad", have: !!i.staple };
  if (!haveEnough(pan, i, factor)) return { i, item, status: "Not enough" + (where ? " · " + where : ""), tone: "warn", have: false };
  if (stockLevel(item) === "low") return { i, item, status: "Low" + (where ? " · " + where : ""), tone: "warn", have: true };
  return { i, item, status: fmtQty(item.qty, item.unit) + (where ? " · " + where : ""), tone: "good", have: true };
}

/* ----- tonight: what's for dinner, whether everything's here, and a big Start cooking ----- */
function Tonight({ din }: { din: Dinners | undefined }) {
  const { dim, now, people, openSheet, setDview, soon } = useHub();
  const { go } = useNav();
  const qc = useQueryClient();
  const P = dim.phone, key = ymd(now), night = din?.plan[key], meal = din?.meals.find(x => x.id === night?.meal), t = dinnerFor(din, people, now);
  const { data: pan = NO_PANTRY } = usePantry();
  const [thawed, setThawed] = useDayFlag("thawed", key), [added, setAdded] = useDayFlag("listed", key + (meal?.id || ""));
  const cook = people.find(p => p.id === night?.cook);
  const factor = meal?.serves ? cookingFor(din, people, key, meal) / meal.serves : 1;
  const ings = meal?.ingredients || [];
  const needs = ings.map(i => needOf(pan, i, factor));
  const get = needs.filter(n => !n.have);
  const frozen = needs.find(n => n.item && n.item.qty > 0 && n.item.aisle === "Frozen");
  const warn = clashText(dietClash(meal, homeFor(din, people, key)));
  const pick = () => { if (!DEMO) openSheet({ mode: "dinner", date: key, cook: night?.cook || null }); };
  const setKind = async (kind: string) => { if (DEMO) return; try { await post("/api/dinner-plan", { date: key, kind }); await qc.invalidateQueries({ queryKey: ["dinners"] }); } catch (e: any) { soon(e.message); } };
  const listIt = async () => {
    if (added) return go("pantry");
    try { if (!DEMO) await addToList(get.map(n => n.i), meal!.name, factor, pan); setAdded(true); qc.invalidateQueries({ queryKey: ["shopping"] }); } catch (e: any) { soon(e.message); }
  };
  const later = [1, 2, 3, 4].map(n => addDays(startOfDay(now), n)).map(d => ({ d, t: dinnerFor(din, people, d), cook: people.find(p => p.id === din?.plan[ymd(d)]?.cook) }));
  return (
    <div style={wrap(P)}>
      <PageHead title="Dinners" />
      <DinTabs />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: P ? 110 : 130 }}>
        <section className="tn-card">
          <div className="tn-top">
            {t ? <FoodIcon name={t.name} size={P ? 64 : 84} /> : <span className="tn-none"><DinnerIcon color="#c2410c" /></span>}
            <div className="tn-m">
              <span className="tn-cap">Tonight · {now.toLocaleDateString([], { weekday: "long" })}</span>
              <h2 className="tn-name">{t ? t.name : "Nothing planned yet"}</h2>
              {cook ? <span className="tn-cook" style={{ "--pc": cook.color } as React.CSSProperties}><i>{cook.name.trim()[0]?.toUpperCase()}</i>{cook.name}'s cooking</span> : null}
            </div>
            {t ? <button className="tn-change" onClick={pick}>Change</button> : null}
          </div>
          {warn ? <p className="tn-warn"><Warn />{warn}</p> : null}
          {!t ? (
            <div className="tn-empty">
              <button className="tn-go" onClick={pick}>Choose a dinner</button>
              <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>{Object.entries(KINDS).map(([k, l]) => <button key={k} className="chip" onClick={() => setKind(k)}>{l}</button>)}</div>
            </div>
          ) : !meal ? <p className="tn-note">Nothing to cook tonight.</p> : ings.length ? (
            <>
              <div className="tn-h"><h3>What it needs</h3><span>{needs.filter(n => n.have).length} of {needs.length} at home</span></div>
              <div className="tn-needs">{needs.map(n => (
                <button key={n.i.id} className={"tn-need " + n.tone} onClick={() => !DEMO && openSheet({ mode: "ingredient", meal: meal.id, ing: n.i.id })}>
                  <ItemIcon name={n.i.name} aisle={n.item?.aisle} size={P ? 44 : 54} />
                  <span><b>{n.i.name}</b><small>{n.status}</small></span>
                </button>
              ))}</div>
            </>
          ) : (
            <div className="tn-empty">
              <p className="tn-note">No ingredients yet. Add them and this shows what's at home and what to buy.</p>
              <button className="chip" onClick={() => setDview({ v: "meal", id: meal.id })}>Add the ingredients</button>
            </div>
          )}
        </section>

        {frozen ? (
          <section className={"tn-band thaw" + (thawed ? " done" : "")}>
            <span className="tn-bi"><Snow /></span>
            <span className="tn-bt"><b>The {frozen.i.name.toLowerCase()} is in the freezer</b><small>{thawed ? "Taken out to thaw." : now.getHours() < 12 ? "Take it out this morning so it's ready by dinner." : "Take it out now, or thaw it in the microwave."}</small></span>
            <button className="tn-bb" aria-pressed={thawed} onClick={() => setThawed(!thawed)}>{thawed ? "Taken out" : "Taken out?"}</button>
          </section>
        ) : null}

        {meal && ings.length ? (get.length ? (
          <section className={"tn-band get" + (added ? " done" : "")}>
            <span className="tn-pics" aria-hidden>{get.slice(0, 3).map(n => <ItemIcon key={n.i.id} name={n.i.name} aisle={n.item?.aisle} size={44} />)}</span>
            <span className="tn-bt"><b>{added ? "On the shopping list" : `${get.length} to get before you cook`}</b><small>{get.map(n => n.i.name).join(", ")}</small></span>
            <button className="tn-bb dark" onClick={listIt}>{added ? "See the list" : "Add to the list"}</button>
          </section>
        ) : (
          <section className="tn-band done"><span className="tn-bi"><Check /></span><span className="tn-bt"><b>Everything's at home</b><small>Nothing to buy for tonight.</small></span></section>
        )) : null}

        {meal ? (
          <div className="tn-acts">
            <button className="tn-start" onClick={() => setDview({ v: "cook", id: meal.id })}><Play />Start cooking</button>
            <button className="tn-recipe" onClick={() => setDview({ v: "meal", id: meal.id })}>Recipe</button>
          </div>
        ) : null}

        <div className="tn-h" style={{ margin: "26px 6px 10px" }}><h3>Coming up</h3><button className="dvlink" onClick={() => setDview({ v: "week" })}>The whole week</button></div>
        <div className="tn-later">{later.map(({ d, t, cook }) => (
          <button key={+d} className={"tn-day" + (t ? "" : " empty")} onClick={() => !DEMO && openSheet({ mode: "dinner", date: ymd(d), cook: din?.plan[ymd(d)]?.cook || null })}>
            <span className="tn-dw">{sameDay(d, addDays(now, 1)) ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long" })}</span>
            {t ? <FoodIcon name={t.name} size={P ? 40 : 48} /> : <span className="dplus" aria-hidden>+</span>}
            <span className="tn-dn">{t ? t.name : "Choose a dinner"}{cook ? <small>{cook.name} cooking</small> : null}</span>
          </button>
        ))}</div>
      </div>
    </div>
  );
}

/* ----- the week: a row for each night ----- */
function Week({ din }: { din: Dinners | undefined }) {
  const { dim, now, people, menuWeek, setMenuWeek, openSheet, setDview, soon } = useHub();
  const { go } = useNav();
  const qc = useQueryClient();
  const P = dim.phone;
  const w = weekStart(startOfDay(menuWeek)), b = addDays(w, 6), m = (x: Date) => x.toLocaleDateString([], { month: P ? "short" : "long" });
  const title = w.getMonth() === b.getMonth() ? `${w.getDate()} to ${b.getDate()} ${m(b)}` : `${w.getDate()} ${m(w)} to ${b.getDate()} ${m(b)}`;
  const thisWeek = sameDay(w, weekStart(now));
  const { data: ev = EMPTY_EVENTS } = useEvents(w, addDays(w, 7));
  let planned = 0, withIng = 0;
  const rows = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(w, i), today = sameDay(day, now), t = dinnerFor(din, people, day), past = day < startOfDay(now);
    const key = ymd(day), night = din?.plan[key], meal = din?.meals.find(x => x.id === night?.meal), n = meal?.ingredients?.length || 0;
    const warn = clashText(dietClash(meal, homeFor(din, people, key))), awayNames = (night?.away || []).map(id => people.find(p => p.id === id)?.name).filter(Boolean).join(" and ");
    const busy = !past ? busyAt(ev.list, day) : undefined;
    if (t) planned++;
    if (n) withIng++;
    return (
      <button key={i} className={"drow" + (today ? " today" : "") + (t ? " set" : "") + (past ? " past" : "")} aria-label={longDay(day) + (t ? ": " + t.name : "")} onClick={() => {
        if (DEMO) return;
        const p = din?.plan[ymd(day)];
        openSheet({ mode: "dinner", date: ymd(day), cook: p && p.cook ? p.cook : null });
      }}>
        <span className="dnumbox"><small>{day.toLocaleDateString([], { weekday: "short" })}</small><span className="dnum2 num">{day.getDate()}</span></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {today ? <span className="dday"><b className="dtoday">Tonight</b></span> : null}
          {t ? <>
            <span className="dname">{t.name}</span>
            {t.cook || n || awayNames ? <span className="dcook">{t.cook ? <i className="av" style={{ width: 22, height: 22, fontSize: 12, background: t.cookColor || "#8a93a6" }}>{t.cook[0].toUpperCase()}</i> : null}{[t.cook ? `${t.cook} cooking` : "", n ? `${n} ingredients` : "", awayNames ? `${awayNames} away` : ""].filter(Boolean).join(" · ")}</span> : null}
            {warn ? <span className="dwarn"><Warn />{warn}</span> : null}
            {busy ? <span className="dbusy">{busy.title} at {busy.s.getHours() % 12 || 12}{busy.s.getMinutes() ? ":" + String(busy.s.getMinutes()).padStart(2, "0") : ""}{busy.s.getHours() < 12 ? "am" : "pm"}</span> : null}
          </> : <><span className="dempty">{past ? "No dinner planned" : "Choose a dinner"}</span>{busy ? <span className="dbusy">{busy.title} at {busy.s.getHours() % 12 || 12}{busy.s.getHours() < 12 ? "am" : "pm"}: maybe something quick</span> : null}</>}
        </span>
        {t ? <FoodIcon name={t.name} size={P ? 56 : 72} /> : <span className="dplus" aria-hidden="true">+</span>}
      </button>
    );
  });
  return (
    <div style={wrap(P)}>
      <PageHead title="Dinners" sub={`${planned} of 7 planned`} />
      <DinTabs right={withIng ? <button className="tc-open" onClick={() => setDview({ v: "shop" })}>{P ? "Shop" : "Shop this week"}</button> : null} />
      <div className="fx dvweek">
        <button className="cnav" aria-label="Last week" onClick={() => setMenuWeek(addDays(w, -7))}><ChevL /></button>
        <span className="dvweek-t">{title}</span>
        <button className="cnav" aria-label="Next week" onClick={() => setMenuWeek(addDays(w, 7))}><ChevR /></button>
        {thisWeek ? null : <button className="chip" style={{ marginLeft: "auto" }} onClick={() => setMenuWeek(nowZ())}>This week</button>}
      </div>
      <div className="fx dvchips">
        <button className="chip" onClick={() => setDview({ v: "suggest" })}>Fill the week</button>
        <button className="chip" onClick={async () => { try { const n = await copyLastWeek(din, w); await qc.invalidateQueries({ queryKey: ["dinners"] }); soon(n ? `${n} dinner${n === 1 ? "" : "s"} copied from last week.` : "Those nights were already planned."); } catch (e: any) { soon(e.message); } }}>Copy last week</button>
        <button className="chip" onClick={() => setDview({ v: "rules" })}>Fixed nights</button>
        <button className="chip" onClick={() => setDview({ v: "history" })}>What we've eaten</button>
        <button className="chip" onClick={() => go("pantry")}>Pantry</button>
      </div>
      <div className="drows">{rows}<div aria-hidden style={{ flex: "none", height: P ? 90 : 110 }} /></div>
    </div>
  );
}

/* ----- all the dinners the family knows ----- */
type Sort = "az" | "most" | "lately";
function Ideas({ din }: { din: Dinners | undefined }) {
  const { dim, now, setDview, soon } = useHub();
  const qc = useQueryClient();
  const P = dim.phone, stats = useStats(din, now);
  const [q, setQ] = useState(""), [sort, setSort] = useState<Sort>("az"), [tag, setTag] = useState<string | null>(null), [adding, setAdding] = useState(false), [text, setText] = useState("");
  const meals = din?.meals || [];
  const tags = useMemo(() => { const c: Record<string, number> = {}; meals.forEach(m => (m.tags || []).forEach(t => c[t] = (c[t] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t); }, [din]);
  const shown = meals
    .filter(m => (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()) || (m.ingredients || []).some(i => i.name.toLowerCase().includes(q.trim().toLowerCase()))) && (!tag || (tag === "★" ? m.favourite : (m.tags || []).includes(tag))))
    .sort((a, b) => sort === "most" ? (stats[b.id]?.count || 0) - (stats[a.id]?.count || 0) || a.name.localeCompare(b.name)
      : sort === "lately" ? (stats[a.id]?.last || "").localeCompare(stats[b.id]?.last || "") || a.name.localeCompare(b.name)
      : (+!!b.favourite - +!!a.favourite) || a.name.localeCompare(b.name));
  const make = async () => {
    if (!text.trim()) return;
    try { const r = await post("/api/meal", { name: text }); setText(""); setAdding(false); await qc.invalidateQueries({ queryKey: ["dinners"] }); setDview({ v: "meal", id: r.id }); } catch (e: any) { soon(e.message); }
  };
  return (
    <div style={wrap(P)}>
      <PageHead title="Dinners" sub={meals.length ? `${meals.length} we know how to make` : undefined} />
      <DinTabs right={DEMO ? null : <button className="dvnew" onClick={() => setAdding(a => !a)}>{adding ? "Cancel" : "+ New"}</button>} />
      {adding ? (
        <form className="qadd" style={{ padding: "0 0 12px" }} onSubmit={e => { e.preventDefault(); make(); }}>
          <input value={text} onChange={e => setText(e.target.value)} maxLength={40} placeholder="Spaghetti Bolognese, Tacos…" aria-label="New dinner" autoComplete="off" ref={focusRef} enterKeyHint="done" />
          <button type="submit" className="primary" disabled={!text.trim()}>Add</button>
        </form>
      ) : null}
      <label className="dvsearch"><SearchIcon /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search dinners or ingredients" aria-label="Search dinners" autoComplete="off" enterKeyHint="search" /></label>
      <div className="fx dvchips">
        {[["az", "A to Z"], ["most", "Most often"], ["lately", "Not had lately"]].map(([v, l]) => <button key={v} className={"chip" + (sort === v ? " on" : "")} aria-pressed={sort === v} onClick={() => setSort(v as Sort)}>{l}</button>)}
        <span className="dvsep" aria-hidden />
        {meals.some(m => m.favourite) ? <button className={"chip" + (tag === "★" ? " on" : "")} aria-pressed={tag === "★"} onClick={() => setTag(tag === "★" ? null : "★")}>★ Favourites</button> : null}
        {tags.map(t => <button key={t} className={"chip" + (tag === t ? " on" : "")} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>)}
      </div>
      <div className="scroll" style={{ flex: 1, minHeight: 0, paddingBottom: P ? 100 : 130 }}>
        {shown.length ? <div className="dvgrid">{shown.map(m => {
          const s = stats[m.id];
          return (
            <button key={m.id} className="dvcard" onClick={() => setDview({ v: "meal", id: m.id })}>
              <FoodIcon name={m.name} size={P ? 56 : 68} />
              <span className="dvct"><b>{m.name}{m.favourite ? <i className="dvstar" aria-label="Favourite">★</i> : null}</b>
                <small>{metaLine(m) || "Tap to add the ingredients"}</small>
                {s?.next ? <small className="dvnext">On {dayName(s.next, now)}</small> : s?.last ? <small className="dvlast">Had {ago(s.last, now)}{s.count > 1 ? ` · ${s.count} times` : ""}</small> : null}</span>
              <Chev />
            </button>
          );
        })}</div> : (
          <div className="dvempty">
            <b>{meals.length ? "No dinners match" : "No dinners yet"}</b>
            <span>{meals.length ? "Try a different word, or clear the filter." : "Add your favourites with + New and they turn up here."}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ----- one dinner ----- */
function MealPage({ din, id }: { din: Dinners | undefined; id: string }) {
  const { dim, now, people, setDview, openSheet, soon } = useHub();
  const { go } = useNav();
  const qc = useQueryClient();
  const save = useMealSave();
  const P = dim.phone, stats = useStats(din, now);
  const m = din?.meals.find(x => x.id === id);
  const [cookFor, setCookFor] = useState(() => cookingFor(din, people, ymd(now), m) || m?.serves || 4);
  const { data: pan = NO_PANTRY } = usePantry();
  const [notes, setNotes] = useState(m?.notes || ""), [link, setLink] = useState(m?.link || ""), [tag, setTag] = useState(""), [sure, setSure] = useState(false), [name, setName] = useState(m?.name || ""), [renaming, setRenaming] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => { if (m) { setNotes(m.notes || ""); setLink(m.link || ""); setName(m.name); } }, [m?.id]);
  if (!m) return (
    <div style={wrap(P)}><Top back="Dinner ideas" to={{ v: "ideas" }} title="Dinner" /><p className="dvnone">That dinner has gone. Go back to the list to pick another.</p></div>
  );
  const s = stats[m.id], ings = m.ingredients || [];
  const stocked = (i: Ingredient) => haveEnough(pan, i, m.serves ? cookFor / m.serves : 1);
  const buy = ings.filter(i => !i.staple && !stocked(i));
  const factor = m.serves ? cookFor / m.serves : 1;
  const clash = clashText(dietClash(m, people.filter(p => (p.diet || []).length)));
  const run = async (f: () => Promise<unknown>) => { try { await f(); await qc.invalidateQueries({ queryKey: ["dinners"] }); } catch (e: any) { soon(e.message); } };
  const shop = async () => { try { await addToList(buy, m.name, factor, pan); setMsg(`${buy.length} on the shopping list${ings.length > buy.length ? `. ${ings.length - buy.length} you already have ${ings.length - buy.length === 1 ? "was" : "were"} left off.` : "."}`); } catch (e: any) { soon(e.message); } };
  return (
    <div style={wrap(P)}>
      <Top back="Dinner ideas" to={{ v: "ideas" }} title={m.name} right={<button className={"dvfav" + (m.favourite ? " on" : "")} aria-pressed={!!m.favourite} aria-label="Favourite" onClick={() => save(m, { favourite: !m.favourite })}>★</button>} />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 150 }}>
        <section className="dvhero">
          <FoodIcon name={m.name} size={P ? 84 : 104} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {renaming ? (
              <form className="qadd" onSubmit={e => { e.preventDefault(); run(async () => { await post("/api/meal", { id: m.id, name }); setRenaming(false); }); }}>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={40} aria-label="Dinner name" ref={focusRef} /><button className="primary" type="submit" disabled={!name.trim()}>Save</button>
              </form>
            ) : <button className="dvname" onClick={() => setRenaming(true)} aria-label="Rename this dinner">{m.name}<small>Rename</small></button>}
            <div className="dvmeta">
              {s?.next ? <span>Next: {dayName(s.next, now)}</span> : <span>Not planned yet</span>}
              {s?.last ? <span>Last had {ago(s.last, now)}{s.count > 1 ? ` · ${s.count} times` : ""}</span> : null}
            </div>
          </div>
        </section>
        <div className="dvacts">
          {ings.length || m.notes ? <button className="dvbtn dark" onClick={() => setDview({ v: "cook", id: m.id })}><Play />Cook it</button> : null}
          <button className="dvbtn" onClick={() => openSheet({ mode: "planmeal", meal: m.id })}>Plan it</button>
          {buy.length ? <button className="dvbtn" onClick={shop}>Add {buy.length} to the list</button> : null}
        </div>
        {msg ? <button className="dvlink" onClick={() => go("pantry")}>{msg} Open the list</button> : null}

        {clash ? <p className="tn-warn"><Warn />{clash}. Check the ingredients, then mark which diets it suits below.</p> : null}
        <h3 className="dvh">Ingredients{ings.length ? <small>{ings.length}</small> : null}</h3>
        <section className="dvsec">
        {ings.length && m.serves ? (
          <div className="fx dvrow" style={{ borderTop: 0 }}><span>Cooking for</span>
            <div className="fx" style={{ gap: 12 }}>
              <button className="cnav" aria-label="Fewer" onClick={() => setCookFor(Math.max(1, cookFor - 1))}>−</button>
              <span className="num" style={{ minWidth: 40, textAlign: "center", fontSize: 26, fontWeight: 700 }}>{cookFor}</span>
              <button className="cnav" aria-label="More" onClick={() => setCookFor(Math.min(50, cookFor + 1))}>+</button>
            </div>
          </div>
        ) : null}
        {ings.length ? ings.map(i => (
          <button key={i.id} className="dving" onClick={() => openSheet({ mode: "ingredient", meal: m.id, ing: i.id })}>
            {i.product?.image ? <Thumb src={i.product.image} letter={i.product.brand || i.name} /> : <ItemIcon name={i.name} size={56} />}
            <span className="dvit"><b>{i.name}{i.amount ? <em>{scaleAmount(i.amount, factor)}</em> : null}</b>
              <small>{i.product ? productLine(i.product) : "Any brand"}{i.alt ? ` · or ${i.alt.brand || i.alt.name}` : ""}{i.staple ? " · pantry staple" : stocked(i) ? " · in the pantry" : ""}</small></span>
            <Chev />
          </button>
        )) : <p className="dvnone">No ingredients yet. Add what this dinner needs and you can send them to the shopping list.</p>}
        <button className="dvadd" onClick={() => openSheet({ mode: "ingredient", meal: m.id, ing: null })}>+ Add an ingredient</button>
        </section>

        <h3 className="dvh">About</h3>
        <section className="dvsec">
        <div className="fx dvrow" style={{ borderTop: 0 }}><span>Serves</span>
          <div className="fx" style={{ gap: 12 }}>
            <button className="cnav" aria-label="Fewer" onClick={() => save(m, { serves: Math.max(0, (m.serves || 0) - 1) })}>−</button>
            <span className="num" style={{ minWidth: 40, textAlign: "center", fontSize: 26, fontWeight: 700 }}>{m.serves || "–"}</span>
            <button className="cnav" aria-label="More" onClick={() => save(m, { serves: Math.min(50, (m.serves || 0) + 1) })}>+</button>
          </div>
        </div>
        <div className="dvrow col"><span>How long it takes</span>
          <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>{[0, 15, 30, 45, 60, 90].map(n => <Pill key={n} on={(m.minutes || 0) === n} onClick={() => save(m, { minutes: n })}>{n ? (n >= 60 ? `${n / 60 === 1 ? "1 hour" : "1½ hours"}` : `${n} min`) : "Not said"}</Pill>)}</div>
        </div>
        {people.length ? (
          <div className="dvrow col"><span>Who likes it?</span>
            <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
              {people.map(p => { const r = m.ratings?.[p.id] ?? 0; return (
                <button key={p.id} className={"pill rate" + (r > 0 ? " up" : r < 0 ? " down" : "")} aria-label={`${p.name}: ${r > 0 ? "likes it" : r < 0 ? "doesn't like it" : "no opinion yet"}. Tap to change`} onClick={() => save(m, { ratings: { ...(m.ratings || {}), [p.id]: r === 0 ? 1 : r > 0 ? -1 : 0 } })}>
                  <i className="av" style={{ width: 30, height: 30, fontSize: 15, background: p.color }}>{p.name[0].toUpperCase()}</i>{p.name}{r > 0 ? " likes it" : r < 0 ? " isn't keen" : ""}
                </button>
              ); })}
            </div>
          </div>
        ) : null}
        <div className="dvrow col"><span>Suits</span>
          <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>{DIETS.map(d => { const on = (m.suits || []).includes(d); return <Pill key={d} on={on} onClick={() => save(m, { suits: on ? (m.suits || []).filter(x => x !== d) : [...(m.suits || []), d] })}>{d}</Pill>; })}</div>
        </div>
        <div className="dvrow col"><span>Tags</span>
          <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
            {(m.tags || []).map(t => <button key={t} className="pill on" aria-label={"Remove tag " + t} onClick={() => save(m, { tags: (m.tags || []).filter(x => x !== t) })}>{t} <XIcon /></button>)}
            {["Quick", "Kid favourite", "Veggie", "Slow cook", "Special"].filter(t => !(m.tags || []).includes(t)).map(t => <Pill key={t} onClick={() => save(m, { tags: [...(m.tags || []), t] })}>+ {t}</Pill>)}
          </div>
          <form className="qadd" onSubmit={e => { e.preventDefault(); const t = tag.trim(); if (t && !(m.tags || []).includes(t)) save(m, { tags: [...(m.tags || []), t] }); setTag(""); }}>
            <input value={tag} onChange={e => setTag(e.target.value)} maxLength={20} placeholder="Your own tag" aria-label="Add a tag" autoComplete="off" /><button type="submit" disabled={!tag.trim()}>Add</button>
          </form>
        </div>
        <div className="dvrow col"><span>Notes</span>
          <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 500, color: "#6b7488" }}>One step to a line, and "Cook it" shows them in big type.</p>
          <textarea className="dvta" value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => notes !== (m.notes || "") && save(m, { notes })} maxLength={1500} rows={4} placeholder="How it's made, tips, what the kids like" />
        </div>
        <div className="dvrow col"><span>Recipe link</span>
          <div className="fx" style={{ gap: 10 }}>
            <input value={link} onChange={e => setLink(e.target.value)} onBlur={() => link !== (m.link || "") && save(m, { link })} inputMode="url" autoCapitalize="off" maxLength={300} placeholder="https://…" aria-label="Recipe link" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
            {m.link ? <a className="dvbtn" style={{ flex: "none" }} href={m.link} target="_blank" rel="noreferrer">Open</a> : null}
          </div>
        </div>
        </section>
        <div style={{ marginTop: 26 }}>
          {sure ? <div className="fx" style={{ gap: 10 }}><button className="danger" style={{ flex: 1 }} onClick={() => run(async () => { await post("/api/meal/delete", { id: m.id }); setDview({ v: "ideas" }); })}>Yes, remove it</button><button style={{ flex: 1 }} onClick={() => setSure(false)}>Keep it</button></div>
            : <button className="danger-o" onClick={() => setSure(true)}>Remove this dinner</button>}
          {sure ? <p style={{ fontSize: 16, color: "var(--soft)" }}>It also comes off any days it was planned.</p> : null}
        </div>
      </div>
    </div>
  );
}

/* ----- shop for the days that are planned ----- */
function ShopWeek({ din }: { din: Dinners | undefined }) {
  const { dim, now, people, menuWeek, setDview, soon } = useHub();
  const { go } = useNav();
  const P = dim.phone;
  const w = weekStart(startOfDay(menuWeek));
  const { data: pan = NO_PANTRY } = usePantry();
  const stocked = (i: Ingredient, f = 1) => haveEnough(pan, i, f);
  const groups = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter(d => d >= startOfDay(now)).map(d => ({ d, m: din?.meals.find(x => x.id === din.plan[ymd(d)]?.meal) })).filter(g => g.m && (g.m.ingredients || []).length);
  const [off, setOff] = useState<string[] | null>(null), [done, setDone] = useState<number | null>(null), [forN, setForN] = useState<Record<string, number>>({});
  const key = (d: Date, i: Ingredient) => ymd(d) + i.id;
  const target = (d: Date, m: Meal) => forN[ymd(d)] ?? cookingFor(din, people, ymd(d), m);
  const factor = (d: Date, m: Meal) => m.serves ? target(d, m) / m.serves : 1;
  const unneeded = useMemo(() => groups.flatMap(g => g.m!.ingredients!.filter(i => i.staple || stocked(i, factor(g.d, g.m!))).map(i => key(g.d, i))), [din, pan, ymd(w)]);
  const skipped = off ?? unneeded;
  const picked = groups.flatMap(g => g.m!.ingredients!.filter(i => !skipped.includes(key(g.d, i))).map(i => ({ i, from: g.m!.name, f: factor(g.d, g.m!) })));
  const toggle = (k: string) => setOff(skipped.includes(k) ? skipped.filter(x => x !== k) : [...skipped, k]);
  const total = picked.length;
  const add = async () => {
    try {
      const by: Record<string, { i: Ingredient; f: number }[]> = {};
      picked.forEach(p => (by[p.from] ||= []).push(p));
      for (const [from, items] of Object.entries(by)) for (const f of [...new Set(items.map(x => x.f))]) await addToList(items.filter(x => x.f === f).map(x => x.i), from, f, pan);
      setDone(total);
    } catch (e: any) { soon(e.message); }
  };
  return (
    <div style={wrap(P)}>
      <Top back="This week" to={{ v: "week" }} title="Shop for the week" />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 130 }}>
        {done !== null ? (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <div className="dvdone"><Check /></div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.02em", marginTop: 14 }}>{done} {done === 1 ? "thing" : "things"} on the shopping list</div>
            <div className="fx" style={{ gap: 10, justifyContent: "center", marginTop: 18 }}><button className="primary" onClick={() => go("pantry")}>Open the list</button><button onClick={() => setDview({ v: "week" })}>Back to the week</button></div>
          </div>
        ) : groups.length ? (
          <>
            <p style={{ fontSize: 18, color: "var(--soft)", margin: "0 4px 6px" }}>Everything the planned dinners need, for the people who are home. Pantry staples and things you already have start unticked.</p>
            {groups.map(g => (
              <section key={+g.d} className="dvshop">
                <div className="fx" style={{ gap: 12, padding: "12px 0 8px" }}><FoodIcon name={g.m!.name} size={48} />
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 21 }}>{g.m!.name}</b><div style={{ fontSize: 15, color: "#6b7488", fontWeight: 600 }}>{g.d.toLocaleDateString([], { weekday: "long" })}</div></div>
                  {g.m!.serves ? <div className="fx" style={{ gap: 8, flex: "none" }} aria-label="Cooking for">
                    <button className="cnav" style={{ width: 48, height: 48 }} aria-label="Fewer" onClick={() => setForN({ ...forN, [ymd(g.d)]: Math.max(1, target(g.d, g.m!) - 1) })}>−</button>
                    <span style={{ fontSize: 17, fontWeight: 700, minWidth: 54, textAlign: "center" }}>for {target(g.d, g.m!)}</span>
                    <button className="cnav" style={{ width: 48, height: 48 }} aria-label="More" onClick={() => setForN({ ...forN, [ymd(g.d)]: Math.min(50, target(g.d, g.m!) + 1) })}>+</button>
                  </div> : null}
                </div>
                {g.m!.ingredients!.map(i => { const k = key(g.d, i), on = !skipped.includes(k); return (
                  <div className={"srow" + (on ? "" : " off")} key={k}>
                    <button className="stk" aria-pressed={on} onClick={() => toggle(k)}><span className="chk" aria-hidden style={on ? { background: "var(--text)", borderColor: "var(--text)" } : undefined}>{on ? <Check /> : null}</span>
                      <span className="sn" style={{ textDecoration: "none" }}>{i.name}<small className="snote">{[scaleAmount(i.amount, factor(g.d, g.m!)), i.product ? productLine(i.product) : ""].filter(Boolean).join(" · ")}{i.staple ? " · staple" : stocked(i, factor(g.d, g.m!)) ? " · in the pantry" : ""}</small></span></button>
                  </div>
                ); })}
              </section>
            ))}
          </>
        ) : (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>Nothing to shop for yet</div>
            <div style={{ fontSize: 18, color: "#6b7488", marginTop: 6 }}>Plan some dinners that have ingredients, and they appear here.</div>
          </div>
        )}
      </div>
      {done === null && groups.length ? <div className="dvbar"><button className="primary" disabled={!total} onClick={add}>Add {total} to the shopping list</button></div> : null}
    </div>
  );
}

/* ---------- sheets ---------- */

const COMMON = ["Mince", "Pasta", "Rice", "Chicken", "Onion", "Garlic", "Tomatoes", "Cheese", "Potatoes", "Carrots", "Eggs", "Milk", "Butter", "Bread"];
const AMOUNTS = ["1", "2", "3", "250 g", "500 g", "1 kg", "1 cup", "1 tin", "1 jar", "1 packet"];

/** One ingredient: what it is, how much, and (if wanted) the exact product from a shop. */
export function IngredientSheet({ meal, ing }: { meal: string; ing: string | null }) {
  const { closeSheet, soon } = useHub();
  const { data: din } = useDinners();
  const save = useMealSave();
  const m = din?.meals.find(x => x.id === meal), cur = m?.ingredients?.find(x => x.id === ing);
  const [name, setName] = useState(cur?.name || ""), [amount, setAmount] = useState(cur?.amount || ""), [staple, setStaple] = useState(!!cur?.staple), [product, setProduct] = useState<Product | null>(cur?.product || null);
  const [alt, setAlt] = useState<Product | null>(cur?.alt || null), [target, setTarget] = useState<"product" | "alt">("product");
  const nameRef = useRef<HTMLInputElement>(null);
  useAutoFocus(nameRef, SHEET_MS, !cur);
  const [scan, setScan] = useState<"" | "product" | "alt">(""), [scanMsg, setScanMsg] = useState(""), [unknown, setUnknown] = useState<{ code: string; for: "product" | "alt" } | null>(null);
  const [find, setFind] = useState(false), [q, setQ] = useState(cur?.name || ""), [qd, setQd] = useState("");
  useEffect(() => { const t = setTimeout(() => setQd(q.trim()), 600); return () => clearTimeout(t); }, [q]);
  const res = useQuery({ queryKey: ["products", qd], enabled: find && qd.length >= 2, staleTime: 600000, retry: false, queryFn: () => api<Product[]>("/api/products/search?q=" + encodeURIComponent(qd)) });
  if (!m) return <SheetFrame title="Ingredient" body={<p>That dinner has gone.</p>} foot={<button className="primary" style={{ marginLeft: "auto" }} onClick={closeSheet}>Close</button>} />;
  /** A barcode has been read (or typed): find the product it belongs to, or offer to keep the bare barcode. */
  const gotCode = async (code: string, forWhat: "product" | "alt") => {
    setScan(""); setScanMsg(""); setUnknown(null);
    try {
      const r = await api<Product[]>("/api/products/search?q=" + code);
      const hit = r.find(p => p.code === code) || r.find(p => p.code.replace(/^0+/, "") === code.replace(/^0+/, ""));
      if (hit) { if (forWhat === "alt") setAlt(hit); else { setProduct(hit); if (!name.trim()) setName(hit.name); } setFind(false); }
      else setUnknown({ code, for: forWhat });
    } catch { setUnknown({ code, for: forWhat }); }
  };
  const keepBare = () => {
    if (!unknown) return;
    const p: Product = { code: unknown.code, name: name.trim() || "Scanned product", brand: "", quantity: "", image: "" };
    if (unknown.for === "alt") setAlt(p); else { setProduct(p); if (!name.trim()) setName(p.name); }
    setUnknown(null); setFind(false);
  };
  const startScan = (forWhat: "product" | "alt") => { const why = scanProblem(); if (why) { setScanMsg(why); setFind(true); setTarget(forWhat); setQ(name || q); return; } setScanMsg(""); setScan(forWhat); };
  const go = async () => {
    if (!name.trim()) return soon("Say what it is first.");
    const next: Ingredient = { id: cur?.id || "", name: name.trim(), amount: amount.trim(), product, staple, alt: product ? alt : null };
    await save(m, { ingredients: cur ? m.ingredients!.map(x => x.id === cur.id ? next : x) : [...(m.ingredients || []), next] });
    closeSheet();
  };
  const body = (
    <>
      <div className="cap" style={{ margin: "14px 0 8px" }}>What is it?</div>
      <input value={name} onChange={e => { setName(e.target.value); if (!find) setQ(e.target.value); }} maxLength={50} placeholder="Pasta, mince, tomatoes…" aria-label="Ingredient" autoComplete="off" ref={nameRef} style={{ fontSize: 26, fontWeight: 700, minHeight: 72 }} />
      {!cur ? <div className="fx" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>{COMMON.filter(c => !name || c.toLowerCase().includes(name.toLowerCase())).slice(0, 10).map(c => <Pill key={c} onClick={() => { setName(c); setQ(c); }}>{c}</Pill>)}</div> : null}
      <div className="cap" style={{ margin: "24px 0 8px" }}>How much?</div>
      <input value={amount} onChange={e => setAmount(e.target.value)} maxLength={30} placeholder="500 g, 2, 1 tin…" aria-label="Amount" autoComplete="off" />
      <div className="fx" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>{AMOUNTS.map(a => <Pill key={a} on={amount === a} onClick={() => setAmount(a)}>{a}</Pill>)}</div>
      <div className="fx dvrow" style={{ marginTop: 18 }}><span>A pantry staple<small>Usually in the cupboard, so it isn't added to the shopping list without asking</small></span>
        <button className={"sw2" + (staple ? " on" : "")} role="switch" aria-checked={staple} aria-label="Pantry staple" onClick={() => setStaple(!staple)}><i /></button></div>

      {scan ? <Scanner onCode={c => gotCode(c, scan)} onClose={() => setScan("")} /> : null}
      <div className="cap" style={{ margin: "24px 0 8px" }}>The exact product</div>
      {product ? (
        <div className="dvprod on">
          <Thumb big src={product.image} letter={product.brand || product.name} />
          <span className="dvit"><b>{product.brand || product.name}</b><small>{[product.brand ? product.name : "", product.quantity].filter(Boolean).join(" · ")}</small><small className="dvcode">Barcode {product.code}</small></span>
          <button className="cnav" aria-label="Use any brand instead" onClick={() => setProduct(null)}><XIcon /></button>
        </div>
      ) : !find ? (
        <div className="fx" style={{ gap: 10 }}>
          <button className="dvadd" onClick={() => startScan("product")}><Cam />Scan a barcode</button>
          <button className="dvadd" onClick={() => { setTarget("product"); setFind(true); setQ(name || q); }}>Look up a brand and size</button>
        </div>
      ) : null}
      {product ? (
        <>
          <div className="cap" style={{ margin: "22px 0 8px" }}>A second choice, if that one isn't there</div>
          {alt ? (
            <div className="dvprod on">
              <Thumb big src={alt.image} letter={alt.brand || alt.name} />
              <span className="dvit"><b>{alt.brand || alt.name}</b><small>{[alt.brand ? alt.name : "", alt.quantity].filter(Boolean).join(" · ")}</small></span>
              <button className="cnav" aria-label="Remove the second choice" onClick={() => setAlt(null)}><XIcon /></button>
            </div>
          ) : !find ? <div className="fx" style={{ gap: 10 }}><button className="dvadd" onClick={() => startScan("alt")}><Cam />Scan one</button><button className="dvadd" onClick={() => { setTarget("alt"); setFind(true); setQ(name || q); }}>Look one up</button></div> : null}
        </>
      ) : null}
      {scanMsg ? <p className="dvnone">{scanMsg}</p> : null}
      {unknown ? (
        <div className="dvprod on" style={{ flexWrap: "wrap" }}>
          <span className="dvit"><b>Barcode {unknown.code}</b><small>It isn't in the shared product list, but you can keep the barcode so it can be matched at a shop later.</small></span>
          <div className="fx" style={{ gap: 8, width: "100%" }}><button className="primary" style={{ flex: 1 }} onClick={keepBare}>Keep this barcode</button><button style={{ flex: 1 }} onClick={() => setUnknown(null)}>Not this one</button></div>
        </div>
      ) : null}
      {find && (target === "product" ? !product : !alt) ? (
        <div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or type a barcode" aria-label="Search products" autoComplete="off" enterKeyHint="search" />
          {res.isFetching ? <p className="dvnone">Looking…</p> : res.isError ? <p className="dvnone">{(res.error as Error).message || "Couldn't look that up."} You can still save it as any brand.</p>
            : res.data && !res.data.length ? <p className="dvnone">Nothing found. Try the brand name or the barcode, or save it as any brand.</p> : null}
          {(res.data || []).map(p => (
            <button key={p.code} className="dvprod" onClick={() => { if (target === "alt") { setAlt(p); } else { setProduct(p); if (!name.trim()) setName(p.name); } setFind(false); }}>
              <Thumb big src={p.image} letter={p.brand || p.name} />
              <span className="dvit"><b>{p.brand || p.name}</b><small>{[p.brand ? p.name : "", p.quantity].filter(Boolean).join(" · ")}</small></span>
            </button>
          ))}
          <p style={{ fontSize: 15, color: "var(--soft)", margin: "10px 2px" }}>Products come from Open Food Facts, a free shared list. Some Australian ones are missing.</p>
        </div>
      ) : null}
    </>
  );
  return <SheetFrame title={cur ? "Ingredient" : "Add an ingredient"} body={body}
    foot={<>{cur ? <button className="danger-o" onClick={async () => { await save(m, { ingredients: m.ingredients!.filter(x => x.id !== cur.id) }); closeSheet(); }}>Remove</button> : null}<button style={{ marginLeft: "auto" }} onClick={closeSheet}>Cancel</button><button className="primary" style={{ minWidth: 180 }} onClick={go}>{cur ? "Save" : "Add"}</button></>} />;
}

/** Pick a day to have this dinner on. */
export function PlanMealSheet({ meal }: { meal: string }) {
  const { closeSheet, now, soon } = useHub();
  const qc = useQueryClient();
  const { data: din } = useDinners();
  const m = din?.meals.find(x => x.id === meal);
  const days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(now), i));
  const plan = async (d: Date) => { try { await post("/api/dinner-plan", { date: ymd(d), meal_id: meal, cook: din?.plan[ymd(d)]?.cook || null }); await qc.invalidateQueries({ queryKey: ["dinners"] }); closeSheet(); soon(`${m?.name || "Dinner"} planned for ${d.toLocaleDateString([], { weekday: "long" })}.`); } catch (e: any) { soon(e.message); } };
  return <SheetFrame title={m ? `Plan ${m.name}` : "Plan it"} foot={<button className="primary" style={{ marginLeft: "auto", minWidth: 200 }} onClick={closeSheet}>Cancel</button>} body={
    <div style={{ paddingTop: 10 }}>
      {days.map((d, i) => { const cur = din?.meals.find(x => x.id === din.plan[ymd(d)]?.meal); return (
        <button key={i} className="srow" onClick={() => plan(d)} style={{ width: "100%" }}>
          <span className="sd num"><b>{d.getDate()}</b><small>{d.toLocaleDateString([], { month: "short" })}</small></span>
          <span className="sm"><b>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long" })}</b><small>{cur ? (cur.id === meal ? "Already this dinner" : "Now: " + cur.name + " (it will be replaced)") : "Nothing planned"}</small></span>
        </button>
      ); })}
    </div>
  } />;
}
