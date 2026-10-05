// VR videos (180°/360°, mono or stereo) in the normal player: the video is drawn onto the inside of a
// sphere with WebGL – drag to look around, wheel/pinch to zoom. Stereo videos show one eye.

// mode: [horizontal span in degrees, stereo layout]  sbs = side by side, tb = top/bottom
export const VR_MODES = {
  "180": [180, ""],
  "180sbs": [180, "sbs"],
  "360": [360, ""],
  "360tb": [360, "tb"],
  "360sbs": [360, "sbs"],
};

// Guess from file name and tags (e.g. "clip_180_LR.mp4", tag "VR")
export function guessVR(name, tags) {
  const n = String(name || "");
  const vrTag = (tags || []).some((t) => /^(vr|virtual reality|180°?|360°?)$/i.test(t.name || t));
  const deg = /(^|[^0-9])360([^0-9]|$)/.test(n) ? "360" : /(^|[^0-9])180([^0-9]|$)/.test(n) ? "180" : "";
  const sbs = /(^|[_\-. ])(LR|SBS|3DH|RL)([_\-. ]|$)/i.test(n);
  const tb = /(^|[_\-. ])(TB|OU|3DV|BT)([_\-. ]|$)/i.test(n);
  if (!deg && !vrTag && !/(^|[_\-. ])VR([_\-. ]|$)/i.test(n)) return "";
  const d = deg || "180"; // most VR videos are 180° side by side
  if (tb) return "360tb"; // top/bottom is practically always 360°
  if (sbs || d === "180") return d + "sbs";
  return d;
}

const VS = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
const FS = `precision highp float;
uniform sampler2D tex; uniform vec2 size; uniform float yaw, pitch, fov, span; uniform vec4 region;
void main() {
  vec2 ndc = (gl_FragCoord.xy / size) * 2.0 - 1.0;
  float k = tan(fov * 0.5);
  vec3 d = normalize(vec3(ndc.x * k * size.x / size.y, ndc.y * k, -1.0));
  float cp = cos(pitch), sp = sin(pitch);
  d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float cy = cos(yaw), sy = sin(yaw);
  d = vec3(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy);
  float lon = atan(d.x, -d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float u = lon / radians(span) + 0.5;
  float v = 0.5 - lat / 3.14159265;
  if (u < 0.0 || u > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  gl_FragColor = texture2D(tex, vec2(region.x + u * region.z, region.y + v * region.w));
}`;

export function createVR(screen, video) {
  const cv = document.createElement("canvas");
  cv.className = "kb-vr";
  cv.hidden = true;
  Object.assign(cv.style, { position: "absolute", inset: "0", width: "100%", height: "100%", gridArea: "1 / 1" });
  video.after(cv); // right after the video: controls and overlays stay on top
  const gl = cv.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const U = (n) => gl.getUniformLocation(prog, n);
  const u = { size: U("size"), yaw: U("yaw"), pitch: U("pitch"), fov: U("fov"), span: U("span"), region: U("region") };

  let mode = "";
  let yaw = 0;
  let pitch = 0;
  let fov = 1.6; // radians, ~90°
  let raf = 0;
  let moved = false;

  function frame() {
    raf = requestAnimationFrame(frame);
    const w = cv.clientWidth * devicePixelRatio;
    const h = cv.clientHeight * devicePixelRatio;
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
      gl.viewport(0, 0, w, h);
    }
    if (video.readyState >= 2) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      } catch (e) { /* frame not ready */ }
    }
    const [span, layout] = VR_MODES[mode];
    gl.uniform2f(u.size, w, h);
    gl.uniform1f(u.yaw, yaw);
    gl.uniform1f(u.pitch, pitch);
    gl.uniform1f(u.fov, fov);
    gl.uniform1f(u.span, span);
    gl.uniform4f(u.region, 0, 0, layout === "sbs" ? 0.5 : 1, layout === "tb" ? 0.5 : 1); // left / top eye
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Looking around: drag (mouse or finger), zoom with the wheel or two fingers
  const pts = new Map();
  let pinch = 0;
  cv.addEventListener("pointerdown", (e) => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    cv.setPointerCapture(e.pointerId);
    moved = false;
  });
  cv.addEventListener("pointermove", (e) => {
    const last = pts.get(e.pointerId);
    if (!last) return;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) fov = Math.min(2.2, Math.max(0.5, fov * (pinch / Math.max(1, d)) ** 0.5));
      pinch = d;
    } else {
      const s = fov / cv.clientHeight;
      yaw -= (e.clientX - last[0]) * s;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - last[1]) * s));
    }
    if (Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]) > 2) moved = true;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    pinch = 0;
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    fov = Math.min(2.2, Math.max(0.5, fov * (e.deltaY > 0 ? 1.08 : 0.92)));
  }, { passive: false });

  return {
    canvas: cv,
    get mode() {
      return mode;
    },
    // true right after a drag – the click that ends it shouldn't pause the video
    dragged: () => moved,
    setMode(m) {
      mode = VR_MODES[m] ? m : "";
      cv.hidden = !mode;
      video.style.visibility = mode ? "hidden" : "";
      cancelAnimationFrame(raf);
      if (mode) {
        yaw = 0;
        pitch = 0;
        frame();
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      cv.remove();
      video.style.visibility = "";
    },
  };
}
