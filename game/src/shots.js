// SOLMAR BAY — shots.js
// Screenshot scenes behind ?shot=start|drive|wanted|mission. Each stages a
// real world from a fixed seed and plays the real rules forward for a fixed
// number of steps, so the frame is what the game really looks like and the
// same seed always gives the same frame.
// Exports: stageShot(name, world).
// Dependencies: city.js (roadCenterX/Y), config.js (PAL); driven by main.js.
import { roadCenterX, roadCenterY } from './city.js';
import { PAL } from './config.js';

const STEP = 1 / 30;

function fakeInput() {
  return {
    keys: {}, mouse: { x: 640, y: 360, down: false, clicked: false, wx: 0, wy: 0, wheel: 0 },
    axis() {
      const k = this.keys;
      return { x: (k.d ? 1 : 0) - (k.a ? 1 : 0), y: (k.s ? 1 : 0) - (k.w ? 1 : 0) };
    },
    pressed() { return false; },
    consumeClick() { return false; },
    consumeWheel() { return 0; },
    endFrame() {},
  };
}
function nullAudio() {
  return {
    engine() {}, siren() {}, shot() {}, crash() {}, horn() {}, hornBig() {}, stunt() {},
    click() {}, pickup() {}, cash() {}, pass() {}, fail() {}, bust() {}, wasted() {},
    init() {}, startMusic() {},
  };
}
function runSteps(world, seconds, input) {
  const audio = nullAudio();
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) world.update(STEP, input, audio);
}

/** Put `world` into the named scene and return the screen to draw. */
export function stageShot(name, world) {
  const city = world.city;
  const input = fakeInput();
  world.reset();
  world.shotMode = true; // staged scenes never save (no localStorage writes)
  if (name === 'start') {
    // Title screen over a golden-hour downtown: tall towers, long shadows,
    // the first neon signs lit, Vic on foot beside a red sports car, peds
    // and traffic for life. Staged at 18.6 (deeper dusk than before) so the
    // signs read, framed a little wider on the downtown skyline.
    world.timeH = 18.6;
    const car = { id: 9001, x: roadCenterX(5), y: roadCenterY(3) + 10, a: Math.PI / 2, speed: 0, color: PAL.sport, kind: 'sport', driver: null, path: [], pathI: 0, hp: 90, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
    world.cars.push(car);
    world.player.x = roadCenterX(5) - 40; world.player.y = roadCenterY(3) + 30;
    world.addPed(false, roadCenterX(5) - 100, roadCenterY(3) - 20);
    world.addPed(false, roadCenterX(5) + 60, roadCenterY(3) + 80);
    world.addPed(false, roadCenterX(5) - 20, roadCenterY(3) - 90);
    world.addPed(false, roadCenterX(5) + 120, roadCenterY(3) - 40);
    // A few traffic cars on the avenue so the street reads alive.
    for (let k = 0; k < 3; k++) {
      const tc = { id: 9040 + k, x: roadCenterX(4) + k * 260, y: roadCenterY(3) - 12, a: 0, speed: 120, color: PAL.car[k * 3 % PAL.car.length], kind: 'sedan', driver: 'traffic', path: [], pathI: 0, hp: 100, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
      world.planRoute(tc, true);
      world.cars.push(tc);
    }
    // Run as 'play' so peds/traffic settle into natural positions, then
    // freeze back on the title screen with the exact skyline framing.
    world.screen = 'play';
    runSteps(world, 2.5, input);
    world.screen = 'title';
    world.cam.x = roadCenterX(5); world.cam.y = roadCenterY(3); world.cam.zoom = 0.78;
    return { screen: 'title' };
  }
  world.screen = 'play';
  if (name === 'drive') {
    // Golden-hour cruise down the main avenue past the downtown towers:
    // Vic in a sports car, a truck and a bus ahead for depth, peds around.
    // Deep dusk (18.8) — the most dramatic light: long shadows across the
    // road and the neon signs coming on.
    world.timeH = 18.8;
    const car = { id: 9002, x: roadCenterX(3), y: roadCenterY(4), a: 0, speed: 340, color: PAL.sport, kind: 'sport', driver: 'player', path: [], pathI: 0, hp: 90, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
    world.cars.push(car);
    world.player.onFoot = false; world.player.car = car; world.player.x = car.x; world.player.y = car.y;
    world.addPed(false, roadCenterX(4), roadCenterY(4) - 45);
    world.addPed(false, roadCenterX(5), roadCenterY(4) + 45);
    world.addPed(false, roadCenterX(6), roadCenterY(4) - 45);
    for (const c of world.cars) {
      if (c !== car && c.driver === 'traffic' && Math.abs(c.y - car.y) < 60 && c.x > car.x - 100 && c.x < car.x + 1000) {
        c.x = roadCenterX(10); c.y = roadCenterY(7); world.planRoute(c, true);
      }
    }
    // Heavy traffic ahead on the same avenue: a truck and a bus give the
    // frame foreground/background depth.
    const truck = { id: 9050, x: car.x + 380, y: car.y - 9, a: 0, speed: 120, color: '#e67e22', kind: 'truck', driver: 'traffic', path: [], pathI: 0, hp: 220, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
    world.planRoute(truck, true); world.cars.push(truck);
    const bus = { id: 9051, x: car.x + 560, y: car.y + 9, a: 0, speed: 120, color: '#2980b9', kind: 'bus', driver: 'traffic', path: [], pathI: 0, hp: 240, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
    world.planRoute(bus, true); world.cars.push(bus);
    input.keys.w = true;
    runSteps(world, 2.5, input);
    // Lookahead framing: the camera sits ahead of the car, not centred on it.
    world.cam.x = car.x + 180; world.cam.y = car.y;
    return { screen: 'play' };
  }
  if (name === 'wanted') {
    // Night pursuit: 4 stars, three police cars with strobing lightbars,
    // headlight pools on wet asphalt, neon signs downtown, and two Marlin
    // rival cars joining the chase from both sides.
    world.timeH = 21.5;
    world.rain = 1;
    // Stage the chase on the avenue nearest the densest neon cluster so the
    // signs actually read in the frame: anchor on the neon tower with the
    // most neon neighbours within 700px, run eastbound toward it.
    const neons = [];
    for (const b of city.blocks) for (const bd of b.buildings) if (bd.neon) neons.push(bd);
    let ax = roadCenterX(5), ay = roadCenterY(5);
    if (neons.length) {
      let anchor = neons[0], bestN = -1;
      for (const bd of neons) {
        const cx = bd.x + bd.w / 2, cy = bd.y + bd.h / 2;
        let n = 0;
        for (const o of neons) {
          const dx = o.x + o.w / 2 - cx, dy = o.y + o.h / 2 - cy;
          if (dx * dx + dy * dy < 700 * 700) n++;
        }
        if (n > bestN) { bestN = n; anchor = bd; }
      }
      ax = anchor.x + anchor.w / 2; ay = anchor.y + anchor.h / 2;
    }
    let roadY = city.roads.h[0];
    for (const ry of city.roads.h) if (Math.abs(ry - ay) < Math.abs(roadY - ay)) roadY = ry;
    const car = { id: 9003, x: ax - 460, y: roadY, a: 0, speed: 380, color: '#c0392b', kind: 'sedan', driver: 'player', path: [], pathI: 0, hp: 300, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
    world.cars.push(car);
    world.player.onFoot = false; world.player.car = car; world.player.x = car.x; world.player.y = car.y;
    world.wanted = 84;
    for (const c of world.cars) {
      if (c !== car && c.driver === 'traffic' && c.x > car.x - 150 && c.x < car.x + 1300 && Math.abs(c.y - car.y) < 250) {
        c.x = roadCenterX(1); c.y = roadCenterY(1); world.planRoute(c, true);
      }
    }
    for (let k = 0; k < 3; k++) {
      const pc = { id: 9010 + k, x: car.x - 320 - k * 160, y: car.y + (k % 2 ? 40 : -40), a: 0, speed: 380, color: PAL.police, kind: 'police', driver: 'police', path: [], pathI: 0, hp: 150, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
      world.planRoute(pc, false);
      world.cars.push(pc);
    }
    const rival = { id: 9020, x: car.x - 520, y: car.y + 90, a: 0, speed: 400, color: '#7d3c98', kind: 'rival', driver: 'rival', path: [], pathI: 0, hp: 130, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
    world.planRoute(rival, false);
    world.cars.push(rival);
    const rival2 = { id: 9021, x: car.x - 420, y: car.y - 110, a: 0, speed: 400, color: '#7d3c98', kind: 'rival', driver: 'rival', path: [], pathI: 0, hp: 130, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
    world.planRoute(rival2, false);
    world.cars.push(rival2);
    input.keys.w = true;
    runSteps(world, 1.4, input);
    // Rain splashes around the chase so the frozen frame shows the weather
    // hitting the asphalt (shot mode freezes right after staging).
    for (let k = 0; k < 40; k++) {
      world.particles.push({
        x: car.x + (k * 97 % 900) - 300, y: car.y + (k * 61 % 300) - 150,
        vx: -40, vy: 420, life: 0.5, max: 0.5, color: 'rgba(180,200,220,0.6)', size: 1.5, kind: 'rain',
      });
    }
    runSteps(world, 0.1, input);
    // Land the police lightbars on their red-on phase for the capture
    // (drawCar strobes on floor(time*6) parity).
    if (Math.floor(world.time * 6) % 2 !== 0) world.time += 1 / 6;
    // Wider framing than the driving default so the whole chase reads, and
    // centred on the neon cluster the chase was staged around. (Set after
    // the steps: update() lerps the camera toward the car while driving,
    // and shot mode freezes the world right after staging.)
    world.cam.zoom = 0.72;
    world.cam.x = ax; world.cam.y = roadY;
    return { screen: 'play' };
  }
  // mission: the armored-truck heist at golden hour — Vic on foot with an SMG,
  // the cracked cash truck ahead, three Marlin guards closing in, heat rising
  // and a police car rolling in from the north.
  world.timeH = 17.8;
  world.mission.index = 5; world.mission.stage = 0; world.mission.done = false;
  world.setupHeist();
  const truck = world.cars.find(c => c.id === world.mission.data.truckId);
  if (truck) {
    truck.x = city.docks.x - 320; truck.y = city.docks.y; truck.a = 0; truck.speed = 0; truck.hp = 120;
    world.planRoute(truck, true);
  }
  world.player.x = city.docks.x - 430; world.player.y = city.docks.y + 30;
  world.player.weapon = 'smg';
  world.player.weapons.smg.ammo = 60; world.player.ammo = 60;
  world.player.hp = 100; world.player.armor = 60; world.player.invuln = 6;
  world.wanted = 65; // 3 stars — reads better in the HUD than 2
  world.addPed(true, city.docks.x - 240, city.docks.y - 50);
  world.addPed(true, city.docks.x - 200, city.docks.y + 60);
  world.addPed(true, city.docks.x - 260, city.docks.y - 10);
  for (const pd of world.peds) if (pd.enemy) pd.shootT = 2.5;
  const pc = { id: 9030, x: city.docks.x - 350, y: city.docks.y - 280, a: Math.PI / 2, speed: 380, color: PAL.police, kind: 'police', driver: 'police', path: [], pathI: 0, hp: 150, stuck: 0, brakeLight: 0, air: 0, honkT: 0 };
  world.planRoute(pc, false);
  world.cars.push(pc);
  input.mouse.wx = city.docks.x - 300; input.mouse.wy = city.docks.y;
  input.mouse.down = true;
  runSteps(world, 0.6, input);
  // One last shot in the final frame so the muzzle flash is live in the
  // capture, plus the heist cash popup floating over Vic.
  world.shootT = 0;
  runSteps(world, 0.1, input);
  world.textPops.push({ x: world.player.x + 30, y: world.player.y - 50, vy: -40, text: '+$1800', color: '#ffd23e', life: 1.0, max: 1.4 });
  world.cam.zoom = 0.88;
  world.setObjective();
  return { screen: 'play' };
}
