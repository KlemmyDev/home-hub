import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO, post } from "../lib/api";
import { addDays, fromYmd, longDay, nowZ, sameDay, startOfDay, weekStart, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR, XIcon } from "../lib/icons";
import { DIETS, EMPTY_EVENTS, KINDS, dinnerFor, useDinners, useEvents, type Dinners, type Ingredient, type Meal, type Product } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { FoodIcon } from "../lib/foodicons";
import { PanelTop, Top, wrap } from "./Panels";
import { Pill, SheetFrame } from "./SheetFrame";
import { ago, busyAt, clashText, cookingFor, dayName, dietClash, homeFor, metaLine, productLine, scaleAmount, useStats } from "../lib/dinnerlib";
import { Cook, copyLastWeek, History, Pantry, Rules, Suggest } from "./DinnerTools";
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
export async function addToList(items: Ingredient[], from: string, factor = 1) {
  await post("/api/shopping/add-many", { from, items: items.map(i => ({ name: i.name, note: [scaleAmount(i.amount, factor), i.product ? productLine(i.product) : "", i.alt ? "or " + productLine(i.alt) : ""].filter(Boolean).join(" · "), barcode: i.product?.code || "" })) });
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
      {dview.v === "suggest" ? <Suggest din={din} /> : dview.v === "rules" ? <Rules din={din} /> : dview.v === "pantry" ? <Pantry din={din} /> : dview.v === "history" ? <History din={din} /> : dview.v === "cook" ? <Cook din={din} id={dview.id} /> : dview.v === "ideas" ? <Ideas din={din} /> : dview.v === "meal" ? <MealPage din={din} id={dview.id} /> : dview.v === "shop" ? <ShopWeek din={din} /> : <Week din={din} />}
    </div>
  );
}

/* ----- the week, as before: the simple page you land on ----- */
function Week({ din }: { din: Dinners | undefined }) {
  const { dim, now, people, menuWeek, setMenuWeek, openSheet, setDview, soon } = useHub();
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
      <button key={i} className={"drow" + (today ? " today" : "") + (t ? " set" : "")} aria-label={longDay(day) + (t ? ": " + t.name : "")} onClick={() => {
        if (DEMO) return;
        const p = din?.plan[ymd(day)];
        openSheet({ mode: "dinner", date: ymd(day), cook: p && p.cook ? p.cook : null });
      }}>
        <span className={"dnumbox" + (today ? " now" : "")}><span className="dnum2 num">{day.getDate()}</span></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="dday">{day.toLocaleDateString([], { weekday: "long" })}{today ? <b className="dtoday">Today</b> : null}</span>
          {t ? <>
            <span className="dname">{t.name}</span>
            {t.cook || n || awayNames ? <span className="dcook">{t.cook ? <i className="av" style={{ width: 22, height: 22, fontSize: 12, background: t.cookColor || "#8a93a6" }}>{t.cook[0].toUpperCase()}</i> : null}{[t.cook ? `${t.cook} cooking` : "", n ? `${n} ingredients` : "", awayNames ? `${awayNames} away` : ""].filter(Boolean).join(" · ")}</span> : null}
            {warn ? <span className="dwarn">⚠ {warn}</span> : null}
            {busy ? <span className="dbusy">{busy.title} at {busy.s.getHours() % 12 || 12}{busy.s.getMinutes() ? ":" + String(busy.s.getMinutes()).padStart(2, "0") : ""}{busy.s.getHours() < 12 ? "am" : "pm"}</span> : null}
          </> : <><span className="dempty">{past ? "No dinner planned" : "Tap to choose a dinner"}</span>{busy ? <span className="dbusy">{busy.title} at {busy.s.getHours() % 12 || 12}{busy.s.getHours() < 12 ? "am" : "pm"}: maybe something quick</span> : null}</>}
        </span>
        {t ? <FoodIcon name={t.name} size={P ? 64 : 84} /> : <span className="dplus" aria-hidden="true">+</span>}
      </button>
    );
  });
  return (
    <div style={wrap(P)}>
      <PanelTop title="Dinners" />
      <div className="fx" style={{ justifyContent: "space-between", padding: "0 0 12px", gap: 10 }}>
        <div className="fx" style={{ gap: 10, minWidth: 0 }}>
          <button className="cnav" aria-label="Back" onClick={() => setMenuWeek(addDays(w, -7))}><ChevL /></button>
          <span style={{ fontSize: P ? 21 : 28, fontWeight: 700, letterSpacing: "-.04em", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
          <button className="cnav" aria-label="Forward" onClick={() => setMenuWeek(addDays(w, 7))}><ChevR /></button>
        </div>
        <div className="fx" style={{ gap: 8, flex: "none" }}>
          {thisWeek ? null : <button className="cbtn" style={{ background: "#fff", color: "#101828", border: "1.5px solid #d5dbe6" }} onClick={() => setMenuWeek(nowZ())}>This week</button>}
          {withIng ? <button className="cbtn" style={{ padding: "0 18px", background: "#fff", color: "#101828", border: "1.5px solid #d5dbe6" }} onClick={() => setDview({ v: "shop" })}>{P ? "Shop" : "Shop this week"}</button> : null}
          <button className="cbtn accent" hidden={DEMO} style={{ padding: "0 20px" }} onClick={() => setDview({ v: "ideas" })}>{P ? "Ideas" : "Ideas"}{din?.meals.length ? " · " + din.meals.length : ""}</button>
        </div>
      </div>
      <div className="fx dvchips" style={{ padding: "0 0 10px" }}>
        <Pill onClick={() => setDview({ v: "suggest" })}>✨ Fill the week</Pill>
        <Pill onClick={async () => { try { const n = await copyLastWeek(din, w); await qc.invalidateQueries({ queryKey: ["dinners"] }); soon(n ? `${n} dinner${n === 1 ? "" : "s"} copied from last week.` : "Those nights were already planned."); } catch (e: any) { soon(e.message); } }}>Copy last week</Pill>
        <Pill onClick={() => setDview({ v: "rules" })}>Fixed nights</Pill>
        <Pill onClick={() => setDview({ v: "pantry" })}>Pantry</Pill>
        <Pill onClick={() => setDview({ v: "history" })}>What we've eaten</Pill>
      </div>
      <div className="drows">{rows}</div>
      <div style={{ flex: "none", height: 140, padding: "10px 4px 0" }}>
        <div className="pbar" aria-hidden style={{ margin: "0 0 14px" }}>{Array.from({ length: 7 }, (_, i) => <i key={i} className={dinnerFor(din, people, addDays(w, i)) ? "on" : ""} />)}</div>
        <div className="fx" style={{ justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em" }}>{planned} of 7 planned</span>
        </div>
      </div>
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
      <Top back="Dinners" to={{ v: "home" }} title="Dinner ideas" right={<button className="cbtn accent" style={{ padding: "0 18px" }} onClick={() => setAdding(a => !a)}>{adding ? "Cancel" : "+ New"}</button>} />
      {adding ? (
        <form className="qadd" style={{ padding: "0 0 12px" }} onSubmit={e => { e.preventDefault(); make(); }}>
          <input value={text} onChange={e => setText(e.target.value)} maxLength={40} placeholder="Spaghetti Bolognese, Tacos…" aria-label="New dinner" autoComplete="off" ref={focusRef} enterKeyHint="done" />
          <button type="submit" className="primary" disabled={!text.trim()}>Add</button>
        </form>
      ) : null}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search dinners or ingredients" aria-label="Search dinners" autoComplete="off" enterKeyHint="search" style={{ marginBottom: 10 }} />
      <div className="fx dvchips">
        {[["az", "A to Z"], ["most", "Most often"], ["lately", "Not had lately"]].map(([v, l]) => <Pill key={v} on={sort === v} onClick={() => setSort(v as Sort)}>{l}</Pill>)}
        <span className="dvsep" aria-hidden />
        {meals.some(m => m.favourite) ? <Pill on={tag === "★"} onClick={() => setTag(tag === "★" ? null : "★")}>★ Favourites</Pill> : null}
        {tags.map(t => <Pill key={t} on={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</Pill>)}
      </div>
      <div className="scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 130 }}>
        {shown.length ? <div className="dvgrid">{shown.map(m => {
          const s = stats[m.id];
          return (
            <button key={m.id} className="dvcard" onClick={() => setDview({ v: "meal", id: m.id })}>
              <FoodIcon name={m.name} size={P ? 56 : 68} />
              <span className="dvct"><b>{m.name}{m.favourite ? <i className="dvstar" aria-label="Favourite">★</i> : null}</b>
                <small>{metaLine(m) || "Tap to add the ingredients"}</small>
                {s?.last ? <small className="dvlast">Had {ago(s.last, now)}{s.count > 1 ? ` · ${s.count} times` : ""}</small> : null}</span>
              <Chev />
            </button>
          );
        })}</div> : (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{meals.length ? "No dinners match" : "No dinners yet"}</div>
            <div style={{ fontSize: 18, color: "#6b7488", marginTop: 6 }}>{meals.length ? "Try a different word, or clear the filter." : "Add your favourites with + New and they turn up here."}</div>
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
  const [notes, setNotes] = useState(m?.notes || ""), [link, setLink] = useState(m?.link || ""), [tag, setTag] = useState(""), [sure, setSure] = useState(false), [name, setName] = useState(m?.name || ""), [renaming, setRenaming] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => { if (m) { setNotes(m.notes || ""); setLink(m.link || ""); setName(m.name); } }, [m?.id]);
  if (!m) return (
    <div style={wrap(P)}><Top back="Dinner ideas" to={{ v: "ideas" }} title="Dinner" /><p style={{ fontSize: 20, color: "#6b7488", padding: 8 }}>That dinner has gone. Go back to the list to pick another.</p></div>
  );
  const s = stats[m.id], ings = m.ingredients || [], pantry = din?.pantry || [];
  const stocked = (i: Ingredient) => pantry.some(p => p.name.toLowerCase() === i.name.toLowerCase() && !p.low);
  const buy = ings.filter(i => !i.staple && !stocked(i));
  const factor = m.serves ? cookFor / m.serves : 1;
  const clash = clashText(dietClash(m, people.filter(p => (p.diet || []).length)));
  const run = async (f: () => Promise<unknown>) => { try { await f(); await qc.invalidateQueries({ queryKey: ["dinners"] }); } catch (e: any) { soon(e.message); } };
  const shop = async () => { try { await addToList(buy, m.name, factor); setMsg(`${buy.length} on the shopping list${ings.length > buy.length ? `. ${ings.length - buy.length} you already have ${ings.length - buy.length === 1 ? "was" : "were"} left off.` : "."}`); } catch (e: any) { soon(e.message); } };
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
        <div className="fx" style={{ gap: 10, flexWrap: "wrap", margin: "4px 0 6px" }}>
          <button className="cbtn accent" style={{ padding: "0 22px" }} onClick={() => openSheet({ mode: "planmeal", meal: m.id })}>Plan it</button>
          {ings.length || m.notes ? <button className="cbtn" style={{ padding: "0 22px", background: "#101828", color: "#fff" }} onClick={() => setDview({ v: "cook", id: m.id })}>Cook it</button> : null}
          {buy.length ? <button className="cbtn" style={{ padding: "0 22px", background: "#fff", color: "#101828", border: "1.5px solid #d5dbe6" }} onClick={shop}>Add to shopping list</button> : null}
          {msg ? <button className="dvlink" onClick={() => go("shopping")}>{msg} Open the list</button> : null}
        </div>

        {clash ? <p className="dwarn" style={{ fontSize: 17, margin: "10px 4px 0" }}>⚠ {clash}. Check the ingredients, then mark which diets it suits below.</p> : null}
        <h3 className="dvh">Ingredients{ings.length ? <small>{ings.length}</small> : null}</h3>
        {ings.length && m.serves ? (
          <div className="fx dvrow" style={{ borderTop: 0, paddingTop: 0 }}><span>Cooking for</span>
            <div className="fx" style={{ gap: 12 }}>
              <button className="cnav" aria-label="Fewer" onClick={() => setCookFor(Math.max(1, cookFor - 1))}>−</button>
              <span className="num" style={{ minWidth: 40, textAlign: "center", fontSize: 26, fontWeight: 700 }}>{cookFor}</span>
              <button className="cnav" aria-label="More" onClick={() => setCookFor(Math.min(50, cookFor + 1))}>+</button>
            </div>
          </div>
        ) : null}
        {ings.length ? ings.map(i => (
          <button key={i.id} className="dving" onClick={() => openSheet({ mode: "ingredient", meal: m.id, ing: i.id })}>
            <Thumb src={i.product?.image} letter={i.product?.brand || i.name} />
            <span className="dvit"><b>{i.name}{i.amount ? <em>{scaleAmount(i.amount, factor)}</em> : null}</b>
              <small>{i.product ? productLine(i.product) : "Any brand"}{i.alt ? ` · or ${i.alt.brand || i.alt.name}` : ""}{i.staple ? " · pantry staple" : stocked(i) ? " · in the pantry" : ""}</small></span>
            <Chev />
          </button>
        )) : <p className="dvnone">No ingredients yet. Add what this dinner needs and you can send them to the shopping list.</p>}
        <button className="dvadd" onClick={() => openSheet({ mode: "ingredient", meal: m.id, ing: null })}>+ Add an ingredient</button>

        <h3 className="dvh">About</h3>
        <div className="fx dvrow"><span>Serves</span>
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
                  <i className="av" style={{ width: 30, height: 30, fontSize: 15, background: p.color }}>{p.name[0].toUpperCase()}</i>{p.name} {r > 0 ? "👍" : r < 0 ? "👎" : ""}
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
            {m.link ? <a className="cbtn" style={{ flex: "none", padding: "0 20px", display: "inline-flex", alignItems: "center", textDecoration: "none", color: "#101828", background: "#fff", border: "1.5px solid #d5dbe6" }} href={m.link} target="_blank" rel="noreferrer">Open</a> : null}
          </div>
        </div>
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
  const pantry = din?.pantry || [], low = pantry.filter(p => p.low);
  const stocked = (i: Ingredient) => pantry.some(p => p.name.toLowerCase() === i.name.toLowerCase() && !p.low);
  const groups = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter(d => d >= startOfDay(now)).map(d => ({ d, m: din?.meals.find(x => x.id === din.plan[ymd(d)]?.meal) })).filter(g => g.m && (g.m.ingredients || []).length);
  const [off, setOff] = useState<string[] | null>(null), [done, setDone] = useState<number | null>(null), [forN, setForN] = useState<Record<string, number>>({});
  const key = (d: Date, i: Ingredient) => ymd(d) + i.id;
  const target = (d: Date, m: Meal) => forN[ymd(d)] ?? cookingFor(din, people, ymd(d), m);
  const factor = (d: Date, m: Meal) => m.serves ? target(d, m) / m.serves : 1;
  const unneeded = useMemo(() => groups.flatMap(g => g.m!.ingredients!.filter(i => i.staple || stocked(i)).map(i => key(g.d, i))), [din, ymd(w)]);
  const skipped = off ?? unneeded;
  const picked = groups.flatMap(g => g.m!.ingredients!.filter(i => !skipped.includes(key(g.d, i))).map(i => ({ i, from: g.m!.name, f: factor(g.d, g.m!) })));
  const lows = low.filter(l => !skipped.includes("low:" + l.name));
  const toggle = (k: string) => setOff(skipped.includes(k) ? skipped.filter(x => x !== k) : [...skipped, k]);
  const total = picked.length + lows.length;
  const add = async () => {
    try {
      const by: Record<string, { i: Ingredient; f: number }[]> = {};
      picked.forEach(p => (by[p.from] ||= []).push(p));
      for (const [from, items] of Object.entries(by)) for (const f of [...new Set(items.map(x => x.f))]) await addToList(items.filter(x => x.f === f).map(x => x.i), from, f);
      if (lows.length) await addToList(lows.map(l => ({ id: "", name: l.name, amount: "", product: null, staple: false })), "Running low");
      setDone(total);
    } catch (e: any) { soon(e.message); }
  };
  return (
    <div style={wrap(P)}>
      <Top back="Dinners" to={{ v: "home" }} title="Shop for the week" />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 130 }}>
        {done !== null ? (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <div className="dvdone"><Check /></div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.02em", marginTop: 14 }}>{done} {done === 1 ? "thing" : "things"} on the shopping list</div>
            <div className="fx" style={{ gap: 10, justifyContent: "center", marginTop: 18 }}><button className="primary" onClick={() => go("shopping")}>Open the list</button><button onClick={() => setDview({ v: "home" })}>Back to dinners</button></div>
          </div>
        ) : groups.length || low.length ? (
          <>
            <p style={{ fontSize: 18, color: "var(--soft)", margin: "0 4px 6px" }}>Everything the planned dinners need, for the people who are home. Pantry staples and things you already have start unticked.</p>
            {groups.map(g => (
              <section key={+g.d} className="dvshop">
                <div className="fx" style={{ gap: 12, padding: "12px 4px 6px" }}><FoodIcon name={g.m!.name} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 21 }}>{g.m!.name}</b><div style={{ fontSize: 15, color: "#6b7488", fontWeight: 600 }}>{g.d.toLocaleDateString([], { weekday: "long" })}</div></div>
                  {g.m!.serves ? <div className="fx" style={{ gap: 8, flex: "none" }} aria-label="Cooking for">
                    <button className="cnav" style={{ width: 48, height: 48 }} aria-label="Fewer" onClick={() => setForN({ ...forN, [ymd(g.d)]: Math.max(1, target(g.d, g.m!) - 1) })}>−</button>
                    <span style={{ fontSize: 17, fontWeight: 700, minWidth: 54, textAlign: "center" }}>for {target(g.d, g.m!)}</span>
                    <button className="cnav" style={{ width: 48, height: 48 }} aria-label="More" onClick={() => setForN({ ...forN, [ymd(g.d)]: Math.min(50, target(g.d, g.m!) + 1) })}>+</button>
                  </div> : null}
                </div>
                {g.m!.ingredients!.map(i => { const k = key(g.d, i), on = !skipped.includes(k); return (
                  <div className={"srow" + (on ? "" : " off")} key={k}>
                    <button className="stk" aria-pressed={on} onClick={() => toggle(k)}><span className="chk" aria-hidden style={on ? { background: "#101828", borderColor: "#101828" } : undefined}>{on ? <Check /> : null}</span>
                      <span className="sn" style={{ textDecoration: "none" }}>{i.name}<small className="snote">{[scaleAmount(i.amount, factor(g.d, g.m!)), i.product ? productLine(i.product) : ""].filter(Boolean).join(" · ")}{i.staple ? " · staple" : stocked(i) ? " · in the pantry" : ""}</small></span></button>
                  </div>
                ); })}
              </section>
            ))}
            {low.length ? (
              <section className="dvshop">
                <div className="fx" style={{ gap: 12, padding: "12px 4px 6px" }}><b style={{ fontSize: 21 }}>Running low at home</b></div>
                {low.map(l => { const k = "low:" + l.name, on = !skipped.includes(k); return (
                  <div className={"srow" + (on ? "" : " off")} key={k}><button className="stk" aria-pressed={on} onClick={() => toggle(k)}><span className="chk" aria-hidden style={on ? { background: "#101828", borderColor: "#101828" } : undefined}>{on ? <Check /> : null}</span><span className="sn" style={{ textDecoration: "none" }}>{l.name}</span></button></div>
                ); })}
              </section>
            ) : null}
          </>
        ) : (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700 }}>Nothing to shop for yet</div>
            <div style={{ fontSize: 18, color: "#6b7488", marginTop: 6 }}>Plan some dinners that have ingredients, and they appear here.</div>
          </div>
        )}
      </div>
      {done === null && (groups.length || low.length) ? <div className="dvbar"><button className="primary" disabled={!total} onClick={add}>Add {total} to the shopping list</button></div> : null}
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
          <button className="dvadd" onClick={() => startScan("product")}>📷 Scan a barcode</button>
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
          ) : !find ? <div className="fx" style={{ gap: 10 }}><button className="dvadd" onClick={() => startScan("alt")}>📷 Scan one</button><button className="dvadd" onClick={() => { setTarget("alt"); setFind(true); setQ(name || q); }}>Look one up</button></div> : null}
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
