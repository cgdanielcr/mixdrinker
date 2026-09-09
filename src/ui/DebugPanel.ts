/**
 * The Phase 1 debug panel (HANDOVER.md §7): the focused vessel's contents,
 * mixed, dilution and spill, plus "evaluate against [recipe]" printing the
 * full DrinkResult.
 *
 * DOM overlay, because text in canvas is a pain (§1).
 */
import { RECIPE_LIST } from '../sim/data';
import { evaluate } from '../sim/drinks/Evaluate';
import { dilutionRatio } from '../sim/liquid/Mixing';
import { abvOf, blendedColor, fillFraction, liquidMl } from '../sim/liquid/Vessel';
import type { World, WorldItem } from '../core/World';
import { itemById } from '../core/World';

export class DebugPanel {
  readonly root = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly select = document.createElement('select');
  private readonly result = document.createElement('pre');
  private lastFocusId: string | null = null;
  private fps = 60;

  constructor() {
    this.root.className = 'debug-panel';

    const title = document.createElement('h2');
    title.textContent = 'DEBUG';

    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'auto-identify';
    this.select.append(auto);
    for (const recipe of RECIPE_LIST) {
      const option = document.createElement('option');
      option.value = recipe.id;
      option.textContent = recipe.name;
      this.select.append(option);
    }

    const label = document.createElement('label');
    label.textContent = 'Evaluate against: ';
    label.append(this.select);

    this.body.className = 'debug-body';
    this.result.className = 'debug-result';

    const help = document.createElement('p');
    help.className = 'debug-help';
    help.innerHTML =
      'Click a bottle or glass to <b>pick it up</b>. Then <b>tap</b> to put it down, or ' +
      '<b>press and hold</b> over a glass to pour. <b>M</b> mutes, <b>D</b> hides this.';

    this.root.append(title, help, this.body, label, this.result);
  }

  reportFps(fps: number): void {
    this.fps = fps;
  }

  /** The panel covers part of the bar; D gets it out of the way. */
  toggle(): boolean {
    this.root.classList.toggle('collapsed');
    return this.root.classList.contains('collapsed');
  }

  /** The vessel worth looking at: what you are holding, else what you last filled. */
  private focus(world: World): WorldItem | null {
    const held = itemById(world, world.heldId);
    if (held && held.kind === 'glass') {
      this.lastFocusId = held.id;
      return held;
    }
    if (world.pourTargetId) {
      this.lastFocusId = world.pourTargetId;
      return itemById(world, world.pourTargetId);
    }
    const remembered = itemById(world, this.lastFocusId);
    if (remembered) return remembered;
    return held ?? world.items.find((i) => i.kind === 'glass') ?? null;
  }

  update(world: World): void {
    const held = itemById(world, world.heldId);
    const item = this.focus(world);

    const lines: string[] = [
      row('fps', this.fps.toFixed(0)),
      row('holding', held ? held.label : '—'),
      row('tilt', world.tilt.toFixed(2)),
      row('flow', `${world.flow.toFixed(1)} ml/s`),
      row(
        'stream',
        world.missing
          ? 'MISSING'
          : world.overflowing
            ? 'OVERFLOW'
            : world.flow > 0
              ? 'in glass'
              : '—',
      ),
    ];

    if (item) {
      const v = item.vessel;
      lines.push(
        '<hr>',
        row('vessel', `${item.label} (${v.glassType ?? v.kind})`),
        row('volume', `${liquidMl(v).toFixed(1)} / ${v.capacityMl} ml`),
        row('fill', `${(fillFraction(v) * 100).toFixed(0)}%`),
        row('mixed', v.mixed.toFixed(2)),
        row('dilution', `${v.dilutionMl.toFixed(1)} ml (${(dilutionRatio(v) * 100).toFixed(0)}%)`),
        row('ice', v.ice.toFixed(1)),
        row('temp', `${v.chilledC.toFixed(1)} °C`),
        row('abv', `${(abvOf(v) * 100).toFixed(1)}%`),
        row('spilled', `${item.drinkSpillMl.toFixed(1)} ml`),
        row('build', `${item.buildTimeSec.toFixed(1)} s`),
        row('colour', `<span class="swatch" style="background:${blendedColor(v)}"></span>`),
        '<hr>',
        '<b>contents</b>',
      );

      const entries = Object.entries(v.contents).sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) lines.push('<i>empty</i>');
      for (const [id, ml] of entries) lines.push(row(id, `${ml.toFixed(1)} ml`));

      const choice = this.select.value;
      const drink = evaluate(v, choice === '' ? undefined : choice, {
        timeSec: item.buildTimeSec,
        spilledMl: item.drinkSpillMl,
      });
      this.result.textContent = JSON.stringify(drink, null, 2);
    } else {
      this.result.textContent = '';
    }

    this.body.innerHTML = lines.join('');
  }
}

function row(key: string, value: string): string {
  return `<div class="debug-row"><span>${key}</span><span>${value}</span></div>`;
}
