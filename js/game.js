import * as THREE from "../vendor/three.module.js";
import { createAudio } from "./audio.js";
import { buildWorld } from "./world.js";
import { WEAPONS, createViewmodels } from "./weapons.js";
import {
  BODY,
  moveBody,
  moveCircle,
  rayAABB,
  firstSolidHit,
  segmentClear,
  circleHitsSolid,
  clamp,
} from "./collision.js";

const SCORE_LIMIT = 10;
const ROUND_TIME = 180;
const GRAVITY = 20;
const JUMP = 7.05;
const RUN = 5.15;
const WALK = 2.25;
const BOT_DAMAGE = 0.82;

const PROFILES = [
  { name: "夜梟・疾", weapon: 0, reaction: 0.28, prefer: 8.5, burst: 4, strafe: 3.1, sight: 28 },
  { name: "夜梟・穩", weapon: 0, reaction: 0.44, prefer: 13, burst: 2, strafe: 2.2, sight: 32 },
  { name: "夜梟・影", weapon: 0, reaction: 0.32, prefer: 9, burst: 3, strafe: 4.4, sight: 26 },
  { name: "夜梟・釘", weapon: 1, reaction: 0.3, prefer: 5.5, burst: 1, strafe: 2.6, sight: 22 },
];

const $ = (id) => document.getElementById(id);

const canvas = $("c");
const hud = $("hud");
const brief = $("brief");
const pauseEl = $("pause");
const resultEl = $("result");
const feed = $("feed");
const banner = $("banner");
const crosshair = $("crosshair");
const hitmark = $("hitmark");
const radar = $("radar");
const radarCtx = radar.getContext("2d");
const coarse = window.matchMedia("(pointer: coarse)").matches;

const audio = createAudio();
const keys = new Set();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x241c18);
scene.fog = new THREE.Fog(0x241c18, 32, 84);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 220);
camera.rotation.order = "YXZ";

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(110, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d5270) },
      mid: { value: new THREE.Color(0x8d684c) },
      bottom: { value: new THREE.Color(0x2c221c) },
    },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      void main() {
        float h = normalize(vP).y;
        vec3 col = mix(bottom, mid, smoothstep(-0.15, 0.18, h));
        col = mix(col, top, smoothstep(0.08, 0.72, h));
        vec3 moon = normalize(vec3(-0.45, 0.62, 0.32));
        float m = smoothstep(0.9975, 0.9994, dot(normalize(vP), moon));
        col += vec3(0.85, 0.88, 0.95) * m;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);
scene.add(sky);

scene.add(new THREE.HemisphereLight(0x9aafc9, 0x4a382e, 0.62));
scene.add(new THREE.AmbientLight(0xfff1e2, 0.22));
const moon = new THREE.DirectionalLight(0xd5e2f4, 2.45);
moon.position.set(-24, 34, 16);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -32;
moon.shadow.camera.right = 32;
moon.shadow.camera.top = 32;
moon.shadow.camera.bottom = -32;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 90;
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.035;
scene.add(moon);
scene.add(moon.target);
const fill = new THREE.DirectionalLight(0xffc7a2, 0.38);
fill.position.set(16, 12, -10);
scene.add(fill);

const world = buildWorld(THREE, scene);
const views = createViewmodels(THREE);
camera.add(views.rifle);
camera.add(views.pistol);
scene.add(camera);

const muzzleFlash = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: world.textures.flash,
    color: 0xfff1c2,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
);
muzzleFlash.visible = false;
muzzleFlash.renderOrder = 30;
muzzleFlash.scale.set(0.35, 0.35, 0.35);
scene.add(muzzleFlash);

const decals = [];
const decalGeo = new THREE.PlaneGeometry(0.2, 0.2);
const decalMat = new THREE.MeshBasicMaterial({
  map: world.textures.stain,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4,
  side: THREE.DoubleSide,
});
for (let i = 0; i < 40; i++) {
  const mesh = new THREE.Mesh(decalGeo, decalMat);
  mesh.visible = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  decals.push(mesh);
}
let decalCursor = 0;

const tracers = [];
for (let i = 0; i < 18; i++) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xffe2ae,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0, mat });
}
let tracerCursor = 0;

const sparkCount = 48;
const sparkPos = new Float32Array(sparkCount * 3);
const sparkVel = [];
const sparkLife = new Float32Array(sparkCount);
for (let i = 0; i < sparkCount; i++) sparkVel.push({ x: 0, y: 0, z: 0 });
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
const sparks = new THREE.Points(
  sparkGeo,
  new THREE.PointsMaterial({ color: 0xffc48a, size: 0.07, transparent: true, depthWrite: false })
);
scene.add(sparks);

const shellGeo = new THREE.BoxGeometry(0.025, 0.025, 0.07);
const shellMat = new THREE.MeshStandardMaterial({ color: 0xc6a15a, metalness: 0.7, roughness: 0.35 });
const shells = [];
for (let i = 0; i < 16; i++) {
  const mesh = new THREE.Mesh(shellGeo, shellMat);
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);
  shells.push({ mesh, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
}
let shellCursor = 0;

function makeBot(accent) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2c2623, roughness: 0.88 });
  const armor = new THREE.MeshStandardMaterial({ color: 0x3c3532, roughness: 0.6, metalness: 0.16 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x8d6b52, roughness: 0.74 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.38, metalness: 0.68 });
  const visor = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.55,
    roughness: 0.28,
  });
  const torsoMat = armor.clone();
  torsoMat.emissive = new THREE.Color(0x000000);

  const box = (parent, w, h, d, mat, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const limb = (w, h, d, mat) => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    return pivot;
  };

  const legL = limb(0.15, 0.72, 0.16, cloth);
  const legR = limb(0.15, 0.72, 0.16, cloth);
  legL.position.set(-0.11, 0.74, 0);
  legR.position.set(0.11, 0.74, 0);
  g.add(legL, legR);
  box(g, 0.38, 0.18, 0.22, armor, 0, 0.8, 0);
  box(g, 0.46, 0.48, 0.28, torsoMat, 0, 1.12, 0);
  box(g, 0.16, 0.14, 0.18, armor, -0.3, 1.28, 0);
  box(g, 0.16, 0.14, 0.18, armor, 0.3, 1.28, 0);
  box(g, 0.26, 0.22, 0.24, skin, 0, 1.5, 0);
  box(g, 0.32, 0.12, 0.3, metal, 0, 1.64, 0.01);
  box(g, 0.26, 0.06, 0.05, visor, 0, 1.5, -0.14);
  const arm = limb(0.11, 0.4, 0.12, cloth);
  arm.position.set(0.32, 1.22, -0.02);
  g.add(arm);
  box(g, 0.06, 0.08, 0.4, metal, 0.32, 0.9, -0.28);
  g.userData.legs = [legL, legR];
  g.userData.torsoMat = torsoMat;
  scene.add(g);
  return g;
}

const bots = PROFILES.map((profile, i) => {
  const mesh = makeBot(i === 3 ? 0xf0d2a4 : 0xe07a3d);
  return {
    ...profile,
    mesh,
    x: 0,
    z: 0,
    yaw: Math.PI,
    health: 100,
    alive: true,
    mag: WEAPONS[profile.weapon].magSize,
    reload: 0,
    see: 0,
    los: false,
    mode: "patrol",
    lastSeen: null,
    seenAt: -10,
    repath: 0,
    navX: 0,
    navZ: 0,
    cool: 0.4 + i * 0.15,
    burstLeft: profile.burst,
    strafeSign: i % 2 === 0 ? 1 : -1,
    strafeT: 1,
    stuck: 0,
    lastX: 0,
    lastZ: 0,
    soughtCover: false,
    cover: null,
    hideUntil: 0,
    phase: Math.random() * 6,
    speed: 0,
    respawn: 0,
    deathT: 0,
    flash: 0,
    revealed: 0,
    stepAcc: 0,
    aimErr: 0,
    aimErrP: 0,
    patrolWait: 0,
  };
});

const medkits = world.medkits.map((spot) => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.26, 0.32),
    new THREE.MeshStandardMaterial({ color: 0xd7dde4, roughness: 0.45, metalness: 0.25, emissive: 0x12332f, emissiveIntensity: 0.4 })
  );
  const plusMat = new THREE.MeshStandardMaterial({ color: 0x7dffe0, emissive: 0x1d6e62, emissiveIntensity: 0.9, roughness: 0.35 });
  const plusA = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.04), plusMat);
  const plusB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.04), plusMat);
  plusA.position.z = 0.17;
  plusB.position.z = 0.17;
  group.add(body, plusA, plusB);
  group.position.set(spot.x, 0.55, spot.z);
  scene.add(group);
  return { ...spot, mesh: group, ready: true, respawn: 0, spin: Math.random() * 6 };
});

const player = {
  x: -21.2,
  y: 0,
  z: 14.6,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  alive: true,
  health: 100,
  invuln: 0,
  kills: 0,
  deaths: 0,
  shots: 0,
  hits: 0,
  headshots: 0,
  grounded: true,
  coyote: 0,
  quiet: false,
};

const ammo = WEAPONS.map((w) => ({ mag: w.magSize, reserve: w.reserve }));

let state = "menu";
let pausedFrom = "play";
let weaponIndex = 0;
let gunCd = 0;
let reloadLeft = 0;
let reloadDur = 1;
let drawLeft = 0;
let bloom = 0;
let recoilP = 0;
let recoilY = 0;
let trauma = 0;
let hurtAmt = 0;
let mouseDown = false;
let semiLatch = false;
let jumpHeld = false;
let sens = 0.00215;
let timeLeft = ROUND_TIME;
let scoreUs = 0;
let scoreThem = 0;
let countdown = 3;
let fightBanner = 0;
let endTimer = -1;
let deathLeft = 0;
let nowT = 0;
let bob = 0;
let stepAcc = 0;
let mouseDX = 0;
let mouseDY = 0;
let swayX = 0;
let swayY = 0;
let flashLife = 0;
let spotTimer = 0;
let menuT = 0.4;
let lastGrounded = true;
let stickX = 0;
let stickY = 0;
let touchFire = false;
let touchJump = false;

function anglesToDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

function dampAngle(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

function falloff(dist) {
  if (dist < 12) return 1;
  if (dist > 34) return 0.74;
  return 1 - ((dist - 12) / 22) * 0.26;
}

function weapon() {
  return WEAPONS[weaponIndex];
}

function currentSpread() {
  const w = weapon();
  if (!player.grounded) return w.spreadAir;
  const sp = Math.hypot(player.vx, player.vz);
  if (sp < 0.35) return w.spreadStand;
  if (player.quiet) return w.spreadWalk;
  return w.spreadMove;
}

function farthest(list, fromPoints) {
  let best = list[0];
  let bestD = -1;
  for (const spot of list) {
    let near = Infinity;
    for (const p of fromPoints) near = Math.min(near, Math.hypot(spot.x - p.x, spot.z - p.z));
    if (fromPoints.length === 0) near = 99;
    if (near > bestD && !circleHitsSolid(spot.x, spot.z, 0.05, 1.6, 0.34, world.solids)) {
      bestD = near;
      best = spot;
    }
  }
  return best;
}

function livingBots() {
  return bots.filter((b) => b.alive).map((b) => ({ x: b.x, z: b.z }));
}

function spawnPlayer(withInvuln) {
  const spot = farthest(world.spawns.player, livingBots());
  player.x = spot.x;
  player.y = 0.05;
  player.z = spot.z;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.health = 100;
  player.alive = true;
  player.invuln = withInvuln ? 1.45 : 0;
  player.yaw = 0;
  player.pitch = 0;
  recoilP = 0;
  recoilY = 0;
  bloom = 0;
  weaponIndex = 0;
  reloadLeft = 0;
  drawLeft = 0;
  WEAPONS.forEach((w, i) => {
    ammo[i].mag = w.magSize;
    ammo[i].reserve = w.reserve;
  });
}

function spawnBot(bot, force) {
  const others = [{ x: player.x, z: player.z }, ...livingBots()];
  let spot = farthest(world.spawns.enemy, others);
  if (!force && player.alive && Math.hypot(spot.x - player.x, spot.z - player.z) < 8) {
    bot.respawn = 1.2;
    bot.alive = false;
    return;
  }
  bot.x = spot.x;
  bot.z = spot.z;
  bot.yaw = Math.PI;
  bot.health = 100;
  bot.alive = true;
  bot.deathT = 0;
  bot.mag = WEAPONS[bot.weapon].magSize;
  bot.reload = 0;
  bot.see = 0;
  bot.mode = "patrol";
  bot.lastSeen = null;
  bot.repath = 0;
  bot.soughtCover = false;
  bot.stuck = 0;
  bot.mesh.visible = true;
  bot.mesh.rotation.x = 0;
}

function resetMatch() {
  scoreUs = 0;
  scoreThem = 0;
  timeLeft = ROUND_TIME;
  endTimer = -1;
  countdown = 3;
  fightBanner = 0;
  deathLeft = 0;
  player.kills = 0;
  player.deaths = 0;
  player.shots = 0;
  player.hits = 0;
  player.headshots = 0;
  feed.replaceChildren();
  medkits.forEach((m) => {
    m.ready = true;
    m.respawn = 0;
  });
  spawnPlayer(false);
  bots.forEach((bot) => spawnBot(bot, true));
}

function showBrief() {
  state = "menu";
  brief.hidden = false;
  pauseEl.hidden = true;
  resultEl.hidden = true;
  hud.hidden = true;
  $("touch").classList.remove("on");
  keys.clear();
  mouseDown = false;
}

function openPause() {
  if (state === "result" || state === "menu" || state === "pause") return;
  pausedFrom = state;
  state = "pause";
  pauseEl.hidden = false;
  keys.clear();
  mouseDown = false;
  touchFire = false;
}

function resume() {
  pauseEl.hidden = true;
  state = pausedFrom || "play";
  lockPointer();
}

function lockPointer() {
  if (coarse) return;
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
}

function startMatch() {
  audio.resume();
  resetMatch();
  state = "countdown";
  pausedFrom = "countdown";
  brief.hidden = true;
  resultEl.hidden = true;
  pauseEl.hidden = true;
  hud.hidden = false;
  if (coarse) $("touch").classList.add("on");
  lockPointer();
}

function showResult() {
  state = "result";
  endTimer = -1;
  if (document.pointerLockElement) document.exitPointerLock();
  pauseEl.hidden = true;
  hud.hidden = true;
  $("touch").classList.remove("on");
  let title = "時間到，平手收場";
  let tone = "draw";
  if (scoreUs > scoreThem) {
    title = "鐵衛守住南倉";
    tone = "win";
  } else if (scoreThem > scoreUs) {
    title = "夜梟佔了巷口";
    tone = "lose";
  }
  const titleEl = $("result-title");
  titleEl.textContent = title;
  titleEl.className = tone;
  $("result-score").innerHTML = `<span class="us">${scoreUs}</span> — <span class="them">${scoreThem}</span>`;
  $("result-k").textContent = String(player.kills);
  $("result-d").textContent = String(player.deaths);
  $("result-kd").textContent = player.deaths === 0 ? (player.kills > 0 ? "∞" : "0") : (player.kills / player.deaths).toFixed(2);
  $("result-acc").textContent = `${player.shots ? Math.round((player.hits / player.shots) * 100) : 0}%`;
  $("result-hs").textContent = String(player.headshots);
  const used = Math.max(0, ROUND_TIME - timeLeft);
  const sec = Math.round(used);
  $("result-time").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  resultEl.hidden = false;
  keys.clear();
}

function pushFeed(parts) {
  const row = document.createElement("div");
  row.className = "feedline";
  for (const part of parts) {
    const span = document.createElement("span");
    span.className = part.cls || "";
    span.textContent = part.text;
    row.appendChild(span);
  }
  feed.appendChild(row);
  while (feed.children.length > 4) feed.removeChild(feed.firstChild);
}

function fmtTime(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function bodyParts(x, y, z) {
  return [
    { name: "head", box: { minX: x - 0.16, maxX: x + 0.16, minY: y + 1.4, maxY: y + 1.76, minZ: z - 0.16, maxZ: z + 0.16 } },
    { name: "body", box: { minX: x - 0.36, maxX: x + 0.36, minY: y + 0.62, maxY: y + 1.42, minZ: z - 0.26, maxZ: z + 0.26 } },
    { name: "legs", box: { minX: x - 0.26, maxX: x + 0.26, minY: y, maxY: y + 0.64, minZ: z - 0.2, maxZ: z + 0.2 } },
  ];
}

function traceShot(ox, oy, oz, dir, shooterBot) {
  let best = null;
  const solid = firstSolidHit(ox, oy, oz, dir.x, dir.y, dir.z, world.solids, 80);
  if (solid) best = { ...solid, kind: "world" };
  if (shooterBot && player.alive) {
    for (const part of bodyParts(player.x, player.y, player.z)) {
      const hit = rayAABB(ox, oy, oz, dir.x, dir.y, dir.z, part.box, best ? best.t : 80);
      if (hit && (!best || hit.t < best.t)) best = { ...hit, kind: "player", part: part.name };
    }
  }
  for (const bot of bots) {
    if (!bot.alive || bot === shooterBot) continue;
    for (const part of bodyParts(bot.x, 0, bot.z)) {
      const hit = rayAABB(ox, oy, oz, dir.x, dir.y, dir.z, part.box, best ? best.t : 80);
      if (hit && (!best || hit.t < best.t)) best = { ...hit, kind: "bot", bot, part: part.name };
    }
  }
  return best;
}

function spawnTracer(ax, ay, az, bx, by, bz, color) {
  const t = tracers[tracerCursor];
  tracerCursor = (tracerCursor + 1) % tracers.length;
  const arr = t.line.geometry.attributes.position.array;
  arr[0] = ax; arr[1] = ay; arr[2] = az;
  arr[3] = bx; arr[4] = by; arr[5] = bz;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.geometry.computeBoundingSphere();
  t.mat.color.set(color);
  t.line.visible = true;
  t.life = 0.055;
}

function spawnSparks(x, y, z, nx, ny, nz) {
  for (let n = 0; n < 6; n++) {
    let slot = -1;
    for (let i = 0; i < sparkCount; i++) if (sparkLife[i] <= 0) { slot = i; break; }
    if (slot < 0) slot = (Math.random() * sparkCount) | 0;
    sparkPos[slot * 3] = x;
    sparkPos[slot * 3 + 1] = y;
    sparkPos[slot * 3 + 2] = z;
    sparkVel[slot].x = nx * 2 + (Math.random() - 0.5) * 3;
    sparkVel[slot].y = ny * 2 + Math.random() * 2.5;
    sparkVel[slot].z = nz * 2 + (Math.random() - 0.5) * 3;
    sparkLife[slot] = 0.18 + Math.random() * 0.12;
  }
  sparkGeo.attributes.position.needsUpdate = true;
}

function placeDecal(hit) {
  const mesh = decals[decalCursor];
  decalCursor = (decalCursor + 1) % decals.length;
  const point = new THREE.Vector3(hit.x, hit.y, hit.z);
  const normal = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
  if (normal.lengthSq() < 0.001) normal.set(0, 1, 0);
  mesh.position.copy(point).addScaledVector(normal, 0.03);
  mesh.lookAt(point.clone().sub(normal));
  mesh.rotateZ(Math.random() * Math.PI);
  mesh.visible = true;
  const s = 0.7 + Math.random() * 0.7;
  mesh.scale.set(s, s, s);
}

function ejectShell() {
  const shell = shells[shellCursor];
  shellCursor = (shellCursor + 1) % shells.length;
  const rightX = Math.cos(player.yaw);
  const rightZ = -Math.sin(player.yaw);
  shell.x = player.x + rightX * 0.25;
  shell.y = player.y + 1.45;
  shell.z = player.z + rightZ * 0.25;
  shell.vx = rightX * 1.8 + (Math.random() - 0.5);
  shell.vy = 1.5 + Math.random();
  shell.vz = rightZ * 1.8 + (Math.random() - 0.5);
  shell.life = 1.15;
  shell.mesh.visible = true;
  shell.mesh.position.set(shell.x, shell.y, shell.z);
}

function showHitmark(head) {
  hitmark.classList.toggle("head", head);
  hitmark.style.opacity = "1";
  clearTimeout(showHitmark._t);
  showHitmark._t = setTimeout(() => {
    hitmark.style.opacity = "0";
  }, 90);
}

function showDamageDir(src) {
  const srcYaw = Math.atan2(-(src.x - player.x), -(src.z - player.z));
  let rel = srcYaw - player.yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const a = Math.abs(rel);
  const bucket = a < 0.75 ? "f" : a > 2.35 ? "b" : rel < 0 ? "r" : "l";
  document.querySelectorAll("#dirhit i").forEach((el) => el.classList.remove("on"));
  const el = document.querySelector(`#dirhit .${bucket}`);
  if (el) {
    el.classList.add("on");
    clearTimeout(showDamageDir._t);
    showDamageDir._t = setTimeout(() => el.classList.remove("on"), 280);
  }
}

function downPlayer(killerName, src) {
  if (!player.alive || endTimer >= 0) return;
  player.alive = false;
  player.health = 0;
  state = "dead";
  player.deaths += 1;
  scoreThem += 1;
  deathLeft = 2.5;
  pushFeed([
    { text: killerName, cls: "foe" },
    { text: " 擊倒 " },
    { text: "你", cls: "you" },
  ]);
  audio.hurt();
  if (src) showDamageDir(src);
  if (scoreThem >= SCORE_LIMIT) endTimer = 0.75;
}

function hurtPlayer(amount, src, name) {
  if (!player.alive || player.invuln > 0 || state !== "play") return;
  player.health = Math.max(0, player.health - amount);
  trauma = Math.min(1, trauma + amount / 90);
  hurtAmt = 1;
  audio.hurt();
  if (src) showDamageDir(src);
  if (player.health <= 0) downPlayer(name || "夜梟", src);
}

function killBot(bot, head) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.health = 0;
  bot.respawn = 6;
  bot.deathT = 0;
  if (endTimer >= 0) return;
  scoreUs += 1;
  player.kills += 1;
  audio.kill();
  showHitmark(head);
  pushFeed([
    { text: "你", cls: "you" },
    { text: " 擊倒 " },
    { text: bot.name, cls: "foe" },
    head ? { text: " · 爆頭", cls: "hs" } : { text: "" },
  ]);
  if (scoreUs >= SCORE_LIMIT) endTimer = 0.7;
}

function damageBot(bot, part, dist, weaponDef) {
  let mult = part === "head" ? weaponDef.head : part === "legs" ? 0.85 : 1;
  let dmg = Math.round(weaponDef.damage * falloff(dist) * mult);
  if (dmg < 1) dmg = 1;
  bot.health -= dmg;
  bot.flash = 0.12;
  bot.revealed = nowT + 2;
  player.hits += 1;
  if (part === "head") player.headshots += 1;
  audio.hit(part === "head");
  showHitmark(part === "head");
  if (bot.health <= 0) killBot(bot, part === "head");
  else if (bot.mode !== "combat") {
    bot.mode = "search";
    bot.lastSeen = { x: player.x, z: player.z };
    bot.seenAt = nowT;
    bot.see = bot.reaction;
  }
}

function playerSees(bot) {
  if (!bot.alive) return false;
  const dx = bot.x - player.x;
  const dy = 1.2 - (player.y + BODY.eye);
  const dz = bot.z - player.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > 32) return false;
  const hit = firstSolidHit(player.x, player.y + BODY.eye, player.z, dx / dist, dy / dist, dz / dist, world.solids, dist);
  return !hit || hit.t > dist - 0.7;
}

function canSeePlayer(bot) {
  if (!player.alive || player.invuln > 0) return false;
  const dx = player.x - bot.x;
  const dz = player.z - bot.z;
  const dist2 = Math.hypot(dx, dz);
  if (dist2 > bot.sight) return false;
  const fx = -Math.sin(bot.yaw);
  const fz = -Math.cos(bot.yaw);
  const dot = dist2 > 0.05 ? (dx * fx + dz * fz) / dist2 : 1;
  const wide = bot.mode === "combat" || bot.mode === "search";
  if (dist2 > 2.5 && dot < (wide ? 0.1 : 0.5)) return false;
  const dy = player.y + 1.2 - 1.48;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const hit = firstSolidHit(bot.x, 1.48, bot.z, dx / dist, dy / dist, dz / dist, world.solids, dist);
  return !hit || hit.t > dist - 0.45;
}

function findCover(bot) {
  let best = null;
  let bestD = 99;
  for (let i = 0; i < world.waypoints.length; i++) {
    const wx = world.waypoints[i][0];
    const wz = world.waypoints[i][1];
    const d = Math.hypot(wx - bot.x, wz - bot.z);
    if (d < 2.4 || d > 14) continue;
    if (Math.hypot(wx - player.x, wz - player.z) < 4) continue;
    if (segmentClear(wx, wz, player.x, player.z, 0.2, world.solids)) continue;
    if (d < bestD) {
      bestD = d;
      best = { x: wx, z: wz };
    }
  }
  return best;
}

function fireBot(bot) {
  const dx = player.x - bot.x;
  const dz = player.z - bot.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const w = WEAPONS[bot.weapon];
  const spread = 0.018 + dist * 0.0024;
  const yaw = Math.atan2(-dx, -dz) + bot.aimErr + (Math.random() - 0.5) * 2 * spread;
  const pitch = Math.atan2(player.y + 1.15 - 1.48, dist) + bot.aimErrP + (Math.random() - 0.5) * spread;
  const dir = anglesToDir(yaw, pitch);
  const muzzle = {
    x: bot.x - Math.sin(bot.yaw) * 0.7,
    y: 1.22,
    z: bot.z - Math.cos(bot.yaw) * 0.7,
  };
  const hit = traceShot(bot.x, 1.48, bot.z, dir, bot);
  const end = hit
    ? { x: hit.x, y: hit.y, z: hit.z }
    : { x: bot.x + dir.x * 24, y: 1.48 + dir.y * 24, z: bot.z + dir.z * 24 };
  spawnTracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z, 0xff8a55);
  if (hit && hit.kind === "world") {
    placeDecal(hit);
    spawnSparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz);
  } else if (hit && hit.kind === "player") {
    let mult = hit.part === "head" ? w.head : hit.part === "legs" ? 0.85 : 1;
    const dmg = Math.max(1, Math.round(w.damage * BOT_DAMAGE * falloff(dist) * mult));
    hurtPlayer(dmg, bot, bot.name);
  }
  audio.gunAt(w.id === "pistol" ? "pistol" : "rifle", bot.x, bot.z, player);
  bot.revealed = nowT + 1.35;
  bot.mag -= 1;
  if (bot.mag <= 0) bot.reload = w.reload * (0.85 + Math.random() * 0.3);
}

function chooseNav(bot, tx, tz) {
  const dist = Math.hypot(tx - bot.x, tz - bot.z);
  if (dist < 1.6 || segmentClear(bot.x, bot.z, tx, tz, 0.28, world.solids)) {
    bot.navX = tx;
    bot.navZ = tz;
    return;
  }
  const a = world.nearestNode(bot.x, bot.z);
  const b = world.nearestNode(tx, tz);
  const path = world.pathBetween(a, b);
  if (!path.length) {
    bot.navX = tx;
    bot.navZ = tz;
    return;
  }
  let node = world.waypoints[path[0]];
  if (Math.hypot(node[0] - bot.x, node[1] - bot.z) < 0.85 && path.length > 1) node = world.waypoints[path[1]];
  bot.navX = node[0];
  bot.navZ = node[1];
}

function updateBot(bot, dt, active) {
  if (!bot.alive) {
    bot.deathT += dt;
    bot.respawn -= dt;
    bot.mesh.position.set(bot.x, -Math.min(0.8, bot.deathT * 0.9), bot.z);
    bot.mesh.rotation.order = "YXZ";
    bot.mesh.rotation.y = bot.yaw;
    bot.mesh.rotation.x = Math.min(1.2, bot.deathT * 3);
    bot.mesh.visible = bot.deathT < 1.15;
    if (bot.respawn <= 0 && active && endTimer < 0 && state !== "countdown") spawnBot(bot, false);
    return;
  }

  bot.mesh.visible = true;
  bot.flash = Math.max(0, bot.flash - dt);
  bot.mesh.userData.torsoMat.emissive.setRGB(bot.flash > 0 ? 0.7 : 0, bot.flash > 0 ? 0.15 : 0, 0);

  if (!active) {
    bot.mesh.position.set(bot.x, 0, bot.z);
    bot.mesh.rotation.x = 0;
    bot.mesh.rotation.y = bot.yaw;
    return;
  }

  bot.los = canSeePlayer(bot);
  if (bot.los) {
    bot.see += dt;
    bot.lastSeen = { x: player.x, z: player.z };
    bot.seenAt = nowT;
    if (bot.see >= bot.reaction && bot.mode !== "cover") bot.mode = "combat";
  } else {
    bot.see = Math.max(0, bot.see - dt * 0.55);
  }

  if (noise && nowT - noise.time < 1.3 && bot.mode !== "combat") {
    const nd = Math.hypot(noise.x - bot.x, noise.z - bot.z);
    if (nd < noise.radius) {
      bot.mode = "search";
      bot.lastSeen = { x: noise.x, z: noise.z };
      bot.seenAt = nowT;
    }
  }

  if (bot.mode === "combat" && !bot.los && nowT - bot.seenAt > 1.15) bot.mode = "search";
  if ((bot.mode === "search" || bot.mode === "cover") && nowT - bot.seenAt > 5.5) bot.mode = "patrol";
  if (bot.mode === "cover" && nowT > bot.hideUntil) bot.mode = bot.los ? "combat" : "search";
  if (bot.mode === "combat" && bot.health < 48 && !bot.soughtCover) {
    bot.soughtCover = true;
    const cover = findCover(bot);
    if (cover) {
      bot.cover = cover;
      bot.mode = "cover";
      bot.hideUntil = nowT + 1.6;
    }
  }
  if (bot.mode === "combat" && Math.random() < dt * 0.1) {
    const cover = findCover(bot);
    if (cover) {
      bot.cover = cover;
      bot.mode = "cover";
      bot.hideUntil = nowT + 1.15;
    }
  }

  let tx = bot.x;
  let tz = bot.z;
  let hurry = false;
  if (bot.mode === "combat" && player.alive) {
    const dx = player.x - bot.x;
    const dz = player.z - bot.z;
    const dist = Math.hypot(dx, dz) || 1;
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafeT = 0.7 + Math.random() * 1.3;
      if (Math.random() < 0.5) bot.strafeSign *= -1;
    }
    const nx = dx / dist;
    const nz = dz / dist;
    tx = player.x - nx * bot.prefer + -nz * bot.strafeSign * bot.strafe;
    tz = player.z - nz * bot.prefer + nx * bot.strafeSign * bot.strafe;
    hurry = true;
  } else if ((bot.mode === "search" || bot.mode === "cover") && (bot.cover || bot.lastSeen)) {
    const goal = bot.mode === "cover" && bot.cover ? bot.cover : bot.lastSeen;
    tx = goal.x;
    tz = goal.z;
    hurry = bot.mode === "search";
  } else {
    if (bot.patrolWait > 0) bot.patrolWait -= dt;
    else {
      bot.repath -= dt;
      if (!bot._patrol || bot.repath <= -2 || Math.hypot(bot.x - bot._patrol.x, bot.z - bot._patrol.z) < 1) {
        const idx = (Math.random() * world.waypoints.length) | 0;
        bot._patrol = { x: world.waypoints[idx][0], z: world.waypoints[idx][1] };
        bot.patrolWait = Math.hypot(bot.x - bot._patrol.x, bot.z - bot._patrol.z) < 1.2 ? 0.6 : 0;
      }
      tx = bot._patrol.x;
      tz = bot._patrol.z;
    }
  }

  bot.repath -= dt;
  if (bot.repath <= 0) {
    bot.repath = 0.32;
    chooseNav(bot, tx, tz);
  }

  let dx = bot.navX - bot.x;
  let dz = bot.navZ - bot.z;
  let len = Math.hypot(dx, dz);
  if (len > 0.35) {
    dx /= len;
    dz /= len;
    if (!segmentClear(bot.x, bot.z, bot.x + dx * 1.2, bot.z + dz * 1.2, 0.3, world.solids)) {
      const turns = [0.8, -0.8, 1.4, -1.4, 2.2, -2.2];
      let steered = false;
      for (let i = 0; i < turns.length; i++) {
        const c = Math.cos(turns[i]);
        const s = Math.sin(turns[i]);
        const rx = dx * c - dz * s;
        const rz = dx * s + dz * c;
        if (segmentClear(bot.x, bot.z, bot.x + rx * 1.25, bot.z + rz * 1.25, 0.3, world.solids)) {
          dx = rx;
          dz = rz;
          steered = true;
          break;
        }
      }
      if (!steered) {
        dx = 0;
        dz = 0;
      }
    }
    const speed = hurry ? 4.5 : 2.3;
    if (dx || dz) moveCircle(bot, dx * speed * dt, dz * speed * dt, 0, 1.7, BODY.radius, world.solids);
    bot.speed = speed;
    const face = bot.mode === "combat"
      ? Math.atan2(-(player.x - bot.x), -(player.z - bot.z))
      : Math.atan2(-dx, -dz);
    bot.yaw = dampAngle(bot.yaw, face, bot.mode === "combat" ? 7.5 : 5.5, dt);
  } else {
    bot.speed = 0;
    if (bot.mode === "combat") {
      bot.yaw = dampAngle(bot.yaw, Math.atan2(-(player.x - bot.x), -(player.z - bot.z)), 8, dt);
    }
  }

  const moved = Math.hypot(bot.x - bot.lastX, bot.z - bot.lastZ);
  if (len > 0.6 && moved < 0.015) bot.stuck += dt;
  else bot.stuck = 0;
  bot.lastX = bot.x;
  bot.lastZ = bot.z;
  if (bot.stuck > 0.9) {
    bot.stuck = 0;
    bot.repath = 0;
    bot._patrol = null;
    const ang = Math.random() * Math.PI * 2;
    moveCircle(bot, Math.cos(ang) * 0.6, Math.sin(ang) * 0.6, 0, 1.7, BODY.radius, world.solids);
  }

  if (bot.reload > 0) {
    bot.reload -= dt;
    if (bot.reload <= 0) bot.mag = WEAPONS[bot.weapon].magSize;
  }
  bot.cool -= dt;
  if (bot.mode === "combat" && bot.los && bot.see >= bot.reaction && bot.reload <= 0 && bot.cool <= 0 && bot.mag > 0) {
    const face = Math.atan2(-(player.x - bot.x), -(player.z - bot.z));
    let diff = face - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.22) {
      const w = WEAPONS[bot.weapon];
      // Don't fire through a teammate standing in front.
      const dir = anglesToDir(bot.yaw, 0);
      let blockedFriend = false;
      for (const other of bots) {
        if (other === bot || !other.alive) continue;
        for (const part of bodyParts(other.x, 0, other.z)) {
          const hit = rayAABB(bot.x, 1.48, bot.z, dir.x, dir.y, dir.z, part.box, 12);
          const playerDist = Math.hypot(player.x - bot.x, player.z - bot.z);
          if (hit && hit.t < playerDist - 0.3) blockedFriend = true;
        }
      }
      if (!blockedFriend) {
        fireBot(bot);
        bot.burstLeft -= 1;
        bot.cool = w.interval * (1.2 + Math.random() * 0.45);
        if (bot.burstLeft <= 0) {
          bot.burstLeft = bot.burst;
          bot.cool = 0.4 + Math.random() * 0.55;
          const dist = Math.hypot(player.x - bot.x, player.z - bot.z);
          bot.aimErr = (Math.random() - 0.5) * (0.025 + dist * 0.0022);
          bot.aimErrP = (Math.random() - 0.5) * 0.018;
        }
      } else {
        bot.cool = 0.15;
      }
    }
  }

  if (bot.speed > 1) {
    bot.stepAcc += dt;
    if (bot.stepAcc > 0.48) {
      bot.stepAcc = 0;
      if (Math.hypot(bot.x - player.x, bot.z - player.z) < 16) audio.footAt(bot.x, bot.z, player);
    }
  }

  bot.phase += dt * (bot.speed > 1 ? 8 : 1.5);
  const swing = Math.sin(bot.phase) * (bot.speed > 1 ? 0.7 : 0.08);
  bot.mesh.userData.legs[0].rotation.x = swing;
  bot.mesh.userData.legs[1].rotation.x = -swing;
  bot.mesh.position.set(bot.x, 0, bot.z);
  bot.mesh.rotation.order = "YXZ";
  bot.mesh.rotation.x = 0;
  bot.mesh.rotation.y = bot.yaw;
}

let noise = null;

function tryFire() {
  if (state !== "play" || !player.alive) return;
  if (drawLeft > 0 || reloadLeft > 0 || gunCd > 0) return;
  const w = weapon();
  const am = ammo[weaponIndex];
  if (am.mag <= 0) {
    if (am.reserve > 0) startReload();
    else audio.dry();
    gunCd = 0.22;
    return;
  }
  am.mag -= 1;
  gunCd = w.interval;
  if (player.invuln > 0) player.invuln = 0;
  player.shots += 1;
  bloom = Math.min(w.bloomMax, bloom + w.bloom);
  recoilP = Math.min(0.11, recoilP + w.recoil);
  recoilY += (Math.random() - 0.5) * w.recoilYaw * 2;
  const spread = currentSpread() + bloom;
  const aimYaw = player.yaw + recoilY + (Math.random() - 0.5) * 2 * spread;
  const aimPitch = player.pitch - recoilP + (Math.random() - 0.5) * 2 * spread;
  const dir = anglesToDir(aimYaw, aimPitch);
  const ox = player.x;
  const oy = player.y + BODY.eye;
  const oz = player.z;
  const hit = traceShot(ox, oy, oz, dir, null);
  const muzzle = new THREE.Vector3();
  views[w.id].userData.muzzle.getWorldPosition(muzzle);
  const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : new THREE.Vector3(ox, oy, oz).addScaledVector(new THREE.Vector3(dir.x, dir.y, dir.z), 40);
  spawnTracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z, 0xfff1c4);
  muzzleFlash.position.copy(muzzle);
  muzzleFlash.visible = true;
  muzzleFlash.material.rotation = Math.random() * Math.PI;
  const fs = 0.28 + Math.random() * 0.18;
  muzzleFlash.scale.set(fs, fs, fs);
  flashLife = 0.04;
  views[w.id].userData.kick = 1;
  audio.gun(w.id === "pistol" ? "pistol" : "rifle");
  ejectShell();
  noise = { x: player.x, z: player.z, radius: player.quiet ? 16 : 30, time: nowT };
  if (hit && hit.kind === "bot") {
    damageBot(hit.bot, hit.part, hit.t, w);
    spawnSparks(hit.x, hit.y, hit.z, -dir.x, 0.4, -dir.z);
  } else if (hit) {
    placeDecal(hit);
    spawnSparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz);
  }
}

function startReload() {
  const w = weapon();
  const am = ammo[weaponIndex];
  if (reloadLeft > 0 || drawLeft > 0) return;
  if (am.mag >= w.magSize || am.reserve <= 0) return;
  reloadLeft = w.reload;
  reloadDur = w.reload;
  audio.reload();
}

function switchWeapon(index) {
  if (index === weaponIndex || index < 0 || index >= WEAPONS.length) return;
  weaponIndex = index;
  drawLeft = 0.26;
  reloadLeft = 0;
  bloom *= 0.4;
}

function wishVector() {
  let ix = 0;
  let iz = 0;
  if (keys.has("KeyW")) iz += 1;
  if (keys.has("KeyS")) iz -= 1;
  if (keys.has("KeyD")) ix += 1;
  if (keys.has("KeyA")) ix -= 1;
  ix += stickX;
  iz += -stickY;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) {
    ix /= mag;
    iz /= mag;
  }
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const rx = Math.cos(player.yaw);
  const rz = -Math.sin(player.yaw);
  return {
    x: fx * iz + rx * ix,
    z: fz * iz + rz * ix,
    moving: mag > 0.12,
  };
}

function updatePlayer(dt) {
  const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const wish = wishVector();
  player.quiet = shift && wish.moving;
  const speed = player.quiet ? WALK : RUN;
  if (player.grounded) {
    const hs = Math.hypot(player.vx, player.vz);
    if (hs > 0.02) {
      const drop = hs * 9.5 * dt;
      const ns = Math.max(0, hs - drop);
      const k = ns / hs;
      player.vx *= k;
      player.vz *= k;
    }
  }
  if (wish.moving) {
    const wl = Math.hypot(wish.x, wish.z) || 1;
    const wx = wish.x / wl;
    const wz = wish.z / wl;
    const current = player.vx * wx + player.vz * wz;
    const add = speed - current;
    if (add > 0) {
      const a = Math.min(add, (player.grounded ? 62 : 14) * dt);
      player.vx += wx * a;
      player.vz += wz * a;
    }
  }
  const hs = Math.hypot(player.vx, player.vz);
  if (hs > 6.4) {
    player.vx = (player.vx / hs) * 6.4;
    player.vz = (player.vz / hs) * 6.4;
  }
  const wantJump = keys.has("Space") || touchJump;
  if (wantJump && !jumpHeld && (player.grounded || player.coyote > 0)) {
    player.vy = JUMP;
    player.grounded = false;
    player.coyote = 0;
  }
  jumpHeld = wantJump;
  if (!player.grounded) player.vy -= GRAVITY * dt;
  else if (!wantJump) player.vy = 0;
  const fall = player.vy;
  const pos = { x: player.x, y: player.y, z: player.z };
  const vel = { x: player.vx, y: player.vy, z: player.vz };
  const was = player.grounded;
  player.grounded = moveBody(pos, vel, dt, world.solids);
  player.x = pos.x;
  player.y = pos.y;
  player.z = pos.z;
  player.vx = vel.x;
  player.vy = vel.y;
  player.vz = vel.z;
  if (player.grounded) player.coyote = 0.1;
  else player.coyote -= dt;
  if (!was && player.grounded && fall < -4) audio.land();
  lastGrounded = player.grounded;

  const sp = Math.hypot(player.vx, player.vz);
  if (player.grounded && sp > 0.6) {
    stepAcc += dt * (sp / RUN);
    const gap = player.quiet ? 0.62 : 0.42;
    if (stepAcc > gap) {
      stepAcc = 0;
      audio.footstep(player.quiet);
      noise = { x: player.x, z: player.z, radius: player.quiet ? 3.2 : 8.5, time: nowT };
    }
  }
}

function separateActors() {
  const list = [];
  if (player.alive) list.push(player);
  for (const bot of bots) if (bot.alive) list.push(bot);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      const min = 0.66;
      if (d < 0.0001) {
        dx = 0.02;
        dz = 0;
        d = 0.02;
      }
      if (d >= min) continue;
      const push = (min - d) * 0.5;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
    }
  }
  for (const ent of list) {
    if (!circleHitsSolid(ent.x, ent.z, ent.y || 0, (ent.y || 0) + BODY.height, BODY.radius, world.solids)) continue;
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      const x = ent.x + Math.cos(ang) * 0.18;
      const z = ent.z + Math.sin(ang) * 0.18;
      if (!circleHitsSolid(x, z, ent.y || 0, (ent.y || 0) + BODY.height, BODY.radius, world.solids)) {
        ent.x = x;
        ent.z = z;
        break;
      }
    }
  }
}

function updateMedkits(dt) {
  for (const med of medkits) {
    med.spin += dt * 1.6;
    if (!med.ready) {
      med.mesh.visible = false;
      med.respawn -= dt;
      if (med.respawn <= 0) med.ready = true;
      continue;
    }
    med.mesh.visible = true;
    med.mesh.position.y = 0.55 + Math.sin(med.spin) * 0.05;
    med.mesh.rotation.y = med.spin;
    if (!player.alive) continue;
    if (state !== "play" && state !== "countdown") continue;
    if (player.health >= 100) continue;
    if (Math.hypot(player.x - med.x, player.z - med.z) < 1.15 && player.y < 1.2) {
      player.health = Math.min(100, player.health + 45);
      med.ready = false;
      med.respawn = 18;
      audio.pickup();
    }
  }
}

function updateFx(dt) {
  flashLife -= dt;
  muzzleFlash.visible = flashLife > 0;
  for (const t of tracers) {
    if (t.life <= 0) continue;
    t.life -= dt;
    t.mat.opacity = Math.max(0, t.life / 0.055);
    t.line.visible = t.life > 0;
  }
  for (let i = 0; i < sparkCount; i++) {
    if (sparkLife[i] <= 0) continue;
    sparkLife[i] -= dt;
    sparkVel[i].y -= 9 * dt;
    sparkPos[i * 3] += sparkVel[i].x * dt;
    sparkPos[i * 3 + 1] += sparkVel[i].y * dt;
    sparkPos[i * 3 + 2] += sparkVel[i].z * dt;
    if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -20;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  for (const shell of shells) {
    if (shell.life <= 0) continue;
    shell.life -= dt;
    shell.vy -= 12 * dt;
    shell.x += shell.vx * dt;
    shell.y += shell.vy * dt;
    shell.z += shell.vz * dt;
    if (shell.y < 0.03) {
      shell.y = 0.03;
      shell.vy *= -0.25;
      shell.vx *= 0.6;
      shell.vz *= 0.6;
    }
    shell.mesh.position.set(shell.x, shell.y, shell.z);
    shell.mesh.rotation.x += dt * 8;
    shell.mesh.rotation.z += dt * 6;
    shell.mesh.visible = shell.life > 0;
  }
}

function updateCamera() {
  const shake = trauma > 0.02 ? trauma * trauma : 0;
  camera.position.set(player.x, player.y + (player.alive ? BODY.eye : 1.15), player.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw + recoilY + (shake ? (Math.random() - 0.5) * shake * 0.03 : 0);
  camera.rotation.x = player.pitch - recoilP + (shake ? (Math.random() - 0.5) * shake * 0.03 : 0);
  camera.rotation.z = player.alive ? 0 : Math.sin(deathLeft * 3) * 0.15;
}

function updateViewmodel(dt) {
  const activeId = weapon().id;
  for (const id of ["rifle", "pistol"]) {
    const vm = views[id];
    vm.visible = state !== "menu" && state !== "result" && id === activeId && player.alive;
  }
  const vm = views[activeId];
  if (!vm.visible) return;
  const rest = vm.userData.rest;
  vm.position.set(rest.x, rest.y, rest.z);
  vm.rotation.set(0, 0, 0);
  const sp = Math.hypot(player.vx, player.vz);
  if (player.grounded && sp > 0.4) bob += dt * (player.quiet ? 8 : 12.5) * (sp / RUN);
  vm.position.y += Math.sin(bob * 2) * 0.012 * Math.min(1, sp / RUN);
  vm.position.x += Math.cos(bob) * 0.008 * Math.min(1, sp / RUN);
  swayX = THREE.MathUtils.damp(swayX, clamp(-mouseDX * 0.0015, -0.08, 0.08), 8, dt);
  swayY = THREE.MathUtils.damp(swayY, clamp(mouseDY * 0.0012, -0.06, 0.06), 8, dt);
  mouseDX *= 0.8;
  mouseDY *= 0.8;
  vm.position.x += swayX;
  vm.position.y += swayY;
  vm.rotation.y = -swayX * 1.4;
  vm.rotation.x = swayY * 1.2;
  const kick = vm.userData.kick || 0;
  if (kick > 0) {
    vm.position.z += kick * 0.07;
    vm.rotation.x += kick * 0.08;
    vm.userData.kick = Math.max(0, kick - dt * 8);
  }
  if (reloadLeft > 0) {
    const u = 1 - reloadLeft / reloadDur;
    const dip = Math.sin(Math.min(1, u) * Math.PI);
    vm.position.y -= 0.14 * dip;
    vm.rotation.z += 0.45 * dip * (activeId === "pistol" ? 1 : 0.7);
    vm.rotation.x += 0.35 * dip;
  }
  if (drawLeft > 0) {
    const u = drawLeft / 0.26;
    vm.position.y -= 0.2 * u;
    vm.rotation.x += 0.4 * u;
  }
}

function drawRadar() {
  const ctx = radarCtx;
  const S = 148;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "rgba(10, 12, 16, 0.2)";
  ctx.fillRect(0, 0, S, S);
  const x0 = -26;
  const z0 = -21;
  const sx = (S - 16) / 52;
  const sz = (S - 16) / 42;
  const P = (x, z) => [8 + (x - x0) * sx, 8 + (z - z0) * sz];
  ctx.fillStyle = "rgba(214, 206, 196, 0.38)";
  for (const box of world.solids) {
    if (box.maxY < 0.45 || box.minY > 2.4) continue;
    if (box.maxX - box.minX > 45 && box.maxZ - box.minZ > 35) continue;
    const a = P(box.minX, box.minZ);
    const b = P(box.maxX, box.maxZ);
    ctx.fillRect(a[0], a[1], Math.max(1, b[0] - a[0]), Math.max(1, b[1] - a[1]));
  }
  for (const med of medkits) {
    if (!med.ready) continue;
    const p = P(med.x, med.z);
    ctx.fillStyle = "#7dffe0";
    ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
  }
  for (const bot of bots) {
    if (!bot.alive) continue;
    const dist = Math.hypot(bot.x - player.x, bot.z - player.z);
    const show = (playerSees(bot) && dist < 26) || nowT < bot.revealed || dist < 9;
    if (!show) continue;
    const p = P(bot.x, bot.z);
    ctx.fillStyle = "#ef8b72";
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const pp = P(player.x, player.z);
  ctx.save();
  ctx.translate(pp[0], pp[1]);
  ctx.rotate(-player.yaw);
  ctx.fillStyle = "#8ebfed";
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4.5, 5);
  ctx.lineTo(-4.5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function updateHud() {
  const playing = state === "play" || state === "countdown" || state === "dead";
  hud.hidden = !playing && state !== "pause";
  if (state === "pause") hud.hidden = false;
  crosshair.style.visibility = state === "play" || state === "countdown" ? "visible" : "hidden";
  const gap = 5 + (currentSpread() + bloom) * 820;
  crosshair.style.setProperty("--gap", `${gap.toFixed(1)}px`);
  crosshair.style.setProperty("--cg", player.health <= 30 ? "#ffb1a4" : "#f4efe6");
  $("s-us").textContent = String(scoreUs);
  $("s-them").textContent = String(scoreThem);
  const timer = $("timer");
  timer.textContent = fmtTime(timeLeft);
  timer.classList.toggle("hot", timeLeft <= 30 && state === "play");
  $("hpnum").textContent = String(Math.max(0, Math.ceil(player.health)));
  $("hpnum").classList.toggle("low", player.health <= 30);
  const fill = $("hpfill");
  fill.style.width = `${clamp(player.health, 0, 100)}%`;
  fill.classList.toggle("low", player.health <= 30);
  fill.classList.toggle("mid", player.health > 30 && player.health <= 60);
  const w = weapon();
  const am = ammo[weaponIndex];
  $("wname").textContent = w.name;
  $("wtype").textContent = w.type;
  $("mag").textContent = String(am.mag);
  $("mag").classList.toggle("low", am.mag <= Math.ceil(w.magSize * 0.2));
  $("reserve").textContent = String(am.reserve);
  $("reload").hidden = reloadLeft <= 0;
  if (reloadLeft > 0) $("reloadfill").style.width = `${(1 - reloadLeft / reloadDur) * 100}%`;
  $("invuln").hidden = !(player.alive && player.invuln > 0);
  $("dead").hidden = state !== "dead";
  if (state === "dead") $("dead-time").textContent = Math.max(0, deathLeft).toFixed(1);
  banner.textContent = "";
  banner.classList.remove("small");
  if (state === "countdown" && countdown > 0) banner.textContent = String(Math.ceil(countdown));
  else if (fightBanner > 0) {
    banner.textContent = "交火";
    banner.classList.add("small");
  }
  const locked = document.pointerLockElement === canvas;
  $("hintlock").hidden = coarse || locked || !(state === "play" || state === "countdown" || state === "dead");
  hurtAmt = Math.max(0, hurtAmt - 0.016);
  const hurt = (player.health < 35 ? (35 - player.health) / 70 : 0) + hurtAmt * 0.55;
  document.documentElement.style.setProperty("--hurt", hurt.toFixed(3));
  $("spotted").hidden = spotTimer <= 0;
  if (playing) drawRadar();
  if (player.alive && player.health <= 34 && state === "play") audio.startHeartbeat();
  else audio.stopHeartbeat();
}

function updateMenu(dt) {
  menuT += dt;
  const a = menuT * 0.13;
  camera.position.set(Math.sin(a) * 30, 18.5, Math.cos(a) * 24);
  camera.lookAt(0, 1.2, 0);
  views.rifle.visible = false;
  views.pistol.visible = false;
}

function update(dt) {
  if (state === "countdown") {
    countdown -= dt;
    if (countdown <= 0) {
      countdown = 0;
      state = "play";
      fightBanner = 0.9;
    }
  } else if (endTimer >= 0) {
    endTimer -= dt;
    if (endTimer <= 0) {
      showResult();
      return;
    }
  } else if (state === "play" || state === "dead") {
    timeLeft = Math.max(0, timeLeft - dt);
    if (timeLeft <= 0 && endTimer < 0) endTimer = 0.45;
  }
  if (fightBanner > 0) fightBanner -= dt;
  if (player.invuln > 0 && player.alive) player.invuln -= dt;

  const canMove = player.alive && (state === "play" || state === "countdown");
  if (canMove) updatePlayer(dt);
  else if (!player.alive && (state === "dead" || state === "play")) {
    deathLeft -= dt;
    player.vx = 0;
    player.vz = 0;
    if (deathLeft <= 0 && endTimer < 0) {
      state = "play";
      spawnPlayer(true);
    }
  }

  gunCd = Math.max(0, gunCd - dt);
  bloom *= Math.exp(-weapon().bloomDecay * dt);
  recoilP *= Math.exp(-11 * dt);
  recoilY *= Math.exp(-11 * dt);
  trauma = Math.max(0, trauma - dt * 1.5);
  if (reloadLeft > 0) {
    reloadLeft -= dt;
    if (reloadLeft <= 0) {
      reloadLeft = 0;
      const w = weapon();
      const am = ammo[weaponIndex];
      const need = w.magSize - am.mag;
      const take = Math.min(need, am.reserve);
      am.mag += take;
      am.reserve -= take;
    }
  }
  if (drawLeft > 0) drawLeft = Math.max(0, drawLeft - dt);

  if (state === "play" && (mouseDown || touchFire) && (weapon().auto || !semiLatch)) {
    tryFire();
    semiLatch = true;
  }
  if (!mouseDown && !touchFire) semiLatch = false;

  const botsActive = state === "play" || state === "dead";
  for (const bot of bots) updateBot(bot, dt, botsActive);
  separateActors();
  updateMedkits(dt);
  updateFx(dt);

  let exposed = false;
  if (state === "play" && player.alive && player.invuln <= 0) {
    for (const bot of bots) {
      if (bot.alive && bot.los && bot.see >= bot.reaction) exposed = true;
    }
  }
  if (exposed) {
    if (spotTimer <= 0) spotTimer = 0.9;
  }
  if (spotTimer > 0) spotTimer -= dt;

  updateCamera();
  updateViewmodel(dt);
  updateHud();
  audio.update(dt);
}

function tick(dt) {
  nowT += dt;
  if (state === "menu") updateMenu(dt);
  else if (state === "pause" || state === "result") updateViewmodel(0);
  else update(dt);
}

function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
  frame.last = now;
  tick(dt || 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resize);

window.addEventListener("keydown", (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT") return;
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === "KeyR") startReload();
  if (e.code === "Digit1") switchWeapon(0);
  if (e.code === "Digit2") switchWeapon(1);
  if (e.code === "Enter") {
    if (state === "menu" || state === "result") startMatch();
    else if (state === "pause") resume();
  }
  if (e.repeat) return;
});

window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  mouseDown = false;
  touchFire = false;
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  const dx = e.movementX || 0;
  const dy = e.movementY || 0;
  player.yaw -= dx * sens;
  player.pitch -= dy * sens;
  player.pitch = clamp(player.pitch, -1.25, 1.25);
  mouseDX += dx;
  mouseDY += dy;
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (document.pointerLockElement !== canvas) {
    if (state === "pause") resume();
    else if (state === "play" || state === "countdown" || state === "dead") lockPointer();
    return;
  }
  mouseDown = true;
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseDown = false;
});

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  document.body.classList.toggle("locked", locked);
  if (!locked && (state === "play" || state === "countdown" || state === "dead")) openPause();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

function bindSettings(sensEl, volEl) {
  const apply = () => {
    sens = Number(sensEl.value) / 100000;
    audio.setVolume(Number(volEl.value) / 100);
    $("sens").value = sensEl.value;
    $("sens2").value = sensEl.value;
    $("vol").value = volEl.value;
    $("vol2").value = volEl.value;
    try {
      localStorage.setItem("mini-alley-settings", JSON.stringify({ sens: sensEl.value, vol: volEl.value }));
    } catch (err) {
      /* private mode */
    }
  };
  sensEl.addEventListener("input", apply);
  volEl.addEventListener("input", apply);
}

bindSettings($("sens"), $("vol"));
bindSettings($("sens2"), $("vol2"));

try {
  const saved = JSON.parse(localStorage.getItem("mini-alley-settings") || "{}");
  if (saved.sens) {
    $("sens").value = saved.sens;
    $("sens2").value = saved.sens;
  }
  if (saved.vol != null) {
    $("vol").value = saved.vol;
    $("vol2").value = saved.vol;
  }
  sens = Number($("sens").value) / 100000;
  audio.setVolume(Number($("vol").value) / 100);
} catch (err) {
  /* ignore */
}

if (location.protocol === "file:") $("filewarn").hidden = false;
if (coarse) document.body.classList.add("coarse");

$("btn-start").addEventListener("click", () => {
  $("btn-start").blur();
  audio.ui();
  startMatch();
});
$("btn-resume").addEventListener("click", () => {
  $("btn-resume").blur();
  audio.ui();
  resume();
});
$("btn-restart").addEventListener("click", () => {
  $("btn-restart").blur();
  audio.ui();
  startMatch();
});
$("btn-help").addEventListener("click", () => {
  if (document.pointerLockElement) document.exitPointerLock();
  showBrief();
});
$("btn-again").addEventListener("click", () => {
  $("btn-again").blur();
  audio.ui();
  startMatch();
});
$("btn-back").addEventListener("click", () => showBrief());

const lookpad = $("lookpad");
const stick = $("stick");
const knob = $("knob");

function touchById(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
  return null;
}

let lookId = null;
let lookLX = 0;
let lookLY = 0;
let stickId = null;

lookpad.addEventListener("touchstart", (e) => {
  if (lookId !== null) return;
  const t = e.changedTouches[0];
  lookId = t.identifier;
  lookLX = t.clientX;
  lookLY = t.clientY;
}, { passive: true });

lookpad.addEventListener("touchmove", (e) => {
  const t = touchById(e.changedTouches, lookId);
  if (!t) return;
  const dx = t.clientX - lookLX;
  const dy = t.clientY - lookLY;
  lookLX = t.clientX;
  lookLY = t.clientY;
  player.yaw -= dx * sens * 1.35;
  player.pitch -= dy * sens * 1.35;
  player.pitch = clamp(player.pitch, -1.25, 1.25);
}, { passive: true });

function endLook(e) {
  if (touchById(e.changedTouches, lookId)) lookId = null;
}
lookpad.addEventListener("touchend", endLook);
lookpad.addEventListener("touchcancel", endLook);

stick.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const t = e.changedTouches[0];
  stickId = t.identifier;
  moveStick(t);
}, { passive: false });
stick.addEventListener("touchmove", (e) => {
  const t = touchById(e.changedTouches, stickId);
  if (!t) return;
  e.preventDefault();
  moveStick(t);
}, { passive: false });
function endStick(e) {
  if (!touchById(e.changedTouches, stickId)) return;
  stickId = null;
  stickX = 0;
  stickY = 0;
  knob.style.left = "44px";
  knob.style.top = "44px";
}
stick.addEventListener("touchend", endStick);
stick.addEventListener("touchcancel", endStick);

function moveStick(t) {
  const rect = stick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = t.clientX - cx;
  let dy = t.clientY - cy;
  const max = 42;
  const mag = Math.hypot(dx, dy) || 1;
  if (mag > max) {
    dx = (dx / mag) * max;
    dy = (dy / mag) * max;
  }
  stickX = dx / max;
  stickY = dy / max;
  knob.style.left = `${44 + dx}px`;
  knob.style.top = `${44 + dy}px`;
}

function holdButton(el, on, off) {
  const down = (e) => {
    e.preventDefault();
    e.stopPropagation();
    on();
  };
  const up = (e) => {
    e.preventDefault();
    off();
  };
  el.addEventListener("touchstart", down, { passive: false });
  el.addEventListener("touchend", up);
  el.addEventListener("touchcancel", up);
  el.addEventListener("mousedown", down);
  el.addEventListener("mouseup", up);
  el.addEventListener("mouseleave", up);
}

holdButton($("t-fire"), () => { touchFire = true; }, () => { touchFire = false; });
holdButton($("t-jump"), () => { touchJump = true; }, () => { touchJump = false; });
$("t-reload").addEventListener("click", () => startReload());
$("t-swap").addEventListener("click", () => switchWeapon(weaponIndex === 0 ? 1 : 0));

requestAnimationFrame(frame);
