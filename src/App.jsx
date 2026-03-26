import { useEffect, useRef, useState } from 'react';

// ── TensorFlow / MoveNet ──────────────────────────────────────────────────────
async function loadDetector() {
  const tf = await import('@tensorflow/tfjs');
  await import('@tensorflow/tfjs-backend-webgl');
  await tf.ready();
  const pd = await import('@tensorflow-models/pose-detection');
  return pd.createDetector(pd.SupportedModels.MoveNet, {
    modelType: pd.movenet.modelType.SINGLEPOSE_LIGHTNING,
  });
}

// ── Geometry ──────────────────────────────────────────────────────────────────
function segmentCircle(p1, p2, c, r) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const fx = p1.x - c.x, fy = p1.y - c.y;
  const a = dx * dx + dy * dy;
  if (a === 0) return Math.hypot(fx, fy) < r;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

// ── Fruit definitions ─────────────────────────────────────────────────────────
const FRUITS = [
  { emoji: '🍎', color: '#ff2233' },
  { emoji: '🍊', color: '#ff8800' },
  { emoji: '🍋', color: '#ffee00' },
  { emoji: '🍇', color: '#cc33ff' },
  { emoji: '🍉', color: '#ff3355' },
  { emoji: '🍓', color: '#ff1155' },
  { emoji: '🍑', color: '#ffaa66' },
  { emoji: '🍍', color: '#ffcc00' },
  { emoji: '🥭', color: '#ff9900' },
  { emoji: '🍌', color: '#ffdd00' },
];

const GRAVITY = 0.28;
const FRUIT_R = 42;
const TRAIL_LEN = 12;
const MAX_LIVES = 3;
let uid = 0;

// ── Game state ────────────────────────────────────────────────────────────────
function makeGame(w, h) {
  return {
    w, h,
    fruits: [],
    halves: [],
    particles: [],
    popups: [],
    trails: { left: [], right: [] },
    score: 0,
    lives: MAX_LIVES,
    combo: 0,
    comboTimer: 0,
    spawnTimer: 0,
    spawnInterval: 100,
    frameCount: 0,
    flash: 0,
    flashColor: '#fff',
    bgStars: Array.from({ length: 25 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.8 + Math.random() * 1.5,
      speed: 0.15 + Math.random() * 0.3,
      alpha: 0.08 + Math.random() * 0.18,
    })),
  };
}

function spawnFruit(g) {
  const isBomb = Math.random() < 0.12;
  const x = 120 + Math.random() * (g.w - 240);
  const vy = -(11 + Math.random() * 5);
  const vx = (Math.random() - 0.5) * 5;
  const def = FRUITS[Math.floor(Math.random() * FRUITS.length)];
  g.fruits.push({
    id: uid++,
    x, y: g.h + FRUIT_R,
    vx, vy,
    spin: (Math.random() - 0.5) * 0.12,
    angle: 0,
    emoji: isBomb ? '💣' : def.emoji,
    color: isBomb ? '#ff4444' : def.color,
    isBomb,
    sliced: false,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const animRef = useRef(null);
  const gameRef = useRef(null);
  const activeRef = useRef(false);

  const [screen, setScreen] = useState('idle');
  const [finalScore, setFinalScore] = useState(0);

  async function start() {
    setScreen('loading');
    activeRef.current = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      videoRef.current.srcObject = stream;
      await new Promise(res => { videoRef.current.onloadedmetadata = res; });
      videoRef.current.play();
      if (!detectorRef.current) detectorRef.current = await loadDetector();
      const w = videoRef.current.videoWidth;
      const h = videoRef.current.videoHeight;
      gameRef.current = makeGame(w, h);
      setScreen('playing');
      loop();
    } catch {
      activeRef.current = false;
      setScreen('idle');
      stream?.getTracks().forEach(t => t.stop());
    }
  }

  function stopGame() {
    activeRef.current = false;
    cancelAnimationFrame(animRef.current);
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
  }

  function loop() {
    animRef.current = requestAnimationFrame(async () => {
      if (!activeRef.current) return;
      const g = gameRef.current;
      if (!g || !videoRef.current || !canvasRef.current || !detectorRef.current) {
        if (activeRef.current) loop();
        return;
      }
      try {
        const poses = await detectorRef.current.estimatePoses(videoRef.current);
        if (poses[0]) {
          const kp = poses[0].keypoints;
          const mirror = x => g.w - x;
          const lw = kp[9], rw = kp[10];
          if (lw?.score > 0.25) {
            g.trails.left.push({ x: mirror(lw.x), y: lw.y });
            if (g.trails.left.length > TRAIL_LEN) g.trails.left.shift();
          }
          if (rw?.score > 0.25) {
            g.trails.right.push({ x: mirror(rw.x), y: rw.y });
            if (g.trails.right.length > TRAIL_LEN) g.trails.right.shift();
          }
        }
      } catch { /* skip */ }

      update(g);
      draw(g);

      if (g.lives <= 0) {
        setFinalScore(g.score);
        setScreen('gameover');
        stopGame();
        return;
      }
      loop();
    });
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  function update(g) {
    g.frameCount++;
    g.flash = Math.max(0, g.flash - 0.06);

    g.spawnTimer++;
    if (g.spawnTimer >= g.spawnInterval) {
      g.spawnTimer = 0;
      spawnFruit(g);
      if (Math.random() < 0.3) spawnFruit(g);
      g.spawnInterval = Math.max(45, g.spawnInterval - 0.5);
    }

    if (g.combo > 0 && --g.comboTimer <= 0) g.combo = 0;

    for (const trail of [g.trails.left, g.trails.right]) {
      if (trail.length < 2) continue;
      const p1 = trail[trail.length - 2];
      const p2 = trail[trail.length - 1];
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 8) continue;
      const sliceAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      for (const fruit of g.fruits) {
        if (fruit.sliced) continue;
        if (!segmentCircle(p1, p2, fruit, FRUIT_R)) continue;
        fruit.sliced = true;

        if (fruit.isBomb) {
          g.lives = Math.max(0, g.lives - 1);
          g.combo = 0;
          g.flash = 1;
          g.flashColor = '#ff0000';
          spawnParticles(g, fruit.x, fruit.y, '#ff4444', 20, true);
        } else {
          g.combo++;
          g.comboTimer = 55;
          const pts = g.combo > 2 ? g.combo : 1;
          g.score += pts;
          spawnParticles(g, fruit.x, fruit.y, fruit.color, 14, false);
          spawnHalves(g, fruit, sliceAngle);
          g.popups.push({
            x: fruit.x,
            y: fruit.y - FRUIT_R,
            text: g.combo > 2 ? `+${pts} COMBO!` : `+${pts}`,
            color: g.combo > 2 ? '#ffdd00' : '#ffffff',
            life: 52, maxLife: 52,
            vy: -1.8,
          });
        }
      }
    }

    for (const f of g.fruits) {
      f.vy += GRAVITY; f.x += f.vx; f.y += f.vy; f.angle += f.spin;
    }
    g.fruits = g.fruits.filter(f => {
      if (f.sliced) return false;
      if (f.y > g.h + FRUIT_R * 2) {
        if (!f.isBomb) {
          g.lives = Math.max(0, g.lives - 1);
          g.combo = 0;
          g.flash = 0.5;
          g.flashColor = '#ff0000';
        }
        return false;
      }
      return true;
    });

    for (const h of g.halves) {
      h.topX += h.topVx; h.topY += h.topVy; h.topVy += GRAVITY * 0.7; h.topAngle += h.topSpin;
      h.botX += h.botVx; h.botY += h.botVy; h.botVy += GRAVITY * 0.7; h.botAngle += h.botSpin;
      h.life--;
    }
    g.halves = g.halves.filter(h => h.life > 0);

    for (const p of g.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life--; }
    g.particles = g.particles.filter(p => p.life > 0);

    for (const p of g.popups) { p.y += p.vy; p.life--; }
    g.popups = g.popups.filter(p => p.life > 0);

    for (const s of g.bgStars) {
      s.y -= s.speed;
      if (s.y < -4) { s.y = g.h + 4; s.x = Math.random() * g.w; }
    }
  }

  function spawnParticles(g, x, y, color, count, explosive) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      const speed = explosive ? 5 + Math.random() * 8 : 2 + Math.random() * 5;
      g.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (explosive ? 0 : 2),
        color,
        life: 30 + Math.random() * 25,
        maxLife: 55,
        r: explosive ? 5 + Math.random() * 6 : 3 + Math.random() * 4,
      });
    }
  }

  function spawnHalves(g, fruit, sliceAngle) {
    const perp = sliceAngle + Math.PI / 2;
    const sp = 2.8;
    g.halves.push({
      emoji: fruit.emoji,
      color: fruit.color,
      topX: fruit.x, topY: fruit.y,
      topVx: fruit.vx + Math.cos(perp) * sp,
      topVy: fruit.vy + Math.sin(perp) * sp - 2,
      topAngle: fruit.angle, topSpin: -(0.07 + Math.random() * 0.06),
      botX: fruit.x, botY: fruit.y,
      botVx: fruit.vx - Math.cos(perp) * sp,
      botVy: fruit.vy - Math.sin(perp) * sp + 2,
      botAngle: fruit.angle, botSpin: 0.07 + Math.random() * 0.06,
      life: 55, maxLife: 55,
    });
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  function draw(g) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    canvas.width = g.w;
    canvas.height = g.h;

    // Mirrored video
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -g.w, 0);
    ctx.restore();

    // Gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 0, g.h);
    grad.addColorStop(0, 'rgba(4,0,18,0.52)');
    grad.addColorStop(1, 'rgba(4,0,18,0.32)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, g.w, g.h);

    // Ambient stars
    for (const star of g.bgStars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Neon trails
    for (const [trail, color] of [[g.trails.left, '#00eeff'], [g.trails.right, '#ff00cc']]) {
      if (trail.length < 2) continue;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length;
        ctx.globalAlpha = t * 0.95;
        ctx.strokeStyle = color;
        ctx.lineWidth = 7 * t;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Fruit halves (clipped canvas trick)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const FR = FRUIT_R;
    for (const h of g.halves) {
      const alpha = Math.min(1, h.life / (h.maxLife * 0.4));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(h.topX, h.topY);
      ctx.rotate(h.topAngle);
      ctx.beginPath();
      ctx.rect(-FR * 1.3, -FR * 1.5, FR * 2.6, FR * 1.5);
      ctx.clip();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.font = `${FR * 1.8}px serif`;
      ctx.fillText(h.emoji, 0, 0);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = alpha * 0.65;
      ctx.beginPath();
      ctx.moveTo(-FR, 0);
      ctx.lineTo(FR, 0);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(h.botX, h.botY);
      ctx.rotate(h.botAngle);
      ctx.beginPath();
      ctx.rect(-FR * 1.3, 0, FR * 2.6, FR * 1.5);
      ctx.clip();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.font = `${FR * 1.8}px serif`;
      ctx.fillText(h.emoji, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Fruits
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of g.fruits) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 8;
      ctx.font = `${FR * 1.8}px serif`;
      ctx.fillText(f.emoji, 0, 0);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Juice particles
    for (const p of g.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.r * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Score popups
    ctx.textAlign = 'center';
    for (const p of g.popups) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillStyle = p.color;
      ctx.font = `bold ${p.text.includes('COMBO') ? 24 : 20}px sans-serif`;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Screen flash
    if (g.flash > 0) {
      ctx.fillStyle = g.flashColor;
      ctx.globalAlpha = g.flash * 0.38;
      ctx.fillRect(0, 0, g.w, g.h);
      ctx.globalAlpha = 1;
    }

    // HUD — lives
    ctx.font = '28px serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 10;
    ctx.fillText('❤️'.repeat(g.lives) + '🖤'.repeat(MAX_LIVES - g.lives), 12, 38);

    // HUD — score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'right';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 12;
    ctx.fillText(g.score, g.w - 14, 44);
    ctx.shadowBlur = 0;

    // Combo banner
    if (g.combo > 2) {
      const pulse = 1 + Math.sin(g.frameCount * 0.25) * 0.06;
      ctx.save();
      ctx.translate(g.w / 2, 62);
      ctx.scale(pulse, pulse);
      ctx.textAlign = 'center';
      ctx.font = `bold ${22 + g.combo}px sans-serif`;
      ctx.shadowColor = '#ff6600';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffdd00';
      ctx.fillText(`x${g.combo} COMBO!`, 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  useEffect(() => () => stopGame(), []);

  return (
    <div style={s.root}>
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {screen === 'idle' && (
        <div style={s.center}>
          <div style={{ fontSize: 88, lineHeight: 1, filter: 'drop-shadow(0 0 20px rgba(255,100,0,0.6))' }}>🍉</div>
          <h1 style={s.title}>Fruit Ninja</h1>
          <p style={s.sub}>Mueve las <strong style={{ color: '#00eeff' }}>manos</strong> para cortar la fruta</p>
          <p style={s.sub}>Evita las <strong style={{ color: '#ff4444' }}>bombas</strong> 💣</p>
          <button style={s.btn} onClick={start}>Jugar</button>
        </div>
      )}

      {screen === 'loading' && (
        <div style={s.center}>
          <div style={s.spinner} />
          <p style={{ color: '#888', marginTop: 20, fontSize: 15 }}>Cargando modelo de poses…</p>
        </div>
      )}

      {screen === 'gameover' && (
        <div style={s.center}>
          <div style={{ fontSize: 76, filter: 'drop-shadow(0 0 16px rgba(255,0,0,0.5))' }}>💀</div>
          <h2 style={{ ...s.title, fontSize: 44 }}>Game Over</h2>
          <p style={{ fontSize: 44, color: '#ffdd00', margin: '10px 0', fontWeight: 900 }}>{finalScore} pts</p>
          <button style={s.btn} onClick={start}>Reintentar</button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          display: screen === 'playing' ? 'block' : 'none',
          borderRadius: 14,
          maxWidth: '100%',
          boxShadow: '0 0 50px rgba(0,180,255,0.18), 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      />
    </div>
  );
}

const s = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #08001a 0%, #120028 50%, #08001a 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Segoe UI', sans-serif",
    color: '#fff',
    padding: 16,
  },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  title: {
    fontSize: 58,
    margin: '10px 0 4px',
    fontWeight: 900,
    background: 'linear-gradient(135deg, #ff6a00, #ffdd00)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: -1,
  },
  sub: { color: '#999', fontSize: 17, margin: '2px 0' },
  btn: {
    marginTop: 28,
    padding: '15px 60px',
    fontSize: 22,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #e63946, #c1121f)',
    color: '#fff',
    border: 'none',
    borderRadius: 50,
    cursor: 'pointer',
    boxShadow: '0 6px 32px rgba(230,57,70,0.55)',
    letterSpacing: 1,
  },
  spinner: {
    width: 46,
    height: 46,
    border: '4px solid rgba(255,255,255,0.1)',
    borderTop: '4px solid #00eeff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
