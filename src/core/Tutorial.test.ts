import { describe, expect, it } from 'vitest';
import { bar } from '../sim/data';
import { addMl } from '../sim/liquid/Vessel';
import { addIce, shakeStep, stirStep } from '../sim/liquid/Mixing';
import { pourStep } from '../sim/liquid/Pour';
import { createWorld } from './World';
import type { World, WorldItem } from './World';
import { createNight, customerAtSeat, serveDrink } from './Night';
import type { NightState } from './Night';
import { LESSONS, Tutorial } from './Tutorial';
import type { TutorialContext } from './Tutorial';

function setup() {
  const world = createWorld();
  const night = createNight(1, bar('dive'), 1);
  night.plan.arrivals = [];
  const ctx: TutorialContext = { world, night, serves: 0 };
  return { world, night, ctx };
}

function find(world: World, id: string): WorldItem {
  const found = world.items.find((i) => i.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

/** Pour for `seconds` at full tilt, the way a held mouse button would. */
function pour(world: World, fromId: string, toId: string, seconds: number): void {
  const from = find(world, fromId).vessel;
  const to = find(world, toId).vessel;
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) pourStep(from, to, 1, 1000 / 60);
}

/**
 * Do what the current step asks, using the same sim operations the game uses.
 * If a step's instruction and its completion check ever disagree, this is
 * where it shows up.
 */
function perform(tutorial: Tutorial, world: World, night: NightState, ctx: TutorialContext): void {
  const { text } = tutorial.view();
  const highlight = tutorial.view().highlight;
  const held = () => world.heldId;

  if (/^Click the COLA bottle/.test(text)) world.heldId = 'bottle_cola';
  else if (/Let go when the cola reaches the line/.test(text))
    pour(world, 'bottle_cola', 'vessel_3', 2.0);
  else if (/put the bottle back/.test(text)) world.heldId = null;
  else if (/^Click the HIGHBALL glass to pick it up/.test(text)) world.heldId = 'vessel_3';
  else if (/^Carry it to the ICE bucket/.test(text)) addIce(find(world, 'vessel_3').vessel, 3);
  else if (/^Pick up the GIN bottle/.test(text)) world.heldId = 'bottle_gin';
  else if (/^Pour gin into the HIGHBALL/.test(text)) pour(world, 'bottle_gin', 'vessel_3', 0.5);
  else if (/pick up the SODA/.test(text)) world.heldId = 'bottle_soda';
  else if (/^Top the glass up with soda/.test(text)) pour(world, 'bottle_soda', 'vessel_3', 1.5);
  else if (/pick up the glass\.$/.test(text)) world.heldId = 'vessel_3';
  else if (/^Click the ICE bucket three times/.test(text))
    addIce(find(world, 'vessel_3').vessel, 3);
  else if (/LIME tray to hang a wedge/.test(text))
    find(world, 'vessel_3').vessel.garnish.push('lime_wedge');
  else if (/^Pick up the TEQUILA/.test(text)) world.heldId = 'bottle_tequila_blanco';
  else if (/into the SHAKER \(the metal tin\)/.test(text))
    pour(world, 'bottle_tequila_blanco', 'vessel_4', 0.5);
  else if (/TRIPLE SEC/.test(text)) pour(world, 'bottle_triple_sec', 'vessel_4', 0.25);
  else if (/LIME juice/.test(text)) pour(world, 'bottle_lime_juice', 'vessel_4', 0.25);
  else if (/pick up the SHAKER, and click the ICE/.test(text))
    addIce(find(world, 'vessel_4').vessel, 4);
  else if (/^Now shake it/.test(text)) {
    for (let i = 0; i < 200; i++) shakeStep(find(world, 'vessel_4').vessel, 1, 1000 / 60);
  } else if (/Pick up a ROCKS glass/.test(text)) world.heldId = 'vessel_0';
  else if (/on the SALT plate/.test(text)) find(world, 'vessel_0').vessel.rim = 'salt';
  else if (/^Click ICE a couple of times/.test(text)) {
    addIce(find(world, 'vessel_0').vessel, 2);
    find(world, 'vessel_0').vessel.garnish.push('lime_wedge');
  } else if (/pour it all into the rocks glass/.test(text)) pour(world, 'vessel_4', 'vessel_0', 2);
  else if (/into the MIXING glass/.test(text)) pour(world, 'bottle_gin', 'vessel_5', 0.6);
  else if (/splash of VERMOUTH/.test(text)) pour(world, 'bottle_dry_vermouth', 'vessel_5', 0.1);
  else if (/pick up the MIXING glass, and click the ICE/.test(text))
    addIce(find(world, 'vessel_5').vessel, 3);
  else if (/^Stir it/.test(text)) {
    for (let i = 0; i < 200; i++) stirStep(find(world, 'vessel_5').vessel, 1, 1000 / 60);
  } else if (/into the COUPE/.test(text)) pour(world, 'vessel_5', 'vessel_2', 2);
  else if (/pick up the COUPE/.test(text)) world.heldId = 'vessel_2';
  else if (/serve it/.test(text)) {
    const glassId =
      held() ??
      (highlight === 'seat_0'
        ? ['vessel_3', 'vessel_0', 'vessel_2'].find((id) => {
            const v = find(world, id).vessel;
            return Object.keys(v.contents).length > 0;
          })
        : null);
    const glass = find(world, glassId ?? 'vessel_3');
    const customer = customerAtSeat(night, 0);
    if (customer) serveDrink(night, customer, glass.vessel, 0, 20);
    ctx.serves += 1;
  } else {
    throw new Error(`The test does not know how to perform: "${text}"`);
  }
}

describe('Tutorial', () => {
  it('starts on the first step of the easiest drink', () => {
    const view = new Tutorial().view();
    expect(view.lessonNumber).toBe(1);
    expect(view.stepNumber).toBe(1);
    expect(view.lessonTitle).toBe('A Cola');
    expect(view.finished).toBe(false);
  });

  it('orders lessons from the easiest drink to the hardest', () => {
    const titles = LESSONS.map((l) => l.title);
    expect(titles[0]).toBe('A Cola');
    expect(titles).toEqual(['A Cola', 'A Gin & Tonic', 'A Margarita', 'A Martini']);
  });

  it('gives every step an instruction a person can read', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        expect(step.text.length).toBeGreaterThan(8);
        expect(step.text.length).toBeLessThan(200);
      }
    }
  });

  it('points at items that exist on the bar', () => {
    const world = createWorld();
    const ids = new Set(world.items.map((i) => i.id));
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (step.highlight) expect(ids.has(step.highlight)).toBe(true);
      }
    }
  });

  it('does not advance until the step is actually done', () => {
    const { ctx } = setup();
    const tutorial = new Tutorial();
    tutorial.update(ctx);
    tutorial.update(ctx);
    expect(tutorial.view().stepNumber).toBe(1);
  });

  it('seats one customer wanting exactly the lesson drink, and nobody else', () => {
    const { ctx, night } = setup();
    const tutorial = new Tutorial();
    tutorial.update(ctx);
    expect(night.customers).toHaveLength(1);
    expect(night.customers[0]!.order?.recipeId).toBe('cola_glass');
  });

  it('can be completed end to end by doing exactly what each step says', () => {
    const { world, night, ctx } = setup();
    const tutorial = new Tutorial();
    const seen: string[] = [];

    for (let guard = 0; guard < 200 && !tutorial.finished; guard++) {
      tutorial.update(ctx);
      if (tutorial.finished) break;
      const before = `${tutorial.lessonIndex}:${tutorial.stepIndex}`;
      seen.push(tutorial.view().text);
      perform(tutorial, world, night, ctx);
      tutorial.update(ctx);
      const after = `${tutorial.lessonIndex}:${tutorial.stepIndex}`;
      // If performing the instruction does not complete the step, the step's
      // check and its words disagree — which is exactly the bug to catch.
      expect(after, `stuck on: "${seen.at(-1)}"`).not.toBe(before);
    }

    expect(tutorial.finished).toBe(true);
    expect(seen.length).toBe(LESSONS.reduce((n, l) => n + l.steps.length, 0));
  });

  it('serves a drink the customer is actually happy with when the steps are followed', () => {
    const { world, night, ctx } = setup();
    const tutorial = new Tutorial();

    // Run just the first lesson.
    for (let guard = 0; guard < 40 && tutorial.lessonIndex === 0; guard++) {
      tutorial.update(ctx);
      if (tutorial.lessonIndex > 0) break;
      perform(tutorial, world, night, ctx);
      tutorial.update(ctx);
    }
    expect(night.served).toBe(1);
    expect(night.sentBack).toBe(0);
  });

  it('produces drinks the customer accepts when you pour to the lines', () => {
    // Before fill lines, following the instructions faithfully produced a
    // Margarita scoring 57. A tutorial that teaches you to fail is worse than
    // none, so every lesson's drink must come back accepted.
    const { world, night, ctx } = setup();
    const tutorial = new Tutorial();
    for (let guard = 0; guard < 200 && !tutorial.finished; guard++) {
      tutorial.update(ctx);
      if (tutorial.finished) break;
      perform(tutorial, world, night, ctx);
      tutorial.update(ctx);
    }
    expect(night.served).toBe(LESSONS.length);
    expect(night.sentBack).toBe(0);
  });

  it('gives every pour step a fill line to aim at', () => {
    for (const lesson of LESSONS) {
      for (const step of lesson.steps) {
        if (
          /pour|Top the glass|splash/i.test(step.text) &&
          !/pour it all|into the COUPE/.test(step.text)
        ) {
          expect(step.target, step.text).toBeDefined();
        }
      }
    }
  });

  it('can skip a step, as an escape hatch', () => {
    const tutorial = new Tutorial();
    tutorial.skip();
    expect(tutorial.view().stepNumber).toBe(2);
  });

  it('can jump straight to a lesson', () => {
    const tutorial = new Tutorial();
    tutorial.goToLesson(2);
    expect(tutorial.view().lessonTitle).toBe('A Margarita');
    expect(tutorial.view().stepNumber).toBe(1);
  });

  it('clamps lesson jumps to the lessons that exist', () => {
    const tutorial = new Tutorial();
    tutorial.goToLesson(99);
    expect(tutorial.view().lessonTitle).toBe('A Martini');
    tutorial.goToLesson(-5);
    expect(tutorial.view().lessonTitle).toBe('A Cola');
  });

  it('finishes after the last step of the last lesson', () => {
    const tutorial = new Tutorial();
    const total = LESSONS.reduce((n, l) => n + l.steps.length, 0);
    for (let i = 0; i < total; i++) tutorial.skip();
    expect(tutorial.finished).toBe(true);
    expect(tutorial.view().finished).toBe(true);
  });

  it('keeps tutorial bottles full: the lessons never depend on stock', () => {
    const world = createWorld();
    const cola = find(world, 'bottle_cola');
    expect(cola.vessel.contents['cola']).toBeGreaterThan(300);
    addMl(cola.vessel, 'cola', 0);
  });
});
