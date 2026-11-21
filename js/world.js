import { circleHitsSolid, auditMap, segmentClear } from "./collision.js";
import { createTextures, paintSign } from "./textures.js";

function applyTriplanar(mat, scale) {
  mat.userData.triScale = scale;
  mat.customProgramCacheKey = () => `tri-${scale}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.triScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNorm;"
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTriNorm = normalize(mat3(modelMatrix) * objectNormal);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriNorm;\nuniform float triScale;"
      )
      .replace(
        "#include <map_fragment>",
        `vec3 triN = abs(normalize(vTriNorm));
triN = pow(triN, vec3(4.0));
triN /= max(triN.x + triN.y + triN.z, 0.0001);
vec4 tx = texture2D(map, vTriPos.zy / triScale);
vec4 ty = texture2D(map, vTriPos.xz / triScale);
vec4 tz = texture2D(map, vTriPos.xy / triScale);
diffuseColor *= tx * triN.x + ty * triN.y + tz * triN.z;`
      );
  };
  return mat;
}

function std(THREE, tex, opts) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex || null,
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.04,
  });
  if (tex && opts.tri !== false) applyTriplanar(mat, opts.scale || 2.4);
  return mat;
}

export function buildWorld(THREE, scene) {
  const tex = createTextures(THREE);
  const solids = [];
  const mats = {
    floor: std(THREE, tex.concrete, { roughness: 0.94, scale: 2.6 }),
    wall: std(THREE, tex.wall, { roughness: 0.9, scale: 2.5 }),
    wallDark: std(THREE, tex.wall, { color: 0xb3aaa0, roughness: 0.92, scale: 2.5 }),
    metal: std(THREE, tex.metal, { roughness: 0.45, metalness: 0.72, scale: 1.6 }),
    wood: std(THREE, tex.wood, { roughness: 0.82, scale: 1.4 }),
    teal: std(THREE, tex.ribs, { color: 0x1f6f6a, roughness: 0.55, metalness: 0.35, scale: 1.5 }),
    ochre: std(THREE, tex.ribs, { color: 0xb2652e, roughness: 0.58, metalness: 0.28, scale: 1.5 }),
    slate: std(THREE, tex.ribs, { color: 0x3d4e68, roughness: 0.5, metalness: 0.4, scale: 1.5 }),
    rust: std(THREE, tex.ribs, { color: 0x7a4038, roughness: 0.62, metalness: 0.22, scale: 1.6 }),
    hazard: std(THREE, tex.hazard, { roughness: 0.7, metalness: 0.05, scale: 0.8 }),
    trim: std(THREE, tex.metal, { color: 0x2e3238, roughness: 0.4, metalness: 0.8, scale: 1.2 }),
  };

  const geoCache = new Map();
  function boxGeo(w, h, d) {
    const key = `${w.toFixed(3)}x${h.toFixed(3)}x${d.toFixed(3)}`;
    let geo = geoCache.get(key);
    if (!geo) {
      geo = new THREE.BoxGeometry(w, h, d);
      geoCache.set(key, geo);
    }
    return geo;
  }

  function addBox(x, y, z, w, h, d, material, solid = true) {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (solid) {
      solids.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: y,
        maxY: y + h,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    }
    return mesh;
  }

  function addSign(title, sub, x, y, z, rotY) {
    const map = paintSign(THREE, title, sub);
    const mat = new THREE.MeshBasicMaterial({ map, transparent: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.94), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
    return mesh;
  }

  // Floor and outer shell. Interior spans roughly x ±24.6, z ±19.4.
  addBox(0, -0.6, 0, 50.8, 0.6, 40.4, mats.floor);
  addBox(0, 0, -19.8, 50.8, 4.7, 0.8, mats.wallDark);
  addBox(0, 0, 19.8, 50.8, 4.7, 0.8, mats.wallDark);
  addBox(-25.0, 0, 0, 0.8, 4.7, 40.4, mats.wallDark);
  addBox(25.0, 0, 0, 0.8, 4.7, 40.4, mats.wallDark);

  // North divider with three gates.
  const wallH = 3.25;
  addBox(-20.4, 0, -7.0, 8.4, wallH, 0.42, mats.wall);
  addBox(-7.2, 0, -7.0, 10.0, wallH, 0.42, mats.wall);
  addBox(7.2, 0, -7.0, 10.0, wallH, 0.42, mats.wall);
  addBox(20.4, 0, -7.0, 8.4, wallH, 0.42, mats.wall);

  // West flank room: north gate, east gate, south gate.
  addBox(-8.8, 0, -3.9, 0.4, wallH, 5.8, mats.wall);
  addBox(-8.8, 0, 5.5, 0.4, wallH, 5.4, mats.wall);
  addBox(-22.55, 0, 8.2, 4.1, wallH, 0.4, mats.wall);
  addBox(-12.4, 0, 8.2, 7.2, wallH, 0.4, mats.wall);

  // Overhead beams. High enough that a jump cannot reach them.
  addBox(0, 4.15, -2.1, 16, 0.12, 0.22, mats.trim);
  addBox(1.2, 4.15, 7.4, 14, 0.12, 0.22, mats.trim);
  addBox(0, 4.2, -12.4, 46, 0.12, 0.22, mats.trim);
  addBox(0, 4.2, -16.4, 46, 0.12, 0.22, mats.trim);
  addBox(-16.5, 3.55, 0.4, 12, 0.1, 0.18, mats.trim);

  // Landmark truck, cab facing the north gate.
  addBox(0.2, 0, -2.15, 2.25, 2.15, 2.05, mats.trim);
  addBox(0.2, 0, 1.25, 2.4, 2.55, 4.7, mats.rust);
  addBox(0.2, 2.15, -2.15, 2.05, 0.7, 1.15, mats.metal, false);
  addBox(0.2, 1.15, -3.05, 1.7, 0.55, 0.12, mats.metal, false);

  // East container yard.
  addBox(13.5, 0, -2.2, 2.45, 2.6, 6.2, mats.teal);
  addBox(13.5, 0, 6.5, 2.45, 2.6, 5.8, mats.ochre);
  addBox(18.5, 0, 1.6, 2.35, 2.6, 7.2, mats.slate);
  addBox(22.35, 0, 10.0, 2.05, 2.55, 5.4, mats.teal);
  addBox(22.35, 2.55, 10.0, 2.05, 2.45, 5.4, mats.slate);
  addBox(17.2, 0, 16.3, 6.4, 2.55, 2.25, mats.ochre);

  // Concrete barriers, too tall to hop.
  const barrier = (x, z, alongX) => {
    const w = alongX ? 2.7 : 0.48;
    const d = alongX ? 0.48 : 2.7;
    addBox(x, 0, z, w, 1.62, d, mats.wall);
    addBox(x, 1.5, z, w * 0.96, 0.12, d * 0.96, mats.hazard, false);
  };
  barrier(-4.7, -3.5, false);
  barrier(-4.3, 5.4, false);
  barrier(5.0, 4.15, true);
  barrier(5.4, -4.55, true);
  barrier(9.4, 13.6, false);
  barrier(-1.6, 13.2, true);
  barrier(8.6, -4.2, false);

  // Jumpable single crates and taller stacks.
  const crate = (x, z, tall) => addBox(x, 0, z, 1.15, tall ? 1.5 : 0.74, 1.15, mats.wood);
  crate(-22.2, 5.6, false);
  crate(-15.8, -4.6, false);
  crate(-19.4, -5.4, true);
  crate(7.4, -14.2, false);
  crate(-17.5, -14.6, true);
  crate(3.2, -16.6, false);
  crate(16.4, -15.2, true);
  crate(-6.4, 15.4, false);
  crate(11.4, 17.2, false);
  crate(6.6, 6.8, false);
  crate(-2.8, -5.6, true);

  // Desks and a shelf inside the west room.
  addBox(-20.6, 0, -2.2, 0.7, 1.85, 5.2, mats.wood);
  addBox(-14.6, 0, 4.4, 2.5, 0.92, 1.05, mats.wood);
  addBox(-13.4, 0, -3.6, 1.7, 0.92, 1.0, mats.trim);

  // Barrel clusters and a dumpster.
  addBox(6.4, 0, -0.6, 1.35, 1.05, 1.15, mats.rust);
  addBox(-11.2, 0, 14.2, 1.45, 1.05, 1.15, mats.rust);
  addBox(2.4, 0, -13.6, 1.2, 1.05, 1.5, mats.rust);
  addBox(9.6, 0, 10.6, 1.55, 1.38, 2.7, mats.trim);

  // North hall columns.
  const column = (x, z) => addBox(x, 0, z, 0.85, 3.4, 0.85, mats.wallDark);
  column(-16.8, -12.2);
  column(-6.2, -11.4);
  column(4.8, -12.6);
  column(15.2, -11.6);
  column(-11.5, -17.2);
  column(10.6, -16.8);

  // Indoor floor washes so each room reads differently.
  const wash = (x, z, w, d, color, opacity) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  wash(0, -13.2, 47, 11.5, 0x2a313c, 0.28);
  wash(-16.6, 0.5, 14.5, 13.5, 0x3a3228, 0.22);
  wash(2, 5, 12, 26, 0x23262c, 0.38);

  addSign("南倉巷", "卸貨區", 0.2, 2.5, 19.25, Math.PI);
  addSign("鐵衛駐點", "西廂", -24.45, 2.15, 2.2, Math.PI / 2);
  addSign("貨櫃場", "東線", 24.45, 2.2, 6.5, -Math.PI / 2);
  addSign("北倉通道", "夜班", -2.2, 2.35, -19.25, 0);

  const labelMat = (text, color) => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = color;
    g.font = '700 72px "WenQuanYi Micro Hei", sans-serif';
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 64);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map, transparent: true });
  };
  const sticker = (text, color, x, y, z, ry) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), labelMat(text, color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
  };
  sticker("04", "#f2efe8", 0.2, 1.5, 3.62, 0);
  sticker("17", "#f2efe8", 14.75, 1.5, -2.2, Math.PI / 2);
  sticker("22", "#f2efe8", 19.7, 1.5, 1.6, -Math.PI / 2);

  function hangLamp(x, y, z, color, intensity, distance) {
    const bulbMat = new THREE.MeshBasicMaterial({ color });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), bulbMat);
    bulb.position.set(x, y, z);
    scene.add(bulb);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex.glow,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.85,
      })
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(1.8, 1.8, 1.8);
    scene.add(sprite);
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    scene.add(light);
    addBox(x, y + 0.12, z, 0.08, 0.7, 0.08, mats.trim, false);
  }

  hangLamp(0, 3.35, -2.1, 0xffb15e, 46, 18);
  hangLamp(1.2, 3.35, 7.4, 0xffc27a, 34, 16);
  hangLamp(-8, 3.45, -12.4, 0xc9d7ef, 42, 20);
  hangLamp(12, 3.45, -16.2, 0xffb15e, 36, 16);
  hangLamp(-16.5, 3.05, 0.4, 0xffd0a2, 28, 13);
  hangLamp(18.2, 3.5, 5.5, 0xffb15e, 38, 16);
  hangLamp(-18, 3.3, 15.2, 0xffc27a, 30, 14);

  const spawns = {
    player: [
      { x: -21.2, z: 14.6 },
      { x: -17.8, z: 1.2 },
      { x: 3.2, z: 16.4 },
      { x: 8.4, z: 17.2 },
      { x: 19.6, z: 13.4 },
    ],
    enemy: [
      { x: -21.4, z: -14.8 },
      { x: -8.8, z: -15.6 },
      { x: 0.4, z: -15.2 },
      { x: 14.4, z: -9.6 },
      { x: 19.2, z: -15.4 },
    ],
  };

  const medkits = [
    { x: -22.6, z: -5.6 },
    { x: 16.6, z: 11.4 },
    { x: -22.6, z: -14.2 },
  ];

  const waypoints = [
    [-21.2, 14.6], [-14, 15.2], [-6.2, 15.6], [3.2, 16.2], [8.4, 16.6], [14.5, 14.2], [20.2, 13.2], [22.6, 16.8],
    [-21.5, 10.2], [-12.5, 11.4], [-2, 11.2], [6.5, 12.4], [14.2, 10.6], [20.4, 8.2],
    [-21.8, 5.8], [-16.2, 6.2], [-12.2, 4.6], [-21.6, 1.2], [-16.4, 1.0], [-12.6, -0.4],
    [-22.2, -4.6], [-16.8, -4.2], [-13.6, -5.4],
    [-7.4, 1.2], [-5.4, 5.6], [-5.6, -3.2], [-5.2, -6.2],
    [4.2, 6.4], [4.6, 1.2], [4.8, -3.6], [2.2, -6.3], [8.8, -2.4], [8.4, 6.8],
    [11.2, 11.2], [16.6, 11.2], [16.2, 7.2], [20.6, 6.4], [23.4, 6.6], [20.2, 13.6], [11.6, 3.6],
    [-14.2, -7.6], [0, -7.6], [14.2, -7.6],
    [-21.2, -10.2], [-16.2, -14.8], [-8.6, -10.4], [-8.8, -15.4], [0.2, -10.2], [0.4, -15.2],
    [6.4, -10.6], [8.4, -14.6], [14.6, -14.2], [19.4, -10.8], [19.2, -15.4], [-22.4, -14.4],
  ];

  const links = waypoints.map(() => []);
  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      const dx = waypoints[i][0] - waypoints[j][0];
      const dz = waypoints[i][1] - waypoints[j][1];
      const dist = Math.hypot(dx, dz);
      if (dist > 10.5 || dist < 0.4) continue;
      if (segmentClear(waypoints[i][0], waypoints[i][1], waypoints[j][0], waypoints[j][1], 0.3, solids)) {
        links[i].push(j);
        links[j].push(i);
      }
    }
  }

  const goals = [
    ...spawns.player.map((p, i) => ({ ...p, name: `player-${i}` })),
    ...spawns.enemy.map((p, i) => ({ ...p, name: `enemy-${i}` })),
    ...medkits.map((p, i) => ({ ...p, name: `med-${i}` })),
    { x: -16, z: 1, name: "west-room" },
    { x: -4.8, z: 1.2, name: "alley-west" },
    { x: 4.6, z: -0.4, name: "alley-east" },
    { x: 16, z: 4, name: "east-yard" },
    { x: 0, z: -14, name: "north-hall" },
  ];
  const audit = auditMap(solids, goals);
  if (audit.blocked.length) {
    console.warn("迷你巷戰 map gaps", audit.blocked);
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    let loose = 0;
    let looseD = Infinity;
    for (let i = 0; i < waypoints.length; i++) {
      const d = (waypoints[i][0] - x) ** 2 + (waypoints[i][1] - z) ** 2;
      if (d < looseD) {
        looseD = d;
        loose = i;
      }
      if (d < bestD && segmentClear(x, z, waypoints[i][0], waypoints[i][1], 0.28, solids)) {
        bestD = d;
        best = i;
      }
    }
    return bestD < Infinity ? best : loose;
  }

  function pathBetween(a, b) {
    if (a === b) return [];
    const prev = new Int16Array(waypoints.length);
    prev.fill(-1);
    prev[a] = a;
    const q = [a];
    while (q.length) {
      const i = q.shift();
      if (i === b) break;
      const next = links[i];
      for (let k = 0; k < next.length; k++) {
        const j = next[k];
        if (prev[j] !== -1) continue;
        prev[j] = i;
        q.push(j);
      }
    }
    if (prev[b] === -1) return [b];
    const out = [];
    let c = b;
    while (c !== a) {
      out.push(c);
      c = prev[c];
    }
    out.reverse();
    return out;
  }

  // Spawn and pickup points that landed inside geometry get nudged in audit only.
  for (const list of [spawns.player, spawns.enemy, medkits]) {
    for (const p of list) {
      if (!circleHitsSolid(p.x, p.z, 0.05, 1.6, 0.34, solids)) continue;
      let fixed = false;
      for (let ring = 1; ring <= 6 && !fixed; ring++) {
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const x = p.x + Math.cos(ang) * ring * 0.7;
          const z = p.z + Math.sin(ang) * ring * 0.7;
          if (!circleHitsSolid(x, z, 0.05, 1.6, 0.34, solids)) {
            p.x = x;
            p.z = z;
            fixed = true;
            break;
          }
        }
      }
    }
  }

  return {
    solids,
    spawns,
    medkits,
    waypoints,
    links,
    nearestNode,
    pathBetween,
    audit,
    textures: tex,
  };
}
