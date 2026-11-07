export interface Theme {
  name: string;
  bg: string;
  wall: string;
  fill: string;
  dot: string;
  door: string;
  fright: string;
  accent: string;
}

export const THEMES: Record<string, Theme> = {
  neon: {
    name: "Classic Neon",
    bg: "#02020c",
    wall: "#2f3cff",
    fill: "#05051f",
    dot: "#ffd9c7",
    door: "#ffb8ff",
    fright: "#2430e0",
    accent: "#ffe600",
  },
  cyber: {
    name: "Cyberpunk",
    bg: "#07000f",
    wall: "#ff2bd6",
    fill: "#1a0430",
    dot: "#00f0ff",
    door: "#00f0ff",
    fright: "#7a2cff",
    accent: "#00f0ff",
  },
  emerald: {
    name: "Emerald",
    bg: "#010a06",
    wall: "#19e68c",
    fill: "#03170f",
    dot: "#d6ffe9",
    door: "#8dffd0",
    fright: "#0b8f5a",
    accent: "#19e68c",
  },
  sunset: {
    name: "Sunset",
    bg: "#10040a",
    wall: "#ff7a45",
    fill: "#24090f",
    dot: "#ffd166",
    door: "#ffd166",
    fright: "#6a2cb0",
    accent: "#ff7a45",
  },
  ice: {
    name: "Ice",
    bg: "#02070f",
    wall: "#5ad1ff",
    fill: "#041527",
    dot: "#e6f8ff",
    door: "#b8ecff",
    fright: "#2a63e0",
    accent: "#5ad1ff",
  },
  gameboy: {
    name: "Handheld",
    bg: "#0b2a0b",
    wall: "#9bbc0f",
    fill: "#0f380f",
    dot: "#c4dc5a",
    door: "#8bac0f",
    fright: "#306230",
    accent: "#9bbc0f",
  },
};

export type Difficulty = "easy" | "normal" | "hard";
export type DotStyle = "round" | "square" | "diamond";

export interface Settings {
  theme: string;
  wallColor: string; // "" = use theme colour
  pacColor: string;
  pacEye: boolean;
  trail: boolean;
  ghostColors: string[];
  dotStyle: DotStyle;
  glow: boolean;
  scanlines: boolean;
  particles: boolean;
  shake: boolean;
  showTargets: boolean;
  speed: number;
  difficulty: Difficulty;
  lives: number;
  ghostCount: number;
  buffer: number; // input buffer ms
  sound: boolean;
  volume: number;
  music: boolean;
  musicVolume: number;
}

export const DEFAULTS: Settings = {
  theme: "neon",
  wallColor: "",
  pacColor: "#ffe600",
  pacEye: true,
  trail: true,
  ghostColors: ["#ff2d2d", "#ffb8ff", "#00e5ff", "#ffb852"],
  dotStyle: "round",
  glow: true,
  scanlines: false,
  particles: true,
  shake: true,
  showTargets: false,
  speed: 1,
  difficulty: "normal",
  lives: 3,
  ghostCount: 4,
  buffer: 1200,
  sound: true,
  volume: 0.5,
  music: true,
  musicVolume: 0.6,
};

const KEY = "pacman-neon-settings-v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, ghostColors: [...DEFAULTS.ghostColors] };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...parsed };
    merged.ghostColors = DEFAULTS.ghostColors.map(
      (c, i) => (parsed.ghostColors && parsed.ghostColors[i]) || c,
    );
    if (!THEMES[merged.theme]) merged.theme = "neon";
    return merged;
  } catch {
    return { ...DEFAULTS, ghostColors: [...DEFAULTS.ghostColors] };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadHigh(): number {
  try {
    return parseInt(localStorage.getItem("pacman-neon-high") || "0", 10) || 0;
  } catch {
    return 0;
  }
}

export function saveHigh(n: number) {
  try {
    localStorage.setItem("pacman-neon-high", String(n));
  } catch {
    /* ignore */
  }
}
