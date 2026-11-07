import {
  COLS,
  ROWS,
  TUNNEL_ROW,
  UP,
  LEFT,
  DOWN,
  RIGHT,
  ZERO,
  DIR_ORDER,
  RAW,
  isOpen,
  isWallForDraw,
  noUpTile,
  buildGrid,
  type Vec,
} from "./maze";
import { THEMES, loadHigh, saveHigh, type Settings } from "./settings";
import { Sfx } from "./audio";

export type Phase = "title" | "ready" | "playing" | "freeze" | "dying" | "clear" | "over";

export interface Hud {
  score: number;
  high: number;
  lives: number;
  level: number;
  phase: Phase;
  paused: boolean;
  fruits: string[];
}

type GhostState = "house" | "leaving" | "active" | "eaten" | "entering";

interface Pac {
  x: number;
  y: number;
  dir: Vec;
  want: Vec | null;
  wantAge: number;
  phase: number;
  angle: number;
  offX: number;
  offY: number;
  squash: number;
}

interface Ghost {
  id: number;
  x: number;
  y: number;
  dir: Vec;
  home: Vec;
  state: GhostState;
  fright: boolean;
  reverse: boolean;
  stage: number;
  lx: number;
  ly: number;
  target: Vec;
  hidden: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

const BASE = 9.5; // tiles / second at "100%"
const SUBSTEP = 1 / 120;
const FRUITS = ["🍒", "🍓", "🍊", "🍎", "🍈", "🚀", "🔔", "🔑"];
const FRUIT_PTS = [100, 300, 500, 700, 1000, 2000, 3000, 5000];
const FRUIT_FOR_LEVEL = [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7];
const FRIGHT_TIME = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1];
const MODE_SCHEDULE = [7, 20, 7, 20, 5, 20, 5, Infinity];
const SCATTER: Vec[] = [
  { x: 25, y: -2 },
  { x: 2, y: -2 },
  { x: 27, y: 31 },
  { x: 0, y: 31 },
];
const GHOST_HOMES: Vec[] = [
  { x: 13.5, y: 11 },
  { x: 13.5, y: 14 },
  { x: 11.5, y: 14 },
  { x: 15.5, y: 14 },
];
const GHOST_NAMES = ["Blinky", "Pinky", "Inky", "Clyde"];
export { GHOST_NAMES };

const DEATH_FREEZE = 0.8;
const DEATH_ANIM = 1.5;
const CLEAR_FREEZE = 0.8;
const CLEAR_TOTAL = 3;
const CUT = 0.32; // corner-cutting tolerance (tiles)

function distToNext(v: number, s: number): number {
  if (s > 0) {
    const c = Math.floor(v + 1e-6) + 1;
    return c - v;
  }
  const c = Math.ceil(v - 1e-6) - 1;
  return v - c;
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
) {
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  s = 1;
  settings: Settings;
  sfx = new Sfx();
  onHud: (h: Hud) => void;

  phase: Phase = "title";
  paused = false;
  timer = 0;
  time = 0;

  score = 0;
  high = loadHigh();
  lives = 3;
  level = 1;
  extraGiven = false;

  grid: Uint8Array = new Uint8Array(COLS * ROWS);
  dotsLeft = 0;
  dotsEaten = 0;
  lifeDots = 0;
  dotTimer = 0;

  pac!: Pac;
  ghosts: Ghost[] = [];

  mode: "scatter" | "chase" = "scatter";
  modeIdx = 0;
  modeTimer = 0;
  frightTimer = 0;
  frightTotal = 0;
  eatChain = 0;
  frozenGhost: Ghost | null = null;

  fruit = { active: false, t: 0, type: 0 };
  fruitSpawns = 0;

  particles: Particle[] = [];
  popups: Popup[] = [];
  trail: { x: number; y: number }[] = [];
  shake = 0;
  deathBurst = false;
  deathSound = false;

  held: Vec[] = [];

  private raf = 0;
  private last = 0;
  private wallCache: HTMLCanvasElement | null = null;
  private flashCache: HTMLCanvasElement | null = null;
  private cacheKey = "";
  private running = false;

  constructor(canvas: HTMLCanvasElement, settings: Settings, onHud: (h: Hud) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.settings = settings;
    this.onHud = onHud;
    this.lives = settings.lives;
    this.resetLevel();
    this.resetActors();
    this.syncAudio();
    this.emit();
  }

  /* ───────────────────────── lifecycle ───────────────────────── */

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.1) dt = 0.1; // tab was hidden etc.
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize(cssW: number, dpr: number) {
    const w = Math.max(280, Math.floor(cssW * dpr));
    const s = w / COLS;
    const h = Math.round(s * ROWS);
    this.canvas.width = w;
    this.canvas.height = h;
    this.s = s;
    this.cacheKey = "";
  }

  setSettings(s: Settings) {
    this.settings = s;
    this.syncAudio();
  }

  syncAudio() {
    this.sfx.enabled = this.settings.sound;
    this.sfx.volume = this.settings.volume;
    this.sfx.musicEnabled = this.settings.music;
    this.sfx.musicVolume = this.settings.musicVolume;
    this.sfx.applyVolume();
  }

  emit() {
    const fruits: string[] = [];
    for (let l = Math.max(1, this.level - 6); l <= this.level; l++) fruits.push(FRUITS[this.fruitIndex(l)]);
    this.onHud({
      score: this.score,
      high: this.high,
      lives: this.lives,
      level: this.level,
      phase: this.phase,
      paused: this.paused,
      fruits,
    });
  }

  /* ───────────────────────── input ───────────────────────── */

  press(dir: Vec) {
    this.held = this.held.filter((d) => d !== dir);
    this.held.push(dir);
    this.pac.want = dir;
    this.pac.wantAge = 0;
  }

  release(dir: Vec) {
    this.held = this.held.filter((d) => d !== dir);
  }

  clearHeld() {
    this.held = [];
  }

  newGame() {
    this.sfx.unlock();
    this.score = 0;
    this.level = 1;
    this.lives = this.settings.lives;
    this.extraGiven = false;
    this.resetLevel();
    this.resetActors();
    this.particles = [];
    this.popups = [];
    this.phase = "ready";
    this.timer = 2.6;
    this.paused = false;
    this.sfx.resetMusic();
    this.sfx.start();
    this.emit();
  }

  toTitle() {
    saveHigh(this.high);
    this.score = 0;
    this.level = 1;
    this.lives = this.settings.lives;
    this.resetLevel();
    this.resetActors();
    this.phase = "title";
    this.paused = false;
    this.emit();
  }

  setPaused(p: boolean) {
    if (this.phase === "title" || this.phase === "over") return;
    if (this.paused === p) return;
    this.paused = p;
    this.emit();
  }

  /* ───────────────────────── state resets ───────────────────────── */

  private fruitIndex(level: number) {
    return FRUIT_FOR_LEVEL[Math.min(level, FRUIT_FOR_LEVEL.length) - 1];
  }

  private resetLevel() {
    const g = buildGrid();
    this.grid = g.grid;
    this.dotsLeft = g.dots;
    this.dotsEaten = 0;
    this.fruit.active = false;
    this.fruitSpawns = 0;
    this.modeIdx = 0;
    this.mode = "scatter";
    this.modeTimer = this.scheduleTime(0);
  }

  private resetActors() {
    this.pac = {
      x: 13.5,
      y: 23,
      dir: LEFT,
      want: null,
      wantAge: 0,
      phase: Math.PI * 0.75,
      angle: Math.PI,
      offX: 0,
      offY: 0,
      squash: 0,
    };
    const count = this.settings.ghostCount;
    this.ghosts = [];
    for (let i = 0; i < count; i++) {
      const home = GHOST_HOMES[i];
      this.ghosts.push({
        id: i,
        x: home.x,
        y: home.y,
        dir: i === 0 ? LEFT : UP,
        home,
        state: i === 0 ? "active" : "house",
        fright: false,
        reverse: false,
        stage: 0,
        lx: i === 0 ? -1 : 0,
        ly: i === 0 ? 0 : -1,
        target: { x: 0, y: 0 },
        hidden: false,
      });
    }
    this.frightTimer = 0;
    this.eatChain = 0;
    this.frozenGhost = null;
    this.lifeDots = 0;
    this.dotTimer = 0;
    this.trail = [];
    this.fruit.active = false;
    this.held = [];
    this.deathBurst = false;
    this.deathSound = false;
  }

  private diffScale() {
    const d = this.settings.difficulty;
    return d === "easy" ? 0.88 : d === "hard" ? 1.1 : 1;
  }

  private scheduleTime(i: number) {
    const base = MODE_SCHEDULE[Math.min(i, MODE_SCHEDULE.length - 1)];
    const d = this.settings.difficulty;
    if (base === Infinity) return base;
    const scatter = i % 2 === 0;
    if (d === "easy") return scatter ? base * 1.4 : base * 0.7;
    if (d === "hard") return scatter ? base * 0.6 : base * 1.3;
    return base;
  }

  /* ───────────────────────── main loop ───────────────────────── */

  private frame(dt: number) {
    if (!this.paused) {
      const n = Math.max(1, Math.ceil(dt / SUBSTEP));
      const h = dt / n;
      for (let i = 0; i < n; i++) this.update(h);
    }
    this.render();
    this.sfx.setMusicPlaying(!this.paused && (this.phase === "playing" || this.phase === "freeze"));
  }

  private update(dt: number) {
    this.time += dt;
    this.updateFx(dt);

    // held-key refresh (keeps buffered turn alive while key is down)
    if (this.held.length) {
      this.pac.want = this.held[this.held.length - 1];
      this.pac.wantAge = 0;
    }

    switch (this.phase) {
      case "title":
      case "over":
        this.idleAnim(dt);
        break;
      case "ready":
        this.idleAnim(dt);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = "playing";
          this.emit();
        }
        break;
      case "playing":
        this.tick(dt);
        break;
      case "freeze":
        this.timer -= dt;
        if (this.timer <= 0) {
          this.frozenGhost = null;
          this.phase = "playing";
          this.emit();
        }
        break;
      case "dying":
        this.updateDying(dt);
        break;
      case "clear":
        this.timer -= dt;
        if (CLEAR_TOTAL - this.timer > CLEAR_FREEZE) for (const g of this.ghosts) g.hidden = true;
        if (this.timer <= 0) {
          this.level++;
          this.resetLevel();
          this.resetActors();
          this.phase = "ready";
          this.timer = 1.8;
          this.emit();
        }
        break;
    }
  }

  /** Keeps ghosts in the house bobbing while the game is waiting. */
  private idleAnim(dt: number) {
    for (const g of this.ghosts) {
      const k = 1 - Math.exp(-dt * 14);
      g.lx += (g.dir.x - g.lx) * k;
      g.ly += (g.dir.y - g.ly) * k;
      if (g.state === "house") {
        g.y = g.home.y + Math.sin(this.time * 7 + g.id * 1.7) * 0.28;
        g.lx = 0;
        g.ly = Math.cos(this.time * 7 + g.id * 1.7) > 0 ? 0.8 : -0.8;
      }
    }
  }

  private tick(dt: number) {
    this.dotTimer += dt;
    this.updateModes(dt);
    this.updatePac(dt);
    this.updateGhosts(dt);
    this.checkCollisions();
    this.updateFruit(dt);
    if (this.phase === "playing" && this.dotsLeft <= 0) this.startClear();
  }

  private updateModes(dt: number) {
    if (this.frightTimer > 0) {
      this.frightTimer -= dt;
      if (this.frightTimer <= 0) {
        this.frightTimer = 0;
        for (const g of this.ghosts) g.fright = false;
      }
      return;
    }
    if (this.modeTimer === Infinity) return;
    this.modeTimer -= dt;
    if (this.modeTimer <= 0) {
      this.modeIdx++;
      this.mode = this.mode === "scatter" ? "chase" : "scatter";
      this.modeTimer = this.scheduleTime(this.modeIdx);
      for (const g of this.ghosts) if (g.state === "active") g.reverse = true;
    }
  }

  /* ───────────────────────── pac-man ───────────────────────── */

  private pacSpeed() {
    const lvl = this.level;
    let base = lvl === 1 ? 0.8 : lvl <= 4 ? 0.9 : lvl <= 20 ? 1 : 0.9;
    if (this.frightTimer > 0) base = Math.min(1.05, base + 0.1);
    return BASE * base * this.settings.speed;
  }

  private updatePac(dt: number) {
    const p = this.pac;

    // buffer expiry
    if (p.want) {
      p.wantAge += dt;
      if (this.settings.buffer < 3000 && p.wantAge * 1000 > this.settings.buffer && !this.held.length)
        p.want = null;
    }

    // smooth render offset (after corner cutting)
    const k = Math.exp(-dt * 16);
    p.offX *= k;
    p.offY *= k;
    p.squash *= Math.exp(-dt * 12);

    let dist = this.pacSpeed() * dt;
    let moved = 0;
    let guard = 0;
    while (dist > 1e-7 && guard++ < 24) {
      const w = p.want;
      let d = p.dir;
      let moving = d.x !== 0 || d.y !== 0;

      // instant reversal anywhere
      if (w && moving && w.x === -d.x && w.y === -d.y) {
        p.dir = w;
        d = w;
      }

      const cx = Math.round(p.x);
      const cy = Math.round(p.y);
      const atC = Math.abs(p.x - cx) < 1e-6 && Math.abs(p.y - cy) < 1e-6;

      if (w && (w.x !== d.x || w.y !== d.y)) {
        if (atC) {
          if (isOpen(cx + w.x, cy + w.y)) {
            p.dir = w;
            d = w;
            moving = true;
          }
        } else if (moving && w.x * d.x + w.y * d.y === 0) {
          const along = d.x !== 0 ? (p.x - cx) * d.x : (p.y - cy) * d.y;
          if (along > 0 && along <= CUT && isOpen(cx + w.x, cy + w.y)) {
            p.offX += p.x - cx;
            p.offY += p.y - cy;
            p.x = cx;
            p.y = cy;
            p.dir = w;
            dist += along;
            continue;
          }
        }
      }

      if (atC) {
        p.x = cx;
        p.y = cy;
        if (!moving || !isOpen(cx + d.x, cy + d.y)) {
          p.dir = ZERO;
          break;
        }
      }

      const toC = atC ? 1 : distToNext(d.x !== 0 ? p.x : p.y, d.x !== 0 ? d.x : d.y);
      const step = Math.min(dist, toC);
      p.x += d.x * step;
      p.y += d.y * step;
      if (step >= toC - 1e-9) {
        if (d.x !== 0) p.x = d.x > 0 ? Math.floor(p.x + 1e-6) : Math.ceil(p.x - 1e-6);
        else p.y = d.y > 0 ? Math.floor(p.y + 1e-6) : Math.ceil(p.y - 1e-6);
      }
      dist -= step;
      moved += step;

      // tunnel wrap
      if (Math.round(p.y) === TUNNEL_ROW) {
        if (d.x > 0 && p.x >= COLS) p.x = -1;
        else if (d.x < 0 && p.x <= -1) p.x = COLS;
      }
      this.eatAt(Math.round(p.x), Math.round(p.y));
    }

    // animation
    if (moved > 0) {
      p.phase += moved * Math.PI * 1.15;
      if (this.settings.trail) {
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.22) {
          this.trail.push({ x: p.x, y: p.y });
          if (this.trail.length > 9) this.trail.shift();
        }
      }
    }
    if (p.dir.x !== 0 || p.dir.y !== 0) {
      const target = Math.atan2(p.dir.y, p.dir.x);
      p.angle += angleDiff(p.angle, target) * (1 - Math.exp(-dt * 34));
    }
  }

  private eatAt(tx: number, ty: number) {
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    const i = ty * COLS + tx;
    const c = this.grid[i];
    if (!c) return;
    this.grid[i] = 0;
    this.dotsLeft--;
    this.dotsEaten++;
    this.lifeDots++;
    this.dotTimer = 0;
    this.pac.squash = 1;
    if (c === 1) {
      this.addScore(10);
      this.sfx.waka();
      this.sparks(tx + 0.5, ty + 0.5, THEMES[this.settings.theme].dot, 3, 2.2, 0.35);
    } else {
      this.addScore(50);
      this.sfx.power();
      this.sparks(tx + 0.5, ty + 0.5, "#ffffff", 22, 5, 0.7);
      this.sparks(tx + 0.5, ty + 0.5, this.settings.pacColor, 16, 3.5, 0.8);
      this.startFright();
    }
    if (
      !this.fruit.active &&
      ((this.dotsEaten === 70 && this.fruitSpawns === 0) || (this.dotsEaten === 170 && this.fruitSpawns === 1))
    ) {
      this.fruitSpawns++;
      this.fruit = { active: true, t: 9.5, type: this.fruitIndex(this.level) };
    }
  }

  private addScore(n: number) {
    const before = this.score;
    this.score += n;
    if (this.score > this.high) {
      this.high = this.score;
    }
    if (!this.extraGiven && before < 10000 && this.score >= 10000) {
      this.extraGiven = true;
      this.lives++;
      this.sfx.extraLife();
      this.popups.push({ x: 14, y: 17.5, text: "1UP!", life: 1.4, color: "#7dff7d" });
    }
    this.emit();
  }

  private startFright() {
    const idx = Math.min(this.level, FRIGHT_TIME.length) - 1;
    const d = this.settings.difficulty;
    const mult = d === "easy" ? 1.5 : d === "hard" ? 0.6 : 1;
    const dur = FRIGHT_TIME[idx] * mult;
    this.eatChain = 0;
    for (const g of this.ghosts) {
      if (g.state === "eaten" || g.state === "entering") continue;
      if (dur > 0) g.fright = true;
      if (g.state === "active") g.reverse = true;
    }
    if (dur > 0) {
      this.frightTimer = dur;
      this.frightTotal = dur;
    }
  }

  /* ───────────────────────── ghosts ───────────────────────── */

  private ghostSpeed(g: Ghost) {
    if (g.state === "eaten" || g.state === "entering") return BASE * 1.9 * this.settings.speed;
    if (g.state === "house" || g.state === "leaving") return BASE * 0.45 * this.settings.speed;
    const lvl = this.level;
    let base = lvl === 1 ? 0.75 : lvl <= 4 ? 0.85 : 0.95;
    base *= this.diffScale();
    if (g.id === 0 && this.dotsLeft <= 20) base += this.dotsLeft <= 10 ? 0.1 : 0.05;
    let f = base;
    if (g.fright) f = 0.5 * (this.diffScale() < 1 ? 0.9 : 1);
    if (Math.round(g.y) === TUNNEL_ROW && (g.x < 5.5 || g.x > 22.5)) f = Math.min(f, 0.42);
    return BASE * f * this.settings.speed;
  }

  private releaseLimit(id: number) {
    const lvl = this.level;
    const table = lvl === 1 ? [0, 0, 30, 60] : lvl === 2 ? [0, 0, 0, 50] : [0, 0, 0, 0];
    return table[id];
  }

  private updateGhosts(dt: number) {
    // house release
    const waiting = this.ghosts.find((g) => g.state === "house");
    if (waiting) {
      const timeLimit = this.level < 5 ? 4 : 3;
      if (this.lifeDots >= this.releaseLimit(waiting.id) || this.dotTimer > timeLimit) {
        waiting.state = "leaving";
        waiting.stage = 0;
        if (this.dotTimer > timeLimit) this.dotTimer = 0;
      }
    }

    for (const g of this.ghosts) {
      const k = 1 - Math.exp(-dt * 14);
      g.lx += (g.dir.x - g.lx) * k;
      g.ly += (g.dir.y - g.ly) * k;
      const sp = this.ghostSpeed(g) * dt;

      switch (g.state) {
        case "house": {
          g.y = g.home.y + Math.sin(this.time * 7 + g.id * 1.7) * 0.28;
          g.x = g.home.x;
          g.lx = 0;
          g.ly = Math.cos(this.time * 7 + g.id * 1.7) > 0 ? 0.8 : -0.8;
          break;
        }
        case "leaving": {
          if (g.stage === 0) {
            const dx = 13.5 - g.x;
            const dy = 14 - g.y;
            g.x += Math.sign(dx) * Math.min(Math.abs(dx), sp);
            g.y += Math.sign(dy) * Math.min(Math.abs(dy), sp);
            if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) g.stage = 1;
            g.lx = Math.sign(dx) * 0.8;
            g.ly = 0;
          } else {
            g.y -= sp;
            g.lx = 0;
            g.ly = -1;
            if (g.y <= 11) {
              g.y = 11;
              g.x = 13.5;
              g.state = "active";
              g.dir = LEFT;
            }
          }
          break;
        }
        case "entering": {
          g.lx = 0;
          g.ly = 1;
          if (g.stage === 0) {
            const dx = 13.5 - g.x;
            g.x += Math.sign(dx) * Math.min(Math.abs(dx), sp);
            if (Math.abs(13.5 - g.x) < 1e-6) g.stage = 1;
          } else {
            g.y += sp;
            if (g.y >= 14) {
              g.y = 14;
              g.state = "leaving";
              g.stage = 0;
              g.fright = false;
            }
          }
          break;
        }
        default:
          this.moveGhost(g, sp);
      }
    }
  }

  private pacTile(): Vec {
    return { x: Math.round(this.pac.x), y: Math.round(this.pac.y) };
  }

  private computeTarget(g: Ghost): Vec {
    if (g.state === "eaten") return { x: 13.5, y: 11 };
    const pt = this.pacTile();
    const pd = this.pac.dir.x === 0 && this.pac.dir.y === 0 ? LEFT : this.pac.dir;
    // Blinky "Elroy" never retreats to scatter when few dots are left
    const scatter = this.mode === "scatter" && !(g.id === 0 && this.dotsLeft <= 20);
    if (scatter) return SCATTER[g.id];
    switch (g.id) {
      case 0:
        return pt;
      case 1:
        return { x: pt.x + pd.x * 4, y: pt.y + pd.y * 4 };
      case 2: {
        const b = this.ghosts[0];
        const px = pt.x + pd.x * 2;
        const py = pt.y + pd.y * 2;
        const bx = Math.round(b.x);
        const by = Math.round(b.y);
        return { x: px + (px - bx), y: py + (py - by) };
      }
      default: {
        const d = Math.hypot(g.x - pt.x, g.y - pt.y);
        return d > 8 ? pt : SCATTER[3];
      }
    }
  }

  private chooseDir(g: Ghost, cx: number, cy: number) {
    const back = { x: -g.dir.x, y: -g.dir.y };
    const hasDir = g.dir.x !== 0 || g.dir.y !== 0;
    if (g.reverse) {
      g.reverse = false;
      if (hasDir && isOpen(cx + back.x, cy + back.y)) {
        g.dir = back.x === -1 ? LEFT : back.x === 1 ? RIGHT : back.y === -1 ? UP : DOWN;
        return;
      }
    }
    const restrict = g.state === "active" && !g.fright && noUpTile(cx, cy);
    let opts = DIR_ORDER.filter(
      (d) =>
        !(hasDir && d.x === back.x && d.y === back.y) &&
        isOpen(cx + d.x, cy + d.y) &&
        !(restrict && d === UP),
    );
    if (opts.length === 0) {
      opts = DIR_ORDER.filter((d) => isOpen(cx + d.x, cy + d.y));
    }
    if (opts.length === 0) {
      g.dir = ZERO;
      return;
    }
    if (opts.length === 1) {
      g.dir = opts[0];
      return;
    }
    if (g.fright && g.state === "active") {
      g.dir = opts[Math.floor(Math.random() * opts.length)];
      return;
    }
    const t = this.computeTarget(g);
    g.target = t;
    let best = opts[0];
    let bestD = Infinity;
    for (const d of opts) {
      const dx = cx + d.x - t.x;
      const dy = cy + d.y - t.y;
      const dd = dx * dx + dy * dy;
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    g.dir = best;
  }

  private moveGhost(g: Ghost, dist: number) {
    let guard = 0;
    while (dist > 1e-7 && guard++ < 24) {
      const cx = Math.round(g.x);
      const cy = Math.round(g.y);
      const atC = Math.abs(g.x - cx) < 1e-6 && Math.abs(g.y - cy) < 1e-6;
      if (atC) {
        g.x = cx;
        g.y = cy;
        if (g.state === "eaten" && cy === 11 && (cx === 13 || cx === 14)) {
          g.state = "entering";
          g.stage = 0;
          return;
        }
        this.chooseDir(g, cx, cy);
        if (g.dir.x === 0 && g.dir.y === 0) return;
      }
      const d = g.dir;
      if (d.x === 0 && d.y === 0) return;
      const toC = atC ? 1 : distToNext(d.x !== 0 ? g.x : g.y, d.x !== 0 ? d.x : d.y);
      const step = Math.min(dist, toC);
      g.x += d.x * step;
      g.y += d.y * step;
      if (step >= toC - 1e-9) {
        if (d.x !== 0) g.x = d.x > 0 ? Math.floor(g.x + 1e-6) : Math.ceil(g.x - 1e-6);
        else g.y = d.y > 0 ? Math.floor(g.y + 1e-6) : Math.ceil(g.y - 1e-6);
      }
      dist -= step;
      if (Math.round(g.y) === TUNNEL_ROW) {
        if (d.x > 0 && g.x >= COLS) g.x = -1;
        else if (d.x < 0 && g.x <= -1) g.x = COLS;
      }
    }
  }

  /* ───────────────────────── collisions / events ───────────────────────── */

  private checkCollisions() {
    if (this.phase !== "playing") return;
    const p = this.pac;
    for (const g of this.ghosts) {
      if (g.state !== "active" && g.state !== "leaving") continue;
      if (Math.hypot(g.x - p.x, g.y - p.y) < 0.62) {
        if (g.fright) this.eatGhost(g);
        else {
          this.kill();
          return;
        }
      }
    }
  }

  private eatGhost(g: Ghost) {
    this.eatChain++;
    const pts = 200 * Math.pow(2, Math.min(this.eatChain, 4) - 1);
    this.addScore(pts);
    g.state = g.state === "leaving" ? "entering" : "eaten";
    g.stage = 0;
    g.fright = false;
    g.reverse = false;
    this.frozenGhost = g;
    this.phase = "freeze";
    this.timer = 0.55;
    const col = this.settings.ghostColors[g.id];
    this.popups.push({ x: g.x + 0.5, y: g.y + 0.5, text: String(pts), life: 1.1, color: "#5ff4ff" });
    this.sparks(g.x + 0.5, g.y + 0.5, col, 28, 7, 0.7);
    this.sparks(g.x + 0.5, g.y + 0.5, "#ffffff", 14, 5, 0.5);
    this.sfx.eatGhost();
    this.addShake(0.35);
    this.emit();
  }

  private kill() {
    this.phase = "dying";
    this.timer = DEATH_FREEZE + DEATH_ANIM + 0.7;
    this.deathBurst = false;
    this.deathSound = false;
    this.held = [];
    this.addShake(0.5);
    this.emit();
  }

  private updateDying(dt: number) {
    this.timer -= dt;
    const t = DEATH_FREEZE + DEATH_ANIM + 0.7 - this.timer;
    if (t >= DEATH_FREEZE) {
      for (const g of this.ghosts) g.hidden = true;
      if (!this.deathSound) {
        this.deathSound = true;
        this.sfx.death();
      }
    }
    if (t >= DEATH_FREEZE + DEATH_ANIM * 0.93 && !this.deathBurst) {
      this.deathBurst = true;
      const c = this.settings.pacColor;
      this.sparks(this.pac.x + 0.5, this.pac.y + 0.5, c, 40, 8, 1.1);
      this.sparks(this.pac.x + 0.5, this.pac.y + 0.5, "#ffffff", 14, 5, 0.8);
      this.addShake(0.4);
    }
    if (this.timer <= 0) {
      this.lives--;
      if (this.lives <= 0) {
        this.lives = 0;
        this.phase = "over";
        saveHigh(this.high);
      } else {
        this.resetActors();
        this.phase = "ready";
        this.timer = 1.8;
      }
      this.emit();
    }
  }

  private startClear() {
    this.phase = "clear";
    this.timer = CLEAR_TOTAL;
    this.held = [];
    this.sfx.clear();
    saveHigh(this.high);
    this.emit();
  }

  private updateFruit(dt: number) {
    const f = this.fruit;
    if (!f.active) return;
    f.t -= dt;
    if (f.t <= 0) {
      f.active = false;
      return;
    }
    if (Math.hypot(13.5 - this.pac.x, 17 - this.pac.y) < 0.8) {
      f.active = false;
      const pts = FRUIT_PTS[f.type];
      this.addScore(pts);
      this.sfx.fruit();
      this.popups.push({ x: 14, y: 17.5, text: String(pts), life: 1.4, color: "#ffb8ff" });
      this.sparks(14, 17.5, "#ffb8ff", 16, 4, 0.6);
    }
  }

  /* ───────────────────────── fx ───────────────────────── */

  private sparks(x: number, y: number, color: string, n: number, speed: number, life: number) {
    if (!this.settings.particles) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.4),
        max: life,
        size: 0.05 + Math.random() * 0.09,
        color,
        drag: 2.2,
      });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  private addShake(v: number) {
    if (this.settings.shake) this.shake = Math.max(this.shake, v);
  }

  private updateFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr;
      p.vy *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= dt * 0.8;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.trail.length && this.phase !== "playing" && this.phase !== "freeze") {
      if (Math.random() < dt * 40) this.trail.shift();
    }
  }

  /* ───────────────────────── rendering ───────────────────────── */

  private wallColor() {
    return this.settings.wallColor || THEMES[this.settings.theme].wall;
  }

  private buildWalls(color: string, fill: string): HTMLCanvasElement {
    const s = this.s;
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext("2d")!;
    ctx.scale(s, s);
    const th = THEMES[this.settings.theme];
    const b = 0.15;
    const R = 0.46;
    const wall = (x: number, y: number) => isWallForDraw(x, y);

    // pass 1: outline (outer shape)
    ctx.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (RAW[y][x] !== "#") continue;
        const up = wall(x, y - 1);
        const dn = wall(x, y + 1);
        const lf = wall(x - 1, y);
        const rt = wall(x + 1, y);
        const e = 0.004;
        rr(
          ctx,
          x - e,
          y - e,
          1 + e * 2,
          1 + e * 2,
          !up && !lf ? R : 0,
          !up && !rt ? R : 0,
          !dn && !rt ? R : 0,
          !dn && !lf ? R : 0,
        );
      }
    }
    if (this.settings.glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 0.7 * s;
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // pass 2: inner fill
    ctx.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (RAW[y][x] !== "#") continue;
        const up = wall(x, y - 1);
        const dn = wall(x, y + 1);
        const lf = wall(x - 1, y);
        const rt = wall(x + 1, y);
        const il = lf ? -0.01 : b;
        const ir = rt ? -0.01 : b;
        const it = up ? -0.01 : b;
        const ib = dn ? -0.01 : b;
        const r = Math.max(0.01, R - b);
        rr(
          ctx,
          x + il,
          y + it,
          1 - il - ir,
          1 - it - ib,
          !up && !lf ? r : 0,
          !up && !rt ? r : 0,
          !dn && !rt ? r : 0,
          !dn && !lf ? r : 0,
        );
      }
    }
    ctx.fillStyle = fill;
    ctx.fill();

    // pass 3: concave corner patches
    ctx.fillStyle = color;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (RAW[y][x] !== "#") continue;
        const up = wall(x, y - 1);
        const dn = wall(x, y + 1);
        const lf = wall(x - 1, y);
        const rt = wall(x + 1, y);
        if (up && lf && !wall(x - 1, y - 1)) ctx.fillRect(x - 0.005, y - 0.005, b + 0.005, b + 0.005);
        if (up && rt && !wall(x + 1, y - 1)) ctx.fillRect(x + 1 - b, y - 0.005, b + 0.005, b + 0.005);
        if (dn && lf && !wall(x - 1, y + 1)) ctx.fillRect(x - 0.005, y + 1 - b, b + 0.005, b + 0.005);
        if (dn && rt && !wall(x + 1, y + 1)) ctx.fillRect(x + 1 - b, y + 1 - b, b + 0.005, b + 0.005);
      }
    }

    // ghost-house door
    ctx.fillStyle = th.door;
    if (this.settings.glow) {
      ctx.shadowColor = th.door;
      ctx.shadowBlur = 0.4 * s;
    }
    ctx.fillRect(13, 12.38, 2, 0.24);
    ctx.shadowBlur = 0;
    return c;
  }

  private ensureCaches() {
    const key = `${this.settings.theme}|${this.settings.wallColor}|${this.settings.glow}|${this.canvas.width}`;
    if (key === this.cacheKey && this.wallCache) return;
    this.cacheKey = key;
    const th = THEMES[this.settings.theme];
    this.wallCache = this.buildWalls(this.wallColor(), th.fill);
    this.flashCache = this.buildWalls("#ffffff", "#1b1b3a");
  }

  private glow(color: string, blur: number) {
    if (this.settings.glow) {
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = blur * this.s;
    }
  }

  private noGlow() {
    this.ctx.shadowBlur = 0;
  }

  private render() {
    const ctx = this.ctx;
    const s = this.s;
    const th = THEMES[this.settings.theme];
    this.ensureCaches();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      const m = this.shake * 0.22;
      sx = (Math.random() - 0.5) * m;
      sy = (Math.random() - 0.5) * m;
    }
    ctx.setTransform(s, 0, 0, s, sx * s, sy * s);

    // maze
    let useFlash = false;
    if (this.phase === "clear") {
      const t = CLEAR_TOTAL - this.timer;
      if (t > CLEAR_FREEZE) useFlash = Math.floor((t - CLEAR_FREEZE) / 0.27) % 2 === 0;
    }
    ctx.drawImage(useFlash ? this.flashCache! : this.wallCache!, 0, 0, COLS, ROWS);

    if (this.phase !== "clear" || !useFlash) this.drawDots();
    this.drawFruit();
    this.drawTrail();
    this.drawActors();
    this.drawParticles();
    this.drawPopups();
    if (this.settings.showTargets) this.drawTargets();

    if (this.phase === "ready") {
      ctx.save();
      this.glow("#ffe600", 0.6);
      ctx.fillStyle = "#ffe600";
      ctx.font = `0.95px "Press Start 2P", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pulse = 0.85 + Math.sin(this.time * 8) * 0.15;
      ctx.globalAlpha = pulse;
      ctx.fillText("READY!", 14, 17.5);
      ctx.restore();
    }
  }

  private drawDots() {
    const ctx = this.ctx;
    const th = THEMES[this.settings.theme];
    const style = this.settings.dotStyle;
    ctx.fillStyle = th.dot;
    ctx.beginPath();
    const pelletPulse = 0.75 + 0.25 * Math.sin(this.time * 7);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y * COLS + x] !== 1) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (style === "round") {
          ctx.moveTo(cx + 0.11, cy);
          ctx.arc(cx, cy, 0.11, 0, Math.PI * 2);
        } else if (style === "square") {
          ctx.rect(cx - 0.1, cy - 0.1, 0.2, 0.2);
        } else {
          ctx.moveTo(cx, cy - 0.15);
          ctx.lineTo(cx + 0.15, cy);
          ctx.lineTo(cx, cy + 0.15);
          ctx.lineTo(cx - 0.15, cy);
          ctx.closePath();
        }
      }
    }
    this.glow(th.dot, 0.25);
    ctx.fill();
    this.noGlow();

    // power pellets
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.grid[y * COLS + x] !== 2) continue;
        const cx = x + 0.5;
        const cy = y + 0.5;
        const r = 0.34 * pelletPulse + 0.06;
        this.glow(th.dot, 0.9);
        ctx.fillStyle = th.dot;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        this.noGlow();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawFruit() {
    const f = this.fruit;
    if (!f.active) return;
    const ctx = this.ctx;
    ctx.save();
    const bob = Math.sin(this.time * 6) * 0.08;
    const blink = f.t < 2 && Math.floor(f.t * 6) % 2 === 0;
    if (!blink) {
      this.glow("#ffffff", 0.5);
      ctx.font = `1.25px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(FRUITS[f.type], 14, 17.5 + bob);
    }
    ctx.restore();
  }

  private drawTrail() {
    if (!this.settings.trail || !this.trail.length) return;
    if (this.phase === "dying" || this.phase === "title") return;
    const ctx = this.ctx;
    const n = this.trail.length;
    ctx.fillStyle = this.settings.pacColor;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      ctx.globalAlpha = t * 0.28;
      ctx.beginPath();
      ctx.arc(this.trail[i].x + 0.5, this.trail[i].y + 0.5, 0.68 * t * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawActors() {
    const ghostsVisible = (g: Ghost) => !g.hidden && !(this.phase === "freeze" && g === this.frozenGhost);
    this.drawPac();
    for (const g of this.ghosts) if (ghostsVisible(g)) this.drawGhost(g);
  }

  private drawPac() {
    const ctx = this.ctx;
    const p = this.pac;
    const color = this.settings.pacColor;
    const cx = p.x + p.offX + 0.5;
    const cy = p.y + p.offY + 0.5;
    const r = 0.74 * (1 + p.squash * 0.05);
    ctx.save();
    ctx.translate(cx, cy);

    if (this.phase === "dying") {
      const t = DEATH_FREEZE + DEATH_ANIM + 0.7 - this.timer;
      if (t >= DEATH_FREEZE) {
        const k = Math.min(1, (t - DEATH_FREEZE) / DEATH_ANIM);
        if (k >= 0.97) {
          ctx.restore();
          return;
        }
        const a = Math.pow(k, 0.9) * Math.PI * 0.995;
        this.glow(color, 0.9);
        ctx.fillStyle = color;
        ctx.rotate(-Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r * (1 - k * 0.15), a, Math.PI * 2 - a);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        return;
      }
    }

    const open = (1 - Math.cos(p.phase)) / 2;
    const m = 0.03 + open * 0.72;
    ctx.rotate(p.angle);
    this.glow(color, 1.0);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.18, color);
    grad.addColorStop(1, color);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, m, Math.PI * 2 - m);
    ctx.closePath();
    ctx.fill();
    this.noGlow();
    // soft highlight
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, m, Math.PI * 2 - m);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    if (this.settings.pacEye) {
      const flip = Math.cos(p.angle) < 0 ? -1 : 1;
      ctx.fillStyle = "#101010";
      ctx.beginPath();
      ctx.arc(r * 0.12, -r * 0.5 * flip, r * 0.115, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGhost(g: Ghost) {
    const ctx = this.ctx;
    const r = 0.74;
    const cx = g.x + 0.5;
    const bob = g.state === "house" ? 0 : Math.sin(this.time * 9 + g.id) * 0.025;
    const cy = g.y + 0.5 + bob - 0.02;
    const eaten = g.state === "eaten" || g.state === "entering";
    const col = this.settings.ghostColors[g.id];
    const th = THEMES[this.settings.theme];

    let body = col;
    const frightened = g.fright && !eaten;
    let flash = false;
    if (frightened) {
      const left = this.frightTimer;
      flash = left < 2 && Math.floor(left * 5) % 2 === 0;
      body = flash ? "#f4f4ff" : th.fright;
    }

    if (!eaten) {
      const base = cy + r * 0.88;
      const phase = this.time * (frightened ? 12 : 9);
      const feet = (x: number) => base + Math.abs(Math.sin(((x - cx) / r) * 1.5 * Math.PI + phase)) * r * 0.16 - r * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx - r, feet(cx - r));
      ctx.lineTo(cx - r, cy);
      ctx.arc(cx, cy, r, Math.PI, 0);
      ctx.lineTo(cx + r, feet(cx + r));
      const N = 28;
      for (let i = N; i >= 0; i--) {
        const x = cx - r + (i / N) * 2 * r;
        ctx.lineTo(x, feet(x));
      }
      ctx.closePath();
      this.glow(frightened ? (flash ? "#ffffff" : "#5a6cff") : col, 0.9);
      ctx.fillStyle = body;
      ctx.fill();
      this.noGlow();
      // body shading
      const gr = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      gr.addColorStop(0, "rgba(255,255,255,0.28)");
      gr.addColorStop(0.5, "rgba(255,255,255,0)");
      gr.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = gr;
      ctx.fill();
    }

    if (frightened) {
      const fc = flash ? "#e8343a" : "#ffd6c9";
      ctx.fillStyle = fc;
      const ey = cy - r * 0.18;
      ctx.fillRect(cx - r * 0.42 - 0.07, ey - 0.07, 0.14, 0.14);
      ctx.fillRect(cx + r * 0.42 - 0.07, ey - 0.07, 0.14, 0.14);
      ctx.strokeStyle = fc;
      ctx.lineWidth = 0.075;
      ctx.lineJoin = "miter";
      ctx.beginPath();
      const my = cy + r * 0.34;
      const w = r * 1.05;
      for (let i = 0; i <= 6; i++) {
        const x = cx - w / 2 + (i / 6) * w;
        const y = my + (i % 2 === 0 ? 0.06 : -0.06);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }

    // eyes
    const ex = r * 0.4;
    const ey = cy - r * 0.18 + g.ly * 0.04;
    const lookX = g.lx * 0.1;
    const lookY = g.ly * 0.1;
    for (const sgn of [-1, 1]) {
      const x = cx + sgn * ex + g.lx * 0.05;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(x, ey, r * 0.27, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a2bff";
      ctx.beginPath();
      ctx.arc(x + lookX, ey + lookY, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawParticles() {
    if (!this.particles.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      const sz = p.size * (0.4 + t * 0.9);
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPopups() {
    if (!this.popups.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.popups) {
      const t = Math.min(1, p.life / 0.35);
      const pop = 1 + Math.max(0, p.life - 0.9) * 2;
      ctx.globalAlpha = t;
      ctx.font = `${0.62 * pop}px "Press Start 2P", monospace`;
      this.glow(p.color, 0.5);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  private drawTargets() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.2, 0.2]);
    for (const g of this.ghosts) {
      if (g.state !== "active" || g.fright) continue;
      const c = this.settings.ghostColors[g.id];
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(g.x + 0.5, g.y + 0.5);
      const tx = Math.max(0, Math.min(COLS, g.target.x + 0.5));
      const ty = Math.max(0, Math.min(ROWS, g.target.y + 0.5));
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = c;
      ctx.fillRect(tx - 0.2, ty - 0.2, 0.4, 0.4);
      ctx.setLineDash([0.2, 0.2]);
    }
    ctx.restore();
  }
}

export { UP, LEFT, DOWN, RIGHT };
