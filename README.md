# Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/miffaja/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/miffaja/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** is an original open-world crime game that plays offline in a desktop browser. You are **Vic Torres**, a getaway driver just out of prison, and you owe the Castellanos crew $5,000. Four jobs stand between you and freedom — across a sun-soaked coastal city you can explore on foot and by car.

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
| E | Enter / exit a car (steal a traffic car and the heat is on) |
| Space | Handbrake while driving |
| Shift | Sprint on foot |
| H | Horn |
| P / Esc | Pause |
| M | Mute |
| R | Restart the current mission |
| Enter | Start / continue from the title screen |

## Systems

- **A city to explore** — Solmar Bay is a seeded grid of streets, blocks, parks, parking lots, a container port, a beach and a pier. Day turns to night (streetlights, headlights) and rain rolls in.
- **On foot and by car** — walk the sidewalks or take any car. Parked cars are free; taking a car with a driver in it is grand theft auto and the cops will notice.
- **Traffic and pedestrians** — cars drive the road network and stop for the car ahead; pedestrians stroll the sidewalks and flee from gunfire and speeding cars.
- **Wanted system and police** — crimes raise your heat from 0 to 5 stars. Police cars pursue and ram; foot cops chase and bust you on touch. Break line of sight to cool off, or get busted (or wasted) and wake up at the precinct (or the hospital), $200 lighter.
- **Missions and a story** — four jobs with objectives, a minimap marker and a cash reward: *The Pickup* (drive a package from the docks), *Cash Run* (three drops against the clock), *Heat* (steal a car, lose the cops, reach the safehouse), *The Docks* (a shootout with the rival Marlin crew, then escape). Finish the story and free-roam taxi fares pay the bills.
- **Combat** — a pistol on foot (aim with the mouse), armed rivals who shoot back, car wrecks, and a bust/wasted loop with respawns.
- **HUD with a minimap** — health, cash, ammo, speed, wanted stars, the clock, the current objective, and a live minimap showing you, the police, and your marker.
- **Start, save and pause** — a title screen, pause menu, and a localStorage save (cash, mission progress, position) you continue from.
- **Polish** — synthesized sound effects (engine, sirens, gunshots, crashes, pickups) and a procedural music loop, day/night lighting, rain, exhaust and muzzle particles, skid marks and screen shake.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game, staged deterministically with `?shot=` (see `game/src/shots.js`): the title screen, a midday drive, a three-star police pursuit at dusk, and the docks shootout.

## Files

- `game/index.html` — entry point; `game/src/` — the game (config, city, world, render, audio, input, shots, main). All art is drawn in code; all sound is synthesized. No external assets, no network requests.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the vendored make.fun library.
- `serve.ts` — a tiny static server for local play.
- `vendor/makefun-game.ts` — the kit's dossier library, byte for byte.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jnzd112y&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
