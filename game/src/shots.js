// Screenshot scenes behind ?shot=start|drive|wanted|mission. Each one stages a real
// world from a fixed seed and plays the real rules forward for a fixed number of steps,
// so the frame is what the game really looks like and the same seed always gives the
// same frame. (The starter's Block Dodger does the same with an autopilot.)
import { roadCenterX, roadCenterY } from './city.js';
import { PAL } from './config.js';

const STEP = 1 / 30;

function fakeInput() {
  return {
    keys: {}, mouse: { x: 640, y: 360, down: false, clicked: false, wx: 0, wy: 0 },
    axis() {
      const k = this.keys;
      return { x: (k.d ? 1 : 0) - (k.a ? 1 : 0), y: (k.s ? 1 : 0) - (k.w ? 1 : 0) };
    },
    pressed() { return false; },
    consumeClick() { return false; },
    endFrame() {},
  };
}
function nullAudio() {
  return {
    engine() {}, siren() {}, shot() {}, crash() {}, horn() {}, click() {}, pickup() {},
    cash() {}, pass() {}, fail() {}, bust() {}, wasted() {}, init() {}, startMusic() {},
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
    // Title screen over a sunny downtown view: Vic on foot beside a red sports car.
    world.screen = 'title';
    world.timeH = 10;
    const car = { id: 9001, x: roadCenterX(6), y: roadCenterY(4) + 10, a: Math.PI / 2, speed: 0, color: PAL.sport, kind: 'sport', driver: null, path: [], pathI: 0, hp: 100, stuck: 0 };
    world.cars.push(car);
    world.player.x = roadCenterX(6) - 40; world.player.y = roadCenterY(4) + 30;
    world.cam.x = roadCenterX(6); world.cam.y = roadCenterY(4); world.cam.zoom = 0.85;
    runSteps(world, 0.5, input);
    world.screen = 'title';
    return { screen: 'title' };
  }
  world.screen = 'play';
  if (name === 'drive') {
    // Midday drive down the main avenue: Vic in a sports car, traffic and peds around.
    // Clear the road ahead so the staged car is actually moving, not stuck in traffic.
    world.timeH = 14;
    const car = { id: 9002, x: roadCenterX(3), y: roadCenterY(4), a: 0, speed: 320, color: PAL.sport, kind: 'sport', driver: 'player', path: [], pathI: 0, hp: 100, stuck: 0 };
    world.cars.push(car);
    world.player.onFoot = false; world.player.car = car; world.player.x = car.x; world.player.y = car.y;
    for (const c of world.cars) {
      if (c !== car && c.driver === 'traffic' && Math.abs(c.y - car.y) < 60 && c.x > car.x - 100 && c.x < car.x + 1000) {
        c.x = roadCenterX(10); c.y = roadCenterY(7); world.planRoute(c, true);
      }
    }
    input.keys.w = true;
    runSteps(world, 1.2, input);
    return { screen: 'play' };
  }
  if (name === 'wanted') {
    // Dusk pursuit: 3 stars, two police cars closing in on Vic's sedan.
    world.timeH = 18.5;
    const car = { id: 9003, x: roadCenterX(5), y: roadCenterY(5), a: 0, speed: 380, color: '#c0392b', kind: 'sedan', driver: 'player', path: [], pathI: 0, hp: 300, stuck: 0 };
    world.cars.push(car);
    world.player.onFoot = false; world.player.car = car; world.player.x = car.x; world.player.y = car.y;
    world.wanted = 62;
    // Clear a wide corridor ahead so the chase is a chase, not a pile-up: any
    // traffic that could reach the player's path (including cars crossing at
    // intersections) is moved away.
    for (const c of world.cars) {
      if (c !== car && c.driver === 'traffic' && c.x > car.x - 150 && c.x < car.x + 1300 && Math.abs(c.y - car.y) < 250) {
        c.x = roadCenterX(1); c.y = roadCenterY(1); world.planRoute(c, true);
      }
    }
    for (let k = 0; k < 2; k++) {
      const pc = { id: 9010 + k, x: car.x - 320 - k * 160, y: car.y + (k ? 40 : -40), a: 0, speed: 360, color: PAL.police, kind: 'police', driver: 'police', path: [], pathI: 0, hp: 120, stuck: 0 };
      world.planRoute(pc, false);
      world.cars.push(pc);
    }
    input.keys.w = true;
    runSteps(world, 1.5, input);
    return { screen: 'play' };
  }
  // mission: the docks shootout (mission 4) in golden-hour light — Vic on foot, Marlin crew ahead.
  world.timeH = 17;
  world.mission.index = 3; world.mission.stage = 1; world.mission.done = false;
  world.player.x = city.docks.x - 260; world.player.y = city.docks.y + 40;
  world.player.ammo = 24; world.player.hp = 100; world.player.invuln = 6;
  world.spawnEnemies();
  for (const pd of world.peds) if (pd.enemy) pd.shootT = 2.5;
  input.mouse.wx = city.docks.x - 120; input.mouse.wy = city.docks.y;
  runSteps(world, 1.0, input);
  world.setObjective();
  return { screen: 'play' };
}
