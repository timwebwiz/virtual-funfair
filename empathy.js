// NPCs notice how players look and react: comfort, offer water, pass on weather advice.
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

export const empathyMethods = {
  reactToPlayers(dt) {
    this.empT = (this.empT || 0) - dt;
    if (this.empT > 0) return;
    this.empT = 3;
    for (const p of this.players.values()) {
      const s = p.s || {};
      p.empCool = Math.max(0, (p.empCool || 0) - 3);
      if (p.empCool > 0) continue;
      const need = s.m === 'sad' || s.m === 'angry' || s.m === 'nervous' || s.m === 'tired' ? s.m : s.tr > 0.7 ? 'tired' : s.tp || (p.emoteGreet ? 'hello' : '');
      if (!need || !LINES[need]) continue;
      let best = null, bd = 7;
      for (const n of this.npcs) {
        if (n.role === 'ambulance' || n.sayT > 0 || n.state === 'treat') continue;
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < bd) { best = n; bd = d; }
      }
      if (!best) continue;
      this.speak(best, pick(LINES[need][best.role] || LINES[need].visitor));
      p.empCool = 30; p.emoteGreet = false;
      this.face && this.face(best, p);
    }
  }
};
