import { getLocalStorageItem, LocalStorageKey, setLocalStorageItem } from "../utils/local-storage";

/**
 * The levels: one per rung of MAP_SIZES, and each of them one number. A board is fully
 * determined by its seed (see random-utils), so a curated level is nothing but the seed it is
 * built from — there is no level data in the bundle, and replaying one costs a call to
 * createGameMap rather than a snapshot.
 *
 * PLACEHOLDER seeds, re-picked 2026-09-12 over seeds 1-40 on every board. For each rung, the
 * seed whose score under the `mixed` bot sits closest to the median of the forty — a map that is
 * neither a gift nor a punishment, so the ladder climbs on the board getting bigger rather than
 * on the luck of the deal. On the three boards with an opponent, closeness of the two sides'
 * scores counts as well: a seed the rival runs away with, or one the player's corner owns, is
 * not a race whatever its median says. Small numbers because nothing needs them to be large and
 * short numbers cost less.
 *
 * The medians they were picked against: 264, 1078, 1302, 2162, 2871, 4700, 6365.
 *
 * The shortlist was then *looked at*, which is the half no median can do — a custard sitting in
 * a board corner is a tile nobody will ever walk in to use, a portal pair that skips four tiles
 * is not a portal, and a shower three tiles from a base is a building worth nothing to raise.
 * The last of those turned out to be common enough to fix in the generator instead (see
 * placeObject), which is why these seeds are younger than the sweep above them.
 *
 * Level 3 is picked on a third thing again: its *band*. All forty 9x9 seeds were played twenty
 * times over with nothing varied but the seed the bot's tie-breaks come off, and three of them —
 * including the one the median first chose — came back with the same score twenty times out of
 * twenty. A board with one run in it is a board where nothing a player decides can matter, which
 * no median will ever report. Seed 2's band is 47% of its median wide and its own run sits on
 * that median, so it is a middling board that can still be played well or badly.
 *
 * The tutorial is the one picked against that rule. Its ceiling is 400 — two rainbows, two
 * unicorns, no cloud left — and half the seeds have no way to reach it: the second unicorn is
 * in the present, and a present without one in it caps the board at 176 whatever anybody does.
 * Level 1 is where the whole loop is taught, so it is a board where the loop can actually be
 * completed, which is what makes its ceiling a target worth setting (see LEVEL_TARGETS).
 *
 * **These are tied to the generation code.** Everything in createGameMap comes off the one
 * seeded generator in the order it is rolled, so adding, removing or reordering a roll builds
 * a different map from the same number — and the targets below, which were measured on these
 * maps, stop describing them. Re-run the bot and re-pick both lists when that happens.
 */
export const LEVEL_SEEDS = [10, 32, 2, 14, 24, 31, 7];

/**
 * What 100% is worth on each level: the best run played on that board.
 *
 * Records again, and Almut's own: set 2026-09-12 on these seven boards as they now are, so full
 * marks means "as well as this board has ever been played" rather than the stand-in it was. The
 * list they replace was the shipped bot's best tie-break roll (BOT_MAX_SCORES below), which stood
 * in while the boards were younger than any record on them; every rung of it has now been beaten,
 * by between 3% (level 6) and 23% (level 5). Each target is the old one taken up by the percentage
 * the run reported, by the rule below, and then to the round hundred: a run that clears the last
 * cloud scores (rainbows + unicorns) x 100 exactly (see getScore), and the half-percent band a
 * reported percentage leaves has exactly one multiple of 100 in it on every rung. So these are
 * the scores themselves rather than a reconstruction of them - 12, 18, 30, 53, 69 and 78 things
 * built on a board with nothing left under cloud.
 *
 * Level 1 is the exception and always will be: 400 is the board's ceiling — two rainbows, two
 * unicorns, no cloud left (see LEVEL_SEEDS) — so its 100% is perfection rather than a best, and
 * the run that reads 100% there is a board played out rather than a record to beat.
 *
 * **Updating one after a better run:** multiply the old target by the percentage the run came
 * out at. It pins exactly, and not by luck — the panel rounds the percentage to a whole number,
 * so a reading of p% puts the score inside a band half a percent wide either way, and getPercent
 * rounds by the same half percent. For any p at or above 100 the whole band comes back out as
 * 100%, whatever the score inside it actually was.
 *
 * The bot's own scores on these boards are in BOT_MIN_SCORES / BOT_MAX_SCORES below, which
 * `npm run levels` re-measures. Read them whenever the economy moves and the ladder has to be
 * re-read: what the bot makes of a board is the one reading of it that does not need playing.
 */
export const LEVEL_TARGETS = [400, 1200, 1800, 3000, 5300, 6900, 7800];

/**
 * What the game's own opponent scores on each level, as the two ends of one band: the shipped
 * `mixed` bot on that exact board, with nothing varied but the seed its tie-breaks come off
 * (twenty of them, 1000-1019, via `npm run levels`). Both rows are runs the opponent really
 * had — the same bot on a bad day and on a good one — which is what makes them a pair rather
 * than a number and an error bar.
 *
 * **Nothing reads these yet.** They are here for the second score target — "beat the bot"
 * beside LEVEL_TARGETS' "beat the author" — and are deliberately unused until that lands. They
 * cost the bundle nothing while they are: both arrays tree-shake out, measured at no change to
 * the packed zip.
 *
 * The run a player actually faces is neither row: it is `mixed` seeded from the *map* seed,
 * which is what the game does (resetBot in game-map.component.ts) — 368, 1000, 1400, 2475,
 * 2871, 4655, 6270. It is at the top of the band on the tutorial and the 7x7, exactly on the
 * median on the 9x9, and below it on the three boards with a rival — one seeded run is a fact
 * about that seed and not about the bot.
 *
 * How wide these bands are is worth reading on its own: the 17x17's runs 2200 to 4320 on one
 * board with nothing changed but which way a tie fell. That is the game having genuinely
 * different runs in it, and it is also why a single-seed reading of anything should be taken
 * lightly — `explore` beats `mixed` on level 6 in the strategy table `npm run levels` prints,
 * and the 30-seed sweep behind STRATEGY_WEIGHTS says that is this seed, not the weights.
 * Whichever row a target ends up reading, the number the player watches on screen on the three
 * boards with a rival is lower again — the dark side gives up the closing turn (see hasGo).
 *
 * MAX is a lower bound rather than a ceiling: twenty seeds is what was rolled, and rolling more
 * can only ever find a better run. Re-measure both when the economy moves.
 */
export const BOT_MIN_SCORES = [276, 784, 1045, 2112, 2200, 3610, 4680];
export const BOT_MAX_SCORES = [384, 1000, 1700, 2673, 4320, 6693, 7178];

/**
 * A score as its share of the level's target, as a whole percent. It is what fills the level's
 * stripe on the launch screen and what closes the score panel at the end of a run.
 *
 * Not capped. 100% is the best run there has been and a fine place to stop, but a board played
 * better than that is the one number a player has to chase once the ladder has been climbed,
 * and a percentage that stops at full would quietly throw it away — it is also how the targets
 * above get updated. The *bar* is capped — a stripe cannot be more than full — which is the
 * launch screen's business rather than this one's.
 */
export function getPercent(level: number, score: number): number {
  return ((score * 100) / LEVEL_TARGETS[level] + 0.5) | 0;
}

/**
 * The best score on a level's own board, per level, or 0 for one never finished. Runs on a
 * random seed are deliberately not in here: a level's percentage stands for the one board every
 * player gets, so a lucky deal cannot fill a stripe.
 *
 * Stored as one comma-joined list under one key rather than a key per level — the whole point
 * of the levels being an ordered ladder is that a list indexed by rung says everything.
 */
const getScores = () => (getLocalStorageItem(LocalStorageKey.SCORES) ?? "").split(",");

export function getBestScore(level: number): number {
  return +getScores()[level] || 0;
}

export function setBestScore(level: number, score: number) {
  if (score <= getBestScore(level)) return;

  const scores = getScores();
  scores[level] = `${score}`;
  // A level finished before an earlier one leaves holes behind it, and join writes a hole as
  // the empty string — which +"" reads straight back as the 0 it was.
  setLocalStorageItem(LocalStorageKey.SCORES, scores.join(","));
}
