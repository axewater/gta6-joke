import { state } from './state.js';

let minimapCtx;

export function initHUD() {
  minimapCtx = document.getElementById('minimap').getContext('2d');
}

export function updateHUD() {
  // Health bar — show vehicle health when driving
  const bar = document.getElementById('health-bar');
  const label = document.getElementById('health-label');
  let displayHealth;
  if (state.isInVehicle && state.currentVehicle) {
    displayHealth = state.currentVehicle.health;
    if (label) label.textContent = 'CAR';
  } else {
    displayHealth = state.health;
    if (label) label.textContent = 'HP';
  }
  bar.style.width = Math.max(0, displayHealth) + '%';
  if (displayHealth > 60) bar.style.backgroundColor = '#4caf50';
  else if (displayHealth > 30) bar.style.backgroundColor = '#ff9800';
  else bar.style.backgroundColor = '#f44336';

  // Wanted stars
  document.querySelectorAll('#wanted-stars .star').forEach((s, i) => {
    s.style.color = i < state.wantedLevel ? '#f5c518' : '#555';
  });

  // Money
  document.getElementById('money').textContent = '$' + state.money.toLocaleString();

  // Game clock
  const totalMinutes = Math.floor(state.gameTime * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  document.getElementById('game-clock').textContent =
    String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');

  // Weapon
  if (state.hasGun) {
    document.getElementById('weapon').innerHTML = '&#128299; PISTOL';
  }

  // Gun store prompt
  if (state.gunStore && !state.hasGun && !state.isInVehicle) {
    const gs = state.gunStore;
    const dx = gs.x - state.player.x, dz = gs.z - state.player.z;
    if (dx * dx + dz * dz < 25) {
      document.getElementById('weapon').innerHTML = state.money >= 200
        ? '&#128176; Press F to buy PISTOL ($200)'
        : '&#128176; PISTOL — $200 (not enough money)';
    }
  }

  // Radio popup fade
  if (state.radioVisible) {
    state.radioTimer -= 1 / 60;
    if (state.radioTimer <= 0) {
      document.getElementById('radio-popup').classList.remove('show');
      state.radioVisible = false;
    }
  }
}

export function updateMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const size = 150;
  const viewRadius = 200;
  const scale = size / (viewRadius * 2);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(20, 25, 20, 0.85)';
  ctx.fillRect(0, 0, size, size);

  const px = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const pz = state.isInVehicle ? state.currentVehicle.z : state.player.z;
  const rot = state.camera.theta;

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(rot);

  // Parks — green squares
  ctx.fillStyle = 'rgba(34, 139, 34, 0.7)';
  for (const p of state.parks) {
    const parkX = (p.cx - px) * scale;
    const parkZ = (p.cz - pz) * scale;
    const parkSize = 70 * scale;
    if (Math.abs(parkX) < size && Math.abs(parkZ) < size) {
      ctx.fillRect(parkX - parkSize / 2, parkZ - parkSize / 2, parkSize, parkSize);
    }
  }

  ctx.fillStyle = 'rgba(120, 120, 120, 0.7)';
  for (const b of state.buildings) {
    if (b.isRamp) continue;
    const bx = ((b.minX + b.maxX) / 2 - px) * scale;
    const bz = ((b.minZ + b.maxZ) / 2 - pz) * scale;
    const bw = (b.maxX - b.minX) * scale;
    const bd = (b.maxZ - b.minZ) * scale;
    if (Math.abs(bx) < size && Math.abs(bz) < size) ctx.fillRect(bx - bw / 2, bz - bd / 2, bw, bd);
  }

  // Ramps — yellow dots
  ctx.fillStyle = '#FFDD00';
  for (const r of state.ramps) {
    const rx = (r.x - px) * scale;
    const rz = (r.z - pz) * scale;
    if (Math.abs(rx) < size / 2 && Math.abs(rz) < size / 2) {
      ctx.beginPath(); ctx.arc(rx, rz, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  for (const v of state.vehicles) {
    const vx = (v.x - px) * scale, vz = (v.z - pz) * scale;
    if (Math.abs(vx) < size / 2 && Math.abs(vz) < size / 2) {
      ctx.fillStyle = '#' + v.color.toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.arc(vx, vz, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = '#6688ff';
  for (const v of state.trafficCars) {
    const vx = (v.x - px) * scale, vz = (v.z - pz) * scale;
    if (Math.abs(vx) < size / 2 && Math.abs(vz) < size / 2) {
      ctx.beginPath(); ctx.arc(vx, vz, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = '#ffcc44';
  for (const npc of state.npcs) {
    if (!npc.alive) continue;
    const nx = (npc.x - px) * scale, nz = (npc.z - pz) * scale;
    if (Math.abs(nx) < size / 2 && Math.abs(nz) < size / 2) {
      ctx.beginPath(); ctx.arc(nx, nz, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = '#ff3333';
  for (const cop of state.policeCars) {
    const cx = (cop.x - px) * scale, cz = (cop.z - pz) * scale;
    if (Math.abs(cx) < size / 2 && Math.abs(cz) < size / 2) {
      ctx.beginPath(); ctx.arc(cx, cz, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = '#44ff44';
  for (const pickup of state.moneyPickups) {
    if (!pickup.active) continue;
    const mx = (pickup.x - px) * scale, mz = (pickup.z - pz) * scale;
    if (Math.abs(mx) < size / 2 && Math.abs(mz) < size / 2) {
      ctx.beginPath(); ctx.arc(mx, mz, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (state.gunStore && !state.hasGun) {
    const gx = (state.gunStore.x - px) * scale, gz = (state.gunStore.z - pz) * scale;
    if (Math.abs(gx) < size / 2 && Math.abs(gz) < size / 2) {
      ctx.fillStyle = '#FF44FF';
      ctx.beginPath(); ctx.arc(gx, gz, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.fillStyle = '#ff4444';
  for (const cop of state.policeOfficers) {
    const cx = (cop.x - px) * scale, cz = (cop.z - pz) * scale;
    if (Math.abs(cx) < size / 2 && Math.abs(cz) < size / 2) {
      ctx.beginPath(); ctx.arc(cx, cz, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); ctx.stroke();
}
