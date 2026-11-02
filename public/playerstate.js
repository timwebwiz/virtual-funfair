// Pure game-logic for how an avatar's traits and live state affect what it can do.
// No rendering here, so it can be unit-tested in Node.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Experience is play time in seconds. Levels: 0 novice, 1 regular, 2 expert.
export const LEVELS = ['Novice', 'Regular', 'Expert'];
export const levelFor = xp => (xp >= 1800 ? 2 : xp >= 300 ? 1 : 0);

// Capabilities derived from the (self-reported) traits plus experience.
export function statsFor(a) {
  const st = clamp(+a.strength || 5, 1, 10), ag = clamp(+a.agility || 5, 1, 10), en = clamp(+a.endurance || 5, 1, 10), lv = clamp(+a.level || 0, 0, 2);
  return {
    walk: 5 + ag * 0.2 + lv * 0.15,
    sprintMul: 1.35 + ag * 0.03,
    jump: 5 + ag * 0.25 + lv * 0.2,
    drain: 40 / (1 + en * 0.25) * (1 - lv * 0.08), // stamina per second while sprinting
    regen: 8 + en * 1.5 + lv * 2,
    carryKg: st * 5,
    pushFactor: w => clamp((st * 9) / (w * 1.5), 0.25, 1),
    grip: ag // higher agility lowers the chance of stumbling and slipping
  };
}

export class Vitals {
  constructor() { this.stamina = 100; this.winded = false; this.stumble = 0; this.stumbleCool = 0; }
  // returns true when the player is allowed to sprint this frame
  update(dt, { sprinting, moving, hurt }, stats) {
    const can = !this.winded && !hurt;
    const sp = sprinting && moving && can;
    if (sp) this.stamina -= stats.drain * dt;
    else this.stamina += stats.regen * (moving ? 0.5 : 1) * dt;
    this.stamina = clamp(this.stamina, 0, 100);
    if (this.stamina <= 0 && !this.winded) { this.winded = true; if (sprinting) this.trip(); }
    if (this.winded && this.stamina >= 25) this.winded = false;
    this.stumble = Math.max(0, this.stumble - dt / 0.7);
    this.stumbleCool = Math.max(0, this.stumbleCool - dt);
    return sp;
  }
  trip() { if (this.stumbleCool > 0) return false; this.stumble = 1; this.stumbleCool = 2; return true; }
  get tired() { return clamp(1 - this.stamina / 40, 0, 1); }
}

// Chance (0-1) that a sprinting avatar trips after hitting something.
export const tripChance = stats => clamp(1 - stats.grip / 12, 0.1, 0.9);

// Perceived temperature from the park's time of day and weather.
export function feelTemp(clockMin, weather) {
  if (clockMin < 360 || clockMin > 1260 || (weather === 'rain' && (clockMin < 480 || clockMin > 1140))) return 'cold';
  if (weather === 'clear' && clockMin > 660 && clockMin < 1020) return 'hot';
  return '';
}

// Mood expressed by what the player types, e.g. ":)" or "!!!".
export function moodFromChat(text) {
  const t = String(text);
  if (/(:\)|:-\)|😀|😊|haha|lol|yay)/i.test(t)) return 'happy';
  if (/(!!!|wow|awesome|amazing|🎉)/i.test(t)) return 'excited';
  if (/(:\(|:-\(|😢|sad|miss)/i.test(t)) return 'sad';
  if (/(>:\(|😠|angry|hate|ugh)/i.test(t)) return 'angry';
  if (/(tired|sleepy|exhausted)/i.test(t)) return 'tired';
  if (/(scared|nervous|worried|help)/i.test(t)) return 'nervous';
  return null;
}

// Mood shown on the avatar: pain and exhaustion override the chosen mood.
export function effectiveMood({ base, hurt, down, tired, chatMood }) {
  if (hurt || down) return 'sad';
  if (tired > 0.7) return 'tired';
  return chatMood || base || 'neutral';
}

// What the avatar does when left alone, based on its interest.
export const IDLE_EMOTE = { thrill: 'cheer', food: 'belly', games: 'point', relaxing: 'stretch' };

// ---- Terrain balance ----
// Stability 0-1 from the ground, load, condition and skill. Low stability makes the avatar sway and stumble.
export function balanceFor({ slope = 0, wet = false, mud = false, load = 0, hurt = false, tired = 0, sprint = false, agility = 5, level = 0 }) {
  const risk = Math.abs(slope) * 1.6 + (wet ? 0.18 : 0) + (mud ? 0.3 : 0) + load * 0.25 + (hurt ? 0.3 : 0) + tired * 0.2 + (sprint ? 0.12 : 0) + (sprint && slope < -0.15 ? 0.15 : 0);
  const skill = 0.5 + agility * 0.05 + level * 0.05;
  return clamp(1 - risk * (1.25 - skill * 0.6), 0, 1);
}
// chance per second of tripping while moving at this stability
export const stumbleRate = stab => (stab < 0.5 ? (0.5 - stab) * 0.5 : 0);
// Speed multiplier for slope: uphill is slower, a gentle downhill slightly faster.
export const slopeSpeed = slope => Math.max(0.45, 1 - 1.3 * Math.max(0, slope) + 0.25 * Math.max(0, -slope));

// ---- Cognitive state ----
// Mental load rises with crowds, bad weather, darkness, injury, fatigue and nearby hazards.
export const cognitiveLoad = ({ crowd = 0, rain = false, night = false, hurt = false, tired = 0, hazards = 0 }) =>
  clamp(crowd * 0.08 + (rain ? 0.15 : 0) + (night ? 0.1 : 0) + (hurt ? 0.25 : 0) + tired * 0.25 + hazards * 0.15, 0, 1);
export const focusState = ({ idleFor = 0, chatting = false, load = 0 }) => (chatting ? 'chatting' : idleFor > 15 ? 'distracted' : load > 0.65 ? 'overloaded' : 'focused');
