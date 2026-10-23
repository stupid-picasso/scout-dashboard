# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Existing codebase. A single-file app source (`Scout Dashboard.dc.html`) with generated bundles (`index.html`, `Scout Dashboard.html`, `Scout Dashboard Standalone.dc.html`), `pokemon-mechanics.js` for game data and math, and a Python extraction pipeline (`pogo_extract.py`) run by GitHub Actions.

## Users
One trainer: the owner of the app. They use it on an iPhone, installed to the home screen as a PWA, usually one-handed and while playing Pokemon GO. It is built for their own roster; no other users are planned.

## Product Purpose
A personal Pokemon GO companion ("Professor" / Scout Dashboard). It turns the trainer's roster into decisions: what to keep, evolve, power up or transfer; how each Pokemon ranks for PvP; what to use in raids and Max Battles. Success is that the roster in the app matches the game and the advice can be trusted.

## Positioning
It is built on the trainer's own data (screen recordings, screenshots, CSV exports) and the game's own data (game master, PvPoke), not a generic lookup. It reads the game passively from the screen; it does not touch the game's servers.

## Operating Context
- Data comes in by importing: server-side extraction of screen recordings and appraisal recordings, in-app screenshot reading, and CSV imports.
- Roster accuracy is maintained with an in-app Bulk update tab (regional forms, missing types) and manual corrections.
- Day-to-day use: opening a Pokemon's detail sheet, checking verdicts and candy, power-up and evolve planning, PvP and raid tabs, rename and search string helpers for the game.

## Capabilities and Constraints
- Top jobs, all confirmed as important: keep or transfer decisions; PvP team and ranking; raids and Max; keeping the roster accurate.
- AI reading uses the Google Gemini free tier only (no paid services, no card). Quota is per model and per key, so features degrade gracefully when a model is overloaded or out of quota.
- Candy is one count per evolution family. A scan or a manual SET writes it; the newest wins.
- A regional form has its own types, base stats, moves and rankings; the form is taken from the types read on screen.
- Terms in use: roster, appraisal, family candy, regional form, XL candy, Great / Ultra / Little League, Max.
- Undecided: size classes (XXS to XXL) and a showcase list are planned, not built. Whether manual candy numbers should lock against later scans is undecided.

## Brand Commitments
Name: "Professor" (shown in the header) / Scout Dashboard. The look follows iOS conventions on a dark theme; this is the established direction in the app today and has not been formalised here.

## Evidence on Hand
- Real roster data: `data/pokemon_import.json` (server import), a QA roster fixture in `scripts/fixtures/`, and QA suites under `scripts/qa/`.
- Game data: `pokemon-mechanics.js` generated from the game master and PvPoke.
- There are no other users, testimonials or usage statistics; do not invent any.

## Product Principles
1. Accuracy over cleverness. A wrong number the trainer trusts is worse than a blank, so show where a number comes from and ask when unsure.
2. One source of truth per fact (family candy, form and type from the screen, level and CP from the scan or the power-up).
3. Never do anything irreversible silently: bulk changes are chosen per Pokemon and can be undone.
4. Built for one hand on a phone in the middle of a game: quick to read, large touch targets, no dense screens.
5. Stay inside the free tier and inside the rules of the game: passive reading only.

## Accessibility & Inclusion
No product-specific requirement established. The app already aims for large touch targets and accessible labels; keep that.
