export const IS_POKI_ENABLED = import.meta.env.POKI_ENABLED === "true";
const IS_JS13K = import.meta.env.IS_JS13K === "true";
export const IS_DEV = import.meta.env.DEV && !IS_JS13K;

// Feature flags — everything behind a `!IS_JS13K` flag is tree-shaken out of
// the competition build. Add flags here instead of sprinkling mode checks.
// globals.nice2have.scss: the emoji webfont and the animated rainbow wash. Off in poki mode as
// well as in the competition build — neither platform allows external requests, and a Poki
// playtest is screen-recorded while it is played, which a full-viewport hue-rotate repainting
// every frame is the worst thing on the page for. The static dark background and the
// reduced-motion override are in globals.scss and ship everywhere.
export const HAS_VISUAL_NICE_TO_HAVES = !IS_JS13K && !IS_POKI_ENABLED;
// The random board: the 🎲 on a finished level's stripe, which deals its size again from a
// fresh seed. Replay value rather than game — it scores nothing and earns nothing — so it is
// the first thing to be worth its bytes outside the competition build and not in it. The poki
// build gets it too: that audience plays for as long as there is something to play.
export const HAS_GAMEPLAY_NICE_TO_HAVES = !IS_JS13K;
// The counters' reaction to their number changing — the swell-and-settle on the purse, the
// income and the score (pop() in game-map.component.ts). The flights that carry the money to
// the counter stay in every build: they are what makes income legible on a big board. The pop
// on landing is the smaller half of that gesture, and the one the competition build can do
// without — measured at ~93 packed bytes (2026-09-10). Poki keeps it: no reason not to.
export const HAS_COUNTER_POPS = !IS_JS13K;
export const HAS_ADVANCED_DEBUGGING = !IS_JS13K;
// Tools for looking at the game rather than playing it. Tied to the dev server rather than to
// !IS_JS13K, so they are absent from the friends-&-family build too — that one is played by
// people, and being able to switch the fog off would give the whole board away.
export const HAS_DEV_TOOLS = IS_DEV;
// The bot showing its working: the `label` on every action it invents, and the RANDOM
// strategy, which is a bot nothing but a measurement ever plays. Both are read by the dev
// corner's console output and by the two harnesses — and by nothing else, so in a shipped
// build they are strings built and thrown away, plus a whole getLegalActions nobody calls.
// Wider than HAS_DEV_TOOLS on purpose: `npm run bot` is a `vite build` and so has DEV false,
// which would have taken the harness's own verbose output out with the competition build's.
export const HAS_BOT_LOGS = IS_DEV || import.meta.env.MODE === "bot";
// The opponent: a second unicorn racing the player on the three biggest boards, played by the
// game's own bot. It is the one feature that is a whole second player — a second economy, a
// second fog and a second score — and it was off in the competition build until the byte count
// said it could be afforded. It can: it costs ~2.2 kB zipped and the round that paid for it is
// in the git log. See RIVAL_SIZE in game-map.ts for which boards it turns up on.
// Still a flag rather than an assumption, because it is the one thing in here big enough to be
// worth switching off again if the last kilobyte ever has to come from somewhere.
export const HAS_OPPONENT = true;
export const HAS_SIMPLE_SOUND_EFFECTS = true;
// Letting the player pick which unicorn is theirs — the bright one or the dark one — and the
// dark theme that comes with the dark one. Presentation only: whichever is picked, the player
// plays the same side from the same corner with the same economy, and only which of the two is
// drawn inverted changes (see src/utils/dark-side.ts). Off in the competition build, where the
// last kilobyte is spoken for; the friends-&-family and poki builds get it.
//
// It is the one flag the *stylesheets* read as well, because the dark theme is a second palette
// and a stylesheet cannot be tree-shaken. See the scss block in vite.config.ts, which hands the
// same env var to SCSS as `$has-side-choice`. **The two must agree**: the class this switches on
// is only styled where that variable is true.
export const HAS_SIDE_CHOICE = import.meta.env.SIDE_CHOICE_ENABLED === "true";

// Runtime {0}/{1} placeholder substitution in translations. Off, because no string in any
// language uses one — the numbers the interface shows are appended by the component, not
// interpolated into a sentence. Turn it back on with the first string that needs it; the
// regex and the rest-args are what it costs.
export const HAS_TEXT_PLACEHOLDERS = false;

// Secondary languages. English always ships as the default/fallback; enable any
// additional language per build mode via its `LANG_<code>_ENABLED` env var (see
// the .env* files). Each flag is a compile-time constant, so a disabled
// language's translation map is tree-shaken out entirely (0 bytes).
// To add one, e.g. French: add LANG_FR_ENABLED to the .env* files, a HAS_FRENCH
// flag here (and to HAS_SECONDARY_LANGUAGE below), a src/translations/fr.ts, and
// one branch in i18n.ts.
export const HAS_GERMAN = import.meta.env.LANG_DE_ENABLED === "true";
// Latin American Spanish, for the poki audience: a large share of the players there are South
// American. Off in js13k, where English is the whole of what fits.
export const HAS_SPANISH = import.meta.env.LANG_ES_ENABLED === "true";
// Whether *any* secondary language ships. What it buys is one `if` around the language sniff in
// i18n.ts: `navigator.language` is a property read terser cannot prove side-effect-free, so a
// sniff whose every reader has been compiled away would otherwise be kept and performed on
// every single lookup. Add a language above and this picks it up.
export const HAS_SECONDARY_LANGUAGE = HAS_GERMAN || HAS_SPANISH;

export const GAME_TITLE = "Empire of Sugar";
// The game's mark, on the launch screen's play button — the header is the title alone now, and
// the favicon in vite.config.ts is this same glyph. The unicorn rather than the fountain: it is
// the piece the player *is*, the one glyph on the board that is alive, and what the
// competition's theme is called. A fountain is the more interesting object and the worse mark —
// at a favicon's size it is a grey blob, where the unicorn is unmistakable.
// Drawn in the emoji font's own colours, which are already the game's: a pale pink-and-white
// body on a cream-pink page.
export const GAME_EMOJI = "🦄";
