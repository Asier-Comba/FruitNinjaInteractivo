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

// ── Constants ─────────────────────────────────────────────────────────────────
const FRUIT_EMOJIS = ['🍎', '🍊', '🍋', '🍇', '🍉', '🍓', '🍑', '🍍', '🥭', '🍌'];
const GRAVITY = 0.28;
const FRUIT_R = 38;
const TRAIL_LEN = 10;
const MAX_LIVES = 3;
let uid = 0;

// ── Game state factory ────────────────────────────────────────────────────────
function makeGame(w, h) {
  return {
    w, h,
    fruits: [],
    particles: [],
    trails: { left: [], right: [] },
    score: 0,
    lives: MAX_LIVES,
    combo: 0,
    comboTimer: 0,
    spawnTimer: 0,
    spawnInterval: 100,
    frameCount: 0,
  };
}

function spawnFruit(g) {
  const isBomb = Math.random() < 0.12;
  const x = 120 + Math.random() * (g.w - 240);
  const vy = -(10 + Math.random() * 5);
  const vx = (Math.random() - 0.5) * 5;
  g.fruits.push({
    id: uid++,
    x, y: g.h + FRUIT_R,
    vx, vy,
    spin: (Math.random() - 0.5) * 0.15,
    angle: 0,
    emoji: isBomb ? '💣' : FRUIT_EMOJIS[Math.floor(Math.random() * FRUIT_EMOJIS.length)],
    isBomb,
    sliced: false,
  });
}

// ── Main component ────────────────────────────────────────────────────────────
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
      if (!detectorRef.current) {
        detectorRef.current = await loadDetector();
      }
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

  function stop() {
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
      } catch { /* skip frame */ }

      update(g);
      draw(g);

      if (g.lives <= 0) {
        setFinalScore(g.score);
        setScreen('gameover');
        stop();
        return;
      }

      loop();
    });
  }

  function update(g) {
    g.frameCount++;
    g.spawnTimer++;
    if (g.spawnTimer >= g.spawnInterval) {
      g.spawnTimer = 0;
      spawnFruit(g);
      if (Math.random() < 0.3) spawnFruit(g);
      g.spawnInterval = Math.max(45, g.spawnInterval - 0.5);
    }

    if (g.combo > 0) {
      g.comboTimer--;
      if (g.comboTimer <= 0) g.combo = 0;
    }

    for (const trail of [g.trails.left, g.trails.right]) {
      if (trail.length < 2) continue;
      const p1 = trail[trail.length - 2];
      const p2 = trail[trail.length - 1];
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 8) continue;

      for (const fruit of g.fruits) {
        if (fruit.sliced) continue;
        if (segmentCircle(p1, p2, fruit, FRUIT_R)) {
          fruit.sliced = true;
          if (fruit.isBomb) {
            g.lives = Math.max(0, g.lives - 1);
            spawnParticles(g, fruit.x, fruit.y, '#ff4444', 14);
          } else {
            g.combo++;
            g.comboTimer = 50;
            g.score += g.combo > 2 ? g.combo : 1;
            spawnParticles(g, fruit.x, fruit.y, '#ffdd00', 8);
          }
        }
      }
    }

    for (const f of g.fruits) {
      f.vy += GRAVITY;
      f.x += f.vx;
      f.y += f.vy;
      f.angle += f.spin;
    }

    g.fruits = g.fruits.filter(f => {
      if (f.sliced) return false;
      if (f.y > g.h + FRUIT_R * 2) {
        if (!f.isBomb) {
          g.lives = Math.max(0, g.lives - 1);
          g.combo = 0;
        }
        return false;
      }
      return true;
    });

    for (const p of g.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3;
      p.life--;
    }
    g.particles = g.particles.filter(p => p.life > 0);
  }

  function spawnParticles(g, x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 3 + Math.random() * 5;
      g.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        color,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        r: 4 + Math.random() * 4,
      });
    }
  }

  function draw(g) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    canvas.width = g.w;
    canvas.height = g.h;

    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -g.w, 0);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, g.w, g.h);

    // Trails
    for (const [trail, color] of [[g.trails.left, '#00eeff'], [g.trails.right, '#ff00cc']]) {
      if (trail.length < 2) continue;
      for (let i = 1; i < trail.length; i++) {
        const alpha = i / trail.length;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * 0.9;
        ctx.lineWidth = 5 * alpha;
        ctx.lineCap = 'round';
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Fruits
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of g.fruits) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.font = `${FRUIT_R * 1.6}px serif`;
      ctx.fillText(f.emoji, 0, 0);
      ctx.restore();
    }

    // Particles
    for (const p of g.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // HUD — lives
    ctx.font = '26px serif';
    ctx.textAlign = 'left';
    ctx.fillText('❤️'.repeat(g.lives) + '🖤'.repeat(MAX_LIVES - g.lives), 10, 32);

    // HUD — score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'right';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillText(g.score, g.w - 12, 38);
    ctx.shadowBlur = 0;

    // Combo
    if (g.combo > 2) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffdd00';
      ctx.font = `bold ${20 + g.combo * 2}px sans-serif`;
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 10;
      ctx.fillText(`x${g.combo} COMBO!`, g.w / 2, 50);
      ctx.shadowBlur = 0;
    }
  }

  useEffect(() => () => stop(), []);

  return (
    <div style={s.root}>
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {screen === 'idle' && (
        <div style={s.center}>
          <div style={{ fontSize: 72 }}>🍉🍎🍊</div>
          <h1 style={s.title}>Fruit Ninja</h1>
          <p style={s.sub}>Usa tus <strong>manos</strong> para cortar la fruta</p>
          <p style={s.sub}>Evita las bombas 💣 — pierde una vida si la tocas</p>
          <p style={s.sub}>Se te escapa una fruta — pierde una vida</p>
          <button style={s.btn} onClick={start}>Jugar</button>
        </div>
      )}

      {screen === 'loading' && (
        <div style={s.center}>
          <div style={s.spinner} />
          <p style={{ color: '#ccc', marginTop: 20 }}>Cargando modelo de poses…</p>
        </div>
      )}

      {screen === 'gameover' && (
        <div style={s.center}>
          <div style={{ fontSize: 64 }}>💀</div>
          <h2 style={s.title}>Game Over</h2>
          <p style={{ fontSize: 36, color: '#ffdd00', margin: '12px 0' }}>{finalScore} pts</p>
          <button style={s.btn} onClick={start}>Reintentar</button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{ display: screen === 'playing' ? 'block' : 'none', borderRadius: 12, maxWidth: '100%' }}
      />
    </div>
  );
}

const s = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
    color: '#fff',
    padding: 16,
  },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  title: { fontSize: 42, margin: '8px 0', textShadow: '0 0 20px #ff6600' },
  sub: { color: '#ccc', fontSize: 16, margin: '4px 0' },
  btn: {
    marginTop: 20,
    padding: '14px 48px',
    fontSize: 22,
    background: 'linear-gradient(135deg, #e63946, #c1121f)',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(230,57,70,0.5)',
  },
  spinner: {
    width: 48,
    height: 48,
    border: '5px solid rgba(255,255,255,0.2)',
    borderTop: '5px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
