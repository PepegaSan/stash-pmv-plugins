// "Find similar": scenes that match the current one.
// 1. Candidates via shared performers, studio, tags and the same folder (one query each).
// 2. Points: performers count most, then studio, share of common tags, folder.
// 3. The best ones are re-sorted by the look of the thumbnail (color, brightness, subject).
// Without performers/tags/studio (e.g. freshly downloaded clips) only the look decides – then from random scenes.

import { gql } from "./api.js";
import { t } from "./i18n.js";
import { analyze, matchDist } from "./pmvsmart.js";

const F = `id title paths { screenshot } files { duration basename parent_folder { id } } tags { id name } performers { id name } studio { id name }`;
const cache = new Map();

export function similarScenes(id, limit = 8) {
  const key = id + ":" + limit;
  if (!cache.has(key)) cache.set(key, find(id, limit).catch((e) => (cache.delete(key), Promise.reject(e))));
  return cache.get(key);
}

async function find(id, limit) {
  const d = await gql(`query($id: ID!) { findScene(id: $id) { ${F} } }`, { id });
  const base = d.findScene;
  if (!base) return [];
  const perf = base.performers.map((p) => p.id);
  const tags = base.tags.map((t) => t.id);
  const folder = (base.files[0] && base.files[0].parent_folder || {}).id;
  const studio = base.studio && base.studio.id;

  const q = (filter, per) =>
    gql(`query($f: FindFilterType, $x: SceneFilterType) { findScenes(filter: $f, scene_filter: $x) { scenes { ${F} } } }`, {
      f: { per_page: per, sort: "random_" + id },
      x: filter,
    }).then((r) => r.findScenes.scenes, () => []);
  const asks = [];
  if (perf.length) asks.push(q({ performers: { value: perf, modifier: "INCLUDES" } }, 80));
  if (studio) asks.push(q({ studios: { value: [studio], modifier: "INCLUDES", depth: 0 } }, 60));
  if (tags.length) asks.push(q({ tags: { value: tags, modifier: "INCLUDES", depth: 0 } }, 120));
  if (folder) asks.push(q({ files_filter: { parent_folder: { value: [folder], modifier: "INCLUDES", depth: 0 } } }, 40));
  const onlyLook = !perf.length && !tags.length && !studio;
  if (onlyLook) asks.push(q({}, 60));

  const byId = new Map();
  (await Promise.all(asks)).flat().forEach((s) => s.id !== base.id && byId.set(s.id, s));

  // Points from the metadata
  const tagSet = new Set(tags);
  const list = [...byId.values()].map((s) => {
    const why = [];
    let score = 0;
    const sp = s.performers.filter((p) => perf.includes(p.id));
    if (sp.length) {
      score += Math.min(6, 3 * sp.length);
      why.push(sp.length === 1 ? sp[0].name : t("{n} shared performers", { n: sp.length }));
    }
    if (studio && s.studio && s.studio.id === studio) {
      score += 2;
      why.push(s.studio.name);
    }
    const shared = s.tags.filter((t) => tagSet.has(t.id)).length;
    if (shared) {
      const all = new Set([...tags, ...s.tags.map((t) => t.id)]).size;
      score += 5 * (shared / all);
      why.push(shared === 1 ? t("Tag {name}", { name: s.tags.find((x) => tagSet.has(x.id)).name }) : t("{n} shared tags", { n: shared }));
    }
    if (folder && (s.files[0] && s.files[0].parent_folder || {}).id === folder) {
      score += 1;
      why.push(t("same folder"));
    }
    return { s, score, why };
  });
  list.sort((a, b) => b.score - a.score);

  // Compare the look: thumbnails of the best candidates
  const top = list.slice(0, onlyLook ? 40 : Math.max(limit * 2, 16));
  const baseSig = await sigOf(base.paths.screenshot);
  if (baseSig) {
    await Promise.all(
      top.map(async (c) => {
        const sig = await sigOf(c.s.paths.screenshot);
        if (!sig) return;
        const sim = Math.max(0, 1 - matchDist(baseSig, sig)); // 1 = identical
        c.score += 2.5 * sim;
        if (sim > 0.75) c.why.push(t("similar look"));
      })
    );
    top.sort((a, b) => b.score - a.score);
  }
  return top.slice(0, limit).map(({ s, why }) => ({
    id: s.id,
    title: s.title || (s.files[0] || {}).basename || "Scene " + s.id,
    thumb: s.paths.screenshot,
    duration: (s.files[0] || {}).duration || 0,
    why: why.slice(0, 2).join(" · ") || t("similar"),
  }));
}

function sigOf(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((res) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        res(analyze(img, img.naturalWidth, img.naturalHeight));
      } catch (e) {
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = url;
    setTimeout(() => res(null), 6000);
  });
}
