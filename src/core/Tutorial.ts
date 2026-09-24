/**
 * The tutorial: one drink at a time, easiest first.
 *
 * Written because the first person to play said, correctly, "it's too much,
 * too fast." §7 assumed the recipe book alone would teach the bar. It does not:
 * ten bottles, eleven stations and a five-seat rush with no guidance is a wall.
 *
 * Every step here is one instruction, points at exactly the thing to touch,
 * and only moves on once you have done it. There is no clock and nobody walks
 * out. Quantities are checked generously — the lesson is the motion, not the
 * millilitre — and the serve at the end of each drink shows the real score,
 * so you learn that craft matters without being failed for it.
 */
import { liquidMl } from '../sim/liquid/Vessel';
import type { World, WorldItem } from './World';
import type { NightState } from './Night';
import { clearCustomers, seatCustomer } from './Night';
import { discard } from '../sim/liquid/Vessel';

export interface TutorialContext {
  world: World;
  night: NightState;
  /** Serves attempted so far this tutorial, accepted or sent back. */
  serves: number;
}

export interface TutorialStep {
  /** The one thing to do now, in plain words. */
  text: string;
  /** The item to point at, if there is one obvious thing to touch. */
  highlight?: string;
  /**
   * A fill line: pour into `vessel` until it holds `totalMl` in all. Timing
   * instructions ("about half a second") produced drinks that scored 57 when
   * followed faithfully; a line anyone can see is the instruction that works.
   */
  target?: { vessel: string; totalMl: number; label: string };
  /** Runs once when the step begins. */
  setup?: (ctx: TutorialContext) => void;
  done: (ctx: TutorialContext) => boolean;
}

export interface Lesson {
  title: string;
  /** Why this drink, and what it teaches, in a sentence. */
  intro: string;
  steps: TutorialStep[];
}

// ------------------------------------------------------------------ helpers

const HIGHBALL = 'vessel_3';
const ROCKS = 'vessel_0';
const COUPE = 'vessel_2';
const SHAKER = 'vessel_4';
const MIXING = 'vessel_5';
/** Leftmost seat: the instruction panel sits top-centre and must not hide the order. */
const SEAT_INDEX = 0;
const SEAT = `seat_${SEAT_INDEX}`;

function item(ctx: TutorialContext, id: string): WorldItem {
  const found = ctx.world.items.find((i) => i.id === id);
  if (!found) throw new Error(`Tutorial references missing item ${id}`);
  return found;
}

function ml(ctx: TutorialContext, vesselId: string, ingredientId: string): number {
  return item(ctx, vesselId).vessel.contents[ingredientId] ?? 0;
}

function holding(ctx: TutorialContext, id: string): boolean {
  return ctx.world.heldId === id;
}

/** Clear the bar and seat one person wanting one drink. */
function freshDrink(recipeId: string, defId: string, vessels: string[]) {
  return (ctx: TutorialContext): void => {
    for (const id of vessels) {
      const v = item(ctx, id);
      discard(v.vessel);
      v.drinkSpillMl = 0;
      v.buildTimeSec = 0;
    }
    clearCustomers(ctx.night);
    seatCustomer(ctx.night, defId, recipeId, SEAT_INDEX);
  };
}

/** A serve step: done the moment anything is handed over, good or bad. */
function serveStep(vesselId: string): TutorialStep {
  let servesAtStart = 0;
  return {
    text: 'Carry it up to the customer and tap their spot on the counter to serve it.',
    highlight: SEAT,
    setup: (ctx) => {
      servesAtStart = ctx.serves;
    },
    done: (ctx) => ctx.serves > servesAtStart || liquidMl(item(ctx, vesselId).vessel) <= 0,
  };
}

// ------------------------------------------------------------------ lessons

export const LESSONS: Lesson[] = [
  {
    title: 'A Cola',
    intro: 'The simplest drink there is. It teaches the five things every other drink uses.',
    steps: [
      {
        text: 'Click the COLA bottle to pick it up.',
        highlight: 'bottle_cola',
        setup: freshDrink('cola_glass', 'walkin_easy', [HIGHBALL]),
        done: (ctx) => holding(ctx, 'bottle_cola'),
      },
      {
        text: 'Move it over the tall HIGHBALL glass, then press and HOLD the mouse button to pour. Let go when the cola reaches the line.',
        highlight: HIGHBALL,
        target: { vessel: HIGHBALL, totalMl: 200, label: 'cola' },
        done: (ctx) => ml(ctx, HIGHBALL, 'cola') >= 150,
      },
      {
        text: 'Good. Now quickly click an empty spot to put the bottle back.',
        done: (ctx) => ctx.world.heldId === null,
      },
      {
        text: 'Click the HIGHBALL glass to pick it up.',
        highlight: HIGHBALL,
        done: (ctx) => holding(ctx, HIGHBALL),
      },
      {
        text: 'Carry it to the ICE bucket and click it three times — one cube each.',
        highlight: 'station_ice',
        done: (ctx) => item(ctx, HIGHBALL).vessel.ice >= 3,
      },
      serveStep(HIGHBALL),
    ],
  },

  {
    title: 'A Gin & Tonic',
    intro: 'Two things in one glass, and your first garnish.',
    steps: [
      {
        text: 'Pick up the GIN bottle.',
        highlight: 'bottle_gin',
        setup: freshDrink('gin_tonic', 'walkin_regular', [HIGHBALL]),
        done: (ctx) => holding(ctx, 'bottle_gin'),
      },
      {
        text: 'Pour gin into the HIGHBALL up to the line. It is a short pour — let go early.',
        highlight: HIGHBALL,
        target: { vessel: HIGHBALL, totalMl: 50, label: 'gin' },
        done: (ctx) => ml(ctx, HIGHBALL, 'gin') >= 38,
      },
      {
        text: 'Put the gin down, then pick up the SODA.',
        highlight: 'bottle_soda',
        done: (ctx) => holding(ctx, 'bottle_soda'),
      },
      {
        text: 'Top the glass up with soda to the new line — a long pour this time.',
        highlight: HIGHBALL,
        target: { vessel: HIGHBALL, totalMl: 200, label: 'soda' },
        done: (ctx) => ml(ctx, HIGHBALL, 'soda') >= 110,
      },
      {
        text: 'Put the soda down and pick up the glass.',
        highlight: HIGHBALL,
        done: (ctx) => holding(ctx, HIGHBALL),
      },
      {
        text: 'Click the ICE bucket three times.',
        highlight: 'station_ice',
        done: (ctx) => item(ctx, HIGHBALL).vessel.ice >= 3,
      },
      {
        text: 'Now click the LIME tray to hang a wedge on the rim.',
        highlight: 'station_garnish',
        done: (ctx) => item(ctx, HIGHBALL).vessel.garnish.includes('lime_wedge'),
      },
      serveStep(HIGHBALL),
    ],
  },

  {
    title: 'A Margarita',
    intro:
      'Your first shaken drink. It goes into the SHAKER first, gets shaken with ice, then poured into a glass with a salted rim.',
    steps: [
      {
        text: 'Pick up the TEQUILA.',
        highlight: 'bottle_tequila_blanco',
        setup: freshDrink('margarita', 'walkin_regular', [ROCKS, SHAKER]),
        done: (ctx) => holding(ctx, 'bottle_tequila_blanco'),
      },
      {
        text: 'Pour it into the SHAKER (the metal tin), not a glass, up to the line.',
        highlight: SHAKER,
        target: { vessel: SHAKER, totalMl: 50, label: 'tequila' },
        done: (ctx) => ml(ctx, SHAKER, 'tequila_blanco') >= 38,
      },
      {
        text: 'Put it down. Pick up the TRIPLE SEC and pour it into the shaker to the next line.',
        highlight: 'bottle_triple_sec',
        target: { vessel: SHAKER, totalMl: 75, label: 'triple sec' },
        done: (ctx) => ml(ctx, SHAKER, 'triple_sec') >= 18,
      },
      {
        text: 'Same again with the LIME juice, to the next line.',
        highlight: 'bottle_lime_juice',
        target: { vessel: SHAKER, totalMl: 100, label: 'lime' },
        done: (ctx) => ml(ctx, SHAKER, 'lime_juice') >= 18,
      },
      {
        text: 'Put the bottle down, pick up the SHAKER, and click the ICE bucket four times.',
        highlight: 'station_ice',
        done: (ctx) => item(ctx, SHAKER).vessel.ice >= 3,
      },
      {
        text: 'Now shake it: hold the mouse button down and move the mouse fast, side to side, until the bar stops rattling.',
        highlight: SHAKER,
        done: (ctx) => {
          const v = item(ctx, SHAKER).vessel;
          return v.shaken && v.mixed >= 0.75;
        },
      },
      {
        text: 'Put the shaker down. Pick up a ROCKS glass (the short wide one).',
        highlight: ROCKS,
        done: (ctx) => holding(ctx, ROCKS),
      },
      {
        text: 'Hold the glass on the SALT plate — press and keep holding until the rim goes white.',
        highlight: 'station_salt',
        done: (ctx) => item(ctx, ROCKS).vessel.rim === 'salt',
      },
      {
        text: 'Click ICE a couple of times, then click the LIME tray.',
        highlight: 'station_ice',
        done: (ctx) => {
          const v = item(ctx, ROCKS).vessel;
          return v.ice >= 2 && v.garnish.includes('lime_wedge');
        },
      },
      {
        text: 'Put the glass down. Pick up the SHAKER and pour it all into the rocks glass.',
        highlight: ROCKS,
        done: (ctx) => ml(ctx, ROCKS, 'tequila_blanco') >= 25,
      },
      serveStep(ROCKS),
    ],
  },

  {
    title: 'A Martini',
    intro:
      'A Martini is stirred, not shaken — gentler, clearer, colder. It uses the MIXING glass, and is served without ice.',
    steps: [
      {
        text: 'Pick up the GIN and pour it into the MIXING glass (the tall straight one) up to the line.',
        highlight: MIXING,
        target: { vessel: MIXING, totalMl: 60, label: 'gin' },
        setup: freshDrink('martini', 'walkin_snob', [COUPE, MIXING]),
        done: (ctx) => ml(ctx, MIXING, 'gin') >= 45,
      },
      {
        text: 'Add just a splash of VERMOUTH — the line is barely above the gin.',
        highlight: 'bottle_dry_vermouth',
        target: { vessel: MIXING, totalMl: 70, label: 'vermouth' },
        done: (ctx) => ml(ctx, MIXING, 'dry_vermouth') >= 6,
      },
      {
        text: 'Put the bottle down, pick up the MIXING glass, and click the ICE bucket three times.',
        highlight: 'station_ice',
        done: (ctx) => item(ctx, MIXING).vessel.ice >= 3,
      },
      {
        text: 'Stir it: hold the button down and move the mouse in quick circles. It is the same motion as shaking — the glass is what makes it a stir.',
        highlight: MIXING,
        done: (ctx) => {
          const v = item(ctx, MIXING).vessel;
          return v.stirred && v.mixed >= 0.7;
        },
      },
      {
        text: 'Pour it into the COUPE (the wide shallow glass). The ice stays behind.',
        highlight: COUPE,
        done: (ctx) => ml(ctx, COUPE, 'gin') >= 30,
      },
      {
        text: 'Put the mixing glass down and pick up the COUPE.',
        highlight: COUPE,
        done: (ctx) => holding(ctx, COUPE),
      },
      serveStep(COUPE),
    ],
  },
];

// ------------------------------------------------------------ state machine

export interface TutorialView {
  lessonNumber: number;
  lessonCount: number;
  lessonTitle: string;
  intro: string;
  stepNumber: number;
  stepCount: number;
  text: string;
  highlight: string | null;
  target: TutorialStep['target'] | null;
  finished: boolean;
}

export class Tutorial {
  lessonIndex = 0;
  stepIndex = 0;
  finished = false;
  private setUp = false;

  constructor(private readonly lessons: Lesson[] = LESSONS) {}

  private get lesson(): Lesson | undefined {
    return this.lessons[this.lessonIndex];
  }

  private get step(): TutorialStep | undefined {
    return this.lesson?.steps[this.stepIndex];
  }

  /** Advance as far as the player's actions allow. Returns true if a step completed. */
  update(ctx: TutorialContext): boolean {
    if (this.finished) return false;
    const step = this.step;
    if (!step) {
      this.finished = true;
      return false;
    }

    if (!this.setUp) {
      step.setup?.(ctx);
      this.setUp = true;
    }

    if (!step.done(ctx)) return false;
    this.next();
    return true;
  }

  /** Skip the current step. An escape hatch for when a check is too strict. */
  skip(): void {
    this.next();
  }

  /** Jump to the start of a lesson. */
  goToLesson(index: number): void {
    this.lessonIndex = Math.max(0, Math.min(this.lessons.length - 1, index));
    this.stepIndex = 0;
    this.setUp = false;
    this.finished = false;
  }

  private next(): void {
    this.setUp = false;
    this.stepIndex += 1;
    const lesson = this.lesson;
    if (lesson && this.stepIndex >= lesson.steps.length) {
      this.lessonIndex += 1;
      this.stepIndex = 0;
    }
    if (this.lessonIndex >= this.lessons.length) this.finished = true;
  }

  view(): TutorialView {
    const lesson = this.lesson;
    const step = this.step;
    return {
      lessonNumber: Math.min(this.lessonIndex + 1, this.lessons.length),
      lessonCount: this.lessons.length,
      lessonTitle: lesson?.title ?? '',
      intro: lesson?.intro ?? '',
      stepNumber: this.stepIndex + 1,
      stepCount: lesson?.steps.length ?? 0,
      text: step?.text ?? '',
      highlight: step?.highlight ?? null,
      target: step?.target ?? null,
      finished: this.finished,
    };
  }
}
