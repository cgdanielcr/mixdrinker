/**
 * Bootstrap, resize, loop (HANDOVER.md §4).
 *
 * Fixed 1920x1080 logical resolution scaled to fit (§3): the sim always thinks
 * in logical pixels, and only the stage transform knows about the window.
 */
import { Application } from 'pixi.js';
import { LAYOUT } from './tuning';
import { validateData } from './sim/data';
import { discard, fillFraction } from './sim/liquid/Vessel';
import { Game } from './core/Game';
import { Input } from './core/Input';
import { createWorld, itemById } from './core/World';
import { BarScene } from './render/BarScene';
import { Sfx } from './audio/Sfx';
import { DebugPanel } from './ui/DebugPanel';
import { RecipeBook } from './ui/RecipeBook';
import { Hud } from './ui/Hud';
import { NightSummary } from './ui/NightSummary';
import { createNight } from './core/Night';
import { bar } from './sim/data';
import { randomSeed } from './sim/run/Rng';
import './style.css';

async function main(): Promise<void> {
  // A bad data edit should fail loudly at startup, not silently mis-score a drink.
  validateData();

  const app = new Application();
  await app.init({
    background: 0x0b0e11,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    resizeTo: window,
    preference: 'webgl',
  });

  const mount = document.getElementById('app');
  if (!mount) throw new Error('#app is missing from index.html');
  mount.append(app.canvas);

  const world = createWorld();
  const scene = new BarScene(world);
  app.stage.addChild(scene.stage);

  // Letterboxed scale-to-fit. Also the mapping Input needs to go the other way.
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  const layout = (): void => {
    // app.screen is already in logical (CSS) pixels, which is the same space
    // Input maps into via getBoundingClientRect.
    const w = app.screen.width;
    const h = app.screen.height;
    scale = Math.min(w / LAYOUT.WIDTH, h / LAYOUT.HEIGHT);
    offsetX = (w - LAYOUT.WIDTH * scale) / 2;
    offsetY = (h - LAYOUT.HEIGHT * scale) / 2;
    scene.stage.scale.set(scale);
    scene.stage.position.set(offsetX, offsetY);
  };
  layout();
  app.renderer.on('resize', layout);

  const input = new Input(app.canvas, (clientX, clientY) => {
    const rect = app.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  });

  const game = new Game(world, input);
  const sfx = new Sfx();
  const debug = new DebugPanel();
  const book = new RecipeBook();
  const hud = new Hud();
  const summary = new NightSummary();
  document.body.append(book.root, hud.root, summary.root, debug.root);

  // A seed in the URL replays a night exactly (§12: shareable, and free).
  const dive = bar('dive');
  const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
  let seed = Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed >>> 0 : randomSeed();

  const beginNight = (sameSeed: boolean): void => {
    if (!sameSeed) seed = randomSeed();
    for (const item of world.items) {
      discard(item.vessel);
      item.x = item.homeX;
      item.y = item.homeY;
      item.drinkSpillMl = 0;
      item.buildTimeSec = 0;
      if (item.ingredientId) item.vessel.contents[item.ingredientId] = 700;
    }
    world.heldId = null;
    world.tilt = 0;
    world.puddles.length = 0;
    world.bookOpen = false;
    game.startNight(createNight(seed, dive, 1));
  };
  summary.onReplay = beginNight;
  beginNight(true);

  // Audio cannot start until the player has interacted with the page.
  app.canvas.addEventListener('pointerdown', () => sfx.resume(), { once: false });
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'm') sfx.toggleMute();
    if (key === 'd') debug.toggle();
    if (key === 'r') world.bookOpen = !world.bookOpen;
    if (key === 'escape') world.bookOpen = false;
  });

  if (import.meta.env.DEV) {
    // Dev-only handle, so pour calibration can be measured rather than eyeballed.
    (window as unknown as { __lastcall: unknown }).__lastcall = { world, game, app };
  }

  let smoothedFps = 60;

  app.ticker.add((ticker) => {
    const dtMs = ticker.deltaMS;
    game.advance(dtMs);
    scene.update(world, game.night, dtMs / 1000);

    const target = itemById(world, world.pourTargetId);
    sfx.update({
      flow: world.flow,
      fullness: target ? fillFraction(target.vessel) : 0,
      missing: world.missing,
      overflowing: world.overflowing,
    });
    sfx.updateShake(world.shakeIntensity);

    // One-shot feedback the sim raised this frame.
    for (const event of game.drainEvents()) {
      switch (event.type) {
        case 'ice':
          sfx.clink();
          break;
        case 'jiggerStop':
          sfx.tick();
          break;
        case 'rimmed':
          sfx.crunch();
          break;
        case 'garnished':
          sfx.thud();
          break;
        case 'discarded':
          sfx.drain();
          break;
        case 'rejected':
          sfx.reject();
          break;
        case 'served':
          if (event.verdict === 'rejected') sfx.sentBack();
          else sfx.accepted(event.verdict === 'loved');
          break;
        case 'nightOver':
          sfx.bell();
          break;
        default:
          break;
      }
    }

    book.setOpen(world.bookOpen);
    hud.update(game.clock, game.night);
    summary.update(game.night);

    smoothedFps += (ticker.FPS - smoothedFps) * 0.1;
    debug.reportFps(smoothedFps);
    debug.update(world);
  });
}

void main();
