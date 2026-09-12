import styles from "./game-map.module.scss";
import { createButton, createElement, createElements } from "../../utils/html-utils";
import { LocalStorageKey, setLocalStorageItem } from "../../utils/local-storage";
import { PubSubEvent, pubSubService } from "../../utils/pub-sub-service";
import { CssClass } from "../../utils/css-class";
import { GAME_EMOJI, HAS_COUNTER_POPS, HAS_DEV_TOOLS, HAS_GAMEPLAY_NICE_TO_HAVES, HAS_OPPONENT, HAS_SIDE_CHOICE } from "../../env-utils";
import { getTranslation } from "../../translations/i18n";
import { TranslationKey } from "../../translations/translationKey";
import {
  BASE_INCOME,
  build,
  buyUnicorn,
  canBuild,
  canUsePortal,
  CHEST_CANDY,
  CHEST_DROPS,
  createGameMap,
  createSeed,
  GameMap,
  Tile,
  getIndex,
  endTurn,
  getBuild,
  getBuildTargets,
  getUnicornPrice,
  getExploration,
  getUnicornLevel,
  getGrowth,
  GROWTH_PER_LEVEL,
  MAX_GROWTH,
  getMoveCost,
  getMoveTargets,
  getPortalTargets,
  getPosition,
  getRainbowIncome,
  getScore,
  getScoreParts,
  getSpawnTargets,
  canAct,
  HAS_RIVAL,
  hasGo,
  isRunOver,
  isSeen,
  MAP_SIZE,
  MAP_SIZES,
  moveCharacter,
  nextTurn,
  openChest,
  PORTAL_COST,
  Position,
  revealAround,
  TREE_COUNT,
  TURN_LIMIT,
  updateRainbows,
} from "../../game/game-map";
import {
  ChestLoot,
  GameObjectType,
  getSide,
  followsSideChoice,
  OBJECT_CONFIG,
  PLAYER,
  RIVAL,
  SIDE_BATHTUB,
  SIDE_UNICORN,
} from "../../game/game-objects";
import { darkSide } from "../../utils/dark-side";
import { getPercent, LEVEL_SEEDS, LEVEL_TARGETS, setBestScore } from "../../game/levels";
import { playSoundEffect } from "../../audio/sound-control/sound-control-box";
import { SoundEffect } from "../../audio/sound-control/sound-effect";
import {
  applyBotAction,
  BOT_STRATEGIES,
  BOT_STRATEGY_EMOJIS,
  BOT_STRATEGY_NAMES,
  BotActionKind,
  BotStrategy,
  getBotAction,
  resetBot,
} from "../../game/bot";

const FOG_EMOJI = "☁️";
const DROP_EMOJI = "💧";
const TURN_EMOJI = "⏳";
// The closing turn's own emoji: the same hourglass, run out. It is the whole "this is your
// last turn" signal, and being an emoji rather than a word it needs no translation and
// stays out of the end-turn button, which already carries three states of its own.
const LAST_TURN_EMOJI = "⌛";
const SCORE_EMOJI = "⭐";
// Labels the two zoom steps, the way every counter in the game is labelled by the thing it
// counts. Without it a bare − and + in a row of counters read as something to do with the
// numbers beside them. It sits inside the chip with them, so the label cannot drift from what
// it labels — see .zoomChip.
const ZOOM_EMOJI = "🔍";
// Stand-ins for the object emoji in the info panel, for the things that are not objects.
const HINT_EMOJI = "👆";
// The hint button in the turn bar — the one control that answers "what now?" with a move on
// the board rather than with a sentence in the panel. A bulb rather than the panel's finger:
// the two are different questions ("tap something" vs "here is what I would do"), and the
// board would otherwise be pointing at itself with the same glyph twice.
const HINT_ACTION_EMOJI = "💡";
// PLACEHOLDER glyph for one turn's step on the unicorn's ladder, between the rank numbers:
// "Rank: 1 • • 2 • • 3", see renderGrowth. A bullet rather than a middle dot or a full stop:
// big enough to read as a rung, and not as punctuation.
const GROWTH_MARK = "•";
// Not the seedling: that is the lollipop-tree build site now, and two different things in the
// info panel must not wear the same glyph.
const EMPTY_EMOJI = "🌾";
// Ground no longer under cloud, in the score breakdown: the cloud itself, standing for the
// ones cleared off the board rather than the ones still on it. Same glyph as the fog on the
// board, which is what ties the row to the thing it counts.
const EXPLORE_EMOJI = FOG_EMOJI;
const CANDY_EMOJI = "🍬";
// One per scoring category, in the order getScoreParts returns them: rainbows shining and
// unicorns found. Exploration is not in here — it is what each of the two is worth rather
// than a third of them, so the panel gives it a line of its own at the top.
const SCORE_EMOJIS = [OBJECT_CONFIG[GameObjectType.RAINBOW].emoji, OBJECT_CONFIG[GameObjectType.UNICORN].emoji];
// The same board again, on the button that starts it over.
const RETRY_EMOJI = "🔁";
// The level's target, in the row that says how near the run came to it. A target rather than a
// second ⭐: the score above it is already the star's own number, and this row is what that
// number was being measured against.
const TARGET_EMOJI = "🎯";
const WIN_EMOJI = "🎉";
// The ending that is no longer a celebration. Only reachable on a board with an opponent on
// it — without one there is nobody to come second to, and WIN_EMOJI is the only ending there is.
const LOSE_EMOJI = "🌑";
// PLACEHOLDER: the beat between two of the opponent's actions. Its whole turn is played out
// in front of the player rather than resolved in a flash, because a rival that simply
// teleports between turns is a number going up rather than somebody racing you — but a 25x25
// turn can be thirty actions long, so this is deliberately quicker than the dev bot's own
// step: fast enough that a turn passes in a couple of seconds, slow enough to see what moved.
const RIVAL_STEP_DELAY = 60;
// PLACEHOLDER zoom steps, as multiples of "the whole board fits in the view". Expressing
// them as multiples rather than tile sizes is what makes step 0 a true overview on any map
// size and any screen — a fixed tile size that suits a 9x9 phone board would leave a 20x20
// one unreadable, and one that suits 20x20 would waste the screen at 9x9.
const ZOOM_STEPS = [1, 1.5, 2.2, 3];
// PLACEHOLDER: the tile size a run wants to open at — big enough for the emoji to read and
// for a finger to hit. It picks the opening zoom step; see applyZoom.
const COMFORT_TILE = 32;
const MIN_TILE = 8; // a floor for the maths below, in case the map row is measured before it has a size
// PLACEHOLDER: how far the springboard's hue turns from one diagonal of the board to the next
// (see .small). A full circle every twelve of them, which on any board in the ladder is enough
// for two neighbouring custards to be plainly different flavours without the board reading as a
// gradient — they are scattered about a tile in twelve, so what is seen is the variety and never
// the sweep it is cut from.
const HUE_STEP = 30;
// PLACEHOLDER: what a present is wrapped in, by what is inside — degrees, indexed by ChestLoot.
// Water turns the box blue, which is the colour its beams and its counter already are. Candy
// keeps the wrapping the emoji came in, red ribbon and all: it is the middle prize, and leaving
// the middle one untinted means there are two colours to learn rather than three, with the plain
// present reading as the ordinary one. A unicorn takes the third quarter of the wheel, far enough
// from both to be told apart at a glance.
const LOOT_HUES = [180, 0, 270];
// The three prizes as glyphs, indexed by ChestLoot — what the info panel names in place of the
// wrapping once the player has found a present. The colour says it on the board; this says the
// same thing once, in a form with no code to learn, and it is what a player who cannot tell the
// two tints apart reads instead.
const LOOT_EMOJIS = [DROP_EMOJI, CANDY_EMOJI, OBJECT_CONFIG[GameObjectType.UNICORN].emoji];
// PLACEHOLDER payout-flight timings. FLY_SPREAD is the window all departures share rather
// than a gap apiece: a big board can be paying out thirty times at once, and one emoji every
// FLY_STAGGER would take longer to watch than the turn took to play.
const FLY_DURATION = 500;
const FLY_STAGGER = 70;
const FLY_SPREAD = 400;
// The beat between the two currencies: the drops are all in the purse before the first sweet
// leaves its tree. It is dead time on top of the flights themselves, so it buys the two halves
// their separation at the price of a longer wait between turns.
const CURRENCY_GAP = 400;
// PLACEHOLDER: how far apart a candy beam's parallel lines sit, in tiles. One line per sweet
// the pairing pays (see renderBeams), so a fully grown tree draws three of them across the one
// tile between it and its rainbow — wide enough to count, narrow enough to still read as one
// feed rather than as three unrelated beams.
const BEAM_GAP = 0.16;
// PLACEHOLDER: the counter's reaction to an arrival — out and back, so the whole pop is
// twice this. Short enough that a stagger's worth of payments still reads as separate hits.
const POP_DURATION = 120;
const POP_SCALE = 1.35;
// The colour the drop counter takes while it is being spent from — the same pop as income,
// in the negative. A literal because a keyframe cannot read a stylesheet: keep it in step
// with theme.scss's $danger-color-contrast by hand.
const SPEND_COLOR = "#c22a4a";
// The colour a counter takes when what it is worth goes *up* — the income growing, the score
// climbing. The mirror of SPEND_COLOR, and a literal for the same reason: a keyframe cannot
// read a stylesheet, so keep it in step with theme.scss's $success-color-light by hand. Only the
// pop reads it, so it is out of the competition build with the pop (see HAS_COUNTER_POPS).
const GAIN_COLOR = "#1d8055";
// PLACEHOLDER spend-feedback timings. One drop rises off the tile per drop paid, so a portal
// jump throws two and a free step off a custard throws none — the same "one glyph, one unit"
// the payout speaks in. The rise is in em, so it scales with the glyph rather than the zoom.
const SPEND_DURATION = 700;
const SPEND_STAGGER = 120;
// The window every departure shares, the same shape as FLY_SPREAD and for the same reason:
// a unicorn now costs one sweet per head of the herd, so an unbounded stagger would make a
// purchase take longer to watch the bigger the herd got.
const SPEND_SPREAD = 400;
const SPEND_RISE = 2.2;
// Every counter reaction is this same beat, whichever direction the money went.
const POP_OPTIONS: KeyframeAnimationOptions = { "duration": POP_DURATION, "direction": "alternate", "iterations": 2 };
// PLACEHOLDER: the beat between two actions while the dev bot is playing a run out by itself.
// Fast enough to watch a 25-turn run in under a minute, slow enough to follow what moved.
// It is also how often the timer looks to see whether the payout has finished, which is the
// one thing that makes it wait — see toggleAutoPlay.
const AUTO_STEP_DELAY = 120;
// PLACEHOLDER: how long the end-turn button stays asking before it forgets it was asked — see
// the guard on it below. Long enough to answer without hurrying, short enough that a button
// left armed by a tap nobody meant is back to its plain self before it is looked at again.
const CONFIRM_TIMEOUT = 3000;

/**
 * What a build site costs, as the tag written on the tile — in the currencies it is actually
 * paid in, so a fountain shows only water, a lollipop tree only sweets and the tub both.
 *
 * One − for the pair rather than one each. Both halves are leaving the purse, which the single
 * sign already says, and the tag is drawn at 0.4em on a tile that also has a glyph on it: six
 * characters fit there and eight do not.
 */
function getPriceTag([, drops, candy]: NonNullable<ReturnType<typeof getBuild>>): string {
  return `−${drops ? `${drops}${DROP_EMOJI}` : ""}${candy ? `${candy}${CANDY_EMOJI}` : ""}`;
}

// What a jump costs, written on the far donuts a portal is offering. It cannot move — a jump is
// PORTAL_COST wherever it lands — so it is built once for the whole game rather than once per
// render. The other two prices that used to live here are both gone: the tub's could not be a
// constant at all — it is the size of the herd, and it is written on the tub itself now (see
// isSelling) — and a plain step's was dropped because MOVE_COST is the same on every tile and
// in every turn, so eight copies of it around the selected unicorn annotated nothing the player
// did not already know and crowded the board doing it. The one thing about a step worth saying
// is said in the ring's colour instead: green when it is free off a springboard.
//
// Signed, because a bare number on a tile reads as something the tile is worth rather than
// something it takes: this is money leaving the purse. The same − the zoom step out wears, so
// the two are one character rather than two lookalikes.
const JUMP_TAG = `−${PORTAL_COST}${DROP_EMOJI}`;

/**
 * Where an element sits on the screen, as its centre — a tile a glyph leaves from and a
 * counter it flies to are both aimed at by their middle.
 *
 * NOTE for everything below that animates: the keys of a keyframe and of an options object
 * are properties terser is free to rename, and `easing` and `iterations` are not on its list
 * of known browser names — they were silently mangled and quietly stopped working. Every key
 * handed to `animate` is therefore quoted, which is what `keep_quoted` protects.
 */
function centre(element: HTMLElement): number[] {
  const { x, y, width, height } = element.getBoundingClientRect();
  return [x + width / 2, y + height / 2];
}

/**
 * A glyph that flies and is gone: dropped on the page at `from`, animated to `keyframe`, and
 * taken off again when it lands. It is positioned by its centre — see the `translate` in the
 * stylesheet — so `from` is the middle of whatever it is leaving.
 */
function flyGlyph(emoji: string, [x, y]: number[], keyframe: Keyframe, options: KeyframeAnimationOptions, onLand?: () => void) {
  const element = createElement({ cssClass: [styles.fly, CssClass.EMOJI], text: emoji });

  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  document.body.append(element);

  // A single keyframe on purpose: the missing one is filled in from the element as it stands,
  // which is exactly where it starts. With no `fill`, a glyph waiting for its turn simply
  // sits where it was put until its delay is up.
  const animation = element.animate([keyframe], options);

  animation.onfinish = () => {
    element.remove();
    onLand?.();
  };
}

// The usual [host, update] tuple plus the controls that belong in the header — the status
// chip and the zoom steps. They are part of the run, so the game owns them; only their place
// in the DOM is elsewhere.
// `onExit` is the way back out to the launch screen, which is where a level is chosen: this
// component is handed one to play and never picks its own. The one board it deals for itself is
// the random one behind the 🎲, and that is the same level again rather than a different one.
export function GameMapComponent(
  onExit: () => void,
): [hostElement: HTMLElement, startNewGame: (level: number, random?: boolean) => void, headerControls: HTMLElement, leaveRun: () => void] {
  let map: GameMap;
  let isRunning = false;
  // Which rung of the ladder is being played, and whether it is being played on its own board.
  // Both are settled when the run starts and read again when it ends: the level says which
  // record a score belongs to and which target it is measured against, and the flag says
  // whether it counts at all — a random deal is the same size, not the same level.
  let level = 0;
  let isRandom = false;
  // The board on the screen, as the number it was built from. Kept because 🔁 is "this map
  // again" rather than "this level again": on a random deal (see startNewGame) those are two
  // different boards, and it is the one just played that a second go is worth anything on.
  let seed = 0;
  // Two-tap navigation: tap an object to select it, then — if it is a character that
  // can afford a step — tap one of its highlighted neighbours to move there.
  let selected: Position | undefined;
  let targets: Position[] = [];
  // The far donuts, when the selection is a character standing on one of them. They are part
  // of `targets` and lit exactly like a step, so a jump is the same two taps as a walk — the
  // second tap simply lands across the board. Kept as a list of their own all the same,
  // because that second tap has to know it is paying the portal's price rather than a step's.
  let portalTargets: Position[] = [];
  // Whether the selection is a bathtub. A tub lights the fields it can put a unicorn on in
  // exactly the way a character lights the tiles it can step onto, so the second tap has to
  // know which of the two it is finishing: a step, or a purchase.
  let isTubSelected = false;
  // The build site the selection is sitting on, if it is one. Like the tub, a site blocks
  // movement, so nothing can be standing on it and this can never be true at the same time as
  // isCharacter — the three kinds of selection stay cleanly apart.
  //
  // It is what the panel explains and what the dev bot's ▶ raises; whether it can be *built*
  // is buildTargets below, which is a narrower question.
  let buildSite: Position | undefined;
  // The sites a tap would raise right now. Two selections fill it, and they are the two halves
  // of the same offer: a unicorn lights every site it is standing beside, and a site the player
  // has tapped directly lights *itself* — so a build is always finished by tapping the site,
  // whichever end of it was picked up first. Kept apart from `targets` on purpose: those are
  // tiles something moves onto, and folding the two together would have a unicorn on a
  // springboard drawing its build sites as free steps, and a site's price is the one price left
  // on the board.
  let buildTargets: Position[] = [];
  // What the hint is pointing at, as a tile index: the tile the bot would act on if it were
  // playing this side — see showHint. Set only by 💡 and dropped again by the next thing the
  // player does, so an arrow can never outlive the question it was answering.
  let hintIndex: number | undefined;
  // The tutorial's standing advice: the same answer the bulb gives, kept up on its own for the
  // whole of level 1 rather than asked for a tap at a time — see refreshAdvice. Held between
  // actions rather than worked out per render, because two things about the bot make a
  // per-render answer unusable: ties are broken at random, so an unchanged board can advise
  // two different moves a paint apart, and every call files the plan it settled on (see
  // rememberGoal), so asking twice about one board tells it a move was made twice.
  let advice: ReturnType<typeof getBotAction>;
  // The end-turn button has been pressed once and is asking whether that was meant — see the
  // guard on it. Only ever armed while the player still has something they could do instead:
  // a turn that is genuinely spent ends on one tap, which is every ordinary turn.
  let confirmsEndTurn = false;
  // What disarms it again on its own, so a question nobody answers does not sit on the button
  // for the rest of the run.
  let confirmTimer: number | undefined;
  // The one hint that has no tile to point at: "there is nothing here worth doing". It lights
  // the end-turn button instead, which is where that answer already lives.
  let hintsEndTurn = false;
  // The turn is being paid out: income is in the air and the purse has not been credited
  // yet. The board is locked for as long as it lasts — a step taken mid-flight would change
  // the very income the player is watching arrive.
  let isPaying = false;
  // The opponent is taking its turn. Like isPaying it locks the board, and for a related
  // reason: what the player would be acting on is being changed under them, a step at a time.
  // Kept apart from isPaying rather than folded into it because they end differently — the
  // payout ends in the turn counter moving on, the rival's turn ends in the player's starting.
  let isRivalTurn = false;
  // The timer driving it, so that leaving the board can stop the rival mid-stride. Nothing in
  // the interface can reach the launch screen while the board is locked, so this cannot happen
  // today — but a rival still walking about on a map that has been replaced underneath it is a
  // bad enough failure to be worth one variable.
  let rivalTimer: number | undefined;
  // The tile the rival is acting on, ringed while it acts so the change on the board has a source
  // the eye can find. Held as the element rather than an index because it has to outlive a
  // render: nothing in render() touches this class, so the ring moves with the rival a step at a
  // time instead of being worked out again for every tile on every repaint.
  let rivalMark: HTMLElement | undefined;
  // The score's working is open: the breakdown that ends a run, shown mid-run on demand.
  // It holds the info panel until it is closed or a tile takes the panel over. Only ever true
  // where HAS_GAMEPLAY_NICE_TO_HAVES is — nothing else can open it.
  let showsScore = false;
  // Dev-only (see createFogButton): the fog switched off, for looking at how a board actually
  // came out. Purely a way of drawing — the model's isRevealed is untouched, so the score, the
  // income, the rainbows and what can be picked up all behave exactly as they would with the
  // clouds on. Which is the point: it shows you the board without perturbing the run. The one
  // seam is that a tile the game still counts as fogged reads as "Cloud" in the info panel
  // even while you can see what is on it — the panel is telling the truth, not the board.
  let xray = false;
  // Dev-only (see createBotControls): the one thing outside the bot's own corner that has to
  // know it exists — render() calls this to put its buttons in and out of reach, exactly as
  // it does the end-turn button. Declared without a value so that nothing in the bot is so
  // much as named outside HAS_DEV_TOOLS.
  let updateBotControls: (() => void) | undefined;

  /**
   * Whether the board is out of the player's hands for the moment — the income is in the air,
   * or the opponent is taking its turn. Every guard that used to read isPaying reads this, so
   * a new reason to lock the board is added in one place rather than at each of them.
   */
  const isLocked = () => isPaying || isRivalTurn;

  /**
   * Whether something is advising the clock rather than the board: the bulb's own answer, or
   * the tutorial's standing one, and an action with no tile to act on is what both say it with.
   *
   * Two things read it and they are one rule — the button's loud, pulsing face, and its skipping
   * the confirmation. Whatever is being advised, the player is being told to end the turn, and a
   * button that asks whether that was meant is the game arguing with its own advice.
   */
  const advisesEndTurn = () => hintsEndTurn || (!!advice && !advice.from);

  // Two stacked glyph layers per tile, mirroring the two layers of the model: the ground
  // first, the character standing on it painted over it (later sibling, same grid cell).
  // A character therefore never hides what it stands on — the donut under a unicorn still
  // shows. Glyphs live in spans of their own so one can be transformed on its own — the
  // lollipop tree is drawn tilted and gets stood upright — without turning the tile's
  // background, its selection ring, or the grid cell with it.
  // Rebuilt whenever the board changes size — there is one element per tile, so these are
  // the only part of the interface that cannot outlive a different map.
  let groundGlyphs: HTMLElement[] = [];
  let livingGlyphs: HTMLElement[] = [];
  let tileElements: HTMLElement[] = [];

  // Light beams live in their own layer above the tiles: a tile can carry several at
  // once (the sun's does), which a per-tile pseudo-element could not draw.
  const beamLayer = createElement({ cssClass: styles.beams });
  // one delegated listener instead of one per tile — and it survives the tiles being
  // replaced, which is the reason the listener is on the board rather than on them
  const board = createElement({ cssClass: styles.board, onClick: (event) => onTileClick(tileElements.indexOf(event.target)) }, [beamLayer]);

  function buildBoard() {
    groundGlyphs = createElements({ tag: "span" }, MAP_SIZE * MAP_SIZE);
    // The whole layer is drawn up: everything that can ever stand on a tile is an actor, and
    // an actor is what the player is looking for. Set once here rather than per render,
    // because nothing about it depends on what is on the tile.
    livingGlyphs = createElements({ tag: "span", cssClass: styles.character }, MAP_SIZE * MAP_SIZE);
    tileElements = groundGlyphs.map((ground, index) => {
      // Where the tile is, as a hue for the stylesheet to colour a springboard by — see .small.
      // In degrees, which is the unit the launch screen's own --h is already in, so the name
      // means one thing across the game. Written here and never again: a tile's position is the
      // one thing about it that cannot change without the board being rebuilt.
      const { x, y } = getPosition(index);
      ground.style.setProperty("--h", `${(x + y) * HUE_STEP}deg`);

      return createElement({ cssClass: [styles.tile, CssClass.EMOJI] }, [ground, livingGlyphs[index]]);
    });
    // beam layer first: the tiles are positioned too, so they paint over it and an emoji
    // is never hidden by the light passing through it
    board.replaceChildren(beamLayer, ...tileElements);
    board.style.setProperty("--s", String(MAP_SIZE)); // keeps MAP_SIZE the single source of truth
  }

  // PLACEHOLDER turn bar: turn count on the left, end-turn button on the right.
  // Only the emoji gets the emoji font — digits inside it would render as emoji glyphs too.
  const turnCounter = createElement({ tag: "span", cssClass: CssClass.EMPHASIS });
  const dropCount = createElement({ tag: "span" });
  const candyCount = createElement({ tag: "span" });
  const scoreCount = createElement({ tag: "span" });
  // A counter leads somewhere only when it is handed somewhere to lead — the ⭐ and its working,
  // and nothing else. It wears no mark for it: the affordance was a pointer cursor, which the
  // screens this matters on do not have.
  const counter = (emoji: string, value: HTMLElement, onClick?: () => void) =>
    createElement({ cssClass: styles.count, onClick }, [createElement({ tag: "span", cssClass: CssClass.EMOJI, text: emoji }), value]);
  // One button for both ends of a run: end the turn while playing, back to the launch screen
  // once it is over. Which board to play next is that screen's question, not this bar's —
  // there are seven of them now, and they are the stripes of the rainbow over there.
  const endTurnButton = createButton({ cssClass: styles.endTurn, onClick: endTurnPressed });
  // The board just played, from the top: the same map, the same opening, the same seed. What
  // ends a run is a plan running out of turns, and the second go at a plan is where the first
  // one is worth anything.
  //
  // It lives in the result panel, on a line of its own under the score's working, rather than
  // in the turn bar beside the way out. The bar is a row of things that cannot wrap — the clock,
  // the button, the bulb — and a fourth control in it pushed the way out off the edge of a
  // narrow phone. The panel is the one part of the screen that is already growing to fit what a
  // finished run has to say, so a button that only exists after a run belongs in it.
  const retryButton = createButton({ cssClass: CssClass.SECONDARY, onClick: () => startRun(seed) }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: RETRY_EMOJI }),
    ` ${getTranslation(TranslationKey.RETRY)}`,
  ]);
  // And the way on, beside it: the rung above, dealt straight from the result rather than through
  // the launch screen. Climbing the ladder was three taps — out to the levels, the next stripe,
  // play — and two of them only ever confirmed what finishing a level already said.
  //
  // It borrows CONTINUE rather than asking for a word of its own, and that is a saving rather
  // than a compromise: the translation maps compact into one joined string (see vite.config.ts),
  // so every key's text is in the zip whether anything reads it or not — a new word would have
  // cost three languages' worth of bytes to say what this one already says.
  const nextButton = createButton({ cssClass: CssClass.SECONDARY, onClick: () => startNewGame(level + 1) }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: GAME_EMOJI }),
    ` ${getTranslation(TranslationKey.CONTINUE)}`,
  ]);
  // How far through the turns, next to the button that spends them. It is the one number that
  // stayed down here when the scores went up to the chip: the clock and the thing that moves
  // the clock on belong together, and the turn bar is otherwise the two ways of ending a turn.
  const turnDisplay = counter(TURN_EMOJI, turnCounter);
  // Reached for through counter() rather than built by hand, so every counter in the bar is
  // still made the same way: the emoji span is always the first child of the row.
  const turnEmoji = turnDisplay.firstChild!;
  // The score opens its own working: the same breakdown that closes a run, on demand while
  // it is still being played, so "where are my points coming from" is answerable in time to
  // act on the answer rather than only afterwards.
  //
  // Outside the competition build only. Handing counter() no handler is the whole of the cut:
  // with the only reference to toggleScore folded away, the function goes with it.
  const scoreDisplay = counter(SCORE_EMOJI, scoreCount, HAS_GAMEPLAY_NICE_TO_HAVES ? toggleScore : undefined);
  // What the bar last showed, so a render can tell a number that moved from one that did not.
  // The two incomes by currency, then the score — seeded by render() itself on the first pass
  // of a run (see newRun), so opening a board is not a flurry of pops for numbers that were
  // never anything else.
  let lastIncome: number[] = [];
  let lastScore = 0;
  let newRun = true;
  // Whether the last render found the turn spent — see render(). Held so the prompt fires on
  // the edge into that state and not on every repaint of it, and so showInfo knows which of
  // the two resting lines the panel should fall back to.
  let wasStuck = false;
  // The opponent's score, live beside the player's own. It is the whole reason to have a rival
  // rather than a par to beat: being able to see the gap while there are still turns left to
  // close it. Its face is the dark unicorn rather than a second star, so which number belongs
  // to whom needs no explaining — and the inverted glyph is the same one on the board.
  // Built unconditionally and hidden by render() on boards without an opponent: it costs a
  // handful of bytes and the whole bar is laid out once.
  // Built by a function rather than inline, the same trick createFogButton uses: once
  // HAS_OPPONENT folds to false the whole thing is an uncalled declaration and goes out with
  // the tree-shaking, where a `const` would still run its createElement in every build.
  const rivalScoreCount = createElement({ tag: "span" });
  // The two glyphs that stand for the rival away from the board: this counter's face and the
  // end-turn button's badge below. Both are built once and never rebuilt, so they are the two
  // things that have to be told when the side choice moves — which render() does, because the
  // choice can only be made on the launch screen and so only ever between runs. Collected only
  // where there is a choice; with the flag off nothing fills this and nothing reads it, and it
  // goes out with the rest.
  const rivalGlyphs: HTMLElement[] = [];

  function createRivalScore(): HTMLElement {
    const display = counter(OBJECT_CONFIG[GameObjectType.DARK_UNICORN].emoji, rivalScoreCount);
    const glyph = display.firstChild as HTMLElement;
    glyph.classList.add(styles.dark);
    if (HAS_SIDE_CHOICE) {
      // Marked as a unicorn so the dark theme can turn its mane with the rest of them (see
      // .character there). Only that theme reads it, so only that build has to carry it — and it
      // buys no size out here, the `--g` ramp being written as `.tile > span.character`.
      glyph.classList.add(styles.character);
      rivalGlyphs.push(glyph);
    }

    return display;
  }

  const rivalScoreDisplay = HAS_OPPONENT ? createRivalScore() : rivalScoreCount;

  // What the end-turn button wears while the rival is on the board — see render(). An element
  // rather than text so it can carry the inverted unicorn the rest of the interface already means
  // "the rival" by, and built through a function for the same reason createRivalScore is: with
  // HAS_OPPONENT folded away this is an uncalled declaration and goes out with the tree-shaking.
  function createRivalGlyph(): HTMLElement {
    const glyph = createElement({
      tag: "span",
      cssClass: [CssClass.EMOJI, styles.dark],
      text: OBJECT_CONFIG[GameObjectType.DARK_UNICORN].emoji,
    });
    if (HAS_SIDE_CHOICE) {
      glyph.classList.add(styles.character); // as above: the dark theme's business, and only its
      rivalGlyphs.push(glyph);
    }

    return glyph;
  }

  const rivalTurnGlyph = HAS_OPPONENT ? createRivalGlyph() : undefined;
  // Everything the run counts in one chip in the middle of the header, in view wherever the
  // player is looking. The two currencies read "what you have (+what the board pays you next
  // turn)", so the cost of a plan and the income funding it are side by side; the two scores
  // follow them, so what the race stands at is read in the same glance as what it costs to
  // change it. Nothing here is pressable except the score, which opens its own working.
  //
  // The scores used to sit in the turn bar, because three "n (+n)" counters in a row overflowed
  // the header on a phone. Neither score carries an income, so these two are short — and the
  // chip now takes a line of its own below the title row on a narrow screen (see .status),
  // which is the room that made this possible. What is left in the bar is the things you press.
  // Kept as elements of their own, not just built inline: they are what the income flies to
  // and what pops when it lands, and both need the whole counter — emoji and number — rather
  // than the number alone. Indexed by currency, which is what flyIncome sorts its flights by.
  const currencyDisplays = [counter(DROP_EMOJI, dropCount), counter(CANDY_EMOJI, candyCount)];
  // The "(+n)" half, as an element of its own rather than more text in the number beside it.
  // Two signals were landing on the one counter and the later one won: a step that costs a
  // drop *and* lines up a rainbow would flash the spend's red over the income's green —
  // precisely the move the green is there to teach. Split, they never overlap: the number you
  // have reacts to money moving, the rate beside it reacts to the rate changing.
  // It is the better reading anyway. What you hold and what the board pays you are two
  // different facts, and they now look like two.
  const currencyIncomes = [
    createElement({ tag: "span", cssClass: styles.income }),
    createElement({ tag: "span", cssClass: styles.income }),
  ];
  const currencyValues = [dropCount, candyCount];
  currencyDisplays.forEach((display, currency) => display.append(currencyIncomes[currency]));
  const status = createElement({ cssClass: styles.status }, [
    ...currencyDisplays,
    scoreDisplay,
    ...(HAS_OPPONENT ? [rivalScoreDisplay] : []),
  ]);

  // Object info: a permanent row of its own between map and turn bar, so it can never
  // cover the board and never shifts it either. Empty selection shows a hint instead.
  // Spans, not divs: emoji, name and description flow as one wrapping line of text.
  const infoEmoji = createElement({ tag: "span", cssClass: [styles.infoEmoji, CssClass.EMOJI] });
  const infoName = createElement({ tag: "span", cssClass: [styles.infoName, CssClass.EMPHASIS] });
  const infoText = createElement({ tag: "span" });
  // What the run is *for*, on a line of its own above the description — see showGoal. Only the
  // idle panel has room for it, and CSS hides it while it is empty, so every selection keeps
  // the row at exactly its old height.
  const infoGoal = createElement({ cssClass: styles.infoGoal });
  // The build used to have a button here, and it was the last action in the game that lived
  // off the board. It has not needed one since a site became a tile to tap — the board says
  // what it becomes and what it costs on the site itself, which no button beside a paragraph
  // ever could. The portal lost its button to the same argument when the far donuts became
  // tiles to tap.
  // The score's working, and at the end of a run the result's: one line per scoring category.
  // A panel of its own rather than a block inside the one above, because in the side-panel
  // layout it is always up — the column has the room to say what the run is worth without
  // being asked, and a grid cell can only be given to a child of .host. What that costs is
  // that it is a second panel in the stacked layout too, opening under the info panel rather
  // than inside it. Whether it is *shown* is CSS's business either way; see .scoreBoard.
  // The unicorn's ladder, a row of its own under the line — see renderGrowth. Empty for
  // everything that is not a unicorn, and CSS hides it then, so it takes no room until it has any.
  const growthBar = createElement({ cssClass: styles.growth });
  const scoreBoard = createElement({ cssClass: styles.scoreBoard });
  const infoPanel = createElement({ cssClass: styles.info }, [infoGoal, createElement({}, [infoEmoji, infoName, infoText]), growthBar]);

  // The board takes its size from the map and the zoom step; this row scrolls to reach the
  // parts of it that do not fit. Panning is the browser's own scrolling — which brings touch
  // momentum, trackpad gestures and keyboard scrolling along for nothing.
  const mapArea = createElement({ cssClass: styles.mapArea }, [board]);
  // Free and unlimited, and in the row of things you press rather than up with the things you
  // read. It sits between the clock and the end-turn button on purpose: the two ways out of a
  // turn you cannot see your way through are "be told what to do" and "stop", side by side.
  const hintButton = createButton({ cssClass: CssClass.ICON_BTN, onClick: showHint }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: HINT_ACTION_EMOJI }),
  ]);
  // No ICON_BTN on these two: they live inside the zoom chip (built with the header's controls
  // below), which carries the surface for all three of its icons, so a round face of their own
  // would be a button on a button.
  const zoomOutButton = createButton({ cssClass: styles.zoomStep, onClick: () => zoom(-1) }, ["−"]);
  const zoomInButton = createButton({ cssClass: styles.zoomStep, onClick: () => zoom(1) }, ["+"]);

  /**
   * Dev-only: the switch that takes the clouds off, for checking how a board actually came
   * out. Built by a function rather than inline so that it is nothing but an uncalled
   * declaration once HAS_DEV_TOOLS folds to false — a `const` here would still run its
   * createButton in every build.
   */
  function createFogButton(): HTMLElement {
    const button = createButton(
      {
        cssClass: CssClass.ICON_BTN,
        onClick: () => {
          xray = !xray;
          button.classList.toggle(CssClass.PRIMARY, xray); // lit while the fog is off
          render();
        },
      },
      [createElement({ tag: "span", cssClass: CssClass.EMOJI, text: FOG_EMOJI })],
    );

    return button;
  }

  /**
   * Dev-only: two steps along the ladder, for looking at every level's board one after another
   * without going back out to the launch screen between them. It wraps at both ends, so the
   * seven boards are a ring rather than a line with two dead stops.
   *
   * The fog toggle survives the switch for free, and that is the point of doing it from in here:
   * `xray` belongs to the component and only the *board* is replaced (see startRun), so a walk
   * along the ladder with the clouds off stays a walk with the clouds off.
   *
   * Built by a function for the same reason createFogButton is: an uncalled declaration once
   * HAS_DEV_TOOLS folds to false.
   */
  function createLevelButtons(): HTMLElement[] {
    return [-1, 1].map((step) => {
      const button = createButton(
        {
          cssClass: CssClass.ICON_BTN,
          // `level` is read at the tap rather than captured: it moves with every switch.
          onClick: () => startNewGame((level + step + MAP_SIZES.length) % MAP_SIZES.length),
        },
        [createElement({ tag: "span", cssClass: CssClass.EMOJI, text: step < 0 ? "⏮" : "⏭" })],
      );

      button.title = `level ${step < 0 ? "back" : "on"}`; // the bot's own buttons title themselves the same way

      return button;
    });
  }

  /**
   * Dev-only: the bot's controls — which bot is playing, one action from it, and the rest of
   * the run at once. It is for balancing rather than for playing: a run driven by a bot with
   * a stated policy is a reading of what the board is worth to *that* policy, and four of
   * them side by side on the same seed say more about the numbers than any amount of playing
   * it by hand. For the same four bots over a hundred runs, see `npm run bot`.
   *
   * Everything the bot needs lives in here, the strategy included, so that the whole thing
   * is one uncalled declaration once HAS_DEV_TOOLS folds to false — see createFogButton.
   *
   * Stepping is the interesting one: which action came next and what the bot thought it was
   * worth is the whole reason to watch a bot at all, and both are gone if the run plays
   * itself. Playing it out is for the other question — what the board comes to in the end —
   * and it is the same actions at the same speed, just without a finger on the button. Either
   * way the working goes to the console, which is where a run is read back afterwards.
   */
  function createBotControls(): HTMLElement[] {
    let botStrategy: BotStrategy = BotStrategy.MIXED;
    let autoTimer: number | undefined; // the run playing itself; undefined while it is not

    const face = createElement({ tag: "span", cssClass: CssClass.EMOJI });
    // One button cycling the four rather than four buttons: the dev corner is already three
    // controls wide, and which bot is playing is exactly what its face says.
    const strategyButton = createButton(
      {
        cssClass: CssClass.ICON_BTN,
        onClick: () => setStrategy(BOT_STRATEGIES[(BOT_STRATEGIES.indexOf(botStrategy) + 1) % BOT_STRATEGIES.length]),
      },
      [face],
    );

    function setStrategy(strategy: BotStrategy) {
      botStrategy = strategy;
      face.textContent = BOT_STRATEGY_EMOJIS[strategy];
      strategyButton.title = `bot: ${BOT_STRATEGY_NAMES[strategy]}`;
    }

    /**
     * One action from the bot, carried out through exactly the paths a tap goes through —
     * select, then move / buy / raise / end the turn. So the bot can only ever do what a
     * player could have done, the animations and sounds are the ones a human run produces,
     * and there is no second implementation of the rules to drift out of step with these.
     */
    function stepBot() {
      // Always the player's side: this is the bot standing in for the person at the keyboard,
      // and the opponent — which is the same code on the other side — plays its own turn
      // through playRivalTurn without any of these buttons.
      const action = isRunning && !isLocked() ? getBotAction(map, botStrategy, PLAYER) : undefined;

      if (!action) return;

      console.log(
        `🤖 ${BOT_STRATEGY_NAMES[botStrategy]} · turn ${map.turn}/${TURN_LIMIT} · ${map.drops[PLAYER]}💧 ${map.candy[PLAYER]}🍬 · ` +
          `${getScore(map, PLAYER)}⭐ (${getExploration(map, PLAYER)}% seen) → ${action.label} [${Math.round(action.value)}]`,
      );

      if (action.kind === BotActionKind.END_TURN) return finishTurn();

      select(action.from); // the actions below all read the selection, exactly as the taps do
      if (action.kind === BotActionKind.BUY) buy(action.to!);
      else if (action.kind === BotActionKind.BUILD)
        raise(action.from!); // the site is what a build acts on, and its own target
      // a jump is a move at the portal's price; undefined lets a plain step price itself
      else move(action.to!, action.kind === BotActionKind.PORTAL ? PORTAL_COST : undefined);
    }

    /**
     * The rest of the run, played by itself: the same stepBot on a timer, which is what keeps
     * the two buttons honest — watching a run and reading its final score are the same run.
     *
     * A timer that polls rather than a chain that schedules itself, because the thing it has
     * to wait for is the payout flight, and how long that takes is the board's business
     * rather than the bot's. A tick while the income is in the air simply does nothing and
     * comes round again. It stops itself the moment the run is over, so nothing has to
     * remember to switch it off — leaving the board or starting another one cannot leave a
     * bot running behind it.
     */
    function toggleAutoPlay() {
      if (autoTimer) {
        clearInterval(autoTimer);
        autoTimer = undefined;
      } else {
        autoTimer = setInterval(() => {
          if (isLocked()) return; // the board is paying out or the rival is moving; nothing to decide yet
          if (isRunning) stepBot();
          else toggleAutoPlay(); // the run is over — and this is the one call that stops it
        }, AUTO_STEP_DELAY);
      }

      updateBotControls!();
    }

    setStrategy(botStrategy);
    const stepButton = createButton({ cssClass: CssClass.ICON_BTN, onClick: stepBot }, ["▶"]);
    const playButton = createButton({ cssClass: CssClass.ICON_BTN, onClick: toggleAutoPlay }, ["⏩"]);
    stepButton.title = "one bot action";
    playButton.title = "play the rest of the run";

    // The bot's own bit of render(): the two buttons are out of reach for the same reasons
    // the end-turn button is, and the play button is lit while it is the one driving.
    updateBotControls = () => {
      stepButton.disabled = isLocked() || !isRunning;
      playButton.disabled = !isRunning;
      playButton.classList.toggle(CssClass.PRIMARY, !!autoTimer);
    };

    return [strategyButton, stepButton, playButton];
  }

  // Everything the run puts in the header, as one thing to hand over and one thing to hide
  // between runs. It used to float over the top-right of the map row, which read as free
  // real estate and was not: at the opening zoom step the board fits the row exactly, so
  // there is nothing to scroll, and on a portrait screen the buttons sat on top of the
  // corner tiles with no way to pan out from under them. The header costs the board nothing
  // and cannot overlap it at any size.
  // `display: contents`, so the pieces are laid out by the header's own row rather than
  // nesting a second flex box inside it — the chip still centres itself on the header, and
  // the buttons still take the header's gap. Hiding the wrapper hides all of them, which is
  // what the launch screen wants: none of it means anything before a run.
  // The zoom steps go up here with the counters rather than into the turn bar: they act on the
  // board's *size*, which is a way of looking at it rather than a move in the turn, and the bar
  // below is now nothing but the turn — how far through it, ending it, being told what to do in
  // it. Being part of the run's own controls they are hidden with the rest between runs, which
  // is what the launch screen wants.
  const zoomChip = createElement({ cssClass: styles.zoomChip }, [
    createElement({ tag: "span", cssClass: CssClass.EMOJI, text: ZOOM_EMOJI }),
    zoomOutButton,
    zoomInButton,
  ]);
  const headerControls = createElement({ cssClass: styles.headerControls }, [
    status,
    ...(HAS_DEV_TOOLS ? [createFogButton(), ...createLevelButtons(), ...createBotControls()] : []),
    zoomChip,
  ]);
  // The clock leads, and the button that moves it on takes all the room left over — it is the
  // one thing pressed every turn, so it is the one thing that should be impossible to miss.
  // The bulb closes the row: it answers "I do not know what to do here" and belongs beside the
  // way out of the turn rather than in front of it.
  const turnBar = createElement({ cssClass: styles.turnBar }, [turnDisplay, endTurnButton, hintButton]);
  const hostElement = createElement({ cssClass: styles.host }, [mapArea, infoPanel, scoreBoard, turnBar]);

  let zoomIndex = 0;

  /**
   * Turns the current zoom step into a tile size. Everything else — the board's width, the
   * emoji size, the beams — is derived from --tile in the stylesheet, so this one property
   * is the whole zoom. Measured against the shorter side of the map row so that step 0 fits
   * whichever way the screen is turned, less one pixel per column for the grid lines.
   *
   * `reset` picks the opening step as well: the first one whose tiles are big enough to read
   * and to hit, which on a small map is the overview itself and on a big one is a few steps
   * in. That is what lets one setting suit a 9x9 and a 20x20 board — a fixed starting step
   * would either scroll a small map for no reason or open a large one unreadably small.
   */
  function applyZoom(reset = false) {
    // offsetWidth/Height rather than clientWidth/Height: the row is measured while the board is
    // still laid out with the previous --tile (or none at all, on the first game), and if that
    // stale board overflows the row, a classic scrollbar is standing in it at that moment. The
    // client size is then a scrollbar narrower, the board is fitted to that, and it stays a few
    // pixels smaller than the row for the rest of the game. The offset size is the row itself,
    // scrollbar or not — .mapArea has no padding and no border, so the two differ only by that.
    const fit = Math.max((Math.min(mapArea.offsetWidth, mapArea.offsetHeight) - MAP_SIZE) / MAP_SIZE, MIN_TILE);

    if (reset) {
      const readable = ZOOM_STEPS.findIndex((step) => fit * step >= COMFORT_TILE);
      zoomIndex = readable < 0 ? ZOOM_STEPS.length - 1 : readable;
    }

    board.style.setProperty("--tile", `${fit * ZOOM_STEPS[zoomIndex]}px`);
    zoomOutButton.disabled = !zoomIndex;
    zoomInButton.disabled = zoomIndex === ZOOM_STEPS.length - 1;
  }

  /** Steps the zoom, keeping whatever was in the middle of the view in the middle of it. */
  function zoom(direction: number) {
    const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, zoomIndex + direction));
    if (next === zoomIndex) return;

    // measured before the board resizes under it, or the old centre is already gone
    const { scrollLeft, scrollTop, clientWidth, clientHeight } = mapArea;
    const ratio = ZOOM_STEPS[next] / ZOOM_STEPS[zoomIndex];
    zoomIndex = next;
    applyZoom();
    mapArea.scrollLeft = (scrollLeft + clientWidth / 2) * ratio - clientWidth / 2;
    mapArea.scrollTop = (scrollTop + clientHeight / 2) * ratio - clientHeight / 2;
  }

  // A turned phone changes what "fits" means, and every step is defined against it. Wrapped
  // rather than passed directly: the handler's Event argument would land in `reset`.
  addEventListener("resize", () => applyZoom());

  function render() {
    // Guidance: with nothing left that can be done, the income is the only way on, so ending
    // the turn becomes the next step. Before that, on the opening turn, it is picking a character.
    // Once the run is over the same button is the only thing left to press.
    //
    // One question, asked once, and every signal on the end-turn button hangs off it: the colour,
    // the pulse, and whether a press is asked about (see endTurnPressed). The button has two
    // resting looks and they mean exactly what the guard means — plain is "there are still things
    // you could do, so I will check you meant this", loud is "there is nothing left, go ahead".
    //
    // The colour used to come on earlier, at an empty purse, as a gentler first stage before the
    // pulse. That was worth having when a step was the only thing drops were for; with springboards
    // and sweets in the game, a purse with no drops in it is no longer a board with nothing to do
    // on it, so the early colour was saying something that was not true.
    const needsIncome = !canAct(map, PLAYER);
    const isOver = !isRunning;
    // The turn is spent, said in words as well as on the button. What it does is what a player
    // who has understood the turn would do: drop the selection, because the board has nothing
    // left to offer, and put the reason where the board's explanations already are — see
    // showInfo, which owns the wording and the two endings it has.
    //
    // On the edge rather than on the state, or it would nag once per repaint. Only while the run
    // is on: once it is over the panel belongs to the result, and a turn that ended spent — which
    // is every one of them — would otherwise have this hand the panel back to its hint the moment
    // endGame had finished writing the score into it.
    if (isRunning && needsIncome !== wasStuck) {
      wasStuck = needsIncome; // before select(), which asks showInfo for the resting line
      if (wasStuck) select();
      else showInfo(selected && getIndex(selected)); // the income landed; the line goes back
    }
    const selectedIndex = selected && getIndex(selected);
    // Where the tutorial's standing advice is pointing, as the one tile a tap should land on
    // next: the piece to pick up while it is not the one in hand, and the step to take once it
    // is. A build has no second tile — the site is what acts and what is acted on — so it stays
    // on the site through both halves, which is exactly what the bulb does with it too.
    const adviceFrom = advice?.from && getIndex(advice.from);
    const advisedIndex = selectedIndex === adviceFrom && advice?.to ? getIndex(advice.to) : adviceFrom;
    const targetIndices = targets.map(getIndex);
    // A step off a custard costs nothing, and the purse is the only place that would otherwise
    // say so — after the fact. These get a highlight of their own instead. One question about
    // where the selection is standing rather than one per lit tile, which is what the custard
    // becoming a springboard turned it into: all eight steps out of one are free, or none are.
    // Nothing has to be said about a tub either — nobody stands on one, so it is never on a
    // custard, and its fields keep the plain target ring on their own.
    const freeIndices = selected && !getMoveCost(map, selected, PLAYER) ? targetIndices : [];
    // The far donuts, which are lit like steps and priced like nothing else — see move()
    const portalIndices = portalTargets.map(getIndex);
    // The sites a tap would raise. A handful of tiles at most: there are only ever two or three
    // sites of each kind on the whole board (see SITE_COUNT).
    const buildIndices = buildTargets.map(getIndex);
    // Whether what the player has picked up is a thing that *sells* — a tub or a build site,
    // the two things that quote a price without being anything the player can tap. It is one
    // question rather than two indices because they can never both be it: nothing stands on
    // either, so the selection is one or the other or neither, and the tile loop asks this
    // against isSelectedTile with nothing to look up.
    //
    // This is where the tub's price moved to, and the eight fields it used to be written on
    // went bare. Three reasons, and the first is the one that started it: the fields are lit
    // only when the jar can pay, so the price was invisible in exactly the two states a player
    // needs it — too poor to buy, and hemmed in with nowhere to put a newcomer. The second is
    // that all eight said the same thing, unlike a step (a jump, a free one off a springboard),
    // so eight copies bought nothing. And the third is that a build site had meanwhile settled
    // the question for the board as a whole: a price belongs on the thing that is selling.
    const isSelling = !!buildSite || isTubSelected;
    // What the herd costs to add to, read once: it is the size of the herd, so it climbs with
    // every purchase, which is exactly why it is worth writing on the board rather than leaving
    // it to an info text that would be read once and remembered wrong.
    const unicornPrice = getUnicornPrice(map, PLAYER);
    // Which tiles are actually turning light into a rainbow this turn. Read off the beams the
    // model already worked out, so the halo can never promise a rainbow that is not there —
    // the same guarantee the candy beams give the trees. A beam is stamped with the tile
    // it *leaves from*, and only the light kind is ever lit, so no isCandy check is needed.
    // Gathered once per render rather than searched per tile: it is a handful of entries.
    // Filtered by what the player can see for the same reason the beams themselves are — see
    // showsBeam. Without it a cloud hiding an opponent's unicorn wears that unicorn's halo.
    const shining = new Set(map.beams.filter((beam) => beam.isLit && showsBeam(beam)).map(getIndex));
    map.tiles.forEach((tile, index) => {
      const element = tileElements[index];
      const isSelectedTile = index === selectedIndex;
      // The invitation to buy: the tub itself pulses, and only while the purchase is really
      // on — the jar can pay and there is somewhere to put the unicorn. It is the one
      // affordance nothing else on the board hints at, so it says so where it happens.
      // Short-circuited on the object check: getSpawnTargets must not run for every tile.
      // The player's own tub only: the opponent's sells to the opponent, and pulsing it would
      // be inviting the player to press something that offers them nothing.
      //
      // Not once it has been picked up, for the same reason a lit build site stops pulsing:
      // the pulse means "over here", and a tub with its fields lit and its price written on
      // it has been found. It would also be beating under the price tag, which is the one
      // thing on that tile that has to stay still to be read.
      const canSpawn = !isSelectedTile && tile.object === GameObjectType.BATHTUB && !!getSpawnTargets(map, getPosition(index)).length;
      // A site that can be raised right now pulses for the same reason a tub that can spawn
      // does: it is an affordance nothing else on the board hints at, so it says so where it
      // happens. Short-circuited on getBuild, so canBuild runs only on the handful of sites.
      //
      // Not while it is one of the lit ones, though: a tile already wearing the build ring, its
      // price and the glyph it is turning into has said all of that four times over, and the
      // pulse is the one of the four that means "over here" rather than "this, now". So it
      // keeps pointing at the sites the current selection is *not* offering, and gets out of
      // the way of the one it is.
      const isBuildTarget = buildIndices.includes(index);
      // What is on this tile could be built into, or undefined for the everything else that
      // is not one of the three sites. Read once and passed down: the pulse, the drawn-back
      // glyph, the price and the cross-fade all turn on the same question, and it used to be
      // asked three times over on every tile of every render.
      const siteBuild = getBuild(tile.object);
      const canRaiseHere = !isBuildTarget && !!siteBuild && canBuild(map, getPosition(index), PLAYER);
      // What the tile *shows*, as opposed to what the game has revealed to the player — the
      // two are the same for everyone but a developer who has switched the clouds off. It is
      // the player's own fog throughout: the opponent's is never drawn, and the only thing
      // that gives away where the rival has been is the rival itself, once seen.
      const isFound = isSeen(tile, PLAYER);
      const isVisible = isFound || (HAS_DEV_TOOLS && xray);
      // Either side's tub: the same piece of furniture, drawn at the same size, and — see the
      // glow below — earning for whoever owns it every turn it stands.
      const isTub = isVisible && SIDE_BATHTUB.includes(tile.object!);
      element.classList.toggle(styles.revealed, isVisible);
      // The halo means "this one is producing", not "this one is a light source" — every
      // unicorn is the latter, so it used to say nothing the glyph did not already say. A
      // unicorn with no halo is one whose walk is still ahead of it, and it keeps its full
      // colour and size on purpose: it is the one the player is being asked to move.
      // A tub pays BASE_INCOME every turn it stands, so it is producing whenever it is on the
      // board — the third producer, and the one that used to wear nothing while the unicorns
      // haloed and the trees glowed pink. Sunlight rather than candy pink, because that is
      // what the glow already sorts by: light and water on one side, sweets on the other.
      // Either side's, exactly as a visible rival unicorn haloes: the glow says "this is
      // earning", not "this is yours".
      element.classList.toggle(styles.glowing, shining.has(index) || isTub);
      // The opening turn used to pulse every unicorn on it, to say that a character is a thing
      // you pick up. It is gone: level 1 now rings the one worth picking up for the whole run
      // (see refreshAdvice), and everywhere else a board that opens with every character
      // flashing is the game shouting its first word.
      // Only the pick-up half of the tutorial's advice, and that is the whole point of it: a
      // ring says "this one", and until a piece is in hand what a first-time player is missing
      // is that a piece is a thing you pick up at all. Once it is picked up the lit steps are
      // already saying where a tap goes, and a finger among eight of them would be pointing at
      // the least useful tile on the board.
      const isPointed = index === advisedIndex && !selected;
      element.classList.toggle(CssClass.HINT, canSpawn || canRaiseHere || index === hintIndex || isPointed);
      // The hint's own ring, over whatever the tile is already wearing — a hinted step is a lit
      // target too, and often a free one. See .hinted for why it is the light's amber.
      // The standing advice wears the same ring and not the pulse the bulb's own answer comes
      // with: it is up for a whole level rather than for one question, and a tile pulsing from
      // the first turn to the last is the loudest thing on a board it is only annotating.
      element.classList.toggle(styles.hinted, index === hintIndex || index === advisedIndex);
      element.classList.toggle(styles.selected, isSelectedTile);
      // no steps lit and nothing to raise means the selection is only being looked at — see select()
      element.classList.toggle(styles.neutral, isSelectedTile && !targets.length && !isBuildTarget);
      const isTarget = targetIndices.includes(index);
      element.classList.toggle(styles.target, isTarget);
      element.classList.toggle(styles.free, freeIndices.includes(index));
      // A colour of its own, and it has to be one: a build is not a step, and the tile it is
      // offered on is one the unicorn can never walk onto. Purple against the main pink for
      // the same reason the free step is green against it — a second kind of offer needs a
      // second colour or it reads as the first.
      element.classList.toggle(styles.build, isBuildTarget);
      // Something the player is being quoted a price for: an armed site, the site being looked
      // at, or the tub that is selling. A site the purse cannot reach yet still says what it
      // would cost, and so does a tub whose jar is short or whose fields are all taken —
      // those are the three states the price used to be invisible in, and they are the ones a
      // player most needs it in.
      const isPriced = isBuildTarget || (isSelling && isSelectedTile);
      element.classList.toggle(styles.priced, isPriced);
      // Which of the two kinds of seller this is, and it is the whole difference between them:
      // a site quotes what it becomes and cross-fades into it, a tub quotes the herd and does
      // not — it is furniture that sells rather than a thing turning into another thing.
      const isBecoming = isPriced && !!siteBuild;
      element.classList.toggle(styles.becoming, isBecoming);
      // Only the lit tiles are written on, and only they read it — a stale tag on a tile that
      // has stopped being a target is a property nothing draws. Of the lit tiles only the far
      // donuts have anything to say: a plain step and a tub's fields are all quoted elsewhere or
      // not worth quoting, and an empty string is how a tile that has just stopped quoting a
      // price rubs the last one out.
      if (isTarget) element.style.setProperty("--p", portalIndices.includes(index) ? `"${JUMP_TAG}"` : `""`);
      else if (isPriced) {
        // A tub is quoted exactly as a site is, by borrowing the site's own shape: nothing in
        // water, the herd in sweets, and — truthfully, as it happens — a unicorn in the slot
        // that says what you get, since GameObjectType.UNICORN is 0. One path for both sellers
        // instead of a branch at each of the three places they differ.
        const price = siteBuild ?? [GameObjectType.UNICORN, 0, unicornPrice];
        element.style.setProperty("--p", `"${getPriceTag(price)}"`);
        // Money the player has not got, in the red money leaving the purse is already drawn in.
        // It is the one thing the grey ring cannot say on its own: a tub with nothing lit
        // around it is either too dear or hemmed in, and those want opposite answers from the
        // player — save up, or go and make room. Asked of the price alone rather than of
        // canBuild, because canBuild is also false when no unicorn is beside a site, and
        // "nobody is here to do the work" is not something red should be claiming about the purse.
        //
        // A property rather than a class: this is the one branch that can ever set it and the
        // tag is the only thing that reads it, so a stale value on a tile that has stopped
        // quoting a price is a colour nothing draws. Cleared to "" rather than removed, which
        // is what hands the tag back to the tertiary default in the stylesheet.
        element.style.setProperty("--r", map.drops[PLAYER] < price[1] || map.candy[PLAYER] < price[2] ? SPEND_COLOR : "");
      }

      // What this rainbow is filling, in the corner of its own tile: 💧 while it is on bare
      // ground, 🍬 once a lollipop tree beside it is turning that light into sweets. The either/or
      // is the thing the whole economy turns on, and until now it was only ever said in the colour
      // of a beam and in the header's two "(+n)" — neither of which points at the tile that made
      // the choice. The icon and not the amount: how much is already on the board as one beam
      // line per point, the panel says the figure in words when the tile is tapped, and a number
      // on every rainbow of a built-up 25x25 is thirty things to read.
      //
      // The player's own rainbows only, the same rule the glow on a working tree follows: a dark
      // rainbow's income is the rival's, and badging it would be crediting the player with it.
      //
      // Written into --i, and the class is what gates the drawing — so a tile that has stopped
      // being a rainbow needs nothing rubbed out, exactly as a stale --p on a tile that has
      // stopped being a rainbow is a property nothing reads. See .badged in the stylesheet.
      const isPaying = isVisible && tile.object === GameObjectType.RAINBOW;
      element.classList.toggle(styles.badged, isPaying || isPointed);
      // Indexed straight off the currency getRainbowIncome answers with: LOOT_EMOJIS is the
      // drop and the sweet in that order, which is the whole reason ChestLoot is numbered the
      // way it is (see game-objects.ts).
      if (isPaying) element.style.setProperty("--i", `"${LOOT_EMOJIS[getRainbowIncome(map, getPosition(index))[0]]}"`);
      // The finger the idle panel says "tap anything" with, said about one tile instead. It is
      // the same glyph on purpose: the panel's is the invitation in general and this is the
      // invitation pointed at something, and a second hand shape for the second one would be
      // two symbols for one idea.
      else if (isPointed) element.style.setProperty("--i", `"${HINT_EMOJI}"`);

      // The fog belongs to the ground layer: under it there is nothing else to show.
      const hasLiving = isVisible && tile.living !== undefined;
      const ground = groundGlyphs[index];
      // guarded on isVisible, or the fog cloud hiding a tree would be turned instead
      ground.classList.toggle(styles.tree, isVisible && tile.object === GameObjectType.TREE);
      // a site is drawn back from the things that are actually there — see .site
      ground.classList.toggle(styles.site, isVisible && !!siteBuild);
      // Size as a way of sorting the meadow: a tub is where unicorns come from and is drawn
      // up with them, the custards are underfoot and are drawn down. Guarded on isVisible for
      // the same reason .tree is — an unrevealed tile is a cloud, not the thing under it.
      // Either side's tub, since both are the same piece of furniture at the same size.
      ground.classList.toggle(styles.big, isTub);
      // The two things drawn down: the springboards underfoot and the boulders in the way. One
      // class for both, hue and all — on a grey 🗿 the tint is barely there, and a class costs
      // more than the difference does.
      ground.classList.toggle(styles.small, isVisible && (tile.object === GameObjectType.CUSTARD || tile.object === GameObjectType.ROCK));
      // A present says what it holds, in the colour it is wrapped in. Only once it has been found:
      // under a cloud the glyph is the cloud, and tinting that would say there is something here.
      // `loot` is set and cleared with the present itself (see openChest), so this needs no second
      // question about what the tile is.
      const hasLoot = isVisible && tile.loot !== undefined;
      ground.classList.toggle(styles.loot, hasLoot);
      if (hasLoot) ground.style.setProperty("--l", `${LOOT_HUES[tile.loot!]}deg`);
      ground.classList.toggle(styles.covered, hasLiving); // out of the way, into the corner
      // The opponent's things are drawn as the negative of the player's — see .dark. Both
      // layers can carry one: a dark rainbow on the ground, a dark unicorn standing on it.
      // Behind the flag rather than behind isDark alone: with no opponent every tile would
      // still be paying for two classList.toggle calls that can never do anything.
      if (HAS_OPPONENT) {
        ground.classList.toggle(styles.dark, isVisible && isDark(tile.object));
        livingGlyphs[index].classList.toggle(styles.dark, hasLiving && isDark(tile.living));
      }

      // What a tile is *offering*, as opposed to what is on it, drawn in the living layer. Both
      // kinds of offer get it free: a site blocks movement, and a tub's field is bare ground by
      // definition, so on neither can anything ever be standing where this goes.
      //
      // A site cross-fades into the building it becomes (see .becoming). A field shows the
      // newcomer it would put there, kept see-through (see .ghost) so it reads as a thing that
      // is not there yet rather than a herd that has already arrived — the price on the tub
      // says what it costs, and this says what it buys, which until now was only ever said in
      // the info text.
      const previewEmoji = isBecoming
        ? OBJECT_CONFIG[siteBuild![0]].emoji
        : isTubSelected && isTarget
          ? OBJECT_CONFIG[GameObjectType.UNICORN].emoji
          : "";
      ground.textContent = isVisible ? (tile.object === undefined ? "" : OBJECT_CONFIG[tile.object].emoji) : FOG_EMOJI;
      livingGlyphs[index].textContent = hasLiving ? OBJECT_CONFIG[tile.living!].emoji : previewEmoji;
      // Only the ghost is drawn see-through; a site's promise is cross-fading instead, and a
      // real unicorn is neither. No hasLiving guard is needed to tell it from one: a
      // spawn field comes from getMoveTargets, so nothing is ever standing on it.
      livingGlyphs[index].classList.toggle(styles.ghost, !isBecoming && !!previewEmoji);
      // How grown it is, handed to the stylesheet to draw it at: a unicorn that has been
      // shining stands taller than the newcomer beside it, which is the level said in the one
      // place the player is already looking. Only worth writing when somebody is home — an
      // empty layer draws nothing whatever size it is set to.
      if (hasLiving) livingGlyphs[index].style.setProperty("--l", `${getUnicornLevel(tile)}`);
    });

    // Each currency reads "what you have (+what next turn pays)". The income half updates as
    // the player moves, so the cost of rearranging the board and its effect on next turn's
    // takings are visible in the same glance.
    turnCounter.textContent = `${Math.min(map.turn, TURN_LIMIT)}/${TURN_LIMIT}`;
    // The closing turn, said twice over: the sand runs out and the whole counter goes
    // warning-coloured. A warning while the turn is being planned, which is when it can
    // still change what the player spends on.
    const isLastTurn = map.turn >= TURN_LIMIT;
    turnEmoji.textContent = isLastTurn ? LAST_TURN_EMOJI : TURN_EMOJI;
    turnDisplay.classList.toggle(styles.lastTurn, isLastTurn);
    dropCount.textContent = `${map.drops[PLAYER]}`;
    candyCount.textContent = `${map.candy[PLAYER]}`;
    // What the board will pay next turn, reacting when it moves. It is the one number in the
    // game that used to change in silence, and it is the change the whole game turns on: a
    // unicorn steps into 🦄⛲🌈 and the income goes up, steps out and it goes down. Everything
    // else here already announces itself with this pop, so the lesson is taught in a language
    // the player has been reading since their first step.
    //
    // Both directions, and green or red says which: the rival taking a fountain off you costs
    // you income exactly as walking away from one does, and neither should pass unremarked.
    const income = [map.dropIncome[PLAYER], map.candyIncome[PLAYER]];
    income.forEach((value, currency) => {
      // A no-break space: the halves are inline-blocks now (so each can pop on its own), and an
      // ordinary space at the start of one is trimmed away — the same reason the launch screen
      // pads its labels with them.
      currencyIncomes[currency].textContent = `\u00a0(+${value})`;
      if (!newRun && value !== lastIncome[currency])
        pop(currencyIncomes[currency], value > lastIncome[currency] ? GAIN_COLOR : SPEND_COLOR);
    });
    lastIncome = income;
    // A board with no trees has no way to make a sweet and nothing to spend one on, so the
    // jar stays out of the header rather than sitting at zero teaching a currency that is not
    // in the game yet. Trees are what make candy, so their count is the honest condition.
    currencyDisplays[1].classList.toggle(CssClass.HIDDEN, !TREE_COUNT);
    const score = getScore(map, PLAYER);
    scoreCount.textContent = `${score}`; // a snapshot, so it has no "+" to show
    // And the star reacts too, for the same reason the income does: it moves on a step into
    // the clouds, on a rainbow lit and on a unicorn found, and those three are the whole of
    // what the run is for. A snapshot can fall as well as climb — a rainbow that goes out
    // takes its points with it — so this says which way it went in the same two colours.
    if (!newRun && score !== lastScore) pop(scoreDisplay, score > lastScore ? GAIN_COLOR : SPEND_COLOR);
    lastScore = score;
    newRun = false; // from here on the bar has a past to compare against
    // The rival's, live beside it — and out of the bar entirely on a board without one, the
    // same way the candy counter stays out of a board with no trees on it.
    if (HAS_OPPONENT) {
      rivalScoreDisplay.classList.toggle(CssClass.HIDDEN, !HAS_RIVAL);
      if (HAS_RIVAL) rivalScoreCount.textContent = `${getScore(map, RIVAL)}`;
    }
    // Both of the rival's stand-ins wear the negative only while the *rival* is the dark one.
    // Set here rather than where they are built because they are built once and the choice can
    // move between runs; a run cannot start without a render, so this cannot be missed.
    if (HAS_SIDE_CHOICE) rivalGlyphs.forEach((glyph) => glyph.classList.toggle(styles.dark, darkSide === RIVAL));
    // While the run is on, the working is the player's to open and close. Once it is over
    // the panel belongs to the result and endGame has already filled it — hence the guard.
    if (isRunning) renderScoreBoard(showsScore);
    renderBeams();

    // While the rival is walking, the button stops being an action and becomes the answer to "why
    // will nothing respond": whose turn it is, in the glyph that means the rival everywhere else.
    // It is disabled either way (see isLocked), so this changes what it says, not what it does —
    // and it says it where the player last pressed, which is where they are looking.
    if (HAS_OPPONENT && isRivalTurn) endTurnButton.replaceChildren(rivalTurnGlyph!);
    // The question mark is the whole of the armed label: the sentence is already written and
    // already translated three times over, and "End turn?" is the same sentence asking.
    else
      endTurnButton.textContent = getTranslation(isOver ? TranslationKey.LEVELS : TranslationKey.END_TURN) + (confirmsEndTurn ? "?" : "");
    endTurnButton.disabled = isLocked(); // no second turn until this one is paid out and the rival has moved
    // Ending a turn is one step among many; starting the next run is the whole screen.
    // Armed, it borrows the spent turn's whole look: a button that has quietly changed what the
    // next tap does must not look like the button that was there a moment ago. The two can never
    // be confused, for all that they wear the same colour — the guard only ever arms while there
    // is something else the player could be doing, which is precisely when this is otherwise
    // plain, and the armed one is the one with the question mark on it.
    // The fill is most of it: the four states that ask for this button say so in colour, which
    // is what three of them were already doing, and the bulb's own answer ("just end the turn")
    // joins them there.
    endTurnButton.classList.toggle(CssClass.PRIMARY, (needsIncome || confirmsEndTurn || advisesEndTurn()) && !isOver);
    endTurnButton.classList.toggle(CssClass.PRIMARY_HIGHLIGHT, isOver);
    // And the nudge on top, for the two states where the clock is the answer. A spent turn the
    // player has gone back to reading the board in — but not while the selection is empty,
    // because that is the moment the turn went spent: the panel is saying so in words right then
    // (see showGoal), and a button that starts moving in the same instant is two things asking
    // at once. Tapping anything is the signal that the words have been read and the board is
    // being looked over; from there the way out of the turn is the thing that has not been done
    // yet. And a turn something is advising the end of, which has no such moment to wait for —
    // it is an answer to a question, asked by the bulb or standing on the tutorial board, and
    // nothing else on the screen is saying it. The board never pulses at the same time: advice
    // about the clock is advice with no tile to point at (see advisesEndTurn).
    //
    // The game's own pulse, whatever its width: 12% of a button this wide does reach into the
    // gap beside it, and that is accepted rather than worked around — by the time it runs, the
    // taps it is answering are aimless ones, and a button that swells into the room next to it
    // is exactly the wrong thing to be subtle about.
    endTurnButton.classList.toggle(CssClass.HINT, ((needsIncome && !!selected) || advisesEndTurn()) && !isOver);
    // The hint asks the bot, and the bot answers about a board that is standing still: nothing
    // to advise while the income is flying, the rival is walking or the run is over.
    hintButton.disabled = isLocked() || !isRunning;
    // The bot acts under the same conditions the player does.
    if (HAS_DEV_TOOLS) updateBotControls!();
  }

  /**
   * Whether the player may be shown a beam at all: only if they can see the tile it leaves
   * from. It used to be free — a beam was only ever cast by a glower the player had found —
   * and became a rule of its own once the opponent's light started being cast off the
   * opponent's fog. Two things read it, and both are ways of drawing the same fact: the line
   * itself, and the halo on the tile casting it. Miss either and a cloud with an opponent's
   * unicorn under it lights up, which is precisely what the fog is for.
   *
   * A `Beam` is a `Position` of its own origin, so a beam can be handed to this directly.
   */
  function showsBeam({ x, y }: Position): boolean {
    return isSeen(map.tiles[getIndex({ x, y })], PLAYER) || (HAS_DEV_TOOLS && xray);
  }

  /**
   * One element per beam, laid out in percentages of the board so it follows MAP_SIZE and
   * the responsive board width on its own. A lit beam runs the full two tiles to its
   * rainbow; an unlit one stops halfway, inside the fountain that swallowed the light.
   */
  function renderBeams() {
    beamLayer.replaceChildren(
      ...map.beams.filter(showsBeam).flatMap(({ x, y, dx, dy, isLit, isCandy, side, lines = 1 }) => {
        const tileSize = 100 / MAP_SIZE; // one tile as a percentage of the board
        const length = Math.hypot(dx, dy); // diagonals are longer by exactly the hypotenuse of a 1x1 tile

        // One line per point the rainbow pays, side by side across the gap — so what a grown
        // unicorn's light is worth can be counted off the board rather than guessed at.
        // Spread along the perpendicular (-dy, dx), which needs dividing by the length to be a
        // direction rather than a diagonal that spreads further than a straight one.
        return Array.from({ length: lines }, (_, i) => {
          const element = createElement({
            cssClass: [
              styles.beam,
              // Two questions, asked separately because they are separate: what this light is
              // for — the source it bent through, which is the whole of the colour — and whether
              // it got there. So light dying in a lollipop is a pink stub and light dying in a
              // fountain a blue one, which says what the tile *would* have paid. Standing one
              // tile off the line-up is the mistake the board most needs to be able to show.
              isCandy ? styles.candy : styles.water,
              isLit ? "" : styles.unlit,
              // Pinned to the rival rather than to whichever side is drawn dark, and that is
              // deliberate: the muted triplet is what says "not mine", and the player's own
              // light should stay the vivid one whichever unicorn they took. See dark-side.ts.
              HAS_OPPONENT && side === RIVAL ? styles.dark : "",
            ],
          });
          const spread = ((i - (lines - 1) / 2) * BEAM_GAP * tileSize) / length;

          element.style.left = `${(x + 0.5) * tileSize - spread * dy}%`;
          element.style.top = `${(y + 0.5) * tileSize + spread * dx}%`;
          element.style.width = `${(isLit ? 2 : 1) * length * tileSize}%`;
          element.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;

          return element;
        });
      }),
    );
  }

  /** The info panel is one line: an emoji plus a "Name|Description" text. */
  function setInfo(key: TranslationKey, emoji: string) {
    const [name, description] = getTranslation(key).split("|");
    if (HAS_OPPONENT) infoEmoji.classList.remove(styles.dark); // the caller puts it back if what it names is the rival's
    if (HAS_SIDE_CHOICE) infoEmoji.classList.remove(styles.character);
    infoEmoji.textContent = emoji;
    infoName.textContent = name; // empty for the hint, which has no name
    infoText.textContent = description;
    // The goal is the one description that speaks in the loud voice, and it says it in both the
    // places it turns up: here, heading the score's working, and above the tap hint (see showGoal).
    infoText.classList.toggle(CssClass.EMPHASIS, key === TranslationKey.INFO_GOAL);
    growthBar.replaceChildren(); // only a unicorn has a ladder; showInfo draws it after this
    infoGoal.replaceChildren(); // only the idle panel states the goal; showInfo draws it after this
  }

  /**
   * The line above the description, in the loud voice: the run's own point while the board is
   * idle, and the prompt to end a spent turn whatever is being read. Both are things that are
   * true of the run rather than of the tile, which is what earns them the slot — and setInfo
   * clears it on its way past, so this is always the last word in showInfo.
   * The emoji is a span of its own — the words beside it must not be rendered in the emoji font.
   * Both halves, drawn the way the panel below draws them: the name in the panel's own big ink
   * and the description after it. INFO_GOAL is all description (hence its leading "|") and its
   * name span falls away empty, which is what .infoName:empty is for.
   *
   * The loud voice goes on the name, and only falls through to the description when there is no
   * name to put it on: what a line of this slot is *about* is the half that has to carry, and
   * for the goal that half is the sentence itself.
   */
  function showGoal(key: TranslationKey, emoji: string) {
    const [name, description] = getTranslation(key).split("|");
    infoGoal.replaceChildren(
      createElement({ tag: "span", cssClass: CssClass.EMOJI, text: emoji }),
      createElement({ tag: "span", cssClass: [styles.infoName, CssClass.EMPHASIS], text: name }),
      createElement({ tag: "span", cssClass: name ? "" : CssClass.EMPHASIS, text: ` ${description}` }),
    );
  }

  /**
   * How grown a unicorn is, as the whole ladder under its description: "Rank: 1 • • 2 • • 3",
   * the rank numbers with a mark for each shining turn between, lit as far as the counter has
   * come and dim past it, the rank it holds right now in bold — so the player sees at once what
   * rank it is, how far it is to the next, and how much further the ladder goes. The 1 is the
   * rank every unicorn starts at, and always lit. The number is the same one the light is drawn
   * in, one line per rank. "Rank" to the player, level in the code (getUnicornLevel): the word
   * "level" is the boards' on screen. Either side's — the rival's own progress is a thing worth
   * being able to look up.
   *
   * One span per rung rather than one per state, so the current rank can be picked out of the
   * lit half; the stylesheet spaces them (see .growth).
   */
  function renderGrowth(tile: Tile) {
    const growth = getGrowth(tile);
    const current = growth - (growth % GROWTH_PER_LEVEL); // the rung the rank it holds is written on

    growthBar.replaceChildren(
      createElement({ tag: "span", text: `${getTranslation(TranslationKey.RANK)}:` }),
      ...Array.from({ length: MAX_GROWTH + 1 }, (_, i) =>
        createElement({
          tag: "span",
          cssClass: [i > growth ? styles.pending : "", i === current ? styles.current : ""],
          text: i % GROWTH_PER_LEVEL ? GROWTH_MARK : `${1 + i / GROWTH_PER_LEVEL}`,
        }),
      ),
    );
  }

  /** Whatever the player tapped explains itself — an object, bare ground, or the fog. */
  function showInfo(index?: number) {
    // The open score view holds the line: INFO_GOAL is already the text that belongs over a
    // breakdown — what scores, and that it has to be built up before the turns run out.
    if (HAS_GAMEPLAY_NICE_TO_HAVES && showsScore) return setInfo(TranslationKey.INFO_GOAL, SCORE_EMOJI);

    const objectType = index === undefined ? undefined : getObject(index);

    // The ground wins over whoever is standing on it, for the donut alone: a unicorn on a
    // donut is a unicorn that can jump, and where it can jump to is the thing worth reading.
    // It is also where the price of a jump is stated, which is why it is not conditional on
    // the jump being affordable — a purse too empty for it is exactly when that has to be legible.
    if (index !== undefined && isSeen(map.tiles[index], PLAYER) && map.tiles[index].object === GameObjectType.DONUT)
      setInfo(TranslationKey.INFO_DONUT, OBJECT_CONFIG[GameObjectType.DONUT].emoji);
    else if (objectType !== undefined) {
      // A present the player has found is named by what is in it rather than by its wrapping —
      // the same fact the colour on the board is already carrying, said once in words' place.
      setInfo(
        OBJECT_CONFIG[objectType].info,
        objectType === GameObjectType.CHEST ? LOOT_EMOJIS[map.tiles[index!].loot!] : OBJECT_CONFIG[objectType].emoji,
      );
      // The panel names the opponent's things with the opponent's own glyph, so what is being
      // explained is the thing that was tapped rather than the player's version of it.
      if (HAS_OPPONENT) infoEmoji.classList.toggle(styles.dark, isDark(objectType));
      // Marked as a unicorn so that on the dark theme the glyph explaining one is drawn the way
      // the board draws it, mane and all. Either side's — both are unicorns.
      if (HAS_SIDE_CHOICE && SIDE_UNICORN.includes(objectType)) infoEmoji.classList.add(styles.character);
      // The tub's second job is selling unicorns, and it is paid for in candy — which the
      // tutorial board has no lollipops to make. There it is not on offer, so it is not described
      // either: the tub is introduced as the thing that pays for the walking, and nothing else.
      // The rival's tub sells to the rival, so the offer is not described on it at all.
      if (objectType === GameObjectType.BATHTUB && TREE_COUNT)
        infoText.textContent += ` ${getTranslation(TranslationKey.INFO_BATHTUB_SELL)}`;
      // And a rainbow says what it is paying *this* turn, which is the whole of what its own
      // description leaves out: INFO_RAINBOW says what every rainbow does and the rule about
      // which currency is said at the source, two tiles away, so this line is where a tapped
      // rainbow answers "how much, in what" with a number instead of a rule to apply. Through
      // getRainbowIncome, so the figure here, the badge in the tile's corner, the lines in the
      // beam and the header's "(+n)" are one answer said four ways.
      //
      // Appended rather than swapped in, the way the tub's second job is: the two together stay
      // inside $info-height, INFO_UNICORN_SHINE being the line that reserves it.
      //
      // The player's own, for the reason the badge is: INFO_DARK_RAINBOW describes the rival's,
      // and a figure under it would be the player reading somebody else's books.
      if (objectType === GameObjectType.RAINBOW) {
        const [currency, amount] = getRainbowIncome(map, getPosition(index!));
        infoText.textContent += ` ${getTranslation(TranslationKey.INCOME)} ${amount} ${LOOT_EMOJIS[currency]}`;
      }
      // Whether the player has found something to shine through yet — a fountain or a lollipop,
      // which are one kind of thing to this question — since that is the one thing a rank is
      // about, so the ladder and the shine line below both wait for it. Either side's unicorn
      // gets the ladder once it is on: the rival's rank is worth looking up as soon as ranks
      // mean anything.
      const hasFoundSource = map.tiles.some(
        (t) => (t.object === GameObjectType.FOUNTAIN || t.object === GameObjectType.TREE) && isSeen(t, PLAYER),
      );
      if (hasFoundSource && SIDE_UNICORN.includes(objectType)) renderGrowth(map.tiles[index!]);
      // The unicorn's own description is the one that changes with the run. INFO_UNICORN is what
      // it is for and how to walk it, which is all the opening position can act on: every board
      // starts as a 3x3 of bare meadow with clouds past it, and the light the line-up rule is
      // about is under one of them. Once the player has found a source, the rule becomes
      // readable and takes the line over.
      //
      // A swap and not an append, unlike the tub's second job: the two halves together outrun
      // $info-height, the room the panel reserves for its longest description — which is the
      // shine line itself. Either half alone fits, so the reserved height still holds.
      //
      // The player's own unicorn only. SIDE_UNICORN above is deliberately both sides, but the
      // rival's is described by INFO_RIVAL, and overwriting that would explain the player's
      // piece on the opponent's tile. The sparkles can never turn up on a unicorn of the
      // player's without this line: a beam needs the source one step away (see
      // updateRainbows), and a unicorn always reveals its own 3x3.
      if (objectType === SIDE_UNICORN[PLAYER] && hasFoundSource) infoText.textContent = getTranslation(TranslationKey.INFO_UNICORN_SHINE);
    } else if (index === undefined) {
      // The idle panel has nothing to explain, which makes it the one place the run's own point
      // fits — above the invitation to tap rather than instead of it, so the arithmetic heads the
      // panel and the thing to do next stays the line closest to the board. Not while the turn is
      // spent: the slot is carrying the prompt below, and a rule above a prompt reads as
      // something to do first.
      setInfo(TranslationKey.INFO_HINT, HINT_EMOJI);
      if (!wasStuck) showGoal(TranslationKey.INFO_GOAL, SCORE_EMOJI);
    } else if (isSeen(map.tiles[index], PLAYER)) setInfo(TranslationKey.INFO_EMPTY, EMPTY_EMOJI);
    else setInfo(TranslationKey.INFO_FOG, FOG_EMOJI);

    // A spent turn is a fact about the run, so it outlives the selection: it heads the panel
    // whatever is being read, rather than being the panel until the next tap takes it away.
    // Which is what makes looking things up in this state worth allowing — the board can be
    // read from end to end with the way out of the turn still on the screen, and nothing on it
    // can be spent anyway (needsIncome is exactly "no legal action exists").
    // It has two endings of its own: every turn but the last is followed by an income, and the
    // last is followed by nothing at all, so it says the run is over instead of promising money
    // that is not coming. Both wear the glyph the turn counter is wearing at the time, which is
    // where the same distinction is already drawn — and which is also the glyph now pulsing.
    if (wasStuck) {
      const isLast = map.turn >= TURN_LIMIT;
      showGoal(isLast ? TranslationKey.INFO_STUCK_LAST : TranslationKey.INFO_STUCK, isLast ? LAST_TURN_EMOJI : TURN_EMOJI);
    }
  }

  /** Whether the rival is the side being drawn dark, which it is unless the player took it. */
  const isRivalDark = () => !HAS_SIDE_CHOICE || darkSide === RIVAL;

  /**
   * Whether a thing on the board is drawn as the dark side's — the one question the drawing
   * asks, and it is about presentation rather than ownership. Which side wears the negative is
   * the player's choice (see darkSide), and the model knows nothing about it either way.
   *
   * Only the unicorn and the tub follow that choice; everything else — the rainbow included —
   * falls through to the constant comparison, which is also what keeps the neutral half of the
   * board out of it. See followsSideChoice for why the rainbow is the odd one out.
   *
   * With HAS_SIDE_CHOICE folded to false the whole ternary folds with it, back to exactly the
   * expression this was before there was anything to choose.
   */
  function isDark(objectType: GameObjectType | undefined): boolean {
    return (
      HAS_OPPONENT &&
      objectType !== undefined &&
      (HAS_SIDE_CHOICE && followsSideChoice(objectType) ? getSide(objectType) === darkSide : objectType >= GameObjectType.DARK_UNICORN)
    );
  }

  /**
   * Opens the score's working, or closes it again and hands the panel back to the selection.
   * Behind HAS_GAMEPLAY_NICE_TO_HAVES — the competition build has no way in here at all, since
   * the ⭐ is the only caller.
   *
   * The stacked layout is the one this is for. Beside the board the working is always up (the
   * sidePanels block gives .scoreBoard its own row and `display: grid` outright, so `shown` is
   * not what decides it there) and a tap can only swap the line above it for the goal line and
   * back. That used to be switched off with `pointer-events: none` on a class the ⭐ wore; the
   * class is gone, and so is the switch, because a tap that toggles a line nobody asked about
   * is not worth a rule to prevent.
   */
  function toggleScore() {
    if (!isRunning || isLocked()) return; // the end-of-run panel is already showing the working
    showsScore = !showsScore;
    showInfo(selected && getIndex(selected));
    render();
  }

  /**
   * The score's working: what a rainbow and a unicorn are worth right now, one row per
   * category, and the total they come to. Rebuilt on every render while it is open, so it
   * stays live as the board changes — and it is the same panel at the end of the run, where
   * it is the final reckoning rather than a running one. The emoji is a span of its own —
   * the digits beside it must not be rendered in the emoji font.
   */
  function renderScoreBoard(show: boolean) {
    // Built whether or not anybody is looking: the side-panel layout shows this panel the whole
    // time and decides that in a media query, which cannot reach in and fill it. So `show` is
    // down to one job — the stacked layout's ⭐ toggle — and it is said in a class.
    scoreBoard.classList.toggle(styles.shown, show);
    // `unicorn` marks the one row whose glyph is a creature rather than a symbol — the rival's
    // total — so it is drawn as the board draws it, whichever side is the dark one.
    //
    // Two whole alternatives rather than one expression with the flag inside it — the trick the
    // translation maps use, and for the same reason: the competition build folds to the second
    // and comes out byte for byte the expression this always was. Here the repetition earns more
    // than tidiness. **Two nested conditionals inside this one argument measured 550 packed
    // bytes** (2026-09-10), by putting terser off some inlining it does across renderScoreBoard's
    // six calls. Not a thing to reason about, only to measure — so if this is ever rewritten as
    // one clever expression, measure it again.
    const line = (emoji: string, text: string, unicorn = false, emphasis = false) =>
      createElement({ cssClass: emphasis ? CssClass.EMPHASIS : "" }, [
        createElement({
          tag: "span",
          cssClass: HAS_SIDE_CHOICE
            ? [CssClass.EMOJI, unicorn ? styles.character : "", unicorn && isRivalDark() ? styles.dark : ""]
            : [CssClass.EMOJI, unicorn ? styles.dark : ""],
          text: emoji,
        }),
        text,
      ]);
    // The share of the board that is out from under the clouds, which is also — exactly, not
    // as an approximation — what one rainbow and one unicorn are each worth. It heads the
    // list rather than closing it, because the rows below multiply by it: the panel now reads
    // "here is the rate, here is what each of yours earns at it, here is the sum". Nothing is
    // taken off anything, so every point in the total plainly belongs to something built.
    const rate = getExploration(map, PLAYER);
    // What the run was worth as a level: its score as a share of the level's target, which is
    // the same figure the stripe on the launch screen fills to. Only once the run is over,
    // because it is a result and not a rate — the rows above are what the board is worth this
    // instant, and this is what the instant it ends means. And nothing at all on a random
    // board: its size is a level's, but its map is nobody's, and a score on it has no target to
    // be a share of (see setBestScore).
    // The target in brackets after the share of it, because the share alone is a number with
    // nothing behind it: "87%" says how the run went, "87% (6897)" also says what finishing the
    // job would take — and the score two rows above is in the same units as the figure in the
    // brackets, so the two can be read against each other.
    const targetLine =
      isRunning || isRandom ? [] : [line(TARGET_EMOJI, ` ${getPercent(level, getScore(map, PLAYER))}% (${LEVEL_TARGETS[level]})`)];
    // The two ways on, last and under everything the result has to say: the same board again,
    // and the next one. Only once there is a result — mid-run this panel is the score's working,
    // and there is nowhere to go from a run still being played. The top of the ladder has no
    // rung above it, so up there it is the one button it always was.
    const retryLine = isRunning
      ? []
      : [createElement({ cssClass: styles.endButtons }, level + 1 < MAP_SIZES.length ? [retryButton, nextButton] : [retryButton])];
    // The rival's total gets a row of its own under the player's, and only its total: it is
    // playing off its own clouds, so its working is arithmetic over a board the player has
    // never seen and would explain nothing. What the row is for is the gap.
    const rivalLine =
      HAS_OPPONENT && HAS_RIVAL ? [line(OBJECT_CONFIG[GameObjectType.DARK_UNICORN].emoji, ` ${getScore(map, RIVAL)}`, true)] : [];

    scoreBoard.replaceChildren(
      line(EXPLORE_EMOJI, ` ${rate}%`),
      ...getScoreParts(map, PLAYER).map((count, index) => line(SCORE_EMOJIS[index], ` ${count} × ${rate} = ${count * rate}`)),
      // The total the rows above add up to, in the loud voice: the one number in the working
      // that is the score itself rather than a step towards it.
      line(SCORE_EMOJI, ` ${getScore(map, PLAYER)}`, false, true),
      ...rivalLine,
      ...targetLine,
      ...retryLine,
    );
  }

  /** What is visible on a tile — the living layer wins, the ground object stays underneath. */
  function getObject(index: number): GameObjectType | undefined {
    const tile = map.tiles[index];
    return isSeen(tile, PLAYER) ? (tile.living ?? tile.object) : undefined;
  }

  /** Selection is "what the player is looking at" — the info panel follows it exactly. */
  function select(position?: Position) {
    selected = position;
    const index = position && getIndex(position);
    // A character still under the fog is not a character yet: its tile stays plain fog to
    // the player, so tapping it can never pick it up, light up its steps, or offer it the
    // portal — any of which would give away that something is hiding there.
    const tile = index === undefined ? undefined : map.tiles[index];
    // The player's *own* unicorn. The rival's can be picked up and read about — every tile can —
    // but it lights no steps and takes no orders: it is a thing on the board, not a piece.
    const isCharacter = isSeen(tile, PLAYER) && tile!.living === SIDE_UNICORN[PLAYER];
    // A bathtub is the one piece of scenery that leads somewhere: it offers the fields it
    // can put a new unicorn on. Nothing can stand on a tub — it blocks movement — so this
    // and isCharacter are never both true, and the two kinds of target never mix.
    // The player's own again: the rival's tub is scenery to them, priced against a jar that
    // is not theirs, and getSpawnTargets would answer for the rival if it were asked.
    isTubSelected = isSeen(tile, PLAYER) && tile!.object === GameObjectType.BATHTUB;
    // Steps only light up for a character that can afford them, and one price covers all eight:
    // what a step costs is decided by the tile being left, so a unicorn on a custard walks
    // anywhere for nothing — including with an empty purse, which is exactly when it matters
    // most — and one anywhere else pays the same drop whichever way it goes. Scenery, a
    // blocked-in character and one that cannot afford to move at all end up with no targets,
    // which is what render() draws as the neutral selection. A tub with too little candy
    // lands there too — the fields light up only once the trade can actually be made.
    // Only a character can take the portal, and only from the donut it is standing on. The
    // far ends are filtered exactly as the steps are — an unaffordable jump, or one onto a
    // donut somebody is already standing on, is not lit, because it cannot be taken.
    portalTargets = isCharacter ? getPortalTargets(map, position!, PLAYER).filter((target) => canUsePortal(map, target, PLAYER)) : [];
    targets = isCharacter
      ? [...(getMoveCost(map, position!, PLAYER) <= map.drops[PLAYER] ? getMoveTargets(map, position!) : []), ...portalTargets]
      : isTubSelected
        ? getSpawnTargets(map, position!)
        : [];
    // A site under the fog is not a site yet, for the same reason a character under it is not
    // a character: offering to build on it would give away that something is there.
    buildSite = isSeen(tile, PLAYER) && getBuild(tile!.object) ? position : undefined;
    // What a tap would raise. A unicorn offers the sites around it — the same question its lit
    // steps answer, asked of the other thing it can do from where it stands — and a site
    // offers itself, which is what turns the second tap on it into the yes. Both go through
    // canBuild (getBuildTargets is nothing but a loop over it), so what the board lights up
    // and what the build actually takes can never come apart.
    //
    // A site that cannot be afforded yet lights nothing and arms nothing. It still says what
    // it would cost the moment it is selected — see render() — which is the half of the old
    // panel button worth keeping: a price is what a site is *for* reading.
    buildTargets = isCharacter ? getBuildTargets(map, position!, PLAYER) : buildSite && canBuild(map, buildSite, PLAYER) ? [buildSite] : [];
    showInfo(index);
  }

  /**
   * The hint: what the bot would do on the player's side, drawn rather than played. It goes
   * through select() exactly as a tap does — the unicorn it would move is picked up with all
   * its steps lit, and the step it would take is the one wearing the hint ring — so carrying
   * the advice out is the same second tap it would have been anyway. Nothing is done for the
   * player; the button ends where a tap on the suggested piece would have.
   *
   * It is the opponent's own strategy on purpose: the advice is the move the rival would have
   * made in this position, so a player who follows it is playing the rival's game rather than
   * a weaker one written for the occasion. It is also read off the player's own fog, because
   * the bot only ever judges from its own side's — a hint can never point at something the
   * player has no way to know is there.
   *
   * getBotAction files the plan it just settled on (see rememberGoal), which is what makes a
   * run of hints walk somewhere instead of pacing between two prizes. A hint the player then
   * ignores leaves that plan behind on a tile nobody moved to — the same harmless leftover a
   * player moving a unicorn by hand already leaves, worth one inherited goal at most.
   */
  /**
   * Asks the bot what it would do and keeps the answer, for the board that shows its advice
   * without being asked — which is level 1 and only level 1. It is where the whole loop is
   * taught (see LEVEL_SEEDS), so the ring is simply up: on the tile to pick up until it is the
   * one in hand, then on the tile to tap next. Every other board keeps the bulb as the one-shot
   * question it has always been, and `advice` stays undefined there.
   *
   * Called from the four places the board can change under the player — a step, a build, a
   * purchase and a new turn — plus the new board itself, rather than from render(): see
   * `advice` for why once per board is not the same as once per paint.
   *
   * A random deal at the tutorial's size counts as level 1 too. It is the same rung played by
   * somebody who has just been taught on it, and singling it out would spend a condition on
   * making the first board after the lesson harder than the lesson.
   */
  function refreshAdvice() {
    advice = level ? undefined : getBotAction(map, BotStrategy.MIXED, PLAYER);
  }

  function showHint() {
    if (!isRunning || isLocked()) return;

    disarmEndTurn(); // asking what to do is an answer to the button's own question
    // The standing advice where there is one, so the bulb and the ring can never disagree:
    // asking again would roll the bot's own tie-breaks a second time and could come back with
    // a different move than the one the board is already pointing at.
    const action = advice ?? getBotAction(map, BotStrategy.MIXED, PLAYER);
    // Nothing to do, or nothing worth doing: the only advice left is the clock, and the button
    // that moves it on is where that is already said.
    hintsEndTurn = !action || action.kind === BotActionKind.END_TURN;
    // A build acts on the site itself and has no second tile, so the site is its own target —
    // and now literally so: selecting it arms it, and the hint's ring lands on the very tile
    // the next tap carries the advice out on.
    const target = hintsEndTurn ? undefined : (action!.to ?? action!.from);
    hintIndex = target && getIndex(target);
    showsScore = false; // the board takes the panel back, exactly as a tap on it does
    if (!hintsEndTurn) select(action!.from);
    render();
    // Bring the answer into view: on a zoomed board the ring can land anywhere, and a hint the
    // player has to go looking for is no hint. Centred rather than nearest, so the ring is not
    // left half under the row's edge; and the unicorn comes along with it, since a step's two
    // tiles are neighbours and a spawn's are too. Smooth, so the eye can follow where the board
    // went rather than finding itself somewhere else; the pan is ~10 packed bytes (2026-09-12)
    // on top of the jump, under test. Quoted: these are not properties terser knows to leave alone.
    if (hintIndex !== undefined) tileElements[hintIndex].scrollIntoView({ "behavior": "smooth", "block": "center", "inline": "center" });
  }

  /** Drops the hint: anything the player does next is an answer to the question it was asking. */
  function clearHint() {
    hintIndex = undefined;
    hintsEndTurn = false;
    disarmEndTurn(); // and so is it an answer to the button's own question
  }

  function onTileClick(index: number) {
    if (!isRunning || isLocked() || index < 0) return;
    showsScore = false; // the board takes the panel back, whether the tap moves or just looks
    clearHint(); // whatever the tap is, it is the player deciding for themselves again
    // With the turn spent there is nothing a tap can do but look, and the board has no other way
    // of saying so — every tile still picks up and explains itself. So the tap is answered in
    // sound instead. wasStuck is the same question the end-turn button is already asking (see
    // render), asked once a repaint rather than again per tap.
    if (wasStuck) playSoundEffect(SoundEffect.STUCK);

    // A build is finished by tapping the site, whichever end of it was picked up: with a
    // unicorn in hand this is the one tap, and with the site in hand it is the second one on
    // the tile itself. So it comes before the deselect below — a site is the one thing on the
    // board that a tap-again does not put down, and the ring plus the price it is wearing are
    // what say that it is asking rather than just selected.
    if (buildTargets.some((target) => getIndex(target) === index)) raise(getPosition(index));
    else if (targets.some((target) => getIndex(target) === index)) {
      // the same second tap either way — what it finishes depends on what is selected, and
      // for a character on whether the lit tile it landed on is next door or across the board
      if (isTubSelected) buy(getPosition(index));
      else move(getPosition(index), portalTargets.some((target) => getIndex(target) === index) ? PORTAL_COST : undefined);
    } else {
      // every tile can be picked up and explains itself, fog and bare ground included;
      // tapping the selected one again drops it and the panel falls back to its hint
      select(index === (selected && getIndex(selected)) ? undefined : getPosition(index));
      render();
    }
  }

  /** One step at whatever that step costs, or — at the portal's price — a jump straight to the far donut. */
  function move(target: Position, cost = getMoveCost(map, selected!, PLAYER)) {
    map.drops[PLAYER] -= cost;
    moveCharacter(map, selected!, target);
    // Stepping on is the whole of opening one, so this runs on every step and comes back
    // empty-handed on all but a few of them. Before the fog and the rainbows: a chest can
    // hold a unicorn, and that unicorn has its own vision and its own light to bring.
    const loot = openChest(map, target, PLAYER, selected!);
    // A jump is a move at the portal's price, and nothing else ever costs that.
    if (cost === PORTAL_COST) playSoundEffect(SoundEffect.PORTAL);

    const previousRainbowCount = map.rainbowCounts[PLAYER];
    revealAround(map, target, PLAYER);
    updateRainbows(map);
    // after the fog lifts, so a step into the unknown still reads its own tile
    select(target); // stays selected, so walking on is a single tap per step
    refreshAdvice(); // the board has moved on, so the advice about it has to
    render();
    showSpending(target, cost); // after render(), which is what puts the tile where it is measured
    if (loot !== undefined) showLoot(target, loot);

    if (map.rainbowCounts[PLAYER] > previousRainbowCount) playSoundEffect(SoundEffect.RAINBOW);
  }

  /**
   * Raises what the site on `site` is for, and hands the board back with the building on
   * it. The position is passed in rather than read off `buildSite`, because a build now has
   * two ways in and only one of them has the site selected: the other has the unicorn beside
   * it in hand. It is always one of `buildTargets`, so canBuild has already said yes.
   */
  function raise(site: Position) {
    clearHint(); // the advice has been taken (or ignored); either way it is spent
    const [, drops, candy] = getBuild(map.tiles[getIndex(site)].object)!; // before the site is spent
    // Whether the site was the thing in hand, asked before the build changes what is on it.
    const wasSelected = !!selected && getIndex(selected) === getIndex(site);

    build(map, site, PLAYER);
    // The selection stays with whatever did the acting, which is the rule a step and a purchase
    // already follow: a unicorn that built from beside a site is still in hand and walks on with
    // one tap, and a site tapped on its own becomes the building and is still what the panel is
    // explaining — a tub that has just been filled going straight on to offering the fields it
    // can put a unicorn on.
    select(wasSelected ? site : selected);
    refreshAdvice();
    render();
    // Counted out of the field it was built on, one currency after the other, in the same
    // gesture a step and a unicorn already use.
    showSpending(site, drops);
    showSpending(site, candy, 1);

    playSoundEffect(SoundEffect.BUILD);
  }

  /** Trades the jar of candy for a unicorn on one of the tub's fields, then hands the board back. */
  function buy(target: Position) {
    const price = getUnicornPrice(map, PLAYER); // read before the newcomer joins the herd and puts the price up
    buyUnicorn(map, target, PLAYER);
    select(selected); // the tub stays picked up, but the jar may no longer stretch to another
    refreshAdvice();
    render();
    // The jar empties the same way the purse does, from the field the unicorn appeared on —
    // sweets rather than drops, but the same gesture, so a price is always counted out in the
    // currency that paid it.
    showSpending(target, price, 1);

    playSoundEffect(SoundEffect.UNICORN);
  }

  /**
   * A counter reacting to its number changing: it swells and settles back. `colour` tints it
   * for the length of the pop, which is what tells the directions apart — money going out
   * turns it red, a number growing turns it green, money arriving leaves it its own colour
   * because the glyph that flew in has already said where it came from.
   * `scale` rather than a `transform`, so it cannot overwrite a transform the counter may be
   * carrying, and alternated back to nothing so there is nothing to clean up afterwards.
   *
   * Takes the counter rather than an index into the currencies: the score is one of these now,
   * and it is not a currency.
   *
   * Not in the competition build (HAS_COUNTER_POPS): the guard folds the body away, and with it
   * every call — the arguments are pure, so terser drops those too, colours and options included.
   */
  function pop(display: HTMLElement, colour?: string) {
    if (!HAS_COUNTER_POPS) return;
    // The tint is spread in rather than set to undefined: a keyframe value the browser cannot
    // parse is dropped silently, and "silently" is how the mangled options below went unnoticed.
    display.animate([{ "scale": POP_SCALE, ...(colour && { "color": colour }) }], POP_OPTIONS);
  }

  /**
   * What something just cost, said where the player is looking: one glyph of the currency
   * rises off the tile it was paid on and fades, per unit paid. Counting in glyphs rather
   * than printing a number is what makes a higher price legible without explaining it — the
   * portal throws two drops, a unicorn one sweet per head of the herd — and it is the language the payout
   * speaks in. A free step off a custard pays nothing and so shows nothing, which says "free"
   * by itself.
   */
  function showSpending(position: Position, cost: number, currency = 0) {
    if (!cost) return;

    const from = centre(tileElements[getIndex(position)]);
    const stagger = Math.min(SPEND_STAGGER, SPEND_SPREAD / cost);

    for (let i = 0; i < cost; i++) {
      flyGlyph(
        [DROP_EMOJI, CANDY_EMOJI][currency],
        from,
        { "transform": `translateY(-${SPEND_RISE}em)`, "opacity": 0 },
        {
          "duration": SPEND_DURATION,
          "delay": i * stagger,
          "easing": "ease-out", // off it goes, then it drifts — the opposite of the payout's dive
        },
      );
    }

    pop(currencyValues[currency], SPEND_COLOR);
  }

  /**
   * One unit of money on its way in: a glyph of `currency` leaves `from` and lands on the
   * counter it pays into, popping it as it arrives — so a busy board reads as a run of
   * payments rather than one number quietly changing. Only the trip is animated; the centring
   * on the tile is a CSS `translate` on the glyph itself, and the two compose rather than
   * overwrite each other.
   *
   * `to` is passed in rather than measured here: a busy board sends thirty of these to the
   * same place, and measuring is the one thing that makes the browser stop and think.
   */
  function flyToCounter(currency: number, from: number[], to: number[], delay: number) {
    flyGlyph(
      [DROP_EMOJI, CANDY_EMOJI][currency],
      from,
      { "transform": `translate(${to[0] - from[0]}px, ${to[1] - from[1]}px) scale(0.5)`, "opacity": 0.5 },
      { "duration": FLY_DURATION, "delay": delay, "easing": "ease-in" },
      () => pop(currencyValues[currency]),
    );
  }

  /**
   * A chest paying out. It flies the same glyphs the same way the turn's income does — money
   * coming in always moves towards the purse, whether it was earned or found — so a chest
   * needs no explaining beyond the trip the player has already watched every turn.
   * A unicorn is its own announcement: it is standing on the board, so nothing flies for it.
   */
  function showLoot(position: Position, loot: ChestLoot) {
    if (loot === ChestLoot.UNICORN) {
      playSoundEffect(SoundEffect.UNICORN);
      return;
    }

    // A loot value doubles as its currency index — see the ChestLoot comment in game-objects.
    const from = centre(tileElements[getIndex(position)]);
    const to = centre(currencyDisplays[loot]);
    const count = [CHEST_DROPS, CHEST_CANDY][loot];
    const stagger = Math.min(FLY_STAGGER, FLY_SPREAD / count);

    for (let i = 0; i < count; i++) flyToCounter(loot, from, to, i * stagger);
    playSoundEffect(loot); // counted in as it flies, exactly as a payout of the same currency is
  }

  /**
   * The payout made visible: one glyph leaves every tile that is earning and flies to the
   * counter it pays into — a drop from every rainbow, a sweet from every earning tree. Where
   * the income comes from is otherwise only implicit in a number going up, and on a board
   * this size that is the one thing worth showing.
   *
   * Read straight off the tiles rather than from the income counts, so what flies is exactly
   * what is being paid: the two are counted from the same rainbows and the same predicate.
   *
   * The two currencies are collected one after the other rather than at once — every drop
   * first, a pause, then every sweet. Both counters climbing at the same time is a single
   * blur of movement; taken in turn, each currency gets its own moment and the player can
   * actually count what the board just paid them.
   *
   * Returns how long the whole payout takes, which is what finishTurn waits out.
   */
  function flyIncome(): number {
    // The counters are measured once here rather than per flight: thirty drops all land in
    // the same place, and measuring is the one thing that makes the browser stop and think.
    const centres = currencyDisplays.map(centre);
    // The paying tiles, grouped by the currency they pay — which is also the index everything
    // else is keyed by: the emoji that flies, the counter it lands on, and the one that pops.
    // A tile only ever appears in one of the two groups: water or sweets, never both, which is
    // the rule getRainbowIncome states once for the whole game.
    const groups: number[][] = [[], []];

    // The player's own income only, throughout: what flies is what lands in the counters the
    // player is watching. The rival's payout happens on the model and is never animated — its
    // score is the thing to watch it by, and thirty more glyphs a turn crossing the screen
    // would say nothing the number does not.
    map.tiles.forEach((tile, index) => {
      // A rainbow throws what it earns, in whichever of the two it earns it: one glyph per level
      // of the unicorn whose light made it, so a grown one is counted out in three and the size
      // of the herd's income can be watched arriving rather than only read off the counter.
      // Through getRainbowIncome, the same call the counter's "+" came from, so the flight cannot
      // promise what the jar is not paid.
      //
      // The sweets leave the rainbow rather than the lollipop that coloured them, which is the
      // point of the tile being the earner: what flies out of a tile is what that tile made.
      if (tile.object === GameObjectType.RAINBOW) {
        const [currency, amount] = getRainbowIncome(map, getPosition(index));
        groups[currency].push(...Array<number>(amount).fill(index));
      }
      // A tub pays its flat drops out of itself, one glyph each, so the income that needs no
      // setting up is counted out on the board exactly like the income that does.
      else if (tile.object === GameObjectType.BATHTUB) groups[0].push(...Array<number>(BASE_INCOME).fill(index));
    });

    let start = 0; // when this currency's first glyph sets off
    let end = 0; // when the last one of all has landed — nothing paid, nothing to wait for

    groups.forEach((group, currency) => {
      if (!group.length) return; // an empty currency costs no pause either

      const stagger = Math.min(FLY_STAGGER, FLY_SPREAD / group.length);
      const [toX, toY] = centres[currency];

      // The delay is what lets the sweets wait on their trees while the drops are collected.
      group.forEach((index, i) => flyToCounter(currency, centre(tileElements[index]), [toX, toY], start + i * stagger));
      // Once per currency as its glyphs set off, not once per glyph: the riffle runs while they
      // fly and the counter pops when they land. The currency index is the sound's — see SoundEffect.
      setTimeout(() => playSoundEffect(currency as SoundEffect), start);

      end = start + (group.length - 1) * stagger + FLY_DURATION;
      start = end + CURRENCY_GAP; // the next currency waits for this one to be in the purse
    });

    return end;
  }

  /**
   * The guard on the one control in the game that cannot be taken back. Ending a turn spends a
   * turn out of the run and hands the board to the rival, and it sits a finger's width under
   * the info panel's own button — so a tap meant for the raise button lands here, and there is
   * no undoing it.
   *
   * The guard is a second tap rather than a dialog or a hold: a dialog would be the loudest
   * possible answer to a rare slip (and would pull the framework's unused dialog component
   * back into the bundle), and a hold has to teach itself to a player who has never been asked
   * to hold anything.
   *
   * It is skipped when the game can prove there is nothing else to do, when something is
   * advising the clock (see advisesEndTurn), and once the run is over, where the button is the
   * way out to the levels and there is nothing left to lose. The first two are the same
   * questions the button's own look is drawn from (see render), so those are one rule and the
   * button is always telling the truth about which of them it is: plain means it will ask, loud
   * means it will not. Nothing else may join the loud face without joining this line too.
   *
   * That line is deliberately drawn wide rather than at the slip itself. Measured over the
   * ladder, a turn ends with some legal move still on the board on anything from half to nearly three
   * quarters of turns (46% on the 9x9, 72% on the 25x25), because a turn normally ends with a drop or two
   * left and nothing worth spending it on — so this asks *often*, not rarely. That is the trade
   * it was chosen on: a broad net that also catches presses no narrow rule would have. The
   * narrow rule, if it ever comes to that, is `buildSite` — ask only while the raise button is
   * on screen, which is the one state the mis-taps were actually observed in.
   */
  function endTurnPressed() {
    if (!isRunning) return onExit();
    if (confirmsEndTurn || advisesEndTurn() || !canAct(map, PLAYER)) return finishTurn();

    confirmsEndTurn = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      confirmsEndTurn = false;
      render();
    }, CONFIRM_TIMEOUT);
    render();
  }

  /** Takes the question back. Anything else the player does is an answer of "no, not that". */
  function disarmEndTurn() {
    clearTimeout(confirmTimer);
    confirmsEndTurn = false;
  }

  /**
   * Closes the turn: the board pays out, the turn counter moves on, and the run ends if that
   * was the last one — the only way a run can end, since a bathtub pays whatever else happens
   * and the board can therefore never seize up.
   *
   * The purse is credited only once the income has landed, so the counters move when the
   * drops and sweets reach them rather than a second before. Everything else waits with it,
   * the end of the run included — the last turn is paid out like any other.
   */
  function finishTurn() {
    // The closing turn pays out nothing — see endTurn — so there is nothing to watch either,
    // and the result comes up the moment the button is pressed instead of after a flight of
    // glyphs carrying money the run has no more use for.
    clearHint(); // the turn the advice was about is over
    advice = undefined; // and the standing one with it: nothing is advised over a board mid-payout
    const wait = map.turn < TURN_LIMIT ? flyIncome() : 0;
    isPaying = !!wait; // an empty board pays nothing and has nothing to wait for
    // Ending the turn is done with whatever was picked up: the selection goes with it, so the
    // board stops offering steps nobody can take while the income flies and the rival moves,
    // and the next turn starts from the hint rather than from last turn's piece.
    select();
    render(); // takes the button out of reach for the length of the flight

    setTimeout(() => {
      isPaying = false;
      endTurn(map, PLAYER);
      render();

      // The rival goes next, and the clock only moves on once it has had its turn — so a
      // "turn" is the pair of them. Without an opponent the two halves collapse into what
      // this always did: pay the player, tick over, see whether the run is out of turns.
      // On the closing turn it has no go (see hasGo), so the run ends on the player's move
      // rather than on somebody else's.
      if (HAS_OPPONENT && HAS_RIVAL && hasGo(map, RIVAL)) playRivalTurn(closeTurn);
      else closeTurn();
    }, wait);
  }

  /** The clock moving on, once everybody who plays this turn has played it. */
  function closeTurn() {
    nextTurn(map);
    select(selected); // the rival may have walked off a tile this selection was aiming at
    refreshAdvice(); // a fresh turn and a fresh purse: what to do with it is decided again
    render();

    if (isRunOver(map)) endGame();
  }

  /**
   * The opponent's turn, played out in front of the player one action at a time. It is the
   * same bot the dev corner drives, on the other side, and it goes through applyBotAction
   * rather than through the interface's own move/buy/raise: those are the *player's* hands —
   * they read `selected`, fly the player's glyphs and pop the player's counters.
   *
   * A timer rather than a loop, so the board is repainted between actions and the rival can
   * be watched crossing it. It is also the only thing on this screen that runs while the
   * player cannot act, which is what isRivalTurn locks.
   *
   * Nothing here checks how long the turn is: the bot ends its own turn exactly as the player
   * does — when it can find nothing worth doing — and END_TURN is what stops the timer. That
   * is the same guarantee the run has always leaned on, that a turn always ends.
   */
  function markRivalAction(position?: Position) {
    rivalMark?.classList.remove(styles.acting);
    // Only where the player can actually see it happen: under the clouds the ring would be the
    // one thing on the board that reports the rival's position for free, which is the exact
    // thing the fog is there to withhold. showsBeam is the same test the light is held to, so
    // the dev-tools x-ray shows the ring for the same reason it shows everything else.
    rivalMark = position && showsBeam(position) ? tileElements[getIndex(position)] : undefined;
    rivalMark?.classList.add(styles.acting);
  }

  function playRivalTurn(onDone: () => void) {
    isRivalTurn = true;
    render(); // takes the board out of reach for as long as the rival is on it

    rivalTimer = setInterval(() => {
      const action = getBotAction(map, BotStrategy.MIXED, RIVAL);

      if (!action || action.kind === BotActionKind.END_TURN) {
        clearInterval(rivalTimer);
        rivalTimer = undefined;
        endTurn(map, RIVAL); // its own payout, on the model — nothing flies for it
        isRivalTurn = false;
        markRivalAction(); // the ring goes out with the turn, or it would read as an offer
        onDone();
        return;
      }

      applyBotAction(map, action, RIVAL);
      // Where it just acted: the tile it stepped onto, or the one it stood on to build. After the
      // action rather than before, so the ring lands where the unicorn now is.
      markRivalAction(action.to ?? action.from);
      // Re-selected rather than only redrawn: the rival may have walked onto the very tile
      // this selection was offering as a step, and a highlight that outlives what it was
      // offering is worse than none. The board is locked either way, so nothing can be acted
      // on in the meantime — this is about what it says, not about what it allows.
      select(selected);
      render();
    }, RIVAL_STEP_DELAY) as unknown as number;
  }

  /**
   * Out of a run and back to the levels, from the header's title — which is the one way out that
   * does not wait for the turns to run out. The run is abandoned rather than paused: a score
   * belongs to a run that was played to the whistle, so there is nothing here to keep.
   *
   * The rival's timer is the reason this is a function rather than a call to onExit: it walks
   * the opponent through its turn a step at a time and reads `map`, which the next run replaces.
   * startRun clears it on the way in, so nothing could actually go wrong today — but a timer
   * left ticking against a board nobody is looking at is a bug waiting for the next person to
   * add a second way in, and stopping it here costs a line.
   */
  function leaveRun() {
    isRunning = false;
    clearInterval(rivalTimer);
    rivalTimer = undefined;
    isRivalTurn = false;
    onExit();
  }

  /**
   * The result takes over the info panel and the turn button — no dialog on top of the board.
   * There is only one way to get here: the turns ran out. The board cannot seize up while a
   * bathtub is paying, so every run is played to the end and every ending is celebrated.
   */
  function endGame() {
    isRunning = false;
    // On a board with an opponent there is now something to lose. A draw goes to the player:
    // the rival is the thing to beat, and matching it is beating it — and it keeps "there is
    // no losing in this game" true of every board that has nobody on it to lose to.
    const isWon = !HAS_OPPONENT || !HAS_RIVAL || getScore(map, PLAYER) >= getScore(map, RIVAL);
    select(undefined); // drops the board highlights; the panel now carries the result
    setInfo(
      HAS_OPPONENT && HAS_RIVAL ? (isWon ? TranslationKey.WON_RACE : TranslationKey.LOST_RACE) : TranslationKey.WON,
      isWon ? WIN_EMOJI : LOSE_EMOJI,
    );
    const score = getScore(map, PLAYER);
    // The level's record, and only from its own board: a level's percentage stands for the one
    // map every player is dealt, so a random deal cannot fill a stripe. Written before the panel
    // is drawn rather than after, because the launch screen reads its stripes back out of this.
    if (!isRandom) setBestScore(level, score);
    infoText.textContent += ` ${score}`; // the text ends ready for the number
    showsScore = false; // the result owns the panel now; there is nothing left to toggle
    renderScoreBoard(true); // the total above, its working below — and the rival's total under that
    // A finished run is one thing to read, so it is one panel to read it in: the working moves
    // inside the panel that announces the result rather than sitting under it in a second box.
    // Nothing is told about this — the panel look is written for a child of .host, and being a
    // child of .info is the whole of the difference (see .info > .scoreBoard). startRun puts it
    // back. Grid placement is by area either way, so where it lands among .host's children on
    // the way back does not matter.
    infoPanel.append(scoreBoard);
    render();

    pubSubService.publish(PubSubEvent.GAME_END, { isWon });
  }

  // The level to play comes from the launch screen, as a rung rather than a board: the size and
  // the seed both hang off it (see game/levels.ts), and so does the record the run will be
  // written into. `random` swaps that seed for a fresh one — the same board size dealt again,
  // which scores nothing and is offered once the level's own board has been finished.
  function startNewGame(playedLevel: number, random = false) {
    level = playedLevel;
    isRandom = random;
    // Dev-only: what a reload comes back to. Written here rather than in startRun, because 🔁
    // deals the same level again and has nothing new to say about which screen is up.
    if (HAS_DEV_TOOLS) setLocalStorageItem(LocalStorageKey.SCREEN, `${playedLevel}`);
    // The flag first, so that a build without the random board folds the whole branch away and
    // takes createSeed out with it — the level's own seed is then the only board there is.
    startRun(HAS_GAMEPLAY_NICE_TO_HAVES && random ? createSeed() : LEVEL_SEEDS[level]);
  }

  /**
   * Opens a board. Split from startNewGame because 🔁 comes back through here on its own: which
   * level is being played and whether it counts are settled up there and stay settled, and this
   * is only the map being dealt again.
   */
  function startRun(newSeed: number) {
    seed = newSeed;
    map = createGameMap(seed, MAP_SIZES[level]); // sets MAP_SIZE and HAS_RIVAL, so everything below reads the new board
    // The bot rolls on a generator of its own — see bot.ts — and it is seeded from the map
    // so that the same board played by the same bot plays out the same way twice. It has to
    // be reset for the opponent as well as for the dev tools now: the memory it keeps between
    // decisions (where each unicorn is headed, where it has been) belongs to the last board.
    if (HAS_DEV_TOOLS || HAS_OPPONENT) resetBot(seed);
    // A run left mid-rival-turn must neither lock the next one nor leave a rival walking about
    // on a board that has been replaced underneath it.
    clearInterval(rivalTimer);
    rivalTimer = undefined;
    isRivalTurn = false;
    if (HAS_OPPONENT) markRivalAction(); // a ring from the last board must not open the next one
    if (tileElements.length !== MAP_SIZE * MAP_SIZE) buildBoard();
    clearHint(); // an arrow drawn on the last board must not open the next one
    showsScore = false; // render() clears last run's working with it, before the new board shows
    hostElement.append(scoreBoard); // out of the result panel and back to a panel of its own
    newRun = true; // the first render of a board seeds the bar rather than reacting to it
    wasStuck = false; // the last board's spent turn must not be the new one's opening line
    isRunning = true; // before render(), which reads it for the turn button
    select(undefined);
    refreshAdvice(); // after resetBot, so the opening advice is not built on the last board's plans
    render();
    applyZoom(true); // the map row can only be measured once it is on the page, so not before here
    // Back to the player's own corner. The row keeps its offsets across a board change (the
    // end-of-run buttons never hide it), clamped to the new board's extent, so without this a
    // level opened from the last one's result showed whatever patch of fog lay at the old
    // offsets. Top-left is where the tub and the opening unicorn are (see TUB_POSITION).
    mapArea.scrollTo(0, 0);

    pubSubService.publish(PubSubEvent.GAME_START);
  }

  return [hostElement, startNewGame, headerControls, leaveRun];
}
