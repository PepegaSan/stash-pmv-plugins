// Sound out of a video: the PMV Generator's backend cuts it with ffmpeg (only the part you want),
// the browser fetches it piece by piece. Used by Stash UI (player) and the PMV Generator (song from a video).

import { gql } from "./api.js";

// "1:23", "1:02:03", "83" → seconds; "" → 0
export function parseTime(s) {
  s = String(s || "").trim().replace(",", ".");
  if (!s) return 0;
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  return parts.reduce((a, n) => a * 60 + n, 0);
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

async function run(plugin, args) {
  const d = await gql(`mutation($p: ID!, $a: Map) { runPluginOperation(plugin_id: $p, args: $a) }`, { p: plugin, a: args });
  const out = d.runPluginOperation;
  if (!out) throw new Error("No answer from the PMV Generator backend – is Python in the PATH?");
  if (out.error) throw new Error(out.error);
  return out.output || out;
}

// → { blob, name, saved }. start/end in seconds (end 0 = to the end), save = keep a copy in "PMV Generator/Songs"
export async function extractAudio({ sceneId, start = 0, end = 0, save = false, plugin = "pepega-pmvGenerator", onProgress = () => {}, signal }) {
  onProgress(0, "extract");
  const r = await run(plugin, { mode: "extract_audio", scene_id: String(sceneId), start, end, save });
  const parts = [];
  let offset = 0;
  for (;;) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
    const c = await run(plugin, { mode: "audio_chunk", id: r.id, offset });
    const bin = atob(c.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    parts.push(bytes);
    offset += bytes.length;
    onProgress(Math.min(1, offset / (c.size || r.size || 1)), "fetch");
    if (c.last || !bytes.length) break;
  }
  return { blob: new Blob(parts, { type: "audio/mp4" }), name: r.name, saved: r.saved };
}

export function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
