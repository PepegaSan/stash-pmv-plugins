// Sharing → Guide: what Sharing does, and how to make the links work from the internet (Tailscale or cloudflared).

import { t } from "../i18n.js";

const list = (tag, items) => `<${tag}>${items.map((x) => `<li>${x}</li>`).join("")}</${tag}>`;

export function mountGuide(host, ctx) {
  host.innerHTML = `
    <section class="kb-share-card kb-share-guide">
      <h2>${t("How it works")}</h2>
      ${list("ul", [
        t("Sharing sends photos and videos straight from one PC to another – there is no server in between and nobody can browse your library."),
        t("You give people a link. They open it (or paste it under Send in their Stash UI) and send you files. Everything lands in your Inbox first – nothing reaches your library until you press Accept."),
        t("Your tags decide what is wanted: files with a tag you don't want are turned away, and, if you like, only files with a tag you like are accepted."),
        t("You can switch a link off, delete it, block a sender or switch receiving off completely at any time."),
        t("To send: save someone's link under Send, pick what fits their taste from your library and press Send. Enter your name once – they see it."),
        t("Chat: short messages to people whose link you saved. They can only answer if they have your link – your first permanent link is added to what you send."),
      ])}
    </section>
    <section class="kb-share-card kb-share-guide">
      <h2>${t("Make your links work from the internet")}</h2>
      <p>${t("Inside your own network the links work as they are. For people elsewhere your PC has to be reachable from the internet: press “Make reachable from the internet” on My link. It uses Tailscale if that is connected, otherwise cloudflared. Only the receiver's port is opened, and only people with a valid link can send anything.")}</p>
      <p><b>${t("Tailscale – recommended: the address never changes")}</b></p>
      ${list("ol", [
        t("Install Tailscale on this PC (tailscale.com/download) and sign in. The icon in the taskbar must say Connected."),
        t("In Stash UI open Sharing → My link and press “Make reachable from the internet”."),
        t("The first time Tailscale asks you to allow Funnel: open the link from the message, confirm there, then press the button again."),
        t("Done: the address looks like https://your-pc.something.ts.net and stays the same, also after a restart – so a permanent link keeps working."),
      ])}
      <p class="kb-hint">${t("After a restart of the PC, links work again as soon as Tailscale is connected and Stash UI has been opened (it starts the receiver).")}</p>
      <p><b>${t("cloudflared – no account, but the address changes")}</b></p>
      ${list("ol", [
        t("On My link press “Install cloudflared” (Windows) – or install it yourself from Cloudflare."),
        t("Press “Make reachable from the internet”. The address looks like https://some-words.trycloudflare.com."),
        t("Important: this address is new every time the tunnel starts. After a restart of the PC or of Stash UI, every link you posted before stops working. Post expiring links (24 hours or 7 days) and send the new link when the address has changed."),
      ])}
    </section>
    <section class="kb-share-card kb-share-guide">
      <h2>${t("Good to know")}</h2>
      ${list("ul", [
        t("Your PC has to be on, Stash running and the receiver started – otherwise people see “Couldn't reach them”."),
        t("An expired or switched-off link answers “expired” or “switched off”. Delete a link to end it for good."),
        t("Only photo and video files are accepted. Limits for file size, inbox size and files per day are under More on My link."),
        t("Don't give your link to people you don't want to hear from. Anyone with it can send you files – but never into your library without your OK, and you can block them."),
      ])}
    </section>`;
  return { update() {}, destroy() {} };
}
