// Per-type tint strength for dark-mode card backgrounds.
//
// A flat percentage does not work: at 26% Electric yellow drops headings to
// 4.36:1 and secondary text to 2.59:1, while Dark violet is still nearly
// invisible against the gray. The fix is to normalise by hue luminance —
// each value below is the LARGEST tint that hue can carry while headings
// stay at or above 6.0:1 and secondary text at or above 4.5:1 against
// --surface-card (#20242b). Solved numerically, not chosen by eye, so every
// card lands at a comparable readable darkness and all 18 types pass AA.
//
// Range is 15% (Electric) to 39% (Dark, Dragon, Ghost, Poison).
export const TYPE_TINT_PCT = {
  electric: 15, ice: 18, fire: 20, fairy: 20, bug: 21, ground: 23,
  grass: 24, flying: 24, rock: 24, water: 26, steel: 27, normal: 30,
  psychic: 30, fighting: 37, poison: 39, ghost: 39, dragon: 39, dark: 39
};

export const TYPE_COLOR = {
  grass: '#5dbb63', poison: '#9b5fc0', fire: '#f5a25d', psychic: '#f76d6d',
  flying: '#8fa8dd', ice: '#77cfc8', water: '#5aa9e6', electric: '#f2c94c',
  ground: '#d5a45b', rock: '#b7a878', bug: '#96c04d', ghost: '#7a6bb0',
  dragon: '#6d5fe0', dark: '#5a5566', steel: '#8fa1b3', fairy: '#f19bd0',
  fighting: '#e0674f', normal: '#9099a1'
};

// Badge label colour per hue. Dark ink reads better on the twelve light hues;
// these four are dark enough that white wins (Dark by a wide margin: 7.18:1
// against 2.55:1). Poison's white lands at 4.38:1, so its badge fill is
// lightened slightly rather than shipped just under the line.
export const BADGE_INK = {
  poison: '#ffffff', ghost: '#ffffff', dragon: '#ffffff', dark: '#ffffff'
};
export const BADGE_FILL_OVERRIDE = { poison: '#a76bcb' };

const CARD = '#20242b';

export function tintFor(type, card) {
  const t = String(type || '').toLowerCase();
  const hue = TYPE_COLOR[t];
  if (!hue) return card || CARD;
  return `color-mix(in oklab, ${hue} ${TYPE_TINT_PCT[t]}%, ${card || CARD})`;
}

export function edgeFor(type, card) {
  const t = String(type || '').toLowerCase();
  const hue = TYPE_COLOR[t];
  if (!hue) return 'var(--border-card)';
  // Edge sits a step above the fill so the card still has a defined boundary.
  return `color-mix(in oklab, ${hue} ${Math.min(60, TYPE_TINT_PCT[t] + 18)}%, ${card || CARD})`;
}

export function badgeFor(type) {
  const t = String(type || '').toLowerCase();
  return {
    fill: BADGE_FILL_OVERRIDE[t] || TYPE_COLOR[t] || 'var(--surface-muted)',
    ink: BADGE_INK[t] || '#12151a'
  };
}
