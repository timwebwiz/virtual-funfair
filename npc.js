// Server-authoritative NPC simulation: security, medics, visitors, ambulance.
import { findPath, isBlocked, STATIONS, HOSPITAL, HOSP_DOOR, AMB_BAY, DEPOT, front } from './nav.js';
import { maintMethods } from './maint.js';
const boothFront = i => { const a = i / 6 * Math.PI * 2; return [Math.cos(a) * 14, Math.sin(a) * 14]; };
const SPOTS = {
  wheel: [-30, -22], carousel: [30, -12], booth0: boothFront(0), booth1: boothFront(1), booth2: boothFront(2),
  booth3: boothFront(3), booth4: boothFront(4), booth5: boothFront(5), plaza: [0, 0], gate: [0, 30]
};
const SHELTER = [[30, -12], boothFront(0), boothFront(3)];
const PATROL = [[0, 12], [14, 8], [14, -10], [0, -14], [-14, -10], [-14, 8]];
const SPEED = { security: 3.2, medic: 3.6, visitor: 2.0, ambulance: 8, maintenance: 2.8 };
const NAMES = {
  visitor: ['Ava', 'Ben', 'Chloe', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivan', 'Jo', 'Kai', 'Lena', 'Max', 'Nia', 'Omar', 'Pia', 'Quin', 'Rae', 'Sam', 'Tara', 'Uma', 'Vic', 'Wes', 'Zoe'],
  security: ['Officer Reyes', 'Officer Kim', 'Officer Novak'],
  maintenance: ['Maint. Costa', 'Maint. Dubois', 'Maint. Ito', 'Maint. Mbeki', 'Maint. Petrov', 'Maint. Silva'],
  medic: ['Medic Okafor', 'Medic Lindqvist', 'Medic Haddad', 'Medic Tanaka']
};
const LOOKS = {
  security: { skin: '#c68863', hair: '#111111', shirt: '#1d3557', pants: '#0b132b', vest: '#ffd400' },
  maintenance: { skin: '#d9a07a', hair: '#2b2118', shirt: '#ff8c00', pants: '#3b4a5a', vest: '#c6ff00', hat: '#ffd400' },
  medic: { skin: '#e0ac8c', hair: '#5a3a1a', shirt: '#f8f9fa', pants: '#2a9d8f', vest: '#e63946' }
};
const POSTS = [[0, 26], [-26, -22], [26, -12]]; // gate, ferris wheel, carousel
const ZONES = [{ x: -30, z: -30, r: 6, name: 'ferris wheel machinery' }, { x: 30, z: -20, r: 8.5, name: 'carousel platform' }];
const inZone = p => ZONES.find(z => Math.hypot(p.x - z.x, p.z - z.z) < z.r);
const KIT = 6;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const randomLook = () => ({
  skin: pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
  hair: pick(['#222', '#4a3020', '#a0522d', '#d4a017', '#999']),
  shirt: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
  pants: pick(['#334155', '#1e3a5f', '#4b5563', '#6b4f3a'])
});

export class World {
  constructor(players, emit) {
    this.players = players; this.emit = emit; // emit(msg) broadcasts to everyone
    this.npcs = []; this.nextId = 1000;
    this.weather = 'clear'; this.weatherT = 45; this.clock = 9 * 60; // minutes
    this.alert = 0; this.incidents = []; // {x,z,by,t}
    this.spawn('security', 'supervisor'); this.spawn('security', 'guard'); this.spawn('security', 'guard'); this.spawn('security', 'guard');
    this.spawn('security', 'patrol'); this.spawn('security', 'patrol');
    this.wasNight = false; this.statusT = 60; this.lastAlert = 0;
    this.stations = STATIONS.map(st => ({ ...st, supplies: 12 }));
    this.stations.forEach((_, i) => this.spawn('medic', 'station', i)); this.spawn('medic', 'roamer');
    this.supplyT = 10; this.emsQueue = []; this.spawnAmbulance(); this.initMaintenance();
    for (let i = 0; i < 8; i++) this.spawn('visitor');
  }

  spawnAmbulance() {
    const n = { id: this.nextId++, role: 'ambulance', name: 'Ambulance 1', look: {}, x: AMB_BAY[0], z: AMB_BAY[1], ry: Math.PI / 2, state: 'idle', mode: 'idle', tx: 0, tz: 0, wait: 0, say: '', sayT: 0, cool: 0, siren: false, spd: 1 };
    this.npcs.push(n); return n;
  }
  alive(t) { return t.kind === 'p' ? this.players.has(t.e.id) : this.npcs.includes(t.e); }
  reached(n, e, r) { return dist(n, e) < r || (n.arrived && n.snapped); }

  spawn(role, duty, station) {
    const [x, z] = role === 'maintenance' ? front(DEPOT, 9) : SPOTS.gate;
    const n = {
      id: this.nextId++, role, name: duty === 'supervisor' ? 'Sgt. Alvarez' : role === 'medic' ? NAMES.medic[this.npcs.filter(o => o.role === 'medic').length % 4] : role === 'maintenance' ? NAMES.maintenance[(this.maintCount = (this.maintCount || 0) + 1) % 6] : pick(NAMES[role]),
      spd: rnd(0.85, 1.15), station, kit: KIT, duty, post: duty === 'guard' ? POSTS[this.npcs.filter(o => o.duty === 'guard').length % POSTS.length] : null, senseT: 0,
      look: duty === 'supervisor' ? { ...LOOKS.security, vest: '#ff6b00' } : LOOKS[role] || randomLook(), x: x + rnd(-4, 4), z: z + rnd(-2, 2), ry: 0,
      state: 'idle', tx: 0, tz: 0, wait: rnd(0, 3), target: null, down: false, say: '', sayT: 0, mood: 'happy', cool: 0, pi: Math.floor(Math.random() * PATROL.length)
    };
    this.npcs.push(n); return n;
  }

  openSpot() { // rides that are broken are closed to visitors
    const closed = k => this.rides && this.rides[k] && this.rides[k].state !== 'ok';
    return pick(Object.entries(SPOTS).filter(([k]) => !closed(k)).map(([, v]) => v));
  }
  speak(n, text) { if (n.sayT > 0) return; n.say = text; n.sayT = 4; }
  goTo(n, x, z) {
    x = Math.max(-72, Math.min(72, x)); z = Math.max(-72, Math.min(72, z));
    if (n.path && n.goalX !== undefined && Math.hypot(x - n.goalX, z - n.goalZ) < 1.2) return;
    const r = findPath(n.x, n.z, x, z, n.role === 'ambulance' ? 2.4 : 0.9);
    n.goalX = x; n.goalZ = z; n.path = r.path; n.wp = 0; n.snapped = r.snapped; n.arrived = false;
    n.tx = r.goal[0]; n.tz = r.goal[1];
    if (!r.path.length) n.arrived = true;
  }
  go(n, spot) { this.goTo(n, spot[0] + rnd(-2, 2), spot[1] + rnd(-2, 2)); }

  radio(from, text) { this.emit({ t: 'radio', from, text }); }
  place(x, z) {
    let best = 'the plaza', bd = 1e9;
    for (const [k, v] of Object.entries(SPOTS)) { const d = Math.hypot(v[0] - x, v[1] - z); if (d < bd) { bd = d; best = k.startsWith('booth') ? 'booth ' + (+k.slice(5) + 1) : k === 'gate' ? 'the main gate' : k === 'plaza' ? 'the plaza' : 'the ' + k; } }
    return best;
  }
  addIncident(i) { this.incidents.push({ units: [], t: 20, ...i }); }

  // security team picks the nearest free officer(s) for each open incident
  dispatch() {
    const secs = this.npcs.filter(n => n.role === 'security');
    for (const inc of this.incidents) {
      inc.units = inc.units.filter(u => this.npcs.includes(u));
      const need = inc.kind === 'hazard' ? (inc.major ? 2 : 1) : inc.kind === 'violation' ? 1 : inc.kind === 'medical' ? 1 + (this.alert >= 2 ? 1 : 0) : 1 + (this.alert >= 2 ? 1 : 0);
      while (inc.units.length < need) {
        const busy = u => this.incidents.some(o => o.units.includes(u));
        let free = secs.filter(u => !busy(u) && u.duty !== 'supervisor');
        if (!free.length) free = secs.filter(u => !busy(u));
        if (!free.length) break;
        free.sort((a, b) => dist(a, inc) - dist(b, inc));
        const u = free[0]; inc.units.push(u);
        const why = inc.kind === 'medical' ? 'medical scene' : inc.kind === 'violation' ? 'restricted-area violation' : inc.kind === 'hazard' ? 'ride fault, securing the area' : 'disturbance';
        this.radio(u.name, `Copy, responding to ${why} near ${this.place(inc.x, inc.z)}.`);
      }
    }
  }

  // ---- player actions ----
  playerAction(p, act) {
    if (act === 'litter' || act === 'maint') { this.maintAction(p, act); return; }
    if (act === 'shout') {
      this.addIncident({ kind: 'disturbance', x: p.x, z: p.z, by: p.id });
      this.alert = Math.min(3, this.alert + 1);
    } else if (act === 'faint' && !p.down) {
      p.down = true; p.hurt = false; p.sev = 'serious'; p.downT = 0; p.awaitEms = false; p.reported = true; this.emit({ t: 'down', id: p.id, v: true });
      this.radio('Dispatch', `Guest ${p.name} collapsed near ${this.place(p.x, p.z)}. Serious, medic needed!`);
    } else if (act === 'critical' && !p.down) {
      p.down = true; p.hurt = false; p.sev = 'critical'; p.cause = 'cardiac event'; p.downT = 0; p.awaitEms = false; p.reported = true; this.emit({ t: 'down', id: p.id, v: true });
      this.radio('Dispatch', `Guest ${p.name} in cardiac arrest near ${this.place(p.x, p.z)}! CRITICAL, medics and ambulance needed!`);
    } else if (act === 'hurt' && !p.down && !p.hurt) {
      p.hurt = true; p.sev = 'minor'; p.reported = true; this.emit({ t: 'hurt', id: p.id, v: true });
      this.radio('Dispatch', `Guest ${p.name} reports an injury near ${this.place(p.x, p.z)}. First aid requested.`);
    }
  }

  needsCare(e) { return !!(e.down || e.hurt); }
  patients() {
    const list = this.downed();
    for (const p of this.players.values()) if (p.hurt && !p.down) list.push({ kind: 'p', e: p });
    return list;
  }
  nearestStation(e) { return this.stations.slice().sort((a, b) => dist(a, e) - dist(b, e))[0]; }

  downed() {
    const list = [];
    for (const p of this.players.values()) if (p.down) list.push({ kind: 'p', e: p });
    for (const n of this.npcs) if (n.down) list.push({ kind: 'n', e: n });
    return list;
  }

  update(dt) {
    // time & weather
    this.clock = (this.clock + dt * 2) % 1440; // 1 real sec = 2 game min
    this.weatherT -= dt;
    if (this.weatherT <= 0) { this.weather = this.weather === 'clear' ? 'rain' : 'clear'; this.weatherT = rnd(40, 90); this.radio('Park Management', this.weather === 'rain' ? 'Rain moving in. Watch for slippery ground and keep guests sheltered.' : 'Rain has cleared. Resume normal patrols.'); }
    this.incidents = this.incidents.filter(i => {
      if (i.hold) return i.hold();
      if (i.ref) {
        const alive = i.ref.kind === 'p' ? this.players.has(i.ref.e.id) : this.npcs.includes(i.ref.e);
        if (alive && i.ref.e.down) { i.x = i.ref.e.x; i.z = i.ref.e.z; return true; }
        if (alive) this.radio(i.units[0] ? i.units[0].name : 'Dispatch', `Medical scene near ${this.place(i.x, i.z)} is clear.`);
        return false;
      }
      return (i.t -= dt) > 0;
    });
    this.dispatch();
    const night0 = this.clock < 6 * 60 || this.clock > 20 * 60;
    if (night0 !== this.wasNight) { this.wasNight = night0; this.radio('Park Management', night0 ? 'Night mode: reduced visibility, extra patrol on duty.' : 'Daylight operations resumed.'); }
    if (Math.floor(this.alert) > Math.floor(this.lastAlert)) this.radio('Sgt. Alvarez', `Alert level ${Math.floor(this.alert)}. All units stay sharp, backup is on the way.`);
    this.lastAlert = this.alert;
    this.statusT -= dt;
    if (this.statusT <= 0) { this.statusT = 60; this.radio('Sgt. Alvarez', `Status check: ${this.weather}, alert ${Math.floor(this.alert)}, ${this.players.size} guest(s) online. All units report in.`);
      const low = this.stations.filter(st => st.supplies <= 3); const m0 = this.npcs.find(n => n.role === 'medic');
      if (m0) this.radio(m0.name, `Medical status: ${this.stations.reduce((a, st) => a + st.supplies, 0)} supply units across ${this.stations.length} stations${low.length ? ', low at ' + low.map(l => l.name).join(', ') : ''}.`); }
    if (!this.incidents.length) this.alert = Math.max(0, this.alert - dt * 0.05);

    // crowd scales with players
    const want = Math.min(26, 8 + this.players.size * 3);
    const visitors = this.npcs.filter(n => n.role === 'visitor');
    if (visitors.length < want) this.spawn('visitor');
    else if (visitors.length > want + 2) { const i = this.npcs.indexOf(visitors[visitors.length - 1]); if (!visitors[visitors.length - 1].down) this.npcs.splice(i, 1); }
    const secWant = 6 + Math.floor(this.alert) + (this.clock < 360 || this.clock > 1200 ? 1 : 0);
    const secs = this.npcs.filter(n => n.role === 'security');
    if (secs.length < secWant) this.spawn('security', 'patrol');
    else if (secs.length > secWant) {
      const x = secs.reverse().find(u => u.duty === 'patrol' && !this.incidents.some(i => i.units.includes(u)));
      if (x) this.npcs.splice(this.npcs.indexOf(x), 1);
    }

    // rare random faint among visitors (more in heat of day)
    const hot = this.weather === 'clear' && this.clock > 11 * 60 && this.clock < 17 * 60;
    const rate = 0.01 * (hot ? 2 : 1) * (this.weather === 'rain' ? 1.6 : 1);
    if (Math.random() < dt * rate && visitors.length) {
      const v = pick(visitors);
      if (!v.down && v.state !== 'shelter') {
        v.down = true; v.state = 'down'; v.say = ''; v.reported = false; v.downT = 0; v.awaitEms = false;
        const roll = Math.random(); v.sev = roll < 0.08 ? 'critical' : roll < 0.4 ? 'serious' : 'minor';
        v.cause = v.sev === 'critical' ? 'cardiac arrest' : v.sev === 'serious' ? (hot ? 'heat stroke' : 'collapse') : (this.weather === 'rain' ? 'slip' : 'sprain');
      }
    }
    this.maintWorld(dt, visitors);
    // management resupplies stations
    this.supplyT -= dt;
    if (this.supplyT <= 0) { this.supplyT = 10; this.stations.forEach(st => { if (st.supplies < 12) st.supplies++; }); }

    const downed = this.downed();
    for (const d of downed) { // untreated serious cases deteriorate
      const e = d.e; e.downT = (e.downT || 0) + dt;
      if (e.sev === 'serious' && e.downT > 35 && !e.awaitEms) { e.sev = 'critical'; e.cause = e.cause || 'deteriorating condition'; this.radio('Dispatch', `Patient near ${this.place(e.x, e.z)} is deteriorating, upgraded to CRITICAL.`); }
    }
    const night = this.clock < 6 * 60 || this.clock > 20 * 60;
    for (const n of this.npcs) {
      n.sayT = Math.max(0, n.sayT - dt); if (!n.sayT) n.say = '';
      n.cool = Math.max(0, n.cool - dt);
      if (n.down) continue;
      if (n.role === 'ambulance') this.ambulance(n, dt);
      else if (n.role === 'medic') this.medic(n, dt);
      else if (n.role === 'security') this.security(n, dt);
      else if (n.role === 'maintenance') this.maintenance(n, dt);
      else this.visitor(n, dt, downed, night);
      this.move(n, dt);
    }
    // gate: keep players/NPCs in bounds
    this.npcs.forEach(n => { n.x = Math.max(-72, Math.min(72, n.x)); n.z = Math.max(-72, Math.min(72, n.z)); });
    this.separate(dt);
    for (const p of this.players.values()) if (p.hospUntil && Date.now() > p.hospUntil) {
      p.hospUntil = 0; p.x = 0; p.z = 26;
      this.emit({ t: 'tp', id: p.id, x: 0, z: 26, lock: 0, text: 'You were discharged from Park Hospital. Take it easy!' });
      this.radio(HOSPITAL.name, `${p.name} has been discharged.`);
    }
  }

  move(n, dt) {
    if (['idle', 'talk', 'treat', 'watch', 'load', 'attend', 'work'].includes(n.state)) return;
    let gx = n.tx, gz = n.tz, last = true;
    if (n.path && n.wp < n.path.length) { [gx, gz] = n.path[n.wp]; last = n.wp === n.path.length - 1; }
    const dx = gx - n.x, dz = gz - n.z, d = Math.hypot(dx, dz);
    if (d < (last ? 0.4 : 0.6)) { if (last) n.arrived = true; else n.wp++; return; }
    n.arrived = false;
    const run = (n.state === 'respond' || n.state === 'flee') ? 1.6 : 1;
    const s = SPEED[n.role] * (n.spd || 1) * run * dt;
    n.x += dx / d * Math.min(s, d); n.z += dz / d * Math.min(s, d);
    // turn smoothly towards heading
    const want = Math.atan2(dx, dz), diff = ((want - n.ry + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    n.ry += diff * Math.min(1, dt * 8);
  }

  // soft personal space between NPCs so crowds don't overlap
  separate(dt) {
    const list = this.npcs.filter(n => !n.down && n.role !== 'ambulance');
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], d = dist(a, b);
      if (d >= 0.8 || d < 0.001) continue;
      const push = (0.8 - d) * 0.5 * Math.min(1, dt * 6), ux = (a.x - b.x) / d, uz = (a.z - b.z) / d;
      if (!isBlocked(a.x + ux * push, a.z + uz * push)) { a.x += ux * push; a.z += uz * push; }
      if (!isBlocked(b.x - ux * push, b.z - uz * push)) { b.x -= ux * push; b.z -= uz * push; }
    }
  }

  face(n, t) { n.ry = Math.atan2(t.x - n.x, t.z - n.z); }

  medicRange() { return this.clock < 360 || this.clock > 1200 ? 12 : this.weather === 'rain' ? 14 : 20; }
  cost(e) { return e.sev === 'critical' ? 3 : e.sev === 'serious' ? 2 : 1; }
  rank(e) { return e.sev === 'critical' ? 2 : e.sev === 'serious' ? 1 : 0; }

  medic(n, dt) {
    const home = n.station != null ? this.stations[n.station] : null;
    const cur = n.target;
    if (cur && (!this.needsCare(cur.e) || !this.alive(cur))) { n.target = null; if (['treat', 'respond', 'attend'].includes(n.state)) n.state = 'idle'; } // helped by someone else, or handed over to EMS
    if (n.state === 'attend' && n.target) { this.face(n, n.target.e); return; } // stays with a stabilised patient until the ambulance arrives

    if (n.state === 'treat' && n.target) {
      n.wait -= dt;
      if (n.wait <= 0) {
        const t = n.target, e = t.e, serious = e.sev === 'serious';
        n.kit -= this.cost(e);
        if (e.sev === 'critical') {
          if (!e.awaitEms) {
            e.awaitEms = true; this.emsQueue.push(t);
            this.radio(n.name, `Patient near ${this.place(e.x, e.z)} stabilised but critical${e.cause ? ' (' + e.cause + ')' : ''}. Requesting ambulance and hospital transport!`);
            this.radio('Dispatch', `Ambulance 1, respond to ${this.place(e.x, e.z)}. Priority one.`);
          }
          this.speak(n, 'The ambulance is on its way, stay with me.'); n.state = 'attend'; n.wait = 0; return;
        }
        if (t.kind === 'p') {
          if (e.down) this.emit({ t: 'down', id: e.id, v: false });
          if (e.hurt) this.emit({ t: 'hurt', id: e.id, v: false });
          e.down = false; e.hurt = false; e.reported = false; e.sev = null; e.downT = 0;
        } else { e.down = false; e.reported = false; e.downT = 0; e.state = 'idle'; e.wait = 2; this.speak(e, 'Thanks, doc!'); }
        this.speak(n, serious ? 'Vitals stable. Take it slow.' : 'All patched up!');
        this.radio(n.name, `Patient near ${this.place(e.x, e.z)} treated${e.cause ? ' (' + e.cause + ')' : ''}${serious ? ', stable, advise rest' : ''}. Kit ${n.kit}/${KIT}.`);
        n.state = 'idle'; n.target = null; n.wait = 1;
      }
      return;
    }
    if (n.state === 'restock') {
      const st = home || this.nearestStation(n);
      const [fx, fz] = front(st); this.goTo(n, fx, fz);
      if (n.arrived || dist(n, { x: fx, z: fz }) < 0.6) {
        n.wait -= dt;
        if (n.wait <= 0) {
          const take = Math.min(KIT - n.kit, st.supplies); n.kit += take; st.supplies -= take;
          this.radio(n.name, take ? `Restocked at ${st.name}. Kit ${n.kit}/${KIT}, station supplies ${st.supplies}.` : `${st.name} is out of supplies, requesting resupply.`);
          n.state = 'idle'; n.wait = take ? 0 : 6;
        }
      } else n.wait = 3;
      return;
    }

    // detection: self-observed (range depends on conditions) or reported by security/guests/players
    const range = this.medicRange();
    const patients = this.patients().filter(d => d.e.reported || dist(n, d.e) < range);
    const claims = new Map();
    this.npcs.forEach(m => { if (m.role === 'medic' && m !== n && m.target) claims.set(m.target.e, (claims.get(m.target.e) || 0) + 1); });
    const open = patients.filter(d => this.needsCare(d.e) && !d.e.awaitEms && (claims.get(d.e) || 0) < (this.rank(d.e) ? 2 : 1));
    // triage: serious first, then by distance
    open.sort((a, b) => (this.rank(b.e) - this.rank(a.e)) || dist(n, a.e) - dist(n, b.e));
    if (open.length && n.kit >= this.cost(open[0].e)) {
      const t = open[0];
      if (!n.target || n.target.e !== t.e) {
        const backup = (claims.get(t.e) || 0) > 0;
        this.radio(n.name, backup ? `Backing up at ${this.place(t.e.x, t.e.z)}.` : `${this.rank(t.e) ? 'Code red: ' : ''}Medic en route to ${this.place(t.e.x, t.e.z)}${t.e.cause ? ' (' + t.e.cause + ')' : ''}.`);
        if (this.rank(t.e) && !backup) this.radio(n.name, 'Requesting second medic.');
      }
      n.target = t; n.state = 'respond'; this.goTo(n, t.e.x + 0.6, t.e.z + 0.6);
      if (this.reached(n, t.e, 1.4)) { n.state = 'treat'; n.wait = t.e.sev === 'critical' ? 6 : t.e.sev === 'serious' ? 5 : 2.5; this.face(n, t.e); this.speak(n, this.rank(t.e) ? 'Stay with me, helping now.' : 'Let me look at that.'); }
      return;
    }
    if (open.length && n.kit < this.cost(open[0].e)) { n.state = 'restock'; n.wait = 3; this.radio(n.name, 'Kit low, restocking.'); return; }
    n.target = null;
    if (n.state === 'respond') { n.state = 'idle'; n.wait = 0; }
    if (n.kit < 3 && n.state !== 'restock') { n.state = 'restock'; n.wait = 3; return; }

    // idle duty: station medics return to post and keep watch, roamer visits each station
    if (n.duty === 'station') {
      const [px, pz] = front(home);
      if (dist(n, { x: px, z: pz }) > 1) { n.state = 'walk'; this.goTo(n, px, pz); }
      else { n.state = 'idle'; n.ry += dt * 0.4; if (n.cool <= 0 && Math.random() < dt * 0.08) { this.speak(n, pick(['First aid is here if you need it.', this.weather === 'rain' ? 'Careful, wet ground!' : 'Drink some water!'])); n.cool = 12; } }
      return;
    }
    n.wait -= dt;
    if (n.state === 'walk' && !n.arrived) return;
    if (n.wait <= 0) { n.state = 'walk'; n.arrived = false; const st = this.stations[n.pi = (n.pi + 1) % this.stations.length]; const [fx, fz] = front(st); this.goTo(n, fx + rnd(-2, 2), fz + rnd(-2, 2)); n.wait = rnd(4, 8); }
    else n.state = 'idle';
  }

  // ---- ambulance & hospital escalation ----
  ambulance(n, dt) {
    n.siren = false;
    if (n.mode === 'idle') {
      n.state = 'idle';
      while (this.emsQueue.length && (!this.alive(this.emsQueue[0]) || !this.emsQueue[0].e.down)) this.emsQueue.shift();
      const call = this.emsQueue.shift(); if (!call) return;
      n.call = call; n.mode = 'go';
      this.radio(n.name, `En route to ${this.place(call.e.x, call.e.z)}, lights and sirens.`);
    }
    const c = n.call;
    if (n.mode === 'go') {
      if (!this.alive(c) || !c.e.down) { this.radio(n.name, 'Call cancelled, returning to base.'); n.mode = 'return'; return; }
      n.siren = true; n.state = 'drive'; this.goTo(n, c.e.x, c.e.z);
      if (this.reached(n, c.e, 5)) { n.mode = 'load'; n.state = 'load'; n.wait = 5; this.speak(n, 'Paramedics on scene.'); this.radio(n.name, 'On scene. Loading patient.'); }
    } else if (n.mode === 'load') {
      n.siren = true; n.wait -= dt;
      if (n.wait <= 0) { if (this.alive(c)) this.admit(c); this.radio(n.name, `Patient on board, transporting to ${HOSPITAL.name}.`); n.mode = 'hospital'; }
    } else if (n.mode === 'hospital') {
      n.siren = true; n.state = 'drive'; this.goTo(n, HOSP_DOOR[0], HOSP_DOOR[1]);
      if (n.arrived) { this.radio(HOSPITAL.name, 'Patient received by the emergency team. Thank you, Ambulance 1.'); n.call = null; n.mode = 'return'; }
    } else if (n.mode === 'return') {
      n.state = 'drive'; this.goTo(n, AMB_BAY[0], AMB_BAY[1]);
      if (n.arrived) { n.mode = 'idle'; n.state = 'idle'; n.ry = Math.PI / 2; }
    }
  }

  admit(call) {
    const e = call.e;
    e.down = false; e.hurt = false; e.awaitEms = false; e.reported = false; e.sev = null; e.downT = 0;
    if (call.kind === 'p') {
      e.hospUntil = Date.now() + 12000; e.x = HOSP_DOOR[0]; e.z = HOSP_DOOR[1];
      this.emit({ t: 'down', id: e.id, v: false });
      this.emit({ t: 'tp', id: e.id, x: e.x, z: e.z, lock: 12000, text: 'You were taken to Park Hospital by ambulance. Recovering...' });
    } else this.npcs.splice(this.npcs.indexOf(e), 1); // admitted visitor leaves the park scene
  }

  // situational awareness: officers scan nearby (range shrinks at night / in rain) and radio what they see
  sense(n, dt) {
    n.senseT -= dt; if (n.senseT > 0) return; n.senseT = 0.5;
    const night = this.clock < 360 || this.clock > 1200;
    const range = night ? 10 : this.weather === 'rain' ? 12 : 16;
    for (const d of this.downed()) {
      if (dist(n, d.e) > range || this.incidents.some(i => i.ref && i.ref.e === d.e)) continue;
      this.addIncident({ kind: 'medical', ref: d, x: d.e.x, z: d.e.z }); d.e.reported = true;
      this.radio(n.name, `Person down near ${this.place(d.e.x, d.e.z)}. Medic needed!`);
    }
    for (const p of this.players.values()) {
      if (p.down || dist(n, p) > range || (p.immune || 0) > Date.now()) continue;
      const z = inZone(p);
      if (z && !this.incidents.some(i => i.kind === 'violation' && i.by === p.id)) {
        this.addIncident({ kind: 'violation', by: p.id, x: p.x, z: p.z, zone: z.name, t: Infinity });
        this.radio(n.name, `${p.name} is in the ${z.name}, restricted area.`);
      }
    }
  }

  handleIncident(n, inc, dt) {
    const p = inc.by ? this.players.get(inc.by) : null;
    if (inc.by && !p) { inc.t = 0; return; }
    if (p) { inc.x = p.x; inc.z = p.z; }
    const primary = inc.units[0] === n;
    if (inc.kind === 'medical') {
      // primary secures the patient, backup keeps the crowd back
      this.goTo(n, inc.x + (primary ? -1.5 : 3), inc.z + (primary ? 0 : 3));
      n.state = n.arrived ? 'watch' : 'respond';
      if (n.arrived && n.cool <= 0) { this.face(n, inc); this.speak(n, primary ? 'Medic is coming, hang in there!' : 'Please give them room.'); n.cool = 8; }
      return;
    }
    if (inc.kind === 'hazard') { // cordon: stand off the ride and keep guests back
      const a = inc.units.indexOf(n) * Math.PI;
      this.goTo(n, inc.x + Math.cos(a) * 3, inc.z + 3 + Math.sin(a) * 3);
      if (!this.reached(n, { x: n.goalX, z: n.goalZ }, 1.5)) { n.state = 'respond'; return; }
      n.state = 'watch'; this.face(n, inc);
      if (n.cool <= 0) { this.speak(n, inc.major ? 'Move away from the ride, now!' : 'Ride closed for maintenance, please stay back.'); n.cool = 8; }
      return;
    }
    this.goTo(n, inc.x, inc.z);
    if (!this.reached(n, inc, 2.5)) { n.state = 'respond'; return; }
    n.state = 'watch'; this.face(n, inc);
    if (n.cool > 0) return;
    if (inc.kind === 'violation') {
      if (!inZone(p)) { inc.t = 0; this.radio(n.name, `${p.name} has left the restricted area. Resolved.`); p.warns = 0; return; }
      p.warns = (p.warns || 0) + 1; n.cool = 4;
      if (p.warns >= 3) {
        p.x = 0; p.z = 26; p.warns = 0; p.immune = Date.now() + 15000; inc.t = 0;
        this.emit({ t: 'tp', id: p.id, x: 0, z: 26, text: 'Security escorted you out of a restricted area.' });
        this.radio(n.name, `Escorted ${p.name} to the main gate. Rules reminder given.`);
      } else this.speak(n, `Sir/ma'am, please leave the ${inc.zone}. Warning ${p.warns}/3.`);
    } else { // disturbance
      this.speak(n, pick(['Please keep it down, folks.', 'Let\'s all stay calm.', 'No disturbances in the park, please.'])); n.cool = 6;
      inc.t = Math.min(inc.t, 4); inc.settled = true;
      if (inc.units[0] === n) this.radio(n.name, `Disturbance near ${this.place(inc.x, inc.z)} under control.`);
    }
  }

  security(n, dt) {
    this.sense(n, dt);
    const inc = this.incidents.find(i => i.units.includes(n));
    if (inc) { this.handleIncident(n, inc, dt); return; }
    if (n.state === 'respond' || n.state === 'watch') { n.state = 'idle'; n.arrived = false; }

    if (n.duty === 'supervisor') { // command post: stays central, steps toward the hottest incident when alert is high
      const hot = this.alert >= 2 && this.incidents[0];
      if (hot) { n.state = 'walk'; this.goTo(n, hot.x + 5, hot.z + 5); }
      else { n.state = 'walk'; if (!n.tx && !n.tz || n.arrived) { this.goTo(n, rnd(-4, 4), rnd(-4, 4)); n.state = 'idle'; n.wait = rnd(3, 6); } }
      if (n.state === 'idle') { n.wait -= dt; if (n.wait <= 0) n.state = 'walk'; }
      return;
    }
    if (n.duty === 'guard') { // fixed post, scans the area
      this.goTo(n, n.post[0], n.post[1]);
      if (n.arrived) { n.state = 'idle'; n.ry += dt * 0.6; if (n.cool <= 0 && Math.random() < dt * 0.1) { this.speak(n, this.weather === 'rain' ? 'Stay dry, everyone.' : 'Welcome to the park!'); n.cool = 12; } }
      else n.state = 'walk';
      return;
    }
    // patrol loop; reverse direction at night for fresh coverage
    n.state = 'walk';
    if (n.arrived || (!n.tx && !n.tz)) {
      n.pi = (n.pi + 1) % PATROL.length; this.go(n, PATROL[n.pi]);
      if (Math.random() < 0.3) this.speak(n, pick(['All clear.', 'Enjoy your day!', this.weather === 'rain' ? 'Watch your step, it\'s slippery.' : 'Stay hydrated!']));
    }
  }

  visitor(n, dt, downed, night) {
    // rain -> seek shelter
    if (this.weather === 'rain' && n.state !== 'shelter') {
      n.state = 'shelter'; this.go(n, pick(SHELTER)); this.speak(n, 'It\'s raining, run!'); return;
    }
    if (n.state === 'shelter') {
      if (this.weather === 'clear') { n.state = 'idle'; n.wait = rnd(1, 3); this.speak(n, 'Rain\'s gone!'); }
      return;
    }
    // react to someone down nearby
    const near = downed.find(d => d.e !== n && dist(n, d.e) < 12);
    if (near) {
      if (n.state !== 'watch') { n.state = 'watch'; this.goTo(n, near.e.x + rnd(-3, 3), near.e.z + rnd(3, 5)); }
      if (n.arrived || dist(n, near.e) < 7) { n.state = 'watch'; this.face(n, near.e); if (!near.e.reported) { near.e.reported = true; this.radio('Guest ' + n.name, `Person down near ${this.place(near.e.x, near.e.z)}!`); } this.speak(n, pick(['Someone call a medic!', 'Are they OK?', 'Help is on the way.'])); }
      return;
    }
    // react to loud incident: gawk or flee
    const inc = this.incidents.find(i => (i.kind === 'disturbance' || (i.kind === 'hazard' && i.major)) && dist(n, i) < 10);
    if (inc && n.state !== 'flee') {
      if (inc.kind === 'hazard' || n.mood === 'nervous' || Math.random() < 0.3) {
        n.state = 'flee'; this.goTo(n, n.x + (n.x - inc.x) * 2, n.z + (n.z - inc.z) * 2); this.speak(n, 'Whoa, let\'s get away!'); n.wait = 4; return;
      }
    }
    if (n.state === 'flee') { n.wait -= dt; if (n.wait <= 0 || n.arrived) { n.state = 'idle'; n.wait = 2; } return; }
    if (n.state === 'watch') n.state = 'idle';

    // greet nearby players
    for (const p of this.players.values()) {
      if (!p.down && dist(n, p) < 4 && n.cool <= 0) {
        this.speak(n, pick([`Hi ${p.name}!`, 'Great park, right?', night ? 'The lights are beautiful tonight!' : 'Have you tried the carousel?'])); n.cool = 15;
        n.state = 'talk'; n.wait = 3; this.face(n, p); return;
      }
    }
    // chat with other visitors
    if (n.state === 'walk' && n.cool <= 0) {
      const buddy = this.npcs.find(o => o !== n && o.role === 'visitor' && !o.down && o.state === 'walk' && dist(n, o) < 2.5);
      if (buddy) {
        n.state = buddy.state = 'talk'; n.wait = buddy.wait = rnd(3, 5); this.face(n, buddy); this.face(buddy, n);
        this.speak(n, pick(['Nice day!', 'Seen the ferris wheel?', 'I\'m starving.'])); this.speak(buddy, pick(['Same here!', 'Let\'s go together.', 'Haha, true.'])); n.cool = buddy.cool = 20; return;
      }
    }
    n.wait -= dt;
    if (n.state === 'talk' || n.state === 'idle') {
      if (n.wait <= 0) { n.state = 'walk'; this.go(n, this.openSpot()); }
    } else if (n.state === 'walk' && n.arrived) { n.state = 'idle'; n.wait = rnd(3, 8); }
    else if (n.state === 'walk' && !n.tx && !n.tz) this.go(n, this.openSpot());
    if (Math.random() < dt * 0.002) n.mood = n.mood === 'happy' ? 'nervous' : 'happy';
  }

  snapshot() {
    return {
      t: 'npcs', ...this.maintSnapshot(), w: this.weather, c: Math.round(this.clock), a: Math.round(this.alert * 10) / 10,
      n: this.npcs.map(n => ({ id: n.id, x: +n.x.toFixed(2), z: +n.z.toFixed(2), r: +n.ry.toFixed(2), d: n.down ? 1 : 0, s: n.say, e: n.siren ? 1 : 0, m: n.state === 'walk' || n.state === 'drive' || (n.state === 'dump') || n.state === 'respond' || n.state === 'flee' || n.state === 'shelter' ? 1 : 0 }))
    };
  }
  roster() { return this.npcs.map(n => ({ id: n.id, role: n.role, name: n.name, look: n.look })); }
  stationList() { return STATIONS; }
}
Object.assign(World.prototype, maintMethods);
