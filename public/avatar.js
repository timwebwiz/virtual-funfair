import * as THREE from 'three';

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
export const HEIGHT_RANGE = [130, 210], BUILD_RANGE = [0.8, 1.3];

export const defaultAvatar = () => ({
  skin: '#e0ac8c', hair: '#3a2a1a', hairStyle: 'short', shirt: '#3b82f6', shirtStyle: 'short',
  pants: '#334155', pantsStyle: 'long', shoes: '#222222', hat: 'none', accent: '#c0392b',
  glasses: 'none', backpack: false, height: 175, build: 1, face: null
});

const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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

  // head, face photo, neck
  const head = add(body, new THREE.SphereGeometry(0.25, 32, 24), skin, 0, 1.7, 0);
  if (a.face) {
    const tex = new THREE.TextureLoader().load(a.face);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 1.7, 0.2); body.add(face);
  }
  add(body, new THREE.CylinderGeometry(0.08, 0.09, 0.12), skin, 0, 1.48, 0);

  // hair
  const cap = () => add(body, new THREE.SphereGeometry(0.27, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hairM, 0, 1.74, -0.02);
  if (a.hairStyle === 'short') cap();
  else if (a.hairStyle === 'long') { cap(); add(body, new THREE.BoxGeometry(0.5, 0.6, 0.1), hairM, 0, 1.5, -0.2); }
  else if (a.hairStyle === 'bun') { cap(); add(body, new THREE.SphereGeometry(0.11, 16, 12), hairM, 0, 1.98, -0.12); }
  else if (a.hairStyle === 'mohawk') add(body, new THREE.BoxGeometry(0.07, 0.2, 0.4), hairM, 0, 1.97, -0.02);

  // hats
  if (a.hat === 'cap') { add(body, new THREE.SphereGeometry(0.285, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), acc, 0, 1.77, 0); add(body, new THREE.BoxGeometry(0.32, 0.03, 0.2), acc, 0, 1.78, 0.3); }
  else if (a.hat === 'beanie') add(body, new THREE.SphereGeometry(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), acc, 0, 1.76, 0);
  else if (a.hat === 'tophat') { add(body, new THREE.CylinderGeometry(0.28, 0.28, 0.03, 24), acc, 0, 1.93, 0); add(body, new THREE.CylinderGeometry(0.17, 0.17, 0.32, 24), acc, 0, 2.09, 0); outer.userData.top = 2.3 * h; }
  else if (a.hat === 'hardhat') add(body, new THREE.SphereGeometry(0.29, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), acc, 0, 1.76, 0);

  // glasses
  if (a.glasses === 'round') {
    const m = mat('#222', 0.3);
    for (const s of [-1, 1]) { const r = add(body, new THREE.TorusGeometry(0.06, 0.012, 8, 20), m, s * 0.09, 1.72, 0.235); r.castShadow = false; }
    add(body, new THREE.BoxGeometry(0.06, 0.012, 0.012), m, 0, 1.72, 0.24);
  } else if (a.glasses === 'shades') {
    const m = mat('#050505', 0.2);
    for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.12, 0.07, 0.02), m, s * 0.09, 1.72, 0.24);
    add(body, new THREE.BoxGeometry(0.06, 0.015, 0.015), m, 0, 1.73, 0.24);
  }

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

export function animateWalk(g, t, moving, speed = 8) {
  const k = moving ? Math.sin(t * speed) * 0.6 : 0;
  const set = (n, v) => { const o = g.getObjectByName(n); if (o) o.rotation.x = v; };
  set('legL', k); set('legR', -k); set('armL', -k); set('armR', k);
}
