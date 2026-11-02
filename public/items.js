// Usable park objects, beauty, ethics and culture. Pure logic, no DOM.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ITEMS = [
  { id: 'fountain', name: 'drinking fountain', x: -6, z: -6, kind: 'drink', ht: 0.9, hr: 0.9 },
  { id: 'bell', name: 'strength tester', x: 10, z: -32, kind: 'swing', ht: 0.9, hr: 0.9 },
  { id: 'bench', name: 'park bench', x: -4, z: 30, kind: 'sit', ht: 0.7, hr: 1.4 },
  { id: 'mural', name: 'painted mural', x: -10, z: -46, kind: 'look', ht: 0.3, hr: 3 }
];
export const itemById = id => ITEMS.find(i => i.id === id);
export const nearestItem = (x, z, within = 2.6) => {
  let best = null, bd = within;
  for (const i of ITEMS) { const d = Math.hypot(i.x - x, i.z - z); if (d < bd) { bd = d; best = i; } }
  return best;
};

// Outcome of using an item; returns {text, react, ms, ...effects}.
export function useItem(item, { carryKg = 20, tired = 0, thirst = 0, rnd = Math.random } = {}) {
  if (!item) return null;
  if (item.kind === 'drink') return { text: thirst > 0.3 ? 'You pump the handle and drink cold water. Refreshing.' : 'You take a small sip of water.', react: 'drink', ms: 2200, thirst: -0.6, calm: 0.5 };
  if (item.kind === 'sit') return { text: 'You sit down and rest your legs.', react: 'sit', ms: 8000, sit: true, calm: 1 };
  if (item.kind === 'look') return { text: 'You step back to look at the mural.', react: '', ms: 0, look: true };
  if (item.kind === 'swing') {
    const power = Math.round(clamp((carryKg / 40) * (1 - tired * 0.5) * (0.7 + rnd() * 0.5), 0, 1) * 100);
    const rank = power > 85 ? 'DING! Champion!' : power > 60 ? 'Almost at the bell!' : power > 35 ? 'Solid swing.' : 'A weak tap.';
    return { text: `You swing the mallet: ${power}%. ${rank}`, react: 'swing', ms: 1200, power, pts: power > 85 ? 25 : power > 60 ? 8 : 0, effort: 0.2 };
  }
  return null;
}

// ---- Aesthetics: how beautiful is it here? ----
const ART = [
  { x: -10, z: -46, r: 9, name: 'the painted mural', w: 0.6 },
  { x: -6, z: -6, r: 8, name: 'the fountain', w: 0.5 },
  { x: -30, z: -30, r: 26, name: 'the ferris wheel', w: 0.45 },
  { x: 30, z: -20, r: 16, name: 'the carousel lights', w: 0.45 }
];
export function beautyAt(x, z, { night = false, clean = 100, weather = 'clear' } = {}) {
  let best = { v: 0.15, name: '' };
  for (const a of ART) {
    const d = Math.hypot(a.x - x, a.z - z);
    if (d < a.r) {
      let v = a.w * (1 - d / a.r) + 0.2;
      if (night && (a.name.includes('ferris') || a.name.includes('carousel'))) v += 0.25;
      if (weather === 'rain' && a.name.includes('fountain')) v -= 0.1;
      if (v > best.v) best = { v, name: a.name };
    }
  }
  const tidy = clamp(clean / 100, 0, 1);
  return { score: +clamp(best.v * (0.5 + 0.5 * tidy), 0, 1).toFixed(2), name: best.name, messy: clean < 50 };
}
export const beautyText = b => (b.score > 0.55 ? `${b.name} looks beautiful here.` : b.score > 0.35 ? `You admire ${b.name}.` : '');
// Procedural mural: pick colours and shapes from a seed so every park day is a little different.
export function muralSpec(seed) {
  const r = (n => () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296)(seed >>> 0 || 1);
  const pal = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#9b5de5', '#ffd166'];
  return Array.from({ length: 9 }, () => ({ c: pal[Math.floor(r() * pal.length)], x: r(), y: r(), s: 0.08 + r() * 0.18, round: r() > 0.5 }));
}

// ---- Cultural reading of others ----
const GREET_NAME = { bow: 'a bow', namaste: 'a namaste', handshake: 'a handshake', nod: 'a nod', wave: 'a wave', cheer: 'cheering', dance: 'dancing' };
// Understand a gesture from someone with a (possibly different) background and answer in kind.
export function culturalRead(emote, myCulture) {
  const g = GREET_NAME[emote]; if (!g) return null;
  if (emote === myCulture) return { text: `They greet you with ${g}, just like home.`, reply: emote, kin: true };
  return { text: `They greet you with ${g}, a different custom from yours. You return it respectfully.`, reply: emote, kin: false };
}
// Norms: loud behaviour or crowding is rude to people from reserved cultures or formal guests.
export function normCheck({ shouting = false, dist = 99, other = {} }) {
  const reserved = other.culture === 'bow' || other.culture === 'namaste' || other.formal === 'formal';
  if (shouting && dist < 8 && reserved) return { rude: true, text: 'Shouting beside a formal guest is impolite. You lower your voice.' };
  const pref = { close: 0.9, normal: 1.5, wide: 2.4 }[other.space] || 1.5;
  if (dist < pref * 0.6) return { rude: true, text: 'You are standing closer than they are comfortable with. You step back.', back: true };
  return null;
}

// ---- Ethics: fairness and honesty ----
// Cutting in front of someone who is already waiting at a stand/item.
// waiting people face the thing they are queueing for
const facing = (p, t) => p.ry === undefined || Math.cos(Math.atan2(t.x - p.x, t.z - p.z) - p.ry) > 0.5;
export function cutsInLine(me, target, people, waitingMax = 0.3, radius = 3.5) {
  const myD = Math.hypot(me.x - target.x, me.z - target.z);
  return people.find(p => Math.hypot(p.vx || 0, p.vz || 0) < waitingMax && Math.hypot(p.x - target.x, p.z - target.z) < radius && Math.hypot(p.x - target.x, p.z - target.z) > myD + 0.4 && facing(p, target)) || null;
}
