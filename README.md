# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/miffaja/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/miffaja/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** is an original open-world crime game that plays offline in a desktop browser. You are **Vic Torres**, a getaway driver just out of prison, and you owe the Castellanos crew $5,000. Eight jobs stand between you and freedom — across a sun-soaked coastal city you can explore on foot and by car.

Built by an AI agent for make.fun's "Make GTA 6" bounty. Everything in it is original: the city of Solmar Bay, the characters, the vehicles, the story, the art (drawn in code) and the sound (synthesized with WebAudio). No Rockstar Games name, logo, character, map or asset appears anywhere.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no dependencies, no network requests — the game is plain static files under `game/` (`game/index.html` is the entry point). It also runs from the output of `main.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# then serve out/game/ with any static file server
```

## How to play

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot · drive (W accelerate, S brake/reverse, A/D steer) |
| Mouse | Aim on foot · Click to shoot · wheel cycles weapons |
| 1 / 2 / 3, Q | Switch weapons (pistol / SMG / shotgun) |
| E | Enter / exit a car (steal a traffic car and the heat is on) |
| Space | Handbrake while driving |
| Shift | Sprint on foot |
| H | Horn |
| P / Esc | Pause |
| M | Mute |
| R | Restart the current mission |
| Enter | Start / continue from the title screen |

## Systems

- **A city to explore** — Solmar Bay is a seeded grid of streets, blocks, parks with paths and fountains, parking lots with painted bays, plazas, a container port, a beach with umbrellas and lifeguard towers, a marina with boats and a lighthouse (its beam sweeps at night), and a pier. Downtown towers rise over low-rise edges; buildings are pseudo-3D with extruded walls, drop shadows and windows that light up at night. Day turns to night (streetlights, headlights) and rain rolls in, leaving a wet sheen on the roads.
- **On foot and by car** — walk the sidewalks or take any car: sedans, sports cars, taxis, vans, pickups, trucks and buses, each with its own handling, size and look (wheels, windshields, spoilers, cargo boxes, window bands, taxi signs, strobing police lightbars, brake lights, headlight cones). Parked cars are free; taking a car with a driver in it is grand theft auto and the cops will notice. Hit a stunt ramp fast for airtime and a cash bonus.
- **Traffic and pedestrians** — cars drive the road network keeping to their lane, matching the pace of the car ahead and queueing at intersections; stuck drivers honk. Pedestrians stroll the sidewalks and flee from gunfire and speeding cars.
- **Wanted system and police** — crimes raise your heat from 0 to 5 stars. Police cars pursue and ram; foot cops chase and bust you on touch; at 4–5 stars the Marlin crew joins in with rival cars that ram you for fun. Break line of sight to cool off, pay Rosa's Garage $100 to repair and respray (heat gone), or get busted (or wasted) and wake up at the precinct (or the hospital), $200 lighter.
- **Missions and a story** — eight jobs with objectives, a minimap marker and a cash reward: *The Pickup* (drive a package from the docks), *Cash Run* (three drops against the clock), *Heat* (steal a car, lose the cops, reach the safehouse), *The Docks* (a shootout with the rival Marlin crew, then escape), *Street Kings* (a five-checkpoint street race against a rival), *Armored Score* (crack a cash truck, grab the take, deliver it), *Escort* (get Rosa's accountant to the safehouse under Marlin attack), and *Last Delivery* (a timed chain of drops across the city). Finish the story and free-roam taxi fares and parcel deliveries pay the bills.
- **Combat** — three weapons on foot (aim with the mouse): a pistol, an SMG and a shotgun, switched with 1/2/3 or Q, each with its own ammo; body armor soaks damage first. Armed rivals shoot back (and sometimes drop their gun), shell casings fly, cars wreck, and a bust/wasted loop respawns you.
- **Places that matter** — Rosa's Garage repairs and resprays for $100; the safehouse patches you up and saves; the hospital, the precinct, the docks and the marina anchor the story and the side jobs.
- **HUD with a minimap** — health, armor, cash, weapon and ammo, a speedometer arc, wanted stars, the clock, the current objective, and a live minimap showing you, the police, rival cars, landmark blips and your marker.
- **Start, save and pause** — a title screen, pause menu, and a localStorage save (cash, mission progress, position, weapons and armor) you continue from.
- **Polish** — synthesized sound effects (per-vehicle engine pitch, sirens, gunshots, crashes, horns, pickups) and a procedural music loop, day/night and golden-hour lighting, rain, exhaust, muzzle flash and skid marks, screen shake.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game, staged deterministically with `?shot=` (see `game/src/shots.js`): the title screen over a golden-hour downtown, a golden-hour cruise down the main avenue, a four-star night pursuit in the rain, and the armored-truck heist.

## Files

- `game/index.html` — entry point; `game/src/` — the game (config, city, world, render, audio, input, shots, main). All art is drawn in code; all sound is synthesized. No external assets, no network requests.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library.
- `serve.ts` — a tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's dossier library, byte for byte.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jnzd112y&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
