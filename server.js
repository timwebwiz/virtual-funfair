import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { World } from './npc.js';
import { OBSTACLES, blockedPoint } from './nav.js';
import { PAD } from './stockroom.js';
import { LANGS } from './culture.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url.startsWith('/three/')) file = path.join(root, 'node_modules/three', url.slice(7));
  else file = path.join(root, 'public', url === '/' ? 'index.html' : url);
  const allowed = [path.join(root, 'public'), path.join(root, 'node_modules/three')];
  if (!allowed.some(a => file.startsWith(a + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, maxPayload: 512 * 1024 });
const players = new Map(); // id -> {name, avatar, x, z, ry, ws}
let nextId = 1;
const world = new World(players, m => broadcast(m));
const crates = world.crates;
let lastNpcIds = '';

const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
const broadcast = (m, except) => wss.clients.forEach(c => c !== except && send(c, m));
const MOODS = ['neutral', 'happy', 'excited', 'sad', 'angry', 'tired', 'nervous'];
const EMOTES = ['wave', 'bow', 'namaste', 'handshake', 'cheer', 'dance', 'point', 'shrug', 'nod', 'stretch', 'belly'];
const trait = v => Math.round(Math.min(10, Math.max(1, Number(v) || 5)));
function cleanState(s) {
  s = s && typeof s === 'object' ? s : {};
  return { m: MOODS.includes(s.m) ? s.m : 'neutral', tr: Math.min(1, Math.max(0, Number(s.tr) || 0)), tp: ['cold', 'hot'].includes(s.tp) ? s.tp : '', pu: !!s.pu, sp: !!s.sp, st: Math.min(1, Math.max(0, Number(s.st) || 0)), lk: Math.min(1.2, Math.max(-1.2, Number(s.lk) || 0)), fc: FOCUS.includes(s.fc) ? s.fc : 'focused' };
}
const OPT = { hairStyle: ['short', 'long', 'bun', 'mohawk', 'bald'], shirtStyle: ['short', 'long', 'hoodie'], pantsStyle: ['long', 'shorts'], hat: ['none', 'cap', 'beanie', 'tophat'], glasses: ['none', 'round', 'shades'], culture: ['wave', 'bow', 'namaste', 'handshake', 'nod'], interest: ['thrill', 'food', 'games', 'relaxing'], lang: LANGS, formal: ['casual', 'formal'], space: ['normal', 'close', 'wide'] };
const DEVICES = ['keyboard', 'touch', 'gamepad'];
const FOCUS = ['focused', 'distracted', 'chatting', 'overloaded'];
const hex = v => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888');
function cleanAvatar(a) {
  a = a && typeof a === 'object' ? a : {};
  const o = {};
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'shoes', 'accent']) o[k] = hex(a[k]);
  for (const k in OPT) o[k] = OPT[k].includes(a[k]) ? a[k] : OPT[k][0];
  o.backpack = !!a.backpack;
  for (const k of ['strength', 'agility', 'endurance']) o[k] = trait(a[k]);
  o.mood = MOODS.includes(a.mood) ? a.mood : 'happy';
  o.level = Math.min(2, Math.max(0, Math.round(Number(a.level) || 0)));
  o.height = Math.min(210, Math.max(130, Number(a.height) || 175));
  o.build = Math.min(1.3, Math.max(0.8, Number(a.build) || 1));
  o.face = typeof a.face === 'string' && a.face.startsWith('data:image/') && a.face.length < 100000 ? a.face : null;
  return o;
}
const num = v => (Number.isFinite(v) ? Math.max(-200, Math.min(200, v)) : 0);

wss.on('connection', ws => {
  const id = nextId++;
  ws.id = id;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      const p = { id, name: String(m.name || 'Guest').slice(0, 20), avatar: cleanAvatar(m.avatar), dev: DEVICES.includes(m.dev) ? m.dev : 'keyboard', x: 0, z: 8, ry: 0 };
      players.set(id, p);
      send(ws, { t: 'welcome', id, players: [...players.values()].map(({ ws: _w, ...q }) => q), npcs: world.roster(), stations: world.stationList(), obstacles: OBSTACLES, crates: crates.snapshot(), pad: PAD });
      broadcast({ t: 'join', player: p }, ws);
    } else if (m.t === 'move' && players.has(id)) {
      const p = players.get(id);
      const nx = num(m.x), nz = num(m.z);
      if (!blockedPoint(nx, nz, 0.3)) { p.x = nx; p.z = nz; }
      p.ry = num(m.ry); p.s = cleanState(m.s);
      const y = Math.max(0, Math.min(8, Number(m.y) || 0));
      broadcast({ t: 'move', id, x: p.x, y, z: p.z, ry: p.ry, s: p.s }, ws);
    } else if (m.t === 'device' && players.has(id)) {
      if (DEVICES.includes(m.dev)) players.get(id).dev = m.dev;
    } else if (m.t === 'avatar' && players.has(id)) {
      const p = players.get(id);
      p.avatar = cleanAvatar(m.avatar);
      broadcast({ t: 'avatar', id, name: p.name, avatar: p.avatar }, ws);
    } else if (m.t === 'emote' && players.has(id) && EMOTES.includes(m.e)) {
      const p = players.get(id);
      p.emoteGreet = ['wave', 'bow', 'namaste', 'handshake', 'nod'].includes(m.e);
      broadcast({ t: 'emote', id, e: m.e }, ws);
    } else if (m.t === 'crate' && players.has(id)) {
      const c = crates.push(players.get(id), m.id, Number(m.x), Number(m.z));
      const cur = c || crates.get(m.id);
      if (cur && !cur.by) { if (c) broadcast({ t: 'crate', id: c.id, x: c.x, z: c.z }, ws); else send(ws, { t: 'crate', id: cur.id, x: cur.x, z: cur.z }); }
    } else if (m.t === 'grab' && players.has(id)) {
      const r = crates.grab(players.get(id));
      if (r.err) send(ws, { t: 'note', text: r.err }); else broadcast({ t: 'carry', id: r.crate.id, by: id, w: r.crate.w });
    } else if (m.t === 'drop' && players.has(id)) {
      const c = crates.drop(players.get(id));
      if (c) broadcast({ t: 'carry', id: c.id, by: null, x: c.x, z: c.z });
    } else if (m.t === 'act' && players.has(id) && ['shout', 'faint', 'hurt', 'critical', 'litter', 'maint'].includes(m.a)) {
      world.playerAction(players.get(id), m.a);
    } else if (m.t === 'chat' && players.has(id)) {
      broadcast({ t: 'chat', id, text: String(m.text).slice(0, 120) });
    }
  });
  ws.on('close', () => { const p = players.get(id), c = p && crates.drop(p); if (c) broadcast({ t: 'carry', id: c.id, by: null, x: c.x, z: c.z }); players.delete(id); broadcast({ t: 'leave', id }); });
});

setInterval(() => {
  world.update(0.1);
  const ids = world.npcs.map(n => n.id).join();
  if (ids !== lastNpcIds) { lastNpcIds = ids; broadcast({ t: 'roster', npcs: world.roster(), stations: world.stationList() }); }
  broadcast(world.snapshot());
}, 100);

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Virtual Funfair on http://localhost:${port}`));
