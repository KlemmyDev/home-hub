import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO, post } from "../lib/api";
import { addDays, fromYmd, longDay, nowZ, sameDay, startOfDay, weekStart, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR, XIcon } from "../lib/icons";
import { dinnerFor, useDinners, type Dinners, type Ingredient, type Meal, type Product } from "../data";
import { useHub } from "../hub";
import { useNav } from "../nav";
import { FoodIcon } from "../lib/foodicons";
import { PanelTop, wrap } from "./Panels";
import { Pill, SheetFrame } from "./SheetFrame";

/* ---------- what the dinners know about themselves ---------- */

type Stat = { count: number; last: string | null; next: string | null };
/** How often each dinner has been had, when it was last, and when it is next planned, from the plan. */
function useStats(din: Dinners | undefined, today: Date): Record<string, Stat> {
  return useMemo(() => {
    const out: Record<string, Stat> = {}, t = ymd(today);
    for (const [date, p] of Object.entries(din?.plan || {}).sort(([a], [b]) => a.localeCompare(b))) {
      const s = (out[p.meal] ||= { count: 0, last: null, next: null });
      if (date < t) { s.count++; s.last = date; } else if (!s.next) s.next = date;
    }
    return out;
  }, [din, ymd(today)]);
}
const ago = (date: string, now: Date) => { const d = Math.round((+startOfDay(now) - +fromYmd(date)) / 864e5); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`; };
const dayName = (date: string, now: Date) => { const d = fromYmd(date), n = Math.round((+d - +startOfDay(now)) / 864e5); return n === 0 ? "tonight" : n === 1 ? "tomorrow" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }); };
const productLine = (p: Product) => [p.brand, p.name, p.quantity].filter(Boolean).join(" · ");
const metaLine = (m: Meal) => [m.ingredients?.length ? `${m.ingredients.length} ingredient${m.ingredients.length === 1 ? "" : "s"}` : "", m.serves ? `serves ${m.serves}` : "", m.minutes ? `${m.minutes} min` : ""].filter(Boolean).join(" · ");

/** Saves a dinner's details (ingredients, notes and the rest). It shows at once, and is put back if the hub says no. */
export function useMealSave() {
  const qc = useQueryClient();
  const { soon } = useHub();
  return async (m: Meal, patch: Partial<Meal>) => {
    const next = { ...m, ...patch };
    qc.setQueryData<Dinners>(["dinners"], old => old && { ...old, meals: old.meals.map(x => x.id === m.id ? next : x) });
    try {
      await post("/api/meal/details", { id: m.id, ingredients: next.ingredients || [], notes: next.notes || "", link: next.link || "", serves: next.serves || 0, minutes: next.minutes || 0, tags: next.tags || [], favourite: !!next.favourite });
      qc.invalidateQueries({ queryKey: ["dinners"] });
    } catch (e: any) { qc.invalidateQueries({ queryKey: ["dinners"] }); soon(e.message || "Couldn't save that."); }
  };
}

/** Puts ingredients on the shopping list with what exactly to get. */
async function addToList(items: Ingredient[], from: string) {
  await post("/api/shopping/add-many", { from, items: items.map(i => ({ name: i.name, note: [i.amount, i.product ? productLine(i.product) : ""].filter(Boolean).join(" · "), barcode: i.product?.code || "" })) });
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
      {dview.v === "ideas" ? <Ideas din={din} /> : dview.v === "meal" ? <MealPage din={din} id={dview.id} /> : dview.v === "shop" ? <ShopWeek din={din} /> : <Week din={din} />}
    </div>
  );
}

/** A back button and a title, along the top of the pages inside Dinners. */
function Top({ back, to, title, right }: { back: string; to: Parameters<ReturnType<typeof useHub>["setDview"]>[0]; title: string; right?: React.ReactNode }) {
  const { dim, setDview } = useHub();
  const P = dim.phone;
  return (
    <div className="fx dvtop" style={{ gap: 12, padding: "0 4px 14px" }}>
      <button className="dvback" aria-label={"Back to " + back} onClick={() => setDview(to)}><ChevL /><span>{back}</span></button>
      <div style={{ flex: 1, minWidth: 0, fontSize: P ? 24 : 30, fontWeight: 700, letterSpacing: "-.04em", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      <div className="fx" style={{ gap: 8, flex: "none", minWidth: P ? 52 : 120, justifyContent: "flex-end" }}>{right}</div>
    </div>
  );
}

/* ----- the week, as before: the simple page you land on ----- */
function Week({ din }: { din: Dinners | undefined }) {
  const { dim, now, people, menuWeek, setMenuWeek, openSheet, setDview } = useHub();
  const P = dim.phone;
  const w = weekStart(startOfDay(menuWeek)), b = addDays(w, 6), m = (x: Date) => x.toLocaleDateString([], { month: P ? "short" : "long" });
  const title = w.getMonth() === b.getMonth() ? `${w.getDate()} to ${b.getDate()} ${m(b)}` : `${w.getDate()} ${m(w)} to ${b.getDate()} ${m(b)}`;
  const thisWeek = sameDay(w, weekStart(now));
  let planned = 0, withIng = 0;
  const rows = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(w, i), today = sameDay(day, now), t = dinnerFor(din, people, day), past = day < startOfDay(now);
    const meal = din?.meals.find(x => x.id === din.plan[ymd(day)]?.meal), n = meal?.ingredients?.length || 0;
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
            {t.cook ? <span className="dcook"><i className="av" style={{ width: 22, height: 22, fontSize: 12, background: t.cookColor || "#8a93a6" }}>{t.cook[0].toUpperCase()}</i>{t.cook} cooking{n ? ` · ${n} ingredients` : ""}</span> : n ? <span className="dcook">{n} ingredients</span> : null}
          </> : <span className="dempty">{past ? "No dinner planned" : "Tap to choose a dinner"}</span>}
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
          <input value={text} onChange={e => setText(e.target.value)} maxLength={40} placeholder="Spaghetti Bolognese, Tacos…" aria-label="New dinner" autoComplete="off" autoFocus enterKeyHint="done" />
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
  const { dim, now, setDview, openSheet, soon } = useHub();
  const { go } = useNav();
  const qc = useQueryClient();
  const save = useMealSave();
  const P = dim.phone, stats = useStats(din, now);
  const m = din?.meals.find(x => x.id === id);
  const [notes, setNotes] = useState(m?.notes || ""), [link, setLink] = useState(m?.link || ""), [tag, setTag] = useState(""), [sure, setSure] = useState(false), [name, setName] = useState(m?.name || ""), [renaming, setRenaming] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => { if (m) { setNotes(m.notes || ""); setLink(m.link || ""); setName(m.name); } }, [m?.id]);
  if (!m) return (
    <div style={wrap(P)}><Top back="Dinner ideas" to={{ v: "ideas" }} title="Dinner" /><p style={{ fontSize: 20, color: "#6b7488", padding: 8 }}>That dinner has gone. Go back to the list to pick another.</p></div>
  );
  const s = stats[m.id], ings = m.ingredients || [], buy = ings.filter(i => !i.staple);
  const run = async (f: () => Promise<unknown>) => { try { await f(); await qc.invalidateQueries({ queryKey: ["dinners"] }); } catch (e: any) { soon(e.message); } };
  const shop = async () => { try { await addToList(buy, m.name); setMsg(`${buy.length} on the shopping list${ings.length > buy.length ? `. ${ings.length - buy.length} pantry ${ings.length - buy.length === 1 ? "staple was" : "staples were"} left off.` : "."}`); } catch (e: any) { soon(e.message); } };
  return (
    <div style={wrap(P)}>
      <Top back="Dinner ideas" to={{ v: "ideas" }} title={m.name} right={<button className={"dvfav" + (m.favourite ? " on" : "")} aria-pressed={!!m.favourite} aria-label="Favourite" onClick={() => save(m, { favourite: !m.favourite })}>★</button>} />
      <div className="scroll dvbody" style={{ flex: 1, minHeight: 0, paddingBottom: 150 }}>
        <section className="dvhero">
          <FoodIcon name={m.name} size={P ? 84 : 104} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {renaming ? (
              <form className="qadd" onSubmit={e => { e.preventDefault(); run(async () => { await post("/api/meal", { id: m.id, name }); setRenaming(false); }); }}>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={40} aria-label="Dinner name" autoFocus /><button className="primary" type="submit" disabled={!name.trim()}>Save</button>
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
          {buy.length ? <button className="cbtn" style={{ padding: "0 22px", background: "#fff", color: "#101828", border: "1.5px solid #d5dbe6" }} onClick={shop}>Add to shopping list</button> : null}
          {msg ? <button className="dvlink" onClick={() => go("shopping")}>{msg} Open the list</button> : null}
        </div>

        <h3 className="dvh">Ingredients{ings.length ? <small>{ings.length}</small> : null}</h3>
        {ings.length ? ings.map(i => (
          <button key={i.id} className="dving" onClick={() => openSheet({ mode: "ingredient", meal: m.id, ing: i.id })}>
            <Thumb src={i.product?.image} letter={i.product?.brand || i.name} />
            <span className="dvit"><b>{i.name}{i.amount ? <em>{i.amount}</em> : null}</b>
              <small>{i.product ? productLine(i.product) : "Any brand"}{i.staple ? " · pantry staple" : ""}</small></span>
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
  const { dim, now, menuWeek, setDview, soon } = useHub();
  const { go } = useNav();
  const P = dim.phone;
  const w = weekStart(startOfDay(menuWeek));
  const groups = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter(d => d >= startOfDay(now)).map(d => ({ d, m: din?.meals.find(x => x.id === din.plan[ymd(d)]?.meal) })).filter(g => g.m && (g.m.ingredients || []).length);
  const [off, setOff] = useState<string[] | null>(null), [done, setDone] = useState<number | null>(null);
  const key = (d: Date, i: Ingredient) => ymd(d) + i.id;
  const staples = useMemo(() => groups.flatMap(g => g.m!.ingredients!.filter(i => i.staple).map(i => key(g.d, i))), [din, ymd(w)]);
  const skipped = off ?? staples;
  const picked = groups.flatMap(g => g.m!.ingredients!.filter(i => !skipped.includes(key(g.d, i))).map(i => ({ i, from: g.m!.name })));
  const toggle = (k: string) => setOff(skipped.includes(k) ? skipped.filter(x => x !== k) : [...skipped, k]);
  const add = async () => {
    try {
      const by: Record<string, Ingredient[]> = {};
      picked.forEach(p => (by[p.from] ||= []).push(p.i));
      for (const [from, items] of Object.entries(by)) await addToList(items, from);
      setDone(picked.length);
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
        ) : groups.length ? (
          <>
            <p style={{ fontSize: 18, color: "var(--soft)", margin: "0 4px 6px" }}>Everything the planned dinners need. Pantry staples start unticked, since you usually have them.</p>
            {groups.map(g => (
              <section key={+g.d} className="dvshop">
                <div className="fx" style={{ gap: 12, padding: "12px 4px 6px" }}><FoodIcon name={g.m!.name} size={44} /><div><b style={{ fontSize: 21 }}>{g.m!.name}</b><div style={{ fontSize: 15, color: "#6b7488", fontWeight: 600 }}>{g.d.toLocaleDateString([], { weekday: "long" })}</div></div></div>
                {g.m!.ingredients!.map(i => { const k = key(g.d, i), on = !skipped.includes(k); return (
                  <div className={"srow" + (on ? "" : " off")} key={k}>
                    <button className="stk" aria-pressed={on} onClick={() => toggle(k)}><span className="chk" aria-hidden style={on ? { background: "#101828", borderColor: "#101828" } : undefined}>{on ? <Check /> : null}</span>
                      <span className="sn" style={{ textDecoration: "none" }}>{i.name}<small className="snote">{[i.amount, i.product ? productLine(i.product) : ""].filter(Boolean).join(" · ")}{i.staple ? " · staple" : ""}</small></span></button>
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
      {done === null && groups.length ? <div className="dvbar"><button className="primary" disabled={!picked.length} onClick={add}>Add {picked.length} to the shopping list</button></div> : null}
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
  const [find, setFind] = useState(false), [q, setQ] = useState(cur?.name || ""), [qd, setQd] = useState("");
  useEffect(() => { const t = setTimeout(() => setQd(q.trim()), 600); return () => clearTimeout(t); }, [q]);
  const res = useQuery({ queryKey: ["products", qd], enabled: find && qd.length >= 2, staleTime: 600000, retry: false, queryFn: () => api<Product[]>("/api/products/search?q=" + encodeURIComponent(qd)) });
  if (!m) return <SheetFrame title="Ingredient" body={<p>That dinner has gone.</p>} foot={<button className="primary" style={{ marginLeft: "auto" }} onClick={closeSheet}>Close</button>} />;
  const go = async () => {
    if (!name.trim()) return soon("Say what it is first.");
    const next: Ingredient = { id: cur?.id || "", name: name.trim(), amount: amount.trim(), product, staple };
    await save(m, { ingredients: cur ? m.ingredients!.map(x => x.id === cur.id ? next : x) : [...(m.ingredients || []), next] });
    closeSheet();
  };
  const body = (
    <>
      <div className="cap" style={{ margin: "14px 0 8px" }}>What is it?</div>
      <input value={name} onChange={e => { setName(e.target.value); if (!find) setQ(e.target.value); }} maxLength={50} placeholder="Pasta, mince, tomatoes…" aria-label="Ingredient" autoComplete="off" autoFocus={!cur} style={{ fontSize: 26, fontWeight: 700, minHeight: 72 }} />
      {!cur ? <div className="fx" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>{COMMON.filter(c => !name || c.toLowerCase().includes(name.toLowerCase())).slice(0, 10).map(c => <Pill key={c} onClick={() => { setName(c); setQ(c); }}>{c}</Pill>)}</div> : null}
      <div className="cap" style={{ margin: "24px 0 8px" }}>How much?</div>
      <input value={amount} onChange={e => setAmount(e.target.value)} maxLength={30} placeholder="500 g, 2, 1 tin…" aria-label="Amount" autoComplete="off" />
      <div className="fx" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>{AMOUNTS.map(a => <Pill key={a} on={amount === a} onClick={() => setAmount(a)}>{a}</Pill>)}</div>
      <div className="fx dvrow" style={{ marginTop: 18 }}><span>A pantry staple<small>Usually in the cupboard, so it isn't added to the shopping list without asking</small></span>
        <button className={"sw2" + (staple ? " on" : "")} role="switch" aria-checked={staple} aria-label="Pantry staple" onClick={() => setStaple(!staple)}><i /></button></div>

      <div className="cap" style={{ margin: "24px 0 8px" }}>The exact product</div>
      {product ? (
        <div className="dvprod on">
          <Thumb big src={product.image} letter={product.brand || product.name} />
          <span className="dvit"><b>{product.brand || product.name}</b><small>{[product.brand ? product.name : "", product.quantity].filter(Boolean).join(" · ")}</small><small className="dvcode">Barcode {product.code}</small></span>
          <button className="cnav" aria-label="Use any brand instead" onClick={() => setProduct(null)}><XIcon /></button>
        </div>
      ) : !find ? (
        <button className="dvadd" onClick={() => { setFind(true); setQ(name || q); }}>Look up a brand and size</button>
      ) : null}
      {find && !product ? (
        <div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or type a barcode" aria-label="Search products" autoComplete="off" enterKeyHint="search" />
          {res.isFetching ? <p className="dvnone">Looking…</p> : res.isError ? <p className="dvnone">{(res.error as Error).message || "Couldn't look that up."} You can still save it as any brand.</p>
            : res.data && !res.data.length ? <p className="dvnone">Nothing found. Try the brand name or the barcode, or save it as any brand.</p> : null}
          {(res.data || []).map(p => (
            <button key={p.code} className="dvprod" onClick={() => { setProduct(p); if (!name.trim()) setName(p.name); }}>
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
