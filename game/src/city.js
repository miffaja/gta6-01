// The city of Solmar Bay: a seeded grid of streets and blocks, with a beach and bay to
// the south, a container port to the east, and the story landmarks (garage, safehouse,
// docks, hospital, precinct). Traffic drives the road graph; pedestrians walk sidewalks.
import { COLS, ROWS, BLOCK, STREET, PITCH, WORLD_W, WORLD_H, BEACH_H, PAL } from './config.js';
import { mulberry32, ri, rf, pick } from './random.js';

export function roadCenterX(i) { return i * PITCH + STREET / 2; }
export function roadCenterY(j) { return j * PITCH + STREET / 2; }
// Block (col,row) top-left corner.
export function blockXY(c, r) { return { x: c * PITCH + STREET, y: r * PITCH + STREET }; }

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const roads = { v: [], h: [] };           // vertical / horizontal road centre lines
  for (let i = 0; i <= COLS; i++) roads.v.push(roadCenterX(i));
  for (let j = 0; j <= ROWS; j++) roads.h.push(roadCenterY(j));
  // Intersections (the traffic graph's nodes).
  const nodes = [];
  for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) {
    nodes.push({ x: roads.v[i], y: roads.h[j], i, j });
  }
  const nodeAt = (i, j) => nodes[j * (COLS + 1) + i];
  // Blocks: 0 building block, 1 park, 2 parking lot, 3 plaza.
  const blocks = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const { x, y } = blockXY(c, r);
    let kind = 0;
    const roll = rng();
    if (roll < 0.12) kind = 1; else if (roll < 0.24) kind = 2; else if (roll < 0.30) kind = 3;
    const b = { c, r, x, y, w: BLOCK, h: BLOCK, kind, buildings: [], trees: [], cars: [] };
    if (kind === 0) {
      // Downtown (the middle of the grid) grows tall towers; the outer blocks
      // stay low-rise, so the skyline reads at a glance in the render.
      const dc = Math.abs(c - (COLS - 1) / 2) + Math.abs(r - (ROWS - 1) / 2);
      const tall = dc <= 3 ? 3 : dc <= 5 ? 2 : 1;
      const n = ri(rng, 1, 3);
      if (n === 1) {
        b.buildings.push(mkBuilding(rng, x + 18, y + 18, BLOCK - 36, BLOCK - 36, tall));
      } else {
        const vertical = rng() < 0.5;
        for (let k = 0; k < n; k++) {
          if (vertical) b.buildings.push(mkBuilding(rng, x + 14, y + 12 + k * (BLOCK / n), BLOCK - 28, BLOCK / n - 22, tall));
          else b.buildings.push(mkBuilding(rng, x + 12 + k * (BLOCK / n), y + 14, BLOCK / n - 22, BLOCK - 28, tall));
        }
      }
    } else if (kind === 1) {
      for (let k = 0; k < ri(rng, 5, 9); k++) {
        b.trees.push({ x: x + rf(rng, 24, BLOCK - 24), y: y + rf(rng, 24, BLOCK - 24), r: rf(rng, 9, 15) });
      }
      // A winding gravel path through the park with a small fountain plaza.
      b.path = [
        { x: x + 10, y: y + BLOCK / 2 }, { x: x + BLOCK * 0.35, y: y + BLOCK * 0.4 },
        { x: x + BLOCK / 2, y: y + BLOCK / 2 }, { x: x + BLOCK * 0.65, y: y + BLOCK * 0.6 },
        { x: x + BLOCK - 10, y: y + BLOCK / 2 },
      ];
      b.fountain = { x: x + BLOCK / 2, y: y + BLOCK / 2, r: 16 };
    } else if (kind === 2) {
      for (let k = 0; k < ri(rng, 3, 6); k++) {
        b.cars.push({ x: x + rf(rng, 30, BLOCK - 30), y: y + rf(rng, 30, BLOCK - 30), a: rng() < 0.5 ? 0 : Math.PI / 2, color: pick(rng, PAL.car) });
      }
      // Painted parking bays along the top and bottom edges of the lot.
      b.bays = [];
      for (let k = 0; k < 5; k++) {
        b.bays.push({ x: x + 16 + k * 36, y: y + 10, w: 30, h: 44 });
        b.bays.push({ x: x + 16 + k * 36, y: y + BLOCK - 54, w: 30, h: 44 });
      }
    }
    blocks.push(b);
  }
  // Landmarks (fixed, so missions always know where they are).
  const garage = { x: roadCenterX(2), y: roadCenterY(7), label: "Rosa's Garage" };
  const safehouse = { x: roadCenterX(9), y: roadCenterY(2), label: 'Safehouse' };
  const docks = { x: WORLD_W - STREET / 2, y: roadCenterY(4), label: 'Solmar Docks' };
  const hospital = { x: roadCenterX(5), y: roadCenterY(1), label: 'St. Marina Hospital' };
  const precinct = { x: roadCenterX(6), y: roadCenterY(8), label: 'Precinct 9' };
  const pier = { x: roadCenterX(6), y: WORLD_H + BEACH_H - 40, label: 'Pier' };
  // Port containers along the east edge.
  const containers = [];
  for (let k = 0; k < 10; k++) {
    containers.push({ x: WORLD_W - 14 - (k % 2) * 26, y: 300 + k * 150, w: 22, h: 120, color: pick(rng, ['#c0392b', '#2980b9', '#f39c12', '#27ae60', '#8e44ad']) });
  }
  // Palm trees along the beach.
  const palms = [];
  for (let k = 0; k < 22; k++) palms.push({ x: 60 + k * 140 + rf(rng, -30, 30), y: WORLD_H + rf(rng, 30, 110), r: rf(rng, 10, 14) });
  // Beach umbrellas + towels and two lifeguard towers; the marina with its
  // lighthouse sits at the east end of the bay (all drawn in render.js).
  const umbrellas = [];
  for (let k = 0; k < 14; k++) {
    umbrellas.push({ x: 120 + k * 200 + rf(rng, -50, 50), y: WORLD_H + rf(rng, 50, 130), color: pick(rng, ['#e74c3c', '#f39c12', '#3498db', '#e91e63', '#1abc9c']) });
  }
  const lifeguards = [
    { x: roadCenterX(3) + 90, y: WORLD_H + 96 },
    { x: roadCenterX(8) + 90, y: WORLD_H + 96 },
  ];
  const marina = { x: WORLD_W - 210, y: WORLD_H + BEACH_H - 96, label: 'Solmar Marina' };
  const lighthouse = { x: WORLD_W - 90, y: WORLD_H + BEACH_H - 58 };
  const boats = [];
  for (let k = 0; k < 6; k++) {
    boats.push({ x: marina.x - 150 + k * 52, y: marina.y + rf(rng, -6, 10), a: rf(rng, -0.3, 0.3), color: pick(rng, ['#ecf0f1', '#3498db', '#e74c3c', '#f1c40f']) });
  }
  // Stunt ramps on a few straights (hit one fast for airtime + a cash bonus).
  const ramps = [
    { x: roadCenterX(4), y: roadCenterY(3) + 120, a: Math.PI / 2 },
    { x: roadCenterX(7) + 140, y: roadCenterY(6), a: 0 },
    { x: roadCenterX(2), y: roadCenterY(5) + 120, a: Math.PI / 2 },
    { x: roadCenterX(9) + 140, y: roadCenterY(2), a: 0 },
  ];
  return {
    seed, roads, nodes, nodeAt, blocks, garage, safehouse, docks, hospital, precinct, pier,
    containers, palms, umbrellas, lifeguards, marina, lighthouse, boats, ramps,
    beach: { y0: WORLD_H, y1: WORLD_H + BEACH_H },
    // Spawn ON the road south of the garage intersection (never inside a block).
    spawn: { x: garage.x, y: garage.y + 70 },
  };
}

function mkBuilding(rng, x, y, w, h, tall = 1) {
  // hgt 1..5: extrusion/shadow height class. Downtown towers reach 4-5, the
  // mid-ring 2-3, and the edges stay 1-2.
  const hgt = tall >= 3 ? ri(rng, 3, 5) : tall === 2 ? ri(rng, 2, 3) : ri(rng, 1, 2);
  return {
    x, y, w, h,
    color: pick(rng, PAL.building),
    roof: pick(rng, PAL.roof),
    hgt,
    windows: ri(rng, 2, 5),
    // Per-building seed for which windows glow at night, so towers differ.
    litSeed: Math.floor(rng() * 1e9),
  };
}

// Is (x,y) on a road (within the road half-width of a centre line)?
export function onRoad(city, x, y) {
  const hw = STREET / 2;
  for (const cx of city.roads.v) if (Math.abs(x - cx) <= hw) return true;
  for (const cy of city.roads.h) if (Math.abs(y - cy) <= hw) return true;
  return false;
}
// Is (x,y) inside a building? (collision)
export function inBuilding(city, x, y, pad = 0) {
  for (const b of city.blocks) for (const bd of b.buildings) {
    if (x > bd.x - pad && x < bd.x + bd.w + pad && y > bd.y - pad && y < bd.y + bd.h + pad) return bd;
  }
  return null;
}
// Is (x,y) in the water (south of the beach)?
export function inWater(city, x, y) { return y > city.beach.y1 - 70; }
// Nearest intersection node to a point.
export function nearestNode(city, x, y) {
  let best = city.nodes[0], bd = Infinity;
  for (const n of city.nodes) {
    const d = (n.x - x) * (n.x - x) + (n.y - y) * (n.y - y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
// A random point on a road (for traffic / ped spawns).
export function roadPoint(rng, city) {
  if (rng() < 0.5) return { x: pick(rng, city.roads.v), y: rf(rng, 60, WORLD_H - 60) };
  return { x: rf(rng, 60, WORLD_W - 60), y: pick(rng, city.roads.h) };
}
