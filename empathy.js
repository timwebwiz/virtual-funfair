import { greeting, reply, SPACE } from './culture.js';
import { isBlocked } from './nav.js';

// NPCs notice how players look, act and what device they use, then adapt: comfort, greet in the
// player's language, warn distracted players of hazards, hint at puzzles and respect personal space.
// Mixed into World.prototype (see npc.js).
const LINES = {
  sad: { visitor: ['Cheer up, the park is lovely today.', 'Are you okay?'], medic: ['You seem down. Want to talk or sit for a bit?'], security: ['Everything alright? I am nearby if you need anything.'], maintenance: ['Rough day? The carousel is a good pick-me-up.'] },
  angry: { visitor: ['Whoa, take a breath!'], medic: ['Take a moment, breathe slowly.'], security: ['Let us keep things calm, please.'], maintenance: ['Easy there, friend.'] },
  tired: { visitor: ['You look worn out. Grab a bench!'], medic: ['You look tired. Rest and drink some water.'], security: ['There are benches by the plaza if you need a rest.'], maintenance: ['Take five, the park is not going anywhere.'] },
  nervous: { visitor: ['First time here? It is not scary, promise!'], medic: ['Nothing to worry about. Breathe in, breathe out.'], security: ['Do not worry, we are keeping the park safe.'], maintenance: ['Rides are all checked, no worries.'] },
  cold: { visitor: ['Brr, chilly! The booths are warm.'], medic: ['You are shivering. Keep moving to stay warm.'], security: ['Cold night. Stay warm out there.'], maintenance: ['Chilly, isn\'t it?'] },
  hot: { visitor: ['So hot! Find some shade.'], medic: ['Hot out here. Please drink water.'], security: ['Stay hydrated in this heat.'], maintenance: ['Hot one today, huh?'] },
  hello: { visitor: ['Hi there!'], medic: ['Hello! Stay safe.'], security: ['Good to see you, guest.'], maintenance: ['Hey! Mind the wet floor signs.'] }
};
const pick = a => a[Math.floor(Math.random() * a.length)];

const HINT = {
  grab: { touch: 'Tap the 📦 button beside a crate to lift it. Tap it again to put it down.', gamepad: 'Press B beside a crate to lift it, and B again to put it down.', keyboard: 'Press G beside a crate to lift it, or just walk into one to push it.' },
  pad: 'Bring three crates to the yellow pad in the south-west corner to finish a stockroom delivery.',
  short: 'Crates go on the yellow pad.'
};
const near = (list, p, r) => { let b = null, bd = r; for (const n of list) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { b = n; bd = d; } } return b; };
const free = n => n.role !== 'ambulance' && n.sayT <= 0 && !['treat', 'haul', 'fetch'].includes(n.state) && !n.down;

export const empathyMethods = {
  say(n, text, gest) { if (n.sayT > 0) return false; this.speak(n, text); if (gest) { n.gest = gest; n.gestT = 2.6; } return true; },

  reactToPlayers(dt) {
    for (const n of this.npcs) if (n.gestT > 0) { n.gestT -= dt; if (n.gestT <= 0) n.gest = null; }
    this.respectSpace(dt);
    this.empT = (this.empT || 0) - dt;
    if (this.empT > 0) return;
    this.empT = 2;
    for (const p of this.players.values()) {
      if (p.down) continue;
      const s = p.s || {}, av = p.avatar || {}, focus = s.fc || 'focused', level = av.level || 0;
      p.cool = Math.max(0, (p.cool || 0) - 2); p.warnCool = Math.max(0, (p.warnCool || 0) - 2); p.hintCool = Math.max(0, (p.hintCool || 0) - 2);
      const staff = this.npcs.filter(n => free(n));

      // decision-making: a distracted or overloaded player gets warned about hazards ahead
      if (focus !== 'focused' && p.warnCool <= 0) {
        const spill = this.litter.find(i => i.type === 1 && Math.hypot(i.x - p.x, i.z - p.z) < 3.5);
        const ride = Object.values(this.rides).find(r => r.state === 'fault' && Math.hypot(r.x - p.x, r.z - p.z) < 11);
        const who = near(staff.filter(n => n.role === 'security' || n.role === 'maintenance'), p, 10) || near(staff, p, 7);
        if (who && (spill || ride)) {
          this.face(who, p);
          if (this.say(who, spill ? 'Careful, wet spill right there!' : `The ${ride.name} is closed. Please keep clear.`, 'point')) { p.warnCool = 20; continue; }
        }
      }
      if (p.cool > 0) continue;

      // culture: answer greetings (or greet an attentive newcomer) in the player's language and style
      const closest = near(staff, p, 5);
      p.seen = p.seen || new Map();
      if (closest && (p.emoteGreet || (focus !== 'focused' && Date.now() - (p.seen.get(closest.id) || 0) > 120000 && Math.hypot(closest.x - p.x, closest.z - p.z) < 4.5))) {
        p.seen.set(closest.id, Date.now()); p.emoteGreet = false;
        this.face(closest, p);
        if (this.say(closest, greeting(av.lang, av.formal, this.clock), reply(av.culture, av.formal))) { p.cool = 20; continue; }
      }

      // cognitive adaptation: newcomers (or distracted regulars) get puzzle hints that fit their device
      const crate = this.crates.loose().find(c => Math.hypot(c.x - p.x, c.z - p.z) < 5);
      if (crate && p.hintCool <= 0 && level <= 1 && (level === 0 || focus !== 'focused') && (p.hintN || 0) < 6) {
        const who = near(staff, p, 9);
        if (who) {
          const text = level === 1 ? HINT.short : (p.hintN || 0) % 2 === 0 ? HINT.grab[p.dev] || HINT.grab.keyboard : HINT.pad;
          this.face(who, p);
          if (this.say(who, text, 'point')) { p.hintCool = 90; p.hintN = (p.hintN || 0) + 1; continue; }
        }
      }

      // empathy: comfort sad, angry, tired, cold or hot players; busy players are left alone longer
      const need = ['sad', 'angry', 'nervous', 'tired'].includes(s.m) ? s.m : s.tr > 0.7 ? 'tired' : s.tp || '';
      if (!need || !LINES[need]) continue;
      const who = near(staff, p, 7);
      if (!who) continue;
      this.face(who, p);
      if (this.say(who, pick(LINES[need][who.role] || LINES[need].visitor))) p.cool = focus === 'focused' ? 60 : 30;
    }
  },

  // cultural norm: non-urgent NPCs keep the distance each player prefers
  respectSpace(dt) {
    for (const p of this.players.values()) {
      const min = SPACE[p.avatar && p.avatar.space] || SPACE.normal;
      for (const n of this.npcs) {
        if (n.role === 'ambulance' || n.down || n.sayT > 0 || ['treat', 'respond', 'haul', 'fetch', 'attend', 'work'].includes(n.state)) continue;
        if (n.role !== 'visitor' && n.role !== 'maintenance') continue;
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d >= min || d < 0.001) continue;
        const k = (min - d) * Math.min(1, dt * 3), x = n.x + (n.x - p.x) / d * k, z = n.z + (n.z - p.z) / d * k;
        if (!isBlocked(x, z)) { n.x = x; n.z = z; }
      }
    }
  }
};
