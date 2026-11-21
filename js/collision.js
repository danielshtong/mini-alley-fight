export const BODY = {
  radius: 0.32,
  height: 1.7,
  eye: 1.58,
  step: 0.4,
};

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function circleOverlapsBox(x, z, radius, box) {
  const cx = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
  const cz = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius - 1e-8;
}

export function circleHitsSolid(x, z, y0, y1, radius, solids) {
  for (let i = 0; i < solids.length; i++) {
    const box = solids[i];
    if (y0 >= box.maxY - 1e-4 || y1 <= box.minY + 1e-4) continue;
    if (circleOverlapsBox(x, z, radius, box)) return true;
  }
  return false;
}

export function findFloor(x, z, y, radius, solids) {
  let best = null;
  const probe = radius * 0.72;
  for (let i = 0; i < solids.length; i++) {
    const box = solids[i];
    if (box.maxY > y + 0.08) continue;
    if (!circleOverlapsBox(x, z, probe, box)) continue;
    if (best === null || box.maxY > best) best = box.maxY;
  }
  return best;
}

export function moveBody(pos, vel, dt, solids) {
  const radius = BODY.radius;
  const height = BODY.height;
  const step = BODY.step;
  const speed = Math.hypot(vel.x, vel.z, vel.y);
  const steps = Math.min(4, Math.max(1, Math.ceil((speed * dt) / 0.25)));
  const h = dt / steps;
  let grounded = false;
  let raised = 0;

  for (let s = 0; s < steps; s++) {
    const ox = pos.x;
    const oz = pos.z;
    const nx = pos.x + vel.x * h;
    const nz = pos.z + vel.z * h;
    const y = pos.y;
    const canStep = vel.y <= 0.02;

    const fits = (x, z, baseY) => !circleHitsSolid(x, z, baseY, baseY + height, radius, solids);

    if (fits(nx, nz, y)) {
      pos.x = nx;
      pos.z = nz;
    } else if (canStep && fits(nx, nz, y + step)) {
      pos.x = nx;
      pos.z = nz;
      pos.y = y + step;
      raised = step;
    } else {
      let moved = false;
      if (fits(nx, oz, pos.y)) {
        pos.x = nx;
        moved = true;
      } else if (canStep && fits(nx, oz, pos.y + step)) {
        pos.x = nx;
        pos.y += step;
        raised = step;
        moved = true;
      }
      if (fits(pos.x, nz, pos.y)) {
        pos.z = nz;
        moved = true;
      } else if (canStep && fits(pos.x, nz, pos.y + step)) {
        pos.z = nz;
        pos.y += step;
        raised = step;
        moved = true;
      }
      if (!moved) {
        vel.x *= 0.35;
        vel.z *= 0.35;
      }
    }

    pos.y += vel.y * h;
    if (circleHitsSolid(pos.x, pos.z, pos.y, pos.y + height, radius, solids)) {
      pos.y -= vel.y * h;
      if (vel.y < 0) grounded = true;
      vel.y = 0;
    }
  }

  if (vel.y <= 0) {
    const fy = findFloor(pos.x, pos.z, pos.y, radius, solids);
    const limit = raised > 0 ? raised + 0.08 : 0.18;
    if (fy !== null && pos.y - fy >= -0.04 && pos.y - fy <= limit) {
      pos.y = fy;
      vel.y = 0;
      grounded = true;
    }
  }

  return grounded;
}

export function moveCircle(pos, dx, dz, y, height, radius, solids) {
  const nx = pos.x + dx;
  const nz = pos.z + dz;
  const hit = (x, z) => circleHitsSolid(x, z, y, y + height, radius, solids);
  if (!hit(nx, nz)) {
    pos.x = nx;
    pos.z = nz;
    return;
  }
  if (!hit(nx, pos.z)) pos.x = nx;
  if (!hit(pos.x, nz)) pos.z = nz;
}

export function rayAABB(ox, oy, oz, dx, dy, dz, box, maxT = 1e9) {
  let tmin = 0;
  let tmax = maxT;
  let nAxis = -1;
  let nSign = 0;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const mn = [box.minX, box.minY, box.minZ];
  const mx = [box.maxX, box.maxY, box.maxZ];

  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
      continue;
    }
    let t1 = (mn[i] - o[i]) / d[i];
    let t2 = (mx[i] - o[i]) / d[i];
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nAxis = i;
      nSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmax < tmin) return null;
  }

  if (tmin < 1e-4 || tmin > maxT || nAxis < 0) return null;
  const n = [0, 0, 0];
  n[nAxis] = nSign;
  return {
    t: tmin,
    x: ox + dx * tmin,
    y: oy + dy * tmin,
    z: oz + dz * tmin,
    nx: n[0],
    ny: n[1],
    nz: n[2],
  };
}

export function firstSolidHit(ox, oy, oz, dx, dy, dz, solids, maxT = 200) {
  let best = null;
  for (let i = 0; i < solids.length; i++) {
    const hit = rayAABB(ox, oy, oz, dx, dy, dz, solids[i], best ? best.t : maxT);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

export function segmentClear(x1, z1, x2, z2, radius, solids) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (circleHitsSolid(x1 + dx * t, z1 + dz * t, 0.15, 1.5, radius, solids)) return false;
  }
  return true;
}

export function auditMap(solids, goals) {
  const minX = -24.35;
  const maxX = 24.35;
  const minZ = -19.15;
  const maxZ = 19.15;
  const step = 0.55;
  const cols = Math.floor((maxX - minX) / step) + 1;
  const rows = Math.floor((maxZ - minZ) / step) + 1;
  const walkable = new Uint8Array(cols * rows);
  const id = (ix, iz) => iz * cols + ix;
  for (let iz = 0; iz < rows; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = minX + ix * step;
      const z = minZ + iz * step;
      walkable[id(ix, iz)] = circleHitsSolid(x, z, 0.08, 1.55, 0.3, solids) ? 0 : 1;
    }
  }
  const toCell = (x, z) => [
    Math.round((x - minX) / step),
    Math.round((z - minZ) / step),
  ];
  const start = toCell(-21.2, 14.6);
  const seen = new Uint8Array(cols * rows);
  const q = [];
  if (start[0] >= 0 && start[1] >= 0 && start[0] < cols && start[1] < rows && walkable[id(start[0], start[1])]) {
    seen[id(start[0], start[1])] = 1;
    q.push(start);
  }
  while (q.length) {
    const [ix, iz] = q.shift();
    const nbs = [
      [ix + 1, iz],
      [ix - 1, iz],
      [ix, iz + 1],
      [ix, iz - 1],
    ];
    for (let k = 0; k < 4; k++) {
      const nx = nbs[k][0];
      const nz = nbs[k][1];
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const n = id(nx, nz);
      if (seen[n] || !walkable[n]) continue;
      seen[n] = 1;
      q.push([nx, nz]);
    }
  }
  const blocked = [];
  for (let g = 0; g < goals.length; g++) {
    const goal = goals[g];
    const cell = toCell(goal.x, goal.z);
    const inside = cell[0] >= 0 && cell[1] >= 0 && cell[0] < cols && cell[1] < rows;
    if (!inside || !seen[id(cell[0], cell[1])]) blocked.push(goal.name);
  }
  let reach = 0;
  let open = 0;
  for (let i = 0; i < seen.length; i++) {
    reach += seen[i];
    open += walkable[i];
  }
  return { blocked, reach, open };
}
