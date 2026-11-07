import { useState, type ReactNode } from "react";
import { THEMES, DEFAULTS, type Settings } from "../game/settings";
import { GHOST_NAMES } from "../game/engine";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  onClose: () => void;
}

const PAC_PRESETS = ["#ffe600", "#ff9f1c", "#ff5d8f", "#4dffa6", "#5ad1ff", "#c77dff", "#ffffff"];

const GHOST_PALETTES: { name: string; colors: string[] }[] = [
  { name: "Classic", colors: ["#ff2d2d", "#ffb8ff", "#00e5ff", "#ffb852"] },
  { name: "Candy", colors: ["#ff6b9d", "#ffc2e2", "#a0e7ff", "#fff3a3"] },
  { name: "Toxic", colors: ["#b6ff00", "#00ffa3", "#f5ff3d", "#00d9ff"] },
  { name: "Shadow", colors: ["#9aa0b5", "#7a809a", "#c4c9db", "#5b6178"] },
  { name: "Sunset", colors: ["#ff4d4d", "#ff8c42", "#ffd23f", "#c34cff"] },
];

const TABS = ["Look", "Characters", "Gameplay", "FX & Sound"] as const;
type Tab = (typeof TABS)[number];

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">{title}</h3>
        {hint && <p className="mt-1 text-[11px] leading-snug text-white/35">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-left transition hover:bg-white/[0.08]"
    >
      <span>
        <span className="block text-sm text-white/90">{label}</span>
        {desc && <span className="block text-[11px] text-white/40">{desc}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? "bg-[var(--accent)]" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-white/90">{label}</span>
        <span className="font-mono text-xs text-[var(--accent)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-sm transition ${
            o.value === value
              ? "bg-[var(--accent)] font-semibold text-black"
              : "text-white/70 hover:bg-white/10"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative block h-9 w-12 cursor-pointer overflow-hidden rounded-lg border border-white/20">
      <span className="absolute inset-0" style={{ background: value }} />
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function GhostIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" style={{ filter: `drop-shadow(0 0 5px ${color})` }}>
      <path d="M3 22V11a9 9 0 0 1 18 0v11l-3-2.4-3 2.4-3-2.4-3 2.4-3-2.4z" fill={color} />
      <circle cx="9" cy="11" r="2.6" fill="#fff" />
      <circle cx="15" cy="11" r="2.6" fill="#fff" />
      <circle cx="9.8" cy="11.4" r="1.2" fill="#1a2bff" />
      <circle cx="15.8" cy="11.4" r="1.2" fill="#1a2bff" />
    </svg>
  );
}

export default function SettingsPanel({ settings, onChange, onReset, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("Look");
  const set = onChange;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 sm:bg-transparent" onClick={onClose} />
      <aside className="panel-in relative flex h-full w-full max-w-[380px] flex-col border-l border-white/10 bg-[#0b0b14]/95 shadow-2xl backdrop-blur-xl">
        <header className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Customize</h2>
            <p className="text-xs text-white/40">Changes apply instantly &amp; are saved</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/10"
          >
            Done ✕
          </button>
        </header>

        <nav className="mx-5 mb-2 flex gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-1 py-1.5 text-[12px] transition ${
                t === tab ? "bg-white/15 font-semibold text-white" : "text-white/55 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6 pt-3">
          {tab === "Look" && (
            <>
              <Section title="Maze theme">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(THEMES).map(([id, th]) => (
                    <button
                      key={id}
                      onClick={() => set({ theme: id })}
                      className={`group rounded-xl border p-2 text-left transition ${
                        settings.theme === id
                          ? "border-[var(--accent)] bg-white/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"
                      }`}
                    >
                      <div
                        className="relative mb-2 h-12 overflow-hidden rounded-lg"
                        style={{ background: th.bg, boxShadow: `inset 0 0 0 1px ${th.wall}55` }}
                      >
                        <div
                          className="absolute left-2 top-2 h-4 w-12 rounded-md"
                          style={{ border: `2px solid ${th.wall}`, background: th.fill, boxShadow: `0 0 8px ${th.wall}88` }}
                        />
                        <div
                          className="absolute bottom-2 left-2 h-4 w-8 rounded-md"
                          style={{ border: `2px solid ${th.wall}`, background: th.fill }}
                        />
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className="absolute h-1.5 w-1.5 rounded-full"
                            style={{ background: th.dot, right: 8 + i * 12, bottom: 10 }}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-white/85">{th.name}</span>
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Wall colour" hint="Override the theme's wall colour with your own.">
                <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <ColorField
                    value={settings.wallColor || THEMES[settings.theme].wall}
                    onChange={(v) => set({ wallColor: v })}
                  />
                  <span className="flex-1 text-sm text-white/70">
                    {settings.wallColor ? settings.wallColor.toUpperCase() : "Theme default"}
                  </span>
                  {settings.wallColor && (
                    <button
                      onClick={() => set({ wallColor: "" })}
                      className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </Section>

              <Section title="Pellet style">
                <Segmented
                  value={settings.dotStyle}
                  onChange={(v) => set({ dotStyle: v })}
                  options={[
                    { label: "● Round", value: "round" },
                    { label: "■ Square", value: "square" },
                    { label: "◆ Diamond", value: "diamond" },
                  ]}
                />
              </Section>
            </>
          )}

          {tab === "Characters" && (
            <>
              <Section title="Pac-Man colour">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  {PAC_PRESETS.map((c) => (
                    <button
                      key={c}
                      onClick={() => set({ pacColor: c })}
                      aria-label={c}
                      className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${
                        settings.pacColor.toLowerCase() === c ? "border-white" : "border-transparent"
                      }`}
                      style={{ background: c, boxShadow: `0 0 10px ${c}88` }}
                    />
                  ))}
                  <ColorField value={settings.pacColor} onChange={(v) => set({ pacColor: v })} />
                </div>
                <Toggle label="Eye" desc="Give Pac-Man an eye" value={settings.pacEye} onChange={(v) => set({ pacEye: v })} />
                <Toggle
                  label="Motion trail"
                  desc="Glowing afterimage behind Pac-Man"
                  value={settings.trail}
                  onChange={(v) => set({ trail: v })}
                />
              </Section>

              <Section title="Ghost colours">
                <div className="flex flex-wrap gap-1.5">
                  {GHOST_PALETTES.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => set({ ghostColors: [...p.colors] })}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
                    >
                      <span className="flex -space-x-1">
                        {p.colors.map((c, i) => (
                          <span key={i} className="h-3 w-3 rounded-full border border-black/40" style={{ background: c }} />
                        ))}
                      </span>
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {settings.ghostColors.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                    >
                      <GhostIcon color={c} />
                      <span className="flex-1 text-sm text-white/85">{GHOST_NAMES[i]}</span>
                      <span className="font-mono text-[11px] text-white/40">{c.toUpperCase()}</span>
                      <ColorField
                        value={c}
                        onChange={(v) => {
                          const next = [...settings.ghostColors];
                          next[i] = v;
                          set({ ghostColors: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {tab === "Gameplay" && (
            <>
              <Section title="Difficulty" hint="Affects ghost speed, scatter/chase timing and power-pellet duration.">
                <Segmented
                  value={settings.difficulty}
                  onChange={(v) => set({ difficulty: v })}
                  options={[
                    { label: "Easy", value: "easy" },
                    { label: "Normal", value: "normal" },
                    { label: "Hard", value: "hard" },
                  ]}
                />
              </Section>

              <Section title="Game speed">
                <Slider
                  label="Speed"
                  value={settings.speed}
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => set({ speed: v })}
                />
              </Section>

              <Section title="Controls feel" hint="How long a turn you queue early is remembered.">
                <Slider
                  label="Turn buffer"
                  value={settings.buffer}
                  min={100}
                  max={3000}
                  step={50}
                  format={(v) => (v >= 3000 ? "Forever" : `${v} ms`)}
                  onChange={(v) => set({ buffer: v })}
                />
              </Section>

              <Section title="New game rules" hint="Applied the next time you start a game.">
                <div>
                  <div className="mb-1.5 text-sm text-white/80">Lives</div>
                  <Segmented
                    value={settings.lives}
                    onChange={(v) => set({ lives: v })}
                    options={[1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }))}
                  />
                </div>
                <div>
                  <div className="mb-1.5 text-sm text-white/80">Ghosts</div>
                  <Segmented
                    value={settings.ghostCount}
                    onChange={(v) => set({ ghostCount: v })}
                    options={[1, 2, 3, 4].map((n) => ({ label: String(n), value: n }))}
                  />
                </div>
              </Section>

              <Section title="Assist">
                <Toggle
                  label="Show ghost targets"
                  desc="See what each ghost is chasing"
                  value={settings.showTargets}
                  onChange={(v) => set({ showTargets: v })}
                />
              </Section>
            </>
          )}

          {tab === "FX & Sound" && (
            <>
              <Section title="Visual effects">
                <Toggle label="Neon glow" desc="Bloom on walls, sprites & pellets" value={settings.glow} onChange={(v) => set({ glow: v })} />
                <Toggle label="Particles" desc="Sparks, bursts & explosions" value={settings.particles} onChange={(v) => set({ particles: v })} />
                <Toggle label="Screen shake" value={settings.shake} onChange={(v) => set({ shake: v })} />
                <Toggle label="CRT scanlines" desc="Retro monitor overlay" value={settings.scanlines} onChange={(v) => set({ scanlines: v })} />
              </Section>
              <Section title="Audio">
                <Toggle label="Sound effects" value={settings.sound} onChange={(v) => set({ sound: v })} />
                <Slider
                  label="Master volume"
                  value={settings.volume}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => set({ volume: v })}
                />
                <Toggle label="Music" desc="Arcade loop while you play" value={settings.music} onChange={(v) => set({ music: v })} />
                <Slider
                  label="Music volume"
                  value={settings.musicVolume}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => set({ musicVolume: v })}
                />
              </Section>
            </>
          )}
        </div>

        <footer className="border-t border-white/10 px-5 py-3">
          <button
            onClick={onReset}
            className="w-full rounded-xl border border-white/15 py-2 text-sm text-white/70 transition hover:bg-white/10"
          >
            Reset everything to defaults
          </button>
        </footer>
      </aside>
    </div>
  );
}

export { DEFAULTS };
