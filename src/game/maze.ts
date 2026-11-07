export interface Vec {
  x: number;
  y: number;
}

export const COLS = 28;
export const ROWS = 31;
export const TUNNEL_ROW = 14;

export const UP: Vec = { x: 0, y: -1 };
export const LEFT: Vec = { x: -1, y: 0 };
export const DOWN: Vec = { x: 0, y: 1 };
export const RIGHT: Vec = { x: 1, y: 0 };
export const ZERO: Vec = { x: 0, y: 0 };

// Tie-break priority used by the original ghosts
export const DIR_ORDER: Vec[] = [UP, LEFT, DOWN, RIGHT];

export const RAW: string[] = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##### ## #####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......  .......##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

export const WALL: boolean[][] = RAW.map((row) =>
  row.split("").map((c) => c === "#"),
);

/** Grid walkability for normal movement (ghost door counts as blocked). */
export function isOpen(tx: number, ty: number): boolean {
  if (ty === TUNNEL_ROW && (tx < 0 || tx >= COLS)) return true;
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;
  const c = RAW[ty][tx];
  return c !== "#" && c !== "-";
}

/** Wall check for rendering (out of bounds counts as wall). */
export function isWallForDraw(tx: number, ty: number): boolean {
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true;
  return WALL[ty][tx];
}

/** Ghosts may not turn upwards at these junctions (classic rule). */
export function noUpTile(tx: number, ty: number): boolean {
  return (tx === 12 || tx === 15) && (ty === 11 || ty === 23);
}

export function buildGrid(): { grid: Uint8Array; dots: number } {
  const grid = new Uint8Array(COLS * ROWS);
  let dots = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = RAW[y][x];
      if (c === ".") {
        grid[y * COLS + x] = 1;
        dots++;
      } else if (c === "o") {
        grid[y * COLS + x] = 2;
        dots++;
      }
    }
  }
  return { grid, dots };
}
