<div align="center">

# 🟡 Neon Pac-Man 👾

### A classic arcade chase, reimagined in neon.

A customizable Pac-Man arcade game built with **React**, **TypeScript**, and **Vite**—with an offline-ready Windows desktop app powered by Electron.

[Play in your browser](#run-in-the-browser) · [Build for Windows](#build-for-windows) · [Controls](#controls)

</div>

---

## ✨ Features

- **Arcade action** — navigate the maze, evade ghosts, grab power pellets, and collect bonus fruit.
- **Make it yours** — customize themes and the colors of Pac-Man and the ghosts.
- **Sound with control** — enjoy arcade-style music and sound effects, with separate music and master volume settings.
- **Keep your best score** — high scores and settings are saved locally.
- **Play your way** — use the keyboard in your browser, or play offline in the Windows desktop app.

## 🚀 Get started

### Requirements

- [Node.js](https://nodejs.org/) **20 or newer**
- npm (included with Node.js)

### Install

```bash
git clone https://github.com/Kazesikk/neon-pacman.git
cd neon-pacman
npm install
```

### Run in the browser

Start the development server, then open the local URL printed in your terminal:

```bash
npm run dev
```

### Run the desktop app

Build the game and launch it in an Electron window:

```bash
npm start
```

### Build for Windows

Create a Windows installer in the `release/` folder:

```bash
npm run dist
```

Prefer a portable executable with no installation step?

```bash
npm run dist:portable
```

## 🎮 Controls

| Key | Action |
|:---|:---|
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Move |
| <kbd>P</kbd> | Pause / resume |
| <kbd>M</kbd> | Mute / unmute all sound |
| <kbd>-</kbd> / <kbd>+</kbd> | Decrease / increase volume |
| <kbd>Esc</kbd> | Open settings |
| <kbd>F11</kbd> | Toggle fullscreen in the desktop app |

## 🧩 Project structure

```text
electron/main.cjs     Electron main process and window setup
src/App.tsx           Game UI, HUD, and screens
src/game/engine.ts    Game loop, ghosts, and rendering
src/game/maze.ts      Maze layout
src/game/settings.ts  Themes and saved settings
src/game/audio.ts     Music and sound effects
build/icon.png        Desktop app icon
```

## 🛠️ Built with

React · TypeScript · Vite · Tailwind CSS · Electron

## 📄 License

Released under the MIT License — made by [Kazesikk](https://github.com/Kazesikk).
