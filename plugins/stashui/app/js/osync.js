// "Match the O video" as a small video editor: two bars one above the other – this video and the O video (which has this
// video running in its background). Drag a bar sideways to line it up, drag its ends to trim it, click the ruler to move the
// playhead, press Space to play both. Whatever the two bars show at the same moment plays together later (see oclip.js).
//
// Every bar has: s = where it sits on the timeline, i / o = the part of the video it shows (in / out, in the video's own time).
// The video time at timeline moment T is i + (T − s). O time = main time − offset, with
// offset = (A.i − A.s) − (O.i − O.s).

import { esc, icon, toast, errorToast, openDrawer } from "./ui.js";
import { t } from "./i18n.js";
import { findItems, getScene } from "./api.js";
import { runBackend } from "./interactive.js";
import { fpsOf, fmtExact } from "./frames.js";
import { oData, syncOf, setSync } from "./oclip.js";

const MIN_LEN = 0.2; // shortest a bar can be trimmed to
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function openOSync({ scene, onDone }) {
  const cur = syncOf(scene.id);
  const fpsA = fpsOf(scene);
  const durA = (scene.files[0] || {}).duration || 0;
  let other = null;
  const A = { k: "a", s: 0, i: 0, o: durA };
  const O = { k: "o", s: 0, i: 0, o: 0 };
  if (cur) {
    A.i = cur.from || 0;
    A.o = cur.to || durA;
    A.s = A.i;
    O.i = cur.start || 0;
    O.o = cur.end || cur.len || 0;
    O.s = cur.offset + O.i;
  }
  let T = 0; // the playhead (timeline time)
  let T0 = 0; // timeline time at the left edge
  let T1 = 60;
  let pps = 10; // pixels per second
  let fit = 10;
  let playing = false;
  let raf = 0;
  let clock = null;

  const d = openDrawer({
    title: t("Match the O video"),
    body: `
      <div class="kb-osync-pick" data-pick>
        <p class="kb-hint">${t("Choose the video with the O – the one that has this video running in its background.")}</p>
        <div class="kb-cut-find"><input class="kb-field" data-q placeholder="${esc(t("Search the O video …"))}" autocomplete="off"></div>
        <div class="kb-oc-grid" data-grid></div>
      </div>
      <div class="kb-osync-main" data-main hidden>
        <div class="kb-tl2-prev">
          ${["a", "o"]
            .map(
              (k) => `<figure class="kb-tl2-fig">
            <figcaption><span>${k === "a" ? t("This video") : esc(t("O video"))}</span><b data-tc${k}>0:00.000</b><button type="button" class="kb-btn is-icon is-ghost" data-snd="${k}" title="${esc(t("Sound on/off"))}"></button></figcaption>
            <div class="kb-tl2-vwrap"><video data-v${k} playsinline preload="auto"></video><div class="kb-tl2-off" data-off${k} hidden>${t("Outside the bar")}</div></div>
          </figure>`
            )
            .join("")}
        </div>
        <div class="kb-tl2-bar">
          <button type="button" class="kb-btn is-ghost" data-tostart title="${esc(t("To the start"))}">${icon("prev")}</button>
          <button type="button" class="kb-btn is-primary" data-play>${icon("play")}${t("Play both")}</button>
          <span class="kb-tl2-time" data-time>0:00.000</span>
          <span class="kb-spacer"></span>
          <label class="kb-tl2-zoom">${icon("zoomin")}<input type="range" min="0" max="100" value="0" data-zoom aria-label="${esc(t("Zoom"))}"></label>
        </div>
        <div class="kb-tl2-scroll" data-scroll>
          <div class="kb-tl2-inner" data-inner>
            <div class="kb-tl2-ruler" data-ruler></div>
            ${["a", "o"]
              .map(
                (k) => `<div class="kb-tl2-track"><div class="kb-tl2-clip is-${k}" data-clip="${k}"><i class="kb-tl2-h is-l" data-trim="l"></i><span class="kb-tl2-name" data-name${k}></span><i class="kb-tl2-h is-r" data-trim="r"></i></div></div>`
              )
              .join("")}
            <div class="kb-tl2-head" data-head></div>
          </div>
        </div>
        <p class="kb-hint">${t("Drag the O video's bar sideways to line it up with this video; drag the ends of a bar to trim it. Click the ruler to move the playhead; Space plays; the arrow keys step one picture.")}</p>
        <div class="kb-osync-match">
          <button type="button" class="kb-btn is-ghost" data-auto title="${esc(t("Compares the sound of both videos – works when the O video has the music of this video in it"))}">${icon("music")}${t("Find it by the sound")}</button>
          <span class="kb-osync-nudge" data-nudge title="${esc(t("Move the O video's bar in small steps"))}">
            <button type="button" class="kb-btn is-ghost" data-o="-1">−1 s</button>
            <button type="button" class="kb-btn is-ghost" data-o="-0.1">−0.1</button>
            <button type="button" class="kb-btn is-ghost" data-o="-f">−1 ${t("frame")}</button>
            <button type="button" class="kb-btn is-ghost" data-o="f">+1 ${t("frame")}</button>
            <button type="button" class="kb-btn is-ghost" data-o="0.1">+0.1</button>
            <button type="button" class="kb-btn is-ghost" data-o="1">+1 s</button>
          </span>
          <button type="button" class="kb-btn is-ghost" data-change>${t("Change the O video")}</button>
        </div>
        <p class="kb-hint" data-note></p>
      </div>`,
    foot: `<button class="kb-btn is-ghost" data-remove${cur ? "" : " hidden"}>${t("Remove the O video")}</button><span class="kb-spacer"></span><button class="kb-btn is-primary" data-save disabled>${t("Save")}</button>`,
    onClose: () => {
      stop();
      document.removeEventListener("keydown", onKey, true);
      [va, vo].forEach((v) => {
        v.pause();
        v.removeAttribute("src");
      });
    },
  });
  const el = d.el;
  el.classList.add("kb-osync");
  const $ = (s) => el.querySelector(s);
  const va = $("[data-va]");
  const vo = $("[data-vo]");
  const V = { a: va, o: vo };
  const C = { a: A, o: O };
  va.src = scene.paths.stream;
  vo.muted = true;
  const sndIcons = () => el.querySelectorAll("[data-snd]").forEach((b) => (b.innerHTML = icon(V[b.dataset.snd].muted ? "mute" : "volume")));
  sndIcons();
  el.querySelectorAll("[data-snd]").forEach(
    (b) =>
      (b.onclick = () => {
        V[b.dataset.snd].muted = !V[b.dataset.snd].muted;
        sndIcons();
      })
  );

  // ---------- choosing the O video ----------
  let reqId = 0;
  async function search() {
    const id = ++reqId;
    const q = $("[data-q]").value.trim();
    const grid = $("[data-grid]");
    grid.innerHTML = `<p class="kb-hint">${t("Loading …")}</p>`;
    try {
      const r = await findItems("scene", { q, per_page: 24, sort: "created_at", direction: "DESC" }, {}, null, { signal: undefined });
      if (id !== reqId) return;
      const ss = r.items.filter((s) => s.id !== scene.id);
      grid.innerHTML = ss.length
        ? ss.map((s) => `<button type="button" class="kb-cut-scene" data-id="${s.id}" title="${esc(s.title || "")}"><img loading="lazy" alt="" src="${esc((s.paths || {}).screenshot || "")}"><span>${esc(s.title || (s.files[0] || {}).basename || "")}</span></button>`).join("")
        : `<p class="kb-hint">${t("Nothing found.")}</p>`;
    } catch (e) {
      grid.innerHTML = "";
      errorToast(e, "O video");
    }
  }
  let qt = 0;
  $("[data-q]").oninput = () => {
    clearTimeout(qt);
    qt = setTimeout(search, 350);
  };
  $("[data-grid]").onclick = (e) => {
    const b = e.target.closest("[data-id]");
    if (b) choose(b.dataset.id);
  };
  $("[data-change]").onclick = () => {
    stop();
    $("[data-main]").hidden = true;
    $("[data-pick]").hidden = false;
    search();
  };

  async function choose(id) {
    try {
      other = await getScene(id);
    } catch (e) {
      return errorToast(e, "O video");
    }
    const dur = (other.files[0] || {}).duration || 0;
    const same = cur && String(cur.scene) === String(other.id);
    if (!same || !O.o) {
      O.i = 0;
      O.o = dur;
      O.s = A.s;
    }
    O.o = Math.min(O.o, dur || O.o);
    vo.src = other.paths.stream;
    $("[data-pick]").hidden = true;
    $("[data-main]").hidden = false;
    $("[data-namea]").textContent = scene.title || (scene.files[0] || {}).basename || t("This video");
    $("[data-nameo]").textContent = other.title || (other.files[0] || {}).basename || t("O video");
    $("[data-save]").disabled = false;
    layout(true);
    T = Math.min(A.s, O.s);
    paintHead();
    showAt(T);
  }

  // ---------- timeline geometry ----------
  const len = (c) => c.o - c.i;
  const end = (c) => c.s + len(c);
  const px = (time) => (time - T0) * pps;
  const sec = (x) => x / pps + T0;
  const scroll = $("[data-scroll]");
  const inner = $("[data-inner]");

  // the visible span of time; "fit" = everything inside the width
  function extent() {
    const lo = Math.min(A.s, O.s, 0);
    const hi = Math.max(end(A), end(O), 1);
    const margin = Math.max(5, (hi - lo) * 0.08);
    T0 = lo - margin;
    T1 = hi + margin * 2;
  }
  function layout(refit) {
    extent();
    const w = Math.max(200, scroll.clientWidth || 600);
    fit = (w - 4) / (T1 - T0);
    if (refit) {
      pps = fit;
      $("[data-zoom]").value = 0;
    }
    paintTimeline();
  }
  const STEPS = [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1800];
  const mmss = (s) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, "0")}`;
  function paintTimeline() {
    const hiNow = Math.max(T1, end(A) + 10, end(O) + 10);
    inner.style.width = Math.ceil((hiNow - T0) * pps) + "px";
    const step = STEPS.find((s) => s * pps >= 70) || 3600;
    let html = "";
    for (let tt = Math.ceil(T0 / step) * step; tt < hiNow; tt += step) html += `<span class="kb-tl2-tick" style="left:${px(tt)}px">${tt < 0 ? "−" : ""}${mmss(tt)}</span>`;
    $("[data-ruler]").innerHTML = html;
    ["a", "o"].forEach((k) => {
      const c = C[k];
      const e = $(`[data-clip="${k}"]`);
      e.style.left = px(c.s) + "px";
      e.style.width = Math.max(6, len(c) * pps) + "px";
      e.title = `${fmtExact(c.i)} – ${fmtExact(c.o)}`;
    });
    paintHead();
  }
  function paintHead() {
    $("[data-head]").style.left = px(T) + "px";
    $("[data-time]").textContent = (T < 0 ? "−" : "") + fmtExact(Math.abs(T));
  }

  // ---------- what the two pictures show at moment Tn ----------
  const srcTime = (c, Tn) => {
    const st = c.i + (Tn - c.s);
    return st >= c.i && st < c.o ? st : null;
  };
  function showAt(Tn) {
    ["a", "o"].forEach((k) => {
      const c = C[k];
      const v = V[k];
      const st = srcTime(c, Tn);
      $(`[data-off${k}]`).hidden = st != null;
      if (st != null) {
        if (Math.abs(v.currentTime - st) > 0.02) v.currentTime = st;
      } else v.pause();
      $(`[data-tc${k}]`).textContent = fmtExact(clamp(c.i + (Tn - c.s), 0, c.o || 0));
    });
  }

  // ---------- playing ----------
  const tEnd = () => Math.max(end(A), end(O));
  function loop(now) {
    if (!playing) return;
    T = clock.T + (now - clock.at) / 1000;
    if (T >= tEnd()) {
      T = tEnd();
      stop();
      return paintHead();
    }
    ["a", "o"].forEach((k) => {
      const v = V[k];
      const st = srcTime(C[k], T);
      $(`[data-off${k}]`).hidden = st != null;
      $(`[data-tc${k}]`).textContent = fmtExact(clamp(C[k].i + (T - C[k].s), 0, C[k].o || 0));
      if (st == null) return !v.paused && v.pause();
      if (v.paused) {
        v.currentTime = st;
        v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - st) > 0.2) v.currentTime = st;
    });
    paintHead();
    const x = px(T);
    if (x < scroll.scrollLeft + 20 || x > scroll.scrollLeft + scroll.clientWidth - 20) scroll.scrollLeft = Math.max(0, x - scroll.clientWidth * 0.2);
    raf = requestAnimationFrame(loop);
  }
  function play() {
    if (!other) return;
    if (T >= tEnd() - 0.05) T = Math.min(A.s, O.s);
    playing = true;
    clock = { T, at: performance.now() };
    $("[data-play]").innerHTML = `${icon("pause")}${t("Stop")}`;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!playing && !raf) return;
    playing = false;
    cancelAnimationFrame(raf);
    raf = 0;
    va.pause();
    vo.pause();
    $("[data-play]").innerHTML = `${icon("play")}${t("Play both")}`;
  }
  $("[data-play]").onclick = () => (playing ? stop() : play());
  $("[data-tostart]").onclick = () => {
    stop();
    T = Math.min(A.s, O.s);
    paintHead();
    showAt(T);
    scroll.scrollLeft = 0;
  };
  const seek = (Tn) => {
    const was = playing;
    stop();
    T = Tn;
    paintHead();
    showAt(T);
    if (was) play();
  };
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !other || $("[data-main]").hidden) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      playing ? stop() : play();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      seek(T + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 1 / fpsA));
    }
  }
  document.addEventListener("keydown", onKey, true);

  // ---------- dragging: move a bar, trim its ends, move the playhead ----------
  let drag = null;
  inner.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || !other) return;
    const rect = inner.getBoundingClientRect();
    const trim = e.target.closest("[data-trim]");
    const clip = e.target.closest("[data-clip]");
    if (clip) {
      const c = C[clip.dataset.clip];
      drag = { mode: trim ? "trim-" + trim.dataset.trim : "move", c, x0: e.clientX, s: c.s, i: c.i, o: c.o };
      stop();
    } else {
      drag = { mode: "head" };
      seek(sec(e.clientX - rect.left));
    }
    try {
      inner.setPointerCapture(e.pointerId);
    } catch (err) {
      /* (no such pointer) */
    }
    e.preventDefault();
  });
  inner.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.mode === "head") {
      T = sec(e.clientX - inner.getBoundingClientRect().left);
      paintHead();
      return showAt(T);
    }
    const dt = (e.clientX - drag.x0) / pps;
    const { c } = drag;
    const durOf = c === A ? durA : (other.files[0] || {}).duration || Infinity;
    if (drag.mode === "move") c.s = Math.max(T0, Math.round((drag.s + dt) * fpsA) / fpsA);
    else if (drag.mode === "trim-l") {
      const ni = clamp(Math.round((drag.i + dt) * fpsA) / fpsA, 0, drag.o - MIN_LEN);
      c.i = ni;
      c.s = drag.s + (ni - drag.i); // the picture stays where it is
    } else c.o = clamp(Math.round((drag.o + dt) * fpsA) / fpsA, drag.i + MIN_LEN, durOf);
    paintTimeline();
    showAt(T);
  });
  const dragEnd = (e) => {
    if (!drag) return;
    const was = drag.mode;
    drag = null;
    try {
      inner.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* (already gone) */
    }
    if (was !== "head") {
      // the timeline's left edge may have moved: keep what is on screen where it is
      const oldT0 = T0;
      extent();
      scroll.scrollLeft = Math.max(0, scroll.scrollLeft + (oldT0 - T0) * pps);
      paintTimeline();
    }
  };
  inner.addEventListener("pointerup", dragEnd);
  inner.addEventListener("pointercancel", dragEnd);

  // zoom
  $("[data-zoom]").oninput = (e) => {
    const centre = sec(scroll.scrollLeft + scroll.clientWidth / 2);
    pps = fit * Math.pow(80, Number(e.target.value) / 100);
    paintTimeline();
    scroll.scrollLeft = Math.max(0, px(centre) - scroll.clientWidth / 2);
  };

  // ---------- nudging, finding it by the sound ----------
  const moveO = (dt) => {
    O.s = Math.round((O.s + dt) * 1000) / 1000;
    layout(false);
    showAt(T);
  };
  $("[data-nudge]").onclick = (e) => {
    const b = e.target.closest("[data-o]");
    if (!b) return;
    stop();
    const v = b.dataset.o;
    moveO(v === "f" ? 1 / fpsA : v === "-f" ? -1 / fpsA : Number(v));
  };
  const offsetNow = () => A.i - A.s - (O.i - O.s);
  $("[data-auto]").onclick = async (e) => {
    if (!other) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    stop();
    $("[data-note]").textContent = t("Comparing the sound … (this can take a few seconds)");
    try {
      const r = await runBackend({ mode: "sync_audio", scene_a: scene.id, scene_b: other.id });
      O.s = r.offset - (A.i - A.s) + O.i; // so that the offset is r.offset
      layout(true);
      T = Math.max(A.s, O.s);
      paintHead();
      showAt(T);
      $("[data-note]").textContent = r.sure ? t("Found by the sound – check it with “Play both”.") : t("Not sure about this one (the sounds differ a lot) – check it with “Play both” and correct it by hand.");
    } catch (err) {
      $("[data-note]").textContent = "";
      errorToast(err, "O video");
    } finally {
      btn.disabled = false;
    }
  };

  // ---------- saving ----------
  $("[data-save]").onclick = async () => {
    await oData();
    const r2 = (n) => Math.round(n * 1000) / 1000;
    setSync(scene.id, {
      scene: other.id,
      offset: r2(offsetNow()),
      start: r2(O.i),
      end: r2(O.o),
      len: r2(O.o - O.i),
      from: r2(A.i),
      to: r2(A.o),
      title: other.title || (other.files[0] || {}).basename || "",
    });
    toast(t("The O video will play along with this video."), "ok");
    onDone && onDone();
    d.close();
  };
  $("[data-remove]").onclick = async () => {
    await oData();
    setSync(scene.id, null);
    onDone && onDone();
    d.close();
  };
  window.addEventListener("resize", () => el.isConnected && layout(false));

  if (cur) choose(cur.scene);
  else search();
}
