// Phone upload: send photos and videos from your phone's gallery to a folder of your library.
// Stash UI's backend starts a small receiver in your home network (phoneup.py); this page shows its QR code, the
// folder, and the files that arrive – and scans the folder when something new came in.

import { esc, icon, toast, errorToast, store, fmtBytes } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { runBackend } from "../interactive.js";

let qrLoading = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLoading) {
    qrLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("../vendor/qrcode.js", import.meta.url).href;
      s.onload = () => resolve(window.qrcode);
      s.onerror = () => reject(new Error("QR code library missing"));
      document.head.appendChild(s);
    });
  }
  return qrLoading;
}
const qrSvg = async (text) => {
  const qrcode = await loadQr();
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 3 });
};

export async function render(main) {
  main.innerHTML = `
    <header class="kb-head">
      <div class="kb-head-title">
        <h1 class="kb-h1">${t("Phone upload")}</h1>
        <p class="kb-sub">${t("Send photos and videos from your phone's gallery to your library – over your home Wi-Fi, no cable, no cloud.")}</p>
      </div>
    </header>
    <div class="kb-phone" data-body><div class="kb-loading">${t("Loading …")}</div></div>`;
  const body = main.querySelector("[data-body]");
  let alive = true;
  let timer = 0;
  let st = null;
  let urlIx = 0;
  let seen = null; // files counted so far (for the automatic scan); null = not counted yet
  let scanTimer = 0;
  let listFailed = false;

  const scanOn = () => store.get("phoneScan", true);
  async function scan() {
    if (!st || !st.folder) return;
    try {
      await gql(`mutation($i: ScanMetadataInput!) { metadataScan(input: $i) }`, { i: { paths: [st.folder] } });
      toast(t("Scanning the upload folder …"), "ok");
    } catch (e) {
      errorToast(e, "Scan");
    }
  }

  async function paint() {
    if (!alive) return;
    if (!st) return;
    const roots = st.roots || [];
    const saved = store.get("phoneFolder", { root: "", name: "Phone uploads" });
    if (!st.running) {
      body.innerHTML = `
        <section class="kb-phone-card">
          <h2>${t("Where should it go?")}</h2>
          <p class="kb-hint">${t("Everything you send is saved in this folder of your library. Stash then scans it, and the files show up like any other.")}</p>
          ${roots.length > 1 ? `<label class="kb-form-row"><span>${t("Library folder")}</span><select class="kb-field" data-root>${roots.map((r) => `<option value="${esc(r)}"${r === saved.root ? " selected" : ""}>${esc(r)}</option>`).join("")}</select></label>` : `<p class="kb-hint"><b>${esc(roots[0] || "")}</b></p>`}
          <label class="kb-form-row"><span>${t("Subfolder")}</span><input class="kb-field" data-name value="${esc(saved.name || "Phone uploads")}" spellcheck="false"></label>
          <label class="kb-check"><input type="checkbox" data-scan${scanOn() ? " checked" : ""}> ${t("Scan the folder by itself when something arrives")}</label>
          <div class="kb-phone-acts"><button type="button" class="kb-btn is-primary" data-start>${icon("phone")}${t("Start")}</button></div>
          <p class="kb-hint">${t("It opens a small server on this PC for your home network only while you use it. Only people with the link (the QR code) can send files, and only photos and videos are accepted. Windows may ask once whether Python may use the network – allow it for private networks.")}</p>
        </section>`;
      body.querySelector("[data-scan]").onchange = (e) => store.set("phoneScan", e.target.checked);
      body.querySelector("[data-start]").onclick = async (e) => {
        const btn = e.currentTarget;
        const root = (body.querySelector("[data-root]") || {}).value || roots[0] || "";
        const name = body.querySelector("[data-name]").value.trim() || "Phone uploads";
        store.set("phoneFolder", { root, name });
        btn.disabled = true;
        try {
          st = await runBackend({ mode: "phone_start", root, name });
          seen = null;
          urlIx = 0;
          paint();
          poll();
        } catch (err) {
          btn.disabled = false;
          errorToast(err, "Phone upload");
        }
      };
      return;
    }
    const url = (st.urls || [])[urlIx] || "";
    body.innerHTML = `
      <section class="kb-phone-card kb-phone-run">
        <div class="kb-phone-qr" data-qr aria-label="${esc(t("QR code"))}"></div>
        <div class="kb-phone-side">
          <h2>${t("Scan this with your phone")}</h2>
          <ol class="kb-phone-steps">
            <li>${t("Your phone has to be on the same Wi-Fi as this PC.")}</li>
            <li>${t("Open the camera and point it at the code, then open the link.")}</li>
            <li>${t("Choose the photos and videos – they are sent right away. Keep the page open until it says “All done”.")}</li>
          </ol>
          <div class="kb-phone-url"><code data-url>${esc(url)}</code><button type="button" class="kb-btn is-ghost" data-copy title="${esc(t("Copy the link"))}">${icon("copies")}</button></div>
          ${(st.urls || []).length > 1 ? `<p class="kb-hint">${t("Doesn't open? This PC has several network addresses – try another:")} ${(st.urls || []).map((u, i) => `<button type="button" class="kb-chip${i === urlIx ? " is-on" : ""}" data-ip="${i}">${esc(u.replace(/^http:\/\//, "").split(":")[0])}</button>`).join("")}</p>` : ""}
          ${(st.urls || []).length ? "" : `<p class="kb-hint">${t("No network address found – is this PC connected to Wi-Fi or a cable?")}</p>`}
          <p class="kb-hint">${t("Saving to")}: <b>${esc(st.folder)}</b></p>
          <label class="kb-check"><input type="checkbox" data-scan${scanOn() ? " checked" : ""}> ${t("Scan the folder by itself when something arrives")}</label>
          <div class="kb-phone-acts"><button type="button" class="kb-btn" data-scannow>${icon("search")}${t("Scan now")}</button><button type="button" class="kb-btn is-ghost kb-pdanger" data-stop>${icon("stop")}${t("Stop")}</button></div>
        </div>
      </section>
      <section class="kb-phone-card">
        <h2>${t("Received")} <small data-total></small></h2>
        <div class="kb-phone-files" data-files><p class="kb-hint">${t("Nothing yet.")}</p></div>
        ${listFailed ? `<p class="kb-hint">${t("This page can't read the list from here – the uploads still arrive.")}</p>` : ""}
      </section>`;
    qrSvg(url)
      .then((svg) => alive && body.querySelector("[data-qr]") && (body.querySelector("[data-qr]").innerHTML = svg))
      .catch(() => body.querySelector("[data-qr]") && (body.querySelector("[data-qr]").textContent = t("QR code unavailable – type the link into your phone.")));
    body.querySelector("[data-copy]").onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast(t("Link copied"), "ok");
      } catch (e) {
        const r = document.createRange();
        r.selectNodeContents(body.querySelector("[data-url]"));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
      }
    };
    body.querySelectorAll("[data-ip]").forEach((b) => (b.onclick = () => ((urlIx = Number(b.dataset.ip)), paint())));
    body.querySelector("[data-scan]").onchange = (e) => store.set("phoneScan", e.target.checked);
    body.querySelector("[data-scannow]").onclick = scan;
    body.querySelector("[data-stop]").onclick = async () => {
      clearTimeout(timer);
      try {
        st = await runBackend({ mode: "phone_stop" });
        toast(t("Phone upload stopped"), "ok");
      } catch (e) {
        errorToast(e, "Phone upload");
      }
      paint();
    };
    showFiles(lastList);
  }

  let lastList = null;
  function showFiles(d) {
    const box = body.querySelector("[data-files]");
    if (!box || !d) return;
    lastList = d;
    body.querySelector("[data-total]").textContent = d.total ? `· ${d.total}${d.busy ? " · " + t("receiving …") : ""}` : d.busy ? `· ${t("receiving …")}` : "";
    if (!d.files.length) return;
    box.innerHTML = d.files
      .slice()
      .reverse()
      .map((f) => `<div class="kb-phone-file"><span>${esc(f.name)}</span><small>${fmtBytes(f.size)} · ${new Date(f.at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>`)
      .join("");
  }

  // The list comes straight from the receiver (it answers this page, with the token)
  async function poll() {
    clearTimeout(timer);
    if (!alive || !st || !st.running) return;
    try {
      const r = await fetch(`${location.protocol}//${location.hostname}:${st.port}/api/list?k=${encodeURIComponent(st.token)}`, { cache: "no-store" });
      const d = await r.json();
      if (listFailed) {
        listFailed = false;
        paint();
      }
      showFiles(d);
      if (seen === null) seen = d.total; // what was there before this page looked isn't "new"
      else if (d.total > seen) {
        seen = d.total;
        clearTimeout(scanTimer);
        if (scanOn()) scanTimer = setTimeout(() => !(lastList && lastList.busy) && scan(), 7000); // a quiet moment after the last file
      }
    } catch (e) {
      if (!listFailed) {
        listFailed = true;
        paint();
      }
    }
    timer = setTimeout(poll, 2500);
  }

  try {
    st = await runBackend({ mode: "phone_status" });
    await paint();
    if (st.running) poll();
  } catch (e) {
    body.innerHTML = `<div class="kb-empty"><b>${t("Couldn't start the phone upload")}</b><p>${esc(e.message)}</p></div>`;
  }
  return () => {
    alive = false;
    clearTimeout(timer);
    clearTimeout(scanTimer);
  };
}
