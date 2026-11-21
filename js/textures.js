function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d") };
}

function grain(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = clampByte(d[i] + n);
    d[i + 1] = clampByte(d[i + 1] + n);
    d[i + 2] = clampByte(d[i + 2] + n);
  }
  g.putImageData(img, 0, 0);
}

function toTexture(THREE, canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function createTextures(THREE) {
  const concrete = (() => {
    const { c, g } = makeCanvas(256, 256);
    g.fillStyle = "#8c867c";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(55, 50, 44, 0.55)";
    g.lineWidth = 3;
    g.strokeRect(1, 1, 254, 254);
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(248, 8);
    g.stroke();
    for (let i = 0; i < 28; i++) {
      g.fillStyle = `rgba(60,54,48,${0.04 + Math.random() * 0.08})`;
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 30, 4 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, 256, 256, 18);
    return toTexture(THREE, c);
  })();

  const wall = (() => {
    const { c, g } = makeCanvas(256, 256);
    g.fillStyle = "#7b746b";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = y % 64 === 0 ? "rgba(40,36,32,0.18)" : "rgba(255,255,255,0.03)";
      g.fillRect(0, y, 256, 2);
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(40,34,30,${0.05 + Math.random() * 0.1})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 50, 6 + Math.random() * 10);
    }
    grain(g, 256, 256, 16);
    return toTexture(THREE, c);
  })();

  const metal = (() => {
    const { c, g } = makeCanvas(128, 128);
    const grd = g.createLinearGradient(0, 0, 128, 128);
    grd.addColorStop(0, "#8d9298");
    grd.addColorStop(0.5, "#5e646b");
    grd.addColorStop(1, "#8a8f95");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(20,22,24,0.35)";
    g.strokeRect(4, 4, 120, 120);
    grain(g, 128, 128, 22);
    return toTexture(THREE, c);
  })();

  const wood = (() => {
    const { c, g } = makeCanvas(128, 128);
    g.fillStyle = "#8d6840";
    g.fillRect(0, 0, 128, 128);
    for (let y = 8; y < 128; y += 18) {
      g.strokeStyle = `rgba(62, 38, 18, ${0.25 + Math.random() * 0.3})`;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(40, y + 4, 80, y - 5, 128, y + 2);
      g.stroke();
    }
    g.strokeStyle = "rgba(40,24,10,0.45)";
    g.strokeRect(1, 1, 126, 126);
    grain(g, 128, 128, 14);
    return toTexture(THREE, c);
  })();

  const ribs = (() => {
    const { c, g } = makeCanvas(128, 128);
    g.fillStyle = "#d7d2cb";
    g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 10) {
      g.fillStyle = x % 20 === 0 ? "rgba(40,40,40,0.28)" : "rgba(255,255,255,0.18)";
      g.fillRect(x, 0, 3, 128);
    }
    g.fillStyle = "rgba(20,20,20,0.45)";
    for (let y = 12; y < 128; y += 32) {
      for (let x = 8; x < 128; x += 20) {
        g.beginPath();
        g.arc(x, y, 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    grain(g, 128, 128, 12);
    return toTexture(THREE, c);
  })();

  const hazard = (() => {
    const { c, g } = makeCanvas(128, 128);
    g.fillStyle = "#1a1a1a";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#e2a21a";
    for (let i = -128; i < 256; i += 28) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 14, 0);
      g.lineTo(i + 14 - 128, 128);
      g.lineTo(i - 128, 128);
      g.fill();
    }
    return toTexture(THREE, c);
  })();

  const stain = (() => {
    const { c, g } = makeCanvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, "rgba(28,24,20,0.85)");
    grd.addColorStop(0.55, "rgba(28,24,20,0.35)");
    grd.addColorStop(1, "rgba(28,24,20,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = toTexture(THREE, c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  })();

  const flash = (() => {
    const { c, g } = makeCanvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, "rgba(255,255,240,1)");
    grd.addColorStop(0.35, "rgba(255,210,120,0.85)");
    grd.addColorStop(1, "rgba(255,160,40,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = toTexture(THREE, c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  })();

  const glow = (() => {
    const { c, g } = makeCanvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = toTexture(THREE, c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  })();

  return { concrete, wall, metal, wood, ribs, hazard, stain, flash, glow };
}

const FONT = '"PingFang HK", "Microsoft JhengHei", "Noto Sans CJK TC", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif';

export function paintSign(THREE, title, sub) {
  const { c, g } = makeCanvas(512, 200);
  g.fillStyle = "#211c18";
  g.fillRect(0, 0, 512, 200);
  g.strokeStyle = "#e2a24a";
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 184);
  g.fillStyle = "#f3ecdf";
  g.font = `700 78px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title, 256, sub ? 78 : 100);
  if (sub) {
    g.fillStyle = "#e2a24a";
    g.font = `600 36px ${FONT}`;
    g.fillText(sub, 256, 142);
  }
  const tex = toTexture(THREE, c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}
