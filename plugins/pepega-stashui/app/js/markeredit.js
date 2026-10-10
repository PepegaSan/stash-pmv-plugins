// Parts of a scene with their own tags: a marker with a start, an optional end, a main tag and more tags.
// Opened from the marker list in the player ("Add a part …" / the edit button of a marker).

import { esc, icon, toast, errorToast, openDrawer, store } from "./ui.js";
import { t } from "./i18n.js";
import { gql } from "./api.js";
import { parseTime } from "./audiox.js";
import { tagPicker } from "./views/tagpicker.js";
import { generatePreviews } from "./genprev.js";
import { fpsOf, frameAt, secOf, snap, showFrame, stepFrame, fmtExact } from "./frames.js";

const FIELDS = "id title seconds end_seconds primary_tag { id name } tags { id name }";

// The tags picked last, newest first ({ id, name }): the tag pickers list the first 3 on top
const RECENT = "markerTags";
const recentTags = () => store.get(RECENT, []);
function rememberTags(picked) {
  if (!picked.length) return;
  const rest = recentTags().filter((r) => !picked.some((p) => p.id === r.id));
  store.set(RECENT, [...picked, ...rest].slice(0, 10));
}

// Holding a nudge button repeats it: after a short pause, then quickly. One release listener serves every editor.
let stopRepeat = () => {};
addEventListener("pointerup", () => stopRepeat());
addEventListener("pointercancel", () => stopRepeat());

// scene: the scene object (x); marker: an existing marker or null for a new one; video: the <video> (for "Here");
// defaultTag(): the id of the fallback main tag ("Highlight"); done(marker, isNew): called after saving
export function openMarkerEdit({ scene, marker, video, defaultTag, done }) {
  const isNew = !marker;
  const dur = (scene.files && scene.files[0] && scene.files[0].duration) || 0;
  const fps = fpsOf(scene);
  const now = () => snap(video ? video.currentTime : 0, fps); // the frame you're looking at
  const start0 = marker ? marker.seconds : now();
  let main = marker && marker.primary_tag ? [marker.primary_tag.id] : [];
  let more = marker ? (marker.tags || []).filter((x) => !marker.primary_tag || x.id !== marker.primary_tag.id).map((x) => x.id) : [];
  const had = new Set([...main, ...more]); // only tags picked now count as "used last"

  const row = (which, label, value, placeholder) => `
    <div class="kb-form-row">
      <span>${label}</span>
      <span class="kb-music-t"><input class="kb-field" data-${which} value="${value}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""} inputmode="decimal" autocomplete="off" spellcheck="false"><button type="button" class="kb-btn is-ghost" data-here="${which}">${t("Here")}</button></span>
      <div class="kb-nudge" data-nudge="${which}">
        <button type="button" class="kb-btn is-ghost" data-n="s-1">−1 s</button>
        <button type="button" class="kb-btn is-ghost" data-n="s-0.1">−0.1</button>
        <button type="button" class="kb-btn is-ghost kb-nudge-f" data-n="f-1" aria-label="${t("One frame earlier")}" title="${t("One frame earlier")}">${icon("framePrev")}</button>
        <button type="button" class="kb-btn is-ghost kb-nudge-f" data-n="f1" aria-label="${t("One frame later")}" title="${t("One frame later")}">${icon("frameNext")}</button>
        <button type="button" class="kb-btn is-ghost" data-n="s0.1">+0.1</button>
        <button type="button" class="kb-btn is-ghost" data-n="s1">+1 s</button>
      </div>
    </div>`;

  const d = openDrawer({
    title: isNew ? t("Add a part") : t("Edit the part"),
    body: `
      <p class="kb-hint">${t("A part of this video with its own tags: set the start and the end (“Here” takes the spot you're watching), give it a main tag and more tags. It shows up in the marker list and on the timeline.")}</p>
      <label class="kb-form-row"><span>${t("Name")}</span><input class="kb-field" data-title value="${esc((marker && marker.title) || "")}" placeholder="${esc(t("Name (optional)"))}"></label>
      ${row("from", t("Start"), fmtExact(start0))}
      ${row("to", t("End"), marker && marker.end_seconds ? fmtExact(marker.end_seconds) : "", t("(none)"))}
      <p class="kb-hint">${t("Exact to the frame: ↑ ↓ in a field (or the buttons – hold to repeat) change the time by one frame, with Shift by a second, with Alt by a tenth of a second. The video follows, so you see the frame. The keys , and . step the video itself.")}</p>
      <span class="kb-lab-t">${t("Main tag")} <small>${t("– the tag this part is filed under (needed)")}</small></span>
      <div class="kb-tagpick" data-main></div>
      <span class="kb-lab-t">${t("More tags")}</span>
      <div class="kb-tagpick" data-more></div>`,
    foot: `${marker ? `<button class="kb-btn is-ghost kb-qdel" data-del>${icon("close")}${t("Delete")}</button>` : ""}<span class="kb-spacer"></span><button class="kb-btn is-primary" data-save>${t("Save")}</button>`,
    onClose: () => stopRepeat(),
  });
  const el = d.el;
  const $ = (s) => el.querySelector(s);
  if (el.previousElementSibling) el.previousElementSibling.style.display = "none"; // the video stays usable
  el.classList.add("kb-cut");

  // ---------- Start and end ----------
  const field = (which) => $(`[data-${which}]`);
  const valueOf = (which) => {
    const s = field(which).value.trim();
    const n = s ? parseTime(s) : NaN;
    return Number.isFinite(n) ? n : NaN;
  };
  // the picture follows the time you're setting (and stops, so it stays on that frame)
  function look(sec) {
    if (!video) return;
    video.pause();
    showFrame(video, frameAt(sec, fps), fps);
  }
  // by: { frames } or { sec } – from the field's time (an empty end starts at the start; an unreadable one at the video)
  function nudge(which, by) {
    let cur = valueOf(which);
    if (!Number.isFinite(cur)) cur = which === "to" && Number.isFinite(valueOf("from")) ? valueOf("from") : now();
    let next = by.frames ? secOf(frameAt(cur, fps) + by.frames, fps) : Math.round((cur + by.sec) * 1000) / 1000;
    next = Math.max(0, dur ? Math.min(next, dur) : next);
    field(which).value = fmtExact(next);
    look(next);
  }
  const byOf = (code) => (code[0] === "f" ? { frames: Number(code.slice(1)) } : { sec: Number(code.slice(1)) });

  el.querySelectorAll("[data-here]").forEach((b) => {
    b.onclick = () => {
      field(b.dataset.here).value = fmtExact(now());
    };
  });
  // buttons: a press acts at once; held, it repeats. (A keyboard "click" has no press before it: its detail is 0.)
  el.addEventListener("pointerdown", (e) => {
    const b = e.target.closest("[data-n]");
    if (!b || e.button) return;
    const run = () => nudge(b.closest("[data-nudge]").dataset.nudge, byOf(b.dataset.n));
    run();
    stopRepeat();
    const wait = setTimeout(() => {
      const every = setInterval(run, 70);
      stopRepeat = () => clearInterval(every);
    }, 380);
    stopRepeat = () => clearTimeout(wait);
  });
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-n]");
    if (b && e.detail === 0) nudge(b.closest("[data-nudge]").dataset.nudge, byOf(b.dataset.n));
  });
  // a typed time is tidied up, and the video shows that frame
  ["from", "to"].forEach((which) =>
    field(which).addEventListener("change", () => {
      const n = valueOf(which);
      if (Number.isFinite(n)) {
        field(which).value = fmtExact(n);
        look(n);
      } else if (!field(which).value.trim()) field(which).value = "";
    })
  );
  el.addEventListener("keydown", (e) => {
    const inField = e.target.matches && e.target.matches("[data-from], [data-to]");
    if (inField && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const sign = e.key === "ArrowUp" ? 1 : -1;
      const which = e.target.dataset.from != null ? "from" : "to";
      nudge(which, e.shiftKey ? { sec: sign } : e.altKey ? { sec: sign * 0.1 } : { frames: sign });
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && video && (e.key === "," || e.key === ".") && !(e.target.matches && e.target.matches("input, textarea"))) {
      e.preventDefault();
      stepFrame(video, fps, e.key === "," ? -1 : 1); // the player's own keys are off while this is open
    }
  });

  // ---------- Tags ----------
  let mainPick = null;
  let morePick = null;
  function drawMain() {
    const host = $("[data-main]");
    host.innerHTML = "";
    mainPick = tagPicker(host, {
      include: main,
      allowCreate: true,
      placeholder: t("Main tag"),
      recent: recentTags, // (read each time the list opens)
      onChange: (inc) => {
        main = inc.slice(-1); // only one main tag – the newest pick replaces the old one
        // (a second pick swaps its chip: the picker is drawn again with just the newest tag)
        if (inc.length > 1) setTimeout(drawMain, 0);
      },
    });
  }
  drawMain();
  morePick = tagPicker($("[data-more]"), { include: more, allowCreate: true, placeholder: t("Add tag …"), recent: recentTags, onChange: (inc) => (more = inc) });

  $("[data-save]").onclick = async () => {
    const a = parseTime(field("from").value);
    const bRaw = field("to").value.trim();
    const b = bRaw ? parseTime(bRaw) : null;
    if (!(a >= 0) || (dur && a > dur)) return toast(t("Start/end don't fit – the end must be after the start"), "error");
    if (b != null && !(b > a)) return toast(t("Start/end don't fit – the end must be after the start"), "error");
    try {
      const primary = main[0] || (marker && marker.primary_tag && marker.primary_tag.id) || (await defaultTag());
      const input = {
        scene_id: scene.id,
        title: $("[data-title]").value.trim(),
        seconds: a,
        end_seconds: b,
        primary_tag_id: primary,
        tag_ids: more.filter((id) => id !== primary),
      };
      let m;
      if (isNew) m = (await gql(`mutation($i: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $i) { ${FIELDS} } }`, { i: input })).sceneMarkerCreate;
      else m = (await gql(`mutation($i: SceneMarkerUpdateInput!) { sceneMarkerUpdate(input: $i) { ${FIELDS} } }`, { i: Object.assign({ id: marker.id }, input) })).sceneMarkerUpdate;
      try {
        rememberTags([...mainPick.picked, ...morePick.picked].filter((p) => !had.has(p.id)));
      } catch (err) {
        console.warn("last used tags", err); // a nicety – never a reason to fail after the marker is saved
      }
      generatePreviews("marker", [m.id], { overwrite: !isNew, quiet: true }); // (its hover preview and picture, in the background)
      d.close();
      toast(t("Saved"), "ok");
      done(m, isNew);
    } catch (e) {
      errorToast(e, "Marker");
    }
  };
  const del = $("[data-del]");
  if (del)
    del.onclick = async () => {
      try {
        await gql(`mutation($id: ID!) { sceneMarkerDestroy(id: $id) }`, { id: marker.id });
        d.close();
        done(null, false, marker.id);
      } catch (e) {
        errorToast(e, "Marker");
      }
    };
}
