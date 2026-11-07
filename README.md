# Neon Pac-Man

A customizable neon arcade Pac-Man game built with React, TypeScript, Vite and Tailwind CSS, packaged as a Windows desktop app with Electron.

Made by [Kazesikk](https://github.com/Kazesikk)

## Features

- Smooth arcade gameplay with ghosts, power pellets and bonus fruit
- Settings panel for themes and colors (Pac-Man and ghost colors)
- Sound effects and an original arcade-style music loop, with separate music and master volume
- High score saved locally
- Keyboard controls: Arrow keys or WASD
- Desktop app: runs offline, `F11` toggles fullscreen

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer
- npm

## Getting started

```bash
git clone https://github.com/Kazesikk/neon-pacman.git
cd neon-pacman
npm install
```

### Run in the browser (dev mode)

```bash
npm run dev
```

### Run as a desktop app

```bash
npm start
```

This builds the game and opens it in an Electron window.

### Build a Windows installer

```bash
npm run dist
```

The installer (`.exe`) is created in the `release/` folder.
For a single portable `.exe` with no install step, use `npm run dist:portable`.

## Project structure

```
electron/main.cjs     Electron main process (window, external links)
src/App.tsx           UI, HUD and screens
src/game/engine.ts    Game loop, ghosts, rendering
src/game/maze.ts      Maze layout
src/game/settings.ts  Themes and saved settings
src/game/audio.ts     Sound effects
build/icon.png        App icon
```

## Controls

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Move |
| P | Pause |
| M | Mute / unmute all sound |
| - / + | Volume down / up |
| Esc | Open the settings panel |
| F11 | Toggle fullscreen (desktop app) |

## License

MIT - made by [Kazesikk](https://github.com/Kazesikk)
