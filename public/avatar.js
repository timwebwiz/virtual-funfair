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

export const defaultAvatar = () => ({ skin: '#e0ac8c', hair: '#3a2a1a', shirt: '#3b82f6', pants: '#334155', face: null });

const mat = (color, rough = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: rough });

export function buildAvatar(a) {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const skin = mat(a.skin, 0.5);
  const head = add(new THREE.SphereGeometry(0.25, 32, 24), skin, 0, 1.7, 0);
  if (a.face) { // photo mapped onto a front-facing disc of the head
    const tex = new THREE.TextureLoader().load(a.face);
    tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.set(0, 1.7, 0.2); head.parent.add(face);
  }
  add(new THREE.SphereGeometry(0.27, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(a.hair, 0.9), 0, 1.74, -0.02);
  add(new THREE.CylinderGeometry(0.08, 0.09, 0.12), skin, 0, 1.48, 0);
  add(new THREE.CapsuleGeometry(0.22, 0.45, 8, 16), mat(a.shirt), 0, 1.15, 0);
  if (a.vest) add(new THREE.CylinderGeometry(0.235, 0.235, 0.3, 20, 1, true), new THREE.MeshStandardMaterial({ color: a.vest, side: THREE.DoubleSide, emissive: a.vest, emissiveIntensity: 0.25 }), 0, 1.15, 0);
  for (const s of [-1, 1]) {
    const arm = add(new THREE.CapsuleGeometry(0.07, 0.5, 6, 12), mat(a.shirt), s * 0.36, 1.1, 0);
    arm.name = s < 0 ? 'armL' : 'armR';
    add(new THREE.SphereGeometry(0.075), skin, s * 0.36, 0.76, 0);
    const leg = add(new THREE.CapsuleGeometry(0.09, 0.6, 6, 12), mat(a.pants), s * 0.12, 0.42, 0);
    leg.name = s < 0 ? 'legL' : 'legR';
    add(new THREE.BoxGeometry(0.14, 0.08, 0.26), mat('#222'), s * 0.12, 0.06, 0.05);
  }
  return g;
}

export function animateWalk(g, t, moving) {
  const k = moving ? Math.sin(t * 8) * 0.6 : 0;
  const set = (n, v) => { const o = g.getObjectByName(n); if (o) o.rotation.x = v; };
  set('legL', k); set('legR', -k); set('armL', -k); set('armR', k);
}
