// Previews on demand: asks Stash to generate the missing previews of just these scenes, images or markers
// (the Tasks page can only do the whole library). Fields that this Stash doesn't know are left out.

import { gql } from "./api.js";
import { typeInfo } from "./forms.js";
import { toast, errorToast, plural } from "./ui.js";
import { t } from "./i18n.js";
import { pokeJobs } from "./jobs.js";

const WHAT = {
  scene: { ids: "sceneIDs", on: ["covers", "previews", "imagePreviews", "sprites", "markers", "markerImagePreviews", "markerScreenshots"] },
  image: { ids: "imageIDs", on: ["imageThumbnails", "clipPreviews"] },
  marker: { ids: "markerIDs", on: ["markers", "markerImagePreviews", "markerScreenshots"] },
};
const NAMES = { scene: ["scene", "scenes"], image: ["image", "images"], marker: ["marker", "markers"] };

// ids: ids of the kind (none for a marker task = the markers of the whole library); overwrite: make them again
export async function generatePreviews(kind, ids, { overwrite = false, quiet = false } = {}) {
  const w = WHAT[kind];
  try {
    const fields = ((await typeInfo("GenerateMetadataInput").catch(() => null)) || {}).inputFields || [];
    const known = { has: (k) => !fields.length || fields.some((f) => f.name === k) }; // (no schema answer: try them all)
    const input = { overwrite };
    w.on.filter((k) => known.has(k)).forEach((k) => (input[k] = true));
    if (ids && ids.length) {
      if (!known.has(w.ids)) throw new Error(t("This Stash can't generate previews for single items"));
      input[w.ids] = ids;
    }
    await gql(`mutation GenPrev($i: GenerateMetadataInput!) { metadataGenerate(input: $i) }`, { i: input });
    pokeJobs();
    if (!quiet) toast(ids && ids.length ? t("Generating previews for {what} – see Tasks", { what: plural(ids.length, NAMES[kind][0], NAMES[kind][1]) }) : t("Generating the missing marker previews – see Tasks"), "ok");
    return true;
  } catch (e) {
    if (!quiet) errorToast(e, "Generate previews");
    else console.warn("preview generation", e);
    return false;
  }
}
