import { clockT, shortDate } from "../lib/dates";
import { ChevL } from "../lib/icons";
import { useHub } from "../hub";
import { Weather } from "./Overview";

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
  const { setDview } = useHub();
  return (
    <div className="dvtop">
      <button className="dvback" aria-label={"Back to " + back} onClick={() => setDview(to)}><ChevL /><span>{back}</span></button>
      <h1 className="dvtitle">{title}</h1>
      <div className="fx" style={{ gap: 8, flex: "none" }}>{right}</div>
    </div>
  );
}

/** The calm page header: the page's name (and a word under it) on the left, the weather and the time on the right. */
export function PageHead({ title, sub }: { title: string; sub?: React.ReactNode }) {
  const { now, h24 } = useHub();
  const ampm = h24 ? "" : now.getHours() < 12 ? "am" : "pm";
  return (
    <header className="phead">
      <div className="phead-l"><h1>{title}</h1>{sub ? <span>{sub}</span> : null}</div>
      <div className="phead-r"><Weather /><span className="num phead-t">{clockT(now, h24)}{ampm ? <small>{ampm}</small> : null}</span></div>
    </header>
  );
}

export const wrap = (P: boolean) => ({ display: "flex", flexDirection: "column" as const, width: "100%", height: "100%", padding: (P ? "14px 14px" : "18px 18px") + " 0" });

export const AISLES = ["Fruit and veg", "Meat and fish", "Dairy and eggs", "Bakery", "Pantry", "Frozen", "Drinks", "Snacks", "Household", "Other"];
