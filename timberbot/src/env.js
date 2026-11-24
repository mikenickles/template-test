import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';
import { shared } from './assets.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;                       // pin to the far plane
}`;

const SKY_FRAG = /* glsl */`
precision highp float;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uGround;
uniform float uTime; uniform float uDisc;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(11.3, 7.1); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, uSunDir), 0.0);
  float hc = clamp(h, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(hc, 0.45));
  // golden-hour scattering: broad warm bloom around the sun, strongest near the horizon
  col += uSunColor * (pow(sd, 5.0) * 0.30 + pow(sd, 48.0) * 0.55) * (1.0 - 0.55 * hc);
  if (h > 0.0) {
    vec2 cuv = d.xz / (h + 0.2) * 1.15 + uTime * vec2(0.0035, 0.0018);
    float c = fbm(cuv * 1.5);
    float c2 = fbm(cuv * 4.2 + 7.0);
    float cov = smoothstep(0.5, 0.8, c + c2 * 0.24) * smoothstep(0.03, 0.24, h);
    float lit = fbm(cuv * 1.5 + uSunDir.xz * 0.16);
    vec3 ccol = mix(vec3(0.5, 0.46, 0.52), vec3(1.35, 1.08, 0.86), (1.0 - smoothstep(0.38, 0.72, lit)));
    ccol += uSunColor * pow(sd, 3.0) * 0.55;
    col = mix(col, ccol, cov * 0.82);
  }
  col += uSunColor * smoothstep(0.99935, 0.9997, sd) * 14.0 * uDisc;
  col = mix(col, uGround, (1.0 - smoothstep(-0.1, 0.0, h)));
  gl_FragColor = vec4(col, 1.0);
}`;

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 1.1);                         // gentle saturation lift
      c.rgb *= vec3(1.035, 1.0, 0.955);                         // warm grade
      c.rgb = mix(c.rgb, c.rgb * c.rgb * 1.6, 0.1);             // toe contrast
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.9);
      c.rgb *= mix(1.0 - uVignette, 1.0, (1.0 - smoothstep(0.28, 0.82, length(q))));
      gl_FragColor = c;
    }`,
};

export function createEnvironment(renderer, scene, camera) {
  const el = THREE.MathUtils.degToRad(CFG.SUN_ELEVATION_DEG), az = THREE.MathUtils.degToRad(CFG.SUN_AZIMUTH_DEG);
  const sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
  const sunColor = new THREE.Color(1.0, 0.79, 0.55);
  const horizon = new THREE.Color(0.80, 0.62, 0.45);
  const zenith = new THREE.Color(0.13, 0.27, 0.56);

  scene.fog = new THREE.FogExp2(horizon.clone().multiplyScalar(0.92), CFG.FOG_DENSITY);

  // --- sky dome
  const skyUniforms = {
    uSunDir: { value: sunDir }, uSunColor: { value: sunColor.clone().multiplyScalar(1.15) }, uHorizon: { value: horizon },
    uZenith: { value: zenith }, uGround: { value: scene.fog.color }, uTime: shared.uTime, uDisc: { value: 1 },
  };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMat);
  sky.name = 'SkyDome';
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // --- image based lighting from the very same sky
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat.clone());
  envSky.material.uniforms.uDisc = { value: 0 };
  envSky.material.uniforms.uTime = { value: 40 };
  envSky.material.uniforms.uSunDir = { value: sunDir };
  envSky.material.uniforms.uSunColor = { value: sunColor };
  envSky.material.uniforms.uHorizon = { value: horizon };
  envSky.material.uniforms.uZenith = { value: zenith };
  envSky.material.uniforms.uGround = { value: new THREE.Color(0.16, 0.15, 0.09) };   // forest floor bounce
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0, 0.1, 100);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.75;
  pmrem.dispose();

  // --- lights
  const hemi = new THREE.HemisphereLight(0x9dbcff, 0x6b5a3c, 1.0);       // cool sky fill + warm ground bounce keeps shade readable
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(sunColor, 3.9);
  sun.position.copy(sunDir).multiplyScalar(230);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  // Fit the orthographic shadow frustum to the whole 150 x 150 m map (incl. ridge + tree tops),
  // so shadows never clip or pop anywhere in the playable area.
  const lightView = new THREE.Matrix4().lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0));
  const inv = new THREE.Matrix4().makeTranslation(sun.position.x, sun.position.y, sun.position.z).multiply(lightView).invert();
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const x of [-CFG.HALF, CFG.HALF]) for (const y of [-3, 46]) for (const z of [-CFG.HALF, CFG.HALF]) b.expandByPoint(v.set(x, y, z).applyMatrix4(inv));
  const cam = sun.shadow.camera;
  cam.left = b.min.x - 1; cam.right = b.max.x + 1; cam.bottom = b.min.y - 1; cam.top = b.max.y + 1;
  cam.near = Math.max(1, -b.max.z - 5); cam.far = -b.min.z + 5;
  cam.updateProjectionMatrix();
  const shadowInfo = {
    width: cam.right - cam.left, height: cam.top - cam.bottom,
    texel: Math.max((cam.right - cam.left), (cam.top - cam.bottom)) / 4096,
  };

  shared.uSunColor.value.copy(sunColor).multiplyScalar(sun.intensity);

  // --- post processing
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.7, 1.0);
  composer.addPass(bloom);
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const _v = new THREE.Vector3();
  return {
    sun, hemi, sky, sunDir, sunColor, composer, bloom, shadowInfo,
    update(cameraObj) {
      sky.position.copy(cameraObj.position);
      _v.copy(sunDir).transformDirection(cameraObj.matrixWorldInverse);
      shared.uSunDirView.value.copy(_v);
    },
    resize(w, h, pr) {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
  };
}
