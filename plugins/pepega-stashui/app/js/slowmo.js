// Smooth slow motion in the player, no model to download: at a speed below 1× the video only shows a new picture a few
// times per second, so in between the frames are made up with WebGL.
//   "blend"  – cross-fades the last two pictures (cheap, but moving things leave a ghost)
//   "motion" – looks for where each 8×8 block of the picture moved to (block matching on the graphics card), then
//              pushes both pictures along that motion before blending – where nothing fits (cuts, things appearing)
//              it falls back to the plain blend.
// The video element keeps playing underneath; the canvas on top is only shown while it's slow and playing.

const VS = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// One fragment = one block of the picture: which shift of the previous picture fits the current block best?
// Result: R,G = shift in pixels of the grid ((v + R) / 2R), B = how badly it fits (0 = perfect, 1 = bad)
const RANGE = 10;
const BLOCK = 8;
const FS_ME = `#version 300 es
precision highp float;
uniform sampler2D prev, cur;
uniform vec2 meSize;
out vec4 o;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 base = floor(gl_FragCoord.xy) * ${BLOCK}.0;
  float best = 1e9;
  vec2 bv = vec2(0.0);
  for (int dy = -${RANGE}; dy <= ${RANGE}; dy++) {
    for (int dx = -${RANGE}; dx <= ${RANGE}; dx++) {
      float sad = 0.0;
      for (int j = 0; j < 4; j++) {
        for (int i = 0; i < 4; i++) {
          vec2 q = base + vec2(float(i) * 2.0 + 1.0, float(j) * 2.0 + 1.0);
          sad += abs(luma(texture(cur, q / meSize).rgb) - luma(texture(prev, (q + vec2(float(dx), float(dy))) / meSize).rgb));
        }
      }
      sad += 0.015 * length(vec2(float(dx), float(dy))); // little shifts are likelier than big ones
      if (sad < best) { best = sad; bv = vec2(float(dx), float(dy)); }
    }
  }
  o = vec4((bv + ${RANGE}.0) / ${RANGE * 2}.0, clamp(best / 4.0, 0.0, 1.0), 1.0);
}`;

const FS_OUT = `#version 300 es
precision highp float;
uniform sampler2D prev, cur, mv;
uniform float alpha, useMv;
uniform vec2 meSize;
in vec2 uv;
out vec4 o;
void main() {
  vec4 m = texture(mv, uv);
  vec2 d = (m.rg * ${RANGE * 2}.0 - ${RANGE}.0) / meSize * useMv;
  vec4 a = texture(prev, uv);
  vec4 b = texture(cur, uv);
  vec4 plain = mix(a, b, alpha);
  vec4 p = texture(prev, uv + d * alpha);
  vec4 c = texture(cur, uv - d * (1.0 - alpha));
  float fit = (1.0 - m.b) * (1.0 - smoothstep(0.12, 0.35, length(p.rgb - c.rgb))) * useMv;
  o = mix(plain, mix(p, c, alpha), fit);
}`;

export const slowmoSupported = () => typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype;

// video: the <video>; mode(): "off" | "blend" | "motion"; off(): true while something else draws the picture (VR)
export function createSlowmo(video, { mode, off }) {
  const canvas = document.createElement("canvas");
  canvas.className = "kb-slowmo";
  canvas.hidden = true;
  video.after(canvas);
  let gl = null;
  let prog = null;
  let tex = [];
  let mvTex = null;
  let mvFbo = null;
  let grid = [0, 0];
  let vw = 0;
  let vh = 0;
  let cur = 0; // which of tex[] holds the current picture
  let tPrev = 0;
  let tCur = 0;
  let frames = 0;
  let running = false;
  let raf = 0;
  let rvfc = 0;
  let dead = !slowmoSupported();

  function program(vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function texture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function init() {
    if (gl || dead) return !dead;
    try {
      gl = canvas.getContext("webgl2", { alpha: false, antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error("no WebGL2");
      prog = { me: program(VS, FS_ME), out: program(VS, FS_OUT) };
      tex = [texture(), texture()];
      mvTex = texture();
      mvFbo = gl.createFramebuffer();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindVertexArray(gl.createVertexArray());
      return true;
    } catch (e) {
      console.warn("slow motion", e);
      dead = true;
      gl = null;
      return false;
    }
  }
  function size() {
    if (video.videoWidth === vw && video.videoHeight === vh) return;
    vw = video.videoWidth;
    vh = video.videoHeight;
    const k = Math.min(1, 1280 / vw);
    canvas.width = Math.max(2, Math.round(vw * k));
    canvas.height = Math.max(2, Math.round(vh * k));
    grid = [Math.max(2, Math.round(Math.min(vw, 640) / BLOCK)), Math.max(2, Math.round(Math.min(vw, 640) * (vh / vw) / BLOCK))];
    gl.bindTexture(gl.TEXTURE_2D, mvTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, grid[0], grid[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mvFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mvTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    frames = 0;
  }
  const bind = (p, name, unit, t) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(gl.getUniformLocation(p, name), unit);
  };

  // a new picture of the video arrived
  function onFrame(now, meta) {
    rvfc = 0;
    if (!running) return;
    try {
      size();
      const t = meta && meta.mediaTime != null ? meta.mediaTime : video.currentTime;
      const jump = frames && (t <= tCur || t - tCur > 0.3); // a seek: the old picture doesn't belong to this one
      const other = 1 - cur;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex[other]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      cur = other;
      tPrev = frames && !jump ? tCur : t - 1 / 24;
      tCur = t;
      frames = jump ? 1 : frames + 1;
      if (frames === 1) {
        // (the first picture after a start or a jump: both sides are the same)
        gl.bindTexture(gl.TEXTURE_2D, tex[1 - cur]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        frames = 2;
        tPrev = t - 1 / 24;
      }
      if (mode() === "motion") motion();
      draw();
    } catch (e) {
      console.warn("slow motion", e); // (e.g. a picture the page may not read)
      dead = true;
      stop();
      return;
    }
    rvfc = video.requestVideoFrameCallback(onFrame);
  }
  function motion() {
    gl.useProgram(prog.me);
    bind(prog.me, "prev", 0, tex[1 - cur]);
    bind(prog.me, "cur", 1, tex[cur]);
    gl.uniform2f(gl.getUniformLocation(prog.me, "meSize"), grid[0] * BLOCK, grid[1] * BLOCK);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mvFbo);
    gl.viewport(0, 0, grid[0], grid[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function draw() {
    if (frames < 2) return;
    const dt = Math.max(0.005, tCur - tPrev);
    const alpha = Math.min(1, Math.max(0, (video.currentTime - tCur) / dt));
    gl.useProgram(prog.out);
    bind(prog.out, "prev", 0, tex[1 - cur]);
    bind(prog.out, "cur", 1, tex[cur]);
    bind(prog.out, "mv", 2, mvTex);
    gl.uniform1f(gl.getUniformLocation(prog.out, "alpha"), alpha);
    gl.uniform1f(gl.getUniformLocation(prog.out, "useMv"), mode() === "motion" ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(prog.out, "meSize"), grid[0] * BLOCK, grid[1] * BLOCK);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (canvas.hidden) canvas.hidden = false;
  }
  function loop() {
    raf = 0;
    if (!running) return;
    try {
      draw();
    } catch (e) {
      dead = true;
      return stop();
    }
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (running || !init()) return;
    running = true;
    frames = 0;
    rvfc = video.requestVideoFrameCallback(onFrame);
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (rvfc && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(rvfc);
    raf = rvfc = 0;
    canvas.hidden = true;
  }
  // call after anything that changes the speed, play / pause, the mode …
  function update() {
    const want = !dead && mode() !== "off" && !off() && !video.paused && !video.ended && video.playbackRate < 1 && video.readyState >= 2;
    want ? start() : stop();
  }
  ["ratechange", "play", "playing", "pause", "ended", "loadeddata", "emptied"].forEach((ev) => video.addEventListener(ev, update));
  return {
    update,
    get working() {
      return !dead;
    },
    destroy() {
      stop();
      canvas.remove();
      gl = null;
    },
  };
}
