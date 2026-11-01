import { useEffect, useState, type CSSProperties } from "react";
import { useHold, wake } from "../lib/power";
import { addDays, fmtT, startOfDay } from "../lib/dates";
import { colorsOf, peopleOf } from "../lib/events";
import { EMPTY_EVENTS, useEvents } from "../data";
import { useHub } from "../hub";

/** A banner at the top of every screen for events about to start, so nobody is late. Tap it to put it away. */
export function Reminders() {
  const { S, now, dim, h24, people } = useHub();
  const lead = S.config.remind_min ?? 15;
  const [gone, setGone] = useState<string[]>([]);
  const day = startOfDay(now);
  const { data = EMPTY_EVENTS } = useEvents(day, addDays(day, 2));
  const soon = data.list
    .filter(e => !e.all_day && !gone.includes(e.id + e.start))
    .map(e => { const l = e.remind ?? lead, tr = e.travel || 0, m = Math.ceil((+e.s - +now) / 60000); return { e, m, tr, l, show: l > 0 && m >= 0 && m <= l + tr }; })
    .filter(x => x.show)
    .sort((a, b) => a.m - b.m)
    .slice(0, 2);
  useHold(soon.length > 0);
  useEffect(() => { if (soon.length) wake(); }, [soon.length]);      // something is about to start: bring the screen back
  if (!soon.length) return null;
  return (
    <div id="remind" role="status" aria-live="polite" style={{ bottom: 120 + dim.sb }}>
      {soon.map(({ e, m, tr }) => {
        const leave = Math.max(0, m - tr), badge = tr ? (leave < 1 ? "Leave now" : `Leave in ${leave} min`) : m < 1 ? "Now" : m === 1 ? "1 min" : `${m} min`;
        const ps = peopleOf(e, people), c = colorsOf(e, data, people)[0];
        return (
          <button key={e.id + e.start} className="rem" style={{ "--rc": c } as CSSProperties} onClick={() => setGone(g => [...g, e.id + e.start])} aria-label={`${e.title}, ${m < 1 ? "starting now" : `in ${m} minutes`}. Tap to dismiss`}>
            <span className={"rem-when num" + (tr ? " go" : "")}>{badge}</span>
            <span className="rem-what"><b>{e.title}</b><small>{fmtT(e.s, h24)}{tr ? ` · ${tr} min to get there` : ""}{ps.length ? " · " + ps.map(p => p.name).join(", ") : ""}</small>{e.checklist?.length ? <small className="rem-ck">Take: {e.checklist.join(" · ")}</small> : null}</span>
            <span className="rem-x" aria-hidden>Got it</span>
          </button>
        );
      })}
    </div>
  );
}
