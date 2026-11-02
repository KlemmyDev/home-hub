import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { XIcon } from "../lib/icons";
import { NO_PANTRY, stockLevel, usePantry, useDinners, useShopping, type PantryData, type PItem, type Product } from "../data";
import { useHub } from "../hub";
import { SHEET_MS, useAutoFocus } from "../lib/focus";
import { MAIN_UNITS, STARTERS, UNITS, fmtQty, guessUnit, stepFor } from "../lib/units";
import { planUse } from "../lib/pantrylib";
import { Pill, SheetFrame } from "./SheetFrame";
import { Scanner, scanProblem } from "./Scanner";

/** A number with big minus and plus buttons, and a box to type it in. */
function Stepper({ value, onChange, step, label, unit }: { value: number; onChange: (n: number) => void; step: number; label: string; unit: string }) {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => setTxt(String(Math.round(value * 1000) / 1000)), [value]);
  const set = (n: number) => onChange(Math.max(0, Math.min(100000, Math.round(n * 1000) / 1000)));
  return (
    <div className="fx" style={{ gap: 10 }}>
      <button className="cnav" aria-label={`Less ${label}`} onClick={() => set(value - step)}>−</button>
      <input value={txt} inputMode="decimal" aria-label={label} onChange={e => { setTxt(e.target.value); const n = parseFloat(e.target.value.replace(",", ".")); if (Number.isFinite(n)) onChange(Math.max(0, Math.min(100000, n))); }} onBlur={() => setTxt(String(value))} style={{ width: 130, textAlign: "center", fontSize: 26, fontWeight: 700 }} />
      <button className="cnav" aria-label={`More ${label}`} onClick={() => set(value + step)}>+</button>
      <span style={{ fontSize: 20, fontWeight: 650, color: "#5a6478" }}>{unit}</span>
    </div>
  );
}

/** Scan a barcode, or search by name, to say exactly which product it is. */
function ProductPick({ name, value, onPick }: { name: string; value: Product | null; onPick: (p: Product | null) => void }) {
  const [scan, setScan] = useState(false), [find, setFind] = useState(false), [q, setQ] = useState(name), [qd, setQd] = useState(""), [msg, setMsg] = useState("");
  useEffect(() => { const t = setTimeout(() => setQd(q.trim()), 600); return () => clearTimeout(t); }, [q]);
  const res = useQuery({ queryKey: ["products", qd], enabled: find && qd.length >= 2, staleTime: 600000, retry: false, queryFn: () => api<Product[]>("/api/products/search?q=" + encodeURIComponent(qd)) });
  const got = async (code: string) => {
    setScan(false);
    try { const r = await api<Product[]>("/api/products/search?q=" + code); const hit = r.find(p => p.code === code); onPick(hit || { code, name: name || "Scanned product", brand: "", quantity: "", image: "" }); setMsg(hit ? "" : "That barcode isn't in the shared list. It's kept anyway."); }
    catch { onPick({ code, name: name || "Scanned product", brand: "", quantity: "", image: "" }); }
  };
  if (value) return (
    <div className="dvprod on">
      <span className="dvthumb big">{value.image ? <img src={value.image} alt="" referrerPolicy="no-referrer" /> : <b>{(value.brand || value.name)[0]}</b>}</span>
      <span className="dvit"><b>{value.brand || value.name}</b><small>{[value.brand ? value.name : "", value.quantity].filter(Boolean).join(" · ")}</small><small className="dvcode">Barcode {value.code}</small></span>
      <button className="cnav" aria-label="Forget this product" onClick={() => onPick(null)}><XIcon /></button>
    </div>
  );
  return (
    <>
      {scan ? <Scanner onCode={got} onClose={() => setScan(false)} /> : null}
      <div className="fx" style={{ gap: 10 }}>
        <button className="dvadd" onClick={() => { const why = scanProblem(); if (why) { setMsg(why); setFind(true); } else { setMsg(""); setScan(true); } }}>📷 Scan a barcode</button>
        <button className="dvadd" onClick={() => setFind(true)}>Look up a brand</button>
      </div>
      {msg ? <p className="dvnone">{msg}</p> : null}
      {find ? (
        <div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or type a barcode" aria-label="Search products" autoComplete="off" enterKeyHint="search" style={{ marginTop: 10 }} />
          {res.isFetching ? <p className="dvnone">Looking…</p> : res.isError ? <p className="dvnone">{(res.error as Error).message || "Couldn't look that up."}</p> : res.data && !res.data.length ? <p className="dvnone">Nothing found.</p> : null}
          {(res.data || []).map(p => (
            <button key={p.code} className="dvprod" onClick={() => { onPick(p); setFind(false); }}>
              <span className="dvthumb big">{p.image ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <b>{(p.brand || p.name)[0]}</b>}</span>
              <span className="dvit"><b>{p.brand || p.name}</b><small>{[p.brand ? p.name : "", p.quantity].filter(Boolean).join(" · ")}</small></span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

/** One thing in the pantry. Adding is quick: a name, how much and the least to keep; the shop is one tap; the rest is under "More". */
export function PantryItemSheet({ id, name: startName }: { id: string | null; name?: string }) {
  const { closeSheet, soon } = useHub();
  const qc = useQueryClient();
  const { data: pan = NO_PANTRY } = usePantry();
  const cur = pan.items.find(i => i.id === id);
  const blank = (store = "", unit = "each"): PItem => ({ id: "", name: startName || "", qty: 0, unit, min: 0, want: 0, store, auto: true, product: null, note: "" });
  const [t, setT] = useState<PItem>(() => cur || { ...blank(), unit: startName ? guessUnit(startName) : "each" });
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [units, setUnits] = useState(false), [scan, setScan] = useState(false), [scanMsg, setScanMsg] = useState("");
  const [more, setMore] = useState(() => !!cur && (cur.want > 0 || !cur.auto || !!cur.product));
  const touchedUnit = useRef(!!cur);
  const nameRef = useRef<HTMLInputElement>(null);
  useAutoFocus(nameRef, SHEET_MS, !cur);
  const set = (p: Partial<PItem>) => { setErr(""); setT(x => ({ ...x, ...p })); };
  const rename = (name: string) => set({ name, ...(touchedUnit.current ? {} : { unit: guessUnit(name) }) });
  const step = stepFor(t.unit);
  const level = stockLevel(t);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); };
  const valid = () => { if (!t.name.trim()) { setErr("Say what it is first."); nameRef.current?.focus({ preventScroll: true }); return false; } return true; };
  const save = async (another: boolean) => {
    if (!valid()) return;
    setBusy(true);
    try {
      await post("/api/pantry/item", { ...t, name: t.name.trim() });
      refresh();
      if (another) { soon(`${t.name.trim()} added.`); touchedUnit.current = false; setT(blank(t.store)); setMore(false); setBusy(false); setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 50); }
      else closeSheet();
    } catch (e: any) { setErr(e.message || "Couldn't save that."); setBusy(false); }
  };
  const found = (p: Product | null) => set({ product: p, ...(p && !t.name.trim() ? { name: p.name, unit: touchedUnit.current ? t.unit : guessUnit(p.name) } : {}) });
  const taken = new Set(pan.items.map(i => i.name.toLowerCase()));
  const starters = STARTERS.filter(n => !taken.has(n.toLowerCase()) && (!t.name.trim() || n.toLowerCase().includes(t.name.trim().toLowerCase()))).slice(0, 12);
  const body = (
    <>
      <div className="fx" style={{ gap: 10, marginTop: 14 }}>
        <input ref={nameRef} value={t.name} onChange={e => rename(e.target.value)} maxLength={50} placeholder="What is it?" aria-label="Name" autoComplete="off" enterKeyHint="done" style={{ flex: 1, minWidth: 0, fontSize: 26, fontWeight: 700, minHeight: 72 }} />
        {!cur ? <button className="ptscan" aria-label="Scan a barcode" onClick={() => { const why = scanProblem(); if (why) { setScanMsg(why); } else { setScanMsg(""); setScan(true); } }}>📷</button> : null}
      </div>
      {scan ? <Scanner onClose={() => setScan(false)} onCode={async code => { setScan(false); try { const r = await api<Product[]>("/api/products/search?q=" + code); found(r.find(p => p.code === code) || { code, name: t.name || "Scanned product", brand: "", quantity: "", image: "" }); } catch { found({ code, name: t.name || "Scanned product", brand: "", quantity: "", image: "" }); } }} /> : null}
      {scanMsg ? <p className="dvnone">{scanMsg}</p> : null}
      {t.product ? <p className="ptprod">📷 {[t.product.brand, t.product.name, t.product.quantity].filter(Boolean).join(" · ")}</p> : null}
      {!cur && starters.length ? <div className="fx" style={{ gap: 8, flexWrap: "wrap", margin: "10px 0 0" }}>{starters.map(n => <Pill key={n} onClick={() => rename(n)}>{n}</Pill>)}</div> : null}

      <div className="cap" style={{ margin: "26px 0 8px" }}>How much have you got?</div>
      <Stepper value={t.qty} onChange={n => set({ qty: n })} step={step} label="amount" unit={t.unit} />
      <div className="fx" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {(units ? UNITS : MAIN_UNITS.concat(UNITS.includes(t.unit) && !MAIN_UNITS.includes(t.unit) ? [t.unit] : [])).map(u => <Pill key={u} on={t.unit.toLowerCase() === u.toLowerCase()} onClick={() => { touchedUnit.current = true; set({ unit: u }); }}>{u}</Pill>)}
        {!units ? <Pill onClick={() => setUnits(true)}>More…</Pill> : null}
      </div>

      <div className="cap" style={{ margin: "24px 0 8px" }}>Add it to the shopping list when there's less than</div>
      <Stepper value={t.min} onChange={n => set({ min: n })} step={step} label="minimum" unit={t.unit} />
      <p className={"ptstate " + (t.min > 0 ? level : "")}>{t.min <= 0 ? "Leave this at 0 and it won't be added by itself." : level === "out" ? "None left, so it goes on the list." : level === "low" ? "That's under the minimum, so it goes on the list." : "That's fine."}</p>

      {pan.stores.length ? (
        <>
          <div className="cap" style={{ margin: "20px 0 8px" }}>Where do you buy it?</div>
          <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
            <Pill on={!t.store} onClick={() => set({ store: "" })}>Anywhere</Pill>
            {pan.stores.map(s => <button key={s.id} className={"pill" + (t.store === s.id ? " on" : "")} style={{ gap: 8 }} onClick={() => set({ store: s.id })}><i className="ptdot" style={{ background: s.color }} />{s.name}</button>)}
          </div>
        </>
      ) : null}

      <button className="ptmore" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Fewer options" : "More options"}<span aria-hidden>{more ? "▴" : "▾"}</span></button>
      {more ? (
        <div className="ptmorebox">
          <div className="cap" style={{ margin: "4px 0 8px" }}>Top up to (how much to have after a shop)</div>
          <Stepper value={t.want} onChange={n => set({ want: n })} step={step} label="top-up level" unit={t.unit} />
          <p style={{ margin: "8px 2px 0", fontSize: 16, color: "var(--soft)" }}>Leave it at 0 and it tops up to twice the minimum.</p>
          <div className="fx dvrow" style={{ marginTop: 16 }}><span>Use it up when I cook<small>Turn this off for herbs and spices, which a dinner never uses up.</small></span>
            <button className={"sw2" + (t.auto ? " on" : "")} role="switch" aria-checked={t.auto} aria-label="Use it up when I cook" onClick={() => set({ auto: !t.auto })}><i /></button></div>
          <div className="cap" style={{ margin: "16px 0 8px" }}>The exact product</div>
          <ProductPick name={t.name} value={t.product} onPick={found} />
        </div>
      ) : null}
    </>
  );
  const foot = cur ? (
    <>
      <button className="danger-o" disabled={busy} onClick={async () => { setBusy(true); try { await post("/api/pantry/item/delete", { id: cur.id }); refresh(); closeSheet(); } catch (e: any) { setErr(e.message); setBusy(false); } }}>Remove</button>
      <button disabled={busy} onClick={async () => { try { await post("/api/shopping/add", { name: cur.name }); qc.invalidateQueries({ queryKey: ["shopping"] }); soon(`${cur.name} is on the shopping list.`); } catch (e: any) { setErr(e.message); } }}>Add to list</button>
      <button className="primary" style={{ marginLeft: "auto", minWidth: 170 }} disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save"}</button>
    </>
  ) : (
    <>
      <button style={{ marginRight: "auto" }} onClick={closeSheet}>Cancel</button>
      <button disabled={busy} onClick={() => save(true)}>Add another</button>
      <button className="primary" style={{ minWidth: 150 }} disabled={busy} onClick={() => save(false)}>{busy ? "Adding…" : "Add"}</button>
    </>
  );
  return <SheetFrame title={cur ? cur.name : "Add to the pantry"} body={body} foot={foot} error={err} />;
}

/** Where to buy one thing on the shopping list, and how much of it. */
export function ShopItemSheet({ id }: { id: string }) {
  const { closeSheet } = useHub();
  const qc = useQueryClient();
  const { data: pan = NO_PANTRY } = usePantry();
  const { data } = useShopping();
  const item = data?.items.find(x => x.id === id);
  const [store, setStore] = useState(item?.store || ""), [qty, setQty] = useState(item?.qty || 0), [remember, setRemember] = useState(true), [err, setErr] = useState("");
  if (!item) return <SheetFrame title="Shopping" body={<p>That's gone from the list.</p>} foot={<button className="primary" style={{ marginLeft: "auto" }} onClick={closeSheet}>Close</button>} />;
  const linked = pan.items.find(i => i.id === item.pantry);
  const save = async () => {
    try {
      await post("/api/shopping/update", { id: item.id, store, ...(qty !== (item.qty || 0) ? { qty } : {}) });
      if (linked && remember && store !== linked.store) await post("/api/pantry/item", { ...linked, store });
      qc.invalidateQueries({ queryKey: ["shopping"] }); qc.invalidateQueries({ queryKey: ["pantry"] }); closeSheet();
    } catch (e: any) { setErr(e.message); }
  };
  return <SheetFrame title={item.name} error={err} foot={<><button className="danger-o" onClick={async () => { try { await post("/api/shopping/remove", { id: item.id }); qc.invalidateQueries({ queryKey: ["shopping"] }); closeSheet(); } catch (e: any) { setErr(e.message); } }}>Remove</button><button style={{ marginLeft: "auto" }} onClick={closeSheet}>Cancel</button><button className="primary" style={{ minWidth: 170 }} onClick={save}>Save</button></>} body={
    <>
      <div className="cap" style={{ margin: "14px 0 8px" }}>Buy it at</div>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap" }}>
        <Pill on={!store} onClick={() => setStore("")}>Anywhere</Pill>
        {pan.stores.map(s => <button key={s.id} className={"pill" + (store === s.id ? " on" : "")} style={{ gap: 8 }} onClick={() => setStore(s.id)}><i className="ptdot" style={{ background: s.color }} />{s.name}</button>)}
      </div>
      {linked && store !== (linked.store || "") ? <div className="fx dvrow" style={{ marginTop: 12 }}><span>Make it the usual shop for {linked.name}</span><button className={"sw2" + (remember ? " on" : "")} role="switch" aria-checked={remember} aria-label="Make it the usual shop" onClick={() => setRemember(!remember)}><i /></button></div> : null}
      {linked ? (
        <>
          <div className="cap" style={{ margin: "22px 0 8px" }}>How much to buy</div>
          <Stepper value={qty} onChange={setQty} step={stepFor(linked.unit)} label="amount to buy" unit={linked.unit} />
          <p style={{ margin: "10px 2px 0", fontSize: 16, color: "var(--soft)" }}>{fmtQty(linked.qty, linked.unit)} at home now. Ticking it off adds what you bought to the pantry.</p>
        </>
      ) : <p className="dvnone">This isn't in the pantry, so ticking it off just takes it off the list.</p>}
      {item.note ? <p className="dvnone">{item.note}</p> : null}
    </>
  } />;
}

/** After cooking: what the dinner used from the pantry, to check and change before it's taken off. */
export function UsePantrySheet({ meal, factor }: { meal: string; factor: number }) {
  const { closeSheet, soon } = useHub();
  const qc = useQueryClient();
  const { data: din } = useDinners();
  const { data: pan = NO_PANTRY } = usePantry();
  const m = din?.meals.find(x => x.id === meal);
  const [rows, setRows] = useState(() => m ? planUse(m, pan, factor) : []);
  const [busy, setBusy] = useState(false);
  const setUsed = (id: string, n: number) => setRows(r => r.map(x => x.item.id === id ? { ...x, used: Math.max(0, Math.min(x.item.qty, Math.round(n * 1000) / 1000)) } : x));
  const apply = async () => {
    const uses = rows.filter(r => r.used > 0).map(r => ({ id: r.item.id, delta: -r.used }));
    setBusy(true);
    try {
      if (uses.length) await post("/api/pantry/use", { uses });
      qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); closeSheet();
      soon(uses.length ? `Pantry updated: ${uses.length} ${uses.length === 1 ? "thing" : "things"} used.` : "Nothing taken off the pantry.", uses.length ? async () => { try { await post("/api/pantry/use", { uses: uses.map(u => ({ id: u.id, delta: -u.delta })) }); qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); } catch (e: any) { soon(e.message); } } : undefined);
    } catch (e: any) { soon(e.message); setBusy(false); }
  };
  return <SheetFrame title="Update the pantry" foot={<><button style={{ marginLeft: "auto" }} onClick={closeSheet}>Skip</button><button className="primary" style={{ minWidth: 220 }} disabled={busy} onClick={apply}>Update the pantry</button></>} body={
    <div style={{ paddingTop: 6 }}>
      <p style={{ fontSize: 18, color: "var(--soft)", margin: "6px 2px 10px" }}>{m ? `What ${m.name} used from the pantry.` : "What the dinner used."} Change anything that's not right.</p>
      {rows.length ? rows.map(r => {
        const used = r.used, after = Math.max(0, r.item.qty - used);
        return (
          <div key={r.item.id} className="ptuse">
            <div className="fx" style={{ justifyContent: "space-between", gap: 10 }}>
              <b style={{ fontSize: 22 }}>{r.item.name}</b>
              <span style={{ fontSize: 16, fontWeight: 600, color: "#5a6478" }}>{fmtQty(r.item.qty, r.item.unit)} → {fmtQty(after, r.item.unit)}</span>
            </div>
            <small style={{ display: "block", margin: "2px 0 8px", fontSize: 15, fontWeight: 600, color: "#6b7488" }}>{r.ing.amount ? `The dinner needs ${r.ing.amount}` : "No amount given"}{r.need === null ? ". It can't be worked out in " + (r.item.unit || "this unit") : ""}{!r.item.auto ? ". Not used up by dinners" : ""}</small>
            <div className="fx" style={{ gap: 10, flexWrap: "wrap" }}>
              <Stepper value={used} onChange={n => setUsed(r.item.id, n)} step={stepFor(r.item.unit)} label={`${r.item.name} used`} unit={r.item.unit} />
            </div>
            <div className="fx" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <Pill on={used === 0} onClick={() => setUsed(r.item.id, 0)}>None</Pill>
              {r.need !== null ? <Pill on={used === Math.min(r.need, r.item.qty)} onClick={() => setUsed(r.item.id, r.need!)}>What the dinner needs</Pill> : null}
              <Pill on={used === r.item.qty && r.item.qty > 0} onClick={() => setUsed(r.item.id, r.item.qty)}>All of it</Pill>
            </div>
          </div>
        );
      }) : <p className="dvnone" style={{ fontSize: 20 }}>None of this dinner's ingredients are in the pantry yet, so there's nothing to take off.</p>}
    </div>
  } />;
}
