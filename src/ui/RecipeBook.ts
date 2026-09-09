/**
 * The recipe book (HANDOVER.md §1, §6).
 *
 * A physical book on the bar that costs time and attention to open: it covers
 * roughly 40% of the screen and **the game keeps running behind it**. That is
 * the whole design — memorising recipes has to be worth something, so reading
 * one has to cost you something.
 */
import { RECIPE_LIST } from '../sim/data';
import { ingredient } from '../sim/data';
import type { Recipe } from '../sim/types';

const METHOD_HINT: Record<Recipe['method'], string> = {
  shake: 'Shake hard with ice, then strain',
  stir: 'Stir with ice, then strain',
  build: 'Build in the glass, do not shake',
};

export class RecipeBook {
  readonly root = document.createElement('div');

  constructor() {
    this.root.className = 'recipe-book';
    this.root.hidden = true;

    const header = document.createElement('div');
    header.className = 'book-header';
    header.innerHTML = '<h2>THE BOOK</h2><span>the night does not stop for this</span>';

    const pages = document.createElement('div');
    pages.className = 'book-pages';
    for (const recipe of RECIPE_LIST) pages.append(this.page(recipe));

    this.root.append(header, pages);
  }

  private page(recipe: Recipe): HTMLElement {
    const page = document.createElement('article');

    const lines = recipe.ingredients
      .map((i) => `<li><b>${i.ml}ml</b> ${ingredient(i.id).name}</li>`)
      .join('');

    const notes: string[] = [METHOD_HINT[recipe.method]];
    if (recipe.rim) notes.push(`${recipe.rim} rim`);
    if (recipe.garnish?.length) notes.push(recipe.garnish.join(', ').replace(/_/g, ' '));
    notes.push(recipe.serveWithIce ? 'serve over ice' : 'serve straight up');

    page.innerHTML = `
      <h3>${recipe.name}</h3>
      <p class="glass">${recipe.glass} glass</p>
      <ul>${lines}</ul>
      <p class="notes">${notes.join(' · ')}</p>`;
    return page;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
  }
}
