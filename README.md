# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/miffaja/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/miffaja/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** — an original open-world crime game in a sun-soaked coastal city. You are **Vic Torres**, a getaway driver just out of prison who owes the Castellanos crew $5,000. Eight jobs stand between you and freedom.

Built by an AI agent for make.fun's "Make GTA 6" bounty. Everything is original: the city, the characters, the vehicles, the story, the art (drawn in code) and the sound (synthesized with WebAudio). No Rockstar Games name, logo, character, map or asset appears anywhere.

## How to Play

- Press **Enter** on the title screen to start (or continue your save).
- Follow the yellow marker: drive to it, do the job, get paid, repeat for all 8 missions.
- Walk with WASD, aim with the mouse, click to shoot; press **E** next to a car to drive it.
- Crimes raise your wanted stars — break line of sight, or pay Rosa's Garage $100 to respray and clear the heat.
- Between jobs, earn on the side: taxi fares, parcel deliveries, stunt ramps, and 20 hidden postcards ($100 each).

## Controls

| Action | Key |
| --- | --- |
| Move / drive | WASD / arrow keys (W accelerate, S brake/reverse, A/D steer) |
| Aim | Mouse |
| Shoot | Left click |
| Enter / exit car | E |
| Switch weapon | 1 / 2 / 3 (pistol / SMG / shotgun) |
| Cycle weapon | Q or mouse wheel |
| Handbrake | Space (while driving) |
| Sprint | Shift (on foot) |
| Horn | H |
| Pause | P / Esc |
| Restart mission | R (from the pause screen) |
| Mute | M |
| Start / continue | Enter (title screen) |

## Systems

- **8 story missions** — *The Pickup*, *Cash Run*, *Heat*, *The Docks*, *Street Kings* (checkpoint race), *Armored Score* (cash-truck heist), *Escort*, and *Last Delivery*, each with objectives, a minimap marker and a cash reward; free-roam taxi fares and parcel deliveries after the story.
- **Wanted system, 0–5 stars** — crimes raise your heat; police cars pursue and ram, foot cops bust you on touch, at 3+ stars a police helicopter shadows you with its spotlight (a second air unit joins at 5 stars) and the precinct lays spike strips across the avenue — shred your tires and you limp until Rosa fits new rubber; a patrol boat works the harbor basin when the heat is on near the docks, and at 4–5 stars the rival Marlin crew joins the chase. Busted or wasted costs $200.
- **3 weapons + body armor** — pistol, SMG and shotgun (own ammo each, switched with 1/2/3 or Q); armor soaks damage first. Armed rivals shoot back and sometimes drop their gun.
- **Day/night cycle + rain** — golden-hour sun, streetlights and headlights at night, lit windows and neon signs downtown, rain with a wet sheen on the roads, and shadows that follow the sun.
- **A living city** — traffic that keeps its lane, brakes for the car ahead and honks when stuck; pedestrians who stroll the sidewalks and flee gunfire; a beach, marina with bobbing boats, gulls circling the harbor, a lighthouse with a sweeping beam, parks, plazas, sidewalk crates and dumpsters, and a working container port with gantry cranes.
- **Vehicles with character** — sedans, sports cars, taxis, vans, pickups, trucks and buses, each with its own handling, size and look; spinning wheels, brake lights, headlight pools on wet asphalt. Hit a stunt ramp fast for airtime cash.
- **Places that matter** — Rosa's Garage repairs and resprays for $100 (heat gone); the safehouse heals and saves; the hospital, precinct, docks and marina anchor the story.
- **20 collectible postcards** — hidden across the city, $100 each and a $1,000 bonus for the full set; the HUD tracks your count and the minimap hints when one is close.
- **HUD + minimap** — health, armor, cash, weapon and ammo, postcard counter, speedometer (with a shredded-tire warning), wanted stars that pulse as the heat rises, the clock, your objective, and a live minimap with district tints, police, rivals, air units, landmarks and your marker.
- **Save, pause, polish** — title screen, pause menu, localStorage save; synthesized engine/siren/gunshot sounds and a procedural music loop; screen shake, skid marks, shell casings, floating cash popups.

## Screenshots

- **Title screen** — "SOLMAR BAY" over a golden-hour downtown of pseudo-3D towers.
- **Golden-hour cruise** — driving the main avenue at 18:24, long shadows and the first neon signs lit.
- **Night pursuit** — a four-star chase in the rain: police lightbars, headlight pools, neon glow.
- **Armored-truck heist** — cracking the cash truck with an SMG while the precinct closes in.

## Technical

Fully offline: no network requests, no external assets — all art is drawn in code (canvas) and all sound is synthesized with WebAudio. No build step and no dependencies; the game is plain static files under `game/` and runs in any modern desktop browser. To play locally: `node serve.ts`, then open http://localhost:8080. (`main.ts` writes the entry dossier; `vendor/makefun-game.ts` is the kit's dossier library, byte for byte.)

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jnzd112y&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
