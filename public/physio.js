// Physiological and emotional self-awareness: heart rate, respiration, adrenaline, cortisol,
// and a named feeling with calming-breath regulation. Pure logic, no DOM.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Physio {
  constructor() { this.hr = 68; this.resp = 13; this.adrenaline = 0; this.cortisol = 0.1; this.calmT = 0; }
  spike(v) { this.adrenaline = clamp(this.adrenaline + v, 0, 1); }
  // slow breathing: lowers heart rate and stress hormones for a few seconds
  breathe(sec = 6) { this.calmT = sec; }
  update(dt, { moving = false, sprinting = false, load = 0, tempC = 18, stress = 0, pain = 0, resting = false } = {}) {
    const calm = this.calmT > 0 ? 1 : resting ? 0.6 : 0;
    this.calmT = Math.max(0, this.calmT - dt);
    const target = 66 + (moving ? 22 : 0) + (sprinting ? 62 : 0) + load * 20 + (tempC >= 28 ? 8 : 0)
      + this.adrenaline * 40 + stress * 15 + pain * 20 - calm * 14;
    const rate = target > this.hr ? 14 : 6;
    this.hr += clamp(target - this.hr, -rate * dt, rate * dt);
    const rTarget = 12 + (this.hr - 66) * 0.22 - (this.calmT > 0 ? 3 : 0);
    this.resp += clamp(rTarget - this.resp, -3 * dt, 3 * dt);
    this.adrenaline = clamp(this.adrenaline - dt * (0.08 + calm * 0.15), 0, 1);
    this.cortisol = clamp(this.cortisol + stress * dt * 0.012 - dt * (0.003 + calm * 0.02), 0, 1);
  }
  soothe(v) { this.cortisol = clamp(this.cortisol - v, 0, 1); }
  get panting() { return this.hr > 135; }
  get drainMul() { return 1 + (this.cortisol > 0.7 ? 0.15 : 0); }
  get speedMul() { return 1 + this.adrenaline * 0.08; }
}
export const hrZone = hr => (hr > 160 ? 'maximal' : hr > 130 ? 'hard' : hr > 95 ? 'active' : 'resting');

// Name the feeling from body and mood so the avatar (and player) can read it.
export function feeling({ mood = 'neutral', hr = 70, adrenaline = 0, cortisol = 0, pain = 0, tired = 0 }) {
  if (pain > 0.6) return 'hurting';
  if (tired > 0.7) return 'exhausted';
  if (adrenaline > 0.5 || (cortisol > 0.6 && hr > 100)) return mood === 'happy' || mood === 'excited' ? 'thrilled' : 'anxious';
  if (cortisol > 0.5) return 'stressed';
  if (mood === 'sad') return 'down';
  if (mood === 'happy' || mood === 'excited') return 'cheerful';
  return hr < 80 && cortisol < 0.3 ? 'calm' : 'alert';
}
export const needsCalm = f => f === 'anxious' || f === 'stressed';
