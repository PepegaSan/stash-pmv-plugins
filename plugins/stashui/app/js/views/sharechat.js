// Sharing → Chat: short text messages between people who have each other's links.
// A message you send goes straight to their receiver (and is kept in this browser); what people send you arrives in your
// receiver and is shown here. Whoever you write to can only answer if they have your link: it is added to what you send
// (your first permanent link). Conversations are matched by the address behind the link.

import { esc, toast, errorToast, confirmDialog } from "../ui.js";
import { t } from "../i18n.js";
import * as C from "../shareconn.js";
import { avatarHtml, startCard } from "./sharing.js";

const keyOf = (url) => {
  const l = C.parseLink(url);
  return l ? l.base.toLowerCase() : "";
};
const clock = (sec) => new Date(sec * 1000).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function mountChat(host, ctx) {
  let cur = "";
  let sig = "";

  function conversations() {
    const map = new Map();
    const get = (key, init) => {
      if (!map.has(key)) map.set(key, Object.assign({ key, name: "", avatar: "", url: "", contact: false, msgs: [], unread: 0, ids: [] }, init));
      return map.get(key);
    };
    for (const c of C.contacts()) get(keyOf(c.url), { name: c.name, avatar: c.avatar, url: c.url, contact: true });
    if (ctx.running) {
      for (const m of ctx.s.messages) {
        const k = keyOf(m.reply) || "sid:" + (m.sid || m.from);
        const cv = get(k, { name: m.from });
        if (!cv.contact) {
          cv.name = m.from || cv.name;
          if (m.reply) cv.url = m.reply;
        }
        cv.msgs.push({ side: "in", at: m.at, text: m.text, id: m.id });
        cv.ids.push(m.id);
        if (!m.read) cv.unread++;
      }
    }
    for (const [url, arr] of Object.entries(C.sentChat())) {
      const cv = get(keyOf(url), { name: t("Unknown"), url });
      if (!cv.url) cv.url = url;
      arr.forEach((m) => cv.msgs.push({ side: "out", at: m.at, text: m.text }));
    }
    const list = [...map.values()];
    list.forEach((cv) => cv.msgs.sort((a, b) => a.at - b.at));
    // the latest first; saved links without messages after them
    return list.filter((cv) => cv.msgs.length || cv.contact).sort((a, b) => (b.msgs.length ? b.msgs[b.msgs.length - 1].at : 0) - (a.msgs.length ? a.msgs[a.msgs.length - 1].at : 0) || a.name.localeCompare(b.name));
  }

  function skeleton() {
    host.innerHTML = `
      <div class="kb-share-two">
        <section class="kb-share-card kb-share-side"><h2>${t("Chats")}</h2><div class="kb-share-contacts" data-list></div></section>
        <section class="kb-share-card kb-share-thread" data-thread>
          <div class="kb-share-who" data-head></div>
          <div class="kb-share-msgs" data-msgs></div>
          <form class="kb-share-compose" data-form>
            <input class="kb-field" data-text maxlength="2000" placeholder="${esc(t("Write a message"))}" autocomplete="off">
            <button type="submit" class="kb-btn is-primary" data-sendbtn>${t("Send")}</button>
          </form>
        </section>
      </div>`;
    host.querySelector("[data-form]").onsubmit = async (e) => {
      e.preventDefault();
      const inp = host.querySelector("[data-text]");
      const text = inp.value.trim();
      const cv = conversations().find((c) => c.key === cur);
      if (!text || !cv || !cv.url) return;
      if (!C.me().name) return toast(t("Enter your name first"), "err");
      inp.disabled = true;
      try {
        await C.sendMessage(cv.url, text);
        C.keepSent(cv.url, text);
        inp.value = "";
        sig = "";
        draw();
      } catch (err) {
        errorToast(err, t("Chat"));
      }
      inp.disabled = false;
      inp.focus();
    };
  }

  function draw() {
    const list = conversations();
    if (ctx.arg) {
      const k = keyOf(ctx.arg);
      if (k) cur = k;
      ctx.arg = null;
    }
    if (!cur || !list.some((c) => c.key === cur)) cur = list.length ? list[0].key : "";
    const cv = list.find((c) => c.key === cur);
    const s = JSON.stringify([cur, list.map((c) => [c.key, c.unread, c.msgs.length, c.name, c.url])]);
    if (s === sig) return;
    sig = s;
    const lst = host.querySelector("[data-list]");
    lst.innerHTML = list.length
      ? list.map((c) => `<button type="button" class="kb-share-contact${c.key === cur ? " is-on" : ""}" data-key="${esc(c.key)}">${avatarHtml(c.avatar, c.name)}<span>${esc(c.name || t("Unknown"))}</span>${c.unread ? `<b class="kb-share-n">${c.unread}</b>` : ""}</button>`).join("")
      : `<p class="kb-hint">${t("No chats yet. Save someone's link in Send, then write to them.")}</p>`;
    lst.querySelectorAll("[data-key]").forEach((b) => (b.onclick = () => ((cur = b.dataset.key), (sig = ""), draw())));
    const head = host.querySelector("[data-head]");
    const msgs = host.querySelector("[data-msgs]");
    const inp = host.querySelector("[data-text]");
    const btn = host.querySelector("[data-sendbtn]");
    if (!cv) {
      head.innerHTML = "";
      msgs.innerHTML = `<p class="kb-hint">${t("Pick a chat on the left.")}</p>`;
      inp.disabled = btn.disabled = true;
      return;
    }
    head.innerHTML = `${avatarHtml(cv.avatar, cv.name, "is-big")}<div><h2>${esc(cv.name || t("Unknown"))}</h2><small class="kb-hint">${cv.url ? esc(C.parseLink(cv.url).base) : t("no link to answer")}</small></div>
      <div class="kb-share-row kb-share-headacts">
        ${cv.contact || !cv.url ? "" : `<button type="button" class="kb-btn" data-save>${t("Save link")}</button>`}
        ${cv.ids.length ? `<button type="button" class="kb-btn is-ghost" data-block>${t("Block")}</button>` : ""}
        <button type="button" class="kb-btn is-ghost kb-pdanger" data-clear>${t("Delete chat")}</button>
      </div>`;
    msgs.innerHTML = cv.msgs.length
      ? cv.msgs.map((m) => `<div class="kb-share-msg is-${m.side}"><span>${esc(m.text)}</span><small>${esc(clock(m.at))}</small></div>`).join("")
      : `<p class="kb-hint">${t("No messages yet.")}</p>`;
    msgs.scrollTop = msgs.scrollHeight;
    inp.disabled = btn.disabled = !cv.url;
    if (!cv.url) inp.placeholder = t("They didn't send a link to answer – ask for their link");
    else inp.placeholder = t("Write a message");
    const q = (x) => head.querySelector(x);
    const sv = q("[data-save]");
    if (sv) sv.onclick = () => (C.addContact({ url: cv.url, name: cv.name }), (sig = ""), draw());
    const bl = q("[data-block]");
    if (bl)
      bl.onclick = async () => {
        if (!(await confirmDialog({ title: t("Block sender"), text: t("Block {name}? Their files and messages are no longer accepted.", { name: cv.name }), ok: t("Block"), danger: true }))) return;
        try {
          await C.adm("/admin/block", { action: "block", id: cv.ids[cv.ids.length - 1] });
          toast(t("Blocked"), "ok");
          await ctx.refresh();
        } catch (e) {
          errorToast(e, t("Chat"));
        }
      };
    q("[data-clear]").onclick = async () => {
      if (!(await confirmDialog({ title: t("Delete chat"), text: t("Delete all messages with {name}? Only on this PC.", { name: cv.name }), ok: t("Delete"), danger: true }))) return;
      try {
        if (cv.ids.length) await C.adm("/admin/msg", { action: "del", ids: cv.ids });
        const all = C.sentChat();
        for (const u of Object.keys(all)) if (keyOf(u) === cv.key) delete all[u];
        (await import("../ui.js")).store.set("shareChat", all);
        sig = "";
        await ctx.refresh();
        draw();
      } catch (e) {
        errorToast(e, t("Chat"));
      }
    };
    // opened: what was unread is read now
    if (cv.unread) C.adm("/admin/msg", { action: "read", ids: cv.ids }).then(() => ctx.refresh()).catch(() => {});
  }

  return {
    update() {
      // Writing to saved links works without the receiver; only answers need it
      if (!ctx.running && !C.contacts().length) {
        if (!host.querySelector("[data-start]")) {
          host.innerHTML = startCard(ctx, t("Start it to receive messages. You can write to saved links without it."));
          const b = host.querySelector("[data-start]");
          b.onclick = async () => ((b.disabled = true), await ctx.start(), (b.disabled = false));
        }
        return;
      }
      if (!host.querySelector("[data-list]")) {
        skeleton();
        sig = "";
      }
      draw();
    },
    destroy() {},
  };
}
