import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useHub, type Dim } from "../hub";
import { useNav, usePage, type Page } from "../nav";
import { DockIcon } from "../lib/icons";
import { CalendarPanel } from "./Calendar";
import { ChoresPanel } from "./Chores";
import { Overview } from "./Overview";
import { MenuPanel, ShoppingPanel } from "./Panels";
import { SheetHost } from "./Sheets";

type Box = { l: number; t: number; w: number; h: number };
const fullBox = (d: Dim): Box => d.phone ? { l: 10, t: 10 + d.st, w: d.W - 20, h: d.H - 20 - d.st - d.sb } : { l: 20, t: 20, w: d.W - 40, h: d.H - 40 };
const applyBox = (el: HTMLElement, b: Box) => { el.style.left = b.l + "px"; el.style.top = b.t + "px"; el.style.width = b.w + "px"; el.style.height = b.h + "px"; };

/** A full screen that fades in over the Overview, and fades back out. */
function PanelCard({ id, inner, active, children }: { id: string; inner: string; active: boolean; children: ReactNode }) {
  const { dim } = useHub();
  const card = useRef<HTMLElement>(null);
  const was = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLayoutEffect(() => {
    const c = card.current!;
    clearTimeout(timer.current);
    applyBox(c, fullBox(dim));
    if (active && !was.current) {
      c.classList.add("show");
      void c.offsetWidth;                                   // show it at zero opacity first, then fade in
      c.classList.add("on");
    } else if (!active && was.current) {
      c.classList.remove("on");
      timer.current = setTimeout(() => c.classList.remove("show"), 300);
    }
    was.current = active;
  }, [active, dim]);
  const fb = fullBox(dim);
  return (
    <section id={id} ref={card} className="tile-card">
      <div id={inner} style={{ width: fb.w, height: fb.h }}>{active || was.current ? children : null}</div>
    </section>
  );
}

/** The floating menu: always open, so every screen is one tap away. */
function Dock() {
  const { S, dim, ppOn, cal } = useHub();
  const page = usePage();
  const { go, openCal } = useNav();
  const url = (id: string) => S.config.widgets.find(w => w.id === id)?.url;
  const items: [string, string, string][] = [["overview", "Overview", "page"], ["calendar", "Calendar", "page"], ["menu", "Dinners", "page"], ["shopping", "Shopping", "page"]];
  if (ppOn) items.push(["chores", "Chores", "page"]); else if (url("pocketpals")) items.push(["chores", "Chores", url("pocketpals")!]);
  if (url("wattsmypower")) items.push(["energy", "Energy", url("wattsmypower")!]);
  items.push(["settings", "Settings", "page"]);
  const dw = dim.phone ? 50 * items.length + 10 : 150 + 60 * (items.length - 1) + 20;
  return (
    <nav id="dock" aria-label="Main" style={{ "--dw": dw + "px" } as CSSProperties}>
      <div id="dk-i">
        {items.map(([id, name, to]) => {
          const on = to === "page" && id === page;
          const inner = on ? <><DockIcon name={id} size={22} /><span className="lb">{name}</span></> : <DockIcon name={id} />;
          return to === "page"
            ? <button key={id} id={"dk-" + id} className={"dk" + (on ? " on" : "")} aria-label={name} aria-current={on ? "page" : undefined} onClick={() => id === "calendar" ? openCal(cal.mode, cal.date) : go(id as Page | "settings")}>{inner}</button>
            : <a key={id} className="dk" href={to} aria-label={name}>{inner}</a>;
        })}
      </div>
    </nav>
  );
}

export function Stage() {
  const { dim, sheet, toast, closeSheet } = useHub();
  const page = usePage();
  const style = { "--s": dim.s, "--W": dim.W + "px", "--H": dim.H + "px", "--st": dim.st + "px", "--sb": dim.sb + "px" } as CSSProperties;
  return (
    <div id="dash">
      <div id="stage" className={(dim.phone ? "phone " : "") + (sheet ? "sheet-on" : "")} style={style}>
        <Overview away={page !== "overview"} />
        <PanelCard id="calcard" inner="calin" active={page === "calendar"}><CalendarPanel /></PanelCard>
        <PanelCard id="menucard" inner="menuin" active={page === "menu"}><MenuPanel /></PanelCard>
        <PanelCard id="shopcard" inner="shopin" active={page === "shopping"}><ShoppingPanel /></PanelCard>
        <PanelCard id="chorecard" inner="chorein" active={page === "chores"}><ChoresPanel /></PanelCard>
        <Dock />
        <div id="sheetscrim" onClick={closeSheet} />
        <SheetHost />
        <div id="toast" className={"toast" + (toast ? " on" : "")} role="status">{toast || "Coming soon"}</div>
      </div>
    </div>
  );
}
