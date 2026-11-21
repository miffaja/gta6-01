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
| Mouse | Aim on foot · Click to shoot |
| 1 / 2 / 3 · Q | Switch weapon (pistol / SMG / shotgun) |
| E | Enter / exit a car (steal a traffic car and the heat is on) |
| Space | Handbrake while driving |
| Shift | Sprint on foot |
| H | Horn |
| P / Esc | Pause |
| M | Mute |
| R | Restart the current mission |
| Enter | Start / continue from the title screen |

## Systems

- **A city to explore** — Solmar Bay is a seeded grid of streets, blocks, parks with paths and fountains, parking lots with painted bays, a container port, a beach with umbrellas and lifeguard towers, a marina with boats and a working lighthouse, and a pier. Downtown towers rise over low-rise edges (pseudo-3D buildings with extruded walls, long shadows and windows that light up at night). Day turns to golden hour to night (streetlight pools, headlight cones, strobing police lightbars) and rain rolls in with wet-road sheen.
- **On foot and by car** — walk the sidewalks or take any car: sedans, sports cars, taxis, vans, pickups, trucks and buses, each with its own handling, size and durability. Parked cars are free; taking a car with a driver in it is grand theft auto and the cops will notice. Hit a stunt ramp fast for airtime and a cash bonus.
- **Traffic and pedestrians** — cars drive the road network keeping to their lane, braking smoothly for the car ahead and queueing at intersections (brake lights and all); pedestrians stroll the sidewalks and flee from gunfire, crashes and speeding cars.
- **Wanted system and police** — crimes raise your heat from 0 to 5 stars. Police cars pursue and ram; foot cops chase and bust you on touch; at 4–5 stars the rival Marlin crew sends cars of its own. Break line of sight to cool off, get a repair + respray at Rosa's Garage to clear the heat for $100, or get busted (or wasted) and wake up at the precinct (or the hospital), $200 lighter.
- **Missions and a story** — eight jobs with objectives, a minimap marker and a cash reward: *The Pickup* (drive a package from the docks), *Cash Run* (three drops against the clock), *Heat* (steal a car, lose the cops, reach the safehouse), *The Docks* (a shootout with the rival Marlin crew, then escape), *Street Kings* (a five-checkpoint street race against a rival), *Armored Score* (crack a cash truck and deliver the take), *Escort* (get Rosa's accountant to the safehouse under fire), and *Last Delivery* (a timed chain of drops). Finish the story and free-roam taxi fares and parcel deliveries pay the bills.
- **Combat** — three switchable weapons on foot (pistol, SMG, shotgun with spread), body armor that soaks damage, armed rivals who shoot back and drop their guns, car wrecks, and a bust/wasted loop with respawns. The safehouse patches you up and saves.
- **HUD with a minimap** — health and armor, cash, current weapon and ammo, a speedometer, wanted stars, the clock, the current objective, and a live minimap showing you, the police, rival cars, landmarks and your marker.
- **Start, save and pause** — a title screen, pause menu, and a localStorage save (cash, mission progress, position, weapons, armor) you continue from.
- **Polish** — synthesized sound effects (engine, sirens, gunshots, crashes, horns, pickups) and a procedural music loop, day/night and golden-hour lighting, rain, exhaust, muzzle flash and shell casings, skid marks and screen shake.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game, staged deterministically with `?shot=` (see `game/src/shots.js`): the title screen at golden hour, a golden-hour avenue drive, a four-star night pursuit in the rain, and the armored-truck heist.

## Files

- `game/index.html` — entry point; `game/src/` — the game (config, city, world, render, audio, input, shots, main). All art is drawn in code; all sound is synthesized. No external assets, no network requests.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library.
- `serve.ts` — a tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's dossier library, byte for byte.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jnzd112y&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
