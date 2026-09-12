# Unicorns and Rainbows — js13k 2026

[js13kGames](https://js13kgames.com/) 2026 entry (theme: **Unicorns and Rainbows**): the whole
game must fit in a **13,312-byte (13 kB) zip**. Everything in this repo — build config, code
style, helper choice — serves that constraint. When in doubt, the smaller output wins.

## Collaboration rules — roles and scope

Almut is the **game designer and owner of the game logic**; Claude provides **technical
implementation support**. Creative decisions stay on Almut's side.

1. **Implement the ask, plus necessary plumbing only.** The minimal technical scaffolding an ask
   requires (types, small utils, wiring, enum registration) is in scope. Anything feature-shaped
   beyond the ask — extra mechanics, unrequested polish, "while I'm here" refactors — is not.
   When in doubt whether something is plumbing or a feature, it's a feature: ask first.
2. **Design gaps: small ones get placeholders, big ones get questions.** If an unspecified detail
   merely needs *a* value (a speed, a duration, a color), pick a neutral default as an
   easy-to-tune named constant and **explicitly list every such stubbed decision** when reporting
   back. If the gap shapes the mechanic itself (what happens on collision, win/lose conditions,
   how an interaction works), stop and ask before implementing.
3. **Own ideas: offer, never implement.** Ideas for mechanics, twists, or theme are welcome as a
   brief, clearly separated suggestion at the end of a response — never built, not even partially,
   without an explicit go-ahead.
4. **No silent scope growth across turns.** A go-ahead covers exactly what was approved; new ideas
   that come up mid-implementation go back through rules 2–3.
5. **Almut does the committing.** Claude works in the working tree and reports what changed;
   `git add`, `git commit` and `git push` are Almut's — no exceptions for "small" or obviously
   safe commits. This **overrides the global preference** that lets Claude commit autonomously.
   A suggested commit message is welcome as text in the response; running the command is not.

## Commands

- `npm start` — dev server (unminified, readable class names)
- `npm run build` — "friends & family" build (all nice-to-haves, PWA manifest)
- `npm run build-js13k-roadroller` — **the competition build**: the js13k build plus the
  Roadroller crunch, inlined into the HTML → `dist.zip` + size report. This is the zip that
  gets submitted and the only size that counts. It is eval-based, so click through the result
  in a browser after anything that could break at startup
- `npm run build-js13k` — the same build *without* the crunch. Faster, and readable in
  `dist/index.html`, but it does not fit on its own any more — its number is the un-packed
  size, i.e. how much of the budget Roadroller is currently carrying
- `npm run build-poki` — Poki platform build (Poki SDK, no property mangling)
- `npm run size` — re-report last `dist.zip` size without rebuilding
- `npm run size-harness` — what a feature actually *costs*: it patches `src` to take one out,
  builds the competition pipeline, packs it several times (Roadroller is randomised) and prints
  the delta to an unpatched baseline. `-- --list` for the variants, `-- baseline zoom-off` for a
  subset, `-- --repeats=3` to trade accuracy for time. It reverts `src` between variants, so it
  refuses to start on a dirty tree. **The variants rot** — each patch asserts that it matched, so
  a stale one fails loudly, but it then has to be rewritten against the code as it is now
- `npm run bot` — headless balancing runs: the bot plays every board with every strategy
  (see "Dev tools" below). The *harness* is never shipped; the bot itself is — it is the
  opponent (see "The opponent")
- `npm run sweep` — turns one bot strategy's weights over a grid and plays the whole board
  ladder at every point of it, to find out which bot is worth measuring with (see "Dev tools")
- `npm run levels` — the bot against the seven **curated levels** (`src/game/levels.ts`) rather
  than against a board size: what it scores on each of them, beside what that board has been
  played to, and the band the same bot covers when only its tie-breaks are re-rolled. It is what
  maintains `BOT_MIN_SCORES` / `BOT_MAX_SCORES`, and prints both ready to paste back
- `npm run typecheck` — strict `tsc` check (the vendored `small-player*.ts` are `@ts-nocheck`'d,
  typed via `src/audio/player-interface.ts`); CI runs this on every push
- `npm run lint` — `scripts/lint-invariants.mjs` mechanically checks the size-machinery rules
  below (enum registration, no `Object.values(Enum)`, no direct `import.meta.env`); also in CI

CI (`.github/workflows/build.yml`) runs typecheck, **`prettier --check`** (so unformatted code
fails the build — run `npm run prettier`), the invariant lint, the friends-&-family build with a
deploy to GitHub Pages, and both js13k builds: the un-packed one is *reported* (it is over the
limit on purpose), and the Roadroller one **enforces the 13 kB limit**.

After **every** change while working on the js13k build, run `npm run build-js13k-roadroller`
and check the reported size — that is the zip that has to be under 13 kB.
`scripts/package.js` prints a per-file breakdown, the diff to the previous build (tracked in
`.size-history.json`, gitignored — competition builds only via `--track`, so poki builds don't
pollute the diffs), and bytes left.

**Both js13k scripts `--track` into the same history**, and they differ by ~1.25 kB, so
alternating between them makes the "diff to previous build" line meaningless. Pick one and stay
on it for a measuring session; when you do switch, throw the first diff away and read the second.

`dist-analyzation/stats.html` draws a treemap of the bundle, but **do not trust its numbers**:
under rolldown it reports modules that were tree-shaken away as though they shipped — the js13k
treemap currently lists `de.ts` and `poki-integration.ts`, and neither is in the zip. Use it to
see what the bundle is *made of*; get every actual figure from a build delta.

## Build modes / feature flags

Three modes via `.env`, `.env.js13k`, `.env.poki` (`POKI_ENABLED`, `IS_JS13K`, and per-language
`LANG_<code>_ENABLED` toggles such as `LANG_DE_ENABLED`). The `LANG_` prefix is registered in
`vite.config.ts`'s `envPrefix`, so new language toggles need no `envPrefix` edit.
**Never check `import.meta.env` in game code directly** — add a `HAS_*` flag in `src/env-utils.ts`
instead. Because the flags are compile-time constants, everything behind `if (HAS_X)` is
tree-shaken out of builds where the flag is false. That is the mechanism that lets the
friends-&-family build carry extra content without costing the js13k build a single byte.

- js13k mode: no console logs, no manifest/meta tags, no nice-to-have styles, no bot working
  (`HAS_BOT_LOGS` — the labels on the bot's actions and the RANDOM strategy, which only a
  measurement ever plays). The opponent is in it (`HAS_OPPONENT`, on in every mode); see
  "The opponent" below. The texts are the same in every build: the English map was shortened
  for everyone (2026-09-10, ~100 packed bytes) rather than split into a long and a short map
  behind a flag — one wording, one panel height to measure
- poki mode: loads the Poki SDK (`src/poki-integration.ts`), gameplayStart/Stop wired in `index.ts`;
  terser property mangling is DISABLED for poki (their SDK breaks otherwise)

## Dev tools — and keeping the bot in step with the game

The dev-only tools are reached only from behind `HAS_DEV_TOOLS` (which is `IS_DEV`, so they are
absent from the friends-&-family build too) and tree-shaken out of every real build. Keep it
that way — `npm run build-js13k` is the check.

**The bot is not one of them.** It lives at `src/game/bot.ts` and ships wherever `HAS_OPPONENT`
is on — every build — because the opponent on the big boards *is* the bot playing the other
side (see "The opponent" below). It is not byte-golfed and should not be — clarity is what
makes it re-tunable, and an opponent's behaviour has to be arguable — but it is not free
either, so a change to it shows up in the size report.

What does *not* ship is the bot showing its working: `HAS_BOT_LOGS` (env-utils.ts) gates the
`label` on every action and the RANDOM strategy that `getLegalActions` is the only caller of.
The flag is wider than `HAS_DEV_TOOLS` on purpose — `npm run bot` is a `vite build`, so `DEV`
is false there and gating on it would have taken the harness's own `--verbose` output out with
the competition build's. **A new kind of action needs its label written as a ternary on that
flag too**, or a sentence nothing reads goes into the zip.

- **☁️ fog toggle** — the clouds off, for looking at how a board actually came out. Drawing
  only; the model's `seen` bits are untouched, so the run behaves exactly as it would with the
  clouds on. It shows the player's view of the board, not the opponent's.
- **The bot** (`src/game/bot.ts`), in the same corner: ⚖️ cycles the four strategies
  (random / explore / economy / mixed), ▶ takes one action, ⏩ plays the rest of the run out on
  a timer. Every action prints to the console with what the bot thought it was worth. The
  buttons are for seeing *why* a bot does something; the numbers come from the harness. They
  always drive the **player's** side — the opponent plays its own turn without them.
- **`npm run bot`** (`scripts/bot-harness.ts`) plays whole runs with nobody watching — every
  board × every strategy × N seeds — and prints score, exploration, rainbows, herd, what the
  actions were spent on, and what was left unspent at the whistle. It is a vite `--ssr` build
  of a node entry, so it imports the game's own TypeScript out of `src` and there is no second
  copy of the rules in it. `npm run bot -- --size=13 --seed=7 --strategy=mixed --verbose`
  replays one run action by action. Runs are seeded from the map seed, so they repeat exactly.
  It asserts nothing and cannot fail: read the numbers against each other and against the last
  time you ran it, never as a verdict.
- **`npm run sweep`** (`scripts/sweep-harness.ts`) asks the question the other two cannot:
  *which bot should we have been measuring with*. It turns one strategy's `STRATEGY_WEIGHTS`
  entry over a grid of `[explore, economy]` pairs, plays the whole ladder at every point, and
  prints the landscape — per board, the mean, and the winner on each board taken alone.
  `npm run sweep -- --seeds=50`, `--size=25`, `--strategy=economy`, or a grid of your own with
  `--explore=0.8,1,1.2 --economy=0.4,0.6`. The 5×5 is left out by default: no lollipops, so no
  candy, so it cannot tell the weights apart.
  **Re-sweep whenever the economy changes.** Those weights are the bot's belief about which
  half of the game pays, and a change can make last week's belief false — the sign is `explore`
  or `economy` starting to beat `mixed` outright, at which point every reading taken with
  `mixed` is suspect. Read the grid as a landscape, not an answer: a peak one percent above a
  broad plateau is noise, and where the cliff is matters more than where the peak is.
  A full default grid is thousands of runs and takes a while, so it prints each combination as
  it finishes rather than only at the end.
  **Both of `mixed`'s weights are plain constants** (`[2, 0.75]`), and the sweep therefore
  measures exactly what it sets. Its economy weight used to be a function of the board —
  `(37 - width) / 16`, capped at 1.5 — which the 2026-09-12 sweep retired: at 30 seeds a flat
  0.75 beat that line by 11% on the 9x9 and the 13x13 and 5% on the 21x21, and matched it
  elsewhere, because two thirds of a board's light now pays in sweets and the economy half no
  longer wants weighting up anywhere. Sweeping one board at a time (`--size=17`) is still the
  more informative way to read the grid, since the big boards outvote the small ones in any
  average — but it is no longer a thing the code demands.

**When the rules change, change the bot.** Nothing will break if you don't — it will quietly
go on playing a game that no longer exists and hand you balancing numbers for it. After a
change to the economy, the objects or the board, walk `src/game/bot.ts`:

- `getLegalActions` — the RANDOM yardstick's action list, and the definition of "legal" the
  scoring bot is *held* to by convention. It is behind `HAS_BOT_LOGS` and `getBestAction`
  invents its own candidates, so adding an action here alone changes nothing about how the
  opponent plays — do both.
- the value model (`getBestAction`, `getStandingValue`, `getBuildValue`) — a new object, price
  or income stream needs a worth in score points, or the bot plays as if it were worth nothing.
- `applyBotAction` — the one place in the repo that says a second time what the interface does
  when it carries an action out. If `move` / `buy` / `raise` / `finishTurn` in
  `game-map.component.ts` change, this changes with them, or the headless runs quietly stop
  matching the game that is actually played. (The interface itself does *not* go through it:
  the buttons play a bot action through `select` + the real handlers, so the bot can only ever
  do what a tap can do.)
- the tuning constants at the top are the bot's *beliefs* about what things are worth — not the
  game's balance. A bot that plays badly after a change is a finding about the change or about
  the constants, and telling those two apart is the work.

One class of bug is worth knowing about before you go looking for it, because it looks like
bad tuning and is not: **anything a unicorn's own step changes can feed back into the value of
where it was going.** Deciding one step at a time, the bot will happily walk towards a prize
that its own walking destroys, and then back towards what it just left. That is where the
memory at the top of the file comes from — a plan in progress, the tiles a unicorn has already
stood on this turn, and the board's income read once a turn rather than after every step — and
it is what stopped the bot pacing on the spot. If a change makes a value depend on where the
deciding unicorn happens to be standing, expect pacing, and fix it there rather than by tuning.

The bot plays fair: it decides only from tiles **its own side** has revealed, never from what
the fog is hiding. Hold any new heuristic to that, or its runs stop saying anything about what
a player could do — and, now that the same code is the opponent, it stops being an opponent
that can be beaten fairly.

## The opponent — two sides on one board

Behind `HAS_OPPONENT` (`true` in every build; it costs ~2.2 kB zipped, which is the number to
weigh if the last kilobyte ever has to come from somewhere), the boards from `RIVAL_SIZE` up —
the 17x17, the 21x21 and the 25x25 — carry a second player: a dark unicorn from the mirrored
corner,
driven by the `mixed` bot, taking a whole turn of its own between the player's turns.

Everything about it follows from three decisions, and knowing them is most of reading the code:

1. **Ownership is a position in the enum, not a field.** `DARK_UNICORN`, `DARK_RAINBOW` and
   `DARK_BATHTUB` are the last three `GameObjectType` members, so `getSide()` is one `>=` and
   no tile carries an owner. Anything doubled goes in one of the `SIDE_*` tables in
   `game-objects.ts` and is looked up by side; only the three things that can *belong* to
   somebody are doubled. Fountains, lollipops, boulders, donuts, custards, chests and build
   sites are neutral.
2. **Each side has its own fog.** `Tile.seen` is a bitmask, one bit per side, read through
   `isSeen(tile, side)`. Exploration is the score's own multiplier, so a shared cloud layer
   would have each side handing the other its multiplier for free. This is why nearly every
   function in `game-map.ts` takes a `side` — it is the cost of that decision, spread thin.
3. **Currencies are per-side arrays.** `map.drops[side]`, `map.candy[side]`, and likewise the
   two incomes and `rainbowCounts`. A turn is now every side's go and *then* the clock, which
   is why `endTurn(map, side)` and `nextTurn(map)` are two calls. Who has a go is `hasGo`, and
   there is one exception in it: the rival does not play the closing turn, so a run ends on the
   player's own move rather than on an answer to it. Both the interface and `npm run bot` ask
   `hasGo` — the harness would otherwise measure a rival a whole turn stronger than the real one.

The contest itself is almost entirely emergent rather than written: a rainbow has always needed
empty ground, so the first one onto a tile holds it and the other side's light dies in the
source; a tile with somebody standing on it cannot be lit or stepped onto; a build site is
spent by whoever gets a unicorn beside it and can pay first. The one contested *building* is
the bathtub, which belongs to whoever raises it — which makes the tub site in the middle of the
board, equidistant from both corners, the sharpest thing on the map.

Nothing in `bot.ts` knows it has a rival. It plays its own board off its own fog, and the
competition reaches it entirely through what the board looks like. Keep it that way: a
heuristic that reasons about the other side would also be one the player has no way to see.

When the rules change, the opponent changes with them for free — it is the same code — but
**check the two harnesses**: `npm run bot` now plays both sides on the big boards and prints a
🌑 column, `npm run bot -- --solo` is the old single-player reading, and `npm run sweep` turns
the opponent off entirely (a grid comparing weights must not have a different game under three
of the six rungs it plays — it drops the 5x5).

## The light rule — one line-up, two currencies

**The unicorn is the light.** It is the only thing in `OBJECT_CONFIG` with `glows: true`, and
`updateRainbows` walks the glowers first. A fountain and a lollipop give off nothing of their
own: they *bend* the glow of a unicorn standing beside them and throw it out the far side as a
rainbow, onto the empty tile directly opposite. `🦄⛲🌈` comes out as 💧, `🦄🍭🌈` as 🍬.

The two benders are the same kind of thing to every rule in the game — same line-up, same reach,
same empty tile needed, same rank earned for shining — and differ only in the currency at the far
end, which the rainbow is stamped with as it is cast (`Tile.candy`). `refracts()` is the live
rule; the generator's version is `bendsLight()`, which covers the two of them *and* the two sites
that become them.

Three rules keep the boards from making that trivial, and all three are in `createGameMap`:

- **Light keeps its distance from light**, one spacing over benders and their sites together,
  with `SHARES_RING` (0.3) as the single exception — a placement that wins that flip may touch
  **one** other piece of light and nothing else nearer than the spacing. That is what makes a
  tile casting three rainbows impossible rather than merely rare: a chain of three would put the
  first and third two tiles apart, which no rule here allows.
- **Every fountain and lollipop takes exactly one 🗿**, on its own ring, one tile clear of every
  other boulder. That ring is the four lines light can travel along, so the boulder is a line the
  board cannot use. It exists because promoting the lollipop deleted the game's only blocker:
  trees used to ring the fountains by accident, and without that every one had all four lines.
- **One fountain is guaranteed within `OPENING_REACH` of each side's start**, mirrored for the
  rival. Steps are paid for in water and the spacing has no idea where anybody is standing, so
  without it a third of boards dealt the nearest fountain six or more tiles from the tub.

`FOUNTAIN_COUNT` is half of `TREE_COUNT` (`tiles/54` against `tiles/27`, floored at one fountain
for the tutorial), so two thirds of a board's light is the sweet kind. That is deliberate: water
is the currency a well-played board ends up with a pile of, sweets the one a run is always short
of, because sweets buy unicorns and a unicorn's price is the size of the herd.

## Size machinery — read before touching vite.config.ts or adding enums

The unusual parts of this codebase exist to make minification maximally effective:

1. **`defineEnum` + build-time inlining.** Enums are plain objects created with `defineEnum`
   (`src/utils/enums.ts`). `vite.config.ts` textually replaces every member access
   (`GameObjectType.UNICORN` → `0`) via `@rollup/plugin-replace`, so the enum object itself is
   tree-shaken away. **Every new `defineEnum` enum MUST be registered in the
   `replaceEnums({...})` call in `vite.config.ts`**, and enum member access must always be
   written literally as `EnumName.MEMBER` (never destructured or aliased), or the replacement
   misses it. In particular, **never write
   `Object.values(SomeEnum)`** — it keeps the whole enum object alive in the bundle; write the
   literal member list instead (`[GameObjectType.UNICORN, GameObjectType.RAINBOW, ...]`), which
   inlines to plain numbers (2025 postmortem: five such calls cost ~57 zipped bytes).
2. **Enum-keyed maps get compacted.** A custom AST transformer rewrites numeric-keyed object
   literals (`{0: "a", 1: "b"}`) into arrays or `"a|b".split("|")` — writing lookup maps keyed by
   enums is therefore cheap and idiomatic here.
3. **Property mangling is ON** (js13k + default build): terser renames all *unquoted* properties.
   Consequences:
   - String-keyed data that must survive verbatim (e.g. `"ArrowUp"`, JSON-ish config) must use
     **quoted keys** (`keep_quoted: true` protects them). Prettier is configured with
     `quoteProps: "preserve"` so it won't strip the quotes.
   - Standard DOM/browser properties are safe (terser knows the builtins).
   - If something works in dev but breaks in the build, suspect property mangling first.
4. **CSS class names are minified in sync.** Global class names live twice: `src/utils/css-class.ts`
   (TS) and `src/names.scss` (SCSS) — keep both in sync. The build replaces them (and CSS module
   class names) with 1-2 char identifiers via a shared generator, so TS and SCSS stay consistent.
   Component-scoped styles use CSS modules (`*.module.scss`, accessed as `styles.foo`).
5. **No frameworks, no runtime deps.** UI is built with `createElement` from
   `src/utils/html-utils.ts` and the component pattern in `src/framework/components/_component-template`.

## Byte-golfing guidelines

- Measure, don't guess: `npm run build-js13k-roadroller` after each change; the packed zip size
  is the only truth. Minified+zipped size correlates poorly with source size — repetitive code
  compresses well.
- Prefer data-driven code (lookup tables keyed by enums) over branching; the map transformer and
  zip compression both love it.
- **One non-literal value costs a whole map its compaction.** The AST transformer only rewrites a
  numeric-keyed object literal when *every* value is a literal (see `replaceMapsTransformer`), so a
  single `FLAG ? "a" : "b"` in a 25-entry translation map leaves all 25 keys written out longhand —
  measured at 68 bytes, more than the strings the ternaries were saving. Where a map needs two
  variants, write **two whole literal maps** and pick between them (`FLAG ? mapA : mapB`):
  both compact, and the unused one tree-shakes. Measured at −123 bytes against per-entry ternaries.
- **Don't refactor for repetition — gzip already has it.** Wrapping a builtin that appears 28 times
  (`classList.toggle`, 448 raw chars) in a helper was worth *2 bytes*; the 32 identical 3x3
  neighbour loop headers (704 raw chars) are in the same boat. Zipped size only moves for *unique*
  content, so hunt whole dead features, unread fields and one-off strings instead. The corollary:
  a repetitive lookup table really is free, and clarity is never worth trading for de-duplication.
- Emojis are the sprite sheet: one emoji ≈ 4 bytes buys full-color art. No image assets.
- But keep emojis (and any repeated markers) out of *data tables*: store level/config data as
  compact digit strings and reconstruct the presentation at runtime. In 2025, replacing 21
  emoji-formatted level strings with bare digit pairs + a 5-line decoder saved ~90 zipped bytes.
- Audit data definitions for never-read fields before shipping — the 2025 levels carried a
  `description` field no code ever read; comments are free, object properties are not.
- Music/sfx via SoundBox player (`src/audio/small-player*.ts`) — song data are tiny JS objects
  (the 2025 background track ≈ 290 zipped bytes). Use the `soundbox-composer` skill to
  compose/edit them in code (audible preview + size/loop-seam stats via
  `node scripts/render-song.mjs`), or compose at https://sb.bitsnbites.eu/ and export as JS.
  **The synth is the cost, not the songs**: measured, all four songs' data together is 287
  zipped bytes against 1530 for the player and its plumbing — so compose freely, and take the
  bytes out of the player instead. The game ships `CPlayerSimple`, trimmed past the 2025
  version: sine only, no filter LFO, no distortion, no f-automation (so song columns carry no
  `f: []`). Arpeggio is deliberately kept — it is the cheap way to get moving harmony out of
  one channel in a sine-only palette. Compose against the full `CPlayer` (`render-song.mjs`
  default), preview what ships with `--simple`, and before shipping run
  `node scripts/audit-player-usage.mjs`, whose verdict knows what the trimmed player can no
  longer do. A song using a removed feature plays back **wrong, not broken**.
  Two gotchas when regression-testing audio: a song with a noise channel renders differently
  every time (`Math.random()`), so checksum-compare it with `NOISE_VOL` temporarily 0; and a
  column's `n` is `[voice][row]` flattened at `patternLen` stride, so a "late note" is often
  a chord.
- Fonts: system/monospace + Noto Color Emoji. The Noto webfont import lives in
  `globals.nice2have.scss` so it ships only in non-js13k builds — the competition build must not
  make external requests (offline rule) and falls back to the system emoji font.
- Reuse translations keys / strings where possible; identical strings compress, but each unique
  string costs.
- **The js13k build is one file, and that is a size decision.** `scripts/inline.js` folds the
  stylesheet and the bundle into `index.html` between vite and `package.js`. A zip compresses
  each entry separately, so three files cost three headers plus three filenames (~96 bytes
  apiece) and share no compression dictionary — merging them was measured at 263 bytes for no
  change to any game code. Only js13k does it; the other builds keep separate files for the
  dev tools. Anything writing a payload into HTML must pass `replace` a **function**: `$&`,
  `$'`, "$`" and `$1` in a replacement *string* are substitution patterns, and terser mangles
  identifiers to `$`, so a string replacement corrupts the bundle silently.
- ECT zip recompression runs automatically in package.js (via the `ect-bin` npm package, so it
  also works on CI) and is worth ~4%. **Roadroller is no longer the reserve — it is the build.**
  It was the emergency margin until the entry outgrew 13 kB without it; measured at
  **-1264 bytes** (13,580 un-packed → 12,316 packed) with no cost at startup
  (time-to-launch-screen over five runs: median 396 ms either way). Two things follow from
  depending on it:
  - It is `eval`. A browser or judging-host CSP that forbids eval takes the whole entry, not
    10% of the budget, so **click through the packed build regularly** — a break has to surface
    early, not on submission day. The un-packed number CI still reports is the size of that
    exposure: while it stays above 13 kB, there is no un-packed fallback to submit.
  - Its ratio is not stable. Roadroller models the bundle, so what it saves moves with what is
    in it — a change can cost more packed than un-packed, or less. Read the packed delta,
    never the un-packed one scaled by a remembered ratio.
- HTML attributes count too: js13k strips `crossorigin`. The single-letter bundle names
  (`a.js`, `a.css`) now mostly matter as a fallback — `scripts/inline.js` folds both into
  `index.html` and deletes them, so the zip normally holds one entry whose name is fixed.

## The submission text

`DESCRIPTION.md` is what goes into the js13k submission form, and **the form caps it at 2048
UTF-16 code units** — a JavaScript string's `.length`, which is neither bytes nor characters: an
emoji outside the BMP counts 2, a plain letter 1. Measured against the form itself on 2026-09-12
(it read 2045 for a file this command prints 2045 for, while the same file is 2102 bytes and 2023
code points). A trailing newline is not in it — the form gets the text pasted, so strip it:

```sh
python3 -c "import io; t=io.open('DESCRIPTION.md', encoding='utf-8').read().rstrip('\n'); print(len(t.encode('utf-16-le')) // 2)"
```

It sits at 2045 of 2048, so there is no line spare — anything added now displaces something.

Two rules for what goes in it, both learned by breaking them:

- **It is written in the player's vocabulary, not the code's.** The game says fountain, lollipop,
  bathtub, present. It never says "light source", "site" or "currency", so neither does this.
- **Anything the game itself says at the moment it matters is not worth a line here.** The tub's
  own text already states the unicorn price; a bullet repeating it cost 85 of the 2048 to say the
  same thing earlier and worse.

## Conventions

- Components: `function MyComponent(): HTMLElement` or `ComponentDefinition` tuple
  `[hostElement, updateFn]` — see `src/framework/components/_component-template`.
- Cross-component communication via `pubSubService` (`src/utils/pub-sub-service.ts`); register new
  events in the `PubSubEvent` enum (and remember rule 1 above — it's already registered).
- Persistent state via `src/utils/local-storage.ts` with single-letter keys.
- Formatting: prettier (140 chars, preserved quote props) — `npm run prettier`.
