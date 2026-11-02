import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useHub, type Dim } from "../hub";
import { useNav, usePage, type Page } from "../nav";
import { DockIcon } from "../lib/icons";
import { nowZ, startOfDay } from "../lib/dates";
import { CalendarPanel } from "./Calendar";
import { ChoresPanel } from "./Chores";
import { Overview } from "./Overview";
import { PantryPanel } from "./Pantry";
import { MenuPanel } from "./Dinners";
import { Settings } from "../screens/Settings";
import { SheetHost, newEventDraft } from "./Sheets";
import { Reminders } from "./Reminders";
import { UpdateOverlay } from "./UpdateOverlay";
import { Standby } from "./Standby";

type Box = { l: number; t: number; w: number; h: number };
const boxFull = (d: Dim): Box => d.phone ? { l: 10, t: 10 + d.st, w: d.W - 20, h: d.H - 20 - d.st - d.sb } : { l: 20, t: 20, w: d.W - 40, h: d.H - 40 };
const edgeBox = (d: Dim): Box => ({ l: 0, t: 0, w: d.W, h: d.H });   // the whole screen, no margin
const applyBox = (el: HTMLElement, b: Box) => { el.style.left = b.l + "px"; el.style.top = b.t + "px"; el.style.width = b.w + "px"; el.style.height = b.h + "px"; };

/** A full screen that fades in over the Overview, and fades back out. */
function PanelCard({ id, inner, active, edge, children }: { id: string; inner: string; active: boolean; edge?: boolean; children: ReactNode }) {
  const { dim } = useHub();
  const fullBox = edge ? edgeBox : boxFull;
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
    <section id={id} ref={card} className={"tile-card" + (edge ? " edge" : "")}>
      <div id={inner} style={{ width: fb.w, height: fb.h }}>{active || was.current ? children : null}</div>
    </section>
  );
}

/** The menu along the bottom: every screen one tap away, and Add (a new event) raised in the middle. */
function Bar() {
  const { S, ppOn, cal, setDview, openSheet, now } = useHub();
  const page = usePage();
  const { go, openCal } = useNav();
  const url = (id: string) => S.config.widgets.find(w => w.id === id)?.url;
  const left: [string, string, string][] = [["overview", "Home", "page"], ["calendar", "Calendar", "page"], ["menu", "Dinners", "page"]];
  const right: [string, string, string][] = [["pantry", "Pantry", "page"]];
  if (ppOn) right.push(["chores", "Chores", "page"]); else if (url("pocketpals")) right.push(["chores", "Chores", url("pocketpals")!]);
  if (url("wattsmypower")) right.push(["energy", "Energy", url("wattsmypower")!]);
  right.push(["settings", "Settings", "page"]);
  const open = (id: string) => id === "calendar" ? (page === "calendar" ? undefined : openCal(cal.mode, nowZ())) : id === "menu" ? (page === "menu" ? setDview({ v: "home" }) : go("menu")) : go(id as Page | "settings");
  const item = ([id, name, to]: [string, string, string]) => {
    const on = to === "page" && id === page;
    const body = <><span className="bi"><DockIcon name={id === "overview" ? "home" : id} /></span><span className="bl">{name}</span></>;
    return to === "page"
      ? <button key={id} id={"dk-" + id} className={"bt" + (on ? " on" : "")} aria-label={name} aria-current={on ? "page" : undefined} onClick={() => open(id)}>{body}</button>
      : <a key={id} className="bt" href={to} aria-label={name}>{body}</a>;
  };
  const add = () => openSheet({ mode: "event", draft: newEventDraft(startOfDay(page === "calendar" && cal.mode !== "month" ? cal.date : now), undefined, now, page === "calendar" ? cal.who : null) });
  return (
    <nav id="bar" aria-label="Main">
      {left.map(item)}
      <button id="dk-add" className="bt add" aria-label="Add an event" onClick={add}><span className="bi"><DockIcon name="add" /></span><span className="bl">Add</span></button>
      {right.map(item)}
    </nav>
  );
}

export function Stage() {
  const { dim, sheetShown, toast, toastAct, closeSheet, soon } = useHub();
  const page = usePage();
  const style = { "--s": dim.s, "--W": dim.W + "px", "--H": dim.H + "px", "--st": dim.st + "px", "--sb": dim.sb + "px" } as CSSProperties;
  return (
    <div id="dash">
      <div id="stage" className={(dim.phone ? "phone " : "") + (sheetShown ? "sheet-on" : "")} style={style}>
        <Overview away={page !== "overview"} />
        <PanelCard id="calcard" inner="calin" active={page === "calendar"} edge><CalendarPanel /></PanelCard>
        <PanelCard id="menucard" inner="menuin" active={page === "menu"} edge><MenuPanel /></PanelCard>
        <PanelCard id="shopcard" inner="shopin" active={page === "pantry"} edge><PantryPanel /></PanelCard>
        <PanelCard id="chorecard" inner="chorein" active={page === "chores"} edge><ChoresPanel /></PanelCard>
        {page === "settings" ? <div id="setlayer"><Settings /></div> : null}
        <Reminders />
        <Bar />
        <div id="sheetscrim" onClick={closeSheet} />
        <SheetHost />
        <UpdateOverlay />
        <div id="toast" className={"toast" + (toast ? " on" : "") + (toastAct ? " act" : "")} role="status">{toast || "Coming soon"}{toastAct ? <button className="toast-undo" onClick={() => { toastAct(); soon(""); }}>Undo</button> : null}</div>
      </div>
      <Standby />
    </div>
  );
}
