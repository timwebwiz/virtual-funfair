# Virtual Funfair

Multiplayer 3-D funfair (Node + WebSocket server, Three.js client). Run: `npm install && npm start`, open http://localhost:3000.

Controls: WASD/arrows/joystick move · E shout · F faint · H injured · C severe emergency (touch buttons provided).
Features: photo-based avatars, NPC security/medics/maintenance/visitors with pathfinding, first aid stations, ambulance and hospital, litter and ride repairs, player collision. Extra keys: R call maintenance, L drop litter. Avatar: customize look, clothing, accessories, height (cm) and build with M or the 🎨 button (saved locally). Movement is camera-relative: drag to orbit, wheel to zoom, Shift sprint, Space jump.

## Avatar traits and state
- **Self-reported traits** (customizer, M): strength, agility, endurance (1-10), mood, greeting style (wave/bow/namaste/handshake/nod) and interest. They change speed, jump, stamina, carrying and pushing, and how the avatar greets and idles.
- **Experience:** play time raises your level (Novice, Regular, Expert), shown as stars on your name tag, with more stamina and agility.
- **Live state:** stamina (sprinting drains it; at zero you are winded and may trip), injuries (limp, slower, no sprint or jump), temperature (shiver at night or in cold rain, sweat in midday heat), mood (face, posture, and chat text such as `:)`), gaze at nearby players and when distracted.
- **Social:** emotes (keys 1-0 or the 😀 button) and automatic culturally chosen greetings. NPCs comment on sad, tired, cold or hot players.
- **Physical:** walk into crates to push them, **G** lifts or drops one (limited by strength). Wet ground makes you slide; sprinting into obstacles can make you stumble.
- Traits are optional self-description and are not checked against anything real. NPCs ignore crates when path-finding.

