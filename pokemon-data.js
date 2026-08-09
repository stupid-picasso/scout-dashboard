// Seeded roster is intentionally EMPTY. The roster is built entirely from what
// you import — the handful of sample Pokemon that used to live here showed up
// before sign-in and polluted a fresh import with records that were never
// yours. Do not re-add fixtures: an empty array is the correct default.
const POKEMON_DATA = [];
if (typeof window !== 'undefined') { window.POKEMON_DATA = POKEMON_DATA; window.dispatchEvent(new Event('scout-data-ready')); }
