// Statistics: what you watch and when – from the play and O history Stash keeps for every scene.
// Everything below the week in review refers to the chosen period and is compared with the period
// before it. Stash keeps only the moment of a play, not its length: a play's length is estimated per
// scene (its watch time ÷ its plays); under a minute counts as a quick look.

import { esc, icon, fmtNum, fmtBytes, store, toast } from "../ui.js";
import { loadStandings } from "../standings.js";
import { t, locale } from "../i18n.js";
import { gql, stats } from "../api.js";
import { isLarge } from "../scale.js";

const PERIODS = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
  [365, "1 year"],
  [0, "All time"],
];
const DAY = 864e5;
const LOOK = 60; // s – shorter plays are quick looks

const Q = `query($f: FindFilterType, $s: SceneFilterType) {
  findScenes(filter: $f, scene_filter: $s) {
    scenes {
      id title play_count o_counter play_duration play_history o_history
      paths { screenshot }
      files { basename duration }
      tags { id name }
      performers { id name }
      studio { id name }
    }
  }
}`;

const titleOf = (s) => s.title || (s.files[0] && s.files[0].basename) || "#" + s.id;
const dayStart = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const weekStart = (ms) => {
  const d = new Date(dayStart(ms));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};
const monthStart = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
// 3 h 24 min · 12 min · 45 s
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return t("{n} s", { n: sec });
  const m = Math.round(sec / 60);
  if (m < 60) return t("{n} min", { n: m });
  const h = Math.floor(m / 60);
  return m % 60 && h < 10 ? t("{h} h {m} min", { h, m: m % 60 }) : t("{n} h", { n: fmtNum(Math.round(sec / 3600)) });
}
const dateFmt = (ms, o) => new Date(ms).toLocaleDateString(locale(), o);
const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: "long" })); // 1 Jan 2024 was a Monday
const weekdaysShort = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: "short" }));

// Change against the period before: ▲ 18 % / ▼ 5 % / new
function delta(cur, prev, what) {
  if (prev == null) return "";
  if (!prev) return cur ? `<em class="kb-st-delta is-up" title="${esc(what)}">${t("new")}</em>` : "";
  const p = Math.round(((cur - prev) / prev) * 100);
  if (!p) return `<em class="kb-st-delta" title="${esc(what)}">±0 %</em>`;
  return `<em class="kb-st-delta ${p > 0 ? "is-up" : "is-down"}" title="${esc(what)}">${p > 0 ? "▲" : "▼"} ${Math.abs(p)} %</em>`;
}
// Round axis steps: 1, 2, 5, 10, 20, 50 … – for times 1, 2, 5, 10, 15, 30 min, 1, 2, 3, 6, 12 h …
const TIME_STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 432000, 864000];
function niceStep(max, lines = 4, time = false) {
  const raw = max / lines;
  if (time) return TIME_STEPS.find((s) => s >= raw) || Math.ceil(raw / 864000) * 864000;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || p * 10;
}

export async function render(main) {
  let days = store.get("statsPeriod", 30);
  let metric = store.get("statsMetric", "time"); // time | plays
  main.innerHTML = `
    <header class="kb-head"><div class="kb-head-title">
      <h1 class="kb-h1">${t("Statistics")}</h1>
      <p class="kb-sub">${t("What you watch and when – from the play and O history Stash keeps for every scene.")}</p>
    </div></header>
    <div data-body><div class="kb-loading">${t("Loading …")}</div></div>`;
  const body = main.querySelector("[data-body]");

  let d;
  let totals;
  const big = await isLarge(); // a big library: the 4000 most played scenes (reading the history of every one would take too long)
  try {
    [d, totals] = await Promise.all([
      gql(Q, {
        f: { per_page: big ? 4000 : -1, sort: "play_count", direction: "DESC" },
        s: { play_count: { value: 0, modifier: "GREATER_THAN" }, OR: { o_counter: { value: 0, modifier: "GREATER_THAN" } } },
      }),
      stats(),
    ]);
  } catch (e) {
    body.innerHTML = `<div class="kb-empty"><b>${t("Couldn't load the statistics")}</b><p>${esc(e.message)}</p></div>`;
    return;
  }
  const st = totals;
  const scenes = d.findScenes.scenes;
  if (big && scenes.length >= 4000) setTimeout(() => body.insertAdjacentHTML("afterbegin", `<p class="kb-hint">${t("Big library: the figures come from the 4000 most played scenes.")}</p>`), 0);

  // ---------- Events ----------
  const plays = []; // { at, s, len, look }
  const os = []; // { at, s }
  const firstAt = new Map(); // scene id → first play
  for (const s of scenes) {
    const ph = s.play_history || [];
    const len = ph.length ? (s.play_duration || 0) / ph.length : 0;
    for (const x of ph) {
      const at = Date.parse(x);
      if (!at) continue;
      plays.push({ at, s, len, look: len < LOOK });
      if (!firstAt.has(s.id) || at < firstAt.get(s.id)) firstAt.set(s.id, at);
    }
    for (const x of s.o_history || []) {
      const at = Date.parse(x);
      if (at) os.push({ at, s });
    }
  }
  const hasO = os.length > 0 || st.total_o_count > 0;
  const hasTime = plays.some((e) => e.len > 0);
  if (!hasTime) metric = "plays";
  if (!plays.length && !os.length) {
    body.innerHTML = `<div class="kb-empty"><b>${t("No play history yet")}</b><p>${t("It fills up as you watch – Stash notes every play.")}</p></div>`;
    return;
  }
  const firstEver = Math.min(...plays.map((e) => e.at), ...os.map((e) => e.at));

  // A range [from, to) and the same length before it. Nothing before the history starts: the range
  // begins there at the earliest, and it's only compared when the period before is fully recorded.
  const histStart = dayStart(firstEver);
  const rangeOf = (n) => {
    const to = Date.now() + 1;
    const want = n ? dayStart(Date.now()) - (n - 1) * DAY : histStart;
    const from = Math.max(want, histStart);
    const prevFrom = from - (to - from);
    return { from, to, cut: want < histStart, prev: n && want >= histStart && prevFrom >= histStart ? { from: prevFrom, to: from } : null };
  };
  const inR = (r) => (e) => e.at >= r.from && e.at < r.to;
  function summary(r) {
    const p = plays.filter(inR(r));
    const seen = new Set(p.map((e) => e.s.id));
    return {
      plays: p.length,
      watched: p.filter((e) => !e.look).length,
      looks: p.filter((e) => e.look).length,
      time: p.reduce((a, e) => a + e.len, 0),
      scenes: seen.size,
      firstTime: [...seen].filter((id) => firstAt.get(id) >= r.from).length,
      days: new Set(p.map((e) => dayStart(e.at))).size,
      o: os.filter(inR(r)).length,
    };
  }
  const val = (e) => (metric === "time" ? e.len : 1);
  const fmtVal = (v) => (metric === "time" ? fmtDur(v) : fmtNum(v));

  // Who/what got watched: scenes, performers, tags, studios
  function tally(r, pick) {
    const m = new Map();
    for (const e of plays) {
      if (e.at < r.from || e.at >= r.to) continue;
      for (const x of pick(e.s)) {
        const k = x.id;
        const o = m.get(k) || { x, v: 0, n: 0 };
        o.v += val(e);
        o.n++;
        m.set(k, o);
      }
    }
    return m;
  }

  // ---------- Page ----------
  body.innerHTML = `
    <section class="kb-card kb-st-week" data-week></section>
    <section class="kb-card kb-st-card kb-st-badges" data-badges></section>
    <div class="kb-st-bar">
      <div class="kb-seg" data-period>${PERIODS.map(([n, l]) => `<button type="button" data-n="${n}">${t(l)}</button>`).join("")}</div>
      <span class="kb-hint kb-st-since" data-since></span>
      ${hasTime ? `<div class="kb-seg" data-metric title="${esc(t("What the charts and lists count"))}"><button type="button" data-m="time">${t("Watch time")}</button><button type="button" data-m="plays">${t("Plays")}</button></div>` : ""}
    </div>
    <div class="kb-st-kpis" data-kpis></div>
    <section class="kb-card kb-st-card">
      <div class="kb-st-head"><h2>${t("Activity")}</h2><div class="kb-st-legend" data-legend></div></div>
      <div class="kb-st-chart" data-chart></div>
    </section>
    <div class="kb-st-grid">
      <section class="kb-card kb-st-card" data-top="scenes"></section>
      <section class="kb-card kb-st-card" data-top="performers"></section>
      <section class="kb-card kb-st-card" data-top="tags"></section>
      <section class="kb-card kb-st-card" data-top="studios"></section>
      ${hasO ? `<section class="kb-card kb-st-card" data-top="o"></section>` : ""}
    </div>
    <section class="kb-card kb-st-card">
      <div class="kb-st-head"><h2>${t("When you watch")}</h2><p class="kb-hint" data-rhythm-note></p></div>
      <div class="kb-st-rhythm"><div data-wd></div><div data-hr></div></div>
    </section>
    <section class="kb-card kb-st-card" data-lib></section>
    <p class="kb-hint">${t("Stash keeps only when a play happened, not how long it lasted – a play's length is estimated from the scene's total watch time. Plays under a minute count as quick looks.")}</p>`;

  // ---------- Week in review (always the last 7 days) ----------
  function paintWeek() {
    const r = rangeOf(7);
    const a = summary(r);
    const b = r.prev ? summary(r.prev) : null; // the week before – only if it's fully recorded
    const el = body.querySelector("[data-week]");
    const top = (pick) => [...tally(r, pick).values()].sort((x, y) => y.v - x.v)[0];
    const sc = top((s) => [s]);
    const pf = top((s) => s.performers || []);
    const tg = top((s) => s.tags || []);
    const perDay = new Array(7).fill(0);
    plays.filter(inR(r)).forEach((e) => (perDay[(new Date(e.at).getDay() + 6) % 7] += val(e)));
    const best = perDay.indexOf(Math.max(...perDay));
    const what = t("compared with the 7 days before");
    el.innerHTML = `
      <div class="kb-st-head"><h2>${t("Your week")}</h2><span class="kb-hint">${esc(dateFmt(r.from, { day: "numeric", month: "short" }))} – ${esc(dateFmt(Date.now(), { day: "numeric", month: "short" }))}</span></div>
      ${
        a.plays || a.o
          ? `<div class="kb-st-weekgrid">
        <div class="kb-st-big"><b>${hasTime ? esc(fmtDur(a.time)) : fmtNum(a.plays)}</b>${delta(hasTime ? a.time : a.plays, b && (hasTime ? b.time : b.plays), what)}
          <span>${hasTime ? t("watched in {n} plays", { n: fmtNum(a.plays) }) : t("plays")}</span>
          <small>${t("{n} scenes, {m} of them for the first time", { n: fmtNum(a.scenes), m: fmtNum(a.firstTime) })}${a.o ? " · " + t("{n} O", { n: fmtNum(a.o) }) : ""}</small></div>
        ${sc ? `<a class="kb-st-hero" href="#/scene/${sc.x.id}">${sc.x.paths.screenshot ? `<img alt="" loading="lazy" src="${esc(sc.x.paths.screenshot)}">` : ""}<span><small>${t("Most watched")}</small><b>${esc(titleOf(sc.x))}</b><em>${esc(fmtVal(sc.v))}</em></span></a>` : ""}
        <ul class="kb-st-facts">
          ${pf ? `<li><small>${t("Top performer")}</small><a href="#/performer/${pf.x.id}">${esc(pf.x.name)}</a></li>` : ""}
          ${tg ? `<li><small>${t("Top tag")}</small><a href="#/tag/${tg.x.id}">${esc(tg.x.name)}</a></li>` : ""}
          ${perDay[best] ? `<li><small>${t("Busiest day")}</small><b>${esc(weekdays[best])}</b></li>` : ""}
          <li><small>${t("Days with something on")}</small><b>${a.days} / 7</b></li>
        </ul>
      </div>`
          : `<p class="kb-hint">${t("Nothing watched in the last 7 days.")}</p>`
      }`;
  }

  // ---------- Key figures for the period ----------
  function paintKpis(r) {
    const a = summary(r);
    const b = r.prev ? summary(r.prev) : null;
    const what = r.prev ? t("compared with the {n} days before", { n: days }) : "";
    body.querySelector("[data-since]").textContent = r.cut || !days ? t("History since {d}", { d: dateFmt(histStart, { day: "numeric", month: "long", year: "numeric" }) }) + (r.prev || !days ? "" : " – " + t("no comparison yet")) : "";
    const span = Math.max(1, Math.round((r.to - r.from) / DAY));
    const tile = (num, dl, label, sub) => `<div class="kb-st-kpi"><div><b>${num}</b>${dl}</div><span>${label}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    body.querySelector("[data-kpis]").innerHTML = [
      hasTime ? tile(esc(fmtDur(a.time)), delta(a.time, b && b.time, what), t("watch time"), t("≈ {d} a day", { d: fmtDur(a.time / span) })) : "",
      tile(fmtNum(a.plays), delta(a.plays, b && b.plays, what), t("plays"), hasTime ? t("{w} watched · {l} quick looks", { w: fmtNum(a.watched), l: fmtNum(a.looks) }) : ""),
      tile(fmtNum(a.scenes), delta(a.scenes, b && b.scenes, what), t("different scenes"), t("{n} for the first time", { n: fmtNum(a.firstTime) })),
      hasO
        ? tile(fmtNum(a.o), delta(a.o, b && b.o, what), t("O counter"), a.plays ? t("{p} % of plays", { p: Math.round((a.o / a.plays) * 100) }) : "")
        : tile(`${a.days}<small>/${span}</small>`, delta(a.days, b && b.days, what), t("days with something on"), ""),
    ].join("");
  }

  // ---------- Activity over time ----------
  // Days for up to ~2 months, weeks up to ~1 year, months beyond
  function bucketsOf(r) {
    const spanDays = (r.to - r.from) / DAY;
    const unit = spanDays <= 62 ? "day" : spanDays <= 400 ? "week" : "month";
    const startOf = unit === "day" ? dayStart : unit === "week" ? weekStart : monthStart;
    const next = (ms) => {
      const x = new Date(ms);
      if (unit === "day") x.setDate(x.getDate() + 1);
      else if (unit === "week") x.setDate(x.getDate() + 7);
      else x.setMonth(x.getMonth() + 1);
      return x.getTime();
    };
    const out = [];
    for (let at = startOf(r.from); at < r.to; at = next(at)) out.push({ from: at, to: next(at), watched: 0, looks: 0, o: 0 });
    const idx = (ms) => {
      // buckets are sorted – binary search
      let lo = 0;
      let hi = out.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ms < out[mid].from) hi = mid - 1;
        else if (ms >= out[mid].to) lo = mid + 1;
        else return mid;
      }
      return -1;
    };
    return { unit, list: out, idx };
  }
  const bucketLabel = (unit, ms, long) =>
    unit === "month"
      ? dateFmt(ms, { month: "short", year: "numeric" })
      : unit === "week"
        ? (long ? t("Week of {d}", { d: dateFmt(ms, { day: "numeric", month: "short" }) }) : dateFmt(ms, { day: "numeric", month: "short" }))
        : dateFmt(ms, long ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });

  let B = null; // the period's buckets (also used by the sparklines)
  function paintChart(r) {
    B = bucketsOf(r);
    for (const e of plays) {
      const i = B.idx(e.at);
      if (i < 0) continue;
      B.list[i][e.look ? "looks" : "watched"] += val(e);
    }
    for (const e of os) {
      const i = B.idx(e.at);
      if (i >= 0) B.list[i].o++;
    }
    const L = B.list;
    const max = Math.max(1, ...L.map((b) => b.watched + b.looks));
    const step = niceStep(max, 4, metric === "time");
    const top = Math.ceil(max / step) * step;
    const oMax = Math.max(1, ...L.map((b) => b.o));
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const every = Math.max(1, Math.ceil(L.length / 7));
    body.querySelector("[data-legend]").innerHTML =
      (hasTime ? `<span class="is-watched">${t("watched (1 min or more)")}</span><span class="is-looks">${t("quick looks")}</span>` : `<span class="is-watched">${t("plays")}</span>`) +
      (hasO ? `<span class="is-o">${t("O counter")}</span>` : "");
    body.querySelector("[data-chart]").innerHTML = `
      <div class="kb-st-plot">
        <div class="kb-st-grid-y">${ticks.map((v) => `<div style="bottom:${(v / top) * 100}%"><span>${esc(fmtVal(v))}</span></div>`).join("")}</div>
        <div class="kb-st-cols" style="--n:${L.length}">${L.map(
          (b, i) => `<div class="kb-st-col" data-i="${i}">
            <i class="is-looks" style="height:${(b.looks / top) * 100}%"></i><i class="is-watched" style="height:${(b.watched / top) * 100}%"></i></div>`
        ).join("")}</div>
        <div class="kb-st-tip" data-tip hidden></div>
      </div>
      ${
        hasO
          ? `<div class="kb-st-olane" style="--n:${L.length}" title="${esc(t("O counter"))}"><em>O</em>${L.map((b) => `<span>${b.o ? `<u style="--s:${0.45 + (b.o / oMax) * 0.55}" title="${esc(t("{n} O", { n: b.o }))}"></u>` : ""}</span>`).join("")}</div>`
          : ""
      }
      <div class="kb-st-x" style="--n:${L.length}">${L.map((b, i) => `<span>${i % every === 0 ? esc(bucketLabel(B.unit, b.from)) : ""}</span>`).join("")}</div>`;
    // Hover: the exact numbers
    const cols = body.querySelector(".kb-st-cols");
    const tip = body.querySelector("[data-tip]");
    cols.onmousemove = (e) => {
      const c = e.target.closest("[data-i]");
      if (!c) return (tip.hidden = true);
      const b = L[+c.dataset.i];
      const tot = b.watched + b.looks;
      tip.innerHTML = `<b>${esc(bucketLabel(B.unit, b.from, true))}</b>${
        tot ? `<span>${esc(fmtVal(tot))}${hasTime ? ` – ${esc(t("{w} watched, {l} quick looks", { w: fmtVal(b.watched), l: fmtVal(b.looks) }))}` : ""}</span>` : `<span>${t("nothing")}</span>`
      }${b.o ? `<span>${t("{n} O", { n: b.o })}</span>` : ""}`;
      tip.hidden = false;
      const pr = cols.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const x = cr.left - pr.left + cr.width / 2;
      tip.style.left = Math.max(80, Math.min(pr.width - 80, x)) + "px";
    };
    cols.onmouseleave = () => (tip.hidden = true);
  }

  // ---------- Top lists with trend and a small curve over the period ----------
  function spark(r, pick, key) {
    const arr = new Array(B.list.length).fill(0);
    for (const e of plays) {
      if (e.at < r.from || e.at >= r.to || !pick(e.s).some((x) => x.id === key)) continue;
      const i = B.idx(e.at);
      if (i >= 0) arr[i] += val(e);
    }
    const m = Math.max(...arr);
    if (!m || arr.length < 2) return "";
    const pts = arr.map((v, i) => `${((i / (arr.length - 1)) * 100).toFixed(1)},${(19 - (v / m) * 17).toFixed(1)}`).join(" ");
    return `<svg class="kb-st-spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const LISTS = {
    scenes: ["Scenes", (s) => [s], (x) => "#/scene/" + x.id],
    performers: ["Performers", (s) => s.performers || [], (x) => "#/performer/" + x.id],
    tags: ["Tags", (s) => s.tags || [], (x) => "#/tag/" + x.id],
    studios: ["Studios", (s) => (s.studio ? [s.studio] : []), (x) => "#/extern/classic?path=" + encodeURIComponent("/studios/" + x.id)],
  };
  function paintTop(r, key) {
    const el = body.querySelector(`[data-top="${key}"]`);
    if (!el) return;
    if (key === "o") {
      // Most O in the period
      const m = new Map();
      os.filter(inR(r)).forEach((e) => {
        const o = m.get(e.s.id) || { x: e.s, v: 0 };
        o.v++;
        m.set(e.s.id, o);
      });
      const list = [...m.values()].sort((a, b) => b.v - a.v).slice(0, 8);
      el.innerHTML = `<h2>${t("Most O")}</h2>` + (list.length ? `<ol class="kb-st-list">${list.map((o, i) => row(i, o, o.v, list[0].v, "#/scene/" + o.x.id, titleOf(o.x), o.x.paths.screenshot, fmtNum(o.v), "", "")).join("")}</ol>` : `<p class="kb-hint">${t("Nothing in this period")}</p>`);
      return;
    }
    const [label, pick, href] = LISTS[key];
    const cur = tally(r, pick);
    const prev = r.prev ? tally(r.prev, pick) : null;
    const list = [...cur.values()].sort((a, b) => b.v - a.v).slice(0, 8);
    if (!list.length && key !== "scenes") {
      el.hidden = true; // e.g. no studios or performers in use
      return;
    }
    el.hidden = false;
    el.innerHTML =
      `<h2>${t(label)}</h2>` +
      (list.length
        ? `<ol class="kb-st-list">${list
            .map((o, i) => {
              const p = prev && prev.get(o.x.id);
              let trend = "";
              if (prev) {
                if (!p) trend = `<em class="kb-st-trend is-new" title="${esc(t("not in the period before"))}">${t("new")}</em>`;
                else {
                  const c = (o.v - p.v) / p.v;
                  trend = c >= 0.15 ? `<em class="kb-st-trend is-up" title="${esc(t("before: {v}", { v: fmtVal(p.v) }))}">▲</em>` : c <= -0.15 ? `<em class="kb-st-trend is-down" title="${esc(t("before: {v}", { v: fmtVal(p.v) }))}">▼</em>` : `<em class="kb-st-trend" title="${esc(t("before: {v}", { v: fmtVal(p.v) }))}">–</em>`;
                }
              }
              const name = key === "scenes" ? titleOf(o.x) : o.x.name;
              const img = key === "scenes" ? o.x.paths.screenshot : null;
              const sub = metric === "time" ? t("{n} plays", { n: fmtNum(o.n) }) : "";
              return row(i, o, o.v, list[0].v, href(o.x), name, img, fmtVal(o.v), trend, spark(r, pick, o.x.id), sub);
            })
            .join("")}</ol>`
        : `<p class="kb-hint">${t("Nothing in this period")}</p>`);
  }
  function row(i, o, v, max, href, name, img, num, trend, sparkSvg, sub) {
    return `<li><a href="${esc(href)}">
      <i>${i + 1}</i>${img ? `<img alt="" loading="lazy" src="${esc(img)}">` : ""}
      <span class="kb-st-name"><span>${esc(name)}</span><span class="kb-st-share"><s style="width:${Math.max(2, (v / max) * 100)}%"></s></span></span>
      ${sparkSvg || ""}
      <span class="kb-st-num"><b>${esc(num)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${trend}</a></li>`;
  }

  // ---------- Rhythm: weekday and hour ----------
  function paintRhythm(r) {
    const wd = new Array(7).fill(0);
    const hr = new Array(24).fill(0);
    plays.filter(inR(r)).forEach((e) => {
      const x = new Date(e.at);
      wd[(x.getDay() + 6) % 7] += val(e);
      hr[x.getHours()] += val(e);
    });
    const bars = (arr, labels, cls) => {
      const m = Math.max(...arr);
      const best = arr.indexOf(m);
      return `<div class="kb-st-mini ${cls}">${arr
        .map((v, i) => `<div title="${esc(`${labels[i]}: ${fmtVal(v)}`)}"${i === best && m ? ' class="is-best"' : ""}><i style="height:${m ? Math.max(v ? 3 : 0, (v / m) * 100) : 0}%"></i><span>${esc(cls === "is-hours" ? (i % 3 === 0 ? String(i) : "") : labels[i])}</span></div>`)
        .join("")}</div>`;
    };
    const hourLabels = hr.map((_, h) => t("{a}–{b} h", { a: h, b: (h + 1) % 24 }));
    body.querySelector("[data-wd]").innerHTML = `<h3>${t("Weekday")}</h3>` + bars(wd, weekdaysShort, "is-days");
    body.querySelector("[data-hr]").innerHTML = `<h3>${t("Time of day")}</h3>` + bars(hr, hourLabels, "is-hours");
    const bw = wd.indexOf(Math.max(...wd));
    const bh = hr.indexOf(Math.max(...hr));
    body.querySelector("[data-rhythm-note]").textContent = Math.max(...wd) ? t("Most on {day}s, between {a} and {b} h.", { day: weekdays[bw], a: bh, b: (bh + 1) % 24 }) : "";
  }

  // ---------- Library ----------
  const addedCache = new Map(); // period → how many scenes were added in it (a count each – not every scene)
  async function paintLib(r) {
    const el = body.querySelector("[data-lib]");
    const pct = st.scene_count ? Math.round((st.scenes_played / st.scene_count) * 100) : 0;
    const never = Math.max(0, st.scene_count - st.scenes_played);
    const addedKey = r.from + "-" + r.to;
    const addedN = addedCache.has(addedKey) ? addedCache.get(addedKey) : null;
    el.innerHTML = `
      <h2>${t("Your library")}</h2>
      <div class="kb-st-lib">
        <div class="kb-st-cover">
          <div class="kb-st-meter"><s style="width:${pct}%"></s></div>
          <p><b>${pct} %</b> ${t("of your scenes watched at least once ({n} of {m})", { n: fmtNum(st.scenes_played), m: fmtNum(st.scene_count) })}</p>
        </div>
        <ul class="kb-st-facts">
          <li><small>${t("Never watched")}</small><a href="#/scenes?played=no">${t("{n} scenes", { n: fmtNum(never) })} →</a></li>
          <li><small>${t("Watched in total")}</small><b>${esc(fmtDur(st.total_play_duration))}</b></li>
          <li><small>${t("Length of all scenes")}</small><b>${esc(fmtDur(st.scenes_duration))}</b></li>
          <li><small>${t("Size")}</small><b>${esc(fmtBytes(st.scenes_size))}</b></li>
          ${addedN != null ? `<li><small>${days ? t("Added in the last {n} days", { n: days }) : t("Added")}</small><b>${fmtNum(addedN)}</b></li>` : ""}
        </ul>
      </div>`;
    if (!addedCache.has(addedKey)) {
      try {
        const a = await gql(`query StatsAdded($s: SceneFilterType) { findScenes(filter: { per_page: 0 }, scene_filter: $s) { count } }`, {
          s: { created_at: { value: new Date(r.from).toISOString(), value2: new Date(r.to).toISOString(), modifier: "BETWEEN" } },
        });
        addedCache.set(addedKey, a.findScenes.count);
        paintLib(r);
      } catch (e) { /* the rest stays */ }
    }
  }

  // ---------- Achievements: a streak of days and milestones in steps ----------
  // Day streak: days in a row with at least one play (today not yet watched doesn't break it)
  function streaks() {
    const days = [...new Set(plays.map((e) => dayStart(e.at)))].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    let prev = null;
    for (const d of days) {
      // (days differ by 23–25 h around daylight saving time)
      run = prev != null && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    const today = dayStart(Date.now());
    const last = days[days.length - 1];
    const cur = last != null && Math.round((today - last) / DAY) <= 1 ? run : 0;
    return { cur, best, today: last === today };
  }
  const BADGES = [
    { id: "streak", icon: "bolt", name: "On a roll", what: "days in a row", steps: [3, 7, 14, 30, 60], value: (x) => x.streak.best },
    { id: "plays", icon: "play", name: "Regular", what: "plays", steps: [50, 100, 500, 1000, 5000], value: () => plays.length },
    { id: "hours", icon: "film", name: "Marathon", what: "hours watched", steps: [10, 50, 100, 250, 500], value: () => Math.floor((st.total_play_duration || 0) / 3600), when: () => hasTime },
    { id: "explore", icon: "search", name: "Explorer", what: "% of the library seen", steps: [10, 25, 50, 75, 100], value: () => (st.scene_count ? Math.floor((st.scenes_played / st.scene_count) * 100) : 0) },
    { id: "night", icon: "history", name: "Night owl", what: "plays between midnight and 4", steps: [10, 50, 200, 500], value: () => plays.filter((e) => new Date(e.at).getHours() < 4).length },
    { id: "versus", icon: "trophy", name: "Judge", what: "Versus picks", steps: [25, 100, 500, 1000, 2500], value: (x) => x.votes },
    { id: "o", icon: "drop", name: "Finisher", what: "O", steps: [10, 50, 100, 500], value: () => st.total_o_count || 0, when: () => hasO },
  ];
  const ROMAN = ["I", "II", "III", "IV", "V"];
  let votes = 0;
  let votesIn = false; // newly earned ones are only told once everything (also Versus) is known
  function paintBadges() {
    const el = body.querySelector("[data-badges]");
    const x = { streak: streaks(), votes };
    const earnedNow = [];
    const cards = BADGES.filter((b) => !b.when || b.when())
      .map((b) => {
        const v = b.value(x);
        const tier = b.steps.filter((n) => v >= n).length; // 0 = none yet
        const next = b.steps[tier];
        const from = tier ? b.steps[tier - 1] : 0;
        const pct = next ? Math.max(0, Math.min(100, ((v - from) / (next - from)) * 100)) : 100;
        if (tier) earnedNow.push(b.id + ":" + tier);
        return `<div class="kb-st-badge${tier ? " is-earned" : ""}${!next ? " is-max" : ""}" title="${esc(next ? t("Next step: {n} {what}", { n: fmtNum(next), what: t(b.what) }) : t("All steps reached"))}">
          <span class="kb-st-medal" data-tier="${tier}">${icon(b.icon)}${tier ? `<em>${ROMAN[tier - 1]}</em>` : ""}</span>
          <span class="kb-st-badge-txt"><b>${esc(t(b.name))}</b><small>${fmtNum(v)}${next ? " / " + fmtNum(next) : ""} ${esc(t(b.what))}</small>
          <span class="kb-st-pips">${b.steps.map((_, i) => `<i class="${i < tier ? "is-on" : ""}"></i>`).join("")}</span>
          ${next ? `<span class="kb-st-prog"><s style="width:${pct}%"></s></span>` : ""}</span></div>`;
      })
      .join("");
    const sx = x.streak;
    el.innerHTML = `
      <div class="kb-st-head"><h2>${t("Achievements")}</h2><span class="kb-hint">${t("{n} of {m} steps reached", { n: earnedNow.reduce((a, k) => a + Number(k.split(":")[1]), 0), m: BADGES.filter((b) => !b.when || b.when()).reduce((a, b) => a + b.steps.length, 0) })}</span></div>
      <div class="kb-st-streak${sx.cur >= 3 ? " is-hot" : ""}">${icon("bolt")}<span><b>${t("{n} days in a row", { n: sx.cur })}</b><small>${sx.cur && !sx.today ? t("Watch something today to keep it going") : sx.cur ? t("Today counts already") : t("Watch something today to start a streak")} · ${t("best: {n} days", { n: sx.best })}</small></span></div>
      <div class="kb-st-badgegrid">${cards}</div>`;
    // Newly earned since the last visit
    if (!votesIn) return;
    const seen = store.get("badgesSeen", null);
    if (seen) {
      const fresh = earnedNow.filter((k) => !seen.includes(k));
      fresh.slice(0, 3).forEach((k) => {
        const [id, tier] = k.split(":");
        const b = BADGES.find((y) => y.id === id);
        if (b) toast(t("New achievement: {name} {tier}", { name: t(b.name), tier: ROMAN[tier - 1] }), "ok");
      });
    }
    store.set("badgesSeen", earnedNow);
  }
  // Versus picks come from Stash UI's plugin settings
  loadStandings()
    .then((d) => (votes = d.votes || 0))
    .catch(() => {})
    .finally(() => {
      votesIn = true;
      if (main.isConnected) paintBadges();
    });

  function paintAll() {
    const r = rangeOf(days);
    body.querySelectorAll("[data-period] [data-n]").forEach((b) => b.classList.toggle("is-on", +b.dataset.n === days));
    body.querySelectorAll("[data-metric] [data-m]").forEach((b) => b.classList.toggle("is-on", b.dataset.m === metric));
    paintWeek();
    paintBadges();
    paintKpis(r);
    paintChart(r);
    ["scenes", "performers", "tags", "studios", "o"].forEach((k) => paintTop(r, k));
    paintRhythm(r);
    paintLib(r);
  }
  paintAll();

  body.querySelector("[data-period]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (!b) return;
    days = +b.dataset.n;
    store.set("statsPeriod", days);
    paintAll();
  });
  const mEl = body.querySelector("[data-metric]");
  if (mEl)
    mEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      metric = b.dataset.m;
      store.set("statsMetric", metric);
      paintAll();
    });
}
