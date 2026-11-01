import { clockT, shortDate } from "../lib/dates";
import { ChevL } from "../lib/icons";
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

export const AISLES = ["Fruit and veg", "Meat and fish", "Dairy and eggs", "Bakery", "Pantry", "Frozen", "Drinks", "Snacks", "Household", "Other"];
