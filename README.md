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


## Terrain, adaptation and crates

- **Terrain balance:** two hills and two mud patches. Uphill slows you, steep/wet/muddy ground lowers a Balance score (shown in the status bar); low balance makes the avatar sway and stumble. Agility, level, load, injury and fatigue all matter.
- **Cultural adaptation:** pick NPC greeting language (en/es/fr/pt/ja/hi), formality and personal-space distance in the customizer. NPCs greet and mirror your gesture accordingly and keep your preferred distance.
- **Cognitive adaptation:** crowds, rain, night, hazards and fatigue raise mental load. When overloaded, the HUD dims and NPCs warn about hazards; focused players get fewer hints; Novices get fuller hints than Experts.
- **Technological adaptation:** touch/keyboard detection (hint text), gamepad (left stick move, right stick camera, A jump, B lift/drop, X wave, Y cheer, RT/R1 sprint), reduced-motion support, slower updates on slow networks and an automatic Lite mode when frame rate is low.
- **NPCs and crates:** NPCs path around crates you push into their way, and cleaners haul stray crates back to their home spots. Push three crates onto the yellow delivery pad for bonus XP.
- **NPC faces:** every NPC gets a procedurally generated CGI face (shaded skin, glossy eyes, brows, nose, lips) unique per NPC.

## Senses

- **Touch:** lifting a crate describes its texture, pressure (weight) and temperature; the chili grill burns, the ice cart is freezing.
- **Hearing:** carousel music and ambulance sirens are sound sources; sirens play spatial (left/right) audio and are announced; loud areas show 🔊.
- **Vision:** you only see name tags inside a view cone and range (shorter at night and in rain). Someone close behind you makes you glance round.
- **Smell:** food stands (popcorn, candy, lemonade, chili, ice) smell pleasant; litter and spills smell foul and change mood.
- **Taste:** press **T** (or 😋) at a stand: salty/sweet/sour/spicy/cold flavours change mood, emote and stamina.
- **Equilibrium:** spinning the camera/avatar quickly builds dizziness that lowers Balance and wobbles the head; it fades at rest.
- **Collision:** food stands are solid obstacles for players (client + server) and NPC pathfinding, like rides and booths; the ice cart moved off the ferris wheel base.

## Avatar face

In the customizer (🎨 / **M**), choose **Face source**: **My photo** (upload, or take one with the camera; skin tone is matched), **Build my face** (eye colour/size/spacing, brows, nose, mouth width, lip colour, blush, freckles, lashes), or **Simple**. The face is synced to other players.

The front login page has a **🙂 Build a face** button that opens the customizer straight at the face builder.
