export const DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");   // sample calendar and dinner, to see the design full

export async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.text()) || "Something went wrong.");
  return (r.status === 204 ? null : await r.json()) as T;
}
export const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
export const post = (path: string, body?: unknown) => api(path, body === undefined ? { method: "POST" } : json(body));
