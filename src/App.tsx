import { useCallback, useEffect, useRef, useState } from "react";
import { Game, type Hud } from "./game/engine";
import { UP, DOWN, LEFT, RIGHT, COLS, ROWS, type Vec } from "./game/maze";
import { DEFAULTS, THEMES, loadSettings, saveSettings, type Settings } from "./game/settings";
import SettingsPanel from "./components/SettingsPanel";

const KEYMAP: Record<string, Vec> = {
  ArrowUp: UP,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
  KeyW: UP,
  KeyS: DOWN,
  KeyA: LEFT,
  KeyD: RIGHT,
};

const INITIAL_HUD: Hud = {
  score: 0,
  high: 0,
  lives: 3,
  level: 1,
  phase: "title",
  paused: false,
  fruits: [],
};

function PacIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ filter: `drop-shadow(0 0 4px ${color}aa)` }}>
      <path d="M20 20 L35 10 A18 18 0 1 0 35 30 Z" fill={color} />
    </svg>
  );
}

function ChaseBanner({ settings }: { settings: Settings }) {
  return (
    <div className="relative mx-auto h-12 w-full max-w-sm overflow-hidden">
      <div className="chase absolute left-0 top-1 flex items-center gap-2">
        <svg width="40" height="40" viewBox="0 0 40 40" style={{ filter: `drop-shadow(0 0 6px ${settings.pacColor})` }}>
          <path fill={settings.pacColor}>
            <animate
              attributeName="d"
              dur="0.32s"
              repeatCount="indefinite"
              values="M20 20 L36.5 9 A18 18 0 1 0 36.5 31 Z;M20 20 L38 19.5 A18 18 0 1 0 38 20.5 Z;M20 20 L36.5 9 A18 18 0 1 0 36.5 31 Z"
            />
          </path>
          <circle cx="22" cy="10" r="2.2" fill="#111" />
        </svg>
        {settings.ghostColors.map((c, i) => (
          <svg
            key={i}
            width="34"
            height="34"
            viewBox="0 0 24 24"
            className="ghost-wobble"
            style={{ filter: `drop-shadow(0 0 6px ${c})`, animationDelay: `${i * 0.08}s`, marginLeft: i === 0 ? 14 : 0 }}
          >
            <path d="M3 22V11a9 9 0 0 1 18 0v11l-3-2.4-3 2.4-3-2.4-3 2.4-3-2.4z" fill={c} />
            <circle cx="9" cy="11" r="2.6" fill="#fff" />
            <circle cx="15" cy="11" r="2.6" fill="#fff" />
            <circle cx="10.3" cy="11.3" r="1.2" fill="#1a2bff" />
            <circle cx="16.3" cy="11.3" r="1.2" fill="#1a2bff" />
          </svg>
        ))}
      </div>
    </div>
  );
}

function DPad({ onPress, onRelease }: { onPress: (d: Vec) => void; onRelease: (d: Vec) => void }) {
  const btn = (d: Vec, label: string, cls: string) => (
    <button
      type="button"
      aria-label={label}
      className={`flex h-14 w-14 touch-none select-none items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-2xl text-white active:bg-white/30 ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress(d);
      }}
      onPointerUp={() => onRelease(d)}
      onPointerLeave={() => onRelease(d)}
      onPointerCancel={() => onRelease(d)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
  return (
    <div className="mx-auto mt-2 hidden grid-cols-3 grid-rows-3 gap-1 [@media(pointer:coarse)]:grid">
      <span />
      {btn(UP, "▲", "")}
      <span />
      {btn(LEFT, "◀", "")}
      <span />
      {btn(RIGHT, "▶", "")}
      <span />
      {btn(DOWN, "▼", "")}
      <span />
    </div>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const settingsRef = useRef<Settings>(loadSettings());
  const hudRef = useRef<Hud>(INITIAL_HUD);
  const panelRef = useRef(false);

  const [settings, setSettings] = useState<Settings>(settingsRef.current);
  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [panelOpen, setPanelOpen] = useState(false);
  const [size, setSize] = useState(480);

  const theme = THEMES[settings.theme];
  const wallColor = settings.wallColor || theme.wall;

  /* ── game setup ── */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const game = new Game(canvas, settingsRef.current, (h) => {
      hudRef.current = h;
      setHud(h);
    });
    gameRef.current = game;
    game.resize(canvas.clientWidth || 480, window.devicePixelRatio || 1);
    game.start();
    return () => game.destroy();
  }, []);

  /* ── responsive sizing ── */
  useEffect(() => {
    const stage = stageRef.current!;
    const calc = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const reserve = coarse ? 100 + 150 : 108;
      const w = stage.clientWidth - 16;
      const h = stage.clientHeight - reserve;
      const sz = Math.max(260, Math.floor(Math.min(w, (h * COLS) / ROWS)));
      setSize(sz);
      gameRef.current?.resize(sz, Math.min(window.devicePixelRatio || 1, 2.5));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(stage);
    window.addEventListener("resize", calc);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, []);

  /* ── settings ── */
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
    const g = gameRef.current;
    if (g) {
      g.setSettings(next);
      if (hudRef.current.phase === "title" && ("ghostCount" in patch || "lives" in patch)) g.toTitle();
    }
  }, []);

  const resetSettings = useCallback(() => {
    updateSettings({ ...DEFAULTS, ghostColors: [...DEFAULTS.ghostColors] });
  }, [updateSettings]);

  /* ── actions ── */
  const openPanel = useCallback((open: boolean) => {
    panelRef.current = open;
    setPanelOpen(open);
    const g = gameRef.current;
    if (!g) return;
    g.clearHeld();
    if (open) g.setPaused(true);
  }, []);

  const startGame = useCallback(() => {
    gameRef.current?.newGame();
  }, []);

  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.sfx.unlock();
    g.clearHeld();
    g.setPaused(!g.paused);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  const changeVolume = useCallback(
    (delta: number) => {
      const v = Math.min(1, Math.max(0, Math.round((settingsRef.current.volume + delta) * 10) / 10));
      gameRef.current?.sfx.unlock();
      updateSettings({ volume: v });
    },
    [updateSettings],
  );

  /* ── keyboard ── */
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      if (e.code === "Escape") {
        e.preventDefault();
        openPanel(!panelRef.current);
        return;
      }
      if (panelRef.current) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT")) return;

      const dir = KEYMAP[e.code];
      if (dir) {
        e.preventDefault();
        g.sfx.unlock();
        if (!e.repeat && !g.paused) g.press(dir);
        return;
      }
      const phase = hudRef.current.phase;
      if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        if (phase === "title" || phase === "over") startGame();
        else togglePause();
        return;
      }
      if (e.code === "KeyP") {
        if (phase !== "title" && phase !== "over") togglePause();
        return;
      }
      if (e.code === "KeyM") {
        const cur = settingsRef.current;
        const on = cur.sound || cur.music;
        updateSettings({ sound: !on, music: !on });
        return;
      }
      if (e.code === "Minus" || e.code === "NumpadSubtract") {
        changeVolume(-0.1);
        return;
      }
      if (e.code === "Equal" || e.code === "NumpadAdd") {
        changeVolume(0.1);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const dir = KEYMAP[e.code];
      if (dir) gameRef.current?.release(dir);
    };
    const onBlur = () => {
      const g = gameRef.current;
      if (!g) return;
      g.clearHeld();
      g.setPaused(true);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    const onVis = () => {
      if (document.hidden) onBlur();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [openPanel, startGame, togglePause, updateSettings, changeVolume]);

  /* ── swipe ── */
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
    gameRef.current?.sfx.unlock();
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP;
    const g = gameRef.current;
    if (g && !g.paused) {
      g.clearHeld();
      g.press(dir);
      g.release(dir); // keep as buffered want only
    }
    touch.current = { x: t.clientX, y: t.clientY };
  };

  const livesShown = hud.phase === "title" ? settings.lives : hud.lives;
  const isOverlayPhase = hud.phase === "title" || hud.phase === "over";
  const showPause = hud.paused && !panelOpen && !isOverlayPhase;

  const pixel = { fontFamily: '"Press Start 2P", ui-monospace, monospace' } as const;

  return (
    <div
      className="relative flex h-dvh w-full flex-col items-center overflow-hidden text-white"
      style={
        {
          background: `radial-gradient(ellipse at 50% 35%, ${wallColor}26 0%, ${theme.bg} 62%)`,
          "--accent": theme.accent,
        } as React.CSSProperties
      }
    >
      {/* floating toolbar */}
      <div className="absolute right-3 top-3 z-30 flex gap-2">
        {!isOverlayPhase && (
          <button
            onClick={togglePause}
            className="rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white/80 backdrop-blur transition hover:bg-white/15"
            title="Pause (P)"
          >
            {hud.paused ? "▶" : "❚❚"}
          </button>
        )}
        <div className="flex items-center rounded-xl border border-white/15 bg-black/40 text-sm text-white/80 backdrop-blur">
          <button
            onClick={() => changeVolume(-0.1)}
            className="rounded-l-xl px-3 py-2 transition hover:bg-white/15"
            title="Volume down (-)"
          >
            −
          </button>
          <button
            onClick={() => updateSettings({ sound: !(settings.sound || settings.music), music: !(settings.sound || settings.music) })}
            className="min-w-[4.2rem] px-1 py-2 text-center transition hover:bg-white/15"
            title="Mute / unmute (M)"
          >
            {settings.sound || settings.music ? "🔊" : "🔇"} {Math.round(settings.volume * 100)}%
          </button>
          <button
            onClick={() => changeVolume(0.1)}
            className="rounded-r-xl px-3 py-2 transition hover:bg-white/15"
            title="Volume up (+)"
          >
            +
          </button>
        </div>
        <button
          onClick={() => openPanel(true)}
          className="rounded-xl border border-white/15 bg-black/40 px-3.5 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-white/15"
          title="Customize (Esc)"
        >
          ⚙ <span className="hidden sm:inline">Customize</span>
        </button>
      </div>

      <div ref={stageRef} className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        <div style={{ width: size }} className="select-none">
          {/* HUD */}
          <div className="mb-2 flex items-end justify-between px-1" style={{ ...pixel, fontSize: Math.max(9, size / 44) }}>
            <div>
              <div className="text-white/60">1UP</div>
              <div className="mt-1.5 tabular-nums" style={{ color: theme.accent }}>
                {String(hud.score).padStart(6, "0")}
              </div>
            </div>
            <div className="text-center">
              <div className="text-white/60">HIGH SCORE</div>
              <div className="mt-1.5 tabular-nums text-white">{String(hud.high).padStart(6, "0")}</div>
            </div>
            <div className="text-right">
              <div className="text-white/60">LEVEL</div>
              <div className="mt-1.5 tabular-nums text-white">{String(hud.level).padStart(2, "0")}</div>
            </div>
          </div>

          {/* playfield */}
          <div
            className="relative touch-none overflow-hidden rounded-2xl"
            style={{
              width: size,
              height: (size * ROWS) / COLS,
              boxShadow: `0 0 0 1px ${wallColor}33, 0 0 60px ${wallColor}30`,
              background: theme.bg,
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
          >
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

            {settings.scanlines && <div className="scanlines pointer-events-none absolute inset-0" />}
            {settings.scanlines && <div className="vignette pointer-events-none absolute inset-0" />}

            {/* Title */}
            {hud.phase === "title" && !panelOpen && (
              <div className="overlay-in absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/65 p-4 text-center backdrop-blur-[2px]">
                <ChaseBanner settings={settings} />
                <div>
                  <h1
                    className="title-glow leading-tight"
                    style={{
                      ...pixel,
                      fontSize: Math.max(24, size / 12),
                      color: settings.pacColor,
                      textShadow: `0 0 18px ${settings.pacColor}, 0 0 40px ${settings.pacColor}66`,
                    }}
                  >
                    PAC-MAN
                  </h1>
                  <p className="mt-3 tracking-[0.35em] text-white/60" style={{ ...pixel, fontSize: Math.max(8, size / 56) }}>
                    NEON EDITION
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2.5">
                  <button
                    onClick={startGame}
                    className="btn-pulse rounded-xl px-8 py-3 text-black transition hover:scale-105 active:scale-95"
                    style={{ ...pixel, fontSize: 13, background: settings.pacColor, boxShadow: `0 0 24px ${settings.pacColor}88` }}
                  >
                    ▶ PLAY
                  </button>
                  <button
                    onClick={() => openPanel(true)}
                    className="rounded-xl border border-white/25 bg-white/5 px-6 py-2.5 text-sm text-white/90 transition hover:bg-white/15"
                  >
                    ⚙ Customize
                  </button>
                </div>
                <div className="space-y-1 text-[11px] leading-relaxed text-white/50">
                  <p>
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                    <Kbd>←</Kbd>
                    <Kbd>→</Kbd> or <Kbd>W</Kbd>
                    <Kbd>A</Kbd>
                    <Kbd>S</Kbd>
                    <Kbd>D</Kbd> to move · swipe on touch
                  </p>
                  <p>
                    <Kbd>Enter</Kbd> start · <Kbd>P</Kbd> pause · <Kbd>M</Kbd> mute · <Kbd>-</Kbd>/<Kbd>+</Kbd> volume · <Kbd>Esc</Kbd> customize
                  </p>
                </div>
              </div>
            )}

            {/* Game over */}
            {hud.phase === "over" && !panelOpen && (
              <div className="overlay-in absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 p-4 text-center backdrop-blur-[2px]">
                <h2
                  style={{ ...pixel, fontSize: Math.max(20, size / 16), color: "#ff3b3b", textShadow: "0 0 20px #ff3b3b" }}
                >
                  GAME OVER
                </h2>
                <div className="space-y-2" style={{ ...pixel, fontSize: 11 }}>
                  <p className="text-white/60">SCORE</p>
                  <p className="text-xl" style={{ color: theme.accent }}>
                    {hud.score}
                  </p>
                  {hud.score > 0 && hud.score >= hud.high && (
                    <p className="blink text-[10px] text-[#7dff7d]">★ NEW HIGH SCORE ★</p>
                  )}
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={startGame}
                    className="btn-pulse rounded-xl px-6 py-3 text-black transition hover:scale-105 active:scale-95"
                    style={{ ...pixel, fontSize: 11, background: settings.pacColor }}
                  >
                    ↻ AGAIN
                  </button>
                  <button
                    onClick={() => openPanel(true)}
                    className="rounded-xl border border-white/25 bg-white/5 px-4 py-2.5 text-sm text-white/90 transition hover:bg-white/15"
                  >
                    ⚙
                  </button>
                  <button
                    onClick={() => gameRef.current?.toTitle()}
                    className="rounded-xl border border-white/25 bg-white/5 px-4 py-2.5 text-sm text-white/90 transition hover:bg-white/15"
                  >
                    Menu
                  </button>
                </div>
              </div>
            )}

            {/* Paused */}
            {showPause && (
              <div className="overlay-in absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/60 backdrop-blur-sm">
                <h2 style={{ ...pixel, fontSize: Math.max(18, size / 18), color: theme.accent, textShadow: `0 0 16px ${theme.accent}` }}>
                  PAUSED
                </h2>
                <div className="flex gap-2.5">
                  <button
                    onClick={togglePause}
                    className="rounded-xl px-6 py-3 text-black transition hover:scale-105 active:scale-95"
                    style={{ ...pixel, fontSize: 11, background: settings.pacColor }}
                  >
                    ▶ RESUME
                  </button>
                  <button
                    onClick={() => openPanel(true)}
                    className="rounded-xl border border-white/25 bg-white/5 px-4 py-2.5 text-sm text-white/90 transition hover:bg-white/15"
                  >
                    ⚙ Customize
                  </button>
                  <button
                    onClick={() => gameRef.current?.toTitle()}
                    className="rounded-xl border border-white/25 bg-white/5 px-4 py-2.5 text-sm text-white/90 transition hover:bg-white/15"
                  >
                    Quit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* footer: lives + fruits */}
          <div className="mt-2.5 flex h-8 items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.max(0, livesShown) }).map((_, i) => (
                <PacIcon key={i} color={settings.pacColor} size={Math.max(18, size / 22)} />
              ))}
            </div>
            <div className="flex items-center gap-1" style={{ fontSize: Math.max(16, size / 24) }}>
              {hud.fruits.map((f, i) => (
                <span key={i}>{f}</span>
              ))}
            </div>
          </div>

          <DPad onPress={(d) => gameRef.current?.press(d)} onRelease={(d) => gameRef.current?.release(d)} />
        </div>
      </div>

      {panelOpen && (
        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          onReset={resetSettings}
          onClose={() => openPanel(false)}
        />
      )}
      <a
        href="https://github.com/Kazesikk"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-2 left-3 z-50 select-none text-[11px] text-white/50 transition hover:text-white/90 hover:underline"
        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        made by Kazesikk
      </a>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block min-w-[1.4em] rounded border border-white/25 bg-white/10 px-1 py-px text-center font-mono text-[10px] text-white/80">
      {children}
    </kbd>
  );
}
