# Blip's Grove — Roadmap

A living checklist. Tick items off as we ship them. Re-order, add, or kill anything.

**Legend:** ✅ done · 🚧 in progress · ⏳ planned · ❓ needs decision · 🔥 stretch

---

## Already shipped (v1 → v9)

- ✅ Pixel-art hero, enemies (slug, flyer, turret), gems, tiles
- ✅ Tile-based maps with collision, hazards, moving platforms
- ✅ Movement: run, jump, double-jump, dash, coyote/jump-buffer
- ✅ Wall slide + wall jump
- ✅ Power-ups: shield, speed boots, glide leaf (from `?` blocks)
- ✅ Health, lives, respawn, checkpoints
- ✅ 4 levels: Grove, Beach, Cave, Boss Arena
- ✅ Hidden bonus rooms (secret doors)
- ✅ World map screen + level select
- ✅ 2-player local co-op (carry/throw, separate HUDs)
- ✅ Boss fight (single-phase)
- ✅ Pressure plates + gates (co-op puzzle in Grove)
- ✅ HUD, gem counter, win/lose states, basic SFX
- ✅ Per-biome ambient music loops (grove/beach/cave/boss)
- ✅ Per-biome weather: leaves, rain, sand drift, embers
- ✅ Iris transition between levels and through secret doors
- ✅ Speedrun timer + best-time tracking (shown on level-clear + map)
- ✅ Settings: master/SFX/music volume, colorblind palette, reduced-motion, key rebinding
- ✅ Refactor: split file into `engine.js`, `levels.js`, `ui.js`, `audio.js`, `settings.js`
- ✅ Animated title screen (logo letter pop + heroes-on-grass pixel canvas)
- ✅ Pause menu (Resume · Restart · Settings · World Map · Quit to Title)
- ✅ Gamepad rebinding (P1 + P2, live-detected pad count)
- ✅ Total-run timer (live HUD + best total saved on title/map)
- ✅ Gem bank + shop side-panel (6 upgrades, refund-all support)
- ✅ Upgrade effects wired to gameplay (HP, dash, glide, lives, gems×2, magnet)
- ✅ Medals per level (Clear / No-Damage / 100% / Speedrun / Secret)
- ✅ Expandable per-level stats panel on world map
- ✅ Boss: 3 phases (slam · spread shot · minion summon) with telegraphed wind-ups
- ✅ Spitter snail, bouncing slime, shielded knight enemies
- ✅ Charge stomp (hold ↓ in air, release for AOE ground pound)
- ✅ Damage numbers floating up on hit
- ✅ Extended hitstop on big hits (stomp / boss / pound)

---

## M1 — Polish foundation ✅ (shipped in v7 + v8)

Make the existing game feel finished before piling on more systems.

- ✅ Title screen with animated logo + Start / World Map / Settings
- ✅ Pause menu (Esc / Start) with Resume · Restart · Settings · World Map · Quit
- ✅ Settings menu: master/SFX/music volume
- ✅ Settings: colorblind palette toggle (deuteranopia-safe)
- ✅ Settings: reduced-motion toggle (kills shake/flash/weather)
- ✅ Settings: full key rebind screen (P1 + P2)
- ✅ Per-biome ambient music loops (grove/beach/cave/boss)
- ✅ Screen transitions between levels (iris fade)
- ✅ Weather particles: falling leaves (Grove), rain (Cave), sand drift (Beach), embers (Boss)
- ✅ Speedrun timer (per-level)
- ✅ Best-time saved in localStorage, shown on map + end-of-level
- ✅ Refactor: split file into `engine.js`, `levels.js`, `ui.js`, `audio.js`, `settings.js`
- ✅ Gamepad rebinding (P1 + P2, 6 actions each)
- ✅ Total-run timer (sum across all levels)

---

## M2 — Progression ✅ (shipped in v9)

Make levels worth replaying.

- ✅ Gem shop on map screen (slide-in side panel)
- ✅ Persistent unlocks: extra heart ×3, faster dash, glide-by-default, extra life ×3, double gems, gem magnet
- ✅ Medals per level: Clear · No-Damage · 100% gems · Speedrun · Secret
- ✅ Per-level stats panel (best time, medals, click-to-expand)
- ✅ Refund-all-upgrades button (so players can experiment)
- ⏳ Linear progression with optional bonus-level node off the main path *(deferred — secret rooms cover this for now)*

---

## M3 — Combat & enemies ✅ (shipped in v11)

- ✅ Boss: 3 phases (slam → spread shot → minion summon) with telegraphed wind-ups
- ✅ New enemy: spitter snail (arc projectiles, wind-up tell)
- ✅ New enemy: bouncing slime (size-2 splits into two on stomp)
- ✅ New enemy: shielded knight (only damaged from behind; pound bypasses)
- ✅ Player charge attack: hold ↓ in air, release for AOE ground pound (2× boss dmg)
- ✅ Damage numbers floating up on hit
- ✅ Extended hitstop on big hits

---

## M4 — Puzzle mechanics ✅ (shipped in v12)

Built on the plate/gate foundation. New level **TINKER WORKS** showcases everything.

- ✅ Throwable weighted blocks — pick up with **dash near crate**, throw with **dash while holding**; weights pressure plates so the gate puzzle works solo
- ✅ One-shot toggle switches — lever (`L`) flips permanently, opens orange `J` toggle gates
- ✅ Color-keyed keys & locks — pick up `k`, walk into matching color `l` to consume key + open
- ✅ Conveyor belt tiles — `q` (left) and `e` (right), animated chevrons; affect both players and crates
- ✅ Ice / slippery tiles (`i`) — undoes ground friction so you slide
- ✅ Cannons / launchers (`n`) — point away from adjacent wall, fire timed cannon balls; balls deal damage & break on impact
- ✅ Bonus: thrown crates KO enemies (BONK damage number) and split big slimes

---

## M5 — Content & creativity

Ordered by dependency / cost. Pick one per session — don't try to land all five at once.

### ✅ 5.1 — Sky Temple biome *(shipped)*

A floating-island level that re-uses moving platforms + tile attributes; introduces two new mechanics.

- ✅ Biome key `sky`, sky-blue/coral palette, ambient airy pad + melody in `audio.js`
- ✅ Wind gust tiles `>` / `<` — horizontal accel with linear decay over `WIND_DECAY_TILES` above tile
- ✅ Cloud platform tile `c` — solid 600 ms, fades 200 ms, respawns 1500 ms
- ✅ Wisp weather particles (drifting 1-px white wisps)
- ✅ SKY TEMPLE level (100 tiles wide) with wind, clouds, crates, secret door, flag
- ✅ Speedrun target 50 s added (index 5)
- ✅ Colorblind remaps for sky coral/peach/blue accents in `settings.js`

### ✅ 5.2 — Combo meter *(shipped)*

- ✅ Stomping/pounding/bonking/boss-hitting increments combo; expires after 2.5 s of no kill
- ✅ HUD pip near gem counter shows `x2` `x3`… up to `x6`; pulses on increment
- ✅ Gem pickups multiply by current combo (capped at x6)
- ✅ Resets on hit / death / level start
- ✅ Damage numbers tinted by combo tier (white → yellow → orange → red)

### ✅ 5.3 — Ghost replay *(shipped in v14)*

- ✅ Record P1 position frames during best-time runs (per level), gzip-compressed into localStorage under `blipgrove_ghost_<level>`
- ✅ On a run with an existing ghost, replays as a translucent cyan silhouette with pulse + trail; drawn behind the live player
- ✅ Toggle in Settings: "Race ghost: ON / OFF"
- ✅ No collision with the live player; pure visual
- ✅ Ghost HUD pip (top-right) shows a tiny progress bar tracking the ghost's position through the level
- ✅ Saves only on a new personal best; async decompress on level start so the game loop never blocks

### ✅ 5.4 — Level editor *(shipped in v15)*

- ✅ New "✏ EDITOR" button on title screen (alongside World Map)
- ✅ Tile palette: all terrain, objects, puzzle, sky, enemy, and special chars; click to select, left-click paint, right-click erase
- ✅ Place `@` spawn, `F` flag, `C` checkpoint, `D`/`X` doors, all enemies — single-instance enforcement for spawn + flag
- ✅ TEST button: validates map (requires @ and F), drops into playable map, ESC returns to editor
- ✅ SAVE: up to 10 named slots in localStorage under `blipgrove_editor_v1`
- ✅ LOAD: browse + restore saved slots; per-slot delete
- ✅ EXPORT CODE: gzip base64 share string copied to clipboard (fallback textarea)
- ✅ IMPORT CODE: paste share string to load any exported map
- ✅ RESIZE: adjustable map width (20–200 tiles), preserves existing content
- ✅ CLEAR: wipe map back to blank ground
- ✅ Canvas pan via scroll-wheel or shift-drag; tile coordinates shown in corner

### ✅ 5.5 — Share codes *(shipped in v16)*

- ✅ `?play=<code>` URL boots straight into the shared map (no title screen)
- ✅ **SHARE URL** button in editor copies `window.location.origin + '?play=…'` to clipboard
- ✅ **EXPORT CODE** button copies the raw base64 code only (for embedding elsewhere)
- ✅ Round-trip lossless on every map (name · cols · rows · row strings, pipe-delimited, base64-encoded)
- ✅ Shared map injected as a temporary level; game plays immediately with a toast showing the map name

---

## Housekeeping (non-feature work, do alongside M5)

Small debts noticed during the v12 review and the engine.js refactor.

- ✅ Single `VERSION` constant — `<title>`, HUD tag, and `?v=` cache-busters all derive from `window.VERSION` in BlipsGrove.html
- ✅ Speedrun target for the boss arena (55s)
- ✅ P2 keyboard `up`/`jump` — merged into single "Jump / Up" row in the rebind UI (they share `KeyW` by design; showing both was confusing)
- ✅ Save migration path — `migrateSave()` in `engine.js` and `migrateSettings()` in `settings.js`; copies data from legacy keys to new key on first run, leaving old keys intact for downgrade
- ✅ TINKER WORKS map rows confirmed 100 wide (matches other levels) — earlier note was stale
- ✅ Split `engine.js` into `physics.js` (74) + `entities.js` (510) + `engine.js` (1351) — done in v13 refactor

---

## M6 — Multiplayer & Online 🔥

### M6.1 — Online co-op (2-player) ✅ (shipped in v17)

Serverless WebRTC — no account, no install, just share a link.

**Signaling (shipped in refactor):**
- ✅ **Share-link flow** — host clicks HOST → gets a `?join=` invite URL → sends it to friend → friend opens it, game auto-processes offer → generates a `?answer=` URL → friend sends back → host pastes and clicks CONNECT. Two URL shares, zero raw SDP blobs.
- ✅ **Manual code fallback** — classic copy-paste of compressed base64 codes for LAN / offline use; cleaner 2-step UI
- ✅ **TURN relay fallback** — `openrelay.metered.ca` free TURN servers alongside Google STUN; handles symmetric NAT (mobile hotspots, corporate networks)
- ✅ **ICE progress indicator** — animated bar + 15 s timeout with clear error + retry button instead of raw state string
- ✅ **SDP compression** — native `CompressionStream` (deflate-raw) shrinks offer/answer by ~70 % before base64-encoding

**Co-op mode (shipped in v17):**
- ✅ Dedicated **co-op level set** — 3 levels designed specifically for 2 players: Twin Grove (pressure plates requiring both players), Relay Beach (split-path gate relays), Vault Works (crate/ice/timing puzzles)
- ✅ **Co-op lobby screen** — post-connection panel with level picker (co-op + any normal level), partner ping display, ready-up flow; host picks level, guest readies up, host hits GO
- ✅ **Partner revive** — stand over downed partner for 2 s to revive them at 50% HP (no lives cost); animated SVG progress arc above fallen player; host-authoritative, synced to guest
- ✅ **Shared gem pool** toggle — all pickups go into one combined counter, synced via snapshots
- ✅ **Per-level co-op medals**: Clear · No-Damage (neither player hurt) · Sync (both reach flag within 2 s) · Speed (co-op speedrun targets)
- ✅ Co-op medal display in level-clear screen alongside normal medals
- ✅ Co-op medal browser in lobby Settings tab

**Co-op settings (shipped in v17):**
- ✅ Friendly-fire toggle (off by default) — wired into `hurtPlayer` check
- ✅ Respawn mode: shared lives vs. independent lives
- ✅ Ping display in HUD — live RTT pip (top-right) showing role + ms latency
- ✅ Input lag compensation slider (0–6 frames, guest-side prediction strength)
- ✅ Settings pushed from host to guest on connect and on every change
- ✅ **⚑ CO-OP LOBBY** button in pause menu when online session is active

---

### M6.2 — Multiplayer lobby (up to 4 players) ✅ (shipped in v17)

Serverless via **PeerJS cloud** — no account, no server setup.  Room codes route through PeerJS STUN/TURN; star topology (host = authoritative sim).

**Core lobby (shipped):**
- ✅ **Room-code system** — host generates a 6-character room code (e.g. `GROVE7`); others join by entering code or opening a `?room=` invite URL; PeerJS peer ID = `blipgrove-XXXXXX`
- ✅ **Lobby screen** — tabbed panel (Room · Chat · Levels); player list with colour dots, ping badges, ready pips; up to 4 players
- ✅ **In-lobby chat** — full text chat history panel; messages relayed via host; in-game toast for short messages during play
- ✅ **Spectator mode** — join as `?spec=1` or via lobby button; receives snapshots only, no input sent; spectator overlay in-game showing role + race results
- ✅ **Ready-up flow** — all players ready → host GO button turns green; host picks level from Levels tab
- ✅ **Invite link** — copies `?room=CODE` URL to clipboard; friends open it → auto-join
- ✅ **`?room=` auto-join** on page load
- ✅ **Star topology** — all guests connect to host; host broadcasts authoritative snapshots ~20/s; guests send inputs per frame
- ✅ **P3 + P4 support** — `spawnPlayers` extended to 4 slots using lobby palettes (teal/orange/purple/red)
- ✅ **Ping measurement** — host pings all guests every second; badges shown in lobby player list

**Multiplayer game modes (shipped):**
- ✅ **Co-op** — existing M6.1 co-op mechanics, extended to 4 players
- ✅ **Co-op race** — all players run same level simultaneously; first to flag wins; results table in level-clear banner sorted by finish time; medals 🥇🥈🥉

**Planned / deferred — now shipped:**
- ✅ **Gem Hunt mode** — collect the most gems in a configurable time limit (30–300s); scores tracked per slot; results announced on time-up; host controls duration via slider
- ✅ **Last One Standing mode** — hazards escalate every 15s (5 tiers); eliminated players detected on death; winner announced when one player remains; spectators see live hazard level
- ✅ **Host admin: kick player** — ✕ button next to each guest in player list
- ✅ **Host admin: transfer host** — ⚑ button hands host role to any guest
- ✅ **Host admin: lock room** — 🔒 toggle prevents new joins (spectators still allowed)
- ✅ **Host admin: password** — optional room password checked on join; wrong password = denied
- ✅ **Late-join mid-session** — guest joining during active play receives current game snapshot + level index and drops into the running game immediately
- ✅ **Auto-kick on inactivity** — host sets 30s / 60s / 2m / OFF; idle guests kicked automatically

---

### M6.3 — Other big swings ✅ (shipped in v17)

- ✅ **Achievements** — 15 badges across progression, combat, exploration and persistence categories; pixel-art badge pop-up slides up from bottom on unlock (auto-dismiss 3.2s); full achievements panel accessible from title screen (★ ACHIEVEMENTS); unlock toasts queue correctly when multiple fire at once
- ✅ **Leaderboard scorecard** — shareable 480×320px canvas image: profile name + avatar swatch, all-time stats (gems/levels/upgrades/best run), per-level medal grid, achievement progress bar + unlocked badge icons; downloadable as PNG via 🏁 SCORECARD button on title
- ✅ **Story cutscenes** — 5 pixel-art scenes with typewriter dialogue + click-to-advance: Intro (before level 0), Grove→Beach, Beach→Cave, Cave→Sky (biome transitions), Ending (after boss); character sprites bob with idle animation; each scene has hand-crafted backgrounds + particle effects; tap/click to skip
- ✅ **Procedural levels** — shareable seed codes (PG-XXXXXX format, base36 packed with biome+depth); Infinite Mode now shows seed code on level-clear with ⎘ COPY SEED button; `startInfiniteFromSeed(code)` API for sharing specific runs; `procgenEncodeSeed` / `procgenDecodeSeed` helpers; `_seedCode` stored on each generated level entry

---

## M7 — Character customization 🕺

### Shipped in this session:

- ✅ **Customize menu** — accessible from Title screen (🎨 CUSTOMIZE) and World Map; tabbed P1 / P2 panels
- ✅ **12 outfit colour presets** — full 8-key palette swap (base, hi, mid, shade, dark, outline, strap, hat); teal + orange defaults preserved
- ✅ **8 accessories** — None, Cap, Crown, Wizard Hat, Bow, Glasses, Antennae, Halo; all pixel-art drawn at sprite scale with idle-bob sync and animated details (wobbling antennae, floating halo, wizard sparkle)
- ✅ **Custom face upload** — 32×32 PNG dropped onto the head region (8×8 px) via file picker; preview shown in menu; persists in localStorage as data-URL
- ✅ **4 custom idle animations** — Dance (bounce + arm flap), Wave (raised arm), Thinking (head scratch + thought bubbles), Spin (360° rotation); selectable per player
- ✅ **Animated preview canvas** — live 3× scaled sprite in the menu showing current outfit + accessory + idle anim
- ✅ **Per-player persistence** — saved to `blipgrove_custom_v1` in localStorage; survives refresh; loaded at boot and re-applied on every `spawnPlayers` call

### Planned — now shipped:

- ✅ **Animated default movement polish** — landing squash scales with fall speed (harder landing = more squash + dust); stronger squash values (`sy=0.6–0.7`, `sx=1.3–1.4`); light camera shake on heavy landings; spring-back interpolation at 0.2 rate
- ✅ **Shoes / leg accessories** — separate shoe slot: None · Boots · Sneakers · Slippers · Heels; drawn below legs in `drawPlayer`; Heels locked behind speedrun medal on Grove
- ✅ **Unlock system** — Crown: clear Boss Arena; Wizard Hat: 3 no-damage medals; Halo: 6 levels cleared; Antennae: Sky Temple secret; Heels: Grove speedrun; locked items shown with 🔒 and disabled in menu
- ✅ **Colour picker** — HSL sliders (H/S/L) override the base colour; preview swatch updates live; palette hi/mid/shade/dark derived automatically; ✕ CLEAR restores preset
- ✅ **Name tag** — up to 6 chars shown above player head in a dark pill bubble; colour matches player's `pal.hi`; persisted per player in `blipgrove_custom_v1`

---

## M8 — Menu UI update 🖼

### Shipped in this session:

- ✅ **Full-screen menu layer** — replaces the banner overlay; dark glass panel with teal accent, sits over the game canvas as a dedicated `#menuLayer` div; `showTitle()` globally overridden to open it
- ✅ **Animated parallax background** — two-layer mountain range + moon + stars + ground with grass tufts + floating platform; live pixel-art hero scene (P1 + P2 idle/bobbing on the platform with animated gems)
- ✅ **All features surfaced** — Play, World Map, Online Co-op, Multiplayer, Customize, Infinite Mode, Level Editor, Achievements, Scorecard, Settings — each as a large nav item with icon, label, subtitle and hover/active states; items fade+slide in on open; achievement count shown live as subtitlems fade+slide in on open
- ✅ **Profile system** — name (up to 16 chars) + avatar colour (12 presets); stats card showing total gems, levels cleared, medal count and best run time; saved to `blipgrove_profile_v1` in localStorage
- ✅ **Profile strip** — persistent bottom-of-menu showing avatar, name and quick stats; click to open inline profile editor panel
- ✅ **Hero scene uses live palettes** — background heroes reflect the player's current custom outfit from M7

### Planned — now shipped:

- ✅ **Menu ambient music / title theme** — gentle pentatonic arpeggio (triangle wave) + warm detuned pad; loops while menu is open; stops when game starts; respects master/music volume
- ✅ **Animated logo treatment** — letter-pop animation (`mll-pop` keyframe) with staggered delay per letter; teal glow pulse every 4s on the full logo; CSS-only, no JS
- ✅ **Profile avatar — custom icon upload** — 32×32 drag-and-drop or file-picker upload in profile panel; persisted as data-URL in `blipgrove_profile_v1`; shown in profile strip at bottom of menu
- ✅ **News / changelog panel** — "📋 WHAT'S NEW" nav item opens scrollable version history in the right sub-panel; all milestones from v9 to v17 listed with per-release items
- ✅ **Credits screen** — "♥ CREDITS" nav item opens pixel-art credits card in sub-panel; lists all modules + special thanks

---

---

## M6 — Online v20 polish ✅

- ✅ **Room code auto-fill from invite link** — `?room=CODE` URL pre-fills the join input; guest just hits JOIN (or Enter). Spectator `?spec=1` still auto-joins silently.
- ✅ **Room code big display** — when connected, header shows the 6-letter code as a large teal pill; click copies the full invite URL to clipboard. Two copy buttons in Room tab: ⎘ COPY CODE (just the letters) and ⎘ COPY LINK (full URL).
- ✅ **Mode subtitle in header** — shows current game mode (CO-OP / RACE / GEM HUNT / LAST STAND) under the MULTIPLAYER title when connected.
- ✅ **Connection quality badge** — ping display now shows GOOD / OK / POOR with colour-coded label (green / amber / red) alongside the ms value.
- ✅ **Animated loading states** — "Creating room" and "Joining…" show CSS ellipsis spinner animation instead of static text.
- ✅ **Inline join errors with retry** — join/create failures show error inline without closing the panel; CREATE ROOM re-enables automatically with a clickable retry link.
- ✅ **GO button pulse** — green CSS keyframe pulse on the GO button once all players are ready.
- ✅ **Improved ICE status copy** — "Finding best connection path…" / "Connection lost — trying to reconnect…" / "Connection failed — check firewall / network"; failure bar turns red.
- ✅ **ICE bar flashes green on connect** before dismissing, giving clearer visual confirmation.
- ✅ **Code input forces uppercase + strips non-alphanumeric** on every keystroke; Enter submits immediately.
- ✅ **Player dot glow ring** — colour-matched halo ring on each player's dot in the player list.

---

## Decisions (locked) ✅

- ✅ **Code structure:** split into `engine.js`, `levels.js`, `ui.js`, `audio.js`
- ✅ **Music:** keep synth beeps + add per-biome ambient loops
- ✅ **Map style:** linear path (M2 keeps the existing flow, no branching)
- ✅ **Controller remap:** full rebind screen in Settings
- ✅ **Online co-op signaling:** share-link (`?join=` / `?answer=` URLs) as primary flow; manual code as fallback; TURN relay for symmetric NAT; `netCheckAutoJoin()` must be called once at page load to handle auto-guest flow

---

## Out of scope (for now)

- Mobile-native build (current HTML works fine in mobile browsers)
- Real chiptune tracker music (better synth loops yes; full tracker engine no)
- Asset pipeline / external sprite sheets (staying inline-pixel)
