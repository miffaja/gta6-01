// SOLMAR BAY — the world: player, cars, traffic, pedestrians, police, wanted system,
// missions, combat, particles, day/night, weather, save/load. All original.
import {
  SEED, WORLD_W, WORLD_H, BEACH_H, PLAYER_R, PLAYER_SPEED, PLAYER_SPRINT, PLAYER_HEALTH,
  CAR_W, CAR_L, CAR_ACCEL, CAR_BRAKE, CAR_REVERSE, CAR_MAX, CAR_MAX_REVERSE, CAR_TURN,
  TRAFFIC_COUNT, PED_COUNT, TRAFFIC_SPEED, WANTED_MAX, WANTED_DECAY, WANTED_SEEN_DECAY,
  PISTOL_DAMAGE, PISTOL_RANGE, PISTOL_RATE, ENEMY_HEALTH, START_CASH, BUST_FINE, WASTE_FINE,
  SAVE_KEY, DAY_LENGTH, PAL,
} from './config.js';
import { mulberry32, ri, rf, pick, clamp, lerp, dist, dist2, angTo, angDiff, turnToward } from './random.js';
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
];

let carId = 1;
export class World {
  constructor(seed = SEED) {
    this.seed = seed;
    this.city = buildCity(seed);
    this.rng = mulberry32(seed ^ 0x9e37);
    this.reset();
  }
  reset() {
    const c = this.city;
    this.screen = 'title';
    this.time = 0; this.timeH = 10; this.rain = 0; this.rainT = 30;
    this.shotMode = false; // staged screenshots never write to localStorage
    this.wanted = 0; this.wantedSeen = false;
    this.player = {
      x: c.spawn.x, y: c.spawn.y, a: -Math.PI / 2, hp: PLAYER_HEALTH, cash: START_CASH,
      ammo: 24, onFoot: true, car: null, speed: 0, aim: -Math.PI / 2, bustT: 0, invuln: 0,
      sprint: false, moving: false,
    };
    this.cars = []; this.peds = []; this.cops = [];
    this.particles = []; this.skids = []; this.pickups = [];
    this.mission = { index: 0, stage: 0, timer: 0, data: {}, done: false, failed: false };
    this.storyDone = false; this.jobsDone = 0;
    this.job = null; // free-roam taxi fare
    this.cam = { x: this.player.x, y: this.player.y, zoom: 1, shake: 0 };
    this.msg = null; this.msgT = 0;
    this.shootT = 0; this.hornT = 0;
    this.stats = { stolen: 0, busted: 0, wasted: 0, kills: 0, missions: 0 };
    this.spawnTraffic(); this.spawnPeds();
    this.spawnParkedCars();
    this.setObjective();
  }
  // ---------- spawning ----------
  spawnTraffic() {
    for (let i = 0; i < TRAFFIC_COUNT; i++) this.addTrafficCar(true);
  }
  addTrafficCar(anywhere) {
    const rng = this.rng;
    const p = roadPoint(rng, this.city);
    const kind = rng() < 0.12 ? 'taxi' : rng() < 0.18 ? 'sport' : rng() < 0.3 ? 'van' : 'sedan';
    const car = {
      id: carId++, x: p.x, y: p.y, a: rng() < 0.5 ? 0 : Math.PI / 2, speed: rf(rng, 60, TRAFFIC_SPEED),
      color: kind === 'taxi' ? PAL.taxi : pick(rng, PAL.car), kind, driver: 'traffic',
      path: [], pathI: 0, hp: 100, stuck: 0,
    };
    this.planRoute(car, true);
    this.cars.push(car);
    return car;
  }
  spawnParkedCars() {
    for (const b of this.city.blocks) for (const pc of b.cars) {
      this.cars.push({ id: carId++, x: pc.x, y: pc.y, a: pc.a, speed: 0, color: pc.color, kind: 'sedan', driver: null, path: [], pathI: 0, hp: 100, stuck: 0 });
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
    } else {
      if (m.stage === 0) { this.objective = 'Go to the docks — the Marlin crew is waiting'; this.marker = { x: c.docks.x - 60, y: c.docks.y, r: 46 }; }
      else if (m.stage === 1) { const left = this.peds.filter(p => p.enemy && !p.dead).length; this.objective = `Take out the Marlin crew — ${left} left`; this.marker = { x: c.docks.x - 60, y: c.docks.y, r: 60 }; }
      else { this.objective = 'Escape to the safehouse — the precinct is coming'; this.marker = { x: c.safehouse.x, y: c.safehouse.y, r: 46 }; }
    }
  }
  showMsg(title, sub = '', dur = 3) { this.msg = { title, sub }; this.msgT = dur; }
  missionPassed() {
    const def = MISSIONS[this.mission.index];
    this.player.cash += def.reward;
    this.stats.missions++;
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
    this.setObjective();
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
      this.storyDone = !!s.storyDone; this.jobsDone = s.jobsDone || 0;
      this.mission.index = Math.min(s.mission, MISSIONS.length - 1);
      this.mission.stage = s.stage || 0; this.mission.done = false; this.mission.data = {};
      if (this.storyDone) this.mission.index = MISSIONS.length - 1;
      if (this.mission.index === 1) this.spawnDrop();
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
  this.shootT -= dt;
  const p = this.player;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.onFoot) this.updatePlayer(dt, input, audio);
  else this.updatePlayerCar(dt, input, audio);
  this.updateTraffic(dt);
  this.updatePeds(dt);
  this.updatePolice(dt, audio);
  this.updateWanted(dt);
  this.updateMissions(dt);
  this.updatePickups(dt);
  this.updateParticles(dt);
  this.updateJob(dt);
  // Camera follows the player (or their car).
  const focus = p.onFoot ? p : p.car;
  const tz = p.onFoot ? 1.0 : 0.82;
  this.cam.x = lerp(this.cam.x, focus.x, 1 - Math.pow(0.001, dt));
  this.cam.y = lerp(this.cam.y, focus.y, 1 - Math.pow(0.001, dt));
  this.cam.zoom = lerp(this.cam.zoom, tz, 1 - Math.pow(0.01, dt));
  if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 3);
  // Engine + siren audio.
  const driving = !p.onFoot && p.car;
  audio.engine(driving ? Math.abs(p.car.speed) / CAR_MAX : 0, !!driving);
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
  // Shoot.
  if ((input.mouse.down || input.mouse.clicked) && this.shootT <= 0 && p.ammo > 0) {
    this.shootT = PISTOL_RATE; p.ammo--;
    audio.shot();
    this.fireBullet(p.x, p.y, p.aim, true);
    this.burst(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16, '#ffd76a', 4, 90);
    this.cam.shake = Math.max(this.cam.shake, 0.12);
    if (this.peds.some(pd => !pd.dead && dist(pd.x, pd.y, p.x, p.y) < 320) || this.cops.length) this.addWanted(4, 'shot');
  }
  // Enter a car (never a police car — those are locked).
  if (input.pressed('e')) {
    const car = this.nearestCar(p.x, p.y, 64, true);
    if (car) this.enterCar(car, audio);
  }
  // Pick up cash / health / ammo lying around.
  for (const pk of this.pickups) {
    if (!pk.taken && dist2(p.x, p.y, pk.x, pk.y) < 36 * 36) {
      pk.taken = true;
      if (pk.kind === 'cash') { p.cash += pk.amount; audio.cash(); this.showMsg(`+$${pk.amount}`, '', 1.2); }
      else if (pk.kind === 'health') { p.hp = Math.min(PLAYER_HEALTH, p.hp + 40); audio.pickup(); this.showMsg('+40 HEALTH', '', 1.2); }
      else { p.ammo += 12; audio.pickup(); this.showMsg('+12 AMMO', '', 1.2); }
    }
  }
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
  const ax = input.axis();
  // ax.y: -1 = W (accelerate), +1 = S (brake/reverse); ax.x steers.
  if (ax.y < 0) car.speed += CAR_ACCEL * dt;
  else if (ax.y > 0) car.speed -= (car.speed > 10 ? CAR_BRAKE : CAR_REVERSE) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 140 * dt);
  car.speed = clamp(car.speed, -CAR_MAX_REVERSE, CAR_MAX);
  const steer = ax.x * CAR_TURN * clamp(Math.abs(car.speed) / 160, 0.15, 1) * (car.speed < 0 ? -1 : 1);
  car.a += steer * dt * (input.keys[' '] ? 1.6 : 1);
  const nx = car.x + Math.cos(car.a) * car.speed * dt;
  const ny = car.y + Math.sin(car.a) * car.speed * dt;
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
    car.hp = 0; car.driver = null;
  }
  if (input.pressed('e')) this.exitCar(audio);
  if (input.pressed('h')) { audio.horn(); this.hornT = 0.3; }
  p.x = car.x; p.y = car.y; p.a = car.a;
};

World.prototype.fireBullet = function (x, y, angle, byPlayer) {
  // Step along the ray; first enemy / car / building hit takes the shot.
  const step = 14;
  for (let d = 20; d < PISTOL_RANGE; d += step) {
    const bx = x + Math.cos(angle) * d, by = y + Math.sin(angle) * d;
    if (inBuilding(this.city, bx, by, 0)) { this.burst(bx, by, '#cfc8b8', 4, 80); return; }
    for (const pd of this.peds) {
      if (pd.dead) continue;
      if (dist2(bx, by, pd.x, pd.y) < 16 * 16) {
        pd.hp -= PISTOL_DAMAGE;
        this.burst(pd.x, pd.y, '#ff5b5b', 6, 110);
        if (pd.hp <= 0) this.killPed(pd, byPlayer);
        return;
      }
    }
    for (const c of this.cars) {
      if (dist2(bx, by, c.x, c.y) < 30 * 30) {
        c.hp -= PISTOL_DAMAGE * 0.6;
        this.burst(bx, by, '#ffd76a', 5, 100);
        if (c.hp <= 0 && c.driver === 'player') { /* player's car can be shot out */ }
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
  }
};

// ---- traffic, pedestrians, police, wanted, missions ----
World.prototype.updateTraffic = function (dt) {
  const p = this.player;
  for (let i = this.cars.length - 1; i >= 0; i--) {
    const c = this.cars[i];
    if (c.driver !== 'traffic') continue;
    // Follow the route, one node at a time, on the right-hand lane.
    const target = c.path[c.pathI];
    if (!target) { this.planRoute(c, true); continue; }
    const dx = target.x - c.x, dy = target.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 26) { c.pathI++; if (c.pathI >= c.path.length) this.planRoute(c, true); continue; }
    const want = Math.atan2(dy, dx);
    c.a = turnToward(c.a, want, 2.2 * dt);
    // Slow for the car ahead.
    let ahead = false;
    for (const o of this.cars) {
      if (o === c) continue;
      const ox = o.x - c.x, oy = o.y - c.y;
      const along = ox * Math.cos(c.a) + oy * Math.sin(c.a);
      const side = Math.abs(-ox * Math.sin(c.a) + oy * Math.cos(c.a));
      if (along > 0 && along < 70 && side < 26) { ahead = true; break; }
    }
    const targetSpeed = ahead ? 0 : TRAFFIC_SPEED;
    c.speed = lerp(c.speed, targetSpeed, 1 - Math.pow(0.05, dt));
    const nx = c.x + Math.cos(c.a) * c.speed * dt, ny = c.y + Math.sin(c.a) * c.speed * dt;
    if (!inBuilding(this.city, nx, ny, 14) && !inWater(this.city, nx, ny)) { c.x = nx; c.y = ny; }
    else { this.planRoute(c, true); }
    c.stuck += dt;
    if (c.stuck > 8) { this.planRoute(c, true); c.stuck = 0; }
    // Recycle far-away traffic so the streets stay busy near the player.
    if (dist(c.x, c.y, p.x, p.y) > 1400) {
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
          p.hp -= 9;
          this.burst(p.x, p.y, '#ff5b5b', 5, 90);
          this.cam.shake = Math.max(this.cam.shake, 0.2);
          if (p.hp <= 0) this.wastePlayer();
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
      const car = { id: carId++, x: spot.x, y: spot.y, a: 0, speed: 0, color: PAL.police, kind: 'police', driver: 'police', path: [], pathI: 0, hp: 120, stuck: 0 };
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
  for (const s of this.skids) s.life -= dt;
  this.skids = this.skids.filter(s => s.life > 0);
  if (this.rain && this.rng() < 0.6) {
    this.particles.push({ x: this.cam.x + rf(this.rng, -700, 700), y: this.cam.y + rf(this.rng, -450, 450), vx: -40, vy: 420, life: 0.5, max: 0.5, color: 'rgba(180,200,220,0.6)', size: 1.5, kind: 'rain' });
  }
};

World.prototype.updateJob = function (dt) {
  if (!this.storyDone || this.mission.index < MISSIONS.length - 1) return;
  // Free-roam taxi fares: a fare marker appears; drive a customer to the destination.
  if (!this.job) {
    if (this.rng() < dt * 0.05) {
      const spots = [this.city.garage, this.city.docks, this.city.hospital, this.city.pier, this.city.safehouse];
      const a = pick(this.rng, spots), b = pick(this.rng, spots);
      if (a !== b) this.job = { stage: 0, from: a, to: b, fare: ri(this.rng, 80, 220) };
    }
    return;
  }
  const p = this.player;
  if (this.job.stage === 0) {
    if (dist2(p.x, p.y, this.job.from.x, this.job.from.y) < 50 * 50) { this.job.stage = 1; this.showMsg('FARE PICKED UP', `Take them to ${this.job.to.label} — $${this.job.fare}`, 2.5); }
  } else if (dist2(p.x, p.y, this.job.to.x, this.job.to.y) < 50 * 50) {
    p.cash += this.job.fare; this.jobsDone++;
    this.showMsg(`FARE +$${this.job.fare}`, 'Nice driving.', 2);
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
