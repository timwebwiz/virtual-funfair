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

## Sensory feedback

- **Proprioception:** the body senses its own pose and corrects it: wider stance and arms out when unstable, leaning back against a carried load, leaning into turns, and a smoothed self-righting posture.
- **Vestibular:** the head counter-rotates against body lean/roll to keep gaze level; dizziness weakens the reflex and wobbles the head. Edges of the screen darken when dizzy, at night, in rain or when hurt.
- **Tactile:** touch devices vibrate when lifting crates (longer for heavier), burning on the grill, stumbling, tasting and hearing a siren; hot surfaces make the avatar recoil.
- **Auditory:** loud noise makes the avatar cover its ears; a siren startles it (and is heard left/right).
- **Visual:** squinting in rain/night while moving.
- **Olfactory:** foul smells make it pinch its nose; pleasant ones make it sniff.
- **Gustatory:** each flavour has a face/gesture (chewing, sour pucker, fanning a spicy mouth). Reactions and dizziness are shown to other players.

## Social & environmental feedback
- **Emotional:** nearby sad/hurt people make the avatar concerned; happy crowds lift its mood.
- **Social:** greetings aimed at you get an automatic reply; standing too close (beyond your personal space) causes discomfort.
- **Cognitive:** a 💭 line shows what a nearby player or NPC seems to be doing or intending.
- **Environmental:** messages for rain, night/morning, ride closures and a dirty park; mud or steep ground ahead triggers a warning and slows you.

## Body & environment feedback
A `🌡 …` line (bottom-left) shows live readings; messages appear when a state is first entered.
- **Kinesthetic / proprioceptive:** limb state (relaxed, ready, heavy, strained, trembling); trembling arms shake visibly.
- **Interoceptive:** hunger and thirst build over time (faster when hot or sprinting); at high levels stamina drains faster. Food stands (T) relieve them.
- **Pain:** stumbles, burns and injury raise pain, which slows you and makes you wince.
- **Temperature, humidity, pressure:** °C, % and hPa follow the park clock and weather; pressure eases toward a new value, so a front shows as ↓/↑.
- **Vibration:** running rides rumble underfoot (major faults shake hard), reducing balance and buzzing touch devices.
- **Magnetic / electric:** the compass (🧭) is disturbed near running machinery; static builds up in dry air or fields and zaps you when you grab a crate or taste food.

## Mind feedback
A `🧠 …` line (bottom-left) summarises strategy, memories, learned skill, voice and predictions.
- **Vestibular / auditory / visual:** already covered by balance, dizziness, hearing and the vision vignette; new feedback builds on them.
- **Speaking:** you hear a tone for your own voice; in loud areas you automatically raise it (or shout, shown in caps). Shouting strains your voice until it goes hoarse.
- **Listening:** others' chat is harder to understand with distance and noise (words drop out); you glance toward the speaker.
- **Memory:** places where you slipped, got burned, shocked or enjoyed food are saved (`localStorage`) and recalled when you return.
- **Learning:** each slip makes you more sure-footed (fewer stumbles); repeated tastes reveal a favourite flavour.
- **Predictive:** warns when someone will cross your path, when you will run out of breath, and when falling pressure means rain.
- **Adaptive:** your pace becomes cautious, careful or confident based on recent slips, weather, pain and crowds.

## Drive feedback
A `🎯 …` line (bottom-left) shows your goal, points, conscience, strongest drive and what you are attending to. Progress is saved in `localStorage`.
- **Motivation:** hunger, thirst, tiredness, loneliness and curiosity set your top drive; short goals (taste 3 foods, explore 8 areas, visit both rides, help someone who is down) pay points. NPC motives show beside their 💭 intent.
- **Reward:** goals, discoveries, bonuses and staying with a fallen person earn points (streaks add more) with a chime and a happy mood.
- **Punishment / morals:** littering or sprinting through a crowd costs points and conscience and makes the avatar feel guilty; a fallen person nearby prompts you to help.
- **Curiosity:** new areas and points of interest are rewarded, the nearest undiscovered one is shown (🔍) and the avatar glances toward it when idle.
- **Attention:** carrying a crate, chasing a goal or being overloaded narrows which name tags are shown.
- **Empathy / social:** sad or fallen people prompt a nudge to wave or help.
