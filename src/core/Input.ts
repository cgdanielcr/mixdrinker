/**
 * Pointer abstraction (HANDOVER.md §4). One pointer, no hover dependence, so
 * touch stays possible later without redesigning the interaction.
 */
export interface PointerState {
  x: number;
  y: number;
  /** True while the button is down. */
  down: boolean;
  /** Milliseconds the current press has lasted, 0 when not pressed. */
  heldMs: number;
  /** Set for one tick when the button goes down. */
  pressed: boolean;
  /** Set for one tick when the button comes up. */
  released: boolean;
  /** Length of the press that just ended, for tap detection. */
  lastPressMs: number;
  /** Pointer speed in logical px per second, for shake intensity later. */
  speed: number;
}

export class Input {
  readonly pointer: PointerState = {
    x: 0,
    y: 0,
    down: false,
    heldMs: 0,
    pressed: false,
    released: false,
    lastPressMs: 0,
    speed: 0,
  };

  private pendingPressed = false;
  private pendingReleased = false;
  private lastX = 0;
  private lastY = 0;

  /** Maps client coordinates into the fixed logical resolution. */
  private toLogical: (clientX: number, clientY: number) => { x: number; y: number };

  constructor(
    target: HTMLElement,
    toLogical: (clientX: number, clientY: number) => { x: number; y: number },
  ) {
    this.toLogical = toLogical;

    target.addEventListener('pointermove', (e) => this.onMove(e));
    target.addEventListener('pointerdown', (e) => {
      this.onMove(e);
      this.pendingPressed = true;
      target.setPointerCapture?.(e.pointerId);
    });
    target.addEventListener('pointerup', (e) => {
      this.onMove(e);
      this.pendingReleased = true;
    });
    // A pointer that leaves the window must not leave the bottle pouring.
    target.addEventListener('pointercancel', () => {
      this.pendingReleased = true;
    });
    window.addEventListener('blur', () => {
      this.pendingReleased = true;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onMove(e: PointerEvent): void {
    const { x, y } = this.toLogical(e.clientX, e.clientY);
    this.pointer.x = x;
    this.pointer.y = y;
  }

  /** Called once per fixed sim tick, before systems run. */
  update(dtMs: number): void {
    const p = this.pointer;

    p.pressed = false;
    p.released = false;

    if (this.pendingPressed && !p.down) {
      p.down = true;
      p.heldMs = 0;
      p.pressed = true;
    }
    if (this.pendingReleased && p.down) {
      p.down = false;
      p.lastPressMs = p.heldMs;
      p.heldMs = 0;
      p.released = true;
    }
    this.pendingPressed = false;
    this.pendingReleased = false;

    if (p.down) p.heldMs += dtMs;

    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    const instantaneous = Math.hypot(dx, dy) / (dtMs / 1000);
    // Smoothed, because a single jittery frame is not a shake.
    p.speed += (instantaneous - p.speed) * 0.25;
    this.lastX = p.x;
    this.lastY = p.y;
  }
}
