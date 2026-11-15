/* ============ ZMEYA ARCADE — app.js ============ */
'use strict';

/* ---------- Хранилище рекордов ---------- */
const Store = {
  get(key, def = null) {
    try { const v = localStorage.getItem('zmeya_' + key); return v === null ? def : JSON.parse(v); }
    catch { return def; }
  },
  set(key, val) { try { localStorage.setItem('zmeya_' + key, JSON.stringify(val)); } catch {} },
  clearAll() {
    Object.keys(localStorage).filter(k => k.startsWith('zmeya_')).forEach(k => localStorage.removeItem(k));
  }
};

/* ---------- Звук (WebAudio, без файлов) ---------- */
let audioCtx = null;
function beep(freq = 440, dur = 0.08, type = 'square', vol = 0.15) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch {}
}
const sfx = {
  eat:   () => beep(660, 0.07, 'square'),
  hit:   () => beep(120, 0.3, 'sawtooth', 0.2),
  click: () => beep(880, 0.05, 'triangle'),
  win:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'square', 0.12), i * 120)); },
  lose:  () => { [400, 300, 200].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.12), i * 150)); },
  bad:   () => beep(180, 0.15, 'sawtooth'),
  pop:   () => beep(520 + Math.random() * 300, 0.06, 'triangle'),
};

/* ---------- Навигация между экранами ---------- */
const screens = document.querySelectorAll('.screen');
function showScreen(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo({ top: 0 });
  GameRunner.onScreenChange(id);
}
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => { sfx.click(); showScreen('game-' + card.dataset.game); });
});
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => { sfx.click(); showScreen('menu'); refreshMenuRecords(); });
});

/* ---------- Конфетти ---------- */
function confetti(duration = 1800) {
  let c = document.getElementById('confetti-canvas');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'confetti-canvas';
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99;';
    document.body.appendChild(c);
  }
  c.width = innerWidth; c.height = innerHeight;
  const ctx = c.getContext('2d');
  const colors = ['#39ff88', '#00e5ff', '#ff4d9d', '#ffd93d', '#fff'];
  const parts = Array.from({ length: 120 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5,
    r: 3 + Math.random() * 5, vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4,
    rot: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4,
    col: colors[Math.floor(Math.random() * colors.length)]
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.col; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    });
    if (t - t0 < duration) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, c.width, c.height);
  })(t0);
}

/* ---------- Менеджер игр (запуск/остановка циклов) ---------- */
const GameRunner = {
  current: 'menu',
  games: {},
  register(name, game) { this.games[name] = game; },
  onScreenChange(id) {
    // остановить всё
    Object.values(this.games).forEach(g => g.stop && g.stop());
    const m = id.match(/^game-(.+)$/);
    this.current = m ? m[1] : 'menu';
    const g = m ? this.games[m[1]] : null;
    if (g && g.enter) g.enter();
  }
};

/* =====================================================
   🐍 ЗМЕЙКА
===================================================== */
GameRunner.register('snake', (() => {
  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');
  const N = 24, CELL = canvas.width / N;
  let snake, dir, nextDir, food, score, alive = false, paused = false, loop = null, speed = 130;

  const $score = document.getElementById('snake-score');
  const $best = document.getElementById('snake-best');
  const $overlay = document.getElementById('snake-overlay');

  function reset() {
    snake = [{x: 8, y: 12}, {x: 7, y: 12}, {x: 6, y: 12}];
    dir = {x: 1, y: 0}; nextDir = dir;
    score = 0; speed = 130; alive = true; paused = false;
    placeFood();
    $score.textContent = 0;
    $best.textContent = Store.get('snake_best', 0);
  }

  function placeFood() {
    do { food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; }
    while (snake.some(s => s.x === food.x && s.y === food.y));
  }

  function tick() {
    if (!alive || paused) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    // стены — порталы!
    head.x = (head.x + N) % N; head.y = (head.y + N) % N;
    if (snake.some(s => s.x === head.x && s.y === head.y)) return gameOver();
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10; $score.textContent = score; sfx.eat();
      placeFood();
      if (speed > 60) { speed -= 3; restartLoop(); }
    } else snake.pop();
    draw();
  }

  function restartLoop() { clearInterval(loop); loop = setInterval(tick, speed); }

  function draw() {
    ctx.fillStyle = '#060b18'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // сетка
    ctx.strokeStyle = 'rgba(57,255,136,0.05)';
    for (let i = 0; i <= N; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
    }
    // еда (яблоко)
    ctx.font = `${CELL * 0.9}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🍎', food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);
    // змейка
    snake.forEach((s, i) => {
      const t = i / snake.length;
      ctx.fillStyle = i === 0 ? '#39ff88' : `rgba(${30 - t * 10}, ${230 - t * 120}, ${110 - t * 40}, ${1 - t * 0.5})`;
      ctx.shadowColor = '#39ff88'; ctx.shadowBlur = i === 0 ? 14 : 0;
      roundRect(s.x * CELL + 1.5, s.y * CELL + 1.5, CELL - 3, CELL - 3, 6);
      ctx.fill(); ctx.shadowBlur = 0;
    });
    // глаза
    const h = snake[0];
    ctx.fillStyle = '#04150b';
    const ex = h.x * CELL + CELL / 2, ey = h.y * CELL + CELL / 2;
    ctx.beginPath(); ctx.arc(ex + dir.x * 4 - dir.y * 4, ey + dir.y * 4 - dir.x * 4, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + dir.x * 4 + dir.y * 4, ey + dir.y * 4 + dir.x * 4, 2.5, 0, 7); ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function gameOver() {
    alive = false; clearInterval(loop); sfx.lose();
    const best = Store.get('snake_best', 0);
    if (score > best) Store.set('snake_best', score);
    draw();
    $overlay.querySelector('.overlay-emoji').textContent = '💀';
    $overlay.querySelector('p').innerHTML =
      `Счёт: <b style="color:#ffd93d">${score}</b>` + (score > best && score > 0 ? ' — <b style="color:#39ff88">НОВЫЙ РЕКОРД!</b>' : '');
    $overlay.querySelector('button').textContent = 'Ещё раз';
    $overlay.classList.remove('hidden');
  }

  function start() {
    sfx.click();
    reset(); draw();
    $overlay.classList.add('hidden');
    clearInterval(loop); loop = setInterval(tick, speed);
  }

  function setDir(dx, dy) {
    if (!alive) return;
    if (dx === -dir.x && dy === -dir.y) return; // нельзя назад
    nextDir = { x: dx, y: dy };
  }

  document.addEventListener('keydown', e => {
    if (GameRunner.current !== 'snake') return;
    const map = {
      ArrowUp: [0,-1], KeyW: [0,-1], ArrowDown: [0,1], KeyS: [0,1],
      ArrowLeft: [-1,0], KeyA: [-1,0], ArrowRight: [1,0], KeyD: [1,0]
    };
    if (map[e.code]) { e.preventDefault(); setDir(...map[e.code]); }
    if (e.code === 'Space' && alive) { e.preventDefault(); paused = !paused; }
  });

  // свайпы
  let tx, ty;
  canvas.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 24 || Math.abs(dy) > 24)
      Math.abs(dx) > Math.abs(dy) ? setDir(dx > 0 ? 1 : -1, 0) : setDir(0, dy > 0 ? 1 : -1);
  });

  document.getElementById('snake-dpad').addEventListener('click', e => {
    const d = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] }[e.target.dataset.dir];
    if (d) setDir(...d);
  });

  document.getElementById('snake-start').addEventListener('click', start);

  return {
    enter() { reset(); draw(); },
    stop() { clearInterval(loop); alive = false; }
  };
})());

/* =====================================================
   🧠 ПАМЯТЬ
===================================================== */
GameRunner.register('memory', (() => {
  const EMOJIS = ['🐍', '🦎', '🐢', '🥚', '🐸', '🦂', '🕷️', '🐲'];
  const board = document.getElementById('memory-board');
  const $moves = document.getElementById('memory-moves');
  const $pairs = document.getElementById('memory-pairs');
  const $overlay = document.getElementById('memory-overlay');
  const $result = document.getElementById('memory-result');
  let first = null, lock = false, moves = 0, found = 0;

  function build() {
    const deck = [...EMOJIS, ...EMOJIS].sort(() => Math.random() - 0.5);
    board.innerHTML = '';
    first = null; lock = false; moves = 0; found = 0;
    $moves.textContent = 0; $pairs.textContent = `0/${EMOJIS.length}`;
    $overlay.classList.add('hidden');
    deck.forEach(em => {
      const btn = document.createElement('button');
      btn.className = 'mem-card';
      btn.innerHTML = `<div class="mem-inner"><div class="mem-face mem-back"></div><div class="mem-face mem-front">${em}</div></div>`;
      btn.dataset.emoji = em;
      btn.addEventListener('click', () => flip(btn));
      board.appendChild(btn);
    });
  }

  function flip(card) {
    if (lock || card.classList.contains('flipped') || card.classList.contains('matched')) return;
    sfx.click();
    card.classList.add('flipped');
    if (!first) { first = card; return; }
    moves++; $moves.textContent = moves;
    if (first.dataset.emoji === card.dataset.emoji) {
      first.classList.add('matched'); card.classList.add('matched');
      first = null; found++; sfx.pop();
      $pairs.textContent = `${found}/${EMOJIS.length}`;
      if (found === EMOJIS.length) win();
    } else {
      lock = true;
      const a = first; first = null;
      setTimeout(() => { a.classList.remove('flipped'); card.classList.remove('flipped'); lock = false; }, 750);
    }
  }

  function win() {
    sfx.win(); confetti();
    const best = Store.get('memory_best', Infinity);
    const isRecord = moves < best;
    if (isRecord) Store.set('memory_best', moves);
    $result.innerHTML = `Победа за <b style="color:#ffd93d">${moves}</b> ходов!` +
      (isRecord ? '<br><b style="color:#39ff88">🏆 Новый рекорд!</b>' : `<br>Лучший результат: ${best}`);
    $overlay.classList.remove('hidden');
  }

  document.getElementById('memory-restart').addEventListener('click', () => { sfx.click(); build(); });

  return { enter: build, stop() {} };
})());

/* =====================================================
   ⚡ РЕАКЦИЯ
===================================================== */
GameRunner.register('reaction', (() => {
  const zone = document.getElementById('reaction-zone');
  const $text = document.getElementById('reaction-text');
  const $time = document.getElementById('reaction-time');
  const $best = document.getElementById('reaction-best');
  let state = 'idle', timer = null, t0 = 0;

  function setState(s) {
    state = s;
    zone.className = 'reaction-zone ' + s;
  }

  function idle(msg) {
    setState('waiting');
    $text.innerHTML = msg || 'Нажми, чтобы начать';
    $time.textContent = '';
  }

  function begin() {
    setState('waiting');
    $text.textContent = 'Жди зелёного… 🐍';
    $time.textContent = '';
    timer = setTimeout(() => {
      setState('ready');
      $text.textContent = 'ЖМИ!!!';
      t0 = performance.now();
      beep(990, 0.1);
    }, 1200 + Math.random() * 2800);
  }

  function finish(ms) {
    setState('result');
    $time.textContent = ms + ' мс';
    const rank = ms < 200 ? '⚡ Скорость света!' : ms < 280 ? '🔥 Огонь!' : ms < 400 ? '👍 Неплохо' : '🐌 Улитка zmeya...';
    $text.textContent = rank;
    const best = Store.get('reaction_best', Infinity);
    if (ms < best) { Store.set('reaction_best', ms); $time.textContent += ' 🏆'; sfx.win(); }
    else sfx.pop();
    $best.textContent = Store.get('reaction_best', ms) + ' мс';
    setTimeout(() => { if (state === 'result') idle('Нажми, чтобы повторить'); }, 2200);
  }

  zone.addEventListener('click', () => {
    clearTimeout(timer);
    if (state === 'idle' || state === 'result' || state === 'waiting') {
      if (state === 'waiting' && $text.textContent.includes('Жди')) {
        setState('angry'); $text.textContent = 'Рано! 😅 Нажми для повтора'; $time.textContent = '';
        sfx.bad(); state = 'idle-wait';
        setTimeout(() => { if (state === 'idle-wait') idle('Нажми, чтобы начать'); }, 1500);
        return;
      }
      begin();
    } else if (state === 'ready') {
      finish(Math.round(performance.now() - t0));
    }
  });

  return {
    enter() { clearTimeout(timer); state = 'idle'; const b = Store.get('reaction_best'); $best.textContent = b ? b + ' мс' : '—'; idle(); },
    stop() { clearTimeout(timer); }
  };
})());

/* =====================================================
   🧱 АРКАНОИД
===================================================== */
GameRunner.register('breakout', (() => {
  const canvas = document.getElementById('breakout-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const $score = document.getElementById('breakout-score');
  const $lives = document.getElementById('breakout-lives');
  const $overlay = document.getElementById('breakout-overlay');

  const ROWS = 6, COLS = 10, BW = W / COLS - 6, BH = 18;
  const COLORS = ['#ff4d6d', '#ff9f43', '#ffd93d', '#39ff88', '#00e5ff', '#a78bfa'];
  let bricks, paddle, ball, score, lives, running = false, raf = null, keys = {};

  function reset(full) {
    if (full) {
      bricks = [];
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          bricks.push({ x: c * (BW + 6) + 3, y: r * (BH + 6) + 40, col: COLORS[r], alive: true });
      score = 0; lives = 3;
    }
    paddle = { w: 90, h: 14, x: W / 2 - 45 };
    ball = { x: W / 2, y: H - 60, r: 8, vx: 4 * (Math.random() > .5 ? 1 : -1), vy: -5 };
    $score.textContent = score; $lives.textContent = lives;
  }

  function launch() {
    sfx.click(); reset(true);
    $overlay.classList.add('hidden');
    running = true;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function endOverlay(title, emoji) {
    running = false;
    $overlay.querySelector('.overlay-emoji').textContent = emoji;
    $overlay.querySelector('p').innerHTML = title;
    $overlay.querySelector('button').textContent = 'Заново';
    $overlay.classList.remove('hidden');
  }

  function loop() {
    if (!running) return;
    // движение платформы с клавиатуры
    if (keys.ArrowLeft) paddle.x -= 9;
    if (keys.ArrowRight) paddle.x += 9;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

    ball.x += ball.vx; ball.y += ball.vy;
    if (ball.x < ball.r || ball.x > W - ball.r) { ball.vx *= -1; sfx.click(); }
    if (ball.y < ball.r) { ball.vy *= -1; }

    // платформа
    if (ball.vy > 0 && ball.y + ball.r > H - 30 && ball.y < H - 14 && ball.x > paddle.x - 6 && ball.x < paddle.x + paddle.w + 6) {
      const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const sp = Math.min(9, Math.hypot(ball.vx, ball.vy) + 0.15);
      const ang = rel * 1.1;
      ball.vx = sp * Math.sin(ang);
      ball.vy = -sp * Math.cos(ang);
      sfx.pop();
    }

    // кирпичи
    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x > b.x - ball.r && ball.x < b.x + BW + ball.r && ball.y > b.y - ball.r && ball.y < b.y + BH + ball.r) {
        b.alive = false;
        ball.vy *= -1;
        score += 5; $score.textContent = score;
        sfx.eat();
        break;
      }
    }

    // упал
    if (ball.y > H + 20) {
      lives--; $lives.textContent = lives;
      sfx.hit();
      if (lives <= 0) {
        const best = Store.get('breakout_best', 0);
        if (score > best) Store.set('breakout_best', score);
        sfx.lose();
        endOverlay(`💥 Игра окончена!<br>Счёт: <b style="color:#ffd93d">${score}</b>`, '🧱');
        return;
      }
      ball.x = W / 2; ball.y = H - 60; ball.vx = 4 * (Math.random() > .5 ? 1 : -1); ball.vy = -5;
    }

    if (bricks.every(b => !b.alive)) {
      const best = Store.get('breakout_best', 0);
      if (score > best) Store.set('breakout_best', score);
      sfx.win(); confetti();
      endOverlay(`🏆 Все кирпичи сломаны!<br>Счёт: <b style="color:#39ff88">${score}</b>`, '🎉');
      return;
    }

    draw();
    raf = requestAnimationFrame(loop);
  }

  function draw() {
    ctx.fillStyle = '#060b18'; ctx.fillRect(0, 0, W, H);
    bricks.forEach(b => {
      if (!b.alive) return;
      ctx.fillStyle = b.col;
      ctx.shadowColor = b.col; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, BW, BH, 4); ctx.fill();
      ctx.shadowBlur = 0;
    });
    // платформа
    const grad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0);
    grad.addColorStop(0, '#00e5ff'); grad.addColorStop(1, '#39ff88');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#39ff88'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.roundRect(paddle.x, H - 28, paddle.w, paddle.h, 7); ctx.fill();
    // мяч
    ctx.fillStyle = '#ffd93d'; ctx.shadowColor = '#ffd93d';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    paddle.x = (e.clientX - rect.left) * (W / rect.width) - paddle.w / 2;
  });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    paddle.x = (e.touches[0].clientX - rect.left) * (W / rect.width) - paddle.w / 2;
  }, { passive: false });

  document.addEventListener('keydown', e => { keys[e.code] = true; });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  document.getElementById('breakout-start').addEventListener('click', launch);

  return {
    enter() { reset(true); draw(); },
    stop() { running = false; cancelAnimationFrame(raf); }
  };
})());

/* =====================================================
   🎯 КЛИКЕР
===================================================== */
GameRunner.register('clicker', (() => {
  const arena = document.getElementById('clicker-arena');
  const $score = document.getElementById('clicker-score');
  const $time = document.getElementById('clicker-time');
  const $overlay = document.getElementById('clicker-overlay');
  let score = 0, timeLeft = 30, spawnTimer = null, countTimer = null, running = false;

  const GOOD = ['🐍', '🐛', '🪱', '🦎'];
  const BAD = '😈';

  function spawn() {
    if (!running) return;
    const el = document.createElement('div');
    el.className = 'target';
    const isBad = Math.random() < 0.22;
    el.textContent = isBad ? BAD : GOOD[Math.floor(Math.random() * GOOD.length)];
    if (isBad) el.style.filter = 'hue-rotate(90deg) saturate(3) drop-shadow(0 0 8px red)';
    el.style.left = 8 + Math.random() * 84 + '%';
    el.style.top = 10 + Math.random() * 80 + '%';
    el.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (!running) return;
      const pts = isBad ? -3 : (el.textContent === '🐍' ? 3 : 1);
      score = Math.max(0, score + pts);
      $score.textContent = score;
      isBad ? sfx.bad() : sfx.pop();
      floatScore(e, pts);
      el.remove();
    });
    arena.appendChild(el);
    setTimeout(() => el.remove(), isBad ? 1600 : 1100 + Math.random() * 700);
  }

  function floatScore(e, pts) {
    const f = document.createElement('div');
    f.className = 'float-score';
    f.textContent = (pts > 0 ? '+' : '') + pts;
    f.style.color = pts > 0 ? '#39ff88' : '#ff4d6d';
    const r = arena.getBoundingClientRect();
    f.style.left = (e.clientX - r.left) + 'px';
    f.style.top = (e.clientY - r.top) + 'px';
    arena.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  function start() {
    sfx.click();
    arena.innerHTML = '';
    score = 0; timeLeft = 30;
    $score.textContent = 0; $time.textContent = 30;
    $overlay.classList.add('hidden');
    running = true;
    spawnTimer = setInterval(spawn, 420);
    countTimer = setInterval(() => {
      timeLeft--; $time.textContent = timeLeft;
      if (timeLeft <= 5 && timeLeft > 0) beep(600, 0.05, 'triangle', 0.08);
      if (timeLeft <= 0) end();
    }, 1000);
  }

  function end() {
    running = false;
    clearInterval(spawnTimer); clearInterval(countTimer);
    arena.innerHTML = '';
    const best = Store.get('clicker_best', 0);
    const rec = score > best;
    if (rec) Store.set('clicker_best', score);
    rec ? sfx.win() : sfx.lose();
    if (rec) confetti();
    $overlay.querySelector('.overlay-emoji').textContent = rec ? '🏆' : '⏱️';
    $overlay.querySelector('p').innerHTML =
      `Время вышло! Счёт: <b style="color:#ffd93d">${score}</b>` +
      (rec ? ' — <b style="color:#39ff88">новый рекорд!</b>' : `<br>Рекорд: ${Math.max(best, score)}`);
    $overlay.querySelector('button').textContent = 'Ещё раз';
    $overlay.classList.remove('hidden');
  }

  document.getElementById('clicker-start').addEventListener('click', start);

  return {
    enter() {},
    stop() { running = false; clearInterval(spawnTimer); clearInterval(countTimer); }
  };
})());

/* =====================================================
   ✂️ КАМЕНЬ-НОЖНИЦЫ-БУМАГА
===================================================== */
GameRunner.register('rps', (() => {
  const CHOICES = { rock: '🪨', scissors: '✂️', paper: '📄' };
  const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const $you = document.getElementById('rps-you');
  const $cpu = document.getElementById('rps-cpu');
  const $msg = document.getElementById('rps-message');
  const $p = document.getElementById('rps-player');
  const $c = document.querySelector('#game-rps .game-stats b:last-of-type'); // счётчик "Комп"
  const $series = document.getElementById('rps-series');
  let player = 0, cpu = 0, busy = false;

  function play(choice) {
    if (busy) return;
    busy = true; sfx.click();
    $msg.textContent = 'Раз, два, три…';
    $you.classList.add('shake-l'); $cpu.classList.add('shake-r');
    $you.textContent = '🫴'; $cpu.textContent = '✊';
    setTimeout(() => {
      $you.classList.remove('shake-l'); $cpu.classList.remove('shake-r');
      const cpuChoice = Object.keys(CHOICES)[Math.floor(Math.random() * 3)];
      $you.textContent = CHOICES[choice];
      $cpu.textContent = CHOICES[cpuChoice];
      let result;
      if (choice === cpuChoice) { result = 'draw'; $msg.textContent = '🤝 Ничья!'; sfx.pop(); }
      else if (BEATS[choice] === cpuChoice) { result = 'win'; player++; $msg.textContent = '😎 Ты победил!'; sfx.win(); }
      else { result = 'lose'; cpu++; $msg.textContent = '🤖 Компьютер хитрее…'; sfx.lose(); }
      $p.textContent = player; $c.textContent = cpu;
      const dot = document.createElement('span');
      dot.className = 'dot ' + result;
      dot.textContent = result === 'win' ? '✔' : result === 'lose' ? '✘' : '–';
      $series.appendChild(dot);
      if ($series.children.length > 15) $series.firstChild.remove();
      // серия до 5
      if (player === 5 || cpu === 5) {
        const won = player === 5;
        $msg.innerHTML = won ? '🏆 МАТЧ ТВОЙ! Счёт 5:' + cpu : '💻 Матч за компьютером ' + cpu + ':5';
        if (won) { confetti(); sfx.win(); }
        const best = Store.get('rps_winstreak', 0);
        const myBest = Store.get('rps_matches', 0) + (won ? 1 : 0);
        Store.set('rps_matches', myBest);
        setTimeout(() => { player = 0; cpu = 0; $p.textContent = 0; $c.textContent = 0; $series.innerHTML = ''; }, 2500);
      }
      busy = false;
    }, 600);
  }

  document.querySelectorAll('.rps-btn').forEach(b => b.addEventListener('click', () => play(b.dataset.choice)));

  return {
    enter() { player = 0; cpu = 0; $p.textContent = 0; $c.textContent = 0; $series.innerHTML = ''; $msg.textContent = 'Выбери своё оружие (до 5 побед):'; $you.textContent = '🫴'; $cpu.textContent = '🤜'; },
    stop() {}
  };
})());

/* =====================================================
   🌌 ФОН: летающие змейки из пикселей
===================================================== */
(() => {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let snakes = [], stars = [];

  function resize() {
    canvas.width = innerWidth; canvas.height = innerHeight;
    stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.6, tw: Math.random() * Math.PI * 2
    }));
  }
  resize(); addEventListener('resize', resize);

  class PixelSnake {
    constructor() { this.reset(true); }
    reset(init) {
      this.len = 8 + Math.floor(Math.random() * 10);
      this.cell = 8 + Math.random() * 8;
      this.x = init ? Math.random() * canvas.width : -this.len * this.cell;
      this.y = Math.random() * canvas.height;
      this.speed = 0.6 + Math.random() * 1.4;
      this.turn = Math.random() * Math.PI * 2;
      this.turnSpeed = (Math.random() - 0.5) * 0.05;
      this.trail = [];
      const palette = ['57,255,136', '0,229,255', '255,77,157', '255,217,61'];
      this.color = palette[Math.floor(Math.random() * palette.length)];
    }
    step() {
      this.turn += this.turnSpeed + (Math.random() - 0.5) * 0.15;
      this.x += Math.cos(this.turn) * this.speed;
      this.y += Math.sin(this.turn) * this.speed;
      this.trail.unshift({ x: this.x, y: this.y });
      if (this.trail.length > this.len) this.trail.pop();
      const m = 100;
      if (this.x < -m || this.x > canvas.width + m || this.y < -m || this.y > canvas.height + m) this.reset(false);
    }
    draw(ctx) {
      this.trail.forEach((p, i) => {
        const a = 1 - i / this.len;
        ctx.fillStyle = `rgba(${this.color},${a * 0.35})`;
        ctx.fillRect(p.x - this.cell / 2, p.y - this.cell / 2, this.cell - 2, this.cell - 2);
      });
    }
  }

  for (let i = 0; i < 7; i++) snakes.push(new PixelSnake());

  (function bgLoop(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // мерцающие звёзды
    stars.forEach(s => {
      const a = 0.3 + 0.7 * Math.abs(Math.sin(t / 1500 + s.tw));
      ctx.fillStyle = `rgba(200,220,255,${a * 0.5})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    });
    snakes.forEach(sn => { sn.step(); sn.draw(ctx); });
    requestAnimationFrame(bgLoop);
  })(0);
})();

/* =====================================================
   📋 ОБНОВЛЕНИЕ МЕНЮ
===================================================== */
function fmt(v, suffix = '') { return v === null || v === undefined || v === Infinity ? '—' : v + suffix; }

function refreshMenuRecords() {
  const sb = Store.get('snake_best');
  const mb = Store.get('memory_best');
  const rb = Store.get('reaction_best');
  const bb = Store.get('breakout_best');
  const cb = Store.get('clicker_best');
  const rp = Store.get('rps_matches');
  document.getElementById('rec-snake').textContent = 'рекорд: ' + fmt(sb);
  document.getElementById('rec-memory').textContent = 'рекорд: ' + (mb ? mb + ' ходов' : '—');
  document.getElementById('rec-reaction').textContent = 'рекорд: ' + fmt(rb, ' мс');
  document.getElementById('rec-breakout').textContent = 'рекорд: ' + fmt(bb);
  document.getElementById('rec-clicker').textContent = 'рекорд: ' + fmt(cb);
  document.getElementById('rec-rps').textContent = 'матчей выиграно: ' + fmt(rp, '');
  const total = [sb || 0, bb || 0, cb || 0].reduce((a, b) => a + b, 0);
  document.getElementById('total-highscore').textContent = total;
}
refreshMenuRecords();

document.getElementById('reset-scores').addEventListener('click', () => {
  if (confirm('Сбросить все рекорды? 🐍')) {
    Store.clearAll(); refreshMenuRecords(); sfx.bad();
  }
});

/* Приветствие */
console.log('%c🐍 ZMEYA ARCADE loaded!', 'color:#39ff88;font-size:20px;font-weight:bold;');
