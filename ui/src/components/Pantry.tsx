import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { Check, XIcon } from "../lib/icons";
import { NO_PANTRY, stockLevel, usePantry, useShopping, type PantryData, type PItem, type ShopItem, type Store } from "../data";
import { useHub } from "../hub";
import { fmtQty, stepFor } from "../lib/units";
import { AISLES, PanelTop, wrap } from "./Panels";
import { Pill } from "./SheetFrame";

type Tab = "list" | "stock" | "shops";
const TABS: [Tab, string][] = [["list", "Shopping list"], ["stock", "Stock"], ["shops", "Shops"]];
const SAVED = "pantry-tab";

/** The Pantry page: the shopping list, what's at home, and the shops, side by side. */
export function PantryPanel() {
  const { dim } = useHub();
  const P = dim.phone;
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem(SAVED) as Tab) || "list"; } catch { return "list"; } });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem(SAVED, t); } catch { /* fine without it */ } };
  const { data: pan = NO_PANTRY } = usePantry();
  const low = pan.items.filter(i => stockLevel(i) !== "ok").length;
  return (
    <div style={wrap(P)}>
      <PanelTop title="Pantry" />
      <div className="fx ptabs" role="tablist" aria-label="Pantry">
        {TABS.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={"pill" + (tab === t ? " on" : "")} onClick={() => pick(t)}>{l}{t === "stock" && low ? <b className="ptbadge">{low}</b> : null}</button>)}
      </div>
      {tab === "list" ? <ShoppingTab pan={pan} goShops={() => pick("shops")} /> : tab === "stock" ? <StockTab pan={pan} /> : <ShopsTab pan={pan} />}
    </div>
  );
}

const storeOf = (pan: PantryData, id?: string) => pan.stores.find(s => s.id === id);
const Dot = ({ s }: { s?: Store }) => <i className="ptdot" style={{ background: s?.color || "#b8c0d0" }} aria-hidden />;

/* ---------- the shopping list, by shop ---------- */
function ShoppingTab({ pan, goShops }: { pan: PantryData; goShops: () => void }) {
  const { openSheet } = useHub();
  const qc = useQueryClient();
  const { data } = useShopping();
  const [text, setText] = useState(""), [err, setErr] = useState(""), [only, setOnly] = useState<string | null>(null);      // null: every shop; "": no shop in particular
  const items = data?.items || [], todo = items.filter(x => !x.done), got = items.filter(x => x.done);
  const reload = () => { qc.invalidateQueries({ queryKey: ["shopping"] }); qc.invalidateQueries({ queryKey: ["pantry"] }); };
  const change = (f: (l: ShopItem[]) => ShopItem[]) => qc.setQueryData(["shopping"], (old: any) => ({ ...old, items: f(old.items) }));
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    setText("");
    try { await post("/api/shopping/add", { name, store: only || "" }); setErr(""); reload(); } catch (er: any) { setErr(er.message); setText(name); }
  };
  const count = (id: string) => todo.filter(x => (x.store || "") === id).length;
  const visible = only === null ? todo : todo.filter(x => (x.store || "") === only);
  const groups: { id: string; items: ShopItem[] }[] = only === null ? [...pan.stores.map(s => s.id), ""].map(id => ({ id, items: visible.filter(x => (x.store || "") === id) })).filter(g => g.items.length) : [{ id: only, items: visible }];
  const line = (x: ShopItem) => [x.qty ? fmtQty(x.qty, x.unit || "") : "", x.note].filter(Boolean).join(" · ");
  const row = (x: ShopItem, showShop: boolean) => (
    <div className={"srow" + (x.done ? " done" : "")} key={x.id}>
      <button className="stk" aria-pressed={x.done} onClick={async () => { change(l => l.map(i => i.id === x.id ? { ...i, done: !i.done } : i)); try { await post("/api/shopping/update", { id: x.id, done: !x.done }); reload(); } catch { reload(); } }}>
        <span className="chk" aria-hidden="true">{x.done ? <Check /> : null}</span>
        <span className="sn">{x.name}{x.auto ? <i className="ptauto">low</i> : null}{line(x) ? <small className="snote">{line(x)}</small> : null}</span>
      </button>
      {showShop ? <button className="ptshop" aria-label={`Change where to buy ${x.name}`} onClick={() => openSheet({ mode: "shopitem", id: x.id })}><Dot s={storeOf(pan, x.store)} />{storeOf(pan, x.store)?.name || "Anywhere"}</button> : null}
      <button className="sx" aria-label={"Remove " + x.name} onClick={async () => { change(l => l.filter(i => i.id !== x.id)); try { await post("/api/shopping/remove", { id: x.id }); } catch { reload(); } }}><XIcon /></button>
    </div>
  );
  const aisles = (list: ShopItem[], showShop: boolean) => AISLES.filter(a => list.some(x => (x.aisle || "Other") === a)).map(a => <div key={a}><div className="cap aisle">{a}</div>{list.filter(x => (x.aisle || "Other") === a).map(x => row(x, showShop))}</div>);
  return (
    <>
      <form className="fx" onSubmit={add} style={{ gap: 10, padding: "0 0 10px" }}>
        <input value={text} onChange={e => setText(e.target.value)} maxLength={60} placeholder={only ? `Add something to get at ${storeOf(pan, only)?.name}…` : "Add something…"} aria-label="Add to the shopping list" autoComplete="off" enterKeyHint="done" style={{ flex: 1, minWidth: 0 }} />
        <button className="primary" type="submit" style={{ flex: "none", padding: "0 26px" }}>Add</button>
      </form>
      {pan.stores.length ? (
        <div className="fx dvchips" style={{ paddingBottom: 10 }}>
          <Pill on={only === null} onClick={() => setOnly(null)}>All shops · {todo.length}</Pill>
          {pan.stores.map(s => <button key={s.id} className={"pill" + (only === s.id ? " on" : "")} style={{ gap: 8 }} onClick={() => setOnly(s.id)}><Dot s={s} />{s.name} · {count(s.id)}</button>)}
          {count("") ? <Pill on={only === ""} onClick={() => setOnly("")}>Anywhere · {count("")}</Pill> : null}
        </div>
      ) : <button className="dvlink" style={{ textAlign: "left", padding: "0 4px 8px" }} onClick={goShops}>Add the shops you buy from, to split the list by shop</button>}
      <div className="err" role="alert" style={{ margin: "0 0 6px", minHeight: 0 }}>{err}</div>
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        {groups.length ? groups.map(g => {
          const s = storeOf(pan, g.id);
          return (
            <section key={g.id || "any"} className="ptgroup">
              {only === null && pan.stores.length ? <div className="pthead"><Dot s={s} /><b>{s?.name || "Anywhere"}</b><small>{g.items.length} to get</small></div> : null}
              {aisles(g.items, only === null && pan.stores.length > 0)}
            </section>
          );
        }) : (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{got.length ? "Everything's ticked off" : only ? "Nothing to get here" : "Nothing on the list"}</div>
            <div style={{ fontSize: 18, color: "#6b7488", marginTop: 6 }}>{got.length ? "Clear the ticked items when you're done." : "Things you run low on turn up here by themselves."}</div>
          </div>
        )}
        {got.length ? <><div className="cap" style={{ margin: "18px 0 4px" }}>Got it · {got.length}</div>{got.map(x => row(x, false))}</> : null}
      </div>
      <div className="fx" style={{ flex: "none", height: 140, padding: "8px 4px 0", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#6b7488" }}>{visible.length ? `${visible.length} to get` : ""}</span>
        <button className="cbtn" hidden={!got.length} style={{ padding: "0 20px" }} onClick={async () => { try { await post("/api/shopping/clear"); } catch { /* shown again below */ } reload(); }}>Clear ticked</button>
      </div>
    </>
  );
}

/* ---------- what's at home ---------- */
function StockTab({ pan }: { pan: PantryData }) {
  const { openSheet, soon } = useHub();
  const qc = useQueryClient();
  const [q, setQ] = useState(""), [show, setShow] = useState<"all" | "low" | "out">("all"), [shop, setShop] = useState<string | null>(null);
  const low = pan.items.filter(i => stockLevel(i) === "low").length, out = pan.items.filter(i => stockLevel(i) === "out").length;
  const shown = useMemo(() => pan.items.filter(i => (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())) && (show === "all" || (show === "low" ? stockLevel(i) !== "ok" : stockLevel(i) === "out")) && (shop === null || i.store === shop)), [pan, q, show, shop]);
  const bump = async (i: PItem, dir: 1 | -1) => {
    const delta = Math.round(stepFor(i.unit) * dir * 1000) / 1000;
    qc.setQueryData<PantryData>(["pantry"], old => old && { ...old, items: old.items.map(x => x.id === i.id ? { ...x, qty: Math.max(0, Math.round((x.qty + delta) * 1000) / 1000) } : x) });
    try { await post("/api/pantry/adjust", { id: i.id, delta }); } catch (e: any) { soon(e.message); } finally { qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); }
  };
  return (
    <>
      <div className="fx" style={{ gap: 10, padding: "0 0 10px" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the pantry" aria-label="Search the pantry" autoComplete="off" enterKeyHint="search" style={{ flex: 1, minWidth: 0 }} />
        <button className="cbtn accent" style={{ flex: "none", padding: "0 22px" }} onClick={() => openSheet({ mode: "pitem", id: null })}>+ Add</button>
      </div>
      <div className="fx dvchips" style={{ paddingBottom: 10 }}>
        <Pill on={show === "all"} onClick={() => setShow("all")}>Everything · {pan.items.length}</Pill>
        <Pill on={show === "low"} onClick={() => setShow("low")}>Running low · {low + out}</Pill>
        <Pill on={show === "out"} onClick={() => setShow("out")}>Out · {out}</Pill>
        {pan.stores.length ? <span className="dvsep" aria-hidden /> : null}
        {pan.stores.map(s => <button key={s.id} className={"pill" + (shop === s.id ? " on" : "")} style={{ gap: 8 }} onClick={() => setShop(shop === s.id ? null : s.id)}><Dot s={s} />{s.name}</button>)}
      </div>
      <div className="scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 130 }}>
        {shown.length ? AISLES.filter(a => shown.some(i => (i.aisle || "Other") === a)).map(a => (
          <div key={a}><div className="cap aisle">{a}</div>
            {shown.filter(i => (i.aisle || "Other") === a).sort((x, y) => x.name.localeCompare(y.name)).map(i => {
              const lv = stockLevel(i), top = Math.max(i.want || i.min * 2 || i.qty, i.qty, 0.001), s = storeOf(pan, i.store);
              return (
                <div key={i.id} className={"ptrow " + lv}>
                  <button className="ptmain" onClick={() => openSheet({ mode: "pitem", id: i.id })} aria-label={`${i.name}: ${fmtQty(i.qty, i.unit)}. Change details`}>
                    <b>{i.name}{lv !== "ok" ? <em className={"ptflag " + lv}>{lv === "out" ? "Out" : "Low"}</em> : null}</b>
                    <span className="ptbar" aria-hidden><i style={{ width: Math.min(100, (i.qty / top) * 100) + "%" }} />{i.min > 0 ? <u style={{ left: Math.min(100, (i.min / top) * 100) + "%" }} /> : null}</span>
                    <small>{[s?.name, i.min > 0 ? `keep ${fmtQty(i.min, i.unit)}` : "", i.auto ? "" : "not used up by dinners"].filter(Boolean).join(" · ") || "Tap to set a minimum"}</small>
                  </button>
                  <div className="ptstep">
                    <button aria-label={`Less ${i.name}`} onClick={() => bump(i, -1)}>−</button>
                    <span className="num">{fmtQty(i.qty, i.unit)}</span>
                    <button aria-label={`More ${i.name}`} onClick={() => bump(i, 1)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )) : (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{pan.items.length ? "Nothing matches" : "The pantry is empty"}</div>
            <div style={{ fontSize: 18, color: "#6b7488", marginTop: 6 }}>{pan.items.length ? "Try another word, or clear the filter." : "Add what you keep at home, how much, and the least you want to have."}</div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- the shops ---------- */
const SUGGESTED = ["Woolworths", "Coles", "Aldi", "IGA", "Costco", "Butcher", "Greengrocer", "Markets"];
const SHOP_COLORS = ["#14a06c", "#2f6fe0", "#e2523f", "#f59e0b", "#7b5cf0", "#e5487f", "#0ea5b7", "#5a6478"];

function ShopsTab({ pan }: { pan: PantryData }) {
  const { soon } = useHub();
  const qc = useQueryClient();
  const [name, setName] = useState(""), [err, setErr] = useState(""), [sure, setSure] = useState<string | null>(null);
  const save = async (stores: Store[]) => {
    qc.setQueryData<PantryData>(["pantry"], old => old && { ...old, stores });
    try { await post("/api/pantry/stores", stores); setErr(""); } catch (e: any) { setErr(e.message); } finally { qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); }
  };
  const addShop = (n: string) => { const t = n.trim(); if (t) { save([...pan.stores, { id: "", name: t, color: SHOP_COLORS[pan.stores.length % SHOP_COLORS.length] }]); setName(""); } };
  const setting = async (patch: Partial<PantryData["settings"]>) => {
    const settings = { ...pan.settings, ...patch };
    qc.setQueryData<PantryData>(["pantry"], old => old && { ...old, settings });
    try { await post("/api/pantry/settings", settings); } catch (e: any) { soon(e.message); } finally { qc.invalidateQueries({ queryKey: ["pantry"] }); qc.invalidateQueries({ queryKey: ["shopping"] }); }
  };
  const used = (id: string) => pan.items.filter(i => i.store === id).length;
  return (
    <div className="scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 130 }}>
      <p style={{ fontSize: 18, color: "var(--soft)", margin: "0 4px 10px" }}>The shops you buy from. Say where each thing in the pantry is usually bought, and the shopping list splits up by shop.</p>
      {pan.stores.map(s => (
        <div key={s.id} className="dving" style={{ cursor: "default", flexWrap: "wrap" }}>
          <button className="sw" aria-label={`Change ${s.name}'s colour`} style={{ background: s.color, flex: "none", borderColor: "transparent" }} onClick={() => save(pan.stores.map(x => x.id === s.id ? { ...x, color: SHOP_COLORS[(SHOP_COLORS.indexOf(x.color) + 1) % SHOP_COLORS.length] } : x))} />
          <input key={s.name} defaultValue={s.name} maxLength={30} aria-label="Shop name" autoComplete="off" style={{ flex: 1, minWidth: 0 }} onBlur={e => e.target.value.trim() && e.target.value !== s.name && save(pan.stores.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))} />
          <span style={{ fontSize: 16, fontWeight: 600, color: "#6b7488", flex: "none" }}>{used(s.id)} {used(s.id) === 1 ? "thing" : "things"}</span>
          {sure === s.id ? <><button className="danger" onClick={() => { setSure(null); save(pan.stores.filter(x => x.id !== s.id)); }}>Remove</button><button onClick={() => setSure(null)}>Keep</button></> : <button className="cnav" aria-label={"Remove " + s.name} onClick={() => setSure(s.id)}><XIcon /></button>}
        </div>
      ))}
      <form className="qadd" onSubmit={e => { e.preventDefault(); addShop(name); }} style={{ marginTop: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="Add a shop" aria-label="Add a shop" autoComplete="off" enterKeyHint="done" /><button className="primary" type="submit" disabled={!name.trim()}>Add</button>
      </form>
      <div className="fx" style={{ gap: 8, flexWrap: "wrap", margin: "12px 0 0" }}>{SUGGESTED.filter(n => !pan.stores.some(s => s.name.toLowerCase() === n.toLowerCase())).map(n => <Pill key={n} onClick={() => addShop(n)}>+ {n}</Pill>)}</div>
      <div className="err" role="alert" style={{ minHeight: 0 }}>{err}</div>
      <h3 className="dvh">How it works</h3>
      <div className="dvrow"><span>Add to the list when stock is low<small>When something falls below its minimum, it goes on the shopping list by itself, at its usual shop.</small></span>
        <button className={"sw2" + (pan.settings.auto_restock ? " on" : "")} role="switch" aria-checked={pan.settings.auto_restock} aria-label="Add to the list when stock is low" onClick={() => setting({ auto_restock: !pan.settings.auto_restock })}><i /></button></div>
      <div className="dvrow"><span>Check before using up stock<small>After cooking, see what the dinner used and change it before the pantry is updated. Off: it's taken off at once, with an Undo.</small></span>
        <button className={"sw2" + (pan.settings.ask_before_use ? " on" : "")} role="switch" aria-checked={pan.settings.ask_before_use} aria-label="Check before using up stock" onClick={() => setting({ ask_before_use: !pan.settings.ask_before_use })}><i /></button></div>
    </div>
  );
}
