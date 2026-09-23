/**
 * The night in progress: who is sitting where, what they want, and how it goes
 * (HANDOVER.md §8, Phase 2).
 *
 * The generator decides who and when up front, from the seed. This module only
 * runs what it planned: seats people as chairs free up, drains patience, walks
 * out anyone who ran out, and settles up when a drink is served.
 */
import { INTOX, NIGHT } from '../tuning';
import { generateNight } from '../sim/night/NightGenerator';
import { createRng } from '../sim/run/Rng';
import type { Rng } from '../sim/run/Rng';
import { describeSpecials, withSpecials } from '../sim/drinks/Specials';
import { shouldBeCutOff } from '../sim/customers/Intoxication';
import { emptyTally } from '../sim/run/Reputation';
import type { ReputationTally } from '../sim/run/Reputation';
import { createCustomer, startLeaving } from '../sim/customers/Customer';
import { applyPatienceDelta, drainPatience } from '../sim/customers/Patience';
import { drink, metabolise } from '../sim/customers/Intoxication';
import { react } from '../sim/customers/Reactions';
import { evaluate } from '../sim/drinks/Evaluate';
import { discard, liquidMl } from '../sim/liquid/Vessel';
import { recipe } from '../sim/data';
import type { Bar, Customer, NightEvent, NightPlan, Reaction, Vessel } from '../sim/types';
import type { NightTotals } from '../sim/night/Summary';
import { formatMinute } from './Clock';

/** How long someone lingers after their drink before giving up the seat. */
const LINGER_MINUTES = 9;
/** How long a leaving customer stays on screen before the seat frees. */
const LEAVING_MINUTES = 1.5;

export interface SeatedCustomer extends Customer {
  /** Game minute they started leaving, if they are. */
  leavingAtMinute: number | null;
}

export interface NightState {
  plan: NightPlan;
  barId: string;
  /** Game minutes past open. */
  minute: number;
  customers: SeatedCustomer[];
  /** customerId per seat, or null. */
  seats: (string | null)[];
  tips: number;
  served: number;
  walkouts: number;
  sentBack: number;
  events: NightEvent[];
  over: boolean;
  /** Next arrival in the plan we have not dealt with yet. */
  nextArrival: number;
  /** Planned arrivals who found no free seat and left again. */
  turnedAway: number;
  /** What can be ordered tonight, including anything bought this run. */
  menu: string[];
  /** Everything that moves reputation, accumulated as it happens. */
  tally: ReputationTally;
  /** Second rounds and other in-night decisions. Seeded, like everything else. */
  rng: Rng;
  tipMultiplier: number;
}

export interface NightOptions {
  /** Tonight's menu, including recipes bought this run. */
  menu?: string[];
  tipMultiplier?: number;
}

export function createNight(
  seed: number,
  bar: Bar,
  night: number,
  options: NightOptions = {},
): NightState {
  const menu = options.menu && options.menu.length > 0 ? options.menu : bar.menu;
  return {
    menu,
    tally: emptyTally(),
    // Forked well clear of the generator's streams so second rounds cannot
    // shift who walks in the door.
    rng: createRng(seed ^ (night * 0x85ebca6b)).fork(9),
    tipMultiplier: options.tipMultiplier ?? bar.modifiers['tipMul'] ?? 1,
    plan: generateNight(seed, bar, night, { menu }),
    barId: bar.id,
    minute: 0,
    customers: [],
    seats: new Array<string | null>(Math.min(bar.seats, NIGHT.SEATS)).fill(null),
    tips: 0,
    served: 0,
    walkouts: 0,
    sentBack: 0,
    events: [],
    over: false,
    nextArrival: 0,
    turnedAway: 0,
  };
}

function log(state: NightState, kind: string, text: string): void {
  state.events.push({ minute: state.minute, kind, text });
}

function freeSeat(state: NightState): number {
  return state.seats.indexOf(null);
}

/**
 * Advance the night by `minutes` of game time.
 * Order matters: seat arrivals first so a new customer gets a full tick of
 * patience, then drain, then remove anyone who is done.
 */
export function stepNight(state: NightState, minutes: number): void {
  if (state.over || minutes <= 0) return;
  state.minute += minutes;

  seatArrivals(state);

  for (const customer of state.customers) {
    drainPatience(customer, minutes);
    metabolise(customer, minutes);

    if (customer.phase === 'leaving') continue;

    if (customer.patience <= 0) {
      // §12: a walkout is a real cost. Phase 3 turns it into reputation.
      startLeaving(customer, 'walked_out');
      customer.leavingAtMinute = state.minute;
      state.walkouts += 1;
      state.tally.walkouts += 1;
      log(state, 'walkout', `${customer.name} gave up waiting and left.`);
      continue;
    }

    if (customer.phase === 'drinking' && state.minute - customer.orderedAtMinute > LINGER_MINUTES) {
      if (wantsAnother(state, customer)) {
        orderAgain(state, customer);
      } else {
        startLeaving(customer, 'left_happy');
        customer.leavingAtMinute = state.minute;
        state.tally.leftHappy += 1;
        log(state, 'left', `${customer.name} finished up and left.`);
      }
    }
  }

  releaseSeats(state);
}

function seatArrivals(state: NightState): void {
  const { arrivals } = state.plan;
  while (
    state.nextArrival < arrivals.length &&
    arrivals[state.nextArrival]!.atMinute <= state.minute
  ) {
    const arrival = arrivals[state.nextArrival]!;
    state.nextArrival += 1;

    const seat = freeSeat(state);
    if (seat === -1) {
      // Nowhere to sit. Phase 3 makes a full bar cost you something.
      state.turnedAway += 1;
      state.tally.turnedAway += 1;
      continue;
    }

    const customer: SeatedCustomer = {
      ...createCustomer({
        id: `c${state.nextArrival}`,
        defId: arrival.defId,
        seat,
        minute: state.minute,
        order: {
          recipeId: arrival.recipeId,
          ...(arrival.specials ? { special: arrival.specials } : {}),
        },
      }),
      leavingAtMinute: null,
    };
    customer.phase = 'waiting';

    state.seats[seat] = customer.id;
    state.customers.push(customer);
    const aside = describeSpecials(arrival.specials);
    log(
      state,
      'arrived',
      `${customer.name} sat down and asked for a ${recipe(arrival.recipeId).name}` +
        (aside ? ` — ${aside}.` : '.'),
    );
  }
}

/**
 * A second round is the main source of pressure in a rush: the seat does not
 * free up and the order arrives while you are already behind. Nobody who is
 * over the line asks for another — that decision is yours to make, not theirs.
 */
function wantsAnother(state: NightState, customer: SeatedCustomer): boolean {
  if (shouldBeCutOff(customer)) return false;
  if (customer.drinksHad >= 3) return false;
  if (customer.mood < -0.2) return false;
  const eagerness = 0.3 + customer.mood * 0.25;
  return state.rng.chance(eagerness);
}

function orderAgain(state: NightState, customer: SeatedCustomer): void {
  const recipeId = state.rng.pick(state.menu);
  customer.order = { recipeId };
  customer.phase = 'waiting';
  customer.orderedAtMinute = state.minute;
  // They are settled in, so they start the wait with a bit of goodwill.
  customer.patience = Math.max(customer.patience, 0.8);
  log(state, 'reorder', `${customer.name} ordered another ${recipe(recipeId).name}.`);
}

function releaseSeats(state: NightState): void {
  const staying: SeatedCustomer[] = [];
  for (const customer of state.customers) {
    const done =
      customer.phase === 'leaving' &&
      customer.leavingAtMinute !== null &&
      state.minute - customer.leavingAtMinute >= LEAVING_MINUTES;

    if (done) {
      if (customer.seat !== null && state.seats[customer.seat] === customer.id) {
        state.seats[customer.seat] = null;
      }
    } else {
      staying.push(customer);
    }
  }
  state.customers = staying;
}

export function customerAtSeat(state: NightState, seat: number): SeatedCustomer | null {
  const id = state.seats[seat];
  if (!id) return null;
  return state.customers.find((c) => c.id === id) ?? null;
}

export interface ServeOutcome {
  reaction: Reaction;
  score: number;
  recipeId: string | null;
}

/**
 * Hand a drink to a customer. Evaluates the liquid, asks the customer what
 * they make of it, and settles the tip. The glass is emptied either way — a
 * rejected drink is still gone.
 */
export function serveDrink(
  state: NightState,
  customer: SeatedCustomer,
  vessel: Vessel,
  spilledMl: number,
  buildTimeSec: number,
): ServeOutcome | null {
  if (customer.phase === 'leaving' || liquidMl(vessel) <= 0) return null;

  // Judge it against what they actually asked for: "no salt" makes a salted
  // rim a fault rather than a virtue (§8, Phase 3).
  const ordered = customer.order
    ? withSpecials(recipe(customer.order.recipeId), customer.order.special)
    : undefined;
  const result = evaluate(vessel, ordered, { timeSec: buildTimeSec, spilledMl });
  const reaction = react(customer, result, state.minute, state.tipMultiplier);

  // Over the line before this drink is what counts — the drink itself is what
  // pushes them past it, and you could see the state they were in.
  const wasOverTheLine = shouldBeCutOff(customer);

  applyPatienceDelta(customer, reaction.patienceDelta);
  customer.mood = Math.max(-1, Math.min(1, customer.mood + reaction.moodDelta));
  for (const flag of reaction.flags) customer.flags.add(flag);

  if (reaction.verdict === 'rejected') {
    state.sentBack += 1;
    state.tally.sentBack += 1;
    log(state, 'sent_back', `${customer.name}: "${reaction.line}"`);
  } else {
    drink(customer, vessel);
    state.tips += reaction.tip;
    state.served += 1;
    customer.phase = 'drinking';
    customer.orderedAtMinute = state.minute;

    if (reaction.verdict === 'loved') {
      state.tally.loved += 1;
      state.tally.lovedDemandingSum += customer.personality.demanding;
    }
    if (wasOverTheLine) {
      state.tally.servedWhileCutOff += 1;
      log(state, 'over_served', `${customer.name} should not have been served that.`);
    }

    log(
      state,
      reaction.verdict,
      `${customer.name}: "${reaction.line}" (${reaction.adjustedScore}/100, ${reaction.tip} tip)`,
    );
  }

  discard(vessel);
  return { reaction, score: reaction.adjustedScore, recipeId: result.recipeId };
}

/**
 * Refuse to serve someone (§8, Phase 3: the "cut off" verb).
 *
 * Getting it right — reading that someone has had enough before you pour them
 * another — is one of the few things that pays reputation back. Getting it
 * wrong costs you, so it is a judgement, not a free action.
 */
export function cutOff(state: NightState, customer: SeatedCustomer): boolean {
  if (customer.phase === 'leaving') return false;

  const justified = customer.bac >= INTOX.DRUNK;
  startLeaving(customer, justified ? 'cut_off' : 'refused_unfairly');
  customer.leavingAtMinute = state.minute;

  if (justified) {
    state.tally.goodCutOffs += 1;
    log(state, 'cut_off', `Cut ${customer.name} off. They went quietly.`);
  } else {
    state.tally.badCutOffs += 1;
    log(state, 'refused', `Refused ${customer.name}, who was fine. They were not happy.`);
  }
  return justified;
}

/** Everything the run needs from a finished night. */
export function nightTotals(state: NightState, night: number): NightTotals {
  return {
    night,
    served: state.served,
    tips: state.tips,
    walkouts: state.walkouts,
    sentBack: state.sentBack,
    turnedAway: state.turnedAway,
    neverServed: state.tally.neverServed,
    cutOffs: state.tally.goodCutOffs,
    badCutOffs: state.tally.badCutOffs,
    servedWhileCutOff: state.tally.servedWhileCutOff,
    loved: state.tally.loved,
    lovedDemandingSum: state.tally.lovedDemandingSum,
    leftHappy: state.tally.leftHappy,
  };
}

/** Close the doors. Everyone still waiting counts as a walkout. */
export function endNight(state: NightState): void {
  if (state.over) return;
  state.over = true;
  for (const customer of state.customers) {
    if (customer.phase === 'waiting') {
      state.walkouts += 1;
      state.tally.neverServed += 1;
      customer.flags.add('never_served');
    }
  }
  log(state, 'closed', `Last call. ${formatMinute(state.minute)}.`);
}

/** The placeholder end-of-night summary §8 asks for: flags and the seed. */
export function summarise(state: NightState): string[] {
  return [
    `Seed ${state.plan.seed} · bar ${state.barId} · night ${state.plan.night}`,
    `Served ${state.served} · tips ${state.tips}`,
    `Sent back ${state.sentBack} · walked out ${state.walkouts} · turned away ${state.turnedAway}`,
  ];
}
