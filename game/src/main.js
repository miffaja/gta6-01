// SOLMAR BAY — main.js
// Boot + game loop: builds the World, wires input/audio/canvas, runs the
// fixed-step update + draw, and handles title/pause/save keys plus the
// ?shot= screenshot staging (see shots.js).
// Exports: none — this is the entry point loaded by game/index.html.
// Dependencies: world.js (World), render.js (draw), input.js (Input),
// audio.js (AudioSys), shots.js (stageShot).
import { World } from './world.js';
import { draw } from './render.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const world = new World();
const input = new Input();
const audio = new AudioSys();
// Debug handle for automated playtests (read-only state inspection).
window.__solmar = { world, input };

let view = { w: 0, h: 0 };
let last = performance.now();
let pausedFromTitle = false;
let lastWeapon = world.player.weapon;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth; view.h = window.innerHeight;
  canvas.width = Math.floor(view.w * dpr);
  canvas.height = Math.floor(view.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

input.attach(canvas, () => { audio.init(); });

function setStatus(text) { if (statusEl) statusEl.textContent = text; }

function startGame(fromSave) {
  audio.init();
  if (fromSave && world.hasSave()) { world.reset(); world.loadSave(); }
  else world.reset();
  world.screen = 'play';
  world.showMsg(world.mission.index === 0 ? 'The Pickup' : 'Solmar Bay', world.storyDone ? 'Free roam — find a fare.' : 'Rosa is waiting. Get moving, Vic.', 4);
  audio.startMusic();
  setStatus('Playing Solmar Bay');
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Mouse position in world coords (for aiming on foot).
  const cam = world.cam;
  input.mouse.wx = cam.x + (input.mouse.x - view.w / 2) / cam.zoom;
  input.mouse.wy = cam.y + (input.mouse.y - view.h / 2) / cam.zoom;
  if (world.screen === 'title') {
    // Live-city backdrop: a gentle sinusoidal drift over the downtown
    // skyline behind the title (world.update never runs on this screen, so
    // the drift lives here and cannot disturb the play loop).
    world.time += dt;
    world.cam.x = world.city.roads.v[5] + Math.sin(world.time * 0.08) * 160;
    world.cam.y = world.city.roads.h[3] + Math.cos(world.time * 0.05) * 80;
    world.cam.zoom = 0.85;
    if (input.pressed('enter') || input.consumeClick()) startGame(true);
  } else if (world.screen === 'play') {
    if (input.pressed('p') || input.pressed('escape')) {
      world.screen = 'pause'; audio.engine(0, false);
    } else if (input.pressed('r')) {
      world.reset(); world.screen = 'play';
      world.showMsg('MISSION RESTARTED', '', 2);
    } else {
      if (input.pressed('m')) { audio.setMuted(!audio.muted); }
      world.update(dt, input, audio);
    }
  } else if (world.screen === 'pause') {
    if (input.pressed('p') || input.pressed('escape') || input.pressed('enter')) world.screen = 'play';
    else if (input.pressed('r')) { world.reset(); world.screen = 'play'; }
    else if (input.pressed('m')) audio.setMuted(!audio.muted);
  } else if (world.screen === 'busted' || world.screen === 'wasted') {
    // Frozen world behind the overlay; the world's own timer brings back 'play'.
  }
  draw(ctx, world, view);
  // Announce weapon switches on the (screen-reader) status line.
  if (world.screen === 'play' && world.player.weapon !== lastWeapon) {
    lastWeapon = world.player.weapon;
    setStatus(`Weapon: ${lastWeapon}`);
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

if (shotName) {
  // Screenshot mode: stage the scene, then FREEZE it and render that exact frame.
  // (The live loop would otherwise coast the staged car to a stop with no input held,
  // and let traffic/police pile into it before the capture.)
  stageShot(shotName, world);
  world.screen = shotName === 'start' ? 'title' : 'play';
  resize();
  const renderOnly = () => { draw(ctx, world, view); requestAnimationFrame(renderOnly); };
  requestAnimationFrame(renderOnly);
  document.title = 'Solmar Bay — shot ' + shotName;
} else {
  setStatus('Solmar Bay — press Enter to start');
  requestAnimationFrame(frame);
}
