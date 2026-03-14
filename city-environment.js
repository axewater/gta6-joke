import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';
import { GRID, CELL, CITY_SIZE, HALF_CITY, ROAD, WORLD_SCALE } from './constants.js';
import { S } from './city-constants.js';

const yieldFrame = () => new Promise(r => requestAnimationFrame(r));

export function setupLighting() {
  const ambient = new THREE.AmbientLight(0x806040, 0.6);
  scene.add(ambient);
  state.ambient = ambient;

  const sun = new THREE.DirectionalLight(0xFFD4A0, 1.5);
  sun.position.set(150 * S, 60 * S, 80 * S);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150 * S;
  sun.shadow.camera.right = 150 * S;
  sun.shadow.camera.top = 150 * S;
  sun.shadow.camera.bottom = -150 * S;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400 * S;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  state.sun = sun;

  const hemi = new THREE.HemisphereLight(0xFF8C60, 0x8b7355, 0.3);
  scene.add(hemi);
  state.hemi = hemi;
}

export function createOceanAndBeach() {
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xF4D6A0, roughness: 0.95 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 200 * S, 70 * S), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, HALF_CITY + 35 * S);
  sand.receiveShadow = true;
  scene.add(sand);

  // Shader water with animated waves and fresnel reflections
  const oceanGeo = new THREE.PlaneGeometry(CITY_SIZE + 400 * S, 300 * S, 128, 64);
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      waterColor: { value: new THREE.Color(0x006994) },
      skyColor: { value: new THREE.Color(0x87ceeb) },
      sunDirection: { value: new THREE.Vector3(0.5, 0.5, 0.3).normalize() }
    },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        vUv = uv;
        vec3 pos = position;

        float h = 0.0;
        h += sin(pos.x * 0.05 + time * 1.5) * 0.6;
        h += sin(pos.y * 0.08 + time * 2.0 + 1.0) * 0.32;
        h += sin((pos.x + pos.y) * 0.03 + time) * 0.8;
        h += sin(pos.x * 0.12 - time * 0.8) * 0.2;

        pos.z = h;
        vWaveHeight = h;

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 waterColor;
      uniform vec3 skyColor;
      uniform vec3 sunDirection;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vWaveHeight;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);

        // Approximate normal from wave derivatives
        float wx = vWorldPos.x;
        float wz = vWorldPos.z;
        float dx = cos(wx * 0.05 + time * 1.5) * 0.075
                 + cos((wx - wz) * 0.03 + time) * 0.06;
        float dz = cos(-wz * 0.08 + time * 2.0 + 1.0) * 0.064
                 + cos((wx - wz) * 0.03 + time) * 0.06;
        vec3 normal = normalize(vec3(-dx, 1.0, -dz));

        // Fresnel reflection
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
        vec3 color = mix(waterColor, skyColor * 0.7, fresnel * 0.6);

        // Sun specular highlight
        vec3 reflDir = reflect(-viewDir, normal);
        float spec = pow(max(dot(reflDir, normalize(sunDirection)), 0.0), 64.0);
        color += vec3(1.0, 0.9, 0.7) * spec * 2.0;

        // Foam at wave crests
        float foam = smoothstep(1.0, 1.6, vWaveHeight);
        color = mix(color, vec3(0.9, 0.95, 1.0), foam * 0.4);

        gl_FragColor = vec4(color, 0.85);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0, HALF_CITY + 150 * S);
  scene.add(ocean);
  state.ocean = ocean;
  state.oceanMaterial = oceanMat;

  // Ocean floor plane to prevent see-through at shallow angles
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x001830, roughness: 1.0 });
  const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 400 * S, 300 * S), floorMat);
  floorPlane.rotation.x = -Math.PI / 2;
  floorPlane.position.set(0, -1.5, HALF_CITY + 150 * S);
  scene.add(floorPlane);
}

export function createPalmTrees() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 });

  let placed = 0;
  for (let i = 0; i <= GRID && placed < 50; i++) {
    const z = -HALF_CITY + i * CELL;
    for (let x = -HALF_CITY; x < HALF_CITY && placed < 50; x += 20) {
      const px = x + (Math.random() - 0.5) * 4;
      const side = Math.random() > 0.5 ? 1 : -1;
      const pz = z + side * (ROAD / 2 + 2);

      const group = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 6, 8), trunkMat);
      trunk.position.y = 3;
      group.add(trunk);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), canopyMat);
      canopy.position.y = 6.5;
      canopy.scale.set(1, 0.5, 1);
      group.add(canopy);

      group.rotation.x = (Math.random() - 0.5) * 0.1;
      group.rotation.z = (Math.random() - 0.5) * 0.1;
      group.position.set(px, 0, pz);
      scene.add(group);
      state.palmTrees.push(group);
      placed++;
    }
  }
}

export function createClouds() {
  for (let i = 0; i < 18; i++) {
    const group = new THREE.Group();
    const sphereCount = 5 + Math.floor(Math.random() * 4);
    const baseMat = new THREE.MeshBasicMaterial({
      color: 0xFFEEDD, transparent: true, opacity: 0.25, depthWrite: false
    });

    for (let s = 0; s < sphereCount; s++) {
      const r = 8 + Math.random() * 12;
      const geo = new THREE.SphereGeometry(r, 8, 8);
      const sphere = new THREE.Mesh(geo, baseMat);
      sphere.position.set(
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 15
      );
      sphere.scale.set(1, 0.4 + Math.random() * 0.3, 1);
      group.add(sphere);
    }

    group.position.set(
      (Math.random() - 0.5) * CITY_SIZE * 1.5,
      (120 + Math.random() * 40) * S,
      (Math.random() - 0.5) * CITY_SIZE * 1.5
    );
    scene.add(group);
    state.clouds.push({ mesh: group, speed: 0.5 + Math.random() * 1.5, material: baseMat });
  }
}

export function createSkyDome() {
  // Sky dome — gradient sphere covering the scene
  const skyGeo = new THREE.SphereGeometry(450 * S, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      horizonColor: { value: new THREE.Color(0xFFA062) },
      zenithColor: { value: new THREE.Color(0x87ceeb) }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = pow(max(0.0, h), 0.7);
        vec3 color = mix(horizonColor, zenithColor, t);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  state.skyDome = skyDome;
  state.skyDomeMaterial = skyMat;

  // Star field — 300 points on upper hemisphere
  const starCount = 300;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.5;
    const r = 440 * S;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 1.5, transparent: true, opacity: 0,
    sizeAttenuation: false, depthWrite: false, fog: false
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);
  state.starField = starField;
  state.starMaterial = starMat;

  // Sun mesh
  const sunGeo = new THREE.SphereGeometry(8, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xFFDD44, transparent: true, depthWrite: false, fog: false
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  scene.add(sunMesh);
  state.sunMesh = sunMesh;

  // Moon mesh
  const moonGeo = new THREE.SphereGeometry(6, 16, 16);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xDDDDFF, transparent: true, depthWrite: false, fog: false
  });
  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
  scene.add(moonMesh);
  state.moonMesh = moonMesh;
}

// ── Mountains ─────────────────────────────────────────────────────────────
export async function createMountains() {
  // Extended background terrain under mountain areas (y=-0.1 so city ground covers it)
  const terrainMat = new THREE.MeshStandardMaterial({ color: 0x3d3830, roughness: 1.0 });
  const bgGround = new THREE.Mesh(new THREE.PlaneGeometry(CITY_SIZE + 900 * S, CITY_SIZE + 900 * S), terrainMat);
  bgGround.rotation.x = -Math.PI / 2;
  bgGround.position.y = -0.1;
  scene.add(bgGround);

  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeeeeff, roughness: 0.55 });
  const rockColors = [0x6b6560, 0x7a7065, 0x5a5550, 0x706860, 0x6a6055, 0x807870];

  function makeMountain(cx, cz, height, greenness) {
    const baseRadius = height * 0.5 + (15 + Math.random() * 20) * S;
    const segs = 6 + Math.floor(Math.random() * 3);
    const rotY = Math.random() * Math.PI * 2;

    // Rocky body
    const rockMat = new THREE.MeshStandardMaterial({
      color: rockColors[Math.floor(Math.random() * rockColors.length)],
      roughness: 0.92
    });
    const rock = new THREE.Mesh(new THREE.ConeGeometry(baseRadius, height, segs), rockMat);
    rock.position.set(cx, height / 2, cz);
    rock.rotation.y = rotY;
    scene.add(rock);

    // Forest layer — height controlled by greenness (0=sparse, 1=lush)
    const forestTop = height * (0.35 + greenness * 0.22);
    const forestRadius = baseRadius * (0.72 + greenness * 0.15);
    const gv = 0.2 + greenness * 0.5;
    const forestMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.05 + greenness * 0.02, gv, 0.04),
      roughness: 0.95
    });
    const forest = new THREE.Mesh(new THREE.ConeGeometry(forestRadius, forestTop, segs), forestMat);
    forest.position.set(cx, forestTop / 2, cz);
    forest.rotation.y = rotY + 0.3;
    scene.add(forest);

    // Snow cap for mountains taller than 130 units
    if (height > 130 * S) {
      const snowFrac = Math.min(1, (height - 130 * S) / (120 * S));
      const snowH = height * (0.12 + snowFrac * 0.1);
      const snowR = baseRadius * (0.12 + snowFrac * 0.06);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(snowR, snowH, segs), snowMat);
      snow.position.set(cx, height - snowH / 2 + 0.5, cz);
      scene.add(snow);
    }

    // Collision footprint
    const fr = baseRadius * 0.65;
    state.buildings.push({ minX: cx - fr, maxX: cx + fr, minZ: cz - fr, maxZ: cz + fr, height });
  }

  async function addRange(xMin, xMax, zMin, zMax, count) {
    for (let i = 0; i < count; i++) {
      if (i > 0 && i % 15 === 0) await yieldFrame();
      const cx = xMin + Math.random() * (xMax - xMin);
      const cz = zMin + Math.random() * (zMax - zMin);
      const height = (80 + Math.random() * 220) * S; // 80–300 scaled
      const greenness = 0.15 + Math.random() * 0.85;
      makeMountain(cx, cz, height, greenness);
    }
  }

  const pad = 40 * S;   // start this far outside the city edge
  const deep = 290 * S; // depth of the mountain range

  // North range
  await addRange(-HALF_CITY - 100 * S, HALF_CITY + 100 * S, -HALF_CITY - deep, -HALF_CITY - pad, 28);
  // West range
  await addRange(-HALF_CITY - deep, -HALF_CITY - pad, -HALF_CITY - 100 * S, HALF_CITY + 100 * S, 28);
  // East range
  await addRange(HALF_CITY + pad, HALF_CITY + deep, -HALF_CITY - 100 * S, HALF_CITY + 100 * S, 28);
  // Corner fills (NW, NE) so mountains meet at corners
  await addRange(-HALF_CITY - deep, -HALF_CITY - pad, -HALF_CITY - deep, -HALF_CITY - pad, 10);
  await addRange(HALF_CITY + pad, HALF_CITY + deep, -HALF_CITY - deep, -HALF_CITY - pad, 10);

  // Invisible solid walls — block player/car on all 4 sides
  const BIG = 2000 * S;
  // North wall
  state.buildings.push({ minX: -BIG, maxX: BIG, minZ: -BIG, maxZ: -HALF_CITY - 35 * S, height: BIG });
  // West wall
  state.buildings.push({ minX: -BIG, maxX: -HALF_CITY - 35 * S, minZ: -BIG, maxZ: BIG, height: BIG });
  // East wall
  state.buildings.push({ minX: HALF_CITY + 35 * S, maxX: BIG, minZ: -BIG, maxZ: BIG, height: BIG });
  // South/ocean wall — drowning is handled in player.js; this stops cars going too far out
  state.buildings.push({ minX: -BIG, maxX: BIG, minZ: HALF_CITY + 72 * S, maxZ: BIG, height: BIG });
}
