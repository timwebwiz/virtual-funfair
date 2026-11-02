// Maintenance crew: cleaners and technicians. Mixed into World.prototype (see npc.js).
import { DEPOT, front } from './nav.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const BAG = 5;
const MAX_LITTER = 60;
const PRIORITY = { rideMajor: 4, rideMinor: 3, call: 3, spill: 3, litter: 1 };

export const RIDE_DEFS = {
  wheel: { name: 'ferris wheel', x: -30, z: -22 },
  carousel: { name: 'carousel', x: 30, z: -12 }
};

export const maintMethods = {
  initMaintenance() {
    this.litter = []; this.nextLitter = 1;
    this.rides = Object.fromEntries(Object.entries(RIDE_DEFS).map(([k, d]) => [k, { key: k, ...d, state: 'ok', major: false, wear: 0 }]));
    this.cleanT = 0; this.maintStatusT = 45;
    this.spawn('maintenance', 'technician'); this.spawn('maintenance', 'technician');
    this.spawn('maintenance', 'cleaner'); this.spawn('maintenance', 'cleaner');
  },

  dropLitter(x, z, type = 0) {
    if (this.litter.length >= MAX_LITTER) return null;
    const it = { id: this.nextLitter++, x, z, type, hue: Math.floor(rnd(0, 360)), seen: false };
    this.litter.push(it); return it;
  },

  cleanliness() {
    const l = this.litter.filter(i => i.type === 0).length, s = this.litter.length - l;
    return Math.max(0, Math.round(100 - l * 2 - s * 5));
  },

  maintAction(p, act) {
    if (act === 'litter') {
      if ((p.litterT || 0) > Date.now()) return;
      p.litterT = Date.now() + 2000; this.dropLitter(p.x, p.z);
    } else if (act === 'maint' && !p.maintCall) {
      p.maintCall = true;
      this.radio('Dispatch', `Guest ${p.name} requests maintenance near ${this.place(p.x, p.z)}.`);
    }
  },

  // random wear, spills, litter, slipping, ride faults
  maintWorld(dt, visitors) {
    const rain = this.weather === 'rain';
    this.rideCrowd = visitors;
    if (this.litter.length < MAX_LITTER && visitors.length) {
      const v = pick(visitors);
      if (v.state === 'walk' && !v.down && Math.random() < dt * (rain ? 0.05 : 0.12)) this.dropLitter(v.x, v.z, 0);
      if (Math.random() < dt * (rain ? 0.06 : 0.015)) this.dropLitter(v.x + rnd(-1, 1), v.z + rnd(-1, 1), 1); // puddles/spills
    }
    // players slip on spills (minor injury); the medic system handles the rest
    for (const p of this.players.values()) {
      if (p.down || p.hurt || p.hospUntil) continue;
      const s = this.litter.find(i => i.type === 1 && !i.slipped && Math.hypot(i.x - p.x, i.z - p.z) < 0.9);
      if (s) {
        p.hurt = true; p.sev = 'minor'; p.cause = 'slip'; p.reported = true; p.downT = 0;
        this.emit({ t: 'hurt', id: p.id, v: true });
        this.radio('Dispatch', `Guest ${p.name} slipped on a spill near ${this.place(p.x, p.z)}. First aid and cleanup needed.`);
        s.seen = true; s.slipped = true;
      }
    }
    // ride faults: more likely with crowds nearby and when nobody is servicing
    for (const r of Object.values(this.rides)) {
      if (r.state !== 'ok') continue;
      const crowd = this.npcs.filter(n => n.role === 'visitor' && dist(n, r) < 14).length;
      if (Math.random() < dt * (0.002 + crowd * 0.0008)) {
        r.state = 'fault'; r.major = Math.random() < 0.3; r.fixT = 0;
        this.radio('Ride Control', `${r.major ? 'MAJOR FAULT' : 'Fault'} on the ${r.name}${r.major ? ', smoke detected. Evacuate the area!' : '. Ride stopped.'}`);
        this.addIncident({ kind: 'hazard', major: r.major, x: r.x, z: r.z, ref: null, hold: () => r.state === 'fault', t: Infinity, ride: r });
      }
    }
    // staffing adapts to how messy the park is
    const mess = this.litter.length + this.litter.filter(i => i.type === 1).length * 2;
    const want = 2 + (mess > 20 ? 1 : 0) + (mess > 40 ? 1 : 0);
    const cleaners = this.npcs.filter(n => n.duty === 'cleaner');
    if (cleaners.length < want) this.spawn('maintenance', 'cleaner');
    else if (cleaners.length > want) {
      const x = cleaners.reverse().find(c => !c.task && c.state !== 'work' && !c.haulId);
      if (x) this.npcs.splice(this.npcs.indexOf(x), 1);
    }
    this.cleanT -= dt;
    if (this.cleanT <= 0) { this.cleanT = 0.5; this.clean = this.cleanliness(); }
    this.maintStatusT -= dt;
    if (this.maintStatusT <= 0) {
      this.maintStatusT = 60;
      const m = this.npcs.find(n => n.duty === 'technician');
      if (m) this.radio(m.name, `Maintenance status: cleanliness ${this.cleanliness()}%, ${this.litter.length} item(s) outstanding, rides ${Object.values(this.rides).map(r => r.name + ' ' + (r.state === 'ok' ? 'OK' : 'FAULT')).join(', ')}.`);
    }
  },

  workRange() { return this.clock < 360 || this.clock > 1200 ? 12 : this.weather === 'rain' ? 14 : 20; },

  maintenance(n, dt) {
    const home = front(DEPOT, 9);
    n.bag = n.bag || 0;
    const isTech = n.duty === 'technician';
    if ((n.state === 'fetch' || n.state === 'haul') && this.haulStep(n)) return;
    const cur = n.task;
    const stillNeeded = t => !t ? false
      : t.type === 'ride' ? t.e.state === 'fault'
      : t.type === 'call' ? t.e.maintCall && this.players.has(t.e.id)
      : this.litter.includes(t.e);
    if (cur && !stillNeeded(cur)) { n.task = null; if (n.state === 'work' || n.state === 'respond') n.state = 'idle'; }

    if (n.state === 'work' && n.task) {
      n.wait -= dt; this.face(n, n.task.e);
      if (n.wait <= 0) this.finishTask(n);
      return;
    }
    if (n.state === 'dump') {
      this.goTo(n, home[0], home[1]);
      if (n.arrived) {
        n.wait = (n.wait || 2) - dt;
        if (n.wait <= 0) { this.radio(n.name, `Emptied ${n.bag} bag(s) at the ${DEPOT.name}.`); n.bag = 0; n.state = 'idle'; n.wait = 0; }
      } else n.wait = 2;
      return;
    }

    // detect tasks: rides are monitored remotely; litter and calls need line of sight or a report
    const range = this.workRange();
    const tasks = [];
    if (isTech) for (const r of Object.values(this.rides)) if (r.state === 'fault') tasks.push({ type: 'ride', e: r, x: r.x, z: r.z, pr: r.major ? PRIORITY.rideMajor : PRIORITY.rideMinor });
    for (const p of this.players.values()) if (p.maintCall && !p.down) tasks.push({ type: 'call', e: p, x: p.x, z: p.z, pr: PRIORITY.call });
    for (const it of this.litter) {
      if (isTech && it.type === 0) continue; // technicians handle spills (safety) but not litter
      if (!(it.seen || dist(n, it) < range)) continue;
      tasks.push({ type: it.type === 1 ? 'spill' : 'litter', e: it, x: it.x, z: it.z, pr: it.type === 1 ? PRIORITY.spill : PRIORITY.litter });
    }
    const claims = new Map();
    this.npcs.forEach(m => { if (m.role === 'maintenance' && m !== n && m.task) claims.set(m.task.e, (claims.get(m.task.e) || 0) + 1); });
    const open = tasks.filter(t => (claims.get(t.e) || 0) < (t.type === 'ride' && t.e.major ? 2 : 1));
    open.sort((a, b) => (b.pr - a.pr) || dist(n, a) - dist(n, b));

    const mine = n.task && open.find(x => x.e === n.task.e);
    const t = mine && !(open[0].pr > mine.pr) ? mine : open[0];
    if (t && !isTech && n.bag >= BAG && t.type !== 'call') { n.state = 'dump'; n.wait = 2; this.radio(n.name, 'Bag full, heading to the depot.'); return; }
    if (t) {
      if (!n.task || n.task.e !== t.e) {
        n.task = t;
        const backup = (claims.get(t.e) || 0) > 0;
        if (t.type === 'ride') this.radio(n.name, backup ? `Backing up on the ${t.e.name}.` : `On my way to the ${t.e.name}${t.e.major ? ', code red' : ''}.`);
        else if (t.type === 'call') this.radio(n.name, `Heading to guest ${t.e.name} near ${this.place(t.x, t.z)}.`);
        else if (t.type === 'spill') this.radio(n.name, `Spill near ${this.place(t.x, t.z)}, cleaning it up.`);
      }
      n.state = 'respond';
      const [gx, gz] = t.type === 'ride' ? [t.e.x, t.e.z] : [t.x, t.z];
      this.goTo(n, gx, gz);
      if (this.reached(n, { x: gx, z: gz }, t.type === 'ride' ? 3 : 1.2)) {
        n.state = 'work';
        const helpers = (claims.get(t.e) || 0) + 1;
        n.wait = t.type === 'ride' ? (t.e.major ? 14 : 7) / helpers : t.type === 'spill' ? 3 : t.type === 'call' ? 3 : 1.5;
        if (t.type === 'call') { this.face(n, t.e); this.speak(n, `Hi ${t.e.name}, how can I help?`); }
        else if (t.type === 'ride') this.speak(n, 'Inspecting the fault.');
      }
      return;
    }
    n.task = null;
    if (n.state === 'respond') { n.state = 'idle'; n.wait = 0; }
    if (!isTech && n.bag < BAG && n.wait <= 0 && this.findStray(n)) return;
    if (!isTech && n.bag >= 3 && n.state !== 'dump') { n.state = 'dump'; n.wait = 2; return; }

    // routine: technicians inspect rides (rest at the depot at night), cleaners sweep the walkways
    n.wait -= dt;
    if (n.state === 'walk' && !n.arrived) return;
    if (n.state === 'walk' && n.arrived) { n.state = 'idle'; n.wait = rnd(2, 5); if (n.cool <= 0) { this.speak(n, isTech ? pick(['Checking the bolts.', 'All looks good here.']) : pick(['Keep the park tidy!', this.weather === 'rain' ? 'Mopping up the wet spots.' : 'Sweeping up.'])); n.cool = 12; } return; }
    if (n.wait <= 0) {
      n.state = 'walk'; n.arrived = false;
      const night = this.clock < 360 || this.clock > 1200;
      if (isTech) { const r = night ? null : pick(Object.values(this.rides)); if (r) this.goTo(n, r.x + rnd(-2, 2), r.z + rnd(-2, 2)); else this.goTo(n, home[0], home[1]); }
      else { n.pi = (n.pi + 1) % 6; const a = (n.pi + (n.id % 2) * 3) / 6 * Math.PI * 2; this.goTo(n, Math.cos(a) * 12, Math.sin(a) * 12); }
      n.wait = rnd(4, 8);
    } else if (n.state !== 'walk') n.state = 'idle';
  },

  finishTask(n) {
    const t = n.task; if (!t) return;
    const e = t.e;
    if (t.type === 'litter') { this.litter.splice(this.litter.indexOf(e), 1); n.bag++; }
    else if (t.type === 'spill') { this.litter.splice(this.litter.indexOf(e), 1); this.radio(n.name, `Spill near ${this.place(t.x, t.z)} cleaned.`); }
    else if (t.type === 'call') {
      e.maintCall = false;
      const near = this.litter.filter(i => Math.hypot(i.x - e.x, i.z - e.z) < 6);
      near.forEach(i => { this.litter.splice(this.litter.indexOf(i), 1); if (i.type === 0) n.bag++; });
      this.speak(n, near.length ? 'All sorted, enjoy!' : 'Nothing wrong here. Let us know if anything comes up!');
      this.radio(n.name, `Assisted ${e.name}${near.length ? `, cleared ${near.length} item(s)` : ''}.`);
    } else if (t.type === 'ride') {
      e.state = 'ok'; e.major = false;
      this.speak(n, 'Fixed and tested.');
      this.radio(n.name, `The ${e.name} is repaired and back in service.`);
      this.radio('Ride Control', `${e.name[0].toUpperCase() + e.name.slice(1)} reopened to guests.`);
    }
    n.task = null; n.state = 'idle'; n.wait = 0.5;
  },

  maintSnapshot() {
    return {
      l: this.litter.map(i => [i.id, +i.x.toFixed(1), +i.z.toFixed(1), i.type, i.hue]),
      r: [this.rides.wheel.state === 'ok' ? 0 : this.rides.wheel.major ? 2 : 1, this.rides.carousel.state === 'ok' ? 0 : this.rides.carousel.major ? 2 : 1],
      cl: this.clean ?? 100
    };
  }
};
