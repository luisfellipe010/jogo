# Blip's Grove 🌿

An **open-source** 2D pixel-art platformer built entirely in **vanilla JavaScript** on an HTML5 canvas — no frameworks, no build system, no dependencies (except [PeerJS](https://peerjs.com/) loaded from a CDN for online multiplayer). MIT-licensed: fork it, mod it, learn from it.

Run, jump, dash, and stomp through four hand-crafted biomes, fight a three-phase boss, then keep going with procedurally generated infinite levels, an in-game level editor, online co-op, and more.

**▶ Play it now: [r4nd3l.github.io/Platformer](https://r4nd3l.github.io/Platformer/)** — no install, runs in any modern browser.

![Main menu](docs/screenshots/main-menu.png)

## Play locally

No install, no build step:

```sh
# just open it
open index.html        # macOS
xdg-open index.html    # Linux
```

Or serve it locally (recommended for online multiplayer share links):

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

### Controls (default, rebindable in Settings)

| Action | Player 1 | Player 2 |
|---|---|---|
| Move | ← → | A D |
| Jump / Double-jump | Space | W |
| Dash | Shift | Q |
| Action (carry/throw, revive) | E | R |
| Charge stomp | Hold ↓ in air | Hold S in air |
| Pause | Esc | Esc |

Gamepads are supported and rebindable for both players.

## Features

- **Movement** — run, jump, double-jump, dash, wall slide/jump, charge stomp, coyote time + jump buffering
- **4 biomes + boss** — Grove, Beach, Cave, Sky, and a 3-phase boss arena, each with its own palette, weather, and ambient music (Web Audio synth — no audio files)
- **Progression** — gems, shop upgrades, per-level medals (Clear / No-Damage / 100% / Speedrun / Secret), best-time tracking, 15 achievements
- **Local co-op** — 2 players on one keyboard, with carry/throw and co-op puzzles
- **Online multiplayer** — WebRTC (PeerJS) lobby for up to 4 players: co-op, race, gem hunt, and last-stand modes, with chat, ready-up, and spectators
- **Infinite mode** — seeded procedural level generation
- **Level editor** — full tile editor with save/load/export/import
- **Ghost races** — your best run is recorded (gzip-compressed in localStorage) and replayed as a translucent ghost
- **Extras** — story cutscenes, character customization (outfits, accessories, idle animations), shareable scorecard PNG, profile system
- **Accessibility** — colorblind palette, reduced-motion mode, full key/gamepad rebinding

## Project layout

```
index.html              Entry point: page layout, CSS, HUD, script load order, window.VERSION
docs/
  ROADMAP.md            Living milestone checklist (M1–M8, all shipped through v20)
src/
  core/                 The game itself
    engine.js           Tuning constants, game state, input, update loop, camera, shop
    physics.js          Tile collision primitives + AABB axis movement
    entities.js         Pure render layer: pixel primitives, tiles, entities, weather
    levels.js           Hand-authored tile maps for each biome
    procgen.js          Seeded procedural level generation + infinite mode
    audio.js            Web Audio synth: SFX, per-biome music + ambient loops
  ui/
    ui.js               HUD, banners, pause menu, world map, shop, medals
    menu.js             Full-screen animated main menu + profile system
    settings.js         Persistence, colorblind palette, reduced motion, rebinding
  multiplayer/
    netcode.js          WebRTC host/guest snapshot sync (share-link + manual codes)
    coop.js             Co-op rules: revive, shared gems, friendly fire, co-op medals
    lobby.js            PeerJS star-topology lobby (up to 4 players, room codes, chat)
    lobby-ui.js         Lobby panel: tabs, player list, chat, mode/level pickers
  features/
    editor.js           In-game tile level editor
    ghost.js            Best-run ghost recording + replay
    achievements.js     15 achievements with badge pop-ups
    customization.js    Outfits, accessories, idle animations
    cutscenes.js        Pixel-art story cutscenes (intro, biome transitions, ending)
    scorecard.js        Shareable stats-card image generator
```

All files are plain scripts sharing global scope, loaded in dependency order via `<script>` tags in `index.html`. The `?v=N` query on each tag (driven by `window.VERSION`) busts browser cache on each release.

## Tech notes

- Canvas: 960×540 logical pixels (16:9), `image-rendering: pixelated`, 18 px tiles
- All art is drawn procedurally with canvas primitives — there are no image assets
- All audio is synthesized with the Web Audio API — there are no sound files
- Saves (settings, best times, ghosts, editor levels, profile) live in `localStorage`

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md). All milestones M1–M8 have shipped (current version: v20-era); the roadmap remains the living checklist for future work.

## Contributing

Issues and pull requests are welcome. The codebase is intentionally simple to hack on:

- Plain JS, global scope, no build step — edit a file, refresh the browser
- Every file starts with a header comment describing its role and public API
- Pick something from [docs/ROADMAP.md](docs/ROADMAP.md) or bring your own idea
- When changing scripts, bump `window.VERSION` in `index.html` so caches refresh

## License

[MIT](LICENSE) — free to use, modify, and redistribute with attribution.
