import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO } from "./lib/api";
import { addDays, nowZ, setZone, startOfDay, weekStart } from "./lib/dates";
import { DEMO_PEOPLE, type Person } from "./lib/events";

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: false, refetchOnWindowFocus: false } } });

export type Config = {
  name: string; setup_done: boolean; hour24?: boolean; timezone?: string; remind_min?: number; share?: boolean; holidays?: { country: string; region: string }; widgets: { id: string; url: string }[];
  calendars: { id: string; name: string; color: string; site?: string }[]; pocketpals?: { connected?: boolean; tick?: boolean; url?: string };
  weather?: { connected: boolean; place: string; fahrenheit: boolean };
};
export type HubState = { version: string; config: Config; people: Person[]; catalog: { id: string; name: string; about: string }[] };

/* ---------- Fit the 800 x 1280 stage to the screen ---------- */
/* A tablet gets the fixed 800 x 1280 stage, scaled to fit. A phone gets a stage 430 wide (taller to match the screen),
   so type is about its real size; the screen then scrolls where it needs to. */
export type Dim = { W: number; H: number; s: number; phone: boolean; st: number; sb: number };
const DIM0: Dim = { W: 800, H: 1280, s: 1, phone: false, st: 0, sb: 0 };

export type CalView = { mode: "day" | "week" | "month" | "agenda"; date: Date; who: string | null };
/** Which page of Dinners is open: the week, the list of ideas, one dinner, or shopping for the week. */
export type DView = { v: "home" } | { v: "ideas" } | { v: "meal"; id: string } | { v: "shop" } | { v: "suggest" } | { v: "rules" } | { v: "pantry" } | { v: "history" } | { v: "cook"; id: string };
export type Sheet =
  | { mode: "event"; draft: EventDraft; occ?: string; back?: boolean }
  | { mode: "view"; e: import("./lib/events").Ev; cal: { name: string; color: string } }
  | { mode: "family"; back?: EventDraft }
  | { mode: "steps"; key: string }
  | { mode: "dinner"; date: string; cook: string | null }
  | { mode: "ingredient"; meal: string; ing: string | null }
  | { mode: "planmeal"; meal: string }
  | { mode: "rule"; weekday: number }
  | { mode: "find" };
export type EventDraft = {
  id: string; occ?: string; title: string; location: string; allDay: boolean; sd: string; st: string; ned: string; net: string;
  people: string[]; freq: string; interval: number; days: string[]; untilOn: boolean; until: string;
  notes: string; link: string; travel: number; checklist: string[]; icon: string; remind: number | null;
};

type Ctx = {
  S: HubState; people: Person[]; h24: boolean; dim: Dim; now: Date;
  refreshState: () => Promise<void>;
  cal: CalView; setCal: (f: (c: CalView) => CalView) => void;
  ovMode: "day" | "week"; setOvMode: (m: "day" | "week") => void;
  menuWeek: Date; setMenuWeek: (d: Date) => void;
  dview: DView; setDview: (v: DView) => void;
  choreDay: Date; setChoreDay: (d: Date) => void;
  showDone: boolean; setShowDone: (b: boolean) => void;
  sheet: Sheet | null; sheetShown: boolean; openSheet: (s: Sheet | null) => void; closeSheet: () => void;
  toast: string; toastAct: (() => void) | null; soon: (msg?: string, act?: () => void) => void;
  ppOn: boolean;
};
const HubCtx = createContext<Ctx | null>(null);
export const useHub = () => { const c = useContext(HubCtx); if (!c) throw new Error("no hub"); return c; };

export const useHubState = () => useQuery({ queryKey: ["state"], queryFn: () => api<HubState>("/api/state"), staleTime: Infinity });

export function useNow() {
  const [now, setNow] = useState(() => nowZ());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { const d = nowZ(); setNow(d); t = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds())); };
    t = setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    return () => clearTimeout(t);
  }, []);
  return now;
}

function useDim(probe: React.RefObject<HTMLDivElement | null>) {
  const [dim, setDim] = useState<Dim>(DIM0);
  useLayoutEffect(() => {
    let lastW = 0, lastH = 0;
    const fit = () => {
      const iw = innerWidth, ih = innerHeight;
      // The on-screen keyboard shrinks the window while a field is being typed in; the screen keeps its size then, so nothing rescales or jumps.
      const typing = document.activeElement instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (typing && iw === lastW && ih < lastH) return;
      lastW = iw; lastH = ih;
      const phone = Math.min(iw, ih) < 600;
      let W = 800, H = 1280, s = Math.min(iw / 800, ih / 1280);
      if (phone) { if (iw <= ih) { W = 430; s = iw / W; H = ih / s; } else { W = iw; H = ih; s = 1; } }
      const p = probe.current ? getComputedStyle(probe.current) : null;
      setDim({ W, H, s, phone, st: phone && p ? (parseFloat(p.paddingTop) || 0) / s : 0, sb: phone && p ? (parseFloat(p.paddingBottom) || 0) / s : 0 });
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [probe]);
  return dim;
}

/** Keeps the screen on while the hub is showing. */
/** A long press (a heavy fingertip on a fridge tablet) would open a context menu and cancel the tap; stop that except in text fields. */
function useNoLongPressMenu() {
  useEffect(() => {
    const stop = (e: Event) => { if (!(e.target as HTMLElement | null)?.closest?.("input,textarea")) e.preventDefault(); };
    document.addEventListener("contextmenu", stop);
    return () => document.removeEventListener("contextmenu", stop);
  }, []);
}

function useKeepAwake() {
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null;
    const go = async () => { try { if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await (navigator as any).wakeLock.request("screen"); } catch { /* not allowed */ } };
    go();
    document.addEventListener("visibilitychange", go);
    return () => { document.removeEventListener("visibilitychange", go); lock?.release?.().catch(() => {}); };
  }, []);
}

function HubInner({ S, children, probe, dim }: { S: HubState; children: ReactNode; probe: React.RefObject<HTMLDivElement | null>; dim: Dim }) {
  setZone(S.config.timezone || "");      // before anything reads the time
  const qc = useQueryClient();
  const now = useNow();
  useKeepAwake(); useNoLongPressMenu();
  const [cal, setCalState] = useState<CalView>({ mode: "day", date: nowZ(), who: null });
  const [ovMode, setOvMode] = useState<"day" | "week">("day");
  const [menuWeek, setMenuWeek] = useState(() => nowZ());
  const [dview, setDview] = useState<DView>({ v: "home" });
  const [choreDay, setChoreDay] = useState(() => nowZ());
  const [showDone, setShowDone] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  /** The sheet is built (hidden, off the bottom) first, and only slides up two frames later, so the slide is never competing with the work of drawing it. */
  const [sheetShown, setSheetShown] = useState(false);
  const shownRef = useRef(false), openToken = useRef(0);
  const openSheet = useCallback((s: Sheet | null) => {
    setSheet(s);
    const token = ++openToken.current;
    if (!s) { shownRef.current = false; setSheetShown(false); return; }
    if (shownRef.current) return;
    const show = () => { if (token === openToken.current && !shownRef.current) { shownRef.current = true; setSheetShown(true); } };
    requestAnimationFrame(() => requestAnimationFrame(show));
    setTimeout(show, 120);      // a screen that isn't drawing (just woken, or hidden) must still open it
  }, []);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [toastAct, setToastAct] = useState<(() => void) | null>(null);
  const soon = useCallback((msg?: string, act?: () => void) => {
    setToast(typeof msg === "string" ? msg : "Coming soon"); setToastAct(act ? () => act : null);
    clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => { setToast(""); setToastAct(null); }, act ? 8000 : 1800);     // an undo stays long enough to be reached
  }, []);
  const refreshState = useCallback(async () => { await qc.fetchQuery({ queryKey: ["state"], queryFn: () => api<HubState>("/api/state"), staleTime: 0 }); }, [qc]);
  const value = useMemo<Ctx>(() => ({
    S, people: DEMO && !S.people?.length ? DEMO_PEOPLE : S.people || [], h24: !!S.config.hour24, dim, now, refreshState,
    cal, setCal: f => setCalState(f), ovMode, setOvMode, menuWeek, setMenuWeek, dview, setDview, choreDay, setChoreDay, showDone, setShowDone,
    sheet, sheetShown, openSheet, closeSheet: () => openSheet(null), toast, toastAct, soon,
    ppOn: DEMO || !!S.config.pocketpals?.connected,
  }), [S, dim, now, refreshState, cal, ovMode, menuWeek, dview, choreDay, showDone, sheet, sheetShown, openSheet, toast, toastAct, soon]);
  return <HubCtx.Provider value={value}>{children}</HubCtx.Provider>;
}

/** Loads the hub's state once and shares it (and the screen's size) with everything below. */
export function HubProvider({ children }: { children: (S: HubState | null, failed: boolean) => ReactNode }) {
  return <QueryClientProvider client={queryClient}><Loader>{children}</Loader></QueryClientProvider>;
}
function Loader({ children }: { children: (S: HubState | null, failed: boolean) => ReactNode }) {
  const q = useHubState();
  const probe = useRef<HTMLDivElement>(null);
  const dim = useDim(probe);
  return (
    <>
      <div ref={probe} id="probe" aria-hidden="true" style={{ position: "fixed", left: 0, top: 0, visibility: "hidden", pointerEvents: "none", padding: "env(safe-area-inset-top) 0 env(safe-area-inset-bottom)" }} />
      {q.data ? <HubInner S={q.data} probe={probe} dim={dim}>{children(q.data, false)}</HubInner> : children(null, q.isError)}
    </>
  );
}

export const ONE_WEEK = (d: Date) => { const m = weekStart(d); return [m, addDays(m, 7)] as const; };
export const TODAY = () => startOfDay(nowZ());
