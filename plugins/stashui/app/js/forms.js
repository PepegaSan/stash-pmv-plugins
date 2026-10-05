// Form builder based on the Stash API: types are read live from GraphQL,
// so every option (including new ones after a Stash update) stays editable.

import { gql } from "./api.js";
import { esc } from "./ui.js";
import { t } from "./i18n.js";

const typeCache = new Map();
export async function typeInfo(name) {
  if (typeCache.has(name)) return typeCache.get(name);
  const p = gql(
    `query($n: String!) { __type(name: $n) { name kind enumValues { name } inputFields { name type { ...T } } fields { name type { ...T } } } }
     fragment T on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }`,
    { n: name }
  ).then((d) => d.__type);
  typeCache.set(name, p);
  return p;
}

// Unwrap list/non-null → { list, named, kind }
export function unwrap(t) {
  let list = false;
  while (t && (t.kind === "NON_NULL" || t.kind === "LIST")) {
    if (t.kind === "LIST") list = true;
    t = t.ofType;
  }
  return { list, named: t && t.name, kind: t && t.kind };
}

// Build a query selection from a result type (objects recursively)
export async function selection(typeName, depth = 3) {
  const t = await typeInfo(typeName);
  const parts = [];
  for (const f of t.fields || []) {
    const u = unwrap(f.type);
    if (u.kind === "OBJECT") {
      if (depth <= 0) continue;
      const inner = await selection(u.named, depth - 1);
      if (inner) parts.push(`${f.name} { ${inner} }`);
    } else if (u.kind !== "UNION" && u.kind !== "INTERFACE") parts.push(f.name);
  }
  return parts.join(" ");
}

// ---------- Labels ----------
// [name, explanation]. Anything without an entry gets a humanized field name.
export const LABELS = {
  // Library
  stashes: ["Library folders", "Folders Stash scans. For each folder you can choose whether videos or images are ignored."],
  videoExtensions: ["Video extensions", "File extensions treated as video, one per line."],
  imageExtensions: ["Image extensions", "File extensions treated as images, one per line."],
  galleryExtensions: ["Archive extensions", "Archives (e.g. zip) that are read as galleries."],
  createGalleriesFromFolders: ["Turn image folders into galleries", "Every folder with images automatically gets a gallery."],
  galleryCoverRegex: ["Gallery cover", "Regular expression for file names used as the cover image."],
  excludes: ["Exclude videos", "Regular expressions for paths skipped when scanning videos."],
  imageExcludes: ["Exclude images", "Regular expressions for paths skipped when scanning images."],
  writeImageThumbnails: ["Store image thumbnails", "Faster browsing, needs some space."],
  createImageClipsFromVideos: ["Read short videos as image clips", "Videos in image folders are treated as animated images."],
  calculateMD5: ["Calculate MD5 checksum", "In addition to the fast oshash. Slower scanning."],
  videoFileNamingAlgorithm: ["Naming of generated files", "Which checksum previews and sprites are named after."],
  // Previews
  parallelTasks: ["Parallel tasks", "How many files are processed at once. 0 = automatic."],
  previewSegments: ["Segments per preview", "How many spots of the video the hover preview is made of."],
  previewSegmentDuration: ["Segment length (seconds)", ""],
  previewExcludeStart: ["Skip start", "Seconds or percent (e.g. 5%) left out at the start."],
  previewExcludeEnd: ["Skip end", "Seconds or percent left out at the end."],
  previewPreset: ["Preview encoding quality", "Slower presets give smaller files."],
  previewAudio: ["Audio in previews", ""],
  useCustomSpriteInterval: ["Custom interval for timeline images", ""],
  spriteInterval: ["Timeline image interval (seconds)", ""],
  minimumSprites: ["Minimum number of timeline images", ""],
  maximumSprites: ["Maximum number of timeline images", ""],
  spriteScreenshotSize: ["Timeline image width (pixels)", ""],
  drawFunscriptHeatmapRange: ["Draw funscript heatmap with range", ""],
  // Playback
  maxTranscodeSize: ["Maximum resolution when generating", "Upper limit for generated transcodes."],
  maxStreamingTranscodeSize: ["Maximum resolution when streaming", "Upper limit when a video is transcoded live."],
  transcodeHardwareAcceleration: ["Hardware acceleration", "Use the graphics card for transcoding when possible."],
  transcodeInputArgs: ["FFmpeg input arguments (generating)", "One per line."],
  transcodeOutputArgs: ["FFmpeg output arguments (generating)", "One per line."],
  liveTranscodeInputArgs: ["FFmpeg input arguments (streaming)", "One per line."],
  liveTranscodeOutputArgs: ["FFmpeg output arguments (streaming)", "One per line."],
  ffmpegPath: ["Path to ffmpeg", "Empty = automatic."],
  ffprobePath: ["Path to ffprobe", "Empty = automatic."],
  // Paths
  databasePath: ["Database", "Changes take effect after restarting Stash."],
  backupDirectoryPath: ["Backups", ""],
  deleteTrashPath: ["Trash for deleted files", "Empty = files are deleted permanently."],
  generatedPath: ["Generated files", "Previews, sprites, transcodes."],
  metadataPath: ["Metadata export", ""],
  scrapersPath: ["Scrapers", ""],
  pluginsPath: ["Plugins", ""],
  cachePath: ["Cache", ""],
  blobsPath: ["Image data (blobs)", ""],
  blobsStorage: ["Store image data in", "Database or file system."],
  customPerformerImageLocation: ["Custom performer images", ""],
  pythonPath: ["Path to Python", "For plugins and scrapers. Empty = automatic."],
  configFilePath: ["Configuration file", ""],
  // Security
  username: ["Username", "Leave empty to run Stash without a login."],
  password: ["Password", "Leave empty = unchanged."],
  maxSessionAge: ["Login valid for (seconds)", ""],
  apiKey: ["API key", "For external programs. Generating a new one invalidates the old one."],
  // Log
  logFile: ["Log file", ""],
  logOut: ["Also print the log to the terminal", ""],
  logLevel: ["Log level", "Trace, Debug, Info, Warning or Error."],
  logAccess: ["Log every request", ""],
  logFileMaxSize: ["Maximum log file size (MB)", ""],
  // Interface (classic Stash)
  language: ["Language", "e.g. en-US or de-DE."],
  sfwContentMode: ["SFW mode", "Hides adult terms in the classic interface."],
  menuItems: ["Menu items of the classic interface", "One per line."],
  soundOnPreview: ["Audio in previews", ""],
  wallShowTitle: ["Titles in the wall view", ""],
  wallPlayback: ["Playback in the wall view", "video, animation or image."],
  showScrubber: ["Preview bar below the player", ""],
  maximumLoopDuration: ["Loop automatically up to (seconds)", "Short videos up to this length play in a loop."],
  noBrowser: ["Don't open a browser on start", ""],
  notificationsEnabled: ["Desktop notifications", ""],
  autostartVideo: ["Start videos automatically", ""],
  autostartVideoOnPlaySelected: ["Play selected starts right away", ""],
  continuePlaylistDefault: ["Continue playlists automatically", ""],
  showStudioAsText: ["Studio as text instead of logo", ""],
  css: ["Custom CSS", "Loaded in the classic interface."],
  cssEnabled: ["Custom CSS enabled", ""],
  javascript: ["Custom JavaScript", ""],
  javascriptEnabled: ["Custom JavaScript enabled", ""],
  customLocales: ["Custom translations (JSON)", ""],
  customLocalesEnabled: ["Custom translations enabled", ""],
  disableCustomizations: ["Disable all customizations", "Plugins, CSS and JavaScript off in the classic interface."],
  imageLightbox: ["Image viewer of the classic interface", ""],
  disableDropdownCreate: ["Disallow creating from dropdowns", ""],
  handyKey: ["Handy key", "For The Handy (interactive playback)."],
  funscriptOffset: ["Funscript offset (ms)", ""],
  useStashHostedFunscript: ["Serve funscripts from Stash", ""],
  // DLNA
  serverName: ["Server name", "How Stash appears on the network."],
  enabled: ["DLNA server on", "TVs and other devices on the network can access the library."],
  port: ["Port", ""],
  whitelistedIPs: ["Allowed devices (IP)", "One per line. Empty = all."],
  interfaces: ["Network interfaces", "One per line. Empty = all."],
  videoSortOrder: ["Video sort order", ""],
  // Scraper connection
  scraperUserAgent: ["User agent", "Browser identifier for requests to websites."],
  scraperCDPPath: ["Chrome path (CDP)", "For scrapers that need a real browser."],
  scraperCertCheck: ["Check certificates", ""],
  excludeTagPatterns: ["Ignore tags when scraping", "Regular expressions, one per line."],
  // Task options
  scanGenerateCovers: ["Generate covers", ""],
  scanGeneratePreviews: ["Generate video previews", "The preview shown when hovering a video."],
  scanGenerateImagePreviews: ["Generate animated image previews", ""],
  scanGenerateSprites: ["Generate timeline images", "The preview shown when hovering the timeline."],
  scanGeneratePhashes: ["Generate perceptual hashes", "Finds duplicate videos."],
  scanGenerateImagePhashes: ["Perceptual hashes for images", ""],
  scanGenerateThumbnails: ["Generate image thumbnails", ""],
  scanGenerateClipPreviews: ["Generate previews for image clips", ""],
  rescan: ["Rescan unchanged files too", ""],
  covers: ["Covers", ""],
  previews: ["Video previews", ""],
  imagePreviews: ["Animated image previews", ""],
  previewOptions: ["Preview settings", ""],
  sprites: ["Timeline images", ""],
  markers: ["Marker previews", ""],
  markerImagePreviews: ["Marker image previews", ""],
  markerScreenshots: ["Marker screenshots", ""],
  transcodes: ["Transcodes", "Converted versions of videos the browser can't play directly."],
  forceTranscodes: ["Transcode all videos", ""],
  phashes: ["Perceptual hashes (videos)", ""],
  interactiveHeatmapsSpeeds: ["Heatmaps for interactive videos", ""],
  imageThumbnails: ["Image thumbnails", ""],
  clipPreviews: ["Previews for image clips", ""],
  imagePhashes: ["Perceptual hashes (images)", ""],
  overwrite: ["Overwrite existing", "Otherwise only missing files are generated."],
  dryRun: ["Only show, delete nothing", "Dry run: lists in the log what would be removed."],
  paths: ["Only these folders", "One per line. Empty = whole library."],
};

export const ENUM_LABELS = {
  previewPreset: { ultrafast: "ultra fast", veryfast: "very fast", fast: "fast", medium: "medium", slow: "slow", slower: "slower", veryslow: "very slow" },
  StreamingResolutionEnum: { LOW: "240p", STANDARD: "480p", STANDARD_HD: "720p", FULL_HD: "1080p", FOUR_K: "4K", ORIGINAL: "Original" },
  BlobsStorageType: { DATABASE: "Database", FILESYSTEM: "File system" },
  HashAlgorithm: { MD5: "MD5", OSHASH: "oshash (fast)" },
  ImageLightboxDisplayMode: { ORIGINAL: "Original size", FIT_XY: "Fit to screen", FIT_X: "Fit width" },
  ImageLightboxScrollMode: { ZOOM: "Zoom", PAN_Y: "Scroll up and down" },
};
// Text settings that only allow a few values → dropdown
const STRING_CHOICES = { wallPlayback: { video: "Video", animation: "Animation", image: "Image" } };

const humanize = (n) => n.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
// Labels and explanations are translated here (the English text is the key)
export const labelOf = (n) => (LABELS[n] ? t(LABELS[n][0]) : t(humanize(n)));
export const helpOf = (n) => (LABELS[n] && LABELS[n][1] ? t(LABELS[n][1]) : "");

// ---------- Fields ----------
// Returns HTML for a field; values are collected again with readFields.

export async function fieldHtml(name, type, value, path) {
  const u = unwrap(type);
  const id = (path ? path + "." : "") + name;
  const label = labelOf(name);
  const help = helpOf(name);
  const helpHtml = help ? `<small>${esc(help)}</small>` : "";
  if (u.kind === "INPUT_OBJECT" && !u.list) {
    const ti = await typeInfo(u.named);
    const inner = await Promise.all(ti.inputFields.map((f) => fieldHtml(f.name, f.type, (value || {})[f.name], id)));
    return `<fieldset class="kb-set-group" data-obj="${esc(id)}"><legend>${esc(label)}</legend>${helpHtml}${inner.join("")}</fieldset>`;
  }
  if (u.kind === "INPUT_OBJECT" && u.list) {
    return `<div class="kb-set" data-skip="${esc(id)}"><div class="kb-set-label"><b>${esc(label)}</b>${helpHtml}</div><p class="kb-hint">${t("Edit this list in classic Stash.")}</p></div>`;
  }
  if (u.named === "Boolean") {
    return `<label class="kb-set kb-set-bool"><span class="kb-set-label"><b>${esc(label)}</b>${helpHtml}</span><span class="kb-switch"><input type="checkbox" data-field="${esc(id)}" data-t="bool"${value ? " checked" : ""}><i></i></span></label>`;
  }
  let control;
  if (u.kind === "ENUM") {
    const ti = await typeInfo(u.named);
    const names = ENUM_LABELS[name] || ENUM_LABELS[u.named] || {};
    control = `<select class="kb-field" data-field="${esc(id)}" data-t="enum">${type.kind === "NON_NULL" ? "" : `<option value="">${t("(not set)")}</option>`}${ti.enumValues
      .map((e) => `<option value="${e.name}"${e.name === value ? " selected" : ""}>${esc(t(names[e.name] || names[e.name.toLowerCase()] || e.name))}</option>`)
      .join("")}</select>`;
  } else if (u.list) {
    control = `<textarea class="kb-field" rows="3" data-field="${esc(id)}" data-t="list" spellcheck="false">${esc((value || []).join("\n"))}</textarea>`;
  } else if (u.named === "Int" || u.named === "Float") {
    control = `<input class="kb-field kb-num" type="number" step="${u.named === "Float" ? "any" : "1"}" data-field="${esc(id)}" data-t="${u.named === "Int" ? "int" : "float"}" value="${value == null ? "" : esc(value)}">`;
  } else if (STRING_CHOICES[name]) {
    const ch = STRING_CHOICES[name];
    control = `<select class="kb-field" data-field="${esc(id)}" data-t="str">${Object.keys(ch).includes(value) ? "" : `<option value="${esc(value || "")}">${esc(value || t("(not set)"))}</option>`}${Object.entries(ch)
      .map(([v, l]) => `<option value="${v}"${v === value ? " selected" : ""}>${t(l)}</option>`)
      .join("")}</select>`;
  } else if (name === "password") {
    control = `<input class="kb-field" type="password" autocomplete="new-password" data-field="${esc(id)}" data-t="password" placeholder="${t("unchanged")}">`;
  } else if (["css", "javascript", "customLocales"].includes(name)) {
    control = `<textarea class="kb-field kb-code" rows="8" data-field="${esc(id)}" data-t="str" spellcheck="false">${esc(value || "")}</textarea>`;
  } else {
    control = `<input class="kb-field" data-field="${esc(id)}" data-t="str" value="${esc(value == null ? "" : value)}" spellcheck="false">`;
  }
  return `<label class="kb-set"><span class="kb-set-label"><b>${esc(label)}</b>${helpHtml}</span>${control}</label>`;
}

// Collect all fields below root → nested object
export function readFields(root) {
  const out = {};
  root.querySelectorAll("[data-field]").forEach((el) => {
    const path = el.dataset.field.split(".");
    let v;
    switch (el.dataset.t) {
      case "bool": v = el.checked; break;
      case "int": v = el.value === "" ? null : parseInt(el.value, 10); break;
      case "float": v = el.value === "" ? null : parseFloat(el.value); break;
      case "list": v = el.value.split(/\n+/).map((s) => s.trim()).filter(Boolean); break;
      case "enum": v = el.value || null; break;
      case "password": if (!el.value) return; v = el.value; break;
      default: v = el.value;
    }
    let o = out;
    path.slice(0, -1).forEach((p) => (o = o[p] = o[p] || {}));
    o[path[path.length - 1]] = v;
  });
  return out;
}
