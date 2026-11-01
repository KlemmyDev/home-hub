import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useHub } from "./hub";

export type Page = "overview" | "calendar" | "menu" | "shopping" | "chores";
export const PATHS: Record<Page, string> = { overview: "/", calendar: "/calendar", menu: "/dinners", shopping: "/shopping", chores: "/chores" };

export function usePage(): Page {
  const p = useRouterState({ select: s => s.location.pathname });
  return (Object.keys(PATHS) as Page[]).find(k => PATHS[k] === p) || "overview";
}
export function useNav() {
  const navigate = useNavigate();
  const { setCal, closeSheet } = useHub();
  const go = (page: Page | "settings" | "setup") => { closeSheet(); navigate({ to: (page === "settings" || page === "setup" ? "/" + page : PATHS[page]) as any }); };
  return { go, openCal: (mode: "day" | "week" | "month", date: Date) => { setCal(c => ({ ...c, mode, date })); navigate({ to: "/calendar" as any }); } };
}
