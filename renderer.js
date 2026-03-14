import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { state } from './state.js';
import { WORLD_SCALE } from './constants.js';

export let renderer, scene, camera, composer;

// ── Cinematic Post-Processing Shader ────────────────────────────────────
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grainIntensity: { value: 0.03 },
    vignetteStrength: { value: 0.45 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grainIntensity;
    uniform float vignetteStrength;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 uv = vUv;

      // Chromatic aberration
      float aberration = 2.0 / resolution.x;
      float r = texture2D(tDiffuse, uv + vec2(aberration, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(aberration, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // Teal-orange color grading
      float lum = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 graded = mix(color, color * vec3(0.7, 0.9, 1.0), (1.0 - lum) * 0.3);
      graded = mix(graded, graded * vec3(1.1, 1.0, 0.85), lum * 0.3);
      color = graded;

      // Film grain
      float grain = hash(uv * resolution + fract(time) * 100.0) - 0.5;
      color += grain * grainIntensity;

      // Vignette
      vec2 center = uv - 0.5;
      float dist = length(center);
      float vignette = smoothstep(0.4, 1.2, dist) * vignetteStrength;
      color *= 1.0 - vignette;

      gl_FragColor = vec4(color, 1.0);
    }
  `
};

// ── Procedural Environment Cube Map ─────────────────────────────────────
function createEnvMap() {
  const size = 64;
  const canvases = [];

  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (i === 2) {
      // +y (top) — sky color, updated each frame
      ctx.fillStyle = '#87ceeb';
      ctx.fillRect(0, 0, size, size);
    } else if (i === 3) {
      // -y (bottom) — dark ground
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, size, size);
    } else {
      // Sides — gradient + neon dots
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#87ceeb');
      grad.addColorStop(0.5, '#FFA062');
      grad.addColorStop(1, '#222222');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      const colors = ['#ff1493', '#00ffff', '#ff4500', '#39ff14', '#ffd700'];
      for (let j = 0; j < 20; j++) {
        const bx = Math.random() * size;
        const by = size * 0.3 + Math.random() * size * 0.5;
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillRect(bx, by, 2, 2);
      }
    }
    canvases.push(canvas);
  }

  const cubeTexture = new THREE.CubeTexture(canvases);
  cubeTexture.needsUpdate = true;
  scene.environment = cubeTexture;
  state.envCubeTexture = cubeTexture;
  state.envCanvases = canvases;
}

// ── Init ────────────────────────────────────────────────────────────────
export function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  document.body.prepend(renderer.domElement);
  renderer.domElement.id = 'gameCanvas';

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xFFA062, 200 * WORLD_SCALE, 500 * WORLD_SCALE);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 600 * WORLD_SCALE);

  // Environment cube map for PBR reflections
  createEnvMap();

  // Post-processing chain: Render → Bloom → Cinematic → Output
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9, 0.4, 0.65
  );
  state.bloomPass = bloomPass;
  composer.addPass(bloomPass);

  const cinematicPass = new ShaderPass(CinematicShader);
  state.cinematicPass = cinematicPass;
  composer.addPass(cinematicPass);

  composer.addPass(new OutputPass());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (state.cinematicPass) {
      state.cinematicPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
  });
}
