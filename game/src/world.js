// SOLMAR BAY — world.js
// The world simulation: player, cars, traffic, pedestrians, police, the
// wanted system, missions, combat, particles, day/night, weather, save/load.
// Eight story jobs, three weapons, body armor, rival-crew cars at high heat,
// Rosa's Garage (repair + respray), a safehouse, stunt ramps, side jobs, and
// 20 collectible postcards. All original.
// Exports: World class (update + per-system update prototypes), MISSIONS.
// Dependencies: config.js (all tuning + WEAPONS/VEHICLES/PAL), random.js
// (seeded RNG + geometry helpers), city.js (buildCity + collision queries).
import {
  SEED, WORLD_W, WORLD_H, BEACH_H, PLAYER_R, PLAYER_SPEED, PLAYER_SPRINT, PLAYER_HEALTH,
  CAR_W, CAR_L, CAR_ACCEL, CAR_BRAKE, CAR_REVERSE, CAR_MAX, CAR_MAX_REVERSE, CAR_TURN,
  TRAFFIC_COUNT, PED_COUNT, TRAFFIC_SPEED, WANTED_MAX, WANTED_DECAY, WANTED_SEEN_DECAY, POLICE_RAM,
  PISTOL_DAMAGE, PISTOL_RANGE, PISTOL_RATE, ENEMY_HEALTH, START_CASH, BUST_FINE, WASTE_FINE,
  SAVE_KEY, DAY_LENGTH, PAL, WEAPONS, WEAPON_ORDER, ARMOR_MAX, VEHICLES,
} from './config.js';
import { mulberry32, ri, rf, pick, pickWeighted, clamp, lerp, dist, dist2, angTo, angDiff, turnToward } from './random.js';
import { buildCity, onRoad, inBuilding, inWater, nearestNode, roadPoint } from './city.js';

export const MISSIONS = [
  { id: 1, name: 'The Pickup', brief: 'Rosa needs a package from the docks. Drive there, grab it, bring it back to the garage. No cops, no fuss.',
    reward: 400 },
  { id: 2, name: 'Cash Run', brief: 'Three drops are waiting around the city. Collect them all before the clock runs out. Fast feet, fast wheels.',
    reward: 600 },
  { id: 3, name: 'Heat', brief: 'We need wheels and we need them now. Take a car off the street — then lose the heat and get to the safehouse.',
    reward: 800 },
  { id: 4, name: 'The Docks', brief: 'The Marlin crew is moving in on our turf at the port. End it. Then get out of there before the whole precinct shows up.',
    reward: 1500 },
  { id: 5, name: 'Street Kings', brief: 'The Solmar street-race crown is up for grabs. Five checkpoints, one rival who wants it just as bad. Beat him to the line.',
    reward: 900 },
  { id: 6, name: 'Armored Score', brief: 'A cash truck rolls the avenues at noon. Crack it open, grab the take, and get it to Rosa before the precinct closes the net.',
    reward: 1800 },
  { id: 7, name: 'Escort', brief: 'Rosa\'s accountant is spooked and needs a ride to the safehouse. The Marlin crew will try to stop you. Keep him breathing.',
    reward: 1200 },
  { id: 8, name: 'Last Delivery', brief: 'One final chain of drops across Solmar Bay, then the docks. Run it clean and the Castellanos debt is settled for good.',
    reward: 2000 },
];

let carId = 1;
// Collectible postcards: 20 hidden spots on the road grid ([colIdx, rowIdx, dx,
// dy] against city.roads) — 5 along the beach/marina south edge, 5 downtown,
// 5 in the mid-ring, 5 on the outskirts. Offsets stay within the road's
// half-width so a card never lands inside a building.
const POSTCARD_SPOTS = [
  [2, 9, 0, 10], [4, 9, 12, 0], [6, 9, -10, 8], [8, 9, 0, 12], [10, 9, 8, 0],
  [5, 4, 10, 0], [6, 4, -12, 6], [7, 5, 8, -8], [5, 5, 0, 12], [7, 4, 14, 4],
  [3, 3, 0, 10], [9, 3, -10, 0], [3, 6, 8, -6], [9, 6, 0, 8], [6, 2, 12, 0],
  [1, 1, 0, 0], [11, 1, 10, 8], [1, 8, -8, 10], [11, 8, 0, -10], [0, 5, 12, 0],
];
export class World {
  constructor(seed = SEED) {
    this.seed = seed;
    this.city = buildCity(seed);
    this.rng = mulberry32(seed ^ 0x9e37);
    this.reset();
  }
  reset() {
    const c = this.city;
    // Each marina boat bobs out of phase with the others (render.js reads this).
    for (const bt of c.boats) bt.bobOffset = this.rng() * Math.PI * 2;
    this.screen = 'title';
    this.time = 0; this.timeH = 10; this.rain = 0; this.rainT = 30;
    this.shotMode = false; // staged screenshots never write to localStorage
    this.wanted = 0; this.wantedSeen = false;
    this.heli = null; // police helicopter (spawns at 3+ stars, see updateHeli)
    this.player = {
      x: c.spawn.x, y: c.spawn.y, a: -Math.PI / 2, hp: PLAYER_HEALTH, cash: START_CASH,
      ammo: 24, onFoot: true, car: null, speed: 0, aim: -Math.PI / 2, bustT: 0, invuln: 0,
      sprint: false, moving: false,
      weapon: 'pistol', armor: 0,
      weapons: { pistol: { ammo: 24 }, smg: { ammo: 0 }, shotgun: { ammo: 0 } },
    };
    this.cars = []; this.peds = []; this.cops = [];
    this.particles = []; this.skids = []; this.pickups = [];
    this.mission = { index: 0, stage: 0, timer: 0, data: {}, done: false, failed: false };
    this.storyDone = false; this.jobsDone = 0;
    this.job = null; // free-roam taxi fare / parcel delivery
    this.shopT = 0;  // garage repair/respray cooldown
    this.upgradeT = 0; // garage upgrade-purchase cooldown
    this.safeT = 0;  // safehouse heal cooldown
    this.rivalT = 0; // rival-crew spawn timer at high wanted
    this.cam = { x: this.player.x, y: this.player.y, zoom: 1, shake: 0 };
    this.msg = null; this.msgT = 0; this.msgDur = 0;
    this.wantedFlash = 0; // pulses the newest wanted star when heat rises
    this.textPops = [];   // floating "+$400" cash popups
    this.shootT = 0; this.hornT = 0;
    this.stats = { stolen: 0, busted: 0, wasted: 0, kills: 0, missions: 0 };
    this.spawnTraffic(); this.spawnPeds();
    this.spawnParkedCars();
    this.seedPickups();
    // Postcards start unfound; a save restores the found flags (loadSave).
    this.postcards = POSTCARD_SPOTS.map(([ci, rj, dx, dy]) => ({
      x: c.roads.v[ci] + dx, y: c.roads.h[rj] + dy, found: false,
    }));
    this.postcardsFound = 0;
    this.setObjective();
  }
  // Useful things lying around the city: an SMG by the docks, a shotgun near
  // the precinct, body armor at the marina and the safehouse, ammo + health
  // at the garage and the hospital.
  seedPickups() {
    const c = this.city;
    this.pickups.push(
      { x: c.docks.x - 120, y: c.docks.y + 60, kind: 'weapon', weapon: 'smg', taken: false },
      { x: c.precinct.x + 70, y: c.precinct.y + 40, kind: 'weapon', weapon: 'shotgun', taken: false },
      { x: c.marina ? c.marina.x : c.pier.x, y: c.marina ? c.marina.y - 60 : c.pier.y, kind: 'armor', taken: false },
      { x: c.garage.x + 60, y: c.garage.y - 50, kind: 'ammo', taken: false },
      { x: c.hospital.x - 60, y: c.hospital.y + 50, kind: 'health', taken: false },
      { x: c.safehouse.x + 60, y: c.safehouse.y + 50, kind: 'armor', taken: false },
    );
  }
  // ---------- spawning ----------
  spawnTraffic() {
    for (let i = 0; i < TRAFFIC_COUNT; i++) this.addTrafficCar(true);
  }
  addTrafficCar(anywhere) {
    const rng = this.rng;
    const p = roadPoint(rng, this.city);
    const kind = pickWeighted(rng, [
      ['taxi', 10], ['sport', 14], ['van', 12], ['pickup', 10],
      ['truck', 7], ['bus', 5], ['sedan', 42],
    ]);
    const spec = VEHICLES[kind] || VEHICLES.sedan;
    const car = {
      id: carId++, x: p.x, y: p.y, a: rng() < 0.5 ? 0 : Math.PI / 2, speed: rf(rng, 60, TRAFFIC_SPEED),
      color: kind === 'taxi' ? PAL.taxi : pick(rng, PAL.car), kind, driver: 'traffic',
      path: [], pathI: 0, hp: spec.hp, stuck: 0, brakeLight: 0, air: 0, honkT: 0,
    };
    this.planRoute(car, true);
    this.cars.push(car);
    return car;
  }
  spawnParkedCars() {
    const rng = this.rng;
    for (const b of this.city.blocks) for (const pc of b.cars) {
      const kind = pick(rng, ['sedan', 'sedan', 'sport', 'pickup', 'van']);
      const spec = VEHICLES[kind] || VEHICLES.sedan;
      this.cars.push({ id: carId++, x: pc.x, y: pc.y, a: pc.a, speed: 0, color: pc.color, kind, driver: null, path: [], pathI: 0, hp: spec.hp, stuck: 0, brakeLight: 0, air: 0, honkT: 0 });
    }
  }
  spawnPeds() {
    for (let i = 0; i < PED_COUNT; i++) this.addPed(false);
  }
  addPed(enemy, x, y) {
    const rng = this.rng;
    const p = x === undefined ? roadPoint(rng, this.city) : { x, y };
    const ped = {
      x: p.x, y: p.y, a: rf(rng, 0, Math.PI * 2), speed: rf(rng, 30, 55),
      color: pick(rng, ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#ecf0f1', '#1abc9c']),
      state: 'walk', tx: p.x, ty: p.y, panic: 0, enemy: !!enemy,
      hp: enemy ? ENEMY_HEALTH : 20, shootT: rf(rng, 0.5, 2), dead: false, dropT: 0,
    };
    if (!enemy) this.pickWalkTarget(ped);
    this.peds.push(ped);
    return ped;
  }
  pickWalkTarget(ped) {
    // Walk along a sidewalk: pick a nearby block corner and head for it.
    const rng = this.rng;
    const b = pick(rng, this.city.blocks);
    const edge = ri(rng, 0, 3);
    const m = 14;
    if (edge === 0) { ped.tx = b.x + rf(rng, 0, b.w); ped.ty = b.y - m; }
    else if (edge === 1) { ped.tx = b.x + rf(rng, 0, b.w); ped.ty = b.y + b.h + m; }
    else if (edge === 2) { ped.tx = b.x - m; ped.ty = b.y + rf(rng, 0, b.h); }
    else { ped.tx = b.x + b.w + m; ped.ty = b.y + rf(rng, 0, b.h); }
  }
  // BFS route over intersection nodes.
  planRoute(car, randomDest) {
    const city = this.city;
    const from = nearestNode(city, car.x, car.y);
    const to = randomDest ? pick(this.rng, city.nodes) : nearestNode(city, this.player.x, this.player.y);
    const W = 13, H = 10;
    const prev = new Map(); const q = [from]; const seen = new Set([from.i + ',' + from.j]);
    while (q.length) {
      const n = q.shift();
      if (n === to) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = n.i + di, nj = n.j + dj;
        if (ni < 0 || ni > 12 || nj < 0 || nj > 9) continue;
        const k = ni + ',' + nj;
        if (seen.has(k)) continue;
        seen.add(k); prev.set(k, n);
        q.push(city.nodeAt(ni, nj));
      }
    }
    const path = [];
    let cur = to;
    let guard = 0;
    while (cur && cur !== from && guard++ < 40) { path.unshift(cur); cur = prev.get(cur.i + ',' + cur.j); }
    if (path.length === 0) path.push(to);
    car.path = path; car.pathI = 0;
  }
  // ---------- objectives / missions ----------
  setObjective() {
    const m = this.mission;
    if (this.storyDone || m.index >= MISSIONS.length) { this.objective = this.job ? 'Drive the fare to the marker' : 'Free roam — find a fare (yellow marker)'; return; }
    if (m.done) { this.objective = 'Mission complete'; return; }
    const def = MISSIONS[m.index];
    const c = this.city;
    if (m.index === 0) {
      this.objective = m.stage === 0 ? 'Go to the docks — pick up the package' : 'Deliver the package to Rosa\'s Garage';
      this.marker = m.stage === 0 ? { x: c.docks.x - 60, y: c.docks.y, r: 42 } : { x: c.garage.x, y: c.garage.y, r: 42 };
    } else if (m.index === 1) {
      const left = 3 - (m.data.collected || 0);
      this.objective = `Collect the cash drops — ${left} left${m.timer > 0 ? ` (${Math.ceil(m.timer)}s)` : ''}`;
      this.marker = m.data.drop ? { x: m.data.drop.x, y: m.data.drop.y, r: 40 } : null;
    } else if (m.index === 2) {
      if (m.stage === 0) { this.objective = 'Steal a car off the street (E near a moving car)'; this.marker = null; }
      else if (m.stage === 1) { this.objective = 'Lose the cops — break line of sight until the heat dies'; this.marker = null; }
      else { this.objective = 'Get to the safehouse'; this.marker = { x: c.safehouse.x, y: c.safehouse.y, r: 46 }; }
    } else if (m.index === 3) {
      if (m.stage === 0) { this.objective = 'Go to the docks — the Marlin crew is waiting'; this.marker = { x: c.docks.x - 60, y: c.docks.y, r: 46 }; }
      else if (m.stage === 1) { const left = this.peds.filter(p => p.enemy && !p.dead).length; this.objective = `Take out the Marlin crew — ${left} left`; this.marker = { x: c.docks.x - 60, y: c.docks.y, r: 60 }; }
      else { this.objective = 'Escape to the safehouse — the precinct is coming'; this.marker = { x: c.safehouse.x, y: c.safehouse.y, r: 46 }; }
    } else if (m.index === 4) {
      // Street Kings: checkpoint race vs a rival.
      const cp = (m.data.checkpoints || [])[m.data.cpI || 0];
      if (m.stage === 0) { this.objective = 'Get to the race start — the avenue by the garage'; this.marker = { x: c.garage.x, y: c.garage.y + 140, r: 46 }; }
      else if (cp) { this.objective = `Checkpoint ${(m.data.cpI || 0) + 1}/5 — beat the rival to the line${m.timer > 0 ? ` (${Math.ceil(m.timer)}s)` : ''}`; this.marker = { x: cp.x, y: cp.y, r: 52 }; }
      else { this.objective = 'Race to the finish'; this.marker = null; }
    } else if (m.index === 5) {
      // Armored Score: crack the truck, grab the cash, deliver it.
      if (m.stage === 0) { this.objective = 'Find the armored cash truck — ram or shoot it until it stops'; const tr = this.cars.find(car => car.id === m.data.truckId); this.marker = tr ? { x: tr.x, y: tr.y, r: 54 } : null; }
      else if (m.stage === 1) { this.objective = 'Grab the cash from the truck'; this.marker = m.data.cashAt ? { x: m.data.cashAt.x, y: m.data.cashAt.y, r: 44 } : null; }
      else { this.objective = 'Deliver the take to Rosa\'s Garage'; this.marker = { x: c.garage.x, y: c.garage.y, r: 46 }; }
    } else if (m.index === 6) {
      // Escort: pick up the accountant, get him to the safehouse.
      if (m.stage === 0) { this.objective = 'Pick up Rosa\'s accountant at St. Marina Hospital'; this.marker = { x: c.hospital.x, y: c.hospital.y, r: 48 }; }
      else { this.objective = 'Get the accountant to the safehouse — Marlin cars are coming'; this.marker = { x: c.safehouse.x, y: c.safehouse.y, r: 48 }; }
    } else if (m.index === 7) {
      // Last Delivery: a chain of timed drops, then the docks.
      const dp = (m.data.points || [])[m.data.pi || 0];
      if (dp) { this.objective = `Delivery ${(m.data.pi || 0) + 1}/${(m.data.points || []).length}${m.timer > 0 ? ` (${Math.ceil(m.timer)}s)` : ''}`; this.marker = { x: dp.x, y: dp.y, r: 46 }; }
      else { this.objective = 'Final drop — the docks'; this.marker = { x: c.docks.x - 60, y: c.docks.y, r: 48 }; }
    }
  }
  showMsg(title, sub = '', dur = 3) { this.msg = { title, sub }; this.msgT = dur; this.msgDur = dur; }
  // Floating cash text that rises and fades (drawn in render.js).
  popText(x, y, text, color) {
    this.textPops.push({ x, y, vy: -80, text, color: color || '#2ecc71', life: 1.4, max: 1.4 });
  }
  missionPassed() {
    const def = MISSIONS[this.mission.index];
    this.player.cash += def.reward;
    this.stats.missions++;
    this.popText(this.player.x, this.player.y - 20, '+$' + def.reward, '#ffd23e');
    this.showMsg('MISSION PASSED', `${def.name}  •  +$${def.reward}`, 3.5);
    this.mission.done = true;
    this.saveGame();
  }
  nextMission() {
    this.mission.index++;
    this.mission.stage = 0; this.mission.timer = 0; this.mission.data = {}; this.mission.done = false;
    if (this.mission.index >= MISSIONS.length) {
      this.storyDone = true;
      this.showMsg('STORY COMPLETE', 'Solmar Bay is yours, Vic. Free roam — fares pay the bills now.', 5);
      this.setObjective();
      this.saveGame();
      return;
    }
    const def = MISSIONS[this.mission.index];
    this.showMsg(def.name, def.brief, 5);
    if (this.mission.index === 1) this.spawnDrop();
    if (this.mission.index === 2) this.mission.data.stolenAtStart = this.stats.stolen;
    if (this.mission.index === 4) this.setupRace();
    if (this.mission.index === 5) this.setupHeist();
    if (this.mission.index === 7) this.setupDeliveryChain();
    this.setObjective();
  }
  // Street Kings: five checkpoints across the avenues + a rival racer.
  setupRace() {
    const c = this.city;
    this.mission.data.checkpoints = [
      { x: c.roads.v[6], y: c.roads.h[7] },
      { x: c.roads.v[10], y: c.roads.h[5] },
      { x: c.roads.v[10], y: c.roads.h[2] },
      { x: c.roads.v[4], y: c.roads.h[1] },
      { x: c.roads.v[2], y: c.roads.h[6] },
    ];
    this.mission.data.cpI = 0;
    this.mission.data.rivalCpI = 0;
    this.mission.timer = 0;
  }
  spawnRivalRacer() {
    const c = this.city;
    const rival = {
      id: carId++, x: c.garage.x + 46, y: c.garage.y + 140, a: -Math.PI / 2, speed: 0,
      color: '#8e44ad', kind: 'sport', driver: 'racer', path: [], pathI: 0,
      hp: VEHICLES.sport.hp, stuck: 0, brakeLight: 0, air: 0, honkT: 0,
    };
    this.cars.push(rival);
    this.mission.data.rivalId = rival.id;
    return rival;
  }
  // Armored Score: a tough cash truck rolling a route.
  setupHeist() {
    const rng = this.rng;
    const p = roadPoint(rng, this.city);
    const truck = {
      id: carId++, x: p.x, y: p.y, a: 0, speed: 90, color: '#5d6d7e', kind: 'truck',
      driver: 'truck', path: [], pathI: 0, hp: 240, stuck: 0, brakeLight: 0, air: 0, honkT: 0,
    };
    this.planRoute(truck, true);
    this.cars.push(truck);
    this.mission.data.truckId = truck.id;
  }
  // Last Delivery: four timed drops, then the docks.
  setupDeliveryChain() {
    const c = this.city;
    this.mission.data.points = [
      { x: c.roads.v[3], y: c.roads.h[2] },
      { x: c.roads.v[9], y: c.roads.h[3] },
      { x: c.roads.v[8], y: c.roads.h[7] },
      { x: c.roads.v[4], y: c.roads.h[8] },
    ];
    this.mission.data.pi = 0;
    this.mission.timer = 90;
  }
  // A hostile Marlin crew car that chases and rams (no bust — pure menace).
  spawnRivalCar() {
    const rng = this.rng;
    const p = this.player;
    const spot = roadPoint(rng, this.city);
    if (dist(spot.x, spot.y, p.x, p.y) < 420) return null;
    const car = {
      id: carId++, x: spot.x, y: spot.y, a: 0, speed: 0, color: '#7d3c98', kind: 'rival',
      driver: 'rival', path: [], pathI: 0, hp: VEHICLES.rival.hp, stuck: 0, brakeLight: 0, air: 0, honkT: 0,
    };
    this.planRoute(car, false);
    this.cars.push(car);
    return car;
  }
  spawnDrop() {
    const spots = [
      { x: this.city.roads.v[3], y: this.city.roads.h[2] },
      { x: this.city.roads.v[9], y: this.city.roads.h[6] },
      { x: this.city.roads.v[6], y: this.city.roads.h[8] },
      { x: this.city.roads.v[10], y: this.city.roads.h[3] },
    ];
    const s = spots[(this.mission.data.collected || 0) % spots.length];
    this.mission.data.drop = { x: s.x + rf(this.rng, -20, 20), y: s.y + rf(this.rng, -20, 20) };
  }
  spawnEnemies() {
    const d = this.city.docks;
    const spots = [[-140, -60], [-90, 40], [-180, 30], [-60, -90]];
    for (const [dx, dy] of spots) this.addPed(true, d.x + dx, d.y + dy);
  }
  // ---------- wanted ----------
  stars() { return Math.min(5, Math.floor(this.wanted / 20)); }
  addWanted(n, reason) {
    if (this.wanted >= WANTED_MAX) return;
    this.wanted = clamp(this.wanted + n, 0, WANTED_MAX);
    this.wantedFlash = 0.6;
  }
  policeCount() { return [0, 1, 2, 3, 4, 5][this.stars()]; }
  // ---------- save / load ----------
  saveGame() {
    if (this.shotMode) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.player.cash, mission: this.mission.index, stage: this.mission.stage,
        x: this.player.x, y: this.player.y, hp: this.player.hp, ammo: this.player.ammo,
        timeH: this.timeH, storyDone: this.storyDone, jobsDone: this.jobsDone,
        weapon: this.player.weapon, armor: this.player.armor, weapons: this.player.weapons,
        postcards: this.postcards.map(pc => pc.found),
      }));
    } catch { /* storage unavailable */ }
  }
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s) return false;
      this.player.cash = s.cash; this.player.x = s.x; this.player.y = s.y;
      this.player.hp = s.hp; this.player.ammo = s.ammo; this.timeH = s.timeH;
      // Newer fields are optional: an older save simply keeps the defaults.
      if (s.weapon && WEAPONS[s.weapon]) this.player.weapon = s.weapon;
      if (typeof s.armor === 'number') this.player.armor = s.armor;
      if (s.weapons) this.player.weapons = s.weapons;
      if (this.player.weapons[this.player.weapon]) this.player.weapons[this.player.weapon].ammo = s.ammo;
      if (Array.isArray(s.postcards)) {
        for (let i = 0; i < this.postcards.length && i < s.postcards.length; i++) this.postcards[i].found = !!s.postcards[i];
        this.postcardsFound = this.postcards.filter(pc => pc.found).length;
      }
      this.storyDone = !!s.storyDone; this.jobsDone = s.jobsDone || 0;
      this.mission.index = Math.min(s.mission, MISSIONS.length - 1);
      this.mission.stage = s.stage || 0; this.mission.done = false; this.mission.data = {};
      if (this.storyDone) this.mission.index = MISSIONS.length - 1;
      if (this.mission.index === 1) this.spawnDrop();
      if (this.mission.index === 4) this.setupRace();
      if (this.mission.index === 5) this.setupHeist();
      if (this.mission.index === 7) this.setupDeliveryChain();
      this.setObjective();
      return true;
    } catch { return false; }
  }
}

// ---- update loop ----
World.prototype.update = function (dt, input, audio) {
  if (this.screen !== 'play') return;
  this.time += dt;
  this.timeH = (this.timeH + dt / DAY_LENGTH) % 24;
  this.rainT -= dt;
  if (this.rainT <= 0) { this.rainT = 45 + this.rng() * 45; this.rain = this.rng() < 0.3 ? 1 : 0; }
  if (this.msgT > 0) this.msgT -= dt;
  if (this.wantedFlash > 0) this.wantedFlash -= dt;
  this.shootT -= dt;
  const p = this.player;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.onFoot) this.updatePlayer(dt, input, audio);
  else this.updatePlayerCar(dt, input, audio);
  this.updateTraffic(dt, audio);
  this.updatePeds(dt);
  this.updatePolice(dt, audio);
  this.updateHeli(dt);
  this.updateRivals(dt);
  this.updateWanted(dt);
  this.updateMissions(dt);
  this.updatePickups(dt);
  this.updateParticles(dt);
  this.updateJob(dt);
  this.updateServices(dt, audio);
  // Camera follows the player (or their car).
  const focus = p.onFoot ? p : p.car;
  const tz = p.onFoot ? 1.0 : 0.82;
  this.cam.x = lerp(this.cam.x, focus.x, 1 - Math.pow(0.001, dt));
  this.cam.y = lerp(this.cam.y, focus.y, 1 - Math.pow(0.001, dt));
  this.cam.zoom = lerp(this.cam.zoom, tz, 1 - Math.pow(0.01, dt));
  if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 3);
  // Engine + siren audio (engine pitch follows the vehicle: sports rev higher,
  // trucks and buses rumble lower).
  const driving = !p.onFoot && p.car;
  const pitch = driving ? (p.car.kind === 'sport' ? 1.25 : p.car.kind === 'truck' || p.car.kind === 'bus' ? 0.7 : 1) : 1;
  audio.engine(driving ? Math.abs(p.car.speed) / CAR_MAX : 0, !!driving, pitch);
  audio.siren(this.cars.some(c => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 700), dt);
  if (this.time % 1 < dt) this.saveGame();
};

World.prototype.moveWithCollision = function (e, dx, dy, r) {
  // Axis-separated movement against buildings and the world bounds.
  const nx = clamp(e.x + dx, 20, WORLD_W - 20), ny = clamp(e.y + dy, 20, WORLD_H + BEACH_H - 90);
  if (!inBuilding(this.city, nx, e.y, r) && !inWater(this.city, nx, e.y)) e.x = nx;
  if (!inBuilding(this.city, e.x, ny, r) && !inWater(this.city, e.x, ny)) e.y = ny;
};

World.prototype.updatePlayer = function (dt, input, audio) {
  const p = this.player;
  const ax = input.axis();
  const sprint = !!(input.keys.shift);
  const sp = sprint ? PLAYER_SPRINT : PLAYER_SPEED;
  const mx = ax.x, my = ax.y;
  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    const len = Math.hypot(mx, my);
    this.moveWithCollision(p, (mx / len) * sp * dt, (my / len) * sp * dt, PLAYER_R);
    p.a = Math.atan2(my, mx);
  }
  // Aim at the mouse (world coords are set by main.js each frame).
  p.aim = Math.atan2(input.mouse.wy - p.y, input.mouse.wx - p.x);
  // Weapon switching: 1/2/3 directly, Q or the mouse wheel to cycle.
  if (input.pressed('1')) this.switchWeapon('pistol', audio);
  else if (input.pressed('2')) this.switchWeapon('smg', audio);
  else if (input.pressed('3')) this.switchWeapon('shotgun', audio);
  else if (input.pressed('q')) {
    const i = WEAPON_ORDER.indexOf(p.weapon);
    this.switchWeapon(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length], audio);
  } else if (input.mouse.wheel) {
    const i = WEAPON_ORDER.indexOf(p.weapon);
    const step = Math.sign(input.mouse.wheel);
    this.switchWeapon(WEAPON_ORDER[(i + step + WEAPON_ORDER.length) % WEAPON_ORDER.length], audio);
  }
  // Shoot (weapon-aware: rate, damage, range, pellets + spread).
  const w = WEAPONS[p.weapon] || WEAPONS.pistol;
  if ((input.mouse.down || input.mouse.clicked) && this.shootT <= 0 && p.ammo > 0) {
    this.shootT = w.rate; p.ammo--;
    if (p.weapons[p.weapon]) p.weapons[p.weapon].ammo = p.ammo;
    audio.shot();
    for (let i = 0; i < w.pellets; i++) {
      const spread = w.spread ? (this.rng() * 2 - 1) * w.spread : 0;
      this.fireBullet(p.x, p.y, p.aim + spread, true, w.damage, w.range);
    }
    // Muzzle flash + an ejected shell casing arcing off to the side.
    this.burst(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16, '#ffd76a', 4, 90);
    this.particles.push({
      x: p.x + Math.cos(p.aim + 1.2) * 10, y: p.y + Math.sin(p.aim + 1.2) * 10,
      vx: Math.cos(p.aim + 1.2) * 60, vy: Math.sin(p.aim + 1.2) * 60 - 40,
      life: 0.5, max: 0.5, color: '#e8c85a', size: 2, kind: 'casing',
    });
    this.cam.shake = Math.max(this.cam.shake, p.weapon === 'shotgun' ? 0.22 : 0.12);
    if (this.peds.some(pd => !pd.dead && dist(pd.x, pd.y, p.x, p.y) < 320) || this.cops.length) this.addWanted(4, 'shot');
  }
  // Enter a car (never a police car — those are locked).
  if (input.pressed('e')) {
    const car = this.nearestCar(p.x, p.y, 64, true);
    if (car) this.enterCar(car, audio);
  }
  // Pick up cash / health / ammo / armor / weapons lying around.
  for (const pk of this.pickups) {
    if (!pk.taken && dist2(p.x, p.y, pk.x, pk.y) < 36 * 36) {
      pk.taken = true;
      if (pk.kind === 'cash') { p.cash += pk.amount; audio.cash(); this.popText(pk.x, pk.y, '+$' + pk.amount); this.showMsg(`+$${pk.amount}`, '', 1.2); }
      else if (pk.kind === 'health') { p.hp = Math.min(PLAYER_HEALTH, p.hp + 40); audio.pickup(); this.showMsg('+40 HEALTH', '', 1.2); }
      else if (pk.kind === 'armor') { p.armor = ARMOR_MAX; audio.pickup(); this.showMsg('BODY ARMOR', 'Soaks up damage first', 1.5); }
      else if (pk.kind === 'weapon') {
        const key = pk.weapon || 'smg';
        if (!p.weapons[key]) p.weapons[key] = { ammo: 0 };
        p.weapons[key].ammo += key === 'smg' ? 60 : 12;
        this.switchWeapon(key, audio);
        this.showMsg((WEAPONS[key] || {}).name || 'WEAPON', 'Press 1/2/3 to switch', 1.8);
      }
      else {
        p.ammo += 12;
        if (p.weapons[p.weapon]) p.weapons[p.weapon].ammo = p.ammo;
        audio.pickup(); this.showMsg('+12 AMMO', '', 1.2);
      }
    }
  }
  // Collect a hidden postcard by walking over it ($100 each, $1000 for all 20).
  for (const pc of this.postcards) {
    if (!pc.found && dist2(p.x, p.y, pc.x, pc.y) < 32 * 32) {
      pc.found = true;
      this.postcardsFound++;
      p.cash += 100;
      this.popText(pc.x, pc.y, '+$100', '#f39c12');
      this.showMsg(`POSTCARD ${this.postcardsFound}/20`, 'Solmar Bay collection!', 1.8);
      audio.pickup();
      if (this.postcardsFound === 20) {
        p.cash += 1000;
        this.showMsg('COLLECTION COMPLETE', 'All 20 postcards — +$1000 bonus!', 4);
      }
      this.saveGame();
      break;
    }
  }
};

World.prototype.switchWeapon = function (key, audio) {
  const p = this.player;
  if (!WEAPONS[key] || p.weapon === key) return;
  if (p.weapons[p.weapon]) p.weapons[p.weapon].ammo = p.ammo;
  p.weapon = key;
  if (!p.weapons[key]) p.weapons[key] = { ammo: 0 };
  p.ammo = p.weapons[key].ammo;
  this.shootT = Math.max(this.shootT, 0.15);
  if (audio) audio.click();
};

// Damage the player: body armor soaks it first, then health.
World.prototype.damagePlayer = function (n) {
  const p = this.player;
  if (p.invuln > 0) return;
  if ((p.armor || 0) > 0) {
    const soaked = Math.min(p.armor, n);
    p.armor -= soaked; n -= soaked;
  }
  p.hp -= n;
  if (p.hp <= 0) this.wastePlayer();
};

World.prototype.nearestCar = function (x, y, maxD, skipPolice) {
  let best = null, bd = maxD * maxD;
  for (const c of this.cars) {
    if (skipPolice && c.kind === 'police') continue;
    const d = dist2(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
};

World.prototype.enterCar = function (car, audio) {
  const p = this.player;
  // Mission vehicles (the armored truck, the race rival) are locked.
  if (car.driver === 'truck' || car.driver === 'racer') {
    this.showMsg('LOCKED', 'That one is not yours to take.', 1.2);
    return;
  }
  if (car.driver === 'traffic') {
    // Steal it: the driver bails and runs.
    this.addPed(false, car.x + 30, car.y + 10);
    const d = this.peds[this.peds.length - 1];
    d.panic = 3; d.state = 'flee';
    this.addWanted(20, 'theft');
    this.stats.stolen++;
    this.showMsg('CAR STOLEN', 'The heat is on — drive!', 2);
    audio.horn();
  }
  car.driver = 'player';
  p.onFoot = false; p.car = car;
  audio.click();
};

World.prototype.exitCar = function (audio) {
  const p = this.player;
  if (!p.car) return;
  const car = p.car;
  car.driver = null; car.speed = 0;
  p.x = car.x + Math.cos(car.a + Math.PI / 2) * 44;
  p.y = car.y + Math.sin(car.a + Math.PI / 2) * 44;
  if (inBuilding(this.city, p.x, p.y, PLAYER_R)) { p.x = car.x - Math.cos(car.a + Math.PI / 2) * 44; p.y = car.y - Math.sin(car.a + Math.PI / 2) * 44; }
  p.onFoot = true; p.car = null; p.a = car.a;
  if (audio) audio.click();
};

World.prototype.updatePlayerCar = function (dt, input, audio) {
  const p = this.player, car = p.car;
  const spec = VEHICLES[car.kind] || VEHICLES.sedan;
  const ax = input.axis();
  // ax.y: -1 = W (accelerate), +1 = S (brake/reverse); ax.x steers.
  car.brakeLight = 0;
  if (car.air > 0) {
    // Airborne off a stunt ramp: no drive, gentle steering, then land.
    car.air -= dt;
    car.a += ax.x * spec.turn * 0.4 * dt;
    if (car.air <= 0) {
      car.air = 0;
      const bonus = Math.round((car.airTime || 0) * 60);
      if (bonus >= 30) { p.cash += bonus; this.showMsg(`STUNT +$${bonus}`, 'Nice air!', 1.5); audio.cash(); }
      this.burst(car.x, car.y, '#cfc8b8', 8, 120);
      this.cam.shake = Math.max(this.cam.shake, 0.18);
      car.airTime = 0;
    }
  } else if (ax.y < 0) car.speed += spec.accel * dt;
  else if (ax.y > 0) { car.speed -= (car.speed > 10 ? CAR_BRAKE : CAR_REVERSE) * dt; car.brakeLight = 0.2; }
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  // A Rosa's Garage engine tune raises this car's top speed by 15%.
  const topSpeed = spec.max * (car.upgrades && car.upgrades.engine ? 1.15 : 1);
  car.speed = clamp(car.speed, -CAR_MAX_REVERSE, topSpeed);
  const steer = ax.x * spec.turn * clamp(Math.abs(car.speed) / 160, 0.15, 1) * (car.speed < 0 ? -1 : 1);
  if (car.air <= 0) car.a += steer * dt * (input.keys[' '] ? 1.6 : 1);
  const nx = car.x + Math.cos(car.a) * car.speed * dt;
  const ny = car.y + Math.sin(car.a) * car.speed * dt;
  // Stunt ramps: cross one fast and you're airborne.
  if (car.air <= 0 && Math.abs(car.speed) > 260 && this.city.ramps) {
    for (const rp of this.city.ramps) {
      if (dist2(nx, ny, rp.x, rp.y) < 30 * 30) {
        car.air = clamp(Math.abs(car.speed) / 700, 0.35, 0.9);
        car.airTime = car.air;
        if (audio.stunt) audio.stunt(); else audio.horn();
        break;
      }
    }
  }
  // Collisions: buildings, other cars, peds, water.
  const hitB = inBuilding(this.city, nx, ny, 16);
  if (hitB || inWater(this.city, nx, ny)) {
    if (Math.abs(car.speed) > 120) {
      audio.crash(Math.min(1, Math.abs(car.speed) / 400));
      this.burst(car.x, car.y, '#ffb347', 10, 160);
      this.cam.shake = Math.max(this.cam.shake, 0.35);
      car.hp -= Math.abs(car.speed) * 0.06;
    }
    car.speed *= -0.25;
  } else {
    car.x = nx; car.y = ny;
  }
  // Car vs car.
  for (const o of this.cars) {
    if (o === car) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    if (d < 46 && d > 0.01) {
      const push = (46 - d) / 2, ux = (car.x - o.x) / d, uy = (car.y - o.y) / d;
      car.x += ux * push; car.y += uy * push;
      if (o.driver === 'traffic' || o.driver === 'police') { o.x -= ux * push; o.y -= uy * push; }
      const rel = Math.abs(car.speed - o.speed);
      if (rel > 90) {
        audio.crash(Math.min(1, rel / 400));
        this.burst((car.x + o.x) / 2, (car.y + o.y) / 2, '#ffd76a', 8, 140);
        this.cam.shake = Math.max(this.cam.shake, 0.25);
        car.hp -= rel * 0.04; o.hp -= rel * 0.04;
        if (o.driver === 'traffic') this.addWanted(3, 'crash');
      }
      car.speed *= 0.6; o.speed *= 0.6;
    }
  }
  // Car vs ped.
  for (const pd of this.peds) {
    if (pd.dead) continue;
    if (dist2(car.x, car.y, pd.x, pd.y) < 34 * 34 && Math.abs(car.speed) > 40) {
      pd.dead = true; pd.dropT = 0;
      this.burst(pd.x, pd.y, '#ff5b5b', 8, 120);
      this.addWanted(15, 'ped');
      car.speed *= 0.7;
      audio.crash(0.5);
    }
  }
  // Exhaust + skid marks.
  if (Math.abs(car.speed) > 60 && this.rng() < 0.5) {
    this.particles.push({ x: car.x - Math.cos(car.a) * 32, y: car.y - Math.sin(car.a) * 32, vx: -Math.cos(car.a) * 20 + rf(this.rng, -15, 15), vy: -Math.sin(car.a) * 20 + rf(this.rng, -15, 15), life: 0.5, max: 0.5, color: 'rgba(200,200,200,0.5)', size: 4, kind: 'smoke' });
  }
  if (input.keys[' '] && Math.abs(car.speed) > 150) {
    this.skids.push({ x: car.x, y: car.y, a: car.a, life: 2 });
  }
  // Wrecked car: force the player out.
  if (car.hp <= 0) {
    this.burst(car.x, car.y, '#ff7b2f', 22, 260);
    this.burst(car.x, car.y, '#555', 14, 120);
    audio.crash(1);
    this.cam.shake = 0.6;
    this.exitCar(audio);
    car.hp = 0; car.driver = null; car.burning = true;
  }
  if (input.pressed('e')) this.exitCar(audio);
  if (input.pressed('h')) {
    if ((car.kind === 'truck' || car.kind === 'bus') && audio.hornBig) audio.hornBig(); else audio.horn();
    this.hornT = 0.3;
  }
  p.x = car.x; p.y = car.y; p.a = car.a;
};

World.prototype.fireBullet = function (x, y, angle, byPlayer, damage = PISTOL_DAMAGE, range = PISTOL_RANGE) {
  // Step along the ray; first enemy / car / building hit takes the shot.
  const step = 14;
  for (let d = 20; d < range; d += step) {
    const bx = x + Math.cos(angle) * d, by = y + Math.sin(angle) * d;
    if (inBuilding(this.city, bx, by, 0)) { this.burst(bx, by, '#cfc8b8', 4, 80); return; }
    for (const pd of this.peds) {
      if (pd.dead) continue;
      if (dist2(bx, by, pd.x, pd.y) < 16 * 16) {
        pd.hp -= damage;
        this.burst(pd.x, pd.y, '#ff5b5b', 6, 110);
        if (pd.hp <= 0) this.killPed(pd, byPlayer);
        return;
      }
    }
    for (const c of this.cars) {
      if (dist2(bx, by, c.x, c.y) < 30 * 30) {
        c.hp -= damage * 0.6;
        if (c.hp <= 0) c.burning = true;
        this.burst(bx, by, '#ffd76a', 5, 100);
        return;
      }
    }
  }
};

World.prototype.killPed = function (pd, byPlayer) {
  pd.dead = true; pd.dropT = 0;
  this.burst(pd.x, pd.y, '#ff5b5b', 12, 150);
  if (byPlayer) {
    this.stats.kills++;
    this.addWanted(10, 'kill');
    const cash = pd.enemy ? ri(this.rng, 40, 90) : 0;
    if (cash) this.pickups.push({ x: pd.x, y: pd.y, kind: 'cash', amount: cash, taken: false });
    // Armed rivals sometimes drop their gun.
    if (pd.enemy && this.rng() < 0.35) {
      this.pickups.push({ x: pd.x + 14, y: pd.y + 10, kind: 'weapon', weapon: this.rng() < 0.6 ? 'smg' : 'shotgun', taken: false });
    }
  }
};

// ---- traffic, pedestrians, police, wanted, missions ----
World.prototype.updateTraffic = function (dt, audio) {
  const p = this.player;
  for (let i = this.cars.length - 1; i >= 0; i--) {
    const c = this.cars[i];
    if (c.driver !== 'traffic' && c.driver !== 'truck') continue;
    // A wrecked car catches fire and stops for good (smoke in updateParticles).
    if (c.hp <= 0) c.burning = true;
    if (c.burning) { c.speed = 0; continue; }
    // The armored truck stops for good once it's been cracked open (heist).
    if (c.driver === 'truck' && c.hp <= 90) { c.speed = 0; c.brakeLight = 0.2; continue; }
    // Follow the route, one node at a time, keeping to the right-hand lane:
    // aim at a point offset right of the centre line so opposing flows pass
    // cleanly and queues form in-lane instead of bunching at intersections.
    const target = c.path[c.pathI];
    if (!target) { this.planRoute(c, true); continue; }
    const dx = target.x - c.x, dy = target.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 26) { c.pathI++; if (c.pathI >= c.path.length) this.planRoute(c, true); continue; }
    const want = Math.atan2(dy, dx);
    const laneX = target.x + Math.cos(want + Math.PI / 2) * 11;
    const laneY = target.y + Math.sin(want + Math.PI / 2) * 11;
    c.a = turnToward(c.a, Math.atan2(laneY - c.y, laneX - c.x), 2.2 * dt);
    // Gap-keeping: find the nearest car ahead in-lane and match its pace,
    // slowing smoothly as the gap closes (no more binary stop/go bunching).
    let gap = Infinity, aheadSpeed = TRAFFIC_SPEED;
    for (const o of this.cars) {
      if (o === c) continue;
      const ox = o.x - c.x, oy = o.y - c.y;
      const along = ox * Math.cos(c.a) + oy * Math.sin(c.a);
      const side = Math.abs(-ox * Math.sin(c.a) + oy * Math.cos(c.a));
      if (along > 0 && along < 150 && side < 26 && along < gap) { gap = along; aheadSpeed = Math.abs(o.speed); }
    }
    let targetSpeed = TRAFFIC_SPEED;
    if (gap < 52) targetSpeed = 0;
    else if (gap < 150) targetSpeed = Math.min(TRAFFIC_SPEED, aheadSpeed + (gap - 52) * 1.6);
    // Intersection queueing: ease off when the next node is close and another
    // car is crossing it, so streams merge instead of piling up.
    if (d < 90) {
      for (const o of this.cars) {
        if (o === c || o.driver === 'player') continue;
        if (dist2(o.x, o.y, target.x, target.y) < 44 * 44 && Math.abs(o.speed) > 30) { targetSpeed = Math.min(targetSpeed, 30); break; }
      }
    }
    const prevSpeed = c.speed;
    c.speed = lerp(c.speed, targetSpeed, 1 - Math.pow(0.05, dt));
    c.brakeLight = c.speed < prevSpeed - 4 ? 0.2 : Math.max(0, (c.brakeLight || 0) - dt);
    // Honk when stuck behind someone for a while.
    if (gap < 52 && Math.abs(c.speed) < 8) {
      c.honkT = (c.honkT || 0) + dt;
      if (c.honkT > 2.2 && audio && dist(c.x, c.y, p.x, p.y) < 500) {
        if ((c.kind === 'truck' || c.kind === 'bus') && audio.hornBig) audio.hornBig(); else audio.horn();
        c.honkT = 0;
      }
    } else c.honkT = 0;
    const nx = c.x + Math.cos(c.a) * c.speed * dt, ny = c.y + Math.sin(c.a) * c.speed * dt;
    if (!inBuilding(this.city, nx, ny, 14) && !inWater(this.city, nx, ny)) { c.x = nx; c.y = ny; }
    else { this.planRoute(c, true); }
    c.stuck += dt;
    if (c.stuck > 8) { this.planRoute(c, true); c.stuck = 0; }
    // Recycle far-away traffic so the streets stay busy near the player.
    if (c.driver === 'traffic' && dist(c.x, c.y, p.x, p.y) > 1400) {
      const np = roadPoint(this.rng, this.city);
      const near = Math.abs(np.x - p.x) < 900 && Math.abs(np.y - p.y) < 700;
      if (near) { c.x = np.x; c.y = np.y; this.planRoute(c, true); }
    }
  }
};

World.prototype.updatePeds = function (dt) {
  const p = this.player;
  for (const pd of this.peds) {
    if (pd.dead) { pd.dropT += dt; continue; }
    if (pd.enemy) {
      // Armed rival: close in and shoot at the player.
      const d = dist(pd.x, pd.y, p.x, p.y);
      pd.shootT -= dt;
      if (d > 260) {
        pd.a = angTo(pd.x, pd.y, p.x, p.y);
        this.moveWithCollision(pd, Math.cos(pd.a) * 95 * dt, Math.sin(pd.a) * 95 * dt, 10);
      } else if (pd.shootT <= 0 && d < PISTOL_RANGE) {
        pd.shootT = rf(this.rng, 0.9, 1.6);
        const aim = angTo(pd.x, pd.y, p.x, p.y) + rf(this.rng, -0.12, 0.12);
        this.burst(pd.x + Math.cos(aim) * 16, pd.y + Math.sin(aim) * 16, '#ffd76a', 3, 80);
        // Enemy bullet: hit chance falls with distance.
        if (this.rng() < clamp(0.55 - d / 900, 0.08, 0.5) && p.invuln <= 0) {
          this.burst(p.x, p.y, '#ff5b5b', 5, 90);
          this.cam.shake = Math.max(this.cam.shake, 0.2);
          this.damagePlayer(9);
        }
      }
      continue;
    }
    if (pd.panic > 0) {
      pd.panic -= dt;
      pd.a = angTo(p.x, p.y, pd.x, pd.y);
      this.moveWithCollision(pd, Math.cos(pd.a) * 150 * dt, Math.sin(pd.a) * 150 * dt, 10);
      continue;
    }
    // Stroll to the walk target, then pick a new one.
    const d = dist(pd.x, pd.y, pd.tx, pd.ty);
    if (d < 12) { this.pickWalkTarget(pd); continue; }
    pd.a = angTo(pd.x, pd.y, pd.tx, pd.ty);
    this.moveWithCollision(pd, Math.cos(pd.a) * pd.speed * dt, Math.sin(pd.a) * pd.speed * dt, 10);
    // Flee gunfire and speeding cars.
    if (this.shootT > PISTOL_RATE - 0.1 && dist(pd.x, pd.y, p.x, p.y) < 300) pd.panic = 2;
    for (const c of this.cars) {
      if (Math.abs(c.speed) > 200 && dist2(pd.x, pd.y, c.x, c.y) < 90 * 90) { pd.panic = 2; break; }
    }
  }
  // Drop dead peds after a while (keep the streets clean).
  this.peds = this.peds.filter(pd => !pd.dead || pd.dropT < 6);
};

World.prototype.updatePolice = function (dt, audio) {
  const p = this.player;
  const want = this.policeCount();
  // Spawn police cars to match the wanted level.
  const have = this.cars.filter(c => c.kind === 'police').length;
  if (have < want && this.rng() < dt * 1.2) {
    const spot = roadPoint(this.rng, this.city);
    if (dist(spot.x, spot.y, p.x, p.y) > 500) {
      const car = { id: carId++, x: spot.x, y: spot.y, a: 0, speed: 0, color: PAL.police, kind: 'police', driver: 'police', path: [], pathI: 0, hp: 150, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
      this.planRoute(car, false);
      this.cars.push(car);
    }
  }
  // Remove police when the heat is gone.
  if (want === 0) {
    this.cars = this.cars.filter(c => c.kind !== 'police' || dist(c.x, c.y, p.x, p.y) < 500);
    if (this.cops.length && this.wanted <= 0) this.cops = [];
  }
  // Police cars pursue: route to the player's node, then ram.
  for (const c of this.cars) {
    if (c.kind !== 'police') continue;
    // Roadblock cruisers (and burning wrecks) hold position — no pursuit.
    if (c.blockade || c.burning) { c.speed = 0; continue; }
    const target = c.path[c.pathI];
    const dPlayer = dist(c.x, c.y, p.x, p.y);
    if (dPlayer < 320) {
      // Close pursuit: steer straight at the player.
      c.a = turnToward(c.a, angTo(c.x, c.y, p.x, p.y), 3.2 * dt);
      c.speed = lerp(c.speed, CAR_MAX * 0.92, 1 - Math.pow(0.1, dt));
    } else if (target) {
      const d = dist(c.x, c.y, target.x, target.y);
      if (d < 30) { c.pathI++; if (c.pathI >= c.path.length) this.planRoute(c, false); continue; }
      c.a = turnToward(c.a, angTo(c.x, c.y, target.x, target.y), 3 * dt);
      c.speed = lerp(c.speed, CAR_MAX * 0.85, 1 - Math.pow(0.1, dt));
    }
    const nx = c.x + Math.cos(c.a) * c.speed * dt, ny = c.y + Math.sin(c.a) * c.speed * dt;
    if (!inBuilding(this.city, nx, ny, 15) && !inWater(this.city, nx, ny)) { c.x = nx; c.y = ny; }
    else { this.planRoute(c, false); }
    // Ram the player's car: damage + a shove, but never an instant stop — the
    // player must be able to break away by accelerating.
    if (!p.onFoot && p.car && dist2(c.x, c.y, p.car.x, p.car.y) < 48 * 48) {
      p.car.hp -= 14 * dt;
      p.car.speed *= (1 - 0.45 * dt);
      c.speed *= (1 - 0.8 * dt);
      if (this.rng() < dt * 2) this.burst((c.x + p.car.x) / 2, (c.y + p.car.y) / 2, '#ffd76a', 4, 100);
      if (p.car.hp <= 0) { /* wreck handled in updatePlayerCar */ }
    }
  }
  // Foot cops: spawn at 2+ stars, chase on foot, bust on touch.
  if (this.stars() >= 2 && this.cops.length < this.stars() - 1 && p.onFoot && this.rng() < dt * 0.8) {
    const spot = roadPoint(this.rng, this.city);
    if (dist(spot.x, spot.y, p.x, p.y) > 260 && dist(spot.x, spot.y, p.x, p.y) < 700) {
      this.cops.push({ x: spot.x, y: spot.y, a: 0, bustT: 0 });
    }
  }
  for (const cop of this.cops) {
    if (!p.onFoot) { cop.bustT = 0; continue; }
    const d = dist(cop.x, cop.y, p.x, p.y);
    cop.a = angTo(cop.x, cop.y, p.x, p.y);
    this.moveWithCollision(cop, Math.cos(cop.a) * 185 * dt, Math.sin(cop.a) * 185 * dt, 10);
    if (d < POLICE_RAM) {
      cop.bustT += dt;
      if (cop.bustT > 1.2) { this.bustPlayer(); return; }
    } else cop.bustT = Math.max(0, cop.bustT - dt * 2);
  }
};

// Police helicopter: at 3+ stars (wanted >= 60) an air unit shadows the
// player from above. Visual pressure only — it never collides, shoots or
// busts; it orbits ~260px out with its spotlight on you until the heat
// dies below 2 stars (wanted < 40). The flight path is driven by world.time
// (a slow orbit), so it is deterministic for a given seed + inputs; the
// spawn offset derives from the player's facing, no rng draws needed.
World.prototype.updateHeli = function (dt) {
  const p = this.player;
  if (!this.heli && this.wanted >= 60) {
    const a = p.a + Math.PI; // come in from behind the player
    this.heli = { x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420 - 120, a: p.a };
  }
  if (!this.heli) return;
  if (this.wanted < 40) { this.heli = null; return; }
  const oa = this.time * 0.35;
  const hx = p.x + Math.cos(oa) * 260, hy = p.y + Math.sin(oa) * 260 - 60;
  const px = this.heli.x, py = this.heli.y;
  const k = 1 - Math.pow(0.02, dt);
  this.heli.x = lerp(this.heli.x, hx, k);
  this.heli.y = lerp(this.heli.y, hy, k);
  // Face the direction of travel; when settled into the hover, face the player.
  const mvx = this.heli.x - px, mvy = this.heli.y - py;
  if (mvx * mvx + mvy * mvy > 0.01) this.heli.a = Math.atan2(mvy, mvx);
  else this.heli.a = angTo(this.heli.x, this.heli.y, p.x, p.y);
};

// Marlin rival-crew cars: at 4-5 stars (and during the escort) they hunt the
// player and ram — no bust, just damage and menace. Also drives the street-race
// rival through the checkpoint list during mission 5.
World.prototype.updateRivals = function (dt) {
  const p = this.player;
  const escortActive = this.mission.index === 6 && this.mission.stage === 1 && !this.mission.done;
  const wantRivals = escortActive ? 2 : (this.stars() >= 4 ? 2 : 0);
  const have = this.cars.filter(c => c.kind === 'rival').length;
  this.rivalT -= dt;
  if (have < wantRivals && this.rivalT <= 0) { this.spawnRivalCar(); this.rivalT = 6; }
  if (wantRivals === 0) {
    this.cars = this.cars.filter(c => c.kind !== 'rival' || dist(c.x, c.y, p.x, p.y) < 600);
  }
  for (const c of this.cars) {
    if (c.kind !== 'rival') continue;
    if (c.burning) { c.speed = 0; continue; }
    const dPlayer = dist(c.x, c.y, p.x, p.y);
    const target = c.path[c.pathI];
    if (dPlayer < 380) {
      c.a = turnToward(c.a, angTo(c.x, c.y, p.x, p.y), 3.0 * dt);
      c.speed = lerp(c.speed, VEHICLES.rival.max * 0.94, 1 - Math.pow(0.1, dt));
    } else if (target) {
      const d = dist(c.x, c.y, target.x, target.y);
      if (d < 30) { c.pathI++; if (c.pathI >= c.path.length) this.planRoute(c, false); continue; }
      c.a = turnToward(c.a, angTo(c.x, c.y, target.x, target.y), 3 * dt);
      c.speed = lerp(c.speed, VEHICLES.rival.max * 0.85, 1 - Math.pow(0.1, dt));
    }
    const nx = c.x + Math.cos(c.a) * c.speed * dt, ny = c.y + Math.sin(c.a) * c.speed * dt;
    if (!inBuilding(this.city, nx, ny, 15) && !inWater(this.city, nx, ny)) { c.x = nx; c.y = ny; }
    else { this.planRoute(c, false); }
    if (!p.onFoot && p.car && dist2(c.x, c.y, p.car.x, p.car.y) < 48 * 48) {
      p.car.hp -= 18 * dt;
      p.car.speed *= (1 - 0.35 * dt);
      c.speed *= (1 - 0.7 * dt);
      if (this.rng() < dt * 2) this.burst((c.x + p.car.x) / 2, (c.y + p.car.y) / 2, '#ffd76a', 4, 100);
    }
  }
  // The street-race rival drives the checkpoint list (mission 5).
  if (this.mission.index === 4 && this.mission.stage === 1 && this.mission.data.rivalId) {
    const r = this.cars.find(c => c.id === this.mission.data.rivalId);
    const cps = this.mission.data.checkpoints || [];
    const cp = cps[this.mission.data.rivalCpI || 0];
    if (r && cp) {
      const d = dist(r.x, r.y, cp.x, cp.y);
      if (d < 54) this.mission.data.rivalCpI = (this.mission.data.rivalCpI || 0) + 1;
      else {
        r.a = turnToward(r.a, angTo(r.x, r.y, cp.x, cp.y), 2.8 * dt);
        r.speed = lerp(r.speed, 430, 1 - Math.pow(0.08, dt));
        const nx = r.x + Math.cos(r.a) * r.speed * dt, ny = r.y + Math.sin(r.a) * r.speed * dt;
        if (!inBuilding(this.city, nx, ny, 15) && !inWater(this.city, nx, ny)) { r.x = nx; r.y = ny; }
      }
    }
  }
};

// Rosa's Garage (repair + respray clears the heat for cash) and the safehouse
// (heal + save) — drive/walk in and it happens, with a cooldown.
World.prototype.updateServices = function (dt, audio) {
  const p = this.player, c = this.city;
  if (this.shopT > 0) this.shopT -= dt;
  if (this.upgradeT > 0) this.upgradeT -= dt;
  if (this.safeT > 0) this.safeT -= dt;
  // Garage: in a car, near the marker, damaged or wanted → $100 fix.
  if (!p.onFoot && p.car && this.shopT <= 0 && dist2(p.x, p.y, c.garage.x, c.garage.y) < 52 * 52) {
    const spec = VEHICLES[p.car.kind] || VEHICLES.sedan;
    const maxHp = spec.hp + (p.car.upgrades && p.car.upgrades.armor ? 50 : 0);
    const needsFix = p.car.hp < maxHp || this.wanted > 0;
    if (needsFix && p.cash >= 100) {
      p.cash -= 100;
      p.car.hp = maxHp;
      this.wanted = 0;
      this.cars = this.cars.filter(car => car.kind !== 'police');
      this.cops = [];
      this.showMsg('REPAIRED + RESPRAYED', 'Heat cleared — $100', 2);
      audio.cash();
      this.shopT = 8;
      this.saveGame();
    }
  }
  // Garage upgrades: per-vehicle Engine Tune (+15% top speed, $300) and
  // Armor Plating (+50 hull, $400), auto-bought in tier order while parked
  // at Rosa's with a sound car and no heat on. Upgrades live on the car
  // object only — they are not saved (a fresh car starts stock).
  if (!p.onFoot && p.car && this.upgradeT <= 0 && dist2(p.x, p.y, c.garage.x, c.garage.y) < 52 * 52) {
    const car = p.car;
    if (!car.upgrades) car.upgrades = { engine: 0, armor: 0 };
    const spec = VEHICLES[car.kind] || VEHICLES.sedan;
    const sound = car.hp >= spec.hp + (car.upgrades.armor ? 50 : 0) && this.wanted <= 0;
    if (sound && car.upgrades.engine < 1 && p.cash >= 300) {
      p.cash -= 300;
      car.upgrades.engine = 1;
      this.showMsg('ENGINE TUNE', 'Top speed +15% — $300', 2.5);
      audio.cash();
      this.upgradeT = 8;
    } else if (sound && car.upgrades.armor < 1 && p.cash >= 400) {
      p.cash -= 400;
      car.upgrades.armor = 1;
      car.hp += 50;
      this.showMsg('ARMOR PLATING', 'Hull +50 — $400', 2.5);
      audio.cash();
      this.upgradeT = 8;
    }
  }
  // Safehouse: on foot, near the door → patch up and save.
  if (p.onFoot && this.safeT <= 0 && dist2(p.x, p.y, c.safehouse.x, c.safehouse.y) < 50 * 50) {
    if (p.hp < PLAYER_HEALTH) {
      p.hp = PLAYER_HEALTH;
      this.showMsg('SAFEHOUSE', 'Patched up. Progress saved.', 2);
      audio.pickup();
      this.safeT = 10;
      this.saveGame();
    }
  }
};

World.prototype.updateWanted = function (dt) {
  const p = this.player;
  // Seen if any police is close (or a foot cop is near).
  this.wantedSeen = this.cars.some(c => c.kind === 'police' && dist(c.x, c.y, p.x, p.y) < 520)
    || this.cops.some(cp => dist(cp.x, cp.y, p.x, p.y) < 420);
  if (this.wanted > 0) {
    this.wanted = Math.max(0, this.wanted - (this.wantedSeen ? WANTED_SEEN_DECAY : WANTED_DECAY) * dt);
  }
};

World.prototype.updateMissions = function (dt) {
  const m = this.mission;
  if (m.done || this.storyDone) return;
  const p = this.player, c = this.city;
  if (m.index === 1) {
    m.timer -= dt;
    if (m.timer <= 0 && m.stage === 0) {
      m.timer = 150; // (re)start the clock on first frame
      if (!m.data.drop) this.spawnDrop();
    }
    if (m.timer <= 0) { this.showMsg('TOO SLOW', 'The drops moved on. Try again.', 3); m.timer = 150; m.data.collected = 0; this.spawnDrop(); this.setObjective(); return; }
    const drop = m.data.drop;
    if (drop && dist2(p.x, p.y, drop.x, drop.y) < 44 * 44) {
      m.data.collected = (m.data.collected || 0) + 1;
      p.cash += 150;
      this.showMsg(`DROP ${m.data.collected}/3`, '+$150', 1.5);
      if (m.data.collected >= 3) { this.missionPassed(); setTimeout(() => this.nextMission(), 1200); }
      else { this.spawnDrop(); this.setObjective(); }
    }
    this.setObjective();
    return;
  }
  const at = (x, y, r) => dist2(p.x, p.y, x, y) < r * r;
  if (m.index === 0) {
    if (m.stage === 0 && at(c.docks.x - 60, c.docks.y, 46)) { m.stage = 1; this.showMsg('PACKAGE SECURED', 'Now get it back to Rosa\'s Garage.', 2.5); this.setObjective(); }
    else if (m.stage === 1 && at(c.garage.x, c.garage.y, 46)) { this.missionPassed(); setTimeout(() => this.nextMission(), 1200); }
  } else if (m.index === 2) {
    if (m.stage === 0 && !p.onFoot && p.car && p.car.driver === 'player' && this.stats.stolen > (m.data.stolenAtStart || 0)) {
      m.stage = 1; this.addWanted(40, 'heat'); this.showMsg('HEAT IS ON', 'Lose the cops, then reach the safehouse.', 3); this.setObjective();
    } else if (m.stage === 1 && this.wanted < 8) {
      m.stage = 2; this.showMsg('CLEAN', 'Now get to the safehouse.', 2); this.setObjective();
    } else if (m.stage === 2 && at(c.safehouse.x, c.safehouse.y, 50)) { this.missionPassed(); setTimeout(() => this.nextMission(), 1200); }
  } else if (m.index === 3) {
    if (m.stage === 0 && at(c.docks.x - 60, c.docks.y, 50)) { m.stage = 1; this.spawnEnemies(); this.showMsg('MARLIN CREW', 'Take them all out.', 3); this.setObjective(); }
    else if (m.stage === 1 && !this.peds.some(pd => pd.enemy && !pd.dead)) {
      m.stage = 2; this.addWanted(60, 'shootout'); this.showMsg('IT\'S DONE', 'The precinct is coming — run!', 3); this.setObjective();
    } else if (m.stage === 2 && at(c.safehouse.x, c.safehouse.y, 50)) { this.missionPassed(); setTimeout(() => this.nextMission(), 1500); }
  } else if (m.index === 4) {
    // Street Kings: checkpoint race vs the rival.
    if (m.stage === 0 && at(c.garage.x, c.garage.y + 140, 52)) {
      m.stage = 1; m.timer = 150; m.data.cpI = 0; m.data.rivalCpI = 0;
      this.spawnRivalRacer();
      this.showMsg('GO!', 'Five checkpoints — beat the rival to the line.', 3);
      this.setObjective();
    } else if (m.stage === 1) {
      m.timer -= dt;
      const cps = m.data.checkpoints || [];
      const cp = cps[m.data.cpI || 0];
      if (cp && at(cp.x, cp.y, 56)) {
        m.data.cpI = (m.data.cpI || 0) + 1;
        this.showMsg(`CHECKPOINT ${m.data.cpI}/5`, '', 1.2);
        if (m.data.cpI >= cps.length) {
          const r = this.cars.find(car => car.id === m.data.rivalId);
          if (r) r.driver = 'traffic';
          this.missionPassed(); setTimeout(() => this.nextMission(), 1200);
        } else this.setObjective();
      } else if ((m.data.rivalCpI || 0) >= cps.length || m.timer <= 0) {
        // Rival finished first (or the clock died): reset to the start line.
        this.showMsg('RACE LOST', 'The rival takes the crown. Back to the start line.', 3);
        const r = this.cars.find(car => car.id === m.data.rivalId);
        if (r) r.driver = 'traffic';
        m.stage = 0; m.data.cpI = 0; m.data.rivalCpI = 0; m.timer = 0;
        this.setObjective();
      } else this.setObjective();
    }
  } else if (m.index === 5) {
    // Armored Score: crack the truck, grab the cash, deliver it.
    const truck = this.cars.find(car => car.id === m.data.truckId);
    if (m.stage === 0) {
      if (!truck) { this.setupHeist(); }
      else if (truck.hp <= 90) {
        m.stage = 1;
        m.data.cashAt = { x: truck.x + 30, y: truck.y + 20 };
        this.addWanted(35, 'heist');
        this.showMsg('TRUCK CRACKED', 'Grab the cash!', 2.5);
        this.setObjective();
      } else this.setObjective();
    } else if (m.stage === 1 && m.data.cashAt && at(m.data.cashAt.x, m.data.cashAt.y, 48)) {
      m.stage = 2;
      this.showMsg('CASH SECURED', 'Get it to Rosa\'s Garage.', 2.5);
      this.setObjective();
    } else if (m.stage === 2 && at(c.garage.x, c.garage.y, 48)) { this.missionPassed(); setTimeout(() => this.nextMission(), 1200); }
  } else if (m.index === 6) {
    // Escort: pick up the accountant, get him to the safehouse.
    if (m.stage === 0 && at(c.hospital.x, c.hospital.y, 52)) {
      m.stage = 1;
      this.showMsg('ACCOUNTANT ABOARD', 'Safehouse — and watch for Marlin cars.', 3);
      this.setObjective();
    } else if (m.stage === 1 && at(c.safehouse.x, c.safehouse.y, 52)) { this.missionPassed(); setTimeout(() => this.nextMission(), 1200); }
  } else if (m.index === 7) {
    // Last Delivery: timed chain, then the docks.
    m.timer -= dt;
    const pts = m.data.points || [];
    const dp = pts[m.data.pi || 0];
    if (dp && at(dp.x, dp.y, 50)) {
      m.data.pi = (m.data.pi || 0) + 1;
      p.cash += 120;
      m.timer = 90;
      this.showMsg(`DELIVERY ${m.data.pi}/${pts.length}`, '+$120', 1.4);
      this.setObjective();
    } else if (!dp && at(c.docks.x - 60, c.docks.y, 52)) {
      this.missionPassed(); setTimeout(() => this.nextMission(), 1500);
    } else if (m.timer <= 0) {
      this.showMsg('TOO SLOW', 'The drop moved on — the chain restarts.', 3);
      m.data.pi = 0; m.timer = 90;
      this.setObjective();
    } else this.setObjective();
  }
  if (m.index === 1 && m.timer > 0) this.setObjective();
};

World.prototype.updatePickups = function (dt) {
  // Cash drops from kills fade after a while.
  this.pickups = this.pickups.filter(pk => !pk.taken);
};

World.prototype.updateParticles = function (dt) {
  for (const pt of this.particles) {
    pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 30 * dt;
  }
  this.particles = this.particles.filter(pt => pt.life > 0);
  // Cash popups float up and decelerate.
  for (const tp of this.textPops) { tp.life -= dt; tp.y += tp.vy * dt; tp.vy += 40 * dt; }
  this.textPops = this.textPops.filter(tp => tp.life > 0);
  for (const s of this.skids) s.life -= dt;
  this.skids = this.skids.filter(s => s.life > 0);
  // Burning wrecks smoke and flicker until the fire dies down. Emission is
  // rate-limited per car and hard-capped by the total particle count, so a
  // pile-up of wrecks can't flood the list.
  for (const c of this.cars) {
    if (!c.burning) continue;
    if (this.particles.length > 420) break;
    if (this.rng() < dt * 20) {
      this.particles.push({ x: c.x + rf(this.rng, -16, 16), y: c.y + rf(this.rng, -8, 8), vx: rf(this.rng, -12, 12), vy: rf(this.rng, -85, -50), life: rf(this.rng, 0.7, 1.3), max: 1.3, color: 'rgba(70,70,78,0.55)', size: rf(this.rng, 5, 10), kind: 'smoke' });
    }
    if (this.rng() < dt * 14) {
      this.particles.push({ x: c.x + rf(this.rng, -14, 14), y: c.y + rf(this.rng, -6, 6), vx: rf(this.rng, -20, 20), vy: rf(this.rng, -105, -60), life: rf(this.rng, 0.2, 0.45), max: 0.45, color: this.rng() < 0.5 ? '#ff8b37' : '#ffe2a0', size: rf(this.rng, 3, 6), kind: 'spark' });
    }
  }
  if (this.rain && this.rng() < 0.6) {
    this.particles.push({ x: this.cam.x + rf(this.rng, -700, 700), y: this.cam.y + rf(this.rng, -450, 450), vx: -40, vy: 420, life: 0.5, max: 0.5, color: 'rgba(180,200,220,0.6)', size: 1.5, kind: 'rain' });
  }
};

World.prototype.updateJob = function (dt) {
  if (!this.storyDone || this.mission.index < MISSIONS.length - 1) return;
  // Free-roam work: taxi fares and parcel deliveries alternate. Drive to the
  // pickup marker, then to the destination marker, for cash.
  if (!this.job) {
    if (this.rng() < dt * 0.05) {
      const spots = [this.city.garage, this.city.docks, this.city.hospital, this.city.pier, this.city.safehouse, this.city.marina || this.city.pier];
      const a = pick(this.rng, spots), b = pick(this.rng, spots);
      if (a !== b) {
        const delivery = this.rng() < 0.45;
        this.job = { stage: 0, from: a, to: b, fare: ri(this.rng, 80, 220), kind: delivery ? 'delivery' : 'fare' };
      }
    }
    return;
  }
  const p = this.player;
  if (this.job.stage === 0) {
    if (dist2(p.x, p.y, this.job.from.x, this.job.from.y) < 50 * 50) {
      this.job.stage = 1;
      this.showMsg(this.job.kind === 'delivery' ? 'PARCEL COLLECTED' : 'FARE PICKED UP', `Take ${this.job.kind === 'delivery' ? 'it' : 'them'} to ${this.job.to.label} — $${this.job.fare}`, 2.5);
    }
  } else if (dist2(p.x, p.y, this.job.to.x, this.job.to.y) < 50 * 50) {
    p.cash += this.job.fare; this.jobsDone++;
    this.showMsg(`${this.job.kind === 'delivery' ? 'DELIVERY' : 'FARE'} +$${this.job.fare}`, 'Nice driving.', 2);
    this.job = null; this.saveGame();
  }
  this.setObjective();
};

World.prototype.bustPlayer = function () {
  const p = this.player;
  this.stats.busted++;
  p.cash = Math.max(0, p.cash - BUST_FINE);
  this.wanted = 0; this.cops = [];
  this.cars = this.cars.filter(c => c.kind !== 'police');
  if (!p.onFoot) this.exitCar(null);
  p.x = this.city.precinct.x; p.y = this.city.precinct.y; p.hp = PLAYER_HEALTH; p.ammo = 12; p.invuln = 3;
  if (p.weapons[p.weapon]) p.weapons[p.weapon].ammo = 12;
  this.screen = 'busted';
  setTimeout(() => { if (this.screen === 'busted') this.screen = 'play'; }, 2600);
  this.saveGame();
};

World.prototype.wastePlayer = function () {
  const p = this.player;
  this.stats.wasted++;
  p.cash = Math.max(0, p.cash - WASTE_FINE);
  this.wanted = 0; this.cops = [];
  this.cars = this.cars.filter(c => c.kind !== 'police');
  if (!p.onFoot) this.exitCar(null);
  p.x = this.city.hospital.x; p.y = this.city.hospital.y; p.hp = PLAYER_HEALTH; p.ammo = 12; p.invuln = 3;
  if (p.weapons[p.weapon]) p.weapons[p.weapon].ammo = 12;
  this.screen = 'wasted';
  setTimeout(() => { if (this.screen === 'wasted') this.screen = 'play'; }, 2600);
  this.saveGame();
};

World.prototype.burst = function (x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = this.rng() * Math.PI * 2, s = rf(this.rng, speed * 0.3, speed);
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rf(this.rng, 0.25, 0.6), max: 0.6, color, size: rf(this.rng, 2, 4.5), kind: 'spark' });
  }
};
