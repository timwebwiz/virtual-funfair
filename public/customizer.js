import * as THREE from 'three';
import { buildAvatar, analyzePhoto, FACE_DEFAULTS, FACE_RANGES, OPTIONS, HEIGHT_RANGE, BUILD_RANGE, MOODS, CULTURES, INTERESTS, TRAIT_RANGE, LANGS, FORMAL, SPACES } from './avatar.js';

const COLORS = [['skin', 'Skin'], ['hair', 'Hair'], ['shirt', 'Top'], ['pants', 'Bottoms'], ['shoes', 'Shoes'], ['accent', 'Hat / bag colour']];
const SELECTS = [['hairStyle', 'Hair style'], ['shirtStyle', 'Top style'], ['pantsStyle', 'Bottoms'], ['hat', 'Hat'], ['glasses', 'Glasses']];
const TRAITS = [['strength', 'Strength'], ['agility', 'Agility'], ['endurance', 'Endurance']];
const PERSONAL = [['mood', 'Mood', MOODS], ['culture', 'Greeting style', CULTURES], ['lang', 'NPC greets me in', Object.keys(LANGS)], ['formal', 'Formality', FORMAL], ['space', 'Personal space', SPACES], ['interest', 'Interest', INTERESTS]];
const cap = s => s[0].toUpperCase() + s.slice(1);

export function initCustomizer({ root, get, set }) {
  const f = root.querySelector('#fields'), canvas = root.querySelector('#preview');
  const inputs = {};
  const row = (label, el) => { const d = document.createElement('label'); d.className = 'row'; d.append(label, el); f.append(d); return el; };

  let unit = localStorage.getItem('vf-unit') === 'in' ? 'in' : 'cm';
  const toDisp = cm => unit === 'in' ? Math.round(cm / 2.54 * 10) / 10 : Math.round(cm);
  const toCm = v => unit === 'in' ? v * 2.54 : v;
  const u = row('Height unit', document.createElement('select'));
  u.add(new Option('Centimeters (cm)', 'cm')); u.add(new Option('Inches (in)', 'in')); u.value = unit;
  const h = row('Height', Object.assign(document.createElement('input'), { type: 'number', step: unit === 'in' ? 0.5 : 1 }));
  const setRange = () => { h.min = toDisp(HEIGHT_RANGE[0]); h.max = toDisp(HEIGHT_RANGE[1]); h.step = unit === 'in' ? 0.5 : 1; };
  setRange();
  u.addEventListener('change', e => {
    e.stopPropagation();
    const cm = Math.min(HEIGHT_RANGE[1], Math.max(HEIGHT_RANGE[0], toCm(+h.value) || get().height));
    unit = u.value; localStorage.setItem('vf-unit', unit); setRange(); h.value = toDisp(cm);
  });
  const b = row('Build (slim → broad)', Object.assign(document.createElement('input'), { type: 'range', min: BUILD_RANGE[0], max: BUILD_RANGE[1], step: 0.01 }));
  inputs.height = h; inputs.build = b;
  for (const [k, l] of COLORS) inputs[k] = row(l, Object.assign(document.createElement('input'), { type: 'color' }));
  for (const [k, l] of SELECTS) {
    const s = document.createElement('select');
    OPTIONS[k].forEach(o => s.add(new Option(cap(o), o)));
    inputs[k] = row(l, s);
  }
  for (const [k, l] of TRAITS) inputs[k] = row(l, Object.assign(document.createElement('input'), { type: 'range', min: TRAIT_RANGE[0], max: TRAIT_RANGE[1], step: 1 }));
  for (const [k, l, opts] of PERSONAL) { const s2 = document.createElement('select'); opts.forEach(o => s2.add(new Option(LANGS[o] || cap(o), o))); inputs[k] = row(l, s2); }
  // ---- Face: photo, camera or build-your-own ----
  const head = document.createElement('div'); head.id = 'faceHead'; head.style.cssText = 'font-weight:bold;margin:10px 0 4px'; head.textContent = 'Face'; f.append(head);
  const mode = row('Face source', document.createElement('select'));
  [['photo', 'My photo'], ['built', 'Build my face'], ['plain', 'Simple (no face)']].forEach(([v, l]) => mode.add(new Option(l, v)));
  const fMsg = document.createElement('div'); fMsg.style.cssText = 'font-size:12px;margin:2px 0'; f.append(fMsg);
  const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  file.setAttribute('capture', 'user'); row('Upload a photo', file);
  const vid = Object.assign(document.createElement('video'), { autoplay: true, muted: true, playsInline: true }); vid.style.cssText = 'display:none;width:180px;border-radius:8px';
  const camBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: '📷 Take a photo' });
  const snapBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Capture' }); snapBtn.style.display = 'none';
  const camRow = document.createElement('div'); camRow.append(camBtn, ' ', snapBtn, vid); f.append(camRow);
  let stream = null;
  const stopCam = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; vid.style.display = 'none'; snapBtn.style.display = 'none'; };
  const applyPhoto = src => {
    const p = analyzePhoto(src);
    set({ ...get(), face: p.face, skin: p.skin, faceMode: 'photo' }); write(); rebuild(); fMsg.textContent = 'Photo applied ✔ (skin tone matched)';
  };
  file.onchange = e => { const fl = e.target.files[0]; if (!fl) return; const img = new Image(); img.onload = () => applyPhoto(img); img.src = URL.createObjectURL(fl); };
  camBtn.onclick = async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); vid.srcObject = stream; vid.style.display = 'block'; snapBtn.style.display = 'inline'; }
    catch { fMsg.textContent = 'Camera unavailable; upload a photo instead.'; }
  };
  snapBtn.onclick = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const s = Math.min(vid.videoWidth, vid.videoHeight) || 128; cv.getContext('2d').drawImage(vid, (vid.videoWidth - s) / 2, (vid.videoHeight - s) / 2, s, s, 0, 0, 128, 128); stopCam(); applyPhoto(cv); };
  const FACE_NUM = [['eyeSize', 'Eye size'], ['eyeSpacing', 'Eye spacing'], ['browThick', 'Eyebrow thickness'], ['noseSize', 'Nose size'], ['mouthWidth', 'Mouth width'], ['cheeks', 'Cheek blush']];
  const fb = {};
  for (const [k, l] of FACE_NUM) fb[k] = row(l, Object.assign(document.createElement('input'), { type: 'range', min: FACE_RANGES[k][0], max: FACE_RANGES[k][1], step: 0.01 }));
  fb.eyeColor = row('Eye colour', Object.assign(document.createElement('input'), { type: 'color' }));
  fb.lipColor = row('Lip colour', Object.assign(document.createElement('input'), { type: 'color' }));
  fb.freckles = row('Freckles', Object.assign(document.createElement('input'), { type: 'checkbox' }));
  fb.lashes = row('Eyelashes', Object.assign(document.createElement('input'), { type: 'checkbox' }));
  const FACE_KEYS = [...FACE_NUM.map(x => x[0]), 'eyeColor', 'lipColor', 'freckles', 'lashes'];
  const readFace = () => { const o = {}; for (const k of FACE_KEYS) o[k] = fb[k].type === 'checkbox' ? fb[k].checked : fb[k].type === 'color' ? fb[k].value : +fb[k].value; return o; };
  const writeFace = a => { const v = { ...FACE_DEFAULTS, ...a.fb }; for (const k of FACE_KEYS) { if (fb[k].type === 'checkbox') fb[k].checked = !!v[k]; else fb[k].value = v[k]; } mode.value = a.faceMode || 'photo'; const built = mode.value === 'built'; for (const k of FACE_KEYS) fb[k].closest('label').style.display = built ? '' : 'none'; };
  inputs.backpack = row('Backpack', Object.assign(document.createElement('input'), { type: 'checkbox' }));

  const read = () => {
    const a = { ...get() };
    a.height = Math.min(HEIGHT_RANGE[1], Math.max(HEIGHT_RANGE[0], toCm(+h.value) || 175));
    a.build = +b.value;
    for (const [k] of COLORS) a[k] = inputs[k].value;
    for (const [k] of SELECTS) a[k] = inputs[k].value;
    a.backpack = inputs.backpack.checked;
    a.faceMode = mode.value; a.fb = readFace();
    for (const [k] of TRAITS) a[k] = +inputs[k].value;
    for (const [k] of PERSONAL) a[k] = inputs[k].value;
    return a;
  };
  const write = () => {
    const a = get();
    h.value = toDisp(a.height); b.value = a.build;
    for (const [k] of COLORS) inputs[k].value = a[k];
    for (const [k] of SELECTS) inputs[k].value = a[k];
    inputs.backpack.checked = !!a.backpack; writeFace(a);
    for (const [k] of TRAITS) inputs[k].value = a[k];
    for (const [k] of PERSONAL) inputs[k].value = a[k];
  };

  // live 3-D preview with a person-height reference grid
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(220, 300, false);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(35, 220 / 300, 0.1, 50);
  cam.position.set(0, 1.3, 6); cam.lookAt(0, 1.05, 0);
  scene.add(new THREE.HemisphereLight('#fff', '#667', 1.2));
  const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(2, 4, 4); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ref = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.75, 0.03), new THREE.MeshBasicMaterial({ color: '#ffd23f' })); // 175 cm marker
  ref.position.set(-0.9, 0.875, 0); scene.add(ref);
  let model = null;
  const rebuild = () => { if (model) scene.remove(model); model = buildAvatar(get()); scene.add(model); };
  let raf = 0, open = false;
  const loop = t => { if (!open) return; if (model) model.rotation.y = t / 1500; renderer.render(scene, cam); raf = requestAnimationFrame(loop); };

  const onInput = e => { set(read()); if (e && e.target === mode) writeFace(get()); rebuild(); };
  f.addEventListener('input', onInput); f.addEventListener('change', onInput);
  root.querySelector('#randomize').onclick = () => {
    const r = a => a[Math.floor(Math.random() * a.length)], col = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const a = { ...get(), hair: col(), shirt: col(), pants: col(), shoes: col(), accent: col(), skin: r(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']) };
    for (const [k] of SELECTS) a[k] = r(OPTIONS[k]);
    a.backpack = Math.random() < 0.3; set(a); write(); rebuild();
  };
  return {
    show() { write(); rebuild(); open = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
    hide() { open = false; stopCam(); },
    refresh() { write(); rebuild(); },
    showFace() { const a = { ...get(), faceMode: 'built' }; set(a); this.show(); head.scrollIntoView({ block: 'start' }); }
  };
}
