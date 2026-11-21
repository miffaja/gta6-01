// SOLMAR BAY — an original open-world crime game. All city, characters, vehicles,
// names, story, art and sound are the entrant's own. No Rockstar Games name, logo,
// character, map or asset appears anywhere in this game.
// Config: the world, the rules, the tuning.
export const SEED = 20261119;
export const TILE = 1;
// City grid: blocks of BLOCK with STREET-wide roads between them.
export const COLS = 12, ROWS = 9, BLOCK = 200, STREET = 48;
export const PITCH = BLOCK + STREET;
export const WORLD_W = COLS * BLOCK + (COLS + 1) * STREET;   // 3024
export const WORLD_H = ROWS * BLOCK + (ROWS + 1) * STREET;   // 2280
export const BEACH_H = 260;                                   // sand + water strip, south
export const ROAD_HALF = STREET / 2;
export const LANE = 9;                                        // lane offset from road centre
// Player / cars.
export const PLAYER_R = 11;
export const PLAYER_SPEED = 175;
export const PLAYER_SPRINT = 265;
export const PLAYER_HEALTH = 100;
export const CAR_W = 34, CAR_L = 62;
export const CAR_ACCEL = 420, CAR_BRAKE = 620, CAR_REVERSE = 180;
export const CAR_MAX = 520, CAR_MAX_REVERSE = 200;
export const CAR_TURN = 2.6;
export const TRAFFIC_COUNT = 26, PED_COUNT = 46;
export const TRAFFIC_SPEED = 120;
// Wanted: points 0..100, stars = floor(points / 20), max 5.
export const WANTED_MAX = 100;
export const WANTED_DECAY = 3.5;      // points/s while unseen
export const WANTED_SEEN_DECAY = 0.4; // points/s while a cop sees the player
export const POLICE_RAM = 26;         // police car touch radius (bust while stopped)
// Combat.
export const PISTOL_DAMAGE = 34, PISTOL_RANGE = 420, PISTOL_RATE = 0.28;
export const ENEMY_HEALTH = 70;
// Weapons the player can carry and switch between (1/2/3). Pistol is the default
// and behaves exactly as before; SMG is fast and light, the shotgun throws a
// spread of pellets that hurts up close.
export const WEAPONS = {
  pistol:  { name: 'PISTOL',  damage: PISTOL_DAMAGE, range: PISTOL_RANGE, rate: PISTOL_RATE, pellets: 1, spread: 0,    startAmmo: 24 },
  smg:     { name: 'SMG',     damage: 16,            range: 380,          rate: 0.09,        pellets: 1, spread: 0.05, startAmmo: 0 },
  shotgun: { name: 'SHOTGUN', damage: 13,            range: 240,          rate: 0.85,        pellets: 6, spread: 0.16, startAmmo: 0 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'shotgun'];
export const ARMOR_MAX = 100;
// Vehicles: per-kind handling + draw size. Cars without a kind entry fall back to
// the sedan numbers (the original CAR_* constants), so nothing else changes.
export const VEHICLES = {
  sedan:  { max: CAR_MAX,        accel: CAR_ACCEL,       turn: CAR_TURN,       w: CAR_W,     l: CAR_L,     hp: 100 },
  sport:  { max: 610,            accel: 520,             turn: 2.9,            w: CAR_W - 2, l: CAR_L,     hp: 90 },
  taxi:   { max: CAR_MAX,        accel: CAR_ACCEL,       turn: CAR_TURN,       w: CAR_W,     l: CAR_L,     hp: 110 },
  van:    { max: 430,            accel: 360,             turn: 2.2,            w: CAR_W + 4, l: CAR_L + 12, hp: 140 },
  pickup: { max: 480,            accel: 400,             turn: 2.4,            w: CAR_W + 2, l: CAR_L + 8,  hp: 130 },
  truck:  { max: 380,            accel: 300,             turn: 1.8,            w: CAR_W + 8, l: CAR_L + 34, hp: 220 },
  bus:    { max: 400,            accel: 310,             turn: 1.7,            w: CAR_W + 8, l: CAR_L + 44, hp: 240 },
  police: { max: CAR_MAX * 0.98, accel: CAR_ACCEL + 40,  turn: 3.0,            w: CAR_W,     l: CAR_L,     hp: 150 },
  rival:  { max: 560,            accel: 480,             turn: 2.8,            w: CAR_W,     l: CAR_L,     hp: 130 },
};
// Economy / story.
export const START_CASH = 150;
export const BUST_FINE = 200, WASTE_FINE = 200;
export const SAVE_KEY = 'solmarbay-save-v1';
// Day: 1 game hour per 40 real seconds; day starts 10:00.
export const DAY_LENGTH = 40;
// Screenshot staging.
export const SHOT_NAMES = ['start', 'drive', 'wanted', 'mission'];
// Palette: sun-soaked coastal city.
export const PAL = {
  grass: '#7fae5a', park: '#69a24e', sand: '#e8d29a', water: '#2e7fa8', waterDeep: '#1f5f86',
  road: '#3c3f46', roadEdge: '#2f3238', lane: '#d8d3a8', sidewalk: '#b9b3a4',
  building: ['#e8b04b', '#d97b4f', '#c96f5a', '#e6d3a3', '#7fa8c9', '#a8b8c4', '#e07a5f', '#f2e6c9', '#8fb8a8', '#d9a05b'],
  roof: ['#b98a3e', '#a85f3f', '#8f5a48', '#c4a76a', '#5f7f9e'],
  car: ['#c0392b', '#2980b9', '#f39c12', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#2c3e50', '#16a085', '#d35400'],
  police: '#1c2733', taxi: '#f1c40f', sport: '#e74c3c',
};
