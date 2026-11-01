import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useHub } from "./hub";

export type Page = "overview" | "calendar" | "menu" | "pantry" | "chores" | "settings";
export const PATHS: Record<Page, string> = { overview: "/", calendar: "/calendar", menu: "/dinners", pantry: "/pantry", chores: "/chores", settings: "/settings" };

export function usePage(): Page {
  const p = useRouterState({ select: s => s.location.pathname });
  return (Object.keys(PATHS) as Page[]).find(k => PATHS[k] === p) || "overview";
}
export function useNav() {
  const navigate = useNavigate();
  const { setCal, closeSheet } = useHub();
  const go = (page: Page | "setup") => { closeSheet(); navigate({ to: (page === "setup" ? "/setup" : PATHS[page]) as any }); };
  return { go, openCal: (mode: "day" | "week" | "month" | "agenda", date: Date) => { setCal(c => ({ ...c, mode, date })); navigate({ to: "/calendar" as any }); } };
}
