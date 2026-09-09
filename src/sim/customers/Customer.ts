/**
 * Customer state model (HANDOVER.md §5).
 * Pure. The generator decides who and when; this decides what they are doing.
 */

import { customerDef } from '../data';
import type { Customer, CustomerDef, Order } from '../types';

export interface CreateCustomerOptions {
  id: string;
  defId: string;
  seat: number;
  minute: number;
  order: Order;
}

export function createCustomer(options: CreateCustomerOptions): Customer {
  const def: CustomerDef = customerDef(options.defId);
  return {
    id: options.id,
    defId: def.id,
    name: def.name,
    seat: options.seat,
    personality: { ...def.personality },
    order: options.order,
    patience: 1,
    bac: 0,
    mood: 0,
    drinksHad: 0,
    phase: 'ordering',
    arrivedAtMinute: options.minute,
    orderedAtMinute: options.minute,
    storyState: {},
    flags: new Set<string>(),
  };
}

/** Game minutes this customer has been waiting on the current order. */
export function waitedMinutes(customer: Customer, minute: number): number {
  return Math.max(0, minute - customer.orderedAtMinute);
}

/** True once they have run out of patience and are getting up to go. */
export function hasGivenUp(customer: Customer): boolean {
  return customer.patience <= 0 && customer.phase !== 'leaving';
}

/** They have had their drink and are on their way out. */
export function startLeaving(customer: Customer, reason: string): void {
  customer.phase = 'leaving';
  customer.flags.add(reason);
}

export function clampMood(mood: number): number {
  return Math.max(-1, Math.min(1, mood));
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Short label for the bubble and the summary. */
export function describe(customer: Customer): string {
  return `${customer.name} (seat ${(customer.seat ?? 0) + 1})`;
}
