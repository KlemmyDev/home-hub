import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { post } from "../lib/api";
import { clockT, shortDate } from "../lib/dates";
import { Check, ChevL, XIcon } from "../lib/icons";
import { useShopping } from "../data";
import { useHub } from "../hub";

/** The clock and the screen's name, along the top of Dinners and Shopping. */
export function PanelTop({ title, title2 }: { title: string; title2?: string }) {
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
/** A back button and a title, along the top of the pages inside Dinners. */
export function Top({ back, to, title, right }: { back: string; to: import("../hub").DView; title: string; right?: React.ReactNode }) {
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

export const wrap = (P: boolean) => ({ display: "flex", flexDirection: "column" as const, width: "100%", height: "100%", padding: (P ? "14px 14px" : "18px 18px") + " 0" });

/* ---------- Shopping list ---------- */
const AISLES = ["Fruit and veg", "Meat and fish", "Dairy and eggs", "Bakery", "Pantry", "Frozen", "Drinks", "Snacks", "Household", "Other"];
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
        <span className="chk" aria-hidden="true">{x.done ? <Check /> : null}</span><span className="sn">{x.name}{x.note ? <small className="snote">{x.note}</small> : null}</span>
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
        {todo.length ? AISLES.filter(a => todo.some(x => (x.aisle || "Other") === a)).map(a => <div key={a}><div className="cap aisle">{a}</div>{todo.filter(x => (x.aisle || "Other") === a).map(row)}</div>) : (
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
