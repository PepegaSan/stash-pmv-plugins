// Frame-exact positions in a video. A <video> has no frame numbers, so they are worked out from the frame rate:
// frame n is on screen from n / fps to (n + 1) / fps. Used by the player (frame by frame) and the marker editor.

// The frame rate Stash found in the file (30 when it didn't)
export function fpsOf(scene) {
  const r = scene && scene.files && scene.files[0] && scene.files[0].frame_rate;
  return r > 1 && r < 1000 ? r : 30;
}

// Times are kept to the millisecond (see secOf), so a time just below a frame's start still counts as that frame
export const frameAt = (sec, fps) => Math.floor((Math.max(0, sec) + 0.0006) * fps);
export const secOf = (n, fps) => Math.round((Math.max(0, n) / fps) * 1000) / 1000;
// The start of the frame that is on screen at this time
export const snap = (sec, fps) => secOf(frameAt(sec, fps), fps);

// Shows frame n: seeks to its middle, because a seek to the exact start can land on the frame before
export function showFrame(video, n, fps) {
  const dur = video.duration;
  const last = Number.isFinite(dur) && dur > 0 ? Math.max(0, Math.ceil(dur * fps - 1e-3) - 1) : Infinity;
  const frame = Math.min(Math.max(0, n), last);
  video.currentTime = (frame + 0.5) / fps;
  return frame;
}

// One frame (or several) back or forward from where the video is; stops playback
export function stepFrame(video, fps, by) {
  video.pause();
  return showFrame(video, frameAt(video.currentTime, fps) + by, fps);
}

// 1:23.456 / 1:02:03.456 – every millisecond, unlike the player's whole seconds
export function fmtExact(sec) {
  sec = Math.max(0, sec || 0);
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const f = String(ms % 1000).padStart(3, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}.${f}` : `${m}:${s}.${f}`;
}
