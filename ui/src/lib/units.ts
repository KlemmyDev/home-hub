/* Amounts and units: "500 g" in a recipe against "1.5 kg" in the pantry. */

type Fam = "mass" | "volume" | "count";
const TO_BASE: Record<string, [Fam, number]> = {
  g: ["mass", 1], gram: ["mass", 1], grams: ["mass", 1], kg: ["mass", 1000], kilo: ["mass", 1000], kilos: ["mass", 1000], oz: ["mass", 28.35], lb: ["mass", 453.6],
  ml: ["volume", 1], l: ["volume", 1000], litre: ["volume", 1000], litres: ["volume", 1000], cup: ["volume", 250], cups: ["volume", 250], tbsp: ["volume", 15], tsp: ["volume", 5],
};
const COUNTISH = new Set(["", "each", "ea", "x", "whole"]);
const norm = (u: string) => u.trim().toLowerCase().replace(/\.$/, "");
const singular = (u: string) => u.replace(/(es|s)$/, "");

/** The units the pantry offers; anything else can be typed. */
export const UNITS = ["each", "g", "kg", "ml", "L", "pack", "tin", "jar", "bottle", "bag", "box", "bunch"];
/** How much one tap of + or − changes an amount, by unit. */
export const stepFor = (unit: string) => ({ g: 100, kg: 0.5, ml: 100, l: 0.5 } as Record<string, number>)[norm(unit)] ?? 1;

/** Splits "500 g", "1/2 cup", "2" or "1½ tins" into a number and the words after it. */
export function parseAmount(text: string): { n: number; unit: string } | null {
  const m = text.trim().match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+)|([½¼¾]))?\s*([^\d].*)?$/);
  if (!m || (m[1] === undefined && m[2] === undefined && m[4] === undefined)) return null;
  const fr = m[2] ? +m[2] / +m[3] : m[4] ? ({ "½": .5, "¼": .25, "¾": .75 } as Record<string, number>)[m[4]] : 0;
  return { n: (m[1] ? parseFloat(m[1]) : 0) + fr, unit: (m[5] || "").trim() };
}

/** How much of `unit` an amount like "500 g" comes to, or null when the two can't be compared (a clove against a kilo). */
export function amountIn(amount: string, unit: string): number | null {
  const a = parseAmount(amount);
  if (!a) return null;
  const from = norm(a.unit), to = norm(unit), fb = TO_BASE[from], tb = TO_BASE[to];
  if (fb && tb) return fb[0] === tb[0] ? Math.round((a.n * fb[1] / tb[1]) * 1000) / 1000 : null;
  if (fb || tb) return null;
  if ((COUNTISH.has(from) && COUNTISH.has(to)) || singular(from) === singular(to)) return a.n;
  if (COUNTISH.has(from) && to) return a.n;      // "2" of something kept in packs, tins or jars: count them the same
  return null;
}

/** 1.5 kg, 3 tins, 0.25 L: tidy, with no trailing zeros. */
export function fmtQty(n: number, unit: string): string {
  const v = Math.round(n * 100) / 100, u = unit.trim();
  const many = v !== 1 && /^(pack|tin|jar|bottle|bag|box|bunch)$/i.test(u) ? u + (/ch$/i.test(u) ? "es" : "s") : u;
  return many && !(COUNTISH.has(norm(u)) && v !== 1 && false) ? `${v} ${many}` : `${v}`;
}

/** The unit a thing is most likely kept in, guessed from its name (the person can change it). */
const GUESS: [RegExp, string][] = [
  [/\b(oil|vinegar|sauce|wine|soy|dressing|syrup|essence|extract)\b/, "bottle"],
  [/\b(tinned|canned|beans|chickpeas?|lentils? tin|tuna|corn|coconut milk|tomatoes tin|baked beans)\b/, "tin"],
  [/\b(passata|jam|honey|peanut butter|spread|mustard|pesto|chutney|relish|paste)\b/, "jar"],
  [/\b(milk|juice|cordial|water|cream|stock|soup|yoghurt|yogurt|soda)\b/, "L"],
  [/\b(rice|flour|sugar|potatoes?|onions?|carrots?|mince|chicken|beef|pork|lamb|oats|lentils?|salt|apples?|sweet potato|pumpkin|cheese block)\b/, "kg"],
  [/\b(spices?|paprika|cumin|cinnamon|pepper|turmeric|oregano|herbs?|basil|parsley|thyme|rosemary|chilli|nutmeg|cloves)\b/, "g"],
  [/\b(pasta|spaghetti|noodles?|bread|tortillas?|wraps?|biscuits?|crackers?|cheese|bacon|sausages?|cereal|chips|nappies|tea|coffee)\b/, "pack"],
  [/\b(bananas?|lemons?|limes?|avocados?|eggs?|garlic|capsicum|cucumber|lettuce|tomatoes?)\b/, "each"],
];
export function guessUnit(name: string): string {
  const n = name.toLowerCase();
  return GUESS.find(([re]) => re.test(n))?.[1] ?? "each";
}
/** The units shown first; the rest are behind "More". */
export const MAIN_UNITS = ["each", "kg", "g", "L", "pack"];
/** Common things to start from. */
export const STARTERS = ["Milk", "Eggs", "Bread", "Butter", "Rice", "Flour", "Sugar", "Pasta", "Olive oil", "Onions", "Potatoes", "Tinned tomatoes", "Cheese", "Salt", "Pepper", "Coffee"];
