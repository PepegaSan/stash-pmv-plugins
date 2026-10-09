// Translations. The English text itself is the key: t("Scenes") – a missing translation simply
// shows the English text. Placeholders: t("{n} selected", { n: 3 }).
// Add a language: a file in ./locales/ that exports { "English text": "translation", … }
// and an entry in LANGS below.

export const LANGS = [
  ["en", "English"],
  ["zh-CN", "简体中文 (Chinese)"],
  ["ja", "日本語 (Japanese)"],
  ["vi", "Tiếng Việt (Vietnamese)"],
  ["fr", "Français (French)"],
  ["es", "Español (Spanish)"],
  ["de", "Deutsch (German)"],
  ["pl", "Polski (Polish)"],
];
const FILES = {
  "zh-CN": () => import("./locales/zh-CN.js"),
  ja: () => import("./locales/ja.js"),
  vi: () => import("./locales/vi.js"),
  fr: () => import("./locales/fr.js"),
  es: () => import("./locales/es.js"),
  de: () => import("./locales/de.js"),
  pl: () => import("./locales/pl.js"),
};
const KEY = "stashui.lang"; // "auto" (like Stash) or a code from LANGS

let dict = null;
export let lang = "en";

export function t(text, params) {
  let out = (dict && dict[text]) || text;
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  return out;
}

// Extension modules bring their own translations: addStrings("de", { "English text": "Text" }). Only the language in
// use matters ("de" also fits "de-DE"); strings of Stash UI itself win over a plugin's.
export function addStrings(code, strings) {
  if (!strings || typeof strings !== "object") return;
  if (String(code) !== lang && !String(lang).startsWith(String(code) + "-")) return;
  if (!dict) dict = {};
  for (const k of Object.keys(strings)) if (!(k in dict)) dict[k] = String(strings[k]);
}

// Polish counts 2–4 (but not 12–14) with its own form: plural(n, one, many) then looks up "<many>#few"
export const few = (n) => lang === "pl" && n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);

// For Intl / toLocaleString
export const locale = () => (lang === "en" ? "en-US" : lang);

export function chosen() {
  try {
    return localStorage.getItem(KEY) || "auto";
  } catch (e) {
    return "auto";
  }
}
export function choose(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch (e) { /* blocked – only for this page view */ }
}

// Stash's language setting (e.g. "zh-CN", "de-DE", "en-GB") → one of ours; Traditional Chinese etc. stay English for now
export function match(code) {
  const c = String(code || "").toLowerCase();
  if (/^zh[-_](cn|sg|hans)/.test(c) || c === "zh") return "zh-CN";
  const m = c.match(/^(ja|vi|fr|es|de|pl)(?![a-z])/);
  return m ? m[1] : "en";
}

// Load the language before the first render. stashLanguage: Stash's interface language (for "auto").
export async function initLang(stashLanguage) {
  const pick = chosen();
  const code = pick === "auto" ? match(stashLanguage || navigator.language) : LANGS.some(([c]) => c === pick) ? pick : "en";
  dict = null;
  lang = "en";
  if (FILES[code]) {
    try {
      dict = (await FILES[code]()).default;
      lang = code;
    } catch (e) {
      console.error("[Stash UI] Couldn't load the translation", code, e);
    }
  }
  document.documentElement.lang = lang;
  return lang;
}
