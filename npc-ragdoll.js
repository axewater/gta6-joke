import { scene } from './renderer.js';
import { state } from './state.js';
import { NPC_RAGDOLL_LAUNCH_MULT, NPC_RAGDOLL_DURATION } from './constants.js';

// ── Launch NPC Ragdoll ──────────────────────────────────────────────────
export function launchNpcRagdoll(npc, carSpeed, carRotation) {
  npc.alive = false;
  npc.mesh.visible = true;

  const launchX = Math.sin(carRotation) * carSpeed * NPC_RAGDOLL_LAUNCH_MULT;
  const launchZ = Math.cos(carRotation) * carSpeed * NPC_RAGDOLL_LAUNCH_MULT;
  const launchY = Math.max(6, carSpeed * 0.5);

  npc.ragdoll = {
    active: true,
    vx: launchX,
    vy: launchY,
    vz: launchZ,
    rotX: (Math.random() - 0.5) * 10,
    rotZ: (Math.random() - 0.5) * 10,
    timer: NPC_RAGDOLL_DURATION,
    y: 0,
    bounceCount: 0
  };
}

// ── Shared ragdoll physics step ─────────────────────────────────────────
function stepRagdoll(entity, dt, GRAVITY) {
  const r = entity.ragdoll;

  entity.x += r.vx * dt;
  r.y += r.vy * dt;
  entity.z += r.vz * dt;

  r.vy += GRAVITY * dt;

  entity.mesh.rotation.x += r.rotX * dt;
  entity.mesh.rotation.z += r.rotZ * dt;

  if (r.y < 0) {
    r.y = 0;
    r.bounceCount++;
    r.vy = Math.abs(r.vy) * 0.3;
    r.vx *= 0.5;
    r.vz *= 0.5;

    if (r.bounceCount >= 3) {
      r.rotX *= 0.1;
      r.rotZ *= 0.1;
      r.vx *= 0.3;
      r.vz *= 0.3;
    }
  }

  entity.mesh.position.set(entity.x, r.y, entity.z);
  r.timer -= dt;
}

// ── Update All NPC Ragdolls ─────────────────────────────────────────────
export function updateNpcRagdolls(dt) {
  const GRAVITY = -30;

  for (const npc of state.npcs) {
    if (!npc.ragdoll || !npc.ragdoll.active) continue;
    stepRagdoll(npc, dt, GRAVITY);

    if (npc.ragdoll.timer <= 0) {
      npc.ragdoll.active = false;
      npc.mesh.visible = false;
      npc.mesh.rotation.set(0, 0, 0);
      npc.respawnTimer = 15;
    }
  }

  // Police officers
  for (let i = state.policeOfficers.length - 1; i >= 0; i--) {
    const cop = state.policeOfficers[i];
    if (!cop.ragdoll || !cop.ragdoll.active) continue;
    stepRagdoll(cop, dt, GRAVITY);

    if (cop.ragdoll.timer <= 0) {
      cop.ragdoll.active = false;
      cop.dead = true;
      cop.mesh.visible = false;
      cop.mesh.rotation.set(0, 0, 0);
      // Remove dead officer — AI will respawn a new one
      scene.remove(cop.mesh);
      state.policeOfficers.splice(i, 1);
    }
  }
}
