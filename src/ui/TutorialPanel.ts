/**
 * The tutorial's voice: one instruction at a time, large enough to read at a
 * glance while your hands are busy.
 *
 * It sits where the HUD would, because during the tutorial there is no clock
 * to show — the instruction *is* the thing to watch.
 */
import type { TutorialView } from '../core/Tutorial';

const VERDICT_WORDS: Record<string, string> = {
  loved: 'They loved it',
  fine: 'They were happy with it',
  poor: 'They drank it, but it was not right',
  rejected: 'They sent it back',
};

export class TutorialPanel {
  readonly root = document.createElement('div');
  private readonly lesson = document.createElement('div');
  private readonly intro = document.createElement('p');
  private readonly instruction = document.createElement('p');
  private readonly progress = document.createElement('div');
  private readonly feedback = document.createElement('div');
  private readonly controls = document.createElement('div');
  private readonly finish = document.createElement('div');
  private lastKey = '';
  private lastFeedbackScore: number | null = null;

  onSkip: (() => void) | null = null;
  onExit: ((startRun: boolean) => void) | null = null;

  constructor() {
    this.root.className = 'tutorial-panel';
    this.root.hidden = true;

    this.lesson.className = 'tutorial-lesson';
    this.intro.className = 'tutorial-intro';
    this.instruction.className = 'tutorial-instruction';
    this.progress.className = 'tutorial-progress';
    this.feedback.className = 'tutorial-feedback';
    this.feedback.hidden = true;

    const skip = document.createElement('button');
    skip.className = 'summary-button ghost small';
    skip.textContent = 'Skip this step';
    skip.addEventListener('click', () => this.onSkip?.());

    const exit = document.createElement('button');
    exit.className = 'summary-button ghost small';
    exit.textContent = 'Leave tutorial';
    exit.addEventListener('click', () => this.onExit?.(false));

    this.controls.className = 'tutorial-controls';
    this.controls.append(skip, exit);

    this.finish.className = 'tutorial-finish';
    this.finish.hidden = true;
    const done = document.createElement('p');
    done.innerHTML =
      '<b>That is the whole bar.</b> Every drink on the menu is made from those four. ' +
      'The recipe book (<b>R</b>) has the amounts — the lines will not be there in a real night.';
    const play = document.createElement('button');
    play.className = 'summary-button';
    play.textContent = 'Start my first week';
    play.addEventListener('click', () => this.onExit?.(true));
    const back = document.createElement('button');
    back.className = 'summary-button ghost';
    back.textContent = 'Back to the title';
    back.addEventListener('click', () => this.onExit?.(false));
    const buttons = document.createElement('div');
    buttons.className = 'summary-buttons';
    buttons.append(play, back);
    this.finish.append(done, buttons);

    this.root.append(
      this.lesson,
      this.intro,
      this.instruction,
      this.progress,
      this.feedback,
      this.controls,
      this.finish,
    );
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(
    view: TutorialView | null,
    lastServe: { verdict: string; line: string; score: number } | null,
  ): void {
    if (!view) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;

    if (view.finished) {
      this.lesson.textContent = 'TUTORIAL COMPLETE';
      this.intro.hidden = true;
      this.instruction.hidden = true;
      this.progress.hidden = true;
      this.controls.hidden = true;
      this.finish.hidden = false;
      this.showFeedback(lastServe);
      return;
    }

    this.intro.hidden = false;
    this.instruction.hidden = false;
    this.progress.hidden = false;
    this.controls.hidden = false;
    this.finish.hidden = true;

    // Only touch the DOM when the step changes, so the text does not flicker.
    const key = `${view.lessonNumber}:${view.stepNumber}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lesson.textContent = `Lesson ${view.lessonNumber} of ${view.lessonCount} — ${view.lessonTitle}`;
      this.intro.textContent = view.intro;
      // Only show the lesson's intro on its first step; after that it is noise.
      this.intro.hidden = view.stepNumber !== 1;
      this.instruction.textContent = view.text;
      this.progress.innerHTML = Array.from(
        { length: view.stepCount },
        (_, i) =>
          `<span class="dot ${i < view.stepNumber - 1 ? 'done' : i === view.stepNumber - 1 ? 'now' : ''}"></span>`,
      ).join('');
      // A fresh step deserves attention; a quick pulse draws the eye to it.
      this.instruction.classList.remove('pulse');
      void this.instruction.offsetWidth;
      this.instruction.classList.add('pulse');
    }

    this.showFeedback(lastServe);
  }

  /** How the last drink went, so every serve teaches something. */
  private showFeedback(lastServe: { verdict: string; line: string; score: number } | null): void {
    if (!lastServe) {
      this.feedback.hidden = true;
      return;
    }
    if (lastServe.score === this.lastFeedbackScore && !this.feedback.hidden) return;
    this.lastFeedbackScore = lastServe.score;
    this.feedback.hidden = false;
    this.feedback.className = `tutorial-feedback ${lastServe.verdict}`;
    this.feedback.innerHTML =
      `<b>${VERDICT_WORDS[lastServe.verdict] ?? lastServe.verdict}</b> — ` +
      `"${lastServe.line}" <span class="score">${lastServe.score}/100</span>`;
  }
}
