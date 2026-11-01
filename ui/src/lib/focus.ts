import { useEffect, type RefObject } from "react";

/** How long a sheet takes to slide up. */
export const SHEET_MS = 480;

/**
 * Focus a field without scrolling anything. Never use the `autoFocus` attribute (or `.focus()` on its own): the browser
 * scrolls whatever it has to so the field shows, and on a field that is still sliding in that shifts the whole page.
 * For a sheet, wait for it to finish rising (`delay` = SHEET_MS).
 */
export function useAutoFocus(ref: RefObject<HTMLElement | null>, delay = 0, when = true) {
  useEffect(() => {
    if (!when) return;
    const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), delay);
    return () => clearTimeout(t);
  }, []);
}

/** For a field that appears when you tap something on the page itself: `ref={focusRef}`. */
export const focusRef = (el: HTMLElement | null) => { el?.focus({ preventScroll: true }); };
