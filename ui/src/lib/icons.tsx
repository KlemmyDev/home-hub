import type { ReactNode } from "react";

const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Svg = ({ size, w = 2.6, children }: { size: number; w?: number; children: ReactNode }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={w} aria-hidden="true">{children}</svg>;

export const Chev = () => <Svg size={16}><path d="M9 5l7 7-7 7" /></Svg>;
export const ChevL = () => <Svg size={22}><path d="M15 5l-7 7 7 7" /></Svg>;
export const ChevR = () => <Svg size={22}><path d="M9 5l7 7-7 7" /></Svg>;
export const XIcon = () => <Svg size={26}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Check = () => <Svg size={18} w={3.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const GridIcon = () => <svg className="i-open" width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{[6, 12, 18].flatMap(y => [6, 12, 18].map(x => <circle key={x + "," + y} cx={x} cy={y} r="1.8" />))}</svg>;
export const DinnerIcon = ({ size = 32, color = "currentColor" }: { size?: number; color?: string }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 2-3 4-3 7 0 2 1 3 3 3v8" /></svg>;

const DOCK: Record<string, ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  menu: <path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 2-3 4-3 7 0 2 1 3 3 3v8" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  family: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.6-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.7.2 4.5 2.2 4.5 5" /></>,
  weather: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>,
  update: <path d="M20 12a8 8 0 11-2.4-5.7M20 4v5h-5" />,
  shopping: <><path d="M3 4h2l2.4 11h10.2L20 7H6.2" /><circle cx="9" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></>,
};
/* The PocketPals and WattsMyPower dock buttons wear each app's own favicon. */
const FAV: Record<string, (z: number) => ReactNode> = {
  chores: z => <svg width={z} height={z} viewBox="0 0 120 120" aria-hidden="true"><rect width="120" height="120" rx="27" fill="#5b3bf0" /><circle cx="76" cy="31" r="16" fill="#ffc21a" /><circle cx="30" cy="43" r="13.5" fill="#fff" stroke="#2a1590" strokeWidth="5" /><circle cx="90" cy="43" r="13.5" fill="#fff" stroke="#2a1590" strokeWidth="5" /><circle cx="30" cy="43" r="6" fill="#ffb3c6" /><circle cx="90" cy="43" r="6" fill="#ffb3c6" /><path d="M27 45 H93 Q103 45 103 55 V81 Q103 87.5 97 90.5 L66 105 Q60 107.8 54 105 L23 90.5 Q17 87.5 17 81 V55 Q17 45 27 45 Z" fill="#fff" stroke="#2a1590" strokeWidth="5" strokeLinejoin="round" /><circle cx="45" cy="70" r="6.5" fill="#1c1a33" /><circle cx="75" cy="70" r="6.5" fill="#1c1a33" /><path d="M52 80 Q60 88 68 80" fill="none" stroke="#1c1a33" strokeWidth="5" strokeLinecap="round" /></svg>,
  energy: z => <svg width={z} height={z} viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="9" fill="#141414" /><path d="M16.6 6.8 L9.2 16.2 H14.4 L13.4 23.2 L20.8 13.8 H15.6 Z" fill="#ffb547" /></svg>,
};
export const DockIcon = ({ name, size = 24 }: { name: string; size?: number }) =>
  FAV[name] ? <>{FAV[name](size + 6)}</> : <Svg size={size} w={2.2}>{DOCK[name]}</Svg>;

export const PpLogo = () => <svg width="34" height="34" viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="pc" cx=".36" cy=".3" r=".8"><stop offset="0" stopColor="#ffe68a" /><stop offset=".55" stopColor="#ffc21a" /><stop offset="1" stopColor="#d48d00" /></radialGradient><linearGradient id="pt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a5cff" /><stop offset="1" stopColor="#4c2dd8" /></linearGradient><linearGradient id="pb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#efeaff" /></linearGradient></defs><rect width="120" height="120" rx="27" fill="url(#pt)" /><path d="M20 22 Q21 27.5 26 28.5 Q21 29.5 20 35 Q19 29.5 14 28.5 Q19 27.5 20 22 Z" fill="#ffd84d" /><g transform="translate(2 0) scale(.9667)"><g transform="rotate(14 75 33)"><circle cx="75" cy="35" r="15" fill="#a86f00" opacity=".35" /><circle cx="75" cy="33" r="15" fill="url(#pc)" /><path d="M75 23 Q76.3 31.7 85 33 Q76.3 34.3 75 43 Q73.7 34.3 65 33 Q73.7 31.7 75 23 Z" fill="#fff" /></g><circle cx="31" cy="42" r="12.5" fill="url(#pb)" stroke="#2a1590" strokeWidth="3.2" /><circle cx="89" cy="42" r="12.5" fill="url(#pb)" stroke="#2a1590" strokeWidth="3.2" /><circle cx="31" cy="42" r="6" fill="#ffb3c6" /><circle cx="89" cy="42" r="6" fill="#ffb3c6" /><path d="M28 44 H92 Q101 44 101 53 V80 Q101 86.5 95 89.5 L65 103 Q60 105.3 55 103 L25 89.5 Q19 86.5 19 80 V53 Q19 44 28 44 Z" fill="url(#pb)" stroke="#2a1590" strokeWidth="3.2" strokeLinejoin="round" /><path d="M24 55.5 H96" stroke="#b7a8ff" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4.5 4" /><path d="M25.5 61 V79 Q25.5 83.5 29.5 85.3 L57 97.6 Q60 99 63 97.6 L90.5 85.3 Q94.5 83.5 94.5 79 V61" fill="none" stroke="#b7a8ff" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4.5 4" /><ellipse cx="38.5" cy="77" rx="5.6" ry="3.4" fill="#ffb3c6" /><ellipse cx="81.5" cy="77" rx="5.6" ry="3.4" fill="#ffb3c6" /><circle cx="47" cy="69" r="4.6" fill="#1c1a33" /><circle cx="73" cy="69" r="4.6" fill="#1c1a33" /><circle cx="48.4" cy="67.4" r="1.5" fill="#fff" /><circle cx="74.4" cy="67.4" r="1.5" fill="#fff" /><path d="M54.5 76.5 Q60 82 65.5 76.5" fill="none" stroke="#1c1a33" strokeWidth="3" strokeLinecap="round" /></g></svg>;

/** A little picture of the weather, in colour. */
export const WeatherIcon = ({ kind, size = 44 }: { kind: string; size?: number }) => {
  const cloud = (fill: string, dx = 0, dy = 0) => <path transform={`translate(${dx} ${dy})`} d="M17 38h19a8 8 0 00.8-15.96A11 11 0 0015.6 24.6 7 7 0 0017 38z" fill={fill} />;
  const sun = (cx: number, cy: number, r: number) => <g><circle cx={cx} cy={cy} r={r} fill="#ffb938" />{Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return <line key={i} x1={cx + Math.cos(a) * (r + 3)} y1={cy + Math.sin(a) * (r + 3)} x2={cx + Math.cos(a) * (r + 6)} y2={cy + Math.sin(a) * (r + 6)} stroke="#ffb938" strokeWidth="2.6" strokeLinecap="round" />; })}</g>;
  const moon = <path d="M36 30A13 13 0 1118 12a10 10 0 0018 18z" fill="#c9d2ea" />;
  const drops = (c: string) => [20, 28, 36].map(x => <line key={x} x1={x} y1="42" x2={x - 3} y2="48" stroke={c} strokeWidth="3" strokeLinecap="round" />);
  const body = (() => {
    switch (kind) {
      case "sun": return sun(24, 24, 9);
      case "moon": return moon;
      case "partly": return <>{sun(19, 19, 7)}{cloud("#cdd5e3", 2, 2)}</>;
      case "partly-night": return <><g transform="translate(-8 -8) scale(.75)">{moon}</g>{cloud("#cdd5e3", 2, 2)}</>;
      case "fog": return <>{cloud("#cdd5e3", 0, -6)}{[34, 40, 46].map(y => <line key={y} x1="12" y1={y} x2="40" y2={y} stroke="#aab4c8" strokeWidth="3" strokeLinecap="round" />)}</>;
      case "rain": return <>{cloud("#9fb0cc", 0, -6)}{drops("#3b82f6")}</>;
      case "snow": return <>{cloud("#cdd5e3", 0, -6)}{[20, 28, 36].map(x => <circle key={x} cx={x} cy="44" r="2.4" fill="#8fb8ef" />)}</>;
      case "storm": return <>{cloud("#8a96b0", 0, -6)}<path d="M26 34l-5 9h5l-3 7 9-11h-5l3-5z" fill="#ffb938" /></>;
      default: return cloud("#cdd5e3");
    }
  })();
  return <svg width={size} height={size} viewBox="0 0 48 52" aria-hidden="true">{body}</svg>;
};
