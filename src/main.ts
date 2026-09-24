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
import { RecipeBook } from './ui/RecipeBook';
import { Hud } from './ui/Hud';
import { NightSummary } from './ui/NightSummary';
import { RunController } from './core/RunController';
import { RunSummaryScreen, ShopScreen, TitleScreen } from './ui/Screens';
import { TutorialPanel } from './ui/TutorialPanel';
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
  const title = new TitleScreen();
  const shop = new ShopScreen();
  const runOver = new RunSummaryScreen();
  const tutorialPanel = new TutorialPanel();
  document.body.append(
    book.root,
    hud.root,
    tutorialPanel.root,
    summary.root,
    title.root,
    shop.root,
    runOver.root,
    debug.root,
  );

  const controller = new RunController(game, world);

  // A seed in the URL starts the week on it (§12: shareable, and free).
  // `?night=3` jumps straight to a night, for playtesting its pacing.
  const params = new URLSearchParams(location.search);
  const urlSeed = Number(params.get('seed'));
  const seedFromUrl = Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed >>> 0 : null;
  const urlNight = Number(params.get('night'));
  const nightFromUrl = Number.isFinite(urlNight) && urlNight >= 1 ? Math.floor(urlNight) : 1;

  /** Show exactly the screen the current phase calls for. */
  const showPhase = (): void => {
    title.hide();
    shop.hide();
    runOver.hide();

    switch (controller.phase) {
      case 'title':
        title.show(controller.meta, controller.hasSavedRun());
        break;
      case 'shop':
        if (controller.run) shop.show(controller.run);
        break;
      case 'runOver':
        if (controller.run) runOver.show(controller.run);
        break;
      default:
        break;
    }
  };

  title.onStart = (seed) => {
    controller.startRun(seed, nightFromUrl);
    showPhase();
  };
  title.onTutorial = () => {
    controller.startTutorial();
    showPhase();
  };
  tutorialPanel.onSkip = () => controller.skipTutorialStep();
  tutorialPanel.onExit = (startRun) => {
    controller.endTutorial(startRun);
    showPhase();
  };
  title.onContinue = () => {
    if (controller.continueRun()) showPhase();
  };
  shop.onBuy = (what) => controller.buy(what);
  shop.onNext = () => {
    controller.beginNight();
    showPhase();
  };
  runOver.onRestart = () => {
    controller.toTitle();
    showPhase();
  };
  summary.onContinue = () => {
    controller.afterNightSummary();
    showPhase();
  };

  if (seedFromUrl !== null || nightFromUrl > 1) {
    controller.startRun(seedFromUrl, nightFromUrl);
  }
  showPhase();

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
    (window as unknown as { __lastcall: unknown }).__lastcall = {
      world,
      game,
      app,
      controller,
      showPhase,
    };
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
          if (controller.phase === 'tutorial') {
            controller.noteTutorialServe(event.verdict, event.line, event.score);
          }
          break;
        case 'cutOff':
          if (event.justified) sfx.accepted(false);
          else sfx.sentBack();
          break;
        case 'nightOver':
          sfx.bell();
          // Settle the week's books once, the moment the doors close.
          controller.finishNight();
          showPhase();
          break;
        default:
          break;
      }
    }

    book.setOpen(world.bookOpen);
    if (controller.phase === 'tutorial') {
      tutorialPanel.update(controller.updateTutorial(), controller.lastTutorialServe);
      hud.update(game.clock, null, null);
    } else {
      tutorialPanel.hide();
      hud.update(game.clock, game.night, controller.run);
    }
    summary.update(controller.phase === 'nightOver' ? game.night : null, controller.lastTotals);

    smoothedFps += (ticker.FPS - smoothedFps) * 0.1;
    debug.reportFps(smoothedFps);
    debug.update(world);
  });
}

void main();
