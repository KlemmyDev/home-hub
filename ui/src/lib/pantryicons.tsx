/* Pictures for the things in the pantry: fruit, veg, meat, tins, bottles, cleaning things and more. Drawn here as flat
   48 x 48 SVGs (no files, nothing from the internet). An item finds its picture by its name; if nothing fits, it gets
   a plain one for its aisle. (The dinners have their own pictures in foodicons.tsx.) */
import type { CSSProperties } from "react";
import * as S from "./pantryshapes";
import { PRODUCE } from "./pantrydata1";
import { FRESH } from "./pantrydata2";
import { STAPLES } from "./pantrydata3";
import { HOUSE } from "./pantrydata4";

export type ItemPic = { id: string; name: string; bg: string; keys: string[]; svg: string };

const wrap = (inner: string) => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
export const ITEM_PICS: ItemPic[] = [...PRODUCE, ...FRESH, ...STAPLES, ...HOUSE].map(([id, name, bg, keys, svg]) => ({ id, name, bg, keys: keys.split(","), svg: wrap(svg) }));

/** What an item with no picture of its own gets, by aisle. */
const PLAIN: Record<string, ItemPic> = {
  "Fruit and veg": { id: "p-veg", name: "Fruit and veg", bg: "#e8f5da", keys: [], svg: wrap(S.round("#7bc65a")) },
  "Meat and fish": { id: "p-meat", name: "Meat and fish", bg: "#fde0dc", keys: [], svg: wrap(S.steak()) },
  "Dairy and eggs": { id: "p-dairy", name: "Dairy and eggs", bg: "#e4effb", keys: [], svg: wrap(S.carton("#fff", "#3a82e0", S.mark("drop", "#3a82e0"))) },
  "Bakery": { id: "p-bakery", name: "Bakery", bg: "#fdf0d8", keys: [], svg: wrap(S.loaf()) },
  "Pantry": { id: "p-pantry", name: "Pantry", bg: "#f6f1e4", keys: [], svg: wrap(S.jar("#c98a3a", "#7a4a2a", "#fff3dc", S.mark("star", "#c98a3a"))) },
  "Frozen": { id: "p-frozen", name: "Frozen", bg: "#e4effb", keys: [], svg: wrap(S.bag("#9ec9f0", "#fff", S.mark("snow", "#3a82e0"), "#7ab8f5")) },
  "Drinks": { id: "p-drinks", name: "Drinks", bg: "#e0f2f7", keys: [], svg: wrap(S.bottle("#7ad0c4", "#0ea5b7", "#fff", S.mark("drop", "#0ea5b7"))) },
  "Snacks": { id: "p-snacks", name: "Snacks", bg: "#fdf3c4", keys: [], svg: wrap(S.bag("#f2c23e", "#fff", S.mark("star", "#e2523f"), "#e0a526")) },
  "Household": { id: "p-house", name: "Household", bg: "#e4f5f0", keys: [], svg: wrap(S.spray("#7ad0c4", "#e2523f", "#fff", S.mark("bubbles", "#0ea5b7"))) },
};
const OTHER: ItemPic = { id: "p-other", name: "Item", bg: "#eef1f6", keys: [], svg: wrap(S.pack("#a8b4c8", "#fff", S.mark("star", "#a8b4c8"))) };
export const plainPic = (aisle?: string) => PLAIN[aisle || ""] || OTHER;

const words = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();
const stem = (w: string) => w.length > 3 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 4 && /(ches|shes|xes|oes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
const stemAll = (s: string) => s.split(" ").map(stem).join(" ");
const has = (hay: string, key: string) => (" " + hay + " ").includes(" " + key + " ");

/* Every key is stemmed once up front, so matching a name is a quick scan. */
const KEYED = ITEM_PICS.flatMap(p => p.keys.map(k => { const kk = words(k); return { p, k: kk, ks: stemAll(kk), len: kk.length + (kk.includes(" ") ? 40 : 0) }; }));

/** The picture that best fits an item's name: a longer phrase beats a shorter one ("olive oil" beats "oil"). */
export function picFor(name: string, aisle?: string): ItemPic {
  const n = words(name);
  if (!n) return plainPic(aisle);
  const ns = stemAll(n);
  let best: ItemPic | null = null, score = 0;
  for (const e of KEYED) {
    if (e.len <= score) continue;
    if (has(n, e.k) || has(ns, e.ks)) { best = e.p; score = e.len; }
  }
  return best || plainPic(aisle);
}

/** An item's picture on a soft rounded tile. */
export function ItemIcon({ name, aisle, size = 48, tile = true, style }: { name: string; aisle?: string; size?: number; tile?: boolean; style?: CSSProperties }) {
  const p = picFor(name, aisle);
  return (
    <span className="fico" aria-hidden="true" style={{ width: size, height: size, borderRadius: size * .32, background: tile ? p.bg : "none", flex: "none", ...style }}>
      <span style={{ width: size * .78, height: size * .78, display: "block" }} dangerouslySetInnerHTML={{ __html: p.svg }} />
    </span>
  );
}
