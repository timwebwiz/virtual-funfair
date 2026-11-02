import * as THREE from 'three';
import { analyzePhoto, buildAvatar, defaultAvatar, animateAvatar, EMOTES } from './avatar.js';
import { LEVELS, levelFor, statsFor, Vitals, tripChance, feelTemp, moodFromChat, effectiveMood, IDLE_EMOTE, balanceFor, stumbleRate, slopeSpeed, cognitiveLoad, focusState } from './playerstate.js';
import { HILLS, MUD, heightAt, slopeAlong, onMud } from './terrain.js';
import { emotionAround, socialCue, crowding, intentOf, envChange, groundAhead, pickReaction, FLAVOR_REACTION, hapticFor, SPOTS, smellAt, smellReaction, FLAVORS, nearestSpot, touchOf, surfaceTouch, hearing, panOf, visionRange, canSee, glanceBehind, Vestibular } from './senses.js';
import { detectDevice, pollGamepad, QualityGovernor } from './device.js';

const dev = detectDevice();
import { initCustomizer } from './customizer.js';

const $ = id => document.getElementById(id);
let avatar = defaultAvatar();
try { avatar = { ...avatar, ...JSON.parse(localStorage.getItem('vf-avatar') || '{}') }; } catch {}
let xp = +localStorage.getItem('vf-xp') || 0;
avatar.level = levelFor(xp);
const stars = l => (l ? ' ' + '★'.repeat(l) : '');
$('name').value = localStorage.getItem('vf-name') || '';
const saveAvatar = () => { try { localStorage.setItem('vf-avatar', JSON.stringify(avatar)); } catch {} };
let onAvatarChange = () => {};
const customizer = initCustomizer({ root: $('custom'), get: () => avatar, set: a => { avatar = a; saveAvatar(); } });
const openCustom = () => { $('custom').style.display = 'flex'; customizer.show(); };
const closeCustom = () => { $('custom').style.display = 'none'; customizer.hide(); onAvatarChange(); };
$('custBtn').onclick = openCustom;
$('faceBtn').onclick = () => { $('custom').style.display = 'flex'; customizer.showFace(); }; $('custDone').onclick = closeCustom;
const photoAvatar = p => { avatar = { ...avatar, ...p, faceMode: 'photo' }; saveAvatar(); };

// ---------- Photo capture / upload ----------
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
$('file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  photoAvatar(analyzePhoto(await loadImg(URL.createObjectURL(f))));
  $('msg').textContent = 'Photo loaded ✔';
};
let stream;
$('cam').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    $('vid').srcObject = stream; $('vid').style.display = 'block'; $('shot').style.display = 'inline';
  } catch { $('msg').textContent = 'Camera unavailable; upload a photo instead.'; }
};
$('shot').onclick = () => {
  const c = $('snap'), v = $('vid');
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  photoAvatar(analyzePhoto(c));
  stream.getTracks().forEach(t => t.stop());
  v.style.display = 'none'; $('shot').style.display = 'none';
  $('msg').textContent = 'Photo captured ✔';
};
$('go').onclick = () => { $('ui').style.display = 'none'; localStorage.setItem('vf-name', $('name').value); start($('name').value || 'Guest'); };

// ---------- World ----------
function start(name) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#87ceeb');
  scene.fog = new THREE.Fog('#87ceeb', 40, 120);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  scene.add(new THREE.HemisphereLight('#fff', '#556', 0.9));
  const sun = new THREE.DirectionalLight('#fff', 2.2);
  sun.position.set(30, 50, 20); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50 });
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ color: '#5aa95a' }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(22, 64), new THREE.MeshStandardMaterial({ color: '#d9c9a3' }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01; plaza.receiveShadow = true; scene.add(plaza);

  // hills (smooth cosine bumps matching terrain.js) and mud patches
  for (const o of HILLS) {
    const pts = []; for (let i = 0; i <= 24; i++) { const r = o.r * (1 - i / 24); pts.push(new THREE.Vector2(r, o.h * 0.5 * (1 + Math.cos(Math.PI * r / o.r)))); }
    const hill = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshStandardMaterial({ color: '#4f9a4f' }));
    hill.position.set(o.x, 0, o.z); hill.receiveShadow = true; hill.castShadow = true; scene.add(hill);
  }
  for (const o of MUD) {
    const mud = new THREE.Mesh(new THREE.CircleGeometry(o.r, 32), new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 }));
    mud.rotation.x = -Math.PI / 2; mud.position.set(o.x, 0.02 + heightAt(o.x, o.z), o.z); mud.receiveShadow = true; scene.add(mud);
  }
  const buildPad = p => {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(p.r * 2, 0.06, p.r * 2), new THREE.MeshStandardMaterial({ color: '#ffd400', emissive: '#7a6500' }));
    pad.position.set(p.x, 0.04, p.z); pad.receiveShadow = true; scene.add(pad);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#555' })); post.position.set(p.x - p.r, 1.1, p.z - p.r); scene.add(post);
  };

  // Ferris wheel
  const wheel = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.25, 12, 64), new THREE.MeshStandardMaterial({ color: '#e63946', metalness: 0.5 }));
  wheel.add(ring);
  const cabins = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#ccc' }));
    spoke.rotation.z = a; wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 12, 0.8, 0.55) }));
    cab.position.set(Math.cos(a) * 10, Math.sin(a) * 10, 0); cab.castShadow = true; wheel.add(cab); cabins.push(cab);
  }
  wheel.position.set(-30, 12, -30); scene.add(wheel);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 26), new THREE.MeshStandardMaterial({ color: '#555' }));
    leg.position.set(-30, 12, -30 + s * 2); leg.rotation.x = s * 0.15; leg.castShadow = true; scene.add(leg);
  }

  const beacons = [-1, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#ffb000' })));
  beacons[0].position.set(-30, 25, -30); beacons[1].position.set(30, 9.2, -20); beacons.forEach(b => { b.visible = false; scene.add(b); });

  // Carousel
  const carousel = new THREE.Group();
  carousel.add(new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 32), new THREE.MeshStandardMaterial({ color: '#f4a261' })));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 32), new THREE.MeshStandardMaterial({ color: '#e76f51' }));
  roof.position.y = 6; carousel.add(roof);
  const horses = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5), new THREE.MeshStandardMaterial({ color: '#ffd700', metalness: 0.8 }));
    pole.position.set(Math.cos(a) * 4, 2.7, Math.sin(a) * 4); carousel.add(pole);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 1.4), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 8, 0.6, 0.8) }));
    h.position.set(Math.cos(a) * 4, 1.6, Math.sin(a) * 4); h.rotation.y = -a; h.castShadow = true; carousel.add(h); horses.push(h);
  }
  carousel.position.set(30, 0.2, -20); scene.add(carousel);
  const spotColors = { popcorn: '#e63946', candy: '#ff7eb6', lemonade: '#ffd23f', grill: '#444', icecart: '#9bd4ff' };
  for (const sp of SPOTS) {
    const b = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 1.2), new THREE.MeshStandardMaterial({ color: spotColors[sp.id], roughness: 0.6 })); base.position.y = 0.55; base.castShadow = true; b.add(base);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: '#fff' })); roof.position.y = 2.1; b.add(roof);
    for (const px of [-0.95, 0.95]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), new THREE.MeshStandardMaterial({ color: '#888' })); p.position.set(px, 1.55, 0.55); b.add(p); }
    b.position.set(sp.x, 0, sp.z); scene.add(b);
  }

  // Booths with bunting
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, r = 18;
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 6, 0.7, 0.5) }));
    b.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r); b.lookAt(0, 1.5, 0); b.castShadow = true; scene.add(b);
  }

  // ---------- Players ----------
  const others = new Map();
  const nameTag = text => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#0008'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#fff'; x.font = '32px sans-serif'; x.textAlign = 'center'; x.fillText(text, 128, 44);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
    s.scale.set(1.2, 0.3, 1); s.position.y = 2.2; return s;
  };
  const tagged = (g, text) => { const t = nameTag(text); t.position.y = (g.userData.top || 2) + 0.25; g.add(t); return t; };
  const makePlayer = p => {
    const g = buildAvatar(p.avatar || defaultAvatar());
    tagged(g, p.name + stars(p.avatar && p.avatar.level)); g.position.set(p.x, 0, p.z);
    g.userData = { tx: p.x, tz: p.z, try: p.ry, moving: false, name: p.name };
    scene.add(g); others.set(p.id, g); return g;
  };

  const buildStation = st => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshStandardMaterial({ color: '#f8f9fa' })); body.position.y = 1.5; body.castShadow = true; g.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 4.6), new THREE.MeshStandardMaterial({ color: '#e63946' })); roof.position.y = 3.15; g.add(roof);
    const red = new THREE.MeshStandardMaterial({ color: '#e63946', emissive: '#e63946', emissiveIntensity: 0.4 });
    for (const sz of [1, -1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.05), red), b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.05), red);
      a.position.set(0, 1.8, sz * 2.03); b.position.copy(a.position); g.add(a, b);
    }
    g.add(at(nameTag('First Aid'), 0, 4.2, 0));
    g.position.set(st.x, 0, st.z); g.lookAt(0, 0, 0); scene.add(g);
  };
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  const hospital = new THREE.Group();
  hospital.add(Object.assign(at(new THREE.Mesh(new THREE.BoxGeometry(12, 8, 10), new THREE.MeshStandardMaterial({ color: '#eef3f7' })), 0, 4, 0), { castShadow: true }));
  hospital.add(at(new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.5, 10.6), new THREE.MeshStandardMaterial({ color: '#2a9d8f' })), 0, 8.2, 0));
  { const red = new THREE.MeshStandardMaterial({ color: '#e63946', emissive: '#e63946', emissiveIntensity: 0.4 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.1), red), b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3, 0.1), red);
    a.position.set(0, 6, -5.05); b.position.copy(a.position); hospital.add(a, b);
    hospital.add(at(new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 0.1), new THREE.MeshStandardMaterial({ color: '#223' })), -1, 1.6, -5.05));
    hospital.add(at(nameTag('Park Hospital'), 0, 9.8, 0)); hospital.children.at(-1).scale.set(4, 1, 1); }
  hospital.position.set(45, 0, 45); scene.add(hospital);
  const depot = new THREE.Group();
  depot.add(Object.assign(at(new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), new THREE.MeshStandardMaterial({ color: '#c9a227' })), 0, 2.5, 0), { castShadow: true }));
  depot.add(at(new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.4, 8.6), new THREE.MeshStandardMaterial({ color: '#444' })), 0, 5.2, 0));
  depot.add(at(new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 0.1), new THREE.MeshStandardMaterial({ color: '#223' })), 2.5, 1.6, 4.05));
  depot.add(at(nameTag('Maintenance'), 0, 6.4, 0));
  depot.position.set(-45, 0, 45); depot.rotation.y = Math.atan2(-45, 45) + Math.PI; scene.add(depot);
  const litterMeshes = new Map();
  const litterGeo = new THREE.BoxGeometry(0.25, 0.12, 0.2), spillGeo = new THREE.CircleGeometry(0.9, 20);
  const syncLitter = list => {
    const live = new Set();
    for (const [id, x, z, type, hue] of list) {
      live.add(id);
      if (litterMeshes.has(id)) continue;
      const mesh = type === 1
        ? new THREE.Mesh(spillGeo, new THREE.MeshStandardMaterial({ color: '#4aa3ff', transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.3 }))
        : new THREE.Mesh(litterGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.7, 0.55) }));
      if (type === 1) { mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, 0.03, z); } else { mesh.position.set(x, 0.07, z); mesh.rotation.y = hue; }
      scene.add(mesh); litterMeshes.set(id, mesh);
    }
    litterMeshes.forEach((mesh, id) => { if (!live.has(id)) { scene.remove(mesh); litterMeshes.delete(id); } });
  };
  let rideFault = [0, 0];
  const npcs = new Map(); // id -> {g, bubble, bt}
  const bubble = () => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(3, 0.56, 1); s.position.y = 2.7; s.visible = false; s.userData = { c, tex, text: '' };
    return s;
  };
  const setBubble = (s, text) => {
    if (s.userData.text === text) return; s.userData.text = text; s.visible = !!text; if (!text) return;
    const x = s.userData.c.getContext('2d'); x.clearRect(0, 0, 512, 96);
    x.fillStyle = '#fffe'; x.beginPath(); x.roundRect(4, 4, 504, 72, 20); x.fill();
    x.fillStyle = '#111'; x.font = '30px sans-serif'; x.textAlign = 'center'; x.fillText(text.slice(0, 34), 256, 52);
    s.userData.tex.needsUpdate = true;
  };
  const turn = (g, t, k) => { const d = ((t - g.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; g.rotation.y += d * k; };
  const buildAmbulance = () => {
    const g = new THREE.Group(), w = new THREE.MeshStandardMaterial({ color: '#fff' }), r = new THREE.MeshStandardMaterial({ color: '#e63946' });
    const add = (geo, mt, x, y, z) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(2, 2, 3.6), w, 0, 1.5, -0.6); add(new THREE.BoxGeometry(2, 1.3, 1.4), w, 0, 1.15, 1.9);
    add(new THREE.BoxGeometry(2.02, 0.3, 3.62), r, 0, 1.2, -0.6);
    add(new THREE.BoxGeometry(1.7, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: '#223' }), 0, 1.5, 2.62);
    for (const sx of [-1, 1]) for (const sz of [-1.3, 1.6]) { const wh = add(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#111' }), sx * 1.0, 0.4, sz); wh.rotation.z = Math.PI / 2; }
    const lm = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0 });
    const l1 = add(new THREE.BoxGeometry(0.6, 0.25, 0.4), lm('#ff2020'), -0.5, 2.62, -0.6), l2 = add(new THREE.BoxGeometry(0.6, 0.25, 0.4), lm('#2060ff'), 0.5, 2.62, -0.6);
    g.userData.lights = [l1, l2]; return g;
  };
  const addNpc = r => {
    if (npcs.has(r.id)) return;
    const g = r.role === 'ambulance' ? buildAmbulance() : buildAvatar({ ...r.look, cgi: r.id + 1 }); const tg = nameTag(r.name); if (r.role === 'ambulance') tg.position.y = 3.4; g.add(tg); const b = bubble(); if (r.role === 'ambulance') b.position.y = 4; g.add(b);
    Object.assign(g.userData, { tx: 0, tz: 0, try: 0, moving: 0, role: r.role, siren: 0 });
    scene.add(g); npcs.set(r.id, { g, b, tag: tg, name: r.name, init: false });
  };
  const setDown = (g, d) => { g.rotation.x = d ? -Math.PI / 2 : 0; g.userData.down = !!d; };
  const sky = { clear: new THREE.Color('#87ceeb'), rain: new THREE.Color('#6b7785') };
  let weather = 'clear', clockMin = 540, rainTarget = 0;
  const rain = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(1500 * 3).map((_, i) => i % 3 === 1 ? Math.random() * 30 : (Math.random() - 0.5) * 60), 3)),
    new THREE.PointsMaterial({ color: '#9bd', size: 0.12 }));
  rain.visible = false; scene.add(rain);
  let obstacles = [];
  // push the player out of any obstacle, sliding along its edge
  const collide = (pos, margin = 0.4) => {
    for (let k = 0; k < 3; k++) for (const o of obstacles) {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      if (o.r !== undefined) {
        const d = Math.hypot(dx, dz), min = o.r + margin;
        if (d < min) { const u = d || 1; pos.x = o.x + (d ? dx / u : 1) * min; pos.z = o.z + (d ? dz / u : 0) * min; }
      } else {
        const lt = dx * o.tx + dz * o.tz, lr = dx * o.rx + dz * o.rz, ht = o.ht + margin, hr = o.hr + margin;
        if (Math.abs(lt) < ht && Math.abs(lr) < hr) {
          const pt = ht - Math.abs(lt), pr = hr - Math.abs(lr);
          if (pt < pr) { const s = (lt >= 0 ? pt : -pt); pos.x += o.tx * s; pos.z += o.tz * s; }
          else { const s = (lr >= 0 ? pr : -pr); pos.x += o.rx * s; pos.z += o.rz * s; }
        }
      }
    }
  };
  let meDown = false, meHurt = false, lockUntil = 0;

  let me = buildAvatar(avatar), meTag = tagged(me, name + stars(avatar.level)); me.position.set(0, 0, 8); scene.add(me);
  let vy = 0;
  const swapMe = () => { // rebuild own avatar after customization
    const pos = me.position.clone(), ry = me.rotation.y; scene.remove(me);
    me = buildAvatar(avatar); meTag = tagged(me, name + stars(avatar.level)); me.position.copy(pos); me.rotation.y = ry; scene.add(me); setDown(me, meDown); reattach();
  };
  onAvatarChange = () => { swapMe(); if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'avatar', avatar })); };


  // ---------- Player state: crates, vitals, emotes, social ----------
  const crates = new Map();
  const holder = id => (typeof id === 'string' ? (npcs.get(+id.slice(1)) || {}).g : id === myId ? me : others.get(id));
  const attach = m => { const h = holder(m.userData.by); if (!h) return; m.removeFromParent(); m.position.set(0, 1.0, 0.3 + m.userData.sz / 2); m.rotation.set(0, 0, 0); h.add(m); };
  function reattach() { crates.forEach(m => m.userData.by != null && attach(m)); }
  const addCrate = c => {
    const sz = c.w >= 40 ? 1.0 : c.w >= 15 ? 0.8 : 0.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), new THREE.MeshStandardMaterial({ color: c.w >= 40 ? '#8b2e2e' : c.w >= 15 ? '#d98a2b' : '#e6c76a', roughness: 0.8 }));
    m.castShadow = true; m.userData = { id: c.id, w: c.w, sz, x: c.x, z: c.z, by: c.by };
    m.position.set(c.x, sz / 2, c.z); scene.add(m); crates.set(c.id, m);
    if (c.by != null) attach(m);
  };
  const putCrate = (m, x, z) => { const u = m.userData; u.by = null; u.x = x; u.z = z; m.removeFromParent(); m.position.set(x, u.sz / 2, z); m.rotation.set(0, 0, 0); scene.add(m); };
  const stats0 = () => statsFor(avatar);
  let stats = stats0();
  const vitals = new Vitals();
  let meEmote = null, chatMood = null, chatMoodUntil = 0, lastInput = performance.now(), lastIdleEmote = performance.now(), lkS = 0, pushUntil = 0, pushF = 1, vitalsT = 0, xpSave = 0, wasWinded = false, lastCrateSent = 0;
  const greeted = new Map();
  const EMOTE_LEN = { dance: 6, cheer: 3.5, stretch: 3.5 };
  const emoteLen = e => EMOTE_LEN[e] || 2.5;
  const doEmote = e => { if (meDown || !EMOTES[e]) return; meEmote = { e, at: performance.now() }; if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'emote', e })); };
  const emoteState = (o, now) => { if (!o) return {}; const et = (now - o.at) / 1000; return et < emoteLen(o.e) ? { emote: o.e, et } : {}; };
  const carryingId = () => { for (const m of crates.values()) if (m.userData.by === myId) return m; return null; };
  const toggleCarry = () => { if (meDown || ws.readyState !== 1) return; ws.send(JSON.stringify({ t: carryingId() ? 'drop' : 'grab' })); };
  if (dev.kind === 'touch') $('hud').textContent = 'Joystick: move · drag: look · 📦 button: lift/drop crates · 😀: emotes';
  $('hud').insertAdjacentHTML('afterend', '<div id="vitals" style="position:fixed;bottom:8px;left:50%;transform:translateX(-50%);background:#000a;color:#fff;padding:4px 12px;border-radius:12px;font:13px sans-serif;z-index:3;white-space:nowrap"></div><div id="emotes" style="position:fixed;bottom:72px;right:12px;display:none;flex-wrap:wrap;gap:6px;max-width:260px;justify-content:flex-end;z-index:4"></div><button id="emoBtn" aria-label="Emotes" style="position:fixed;bottom:16px;right:12px;width:52px;height:52px;border-radius:50%;font-size:24px;padding:0;z-index:4">😀</button>');
  const bar = $('emotes');
  Object.entries(EMOTES).forEach(([k, ic], i) => { const b = document.createElement('button'); b.textContent = ic; b.title = `${k}${i < 10 ? ' (' + ((i + 1) % 10) + ')' : ''}`; b.style.cssText = 'width:44px;height:44px;font-size:22px;padding:0;border-radius:50%'; b.onclick = () => doEmote(k); bar.appendChild(b); });
  $('emoBtn').onclick = () => { bar.style.display = bar.style.display === 'flex' ? 'none' : 'flex'; };
  const EMOTE_KEYS = Object.keys(EMOTES);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  let myId = null;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, avatar, dev: dev.kind }));
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { myId = m.id; m.players.forEach(p => p.id !== myId && makePlayer(p)); obstacles = m.obstacles || []; collide(me.position); m.npcs.forEach(addNpc); (m.stations || []).forEach(buildStation); (m.crates || []).forEach(addCrate); if (m.pad) buildPad(m.pad); }
    else if (m.t === 'roster') m.npcs.forEach(addNpc);
    else if (m.t === 'npcs') {
      weather = m.w; clockMin = m.c; syncLitter(m.l || []); rideFault = m.r || [0, 0];
      $('cl').textContent = m.cl; { const names = ['ferris wheel', 'carousel'], f = rideFault.map((v, i) => v ? names[i] + (v === 2 ? ' (MAJOR FAULT)' : ' (closed)') : null).filter(Boolean); $('rd').textContent = f.length ? 'Closed: ' + f.join(', ') : 'Rides: all running'; $('rd').style.color = f.length ? '#ffb347' : ''; } $('hud').dataset.alert = m.a;
      const live = new Set();
      m.n.forEach(s => { const o = npcs.get(s.id); if (!o) return; live.add(s.id); const u = o.g.userData; if (!o.init) { o.g.position.set(s.x, 0, s.z); o.init = true; } Object.assign(u, { tx: s.x, tz: s.z, try: s.r, moving: s.m, siren: s.e }); o.intent = s.i; o.mood = s.mo; if (s.g && s.g !== o.gest) o.emote = { e: s.g, at: performance.now() }; o.gest = s.g; setBubble(o.b, s.s); setDown(o.g, s.d); });
      npcs.forEach((o, id) => { if (!live.has(id)) { scene.remove(o.g); npcs.delete(id); } });
    }
    else if (m.t === 'radio') { const r = $('radio'), d = document.createElement('div'); d.textContent = `${m.from}: ${m.text}`; r.appendChild(d); while (r.children.length > 7) r.removeChild(r.children[1]); }
    else if (m.t === 'tp') { if (m.id === myId) { me.position.set(m.x, 0, m.z); lockUntil = performance.now() + (m.lock || 0); $('hud').textContent = m.text; } }
    else if (m.t === 'hurt') { const og = others.get(m.id); if (og) og.userData.hurt = m.v; if (m.id === myId) { meHurt = m.v; $('hud').textContent = m.v ? 'You are injured.' : 'A medic treated your injury.'; } }
    else if (m.t === 'down') { if (m.id === myId) { meDown = m.v; setDown(me, m.v); if (!m.v) { meHurt = false; $('hud').textContent = 'A medic helped you up.'; }; } else { const g = others.get(m.id); if (g) setDown(g, m.v); } }
    else if (m.t === 'join') makePlayer(m.player);
    else if (m.t === 'avatar') { const old = others.get(m.id); if (old) { const u = old.userData, p = old.position.clone(), r = old.rotation.y; scene.remove(old); const g = buildAvatar(m.avatar); tagged(g, m.name + stars(m.avatar.level)); g.position.copy(p); g.rotation.y = r; g.userData = u; scene.add(g); others.set(m.id, g); reattach(); } }
    else if (m.t === 'move') { const g = others.get(m.id); if (g) Object.assign(g.userData, { tx: m.x, ty: m.y || 0, tz: m.z, try: m.ry, s: m.s }); }
    else if (m.t === 'emote') { const g = others.get(m.id); if (g) { g.userData.emote = { e: m.e, at: performance.now() }; const me2 = emoteState(meEmote, performance.now()); if (m.e === 'handshake' && me2.emote === 'handshake' && Math.hypot(g.position.x - me.position.x, g.position.z - me.position.z) < 3.5) $('hud').textContent = `🤝 You shook hands with ${g.userData.name}!`; } }
    else if (m.t === 'crate') { const c = crates.get(m.id); if (c && c.userData.by == null) { c.userData.x = m.x; c.userData.z = m.z; c.position.set(m.x, c.userData.sz / 2, m.z); } }
    else if (m.t === 'carry') { const c = crates.get(m.id); if (c) { if (m.by == null) putCrate(c, m.x, m.z); else { c.userData.by = m.by; attach(c); if (m.by === myId) { const ft = touchOf(m.w, temp0()); $('hud').textContent = `You lifted a ${m.w} kg crate. ${ft.text} ${dev.kind === 'touch' ? 'Tap 📦' : 'Press G'} to put it down.`; tone(180, 0.08, 0.05, 0); buzz('lift', m.w); } } } }
    else if (m.t === 'note') $('hud').textContent = m.text;
    else if (m.t === 'bonus') { xp += m.xp; try { localStorage.setItem('vf-xp', String(Math.floor(xp))); } catch {} $('hud').textContent = m.text; }
    else if (m.t === 'leave') { const g = others.get(m.id); if (g) { scene.remove(g); others.delete(m.id); } }
    else if (m.t === 'chat') { $('hud').textContent = `${m.id === myId ? name : 'Player ' + m.id}: ${m.text}`; }
  };

  // ---------- Input ----------
  const keys = {};
  const act = a => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'act', a })); };
  addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) || $('custom').style.display === 'flex') return;
    const k = e.key.toLowerCase(); keys[k] = true;
    if (k === 'm') openCustom();
    lastInput = performance.now();
    if (k === 'g') toggleCarry();
    if (k === 't') taste();
    if (k === 'x') $('emoBtn').click();
    if (/^[0-9]$/.test(k) && EMOTE_KEYS[(+k + 9) % 10]) doEmote(EMOTE_KEYS[(+k + 9) % 10]);
    if (k === ' ') { e.preventDefault(); jump(); }
    if (k === 'e') shout();
    if (k === 'f') faint();
    if (k === 'h') hurt();
    if (k === 'c') critical();
    if (k === 'r') callMaint();
    if (k === 'l') dropLitter();
  });
  const jump = () => { if (me.position.y - heightAt(me.position.x, me.position.z) <= 0.001 && !meDown && !meHurt && !vitals.winded && vitals.stamina > 10) { vy = stats.jump * (carryingId() ? 0.7 : 1); vitals.stamina -= 8; } };
  const shout = () => { if (meDown) return; act('shout'); $('hud').textContent = 'You shouted! Security may come over.'; };
  const faint = () => { if (meDown) return; act('faint'); meDown = true; setDown(me, true); $('hud').textContent = 'You fainted. Wait for a medic.'; };
  const callMaint = () => { act('maint'); $('hud').textContent = 'You called maintenance. Help is on the way.'; };
  // ---- senses: taste, touch, audio ----
  const temp0 = () => feelTemp(clockMin, weather) || 'mild';
  let actx = null, lastTaste = 0, burnUntil = 0, lastSmellMsg = '', lastSoundMsg = 0, vest = new Vestibular(), senseDizzy = 0;
  const tone = (f, d, v, pan) => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(), p = actx.createStereoPanner ? actx.createStereoPanner() : null; o.frequency.value = f; g.gain.value = v; g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d); o.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(actx.destination); } else g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d); } catch {} };
  let lastGround = 0, aheadSlow = 1, prevEnv = null, crowdT = 0, lastEmpathy = 0, lastCrowdMsg = 0; const repliedTo = new Map(), SPACE_M = { close: 0.9, normal: 1.5, wide: 2.4 };
  let rxName = '', rxUntil = 0, lastYaw = 0, turnRate = 0, sirenHeard = false;
  const react = (r, ms, force) => { if (!r || (rxName && performance.now() < rxUntil && r !== 'burn' && !force)) return; rxName = r; rxUntil = performance.now() + ms; };
  const buzz = (kind, w) => { if (dev.kind === 'touch' && navigator.vibrate) { try { navigator.vibrate(hapticFor(kind, w)); } catch {} } };
  const taste = () => {
    if (meDown) return;
    const sp = nearestSpot(me.position.x, me.position.z, 3.2);
    if (!sp || !sp.flavor) { $('hud').textContent = 'Nothing to taste here. Find a food stand!'; return; }
    if (performance.now() - lastTaste < 4000) { $('hud').textContent = 'Savour it a moment first.'; return; }
    lastTaste = performance.now();
    const f = FLAVORS[sp.flavor];
    $('hud').textContent = `${sp.name}: ${f.text}`;
    chatMood = f.mood; chatMoodUntil = performance.now() + 5000; react(FLAVOR_REACTION[sp.flavor], 2200, true); buzz('taste');
    if (f.energy) vitals.stamina = Math.min(100, vitals.stamina + f.energy);
    tone(520, 0.12, 0.05, 0);
  };
  const dropLitter = () => { act('litter'); $('hud').textContent = 'You dropped litter. The cleaners will pick it up (please use the bins next time!).'; };
  const critical = () => { if (meDown) return; act('critical'); meDown = true; setDown(me, true); $('hud').textContent = 'Severe emergency! Medics and an ambulance are coming.'; };
  const hurt = () => { if (meDown || meHurt) return; act('hurt'); meHurt = true; $('hud').textContent = 'You are injured. Walk to a first aid station or wait for a medic.'; };
  if ('ontouchstart' in window) {
    $('acts').style.display = 'flex';
    const tap = (id, f) => $(id).addEventListener('touchstart', e => { e.preventDefault(); f(); }, { passive: false });
    tap('bShout', shout); tap('bFaint', faint); tap('bHurt', hurt); tap('bCrit', critical); tap('bMaint', callMaint); tap('bLitter', dropLitter); tap('bJump', jump); tap('bGrab', toggleCarry); tap('bTaste', taste); tap('bEdit', openCustom);
  }
  addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
  const chat = $('chat'); chat.style.display = 'block';
  chat.onkeydown = e => { if (e.key === 'Enter' && chat.value) { const cm = moodFromChat(chat.value); if (cm) { chatMood = cm; chatMoodUntil = performance.now() + 8000; } ws.send(JSON.stringify({ t: 'chat', text: chat.value })); $('hud').textContent = `${name}: ${chat.value}`; chat.value = ''; chat.blur(); } };
  const joy = { x: 0, y: 0 };
  if ('ontouchstart' in window) {
    const j = $('joy'), n = $('nub'); j.style.display = 'block';
    const upd = t => { const r = j.getBoundingClientRect(); let x = (t.clientX - r.left - 60) / 60, y = (t.clientY - r.top - 60) / 60; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; n.style.left = 35 + x * 35 + 'px'; n.style.top = 35 + y * 35 + 'px'; };
    j.ontouchstart = j.ontouchmove = e => { e.preventDefault(); upd(e.touches[0]); };
    j.ontouchend = () => { joy.x = joy.y = 0; n.style.left = n.style.top = '35px'; };
  }

  // drag to orbit the camera, wheel to zoom
  let camYaw = 0, camDist = 8, dragging = false, lastX = 0;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; });
  addEventListener('pointerup', () => dragging = false);
  addEventListener('pointermove', e => { if (dragging) { camYaw -= (e.clientX - lastX) * 0.006; lastX = e.clientX; } });
  cv.addEventListener('wheel', e => { camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 4, 16); });
  window.__vf = { get me() { return me; }, taste, get rx() { return [rxName, rxUntil]; } };
  let loudNow = 0, load = 0, focus = 'focused', speedNow = 0, slopeNow = 0, mudNow = false, stab = 1, lite = 0, camBase = 0;
  const gov = new QualityGovernor(dev.lowEnd ? 1 : 0), sendEvery = dev.slowNet ? 0.15 : 0.05;
  const applyQuality = q => { renderer.setPixelRatio(q >= 1 ? 1 : Math.min(devicePixelRatio, 2)); sun.castShadow = q < 1; if (q >= 2) scene.fog.far = 90; lite = q; };
  if (dev.lowEnd) applyQuality(1);

  // ---------- Loop ----------
  const clock = new THREE.Clock(); let sent = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x;
    let dz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joy.y;
    const now = performance.now(), len = Math.hypot(dx, dz), moving = len > 0.05;
    const frozen = meDown || now < lockUntil;
    if (frozen) { dx = dz = 0; }
    if (moving || dragging) lastInput = now;
    const idleFor = (now - lastInput) / 1000;
    const temp = feelTemp(clockMin, weather), carried = carryingId();
    const wantSprint = !!keys.shift || len > 0.95;
    const sprinting = vitals.update(dt, { sprinting: wantSprint, moving: moving && !frozen, hurt: meHurt }, { ...stats, drain: stats.drain * (temp === 'hot' ? 1.3 : 1) });
    if (vitals.winded && !wasWinded) $('hud').textContent = 'You are out of breath. Rest a moment!';
    wasWinded = vitals.winded;
    pushF = now < pushUntil ? pushF : 1;
    if (moving && !frozen) {
      dx /= Math.max(len, 1); dz /= Math.max(len, 1);
      const c = Math.cos(camYaw), s = Math.sin(camYaw), wx = dx * c + dz * s, wz = -dx * s + dz * c; // camera-relative
      const load = carried ? Math.max(0.5, 1 - carried.userData.w / (stats.carryKg * 2.4)) : 1;
      const target0 = (meHurt ? 0.5 : 1) * stats.walk * (sprinting ? stats.sprintMul : 1) * Math.sqrt(Math.max(me.userData.top, 1.4) / 2) * Math.min(len, 1) * load * pushF * (vitals.stumble > 0 ? 0.4 : 1) * (vitals.winded ? 0.75 : 1);
      slopeNow = slopeAlong(me.position.x, me.position.z, wx, wz); mudNow = onMud(me.position.x, me.position.z);
      const target = target0 * slopeSpeed(slopeNow) * (mudNow ? 0.55 : 1) * aheadSlow;
      const grip = weather === 'rain' || mudNow ? 3 + stats.grip * 0.5 : 12; // wet ground: slower to start and stop
      speedNow += (target - speedNow) * Math.min(1, dt * grip);
      const px = me.position.x, pz = me.position.z;
      me.position.x = THREE.MathUtils.clamp(px + wx * speedNow * dt, -75, 75);
      me.position.z = THREE.MathUtils.clamp(pz + wz * speedNow * dt, -75, 75);
      const bx = me.position.x, bz = me.position.z;
      collide(me.position);
      if (sprinting && Math.hypot(me.position.x - bx, me.position.z - bz) > 0.1 && Math.random() < tripChance(stats) * dt * 10 && vitals.trip()) { speedNow *= 0.3; buzz('stumble'); $('hud').textContent = 'You stumbled over an obstacle!'; }
      turn(me, Math.atan2(wx, wz), 0.25);
    } else { speedNow = 0; slopeNow = 0; mudNow = onMud(me.position.x, me.position.z); }

    // other players: keep personal space (soft collision)
    others.forEach(g => { const ox = me.position.x - g.position.x, oz = me.position.z - g.position.z, od = Math.hypot(ox, oz); if (od < 0.8 && od > 0.001) { const k = (0.8 - od) * 0.5 / od; me.position.x += ox * k; me.position.z += oz * k; } });

    // pushing crates
    let pushing = false;
    if (!meDown) crates.forEach(m => {
      const u = m.userData; if (u.by != null) return;
      const ox = u.x - me.position.x, oz = u.z - me.position.z, d = Math.hypot(ox, oz), min = u.sz * 0.6 + 0.35;
      if (d >= min) return;
      const nx = ox / (d || 1), nz = oz / (d || 1), tx = me.position.x + nx * min, tz = me.position.z + nz * min, probe = { x: tx, z: tz };
      collide(probe, 0.6);
      if (Math.hypot(probe.x - tx, probe.z - tz) > 0.01 || Math.abs(tx) > 75 || Math.abs(tz) > 75) { me.position.x = u.x - nx * min; me.position.z = u.z - nz * min; return; }
      u.x = tx; u.z = tz; u.dirty = true; m.position.set(tx, u.sz / 2, tz); pushing = true; pushUntil = now + 250; pushF = stats.pushFactor(u.w);
    });
    if (pushing && now - lastCrateSent > 100 && ws.readyState === 1) { lastCrateSent = now; crates.forEach(m => { if (m.userData.dirty) { m.userData.dirty = false; ws.send(JSON.stringify({ t: 'crate', id: m.userData.id, x: m.userData.x, z: m.userData.z })); } }); }

    const floorY = heightAt(me.position.x, me.position.z) + (meDown ? 0.25 : 0);
    vy -= 18 * dt; me.position.y = Math.max(floorY, me.position.y + vy * dt); if (me.position.y === floorY) vy = 0;
    const grounded = me.position.y - floorY < 0.05;
    stab = balanceFor({ slope: slopeNow, wet: weather === 'rain', mud: mudNow, load: carried ? Math.min(1, carried.userData.w / (stats.carryKg || 20)) : 0, hurt: meHurt, tired: vitals.tired ? 1 : 0, sprint: sprinting, agility: avatar.agility, level: avatar.level });
    { let dy = me.rotation.y - lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); turnRate += (dy / Math.max(dt, 1e-3) - turnRate) * 0.2; lastYaw = me.rotation.y; }
    senseDizzy = vest.update(dt, me.rotation.y, camYaw, grounded); stab = Math.max(0, stab - vest.penalty);
    if (moving && !frozen && grounded && Math.random() < stumbleRate(stab) * dt && vitals.trip()) { speedNow *= 0.3; buzz('stumble'); $('hud').textContent = mudNow ? 'You slipped in the mud!' : 'You lost your footing on the slope!'; }
    const q = gov.sample(dt); if (q != null) applyQuality(q);
    { const gp = pollGamepad(); if (gp) { joy.x = gp.x; joy.y = gp.y; camYaw -= gp.cam * dt * 2.5; keys.shift = gp.sprint; if (gp.jump) jump(); if (gp.grab) toggleCarry(); if (gp.wave) doEmote('wave'); if (gp.emotes) doEmote('cheer'); } }
    if (moving && !frozen) meEmote = null;

    // social awareness: look at / greet the nearest player, wander gaze when distracted
    let nearId = null, nd = 6;
    others.forEach((g, id) => { const d = Math.hypot(g.position.x - me.position.x, g.position.z - me.position.z); if (d < nd) { nd = d; nearId = id; } });
    let lk = 0;
    if (nearId != null) { const g = others.get(nearId); let ang = Math.atan2(g.position.x - me.position.x, g.position.z - me.position.z) - me.rotation.y; ang = Math.atan2(Math.sin(ang), Math.cos(ang)); lk = THREE.MathUtils.clamp(ang, -1.2, 1.2);
      if (nd < 4 && !moving && !frozen && now - (greeted.get(nearId) || -1e9) > 60000) { greeted.set(nearId, now); turn(me, Math.atan2(g.position.x - me.position.x, g.position.z - me.position.z), 0.6); doEmote(avatar.culture); } }
    else if (idleFor > 15) lk = Math.sin(t * 0.7) * 0.8;
    { let gl = 0; npcs.forEach(o => { if (!gl && o.g.userData.role !== 'ambulance') gl = glanceBehind(me.position.x, me.position.z, me.rotation.y, o.g.position.x, o.g.position.z); }); if (gl && !moving) lk = gl; }
    if (senseDizzy > 0.4) lk += Math.sin(t * 5) * senseDizzy * 0.5;
    lkS += (lk - lkS) * Math.min(1, dt * 6);
    { const sp = nearestSpot(me.position.x, me.position.z, 1.6), st = surfaceTouch(sp); if (st && now > burnUntil) { burnUntil = now + 3000; $('hud').textContent = st.text; if (st.pain) { speedNow *= 0.2; vitals.stamina = Math.max(0, vitals.stamina - 5); react('burn', 1400); buzz('burn'); tone(900, 0.15, 0.06, 0); } } }
    if (meEmote && nearId != null && nd < 5 && !moving) turn(me, Math.atan2(others.get(nearId).position.x - me.position.x, others.get(nearId).position.z - me.position.z), 0.15);
    if (!moving && !frozen && nearId == null && idleFor > 12 && !meEmote && now - lastIdleEmote > 25000) { lastIdleEmote = now; doEmote(IDLE_EMOTE[avatar.interest] || 'stretch'); }

    const mood = effectiveMood({ base: avatar.mood, hurt: meHurt, down: meDown, tired: vitals.tired, chatMood: now < chatMoodUntil ? chatMood : null });
    animateAvatar(me, t, { moving: moving && !frozen && grounded, speed: sprinting ? 11 : 8, sprint: sprinting, mood, tired: vitals.tired, temp, hurt: meHurt, carry: !!carried, push: pushing, stumble: vitals.stumble, look: lkS, slope: slopeNow, sway: Math.max(0, 1 - stab), calm: dev.reduceMotion, turn: turnRate, load: carried ? Math.min(1, carried.userData.w / (stats.carryKg || 20)) : 0, dizzy: senseDizzy, react: performance.now() < rxUntil ? rxName : '', ...emoteState(meEmote, now) });

    // experience: playing time raises the skill level
    xp += dt; xpSave += dt;
    if (xpSave > 10) { xpSave = 0; try { localStorage.setItem('vf-xp', String(Math.floor(xp))); } catch {} }
    const lv = levelFor(xp);
    if (lv !== avatar.level) { avatar.level = lv; saveAvatar(); stats = stats0(); onAvatarChange(); $('hud').textContent = `Level up! You are now ${LEVELS[lv]}${stars(lv)}: more stamina and agility.`; }
    vitalsT -= dt;
    if (vitalsT <= 0) {
      vitalsT = 0.25;
      let hazards = 0; litterMeshes.forEach(l => { if (Math.hypot(l.position.x - me.position.x, l.position.z - me.position.z) < 6) hazards++; });
      const night = clockMin < 360 || clockMin > 1200;
      load = cognitiveLoad({ crowd: others.size + [...npcs.values()].filter(o => Math.hypot(o.g.position.x - me.position.x, o.g.position.z - me.position.z) < 10).length, rain: weather === 'rain', night, hurt: meHurt, tired: vitals.tired ? 1 : 0, hazards });
      focus = focusState({ idleFor, chatting: document.activeElement === chat, load });
      const litter = []; litterMeshes.forEach(l => litter.push({ x: l.position.x, z: l.position.z, spill: l.geometry === spillGeo }));
      const sm = smellAt(me.position.x, me.position.z, litter), sr = smellReaction(sm);
      if (sm && sm.strength > 0.35 && sm.name !== lastSmellMsg && now > lastSoundMsg) { lastSmellMsg = sm.name; $('hud').textContent = sm.pleasant >= 0.7 ? `You smell ${sm.name}.${sr ? ' Mmm.' : ''}` : sm.pleasant < 0.3 ? `Ew, ${sm.name}!` : `You smell ${sm.name}.`; if (sr && sm.pleasant < 0.3) { chatMood = sr.mood; chatMoodUntil = now + 3000; } }
      else if (!sm || sm.strength < 0.2) lastSmellMsg = '';
      const srcs = []; if (!rideFault[1]) srcs.push({ x: 30, z: -20, level: 0.5, kind: 'carousel music' }); npcs.forEach(o => { if (o.g.userData.role === 'ambulance' && o.g.userData.siren) srcs.push({ x: o.g.position.x, z: o.g.position.z, level: 1, kind: 'siren' }); });
      const hr = hearing(me.position.x, me.position.z, srcs, { rain: weather === 'rain' });
      if (hr.loud && hr.loud.kind === 'siren') { tone(hr.loud.v > 0.5 ? 760 : 620, 0.2, Math.min(0.06, hr.loud.v * 0.1), panOf(me.position.x, me.position.z, me.rotation.y, hr.loud.x, hr.loud.z)); if (now > lastSoundMsg) { lastSoundMsg = now + 12000; $('hud').textContent = `You hear a siren ${panOf(me.position.x, me.position.z, me.rotation.y, hr.loud.x, hr.loud.z) < 0 ? 'to your left' : 'to your right'}.`; } }
      loudNow = hr.total;
      // ---- emotional / social / cognitive / environmental feedback ----
      const mePt = { x: me.position.x, z: me.position.z, ry: me.rotation.y };
      const people = [];
      others.forEach((g, id) => { const u = g.userData, o2 = u.s || {}; const vx = (u.tx - (u.px ?? u.tx)) / 0.25, vz = (u.tz - (u.pz ?? u.tz)) / 0.25; u.px = u.tx; u.pz = u.tz; people.push({ id: 'p' + id, name: u.name, x: g.position.x, z: g.position.z, ry: g.rotation.y, mood: o2.m || 'neutral', vx, vz, pushing: !!o2.pu, sprint: !!o2.sp, carrying: [...crates.values()].some(c => c.userData.by === id), emote: u.emote && performance.now() - u.emote.at < 2500 ? u.emote.e : null, at: u.emote && u.emote.at }); });
      npcs.forEach((o, id) => { if (o.g.userData.role === 'ambulance') return; people.push({ id: 'n' + id, name: o.name || 'Staff', x: o.g.position.x, z: o.g.position.z, ry: o.g.rotation.y, mood: o.mood || 'neutral', label: o.intent, emote: o.emote && performance.now() - o.emote.at < 2500 ? o.emote.e : null, at: o.emote && o.emote.at }); });
      // emotional: catch the mood of those nearby and notice distress
      const emo = emotionAround(mePt.x, mePt.z, people);
      if (emo) { if (!meHurt && !meDown) { chatMood = emo.mood; chatMoodUntil = now + 2500; } if (emo.concerned && now - lastEmpathy > 20000) { lastEmpathy = now; $('hud').textContent = `${emo.concerned.who} looks ${emo.concerned.mood === 'sad' ? 'upset or hurt' : 'worried'}. You feel concerned.`; } }
      // social: answer greetings aimed at me, feel crowded when people stand too close
      for (const p of people) { const cue = p.emote && socialCue(mePt, p, p.emote); if (cue && repliedTo.get(p.id) !== p.at && !moving && !emoteState(meEmote, now).emote && !meDown) { repliedTo.set(p.id, p.at); doEmote(cue.reply); $('hud').textContent = `${cue.from} greeted you. You respond.`; turn(me, Math.atan2(p.x - mePt.x, p.z - mePt.z), 0.6); break; } }
      const crowd = crowding(mePt.x, mePt.z, people, SPACE_M[avatar.space] || 1.5);
      crowdT = crowd > 0.5 ? crowdT + 0.25 : 0;
      if (crowdT > 3 && now - lastCrowdMsg > 15000) { lastCrowdMsg = now; chatMood = 'nervous'; chatMoodUntil = now + 4000; $('hud').textContent = 'Someone is standing very close. You feel crowded.'; }
      // cognitive: read what the nearest person seems to intend
      let near = null, nd2 = 9; for (const p of people) { const d = Math.hypot(p.x - mePt.x, p.z - mePt.z); if (d < nd2) { nd2 = d; near = p; } }
      const it = $('intent'); if (it) { it.style.display = near && focus !== 'overloaded' ? 'block' : 'none'; if (near) it.textContent = `💭 ${near.name}: ${intentOf(mePt, near)}`; }
      // environmental: notice changes and the ground ahead
      const envNow = { weather, night, faults: rideFault.slice(), clean: +$('cl').textContent };
      const ec = envChange(prevEnv, envNow); prevEnv = envNow;
      if (ec) { $('hud').textContent = ec.text; if (ec.mood) { chatMood = ec.mood; chatMoodUntil = now + 3500; } if (ec.react) react(ec.react, 1500); }
      const ga = moving ? groundAhead(mePt.x, mePt.z, mePt.ry, onMud, heightAt) : null;
      aheadSlow = ga ? ga.slow : 1; if (ga && now - lastGround > 12000) { lastGround = now; $('hud').textContent = ga.text; }
      const sirenNow = !!(hr.loud && hr.loud.kind === 'siren' && hr.loud.v > 0.3);
      const pr = pickReaction({ loud: hr.total, siren: sirenNow && !sirenHeard, smell: sm, rain: weather === 'rain', night, moving });
      if (sirenNow && !sirenHeard) buzz('siren');
      sirenHeard = sirenNow;
      if (pr) react(pr.r, pr.ms);
      const vg = $('vision'); if (vg) vg.style.opacity = Math.min(0.85, (night ? 0.25 : 0) + (weather === 'rain' ? 0.12 : 0) + senseDizzy * 0.6 + (meHurt ? 0.15 : 0) + (vitals.tired ? 0.1 : 0));
      const vd = new THREE.Vector3(); camera.getWorldDirection(vd); const viewYaw = Math.atan2(vd.x, vd.z);
      const range = visionRange({ night, rain: weather === 'rain' });
      npcs.forEach(o => { if (o.tag) o.tag.visible = canSee(me.position.x, me.position.z, viewYaw, o.g.position.x, o.g.position.z, range, 3.4); });
      const calm = focus === 'overloaded' || dev.small;
      $('radio').style.opacity = calm ? 0.25 : 1; $('park').style.opacity = calm ? 0.5 : 1;
      const bal = stab > 0.75 ? 'steady' : stab > 0.5 ? 'wobbly' : 'unstable';
      const label = { focused: 'Focused', distracted: 'Distracted', chatting: 'Chatting', overloaded: 'Overloaded' }[focus];
      $('vitals').textContent = `${LEVELS[avatar.level]}${stars(avatar.level)} · Stamina ${'█'.repeat(Math.round(vitals.stamina / 10))}${'░'.repeat(10 - Math.round(vitals.stamina / 10))} · ${mood} · ${label} · Balance ${bal}${senseDizzy > 0.3 ? ' · 😵‍💫 dizzy' : ''}${loudNow > 0.6 ? ' · 🔊 loud' : ''}${mudNow ? ' (mud)' : Math.abs(slopeNow) > 0.15 ? (slopeNow > 0 ? ' (uphill)' : ' (downhill)') : ''}${temp ? ' · ' + (temp === 'cold' ? '🥶 cold' : '🥵 hot') : ''}${meHurt ? ' · 🩹 injured' : ''}${lite ? ' · Lite mode' : ''}`;
    }
    crates.forEach(m => { if (m.parent === scene) m.position.y = heightAt(m.position.x, m.position.z) + m.userData.sz / 2; });
    if (t - sent > sendEvery && ws.readyState === 1) { sent = t; ws.send(JSON.stringify({ t: 'move', x: me.position.x, y: me.position.y, z: me.position.z, ry: me.rotation.y, s: { m: mood, tr: vitals.tired, tp: temp, pu: pushing, sp: sprinting, st: vitals.stumble, lk: lkS, fc: focus, rx: performance.now() < rxUntil ? rxName : '', dz: +senseDizzy.toFixed(2) } })); }
    others.forEach((g, id) => {
      const u = g.userData, d = Math.hypot(u.tx - g.position.x, u.tz - g.position.z);
      g.position.x += (u.tx - g.position.x) * 0.2; g.position.z += (u.tz - g.position.z) * 0.2; g.position.y += ((u.ty || 0) + (u.down ? 0.25 : 0) - g.position.y) * 0.3;
      turn(g, u.try, 0.3);
      const o = u.s || {}, mv = d > 0.02; if (mv) u.emote = null;
      animateAvatar(g, t, { moving: mv, speed: o.sp ? 11 : 8, sprint: o.sp, mood: o.m, tired: o.tr, temp: o.tp, hurt: u.hurt, carry: [...crates.values()].some(c => c.userData.by === id), push: o.pu, stumble: o.st, look: o.lk, react: o.rx, dizzy: o.dz, ...emoteState(u.emote, performance.now()) });
    });
    npcs.forEach(o => {
      const g = o.g, u = g.userData, d = Math.hypot(u.tx - g.position.x, u.tz - g.position.z);
      g.position.x += (u.tx - g.position.x) * 0.25; g.position.z += (u.tz - g.position.z) * 0.25;
      if (u.role === 'ambulance') { turn(g, u.try, 0.15); (u.lights || []).forEach((l, i) => l.material.emissiveIntensity = u.siren && Math.sin(t * 14 + i * Math.PI) > 0 ? 3 : 0); }
      else { turn(g, u.try, 0.2); animateAvatar(g, t, { moving: u.moving && d > 0.02, carry: [...crates.values()].some(c => c.userData.by === 'n' + o.id), calm: dev.reduceMotion, ...(u.moving && d > 0.02 ? {} : emoteState(o.emote, performance.now())) }); }
      g.position.y = heightAt(g.position.x, g.position.z) + (u.down ? 0.25 : 0);
    });
    const night = clockMin < 360 || clockMin > 1200, dusk = (clockMin > 1020 && clockMin <= 1200) || (clockMin >= 360 && clockMin < 480);
    const lit = night ? 0.25 : dusk ? 0.6 : 1;
    sun.intensity = 2.2 * lit * (weather === 'rain' ? 0.5 : 1);
    const target = night ? new THREE.Color('#0b1030') : weather === 'rain' ? sky.rain : dusk ? new THREE.Color('#ff9a6b') : sky.clear;
    scene.background.lerp(target, 0.02); scene.fog.color.copy(scene.background);
    rain.visible = weather === 'rain' && lite < 2;
    if (rain.visible) { rain.position.set(me.position.x, 0, me.position.z); const p = rain.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) - dt * 18; if (y < 0) y = 30; p.setY(i, y); } p.needsUpdate = true; }
    if (!rideFault[0]) wheel.rotation.z += dt * 0.15;
    cabins.forEach(c => c.rotation.z = -wheel.rotation.z);
    if (!rideFault[1]) { carousel.rotation.y += dt * 0.5; horses.forEach((h, i) => h.position.y = 1.6 + Math.sin(t * 2 + i) * 0.4); }
    [[beacons[0], rideFault[0]], [beacons[1], rideFault[1]]].forEach(([b, v]) => { b.visible = !!v; if (v) { b.material.color.set(v === 2 ? '#ff2020' : '#ffb000'); b.material.emissive.set(v === 2 ? '#ff2020' : '#ffb000'); b.material.emissiveIntensity = Math.sin(t * 8) > 0 ? 3 : 0.3; } });
    camera.position.lerp(new THREE.Vector3(me.position.x + Math.sin(camYaw) * camDist, 4.5 * camDist / 8 + 0.5, me.position.z + Math.cos(camYaw) * camDist), 0.15);
    camera.lookAt(me.position.x, 1.3 * (me.userData.top || 2) / 2, me.position.z);
    renderer.render(scene, camera);
  });
}
