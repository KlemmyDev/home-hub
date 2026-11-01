import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, DEMO, post } from "./api";
import { queryClient } from "../hub";

export type UpdateStatus = { state: "running" | "done" | "failed"; step?: string; step_at?: number; started_at?: number; finished_at?: number; message?: string };
export type Pulse = { boot: string; now: number; status: UpdateStatus | null; requested: boolean; took: number | null };

/** An update being asked for or going now. A "running" note nobody has touched for two hours is a crashed update, not a live one. */
export const liveRun = (p?: Pulse) => !!p && p.status?.state === "running" && p.now - (p.status.step_at ?? p.status.started_at ?? p.now) < 7200;
export const updating = (p?: Pulse) => !!p && (p.requested || liveRun(p));

/* The moment Update is pressed, every screen shows it at once; the hub's own answer follows within a second or two. */
let askedAt = 0;
const listeners = new Set<() => void>();
const say = () => listeners.forEach(f => f());
export async function askUpdate() {
  askedAt = Date.now(); say();
  try { await post("/api/update/request"); } catch (e) { askedAt = 0; say(); throw e; }
  queryClient.invalidateQueries({ queryKey: ["pulse"] });
}
/** True for a few seconds after Update was pressed on this screen. */
export const useJustAsked = () => useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => askedAt);

/** Asks the hub, every few seconds (quicker while an update is going), which run of the hub it is and how an update is doing. */
export function usePulse() {
  return useQuery<Pulse>({
    queryKey: ["pulse"], queryFn: () => api<Pulse>("/api/pulse"), enabled: !DEMO, retry: false, staleTime: 0,
    refetchInterval: q => updating(q.state.data) || q.state.status === "error" ? 1500 : 6000, refetchIntervalInBackground: true,
  });
}
