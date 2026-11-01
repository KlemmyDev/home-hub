import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DEMO, post } from "../lib/api";
import { addDays, clockT, longDay, nowZ, sameDay, shortDate, startOfDay, weekStart, ymd } from "../lib/dates";
import { Check, Chev, ChevL, ChevR, XIcon } from "../lib/icons";
import { dinnerFor, useDinners, useShopping } from "../data";
import { useHub } from "../hub";
import { FoodIcon } from "../lib/foodicons";

/** The clock and the screen's name, along the top of Dinners and Shopping. */
function PanelTop({ title, title2 }: { title: string; title2?: string }) {
  const { dim, now, h24 } = useHub();
  const P = dim.phone;
  return (
    <div className="fx" style={{ justifyContent: "space-between", padding: "0 4px 12px", gap: 12 }}>
      <div className="fx" style={{ gap: 14 }}>
        <span className="clk num" style={{ fontFamily: "'Comfortaa','Onest',sans-serif", fontSize: P ? 44 : 54, fontWeight: 700, letterSpacing: "-.07em", lineHeight: .9, WebkitTextStroke: "1.8px #101828", paintOrder: "stroke fill" }}>{clockT(now, h24)}</span>
        <span className="cdt" style={{ fontSize: P ? 16 : 20, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1 }}>{shortDate(now)}</span>
      </div>
      <span style={{ fontSize: P ? 26 : 32, fontWeight: 700, letterSpacing: "-.04em" }}>{title}{title2}</span>
    </div>
  );
}
const wrap = (P: boolean) => ({ display: "flex", flexDirection: "column" as const, width: "100%", height: "100%", padding: (P ? "14px 14px" : "18px 18px") + " 0" });

/* ---------- Dinners ---------- */
export function MenuPanel() {
  const { dim, now, people, menuWeek, setMenuWeek, openSheet } = useHub();
  const { data: din } = useDinners();
  const P = dim.phone;
  const w = weekStart(startOfDay(menuWeek)), b = addDays(w, 6), m = (x: Date) => x.toLocaleDateString([], { month: P ? "short" : "long" });
  const title = w.getMonth() === b.getMonth() ? `${w.getDate()} to ${b.getDate()} ${m(b)}` : `${w.getDate()} ${m(w)} to ${b.getDate()} ${m(b)}`;
  const thisWeek = sameDay(w, weekStart(now));
  let planned = 0;
  const rows = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(w, i), today = sameDay(day, now), t = dinnerFor(din, people, day), past = day < startOfDay(now);
    if (t) planned++;
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
            {t.cook ? <span className="dcook"><i className="av" style={{ width: 22, height: 22, fontSize: 12, background: t.cookColor || "#8a93a6" }}>{t.cook[0].toUpperCase()}</i>{t.cook} cooking</span> : null}
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
          <button className="cbtn accent" hidden={DEMO} style={{ padding: "0 20px" }} onClick={() => openSheet({ mode: "meals" })}>{P ? "Ideas" : "Dinner ideas"}{din?.meals.length ? " · " + din.meals.length : ""}</button>
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

/* ---------- Shopping list ---------- */
export function ShoppingPanel() {
  const { dim } = useHub();
  const qc = useQueryClient();
  const { data } = useShopping();
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const P = dim.phone;
  const items = data?.items || [];
  const todo = items.filter(x => !x.done), got = items.filter(x => x.done);
  const reload = () => qc.invalidateQueries({ queryKey: ["shopping"] });
  const change = (f: (list: typeof items) => typeof items) => qc.setQueryData(["shopping"], (old: any) => ({ ...old, items: f(old.items) }));    // show it at once, then save
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    setText("");
    try { await post("/api/shopping/add", { name }); setErr(""); await reload(); } catch (er: any) { setErr(er.message); setText(name); }
  };
  const row = (x: typeof items[number]) => (
    <div className={"srow" + (x.done ? " done" : "")} key={x.id}>
      <button className="stk" aria-pressed={x.done} onClick={async () => { change(l => l.map(i => i.id === x.id ? { ...i, done: !i.done } : i)); try { await post("/api/shopping/update", { id: x.id, done: !x.done }); } catch { reload(); } }}>
        <span className="chk" aria-hidden="true">{x.done ? <Check /> : null}</span><span className="sn">{x.name}</span>
      </button>
      <button className="sx" aria-label={"Remove " + x.name} onClick={async () => { change(l => l.filter(i => i.id !== x.id)); try { await post("/api/shopping/remove", { id: x.id }); } catch { reload(); } }}><XIcon /></button>
    </div>
  );
  return (
    <div style={wrap(P)}>
      <PanelTop title="Shopping" />
      <form className="fx" onSubmit={add} style={{ gap: 10, padding: "0 0 12px" }}>
        <input value={text} onChange={e => setText(e.target.value)} maxLength={60} placeholder="Add something…" aria-label="Add to the shopping list" autoComplete="off" enterKeyHint="done" style={{ flex: 1, minWidth: 0 }} />
        <button className="primary" type="submit" style={{ flex: "none", padding: `0 ${P ? 18 : 26}px` }}>Add</button>
      </form>
      <div className="err" role="alert" style={{ margin: "0 0 6px", minHeight: 0 }}>{err}</div>
      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        {todo.length ? todo.map(row) : (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{got.length ? "Everything's ticked off" : "Nothing on the list"}</div>
            <div style={{ fontSize: 18, color: "#6b7488", marginTop: 6 }}>{got.length ? "Clear the ticked items when you're done." : "Add what you need above."}</div>
          </div>
        )}
        {got.length ? <><div className="cap" style={{ margin: "18px 0 4px" }}>Got it · {got.length}</div>{got.map(row)}</> : null}
      </div>
      <div className="fx" style={{ flex: "none", height: 140, padding: "8px 4px 0", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#6b7488" }}>{todo.length ? `${todo.length} to get` : ""}</span>
        <button className="cbtn" hidden={!got.length} style={{ padding: "0 20px" }} onClick={async () => { try { await post("/api/shopping/clear"); } catch { /* shown again below */ } reload(); }}>Clear ticked</button>
      </div>
    </div>
  );
}
