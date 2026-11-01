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
const dockBox = (d: Dim): Box => ({ l: d.phone ? 16 : 28, t: d.H - (d.phone ? 16 : 28) - d.sb - 76, w: 76, h: 76 });   // the round menu button
/** Where an element sits on the stage (the Overview may be scrolled). */
function boxIn(el: HTMLElement | null): Box | null {
  if (!el) return null;
  let l = 0, t = 0, n: HTMLElement | null = el;
  const stage = document.getElementById("stage");
  while (n && n !== stage) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  const ov = document.getElementById("ov");
  if (ov && ov.contains(el)) t -= ov.scrollTop;
  return { l, t, w: el.offsetWidth, h: el.offsetHeight };
}
const applyBox = (el: HTMLElement, b: Box) => { el.style.left = b.l + "px"; el.style.top = b.t + "px"; el.style.width = b.w + "px"; el.style.height = b.h + "px"; };

/** A full screen that grows out of the card it belongs to, and shrinks back into it. */
function PanelCard({ id, inner, active, from, children }: { id: string; inner: string; active: boolean; from: () => Box; children: ReactNode }) {
  const { dim } = useHub();
  const card = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null);
  const was = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLayoutEffect(() => {
    const c = card.current!, b = body.current!;
    clearTimeout(timer.current);
    if (active && !was.current) {
      c.classList.remove("anim"); applyBox(c, from()); c.classList.add("show");
      b.style.transitionDelay = ".3s"; b.style.opacity = "0";
      void c.offsetWidth;                                   // start from the card it came from, then grow
      c.classList.add("anim"); applyBox(c, fullBox(dim)); b.style.opacity = "1";
    } else if (!active && was.current) {
      c.classList.add("anim"); applyBox(c, from());          // shrink back to where it came from
      b.style.transitionDelay = "0s"; b.style.opacity = "0";
      timer.current = setTimeout(() => c.classList.remove("show", "anim"), 600);
    } else if (active) applyBox(c, fullBox(dim));
    was.current = active;
  }, [active, dim]);
  const fb = fullBox(dim);
  return (
    <section id={id} ref={card} className="tile-card">
      <div id={inner} ref={body} style={{ width: fb.w, height: fb.h }}>{active || was.current ? children : null}</div>
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
  const dw = dim.phone ? 50 * items.length + 10 : 150 + 60 * (items.length - 1) + 20;
  return (
    <nav id="dock" aria-label="Main" style={{ "--dw": dw + "px" } as CSSProperties}>
      <div id="dk-i">
        {items.map(([id, name, to]) => {
          const on = to === "page" && id === page;
          const inner = on ? <><DockIcon name={id} size={22} /><span className="lb">{name}</span></> : <DockIcon name={id} />;
          return to === "page"
            ? <button key={id} id={"dk-" + id} className={"dk" + (on ? " on" : "")} aria-label={name} aria-current={on ? "page" : undefined} onClick={() => id === "calendar" ? openCal(cal.mode, cal.date) : go(id as Page)}>{inner}</button>
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
  const origin = (id: string, fallback?: string) => () => boxIn(document.getElementById(id)) || boxIn(document.getElementById(fallback || "dock")) || dockBox(dim);
  return (
    <div id="dash">
      <div id="stage" className={(dim.phone ? "phone " : "") + (sheet ? "sheet-on" : "")} style={style}>
        <Overview away={page !== "overview"} />
        <PanelCard id="calcard" inner="calin" active={page === "calendar"} from={origin("today")}><CalendarPanel /></PanelCard>
        <PanelCard id="menucard" inner="menuin" active={page === "menu"} from={origin("dinner")}><MenuPanel /></PanelCard>
        <PanelCard id="shopcard" inner="shopin" active={page === "shopping"} from={origin("dk-shopping")}><ShoppingPanel /></PanelCard>
        <PanelCard id="chorecard" inner="chorein" active={page === "chores"} from={origin("chorescard", "dk-chores")}><ChoresPanel /></PanelCard>
        <Dock />
        <div id="sheetscrim" onClick={closeSheet} />
        <SheetHost />
        <div id="toast" className={"toast" + (toast ? " on" : "")} role="status">{toast || "Coming soon"}</div>
      </div>
    </div>
  );
}
