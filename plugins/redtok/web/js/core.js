// RedTok – basics shared by every part of the page: helpers, translations, storage, icons, the plugin backend,
// toasts and the layer stack (pages and dialogs that the browser's Back button closes again).

export const PLUGIN = "redtok";
export const VERSION = "1.2.0";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, "0")}`;
export const isPhone = () => matchMedia("(max-width: 760px)").matches;
export const hasHover = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
// things other parts open (filled in by main.js – this keeps the modules free of import cycles)
export const nav = {};
// "something changed" messages between the parts: liked, follow, hidden, job, data …
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => { const h = (e) => fn(e.detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); };

// ---------- translations: the English text is the key ----------
let dict = null;
export let lang = "en";
export function t(text, p) {
  let out = (dict && dict[text]) || text;
  if (p) out = out.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m));
  return out;
}
// counts: tn(n, "{n} video", "{n} videos") – Polish 2–4 uses "<many>#few"
export function tn(n, one, many, p) {
  const pl = lang === "pl" && n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
  const key = n === 1 ? one : pl && dict && dict[many + "#few"] ? many + "#few" : many;
  return t(key, Object.assign({ n: fmt(n) }, p));
}
export const locale = () => (lang === "en" ? "en-US" : lang);
export const LANGS = [["auto", "Automatic"], ["en", "English"], ["zh-CN", "简体中文"], ["ja", "日本語"], ["vi", "Tiếng Việt"], ["fr", "Français"], ["es", "Español"], ["de", "Deutsch"], ["pl", "Polski"]];
const matchLang = (code) => {
  const c = String(code || "").toLowerCase();
  if (/^zh[-_](cn|sg|hans)/.test(c) || c === "zh") return "zh-CN";
  const m = c.match(/^(ja|vi|fr|es|de|pl)(?![a-z])/);
  return m ? m[1] : "en";
};
// Own choice (Settings) first, then the language picked in Stash UI, then Stash's interface language, then the browser's
export async function initLang(own) {
  let pick = own && own !== "auto" ? own : "";
  if (!pick) {
    try { const s = localStorage.getItem("stashui.lang"); if (s && s !== "auto") pick = s; } catch (e) { /* blocked */ }
  }
  if (!pick) {
    let l = "";
    try { l = (await gql("query { configuration { interface { language } } }")).configuration.interface.language || ""; } catch (e) { /* older Stash */ }
    pick = matchLang(l || navigator.language);
  }
  pick = matchLang(pick);
  dict = null;
  lang = "en";
  if (pick !== "en") {
    try { dict = (await import(`../locales/${pick}.js`)).default; lang = pick; } catch (e) { console.warn("[RedTok] no translation for", pick, e); }
  }
  document.documentElement.lang = lang;
}

// ---------- numbers and dates ----------
let nf = null, nfLang = "";
export function fmt(n) {
  n = Number(n) || 0;
  try {
    if (nfLang !== lang) { nf = new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }); nfLang = lang; }
    return nf.format(n);
  } catch (e) {
    return n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(".0", "") + "K" : String(n);
  }
}
// "3d ago", older ones as a date
export function ago(sec) {
  if (!sec) return "";
  const d = Date.now() / 1000 - sec;
  try {
    const rf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto", style: "short" });
    if (d < 3600) return rf.format(-Math.max(1, Math.round(d / 60)), "minute");
    if (d < 86400) return rf.format(-Math.round(d / 3600), "hour");
    if (d < 7 * 86400) return rf.format(-Math.round(d / 86400), "day");
    if (d < 28 * 86400) return rf.format(-Math.round(d / 604800), "week");
    return new Date(sec * 1000).toLocaleDateString(locale(), { year: d > 300 * 86400 ? "numeric" : undefined, month: "short", day: "numeric" });
  } catch (e) {
    return new Date(sec * 1000).toLocaleDateString();
  }
}

// ---------- browser storage ("rgf." – the same keys as the older local RedGifs feed, so likes carry over) ----------
let afterSet = null;
export const setAfterSet = (fn) => (afterSet = fn);
export const store = {
  get(k, d) { try { const v = localStorage.getItem("rgf." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("rgf." + k, JSON.stringify(v)); afterSet && afterSet(k); } catch (e) { /* full or blocked */ } },
};

// ---------- icons (Material, 24×24) ----------
const P = {
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  down: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z",
  vol: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  mute: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z",
  play: "M8 5v14l11-7z",
  pause: "M6 5h4v14H6zm8 0h4v14h-4z",
  search: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  gear: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  up: "M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  dn: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z",
  share: "M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z",
  user: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  film: "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
  tag: "M5.41 21 6.12 17H2.12l.35-2h4l1.06-6h-4l.35-2h4l.71-4h2l-.71 4h6l.71-4h2l-.71 4h4l-.35 2h-4l-1.06 6h4l-.35 2h-4l-.71 4h-2l.71-4h-6l-.71 4zM9.53 9l-1.06 6h6l1.06-6z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  users: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z",
  compass: "M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z",
  more: "M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  history: "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  full: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  fullexit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
  eyeoff: "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z",
  block: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z",
  speed: "M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z",
  autoscroll: "M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z",
  clear: "M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z",
  menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
  fit: "M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z",
  music: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
  verified: "M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z",
  open: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
  trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  refresh: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  folder: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  keys: "M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  grid: "M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z",
  select: "M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2zM7 17h10V7H7v10zm2-8h6v6H9V9z",
  backup: "M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z",
};
export const ic = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n] || ""}"/></svg>`;

// ---------- Stash and the plugin backend ----------
export async function gql(query, variables, signal) {
  const r = await fetch("/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }), signal });
  const d = await r.json();
  if (d.errors) throw new Error(d.errors[0].message);
  return d.data;
}
export async function call(args) {
  const d = await gql(`mutation($a: Map) { runPluginOperation(plugin_id: "${PLUGIN}", args: $a) }`, { a: args });
  const o = d.runPluginOperation;
  // (RedGifs' own answers come back with a status – data.js reads those)
  if (o && o.error && !(args.mode === "api" && o.status)) throw new Error(o.error);
  return o;
}

// ---------- pictures ----------
// Stash may forbid the page to load pictures from other sites (its Content-Security-Policy) while videos still play.
// Then RedGifs pictures come through the plugin's backend as data. Found out by the first picture that fails,
// remembered for a day.
export const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const IMGKEY = "redtok.imgVia";
export let imgViaBackend = (() => { try { const v = JSON.parse(localStorage.getItem(IMGKEY) || "null"); return !!(v && v.until > Date.now()); } catch (e) { return false; } })();
export function useBackendPics() {
  if (imgViaBackend) return;
  imgViaBackend = true;
  try { localStorage.setItem(IMGKEY, JSON.stringify({ until: Date.now() + 86400e3 })); } catch (e) { /* blocked */ }
}
export const isRgPic = (u) => /^https:\/\/[^/]*redgifs\.com\//.test(String(u || ""));
export function img(url, cls = "", extra = "") {
  if (!url) return "";
  const c = cls ? ` class="${cls}"` : "";
  if (isRgPic(url) && imgViaBackend) return `<img${c} src="${BLANK}" data-pic="${esc(url)}" alt="" draggable="false"${extra}>`;
  return `<img${c} src="${esc(url)}"${isRgPic(url) ? ` data-fb="${esc(url)}"` : ""} alt="" draggable="false" referrerpolicy="no-referrer"${extra}>`;
}

// ---------- toasts ----------
export function toast(text, bad, action) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " is-bad" : "");
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  if (action) el.querySelector("button").onclick = () => { action.fn(); el.remove(); };
  $("#toasts").appendChild(el);
  const life = action ? 5200 : bad ? 4200 : 2200;
  setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 350); }, life);
  return el;
}

// ---------- layers: pages and dialogs on top of the feed. While any is open, the browser history holds one extra
// entry (a "guard"): the phone's Back gesture closes the top layer instead of leaving the page. Only ever one guard,
// so closing things can never step back past RedTok itself.
const layers = [];
let armed = false, ignorePops = 0;
export const layerCount = () => layers.length;
export const topLayer = () => layers[layers.length - 1] || null;
export const allLayers = () => layers.slice();
function changed() { emit("layers"); }
function arm() {
  if (armed) return;
  try { history.pushState({ rt: 1 }, ""); armed = true; } catch (e) { /* sandboxed */ }
}
function disarm() {
  if (!armed) return;
  armed = false;
  ignorePops++;
  try { history.back(); } catch (e) { ignorePops--; }
}
export function pushLayer(el, opts = {}) {
  el.classList.add("layer");
  if (opts.kind) el.dataset.kind = opts.kind;
  $("#overlays").appendChild(el);
  const L = { el, kind: opts.kind || "page", onClose: opts.onClose, feed: opts.feed || null };
  layers.push(L);
  arm();
  changed();
  return L;
}
function dropTop() {
  const L = layers.pop();
  if (!L) return;
  try { L.onClose && L.onClose(); } catch (e) { console.error(e); }
  L.el.classList.add("is-leaving");
  setTimeout(() => L.el.remove(), L.kind === "modal" ? 160 : 200);
}
// close the top n layers right away
export function closeLayers(n = layers.length) {
  n = Math.min(n, layers.length);
  if (!n) return;
  for (let i = 0; i < n; i++) dropTop();
  if (!layers.length) disarm();
  changed();
}
export const closeTop = () => closeLayers(1);
export function closeLayer(L) {
  const i = layers.indexOf(L);
  if (i >= 0) closeLayers(layers.length - i);
}
// After every step in the history: make the guard match what is open. The browser may resolve a step back at the
// moment it is asked for, so a page opened right after closing one can land on a plain entry – check the state.
addEventListener("popstate", (e) => {
  const atGuard = !!(e.state && e.state.rt);
  if (ignorePops > 0) ignorePops--;
  else if (layers.length) { dropTop(); changed(); } // Back pressed: close the top layer
  armed = atGuard;
  if (layers.length && !armed) arm();
  else if (!layers.length && armed) disarm();
});

// A dialog in the middle (wide screens) or a sheet from the bottom (phones, or `bottom: true`)
export function modal(html, onReady, opts = {}) {
  const sc = document.createElement("div");
  sc.className = "modal-scrim" + (opts.bottom ? " is-bottom" : "");
  sc.innerHTML = `<div class="modal${opts.cls ? " " + opts.cls : ""}" role="dialog" aria-modal="true">${opts.bottom ? '<i class="grab"></i>' : ""}${html}</div>`;
  const L = pushLayer(sc, { kind: "modal", onClose: opts.onClose });
  const close = () => closeLayer(L);
  sc.addEventListener("click", (e) => { if (e.target === sc || e.target.closest("[data-close]")) close(); });
  onReady && onReady(sc.querySelector(".modal"), close);
  return close;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t("Link copied")); }
  catch (e) {
    // http:// on another device: no clipboard API – a hidden text field still works
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (x) { /* no */ }
    ta.remove();
    ok ? toast(t("Link copied")) : toast(t("Couldn't copy – {u}", { u: text }), true);
  }
}
