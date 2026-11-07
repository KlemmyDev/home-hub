import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post } from "../lib/api";
import { fromYmd, nowZ, ymd } from "../lib/dates";
import { Check, XIcon } from "../lib/icons";
import { AU_CELLS, AU_PATH, AU_RUNS, LAKES, RIVERS_MAIN, RIVERS_SMALL, ROADS_MAJOR, ROADS_MINOR, SALT_LAKES, WORLD_PATH } from "../lib/travelmap";
import { KIND_NAME, PLACES, SQUARES, TOWNS, Z, cellKm, latY, lonX, type Square } from "../lib/travelplaces";
import { DockIcon } from "../lib/icons";
import { useHub } from "../hub";
import { PageHead, wrap } from "./Panels";

/* The Travel map: Australia cut into squares (map tiles at zoom 10, about 35 km across here). Each square lists its
   top things to see; see them all, or mark the square as done, and it turns a soft green. */

type TravelData = { seen: Record<string, string>; squares: Record<string, string> };
const NONE: TravelData = { seen: {}, squares: {} };
const HOME = "10/946/593";       // Ipswich, for "Near home"
const HOME_AT = { lat: -27.6145, lon: 152.7600, name: "Ipswich" };
/** Kilometres between two points, as the crow flies. */
const kmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const when = (d: string) => fromYmd(d).toLocaleDateString([], { day: "numeric", month: "short", year: fromYmd(d).getFullYear() === nowZ().getFullYear() ? undefined : "numeric" });

/** Australia's land squares, row by row: y to runs of x (inclusive). */
const ROWS: Map<number, [number, number][]> = new Map(AU_RUNS.split(";").map(r => {
  const [y, xs] = r.split(":");
  return [+y, xs.split(",").map(s => { const [a, b] = s.split("-").map(Number); return [a, b ?? a] as [number, number]; })];
}));
const isLand = (x: number, y: number) => !!ROWS.get(y)?.some(([a, b]) => x >= a && x <= b);
const AU_BOX = { x0: lonX(112.5), x1: lonX(154), y0: latY(-9.5), y1: latY(-44) };

/** All of Australia, with room for the towns' names on the right and the list of squares along the foot. */
const fitView = (w: number, h: number): View => {
  const k = Math.min((w - 90) / (AU_BOX.x1 - AU_BOX.x0), (h - 170) / (AU_BOX.y1 - AU_BOX.y0));
  return { k, cx: (AU_BOX.x0 + AU_BOX.x1) / 2 + 30 / k, cy: (AU_BOX.y0 + AU_BOX.y1) / 2 + 70 / k };
};
const parseCell = (c: string) => { const [, x, y] = c.split("/").map(Number); return { x, y }; };

function useTravel() {
  return useQuery<TravelData>({ queryKey: ["travel"], queryFn: () => api("/api/travel"), refetchInterval: 300000 });
}

/** Which squares are done (every listed place seen, or marked by hand), and how far along the others are. */
function useProgress(t: TravelData) {
  return useMemo(() => {
    const done = new Set(Object.keys(t.squares)), part = new Map<string, number>();
    for (const [cell, sq] of Object.entries(SQUARES)) {
      const n = sq.places.filter(p => t.seen[p.id]).length;
      if (n === sq.places.length) done.add(cell); else if (n) part.set(cell, n / sq.places.length);
    }
    return { done, part, seen: Object.keys(t.seen).filter(id => PLACES[id]).length };
  }, [t]);
}

/** The nearest town to a square, for squares that have nothing listed yet. */
function nearTown(x: number, y: number) {
  let best = "", d = Infinity;
  for (const [name, lat, lon] of TOWNS) { const dd = Math.hypot(lonX(lon) - x - .5, latY(lat) - y - .5); if (dd < d) { d = dd; best = name; } }
  return d < 6 ? (d < 1 ? best : "Near " + best) : "Out bush";
}
function squareInfo(cell: string): Square & { listed: boolean } {
  const sq = SQUARES[cell];
  if (sq) return { ...sq, listed: true };
  const { x, y } = parseCell(cell);
  return { name: nearTown(x, y), region: "Australia", places: [], listed: false };
}

type View = { k: number; cx: number; cy: number };     // pixels per square, and the square-space point at the middle

export function TravelPanel() {
  const { dim, soon } = useHub();
  const P = dim.phone;
  const qc = useQueryClient();
  const { data = NONE } = useTravel();
  const prog = useProgress(data);
  const [sel, setSel] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const pickSquare = (c: string | null) => { setPlace(null); setSel(c); };
  /** Open a place's own card (and its square behind it); from a list, the map goes to it too. */
  const openPlace = (id: string, fly: boolean) => { setPlace(id); setSel(PLACES[id].cell); if (fly) map.current?.flyToPlace(id); };
  const map = useRef<MapHandle>(null);

  const patch = (f: (t: TravelData) => void) => {
    const before = qc.getQueryData<TravelData>(["travel"]) || NONE, next = structuredClone(before);
    f(next); qc.setQueryData(["travel"], next);
    return () => qc.setQueryData(["travel"], before);
  };
  const tickPlace = async (id: string) => {
    const on = !data.seen[id], undo = patch(t => { if (on) t.seen[id] = ymd(nowZ()); else delete t.seen[id]; });
    try { await post("/api/travel/seen", { id, on, date: ymd(nowZ()) }); }
    catch (e) { undo(); soon((e as Error).message); return; }
    const sq = SQUARES[PLACES[id].cell];
    if (on && sq.places.every(p => p.id === id || data.seen[p.id])) soon(`${sq.name} is done: every place in it seen.`);
  };
  const markSquare = async (cell: string, on: boolean) => {
    const undo = patch(t => { if (on) t.squares[cell] = ymd(nowZ()); else delete t.squares[cell]; });
    try { await post("/api/travel/square", { id: cell, on, date: ymd(nowZ()) }); }
    catch (e) { undo(); soon((e as Error).message); }
  };

  const listed = Object.entries(SQUARES);
  const pct = AU_CELLS ? prog.done.size / AU_CELLS * 100 : 0;
  return (
    <div className="trpage" style={wrap(P)}>
      <PageHead title="Travel" sub="Australia" />
      <div className="trstats">
        <div className="trstat"><b className="num">{prog.done.size.toLocaleString()}<small> of {AU_CELLS.toLocaleString()}</small></b><span>squares done</span><i className="trbar"><i style={{ width: Math.max(pct, prog.done.size ? 1 : 0) + "%" }} /></i></div>
        <div className="trstat"><b className="num">{prog.seen}</b><span>places seen</span></div>
        <div className="trgo">
          <button className="chip" onClick={() => map.current?.fitAustralia()}>All of Australia</button>
          <button className="chip" onClick={() => { map.current?.flyTo(HOME, 7); pickSquare(HOME); }}>Near home</button>
        </div>
      </div>
      <div className="trmapwrap">
        <TravelMap ref={map} prog={prog} sel={sel} place={place} onPick={pickSquare} onPlace={id => openPlace(id, false)} data={data} />
        <div className="trzoom">
          <button aria-label="Zoom in" onClick={() => map.current?.zoomBy(2)}>+</button>
          <button aria-label="Zoom out" onClick={() => map.current?.zoomBy(.5)}>−</button>
        </div>
        {place ? <PlaceCard id={place} data={data} onClose={() => pickSquare(null)} onBack={() => setPlace(null)} onTick={() => tickPlace(place)} />
          : sel ? <SquareCard cell={sel} data={data} done={prog.done.has(sel)} onClose={() => pickSquare(null)} onTick={tickPlace} onOpen={id => openPlace(id, true)} onMark={on => markSquare(sel, on)} />
          : (
            <div className="trlists">
              <p>Squares with things to see listed</p>
              <div className="trlists-row">
                {listed.map(([cell, sq]) => {
                  const n = sq.places.filter(p => data.seen[p.id]).length, done = prog.done.has(cell);
                  return (
                    <button key={cell} className={"trlist" + (done ? " done" : "")} onClick={() => { map.current?.flyTo(cell, 7); pickSquare(cell); }}>
                      <b>{sq.name}</b><span>{done ? "Done" : `${n} of ${sq.places.length} seen`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

/** One square: what's in it, ticked off as it's seen. */
function SquareCard({ cell, data, done, onClose, onTick, onOpen, onMark }: { cell: string; data: TravelData; done: boolean; onClose: () => void; onTick: (id: string) => void; onOpen: (id: string) => void; onMark: (on: boolean) => void }) {
  const sq = squareInfo(cell), { y } = parseCell(cell);
  const n = sq.places.filter(p => data.seen[p.id]).length;
  const byHand = !!data.squares[cell];
  return (
    <div className={"trcard" + (done ? " done" : "")} role="region" aria-label={sq.name}>
      <div className="trcard-h">
        <div className="trcard-t">
          <h2>{sq.name}</h2>
          <span>{sq.region} · about {cellKm(y)} km across{sq.listed ? ` · ${n} of ${sq.places.length} seen` : ""}</span>
        </div>
        {done ? <span className="trdone"><Check />Done</span> : null}
        <button className="trx" aria-label="Close" onClick={onClose}><XIcon /></button>
      </div>
      {sq.listed ? <i className="trbar big"><i style={{ width: (done ? 100 : n / sq.places.length * 100) + "%" }} /></i> : null}
      <div className="trcard-b">
        {sq.listed ? (
          <ol className="trplaces">
            {sq.places.map((p, i) => {
              const seen = data.seen[p.id];
              return (
                <li key={p.id}>
                  <div className={"trplace" + (seen ? " on" : "")}>
                    <button className="trtick" aria-pressed={!!seen} aria-label={(seen ? "Seen: " : "Mark as seen: ") + p.name} onClick={() => onTick(p.id)}>{seen ? <Check /> : <em>{i + 1}</em>}</button>
                    <button className="trplace-open" onClick={() => onOpen(p.id)}>
                      <span className="trplace-m">
                        <b>{p.name}</b>
                        <span>{p.about}</span>
                      </span>
                      <span className="trplace-r"><em className={"trkind k-" + p.kind}>{KIND_NAME[p.kind]}</em>{seen ? <small>Seen {when(seen)}</small> : null}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="trnone">{done ? "Nothing's listed for this square yet, but you've been and seen it." : "Nothing's listed for this square yet. If you've been and seen it, mark it as done."}</p>}
        {byHand ? <button className="dvbtn trmark" onClick={() => onMark(false)}>Done on {when(data.squares[cell])}. Undo</button>
          : !done ? <button className="dvbtn trmark" onClick={() => onMark(true)}>{sq.listed ? "Mark the whole square as done" : "Mark as done"}</button> : null}
      </div>
    </div>
  );
}

/** One place: what it is, where, and a big button to mark it as seen. */
function PlaceCard({ id, data, onClose, onBack, onTick }: { id: string; data: TravelData; onClose: () => void; onBack: () => void; onTick: () => void }) {
  const p = PLACES[id], sq = SQUARES[p.cell], seen = data.seen[id];
  const km = kmBetween(HOME_AT, p), i = sq.places.findIndex(x => x.id === id);
  const away = km < 1 ? `In ${HOME_AT.name}` : `About ${km < 10 ? km.toFixed(1) : Math.round(km)} km from ${HOME_AT.name}`;
  return (
    <div className={"trcard trpc" + (seen ? " done" : "")} role="region" aria-label={p.name}>
      <div className="trcard-h">
        <button className="trback" onClick={onBack} aria-label={"Back to " + sq.name}><span aria-hidden="true">‹</span>{sq.name}</button>
        <span style={{ flex: 1 }} />
        <button className="trx" aria-label="Close" onClick={onClose}><XIcon /></button>
      </div>
      <div className="trcard-b">
        <div className="trpc-top">
          <em className={"trkind k-" + p.kind}>{KIND_NAME[p.kind]}</em>
          <span>Number {i + 1} of {sq.places.length} in {sq.name}</span>
        </div>
        <h2 className="trpc-name">{p.name}</h2>
        <p className="trpc-about">{p.about}</p>
        <div className="trpc-facts">
          <span><small>Distance</small><b>{away}</b></span>
          <span><small>Square</small><b>{sq.name}, {sq.region}</b></span>
        </div>
        <div className="trpc-act">
          {seen ? <button className="trpc-seen on" onClick={onTick}><Check />Seen on {when(seen)}<small>Undo</small></button>
            : <button className="trpc-seen" onClick={onTick}><Check />Mark as seen</button>}
          <a className="dvbtn trpc-dir" href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`} target="_blank" rel="noreferrer"><DockIcon name="travel" size={18} />Directions</a>
        </div>
      </div>
    </div>
  );
}

/* ---------- the map ---------- */

type MapHandle = { flyTo: (cell: string, k?: number) => void; flyToPlace: (id: string) => void; fitAustralia: () => void; zoomBy: (f: number) => void };
const K_MIN = 0.55, K_MAX = 420;
const clampV = (v: View, w: number, h: number): View => {
  const k = Math.min(K_MAX, Math.max(K_MIN, v.k));
  const hw = w / 2 / k, hh = h / 2 / k;
  // Keep Australia (or at least part of the world) on the screen.
  const cx = Math.min(Z - Math.min(hw, Z / 2), Math.max(Math.min(hw, Z / 2), v.cx));
  const cy = Math.min(latY(-70), Math.max(latY(75), v.cy));
  return { k, cx, cy };
};

const TravelMap = forwardRef<MapHandle, { prog: ReturnType<typeof useProgress>; sel: string | null; place: string | null; onPick: (c: string | null) => void; onPlace: (id: string) => void; data: TravelData }>(function TravelMap({ prog, sel, place, onPick, onPlace, data }, ref) {
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ k: 6, cx: (AU_BOX.x0 + AU_BOX.x1) / 2, cy: (AU_BOX.y0 + AU_BOX.y1) / 2 });
  const size = useRef({ w: 0, h: 0, px: 1 });
  const anim = useRef(0), frame = useRef(0), late = useRef<ReturnType<typeof setTimeout>>(undefined);
  const live = useRef({ prog, sel, place, data });
  live.current = { prog, sel, place, data };
  const paths = useMemo(() => typeof Path2D === "undefined" ? null : {
    au: new Path2D(AU_PATH), world: new Path2D(WORLD_PATH), roads: new Path2D(ROADS_MAJOR), minor: new Path2D(ROADS_MINOR),
    rivers: new Path2D(RIVERS_MAIN), creeks: new Path2D(RIVERS_SMALL), lakes: new Path2D(LAKES), salt: new Path2D(SALT_LAKES),
  }, []);

  const draw = () => {
    frame.current = 0;
    const c = cv.current, { w, h, px } = size.current;
    if (!c || !w || !paths) return;
    const g = c.getContext("2d")!;
    const { k, cx, cy } = view.current, { prog, sel, place, data } = live.current;
    const ox = w / 2 - cx * k, oy = h / 2 - cy * k;
    g.setTransform(px, 0, 0, px, 0, 0);
    g.fillStyle = "#e9f0f3"; g.fillRect(0, 0, w, h);
    // Land: the world faint, Australia white.
    g.setTransform(px * k, 0, 0, px * k, px * ox, px * oy);
    g.fillStyle = "#f4f4f3"; g.fill(paths.world);
    g.fillStyle = "#dededc"; g.fill(paths.au);
    // Water: lakes and dams, the salt lakes paler, then rivers (the smaller ones only close in).
    const WATER = "#a9c6d6";
    g.fillStyle = "#e6e8e6"; g.fill(paths.salt);
    g.fillStyle = WATER; g.fill(paths.lakes);
    g.lineCap = "round"; g.lineJoin = "round";
    if (k >= 3) { g.strokeStyle = WATER; g.lineWidth = Math.min(2.6, .6 + k * .02) / k; g.stroke(paths.rivers); }
    if (k >= 24) { g.strokeStyle = WATER; g.lineWidth = Math.min(1.8, .5 + k * .008) / k; g.stroke(paths.creeks); }
    // The squares that are in view.
    const x0 = Math.floor(-ox / k), x1 = Math.ceil((w - ox) / k), y0 = Math.max(0, Math.floor(-oy / k)), y1 = Math.min(Z - 1, Math.ceil((h - oy) / k));
    const lines = k >= 5, lineA = Math.min(.24, .08 + (k - 5) * .008);
    g.lineWidth = 1 / k;
    for (let y = y0; y <= y1; y++) {
      const runs = ROWS.get(y);
      if (!runs) continue;
      for (const [a, b] of runs) {
        if (b < x0 || a > x1) continue;
        for (let x = Math.max(a, x0); x <= Math.min(b, x1); x++) {
          const id = `10/${x}/${y}`;
          if (prog.done.has(id)) { g.fillStyle = "rgba(52,168,107,.42)"; g.fillRect(x, y, 1, 1); }
          else if (prog.part.has(id)) { g.fillStyle = `rgba(52,168,107,${.1 + prog.part.get(id)! * .18})`; g.fillRect(x, y, 1, 1); }
          else if (SQUARES[id]) { g.fillStyle = "rgba(232,140,20,.3)"; g.fillRect(x, y, 1, 1); }
          if (lines) { g.strokeStyle = `rgba(31,36,48,${lineA})`; g.strokeRect(x, y, 1, 1); }
        }
      }
    }
    // Roads: grey lines from afar; close in, white roads with a grey edge, the main ones wider.
    if (k >= 3) {
      const road = (path: Path2D, w: number, edge: string) => {
        if (k < 9) { g.strokeStyle = edge; g.lineWidth = w * .55 / k; g.stroke(path); return; }
        g.strokeStyle = edge; g.lineWidth = (w + 1.6) / k; g.stroke(path);
        g.strokeStyle = "#ffffff"; g.lineWidth = w / k; g.stroke(path);
      };
      if (k >= 9) road(paths.minor, Math.min(3, 1.2 + k * .01), "#a3a8b1");
      road(paths.roads, Math.min(4.6, 1.8 + k * .016), "#8c929c");
    }
    // Australia's coast, over the squares.
    g.strokeStyle = "#7d828c"; g.lineWidth = 1.2 / k; g.stroke(paths.au);
    g.strokeStyle = "rgba(31,36,48,.14)"; g.lineWidth = .8 / k; g.stroke(paths.world);
    // The chosen square.
    if (sel) {
      const { x, y } = parseCell(sel);
      g.strokeStyle = "#1f2430"; g.lineWidth = 3 / k; g.strokeRect(x, y, 1, 1);
    }
    // Back to screen pixels for dots and words.
    g.setTransform(px, 0, 0, px, 0, 0);
    const sx = (lon: number) => ox + lonX(lon) * k, sy = (lat: number) => oy + latY(lat) * k;
    if (k >= 40) {
      for (const p of Object.values(PLACES)) {
        const X = sx(p.lon), Y = sy(p.lat);
        if (X < -40 || X > w + 40 || Y < -20 || Y > h + 20) continue;
        const seen = !!data.seen[p.id];
        if (p.id === place) { g.beginPath(); g.arc(X, Y, 15, 0, Math.PI * 2); g.fillStyle = seen ? "rgba(47,155,98,.25)" : "rgba(31,36,48,.18)"; g.fill(); }
        g.beginPath(); g.arc(X, Y, p.id === place ? 9 : k >= 120 ? 7 : 5, 0, Math.PI * 2);
        g.fillStyle = seen ? "#2f9b62" : "#1f2430"; g.fill();
        g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke();
        if (k >= 320 || p.id === place) label(g, p.name, X + 12, Y + 5, 14, seen ? "#2b7a57" : "#1f2430", p.id === place ? 700 : 600);
      }
    }
    const rank = k >= 60 ? 3 : k >= 18 ? 2 : k >= 8 ? 1 : k >= 2.5 ? 0 : -1;
    for (const [name, lat, lon, r] of TOWNS) {
      if (r > rank || (k >= 150 && r === 3)) continue;
      const X = sx(lon), Y = sy(lat);
      if (X < -80 || X > w + 80 || Y < -20 || Y > h + 20) continue;
      g.beginPath(); g.arc(X, Y, r === 0 ? 3.5 : 2.6, 0, Math.PI * 2); g.fillStyle = "#6b7280"; g.fill();
      label(g, name, X + 7, Y + 5, r === 0 ? 15 : 13.5, "#3b4252", r === 0 ? 700 : 600);
    }
  };
  const redraw = () => { if (!frame.current) frame.current = requestAnimationFrame(draw); };

  const set = (v: View) => { view.current = clampV(v, size.current.w, size.current.h); redraw(); };
  /** Glide to a view, the zoom moving evenly. */
  const glide = (to: View, ms = 650) => {
    cancelAnimationFrame(anim.current);
    const from = { ...view.current }, t0 = performance.now(), end = clampV(to, size.current.w, size.current.h);
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / ms), e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const k = Math.exp(Math.log(from.k) + (Math.log(end.k) - Math.log(from.k)) * e);
      set({ k, cx: from.cx + (end.cx - from.cx) * e, cy: from.cy + (end.cy - from.cy) * e });
      if (u < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
    // A screen that isn't drawing (just woken, or hidden) still ends up in the right place.
    clearTimeout(late.current);
    late.current = setTimeout(() => { cancelAnimationFrame(anim.current); cancelAnimationFrame(frame.current); view.current = end; draw(); }, ms + 200);
  };
  const fitAu = () => {
    const { w, h } = size.current;
    glide(fitView(w, h));
  };
  const flyTo = (cell: string, cellsAcross = 7) => {
    const { x, y } = parseCell(cell), { w, h } = size.current;
    const k = Math.min(w / cellsAcross, K_MAX);
    glide({ k, cx: x + .5, cy: y + .5 + (h / 2 - h * .22) / k });
  };
  useImperativeHandle(ref, () => ({
    flyTo, fitAustralia: fitAu,
    flyToPlace: id => {
      const p = PLACES[id], { h } = size.current, k = Math.max(view.current.k, 160);
      glide({ k, cx: lonX(p.lon), cy: latY(p.lat) + (h / 2 - h * .2) / k });
    },
    zoomBy: f => { const v = view.current; glide({ ...v, k: v.k * f }, 300); },
  }));

  // Size the canvas to its box, sharp at the screen's own pixels (the stage itself is scaled to fit).
  useLayoutEffect(() => {
    const el = box.current!, c = cv.current!;
    let first = true;
    const fit = () => {
      const r = el.getBoundingClientRect(), w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const px = (r.width / w) * (window.devicePixelRatio || 1);
      size.current = { w, h, px };
      c.width = Math.round(w * px); c.height = Math.round(h * px);
      c.style.width = w + "px"; c.style.height = h + "px";
      if (first) {
        first = false;
        view.current = clampV(fitView(w, h), w, h);
      }
      draw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el); fit();
    return () => { ro.disconnect(); cancelAnimationFrame(frame.current); cancelAnimationFrame(anim.current); clearTimeout(late.current); };
  }, []);
  useEffect(redraw, [prog, sel, place, data]);
  // Touch: one finger drags, two pinch; a tap picks a square, a double tap zooms in. The mouse wheel zooms.
  useEffect(() => {
    const c = cv.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, downAt = 0, lastTap = 0, multi = false, pinch: { d: number; mx: number; my: number } | null = null;
    const local = (e: PointerEvent | WheelEvent) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * size.current.w / r.width, y: (e.clientY - r.top) * size.current.h / r.height }; };
    const toCell = (x: number, y: number) => { const { k, cx, cy } = view.current, { w, h } = size.current; return { x: Math.floor(cx + (x - w / 2) / k), y: Math.floor(cy + (y - h / 2) / k) }; };
    const zoomAt = (f: number, x: number, y: number) => {
      const v = view.current, { w, h } = size.current, k = Math.min(K_MAX, Math.max(K_MIN, v.k * f));
      const wx = v.cx + (x - w / 2) / v.k, wy = v.cy + (y - h / 2) / v.k;
      set({ k, cx: wx - (x - w / 2) / k, cy: wy - (y - h / 2) / k });
    };
    const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    const down = (e: PointerEvent) => {
      cancelAnimationFrame(anim.current); clearTimeout(late.current);
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) { moved = 0; downAt = performance.now(); multi = false; }
      if (pts.size === 2) { multi = true; pinch = two(); }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const q = local(e);
      if (pts.size === 1) {
        const v = view.current;
        moved += Math.hypot(q.x - p.x, q.y - p.y);
        set({ ...v, cx: v.cx - (q.x - p.x) / v.k, cy: v.cy - (q.y - p.y) / v.k });
        pts.set(e.pointerId, q);
      } else if (pts.size === 2 && pinch) {
        pts.set(e.pointerId, q);
        const n = two(), v = view.current;
        set({ ...v, cx: v.cx - (n.mx - pinch.mx) / v.k, cy: v.cy - (n.my - pinch.my) / v.k });
        zoomAt(n.d / pinch.d, n.mx, n.my);
        pinch = n;
      }
    };
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size || !p || multi) return;
      if (moved > 10 || performance.now() - downAt > 600) return;
      const now = performance.now();
      if (now - lastTap < 300) { lastTap = 0; glideZoom(p.x, p.y); return; }
      lastTap = now;
      // A place's dot first (once they're drawn), then the square under the finger.
      const v = view.current, { w, h } = size.current;
      if (v.k >= 40) {
        let best = "", bd = 22;
        for (const pl of Object.values(PLACES)) {
          const d = Math.hypot(w / 2 + (lonX(pl.lon) - v.cx) * v.k - p.x, h / 2 + (latY(pl.lat) - v.cy) * v.k - p.y);
          if (d < bd) { bd = d; best = pl.id; }
        }
        if (best) {
          onPlaceRef.current(best);
          const top = h / 2 + (latY(PLACES[best].lat) - v.cy) * v.k, mid = h * .2;
          if (top > mid * 1.6) glide({ ...v, cy: v.cy + (top - mid) / v.k }, 450);
          return;
        }
      }
      const { x, y } = toCell(p.x, p.y), id = `10/${x}/${y}`;
      const pick = isLand(x, y) && (live.current.sel !== id || !!live.current.place);
      onPickRef.current(pick ? id : null);
      // A square picked low on the map slides up, out from under its card.
      const top = (y + .5) * v.k + h / 2 - v.cy * v.k, mid = h * .22;
      if (pick && top > mid * 1.6) glide({ ...v, cy: v.cy + (top - mid) / v.k }, 450);
    };
    const glideZoom = (x: number, y: number) => {
      const v = view.current, { w, h } = size.current, k = Math.min(K_MAX, v.k * 2.5);
      const wx = v.cx + (x - w / 2) / v.k, wy = v.cy + (y - h / 2) / v.k;
      glide({ k, cx: wx - (x - w / 2) / k, cy: wy - (y - h / 2) / k }, 350);
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const p = local(e); zoomAt(Math.exp(-e.deltaY * .0025), p.x, p.y); };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", wheel, { passive: false });
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); c.removeEventListener("wheel", wheel); };
  }, []);
  const onPickRef = useRef(onPick); onPickRef.current = onPick;
  const onPlaceRef = useRef(onPlace); onPlaceRef.current = onPlace;

  return <div ref={box} className="trmap"><canvas ref={cv} aria-label="Map of Australia in squares. Tap a square to see what's in it." role="img" /></div>;
});

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight: number) {
  g.font = `${weight} ${size}px Onest, system-ui, sans-serif`;
  g.lineJoin = "round"; g.lineWidth = 3.5; g.strokeStyle = "rgba(255,255,255,.92)"; g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
}
