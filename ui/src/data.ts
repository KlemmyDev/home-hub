import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO, post } from "./lib/api";
import { addDays, nowZ, startOfDay, weekStart, ymd } from "./lib/dates";
import { fetchEvents, type EvData } from "./lib/events";
import { useHub } from "./hub";

/** Events from the hub (or sample ones with ?demo) for a range of days. They refresh every five minutes. */
export function useEvents(from: Date, to: Date) {
  return useQuery<EvData>({
    queryKey: ["events", +from, +to], queryFn: () => fetchEvents(from, to),
    refetchInterval: 300000, placeholderData: prev => prev,
  });
}
/** Fetch the days either side ahead of time, so a swipe lands on real events instead of the old ones. */
export function usePrefetchEvents() {
  const qc = useQueryClient();
  return (ranges: [Date, Date][]) => ranges.forEach(([a, b]) => qc.prefetchQuery({ queryKey: ["events", +a, +b], queryFn: () => fetchEvents(a, b), staleTime: 60000 }));
}
export const EMPTY_EVENTS: EvData = { list: [], cals: {} };

export type Product = { code: string; name: string; brand: string; quantity: string; image: string };
export type Ingredient = { id: string; name: string; amount: string; product: Product | null; staple: boolean; alt?: Product | null };
export type Meal = { id: string; name: string; ingredients?: Ingredient[]; notes?: string; link?: string; serves?: number; minutes?: number; tags?: string[]; favourite?: boolean; ratings?: Record<string, number>; suits?: string[] };
export type Night = { meal: string; cook?: string; kind?: string; away?: string[]; serves?: number };
export type Dinners = { meals: Meal[]; plan: Record<string, Night>; pantry?: { name: string; low: boolean }[]; rules?: Record<string, { meal: string; kind: string }> };
export const KINDS: Record<string, string> = { leftovers: "Leftovers", takeaway: "Takeaway", out: "Eating out" };
export const DIETS = ["Vegetarian", "Vegan", "Dairy-free", "Gluten-free", "Nut-free", "Egg-free"];
export function useDinners() {
  return useQuery<Dinners>({ queryKey: ["dinners"], queryFn: () => DEMO ? Promise.resolve(demoDinners()) : api("/api/dinners"), refetchInterval: 300000 });
}
/** Sample dinners for ?demo: a week of them, starting this Monday. */
function demoDinners(): Dinners {
  const names = ["Spaghetti Bolognese", "Fish and chips", "Chicken curry", "Tacos", "Homemade pizza", "Roast chicken", ""];
  const extra = ["Sausages and mash", "Beef stir fry", "Mac and cheese", "Pumpkin soup", "Pancakes", "Burgers", "Lasagne", "Sushi night"];
  const sample: Record<string, [string, string][]> = {
    "Spaghetti Bolognese": [["Spaghetti", "500 g"], ["Beef mince", "500 g"], ["Passata", "1 jar"], ["Onion", "1"], ["Garlic", "2 cloves"]],
    "Tacos": [["Taco shells", "1 box"], ["Beef mince", "500 g"], ["Cheese", "1 cup"], ["Lettuce", "1"]],
  };
  const meals: Meal[] = [...names.filter(Boolean), ...extra].map((name, i) => ({ id: "m" + i, name, serves: 4, minutes: 30, tags: i % 3 === 0 ? ["Quick"] : [], favourite: i < 2, ingredients: (sample[name] || []).map(([n, amount], j) => ({ id: `i${i}x${j}`, name: n, amount, product: null, staple: n === "Garlic" || n === "Onion" })) }));
  const w = weekStart(startOfDay(nowZ())), plan: Dinners["plan"] = {};
  names.forEach((n, i) => { if (n) plan[ymd(addDays(w, i))] = { meal: "m" + i, cook: ["d", "m", "a", "d", "m", "d", ""][i] || undefined }; });
  return { meals, plan };
}
export function dinnerFor(din: Dinners | undefined, people: { id: string; name: string; color?: string }[], day: Date) {
  const p = din?.plan[ymd(day)], m = p && din?.meals.find(x => x.id === p.meal);
  if (p?.kind && KINDS[p.kind]) return { name: KINDS[p.kind], cook: "", cookColor: "" };
  if (!m) return null;
  const cook = people.find(x => x.id === p.cook);
  return { name: m.name, cook: cook ? cook.name : "", cookColor: cook?.color || "" };
}

export type ShopItem = { id: string; name: string; done: boolean; note?: string; barcode?: string; from?: string; aisle?: string; store?: string; pantry?: string; qty?: number; unit?: string; auto?: boolean };
export const useShopping = () => useQuery<{ items: ShopItem[] }>({ queryKey: ["shopping"], queryFn: () => api("/api/shopping"), refetchInterval: 60000 });

/* ---------- WattsMyPower (the house's energy) ---------- */
export type Energy<T = any> = { connected: boolean; allowed?: boolean; needs?: string; error?: string; data?: T };
/** A reading from WattsMyPower, through the hub (which holds the key). It's refreshed every half minute while the screen is up. */
export const useEnergy = <T = any>(what: string, query = "", enabled = true) =>
  useQuery<Energy<T>>({ queryKey: ["energy", what, query], enabled: enabled && (!DEMO || what === "today"), queryFn: () => DEMO ? Promise.resolve(demoEnergy() as Energy<T>) : api(`/api/energy/${what}${query ? "?" + query : ""}`), refetchInterval: 30000, staleTime: 10000 });
/** A sunny afternoon for ?demo: solar running the house, filling the battery and selling the rest. */
const demoEnergy = (): Energy => ({ connected: true, allowed: true, data: {
  live: { snapshot: { pv_power: 4230, load_power: 1310, battery_power: -2100, battery_soc: 78, grid_power: -820, daily_pv: 18.6, daily_import: 2.1, daily_export: 6.4 } },
  costs: { saved: 4.2, net_cost: 0.85 },
} });

/* ---------- the pantry ---------- */
export type Store = { id: string; name: string; color: string };
export type PItem = { id: string; name: string; qty: number; unit: string; min: number; want: number; store: string; auto: boolean; product: Product | null; note: string; aisle?: string };
export type PantryData = { stores: Store[]; items: PItem[]; settings: { auto_restock: boolean; ask_before_use: boolean } };
export const NO_PANTRY: PantryData = { stores: [], items: [], settings: { auto_restock: true, ask_before_use: true } };
export const usePantry = () => useQuery<PantryData>({ queryKey: ["pantry"], queryFn: () => DEMO ? Promise.resolve(demoPantry()) : api("/api/pantry"), refetchInterval: 60000 });
/** Out (none left), low (under its minimum) or fine. */
export const stockLevel = (i: PItem): "out" | "low" | "ok" => i.qty <= 0 ? "out" : i.min > 0 && i.qty < i.min ? "low" : "ok";
function demoPantry(): PantryData {
  const stores: Store[] = [{ id: "t1", name: "Woolworths", color: "#14a06c" }, { id: "t2", name: "Aldi", color: "#2f6fe0" }, { id: "t3", name: "Butcher", color: "#e2523f" }];
  const it = (id: string, name: string, qty: number, unit: string, min: number, want: number, store: string, auto = true, aisle = "Pantry"): PItem => ({ id, name, qty, unit, min, want, store, auto, product: null, note: "", aisle });
  return { stores, settings: { auto_restock: true, ask_before_use: true }, items: [it("p1", "Flour", 1.2, "kg", 0.5, 2, "t1"), it("p2", "Rice", 0.3, "kg", 0.5, 2, "t2"), it("p3", "Pasta", 3, "pack", 2, 5, "t2"), it("p4", "Olive oil", 0, "bottle", 1, 2, "t1"), it("p5", "Basil", 1, "bunch", 0, 0, "t1", false, "Fruit and veg"), it("p6", "Beef mince", 0.5, "kg", 0, 0, "t3", true, "Frozen"), it("p7", "Spaghetti", 1, "pack", 1, 3, "t2"), it("p8", "Passata", 0, "jar", 1, 2, "t1")] };
}

/* ---------- PocketPals jobs ---------- */
export type Step = { id: number; title: string; done: boolean };
export type Job = { kid_id: number; chore_id: number; title: string; status: string | null; tickable?: boolean; steps?: Step[]; steps_left?: number; steps_tickable?: boolean };
export type Kid = { id: number; name: string; species?: string; pal_url?: string };
export type ChoreDay = { date: string; jobs: Job[]; away?: number[] };
export type Chores = { kids: Kid[]; tick: boolean; error: string; days: Record<string, ChoreDay> };
export const NO_CHORES: Chores = { kids: [], tick: false, error: "", days: {} };

/** Sample jobs for ?demo, so the chores screens can be seen without PocketPals. */
function demoChores(from: Date, to: Date): Chores {
  const kids: Kid[] = [{ id: 1, name: "Kid one", species: "fox" }, { id: 2, name: "Kid two", species: "owl" }, { id: 3, name: "Kid three", species: "frog" }];
  const plan: [number, string, string | null][][] = [
    [[1, "Make your bed", "pending"], [1, "Brush teeth", "pending"], [1, "Feed the dog", null], [1, "Set the table", null], [2, "Homework", "approved"], [2, "Pack school bag", "pending"], [2, "Empty the dishwasher", null], [3, "Water the plants", null], [3, "Tidy your room", null]],
  ];
  const days: ChoreDay[] = [];
  for (let d = startOfDay(from); d <= startOfDay(to); d = addDays(d, 1)) {
    const jobs: Job[] = plan[0].map(([kid_id, title, status], i) => ({ kid_id, chore_id: i + 1, title, status, tickable: true, ...(title === "Tidy your room" ? { steps: [{ id: 1, title: "Toys in the box", done: true }, { id: 2, title: "Books on the shelf", done: false }, { id: 3, title: "Clothes in the basket", done: false }], steps_left: 2, steps_tickable: true } : {}) }));
    days.push({ date: ymd(d), jobs, away: [] });
  }
  return { kids, tick: true, error: "", days: Object.fromEntries(days.map(d => [d.date, d])) };
}
export function useChores(from: Date, to: Date) {
  const { ppOn } = useHub();
  return useQuery<Chores>({
    queryKey: ["chores", ymd(from), ymd(to)], enabled: ppOn, refetchInterval: 60000,     // jobs ticked elsewhere show up within a minute
    queryFn: async () => {
      if (DEMO) return demoChores(from, to);
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
