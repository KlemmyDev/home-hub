import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO } from "./lib/api";
import { addDays, nowZ, setZone, startOfDay, weekStart } from "./lib/dates";
import { DEMO_PEOPLE, type Person } from "./lib/events";

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: false, refetchOnWindowFocus: false } } });

export type Config = {
  name: string; setup_done: boolean; hour24?: boolean; timezone?: string; widgets: { id: string; url: string }[];
  calendars: { id: string; name: string; color: string; site?: string }[]; pocketpals?: { connected?: boolean; tick?: boolean; url?: string };
  weather?: { connected: boolean; place: string; fahrenheit: boolean };
};
export type HubState = { version: string; config: Config; people: Person[]; catalog: { id: string; name: string; about: string }[] };

/* ---------- Fit the 800 x 1280 stage to the screen ---------- */
/* A tablet gets the fixed 800 x 1280 stage, scaled to fit. A phone gets a stage 430 wide (taller to match the screen),
   so type is about its real size; the screen then scrolls where it needs to. */
export type Dim = { W: number; H: number; s: number; phone: boolean; st: number; sb: number };
const DIM0: Dim = { W: 800, H: 1280, s: 1, phone: false, st: 0, sb: 0 };

export type CalView = { mode: "day" | "week" | "month"; date: Date; who: string | null };
export type Sheet =
  | { mode: "event"; draft: EventDraft; occ?: string; back?: boolean }
  | { mode: "view"; e: import("./lib/events").Ev; cal: { name: string; color: string } }
  | { mode: "family"; back?: EventDraft }
  | { mode: "steps"; key: string }
  | { mode: "dinner"; date: string; cook: string | null }
  | { mode: "meals" };
export type EventDraft = {
  id: string; occ?: string; title: string; location: string; allDay: boolean; sd: string; st: string; ned: string; net: string;
  people: string[]; freq: string; interval: number; days: string[]; untilOn: boolean; until: string;
};

type Ctx = {
  S: HubState; people: Person[]; h24: boolean; dim: Dim; now: Date;
  refreshState: () => Promise<void>;
  cal: CalView; setCal: (f: (c: CalView) => CalView) => void;
  ovMode: "day" | "week"; setOvMode: (m: "day" | "week") => void;
  menuWeek: Date; setMenuWeek: (d: Date) => void;
  choreDay: Date; setChoreDay: (d: Date) => void;
  showDone: boolean; setShowDone: (b: boolean) => void;
  sheet: Sheet | null; openSheet: (s: Sheet | null) => void; closeSheet: () => void;
  toast: string; soon: (msg?: string) => void;
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
    const fit = () => {
      const iw = innerWidth, ih = innerHeight;
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
  useKeepAwake();
  const [cal, setCalState] = useState<CalView>({ mode: "day", date: nowZ(), who: null });
  const [ovMode, setOvMode] = useState<"day" | "week">("day");
  const [menuWeek, setMenuWeek] = useState(() => nowZ());
  const [choreDay, setChoreDay] = useState(() => nowZ());
  const [showDone, setShowDone] = useState(false);
  const [sheet, openSheet] = useState<Sheet | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const soon = useCallback((msg?: string) => {
    setToast(typeof msg === "string" ? msg : "Coming soon");
    clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 1800);
  }, []);
  const refreshState = useCallback(async () => { await qc.fetchQuery({ queryKey: ["state"], queryFn: () => api<HubState>("/api/state"), staleTime: 0 }); }, [qc]);
  const value = useMemo<Ctx>(() => ({
    S, people: DEMO && !S.people?.length ? DEMO_PEOPLE : S.people || [], h24: !!S.config.hour24, dim, now, refreshState,
    cal, setCal: f => setCalState(f), ovMode, setOvMode, menuWeek, setMenuWeek, choreDay, setChoreDay, showDone, setShowDone,
    sheet, openSheet, closeSheet: () => openSheet(null), toast, soon,
    ppOn: DEMO || !!S.config.pocketpals?.connected,
  }), [S, dim, now, refreshState, cal, ovMode, menuWeek, choreDay, showDone, sheet, toast, soon]);
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
