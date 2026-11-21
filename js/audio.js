export function createAudio() {
  let ctx = null;
  let master = null;
  let compressor = null;
  let noiseBuf = null;
  let volume = 0.8;
  let heartbeatOn = false;
  let heartT = 0;
  const dummy = () => {};

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function envGain(duration, peak, attack) {
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(master);
    return g;
  }

  function tone({ freq, to, dur, type, gain, attack }) {
    if (!ensure()) return;
    const o = ctx.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), ctx.currentTime + dur);
    const g = envGain(dur, gain, attack);
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function noise({ dur, gain, freq, type, q }) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type || "bandpass";
    filter.frequency.value = freq || 1200;
    filter.Q.value = q || 0.7;
    const g = envGain(dur, gain, 0.004);
    src.connect(filter);
    filter.connect(g);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  function spatial(x, z, player, builder) {
    if (!ensure()) return;
    const dx = x - player.x;
    const dz = z - player.z;
    const dist = Math.hypot(dx, dz);
    const atten = Math.max(0, 1 - dist / 42);
    if (atten < 0.02) return;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const rx = -fz;
    const rz = fx;
    const side = dist > 0.001 ? (dx * rx + dz * rz) / dist : 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, side));
    const g = ctx.createGain();
    g.gain.value = atten;
    panner.connect(g);
    g.connect(master);
    builder(panner);
  }

  function burst(dest, { dur, gain, freq, type, q, toneFreq, toneTo, toneGain, toneType }) {
    const t = ctx.currentTime;
    if (toneFreq) {
      const o = ctx.createOscillator();
      o.type = toneType || "sine";
      o.frequency.setValueAtTime(toneFreq, t);
      if (toneTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, toneTo), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(toneGain || 0.2, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(dest);
      o.start();
      o.stop(t + dur + 0.02);
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type || "bandpass";
    filter.frequency.value = freq || 1400;
    filter.Q.value = q || 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(ng);
    ng.connect(dest);
    src.start();
    src.stop(t + dur + 0.02);
  }

  return {
    resume() {
      if (ensure() && ctx.state === "suspended") ctx.resume();
    },
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v;
    },
    gun(kind) {
      if (!ensure()) return;
      if (kind === "pistol") {
        tone({ freq: 420, to: 110, dur: 0.09, type: "triangle", gain: 0.28 });
        noise({ dur: 0.07, gain: 0.34, freq: 2200, type: "bandpass", q: 0.6 });
        noise({ dur: 0.04, gain: 0.12, freq: 900, type: "lowpass", q: 0.5 });
      } else {
        tone({ freq: 170, to: 55, dur: 0.11, type: "sine", gain: 0.34 });
        noise({ dur: 0.1, gain: 0.32, freq: 1300, type: "bandpass", q: 0.55 });
        noise({ dur: 0.05, gain: 0.16, freq: 2800, type: "highpass", q: 0.4 });
      }
    },
    gunAt(kind, x, z, player) {
      if (!ensure()) return;
      spatial(x, z, player, (dest) => {
        if (kind === "pistol") {
          burst(dest, { dur: 0.08, gain: 0.5, freq: 2100, toneFreq: 380, toneTo: 120, toneGain: 0.28, toneType: "triangle" });
        } else {
          burst(dest, { dur: 0.1, gain: 0.55, freq: 1200, toneFreq: 160, toneTo: 50, toneGain: 0.36 });
        }
      });
    },
    dry() {
      noise({ dur: 0.03, gain: 0.08, freq: 1800, type: "highpass", q: 0.4 });
    },
    reload() {
      if (!ensure()) return;
      [0, 0.08, 0.16, 0.34].forEach((when, i) => {
        setTimeout(() => {
          if (!ctx) return;
          noise({
            dur: 0.035,
            gain: i === 3 ? 0.14 : 0.08,
            freq: i === 3 ? 700 : 2400,
            type: i === 3 ? "lowpass" : "highpass",
            q: 0.6,
          });
        }, when * 1000);
      });
    },
    hit(head) {
      tone({ freq: head ? 2100 : 1500, to: head ? 900 : 700, dur: 0.06, type: "square", gain: head ? 0.08 : 0.05 });
    },
    hurt() {
      tone({ freq: 130, to: 50, dur: 0.18, type: "sine", gain: 0.3 });
      noise({ dur: 0.12, gain: 0.18, freq: 400, type: "lowpass", q: 0.6 });
    },
    kill() {
      tone({ freq: 220, to: 60, dur: 0.22, type: "triangle", gain: 0.12 });
    },
    footstep(quiet) {
      noise({ dur: 0.05, gain: quiet ? 0.035 : 0.07, freq: quiet ? 280 : 220, type: "lowpass", q: 0.7 });
    },
    footAt(x, z, player) {
      if (!ensure()) return;
      spatial(x, z, player, (dest) => {
        burst(dest, { dur: 0.05, gain: 0.22, freq: 240, type: "lowpass", q: 0.5 });
      });
    },
    land() {
      noise({ dur: 0.08, gain: 0.1, freq: 180, type: "lowpass", q: 0.5 });
    },
    pickup() {
      tone({ freq: 660, to: 990, dur: 0.12, type: "sine", gain: 0.07 });
    },
    ui() {
      tone({ freq: 520, to: 740, dur: 0.07, type: "sine", gain: 0.05 });
    },
    startHeartbeat() {
      heartbeatOn = true;
    },
    stopHeartbeat() {
      heartbeatOn = false;
    },
    update(dt) {
      if (!heartbeatOn || !ctx) return;
      heartT -= dt;
      if (heartT <= 0) {
        heartT = 0.72;
        tone({ freq: 58, to: 40, dur: 0.12, type: "sine", gain: 0.12 });
      }
    },
  };
}
