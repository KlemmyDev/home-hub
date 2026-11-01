import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO, post } from "./lib/api";
import { ymd } from "./lib/dates";
import { fetchEvents, type EvData } from "./lib/events";
import { useHub } from "./hub";

/** Events from the hub (or sample ones with ?demo) for a range of days. They refresh every five minutes. */
export function useEvents(from: Date, to: Date) {
  return useQuery<EvData>({
    queryKey: ["events", +from, +to], queryFn: () => fetchEvents(from, to),
    refetchInterval: 300000, placeholderData: prev => prev,
  });
}
export const EMPTY_EVENTS: EvData = { list: [], cals: {} };

export type Meal = { id: string; name: string };
export type Dinners = { meals: Meal[]; plan: Record<string, { meal: string; cook?: string }> };
export function useDinners() {
  return useQuery<Dinners>({ queryKey: ["dinners"], queryFn: () => DEMO ? Promise.resolve({ meals: [], plan: {} }) : api("/api/dinners"), refetchInterval: 300000 });
}
export function dinnerFor(din: Dinners | undefined, people: { id: string; name: string }[], day: Date) {
  const p = din?.plan[ymd(day)], m = p && din?.meals.find(x => x.id === p.meal);
  if (!m) return null;
  const cook = people.find(x => x.id === p.cook);
  return { name: m.name, cook: cook ? cook.name : "" };
}

export type ShopItem = { id: string; name: string; done: boolean };
export const useShopping = () => useQuery<{ items: ShopItem[] }>({ queryKey: ["shopping"], queryFn: () => api("/api/shopping") });

/* ---------- PocketPals jobs ---------- */
export type Step = { id: number; title: string; done: boolean };
export type Job = { kid_id: number; chore_id: number; title: string; status: string | null; tickable?: boolean; steps?: Step[]; steps_left?: number; steps_tickable?: boolean };
export type Kid = { id: number; name: string; species?: string; pal_url?: string };
export type ChoreDay = { date: string; jobs: Job[]; away?: number[] };
export type Chores = { kids: Kid[]; tick: boolean; error: string; days: Record<string, ChoreDay> };
export const NO_CHORES: Chores = { kids: [], tick: false, error: "", days: {} };

export function useChores(from: Date, to: Date) {
  const { ppOn } = useHub();
  return useQuery<Chores>({
    queryKey: ["chores", ymd(from), ymd(to)], enabled: ppOn, refetchInterval: 60000,     // jobs ticked elsewhere show up within a minute
    queryFn: async () => {
      const r = await api(`/api/chores?from=${ymd(from)}&to=${ymd(to)}`);
      if (!r.connected) return NO_CHORES;
      if (r.error) return { ...NO_CHORES, error: r.error };
      return { kids: r.kids, tick: !!r.tick, error: "", days: Object.fromEntries(r.days.map((d: ChoreDay) => [d.date, d])) };
    },
  });
}
/** Shows a change to the jobs at once, in every cached range; the caller undoes it if PocketPals says no. */
export function usePatchChores() {
  const qc = useQueryClient();
  return (fn: (c: Chores) => void) => qc.setQueriesData<Chores>({ queryKey: ["chores"] }, old => { if (!old) return old; const c = structuredClone(old); fn(c); return c; });
}

export const useInvalidate = () => { const qc = useQueryClient(); return (...keys: string[]) => Promise.all(keys.map(k => qc.invalidateQueries({ queryKey: [k] }))); };
export { post };
