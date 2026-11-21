// SOLMAR BAY — rendering: the city, the cars, the people, the HUD with its minimap,
// the day/night light, the rain, and the title / pause / busted / wasted screens.
// Buildings are pseudo-3D (extruded walls, drop shadows, lit windows at night);
// cars are drawn per kind with wheels, windows and working lights. All art is
// drawn in code (canvas vector shapes): no image assets, no network.
import { WORLD_W, WORLD_H, BEACH_H, STREET, BLOCK, PITCH, CAR_W, CAR_L, PLAYER_R, PAL, VEHICLES, WEAPONS } from './config.js';
import { clamp, lerp } from './random.js';
import { MISSIONS } from './world.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, f) {
  // Multiply a #rrggbb colour by f (for walls / roofs / shading).
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

function drawCar(ctx, x, y, a, color, kind, lights, brake, flash) {
  const spec = VEHICLES[kind] || VEHICLES.sedan;
  const L = spec.l, W = spec.w;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 8); ctx.fill();
  // Wheels.
  ctx.fillStyle = '#14161a';
  const wx = L / 2 - 13, wy = W / 2 - 2;
  for (const [sx, sy] of [[wx, -wy], [wx, wy], [-wx, -wy], [-wx, wy]]) ctx.fillRect(sx - 5, sy - 3, 10, 6);
  // Body.
  ctx.fillStyle = color;
  rr(ctx, -L / 2, -W / 2, L, W, kind === 'sport' ? 11 : 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  rr(ctx, -L / 2, -W / 2, L, 10, 8); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  rr(ctx, -L / 2, W / 2 - 8, L, 8, 8); ctx.fill();
  if (kind === 'truck') {
    // Cab + long cargo box.
    ctx.fillStyle = shade(color, 0.8); rr(ctx, -L / 2 + 4, -W / 2 + 3, L - 30, W - 6, 3); ctx.fill();
    ctx.fillStyle = '#20262e'; rr(ctx, L / 2 - 24, -W / 2 + 5, 16, W - 10, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(L / 2 - 10, -W / 2 + 5, 4, W - 10);
  } else if (kind === 'bus') {
    // Window band + roof pod.
    ctx.fillStyle = '#20262e'; rr(ctx, -L / 2 + 8, -W / 2 + 4, L - 16, 7, 3); ctx.fill(); rr(ctx, -L / 2 + 8, W / 2 - 11, L - 16, 7, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; rr(ctx, -L / 2 + 10, -8, L - 20, 16, 4); ctx.fill();
    ctx.fillStyle = '#20262e'; rr(ctx, L / 2 - 14, -W / 2 + 5, 10, W - 10, 3); ctx.fill();
  } else if (kind === 'pickup') {
    // Cab + open bed.
    ctx.fillStyle = '#20262e'; rr(ctx, 2, -W / 2 + 5, 22, W - 10, 5); ctx.fill();
    ctx.fillStyle = shade(color, 0.65); rr(ctx, -L / 2 + 5, -W / 2 + 5, L / 2 - 8, W - 10, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; rr(ctx, -L / 2 + 5, -W / 2 + 5, L / 2 - 8, W - 10, 3); ctx.stroke();
  } else if (kind === 'van') {
    ctx.fillStyle = '#20262e'; rr(ctx, L / 2 - 26, -W / 2 + 5, 18, W - 10, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, -L / 2 + 6, -W / 2 + 6, L - 40, W - 12, 4); ctx.fill();
  } else {
    // Cabin + windows (sedan / sport / taxi / police / rival).
    ctx.fillStyle = kind === 'police' ? '#dfe6ee' : '#20262e';
    rr(ctx, -14, -W / 2 + 5, 26, W - 10, 5); ctx.fill();
    // Windshield + rear window glints.
    ctx.fillStyle = 'rgba(160,200,230,0.55)';
    ctx.fillRect(9, -W / 2 + 7, 3, W - 14); ctx.fillRect(-14, -W / 2 + 7, 3, W - 14);
    if (kind === 'sport') { ctx.fillStyle = shade(color, 0.6); ctx.fillRect(-L / 2 - 1, -W / 2 + 2, 5, W - 4); } // spoiler
  }
  if (kind === 'police') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-4, -W / 2 + 2, 8, 4); ctx.fillRect(-4, W / 2 - 6, 8, 4);
    // Lightbar: red/blue strobes alternate.
    const on = Math.floor((flash || 0) * 6) % 2 === 0;
    ctx.fillStyle = on ? '#ff2d2d' : '#7a1f1f'; ctx.fillRect(-8, -W / 2 + 6, 7, 9);
    ctx.fillStyle = on ? '#1f3f7a' : '#2d7bff'; ctx.fillRect(-8, W / 2 - 15, 7, 9);
    if (lights) {
      ctx.fillStyle = on ? 'rgba(255,45,45,0.10)' : 'rgba(45,123,255,0.10)';
      ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (kind === 'rival') { ctx.fillStyle = '#111'; ctx.fillRect(-6, -W / 2 + 2, 12, 4); ctx.fillRect(-6, W / 2 - 6, 12, 4); }
  if (kind === 'taxi') {
    ctx.fillStyle = '#111'; ctx.fillRect(2, -5, 12, 10);
    ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 8, 2.5);
  }
  // Headlights / taillights (brake lights flare when braking).
  ctx.fillStyle = lights ? '#fff3c4' : '#ffe9a8'; ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 6); ctx.fillRect(L / 2 - 3, W / 2 - 9, 3, 6);
  ctx.fillStyle = brake ? '#ff6b5e' : '#c0392b'; ctx.fillRect(-L / 2, -W / 2 + 3, 3, brake ? 8 : 6); ctx.fillRect(-L / 2, W / 2 - 9, 3, brake ? 8 : 6);
  if (lights) {
    const cone = ctx.createRadialGradient(L / 2, 0, 10, L / 2, 0, 170);
    cone.addColorStop(0, 'rgba(255,240,180,0.16)'); cone.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(L / 2, -14); ctx.lineTo(L / 2 + 170, -72); ctx.lineTo(L / 2 + 170, 72); ctx.lineTo(L / 2, 14); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, x, y, a, color, enemy) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(a);
  ctx.fillStyle = color;
  rr(ctx, -7, -5, 14, 10, 4); ctx.fill();           // body
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath(); ctx.arc(9, 0, 4.5, 0, Math.PI * 2); ctx.fill(); // head
  if (enemy) { ctx.fillStyle = '#222'; ctx.fillRect(10, -2, 10, 3); } // gun
  ctx.restore();
}

export function draw(ctx, world, view) {
  const w = view.w, h = view.h;
  const cam = world.cam;
  // Clamp the camera so the view never shows the void outside the city.
  const hw = w / 2 / cam.zoom, hh = h / 2 / cam.zoom;
  cam.x = clamp(cam.x, hw - 80, WORLD_W + 80 - hw);
  cam.y = clamp(cam.y, hh - 80, WORLD_H + BEACH_H + 80 - hh);
  const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 22 : 0;
  const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 22 : 0;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
  drawWorld(ctx, world);
  ctx.restore();
  drawLighting(ctx, world, w, h);
  drawHUD(ctx, world, w, h);
  drawOverlays(ctx, world, w, h);
}

function drawWorld(ctx, world) {
  const city = world.city;
  const t = world.timeH;
  const night = t < 6 || t >= 19.5;
  const dusk = t >= 17.5 && t < 19.5;
  // Ground: grass, then beach + water (with gentle wave lines).
  ctx.fillStyle = PAL.grass;
  ctx.fillRect(-80, -80, WORLD_W + 160, WORLD_H + BEACH_H + 160);
  ctx.fillStyle = PAL.sand;
  ctx.fillRect(-80, WORLD_H, WORLD_W + 160, BEACH_H - 70);
  ctx.fillStyle = PAL.waterDeep;
  ctx.fillRect(-80, WORLD_H + BEACH_H - 70, WORLD_W + 160, 90);
  ctx.fillStyle = PAL.water;
  ctx.fillRect(-80, WORLD_H + BEACH_H - 70, WORLD_W + 160, 46);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let wx = -60; wx < WORLD_W + 60; wx += 46) {
    const wy = WORLD_H + BEACH_H - 66 + Math.sin(wx * 0.05 + world.time * 1.4) * 3;
    ctx.moveTo(wx, wy); ctx.lineTo(wx + 24, wy);
  }
  ctx.stroke();
  // Sidewalks: a light apron around every block, with a darker curb edge.
  for (const b of city.blocks) {
    ctx.fillStyle = PAL.sidewalk;
    ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
  }
  // Blocks.
  for (const b of city.blocks) {
    if (b.kind === 1) { ctx.fillStyle = PAL.park; ctx.fillRect(b.x, b.y, b.w, b.h); }
    else if (b.kind === 2) { ctx.fillStyle = '#55585e'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    else if (b.kind === 3) { ctx.fillStyle = '#c9c2b2'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    else { ctx.fillStyle = '#a9a58f'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    // Plaza paving grid.
    if (b.kind === 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = b.x + 25; gx < b.x + b.w; gx += 25) { ctx.moveTo(gx, b.y); ctx.lineTo(gx, b.y + b.h); }
      for (let gy = b.y + 25; gy < b.y + b.h; gy += 25) { ctx.moveTo(b.x, gy); ctx.lineTo(b.x + b.w, gy); }
      ctx.stroke();
    }
    // Parking bays.
    if (b.bays) {
      ctx.strokeStyle = 'rgba(240,240,220,0.55)'; ctx.lineWidth = 2;
      for (const bay of b.bays) ctx.strokeRect(bay.x, bay.y, bay.w, bay.h);
    }
    // Park path + fountain.
    if (b.path) {
      ctx.strokeStyle = '#d8c9a3'; ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.path[0].x, b.path[0].y);
      for (let i = 1; i < b.path.length; i++) ctx.lineTo(b.path[i].x, b.path[i].y);
      ctx.stroke();
    }
    if (b.fountain) {
      ctx.fillStyle = '#7fb8d8'; ctx.beginPath(); ctx.arc(b.fountain.x, b.fountain.y, b.fountain.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.arc(b.fountain.x, b.fountain.y, 5, 0, Math.PI * 2); ctx.fill();
    }
    for (const tr of b.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(tr.x + 4, tr.y + 5, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d7a34'; ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57a047'; ctx.beginPath(); ctx.arc(tr.x - 3, tr.y - 3, tr.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    // Buildings: pseudo-3D — extruded south/east walls, a soft drop shadow cast
    // to the south-east, a parapet roof, and windows that light up at night.
    for (const bd of b.buildings) {
      const ex = bd.hgt * 4, ey = bd.hgt * 4; // extrusion offset
      // Drop shadow (longer at golden hour).
      const shLen = dusk ? 26 : 14;
      ctx.fillStyle = 'rgba(20,26,18,0.28)';
      ctx.beginPath();
      ctx.moveTo(bd.x + ex, bd.y + ey);
      ctx.lineTo(bd.x + bd.w + ex + shLen, bd.y + ey + shLen * 0.4);
      ctx.lineTo(bd.x + bd.w + ex + shLen, bd.y + bd.h + ey + shLen * 0.4);
      ctx.lineTo(bd.x + ex, bd.y + bd.h + ey);
      ctx.closePath(); ctx.fill();
      // East wall.
      ctx.fillStyle = shade(bd.color, 0.62);
      ctx.beginPath();
      ctx.moveTo(bd.x + bd.w, bd.y); ctx.lineTo(bd.x + bd.w + ex, bd.y + ey);
      ctx.lineTo(bd.x + bd.w + ex, bd.y + bd.h + ey); ctx.lineTo(bd.x + bd.w, bd.y + bd.h);
      ctx.closePath(); ctx.fill();
      // South wall.
      ctx.fillStyle = shade(bd.color, 0.78);
      ctx.beginPath();
      ctx.moveTo(bd.x, bd.y + bd.h); ctx.lineTo(bd.x + bd.w, bd.y + bd.h);
      ctx.lineTo(bd.x + bd.w + ex, bd.y + bd.h + ey); ctx.lineTo(bd.x + ex, bd.y + bd.h + ey);
      ctx.closePath(); ctx.fill();
      // Roof.
      ctx.fillStyle = bd.color;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.fillStyle = bd.roof;
      ctx.fillRect(bd.x + 6, bd.y + 6, bd.w - 12, bd.h - 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2;
      ctx.strokeRect(bd.x + 1, bd.y + 1, bd.w - 2, bd.h - 2);
      // Rooftop clutter (AC units / water tank) on taller blocks.
      if (bd.hgt >= 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(bd.x + bd.w * 0.2, bd.y + bd.h * 0.25, 16, 12);
        ctx.fillRect(bd.x + bd.w * 0.62, bd.y + bd.h * 0.55, 12, 10);
      }
      // Windows: pale by day, warm-lit at night (per-building pattern).
      const cols = Math.max(1, Math.floor(bd.w / 34)), rows = Math.max(1, Math.floor(bd.h / 34));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const wx = bd.x + 12 + i * 32, wy = bd.y + 12 + j * 32;
        if (night) {
          const lit = ((bd.litSeed >> ((i * 7 + j * 13) % 24)) & 1) === 1;
          ctx.fillStyle = lit ? 'rgba(255,205,110,0.95)' : 'rgba(30,40,60,0.85)';
        } else ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(wx, wy, 12, 12);
      }
    }
  }
  // Roads (wet sheen in rain).
  ctx.fillStyle = world.rain ? '#454a55' : PAL.road;
  for (const cx of city.roads.v) ctx.fillRect(cx - STREET / 2, -40, STREET, WORLD_H + 40);
  for (const cy of city.roads.h) ctx.fillRect(-40, cy - STREET / 2, WORLD_W + 40, STREET);
  if (world.rain) {
    ctx.fillStyle = 'rgba(170,200,235,0.10)';
    for (const cx of city.roads.v) ctx.fillRect(cx - STREET / 2 + 4, -40, 10, WORLD_H + 40);
    for (const cy of city.roads.h) ctx.fillRect(-40, cy - STREET / 2 + 4, WORLD_W + 40, 10);
  }
  // Lane dashes.
  ctx.strokeStyle = PAL.lane; ctx.lineWidth = 2; ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const cx of city.roads.v) { ctx.moveTo(cx, 0); ctx.lineTo(cx, WORLD_H); }
  for (const cy of city.roads.h) { ctx.moveTo(0, cy); ctx.lineTo(WORLD_W, cy); }
  ctx.stroke(); ctx.setLineDash([]);
  // Crosswalks + stop lines at every intersection.
  ctx.fillStyle = 'rgba(245,245,240,0.75)';
  for (const cx of city.roads.v) for (const cy of city.roads.h) {
    for (let s = -2; s <= 2; s++) {
      ctx.fillRect(cx + s * 9 - 3, cy - STREET / 2 - 12, 6, 9);
      ctx.fillRect(cx + s * 9 - 3, cy + STREET / 2 + 3, 6, 9);
      ctx.fillRect(cx - STREET / 2 - 12, cy + s * 9 - 3, 9, 6);
      ctx.fillRect(cx + STREET / 2 + 3, cy + s * 9 - 3, 9, 6);
    }
  }
  // Direction arrows mid-block on the avenues.
  ctx.fillStyle = 'rgba(245,245,240,0.5)';
  for (const cx of city.roads.v) for (let k = 0; k < 9; k++) {
    const ay = k * PITCH + STREET + BLOCK / 2;
    ctx.beginPath(); ctx.moveTo(cx + 12, ay - 14); ctx.lineTo(cx + 20, ay + 2); ctx.lineTo(cx + 4, ay + 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 12, ay + 14); ctx.lineTo(cx - 20, ay - 2); ctx.lineTo(cx - 4, ay - 2); ctx.closePath(); ctx.fill();
  }
  // Streetlight glow pools at night / dusk.
  if (night || dusk) {
    for (const cx of city.roads.v) for (const cy of city.roads.h) {
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 58);
      g.addColorStop(0, 'rgba(255,214,130,0.20)'); g.addColorStop(1, 'rgba(255,214,130,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe6a8'; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Port containers + pier + marina + lighthouse + boats + palms + beach gear.
  for (const cn of city.containers) { ctx.fillStyle = cn.color; ctx.fillRect(cn.x, cn.y, cn.w, cn.h); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(cn.x, cn.y, cn.w, 8); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(cn.x, cn.y, cn.w, cn.h); }
  ctx.fillStyle = '#8a6f4d'; ctx.fillRect(city.pier.x - 30, WORLD_H + BEACH_H - 120, 60, 120);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let py = WORLD_H + BEACH_H - 112; py < WORLD_H + BEACH_H - 4; py += 12) { ctx.beginPath(); ctx.moveTo(city.pier.x - 30, py); ctx.lineTo(city.pier.x + 30, py); ctx.stroke(); }
  if (city.marina) {
    ctx.fillStyle = '#8a6f4d'; ctx.fillRect(city.marina.x - 190, city.marina.y - 8, 380, 16);
    for (const bt of city.boats) {
      ctx.save(); ctx.translate(bt.x, bt.y); ctx.rotate(bt.a);
      ctx.fillStyle = bt.color;
      ctx.beginPath(); ctx.moveTo(-16, -6); ctx.lineTo(18, -6); ctx.lineTo(24, 0); ctx.lineTo(18, 6); ctx.lineTo(-16, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
  }
  if (city.lighthouse) {
    const lh = city.lighthouse;
    ctx.fillStyle = '#e8e4da'; ctx.fillRect(lh.x - 11, lh.y - 30, 22, 34);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(lh.x - 11, lh.y - 24, 22, 7); ctx.fillRect(lh.x - 11, lh.y - 10, 22, 7);
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(lh.x - 8, lh.y - 36, 16, 7);
    if (night || dusk) {
      const beam = (world.time * 0.5) % (Math.PI * 2);
      ctx.fillStyle = 'rgba(255,240,180,0.13)';
      ctx.beginPath(); ctx.moveTo(lh.x, lh.y - 32);
      ctx.lineTo(lh.x + Math.cos(beam) * 260, lh.y - 32 + Math.sin(beam) * 260);
      ctx.lineTo(lh.x + Math.cos(beam + 0.22) * 260, lh.y - 32 + Math.sin(beam + 0.22) * 260);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(lh.x, lh.y - 32, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const pl of city.palms) {
    ctx.fillStyle = '#4a7a3a'; ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6aa84f'; ctx.beginPath(); ctx.arc(pl.x - 3, pl.y - 3, pl.r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  if (city.umbrellas) for (const um of city.umbrellas) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.arc(um.x + 3, um.y + 4, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = um.color; ctx.beginPath(); ctx.arc(um.x, um.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(um.x, um.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = um.color; ctx.fillRect(um.x + 10, um.y + 6, 20, 9); // towel
  }
  if (city.lifeguards) for (const lg of city.lifeguards) {
    ctx.fillStyle = '#8a6f4d'; ctx.fillRect(lg.x - 12, lg.y - 10, 24, 20);
    ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.moveTo(lg.x - 15, lg.y - 10); ctx.lineTo(lg.x + 15, lg.y - 10); ctx.lineTo(lg.x, lg.y - 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(lg.x - 6, lg.y - 6, 12, 8);
  }
  // Stunt ramps.
  if (city.ramps) for (const rp of city.ramps) {
    ctx.save(); ctx.translate(rp.x, rp.y); ctx.rotate(rp.a);
    ctx.fillStyle = '#d35400'; ctx.fillRect(-22, -16, 44, 32);
    ctx.fillStyle = '#f39c12';
    for (let i = 0; i < 4; i++) ctx.fillRect(-22 + i * 11, -16, 5, 32);
    ctx.restore();
  }
  // Landmark labels (small, drawn on the ground).
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(20,30,40,0.75)';
  ctx.fillText("ROSA'S GARAGE", city.garage.x, city.garage.y - 40);
  ctx.fillText('SAFEHOUSE', city.safehouse.x, city.safehouse.y - 40);
  ctx.fillText('SOLMAR DOCKS', city.docks.x - 90, city.docks.y - 40);
  ctx.fillText('ST. MARINA HOSPITAL', city.hospital.x, city.hospital.y - 40);
  ctx.fillText('PRECINCT 9', city.precinct.x, city.precinct.y - 40);
  if (city.marina) ctx.fillText('SOLMAR MARINA', city.marina.x, city.marina.y - 26);
  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 5;
  for (const s of world.skids) {
    ctx.globalAlpha = clamp(s.life / 2, 0, 0.6);
    ctx.beginPath(); ctx.moveTo(s.x - Math.cos(s.a) * 20, s.y - Math.sin(s.a) * 20); ctx.lineTo(s.x + Math.cos(s.a) * 20, s.y + Math.sin(s.a) * 20); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Mission / job marker (pulsing ring + beacon).
  const marker = world.marker || (world.job ? (world.job.stage === 0 ? world.job.from : world.job.to) : null);
  if (marker && world.screen === 'play') {
    const pulse = 1 + 0.18 * Math.sin(world.time * 4);
    ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(marker.x, marker.y, (marker.r || 44) * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,62,0.18)';
    ctx.beginPath(); ctx.arc(marker.x, marker.y, (marker.r || 44) * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.moveTo(marker.x, marker.y - 34); ctx.lineTo(marker.x - 9, marker.y - 52); ctx.lineTo(marker.x + 9, marker.y - 52); ctx.closePath(); ctx.fill();
  }
  // Pickups.
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    ctx.save(); ctx.translate(pk.x, pk.y);
    const bob = Math.sin(world.time * 3 + pk.x) * 3;
    if (pk.kind === 'cash') { ctx.fillStyle = '#2ecc71'; rr(ctx, -10, -7 + bob, 20, 14, 3); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 4 + bob); }
    else if (pk.kind === 'health') { ctx.fillStyle = '#fff'; rr(ctx, -9, -9 + bob, 18, 18, 4); ctx.fill(); ctx.fillStyle = '#e74c3c'; ctx.fillRect(-2, -6 + bob, 4, 12); ctx.fillRect(-6, -2 + bob, 12, 4); }
    else if (pk.kind === 'armor') { ctx.fillStyle = '#5d6d7e'; rr(ctx, -9, -10 + bob, 18, 20, 6); ctx.fill(); ctx.fillStyle = '#aebfd0'; ctx.fillRect(-5, -6 + bob, 10, 5); ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('V', 0, 6 + bob); }
    else if (pk.kind === 'weapon') { ctx.fillStyle = '#2c3e50'; rr(ctx, -12, -6 + bob, 24, 12, 3); ctx.fill(); ctx.fillStyle = '#f39c12'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText((pk.weapon || 'SMG').toUpperCase(), 0, 3 + bob); }
    else { ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.arc(0, bob, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('A', 0, 3 + bob); }
    ctx.restore();
  }
  // Cars (traffic + police + rivals + player). Airborne stunt cars draw bigger
  // with a separated shadow.
  for (const c of world.cars) {
    const braking = c.brakeLight > 0;
    if (c.air > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(c.x + 14, c.y + 18, 30, 16, c.a, 0, Math.PI * 2); ctx.fill();
      ctx.translate(c.x, c.y); ctx.scale(1.18, 1.18); ctx.translate(-c.x, -c.y);
      drawCar(ctx, c.x, c.y, c.a, c.color, c.kind, night, braking, world.time);
      ctx.restore();
    } else {
      drawCar(ctx, c.x, c.y, c.a, c.color, c.kind, night, braking, world.time);
    }
  }
  // Pedestrians + cops.
  for (const pd of world.peds) if (!pd.dead) drawPed(ctx, pd.x, pd.y, pd.a, pd.color, pd.enemy);
  for (const pd of world.peds) {
    if (!pd.dead) continue;
    ctx.save(); ctx.translate(pd.x, pd.y); ctx.rotate(0.6);
    ctx.fillStyle = pd.color; rr(ctx, -9, -5, 18, 10, 4); ctx.fill();
    ctx.restore();
  }
  for (const cp of world.cops) {
    ctx.save(); ctx.translate(cp.x, cp.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(cp.a); ctx.fillStyle = '#1c2733'; rr(ctx, -7, -5, 14, 10, 4); ctx.fill();
    ctx.fillStyle = '#e8b98a'; ctx.beginPath(); ctx.arc(9, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-7, -5, 14, 3);
    ctx.restore();
  }
  // Player.
  const p = world.player;
  if (p.onFoot) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(p.a);
    ctx.fillStyle = '#f5f0e6'; rr(ctx, -8, -6, 16, 12, 5); ctx.fill();      // jacket
    ctx.fillStyle = '#2c3e50'; rr(ctx, -8, -6, 5, 12, 2); ctx.fill();       // jeans hint
    ctx.fillStyle = '#e8b98a'; ctx.beginPath(); ctx.arc(10, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    // Held weapon: pistol / SMG / shotgun silhouettes.
    ctx.fillStyle = '#22262b';
    if (p.weapon === 'smg') { ctx.fillRect(10, -2, 16, 4); ctx.fillRect(16, 2, 4, 5); }
    else if (p.weapon === 'shotgun') { ctx.fillRect(10, -2, 20, 4); ctx.fillStyle = '#7a4a21'; ctx.fillRect(18, -2, 6, 4); }
    else { ctx.fillStyle = '#c0392b'; ctx.fillRect(10, -3, 12, 4); }
    ctx.restore();
    // Aim line (short, subtle).
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.x + Math.cos(p.aim) * 16, p.y + Math.sin(p.aim) * 16); ctx.lineTo(p.x + Math.cos(p.aim) * 34, p.y + Math.sin(p.aim) * 34); ctx.stroke();
  } else if (p.car) {
    // Player car gets a subtle outline so it reads in traffic.
    ctx.save(); ctx.translate(p.car.x, p.car.y); ctx.rotate(p.car.a);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2;
    rr(ctx, -CAR_L / 2 - 2, -CAR_W / 2 - 2, CAR_L + 4, CAR_W + 4, 9); ctx.stroke();
    ctx.restore();
  }
  // Particles.
  for (const pt of world.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- lighting, HUD, overlays ----
function drawLighting(ctx, world, w, h) {
  const t = world.timeH;
  let tint = null;
  if (t >= 19.5 || t < 5.5) tint = 'rgba(8,16,46,0.42)';
  else if (t >= 17.5) tint = 'rgba(255,110,30,0.16)';      // golden hour
  else if (t >= 5.5 && t < 7.5) tint = 'rgba(255,150,110,0.10)';
  if (world.rain) tint = 'rgba(30,45,70,0.20)';
  if (tint && world.screen !== 'title') { ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h); }
  // Golden-hour sun glow from the west edge.
  if (t >= 17.5 && t < 19.5 && world.screen !== 'title') {
    const g = ctx.createLinearGradient(0, 0, w * 0.5, 0);
    g.addColorStop(0, 'rgba(255,170,80,0.14)'); g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  // Rain streaks (screen space).
  if (world.rain) {
    ctx.strokeStyle = 'rgba(190,210,230,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const x = ((i * 173 + world.time * 300) % (w + 40)) - 20;
      const y = ((i * 97 + world.time * 900) % (h + 40)) - 20;
      ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16);
    }
    ctx.stroke();
  }
}

function drawHUD(ctx, world, w, h) {
  if (world.screen === 'title') return;
  const p = world.player;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // Top-left: health, armor, cash, weapon + ammo, speedometer.
  ctx.fillStyle = 'rgba(10,14,20,0.55)'; rr(ctx, 12, 12, 218, 104, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('VIC TORRES', 24, 34);
  ctx.fillStyle = '#2b2f36'; rr(ctx, 24, 42, 150, 12, 6); ctx.fill();
  ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
  rr(ctx, 24, 42, 150 * Math.max(0, p.hp) / 100, 12, 6); ctx.fill();
  if ((p.armor || 0) > 0) {
    ctx.fillStyle = '#2b2f36'; rr(ctx, 24, 57, 150, 7, 3); ctx.fill();
    ctx.fillStyle = '#7fb8d8'; rr(ctx, 24, 57, 150 * Math.max(0, p.armor) / 100, 7, 3); ctx.fill();
  }
  ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), 24, 82);
  ctx.fillStyle = '#f39c12'; ctx.font = '13px sans-serif';
  const wname = (WEAPONS[p.weapon] || WEAPONS.pistol).name;
  ctx.fillText(`${wname} ${p.ammo}`, 120, 82);
  if (!p.onFoot && p.car) {
    // Speedometer: needle arc + number.
    const kmh = Math.round(Math.abs(p.car.speed) * 0.24);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(196, 94, 14, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
    ctx.strokeStyle = kmh > 110 ? '#e74c3c' : '#ffd23e';
    ctx.beginPath(); ctx.arc(196, 94, 14, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * Math.min(1, kmh / 150)); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${kmh}`, 196, 99); ctx.textAlign = 'left';
    ctx.font = '10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('km/h', 182, 112);
  }
  // Top-right: wanted stars + clock.
  const stars = world.stars();
  ctx.fillStyle = 'rgba(10,14,20,0.55)'; rr(ctx, w - 212, 12, 200, 52, 10); ctx.fill();
  ctx.font = '22px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd23e' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', w - 182 + i * 26, 44);
  }
  ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'right';
  const hh = Math.floor(world.timeH), mm = Math.floor((world.timeH - hh) * 60);
  ctx.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}${world.rain ? '  🌧' : ''}`, w - 24, 44);
  // Objective banner (top-centre).
  if (world.objective) {
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    const tw = ctx.measureText(world.objective).width + 28;
    ctx.fillStyle = 'rgba(10,14,20,0.6)'; rr(ctx, w / 2 - tw / 2, 12, tw, 30, 8); ctx.fill();
    ctx.fillStyle = '#ffd23e'; ctx.fillText(world.objective, w / 2, 32);
  }
  // Mission name + progress.
  if (!world.storyDone && world.mission.index < MISSIONS.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${MISSIONS[world.mission.index].name}  •  Mission ${world.mission.index + 1} of ${MISSIONS.length}`, w / 2, 58);
  }
  // Centre message.
  if (world.msg && world.msgT > 0) {
    const a = clamp(world.msgT, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(world.msg.title, w / 2 + 2, h / 2 - 58);
    ctx.fillStyle = '#fff'; ctx.fillText(world.msg.title, w / 2, h / 2 - 60);
    if (world.msg.sub) { ctx.font = '16px sans-serif'; ctx.fillStyle = '#ffd23e'; ctx.fillText(world.msg.sub, w / 2, h / 2 - 34); }
    ctx.globalAlpha = 1;
  }
  // Bottom-left: controls hint.
  ctx.fillStyle = 'rgba(10,14,20,0.5)'; rr(ctx, 12, h - 40, 560, 28, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('WASD move / drive   •   Mouse aim, Click shoot   •   1/2/3 weapons   •   E enter car   •   Space handbrake   •   P pause   •   M mute', 22, h - 21);
  drawMinimap(ctx, world, w, h);
}

function drawMinimap(ctx, world, w, h) {
  const mw = 190, mh = 150, mx = w - mw - 14, my = h - mh - 14;
  const sx = mw / WORLD_W, sy = mh / (WORLD_H + BEACH_H);
  const s = Math.min(sx, sy);
  ctx.fillStyle = 'rgba(10,14,20,0.65)'; rr(ctx, mx - 6, my - 6, mw + 12, mh + 12, 10); ctx.fill();
  ctx.save();
  ctx.beginPath(); rr(ctx, mx, my, mw, mh, 6); ctx.clip();
  ctx.fillStyle = '#3d6b34'; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = '#2e7fa8'; ctx.fillRect(mx, my + WORLD_H * s, mw, BEACH_H * s);
  ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = 2;
  for (const cx of world.city.roads.v) { ctx.beginPath(); ctx.moveTo(mx + cx * s, my); ctx.lineTo(mx + cx * s, my + WORLD_H * s); ctx.stroke(); }
  for (const cy of world.city.roads.h) { ctx.beginPath(); ctx.moveTo(mx, my + cy * s); ctx.lineTo(mx + WORLD_W * s, my + cy * s); ctx.stroke(); }
  const dot = (x, y, color, r = 3) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mx + x * s, my + y * s, r, 0, Math.PI * 2); ctx.fill(); };
  // Landmark blips: garage (wrench orange), safehouse (green), hospital (white).
  dot(world.city.garage.x, world.city.garage.y, '#e67e22', 3.5);
  dot(world.city.safehouse.x, world.city.safehouse.y, '#2ecc71', 3.5);
  dot(world.city.hospital.x, world.city.hospital.y, '#ffffff', 3);
  const marker = world.marker || (world.job ? (world.job.stage === 0 ? world.job.from : world.job.to) : null);
  if (marker) {
    const pr = 5 + 2 * Math.sin(world.time * 4);
    dot(marker.x, marker.y, '#ffd23e', pr);
  }
  for (const c of world.cars) {
    if (c.kind === 'police') dot(c.x, c.y, '#5aa9ff', 3);
    else if (c.kind === 'rival') dot(c.x, c.y, '#ff5b5b', 3);
  }
  for (const cp of world.cops) dot(cp.x, cp.y, '#5aa9ff', 2.5);
  const p = world.player;
  ctx.save(); ctx.translate(mx + p.x * s, my + p.y * s); ctx.rotate(p.a);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('SOLMAR BAY', mx + 2, my - 10 + 12);
}

function drawOverlays(ctx, world, w, h) {
  const s = world.screen;
  if (s === 'title') {
    ctx.fillStyle = 'rgba(8,12,24,0.45)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 64px sans-serif';
    ctx.fillText('SOLMAR BAY', w / 2, h / 2 - 96);
    ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif';
    ctx.fillText('A street story in the sun — drive, steal, run, survive.', w / 2, h / 2 - 62);
    ctx.font = '15px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Vic Torres is out and owes the Castellanos crew $5,000. Eight jobs stand between him and freedom.', w / 2, h / 2 - 30);
    ctx.fillText('WASD move / drive  •  Mouse aim, Click shoot  •  1/2/3 weapons  •  E enter car  •  Space handbrake  •  P pause  •  M mute', w / 2, h / 2 + 6);
    const blink = 0.55 + 0.45 * Math.sin(world.time * 3);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ffd23e'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(world.hasSave() ? 'Press ENTER — Start or Continue' : 'Press ENTER to start', w / 2, h / 2 + 52);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px sans-serif';
    ctx.fillText('An original game. No Rockstar Games content. Best with sound on.', w / 2, h - 24);
    return;
  }
  if (s === 'pause') {
    ctx.fillStyle = 'rgba(8,12,24,0.6)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText('PAUSED', w / 2, h / 2 - 40);
    ctx.font = '16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('P / Esc — resume      R — restart mission      M — mute      Enter — back to title', w / 2, h / 2);
    ctx.fillText(`Cash $${world.player.cash.toLocaleString('en-US')}   •   Missions ${world.stats.missions}/${MISSIONS.length}   •   Cars stolen ${world.stats.stolen}`, w / 2, h / 2 + 30);
    return;
  }
  if (s === 'busted' || s === 'wasted') {
    ctx.fillStyle = s === 'busted' ? 'rgba(20,40,90,0.55)' : 'rgba(90,10,10,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 56px sans-serif';
    ctx.fillText(s === 'busted' ? 'BUSTED' : 'WASTED', w / 2, h / 2 - 10);
    ctx.font = '16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(s === 'busted' ? 'The precinct took $200. Rosa bailed you out.' : 'St. Marina patched you up — for $200.', w / 2, h / 2 + 24);
  }
}
