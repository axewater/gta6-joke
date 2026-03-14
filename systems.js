import { scene } from './renderer.js';
import { state } from './state.js';
import { playerBulletPool, policeBulletPool, gangBulletPool, tireSmokePool, tankShellPool, missilePool } from './object-pool.js';
import { registerCivilianKill, registerPoliceKill } from './player.js';
import { launchNpcRagdoll } from './npc-ragdoll.js';

// ── System Registry ──────────────────────────────────────────────────────
const systems = [];

export function registerSystem(name, updateFn, interval = 1) {
  systems.push({ name, update: updateFn, interval });
}

export function runSystems(dt, frameCount) {
  for (let i = 0; i < systems.length; i++) {
    const sys = systems[i];
    if (sys.interval > 1 && frameCount % sys.interval !== 0) continue;
    sys.update(sys.interval > 1 ? dt * sys.interval : dt);
  }
}

// ── Player Bullet System ─────────────────────────────────────────────────
export function playerBulletSystem(dt) {
  const bullets = state.playerBullets;
  let count = bullets.length;

  for (let i = count - 1; i >= 0; i--) {
    const b = bullets[i];

    b.x += b.dx * dt;
    b.y += b.dy * dt;
    b.z += b.dz * dt;
    b.life -= dt;

    if (b.life <= 0) {
      playerBulletPool.release(b.mesh);
      bullets[i] = bullets[--count];
      continue;
    }

    b.mesh.position.set(b.x, b.y, b.z);

    // Collision vs civilian NPCs
    let hit = false;
    for (const npc of state.npcs) {
      if (!npc.alive) continue;
      const dx = npc.x - b.x, dz = npc.z - b.z;
      if (dx * dx + dz * dz < 2) {
        npc.alive = false;
        npc.mesh.rotation.x = Math.PI / 2;
        npc.respawnTimer = 15;
        npc.aggressive = false;
        setTimeout(() => { npc.mesh.visible = false; }, 1000);
        playerBulletPool.release(b.mesh);
        bullets[i] = bullets[--count];
        registerCivilianKill();
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // Collision vs police officers
    for (let j = state.policeOfficers.length - 1; j >= 0; j--) {
      const cop = state.policeOfficers[j];
      const dx = cop.x - b.x, dz = cop.z - b.z;
      if (dx * dx + dz * dz < 2) {
        scene.remove(cop.mesh);
        state.policeOfficers.splice(j, 1);
        playerBulletPool.release(b.mesh);
        bullets[i] = bullets[--count];
        registerPoliceKill();
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // Collision vs gang NPCs
    for (const gnpc of state.gangNpcs) {
      if (gnpc.dead) continue;
      if (gnpc.ragdoll && gnpc.ragdoll.active) continue;
      const dx = gnpc.x - b.x, dz = gnpc.z - b.z;
      if (dx * dx + dz * dz < 2) {
        gnpc.dead = true;
        gnpc.mesh.rotation.x = Math.PI / 2;
        gnpc.respawnTimer = 15;
        setTimeout(() => { gnpc.mesh.visible = false; }, 1000);
        playerBulletPool.release(b.mesh);
        bullets[i] = bullets[--count];
        registerCivilianKill();
        hit = true;
        break;
      }
    }
  }

  bullets.length = count;
}

// ── Police Bullet System ─────────────────────────────────────────────────
export function policeBulletSystem(dt) {
  const bullets = state.policeBullets;
  let count = bullets.length;

  for (let i = count - 1; i >= 0; i--) {
    const b = bullets[i];

    b.x += b.dx * dt;
    b.y += b.dy * dt;
    b.z += b.dz * dt;
    b.life -= dt;

    if (b.life <= 0) {
      policeBulletPool.release(b.mesh);
      bullets[i] = bullets[--count];
      continue;
    }

    b.mesh.position.set(b.x, b.y, b.z);

    const dx = state.player.x - b.x, dz = state.player.z - b.z;
    if (dx * dx + dz * dz < 2 && !state.isInVehicle) {
      state.health -= 15;
      policeBulletPool.release(b.mesh);
      bullets[i] = bullets[--count];
    }
  }

  bullets.length = count;
}

// ── Gang Bullet System ───────────────────────────────────────────────────
export function gangBulletSystem(dt) {
  const bullets = state.gangBullets;
  let count = bullets.length;

  for (let i = count - 1; i >= 0; i--) {
    const b = bullets[i];

    b.x += b.dx * dt;
    b.y += b.dy * dt;
    b.z += b.dz * dt;
    b.life -= dt;

    if (b.life <= 0) {
      gangBulletPool.release(b.mesh);
      bullets[i] = bullets[--count];
      continue;
    }

    b.mesh.position.set(b.x, b.y, b.z);

    // Hit player
    const px = state.player.x, pz = state.player.z;
    const pdx = px - b.x, pdz = pz - b.z;
    if (pdx * pdx + pdz * pdz < 2 && !state.isInVehicle && !state.isDead) {
      state.health -= 15;
      gangBulletPool.release(b.mesh);
      bullets[i] = bullets[--count];
      continue;
    }

    // Hit civilian NPCs
    let hit = false;
    for (const npc of state.npcs) {
      if (!npc.alive) continue;
      const ndx = npc.x - b.x, ndz = npc.z - b.z;
      if (ndx * ndx + ndz * ndz < 2) {
        launchNpcRagdoll(npc, 8, Math.atan2(b.dx, b.dz));
        gangBulletPool.release(b.mesh);
        bullets[i] = bullets[--count];
        hit = true;
        break;
      }
    }
    if (hit) continue;

    // Hit rival gang members
    for (const gnpc of state.gangNpcs) {
      if (gnpc.dead || gnpc.gangIndex === b.gangIndex) continue;
      if (gnpc.ragdoll && gnpc.ragdoll.active) continue;
      const gdx = gnpc.x - b.x, gdz = gnpc.z - b.z;
      if (gdx * gdx + gdz * gdz < 2) {
        gnpc.dead = true;
        gnpc.mesh.rotation.x = Math.PI / 2;
        gnpc.respawnTimer = 15;
        setTimeout(() => { gnpc.mesh.visible = false; }, 1000);
        gangBulletPool.release(b.mesh);
        bullets[i] = bullets[--count];
        break;
      }
    }
  }

  bullets.length = count;
}

// ── Tank Shell System ────────────────────────────────────────────────────
export function tankShellSystem(dt) {
  const shells = state.tankShells;
  let count = shells.length;

  const px = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const pz = state.isInVehicle ? state.currentVehicle.z : state.player.z;

  for (let i = count - 1; i >= 0; i--) {
    const s = shells[i];

    s.x += s.dx * dt;
    s.y += s.dy * dt;
    s.z += s.dz * dt;
    s.dy -= 15 * dt;
    s.life -= dt;

    s.mesh.position.set(s.x, s.y, s.z);

    const ddx = px - s.x, ddz = pz - s.z;
    const hitPlayer = (ddx * ddx + ddz * ddz < 64);

    if (s.life <= 0 || s.y <= 0 || hitPlayer) {
      if (hitPlayer && !state.isDead) {
        state.health -= 60;
        state.cameraShake.intensity = 1.5;
        state.cameraShake.timer = 0.8;
      }
      tankShellPool.release(s.mesh);
      shells[i] = shells[--count];
    }
  }

  shells.length = count;
}

// ── Missile System ───────────────────────────────────────────────────────
export function missileSystem(dt) {
  const missiles = state.heliMissiles;
  let count = missiles.length;

  const playerX = state.isInVehicle ? state.currentVehicle.x : state.player.x;
  const playerZ = state.isInVehicle ? state.currentVehicle.z : state.player.z;
  const playerY = state.player.y + 1;

  for (let i = count - 1; i >= 0; i--) {
    const m = missiles[i];

    m.x += m.dx * dt;
    m.y += m.dy * dt;
    m.z += m.dz * dt;
    m.life -= dt;

    m.mesh.position.set(m.x, m.y, m.z);

    const expired = m.life <= 0 || m.y <= 0;
    const dx = playerX - m.x, dz = playerZ - m.z, dy = playerY - m.y;
    const hitPlayer = (dx * dx + dy * dy + dz * dz < 36);

    if (expired || hitPlayer) {
      if (hitPlayer && !state.isDead) {
        state.health -= 40;
        state.cameraShake.intensity = 1.2;
        state.cameraShake.timer = 0.6;
      }
      missilePool.release(m.mesh);
      missiles[i] = missiles[--count];
    }
  }

  missiles.length = count;
}

// ── Tire Smoke System ────────────────────────────────────────────────────
export function tireSmokeSystem(dt) {
  const particles = state.tireSmokeParticles;
  let count = particles.length;

  for (let i = count - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt;
    const progress = 1 - p.userData.life / p.userData.maxLife;
    p.position.y += dt * 2;
    const s = 1 + progress * 3;
    p.scale.set(s, s, s);
    p.material.opacity = 0.5 * (1 - progress);

    if (p.userData.life <= 0) {
      tireSmokePool.release(p);
      particles[i] = particles[--count];
    }
  }

  particles.length = count;
}
