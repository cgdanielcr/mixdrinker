/**
 * The night in progress: who is sitting where, what they want, and how it goes
 * (HANDOVER.md §8, Phase 2).
 *
 * The generator decides who and when up front, from the seed. This module only
 * runs what it planned: seats people as chairs free up, drains patience, walks
 * out anyone who ran out, and settles up when a drink is served.
 */
import { NIGHT } from '../tuning';
import { generateNight } from '../sim/night/NightGenerator';
import { createCustomer, startLeaving } from '../sim/customers/Customer';
import { applyPatienceDelta, drainPatience } from '../sim/customers/Patience';
import { drink, metabolise } from '../sim/customers/Intoxication';
import { react } from '../sim/customers/Reactions';
import { evaluate } from '../sim/drinks/Evaluate';
import { discard, liquidMl } from '../sim/liquid/Vessel';
import { recipe } from '../sim/data';
import type { Bar, Customer, NightEvent, NightPlan, Reaction, Vessel } from '../sim/types';
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
}

export function createNight(seed: number, bar: Bar, night: number): NightState {
  return {
    plan: generateNight(seed, bar, night),
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
      log(state, 'walkout', `${customer.name} gave up waiting and left.`);
      continue;
    }

    if (customer.phase === 'drinking' && state.minute - customer.orderedAtMinute > LINGER_MINUTES) {
      startLeaving(customer, 'left_happy');
      customer.leavingAtMinute = state.minute;
      log(state, 'left', `${customer.name} finished up and left.`);
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
      continue;
    }

    const customer: SeatedCustomer = {
      ...createCustomer({
        id: `c${state.nextArrival}`,
        defId: arrival.defId,
        seat,
        minute: state.minute,
        order: { recipeId: arrival.recipeId },
      }),
      leavingAtMinute: null,
    };
    customer.phase = 'waiting';

    state.seats[seat] = customer.id;
    state.customers.push(customer);
    log(
      state,
      'arrived',
      `${customer.name} sat down and asked for a ${recipe(arrival.recipeId).name}.`,
    );
  }
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
  tipMultiplier = 1,
): ServeOutcome | null {
  if (customer.phase === 'leaving' || liquidMl(vessel) <= 0) return null;

  const result = evaluate(vessel, undefined, { timeSec: buildTimeSec, spilledMl });
  const reaction = react(customer, result, state.minute, tipMultiplier);

  applyPatienceDelta(customer, reaction.patienceDelta);
  customer.mood = Math.max(-1, Math.min(1, customer.mood + reaction.moodDelta));
  for (const flag of reaction.flags) customer.flags.add(flag);

  if (reaction.verdict === 'rejected') {
    state.sentBack += 1;
    log(state, 'sent_back', `${customer.name}: "${reaction.line}"`);
  } else {
    drink(customer, vessel);
    state.tips += reaction.tip;
    state.served += 1;
    customer.phase = 'drinking';
    customer.orderedAtMinute = state.minute;
    log(
      state,
      reaction.verdict,
      `${customer.name}: "${reaction.line}" (${reaction.adjustedScore}/100, ${reaction.tip} tip)`,
    );
  }

  discard(vessel);
  return { reaction, score: reaction.adjustedScore, recipeId: result.recipeId };
}

/** Close the doors. Everyone still waiting counts as a walkout. */
export function endNight(state: NightState): void {
  if (state.over) return;
  state.over = true;
  for (const customer of state.customers) {
    if (customer.phase === 'waiting') {
      state.walkouts += 1;
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
