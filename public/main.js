import * as THREE from 'three';
import { analyzePhoto, buildAvatar, defaultAvatar, animateWalk } from './avatar.js';
import { initCustomizer } from './customizer.js';

const $ = id => document.getElementById(id);
let avatar = defaultAvatar();
try { avatar = { ...avatar, ...JSON.parse(localStorage.getItem('vf-avatar') || '{}') }; } catch {}
$('name').value = localStorage.getItem('vf-name') || '';
const saveAvatar = () => { try { localStorage.setItem('vf-avatar', JSON.stringify(avatar)); } catch {} };
let onAvatarChange = () => {};
const customizer = initCustomizer({ root: $('custom'), get: () => avatar, set: a => { avatar = a; saveAvatar(); } });
const openCustom = () => { $('custom').style.display = 'flex'; customizer.show(); };
const closeCustom = () => { $('custom').style.display = 'none'; customizer.hide(); onAvatarChange(); };
$('custBtn').onclick = openCustom; $('custDone').onclick = closeCustom;
const photoAvatar = p => { avatar = { ...avatar, ...p }; saveAvatar(); };

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
    tagged(g, p.name); g.position.set(p.x, 0, p.z);
    g.userData = { tx: p.x, tz: p.z, try: p.ry, moving: false };
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
    const g = r.role === 'ambulance' ? buildAmbulance() : buildAvatar(r.look); const tg = nameTag(r.name); if (r.role === 'ambulance') tg.position.y = 3.4; g.add(tg); const b = bubble(); if (r.role === 'ambulance') b.position.y = 4; g.add(b);
    Object.assign(g.userData, { tx: 0, tz: 0, try: 0, moving: 0, role: r.role, siren: 0 });
    scene.add(g); npcs.set(r.id, { g, b, init: false });
  };
  const setDown = (g, d) => { g.rotation.x = d ? -Math.PI / 2 : 0; g.position.y = d ? 0.25 : 0; };
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

  let me = buildAvatar(avatar), meTag = tagged(me, name); me.position.set(0, 0, 8); scene.add(me);
  let vy = 0;
  const swapMe = () => { // rebuild own avatar after customization
    const pos = me.position.clone(), ry = me.rotation.y; scene.remove(me);
    me = buildAvatar(avatar); meTag = tagged(me, name); me.position.copy(pos); me.rotation.y = ry; scene.add(me); setDown(me, meDown);
  };
  onAvatarChange = () => { swapMe(); if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'avatar', avatar })); };

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  let myId = null;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, avatar }));
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.t === 'welcome') { myId = m.id; m.players.forEach(p => p.id !== myId && makePlayer(p)); obstacles = m.obstacles || []; collide(me.position); m.npcs.forEach(addNpc); (m.stations || []).forEach(buildStation); }
    else if (m.t === 'roster') m.npcs.forEach(addNpc);
    else if (m.t === 'npcs') {
      weather = m.w; clockMin = m.c; syncLitter(m.l || []); rideFault = m.r || [0, 0];
      $('cl').textContent = m.cl; { const names = ['ferris wheel', 'carousel'], f = rideFault.map((v, i) => v ? names[i] + (v === 2 ? ' (MAJOR FAULT)' : ' (closed)') : null).filter(Boolean); $('rd').textContent = f.length ? 'Closed: ' + f.join(', ') : 'Rides: all running'; $('rd').style.color = f.length ? '#ffb347' : ''; } $('hud').dataset.alert = m.a;
      const live = new Set();
      m.n.forEach(s => { const o = npcs.get(s.id); if (!o) return; live.add(s.id); const u = o.g.userData; if (!o.init) { o.g.position.set(s.x, 0, s.z); o.init = true; } Object.assign(u, { tx: s.x, tz: s.z, try: s.r, moving: s.m, siren: s.e }); setBubble(o.b, s.s); setDown(o.g, s.d); });
      npcs.forEach((o, id) => { if (!live.has(id)) { scene.remove(o.g); npcs.delete(id); } });
    }
    else if (m.t === 'radio') { const r = $('radio'), d = document.createElement('div'); d.textContent = `${m.from}: ${m.text}`; r.appendChild(d); while (r.children.length > 7) r.removeChild(r.children[1]); }
    else if (m.t === 'tp') { if (m.id === myId) { me.position.set(m.x, 0, m.z); lockUntil = performance.now() + (m.lock || 0); $('hud').textContent = m.text; } }
    else if (m.t === 'hurt') { if (m.id === myId) { meHurt = m.v; $('hud').textContent = m.v ? 'You are injured.' : 'A medic treated your injury.'; } }
    else if (m.t === 'down') { if (m.id === myId) { meDown = m.v; setDown(me, m.v); if (!m.v) { meHurt = false; $('hud').textContent = 'A medic helped you up.'; }; } else { const g = others.get(m.id); if (g) setDown(g, m.v); } }
    else if (m.t === 'join') makePlayer(m.player);
    else if (m.t === 'avatar') { const old = others.get(m.id); if (old) { const u = old.userData, p = old.position.clone(), r = old.rotation.y; scene.remove(old); const g = buildAvatar(m.avatar); tagged(g, m.name); g.position.copy(p); g.rotation.y = r; g.userData = u; scene.add(g); others.set(m.id, g); } }
    else if (m.t === 'move') { const g = others.get(m.id); if (g) Object.assign(g.userData, { tx: m.x, ty: m.y || 0, tz: m.z, try: m.ry }); }
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
    if (k === ' ') { e.preventDefault(); jump(); }
    if (k === 'e') shout();
    if (k === 'f') faint();
    if (k === 'h') hurt();
    if (k === 'c') critical();
    if (k === 'r') callMaint();
    if (k === 'l') dropLitter();
  });
  const jump = () => { if (me.position.y <= 0.001 && !meDown) vy = 6; };
  const shout = () => { if (meDown) return; act('shout'); $('hud').textContent = 'You shouted! Security may come over.'; };
  const faint = () => { if (meDown) return; act('faint'); meDown = true; setDown(me, true); $('hud').textContent = 'You fainted. Wait for a medic.'; };
  const callMaint = () => { act('maint'); $('hud').textContent = 'You called maintenance. Help is on the way.'; };
  const dropLitter = () => { act('litter'); $('hud').textContent = 'You dropped litter. The cleaners will pick it up (please use the bins next time!).'; };
  const critical = () => { if (meDown) return; act('critical'); meDown = true; setDown(me, true); $('hud').textContent = 'Severe emergency! Medics and an ambulance are coming.'; };
  const hurt = () => { if (meDown || meHurt) return; act('hurt'); meHurt = true; $('hud').textContent = 'You are injured. Walk to a first aid station or wait for a medic.'; };
  if ('ontouchstart' in window) {
    $('acts').style.display = 'flex';
    const tap = (id, f) => $(id).addEventListener('touchstart', e => { e.preventDefault(); f(); }, { passive: false });
    tap('bShout', shout); tap('bFaint', faint); tap('bHurt', hurt); tap('bCrit', critical); tap('bMaint', callMaint); tap('bLitter', dropLitter); tap('bJump', jump); tap('bEdit', openCustom);
  }
  addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
  const chat = $('chat'); chat.style.display = 'block';
  chat.onkeydown = e => { if (e.key === 'Enter' && chat.value) { ws.send(JSON.stringify({ t: 'chat', text: chat.value })); $('hud').textContent = `${name}: ${chat.value}`; chat.value = ''; chat.blur(); } };
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
  let speedNow = 0;

  // ---------- Loop ----------
  const clock = new THREE.Clock(); let sent = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
    let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x;
    let dz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joy.y;
    const len = Math.hypot(dx, dz), moving = len > 0.05;
    const frozen = meDown || performance.now() < lockUntil;
    if (frozen) { dx = dz = 0; }
    if (moving && !frozen) {
      dx /= Math.max(len, 1); dz /= Math.max(len, 1);
      const c = Math.cos(camYaw), s = Math.sin(camYaw), wx = dx * c + dz * s, wz = -dx * s + dz * c; // camera-relative
      const sprint = (keys.shift && !meHurt) ? 1.6 : 1;
      const target = (meHurt ? 3 : 6) * sprint * Math.sqrt(Math.max(me.userData.top, 1.4) / 2) * Math.min(len, 1);
      speedNow += (target - speedNow) * Math.min(1, dt * 12);
      me.position.x = THREE.MathUtils.clamp(me.position.x + wx * speedNow * dt, -75, 75);
      me.position.z = THREE.MathUtils.clamp(me.position.z + wz * speedNow * dt, -75, 75);
      collide(me.position);
      turn(me, Math.atan2(wx, wz), 0.25);
    } else speedNow = 0;
    vy -= 18 * dt; me.position.y = Math.max(0, me.position.y + vy * dt); if (me.position.y === 0) vy = 0;
    animateWalk(me, t, moving && !frozen && me.position.y < 0.05, speedNow > 7 ? 11 : 8);
    if (t - sent > 0.05 && ws.readyState === 1) { sent = t; ws.send(JSON.stringify({ t: 'move', x: me.position.x, y: me.position.y, z: me.position.z, ry: me.rotation.y })); }
    others.forEach(g => {
      const u = g.userData, d = Math.hypot(u.tx - g.position.x, u.tz - g.position.z);
      g.position.x += (u.tx - g.position.x) * 0.2; g.position.z += (u.tz - g.position.z) * 0.2; g.position.y += ((u.ty || 0) - g.position.y) * 0.3;
      turn(g, u.try, 0.3); animateWalk(g, t, d > 0.02);
    });
    npcs.forEach(o => {
      const g = o.g, u = g.userData, d = Math.hypot(u.tx - g.position.x, u.tz - g.position.z);
      g.position.x += (u.tx - g.position.x) * 0.25; g.position.z += (u.tz - g.position.z) * 0.25;
      if (u.role === 'ambulance') { turn(g, u.try, 0.15); (u.lights || []).forEach((l, i) => l.material.emissiveIntensity = u.siren && Math.sin(t * 14 + i * Math.PI) > 0 ? 3 : 0); }
      else { turn(g, u.try, 0.2); animateWalk(g, t, u.moving && d > 0.02); }
    });
    const night = clockMin < 360 || clockMin > 1200, dusk = (clockMin > 1020 && clockMin <= 1200) || (clockMin >= 360 && clockMin < 480);
    const lit = night ? 0.25 : dusk ? 0.6 : 1;
    sun.intensity = 2.2 * lit * (weather === 'rain' ? 0.5 : 1);
    const target = night ? new THREE.Color('#0b1030') : weather === 'rain' ? sky.rain : dusk ? new THREE.Color('#ff9a6b') : sky.clear;
    scene.background.lerp(target, 0.02); scene.fog.color.copy(scene.background);
    rain.visible = weather === 'rain';
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
