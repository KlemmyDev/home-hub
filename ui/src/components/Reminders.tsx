import { useState, type CSSProperties } from "react";
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
  if (!lead) return null;
  const soon = data.list
    .filter(e => !e.all_day && !gone.includes(e.id + e.start))
    .map(e => ({ e, m: Math.ceil((+e.s - +now) / 60000) }))
    .filter(x => x.m >= 0 && x.m <= lead)
    .sort((a, b) => a.m - b.m)
    .slice(0, 2);
  if (!soon.length) return null;
  return (
    <div id="remind" role="status" aria-live="polite" style={{ bottom: 120 + dim.sb }}>
      {soon.map(({ e, m }) => {
        const ps = peopleOf(e, people), c = colorsOf(e, data, people)[0];
        return (
          <button key={e.id + e.start} className="rem" style={{ "--rc": c } as CSSProperties} onClick={() => setGone(g => [...g, e.id + e.start])} aria-label={`${e.title}, ${m < 1 ? "starting now" : `in ${m} minutes`}. Tap to dismiss`}>
            <span className="rem-when num">{m < 1 ? "Now" : m === 1 ? "1 min" : `${m} min`}</span>
            <span className="rem-what"><b>{e.title}</b><small>{fmtT(e.s, h24)}{ps.length ? " · " + ps.map(p => p.name).join(", ") : ""}</small></span>
            <span className="rem-x" aria-hidden>Got it</span>
          </button>
        );
      })}
    </div>
  );
}
