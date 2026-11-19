// SOLMAR BAY — rendering: the city, the cars, the people, the HUD with its minimap,
// the day/night light, the rain, and the title / pause / busted / wasted screens.
// All art is drawn in code (canvas vector shapes): no image assets, no network.
import { WORLD_W, WORLD_H, BEACH_H, STREET, BLOCK, PITCH, CAR_W, CAR_L, PLAYER_R, PAL } from './config.js';
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

function drawCar(ctx, x, y, a, color, kind, lights) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rr(ctx, -CAR_L / 2 + 3, -CAR_W / 2 + 4, CAR_L, CAR_W, 8); ctx.fill();
  // Body.
  ctx.fillStyle = color;
  rr(ctx, -CAR_L / 2, -CAR_W / 2, CAR_L, CAR_W, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  rr(ctx, -CAR_L / 2, -CAR_W / 2, CAR_L, 10, 8); ctx.fill();
  // Cabin + windows.
  ctx.fillStyle = kind === 'police' ? '#dfe6ee' : '#20262e';
  rr(ctx, -14, -CAR_W / 2 + 5, 26, CAR_W - 10, 5); ctx.fill();
  if (kind === 'police') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-4, -CAR_W / 2 + 2, 8, 4); ctx.fillRect(-4, CAR_W / 2 - 6, 8, 4);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(-18, -CAR_W / 2 + 6, 6, 8);
    ctx.fillStyle = '#2980b9'; ctx.fillRect(-18, CAR_W / 2 - 14, 6, 8);
  }
  if (kind === 'taxi') { ctx.fillStyle = '#111'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 8, 3); }
  // Headlights / taillights.
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(CAR_L / 2 - 3, -CAR_W / 2 + 3, 3, 6); ctx.fillRect(CAR_L / 2 - 3, CAR_W / 2 - 9, 3, 6);
  ctx.fillStyle = '#ff3b30'; ctx.fillRect(-CAR_L / 2, -CAR_W / 2 + 3, 3, 6); ctx.fillRect(-CAR_L / 2, CAR_W / 2 - 9, 3, 6);
  if (lights) {
    ctx.fillStyle = 'rgba(255,240,180,0.10)';
    ctx.beginPath(); ctx.moveTo(CAR_L / 2, -14); ctx.lineTo(CAR_L / 2 + 150, -70); ctx.lineTo(CAR_L / 2 + 150, 70); ctx.lineTo(CAR_L / 2, 14); ctx.closePath(); ctx.fill();
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
  // Ground: grass, then beach + water.
  ctx.fillStyle = PAL.grass;
  ctx.fillRect(-80, -80, WORLD_W + 160, WORLD_H + BEACH_H + 160);
  ctx.fillStyle = PAL.sand;
  ctx.fillRect(-80, WORLD_H, WORLD_W + 160, BEACH_H - 70);
  ctx.fillStyle = PAL.waterDeep;
  ctx.fillRect(-80, WORLD_H + BEACH_H - 70, WORLD_W + 160, 90);
  ctx.fillStyle = PAL.water;
  ctx.fillRect(-80, WORLD_H + BEACH_H - 70, WORLD_W + 160, 46);
  // Blocks.
  for (const b of city.blocks) {
    if (b.kind === 1) { ctx.fillStyle = PAL.park; ctx.fillRect(b.x, b.y, b.w, b.h); }
    else if (b.kind === 2) { ctx.fillStyle = '#55585e'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    else if (b.kind === 3) { ctx.fillStyle = '#c9c2b2'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    else { ctx.fillStyle = '#a9a58f'; ctx.fillRect(b.x, b.y, b.w, b.h); }
    for (const tr of b.trees) {
      ctx.fillStyle = '#3d7a34'; ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#57a047'; ctx.beginPath(); ctx.arc(tr.x - 3, tr.y - 3, tr.r * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    for (const bd of b.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bd.x + 5 + bd.hgt * 2, bd.y + 6 + bd.hgt * 2, bd.w, bd.h);
      ctx.fillStyle = bd.color;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.fillStyle = bd.roof;
      ctx.fillRect(bd.x + 6, bd.y + 6, bd.w - 12, bd.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const cols = Math.max(1, Math.floor(bd.w / 34)), rows = Math.max(1, Math.floor(bd.h / 34));
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        ctx.fillRect(bd.x + 12 + i * 32, bd.y + 12 + j * 32, 12, 12);
      }
    }
  }
  // Roads.
  ctx.fillStyle = PAL.road;
  for (const cx of city.roads.v) ctx.fillRect(cx - STREET / 2, -40, STREET, WORLD_H + 40);
  for (const cy of city.roads.h) ctx.fillRect(-40, cy - STREET / 2, WORLD_W + 40, STREET);
  // Lane dashes.
  ctx.strokeStyle = PAL.lane; ctx.lineWidth = 2; ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const cx of city.roads.v) { ctx.moveTo(cx, 0); ctx.lineTo(cx, WORLD_H); }
  for (const cy of city.roads.h) { ctx.moveTo(0, cy); ctx.lineTo(WORLD_W, cy); }
  ctx.stroke(); ctx.setLineDash([]);
  // Port containers + pier + palms.
  for (const cn of city.containers) { ctx.fillStyle = cn.color; ctx.fillRect(cn.x, cn.y, cn.w, cn.h); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(cn.x, cn.y, cn.w, 8); }
  ctx.fillStyle = '#8a6f4d'; ctx.fillRect(city.pier.x - 30, WORLD_H + BEACH_H - 120, 60, 120);
  for (const pl of city.palms) {
    ctx.fillStyle = '#4a7a3a'; ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6aa84f'; ctx.beginPath(); ctx.arc(pl.x - 3, pl.y - 3, pl.r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
  // Landmark labels (small, drawn on the ground).
  ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(20,30,40,0.75)';
  ctx.fillText("ROSA'S GARAGE", city.garage.x, city.garage.y - 40);
  ctx.fillText('SAFEHOUSE', city.safehouse.x, city.safehouse.y - 40);
  ctx.fillText('SOLMAR DOCKS', city.docks.x - 90, city.docks.y - 40);
  ctx.fillText('ST. MARINA HOSPITAL', city.hospital.x, city.hospital.y - 40);
  ctx.fillText('PRECINCT 9', city.precinct.x, city.precinct.y - 40);
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
    else { ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.arc(0, bob, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('A', 0, 3 + bob); }
    ctx.restore();
  }
  // Cars (traffic + police + player).
  for (const c of world.cars) drawCar(ctx, c.x, c.y, c.a, c.color, c.kind, night);
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
    ctx.fillStyle = '#c0392b'; ctx.fillRect(10, -3, 12, 4);                  // pistol
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
  else if (t >= 17.5) tint = 'rgba(255,120,40,0.13)';
  else if (t >= 5.5 && t < 7.5) tint = 'rgba(255,150,110,0.10)';
  if (world.rain) tint = 'rgba(30,45,70,0.20)';
  if (tint && world.screen !== 'title') { ctx.fillStyle = tint; ctx.fillRect(0, 0, w, h); }
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
  // Top-left: health, cash, ammo.
  ctx.fillStyle = 'rgba(10,14,20,0.55)'; rr(ctx, 12, 12, 218, 86, 10); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif';
  ctx.fillText('VIC TORRES', 24, 34);
  ctx.fillStyle = '#2b2f36'; rr(ctx, 24, 42, 150, 12, 6); ctx.fill();
  ctx.fillStyle = p.hp > 40 ? '#2ecc71' : '#e74c3c';
  rr(ctx, 24, 42, 150 * Math.max(0, p.hp) / 100, 12, 6); ctx.fill();
  ctx.fillStyle = '#2ecc71'; ctx.font = 'bold 16px sans-serif';
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), 24, 76);
  ctx.fillStyle = '#f39c12'; ctx.font = '13px sans-serif';
  ctx.fillText(`AMMO ${p.ammo}`, 120, 76);
  if (!p.onFoot && p.car) {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`${Math.round(Math.abs(p.car.speed) * 0.24)} km/h`, 24, 96 - 8);
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
  ctx.fillStyle = 'rgba(10,14,20,0.5)'; rr(ctx, 12, h - 40, 430, 28, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('WASD move / drive   •   Mouse aim, Click shoot   •   E enter car   •   Space handbrake   •   P pause   •   M mute', 22, h - 21);
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
  const marker = world.marker || (world.job ? (world.job.stage === 0 ? world.job.from : world.job.to) : null);
  if (marker) {
    const pr = 5 + 2 * Math.sin(world.time * 4);
    dot(marker.x, marker.y, '#ffd23e', pr);
  }
  for (const c of world.cars) if (c.kind === 'police') dot(c.x, c.y, '#5aa9ff', 3);
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
    ctx.fillText('Vic Torres is out and owes the Castellanos crew $5,000. Four jobs stand between him and freedom.', w / 2, h / 2 - 30);
    ctx.fillText('WASD move / drive  •  Mouse aim, Click shoot  •  E enter car  •  Space handbrake  •  P pause  •  M mute', w / 2, h / 2 + 6);
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
    ctx.fillText(`Cash $${world.player.cash.toLocaleString('en-US')}   •   Missions ${world.stats.missions}/4   •   Cars stolen ${world.stats.stolen}`, w / 2, h / 2 + 30);
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
