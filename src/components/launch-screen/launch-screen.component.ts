import styles from "./launch-screen.module.scss";
import { createButton, createElement } from "../../utils/html-utils";
import { CssClass } from "../../utils/css-class";
import { getLocalStorageItem, LocalStorageKey, setLocalStorageItem } from "../../utils/local-storage";
import { MAP_SIZES } from "../../game/game-map";
import { getTranslation } from "../../translations/i18n";
import { TranslationKey } from "../../translations/translationKey";
import { GAME_EMOJI, HAS_GAMEPLAY_NICE_TO_HAVES, HAS_SIDE_CHOICE } from "../../env-utils";
import { getBestScore, getPercent } from "../../game/levels";
import { chooseDarkSide, darkSide } from "../../utils/dark-side";
import { PLAYER } from "../../game/game-objects";

const MAP_EMOJI = "🗺️"; // labels the board a stripe plays on
const DICE_EMOJI = "🎲"; // the other board: this level's size, dealt fresh (see createDiceButton)

/**
 * The hue the bottom stripe takes, in degrees; the top one takes 0, which is red. Bottom to
 * top is easiest to hardest, and that is the whole reason the rainbow is stood on end — the
 * colours a player already reads as "gentle" and as "danger" are at the right ends of it
 * without anything having to say so.
 *
 * Spread across however many stripes there are rather than being seven fixed colours, so the
 * band stays a rainbow if the list of boards grows or shrinks.
 */
const VIOLET_HUE = 300;
/**
 * A rainbow is not evenly spaced around the hue circle: orange and yellow are squeezed into
 * its first sixth while green sprawls over the next third. Spacing the stripes equally comes
 * out as two greens and no orange at all — so the steps are crowded towards the warm end,
 * which is exactly where the colour changes fastest. PLACEHOLDER exponent, tuned by eye.
 *
 * This is also why the ladder is not drawn in a perceptually uniform space, which would make the
 * bias unnecessary and every rung equally loud. That was tried: flat OKLCH lightness and chroma
 * hold the rungs beautifully even, and stop the band looking like a rainbow at all — because
 * yellow being light and blue being dark is not an artefact to correct, it is what makes yellow
 * read as yellow rather than as olive. Evenness is the wrong goal here; see SATURATION_WARM for
 * the narrower fix.
 */
const WARM_BIAS = 1.4;
/**
 * Saturation at the two ends of the ladder, walked linearly between them, and the reason it is
 * not one flat number: HSL saturation is not perceptual, so a single value comes out twice as
 * loud at some hues as at others. Magenta is one of the loud ones and the worst placed of them,
 * because the page behind it is pink — a loud magenta on a pink page reads as the page turned up
 * too far, where a loud green simply reads as green.
 *
 * So the cool end is damped until it weighs what the warm end weighs: level 1 comes out at a Lab
 * chroma of 55 against level 7's 52, where a flat 80% had them at 75 and 52. It leaves the warm
 * half alone, which is where the rainbow most needs its punch, and the falloff runs the same way
 * the difficulty does — loudest at the top of the ladder, calmest at the bottom.
 *
 * PLACEHOLDER pair. Handed to the stylesheet as --s rather than computed there, for the same
 * reason as the hues.
 */
const SATURATION_WARM = 80;
const SATURATION_COOL = 56;
/**
 * How far a stripe's own colour drifts, top to bottom, towards the hue of the stripe below it.
 * The ladder runs red at the top to violet at the foot, so hue *increases* down the screen and a
 * positive step leans each card towards its lower neighbour — which is what makes seven separate
 * cards still read as one rainbow.
 *
 * PLACEHOLDER, and this is very nearly as far as it goes: the gaps between rungs are uneven (see
 * WARM_BIAS) and the smallest of them is about 25°, between the top two. Past that a stripe's
 * foot would reach the colour of the card below it and the ladder would start to look like it
 * had lost a step — so if the gradient still wants to be stronger, take it out of
 * $stripe-lightness-drop in the stylesheet rather than out of this.
 */
const NEIGHBOUR_HUE_STEP = 24;

/** How far up the ladder a rung is: 0 at the hardest board, 1 at the easiest. */
const rungAt = (index: number) => (MAP_SIZES.length - 1 - index) / (MAP_SIZES.length - 1);

/** Where a rung sits on the rainbow. Index 0 is the easiest board and takes VIOLET_HUE. */
const hueFor = (index: number) => VIOLET_HUE * rungAt(index) ** WARM_BIAS;

/**
 * The launch screen: one stripe per board on offer, played in two taps — one to pick the
 * stripe, a second anywhere on it to start the run. Two taps rather than one because a stripe
 * is going to mean a level with a history behind it, and a screen where looking at a level and
 * committing to it are the same gesture leaves nowhere to put that. It also means the board a
 * run is about to be played on is stated before it starts.
 *
 * A stripe is a level: one fixed board, the same for every player, and how near its best run
 * came to that level's target — written twice over, as a percentage and as how far along the
 * stripe the solid colour reaches (see game/levels.ts). Once it has been finished it also
 * offers the 🎲 — the same
 * size dealt from a fresh seed, which scores nothing and is there to be played for its own
 * sake. Which is why the offer is two buttons and not one: the level is the thing with a
 * record attached, and the random board is the thing to do once the record is set.
 *
 * The screen always opens with something picked, and the pick climbs: a new player finds the
 * bottom stripe ready to play, and finishing a run leaves the one above it ready instead. So
 * the ladder is walked by pressing the same button over and over, and picking a stripe is
 * something a player does only to break step — to replay one, or to skip ahead.
 */
export function LaunchScreenComponent(
  onPlay: (level: number, random?: boolean) => void,
): [hostElement: HTMLElement, update: () => void, startPicked: () => void] {
  // The rung being offered, as an index rather than a size: the whole behaviour is "the next
  // one along", which is a thing only a position in the ladder can say.
  let pickedIndex = 0;
  const stripes: HTMLElement[] = [];
  // One per stripe, filled in by update(): how far the level's best score got towards its
  // target, as a percentage. Held as their own elements because they and the stripe's own fill
  // are the only parts of a stripe that change after it is built — everything else about one is
  // true for as long as the game runs.
  const scoreLabels: HTMLElement[] = [];

  // One button, moved into whichever stripe is picked, rather than one per stripe kept
  // hidden: it is the same offer wherever it lands, and there is only ever one of it.
  // HINT because it is exactly what that class is for elsewhere in the game — the one
  // obvious thing to do next.
  // It carries no handler of its own: it only ever sits inside the picked stripe, and a click
  // on the picked stripe is already the thing this button offers (see the stripe below). So
  // the click bubbles into that one handler instead of there being two ways to start a run.
  // The mark is in a span of its own so a narrow stripe can put it aside and keep the word: four
  // things were competing for one phone-width row and the die at the end of it was being cut
  // off. The word is what stays, because it is the one that says what the tap does — the emoji
  // is decoration here, unlike in the header, where it is the game's own identity.
  // The space rides with the emoji rather than sitting in front of the word, so that hiding the
  // one takes the other with it and the button is not left with a space to open on.
  const playButton = createButton({ cssClass: [CssClass.HINT, styles.play] }, [
    createElement({ tag: "span", cssClass: [CssClass.EMOJI, styles.optional], text: `${GAME_EMOJI} ` }),
    getTranslation(TranslationKey.PLAY),
  ]);

  /**
   * The other board: this level's size dealt from a fresh seed, offered only on a stripe that
   * has been finished — it is a thing to do *with* a level, and a level nobody has played yet
   * has nothing to do it with. It scores nothing and fills no stripe; see game/levels.ts.
   *
   * The click has to be stopped: the whole picked stripe starts its own board, and without this
   * a tap on the die would be a tap on the stripe as well, which starts a run and then replaces
   * it. The die and no word, because a stripe on a phone has no room for one — and the die is
   * as close to a word as a glyph gets for this.
   *
   * Built by a function rather than inline, the trick the board's own component uses twice
   * (createFogButton, createRivalScore): with the flag folded to false this is an uncalled
   * declaration and goes out with the tree-shaking, where a `const` would still run its
   * createButton in every build.
   */
  function createDiceButton(): HTMLElement {
    return createButton({
      cssClass: [CssClass.ICON_BTN, CssClass.EMOJI, styles.play],
      onClick: (event) => {
        event.stopPropagation();
        onPlay(pickedIndex, true);
      },
      text: DICE_EMOJI,
    });
  }

  const diceButton = HAS_GAMEPLAY_NICE_TO_HAVES ? createDiceButton() : undefined;

  /**
   * Which unicorn is yours: the bright one or the dark one. Two buttons rather than one that
   * flips, because the thing being chosen *is* the two glyphs — a toggle would only ever show
   * one of them and the player would have to press it to find out what the other was.
   *
   * The picked one is ringed in the same outline a picked stripe wears, which is the screen's
   * own way of saying "this one of several". Both are the same 🦄; the dark one is that glyph
   * inverted, exactly as the board draws the other side (see .dark in the map's stylesheet) —
   * so what the buttons show is literally what will be on the board.
   *
   * PLACEHOLDER: no label. The pair of glyphs and the ring are the whole of it, which keeps the
   * feature out of the translations — a string would cost the competition build bytes for a
   * feature the competition build does not have (every language map ships whole).
   *
   * Under level 1 on the screen, which is *before* it in the DOM: the ladder is laid out
   * column-reverse so that the game's own order — easiest first — reads bottom to top. So this
   * is prepended rather than appended.
   *
   * Built by a function for the same reason createDiceButton is: with the flag folded to false
   * it is an uncalled declaration and goes out with the tree-shaking.
   */
  function createSideChoice(): HTMLElement {
    // The glyph is in a span of its own so that the inversion lands on it alone. On the board
    // the negative is only ever put on a glyph, never on the surface under one — put on the
    // button it inverted the button's own frosted face as well, which came out as a black pill
    // on the pale theme and a white one on the dark, neither of which is a button of this game.
    const buttons = [false, true].map((dark) =>
      createButton(
        {
          cssClass: [CssClass.ICON_BTN, CssClass.EMOJI],
          onClick: () => {
            chooseDarkSide(dark);
            updateSideChoice();
          },
        },
        [createElement({ tag: "span", cssClass: dark ? styles.inverted : "", text: GAME_EMOJI })],
      ),
    );

    function updateSideChoice() {
      buttons.forEach((button, index) => button.classList.toggle(styles.pickedSide, index === (darkSide === PLAYER ? 1 : 0)));
    }

    updateSideChoice();

    return createElement({ cssClass: styles.sideChoice }, buttons);
  }

  // Both offers in one box, moved into the picked stripe together. A wrapper rather than two
  // loose buttons because it is the pick that moves them: appending one element puts both into
  // the new stripe and takes both out of the old one, an element being in one place at a time.
  const actions = createElement({ cssClass: styles.actions }, [playButton, ...(diceButton ? [diceButton] : [])]);

  const host = createElement(
    { cssClass: styles.host },
    MAP_SIZES.map((size, index) => {
      // The label is wrapped rather than dropped straight into the stripe: it has to give way
      // as one thing when the offer lands beside it, and a bare text node would be a flex item
      // of its own.
      // What is in it is the rung's number first and biggest — that is what a level selector
      // is a list of, and it is the one thing that will still be true once the stripes stop
      // being seven sizes of the same generator. The board comes second and smaller, as the
      // detail about the level rather than its name, and states both axes because "9" alone
      // reads as an amount of something rather than as how big the map is.
      // The ladder runs 5 to 25, so the dimensions are three characters wide on the bottom three
      // rungs and five on the rest. That used to be padded out here with spaces, which only ever
      // worked while the page was monospace and quietly stopped being true when it was not. The
      // slot is held open in the stylesheet now, where it depends on the width of nothing. See
      // .board, and the note on .level for why tabular figures are not an option on this row.
      // What the level has been played to, filled in by update() — see there for why it is
      // empty at this point and why nothing here ever reads storage.
      scoreLabels[index] = createElement({ tag: "span" });
      // A tap on a stripe that is not the picked one picks it; a tap anywhere on the picked
      // one starts the run. Two taps to play a level the player was not already being offered,
      // one to take the offer — and the whole stripe is that offer's target rather than just
      // the button on it, which on a phone is the difference between a comfortable hit and a
      // careful one. The button stays because it is what *says* the second tap plays.
      const stripe = createElement({ cssClass: styles.stripe, onClick: () => (index === pickedIndex ? start() : pick(index)) }, [
        createElement({ cssClass: [styles.label, CssClass.EMPHASIS] }, [
          createElement({ cssClass: styles.level, text: `${index + 1}` }),
          // Wrapped so the emoji and the dimensions are one flex item; loose, they would be two,
          // and the label's gap would open up in the middle of the board's own name.
          // The 🗺️ steps aside on a narrow stripe for the same reason the 🦄 does — the
          // dimensions are the information, the emoji is what labels them when there is room.
          createElement({ tag: "span", cssClass: styles.board }, [
            createElement({ tag: "span", cssClass: [CssClass.EMOJI, styles.optional], text: `${MAP_EMOJI} ` }),
            `${size}×${size}`,
          ]),
          // Inside the label rather than beside it, so the whole of what a stripe *says* is one
          // thing that gives way as one — the offer is what sits apart from it.
          scoreLabels[index],
        ]),
      ]);

      // The stripe's two hues, which are the one thing about it that is settled for good — how
      // full it is, the other per-stripe value, is set by update() and moves. Everything else
      // about how a stripe is drawn is in the stylesheet, reading these three.
      //
      // Both are handed over ready-made rather than the stylesheet deriving the second with a
      // calc(): lightningcss is already known to mis-parse an hsl() whose hue is a var() it
      // cannot resolve (see .stripe), and arithmetic on that var is not a thing to find out
      // about in a built stylesheet.
      // Centred on the rung's own hue rather than starting from it, which is the fix for a rung
      // not looking like the colour it was asked for. Anchored at the head, the top stripe ran
      // red to orange and its perceived middle came out around 12° — orange-red, with no red
      // about it. Every rung was reading warm of itself; it was only obvious where the ladder ran
      // out of room below red. Half the step each way puts the intended hue back in the middle,
      // and the foot still leans towards the card below.
      const hue = hueFor(index);
      stripe.style.setProperty("--h", `${hue - NEIGHBOUR_HUE_STEP / 2}deg`);
      stripe.style.setProperty("--h2", `${hue + NEIGHBOUR_HUE_STEP / 2}deg`);
      stripe.style.setProperty("--s", `${SATURATION_WARM + (SATURATION_COOL - SATURATION_WARM) * rungAt(index)}%`);
      stripes.push(stripe);

      return stripe;
    }),
  );

  if (HAS_SIDE_CHOICE) host.prepend(createSideChoice());

  /**
   * Starts the picked run. The screen steps up a rung as it goes, so it is already offering
   * the next level by the time the player comes back to it — both happen in here, so the
   * screen is hidden before the browser ever paints the moved pick. The top of the ladder
   * stays put: there is nothing above it to climb to.
   */
  function start() {
    const level = pickedIndex; // read before the pick moves on
    const next = Math.min(pickedIndex + 1, MAP_SIZES.length - 1);
    pick(next);
    // What is stored is the rung now on offer rather than the one just played, so closing the
    // tab and coming back lands in the same place as walking back from the run does.
    setLocalStorageItem(LocalStorageKey.SIZE, `${MAP_SIZES[next]}`);
    onPlay(level);
  }

  function pick(index: number) {
    stripes[pickedIndex].classList.remove(styles.picked);
    stripes[(pickedIndex = index)].classList.add(styles.picked);
    stripes[index].append(actions); // moves it out of wherever it was — an element is in one place
    update();
  }

  /**
   * Every stripe's score, re-read from storage — and with it whether the picked level has the
   * other board to offer. Called on every pick and again every time the screen is shown, which
   * is how a run's result reaches the stripe it was earned on: the run is over by then and its
   * score is in storage, so there is nothing to hand back here, only something to re-read.
   *
   * A level's share of its target is written twice over: as the number, and as how far along the
   * stripe the solid colour reaches (--p, see the stylesheet). The fill is capped where the
   * number is not — a stripe cannot be more than full, and a player who beats the bot should
   * still get to watch the figure climb.
   *
   * A level never finished shows nothing at all rather than "0%": an empty stripe already says
   * it, and a column of zeroes reads as seven failures rather than seven levels to come.
   *
   * Left to end where it ends. The tabular figures on .label put every score's *start* in the
   * same column, which is what a left-aligned column wants; padding the short ones in front to
   * line the % signs up as well was measured at 5 bytes un-packed and the budget has not got
   * them. If it ever has, it is one padStart(4, "\u2007") here.
   */
  function update() {
    scoreLabels.forEach((scoreLabel, index) => {
      const best = getBestScore(index);
      const percent = best && getPercent(index, best);
      scoreLabel.textContent = percent ? `${percent}%` : "";
      stripes[index].style.setProperty("--p", `${Math.min(percent, 100)}%`);
    });
    // A level nobody has finished has no random board on offer: the die is what you do with a
    // level once you have played it, and offering it first would make the level itself optional.
    if (HAS_GAMEPLAY_NICE_TO_HAVES) diceButton!.classList.toggle(CssClass.HIDDEN, !getBestScore(pickedIndex));
  }

  // Where the screen opens. A stored board that this build no longer offers finds no index, and
  // so does the empty storage of a first visit — both come back -1 and both belong at the
  // bottom of the ladder, which is what the floor at 0 says in one expression.
  pick(Math.max(0, MAP_SIZES.indexOf(Number(getLocalStorageItem(LocalStorageKey.SIZE)))));

  // `start` goes out with the rest so the caller can open the picked rung without a tap — see
  // the first visit in index.ts. It is the same act the stripe's own click performs, storage
  // and the step up the ladder included, rather than a second way in that could drift from it.
  return [host, update, start];
}
