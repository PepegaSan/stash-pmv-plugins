// Versus: two from your library side by side – pick the better one. Every pick moves the standings
// (Elo, like chess): beat a stronger one and you climb a lot, beat a weaker one and it's a little.
// Three ways to play: fair matches (similar strength, the least played first), winner stays (a streak),
// and climb (a newcomer climbs up until it loses – that's its place).
// The standings are kept in Stash (Stash UI's plugin settings), so they're the same in every browser;
// star ratings only change with "Turn into star ratings" (and it asks first).

import { esc, icon, toast, errorToast, store, confirmDialog, fmtDuration, fmtRes, starsHtml, plural } from "../ui.js";
import { t } from "../i18n.js";
import { gql, pluginConfig, setPluginConfig, routeSignal } from "../api.js";
import { tagPicker } from "./tagpicker.js";
import { go } from "../main.js";
import { isGif } from "../pieces.js";
import { loadStandings } from "../standings.js";
import { tiersOf, tierBadge, TIERS, matchOpts, pushLedger, popLedger, mergeLedger, blankLedger, ledgerHtml, openOptions, overviewHtml, openSnapshots } from "../versusx.js";
import { logEvent, toggleLog } from "../eventlog.js";
import { ensureTiers } from "../tiers.js";
import { largeNow } from "../scale.js";

const KINDS = {
  scene: {
    label: "Scenes",
    query: `query($f: FindFilterType, $x: SceneFilterType, $ids: [ID!]) { r: findScenes(filter: $f, scene_filter: $x, ids: $ids) { count scenes { id title rating100 date play_count o_counter files { basename duration width height } paths { screenshot preview stream } performers { name } studio { name } tags { name } } } }`,
    list: "scenes",
    bulk: "mutation($i: BulkSceneUpdateInput!) { bulkSceneUpdate(input: $i) { id } }",
    open: (id) => "scene/" + id,
  },
  image: {
    label: "Images",
    query: `query($f: FindFilterType, $x: ImageFilterType, $ids: [ID!]) { r: findImages(filter: $f, image_filter: $x, ids: $ids) { count images { id title rating100 visual_files { __typename ... on ImageFile { width height basename } ... on VideoFile { width height basename format video_codec } } paths { thumbnail image } performers { name } studio { name } tags { name } date o_counter } } }`,
    list: "images",
    bulk: "mutation($i: BulkImageUpdateInput!) { bulkImageUpdate(input: $i) { id } }",
    open: (id) => "image/" + id,
  },
  performer: {
    label: "Performers",
    query: `query($f: FindFilterType, $x: PerformerFilterType, $ids: [ID!]) { r: findPerformers(filter: $f, performer_filter: $x, ids: $ids) { count performers { id name disambiguation rating100 image_path scene_count image_count birthdate country gender favorite o_counter } } }`,
    list: "performers",
    bulk: "mutation($i: BulkPerformerUpdateInput!) { bulkPerformerUpdate(input: $i) { id } }",
    open: (id) => "performer/" + id,
  },
  marker: {
    label: "Moments",
    query: `query($f: FindFilterType, $x: SceneMarkerFilterType, $ids: [ID!]) { r: findSceneMarkers(filter: $f, scene_marker_filter: $x, ids: $ids) { count scene_markers { id title seconds end_seconds screenshot primary_tag { id name } tags { name } scene { id title files { basename duration width height } paths { stream screenshot } performers { name } studio { name } } } } }`,
    list: "scene_markers",
    // the scene, starting at the moment
    open: (id, x) => (x ? `scene/${x.scene.id}?t=${Math.floor(x.seconds || 0)}` : "versus/ranking"),
  },
};
const MODES = [
  ["fair", "Fair matches", "Similar strength, the least played first"],
  ["champ", "Winner stays", "The winner stays on – how long a streak?"],
  ["climb", "Climb", "A newcomer climbs up until it loses – that's its place"],
];
const POOL = 200; // items loaded at a time (random, matching the filter); 60 with light media
// Light media: the generated preview clips (and pictures) instead of the whole video files – a big library lives on
// slow disks and every open video file is read there. Setting "Versus: scenes" (automatic: on a big library).
const lightMedia = () => {
  const m = store.get("vsMedia", "auto");
  return m === "preview" || (m === "auto" && largeNow());
};

const sceneName = (sc) => (sc && (sc.title || ((sc.files || [])[0] || {}).basename)) || "";
const titleOf = (kind, x) =>
  kind === "performer" ? x.name
  : kind === "marker" ? x.title || (x.primary_tag || {}).name || sceneName(x.scene)
  : x.title || (kind === "scene" ? (x.files[0] || {}).basename : ((x.visual_files || [])[0] || {}).basename) || "#" + x.id;
const thumbOf = (kind, x) => (kind === "scene" ? x.paths.screenshot : kind === "image" ? x.paths.thumbnail || x.paths.image : kind === "marker" ? x.screenshot || (x.scene && x.scene.paths.screenshot) : x.image_path);
// A moment (marker) plays from its start to its end – or 12 s when it has no end
const markerSpan = (x) => {
  const dur = ((x.scene && x.scene.files[0]) || {}).duration || 0;
  const a = Math.max(0, x.seconds || 0);
  let b = x.end_seconds > a + 1 ? x.end_seconds : a + 12;
  if (dur) b = Math.min(b, dur);
  return [a, b];
};
// Where an item starts: its star rating, if it has one (so the first matches aren't wasted)
const startElo = (x) => 1500 + (x.rating100 != null ? (x.rating100 - 50) * 6 : 0);
const today = () => new Date().toISOString().slice(0, 10);
const KIND_KEYS = ["scene", "image", "performer", "marker"];
const blank = () => ({ scene: {}, image: {}, performer: {}, marker: {}, votes: 0, day: "", dayVotes: 0, bestStreak: 0, resets: {}, ledger: blankLedger() });
// Two states (this browser, Stash – or two devices) → one: per item the one with more matches;
// after "Start over" the newer start counts for that kind
function mergeVs(a, b) {
  const out = blank();
  KIND_KEYS.forEach((k) => {
    const ra = (a.resets || {})[k] || 0;
    const rb = (b.resets || {})[k] || 0;
    if (ra || rb) out.resets[k] = Math.max(ra, rb);
    if (ra !== rb) return (out[k] = Object.assign({}, (ra > rb ? a : b)[k])), (out.ledger[k] = Object.assign({}, ((ra > rb ? a : b).ledger || {})[k]));
    out[k] = Object.assign({}, b[k]);
    Object.entries(a[k] || {}).forEach(([id, r]) => {
      const o = out[k][id];
      if (!o || r[1] + r[2] > o[1] + o[2]) out[k][id] = r;
    });
  });
  const led = mergeLedger(a.ledger, b.ledger); // (kinds that were started over keep the newer side's ledger, set above)
  KIND_KEYS.forEach((k) => (((a.resets || {})[k] || 0) === ((b.resets || {})[k] || 0) ? (out.ledger[k] = led[k]) : 0));
  out.votes = Math.max(a.votes || 0, b.votes || 0);
  out.bestStreak = Math.max(a.bestStreak || 0, b.bestStreak || 0);
  const [n] = [a, b].sort((x, y) => (y.day || "").localeCompare(x.day || ""));
  out.day = n.day || "";
  out.dayVotes = a.day === b.day ? Math.max(a.dayVotes || 0, b.dayVotes || 0) : n.dayVotes || 0;
  return out;
}
const parseVs = (txt) => {
  try {
    return Object.assign(blank(), JSON.parse(txt || "{}"));
  } catch (e) {
    return blank();
  }
};

export function render(main, params = {}) {
  const S = Object.assign({ kind: "scene", mode: "fair", tags: [] }, store.get("versusView", {}));
  const saveView = () => store.set("versusView", S);
  // { scene: { id: [elo, wins, losses] }, image: …, performer: …, votes, day, dayVotes, bestStreak }
  // This browser keeps a copy (starts at once); Stash has the real thing – written a few seconds after
  // the last pick, merged with what's there (another device may have played meanwhile)
  const data = Object.assign(blank(), store.get("versus", {}));
  let pushTimer = 0;
  const adopt = (m) => {
    Object.assign(data, m);
    store.set("versus", data);
  };
  async function pushData() {
    clearTimeout(pushTimer);
    pushTimer = 0;
    try {
      const merged = mergeVs(data, parseVs((await pluginConfig("pepega-stashui")).versus));
      await setPluginConfig("pepega-stashui", { versus: JSON.stringify(merged) });
      adopt(merged);
      loadStandings(true).then(() => ensureTiers(true)).catch(() => {}); // the player and the PMV Generator see the new best moments; the tier badges follow
    } catch (e) {
      console.warn("[Stash UI] Versus → Stash:", e); // the copy in this browser stays; next pick tries again
    }
  }
  const saveData = () => {
    store.set("versus", data);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushData, 3000);
  };
  // What Stash has (played in another browser?) → merged in
  const pulled = pluginConfig("pepega-stashui")
    .then((cfg) => {
      const remote = parseVs(cfg.versus);
      const merged = mergeVs(data, remote);
      adopt(merged);
      // something only in this browser (e.g. from before) → into Stash
      if (JSON.stringify(merged) !== JSON.stringify(mergeVs(remote, remote))) saveData();
      return true;
    })
    .catch(() => false);
  let pool = [];
  let pair = null; // [a, b]
  let champ = null; // winner stays / climb: the one that stays
  let streak = 0;
  let recent = []; // keys of the last pairs (no rematch right away)
  let undo = []; // [{ kind, before: { id: row }, streak, champ }]
  let alive = true;
  let busy = false;
  let montage = 0; // the scene cards jump through their scene
  const ranking = params.tab === "ranking";

  main.innerHTML = `
    <header class="kb-head"><div class="kb-head-title">
      <h1 class="kb-h1">${t("Versus")}</h1>
      <p class="kb-sub">${t("Two from your library – pick the better one. Every pick moves the standings.")}</p>
    </div>
    <div class="kb-head-tools">
      <div class="kb-seg" data-kind>${Object.entries(KINDS).map(([k, v]) => `<button type="button" data-v="${k}">${t(v.label)}</button>`).join("")}</div>
      <button type="button" class="kb-btn is-ghost" data-vx="snaps" title="${t("Snapshots of the standings")}">${icon("copies")}${t("Snapshots")}</button>
      <button type="button" class="kb-btn is-ghost" data-vx="log">${icon("logs")}${t("Log")}</button>
      <button type="button" class="kb-btn is-ghost" data-vx="opts">${icon("sliders")}${t("Options")}</button>
      <a class="kb-btn${ranking ? " is-primary" : ""}" href="#/${ranking ? "versus" : "versus/ranking"}">${icon(ranking ? "bolt" : "trophy")}${ranking ? t("Play") : t("Ranking")}</a>
    </div></header>
    <div class="kb-vs" data-body></div>`;
  const $ = (q) => main.querySelector(q);
  const body = $("[data-body]");
  const paintKind = () => main.querySelectorAll("[data-kind] [data-v]").forEach((b) => b.classList.toggle("is-on", b.dataset.v === S.kind));
  paintKind();
  $("[data-kind]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (!b || b.dataset.v === S.kind) return;
    S.kind = b.dataset.v;
    saveView();
    paintKind();
    reset();
  });

  main.querySelector(".kb-head-tools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-vx]");
    if (!b) return;
    if (b.dataset.vx === "log") return toggleLog("versus");
    if (b.dataset.vx === "opts") return openOptions();
    openSnapshots({
      getData: () => data,
      apply: (d) => {
        // replace the standings (in every browser: "started over" now beats what other devices still have)
        const now = Date.now();
        KIND_KEYS.forEach((k) => ((data[k] = Object.assign({}, d[k] || {})), (data.resets = Object.assign({}, data.resets, { [k]: now }))));
        data.ledger = blankLedger();
        data.votes = d.votes || 0;
        data.bestStreak = d.bestStreak || 0;
        saveData();
        reset();
      },
    });
  });
  const rows = () => data[S.kind];
  const row = (x) => rows()[x.id] || [startElo(x), 0, 0];
  const games = (x) => {
    const r = rows()[x.id];
    return r ? r[1] + r[2] : 0;
  };

  function reset() {
    pool = [];
    pair = null;
    champ = null;
    streak = 0;
    recent = [];
    if (ranking) paintRanking();
    else paintArena();
  }

  // ---------- Loading ----------
  function filter() {
    return S.tags.length ? { tags: { value: S.tags, modifier: "INCLUDES", depth: 0 } } : {};
  }
  // (moments have tags too – the same filter works)
  async function loadPool() {
    const k = KINDS[S.kind];
    const d = await gql(k.query, { f: { per_page: lightMedia() ? 60 : POOL, sort: "random_" + Math.floor(Math.random() * 1e8) }, x: filter() }, { signal: routeSignal() });
    return d.r[k.list];
  }

  // ---------- Match making ----------
  const pickFrom = (list) => list[Math.floor(Math.random() * list.length)];
  const fewest = (list) => {
    const m = Math.min(...list.map(games));
    return pickFrom(list.filter((x) => games(x) === m));
  };
  const key = (a, b) => [a.id, b.id].sort().join(":");
  function nextPair() {
    if (pool.length < 2) return null;
    let a;
    let b;
    const others = (x) => pool.filter((y) => y.id !== x.id && !recent.includes(key(x, y)));
    if (S.mode === "champ" && champ) {
      a = champ;
      b = fewest(others(a).length ? others(a) : pool.filter((y) => y.id !== a.id));
    } else if (S.mode === "climb" && champ) {
      // The climber meets the weakest of those above it
      a = champ;
      const ea = row(a)[0];
      const above = others(a).filter((y) => games(y) > 0 && row(y)[0] >= ea).sort((x, y) => row(x)[0] - row(y)[0]);
      b = above[0] || fewest(others(a).length ? others(a) : pool.filter((y) => y.id !== a.id));
    } else {
      // Fair: the least played, against someone close in strength (of a few random candidates)
      a = fewest(pool);
      const cands = others(a).sort(() => Math.random() - 0.5).slice(0, 10);
      const ea = row(a)[0];
      b = cands.sort((x, y) => Math.abs(row(x)[0] - ea) - Math.abs(row(y)[0] - ea))[0] || pickFrom(pool.filter((y) => y.id !== a.id));
      if (S.mode !== "fair") champ = a;
    }
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }

  // ---------- The arena ----------
  function paintArena() {
    body.innerHTML = `
      <div class="kb-vs-top">
        <div class="kb-seg" data-mode>${MODES.map(([m, l, h]) => `<button type="button" data-v="${m}" title="${esc(t(h))}">${t(l)}</button>`).join("")}</div>
        <div class="kb-vs-tags" data-tags></div>
      </div>
      <div class="kb-vs-arena" data-arena><div class="kb-loading">${t("Loading …")}</div></div>
      <div class="kb-vs-foot">
        <span class="kb-hint">${t("← left wins · → right wins · ↓ skip · U undo · F fullscreen")}</span>
        <span class="kb-spacer"></span>
        <button type="button" class="kb-btn is-ghost" data-skip>${t("Skip")}</button>
        <button type="button" class="kb-btn is-ghost" data-undo>${t("Undo")}</button>
        <button type="button" class="kb-btn is-ghost" data-fs title="${esc(t("Fullscreen (F)"))}">${icon("expand")}${t("Fullscreen")}</button>
      </div>
      <div class="kb-vs-level" data-level></div>`;
    const paintMode = () => body.querySelectorAll("[data-mode] [data-v]").forEach((b) => b.classList.toggle("is-on", b.dataset.v === S.mode));
    paintMode();
    body.querySelector("[data-mode]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      S.mode = b.dataset.v;
      saveView();
      paintMode();
      champ = null;
      streak = 0;
      showNext();
    });
    tagPicker(body.querySelector("[data-tags]"), {
      include: S.tags,
      placeholder: t("Tags (optional)"),
      onChange: (inc) => {
        S.tags = inc;
        saveView();
        reset();
      },
    });
    body.querySelector("[data-skip]").onclick = () => showNext();
    body.querySelector("[data-undo]").onclick = () => undoLast();
    body.querySelector("[data-fs]").onclick = () => fullscreen();
    // Sound: the card under the mouse is heard (at the player's volume), the other one stays silent
    const arenaEl = body.querySelector("[data-arena]");
    arenaEl.addEventListener("pointerover", (e) => sound(e.target.closest("[data-side]")));
    arenaEl.addEventListener("pointerleave", () => sound(null));
    body.querySelector("[data-arena]").addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      if (open) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); // the player opens outside of it
        return go(KINDS[S.kind].open(open.dataset.open, (pair || []).find((x) => x.id === open.dataset.open)));
      }
      const c = e.target.closest("[data-side]");
      if (c) vote(Number(c.dataset.side));
    });
    paintLevel();
    showNext();
  }

  async function showNext() {
    if (!alive || ranking) return;
    const arena = body.querySelector("[data-arena]");
    // the videos of the round before are let go (an open video keeps its file stream running)
    arena.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    try {
      if (pool.length < 2) pool = await loadPool();
      if (!alive) return;
      if (pool.length < 2) {
        arena.innerHTML = `<p class="kb-hint">${t("Not enough here to compare – at least two are needed (check the tags).")}</p>`;
        return;
      }
      pair = nextPair();
      if (!pair) return;
      arena.innerHTML = pair.map((x, i) => card(x, i)).join(`<div class="kb-vs-mid"><b>VS</b>${S.mode === "champ" && streak ? `<small>${t("Streak: {n}", { n: streak })}</small>` : ""}${S.mode === "climb" && champ ? `<small>${t("Climbing: {n} wins", { n: streak })}</small>` : ""}</div>`);
      clearInterval(montage);
      const vids = [...arena.querySelectorAll("video[data-dur]")];
      vids.forEach((v) => {
        v.onerror = () => {
          if (!v.dataset.fallback || v.dataset.fell) return;
          v.dataset.fell = "1";
          v.removeAttribute("data-dur");
          v.loop = true;
          v.src = v.dataset.fallback;
        };
      });
      let step = 0;
      const SPOTS = [0.15, 0.35, 0.55, 0.75];
      montage = setInterval(() => {
        step = (step + 1) % SPOTS.length;
        vids.forEach((v) => v.dataset.dur && v.readyState >= 1 && (v.currentTime = Number(v.dataset.dur) * SPOTS[step]));
      }, 4000);
      // Moments: their stretch over and over
      arena.querySelectorAll("video[data-from]").forEach((v) => {
        const a = Number(v.dataset.from);
        const b = Number(v.dataset.to);
        v.addEventListener("timeupdate", () => (v.currentTime >= b || v.currentTime < a - 1) && (v.currentTime = a));
        v.addEventListener("ended", () => {
          v.currentTime = a;
          v.play().catch(() => {});
        });
      });
      const over = [...arena.querySelectorAll("[data-side]")].find((c) => c.matches(":hover"));
      sound(over || null);
      arena.querySelectorAll("img[data-full]").forEach((img) => {
        const full = new Image();
        full.src = img.dataset.full;
        full.decode().then(() => img.isConnected && (img.src = full.src)).catch(() => {});
      });
    } catch (e) {
      arena.innerHTML = `<p class="kb-hint">${esc(e.message)}</p>`;
    }
  }

  function card(x, i) {
    const k = S.kind;
    const [elo, w, l] = row(x);
    const played = w + l;
    const sub =
      k === "scene" ? [x.files[0] && fmtDuration(x.files[0].duration), x.date].filter(Boolean).join(" · ")
      : k === "marker" ? `${sceneName(x.scene)} · ${fmtDuration(x.seconds || 0)}`
      : "";
    const span = k === "marker" ? markerSpan(x) : null;
    // Images: the thumbnail right away, then the full picture (thumbnails are ~640 px – blurry on a big
    // screen); images that are really videos (GIF/MP4 in Stash) play as videos
    const vf = k === "image" ? (x.visual_files || [])[0] || {} : {};
    // Scenes: the video itself (Stash's preview clips are only 640 px wide), jumping through the scene
    // like a preview; the preview clip only if the browser can't play the file
    const dur = k === "scene" ? (x.files[0] || {}).duration || 0 : 0;
    const light = lightMedia();
    const media =
      light && (k === "scene" || k === "marker")
        ? k === "scene" && x.paths.preview
          ? `<video src="${esc(x.paths.preview)}" poster="${esc(x.paths.screenshot || "")}" muted loop autoplay playsinline preload="metadata"></video>`
          : `<img src="${esc(thumbOf(k, x) || "")}" alt="" loading="eager">`
      : k === "marker" && x.scene && x.scene.paths.stream
        ? `<video src="${esc(x.scene.paths.stream)}#t=${span[0]}" poster="${esc(thumbOf(k, x) || "")}" data-from="${span[0]}" data-to="${span[1]}" muted autoplay playsinline preload="metadata"></video>`
        : k === "scene" && x.paths.stream && dur > 8
        ? `<video src="${esc(x.paths.stream)}#t=${Math.round(dur * 0.15)}" poster="${esc(x.paths.screenshot || "")}" data-dur="${dur}" data-fallback="${esc(x.paths.preview || "")}" muted autoplay playsinline preload="metadata"></video>`
        : k === "scene" && x.paths.preview
        ? `<video src="${esc(x.paths.preview)}" poster="${esc(x.paths.screenshot || "")}" muted loop autoplay playsinline></video>`
        : k === "image" && vf.__typename === "VideoFile" && !isGif(vf)
          ? `<video src="${esc(x.paths.image)}" poster="${esc(x.paths.thumbnail || "")}" muted loop autoplay playsinline></video>`
          : `<img src="${esc(thumbOf(k, x) || "")}" alt="" loading="eager"${k === "image" && x.paths.image ? ` data-full="${esc(x.paths.image)}"` : ""}>`;
    return `<button type="button" class="kb-vs-card" data-side="${i}">
        <span class="kb-vs-media">${media}</span>
        <span class="kb-vs-info"><b>${esc(titleOf(k, x))}</b><small>${esc(sub)}</small>${details(k, x)}
          <small class="kb-vs-elo">${played ? `${Math.round(elo)} · ${w}–${l}` : t("New")}</small></span>
        <span class="kb-vs-open" data-open="${esc(x.id)}" title="${esc(t("Open"))}">${icon("fwd")}</span>
        <span class="kb-vs-key">${i === 0 ? "←" : "→"}</span>
      </button>`;
  }

  // More about what's on the card: who, where from, how good, how often watched, tags
  function details(k, x) {
    const names = (list) => (list || []).map((p) => p.name).filter(Boolean);
    const line = (ic, text) => (text ? `<span class="kb-vs-line">${icon(ic)}<span>${esc(text)}</span></span>` : "");
    const out = [];
    if (k === "performer") {
      const age = x.birthdate ? Math.floor((Date.now() - Date.parse(x.birthdate)) / (365.25 * 864e5)) : null;
      out.push(line("person", [x.disambiguation, age ? t("{n} years", { n: age }) : "", x.country].filter(Boolean).join(" · ")));
      out.push(line("image", [x.scene_count ? plural(x.scene_count, "scene", "scenes") : "", x.image_count ? plural(x.image_count, "image", "images") : ""].filter(Boolean).join(" · ")));
    } else {
      const sc = k === "marker" ? x.scene || {} : x;
      const f = k === "image" ? (x.visual_files || [])[0] || {} : (sc.files || [])[0] || {};
      out.push(line("person", names(sc.performers).slice(0, 3).join(", ") + (names(sc.performers).length > 3 ? " …" : "")));
      out.push(line("film", [sc.studio && sc.studio.name, f.width ? fmtRes(f.width, f.height) : "", k === "image" ? x.date : ""].filter(Boolean).join(" · "))); // (a scene's date is in the line above)
      if (k === "scene" && (x.play_count || x.o_counter)) out.push(line("play", [x.play_count ? plural(x.play_count, "play", "plays") : "", x.o_counter ? x.o_counter + " O" : ""].filter(Boolean).join(" · ")));
    }
    const tags = names(x.tags);
    const stars = x.rating100 ? `<span class="kb-vs-line">${starsHtml(x.rating100)}</span>` : "";
    return (
      `<span class="kb-vs-details">${stars}${out.join("")}</span>` +
      (tags.length ? `<span class="kb-vs-tags">${tags.slice(0, 5).map((tg) => `<i>${esc(tg)}</i>`).join("")}${tags.length > 5 ? `<i>+${tags.length - 5}</i>` : ""}</span>` : "")
    );
  }

  function vote(side) {
    if (!pair || busy) return;
    busy = true;
    const win = pair[side];
    const lose = pair[1 - side];
    const r = rows();
    undo.push({ kind: S.kind, led: [win.id, lose.id], before: { [win.id]: r[win.id] && r[win.id].slice(), [lose.id]: r[lose.id] && r[lose.id].slice() }, streak, champ, votes: data.votes, dayVotes: data.dayVotes, best: data.bestStreak });
    if (undo.length > 30) undo.shift();
    // Elo: the surprise counts – beating a stronger one moves more; new ones move faster
    const [ew, ww, wl] = row(win);
    const [el, lw, ll] = row(lose);
    const expect = 1 / (1 + Math.pow(10, (el - ew) / 400));
    const mo = matchOpts();
    const tierNow = tiersOf(r).map; // the tiers they had before this pick
    const kw = ww + wl < mo.newUntil ? mo.kNew : mo.kOld;
    const kl = lw + ll < mo.newUntil ? mo.kNew : mo.kOld;
    const dw = kw * (1 - expect);
    const dl = kl * (1 - expect);
    r[win.id] = [ew + dw, ww + 1, wl];
    r[lose.id] = [el - dl, lw, ll + 1];
    pushLedger(data, S.kind, win.id, lose.id, dw, dl);
    logEvent("versus", "win", "{r0} beat {r1} (+{dw} / −{dl})", { dw: Math.round(dw), dl: Math.round(dl) }, [
      { k: S.kind, id: win.id, name: titleOf(S.kind, win), tier: tierNow.get(win.id) },
      { k: S.kind, id: lose.id, name: titleOf(S.kind, lose), tier: tierNow.get(lose.id) },
    ]);
    if (data.day !== today()) (data.day = today()), (data.dayVotes = 0);
    data.votes++;
    data.dayVotes++;
    // Winner stays: the streak goes on; climb: the climber goes on until it loses
    if (S.mode === "champ") {
      streak = champ && champ.id === win.id ? streak + 1 : 1;
      champ = win;
      if (streak > data.bestStreak) data.bestStreak = streak;
    } else if (S.mode === "climb") {
      if (champ && champ.id === win.id) streak++;
      else (champ = null), (streak = 0);
    }
    saveData();
    recent.push(key(win, lose));
    if (recent.length > 40) recent.shift();
    // A little show: the winner lights up, the points fly
    const cards = body.querySelectorAll("[data-side]");
    cards[side].classList.add("is-win");
    cards[1 - side].classList.add("is-lose");
    cards[side].insertAdjacentHTML("beforeend", `<span class="kb-vs-delta">+${Math.round(dw)}</span>`);
    cards[1 - side].insertAdjacentHTML("beforeend", `<span class="kb-vs-delta is-minus">−${Math.round(dl)}</span>`);
    const lvlBefore = level();
    paintLevel();
    if (level() > lvlBefore) toast(t("Level {n}!", { n: level() }), "ok");
    setTimeout(() => {
      busy = false;
      showNext();
    }, 420);
  }

  function undoLast() {
    const u = undo.pop();
    if (!u) return toast(t("Nothing to undo"));
    Object.entries(u.before).forEach(([id, r]) => (r ? (data[u.kind][id] = r) : delete data[u.kind][id]));
    if (u.led) popLedger(data, u.kind, u.led[0], u.led[1]);
    logEvent("versus", "info", "Last pick undone");
    data.votes = u.votes;
    data.dayVotes = u.dayVotes;
    data.bestStreak = u.best;
    streak = u.streak;
    champ = u.champ;
    saveData();
    paintLevel();
    toast(t("Last pick undone"), "ok");
    if (u.kind === S.kind) showNext();
  }

  // A bit of game: a level every 25 picks, picks today, the best streak
  const level = () => Math.floor(data.votes / 25) + 1;
  function paintLevel() {
    const el = body.querySelector("[data-level]");
    if (!el) return;
    const inLevel = data.votes % 25;
    el.innerHTML = `<span class="kb-vs-lvl">${icon("trophy")}${t("Level {n}", { n: level() })}</span>
      <span class="kb-vs-lvlbar"><i style="width:${(inLevel / 25) * 100}%"></i></span>
      <span>${t("{n} picks today", { n: data.day === today() ? data.dayVotes : 0 })} · ${t("{n} in total", { n: data.votes })}${data.bestStreak > 1 ? ` · ${t("best streak {n}", { n: data.bestStreak })}` : ""}</span>`;
  }

  // ---------- Ranking ----------
  let rankSeq = 0; // a newer paint wins (the standings from Stash can come in while one is loading)
  let rankTier = ""; // "": everyone, else only this tier
  async function paintRanking() {
    const seq = ++rankSeq;
    const all = Object.entries(rows()).filter(([, r]) => r[1] + r[2] > 0);
    all.sort((a, b) => b[1][0] - a[1][0]);
    const tiers = tiersOf(rows());
    if (rankTier && !tiers.counts[rankTier]) rankTier = "";
    const top = (rankTier ? all.filter(([id]) => tiers.map.get(id) === rankTier) : all).slice(0, 100);
    const judged = all.filter(([, r]) => r[1] + r[2] >= 3).length;
    body.innerHTML = `
      <div class="kb-vs-top">
        <p class="kb-hint">${all.length ? t("{n} compared so far – the top 100 by points (Elo). Wins–losses next to it.", { n: all.length }) : t("Nothing compared yet – play a few rounds first.")}</p>
        <span class="kb-spacer"></span>
        ${S.kind === "marker" ? "" : `<button type="button" class="kb-btn" data-stars ${judged ? "" : "disabled"} title="${esc(t("Only those with at least 3 matches"))}">${icon("heart")}${t("Turn into star ratings …")}</button>`}
        <button type="button" class="kb-btn is-ghost" data-restart ${all.length ? "" : "disabled"}>${t("Start over")}</button>
      </div>
      ${overviewHtml(rows())}
      ${tiers.map.size ? `<div class="kb-seg kb-tierchips" data-tiers><button type="button" data-tier="" class="${rankTier ? "" : "is-on"}">${t("All")}</button>${TIERS.filter((x) => tiers.counts[x.k]).map((x) => `<button type="button" data-tier="${x.k}" class="${rankTier === x.k ? "is-on" : ""}" style="--tc:${x.color}">${x.k} <small>${tiers.counts[x.k]}</small></button>`).join("")}</div>` : ""}
      ${S.kind === "marker" ? `<p class="kb-hint kb-vs-best">${icon("bolt")}${t("The upper quarter (with 3 matches or more) are your best moments: the player marks them gold and J jumps there first, a random start lands on one of them, and the PMV Generator prefers them.")}</p>` : ""}
      <ol class="kb-vs-rank" data-rank>${top.length ? `<li class="kb-loading">${t("Loading …")}</li>` : ""}</ol>`;
    const starsBtn = body.querySelector("[data-stars]");
    if (starsBtn) starsBtn.onclick = () => toStars(all);
    const tierBox = body.querySelector("[data-tiers]");
    if (tierBox)
      tierBox.onclick = (e) => {
        const b = e.target.closest("[data-tier]");
        if (!b) return;
        rankTier = b.dataset.tier;
        paintRanking();
      };
    body.querySelector("[data-restart]").onclick = async () => {
      const r = await confirmDialog({ title: t("Start over?"), text: t("The standings of all {kind} are cleared (in every browser). Star ratings stay.", { kind: t(KINDS[S.kind].label) }), ok: t("Start over"), danger: true });
      if (!r.ok) return;
      data[S.kind] = {};
      data.ledger[S.kind] = {};
      logEvent("versus", "warn", "Started over: {kind}", { kind: t(KINDS[S.kind].label) });
      data.resets = Object.assign({}, data.resets, { [S.kind]: Date.now() });
      saveData();
      paintRanking();
    };
    if (!top.length) return;
    try {
      const k = KINDS[S.kind];
      const d = await gql(k.query, { f: { per_page: top.length }, ids: top.map(([id]) => id) });
      if (!alive || seq !== rankSeq) return;
      const byId = new Map(d.r[k.list].map((x) => [x.id, x]));
      const rankBox = body.querySelector("[data-rank]");
      rankBox.innerHTML = top
        .map(([id, [elo, w, l]], i) => {
          const x = byId.get(id);
          if (!x) return "";
          return `<li data-lid="${esc(id)}"><a href="#/${esc(k.open(id, x))}"><span class="kb-vs-pos${i < 3 ? " is-podium" : ""}">${i + 1}</span>
            <img src="${esc(thumbOf(S.kind, x) || "")}" alt="" loading="lazy"><b>${esc(titleOf(S.kind, x))}</b>${tierBadge(tiers.map.get(id)) || "<span></span>"}
            <span class="kb-vs-pts">${Math.round(elo)}</span><small>${w}–${l}</small></a>
            <button type="button" class="kb-vs-hist" data-hist title="${t("Last matches")}" aria-label="${t("Last matches")}">${icon("history")}</button><div class="kb-vs-ledger" hidden></div></li>`;
        })
        .join("");
      // The ledger: the last 10 matches of one – opened on demand, the opponents' names fetched then
      rankBox.onclick = async (e) => {
        const b = e.target.closest("[data-hist]");
        if (!b) return;
        const li = b.closest("[data-lid]");
        const box = li.querySelector(".kb-vs-ledger");
        box.hidden = !box.hidden;
        b.classList.toggle("is-on", !box.hidden);
        if (box.hidden || box.dataset.done) return;
        const entries = ((data.ledger || {})[S.kind] || {})[li.dataset.lid] || [];
        box.innerHTML = `<div class="kb-loading">${t("Loading …")}</div>`;
        const titles = new Map();
        try {
          const ids = [...new Set(entries.map((x) => x[0]))];
          if (ids.length) (await gql(k.query, { f: { per_page: ids.length }, ids })).r[k.list].forEach((o) => titles.set(o.id, titleOf(S.kind, o)));
        } catch (er) { /* the ids are shown instead */ }
        box.innerHTML = ledgerHtml(entries, titles);
        box.dataset.done = "1";
      };
    } catch (e) {
      errorToast(e, t("Ranking"));
    }
  }

  // The standings as stars: top 10 % ★5, next 20 % ★4, 40 % ★3, 20 % ★2, bottom 10 % ★1 (at least 3 matches)
  async function toStars(all) {
    const judged = all.filter(([, r]) => r[1] + r[2] >= 3);
    if (!judged.length) return;
    const r = await confirmDialog({
      title: t("Turn into star ratings?"),
      text: t("Sets the star rating in Stash for {n} {kind} from their standing (top 10 % five stars … bottom 10 % one star). Their current ratings are replaced.", { n: judged.length, kind: t(KINDS[S.kind].label) }),
      ok: t("Set ratings"),
    });
    if (!r.ok) return;
    const n = judged.length;
    const cut = [0.1, 0.3, 0.7, 0.9]; // → 100, 80, 60, 40, 20
    const groups = { 100: [], 80: [], 60: [], 40: [], 20: [] };
    judged.forEach(([id], i) => {
      const q = i / n;
      groups[q < cut[0] ? 100 : q < cut[1] ? 80 : q < cut[2] ? 60 : q < cut[3] ? 40 : 20].push(id);
    });
    try {
      for (const [rating, ids] of Object.entries(groups)) if (ids.length) await gql(KINDS[S.kind].bulk, { i: { ids, rating100: Number(rating) } });
      logEvent("versus", "info", "Star ratings set for {n}", { n });
      toast(t("Star ratings set for {n}", { n }), "ok");
    } catch (e) {
      errorToast(e, t("Star ratings"));
    }
  }

  // Which card is heard (null = none); browsers only allow sound after the first click on the page
  function sound(card) {
    const arena = body.querySelector("[data-arena]");
    if (!arena) return;
    const p = store.get("player", {});
    arena.querySelectorAll("[data-side] video").forEach((v) => {
      const on = !!card && card.contains(v) && !p.muted;
      v.volume = p.volume == null ? 0.8 : p.volume;
      if (v.muted === !on) return;
      v.muted = !on;
      if (on)
        v.play().catch(() => {
          v.muted = true; // not allowed yet – silent until the first click
          v.play().catch(() => {});
        });
    });
  }

  // ---------- Fullscreen ----------
  // The arena fills the screen; messages (level up …) move along, else they'd sit behind it
  function fullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
    if (body.requestFullscreen) body.requestFullscreen().catch(() => {});
  }
  const onFs = () => {
    const toasts = document.getElementById("toasts");
    const on = document.fullscreenElement === body;
    if (toasts) (on ? body : document.body).appendChild(toasts);
    const b = body.querySelector("[data-fs]");
    if (b) b.innerHTML = `${icon("expand")}${on ? t("Leave fullscreen") : t("Fullscreen")}`;
  };
  document.addEventListener("fullscreenchange", onFs);

  // ---------- Keys ----------
  const onKey = (e) => {
    const tg = e.target;
    if (ranking || (tg && tg.closest && tg.closest("input, textarea, select, [contenteditable]")) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!main.isConnected || document.querySelector(".kb-dialog")) return;
    if (e.key === "ArrowLeft") vote(0);
    else if (e.key === "ArrowRight") vote(1);
    else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") showNext();
    else if (e.key === "u" || e.key === "U") undoLast();
    else if (e.key === "f" || e.key === "F") fullscreen();
    else return;
    e.preventDefault();
  };
  document.addEventListener("keydown", onKey);

  reset();
  // the ranking again once Stash's standings are in
  pulled.then((ok) => ok && alive && ranking && paintRanking());
  return () => {
    alive = false;
    if (pushTimer) pushData(); // not yet in Stash – now
    clearInterval(montage);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("fullscreenchange", onFs);
    if (document.fullscreenElement === body) document.exitFullscreen().catch(() => {});
    const toasts = document.getElementById("toasts");
    if (toasts && toasts.parentNode !== document.body) document.body.appendChild(toasts);
  };
}
