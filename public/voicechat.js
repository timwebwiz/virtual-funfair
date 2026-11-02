// Voice chat + lip-sync helpers. Pure logic (no DOM / WebAudio) so it can be unit-tested.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const RATE = 16000;          // network sample rate (Hz)
export const HEADER = 3;            // byte 0 = frame type (1 = voice), bytes 1-2 = sender id
export const MAX_RANGE = 45;        // metres: voice is not relayed beyond this

// Average-downsample float samples from `fromRate` to RATE and convert to little-endian Int16.
export function toPcm16(f32, fromRate) {
  const step = fromRate / RATE, n = Math.floor(f32.length / step), out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    let a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step)), sum = 0;
    for (let j = a; j < b && j < f32.length; j++) sum += f32[j];
    out[i] = Math.round(clamp(sum / (b - a), -1, 1) * 32767);
  }
  return out;
}
export const fromPcm16 = i16 => Float32Array.from(i16, v => v / 32768);
export const rms = f32 => { let s = 0; for (const v of f32) s += v * v; return Math.sqrt(s / (f32.length || 1)); };

// Pack / unpack a network frame: [type, idHi, idLo, ...int16 LE samples]
export function packFrame(id, pcm) {
  const buf = new ArrayBuffer(HEADER + pcm.length * 2), dv = new DataView(buf);
  dv.setUint8(0, 1); dv.setUint16(1, id);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(HEADER + i * 2, pcm[i], true);
  return buf;
}
export function unpackFrame(buf) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (dv.byteLength < HEADER + 2 || dv.getUint8(0) !== 1) return null;
  const n = Math.floor((dv.byteLength - HEADER) / 2), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = dv.getInt16(HEADER + i * 2, true);
  return { id: dv.getUint16(1), pcm };
}

// Voice activity gate with a short hangover so words are not clipped.
export class Gate {
  constructor(open = 0.015, hang = 0.25) { this.openAt = open; this.hang = hang; this.t = 0; }
  // returns true if this frame should be sent
  step(level, dt) { if (level > this.openAt) this.t = this.hang; else this.t = Math.max(0, this.t - dt); return this.t > 0; }
}

// Louder when closer, silent beyond range, with a gentle floor so near neighbours are clear.
export const voiceGain = (dist, range = MAX_RANGE) => (dist >= range ? 0 : +clamp(1 / (1 + (dist * dist) / 150), 0, 1).toFixed(3));

// Rough spectral centroid (0..1) from a frequency-bin array (0..255 bytes). Low = "oo", high = "ee".
export function centroid(bins) {
  let num = 0, den = 0;
  for (let i = 1; i < bins.length; i++) { num += i * bins[i]; den += bins[i]; }
  return den > 0 ? clamp(num / den / bins.length, 0, 1) : 0;
}

// Turn loudness (0..1) and brightness (0..1) into a mouth shape. Smoothed by LipSync.
// open: 0 closed .. 1 wide open jaw; wide: -1 rounded/pursed .. +1 stretched.
export function viseme(level, bright) {
  const open = clamp((level - 0.02) * 9, 0, 1);
  const wide = open < 0.05 ? 0 : clamp((bright - 0.12) * 5 - 0.5, -1, 1);
  return { open, wide };
}

// Attack fast, release a bit slower, like a real jaw.
export class LipSync {
  constructor() { this.open = 0; this.wide = 0; }
  update(dt, level, bright) {
    const v = viseme(level, bright);
    const ko = v.open > this.open ? 1 - Math.exp(-dt * 40) : 1 - Math.exp(-dt * 18);
    this.open += (v.open - this.open) * ko;
    this.wide += (v.wide - this.wide) * (1 - Math.exp(-dt * 20));
    return { open: +this.open.toFixed(3), wide: +this.wide.toFixed(3) };
  }
  get speaking() { return this.open > 0.08; }
}

// Schedule gapless playback: returns start time for a chunk of `dur` seconds and the new cursor.
export function schedule(cursor, now, dur, lead = 0.08, maxLag = 0.6) {
  let start = Math.max(cursor, now + lead);
  if (start - now > maxLag) start = now + lead; // too far behind: drop to live
  return { start, next: start + dur };
}
