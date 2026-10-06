// Make or edit a group (Stash's collection of scenes – "DVD collection"): cover picture (upload, link, paste, drop), name,
// aliases, date, director, studio, links, synopsis, tags. Which fields exist depends on the Stash version, so the form asks Stash first.

import { esc, icon, errorToast, toast, promptDialog, openDrawer } from "../ui.js";
import { t } from "../i18n.js";
import { gql } from "../api.js";
import { tagPicker } from "./tagpicker.js";
import { studioPicker } from "./studiopicker.js";

let schema = null;
async function loadSchema() {
  if (schema) return schema;
  const names = (x, k) => new Set(((x && x[k]) || []).map((f) => f.name));
  try {
    const d = await gql(`query GroupSchema {
      u: __type(name: "GroupUpdateInput") { inputFields { name } }
      o: __type(name: "Group") { fields { name } }
    }`);
    schema = { input: names(d.u, "inputFields"), output: names(d.o, "fields") };
  } catch (e) {
    schema = { input: new Set(), output: new Set() };
  }
  // (an unreadable schema = assume the usual fields of current Stash versions)
  if (!schema.input.size) schema.input = new Set(["name", "aliases", "date", "director", "synopsis", "urls", "studio_id", "tag_ids", "front_image"]);
  if (!schema.output.size) schema.output = new Set(["aliases", "date", "director", "synopsis", "urls", "studio", "tags", "front_image_path"]);
  return schema;
}

// id: an existing group – or null to make a new one.
// opts: { onSaved(id), name: what the name field starts with }
export async function openGroupEditor(id, opts = {}) {
  let sch, g;
  try {
    sch = await loadSchema();
    if (id) {
      const urlField = sch.output.has("urls") ? "urls" : "url";
      const d = await gql(
        `query($id: ID!) { findGroup(id: $id) { id name ${sch.output.has("aliases") ? "aliases" : ""} date director synopsis ${urlField} front_image_path studio { id name } tags { id name } } }`,
        { id }
      );
      g = d.findGroup;
      if (g && !g.urls) g.urls = g.url ? [g.url] : [];
    } else {
      g = { id: null, name: opts.name || "", aliases: "", date: "", director: "", synopsis: "", urls: [], front_image_path: "", studio: null, tags: [] };
    }
    if (!g) throw new Error(t("Group not found"));
  } catch (e) {
    errorToast(e, "Edit group");
    return;
  }
  const hasPic = !!g.front_image_path && !/default=true/.test(g.front_image_path);
  let image; // undefined = unchanged, string = new (link or data: URL)
  const hasAliases = sch.input.has("aliases");
  const aliasText = Array.isArray(g.aliases) ? g.aliases.join(", ") : g.aliases || "";

  const d = openDrawer({
    title: id ? t("Edit group") : t("New group"),
    body: `
      <section class="kb-pe-photo">
        <div class="kb-pe-img kb-group-img" data-drop title="${t("Drop or paste a picture here")}"><img alt="" data-img src="${hasPic ? esc(g.front_image_path) : ""}"${hasPic ? "" : ' class="is-empty"'}></div>
        <div class="kb-pe-photo-tools">
          <b>${t("Cover")}</b>
          <button type="button" class="kb-btn" data-upload>${icon("camera")}${t("Upload")}</button>
          <button type="button" class="kb-btn" data-imglink>${t("From a link")}</button>
          <small class="kb-hint">${t("Or drop / paste a picture onto it.")}</small>
          <input type="file" accept="image/*" data-file hidden>
        </div>
      </section>
      <section><div class="kb-pe-grid">
        <label class="kb-form-row is-wide"><span>${t("Name")}</span><input class="kb-field" data-f="name" value="${esc(g.name)}"></label>
        ${hasAliases ? `<label class="kb-form-row is-wide"><span>${t("Aliases (comma separated)")}</span><input class="kb-field" data-f="aliases" value="${esc(aliasText)}"></label>` : ""}
        <label class="kb-form-row"><span>${t("Date")}</span><input class="kb-field" type="date" data-f="date" value="${esc(g.date || "")}"></label>
        <label class="kb-form-row"><span>${t("Director")}</span><input class="kb-field" data-f="director" value="${esc(g.director || "")}"></label>
        <div class="kb-form-row is-wide"><span>${t("Studio")}</span><div class="kb-tagpick" data-studio></div></div>
        <label class="kb-form-row is-wide"><span>${t("Links (one per line)")}</span><textarea class="kb-field" data-f="urls" rows="2">${esc((g.urls || []).join("\n"))}</textarea></label>
        <label class="kb-form-row is-wide"><span>${t("Synopsis")}</span><textarea class="kb-field" data-f="synopsis" rows="5">${esc(g.synopsis || "")}</textarea></label>
      </div></section>
      <section><h3 class="kb-pe-h">${t("Tags")}</h3><div data-tags></div></section>
      ${id ? "" : `<p class="kb-hint">${t("Scenes are added on the group's page after it is made.")}</p>`}`,
    foot: `<span class="kb-spacer"></span><button class="kb-btn" data-cancel>${t("Cancel")}</button><button class="kb-btn is-primary" data-save>${id ? t("Save") : t("Create")}</button>`,
  });
  const el = d.el;
  el.classList.add("kb-pe", "kb-pe-studio");
  const $ = (s) => el.querySelector(s);
  const picker = tagPicker($("[data-tags]"), { include: (g.tags || []).map((x) => x.id), allowCreate: true, placeholder: t("Search or create a tag") });
  const studio = studioPicker($("[data-studio]"), {
    include: g.studio ? [g.studio.id] : [],
    names: g.studio ? { [g.studio.id]: g.studio.name } : {},
    placeholder: t("Search studio"),
  });

  // ---- Cover picture
  const setImage = (v) => {
    image = v;
    $("[data-img]").src = v;
    $("[data-img]").classList.remove("is-empty");
  };
  const readFile = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  const takeFile = async (file) => {
    if (!file || !/^image\//.test(file.type)) return;
    setImage(await readFile(file));
  };
  $("[data-upload]").onclick = () => $("[data-file]").click();
  $("[data-file]").onchange = (e) => takeFile(e.target.files[0]);
  $("[data-imglink]").onclick = async () => {
    const u = await promptDialog({ title: t("Cover from a link"), label: t("Address of the picture"), ok: t("Use") });
    if (u && /^https?:\/\//i.test(u.trim())) setImage(u.trim());
  };
  const drop = $("[data-drop]");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type));
    if (f) takeFile(f);
    else {
      const u = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
      if (/^https?:\/\//i.test(u)) setImage(u.trim());
    }
  });
  el.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData.files || [])].find((x) => /^image\//.test(x.type));
    if (!f) return;
    e.preventDefault();
    takeFile(f);
  });

  $("[data-cancel]").onclick = d.close;
  $("[data-save]").onclick = async () => {
    const v = (k) => ($(`[data-f="${k}"]`) ? $(`[data-f="${k}"]`).value.trim() : "");
    const input = { name: v("name"), date: v("date") || null, director: v("director"), synopsis: v("synopsis"), studio_id: studio.include[0] || null, tag_ids: picker.include };
    if (!input.name) return toast(t("The name can't be empty"), "error");
    if (hasAliases) input.aliases = v("aliases");
    const links = v("urls").split(/\n+/).map((u) => u.trim()).filter(Boolean);
    if (sch.input.has("urls")) input.urls = links;
    else input.url = links[0] || "";
    if (image !== undefined) input.front_image = image;
    if (id) input.id = id;
    const btn = $("[data-save]");
    btn.disabled = true;
    try {
      const m = id ? `mutation($i: GroupUpdateInput!) { groupUpdate(input: $i) { id } }` : `mutation($i: GroupCreateInput!) { groupCreate(input: $i) { id } }`;
      const r = await gql(m, { i: input });
      toast(id ? t("Group saved") : t("Group created"), "ok");
      d.close();
      opts.onSaved && opts.onSaved((r.groupUpdate || r.groupCreate || {}).id || id);
    } catch (e) {
      btn.disabled = false;
      errorToast(e, "Save");
    }
  };
}
