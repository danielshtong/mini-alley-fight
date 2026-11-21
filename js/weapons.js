export const WEAPONS = [
  {
    id: "rifle",
    name: "赤線-30",
    type: "步槍",
    damage: 26,
    head: 2,
    magSize: 30,
    reserve: 90,
    reload: 1.85,
    interval: 0.105,
    auto: true,
    spreadStand: 0.0065,
    spreadWalk: 0.0045,
    spreadMove: 0.022,
    spreadAir: 0.04,
    bloom: 0.0095,
    bloomMax: 0.05,
    bloomDecay: 5.2,
    recoil: 0.009,
    recoilYaw: 0.004,
  },
  {
    id: "pistol",
    name: "灰釘",
    type: "手槍",
    damage: 37,
    head: 2,
    magSize: 12,
    reserve: 48,
    reload: 1.32,
    interval: 0.2,
    auto: false,
    spreadStand: 0.0032,
    spreadWalk: 0.0026,
    spreadMove: 0.014,
    spreadAir: 0.028,
    bloom: 0.011,
    bloomMax: 0.04,
    bloomDecay: 7.5,
    recoil: 0.014,
    recoilYaw: 0.003,
  },
];

function part(THREE, parent, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 20;
  parent.add(mesh);
  return mesh;
}

function vmMat(THREE, color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.45,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    depthTest: false,
  });
}

export function createViewmodels(THREE) {
  const rifle = new THREE.Group();
  rifle.renderOrder = 20;
  const body = vmMat(THREE, 0x2c3036, { roughness: 0.48, metalness: 0.62 });
  const dark = vmMat(THREE, 0x16181c, { roughness: 0.4, metalness: 0.7 });
  const grip = vmMat(THREE, 0x4a3b32, { roughness: 0.8, metalness: 0.05 });
  const stripe = vmMat(THREE, 0xc4452d, { roughness: 0.45, metalness: 0.2, emissive: 0x5a1c14, emissiveIntensity: 0.6 });
  const accent = vmMat(THREE, 0x8d939b, { roughness: 0.35, metalness: 0.8 });

  part(THREE, rifle, 0.07, 0.085, 0.36, body, 0, 0.03, -0.02);
  part(THREE, rifle, 0.055, 0.07, 0.2, grip, 0, 0.02, 0.22);
  part(THREE, rifle, 0.04, 0.15, 0.07, dark, 0, -0.07, -0.02);
  part(THREE, rifle, 0.042, 0.11, 0.05, grip, 0, -0.05, 0.08);
  part(THREE, rifle, 0.058, 0.055, 0.24, body, 0, 0.02, -0.28);
  part(THREE, rifle, 0.026, 0.026, 0.32, dark, 0, 0.045, -0.5);
  part(THREE, rifle, 0.012, 0.02, 0.22, stripe, 0.038, 0.03, -0.04);
  part(THREE, rifle, 0.02, 0.045, 0.03, accent, 0, 0.09, 0.08);
  part(THREE, rifle, 0.012, 0.04, 0.02, accent, 0, 0.075, -0.58);
  part(THREE, rifle, 0.04, 0.04, 0.05, dark, 0, 0.04, -0.66);
  const rifleMuzzle = new THREE.Object3D();
  rifleMuzzle.position.set(0, 0.045, -0.7);
  rifle.add(rifleMuzzle);
  rifle.userData.muzzle = rifleMuzzle;
  rifle.userData.rest = { x: 0.26, y: -0.25, z: -0.48 };

  const pistol = new THREE.Group();
  pistol.renderOrder = 20;
  const slide = vmMat(THREE, 0x8b9197, { roughness: 0.32, metalness: 0.75 });
  const frame = vmMat(THREE, 0x3c4146, { roughness: 0.5, metalness: 0.55 });
  const pGrip = vmMat(THREE, 0x2a241e, { roughness: 0.84, metalness: 0.04 });
  const nail = vmMat(THREE, 0xd5dae1, { roughness: 0.25, metalness: 0.85, emissive: 0x22262c, emissiveIntensity: 0.4 });

  part(THREE, pistol, 0.055, 0.07, 0.24, slide, 0, 0.05, -0.02);
  part(THREE, pistol, 0.05, 0.045, 0.16, frame, 0, 0.01, 0.0);
  part(THREE, pistol, 0.048, 0.12, 0.055, pGrip, 0, -0.07, 0.04);
  part(THREE, pistol, 0.02, 0.02, 0.12, dark, 0, 0.05, -0.18);
  part(THREE, pistol, 0.012, 0.045, 0.012, nail, 0, 0.1, -0.12);
  part(THREE, pistol, 0.03, 0.02, 0.02, frame, 0, 0.02, 0.1);
  const pistolMuzzle = new THREE.Object3D();
  pistolMuzzle.position.set(0, 0.05, -0.26);
  pistol.add(pistolMuzzle);
  pistol.userData.muzzle = pistolMuzzle;
  pistol.userData.rest = { x: 0.3, y: -0.26, z: -0.4 };

  rifle.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });
  pistol.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false;
  });

  return { rifle, pistol };
}
