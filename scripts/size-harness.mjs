// What a feature actually costs in the zip — the tool behind the size-savings menu.
//
// For each *variant* it patches `src` to take one feature out, runs the real competition
// pipeline (vite js13k -> inline -> roadroller -> zip + ect), reads `dist.zip`, and puts the
// tree back. The answer is the difference to the `baseline` variant, which patches nothing.
//
// Why a harness rather than editing by hand and reading the size report:
//
//   - Roadroller's optimize() is randomised, so one reading is not a number. Every variant is
//     packed several times from a single vite build and the *minimum* is kept. The spread on an
//     unchanged tree is 15-25 bytes, which is also the floor of what this can measure at all:
//     under ~25 bytes, "saves nothing" and "saves a little" are the same reading.
//   - Removing something can make the build *bigger*. Terser's inlining decisions move when a
//     constant disappears, and a plausible-looking cut has been measured at -219 bytes (the
//     loot tint, 2026-09-12). Guessing is not available; this is why.
//
// Usage:
//   npm run size-harness                         every variant, 5 packs each
//   npm run size-harness -- --list               just the names
//   npm run size-harness -- baseline zoom-off    a subset (always include baseline)
//   npm run size-harness -- --repeats=3          fewer packs, faster and noisier
//
// It never passes --track, so `.size-history.json` and the "diff to previous build" line in
// `npm run build-js13k-roadroller` are left alone.
//
// **It runs `git checkout -- src .env.js13k` between variants**, so it refuses to start with
// uncommitted changes in either. Commit or stash first; --force is there for the case where
// you know the tree is disposable.
//
// **The VARIANTS below rot.** Each patch matches source text exactly and asserts that it
// matched, so a stale one fails loudly rather than quietly measuring nothing — but it still has
// to be rewritten against the code as it is now. Treat them as last time's questions, not as a
// fixture.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(import.meta.url), "../..");
const distDir = join(rootDir, "dist");
const zipFile = join(rootDir, "dist.zip");
// The files a variant may patch, and therefore the files that get reverted between variants.
const OWNED = ["src", ".env.js13k"];

const args = process.argv.slice(2);
const force = args.includes("--force");
const list = args.includes("--list");
const repeats = Number(args.find((a) => a.startsWith("--repeats="))?.slice(10) ?? 5);
const wanted = args.filter((a) => !a.startsWith("--"));

const run = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"] }).toString();
const revert = () => run("git", ["checkout", "--", ...OWNED]);

/**
 * Applies one variant's edits. Every edit asserts that it matched something: a patch written
 * against code that has since moved would otherwise measure the *unpatched* build and report
 * the feature as free.
 */
function applyEdits(edits) {
  for (const edit of edits) {
    const path = join(rootDir, edit.file);
    // A whole-file replacement, for stubbing a module out (see audio-all-off).
    if (edit.write !== undefined) {
      writeFileSync(path, edit.write);
      continue;
    }

    let source = readFileSync(path, "utf8");
    if (edit.regex) {
      const pattern = new RegExp(edit.regex, edit.flags ?? "g");
      if (!pattern.test(source)) throw new Error(`no match for /${edit.regex}/ in ${edit.file}`);
      source = source.replace(new RegExp(edit.regex, edit.flags ?? "g"), edit.replace);
    } else {
      if (!source.includes(edit.find)) throw new Error(`not found in ${edit.file}: ${edit.find.slice(0, 60)}...`);
      source = source.replace(edit.find, edit.replace);
    }
    writeFileSync(path, source);
  }
}

/**
 * One variant, end to end. The vite build runs once and `dist` is copied aside; only the
 * roadroller and zip steps repeat, since they are where the randomness is. That is what makes a
 * 5-pack variant ~13 seconds rather than ~30.
 *
 * vite does not typecheck, so a patch only has to be syntactically valid — stubbing a function
 * body is enough, and the type errors it leaves behind are irrelevant here.
 */
function measure(name, edits) {
  revert();
  try {
    applyEdits(edits);
  } catch (error) {
    revert();
    return { name, error: `patch: ${error.message}` };
  }

  try {
    run("npx", ["vite", "build", "-m", "js13k"]);
    run("node", ["scripts/inline.js"]);
  } catch (error) {
    revert();
    return { name, error: `build: ${(error.stderr ?? error.stdout ?? error).toString().trim().slice(-300)}` };
  }

  const snapshot = mkdtempSync(join(tmpdir(), "size-harness-"));
  cpSync(distDir, snapshot, { recursive: true });

  const sizes = [];
  for (let i = 0; i < repeats; i++) {
    rmSync(distDir, { recursive: true, force: true });
    cpSync(snapshot, distDir, { recursive: true });
    run("node", ["scripts/roadroll.js"]);
    run("node", ["scripts/package.js"]); // no --track: the history file is not ours to write
    sizes.push(statSync(zipFile).size);
  }

  rmSync(snapshot, { recursive: true, force: true });
  revert();
  return { name, min: Math.min(...sizes), sizes };
}

// ---------------------------------------------------------------------------------- variants
const COMPONENT = "src/components/game-map/game-map.component.ts";
const STYLES = "src/components/game-map/game-map.module.scss";
const ENV = "src/env-utils.ts";

// The bulb, and the tutorial's standing advice: shared, because the bot only leaves the bundle
// when every one of its callers does (see bot-gone).
const HINT_BUTTON_OFF = [
  {
    file: COMPONENT,
    find: `  const hintButton = createButton({ cssClass: CssClass.ICON_BTN, onClick: showHint }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: HINT_ACTION_EMOJI }),
  ]);`,
    replace: "",
  },
  { file: COMPONENT, find: "[turnDisplay, endTurnButton, hintButton]", replace: "[turnDisplay, endTurnButton]" },
  { file: COMPONENT, find: "    hintButton.disabled = isLocked() || !isRunning;", replace: "" },
  { file: COMPONENT, find: 'const HINT_ACTION_EMOJI = "💡";', replace: "" },
  { file: COMPONENT, regex: "  function showHint\\(\\) \\{[\\s\\S]*?\\n  \\}\\n", replace: "" },
];

const ADVICE_OFF = [
  {
    file: COMPONENT,
    find: "    advice = level ? undefined : getBotAction(map, BotStrategy.MIXED, PLAYER);",
    replace: "    advice = undefined;",
  },
];

const INFO_STRINGS_BLANK = [{ file: "src/translations/en.ts", regex: '(\\[TranslationKey\\.INFO_[A-Z_]+\\]: )"[^"]*"', replace: '$1""' }];

const FLY_INCOME_OFF = [
  {
    file: COMPONENT,
    regex: "  function flyIncome\\(\\): number \\{[\\s\\S]*?\\n    return end;\\n  \\}",
    replace: "  function flyIncome(): number {\n    return 0;\n  }",
  },
];

const VARIANTS = {
  baseline: [],

  // --- whole subsystems -----------------------------------------------------------------
  "audio-all-off": [
    {
      file: "src/audio/music-control.ts",
      write: `export async function initAudio(_muted: boolean) {}
export function generateUntilDone(_player: unknown): Promise<void> {
  return Promise.resolve();
}
export function togglePlayer(): boolean {
  return false;
}
export function toggleEffects(): boolean {
  return false;
}
export function isSoundOn(): boolean {
  return false;
}
export function playOrPauseMusicIfApplicable(_shouldPlay?: boolean) {}
`,
    },
    {
      file: "src/audio/sound-control/sound-control-box.ts",
      write: `export async function initSoundEffects() {}
export function playSoundEffect(_effect: number) {}
`,
    },
  ],

  // The bot out of the bundle entirely. Any two of these three leave it in, so the three
  // separate numbers below do not add up to this one.
  "bot-gone": [
    { file: ENV, find: "export const HAS_OPPONENT = true;", replace: "export const HAS_OPPONENT = false;" },
    ...HINT_BUTTON_OFF,
    ...ADVICE_OFF,
  ],

  "opponent-off": [{ file: ENV, find: "export const HAS_OPPONENT = true;", replace: "export const HAS_OPPONENT = false;" }],
  "sfx-off": [
    { file: ENV, find: "export const HAS_SIMPLE_SOUND_EFFECTS = true;", replace: "export const HAS_SIMPLE_SOUND_EFFECTS = false;" },
  ],
  "hint-button-off": HINT_BUTTON_OFF,
  "advice-off": ADVICE_OFF,

  // --- the info panel -------------------------------------------------------------------
  "info-strings-blank": INFO_STRINGS_BLANK,

  // Everything the panel says and the code that picks it. The panel element itself stays, so
  // the end-of-run score board still has somewhere to be appended.
  "info-panel-contents-off": [
    ...INFO_STRINGS_BLANK,
    {
      file: COMPONENT,
      regex: "  function setInfo\\(key: TranslationKey, emoji: string\\) \\{[\\s\\S]*?\\n  \\}\\n",
      replace: "  function setInfo(_key: TranslationKey, _emoji: string) {}\n",
    },
    {
      file: COMPONENT,
      regex: "  function showInfo\\(index\\?: number\\) \\{[\\s\\S]*?\\n  \\}\\n",
      replace: "  function showInfo(_index?: number) {}\n",
    },
    {
      file: COMPONENT,
      regex: "  function renderGrowth\\(tile: Tile\\) \\{[\\s\\S]*?\\n  \\}\\n",
      replace: "  function renderGrowth(_tile: Tile) {}\n",
    },
  ],

  "rank-ladder-off": [
    {
      file: COMPONENT,
      find: `    growthBar.replaceChildren(
      createElement({ tag: "span", text: \`\${getTranslation(TranslationKey.RANK)}:\` }),
      ...Array.from({ length: MAX_GROWTH + 1 }, (_, i) =>
        createElement({
          tag: "span",
          cssClass: [i > growth ? styles.pending : "", i === current ? styles.current : ""],
          text: i % GROWTH_PER_LEVEL ? GROWTH_MARK : \`\${1 + i / GROWTH_PER_LEVEL}\`,
        }),
      ),
    );`,
      replace: "    growthBar.replaceChildren();",
    },
    { file: "src/translations/en.ts", find: '[TranslationKey.RANK]: "Rank",', replace: '[TranslationKey.RANK]: "",' },
  ],

  // --- animation ------------------------------------------------------------------------
  "income-flights-off": FLY_INCOME_OFF,

  "all-flights-off": [
    ...FLY_INCOME_OFF,
    {
      file: COMPONENT,
      regex: "  function showSpending\\(position: Position, cost: number, currency = 0\\) \\{[\\s\\S]*?\\n  \\}\\n",
      replace: "  function showSpending(_position: Position, _cost: number, _currency = 0) {}\n",
    },
    {
      file: COMPONENT,
      regex: "  function flyToCounter\\(currency: number, from: number\\[\\], to: number\\[\\], delay: number\\) \\{[\\s\\S]*?\\n  \\}\\n",
      replace: "",
    },
    {
      file: COMPONENT,
      regex:
        "    const from = centre\\(tileElements\\[getIndex\\(position\\)\\]\\);\n    const to = centre\\(currencyDisplays\\[loot\\]\\);\n    const count = \\[CHEST_DROPS, CHEST_CANDY\\]\\[loot\\];\n    const stagger = Math\\.min\\(FLY_STAGGER, FLY_SPREAD / count\\);\n\n    for \\(let i = 0; i < count; i\\+\\+\\) flyToCounter\\(loot, from, to, i \\* stagger\\);\n",
      replace: "",
    },
    { file: COMPONENT, regex: "function flyGlyph\\(emoji: string[\\s\\S]*?\\n\\}\\n", replace: "" },
    {
      file: STYLES,
      find: `.fly {
  position: fixed;
  translate: -50% -50%;
  pointer-events: none;
  // Bigger than the counter it is heading for — it has a whole screen to cross and has to
  // read on the way; it shrinks towards the counter's own size as it lands.
  font-size: 1.8rem;
}`,
      replace: "",
    },
  ],

  "beams-off": [
    {
      file: COMPONENT,
      regex: "  function renderBeams\\(\\) \\{[\\s\\S]*?\\n  \\}\\n",
      replace: "  function renderBeams() {\n    beamLayer.replaceChildren();\n  }\n",
    },
  ],

  "site-cross-fade-off": [
    { file: COMPONENT, find: "      element.classList.toggle(styles.becoming, isBecoming);\n", replace: "" },
    {
      file: STYLES,
      find: `@keyframes becoming {
  0%,
  35% {
    opacity: 1;
  }
  50%,
  85% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}`,
      replace: "",
    },
    { file: STYLES, find: `  &.becoming > span {\n    animation: becoming 2.4s infinite;\n  }`, replace: "" },
  ],

  "rival-ring-off": [
    {
      file: COMPONENT,
      regex:
        "  function markRivalAction\\(position\\?: Position\\) \\{[\\s\\S]*?rivalMark\\?\\.classList\\.add\\(styles\\.acting\\);\n  \\}",
      replace: "  function markRivalAction(_position?: Position) {}",
    },
    { file: STYLES, find: `  &.acting {\n    box-shadow: inset 0 0 0 2px theme.$text-secondary;\n  }`, replace: "" },
    { file: STYLES, find: `      &.acting {\n        box-shadow: inset 0 0 0 2px theme.$night-text-secondary;\n      }`, replace: "" },
  ],

  // Measured at -219 bytes on 2026-09-12: taking it out makes the build BIGGER. Kept in the
  // list as the standing reminder that a cut has to be measured before it is believed.
  "loot-tint-off": [
    { file: COMPONENT, find: '      if (hasLoot) ground.style.setProperty("--l", `${LOOT_HUES[tile.loot!]}deg`);\n', replace: "" },
    { file: COMPONENT, find: "const LOOT_HUES = [180, 0, 270];", replace: "" },
    { file: STYLES, find: `    &.loot {\n      filter: hue-rotate(var(--l, 0deg));\n    }`, replace: "" },
  ],

  // --- controls -------------------------------------------------------------------------
  "zoom-off": [
    {
      file: COMPONENT,
      find: `  const zoomOutButton = createButton({ cssClass: styles.zoomStep, onClick: () => zoom(-1) }, ["−"]);\n`,
      replace: "",
    },
    {
      file: COMPONENT,
      find: `  const zoomInButton = createButton({ cssClass: styles.zoomStep, onClick: () => zoom(1) }, ["+"]);\n`,
      replace: "",
    },
    {
      file: COMPONENT,
      find: `  const zoomChip = createElement({ cssClass: styles.zoomChip }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: ZOOM_EMOJI }),
    zoomOutButton,
    zoomInButton,
  ]);`,
      replace: "",
    },
    {
      file: COMPONENT,
      find: "    ...(HAS_DEV_TOOLS ? [createFogButton(), ...createLevelButtons(), ...createBotControls()] : []),\n    zoomChip,",
      replace: "    ...(HAS_DEV_TOOLS ? [createFogButton(), ...createLevelButtons(), ...createBotControls()] : []),",
    },
    {
      file: COMPONENT,
      find: `    if (reset) {
      const readable = ZOOM_STEPS.findIndex((step) => fit * step >= COMFORT_TILE);
      zoomIndex = readable < 0 ? ZOOM_STEPS.length - 1 : readable;
    }

    board.style.setProperty("--tile", \`\${fit * ZOOM_STEPS[zoomIndex]}px\`);
    zoomOutButton.disabled = !zoomIndex;
    zoomInButton.disabled = zoomIndex === ZOOM_STEPS.length - 1;`,
      replace: '    board.style.setProperty("--tile", `${fit}px`);',
    },
    { file: COMPONENT, regex: "  function zoom\\(direction: number\\) \\{[\\s\\S]*?\\n  \\}\\n", replace: "" },
    { file: COMPONENT, find: "const ZOOM_STEPS = [1, 1.5, 2.2, 3];", replace: "" },
    { file: COMPONENT, find: "const COMFORT_TILE = 32;", replace: "" },
    { file: COMPONENT, find: 'const ZOOM_EMOJI = "🔍";', replace: "" },
    { file: COMPONENT, find: "  let zoomIndex = 0;", replace: "" },
    {
      file: STYLES,
      find: `.zoomChip {
  display: flex;
  align-items: center;
  gap: 0.1rem; // the two steps sit against each other; the chip's padding is what holds them in
  padding: 0.15rem 0.5rem;
  border-radius: 999px; // pill, whatever the chip's height turns out to be
  background: theme.$glass-1;
}`,
      replace: "",
    },
    {
      file: STYLES,
      find: `.zoomStep {
  width: 1.6rem;
  height: 1.6rem;
  // Not inherited from the button rule: the box is fixed and border-box, so the page's button
  // padding would leave a content box smaller than the glyph and hang it off the bottom.
  padding: 0;
  border: none;
  background: none;
  font-size: 1.2rem;
  line-height: 1;
}`,
      replace: "",
    },
  ],

  "end-turn-confirm-off": [
    {
      file: COMPONENT,
      find: `    if (confirmsEndTurn || advisesEndTurn() || !canAct(map, PLAYER)) return finishTurn();

    confirmsEndTurn = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      confirmsEndTurn = false;
      render();
    }, CONFIRM_TIMEOUT);
    render();`,
      replace: "    return finishTurn();",
    },
    {
      file: COMPONENT,
      find: `  function disarmEndTurn() {\n    clearTimeout(confirmTimer);\n    confirmsEndTurn = false;\n  }`,
      replace: "  function disarmEndTurn() {}",
    },
  ],

  "score-breakdown-toggle-off": [
    {
      file: COMPONENT,
      find: `  function toggleScore() {
    if (!isRunning || isLocked()) return; // the end-of-run panel is already showing the working
    showsScore = !showsScore;
    showInfo(selected && getIndex(selected));
    render();
  }`,
      replace: "  function toggleScore() {}",
    },
    {
      file: COMPONENT,
      find: "  const scoreDisplay = counter(SCORE_EMOJI, scoreCount, toggleScore);",
      replace: "  const scoreDisplay = counter(SCORE_EMOJI, scoreCount);",
    },
  ],

  "income-badge-off": [
    {
      file: COMPONENT,
      find: `      const isPaying = isVisible && tile.object === GameObjectType.RAINBOW;
      element.classList.toggle(styles.badged, isPaying || isPointed);`,
      replace: "      element.classList.toggle(styles.badged, isPointed);",
    },
    {
      file: COMPONENT,
      regex: '      if \\(isPaying\\) element\\.style\\.setProperty\\("--i", `"\\$\\{LOOT_EMOJIS\\[getRainbowIncome[^\\n]*\\n',
      replace: "",
    },
    { file: COMPONENT, find: "      else if (isPointed) element.style", replace: "      if (isPointed) element.style" },
  ],

  "retry-off": [
    {
      file: COMPONENT,
      find: `  const retryButton = createButton({ cssClass: CssClass.SECONDARY, onClick: () => startRun(seed) }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: RETRY_EMOJI }),
    \` \${getTranslation(TranslationKey.RETRY)}\`,
  ]);`,
      replace: "  const retryButton = createElement({});",
    },
    { file: COMPONENT, find: 'const RETRY_EMOJI = "🔁";', replace: "" },
    { file: "src/translations/en.ts", find: '[TranslationKey.RETRY]: "Retry",', replace: '[TranslationKey.RETRY]: "",' },
  ],

  "continue-off": [
    {
      file: COMPONENT,
      find: `  const nextButton = createButton({ cssClass: CssClass.SECONDARY, onClick: () => startNewGame(level + 1) }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: GAME_EMOJI }),
    \` \${getTranslation(TranslationKey.CONTINUE)}\`,
  ]);`,
      replace: "  const nextButton = createElement({});",
    },
  ],
};

// --------------------------------------------------------------------------------------- run
if (list) {
  console.log(Object.keys(VARIANTS).join("\n"));
  process.exit(0);
}

const dirty = run("git", ["status", "--porcelain", "--", ...OWNED]).trim();
if (dirty && !force) {
  console.error("Uncommitted changes in src/ or .env.js13k — this harness reverts them between variants.");
  console.error("Commit or stash first, or pass --force if the tree is disposable.\n");
  console.error(dirty);
  process.exit(1);
}

const names = wanted.length ? wanted : Object.keys(VARIANTS);
for (const name of names) {
  if (!VARIANTS[name]) {
    console.error(`unknown variant "${name}" — try --list`);
    process.exit(1);
  }
}

console.log(`${names.length} variants, ${repeats} packs each\n`);

let baseline;
for (const name of names) {
  const result = measure(name, VARIANTS[name]);
  if (result.error) {
    console.log(`${name.padEnd(28)} ERROR ${result.error}`);
    continue;
  }

  if (name === "baseline") baseline = result.min;
  // Deliberately not called a saving: a negative number here means the cut costs bytes, and a
  // number under the packing spread means it cannot be told from nothing.
  const delta = baseline === undefined ? "" : `${String(baseline - result.min).padStart(6)} B`;
  console.log(`${name.padEnd(28)} min ${result.min}  ${delta}  (${result.sizes.join(" ")})`);
}

if (baseline === undefined) console.log("\n(no baseline in this run — the numbers are absolute sizes, not deltas)");
