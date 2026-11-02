import type { Person } from "../lib/events";

/** Someone's round picture: their PocketPals pal when they have one, else their initial on a soft tint of their colour. */
export function Ava({ p, size, cls }: { p: Pick<Person, "name" | "color" | "pal">; size: number; cls?: string }) {
  return (
    <span className={"ava" + (cls ? " " + cls : "")} style={{ width: size, height: size, fontSize: Math.round(size * .44), background: `color-mix(in srgb, ${p.color} 20%, #fff)`, color: `color-mix(in srgb, ${p.color} 72%, #000)` }}>
      {p.pal ? <iframe className="palf" src={p.pal} tabIndex={-1} scrolling="no" aria-hidden="true" loading="lazy" /> : (p.name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}
