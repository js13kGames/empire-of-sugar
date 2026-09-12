# Submission artwork — thumbnail, cover & spoiler collage

None of these is in the zip. The first two are the images the js13k submission form asks for,
and they have their own limits, which `build.mjs` checks rather than trusts. The collage is the
picture that separates the description on the competition page from the hints under it (see
`DESCRIPTION.md`); it is hosted from the repo, so its only limit is a sanity check:

| file                 | size      | limit  | currently |
| -------------------- | --------- | ------ | --------- |
| `thumbnail-320.png`  | 320 × 320 | 64 kB  | ~55 kB    |
| `cover-800x500.png`  | 800 × 500 | 256 kB | ~115 kB   |
| `spoilers-tiles.png` | 665 × 665 | 256 kB | ~180 kB   |

All are written to the repo root.

```bash
npm run images              # all three
npm run images -- thumb     # just the thumbnail
npm run images -- cover     # just the cover
npm run images -- collage   # just the spoiler collage
```

## How it works

`art.html` draws the thumbnail and the cover, `collage.html` the collage; `build.mjs` shoots
them with headless Chrome, scales down and runs the repo's own `ect` over the result. Nothing is screenshotted out of the running game — the art
is emoji on a CSS gradient, so a browser draws it directly, and re-cutting after a visual change
is one command instead of a session of temporarily breaking the stylesheet to get a clean shot.

**To look at either one while editing, open `thumbnail/art.html` in a browser** — plain, no build
step. Append `?target=cover` for the cover. The collage is `thumbnail/collage.html`.

## The spoiler collage

Nine [Emoji Kitchen](https://emoji.supply/kitchen/) unicorn mash-ups from `kitchen/`, each on a
rounded pastel tile in the ladder's own colours (the same scraped hues `art.html` uses, lifted to
`TILE_LIGHTNESS`), as a 3×3 at the full 665 px width of the description column — full width on
purpose: on a laptop that is exactly tall enough to push the first hint below the fold. Which
nine and in what order is `CELLS` at the top of `collage.html`.

The stickers are Google's, built on Noto (Apache 2.0 / OFL) and published to be shared — fine
in a description, not something to ship inside the game.

## When the game's visuals change

The ladder's palette is **read out of the game**, not copied. `build.mjs` scrapes it from
`launch-screen.component.ts` (`VIOLET_HUE`, `WARM_BIAS`, `NEIGHBOUR_HUE_STEP`, the two
`SATURATION_*`), `launch-screen.module.scss` (`$stripe-lightness` and its drop) and `MAP_SIZES`
in `game-map.ts` — so changing the launch screen changes the artwork on the next run, including
adding or removing a board, which changes the number of rungs.

Those lookups are regexes, so **renaming one of those constants breaks this script** — on
purpose. Each one throws by name rather than quietly falling back to a stale number, so a broken
run tells you which constant moved. Point the regex at wherever it went.

Two things are _not_ scraped and have to be kept in step by hand:

- `.dark { filter: invert(1) }` in `art.html` mirrors the rule of the same name in
  `game-map.module.scss`. That is how the opponent's things are drawn.
- the emoji in each board come from `OBJECT_CONFIG` in `game-objects.ts`. If an object's glyph
  changes, change it here too.

## The knobs, all at the top of `art.html`

- **`FLAT_RUNGS`** (on) — flat rungs instead of the launch screen's top-to-bottom gradient. The
  gradient is only ~4 points of lightness and near-invisible at these sizes, but it forces the PNG
  to carry a smooth ramp. That is what made the file too big to keep lossless, and quantising to
  fit is what put visible banding in the gradients. Flat rungs compress well enough that both
  files stay **lossless**, so there is nothing left to band. Turning this off will very likely put
  the thumbnail back over 64 kB.
- **`RUNG_BORDER`** (off) — the 1px/3px rim the launch screen's stripes wear. At these sizes it is
  mostly noise and it costs a colour transition on every rung edge.
- **`TILE_ALPHA`** (0.82) — how opaque a board tile is over the ladder. At 0.82 the board reads as
  solid and the rainbow becomes a frame around it; at ~0.55 the ladder reads _through_ the board
  and the whole picture is markedly more colourful. Worth trying if either image looks washed out.
- **`TARGETS`** — the two boards themselves: grid pitch, tile size, which emoji sit where, and the
  hero unicorn's size and position.

## Why the cover's board looks like that

It is laid out to match what `setMapSize` and the placement code in `game-map.ts` actually
generate, so it is a plausible board rather than a pretty arrangement:

| on the board             | the rule behind it                                                |
| ------------------------ | ----------------------------------------------------------------- |
| 🛁 / 🦄 mirrored corners | each side starts in its own corner                                |
| 🌈 beside a ⛲ *and* a 🍭 | both bend a unicorn's light; the ⛲ pays 💧, the 🍭 pays 🍬        |
| one 🗿 beside each of them | every fountain and lollipop loses one of its four lines to one   |
| no 🗿 touching two of them | each places its own, and a later one keeps off boulders already down |
| ⛲ and 🍭 rarely adjacent | they share a ring only on `SHARES_RING` (0.3) of placements        |
| twice as many 🍭 as ⛲   | `TREE_COUNT` is `tiles/27`, `FOUNTAIN_COUNT` is `tiles/54`         |
| 🚿 dead centre           | `getTile(map, { x: middle, y: middle })` — the contested tub site |
| 🍩 ×2, far apart         | donuts are a portal _pair_ or nothing                             |
| 🍮 ~1 per 12 tiles       | `CUSTARD_COUNT`                                                   |
| 🎁 ~1 per 45 tiles       | `CHEST_DENSITY`                                                   |
| ☁️ in two corners        | the fog, where neither side has walked yet                        |
| inverted glyphs          | the opponent's three objects — `getSide()` and `.dark`            |

The densities are read against a 40-tile crop of a board big enough to have a rival at all
(`RIVAL_SIZE` is 17), which is why both sides appear on it.

**Re-read this table after a rules change.** It was written when a lollipop tree was scenery that
a rainbow fed, and every line about light in it went stale the day the lollipop became the second
thing a unicorn can shine through (2026-09-12).

## Gotchas

- **The emoji are Noto**, pulled from Google Fonts, so the artwork looks the same wherever it is
  cut. The competition build makes no external requests, so a player sees their own system emoji
  — on a Mac, Apple's. The images are deliberately _not_ a promise about that.
- **The 2× capture-and-downscale is macOS-only** (it uses `sips`); elsewhere the script captures
  at 1× and the emoji edges are slightly softer.
- Set `CHROME=/path/to/chrome` if the script cannot find a browser.
