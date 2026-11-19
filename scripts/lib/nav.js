// The app's navigation as the tests see it, in one place. Each entry: the label the person sees (the tab bar's visible text, or the
// More-menu row's aria-label) and the state.tab value the app switches to. When a label or tab key changes in
// "Scout Dashboard.dc.html" (barDefs / moreDefs), change it here; go() waits for the tab key, so a stale entry fails loudly.
const BAR = {
  TODAY: { label: 'Today', tab: 'today' },
  ROSTER: { label: 'Roster', tab: 'roster' },
  PVP: { label: 'PvP', tab: 'pvp' },
  RECS: { label: 'Recs', tab: 'recommend' }
};
const MORE_BUTTON = 'More';
const MORE = {
  HOME: { label: 'Settings', tab: 'home' },
  RAID: { label: 'Raid counters', tab: 'raid' },
  BULK: { label: 'Bulk update', tab: 'bulk' },
  INTEL: { label: 'Collection intel', tab: 'intel' },
  ATTACK: { label: 'Attackers', tab: 'attackers' },
  LOG: { label: 'Progress log', tab: 'progress' },
  TOOLS: { label: 'Rename & search', tab: 'tools' },
  BESTIV: { label: 'Best IV', tab: 'bestiv' },
  DITTO: { label: 'Ditto ranking', tab: 'dittorank' },
  KEEP: { label: 'Keeper review', tab: 'keepreview' }
};
// The nine screens the per-screen suites (accessibility, UI quality, smoke) walk.
const SCREENS = ['TODAY', 'ROSTER', 'PVP', 'RAID', 'HOME', 'RECS', 'INTEL', 'ATTACK', 'LOG'];

module.exports = { BAR, MORE, MORE_BUTTON, SCREENS };
