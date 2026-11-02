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
  const meals: Meal[] = [...names.filter(Boolean), ...extra].map((name, i) => ({ id: "m" + i, name, serves: 4, minutes: 30, tags: i % 3 === 0 ? ["Quick"] : [], favourite: i < 2, notes: name === "Spaghetti Bolognese" ? "Brown the mince in a big pan, breaking it up.\nAdd the onion and garlic and cook until soft.\nPour in the passata, then simmer for 20 minutes.\nCook the spaghetti while the sauce simmers.\nDrain, and serve with the sauce on top." : undefined, ingredients: (sample[name] || []).map(([n, amount], j) => ({ id: `i${i}x${j}`, name: n, amount, product: null, staple: n === "Garlic" || n === "Onion" })) }));
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
export const useEnergy = <T = any>(what: string, query = "", enabled = true, every = 30000) =>
  useQuery<Energy<T>>({ queryKey: ["energy", what, query], enabled, queryFn: () => DEMO ? Promise.resolve(demoEnergy(what) as Energy<T>) : api(`/api/energy/${what}${query ? "?" + query : ""}`), refetchInterval: every, staleTime: 10000, placeholderData: prev => prev });

/** One WattsMyPower history series: the times (unix seconds) and each field's readings, null where there's a gap. */
export type Series = { t: number[] } & Record<string, (number | null)[]>;

/* A sunny day for ?demo: solar running the house, filling the battery and selling the rest. Every reading agrees with the others. */
const sunAt = (h: number) => h < 6.2 || h > 18.8 ? 0 : 5200 * Math.pow(Math.sin(Math.PI * (h - 6.2) / 12.6), 1.6) * (h > 13.5 && h < 14.2 ? .55 : 1);
const homeAt = (h: number) => 380 + (h > 6.5 && h < 8.5 ? 1400 : 0) + (h > 17 && h < 20.5 ? 1900 : 0) + (h > 12 && h < 13 ? 900 : 0) + 120 * Math.sin(h * 3);
function demoDay(upTo: number) {
  const t: number[] = [], pv: number[] = [], load: number[] = [], bat: number[] = [], grid: number[] = [], soc: number[] = [];
  const mid = startOfDay(nowZ()).getTime() / 1000;
  let s = 46, made = 0, imp = 0, exp = 0;
  for (let m = 0; m <= upTo; m += 10) {
    const h = m / 60, p = sunAt(h), l = homeAt(h);
    let b = 0, g = 0, spare = p - l;
    if (spare > 0) { const room = s < 100 ? Math.min(spare, 3000) : 0; b = -room; g = -(spare - room); }
    else { const want = -spare, give = s > 12 ? Math.min(want, 2500) : 0; b = give; g = want - give; }
    s = Math.max(10, Math.min(100, s - b * (10 / 60) / 13500 * 100));
    made += p / 6000; if (g > 0) imp += g / 6000; else exp -= g / 6000;
    t.push(mid + m * 60); pv.push(Math.round(p)); load.push(Math.round(l)); bat.push(Math.round(b)); grid.push(Math.round(g)); soc.push(Math.round(s * 10) / 10);
  }
  return { t, pv, load, bat, grid, soc, made, imp, exp };
}
function demoEnergy(what: string): Energy {
  const now = nowZ(), mins = now.getHours() * 60 + now.getMinutes(), d = demoDay(mins), i = d.t.length - 1;
  const snapshot = { pv_power: d.pv[i], load_power: d.load[i], battery_power: d.bat[i], battery_soc: d.soc[i], grid_power: d.grid[i], daily_pv: +d.made.toFixed(1), daily_import: +d.imp.toFixed(1), daily_export: +d.exp.toFixed(1) };
  const days = (n: number) => Array.from({ length: n }, (_, k) => ymd(addDays(now, k - n + 1)));
  const wob = (k: number) => [0.92, 0.55, 1.04, 0.81, 0.98, 0.7, 1][k % 7];
  const today = { date: ymd(now), net_cost: +(d.imp * 0.32 + 1.1 - d.exp * 0.06).toFixed(2), saved: +(d.made * 0.24).toFixed(2), import_kwh: d.imp, export_kwh: d.exp };
  const data: Record<string, any> = {
    live: { snapshot },
    today: { live: { snapshot }, costs: today },
    history: { bucket: 600, source: "samples", series: { t: d.t, pv_power: d.pv, load_power: d.load, battery_power: d.bat, grid_power: d.grid, battery_soc: d.soc } },
    daily: days(7).map((date, k) => k === 6 ? { date, daily_pv: snapshot.daily_pv, daily_import: snapshot.daily_import, daily_export: snapshot.daily_export, daily_charge: 6, daily_discharge: 1.5 } : { date, daily_pv: +(31 * wob(k)).toFixed(1), daily_import: +(3 + 6 * (1 - wob(k))).toFixed(1), daily_export: +(14 * wob(k) - 3).toFixed(1), daily_charge: 9, daily_discharge: 8.4 }),
    costs: { type: "tou", days: days(7).map((date, k) => k === 6 ? today : { date, net_cost: +(1.1 + 3.2 * (1 - wob(k)) - 0.6 * wob(k)).toFixed(2), saved: +(7.4 * wob(k)).toFixed(2) }) },
    forecast: {
      summary: { pv_kwh_24h: 24.8, full_at: Math.round(+startOfDay(now) / 1000 + 14.2 * 3600), min_soc_tonight: 31 },
      days: [0, 1, 2].map(k => ({ date: ymd(addDays(now, k)), pv_kwh: [12.4, 27.9, 15.2][k], load_kwh: [9.6, 17.1, 16.8][k], code: [1, 0, 61][k], temp_min: [14, 13, 12][k], temp_max: [24, 26, 19][k], max_soc: [100, 100, 82][k], min_soc: [31, 28, 30][k], full_at: k === 2 ? null : Math.round(+startOfDay(addDays(now, k)) / 1000 + [14.2, 12.6][k] * 3600) })),
    },
    insights: { last30: { days: 30, pv: 812, imp: 96, exp: 402, home: 470, self_pct: 79.6 }, prev30: { days: 30, pv: 701, imp: 131, exp: 330, home: 466, self_pct: 71.9 } },
  };
  return { connected: true, allowed: true, data: data[what] };
}

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
export type Job = { kid_id: number; chore_id: number; title: string; status: string | null; slot?: string; tickable?: boolean; steps?: Step[]; steps_left?: number; steps_tickable?: boolean };
export type Kid = { id: number; name: string; species?: string; pal_url?: string };
export type ChoreDay = { date: string; jobs: Job[]; away?: number[] };
export type Chores = { kids: Kid[]; tick: boolean; error: string; days: Record<string, ChoreDay> };
export const NO_CHORES: Chores = { kids: [], tick: false, error: "", days: {} };

/** Sample jobs for ?demo, so the chores screens can be seen without PocketPals. */
function demoChores(from: Date, to: Date): Chores {
  const kids: Kid[] = [{ id: 1, name: "Kid one", species: "fox" }, { id: 2, name: "Kid two", species: "owl" }, { id: 3, name: "Kid three", species: "frog" }];
  const plan: [number, string, string | null, string][] = [
    [1, "Make your bed", "pending", "morning"], [1, "Brush teeth", "pending", "morning"], [1, "Feed the dog", null, "school"], [1, "Set the table", null, "dinner"], [2, "Homework", "approved", "school"], [2, "Pack school bag", "pending", "morning"], [2, "Empty the dishwasher", null, "dinner"], [2, "Lay out pyjamas", null, "bed"], [3, "Water the plants", null, "school"], [3, "Tidy your room", null, "bed"],
  ];
  const today = startOfDay(nowZ());
  const days: ChoreDay[] = [];
  for (let d = startOfDay(from); d <= startOfDay(to); d = addDays(d, 1)) {
    const past = d < today, future = d > today, day = d.getDate();
    // Earlier days are mostly done (one or two left here and there), later ones not started.
    const jobs: Job[] = plan.map(([kid_id, title, st, slot], i) => ({ kid_id, chore_id: i + 1, title, slot, status: future ? null : past ? ((day + i) % 7 === 0 ? null : "approved") : st, tickable: !future, ...(title === "Tidy your room" ? { steps: [{ id: 1, title: "Toys in the box", done: true }, { id: 2, title: "Books on the shelf", done: false }, { id: 3, title: "Clothes in the basket", done: false }], steps_left: 2, steps_tickable: true } : {}) }));
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
