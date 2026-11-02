import { api, DEMO } from "./api";
import { addDays, fromZoned, startOfDay, toZoned } from "./dates";

export const PALETTE = ["#2f6fe0", "#e2523f", "#14a06c", "#e5487f", "#7b5cf0", "#f59e0b", "#0ea5b7"];
export const tint = (c: string) => c + "2b";

/** A family member. `pal` is their PocketPals pal (a picture of just its face), when PocketPals knows them; their colour is then the pal's. */
export type Person = { id: string; name: string; color: string; birthday?: string; diet?: string[]; pal?: string };
export type CalInfo = { id: string; name: string; color: string; ok: boolean; error?: string };
export type Ev = {
  id: string; title: string; location: string; all_day: boolean; cal?: string; hub?: boolean; fixed?: boolean; notes?: string; link?: string; travel?: number; checklist?: string[]; icon?: string; remind?: number | null; name?: string; series?: string; people?: string[];
  start?: string; end?: string; s: Date; e: Date;
};
export type EvData = { list: Ev[]; cals: Record<string, CalInfo> };

const dateOf = (s: string, allDay: boolean) => { if (allDay) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); } return s.endsWith("Z") ? toZoned(new Date(s)) : new Date(s); };      // an instant reads in the family's zone; a wall-clock time already does
const prep = (e: any): Ev => ({ ...e, name: e.title, title: e.icon ? e.icon + " " + e.title : e.title, s: dateOf(e.start, e.all_day), e: dateOf(e.end, e.all_day) });

export function onDay(e: Ev, day: Date) {
  const a = startOfDay(day), b = addDays(a, 1);
  return e.s < b && (e.e > a || (+e.e === +e.s && e.s >= a));
}

export const peopleOf = (e: Ev, people: Person[]) => (e.people || []).map(id => people.find(p => p.id === id)).filter(Boolean) as Person[];
export function calOf(e: Ev, data: EvData, people: Person[]) {
  if (e.hub) { const ps = peopleOf(e, people); return { name: ps.map(p => p.name).join(" and "), color: ps.length ? ps[0].color : "#8a93a6", ok: true }; }
  return (e.cal && data.cals[e.cal]) || { name: "", color: "#8a93a6", ok: true };
}
export const colorsOf = (e: Ev, data: EvData, people: Person[]) => e.hub ? (peopleOf(e, people).length ? peopleOf(e, people).map(p => p.color) : ["#8a93a6"]) : [calOf(e, data, people).color];
export const visibleTo = (e: Ev, who: string | null) => !who || (!!e.hub && (e.people || []).includes(who));

export const DEMO_PEOPLE: Person[] = [["d", "Dad"], ["m", "Mum"], ["a", "Kid one"], ["b", "Kid two"]].map(([id, name], i) => ({ id, name, color: PALETTE[i] }));

function demoData(from: Date, to: Date): EvData {
  const week: [number, number, number, string, string][][] = [   // by weekday, Monday first: [hour, minute, minutes long, title, people]
    [[8, 15, 45, "School run", "a,b"], [9, 30, 90, "Planning call", "d"], [15, 15, 45, "Dentist", "b"], [17, 15, 60, "Football training", "a"]],
    [[12, 0, 480, "Late shift", "m"], [16, 0, 60, "Swim", "b"]],
    [[15, 45, 75, "Drama club", "a"], [18, 30, 60, "Gym", "d"]],
    [[17, 30, 60, "Cubs", "a"], [18, 30, 90, "School disco", "b"]],
    [[15, 30, 60, "Sleepover", "b"], [18, 0, 120, "Movie night", "m,a,b"]],
    [[10, 0, 120, "Football match", "a,d"], [18, 30, 90, "Dinner out", "d,m"]],
    [[12, 30, 150, "Lunch at Gran's", "d,m,a,b"], [16, 0, 60, "Homework hour", "a,b"]],
  ];
  const list: Ev[] = [];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const wd = (d.getDay() + 6) % 7;
    for (const [h, mi, len, title, who] of week[wd]) {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi);
      list.push({ id: title + +d, title, location: "", hub: true, people: who.split(","), all_day: false, s, e: new Date(+s + len * 60000) });
    }
    if (wd === 3) list.push({ id: "bins" + +d, title: "Bins out", location: "", hub: true, people: ["d"], all_day: true, s: d, e: addDays(d, 1) });
  }
  return { list, cals: {} };
}

export async function fetchEvents(from: Date, to: Date): Promise<EvData> {
  if (DEMO) return demoData(from, to);
  const r = await api(`/api/events?from=${encodeURIComponent(fromZoned(from).toISOString())}&to=${encodeURIComponent(fromZoned(to).toISOString())}`);
  return { list: r.events.map(prep), cals: Object.fromEntries(r.calendars.map((c: CalInfo) => [c.id, c])) };
}

/** Timed events on one day, side by side where they overlap. */
export type Lane = { ev: Ev; s: Date; e: Date; col: number; cols: number };
export function laneUp(evs: { ev: Ev; s: Date; e: Date }[]): Lane[] {
  const out: Lane[] = []; let cluster: Lane[] = [], ends: number[] = [], clusterEnd = 0;
  const flush = () => { const n = ends.length; cluster.forEach(x => x.cols = n); out.push(...cluster); cluster = []; ends = []; };
  for (const x of evs) {
    if (cluster.length && +x.s >= clusterEnd) flush();
    let col = ends.findIndex(t => t <= +x.s);
    if (col < 0) { col = ends.length; ends.push(0); }
    ends[col] = +x.e; clusterEnd = Math.max(clusterEnd, +x.e);
    cluster.push({ ...x, col, cols: 1 });
  }
  flush();
  return out;
}
export function timedOn(list: Ev[], day: Date): Lane[] {
  const a = startOfDay(day), b = addDays(a, 1);
  const items = list.filter(e => !e.all_day && onDay(e, day)).map(e => {
    const s = e.s < a ? a : e.s;
    let en = e.e > b ? b : e.e;
    if (+en - +s < 30 * 60000) en = new Date(+s + 30 * 60000);
    return { ev: e, s, e: en };
  });
  return laneUp(items.sort((x, y) => +x.s - +y.s));
}
