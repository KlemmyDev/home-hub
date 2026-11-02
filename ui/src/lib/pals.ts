/* A child's colour is their pal's. PocketPals draws the pal itself (colour, outfit, pet) on a page the hub shows in a frame. */
export const KIDCOL = ["#14a06c", "#e5487f", "#7b5cf0", "#0ea5b7", "#f59e0b", "#2f6fe0"];
export const PALACC: Record<string, string> = { pig: "#F0709F", fox: "#FF8A2B", owl: "#8B5CFF", dino: "#1FB574", cat: "#F09A1A", bunny: "#A98BD8", puppy: "#A66A3C", panda: "#5B6577", frog: "#6DB82B", penguin: "#36427F" };
type PalKid = { id: number; name: string; species?: string; pal_url?: string };
export const palColor = (k: PalKid, kids: PalKid[]) => PALACC[String(k.species || "").split("~")[0]] || KIDCOL[Math.max(0, kids.findIndex(x => x.id === k.id)) % KIDCOL.length];
/** The PocketPals child who is this family member: the same name (or the same first name), ignoring case. */
export function palFor(name: string, kids: PalKid[]) {
  const n = name.trim().toLowerCase(), first = n.split(/\s+/)[0];
  return kids.find(k => k.name.trim().toLowerCase() === n) || kids.find(k => k.name.trim().toLowerCase().split(/\s+/)[0] === first);
}
