// Builds ui/src/lib/travelmap.ts: the world's land outline, Australia's coastline and Australia's land squares.
// Run from ui/: node scripts/travelgrid.mjs <folder>   (needs the world-atlas and topojson-client dev dependencies)
// <folder> holds Natural Earth's 1:10m roads, rivers and lakes as GeoJSON, from
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson : ne_10m_roads, ne_10m_rivers_lake_centerlines,
// ne_10m_rivers_australia, ne_10m_lakes and ne_10m_lakes_australia (.geojson).
//
// The squares are the world's map tiles at zoom 10 (Web Mercator): 1024 x 1024 of them round the world.
// Near Ipswich one is about 35 km across; they are about 38 km in Darwin and 29 km in Hobart.
// A square counts as land when any part of it touches land in Natural Earth's 1:10m coastline.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";

const Z = 1024;
const atlas = f => JSON.parse(readFileSync(new URL(`../node_modules/world-atlas/${f}`, import.meta.url)));
const X = lon => (lon + 180) / 360 * Z;
const Y = lat => { const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Z; };

const rings = geom => (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates).flat();
const country = (file, id) => feature(atlas(file), atlas(file).objects.countries).features.find(f => f.id === id).geometry;

const n = v => v.toFixed(2).replace(/\.?0+$/, "");
/** A ring as an SVG path in tile units, dropping points closer than `tol` to the last one kept. */
function path(ringsList, tol, keep = () => true) {
  let d = "";
  for (const ring of ringsList) {
    // A ring that crosses the date line carries on past the world's edge, rather than jumping back across the map.
    const pts = [];
    let shift = 0;
    for (const [lo, la] of ring) {
      const x = X(lo);
      if (pts.length) { const dx = x + shift - pts[pts.length - 1][0]; if (dx > Z / 2) shift -= Z; else if (dx < -Z / 2) shift += Z; }
      pts.push([x + shift, Y(la)]);
    }
    if (!keep(pts)) continue;
    const out = [pts[0]];
    for (const p of pts.slice(1)) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= tol) out.push(p); }
    if (out.length < 3) continue;
    d += "M" + out.map(p => n(p[0]) + " " + n(p[1])).join("L") + "Z";
  }
  return d;
}

/** Lines (roads, rivers) as an SVG path, without closing them. */
function lines(list, tol) {
  let d = "";
  for (const line of list) {
    const pts = line.map(([lo, la]) => [X(lo), Y(la)]);
    const out = [pts[0]];
    for (const p of pts.slice(1, -1)) { const q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= tol) out.push(p); }
    out.push(pts[pts.length - 1]);
    if (out.length < 2 || (out.length === 2 && Math.hypot(out[0][0] - out[1][0], out[0][1] - out[1][1]) < tol)) continue;
    d += "M" + out.map(p => n(p[0]) + " " + n(p[1])).join("L");
  }
  return d;
}

// --- Australia's squares, from the 1:10m coastline ---
const au = rings(country("countries-10m.json", "036")).map(r => r.map(([lo, la]) => [X(lo), Y(la)]));
const land = new Set();
// Each row of squares is cut by many lines across it; wherever a line is over land, the squares it crosses are land.
for (let y = 0; y < Z; y++) {
  for (let k = 0; k <= 16; k++) {
    const yy = y + (k === 0 ? 0.001 : k === 16 ? 0.999 : k / 16);
    const xs = [];
    for (const r of au) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x1, y1] = r[i], [x2, y2] = r[j];
      if ((y1 > yy) !== (y2 > yy)) xs.push(x1 + (yy - y1) / (y2 - y1) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.floor(xs[i]); x <= Math.floor(xs[i + 1]); x++) land.add(x + "/" + y);
  }
}
// Small islands and spits the lines can miss: any square a coastline point falls in.
for (const r of au) for (const [x, y] of r) land.add(Math.floor(x) + "/" + Math.floor(y));
// Only mainland Australia, Tasmania and the islands near them (not Macquarie, Christmas, Cocos or the Coral Sea specks).
const near = (x, y) => x >= X(112.5) && x <= X(154) && y >= Y(-9.5) && y <= Y(-44);
const cells = [...land].map(s => s.split("/").map(Number)).filter(([x, y]) => near(x + .5, y + .5));

// Rows of squares as runs: "y:x0-x1,x2-x3;..." (x1 inclusive), kept short so the page stays small.
const rows = new Map();
for (const [x, y] of cells) (rows.get(y) || rows.set(y, []).get(y)).push(x);
const runs = [...rows.keys()].sort((a, b) => a - b).map(y => {
  const xs = rows.get(y).sort((a, b) => a - b), out = [];
  let a = xs[0], b = xs[0];
  for (const x of xs.slice(1)) { if (x === b + 1) b = x; else { out.push(a === b ? `${a}` : `${a}-${b}`); a = b = x; } }
  out.push(a === b ? `${a}` : `${a}-${b}`);
  return y + ":" + out.join(",");
}).join(";");

// --- outlines to draw ---
const auDraw = path(rings(country("countries-50m.json", "036")), 0.12, pts => pts.every(([x, y]) => near(x, y)));
const wl = feature(atlas("land-110m.json"), atlas("land-110m.json").objects.land);
const worldLand = { type: "MultiPolygon", coordinates: (wl.features || [wl]).flatMap(f => f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) };
// The world without Australia (drawn on its own, finer) and without Antarctica.
const worldDraw = path(rings(worldLand), 0.5, pts => !pts.every(([x, y]) => near(x, y)) && !pts.every(([, y]) => y > Y(-60)));

// --- roads, rivers and lakes (Natural Earth 1:10m) ---
const NE = process.argv[2];
if (!NE || !existsSync(`${NE}/ne_10m_roads.geojson`)) { console.error("Give the folder with Natural Earth's roads, rivers and lakes (see the top of this file)."); process.exit(1); }
const geo = f => existsSync(`${NE}/${f}.geojson`) ? JSON.parse(readFileSync(`${NE}/${f}.geojson`)).features : [];
const inAu = ([lo, la]) => near(X(lo), Y(la));
const linesOf = g => !g ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
const auLines = fs => fs.flatMap(f => linesOf(f.geometry).filter(l => l.some(inAu)).map(l => ({ l, p: f.properties })));
const roads = auLines(geo("ne_10m_roads")).filter(({ p }) => p.continent === "Oceania" && p.type !== "Ferry Route");
const big = ({ p }) => p.type === "Major Highway" || p.expressway === 1;
const roadsMajor = lines(roads.filter(big).map(r => r.l), 0.07);
const roadsMinor = lines(roads.filter(r => !big(r)).map(r => r.l), 0.05);
// Rivers: the main ones always, the smaller ones (a higher scalerank) only close in.
const rivers = [...auLines(geo("ne_10m_rivers_lake_centerlines")), ...auLines(geo("ne_10m_rivers_australia"))].filter(({ p }) => p.featurecla !== "Lake Centerline");
const riversMain = lines(rivers.filter(({ p }) => (p.scalerank ?? 9) <= 6).map(r => r.l), 0.05);
const riversSmall = lines(rivers.filter(({ p }) => (p.scalerank ?? 9) > 6).map(r => r.l), 0.12);
const lakes = [...geo("ne_10m_lakes"), ...geo("ne_10m_lakes_australia")].filter(f => f.geometry && rings(f.geometry).some(r => r.some(inAu)));
const salt = f => /alkaline|intermittent|salt/i.test(`${f.properties.featurecla} ${f.properties.name || ""}`);
const lakesFresh = path(lakes.filter(f => !salt(f)).flatMap(f => rings(f.geometry)), 0.05);
const lakesSalt = path(lakes.filter(salt).flatMap(f => rings(f.geometry)), 0.08);

const out = `// Made by ui/scripts/travelgrid.mjs from Natural Earth (public domain, through world-atlas). Don't edit by hand.
// Coordinates are map tiles at zoom 10 (Web Mercator): x and y run 0 to 1024 round the world.
export const AU_CELLS = ${cells.length};
/** Australia's land squares, a row at a time: "y:x0-x1,x2;...". */
export const AU_RUNS = "${runs}";
/** Australia's coastline (1:50m). */
export const AU_PATH = "${auDraw}";
/** The rest of the world's land (1:110m), for context. */
export const WORLD_PATH = "${worldDraw}";
/** Australia's highways (1:10m): the main ones, then the others. */
export const ROADS_MAJOR = "${roadsMajor}";
export const ROADS_MINOR = "${roadsMinor}";
/** Rivers: the main ones, then the smaller ones. */
export const RIVERS_MAIN = "${riversMain}";
export const RIVERS_SMALL = "${riversSmall}";
/** Lakes and dams, then the salt lakes that are mostly dry. */
export const LAKES = "${lakesFresh}";
export const SALT_LAKES = "${lakesSalt}";
`;
writeFileSync(new URL("../src/lib/travelmap.ts", import.meta.url), out);
console.log(cells.length, "squares;", Math.round(out.length / 1024), "KB");
