import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { addDays, dayDiff, fmtT, fromYmd, hmOf, longDay, shortDate, startOfDay, ymd } from "../lib/dates";
import { calOf, fetchEvents, type Ev, type EvData } from "../lib/events";
import { quickAdd } from "../lib/quickadd";
import { SHEET_MS } from "../lib/focus";
import { useHub, type EventDraft, type Sheet } from "../hub";
import { FamilyEditor } from "./Family";
import { EventDetails, EventSheet, QuickAddSheet } from "./EventSheets";
import { Lab, Pill, SheetFrame } from "./SheetFrame";
import { StepsSheet } from "./Chores";
import { FindSheet } from "./Find";
import { CountdownSheet } from "./Countdowns";
import { IngredientSheet } from "./Dinners";
import { DaySheet, PlanMealSheet, RuleSheet } from "./DinnerSheets";
import { PantryItemSheet, ShopItemSheet, UsePantrySheet } from "./PantrySheets";

const DAYCODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const dot = (c: string) => <i style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />;

export function newEventDraft(day: Date, hour: number | undefined, now: Date, who: string | null): EventDraft {
  const h = hour !== undefined ? hour : ymd(day) === ymd(now) ? Math.min(20, Math.max(8, now.getHours() + 1)) : 9;
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(h), (h % 1) * 60), e = new Date(+s + 3600000);
  return { id: "", title: "", location: "", allDay: false, sd: ymd(s), st: hmOf(s), ned: ymd(e), net: hmOf(e), people: who ? [who] : [], freq: "none", interval: 1, days: [DAYCODES[(s.getDay() + 6) % 7]], untilOn: false, until: ymd(addDays(s, 90)), notes: "", link: "", travel: 0, checklist: [], icon: "", remind: null };
}
export { loadEventDraft } from "./EventSheets";

const joinNames = (n: string[]) => n.length < 2 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1];
const QUICK_TIMES: [string, string][] = [["Morning", "09:00"], ["Lunchtime", "12:00"], ["After school", "15:30"], ["Evening", "18:00"]];
const ICONS = ["⚽", "🏊", "🎹", "🦷", "🎂", "🏥", "🛒", "🚌", "📚", "🎭", "🐶", "✈️", "🍽️", "🎉", "💼", "🏃"];
const TRAVEL: [number, string][] = [[0, "None"], [10, "10 min"], [15, "15 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "1 hour"]];
const REMIND: [number | null, string][] = [[null, "The usual"], [0, "None"], [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hour"]];
const LENGTHS: [number, string][] = [[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [180, "3 hours"]];

function FamilySheet({ back }: { back?: EventDraft }) {
  const { closeSheet, openSheet, people } = useHub();
  const [draft, setDraft] = useState(back);
  const finish = () => back ? openSheet({ mode: "event", draft: { ...draft!, people: draft!.people.filter(id => people.some(p => p.id === id)) } }) : closeSheet();
  return <SheetFrame title="Family" body={<FamilyEditor onAdded={id => setDraft(d => d && { ...d, people: [...d.people, id] })} />}
    foot={<button className="primary" onClick={finish} style={{ marginLeft: "auto", minWidth: 200 }}>Done</button>} />;
}

/** What a new dinner will look like, shown live as its name is typed. */
function SheetBody({ sheet }: { sheet: Sheet }) {
  switch (sheet.mode) {
    case "event": return <EventSheet draft={sheet.draft} />;
    case "view": return <EventDetails e={sheet.e} />;
    case "details": return <EventDetails e={sheet.e} />;
    case "quick": return <QuickAddSheet day={sheet.day} hour={sheet.hour} who={sheet.who} />;
    case "family": return <FamilySheet back={sheet.back} />;
    case "steps": return <StepsSheet k={sheet.key} />;
    case "dinner": return <DaySheet date={sheet.date} cook={sheet.cook} />;
    case "ingredient": return <IngredientSheet meal={sheet.meal} ing={sheet.ing} />;
    case "planmeal": return <PlanMealSheet meal={sheet.meal} />;
    case "rule": return <RuleSheet weekday={sheet.weekday} />;
    case "pitem": return <PantryItemSheet id={sheet.id} name={sheet.name} />;
    case "shopitem": return <ShopItemSheet id={sheet.id} />;
    case "usepantry": return <UsePantrySheet meal={sheet.meal} factor={sheet.factor} />;
    case "find": return <FindSheet />;
    case "countdown": return <CountdownSheet id={sheet.id} />;
  }
}

/** The bottom sheet. It keeps showing what it last held while it slides away. */
export function SheetHost() {
  const { sheet } = useHub();
  const [last, setLast] = useState<{ sheet: Sheet; n: number } | null>(null);
  if (sheet && (!last || last.sheet !== sheet)) setLast({ sheet, n: (last?.n ?? 0) + 1 });     // a new sheet starts with fresh fields
  return <section id="sheet" className={last && ["quick", "details", "view"].includes(last.sheet.mode) ? "short" : ""} role="dialog" aria-label="Event">{last ? <SheetBody key={last.n} sheet={last.sheet} /> : null}</section>;
}
