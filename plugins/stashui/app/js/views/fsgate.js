// Scans of all funscripts (problems, overview): they read every script of every scene on disk, which on a big
// library on a slow disk takes long – so they start on a click, not when the tab opens, and the last result is
// kept for this visit (module memory) with a "check again".

import { esc, fmtAgo } from "../ui.js";
import { t } from "../i18n.js";
import { largeNow } from "../scale.js";

// The page that asks first
export function gateHtml(title, text, button) {
  return `<div class="kb-empty"><b>${esc(title)}</b><p>${esc(text)}</p>${largeNow() ? `<p class="kb-hint">${t("Your library is big – this can take several minutes and keeps the disks busy meanwhile.")}</p>` : ""}<button class="kb-btn is-primary" data-scan>${esc(button)}</button></div>`;
}
// "Checked 3 minutes ago" with the button to do it again
export const againHtml = (at) => `<p class="kb-hint kb-fsgate-ago">${t("Checked {when}", { when: esc(fmtAgo(new Date(at).toISOString())) })} · <button type="button" class="kb-btn is-ghost" data-rescan>${t("Check again")}</button></p>`;
