// SOLMAR BAY — render.js
// All drawing: the city, cars, people, HUD + minimap, day/night lighting,
// rain, and the title/pause/busted/wasted screens. Buildings are oblique 2.5D boxes
// (extruded faces, sun-tracked shadows, lit windows, neon signs); cars are
// drawn per kind with spinning wheels and working lights. All art is drawn
// in code (canvas vector shapes): no image assets, no network.
// Exports: draw(ctx, world, view). Internal: drawWorld, drawLighting,
// drawHUD, drawMinimap, drawOverlays, drawCar, drawPed.
// Dependencies: config.js (sizes, PAL, VEHICLES, WEAPONS), random.js
// (clamp, lerp, dist), world.js (MISSIONS).
import { WORLD_W, WORLD_H, BEACH_H, STREET, BLOCK, PITCH, CAR_W, CAR_L, PLAYER_R, PLAYER_SPEED, PAL, VEHICLES, WEAPONS } from './config.js';
import { clamp, lerp, dist } from './random.js';
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

function hexA(hex, a) {
  // A #rrggbb colour at alpha a, as an rgba() string (for gradient stops).
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawCar(ctx, x, y, a, color, kind, lights, brake, flash, wheelPhase = 0) {
  const spec = VEHICLES[kind] || VEHICLES.sedan;
  const L = spec.l, W = spec.w;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 8); ctx.fill();
  // Wheels (a thin rotating spoke makes the spin read).
  const wx = L / 2 - 13, wy = W / 2 - 2;
  for (const [sx, sy] of [[wx, -wy], [wx, wy], [-wx, -wy], [-wx, wy]]) {
    ctx.fillStyle = '#14161a';
    ctx.fillRect(sx - 5, sy - 3, 10, 6);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(wheelPhase);
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-5, -1, 10, 2);
    ctx.restore();
  }
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

function drawPed(ctx, x, y, a, color, enemy, walkPhase = 0) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(a);
  // Legs swing in opposite phase (drawn before the body so the hips stay covered).
  ctx.fillStyle = shade(color, 0.65);
  const sw = Math.sin(walkPhase) * 4;
  ctx.fillRect(-6 + sw, -6, 7, 3);   // left leg
  ctx.fillRect(-6 - sw, 3, 7, 3);    // right leg (sin(walkPhase + PI))
  ctx.fillStyle = color;
  rr(ctx, -7, -5, 14, 10, 4); ctx.fill();           // body
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath(); ctx.arc(9, 0, 4.5, 0, Math.PI * 2); ctx.fill(); // head
  if (enemy) { ctx.fillStyle = '#222'; ctx.fillRect(10, -2, 10, 3); } // gun
  ctx.restore();
}

// Skyline landmarks, picked once per city (render-only flags on the chosen
// buildings; deterministic from the seeded layout, no gameplay effect):
//  - helipad on the flagship tower: an hgt-5 building nearest the map
//    centre (else the tallest nearest the centre);
//  - water towers on the tallest remaining downtown towers, the second at
//    least 500px from the first so they read as separate landmarks.
function pickLandmarks(city) {
  if (city._lmPicked) return;
  city._lmPicked = true;
  const cx = WORLD_W / 2, cy = WORLD_H / 2;
  const all = [];
  for (const b of city.blocks) for (const bd of b.buildings) {
    const dx = bd.x + bd.w / 2 - cx, dy = bd.y + bd.h / 2 - cy;
    all.push({ bd, d: dx * dx + dy * dy });
  }
  if (!all.length) return;
  const byHeightThenCentre = (a, b) => (b.bd.hgt - a.bd.hgt) || (a.d - b.d);
  const fives = all.filter(e => e.bd.hgt === 5).sort((a, b) => a.d - b.d);
  const flagship = (fives.length ? fives[0] : [...all].sort(byHeightThenCentre)[0]).bd;
  flagship.helipad = true;
  const tall = all.filter(e => e.bd !== flagship && e.bd.hgt >= 4).sort(byHeightThenCentre);
  const picks = [];
  for (const e of tall) {
    if (picks.length >= 2) break;
    if (picks.some(p => {
      const dx = p.x + p.w / 2 - (e.bd.x + e.bd.w / 2), dy = p.y + p.h / 2 - (e.bd.y + e.bd.h / 2);
      return dx * dx + dy * dy < 500 * 500;
    })) continue;
    picks.push(e.bd);
  }
  for (const bd of picks) bd.waterTower = true;
}

// One building as an oblique 2.5D box: the roof is lifted H px north (and a
// touch west) off the ground footprint, so the south and east faces show.
// The faces carry the windows, awning and neon that used to sit on the roof
// rect; the drop shadow is cast from the roof rect along the sun vector.
// H is non-linear in the height class so downtown towers (hgt 4-5) stand
// clearly above the mid-ring in the skyline: 11 / 22 / 39 / 56 / 73 px.
function bldH(bd) { return bd.hgt <= 2 ? bd.hgt * 11 : 22 + (bd.hgt - 2) * 17; }

function drawBuilding(ctx, bd, world, night, dusk, t) {
  const H = bldH(bd);                     // extrusion height: 11..73px
  const ox = -H * 0.32, oy = -H;          // roof offset (oblique projection)
  const rx = bd.x + ox, ry = bd.y + oy;   // roof top-left corner
  const by = bd.y + bd.h;                 // footprint south edge
  // Drop shadow: length + direction follow the sun. Morning shadows are long
  // and fall to the west, midday shadows are short and straight south,
  // golden-hour shadows stretch east; at night they shrink away.
  let shLen, shAngle;
  if (t >= 6 && t < 12) {
    const k = (t - 6) / 6;
    shLen = lerp(32, 10, k); shAngle = lerp(Math.PI * 1.1, Math.PI * 0.6, k);
  } else if (t >= 12 && t < 17.5) {
    shLen = lerp(10, 12, (t - 12) / 5.5); shAngle = Math.PI * 0.5;
  } else if (t >= 17.5 && t < 19.5) {
    const k = (t - 17.5) / 2;
    shLen = lerp(12, 32, k); shAngle = lerp(Math.PI * 0.5, Math.PI * 0.25, k);
  } else {
    shLen = 8; shAngle = Math.PI * 0.5;
  }
  const shx = Math.cos(shAngle) * shLen, shy = Math.sin(shAngle) * shLen;
  // Shadow silhouette: the footprint swept to the displaced roof rect (both
  // rects + all four edge quads in one path, so any sun direction works).
  const fp = [[bd.x, bd.y], [bd.x + bd.w, bd.y], [bd.x + bd.w, by], [bd.x, by]];
  const rp = fp.map(([px, py]) => [px + ox + shx, py + oy + shy]);
  ctx.fillStyle = 'rgba(20,26,18,0.28)';
  ctx.beginPath();
  ctx.moveTo(fp[0][0], fp[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(fp[i][0], fp[i][1]); ctx.closePath();
  ctx.moveTo(rp[0][0], rp[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(rp[i][0], rp[i][1]); ctx.closePath();
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    ctx.moveTo(fp[i][0], fp[i][1]); ctx.lineTo(fp[j][0], fp[j][1]);
    ctx.lineTo(rp[j][0], rp[j][1]); ctx.lineTo(rp[i][0], rp[i][1]); ctx.closePath();
  }
  ctx.fill();
  // East face (darkest), then the south face.
  ctx.fillStyle = shade(bd.color, 0.60);
  ctx.beginPath();
  ctx.moveTo(bd.x + bd.w, bd.y); ctx.lineTo(bd.x + bd.w, by);
  ctx.lineTo(rx + bd.w, by + oy); ctx.lineTo(rx + bd.w, ry);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(bd.color, 0.78);
  ctx.beginPath();
  ctx.moveTo(bd.x, by); ctx.lineTo(bd.x + bd.w, by);
  ctx.lineTo(rx + bd.w, by + oy); ctx.lineTo(rx, by + oy);
  ctx.closePath(); ctx.fill();
  // Floor-division lines: thin storey bands across both faces (~1 per 16px
  // of height, capped at 4), sheared with the face like the windows. This
  // is what makes a face read as a multi-storey building at screenshot
  // scale instead of a flat slab.
  const floors = Math.min(4, Math.round(H / 16));
  if (floors > 0) {
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 1; k <= floors; k++) {
      const v = k / (floors + 1);
      // South face: horizontal band at height fraction v.
      ctx.moveTo(bd.x + ox * v, by - H * v);
      ctx.lineTo(bd.x + bd.w + ox * v, by - H * v);
      // East face: band runs along the depth direction at fraction v.
      ctx.moveTo(bd.x + bd.w + ox * v, bd.y + oy * v);
      ctx.lineTo(bd.x + bd.w + ox * v, by + oy * v);
    }
    ctx.stroke();
  }
  // Ambient occlusion at the south-face base, where the wall meets the ground.
  const ao = ctx.createLinearGradient(0, by - H * 0.45, 0, by);
  ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.20)');
  ctx.fillStyle = ao;
  ctx.beginPath();
  ctx.moveTo(bd.x, by); ctx.lineTo(bd.x + bd.w, by);
  ctx.lineTo(rx + bd.w, by + oy); ctx.lineTo(rx, by + oy);
  ctx.closePath(); ctx.fill();
  // Roof: parapet edge + inner slab + rooftop clutter on taller blocks. The
  // roof plane is brightened past the wall colour so it catches the dusk
  // tint harder than the faces (shade() clamps at 255).
  ctx.fillStyle = shade(bd.color, 1.10);
  ctx.fillRect(rx, ry, bd.w, bd.h);
  ctx.fillStyle = shade(bd.roof, 1.08);
  ctx.fillRect(rx + 6, ry + 6, bd.w - 12, bd.h - 12);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2;
  ctx.strokeRect(rx + 1, ry + 1, bd.w - 2, bd.h - 2);
  if (bd.helipad) {
    // Flagship tower: a helipad roundel on the roof (circle + H).
    const hx = rx + bd.w / 2, hy = ry + bd.h / 2, hr = Math.min(bd.w, bd.h) * 0.30;
    ctx.strokeStyle = 'rgba(245,245,240,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(245,245,240,0.9)';
    ctx.font = `bold ${Math.round(hr * 0.9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('H', hx, hy + 1);
    ctx.textBaseline = 'alphabetic';
  } else if (bd.hgt >= 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(rx + bd.w * 0.2, ry + bd.h * 0.25, 16, 12);
    ctx.fillRect(rx + bd.w * 0.62, ry + bd.h * 0.55, 12, 10);
  }
  if (bd.waterTower) {
    // Rooftop water tower: three legs, a tapered tank and an ellipse cap —
    // an iconic skyline silhouette on one or two downtown towers.
    const tx = rx + bd.w * 0.5, ty = ry + bd.h * 0.42;
    const tw = Math.min(30, bd.w * 0.30), th = tw * 0.72, legH = 9;
    ctx.strokeStyle = '#4a4238'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx - tw * 0.38, ty + th / 2); ctx.lineTo(tx - tw * 0.48, ty + th / 2 + legH);
    ctx.moveTo(tx, ty + th / 2); ctx.lineTo(tx, ty + th / 2 + legH);
    ctx.moveTo(tx + tw * 0.38, ty + th / 2); ctx.lineTo(tx + tw * 0.48, ty + th / 2 + legH);
    ctx.stroke();
    ctx.fillStyle = '#7a6a52';
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2, ty - th / 2); ctx.lineTo(tx + tw / 2, ty - th / 2);
    ctx.lineTo(tx + tw * 0.36, ty + th / 2); ctx.lineTo(tx - tw * 0.36, ty + th / 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(tx - tw * 0.44, ty - 1, tw * 0.88, 2); // tank band
    ctx.fillStyle = '#8f7d60';
    ctx.beginPath(); ctx.ellipse(tx, ty - th / 2, tw / 2, tw * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Windows on the south face: a grid sheared with the face (u across the
  // width, v up the height). Pale by day, warm-lit at night (per-building
  // pattern). Low-rise shopfronts with an awning skip the window row.
  const hasAwning = bd.hgt === 1 && bd.litSeed % 3 === 0;
  if (!hasAwning) {
    const cols = Math.max(1, Math.floor(bd.w / 34));
    const rows = Math.max(1, Math.floor(H / 16));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const u = (i + 0.5) / cols, v = (j + 0.5) / rows;
      const wx = bd.x + u * bd.w + ox * v - 5, wy = by - H * v - 3;
      if (night) {
        const lit = ((bd.litSeed >> ((i * 7 + j * 13) % 24)) & 1) === 1;
        ctx.fillStyle = lit ? 'rgba(255,205,110,0.95)' : 'rgba(30,40,60,0.85)';
      } else ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(wx, wy, 10, 6);
    }
  }
  // Shop awning: a striped canopy along the ground floor of some low-rise
  // south faces (street-level detail at the base of the face).
  if (hasAwning) {
    const awnColors = ['#c0392b', '#2980b9', '#27ae60', '#e67e22', '#8e44ad'];
    const ax0 = bd.x + 4, ay0 = by - 9, aw = bd.w - 8;
    ctx.fillStyle = awnColors[bd.litSeed % awnColors.length];
    ctx.fillRect(ax0, ay0, aw, 7);
    ctx.save();
    ctx.beginPath(); ctx.rect(ax0, ay0, aw, 7); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let sx = ax0 - 7; sx < ax0 + aw; sx += 12) { ctx.moveTo(sx, ay0 + 7); ctx.lineTo(sx + 7, ay0); }
    ctx.stroke();
    ctx.restore();
  }
  // Neon sign (a few downtown towers): glowing text mounted high on the
  // south face, lit from dusk on. Each sign pulses out of phase via litSeed.
  if ((night || dusk) && bd.neon) {
    const pulse = 0.8 + 0.2 * Math.sin(world.time * 2.5 + bd.litSeed);
    const nx = bd.x + bd.w / 2 + ox * 0.8, ny = by - H * 0.8 + 7;
    ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
    ctx.shadowColor = bd.neonColor; ctx.shadowBlur = 26;
    ctx.fillStyle = bd.neonColor;
    ctx.globalAlpha = 0.75 * pulse; ctx.fillText(bd.neonText, nx, ny);
    ctx.globalAlpha = 1.0 * pulse; ctx.fillText(bd.neonText, nx, ny);
    ctx.shadowBlur = 0; // shadowBlur is expensive — always reset it
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = pulse; ctx.fillText(bd.neonText, nx, ny);
    ctx.globalAlpha = 1;
  }
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
  pickLandmarks(city);
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
  // Sun shimmer: short bright stripes drifting slowly right across the water.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  const shimY0 = WORLD_H + BEACH_H - 70;
  for (let gy = shimY0 + 4; gy < shimY0 + 84; gy += 16) {
    for (let gx = -60; gx < WORLD_W + 60; gx += 140) {
      const sx = gx + ((world.time * 22 + gx * 0.07) % 140);
      const len = 18 + Math.sin(gx * 0.03 + world.time * 1.1) * 8;
      ctx.globalAlpha = 0.1 + Math.sin(world.time * 2 + gx * 0.04) * 0.1;
      ctx.beginPath(); ctx.moveTo(sx, gy); ctx.lineTo(sx + len, gy); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
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
  // Wet-night reflections: streetlight streaks smeared down the asphalt at
  // every intersection, and neon signs bleeding colour onto the nearest road.
  if (night && world.rain) {
    for (const cx of city.roads.v) for (const cy of city.roads.h) {
      const g = ctx.createLinearGradient(cx, cy, cx, cy + 60);
      g.addColorStop(0, 'rgba(255,214,130,0.22)'); g.addColorStop(1, 'rgba(255,214,130,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 3, cy, 6, 60);
    }
  }
  if (night) {
    for (const b of city.blocks) for (const bd of b.buildings) {
      if (!bd.neon) continue;
      const bcx = bd.x + bd.w / 2, bcy = bd.y + bd.h / 2;
      let ncx = city.roads.v[0];
      for (const cx of city.roads.v) if (Math.abs(cx - bcx) < Math.abs(ncx - bcx)) ncx = cx;
      const toward = ncx < bcx ? -1 : 1; // streak runs from the wall toward the road
      const sx0 = toward < 0 ? bd.x : bd.x + bd.w;
      const g = ctx.createLinearGradient(sx0, bcy, sx0 + toward * 40, bcy);
      g.addColorStop(0, hexA(bd.neonColor, 0.08)); g.addColorStop(1, hexA(bd.neonColor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(sx0, sx0 + toward * 40), bcy - 3, 40, 6);
    }
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
      ctx.save(); ctx.translate(bt.x, bt.y);
      ctx.translate(0, Math.sin(world.time * 0.9 + (bt.bobOffset || 0)) * 3); // gentle bob
      ctx.rotate(bt.a);
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
  // Park/sidewalk benches (flat ground props; tall props — billboards and
  // bus-stop shelters — draw in the depth-sorted entity pass below).
  for (const b of city.blocks) if (b.benches) for (const bn of b.benches) {
    ctx.fillStyle = '#8a6f4d'; ctx.fillRect(bn.x, bn.y, 22, 6);
    ctx.fillStyle = '#5d4a33'; ctx.fillRect(bn.x + 1, bn.y + 6, 3, 5); ctx.fillRect(bn.x + 18, bn.y + 6, 3, 5);
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
  // Collectible postcards: a bobbing white card with an orange border, a stamp
  // corner and address lines (all drawn — no emoji, for consistent rendering).
  for (const pc of world.postcards) {
    if (pc.found) continue;
    ctx.save(); ctx.translate(pc.x, pc.y);
    const bob = Math.sin(world.time * 2.2 + pc.x * 0.01) * 3;
    ctx.fillStyle = '#fff'; rr(ctx, -9, -6 + bob, 18, 12, 2); ctx.fill();
    ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 2; rr(ctx, -9, -6 + bob, 18, 12, 2); ctx.stroke();
    ctx.fillStyle = '#f39c12'; ctx.fillRect(3, -4 + bob, 4, 4);
    ctx.fillStyle = 'rgba(44,62,80,0.6)';
    ctx.fillRect(-7, -3 + bob, 8, 1.5); ctx.fillRect(-7, 0 + bob, 8, 1.5); ctx.fillRect(-7, 3 + bob, 5, 1.5);
    ctx.restore();
  }
  // Headlight pools on the asphalt at night: a flattened oval of light just
  // ahead of each car, under the cones drawn with the cars themselves.
  if (night) {
    let pools = 0;
    for (const c of world.cars) {
      if (pools >= 20) break;
      if (c.hp <= 0) continue;
      pools++;
      const px = c.x + Math.cos(c.a) * 55, py = c.y + Math.sin(c.a) * 55;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 55);
      g.addColorStop(0, 'rgba(255,235,160,0.13)'); g.addColorStop(1, 'rgba(255,235,160,0)');
      ctx.save();
      ctx.translate(px, py); ctx.scale(1.4, 0.65); ctx.translate(-px, -py);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  // Depth-sorted entity pass (2.5D): buildings, tall props, cars and people
  // in one list keyed by ground y, so a tower occludes whatever is behind it
  // (north) and street life in front (south) draws over its faces. Ground,
  // roads and flat props stay in the base pass above.
  const p = world.player;
  const ents = [];
  for (const b of city.blocks) for (const bd of b.buildings)
    ents.push({ y: bd.y + bd.h, fn: () => drawBuilding(ctx, bd, world, night, dusk, t) });
  if (city.billboards) for (const bb of city.billboards)
    ents.push({ y: bb.y + bb.h + 20, fn: () => {
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(bb.x + bb.w / 2 - 2, bb.y + bb.h, 4, 20); // pole
      ctx.fillStyle = bb.color; ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.strokeRect(bb.x + 1, bb.y + 1, bb.w - 2, bb.h - 2);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      const words = bb.text.split(' ');
      if (words.length > 1 && bb.text.length > 11) {
        const mid = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, mid).join(' '), bb.x + bb.w / 2, bb.y + 16);
        ctx.fillText(words.slice(mid).join(' '), bb.x + bb.w / 2, bb.y + 28);
      } else ctx.fillText(bb.text, bb.x + bb.w / 2, bb.y + 23);
    } });
  if (city.busStops) for (const bs of city.busStops)
    ents.push({ y: bs.y + 14, fn: () => {
      ctx.fillStyle = '#3a4149'; ctx.fillRect(bs.x, bs.y - 14, 6, 28);              // back wall
      ctx.fillStyle = '#5d6d7e'; ctx.fillRect(bs.x - 16, bs.y - 17, 22, 5);          // roof
      ctx.fillStyle = '#3a4149'; ctx.fillRect(bs.x - 14, bs.y - 12, 3, 20);          // pole
      ctx.fillStyle = '#8a6f4d'; ctx.fillRect(bs.x - 12, bs.y + 2, 14, 5);           // bench
      ctx.fillStyle = '#f1c40f'; ctx.fillRect(bs.x - 2, bs.y - 17, 4, 4);            // route sign
    } });
  // Cars (traffic + police + rivals + player). Airborne stunt cars draw
  // bigger with a separated shadow.
  for (const c of world.cars)
    ents.push({ y: c.y, fn: () => {
      const braking = c.brakeLight > 0;
      if (c.air > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(c.x + 14, c.y + 18, 30, 16, c.a, 0, Math.PI * 2); ctx.fill();
        ctx.translate(c.x, c.y); ctx.scale(1.18, 1.18); ctx.translate(-c.x, -c.y);
        drawCar(ctx, c.x, c.y, c.a, c.color, c.kind, night, braking, world.time, c.speed * world.time * 0.12);
        ctx.restore();
      } else {
        drawCar(ctx, c.x, c.y, c.a, c.color, c.kind, night, braking, world.time, c.speed * world.time * 0.12);
      }
      // Player car gets a subtle outline so it reads in traffic.
      if (!p.onFoot && p.car === c) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
        ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2;
        rr(ctx, -CAR_L / 2 - 2, -CAR_W / 2 - 2, CAR_L + 4, CAR_W + 4, 9); ctx.stroke();
        ctx.restore();
      }
    } });
  // Pedestrians + cops.
  for (const pd of world.peds) if (!pd.dead)
    ents.push({ y: pd.y, fn: () => drawPed(ctx, pd.x, pd.y, pd.a, pd.color, pd.enemy, world.time * pd.speed * 0.08) });
  for (const pd of world.peds) if (pd.dead)
    ents.push({ y: pd.y, fn: () => {
      ctx.save(); ctx.translate(pd.x, pd.y); ctx.rotate(0.6);
      ctx.fillStyle = pd.color; rr(ctx, -9, -5, 18, 10, 4); ctx.fill();
      ctx.restore();
    } });
  for (const cp of world.cops)
    ents.push({ y: cp.y, fn: () => {
      ctx.save(); ctx.translate(cp.x, cp.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 3, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(cp.a);
      // Legs swing fast — foot cops run at 185 u/s.
      ctx.fillStyle = '#141c26';
      const csw = Math.sin(world.time * 185 * 0.08) * 4;
      ctx.fillRect(-6 + csw, -6, 7, 3); ctx.fillRect(-6 - csw, 3, 7, 3);
      ctx.fillStyle = '#1c2733'; rr(ctx, -7, -5, 14, 10, 4); ctx.fill();
      ctx.fillStyle = '#e8b98a'; ctx.beginPath(); ctx.arc(9, 0, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-7, -5, 14, 3);
      ctx.restore();
    } });
  // Player on foot (the car case is handled in the car pass above).
  if (p.onFoot)
    ents.push({ y: p.y, fn: () => {
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(p.a);
      // Legs swing only while actually moving; standing still keeps phase 0.
      ctx.fillStyle = '#2c3e50';
      const psw = Math.sin(world.time * (p.moving ? PLAYER_SPEED : 0) * 0.07) * 4;
      ctx.fillRect(-7 + psw, -7, 8, 3); ctx.fillRect(-7 - psw, 4, 8, 3);
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
    } });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) e.fn();
  // Particles.
  for (const pt of world.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Floating cash popups (+$400 and friends).
  ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
  for (const tp of world.textPops) {
    ctx.globalAlpha = clamp(tp.life / tp.max, 0, 1);
    ctx.fillStyle = tp.color;
    ctx.fillText(tp.text, tp.x, tp.y);
  }
  ctx.globalAlpha = 1;
}

// ---- lighting, HUD, overlays ----
function drawLighting(ctx, world, w, h) {
  const t = world.timeH;
  let tint = null;
  // Deep night tint: darker ambient so streetlights, neons and headlights
  // pop against it (the lit pools carry the night look, not the wash).
  if (t >= 19.5 || t < 5.5) tint = 'rgba(8,16,46,0.52)';
  else if (t >= 17.5) tint = 'rgba(255,110,30,0.16)';      // golden hour
  else if (t >= 5.5 && t < 7.5) tint = 'rgba(255,150,110,0.10)';
  if (world.rain) tint = (t >= 19.5 || t < 5.5) ? 'rgba(16,26,48,0.38)' : 'rgba(30,45,70,0.20)';
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
  // Top-left: health, armor, cash, weapon + ammo, postcards, speedometer.
  ctx.fillStyle = 'rgba(10,14,20,0.55)'; rr(ctx, 12, 12, 218, 120, 10); ctx.fill();
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
  ctx.font = '12px sans-serif';
  ctx.fillText(`POSTCARDS ${world.postcardsFound}/20`, 24, 104);
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
    const sx = w - 182 + i * 26, sy = 44;
    ctx.fillStyle = i < stars ? '#ffd23e' : 'rgba(255,255,255,0.25)';
    if (i === stars - 1 && world.wantedFlash > 0) {
      // The newest star pulses as the heat rises.
      const sc = 1 + 0.4 * (world.wantedFlash / 0.6);
      ctx.save(); ctx.translate(sx, sy); ctx.scale(sc, sc); ctx.translate(-sx, -sy);
      ctx.fillText('★', sx, sy);
      ctx.restore();
    } else ctx.fillText('★', sx, sy);
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
  // Postcard proximity hint (blinks under the objective banner).
  if (world.postcards.some(pc => !pc.found && dist(p.x, p.y, pc.x, pc.y) < 150)) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(world.time * 6);
    ctx.fillStyle = '#f39c12'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('POSTCARD NEARBY', w / 2, 76);
    ctx.globalAlpha = 1;
  }
  // Centre message: slides in from above over the first 0.4s; mission wins
  // get a green banner with a yellow border.
  if (world.msg && world.msgT > 0) {
    const a = clamp(world.msgT, 0, 1);
    const slideIn = world.msgDur > 0 ? clamp((world.msgDur - world.msgT) / 0.4, 0, 1) : 1;
    const msgY = h / 2 - 60 - (1 - slideIn) * 70;
    const isMission = world.msg.title.includes('PASSED') || world.msg.title.includes('COMPLETE');
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    if (isMission) {
      ctx.font = 'bold 34px sans-serif';
      const tw = ctx.measureText(world.msg.title).width + 56;
      ctx.fillStyle = 'rgba(30,120,30,0.75)';
      rr(ctx, w / 2 - tw / 2, msgY - 42, tw, 58, 10); ctx.fill();
      ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
      rr(ctx, w / 2 - tw / 2, msgY - 42, tw, 58, 10); ctx.stroke();
    }
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(world.msg.title, w / 2 + 2, msgY + 2);
    ctx.fillStyle = '#fff'; ctx.fillText(world.msg.title, w / 2, msgY);
    if (world.msg.sub) { ctx.font = '16px sans-serif'; ctx.fillStyle = '#ffd23e'; ctx.fillText(world.msg.sub, w / 2, msgY + 26); }
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
  // Postcard blips only show when one is close — a hint, not a map reveal.
  for (const pc of world.postcards) {
    if (pc.found) continue;
    if (dist(world.player.x, world.player.y, pc.x, pc.y) < 350) dot(pc.x, pc.y, '#f39c12', 2.5);
  }
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
    // Logo treatment: burnt-orange drop shadow + dark outline under the gold.
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = '#8a3900'; ctx.fillText('SOLMAR BAY', w / 2 + 3, h / 2 - 92);
    ctx.strokeStyle = '#a05000'; ctx.lineWidth = 3; ctx.strokeText('SOLMAR BAY', w / 2, h / 2 - 96);
    ctx.fillStyle = '#ffd23e'; ctx.fillText('SOLMAR BAY', w / 2, h / 2 - 96);
    ctx.fillStyle = '#fff'; ctx.font = 'italic 22px sans-serif';
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
