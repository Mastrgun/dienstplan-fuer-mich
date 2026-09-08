const GAMES_HS_KEY = "mein-dienst-games-hs";

function gamesLoadHs() {
  try {
    return JSON.parse(localStorage.getItem(GAMES_HS_KEY) || "{}");
  } catch {
    return {};
  }
}

function gamesSaveHs(id, score) {
  if (score == null || Number.isNaN(score)) return;
  const all = gamesLoadHs();
  if (all[id] == null || score > all[id]) {
    all[id] = score;
    try {
      localStorage.setItem(GAMES_HS_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }
}

function gamesBeep(freq, seconds) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!gamesBeep.ctx) gamesBeep.ctx = new Ctx();
    const ctx = gamesBeep.ctx;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  } catch {
    /* no audio */
  }
}

function gamesShell(root) {
  const wrap = document.createElement("div");
  wrap.className = "game-play";
  const status = document.createElement("p");
  status.className = "game-status";
  const stage = document.createElement("div");
  stage.className = "game-stage";
  const controls = document.createElement("div");
  controls.className = "game-controls";
  wrap.append(status, stage, controls);
  root.appendChild(wrap);
  return {
    wrap,
    status,
    stage,
    controls,
    setStatus(text) {
      status.textContent = text;
    },
  };
}

function gamesBtn(label, onClick, extraClass) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = extraClass ? "game-btn " + extraClass : "game-btn";
  btn.textContent = label;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  return btn;
}

function gamesPad(parent, map) {
  const box = document.createElement("div");
  box.className = "game-pad";
  const order = [
    ["", "up", ""],
    ["left", "action", "right"],
    ["", "down", ""],
  ];
  const labels = { up: "▲", down: "▼", left: "◀", right: "▶", action: "●" };
  order.forEach((row) => {
    row.forEach((key) => {
      if (!key || !map[key]) {
        const spacer = document.createElement("span");
        spacer.className = key ? "game-pad-empty" : "game-pad-empty";
        box.appendChild(spacer);
        return;
      }
      box.appendChild(gamesBtn(labels[key] || key, map[key], "game-pad-btn"));
    });
  });
  parent.appendChild(box);
  return box;
}

function gamesCanvas(stage, cssW, cssH) {
  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stage.appendChild(canvas);
  return { canvas, ctx, w: cssW, h: cssH };
}

function gamesLoop(tick) {
  let alive = true;
  let last = performance.now();
  let raf = 0;
  function frame(now) {
    if (!alive) return;
    tick(Math.min(0.05, (now - last) / 1000), now);
    last = now;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}

function gamesSwipe(el, onDir) {
  let x0 = 0;
  let y0 = 0;
  const start = (event) => {
    const t = event.touches ? event.touches[0] : event;
    x0 = t.clientX;
    y0 = t.clientY;
  };
  const end = (event) => {
    const t = event.changedTouches ? event.changedTouches[0] : event;
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) onDir(dx > 0 ? "right" : "left");
    else onDir(dy > 0 ? "down" : "up");
  };
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", end, { passive: true });
  return () => {
    el.removeEventListener("touchstart", start);
    el.removeEventListener("touchend", end);
  };
}

function gamesShuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function gamesPick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function playSnake(root, id) {
  const ui = gamesShell(root);
  const cols = 16;
  const rows = 22;
  const size = Math.max(10, Math.floor(Math.min(Math.max(root.clientWidth || 340, 280), 360) / cols));
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, cols * size, rows * size);
  let dir = { x: 1, y: 0 };
  let next = { x: 1, y: 0 };
  let snake = [
    { x: 3, y: 10 },
    { x: 2, y: 10 },
    { x: 1, y: 10 },
  ];
  let apple = { x: 8, y: 10 };
  let score = 0;
  let dead = false;
  let started = false;
  let lastStep = 0;
  function placeApple() {
    for (let n = 0; n < 200; n++) {
      const cell = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
      if (!snake.some((p) => p.x === cell.x && p.y === cell.y)) {
        apple = cell;
        return;
      }
    }
  }
  function turn(which) {
    const map = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
    const d = map[which];
    if (!d || (d.x === -dir.x && d.y === -dir.y)) return;
    next = d;
    started = true;
  }
  function draw() {
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e07a6a";
    ctx.fillRect(apple.x * size + 2, apple.y * size + 2, size - 4, size - 4);
    snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? "#f0a35e" : "#6ec8b8";
      ctx.fillRect(p.x * size + 1, p.y * size + 1, size - 2, size - 2);
    });
  }
  ui.setStatus("Schlange · Richtung tippen");
  gamesPad(ui.controls, {
    left: () => turn("left"),
    right: () => turn("right"),
    up: () => turn("up"),
    down: () => turn("down"),
  });
  const stopSwipe = gamesSwipe(canvas, turn);
  const stop = gamesLoop((dt, now) => {
    if (!started || dead) {
      draw();
      return;
    }
    if (now - lastStep < 240) {
      draw();
      return;
    }
    lastStep = now;
    dir = next;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some((p) => p.x === head.x && p.y === head.y)) {
      dead = true;
      gamesSaveHs(id, score);
      ui.setStatus("Aus! " + score + " Punkte");
      gamesBeep(120, 0.25);
      draw();
      return;
    }
    snake.unshift(head);
    if (head.x === apple.x && head.y === apple.y) {
      score += 10;
      gamesBeep(660, 0.06);
      placeApple();
      ui.setStatus("Schlange · " + score);
    } else snake.pop();
    draw();
  });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  return () => {
    stop();
    stopSwipe();
  };
}

function playTetris(root, id) {
  const ui = gamesShell(root);
  const cols = 10;
  const rows = 18;
  const size = Math.floor(Math.min(root.clientWidth - 8 || 340, 320) / cols);
  const { ctx, w, h } = gamesCanvas(ui.stage, cols * size, rows * size);
  const shapes = {
    I: [[[1, 1, 1, 1]], [[1], [1], [1], [1]]],
    O: [[[1, 1], [1, 1]]],
    T: [
      [[0, 1, 0], [1, 1, 1]],
      [[1, 0], [1, 1], [1, 0]],
      [[1, 1, 1], [0, 1, 0]],
      [[0, 1], [1, 1], [0, 1]],
    ],
    S: [
      [[0, 1, 1], [1, 1, 0]],
      [[1, 0], [1, 1], [0, 1]],
    ],
    Z: [
      [[1, 1, 0], [0, 1, 1]],
      [[0, 1], [1, 1], [1, 0]],
    ],
    J: [
      [[1, 0, 0], [1, 1, 1]],
      [[1, 1], [1, 0], [1, 0]],
      [[1, 1, 1], [0, 0, 1]],
      [[0, 1], [0, 1], [1, 1]],
    ],
    L: [
      [[0, 0, 1], [1, 1, 1]],
      [[1, 0], [1, 0], [1, 1]],
      [[1, 1, 1], [1, 0, 0]],
      [[1, 1], [0, 1], [0, 1]],
    ],
  };
  const colors = { I: "#7aa2ff", O: "#f0a35e", T: "#b5a4f0", S: "#6ec8b8", Z: "#e07a6a", J: "#8fce8a", L: "#d4a017" };
  const keys = Object.keys(shapes);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(""));
  let piece = null;
  let score = 0;
  let dead = false;
  let acc = 0;
  function spawn() {
    const kind = gamesPick(keys);
    piece = { kind, rot: 0, x: 3, y: 0 };
    if (hits(piece)) dead = true;
  }
  function cells(p) {
    const form = shapes[p.kind][p.rot % shapes[p.kind].length];
    const out = [];
    form.forEach((row, y) =>
      row.forEach((v, x) => {
        if (v) out.push({ x: p.x + x, y: p.y + y });
      })
    );
    return out;
  }
  function hits(p) {
    return cells(p).some((c) => c.x < 0 || c.x >= cols || c.y >= rows || (c.y >= 0 && grid[c.y][c.x]));
  }
  function lock() {
    cells(piece).forEach((c) => {
      if (c.y >= 0) grid[c.y][c.x] = piece.kind;
    });
    let cleared = 0;
    for (let y = rows - 1; y >= 0; y--) {
      if (grid[y].every(Boolean)) {
        grid.splice(y, 1);
        grid.unshift(Array(cols).fill(""));
        cleared += 1;
        y += 1;
      }
    }
    if (cleared) {
      score += [0, 40, 100, 300, 1200][cleared];
      gamesBeep(520, 0.08);
    }
    spawn();
  }
  function move(dx, dy) {
    if (dead) return;
    const next = { ...piece, x: piece.x + dx, y: piece.y + dy };
    if (!hits(next)) piece = next;
    else if (dy === 1) lock();
  }
  function rotate() {
    const next = { ...piece, rot: piece.rot + 1 };
    if (!hits(next)) piece = next;
  }
  function draw() {
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, w, h);
    grid.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (!cell) return;
        ctx.fillStyle = colors[cell];
        ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      })
    );
    if (piece && !dead) {
      ctx.fillStyle = colors[piece.kind];
      cells(piece).forEach((c) => {
        if (c.y < 0) return;
        ctx.fillRect(c.x * size + 1, c.y * size + 1, size - 2, size - 2);
      });
    }
  }
  spawn();
  ui.setStatus("Tetris · " + score);
  gamesPad(ui.controls, {
    left: () => move(-1, 0),
    right: () => move(1, 0),
    down: () => move(0, 1),
    up: rotate,
    action: rotate,
  });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (!dead) {
      acc += dt;
      if (acc > 0.55) {
        acc = 0;
        move(0, 1);
      }
      if (dead) {
        gamesSaveHs(id, score);
        ui.setStatus("Stapel voll · " + score);
        gamesBeep(110, 0.3);
      } else ui.setStatus("Tetris · " + score);
    }
    draw();
  });
  return stop;
}

function playImpact(root, id) {
  const ui = gamesShell(root);
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, 340, 420);
  let x = w / 2;
  let bullets = [];
  let foes = [];
  let score = 0;
  let dead = false;
  let spawnT = 0;
  ui.setStatus("Space Impact · 0");
  function fire() {
    if (dead) return;
    bullets.push({ x, y: h - 48 });
    gamesBeep(880, 0.04);
  }
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    x = ((event.clientX - rect.left) / rect.width) * w;
    fire();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!event.buttons && event.pointerType === "mouse") return;
    const rect = canvas.getBoundingClientRect();
    x = ((event.clientX - rect.left) / rect.width) * w;
  });
  ui.controls.appendChild(gamesBtn("Feuer", fire, "game-btn-wide"));
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (!dead) {
      spawnT += dt;
      if (spawnT > 0.7) {
        spawnT = 0;
        foes.push({ x: 20 + Math.random() * (w - 40), y: -16, s: 40 + Math.random() * 50 });
      }
      bullets.forEach((b) => (b.y -= 320 * dt));
      bullets = bullets.filter((b) => b.y > -10);
      foes.forEach((f) => (f.y += f.s * dt));
      bullets.forEach((b) => {
        foes.forEach((f) => {
          if (Math.abs(b.x - f.x) < 16 && Math.abs(b.y - f.y) < 16) {
            f.hit = true;
            b.y = -99;
            score += 10;
            gamesBeep(440, 0.05);
          }
        });
      });
      foes = foes.filter((f) => !f.hit && f.y < h + 20);
      if (foes.some((f) => Math.abs(f.x - x) < 18 && Math.abs(f.y - (h - 28)) < 18)) {
        dead = true;
        gamesSaveHs(id, score);
        ui.setStatus("Getroffen · " + score);
        gamesBeep(100, 0.3);
      } else ui.setStatus("Space Impact · " + score);
    }
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f3efe6";
    for (let i = 0; i < 18; i++) ctx.fillRect((i * 47) % w, (i * 83) % h, 2, 2);
    ctx.fillStyle = "#6ec8b8";
    ctx.beginPath();
    ctx.moveTo(x, h - 40);
    ctx.lineTo(x - 12, h - 16);
    ctx.lineTo(x + 12, h - 16);
    ctx.fill();
    ctx.fillStyle = "#f0a35e";
    bullets.forEach((b) => ctx.fillRect(b.x - 2, b.y, 4, 10));
    ctx.fillStyle = "#e07a6a";
    foes.forEach((f) => {
      ctx.fillRect(f.x - 10, f.y - 8, 20, 16);
    });
  });
  return stop;
}

function playBreakout(root, id) {
  const ui = gamesShell(root);
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, 340, 420);
  const cols = 8;
  const rows = 5;
  const bw = w / cols;
  let bricks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) bricks.push({ x: c * bw + 2, y: 24 + r * 22, live: true, tint: r });
  }
  let px = w / 2;
  const pw = 64;
  let ball = { x: w / 2, y: h - 80, vx: 120, vy: -180 };
  let score = 0;
  let dead = false;
  ui.setStatus("Breakout · 0");
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    px = ((event.clientX - rect.left) / rect.width) * w;
  });
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    px = ((event.clientX - rect.left) / rect.width) * w;
  });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const tints = ["#e07a6a", "#f0a35e", "#6ec8b8", "#7aa2ff", "#b5a4f0"];
  const stop = gamesLoop((dt) => {
    if (!dead) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < 6 || ball.x > w - 6) ball.vx *= -1;
      if (ball.y < 6) ball.vy *= -1;
      if (ball.y > h - 28 && Math.abs(ball.x - px) < pw / 2 + 6) {
        ball.vy = -Math.abs(ball.vy);
        ball.vx = (ball.x - px) * 6;
      }
      bricks.forEach((b) => {
        if (!b.live) return;
        if (ball.x > b.x && ball.x < b.x + bw - 4 && ball.y > b.y && ball.y < b.y + 18) {
          b.live = false;
          ball.vy *= -1;
          score += 10;
          gamesBeep(600, 0.04);
        }
      });
      if (ball.y > h) {
        dead = true;
        gamesSaveHs(id, score);
        ui.setStatus("Ball weg · " + score);
      } else if (bricks.every((b) => !b.live)) {
        dead = true;
        gamesSaveHs(id, score + 100);
        ui.setStatus("Feld leer · " + (score + 100));
      } else ui.setStatus("Breakout · " + score);
    }
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, w, h);
    bricks.forEach((b) => {
      if (!b.live) return;
      ctx.fillStyle = tints[b.tint];
      ctx.fillRect(b.x, b.y, bw - 4, 16);
    });
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(px - pw / 2, h - 22, pw, 10);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  return stop;
}

function playBounce(root, id) {
  const ui = gamesShell(root);
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, 340, 420);
  let ball = { x: w / 2, y: h - 80, vy: -280 };
  let plats = [{ x: 40, y: h - 40, w: 80 }];
  let cam = 0;
  let score = 0;
  let dead = false;
  for (let i = 1; i < 10; i++) plats.push({ x: 20 + Math.random() * (w - 90), y: h - 40 - i * 70, w: 70 });
  ui.setStatus("Bounce · tippen");
  canvas.addEventListener("pointerdown", () => {
    if (!dead) ball.vy = -320;
  });
  ui.controls.appendChild(gamesBtn("Hüpfen", () => (ball.vy = -320)));
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (!dead) {
      ball.vy += 520 * dt;
      ball.y += ball.vy * dt;
      if (ball.y < h * 0.35) {
        const dy = h * 0.35 - ball.y;
        ball.y += dy;
        cam += dy;
        plats.forEach((p) => (p.y += dy));
        score = Math.max(score, Math.floor(cam / 10));
      }
      plats.forEach((p) => {
        if (ball.vy > 0 && ball.x > p.x && ball.x < p.x + p.w && ball.y > p.y - 8 && ball.y < p.y + 12) {
          ball.vy = -300;
          gamesBeep(500, 0.04);
        }
      });
      plats = plats.filter((p) => p.y < h + 20);
      while (plats.length < 9) {
        const top = Math.min(...plats.map((p) => p.y));
        plats.push({ x: 16 + Math.random() * (w - 90), y: top - 70, w: 64 + Math.random() * 24 });
      }
      if (ball.y > h) {
        dead = true;
        gamesSaveHs(id, score);
        ui.setStatus("Runtergefallen · " + score);
      } else ui.setStatus("Bounce · " + score);
    }
    ctx.fillStyle = "#10231f";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#6ec8b8";
    plats.forEach((p) => ctx.fillRect(p.x, p.y, p.w, 10));
    ctx.fillStyle = "#f0a35e";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2);
    ctx.fill();
  });
  return stop;
}

function playRace(root, id) {
  const ui = gamesShell(root);
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, 320, 420);
  const lanes = [w * 0.25, w * 0.5, w * 0.75];
  let lane = 1;
  let cars = [];
  let score = 0;
  let dead = false;
  let spawn = 0;
  ui.setStatus("Rennen · Spur wechseln");
  function go(d) {
    lane = Math.max(0, Math.min(2, lane + d));
  }
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    go(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
  });
  gamesPad(ui.controls, { left: () => go(-1), right: () => go(1) });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (!dead) {
      spawn += dt;
      if (spawn > 0.85) {
        spawn = 0;
        cars.push({ lane: Math.floor(Math.random() * 3), y: -40 });
      }
      cars.forEach((c) => (c.y += 180 * dt));
      cars = cars.filter((c) => c.y < h + 40);
      score += dt * 10;
      if (cars.some((c) => c.lane === lane && c.y > h - 90 && c.y < h - 20)) {
        dead = true;
        gamesSaveHs(id, Math.floor(score));
        ui.setStatus("Crash · " + Math.floor(score));
        gamesBeep(90, 0.3);
      } else ui.setStatus("Rennen · " + Math.floor(score));
    }
    ctx.fillStyle = "#1a1c16";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a3d32";
    ctx.fillRect(w * 0.12, 0, w * 0.76, h);
    ctx.strokeStyle = "#f3efe6";
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#e07a6a";
    cars.forEach((c) => ctx.fillRect(lanes[c.lane] - 16, c.y, 32, 48));
    ctx.fillStyle = "#7aa2ff";
    ctx.fillRect(lanes[lane] - 16, h - 72, 32, 48);
  });
  return stop;
}

function playFlappy(root, id) {
  const ui = gamesShell(root);
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, 320, 420);
  let y = h / 2;
  let vy = 0;
  let pipes = [{ x: 280, gap: 160 }];
  let score = 0;
  let dead = false;
  ui.setStatus("Flappy · tippen");
  function flap() {
    if (!dead) vy = -240;
  }
  canvas.addEventListener("pointerdown", flap);
  ui.controls.appendChild(gamesBtn("Flattern", flap));
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (!dead) {
      vy += 620 * dt;
      y += vy * dt;
      pipes.forEach((p) => (p.x -= 110 * dt));
      if (pipes[0].x < -40) {
        pipes.shift();
        pipes.push({ x: w + 20, gap: 80 + Math.random() * 180 });
        score += 1;
        gamesBeep(700, 0.05);
      }
      const p = pipes[0];
      const hit = y < 12 || y > h - 12 || (p.x < 64 && p.x > 20 && (y < p.gap || y > p.gap + 90));
      if (hit) {
        dead = true;
        gamesSaveHs(id, score);
        ui.setStatus("Peng · " + score);
      } else ui.setStatus("Flappy · " + score);
    }
    ctx.fillStyle = "#152018";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#6ec8b8";
    pipes.forEach((p) => {
      ctx.fillRect(p.x, 0, 36, p.gap);
      ctx.fillRect(p.x, p.gap + 90, 36, h);
    });
    ctx.fillStyle = "#f0a35e";
    ctx.beginPath();
    ctx.arc(48, y, 12, 0, Math.PI * 2);
    ctx.fill();
  });
  return stop;
}

function playAsteroids(root, id) {
  const ui = gamesShell(root);
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, 340, 400);
  let ship = { x: w / 2, y: h / 2, a: 0, vx: 0, vy: 0 };
  let rocks = [];
  let shots = [];
  let score = 0;
  let dead = false;
  function addRock(x, y, r) {
    rocks.push({ x, y, r, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80 });
  }
  for (let i = 0; i < 5; i++) addRock(Math.random() * w, Math.random() * h, 22);
  function wrap(p) {
    if (p.x < 0) p.x += w;
    if (p.y < 0) p.y += h;
    if (p.x > w) p.x -= w;
    if (p.y > h) p.y -= h;
  }
  gamesPad(ui.controls, {
    left: () => (ship.a -= 0.35),
    right: () => (ship.a += 0.35),
    up: () => {
      ship.vx += Math.cos(ship.a) * 40;
      ship.vy += Math.sin(ship.a) * 40;
    },
    action: () => {
      shots.push({ x: ship.x, y: ship.y, a: ship.a, t: 1 });
      gamesBeep(900, 0.04);
    },
  });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (!dead) {
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      wrap(ship);
      rocks.forEach((r) => {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        wrap(r);
      });
      shots.forEach((s) => {
        s.x += Math.cos(s.a) * 280 * dt;
        s.y += Math.sin(s.a) * 280 * dt;
        s.t -= dt;
        wrap(s);
      });
      shots = shots.filter((s) => s.t > 0);
      shots.forEach((s) => {
        rocks.forEach((r) => {
          if (Math.hypot(s.x - r.x, s.y - r.y) < r.r) {
            r.hit = true;
            s.t = 0;
            score += 10;
            if (r.r > 12) {
              addRock(r.x, r.y, r.r / 2);
              addRock(r.x, r.y, r.r / 2);
            }
          }
        });
      });
      rocks = rocks.filter((r) => !r.hit);
      if (!rocks.length) {
        for (let i = 0; i < 5; i++) addRock(Math.random() * w, Math.random() * h, 22);
      }
      if (rocks.some((r) => Math.hypot(r.x - ship.x, r.y - ship.y) < r.r)) {
        dead = true;
        gamesSaveHs(id, score);
        ui.setStatus("Trümmer · " + score);
      } else ui.setStatus("Asteroids · " + score);
    }
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#f3efe6";
    ctx.beginPath();
    ctx.moveTo(ship.x + Math.cos(ship.a) * 12, ship.y + Math.sin(ship.a) * 12);
    ctx.lineTo(ship.x + Math.cos(ship.a + 2.4) * 10, ship.y + Math.sin(ship.a + 2.4) * 10);
    ctx.lineTo(ship.x + Math.cos(ship.a - 2.4) * 10, ship.y + Math.sin(ship.a - 2.4) * 10);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "#f0a35e";
    shots.forEach((s) => ctx.fillRect(s.x - 1, s.y - 1, 3, 3));
    ctx.strokeStyle = "#9a958c";
    rocks.forEach((r) => {
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    });
  });
  return stop;
}

function playPac(root, id) {
  const ui = gamesShell(root);
  const map = [
    "###########",
    "#.........#",
    "#.##.#.##.#",
    "#.#.....#.#",
    "#.#.##.#.#",
    "#.........#",
    "#.##.#.##.#",
    "#.........#",
    "###########",
  ];
  const rows = map.length;
  const cols = map[0].length;
  const size = Math.floor(Math.min(root.clientWidth - 8 || 330, 330) / cols);
  const { ctx, w, h } = gamesCanvas(ui.stage, cols * size, rows * size);
  let px = 1;
  let py = 1;
  let gx = cols - 2;
  let gy = rows - 2;
  let dir = { x: 1, y: 0 };
  let dots = {};
  let score = 0;
  let dead = false;
  let acc = 0;
  map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ".") dots[x + "," + y] = true;
    });
  });
  function blocked(x, y) {
    return !map[y] || map[y][x] === "#";
  }
  function turn(which) {
    const m = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
    if (m[which]) dir = m[which];
  }
  gamesPad(ui.controls, {
    left: () => turn("left"),
    right: () => turn("right"),
    up: () => turn("up"),
    down: () => turn("down"),
  });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (!dead) {
      acc += dt;
      if (acc > 0.16) {
        acc = 0;
        const nx = px + dir.x;
        const ny = py + dir.y;
        if (!blocked(nx, ny)) {
          px = nx;
          py = ny;
        }
        const key = px + "," + py;
        if (dots[key]) {
          delete dots[key];
          score += 10;
          gamesBeep(640, 0.03);
        }
        const opts = [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ].filter((d) => !blocked(gx + d.x, gy + d.y));
        opts.sort((a, b) => Math.hypot(gx + a.x - px, gy + a.y - py) - Math.hypot(gx + b.x - px, gy + b.y - py));
        const g = Math.random() < 0.7 ? opts[0] : gamesPick(opts);
        gx += g.x;
        gy += g.y;
        if (gx === px && gy === py) {
          dead = true;
          gamesSaveHs(id, score);
          ui.setStatus("Geist · " + score);
        } else if (!Object.keys(dots).length) {
          dead = true;
          gamesSaveHs(id, score + 50);
          ui.setStatus("Feld leer · " + (score + 50));
        } else ui.setStatus("Pac-Punkte · " + score);
      }
    }
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (map[y][x] === "#") {
          ctx.fillStyle = "#7aa2ff";
          ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
        } else if (dots[x + "," + y]) {
          ctx.fillStyle = "#f3efe6";
          ctx.beginPath();
          ctx.arc(x * size + size / 2, y * size + size / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.fillStyle = "#f0a35e";
    ctx.beginPath();
    ctx.arc(px * size + size / 2, py * size + size / 2, size / 2 - 3, 0.3, Math.PI * 2 - 0.3);
    ctx.lineTo(px * size + size / 2, py * size + size / 2);
    ctx.fill();
    ctx.fillStyle = "#e07a6a";
    ctx.beginPath();
    ctx.arc(gx * size + size / 2, gy * size + size / 2, size / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
  });
  return stop;
}

function play2048(root, id) {
  const ui = gamesShell(root);
  const n = 4;
  let grid = Array.from({ length: n }, () => Array(n).fill(0));
  function empties() {
    const e = [];
    grid.forEach((row, y) =>
      row.forEach((v, x) => {
        if (!v) e.push({ x, y });
      })
    );
    return e;
  }
  function spawn() {
    const e = empties();
    if (!e.length) return;
    const p = gamesPick(e);
    grid[p.y][p.x] = Math.random() < 0.9 ? 2 : 4;
  }
  function slide(row) {
    const vals = row.filter(Boolean);
    const out = [];
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === vals[i + 1]) {
        out.push(vals[i] * 2);
        i += 1;
      } else out.push(vals[i]);
    }
    while (out.length < n) out.push(0);
    return out;
  }
  function rotate() {
    const next = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) next[x][n - 1 - y] = grid[y][x];
    grid = next;
  }
  function move(dir) {
    const times = { left: 0, up: 3, right: 2, down: 1 }[dir];
    for (let i = 0; i < times; i++) rotate();
    let changed = false;
    grid = grid.map((row) => {
      const next = slide(row);
      if (next.some((v, i) => v !== row[i])) changed = true;
      return next;
    });
    for (let i = 0; i < (4 - times) % 4; i++) rotate();
    if (changed) spawn();
    render();
  }
  spawn();
  spawn();
  const board = document.createElement("div");
  board.className = "g2048";
  ui.stage.appendChild(board);
  gamesSwipe(board, move);
  function maxTile() {
    return Math.max(...grid.flat());
  }
  function render() {
    const lost = !empties().length;
    ui.setStatus("2048 · höchste " + maxTile());
    board.innerHTML = "";
    grid.flat().forEach((v) => {
      const cell = document.createElement("div");
      cell.className = "g2048-cell" + (v ? " v" + Math.min(v, 2048) : "");
      cell.textContent = v || "";
      board.appendChild(cell);
    });
    if (maxTile() >= 2048) {
      gamesSaveHs(id, maxTile());
      ui.setStatus("2048 geschafft!");
    } else if (lost) {
      gamesSaveHs(id, maxTile());
      ui.setStatus("Voll · höchste " + maxTile());
    }
  }
  gamesPad(ui.controls, {
    left: () => move("left"),
    right: () => move("right"),
    up: () => move("up"),
    down: () => move("down"),
  });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playMemory(root, id) {
  const ui = gamesShell(root);
  const icons = ["★", "♥", "●", "◆", "▲", "☀", "🌙", "⚡"];
  const cards = gamesShuffle(icons.concat(icons)).map((icon, i) => ({ icon, i, open: false, done: false }));
  let first = null;
  let locked = false;
  let moves = 0;
  function render() {
    ui.setStatus("Memory · " + moves + " Züge");
    ui.stage.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "mem-grid";
    cards.forEach((card) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mem-card" + (card.open || card.done ? " open" : "");
      btn.textContent = card.open || card.done ? card.icon : "";
      btn.addEventListener("click", () => {
        if (locked || card.done || card.open) return;
        card.open = true;
        if (!first) {
          first = card;
          render();
          return;
        }
        moves += 1;
        render();
        if (first.icon === card.icon) {
          first.done = true;
          card.done = true;
          first = null;
          gamesBeep(720, 0.08);
          if (cards.every((c) => c.done)) {
            gamesSaveHs(id, Math.max(0, 100 - moves));
            ui.setStatus("Alle Paare · " + moves + " Züge");
          } else render();
        } else {
          locked = true;
          setTimeout(() => {
            first.open = false;
            card.open = false;
            first = null;
            locked = false;
            render();
          }, 600);
        }
      });
      grid.appendChild(btn);
    });
    ui.stage.appendChild(grid);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playMines(root, id) {
  const ui = gamesShell(root);
  const cols = 8;
  const rows = 10;
  const mines = 12;
  const cells = Array.from({ length: rows * cols }, (_, i) => ({
    i,
    x: i % cols,
    y: Math.floor(i / cols),
    mine: false,
    open: false,
    flag: false,
    n: 0,
  }));
  let placed = false;
  let dead = false;
  let won = false;
  function around(cell) {
    return cells.filter((o) => Math.abs(o.x - cell.x) <= 1 && Math.abs(o.y - cell.y) <= 1 && o !== cell);
  }
  function place(safe) {
    let left = mines;
    while (left) {
      const c = gamesPick(cells);
      if (c.mine || c === safe) continue;
      c.mine = true;
      left -= 1;
    }
    cells.forEach((c) => (c.n = around(c).filter((o) => o.mine).length));
    placed = true;
  }
  function flood(cell) {
    if (cell.open || cell.flag) return;
    cell.open = true;
    if (!cell.n && !cell.mine) around(cell).forEach(flood);
  }
  function render() {
    const left = cells.filter((c) => c.mine && !c.flag).length;
    ui.setStatus(dead ? "Bumm" : won ? "Feld geräumt" : "Minen · " + left);
    ui.stage.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "mine-grid";
    cells.forEach((cell) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mine-cell" + (cell.open ? " open" : "") + (cell.mine && dead ? " boom" : "");
      if (cell.open && !cell.mine && cell.n) btn.textContent = cell.n;
      if (cell.flag && !cell.open) btn.textContent = "⚑";
      if (cell.mine && dead) btn.textContent = "✱";
      btn.addEventListener("click", () => {
        if (dead || won || cell.flag) return;
        if (!placed) place(cell);
        if (cell.mine) {
          dead = true;
          gamesSaveHs(id, cells.filter((c) => c.open).length);
        } else flood(cell);
        if (!dead && cells.filter((c) => !c.mine).every((c) => c.open)) {
          won = true;
          gamesSaveHs(id, 100);
        }
        render();
      });
      btn.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (!cell.open) cell.flag = !cell.flag;
        render();
      });
      grid.appendChild(btn);
    });
    ui.stage.appendChild(grid);
  }
  ui.controls.appendChild(
    gamesBtn("Fahne: lange drücken / rechte Taste", () => {}, "game-hint")
  );
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  let hold = 0;
  ui.stage.addEventListener("pointerdown", (event) => {
    const btn = event.target.closest(".mine-cell");
    if (!btn) return;
    hold = setTimeout(() => {
      const idx = [...ui.stage.querySelectorAll(".mine-cell")].indexOf(btn);
      if (idx >= 0 && !cells[idx].open) {
        cells[idx].flag = !cells[idx].flag;
        render();
      }
    }, 450);
  });
  ui.stage.addEventListener("pointerup", () => clearTimeout(hold));
  render();
  return () => clearTimeout(hold);
}

function playSimon(root, id) {
  const ui = gamesShell(root);
  const colors = [
    { name: "a", color: "#6ec8b8", freq: 330 },
    { name: "b", color: "#f0a35e", freq: 392 },
    { name: "c", color: "#7aa2ff", freq: 262 },
    { name: "d", color: "#e07a6a", freq: 440 },
  ];
  let seq = [];
  let step = 0;
  let locked = true;
  function flash(i) {
    const pads = [...ui.stage.querySelectorAll(".simon-pad")];
    pads[i].classList.add("on");
    gamesBeep(colors[i].freq, 0.18);
    setTimeout(() => pads[i].classList.remove("on"), 280);
  }
  function playSeq() {
    locked = true;
    ui.setStatus("Simon · merken");
    seq.forEach((i, n) => setTimeout(() => flash(i), 450 * (n + 1)));
    setTimeout(() => {
      locked = false;
      step = 0;
      ui.setStatus("Simon · nachmachen");
    }, 450 * (seq.length + 1));
  }
  function nextRound() {
    seq.push(Math.floor(Math.random() * 4));
    playSeq();
  }
  ui.stage.innerHTML = "";
  const box = document.createElement("div");
  box.className = "simon-box";
  colors.forEach((c, i) => {
    const pad = document.createElement("button");
    pad.type = "button";
    pad.className = "simon-pad";
    pad.style.background = c.color;
    pad.addEventListener("click", () => {
      if (locked) return;
      flash(i);
      if (i !== seq[step]) {
        gamesSaveHs(id, seq.length - 1);
        ui.setStatus("Falsch · Runde " + (seq.length - 1));
        locked = true;
        return;
      }
      step += 1;
      if (step >= seq.length) setTimeout(nextRound, 500);
    });
    box.appendChild(pad);
  });
  ui.stage.appendChild(box);
  ui.controls.appendChild(gamesBtn("Start", nextRound));
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  ui.setStatus("Simon · Start drücken");
  return () => {};
}

function play15(root, id) {
  const ui = gamesShell(root);
  let tiles = [...Array(15).keys()].map((n) => n + 1).concat(0);
  function moves() {
    const z = tiles.indexOf(0);
    const x = z % 4;
    const y = Math.floor(z / 4);
    const out = [];
    if (x > 0) out.push(z - 1);
    if (x < 3) out.push(z + 1);
    if (y > 0) out.push(z - 4);
    if (y < 3) out.push(z + 4);
    return out;
  }
  for (let i = 0; i < 80; i++) {
    const m = gamesPick(moves());
    const z = tiles.indexOf(0);
    tiles[z] = tiles[m];
    tiles[m] = 0;
  }
  let steps = 0;
  function render() {
    const done = tiles.every((v, i) => (i === 15 ? v === 0 : v === i + 1));
    ui.setStatus(done ? "Gelöst · " + steps : "15er-Puzzle · " + steps);
    if (done) gamesSaveHs(id, Math.max(0, 200 - steps));
    ui.stage.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "p15";
    tiles.forEach((v, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "p15-cell" + (v === 0 ? " empty" : "");
      btn.textContent = v || "";
      btn.addEventListener("click", () => {
        if (done || !moves().includes(i)) return;
        const z = tiles.indexOf(0);
        tiles[z] = tiles[i];
        tiles[i] = 0;
        steps += 1;
        render();
      });
      grid.appendChild(btn);
    });
    ui.stage.appendChild(grid);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playSudoku(root) {
  const ui = gamesShell(root);
  const puzzles = [
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    "200080300060070084030500209000105408000000000402706000301007040720040060004010003",
    "000000907000420180000705026100904000050000040000507009920108000034059000507000000",
  ];
  const given = gamesPick(puzzles).split("").map(Number);
  const grid = given.slice();
  let pick = -1;
  function ok(idx, n) {
    const x = idx % 9;
    const y = Math.floor(idx / 9);
    for (let i = 0; i < 9; i++) {
      if (i !== x && grid[y * 9 + i] === n) return false;
      if (i !== y && grid[i * 9 + x] === n) return false;
    }
    const bx = Math.floor(x / 3) * 3;
    const by = Math.floor(y / 3) * 3;
    for (let yy = 0; yy < 3; yy++)
      for (let xx = 0; xx < 3; xx++) {
        const j = (by + yy) * 9 + bx + xx;
        if (j !== idx && grid[j] === n) return false;
      }
    return true;
  }
  function render() {
    const done = grid.every(Boolean) && grid.every((n, i) => ok(i, n));
    ui.setStatus(done ? "Sudoku gelöst" : "Sudoku · Feld tippen");
    ui.stage.innerHTML = "";
    const board = document.createElement("div");
    board.className = "sudo";
    grid.forEach((n, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "sudo-cell" +
        (given[i] ? " given" : "") +
        (pick === i ? " pick" : "") +
        (n && !ok(i, n) ? " bad" : "");
      btn.textContent = n || "";
      btn.addEventListener("click", () => {
        if (given[i]) return;
        pick = i;
        render();
      });
      board.appendChild(btn);
    });
    ui.stage.appendChild(board);
  }
  const nums = document.createElement("div");
  nums.className = "sudo-nums";
  for (let n = 1; n <= 9; n++) {
    nums.appendChild(
      gamesBtn(String(n), () => {
        if (pick < 0 || given[pick]) return;
        grid[pick] = n;
        render();
      })
    );
  }
  nums.appendChild(
    gamesBtn("⌫", () => {
      if (pick < 0 || given[pick]) return;
      grid[pick] = 0;
      render();
    })
  );
  ui.controls.appendChild(nums);
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playHangman(root, id) {
  const ui = gamesShell(root);
  const words = [
    "DIENSTPLAN",
    "NACHTSCHICHT",
    "FRUEHDIENST",
    "PAUSE",
    "KOLLEGE",
    "KRANKENHAUS",
    "NOTAUFNAHME",
    "WOCHENENDE",
    "SCHWESTER",
    "PFLEGER",
    "HANDY",
    "NOKIA",
    "SCHLANGE",
    "ICQ",
    "NACHRICHT",
  ];
  const word = gamesPick(words);
  const found = new Set();
  const wrong = [];
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  function render() {
    const show = [...word].map((ch) => (found.has(ch) ? ch : "_")).join(" ");
    const lost = wrong.length >= 6;
    const won = [...word].every((ch) => found.has(ch));
    ui.setStatus(won ? "Gelöst!" : lost ? "Wort: " + word : "Galgen · " + (6 - wrong.length) + " Leben");
    ui.stage.innerHTML = `<pre class="hang-art">${["", "  O", "  O\n  |", "  O\n /|", "  O\n /|\\", "  O\n /|\\\n /", "  O\n /|\\\n / \\"][wrong.length]}</pre><p class="hang-word">${show}</p>`;
    if (won) gamesSaveHs(id, 6 - wrong.length);
  }
  const letters = document.createElement("div");
  letters.className = "hang-letters";
  abc.forEach((ch) => {
    const btn = gamesBtn(ch, () => {
      if (wrong.length >= 6 || [...word].every((c) => found.has(c))) return;
      btn.disabled = true;
      if (word.includes(ch)) found.add(ch);
      else wrong.push(ch);
      render();
    });
    letters.appendChild(btn);
  });
  ui.controls.appendChild(letters);
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playMole(root, id) {
  const ui = gamesShell(root);
  let score = 0;
  let time = 30;
  let active = -1;
  let dead = false;
  const holes = document.createElement("div");
  holes.className = "mole-grid";
  const btns = [];
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mole-hole";
    btn.addEventListener("click", () => {
      if (dead || i !== active) return;
      score += 1;
      active = -1;
      gamesBeep(700, 0.05);
      paint();
    });
    holes.appendChild(btn);
    btns.push(btn);
  }
  ui.stage.appendChild(holes);
  function paint() {
    btns.forEach((b, i) => {
      b.textContent = i === active ? "🐹" : "";
      b.classList.toggle("up", i === active);
    });
    ui.setStatus(dead ? "Fertig · " + score : "Maulwurf · " + Math.ceil(time) + "s · " + score);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    if (dead) return;
    time -= dt;
    if (Math.random() < dt * 1.6) active = Math.floor(Math.random() * 9);
    if (time <= 0) {
      dead = true;
      active = -1;
      gamesSaveHs(id, score);
    }
    paint();
  });
  return stop;
}

function playPong(root, id) {
  const ui = gamesShell(root);
  const { ctx, canvas, w, h } = gamesCanvas(ui.stage, 320, 420);
  let py = h / 2;
  let cy = h / 2;
  let ball = { x: w / 2, y: h / 2, vx: 140, vy: 80 };
  let ps = 0;
  let cs = 0;
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    py = ((event.clientY - rect.top) / rect.height) * h;
  });
  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    py = ((event.clientY - rect.top) / rect.height) * h;
  });
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  const stop = gamesLoop((dt) => {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.y < 8 || ball.y > h - 8) ball.vy *= -1;
    cy += (ball.y - cy) * 3 * dt;
    if (ball.x < 24 && Math.abs(ball.y - py) < 36) ball.vx = Math.abs(ball.vx);
    if (ball.x > w - 24 && Math.abs(ball.y - cy) < 36) ball.vx = -Math.abs(ball.vx);
    if (ball.x < 0) {
      cs += 1;
      ball = { x: w / 2, y: h / 2, vx: 140, vy: 80 };
    }
    if (ball.x > w) {
      ps += 1;
      gamesSaveHs(id, ps);
      ball = { x: w / 2, y: h / 2, vx: -140, vy: 80 };
    }
    ui.setStatus("Pong · du " + ps + " : " + cs + " CPU");
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(w / 2 - 1, 0, 2, h);
    ctx.fillRect(10, py - 32, 8, 64);
    ctx.fillRect(w - 18, cy - 32, 8, 64);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  return stop;
}

function playLights(root, id) {
  const ui = gamesShell(root);
  const n = 5;
  const grid = Array.from({ length: n * n }, () => Math.random() < 0.45);
  let moves = 0;
  function toggle(i) {
    const x = i % n;
    const y = Math.floor(i / n);
    [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].forEach(([dx, dy]) => {
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < n && yy < n) grid[yy * n + xx] = !grid[yy * n + xx];
    });
  }
  function render() {
    const off = grid.every((v) => !v);
    ui.setStatus(off ? "Dunkel · " + moves : "Licht-aus · " + moves);
    if (off) gamesSaveHs(id, Math.max(0, 50 - moves));
    ui.stage.innerHTML = "";
    const board = document.createElement("div");
    board.className = "lights";
    grid.forEach((on, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lights-cell" + (on ? " on" : "");
      btn.addEventListener("click", () => {
        if (off) return;
        toggle(i);
        moves += 1;
        render();
      });
      board.appendChild(btn);
    });
    ui.stage.appendChild(board);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playTtt(root, id) {
  const ui = gamesShell(root);
  let board = Array(9).fill("");
  let over = false;
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  function winner(b) {
    for (const [a, c, d] of wins) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    if (b.every(Boolean)) return "draw";
    return "";
  }
  function minimax(b, cpu) {
    const w = winner(b);
    if (w === "O") return { s: 1 };
    if (w === "X") return { s: -1 };
    if (w === "draw") return { s: 0 };
    let best = { s: cpu ? -2 : 2, i: 0 };
    b.forEach((v, i) => {
      if (v) return;
      b[i] = cpu ? "O" : "X";
      const r = minimax(b, !cpu);
      b[i] = "";
      if (cpu ? r.s > best.s : r.s < best.s) best = { s: r.s, i };
    });
    return best;
  }
  function render() {
    const w = winner(board);
    over = Boolean(w);
    ui.setStatus(w === "X" ? "Du gewinnst" : w === "O" ? "ICQ gewinnt" : w === "draw" ? "Unentschieden" : "Tic Tac Toe · du bist X");
    if (w === "X") gamesSaveHs(id, 1);
    ui.stage.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "ttt";
    board.forEach((v, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ttt-cell";
      btn.textContent = v;
      btn.addEventListener("click", () => {
        if (over || board[i]) return;
        board[i] = "X";
        if (!winner(board)) board[minimax(board, true).i] = "O";
        render();
      });
      grid.appendChild(btn);
    });
    ui.stage.appendChild(grid);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playC4(root, id) {
  const ui = gamesShell(root);
  const w = 7;
  const h = 6;
  let grid = Array.from({ length: h }, () => Array(w).fill(0));
  let over = "";
  function drop(col, who) {
    for (let y = h - 1; y >= 0; y--) {
      if (!grid[y][col]) {
        grid[y][col] = who;
        return y;
      }
    }
    return -1;
  }
  function win(who) {
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (grid[y][x] !== who) continue;
        for (const [dx, dy] of dirs) {
          let n = 1;
          for (let k = 1; k < 4; k++) {
            const xx = x + dx * k;
            const yy = y + dy * k;
            if (yy < 0 || xx < 0 || yy >= h || xx >= w || grid[yy][xx] !== who) break;
            n += 1;
          }
          if (n >= 4) return true;
        }
      }
    return false;
  }
  function cpu() {
    const cols = [];
    for (let x = 0; x < w; x++) if (!grid[0][x]) cols.push(x);
    for (const who of [2, 1]) {
      for (const x of cols) {
        const y = drop(x, who);
        const ok = win(who);
        grid[y][x] = 0;
        if (ok) return x;
      }
    }
    return gamesPick(cols);
  }
  function render() {
    ui.setStatus(over || "4 Gewinnt · du bist orange");
    ui.stage.innerHTML = "";
    const board = document.createElement("div");
    board.className = "c4";
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "c4-cell p" + grid[y][x];
        cell.addEventListener("click", () => {
          if (over || grid[0][x]) return;
          drop(x, 1);
          if (win(1)) {
            over = "Du gewinnst";
            gamesSaveHs(id, 1);
          } else if (grid[0].every(Boolean)) {
            over = "Unentschieden";
          } else {
            drop(cpu(), 2);
            if (win(2)) over = "ICQ gewinnt";
          }
          render();
        });
        board.appendChild(cell);
      }
    ui.stage.appendChild(board);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playShips(root, id) {
  const ui = gamesShell(root);
  const n = 8;
  function empty() {
    return Array.from({ length: n * n }, () => ({ ship: false, shot: false }));
  }
  function place(board) {
    [4, 3, 3, 2, 2].forEach((len) => {
      for (let t = 0; t < 80; t++) {
        const hor = Math.random() < 0.5;
        const x = Math.floor(Math.random() * (hor ? n - len + 1 : n));
        const y = Math.floor(Math.random() * (hor ? n : n - len + 1));
        const cells = [];
        let ok = true;
        for (let k = 0; k < len; k++) {
          const i = (y + (hor ? 0 : k)) * n + (x + (hor ? k : 0));
          if (board[i].ship) ok = false;
          cells.push(i);
        }
        if (ok) {
          cells.forEach((i) => (board[i].ship = true));
          return;
        }
      }
    });
  }
  const mine = empty();
  const enemy = empty();
  place(mine);
  place(enemy);
  let over = false;
  function cpuShot() {
    const opts = mine.map((c, i) => i).filter((i) => !mine[i].shot);
    const i = gamesPick(opts);
    mine[i].shot = true;
    return i;
  }
  function left(board) {
    return board.filter((c) => c.ship && !c.shot).length;
  }
  function render() {
    ui.setStatus(over || "Schiffe · auf das rechte Raster schießen");
    ui.stage.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "ships-wrap";
    function grid(board, fire) {
      const g = document.createElement("div");
      g.className = "ships";
      board.forEach((c, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ships-cell";
        if (c.shot && c.ship) btn.classList.add("hit");
        else if (c.shot) btn.classList.add("miss");
        if (!fire && c.ship && !c.shot) btn.classList.add("own");
        btn.addEventListener("click", () => {
          if (!fire || over || c.shot) return;
          c.shot = true;
          if (!left(enemy)) {
            over = "Flotte versenkt!";
            gamesSaveHs(id, 1);
          } else {
            cpuShot();
            if (!left(mine)) over = "Deine Flotte ist weg.";
          }
          render();
        });
        g.appendChild(btn);
      });
      return g;
    }
    const a = document.createElement("div");
    a.innerHTML = "<p class='games-mini'>Deine Flotte</p>";
    a.appendChild(grid(mine, false));
    const b = document.createElement("div");
    b.innerHTML = "<p class='games-mini'>Gegner</p>";
    b.appendChild(grid(enemy, true));
    wrap.append(a, b);
    ui.stage.appendChild(wrap);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playCheckers(root, id) {
  const ui = gamesShell(root);
  const n = 8;
  let grid = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < n; x++) if ((x + y) % 2) grid[y][x] = -1;
  for (let y = 5; y < 8; y++)
    for (let x = 0; x < n; x++) if ((x + y) % 2) grid[y][x] = 1;
  let selected = null;
  let over = "";
  function inside(x, y) {
    return x >= 0 && y >= 0 && x < n && y < n;
  }
  function moves(x, y) {
    const p = grid[y][x];
    if (!p) return [];
    const dirs = [];
    if (p === 1) dirs.push([-1, -1], [1, -1]);
    else if (p === -1) dirs.push([-1, 1], [1, 1]);
    else dirs.push([-1, -1], [1, -1], [-1, 1], [1, 1]);
    const out = [];
    dirs.forEach(([dx, dy]) => {
      const x1 = x + dx;
      const y1 = y + dy;
      if (inside(x1, y1) && !grid[y1][x1]) out.push({ x: x1, y: y1, cap: null });
      const x2 = x + dx * 2;
      const y2 = y + dy * 2;
      if (inside(x1, y1) && inside(x2, y2) && !grid[y2][x2] && grid[y1][x1] * p < 0) {
        out.push({ x: x2, y: y2, cap: { x: x1, y: y1 } });
      }
    });
    const caps = out.filter((m) => m.cap);
    return caps.length ? caps : out;
  }
  function sideMoves(sign) {
    const list = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (grid[y][x] * sign > 0)
          moves(x, y).forEach((m) => list.push({ fx: x, fy: y, tx: m.x, ty: m.y, cap: m.cap }));
    const caps = list.filter((m) => m.cap);
    return caps.length ? caps : list;
  }
  function apply(fx, fy, tx, ty, cap) {
    const p = grid[fy][fx];
    grid[fy][fx] = 0;
    grid[ty][tx] = p;
    if (cap) grid[cap.y][cap.x] = 0;
    if (p === 1 && ty === 0) grid[ty][tx] = 2;
    if (p === -1 && ty === 7) grid[ty][tx] = -2;
  }
  function cpuTurn() {
    const list = sideMoves(-1);
    if (!list.length) {
      over = "Du gewinnst";
      gamesSaveHs(id, 1);
      return;
    }
    const m = gamesPick(list);
    apply(m.fx, m.fy, m.tx, m.ty, m.cap);
  }
  function paint() {
    ui.setStatus(over || "Dame · deine Steine unten");
    ui.stage.innerHTML = "";
    const board = document.createElement("div");
    board.className = "chk";
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "chk-cell" +
          ((x + y) % 2 ? " dark" : " light") +
          (selected && selected.x === x && selected.y === y ? " sel" : "");
        const p = grid[y][x];
        if (p) {
          const d = document.createElement("span");
          d.className = "chk-man " + (p > 0 ? "me" : "cpu") + (Math.abs(p) === 2 ? " king" : "");
          btn.appendChild(d);
        }
        btn.addEventListener("click", () => {
          if (over) return;
          if (grid[y][x] > 0) {
            selected = { x, y };
            paint();
            return;
          }
          if (!selected) return;
          const opt = moves(selected.x, selected.y).find((m) => m.x === x && m.y === y);
          if (!opt) return;
          apply(selected.x, selected.y, x, y, opt.cap);
          selected = null;
          if (!sideMoves(-1).length) {
            over = "Du gewinnst";
            gamesSaveHs(id, 1);
          } else cpuTurn();
          if (!over && !sideMoves(1).length) over = "ICQ gewinnt";
          paint();
        });
        board.appendChild(btn);
      }
    ui.stage.appendChild(board);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  paint();
  return () => {};
}

function playReversi(root, id) {
  const ui = gamesShell(root);
  const n = 8;
  let grid = Array.from({ length: n }, () => Array(n).fill(0));
  grid[3][3] = grid[4][4] = 1;
  grid[3][4] = grid[4][3] = -1;
  let over = "";
  const dirs = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];
  function flips(x, y, who) {
    if (grid[y][x]) return [];
    const out = [];
    dirs.forEach(([dx, dy]) => {
      const line = [];
      let xx = x + dx;
      let yy = y + dy;
      while (yy >= 0 && xx >= 0 && yy < n && xx < n && grid[yy][xx] === -who) {
        line.push([xx, yy]);
        xx += dx;
        yy += dy;
      }
      if (line.length && yy >= 0 && xx >= 0 && yy < n && xx < n && grid[yy][xx] === who) out.push(...line);
    });
    return out;
  }
  function legal(who) {
    const list = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (flips(x, y, who).length) list.push({ x, y });
    return list;
  }
  function put(x, y, who) {
    const f = flips(x, y, who);
    if (!f.length) return false;
    grid[y][x] = who;
    f.forEach(([xx, yy]) => (grid[yy][xx] = who));
    return true;
  }
  function cpu() {
    const list = legal(-1);
    if (!list.length) return;
    list.sort((a, b) => flips(b.x, b.y, -1).length - flips(a.x, a.y, -1).length);
    put(list[0].x, list[0].y, -1);
  }
  function render() {
    const me = grid.flat().filter((v) => v === 1).length;
    const cpuN = grid.flat().filter((v) => v === -1).length;
    if (!legal(1).length && !legal(-1).length) {
      over = me > cpuN ? "Du gewinnst" : me < cpuN ? "ICQ gewinnt" : "Unentschieden";
      if (me > cpuN) gamesSaveHs(id, me);
    }
    ui.setStatus(over || "Reversi · du " + me + " : " + cpuN);
    ui.stage.innerHTML = "";
    const board = document.createElement("div");
    board.className = "rev";
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rev-cell";
        if (grid[y][x] === 1) btn.classList.add("me");
        if (grid[y][x] === -1) btn.classList.add("cpu");
        if (flips(x, y, 1).length) btn.classList.add("hint");
        btn.addEventListener("click", () => {
          if (over || !put(x, y, 1)) return;
          if (legal(-1).length) cpu();
          else if (!legal(1).length) {
            /* skip */
          }
          render();
        });
        board.appendChild(btn);
      }
    ui.stage.appendChild(board);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playGomoku(root, id) {
  const ui = gamesShell(root);
  const n = 11;
  let grid = Array.from({ length: n }, () => Array(n).fill(0));
  let over = "";
  function count(x, y, dx, dy, who) {
    let c = 0;
    let xx = x;
    let yy = y;
    while (yy >= 0 && xx >= 0 && yy < n && xx < n && grid[yy][xx] === who) {
      c += 1;
      xx += dx;
      yy += dy;
    }
    return c;
  }
  function won(x, y, who) {
    return [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ].some(([dx, dy]) => count(x, y, dx, dy, who) + count(x, y, -dx, -dy, who) - 1 >= 5);
  }
  function cpu() {
    const empty = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!grid[y][x]) empty.push({ x, y });
    for (const who of [-1, 1]) {
      for (const p of empty) {
        grid[p.y][p.x] = who;
        const ok = won(p.x, p.y, who);
        grid[p.y][p.x] = 0;
        if (ok) return p;
      }
    }
    return empty.length ? gamesPick(empty) : null;
  }
  function render() {
    ui.setStatus(over || "Fünf gewinnt · du bist orange");
    ui.stage.innerHTML = "";
    const board = document.createElement("div");
    board.className = "gomoku";
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gomoku-cell p" + grid[y][x];
        btn.addEventListener("click", () => {
          if (over || grid[y][x]) return;
          grid[y][x] = 1;
          if (won(x, y, 1)) {
            over = "Du gewinnst";
            gamesSaveHs(id, 1);
          } else {
            const m = cpu();
            if (m) {
              grid[m.y][m.x] = -1;
              if (won(m.x, m.y, -1)) over = "ICQ gewinnt";
            }
          }
          render();
        });
        board.appendChild(btn);
      }
    ui.stage.appendChild(board);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

function playChess(root, id) {
  const ui = gamesShell(root);
  const start = ["rnbqkbnr", "pppppppp", "........", "........", "........", "........", "PPPPPPPP", "RNBQKBNR"];
  let board = start.map((r) => r.split(""));
  let selected = null;
  let over = "";
  const val = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const white = (ch) => ch === ch.toUpperCase() && ch !== ".";
  function inB(x, y) {
    return x >= 0 && y >= 0 && x < 8 && y < 8;
  }
  function findK(isWhite) {
    const needle = isWhite ? "K" : "k";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (board[y][x] === needle) return { x, y };
    return null;
  }
  function attacks(x, y, isWhite) {
    const k = findK(isWhite);
    if (!k) return true;
    void x;
    void y;
    return squareAttacked(k.x, k.y, !isWhite);
  }
  function squareAttacked(tx, ty, byWhite) {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ch = board[y][x];
        if (ch === "." || white(ch) !== byWhite) continue;
        if (pseudo(x, y).some((m) => m.x === tx && m.y === ty)) return true;
      }
    return false;
  }
  function ray(x, y, dirs, one) {
    const meW = white(board[y][x]);
    const out = [];
    dirs.forEach(([dx, dy]) => {
      for (let i = 1; i <= (one ? 1 : 7); i++) {
        const xx = x + dx * i;
        const yy = y + dy * i;
        if (!inB(xx, yy)) break;
        if (board[yy][xx] === ".") out.push({ x: xx, y: yy });
        else {
          if (white(board[yy][xx]) !== meW) out.push({ x: xx, y: yy });
          break;
        }
      }
    });
    return out;
  }
  function pseudo(x, y) {
    const ch = board[y][x];
    const t = ch.toLowerCase();
    const meW = white(ch);
    if (t === "p") {
      const dir = meW ? -1 : 1;
      const out = [];
      if (inB(x, y + dir) && board[y + dir][x] === ".") {
        out.push({ x, y: y + dir });
        if ((meW && y === 6) || (!meW && y === 1)) {
          if (board[y + dir * 2][x] === ".") out.push({ x, y: y + dir * 2 });
        }
      }
      [-1, 1].forEach((dx) => {
        const xx = x + dx;
        const yy = y + dir;
        if (inB(xx, yy) && board[yy][xx] !== "." && white(board[yy][xx]) !== meW) out.push({ x: xx, y: yy });
      });
      return out;
    }
    if (t === "n") return ray(x, y, [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]], true);
    if (t === "b") return ray(x, y, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    if (t === "r") return ray(x, y, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (t === "q") return ray(x, y, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
    if (t === "k") return ray(x, y, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], true);
    return [];
  }
  function legal(x, y) {
    const meW = white(board[y][x]);
    return pseudo(x, y).filter((m) => {
      const cap = board[m.y][m.x];
      const from = board[y][x];
      board[m.y][m.x] = from;
      board[y][x] = ".";
      const bad = attacks(0, 0, meW);
      board[y][x] = from;
      board[m.y][m.x] = cap;
      return !bad;
    });
  }
  function allLegal(isWhite) {
    const list = [];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        if (board[y][x] !== "." && white(board[y][x]) === isWhite) legal(x, y).forEach((m) => list.push({ x, y, ...m }));
    return list;
  }
  function scoreBoard() {
    let s = 0;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ch = board[y][x];
        if (ch === ".") continue;
        s += (white(ch) ? -1 : 1) * (val[ch.toLowerCase()] || 0);
      }
    return s;
  }
  function cpu() {
    const options = [];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        if (board[y][x] !== "." && !white(board[y][x]))
          legal(x, y).forEach((m) => options.push({ fx: x, fy: y, tx: m.x, ty: m.y }));
    if (!options.length) {
      const king = findK(true);
      over = king && squareAttacked(king.x, king.y, false) ? "Matt" : "Patt";
      if (over === "Matt") gamesSaveHs(id, 1);
      return;
    }
    let best = options[0];
    let bestS = -9999;
    options.forEach((m) => {
      const cap = board[m.ty][m.tx];
      const piece = board[m.fy][m.fx];
      board[m.ty][m.tx] = piece;
      board[m.fy][m.fx] = ".";
      const s = scoreBoard() + Math.random() * 0.2;
      board[m.fy][m.fx] = piece;
      board[m.ty][m.tx] = cap;
      if (s > bestS) {
        bestS = s;
        best = m;
      }
    });
    const piece = board[best.fy][best.fx];
    board[best.ty][best.tx] = piece === "p" && best.ty === 7 ? "q" : piece;
    board[best.fy][best.fx] = ".";
  }
  const glyphs = {
    K: "♔",
    Q: "♕",
    R: "♖",
    B: "♗",
    N: "♘",
    P: "♙",
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
  };
  function render() {
    ui.setStatus(over || "Schach · du bist Weiß");
    ui.stage.innerHTML = "";
    const gridEl = document.createElement("div");
    gridEl.className = "chess";
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chess-cell" + ((x + y) % 2 ? " dark" : " light") + (selected && selected.x === x && selected.y === y ? " sel" : "");
        btn.textContent = glyphs[board[y][x]] || "";
        btn.addEventListener("click", () => {
          if (over) return;
          if (board[y][x] !== "." && white(board[y][x])) {
            selected = { x, y };
            render();
            return;
          }
          if (!selected) return;
          if (!legal(selected.x, selected.y).some((m) => m.x === x && m.y === y)) return;
          const piece = board[selected.y][selected.x];
          board[y][x] = piece === "P" && y === 0 ? "Q" : piece;
          board[selected.y][selected.x] = ".";
          selected = null;
          if (!allLegal(false).length) {
            over = "Schachmatt";
            gamesSaveHs(id, 1);
          } else cpu();
          if (!over && !allLegal(true).length) over = squareAttacked(findK(true).x, findK(true).y, false) ? "Matt" : "Patt";
          render();
        });
        gridEl.appendChild(btn);
      }
    ui.stage.appendChild(gridEl);
  }
  ui.controls.appendChild(gamesBtn("Nochmal", () => window.DienstGames.restart()));
  render();
  return () => {};
}

const GAMES_CATALOG = [
  { id: "snake", name: "Schlange", era: "handy", blurb: "Nokia 3310", play: playSnake },
  { id: "tetris", name: "Tetris", era: "handy", blurb: "Steine kippen", play: playTetris },
  { id: "impact", name: "Space Impact", era: "handy", blurb: "Nokia-Shooter", play: playImpact },
  { id: "breakout", name: "Breakout", era: "handy", blurb: "Steine zerlegen", play: playBreakout },
  { id: "bounce", name: "Bounce", era: "handy", blurb: "Ball hüpfen", play: playBounce },
  { id: "race", name: "Rennen", era: "handy", blurb: "Drei Spuren", play: playRace },
  { id: "flappy", name: "Flappy", era: "handy", blurb: "Tippen und fliegen", play: playFlappy },
  { id: "asteroids", name: "Asteroids", era: "handy", blurb: "Felsen knacken", play: playAsteroids },
  { id: "pac", name: "Pac-Punkte", era: "handy", blurb: "Punkte fressen", play: playPac },
  { id: "g2048", name: "2048", era: "handy", blurb: "Zahlen schieben", play: play2048 },
  { id: "memory", name: "Memory", era: "handy", blurb: "Paare finden", play: playMemory },
  { id: "mines", name: "Minenräumer", era: "handy", blurb: "Felder räumen", play: playMines },
  { id: "simon", name: "Simon", era: "handy", blurb: "Farben merken", play: playSimon },
  { id: "puzzle15", name: "15er-Puzzle", era: "handy", blurb: "Schiebepuzzle", play: play15 },
  { id: "sudoku", name: "Sudoku", era: "handy", blurb: "Zahlenrätsel", play: playSudoku },
  { id: "hangman", name: "Galgenmännchen", era: "handy", blurb: "Wort erraten", play: playHangman },
  { id: "mole", name: "Maulwurf", era: "handy", blurb: "Tippen, tippen", play: playMole },
  { id: "pong", name: "Pong", era: "handy", blurb: "Gegen das Handy", play: playPong },
  { id: "lights", name: "Licht-aus", era: "handy", blurb: "Alle Lichter aus", play: playLights },
  { id: "ttt", name: "Tic Tac Toe", era: "icq", blurb: "ICQ-Klassiker", play: playTtt },
  { id: "connect4", name: "4 Gewinnt", era: "icq", blurb: "Vier in einer Reihe", play: playC4 },
  { id: "ships", name: "Schiffe versenken", era: "icq", blurb: "Flotte jagen", play: playShips },
  { id: "checkers", name: "Dame", era: "icq", blurb: "Gegen das Handy", play: playCheckers },
  { id: "reversi", name: "Reversi", era: "icq", blurb: "Othello aus ICQ", play: playReversi },
  { id: "gomoku", name: "Fünf gewinnt", era: "icq", blurb: "Gomoku", play: playGomoku },
  { id: "chess", name: "Schach", era: "icq", blurb: "ICQ Chess", play: playChess },
];

window.DienstGames = (function () {
  let destroy = null;
  let currentId = null;

  function stop() {
    if (destroy) {
      try {
        destroy();
      } catch {
        /* ignore */
      }
    }
    destroy = null;
    currentId = null;
  }

  function renderHub(root) {
    stop();
    const hs = gamesLoadHs();
    const title = document.getElementById("games-title");
    if (title) title.textContent = "Spiele";
    const groups = [
      { key: "handy", label: "Alte Handyspiele", text: "Nokia, Java-Handys, die Klassiker von früher." },
      { key: "icq", label: "ICQ-Spiele", text: "Die Spiele aus dem Messenger, gegen das Handy." },
    ];
    root.innerHTML = groups
      .map((g) => {
        const items = GAMES_CATALOG.filter((game) => game.era === g.key);
        return `
          <p class="games-lead">${g.text}</p>
          <h3 class="games-h">${g.label}</h3>
          <div class="games-grid">
            ${items
              .map((game) => {
                const best = hs[game.id];
                return `<button type="button" class="games-card era-${game.era}" data-game="${game.id}">
                  <strong>${game.name}</strong>
                  <span>${game.blurb}${best != null ? ` · Best ${best}` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>`;
      })
      .join("");
    root.querySelectorAll("[data-game]").forEach((btn) => {
      btn.addEventListener("click", () => start(btn.dataset.game, root));
    });
  }

  function start(id, root) {
    const game = GAMES_CATALOG.find((g) => g.id === id);
    if (!game) return;
    stop();
    currentId = id;
    const title = document.getElementById("games-title");
    if (title) title.textContent = game.name;
    root.innerHTML = "";
    destroy = game.play(root, id) || (() => {});
  }

  function restart() {
    const root = document.getElementById("games-body");
    if (currentId && root) start(currentId, root);
  }

  function back(root) {
    if (currentId) renderHub(root);
    else close();
  }

  function close() {
    stop();
    const overlay = document.getElementById("games-overlay");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("games-open");
  }

  return { renderHub, start, stop, restart, back, close, catalog: GAMES_CATALOG };
})();
