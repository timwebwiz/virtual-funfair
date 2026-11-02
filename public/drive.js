// Drive feedback: motivation, reward, punishment, curiosity, attention, intention, empathy and morals.
// Pure logic, no DOM.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- Motivation: own drives pick what the avatar wants most right now ----
export function topDrive({ hunger = 0, thirst = 0, tired = 0, lonely = 0, curious = 0 }) {
  const d = [['eat', hunger], ['drink', thirst], ['rest', tired], ['socialise', lonely], ['explore', curious]].sort((a, b) => b[1] - a[1])[0];
  return d[1] < 0.35 ? { drive: 'content', level: d[1] } : { drive: d[0], level: +d[1].toFixed(2) };
}
export const DRIVE_TEXT = { eat: 'You want a snack.', drink: 'You want a drink.', rest: 'You want to rest.', socialise: 'You feel like company.', explore: 'You want to see something new.', content: 'You feel content.' };

// What other people probably want, from what they are doing.
export function motiveOf(label = '', role = '') {
  const l = label.toLowerCase();
  if (/emergency|medical|care/.test(l)) return 'wants to save someone';
  if (/helping|attend/.test(l)) return 'wants to help';
  if (/crate|haul|rubbish|clean|repair|fix/.test(l)) return 'wants to keep the park tidy';
  if (/patrol|security|watch/.test(l)) return 'wants to keep everyone safe';
  if (/coming over|talk/.test(l)) return 'wants to connect with you';
  if (/walking away/.test(l)) return 'wants some space';
  if (role === 'visitor') return 'wants to have fun';
  return '';
}

// ---- Goals: short quests that reward when finished ----
export const GOALS = [
  { id: 'taste', text: 'Taste 3 different foods', need: 3, pts: 40 },
  { id: 'explore', text: 'Explore 8 new areas', need: 8, pts: 30 },
  { id: 'rides', text: 'Visit both rides', need: 2, pts: 30 },
  { id: 'help', text: 'Help someone who is down', need: 1, pts: 60 }
];
export class Goals {
  constructor(state = {}) { this.have = state.have || {}; this.done = state.done || []; this.sets = state.sets || {}; }
  get active() { return GOALS.find(g => !this.done.includes(g.id)) || null; }
  // record progress by unique key; returns the goal if it was just completed
  progress(id, key) {
    const g = GOALS.find(q => q.id === id); if (!g || this.done.includes(id)) return null;
    const s = (this.sets[id] = this.sets[id] || []);
    if (s.includes(key)) return null;
    s.push(key); this.have[id] = s.length;
    if (s.length >= g.need) { this.done.push(id); return g; }
    return null;
  }
  count(id) { return this.have[id] || 0; }
  toJSON() { return { have: this.have, done: this.done, sets: this.sets }; }
}

// ---- Reward / punishment: points and conscience, with a streak ----
export class Reinforcement {
  constructor(s = {}) { this.points = s.points || 0; this.conscience = s.conscience ?? 1; this.streak = 0; this.lastGood = 0; }
  reward(pts, now = 0) {
    this.streak = now - this.lastGood < 60000 ? this.streak + 1 : 1; this.lastGood = now;
    const gain = Math.round(pts * (1 + Math.min(this.streak - 1, 4) * 0.1));
    this.points += gain; this.conscience = clamp(this.conscience + 0.05, 0, 1);
    return gain;
  }
  punish(pts) { this.points = Math.max(0, this.points - pts); this.conscience = clamp(this.conscience - pts / 100, 0, 1); this.streak = 0; return pts; }
  get standing() { return this.conscience > 0.8 ? 'good citizen' : this.conscience > 0.5 ? 'okay' : 'troublemaker'; }
  toJSON() { return { points: this.points, conscience: this.conscience }; }
}

// ---- Moral checks ----
// Sprinting through a crowd is reckless; ignoring a fallen person nearby feels wrong.
export function moralCheck({ sprinting, people = [], me, fallen = null, litterNearBin = false }) {
  const close = people.filter(p => Math.hypot(p.x - me.x, p.z - me.z) < 2.2).length;
  if (sprinting && close >= 2) return { kind: 'reckless', pts: 3, text: 'You are sprinting through a crowd. That is reckless.' };
  if (fallen && Math.hypot(fallen.x - me.x, fallen.z - me.z) < 5 && !sprinting && Math.hypot(fallen.x - me.x, fallen.z - me.z) > 1.8) return { kind: 'dilemma', text: `${fallen.name} is down. Go to them to help.` };
  if (litterNearBin) return { kind: 'litter', pts: 5, text: 'There was a bin right there.' };
  return null;
}
export const helping = (me, fallen) => !!fallen && Math.hypot(fallen.x - me.x, fallen.z - me.z) <= 1.8;

// ---- Curiosity: novelty of the area, and the nearest unseen point of interest ----
export const cellOf = (x, z, size = 12) => `${Math.floor(x / size)},${Math.floor(z / size)}`;
export class Curiosity {
  constructor(seen = []) { this.seen = new Set(seen); }
  visit(x, z) { const k = cellOf(x, z); if (this.seen.has(k)) return false; this.seen.add(k); return true; }
  get level() { return clamp(1 - this.seen.size / 40, 0, 1); }
  // nearest point of interest not yet visited; pois = [{id,name,x,z}]
  target(x, z, visited, pois) {
    let best = null, bd = 1e9;
    for (const p of pois) { if (visited.has(p.id)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = { ...p, d }; } }
    return best;
  }
  toJSON() { return [...this.seen]; }
}
export const curiousGlance = (x, z, ry, target) => {
  if (!target || target.d > 30) return 0;
  const a = Math.atan2(target.x - x, target.z - z) - ry;
  return clamp(Math.atan2(Math.sin(a), Math.cos(a)), -1.2, 1.2) * 0.6;
};

// ---- Attention: focus on the task, filter distractions ----
// Returns the radius within which name tags / intents are shown and what the avatar is attending to.
export function attention({ goalTarget = null, carrying = false, load = 0, focus = 'focused', nearest = null }) {
  if (focus === 'overloaded') return { radius: 6, on: carrying ? 'the crate' : 'staying calm', filtered: true };
  if (carrying) return { radius: 14, on: 'the crate', filtered: true };
  if (goalTarget && goalTarget.d < 40) return { radius: 18, on: goalTarget.name, filtered: load > 0.4 };
  if (nearest) return { radius: 40, on: nearest, filtered: false };
  return { radius: 40, on: 'the park', filtered: false };
}

// ---- Empathy in action: moods of those nearby shape what to feel about helping ----
export function empathicNudge(person) {
  if (!person) return '';
  if (person.down) return `${person.name} needs help.`;
  if (person.mood === 'sad') return `${person.name} looks sad. A wave might cheer them up.`;
  return '';
}
