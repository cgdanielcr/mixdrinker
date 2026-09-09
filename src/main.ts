/**
 * Bootstrap, resize, loop (HANDOVER.md §4).
 *
 * Fixed 1920x1080 logical resolution scaled to fit (§3): the sim always thinks
 * in logical pixels, and only the stage transform knows about the window.
 */
import { Application } from 'pixi.js';
import { LAYOUT } from './tuning';
import { validateData } from './sim/data';
import { fillFraction } from './sim/liquid/Vessel';
import { Game } from './core/Game';
import { Input } from './core/Input';
import { createWorld, itemById } from './core/World';
import { BarScene } from './render/BarScene';
import { Sfx } from './audio/Sfx';
import { DebugPanel } from './ui/DebugPanel';
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
  document.body.append(debug.root);

  // Audio cannot start until the player has interacted with the page.
  app.canvas.addEventListener('pointerdown', () => sfx.resume(), { once: false });
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') sfx.toggleMute();
    if (e.key.toLowerCase() === 'd') debug.toggle();
  });

  if (import.meta.env.DEV) {
    // Dev-only handle, so pour calibration can be measured rather than eyeballed.
    (window as unknown as { __lastcall: unknown }).__lastcall = { world, game, app };
  }

  let smoothedFps = 60;

  app.ticker.add((ticker) => {
    const dtMs = ticker.deltaMS;
    game.advance(dtMs);
    scene.update(world, dtMs / 1000);

    const target = itemById(world, world.pourTargetId);
    sfx.update({
      flow: world.flow,
      fullness: target ? fillFraction(target.vessel) : 0,
      missing: world.missing,
      overflowing: world.overflowing,
    });

    smoothedFps += (ticker.FPS - smoothedFps) * 0.1;
    debug.reportFps(smoothedFps);
    debug.update(world);
  });
}

void main();
