import type { Ingredient, Meal, PantryData, PItem } from "../data";
import { amountIn } from "./units";
import { scaleAmount } from "./dinnerlib";

/** The pantry item an ingredient is: the same product (by barcode) if it names one, otherwise the same name. */
export function findItem(pan: PantryData, ing: Ingredient): PItem | undefined {
  const code = ing.product?.code;
  return (code ? pan.items.find(i => i.product?.code === code) : undefined) || pan.items.find(i => i.name.toLowerCase() === ing.name.trim().toLowerCase());
}

/** How much of the pantry item an ingredient needs, in the item's own unit; null when the amounts can't be compared. */
export const needOf = (ing: Ingredient, item: PItem, factor: number): number | null => amountIn(scaleAmount(ing.amount, factor), item.unit);

/** Is there enough at home for this ingredient? When the amounts can't be compared, having any (and not being low) counts. */
export function haveEnough(pan: PantryData, ing: Ingredient, factor: number): boolean {
  const item = findItem(pan, ing);
  if (!item || item.qty <= 0) return false;
  const need = needOf(ing, item, factor);
  return need === null ? !(item.min > 0 && item.qty < item.min) : item.qty >= need;
}

export type UseRow = { ing: Ingredient; item: PItem; need: number | null; used: number };
/** What cooking a dinner takes from the pantry: each ingredient that is in the pantry, and how much to take off (nothing, for things that aren't used up). */
export function planUse(meal: Meal, pan: PantryData, factor: number): UseRow[] {
  const out: UseRow[] = [];
  for (const ing of meal.ingredients || []) {
    const item = findItem(pan, ing);
    if (!item || out.some(r => r.item.id === item.id)) continue;
    const need = needOf(ing, item, factor);
    out.push({ ing, item, need, used: item.auto && need !== null ? Math.min(need, item.qty) : 0 });
  }
  return out;
}
