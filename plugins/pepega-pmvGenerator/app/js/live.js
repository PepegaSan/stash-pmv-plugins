// Live music: the generator listens to one app on this PC (Spotify or any other) and finds the beats
// while the music plays. The sound comes from the plugin's small helper (applisten.cs – Windows'
// process loopback: only that app, games and the rest stay out) as a stream of raw 16-bit mono audio.
//
// Why not predict a beat grid, like the song mode does? Live there's no whole song to look at, and in
// trap, hip-hop, phonk … the hits sit on thirds of the beat – a predicted grid keeps locking onto the
// wrong third and jumping. So the cuts go on the hits you actually hear:
// 1. Hit curve every 512 samples (~11 ms): sudden rises in the bass (kick) and the whole signal
//    (snare); mostly bass, so triplet hi-hats don't count.
// 2. A hit is a peak that clearly stands out from the last 1.5 s and isn't much weaker than the recent
//    hits. It's found one frame after it sounded (~20 ms) – about when the speakers play it.
// 3. Every ½ s the tempo over up to 20 s (autocorrelation weighted around 120 BPM, fine-tuned with the
//    correlation 2–4 beats apart, kept unless another tempo wins clearly several times): at most one
//    cut per ~0.85 beat, and the BPM shown.
// 4. Calm parts without clear hits give nothing – no pumping on guessed beats.
// 5. Energy per beat (0–1) once it has sounded.
//
// The song object looks like analyzeSong()'s (name, bpm, beats, energy) – the arrays just keep growing.

import { gql } from "./api.js";

const SR = 48000;
const HOP = 512;
const FPS = SR / HOP;
const KEEP = Math.round(FPS * 20); // onset history
const TEMPO_WIN = KEEP; // tempo over up to 20 s
const MIN_DATA = Math.round(FPS * 4); // tempo from then on
const EVERY = Math.round(FPS / 2); // analysis every ½ s
// Silence = a pause (near digital silence, ~-70 dB) for 1.5 s – not a quiet part, and not a low app volume
// (Spotify turned down sends a quiet signal, ~-45 dB, that is still music)
const SILENT_RMS = 0.00015;
const SILENT_FOR = Math.round(FPS * 1.5);
const HIT_WIN = Math.round(FPS * 1.5);
export const TUNE = { low: 0.8, k: 1.6, floor: 0.4, gap: 0.85, switch: 1.25, confirm: 2 }; // (exported for tests)

// The helper, via the plugin backend → { port, token, app }
export async function liveConnect(app, plugin = "pmvGenerator") {
  const d = await gql(`mutation($p: ID!, $a: Map) { runPluginOperation(plugin_id: $p, args: $a) }`, { p: plugin, a: { mode: "live_start", app } });
  const out = d.runPluginOperation;
  if (!out) throw new Error("No answer from the PMV Generator backend – is Python in the PATH?");
  if (out.error) throw new Error(out.error);
  return out.output || out;
}

// Spotify's window title is "Artist - Song" while it plays, "Spotify Premium" etc. when paused
export const songTitle = (st) => {
  const t = (st && st.title) || "";
  return / - /.test(t) && !/^spotify( premium| free)?$/i.test(t) ? t.replace(" - ", " – ") : "";
};

export async function liveStatus(conn) {
  const r = await fetch(`http://127.0.0.1:${conn.port}/status?t=${conn.token}`, { cache: "no-store" }).catch(() => null);
  if (!r) throw new Error("The listening helper can't be reached – the browser has to run on the Stash computer");
  if (!r.ok) throw new Error(`Listening helper: HTTP ${r.status}`);
  return r.json();
}

export class LiveAudio {
  constructor(conn) {
    this.conn = conn;
    this.app = conn.app || "Spotify";
    this.song = { name: "", bpm: 0, beats: [], energy: [], duration: Infinity, live: true, beatLen: 0.5, peaks: new Float32Array(0) }; // the name: the song title, once the app shows it
    this.samples = 0; // audio received (samples)
    this.offset = null; // clock: performance time (s) − audio time, lower envelope
    this.lastArrive = 0;
    this.lp = { b0: 0, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 };
    this.makeLowpass(160);
    this.acc = 0;
    this.accLow = 0;
    this.accN = 0;
    this.frame = 0; // frames done
    this.prevLow = 1e-6;
    this.prevAll = 1e-6;
    this.raw = []; // raw onsets (moving average window)
    this.rawSum = 0;
    this.var = 1;
    this.ons = []; // normalized onsets of the last KEEP frames
    this.hits = []; // hit curve (more bass: kick and snare, not the hi-hats), last 1.5 s
    this.hitStr = []; // strength of the last accepted hits
    this.rms = []; // loudness per frame, same window
    this.first = 0; // frame index of ons[0]
    this.sinceTrack = 0; // frames since the tracking started (after a reset)
    this.period = null; // frames per beat
    this.beatRms = [];
    this.pending = []; // hits whose energy isn't measured yet: { k, t }
    this.silent = true;
    this.title = "";
  }

  makeLowpass(f) {
    const w = (2 * Math.PI * f) / SR;
    const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    Object.assign(this.lp, { b0: (1 - cos) / 2 / a0, b1: (1 - cos) / a0, b2: (1 - cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 });
  }

  // ---------- Stream ----------

  async start() {
    this.ctl = new AbortController();
    const r = await fetch(`http://127.0.0.1:${this.conn.port}/pcm?t=${this.conn.token}`, { signal: this.ctl.signal, cache: "no-store" }).catch(() => null);
    if (!r || !r.ok || !r.body) throw new Error("The listening helper can't be reached – the browser has to run on the Stash computer");
    this.reader = r.body.getReader();
    this.pump();
    this.pollStatus();
  }

  async pump() {
    let rest = null;
    try {
      for (;;) {
        const { done, value } = await this.reader.read();
        if (done) break;
        let bytes = value;
        if (rest) {
          bytes = new Uint8Array(rest.length + value.length);
          bytes.set(rest);
          bytes.set(value, rest.length);
          rest = null;
        }
        const n = bytes.length >> 1;
        if (bytes.length & 1) rest = bytes.slice(bytes.length - 1);
        this.feed(new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + n * 2)));
      }
    } catch (e) {
      if (e.name !== "AbortError") this.error = e.message;
    }
    this.ended = true;
  }

  async pollStatus() {
    while (!this.stopped) {
      try {
        const st = await liveStatus(this.conn);
        this.running = st.running;
        const t = songTitle(st);
        if (t && t !== this.title) {
          const change = !!this.title;
          this.title = t;
          this.song.name = t;
          if (change) this.reset(); // another song: find its tempo afresh
        }
      } catch (e) { /* helper gone – the stream ends too */ }
      await new Promise((res) => setTimeout(res, 1000));
    }
  }

  stop() {
    this.stopped = true;
    if (this.ctl) this.ctl.abort();
  }

  // Audio time (s) as it plays now: the stream's time, carried on between chunks (at most 0.15 s)
  pos() {
    if (this.offset == null) return 0;
    return Math.min(this.samples / SR + 0.15, performance.now() / 1000 - this.offset);
  }

  // ---------- Analysis ----------

  feed(pcm) {
    const now = performance.now() / 1000;
    this.samples += pcm.length;
    const off = now - this.samples / SR;
    // The earliest arrival is the truth (network hiccups only make it later); after a gap start over
    if (this.offset == null || off < this.offset || off - this.offset > 0.5) this.offset = off;
    else this.offset += 0.0002; // follows slowly if the stream really runs later
    this.lastArrive = now;
    const lp = this.lp;
    for (let i = 0; i < pcm.length; i++) {
      const x = pcm[i] / 32768;
      const y = lp.b0 * x + lp.b1 * lp.x1 + lp.b2 * lp.x2 - lp.a1 * lp.y1 - lp.a2 * lp.y2;
      lp.x2 = lp.x1;
      lp.x1 = x;
      lp.y2 = lp.y1;
      lp.y1 = y;
      this.acc += x * x;
      this.accLow += y * y;
      if (++this.accN === HOP) {
        this.onFrame(this.accLow, this.acc);
        this.acc = this.accLow = this.accN = 0;
      }
    }
  }

  onFrame(eLow, eAll) {
    this.frame++;
    const dl = Math.log(eLow + 1e-6) - Math.log(this.prevLow + 1e-6);
    const da = Math.log(eAll + 1e-6) - Math.log(this.prevAll + 1e-6);
    this.prevLow = eLow;
    this.prevAll = eAll;
    const raw = 0.65 * Math.max(0, dl) + 0.35 * Math.max(0, da);
    this.hits.push(TUNE.low * Math.max(0, dl) + (1 - TUNE.low) * Math.max(0, da));
    if (this.hits.length > HIT_WIN) this.hits.shift();
    // minus the moving average of 0.4 s (only real peaks count), normalized by a running spread
    const w = Math.round(FPS * 0.4);
    this.raw.push(raw);
    this.rawSum += raw;
    if (this.raw.length > w) this.rawSum -= this.raw.shift();
    const o = Math.max(0, raw - this.rawSum / this.raw.length);
    this.var = 0.998 * this.var + 0.002 * o * o;
    this.ons.push(o / (Math.sqrt(this.var) || 1));
    this.rms.push(Math.sqrt(eAll / HOP));
    if (this.ons.length > KEEP) {
      this.ons.shift();
      this.rms.shift();
      this.first++;
    }
    // Silence (paused): no beats; the tracking starts over when the music is back
    this.quietFrames = this.rmsOver(Math.round(FPS * 0.3)) < SILENT_RMS ? (this.quietFrames || 0) + 1 : 0;
    const quiet = this.quietFrames > SILENT_FOR;
    if (quiet !== this.silent) {
      this.silent = quiet;
      if (quiet) this.reset(true);
    }
    if (quiet) return;
    this.sinceTrack++;
    this.measure();
    if (this.sinceTrack >= MIN_DATA && this.sinceTrack % EVERY === 0) this.analyze();
    this.react();
  }

  rmsOver(n) {
    const a = this.rms;
    let s = 0;
    const from = Math.max(0, a.length - n);
    for (let i = from; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s / Math.max(1, a.length - from));
  }

  // After a pause or with another song: listen afresh (the old tempo only as a hint)
  reset(keepTempo) {
    this.sinceTrack = 0;
    this.lastHit = null; // no hit since the (re)start yet
    if (!keepTempo) this.period = null;
    const keep = Math.round(FPS * 0.2);
    this.first += Math.max(0, this.ons.length - keep);
    this.ons = this.ons.slice(-keep);
    this.rms = this.rms.slice(-keep);
  }

  // Tempo over up to 20 s
  analyze() {
    const nT = Math.min(this.ons.length, TEMPO_WIN, this.sinceTrack);
    const oT = this.ons.slice(-nT);
    const lagMin = Math.floor((60 * FPS) / 200);
    const lagMax = Math.ceil((60 * FPS) / 60);
    // Autocorrelation up to four beats (the multiples make the tempo precise)
    const ac = new Float32Array(4 * lagMax + 6);
    for (let l = lagMin - 1; l < ac.length; l++) {
      let s = 0;
      for (let i = 0; i + l < nT; i++) s += oT[i] * oT[i + l];
      ac[l] = s / Math.max(1, nT - l);
    }
    const aci = (x) => {
      const i = Math.floor(x);
      const f = x - i;
      return ac[i] * (1 - f) + ac[i + 1] * f;
    };
    const coarse = (l) => Math.exp(-0.5 * (Math.log2((60 * FPS) / l / 120) / 0.9) ** 2) * (ac[l] + 0.5 * ac[2 * l]);
    let best = lagMin;
    for (let l = lagMin; l <= lagMax; l++) if (coarse(l) > coarse(best)) best = l;
    // Keep the tempo found so far – a clearly better other one only after it has won a few times
    const prev = this.period;
    if (prev) {
      let near = Math.round(prev);
      for (let l = Math.round(prev * 0.96); l <= Math.round(prev * 1.04); l++) if (l >= lagMin && l <= lagMax && coarse(l) > coarse(near)) near = l;
      if (Math.abs(best - prev) > 0.05 * prev && coarse(best) > TUNE.switch * coarse(near)) this.switchVotes = (this.switchVotes || 0) + 1;
      else this.switchVotes = 0;
      if (this.switchVotes < TUNE.confirm + 1) best = near;
      else this.switchVotes = 0;
    }
    let P = best;
    let ps = -Infinity;
    for (let x = best - 1; x <= best + 1; x += 0.01) {
      const s = aci(x) + aci(2 * x) + aci(3 * x) + aci(4 * x);
      if (s > ps) (ps = s), (P = x);
    }
    if (prev && Math.abs(P - prev) < 0.02 * prev) P = prev + 0.35 * (P - prev); // settle smoothly
    this.period = P;
    this.song.bpm = (60 * FPS) / P;
    this.song.beatLen = P / FPS;
  }

  // Cut on the hits you hear: a peak in the hit curve that clearly stands out from the last 1.5 s
  // (and isn't much weaker than the recent hits), at most about one per beat. It's found one frame
  // after it sounded (~20 ms) – about when the speakers play it.
  react() {
    const h = this.hits;
    const n = h.length;
    if (n < 3) return;
    const c = h[n - 2];
    if (!(c >= h[n - 3] && c > h[n - 1])) return;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) (sum += h[i]), (sq += h[i] * h[i]);
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    if (c < mean + TUNE.k * sd || c < 0.05) return;
    if (this.hitStr.length >= 8) {
      const sorted = this.hitStr.slice().sort((x, y) => x - y);
      if (c < TUNE.floor * sorted[sorted.length >> 1]) return;
    }
    const t = (this.frame - 2) / FPS;
    const beats = this.song.beats;
    const beatLen = this.period ? this.period / FPS : 0;
    const gap = beatLen ? TUNE.gap * beatLen : 0.35;
    if (beats.length && t - beats[beats.length - 1] < gap) return;
    beats.push(t);
    this.hitStr.push(c);
    if (this.hitStr.length > 40) this.hitStr.shift();
    const k = beats.length - 1;
    this.song.energy.push(this.song.energy[k - 1] || 0.5);
    this.pending.push({ k, t });
    this.lastHit = t;
  }

  // Energy of a beat once it has sounded: loudness of the beat before it, 0–1 against the last minute
  measure() {
    const now = this.frame / FPS;
    while (this.pending.length && this.pending[0].t <= now) {
      const { k, t } = this.pending.shift();
      const len = this.song.beatLen;
      const a = Math.round((t - len) * FPS);
      const b = Math.round(t * FPS);
      let s = 0;
      let c = 0;
      for (let f = a; f < b; f++) {
        const i = f - this.first;
        if (i >= 0 && i < this.rms.length) (s += this.rms[i] ** 2), c++;
      }
      const r = Math.sqrt(s / Math.max(1, c));
      this.beatRms.push(r);
      if (this.beatRms.length > 150) this.beatRms.shift();
      const sorted = this.beatRms.slice().sort((x, y) => x - y);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 0;
      const lo = sorted.length >= 8 ? q(0.1) : 0;
      const span = (sorted.length >= 8 ? q(0.95) : sorted[sorted.length - 1]) - lo || 1;
      const e = Math.min(1, Math.max(0, (r - lo) / span));
      const en = this.song.energy;
      const prev = [en[k - 1], en[k - 2]].filter((x) => x != null);
      en[k] = (e + prev.reduce((x, y) => x + y, 0)) / (1 + prev.length); // smooth over the last beats
    }
  }
}
