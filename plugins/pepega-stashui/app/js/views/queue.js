// Queue: play items one after another, reorder, shuffle.

import { esc, icon, store, plural, toast } from "../ui.js";
import { t } from "../i18n.js";
import { app, go, setQueueCount } from "../main.js";

export function render(main) {
  const draw = () => {
    const q = store.get("queue", []);
    const pos = store.get("queuePos", 0);
    main.innerHTML = `
      <header class="kb-head">
        <div class="kb-head-title">
          <h1 class="kb-h1">${t("Queue")}</h1>
          <p class="kb-sub">${q.length ? t("{what} waiting.", { what: plural(q.length, "item", "items") }) : t("Empty. Select items in a view and add them here, or press “Play” there.")}</p>
        </div>
        <div class="kb-head-tools"${q.length ? "" : " hidden"}>
          <button class="kb-btn" data-shuffle>${icon("shuffle")}${t("Shuffle")}</button>
          <button class="kb-btn" data-clear>${icon("trash")}${t("Clear")}</button>
          <button class="kb-btn is-primary" data-play>${icon("play")}${pos > 0 && pos < q.length ? t("Continue from no. {n}", { n: pos + 1 }) : t("Play")}</button>
        </div>
      </header>
      <ol class="kb-queue">${q
        .map(
          (it, i) => `<li class="${i === pos ? "is-current" : ""}" data-i="${i}" draggable="true">
            <span class="kb-queue-no">${i + 1}</span>
            ${it.thumb ? `<img alt="" loading="lazy" src="${esc(it.thumb)}">` : '<span class="kb-queue-ph"></span>'}
            <button class="kb-queue-title" data-go="${i}">${esc(it.title || it.id)}<small>${it.kind === "scene" ? t("Scene") : t("Image")}</small></button>
            <button class="kb-btn is-icon is-ghost" data-up="${i}" aria-label="${t("Move up")}"${i ? "" : " disabled"}>↑</button>
            <button class="kb-btn is-icon is-ghost" data-down="${i}" aria-label="${t("Move down")}"${i < q.length - 1 ? "" : " disabled"}>↓</button>
            <button class="kb-btn is-icon is-ghost" data-rm="${i}" aria-label="${t("Remove")}">${icon("close")}</button>
          </li>`
        )
        .join("")}</ol>`;
  };
  const save = (q) => {
    store.set("queue", q);
    setQueueCount();
    draw();
  };
  const playFrom = (i) => {
    const q = store.get("queue", []);
    if (!q[i]) return;
    store.set("queuePos", i);
    app.context = { queue: true };
    go((q[i].kind === "scene" ? "scene/" : "image/") + q[i].id);
  };

  main.addEventListener("click", (e) => {
    const q = store.get("queue", []);
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.dataset.go != null) return playFrom(Number(btn.dataset.go));
    if (btn.dataset.rm != null) {
      q.splice(Number(btn.dataset.rm), 1);
      return save(q);
    }
    if (btn.dataset.up != null || btn.dataset.down != null) {
      const i = Number(btn.dataset.up != null ? btn.dataset.up : btn.dataset.down);
      const j = btn.dataset.up != null ? i - 1 : i + 1;
      [q[i], q[j]] = [q[j], q[i]];
      return save(q);
    }
    if (btn.matches("[data-shuffle]")) {
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
      store.set("queuePos", 0);
      toast(t("Shuffled"));
      return save(q);
    }
    if (btn.matches("[data-clear]")) {
      store.set("queuePos", 0);
      return save([]);
    }
    if (btn.matches("[data-play]")) {
      const pos = store.get("queuePos", 0);
      return playFrom(pos < q.length ? pos : 0);
    }
  });

  // Drag to reorder
  let dragI = null;
  main.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li[data-i]");
    if (li) dragI = Number(li.dataset.i);
  });
  main.addEventListener("dragover", (e) => {
    if (dragI != null && e.target.closest("li[data-i]")) e.preventDefault();
  });
  main.addEventListener("drop", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li || dragI == null) return;
    e.preventDefault();
    const q = store.get("queue", []);
    const [it] = q.splice(dragI, 1);
    q.splice(Number(li.dataset.i), 0, it);
    dragI = null;
    save(q);
  });

  draw();
}
