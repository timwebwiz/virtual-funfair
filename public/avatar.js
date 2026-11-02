import * as THREE from 'three';
import { proprio, headStabilise } from './senses.js';

// Photo -> avatar descriptor (small JSON sent to other players).
// Extracts the face crop, skin tone, hair and clothing colours from the photo.
// A server-side ML photo-to-3D model can replace this function; the descriptor format stays the same.
export function analyzePhoto(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
  const avg = (x, y, w, h) => {
    const d = ctx.getImageData(x, y, w, h).data;
    let r = 0, g = 0, b = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return '#' + [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
  };
  const face = document.createElement('canvas');
  face.width = face.height = 96;
  face.getContext('2d').drawImage(c, 24, 8, 80, 80, 0, 0, 96, 96);
  return {
    skin: avg(52, 40, 24, 20),   // cheeks/forehead area
    hair: avg(40, 2, 48, 10),    // top of head
    shirt: avg(40, 92, 48, 16),  // torso area
    pants: avg(40, 112, 48, 14), // lower area
    face: face.toDataURL('image/jpeg', 0.7)
  };
}

export const OPTIONS = {
  hairStyle: ['short', 'long', 'bun', 'mohawk', 'bald'],
  shirtStyle: ['short', 'long', 'hoodie'],
  pantsStyle: ['long', 'shorts'],
  hat: ['none', 'cap', 'beanie', 'tophat'],
  glasses: ['none', 'round', 'shades']
};
export const MOODS = ['neutral', 'happy', 'excited', 'sad', 'angry', 'tired', 'nervous'];
export const CULTURES = ['wave', 'bow', 'namaste', 'handshake', 'nod'];
export const INTERESTS = ['thrill', 'food', 'games', 'relaxing'];
export const EMOTES = { wave: '👋', bow: '🙇', namaste: '🙏', handshake: '🤝', cheer: '🎉', dance: '💃', point: '👉', shrug: '🤷', nod: '🙂', stretch: '🥱', belly: '😋' };
export const LANGS = { en: 'English', es: 'Español', fr: 'Français', pt: 'Português', ja: '日本語', hi: 'हिन्दी' };
export const FORMAL = ['casual', 'formal'];
export const SPACES = ['normal', 'close', 'wide'];
export const TRAIT_RANGE = [1, 10];
export const HEIGHT_RANGE = [130, 210], BUILD_RANGE = [0.8, 1.3];

export const defaultAvatar = () => ({
  skin: '#e0ac8c', hair: '#3a2a1a', hairStyle: 'short', shirt: '#3b82f6', shirtStyle: 'short',
  pants: '#334155', pantsStyle: 'long', shoes: '#222222', hat: 'none', accent: '#c0392b',
  glasses: 'none', backpack: false, height: 175, build: 1, face: null, faceMode: 'photo', fb: { ...FACE_DEFAULTS },
  strength: 5, agility: 5, endurance: 5, mood: 'happy', culture: 'wave', interest: 'thrill', level: 0, lang: 'en', formal: 'casual', space: 'normal'
});

const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Procedural CGI face: shaded skin, sculpted nose, glossy eyes, brows and lips, seeded per character.
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
export const FACE_DEFAULTS = { eyeColor: '#4a7bd0', eyeSize: 1, eyeSpacing: 1, browThick: 1, noseSize: 1, mouthWidth: 1, lipColor: '#b5545a', cheeks: 0.3, freckles: false, lashes: true };
export const FACE_RANGES = { eyeSize: [0.7, 1.4], eyeSpacing: [0.8, 1.25], browThick: [0.5, 1.8], noseSize: [0.5, 1.6], mouthWidth: [0.7, 1.4], cheeks: [0, 0.7] };
// Builds a texture from either a seeded random face (NPCs) or the player's chosen face parts (fb).
export function cgiFaceTexture(a, seed = 1, fb = null) {
  const F = fb ? { ...FACE_DEFAULTS, ...fb } : null;
  const r = (() => { let x = (seed * 9301 + 49297) % 233280; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); })();
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const skin = a.skin || '#e0ac88', hair = a.hair || '#3a2a1a';
  const base = g.createRadialGradient(S * 0.5, S * 0.42, 10, S / 2, S / 2, S * 0.55);
  base.addColorStop(0, shade(skin, 1.08)); base.addColorStop(1, shade(skin, 0.85));
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const blob = (x, y, rx, ry, col, al) => { g.save(); g.translate(x, y); g.scale(rx, ry); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = al; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); };
  const eyeY = S * (0.44 + r() * 0.03), gap = S * (0.18 + r() * 0.04) * (F ? F.eyeSpacing : 1), er = S * (0.055 + r() * 0.015) * (F ? F.eyeSize : 1);
  const blush = F ? F.cheeks : 0.28; blob(S * 0.2, S * 0.62, 30, 22, '#e8737a', blush); blob(S * 0.8, S * 0.62, 30, 22, '#e8737a', blush); // cheeks
  const ns = F ? F.noseSize : 1;
  blob(S / 2 + 10 * ns, S * 0.6, 14 * ns, 24 * ns, shade(skin, 0.6), 0.25); blob(S / 2, S * 0.56, 12 * ns, 18 * ns, shade(skin, 1.25), 0.3); // nose
  g.strokeStyle = shade(skin, 0.55); g.globalAlpha = 0.6; g.lineWidth = 2.5; g.beginPath(); g.arc(S / 2 - 12 * ns, S * 0.66, 7 * ns, 0.2, Math.PI - 0.6); g.arc(S / 2 + 12 * ns, S * 0.66, 7 * ns, 0.6, Math.PI - 0.2); g.stroke(); g.globalAlpha = 1; // nostrils
  const irisR = ['#4a7bd0', '#5a8a3a', '#6b4423', '#3a2a20', '#7a8a8a'][Math.floor(r() * 5)], iris = F ? F.eyeColor : irisR;
  for (const sx of [-1, 1]) {
    const x = S / 2 + sx * gap;
    blob(x, eyeY + 4, er * 2, er * 1.2, shade(skin, 0.5), 0.3); // eye socket shadow
    g.fillStyle = '#f7f5f2'; g.beginPath(); g.ellipse(x, eyeY, er * 1.5, er * 0.85, 0, 0, 7); g.fill();
    const ig = g.createRadialGradient(x, eyeY, 1, x, eyeY, er * 0.9); ig.addColorStop(0, shade(iris, 1.4)); ig.addColorStop(1, shade(iris, 0.55));
    g.fillStyle = ig; g.beginPath(); g.arc(x, eyeY, er * 0.85, 0, 7); g.fill();
    g.fillStyle = '#050505'; g.beginPath(); g.arc(x, eyeY, er * 0.4, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - er * 0.3, eyeY - er * 0.3, er * 0.22, 0, 7); g.fill();
    g.strokeStyle = shade(hair, 0.5); g.lineWidth = F && !F.lashes ? 1.5 : 3; g.beginPath(); g.ellipse(x, eyeY, er * 1.5, er * 0.9, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); // upper lid + lashes
    g.strokeStyle = shade(hair, 0.8); g.lineWidth = (5 + r() * 2) * (F ? F.browThick : 1); g.lineCap = 'round'; g.beginPath(); g.moveTo(x - sx * er * 1.7, eyeY - er * 1.9 + sx * 3); g.quadraticCurveTo(x, eyeY - er * 2.5, x + sx * er * 1.7, eyeY - er * 1.7); g.stroke(); // brow
  }
  const my = S * 0.78, mw = S * (0.1 + r() * 0.03) * (F ? F.mouthWidth : 1), lipR = ['#b5545a', '#c0706a', '#9a4a4a'][Math.floor(r() * 3)], lip = F ? F.lipColor : lipR;
  g.fillStyle = lip; g.beginPath(); g.moveTo(S / 2 - mw, my); g.quadraticCurveTo(S / 2, my - 10, S / 2 + mw, my); g.quadraticCurveTo(S / 2, my + 14, S / 2 - mw, my); g.fill();
  g.strokeStyle = shade(lip, 0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(S / 2 - mw, my); g.quadraticCurveTo(S / 2, my + 3, S / 2 + mw, my); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(S / 2, my + 5, mw * 0.4, 2.5, 0, 0, 7); g.fill();
  if (F && F.freckles) { g.fillStyle = shade(skin, 0.7); g.globalAlpha = 0.55; for (let i = 0; i < 26; i++) { const sx = r() < 0.5 ? -1 : 1; g.beginPath(); g.arc(S / 2 + sx * (10 + r() * 55), S * 0.56 + r() * 26, 1.4 + r() * 1.2, 0, 7); g.fill(); } g.globalAlpha = 1; }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// Builds the avatar. Height (cm) scales the whole body; build widens/narrows it, so the
// in-game body matches the player's real height and proportions.
export function buildAvatar(input) {
  const a = { ...defaultAvatar(), ...input };
  if (a.hat && a.hat[0] === '#') { a.accent = a.hat; a.hat = 'hardhat'; } // NPC work helmets
  const h = clamp(a.height, ...HEIGHT_RANGE) / 175, b = clamp(a.build, ...BUILD_RANGE);
  const outer = new THREE.Group(), body = new THREE.Group();
  body.scale.set(h * b, h, h * b); outer.add(body);
  outer.userData.top = 2.0 * h;
  const add = (parent, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const skin = mat(a.skin, 0.5), shirt = mat(a.shirt), pants = mat(a.pants), hairM = mat(a.hair, 0.9), acc = mat(a.accent, 0.5);

  // head group pivots at the neck so it can nod, turn and tilt
  const H = new THREE.Group(); H.position.set(0, 1.5, 0); body.add(H);
  const HI = new THREE.Group(); HI.position.set(0, -1.5, 0); H.add(HI);
  const head = add(HI, new THREE.SphereGeometry(0.25, 32, 24), skin, 0, 1.7, 0);
  const mode = a.faceMode === 'built' ? 'built' : a.faceMode === 'plain' ? 'plain' : 'photo';
  if (mode === 'photo' && a.face) {
    const tex = new THREE.TextureLoader().load(a.face);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 1.7, 0.2); HI.add(face);
  }
  else if (a.cgi || mode === 'built') {
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshStandardMaterial({ map: cgiFaceTexture(a, a.cgi || 7, a.cgi ? null : { ...FACE_DEFAULTS, ...a.fb }), roughness: 0.55 }));
    face.position.set(0, 1.7, 0.2); HI.add(face);
  }
  add(body, new THREE.CylinderGeometry(0.08, 0.09, 0.12), skin, 0, 1.48, 0);

  // hair
  const cap = () => add(HI, new THREE.SphereGeometry(0.27, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hairM, 0, 1.74, -0.02);
  if (a.hairStyle === 'short') cap();
  else if (a.hairStyle === 'long') { cap(); add(HI, new THREE.BoxGeometry(0.5, 0.6, 0.1), hairM, 0, 1.5, -0.2); }
  else if (a.hairStyle === 'bun') { cap(); add(HI, new THREE.SphereGeometry(0.11, 16, 12), hairM, 0, 1.98, -0.12); }
  else if (a.hairStyle === 'mohawk') add(HI, new THREE.BoxGeometry(0.07, 0.2, 0.4), hairM, 0, 1.97, -0.02);

  // hats
  if (a.hat === 'cap') { add(HI, new THREE.SphereGeometry(0.285, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), acc, 0, 1.77, 0); add(HI, new THREE.BoxGeometry(0.32, 0.03, 0.2), acc, 0, 1.78, 0.3); }
  else if (a.hat === 'beanie') add(HI, new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), acc, 0, 1.76, 0);
  else if (a.hat === 'tophat') { add(HI, new THREE.CylinderGeometry(0.28, 0.28, 0.03, 24), acc, 0, 1.93, 0); add(HI, new THREE.CylinderGeometry(0.17, 0.17, 0.32, 24), acc, 0, 2.09, 0); outer.userData.top = 2.3 * h; }
  else if (a.hat === 'hardhat') add(HI, new THREE.SphereGeometry(0.29, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), acc, 0, 1.76, 0);

  // glasses
  if (a.glasses === 'round') {
    const m = mat('#222', 0.3);
    for (const s of [-1, 1]) { const r = add(HI, new THREE.TorusGeometry(0.06, 0.012, 8, 20), m, s * 0.09, 1.72, 0.235); r.castShadow = false; }
    add(HI, new THREE.BoxGeometry(0.06, 0.012, 0.012), m, 0, 1.72, 0.24);
  } else if (a.glasses === 'shades') {
    const m = mat('#050505', 0.2);
    for (const s of [-1, 1]) add(HI, new THREE.BoxGeometry(0.12, 0.07, 0.02), m, s * 0.09, 1.72, 0.24);
    add(HI, new THREE.BoxGeometry(0.06, 0.015, 0.015), m, 0, 1.73, 0.24);
  }

  // expressive face parts
  const dark = mat('#3a1d1d', 0.8);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 14, Math.PI), dark); mouth.name = 'mouth'; mouth.position.set(0, 1.64, 0.26); HI.add(mouth);
  for (const [n, sx] of [['browL', -1], ['browR', 1]]) { const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.014), dark); b2.name = n; b2.position.set(sx * 0.09, 1.78, 0.25); HI.add(b2); }
  const sweat = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.85 })); sweat.name = 'sweat'; sweat.position.set(0.2, 1.8, 0.14); sweat.visible = false; HI.add(sweat);
  H.name = 'headPivot'; body.name = 'body'; outer.userData.hasFace = !!(a.cgi || mode === 'built' || (mode === 'photo' && a.face));

  // torso
  add(body, new THREE.CapsuleGeometry(0.22, 0.45, 8, 16), shirt, 0, 1.15, 0);
  if (a.vest) add(body, new THREE.CylinderGeometry(0.235, 0.235, 0.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: a.vest, side: THREE.DoubleSide, emissive: a.vest, emissiveIntensity: 0.25 }), 0, 1.15, 0);
  if (a.shirtStyle === 'hoodie') add(body, new THREE.SphereGeometry(0.17, 16, 12), shirt, 0, 1.52, -0.13);
  if (a.backpack) { add(body, new THREE.BoxGeometry(0.34, 0.45, 0.16), acc, 0, 1.2, -0.28); }

  // arms (pivot at the shoulder so they swing naturally)
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = s < 0 ? 'armL' : 'armR'; arm.position.set(s * 0.34, 1.42, 0); body.add(arm);
    if (a.shirtStyle === 'short') { add(arm, new THREE.CylinderGeometry(0.08, 0.075, 0.22, 12), shirt, 0, -0.12, 0); add(arm, new THREE.CapsuleGeometry(0.065, 0.3, 6, 12), skin, 0, -0.4, 0); add(arm, new THREE.SphereGeometry(0.075), skin, 0, -0.68, 0); }
    else { add(arm, new THREE.CapsuleGeometry(0.07, 0.5, 6, 12), shirt, 0, -0.3, 0); add(arm, new THREE.SphereGeometry(0.075), skin, 0, -0.68, 0); }
  }
  // legs (pivot at the hip)
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = s < 0 ? 'legL' : 'legR'; leg.position.set(s * 0.12, 0.78, 0); body.add(leg);
    if (a.pantsStyle === 'shorts') { add(leg, new THREE.CapsuleGeometry(0.1, 0.18, 6, 12), pants, 0, -0.17, 0); add(leg, new THREE.CapsuleGeometry(0.08, 0.3, 6, 12), skin, 0, -0.5, 0); }
    else add(leg, new THREE.CapsuleGeometry(0.09, 0.6, 6, 12), pants, 0, -0.38, 0);
    add(leg, new THREE.BoxGeometry(0.15, 0.08, 0.27), mat(a.shoes, 0.7), 0, -0.73, 0.05);
  }
  return outer;
}

const parts = g => g.userData.parts || (g.userData.parts = Object.fromEntries(['body', 'headPivot', 'armL', 'armR', 'legL', 'legR', 'mouth', 'browL', 'browR', 'sweat'].map(n => [n, g.getObjectByName(n)])));
const PI = Math.PI;

// Full-body pose: gait, posture, mood, temperature, fatigue, injury, carrying and emotes.
// s: {moving, speed, sprint, mood, tired(0-1), temp('cold'|'hot'|''), hurt, carry, push, stumble(0-1), look, emote, et,
//     slope (rise per metre along travel), sway (0-1 instability), calm (reduced motion)}
export function animateAvatar(g, t, s = {}) {
  const P = parts(g), mood = s.mood || 'neutral', tired = s.tired || 0;
  if (!P.body) return;
  let swing = s.moving ? 0.6 * (s.sprint ? 1.35 : 1) * (1 - 0.3 * tired) : 0;
  if (mood === 'happy' || mood === 'excited') swing *= 1.15; else if (mood === 'sad' || mood === 'tired') swing *= 0.7;
  const ph = Math.sin(t * (s.speed || 8));
  let aL = -ph * swing, aR = ph * swing, lL = ph * swing, lR = -ph * swing, aLz = 0.05, aRz = -0.05;
  let lean = tired * 0.25 + (s.sprint && s.moving ? 0.15 : 0), hx = 0, hy = s.look || 0, hz = 0, bz = 0, bob = Math.sin(t * 6) * 0.008 * (1 + tired * 4), shake = 0;
  if (mood === 'sad') { lean += 0.15; hx = 0.35; } else if (mood === 'tired') { lean += 0.2; hx = 0.2; }
  else if (mood === 'angry') { aLz = -0.12; aRz = 0.12; hx = 0.1; } else if (mood === 'happy') hx = -0.08;
  else if (mood === 'excited') bob += Math.abs(Math.sin(t * 7)) * 0.04;
  else if (mood === 'nervous') { shake = Math.sin(t * 25) * 0.012; hy += Math.sin(t * 2.2) * 0.3; }
  if (s.hurt) { lL *= 0.3; bz = Math.sin(t * (s.speed || 8)) * 0.08 * (s.moving ? 1 : 0); lean += 0.15; hx += 0.2; aR = Math.min(aR, -0.5); aRz = -0.7; }
  if (s.temp === 'cold') { shake += Math.sin(t * 38) * 0.03; if (!s.moving) { aL = aR = -0.9; aLz = -0.55; aRz = 0.55; } }
  if (s.temp === 'hot' && !s.moving && (t % 6) < 0.9) { aR = -2.5; aRz = -0.2 + Math.sin(t * 10) * 0.2; }
  if (s.carry) { aL = aR = -1.15; aLz = 0.15; aRz = -0.15; lean -= 0.1; }
  if (s.push) { aL = aR = -1.4; lean += 0.3; }
  if (s.stumble) { lean += 0.7 * s.stumble; aL = aR = -1.2 * s.stumble; }

  const sl = Math.max(-0.6, Math.min(0.6, s.slope || 0));
  lean += sl * 0.9; // lean into an uphill, back on a downhill
  if (s.moving && Math.abs(sl) > 0.12) bob -= Math.abs(sl) * 0.08; // knees bend on steep ground
  const sway = s.sway || 0;
  if (sway > 0.25) { aLz = -(0.5 + sway); aRz = 0.5 + sway; aL = aR = -0.2; bz += Math.sin(t * 9) * sway * 0.14; } // arms out to balance

  const e = s.emote, et = s.et || 0;
  if (e && !s.moving) {
    const env = Math.sin(Math.min(et / 2.5, 1) * PI);
    if (e === 'wave') { aR = -2.6; aRz = -0.3 + Math.sin(et * 12) * 0.35; }
    else if (e === 'bow') { lean = 0.9 * env; hx = 0.3 * env; }
    else if (e === 'namaste') { aL = aR = -1.0; aLz = 0.45; aRz = -0.45; lean += 0.3 * env; hx = 0.3; }
    else if (e === 'handshake') { aR = -1.2 + Math.sin(et * 14) * 0.12; aRz = -0.15; }
    else if (e === 'cheer') { aL = aR = -2.8; aLz = -0.4; aRz = 0.4; bob += Math.abs(Math.sin(et * 8)) * 0.14; }
    else if (e === 'dance') { const w = Math.sin(et * 8); aL = -1.5 + w * 0.8; aR = -1.5 - w * 0.8; bz = w * 0.15; lL = w * 0.4; lR = -w * 0.4; bob += Math.abs(w) * 0.05; hz = w * 0.15; }
    else if (e === 'point') { aR = -1.55; aRz = -0.08; }
    else if (e === 'shrug') { aL = aR = -0.5; aLz = -0.6; aRz = 0.6; hz = 0.2 * env; }
    else if (e === 'nod') hx = Math.sin(et * 8) * 0.25;
    else if (e === 'stretch') { aL = aR = -3.0; aLz = -0.2; aRz = 0.2; lean = -0.2; }
    else if (e === 'belly') { aR = -0.9; aRz = -0.5; lean += 0.05; }
  }
  // proprioception: body corrects its own pose (stance, counterbalance, leaning into turns)
  const pp = proprio({ stab: 1 - sway, slope: sl, loadRatio: s.load || 0, turnRate: s.turn || 0, speed: s.moving ? 1 : 0 });
  lean += pp.counter; bz += pp.roll;
  // sensory reactions override the arms / head briefly
  const r = s.react;
  let squint = 0;
  if (r === 'ears') { aL = aR = -2.5; aLz = 0.75; aRz = -0.75; hx += 0.15; squint = 1; }
  else if (r === 'nose') { aR = -2.2; aRz = -0.15; hy += 0.45; lean -= 0.1; squint = 1; }
  else if (r === 'sniff') { hx -= 0.25 + Math.sin(t * 14) * 0.05; bob += Math.abs(Math.sin(t * 10)) * 0.01; }
  else if (r === 'fan') { aR = -2.3; aRz = -0.2 + Math.sin(t * 18) * 0.35; hx -= 0.15; squint = 1; }
  else if (r === 'pucker') { hz += 0.12; squint = 1; }
  else if (r === 'startle') { lean -= 0.3; aL = aR = -1.0; aLz = -0.7; aRz = 0.7; bob += 0.03; }
  else if (r === 'burn') { aR = 0.9 + Math.sin(t * 30) * 0.2; lean += 0.2; squint = 1; }
  else if (r === 'drink') { aL = aR = -1.1; aLz = 0.2; aRz = -0.2 + Math.sin(t * 8) * 0.15; lean += 0.45; hx += 0.3; }
  else if (r === 'swing') { const k = (Math.sin(t * 9) + 1) / 2; aL = aR = -2.9 + k * 2.6; aLz = 0.15; aRz = -0.15; lean += 0.25 * k - 0.1; }
  else if (r === 'sit') { lL = lR = -1.45; aL = aR = -0.5; lean -= 0.05; bob -= 0.35; }
  else if (r === 'pant') { lean += 0.3 + Math.sin(t * 9) * 0.06; bob += Math.abs(Math.sin(t * 9)) * 0.012; hx += 0.25; }
  else if (r === 'reach') { aR = -1.5; aRz = -0.1; lean += 0.2; aL = 0.4; }
  else if (r === 'wince') { aR = -0.6; aRz = -0.2; lean += 0.25; hz += 0.1; squint = 1; }
  else if (r === 'tremble') { const j = Math.sin(t * 40) * 0.08; aL += j; aR -= j; bob += Math.abs(j) * 0.1; }
  else if (r === 'squint') squint = 0.6;
  P.armL.rotation.set(aL, 0, aLz - pp.armSpread * 0.4); P.armR.rotation.set(aR, 0, aRz + pp.armSpread * 0.4);
  P.legL.rotation.set(lL, 0, -pp.stance * 0.5); P.legR.rotation.set(lR, 0, pp.stance * 0.5);
  if (s.calm) { shake = 0; bob *= 0.2; bz *= 0.4; }
  // low-pass the body pose: the body self-rights smoothly instead of snapping
  const st = g.userData.pp || (g.userData.pp = { lean, bz: bz + shake });
  st.lean += (lean - st.lean) * 0.35; st.bz += (bz + shake - st.bz) * 0.35;
  P.body.rotation.set(st.lean, 0, st.bz); P.body.position.y = bob;
  // vestibular reflex: the head counter-rotates so gaze stays level
  const hs = headStabilise({ lean: st.lean, roll: st.bz, dizzy: s.dizzy || 0, t });
  P.headPivot.rotation.set(hx + (s.calm ? 0 : hs.hx), hy, hz + (s.calm ? 0 : hs.hz));

  const m = P.mouth, bl = P.browL, br = P.browR;
  m.visible = bl.visible = br.visible = mood !== 'neutral' || !g.userData.hasFace;
  const smile = mood === 'happy' || mood === 'excited' || mood === 'neutral';
  m.rotation.z = smile ? PI : 0;
  m.scale.set(mood === 'excited' ? 1.3 : 1, mood === 'tired' || mood === 'nervous' ? 0.25 : mood === 'excited' ? 1.4 : 1, 1);
  m.position.y = smile ? 1.665 : 1.635;
  bl.rotation.z = mood === 'angry' ? -0.45 : mood === 'sad' || mood === 'nervous' ? 0.4 : 0;
  br.rotation.z = -bl.rotation.z;
  bl.position.y = br.position.y = 1.78 + (mood === 'excited' || mood === 'nervous' ? 0.02 : 0) - (mood === 'tired' ? 0.015 : 0);
  if (squint) { bl.position.y = br.position.y -= 0.03 * squint; bl.rotation.z = br.rotation.z = 0; }
  if (r === 'chew') m.scale.y = 0.6 + Math.abs(Math.sin(t * 12)) * 0.9;
  else if (r === 'pucker') m.scale.set(0.4, 0.5, 1);
  else if (r === 'fan' || r === 'burn' || r === 'startle') m.scale.set(0.8, 1.6, 1);
  P.sweat.visible = s.temp === 'hot';
  if (P.sweat.visible) P.sweat.position.y = 1.82 - ((t * 0.7) % 1) * 0.25;
}

export function animateWalk(g, t, moving, speed = 8) { animateAvatar(g, t, { moving, speed }); }
