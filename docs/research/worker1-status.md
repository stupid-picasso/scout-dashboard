# Worker 1 status (task 1: UI polish)

Done in the final state (see the report and PROJECT_HANDOFF.md "UI polish pass"): tokens, colour, layout fixes, nav change, empty states on Today/Roster/PvP/Recs, sheets with grabbers, scrollers, press rule, hero flattening, motion tokens, UIQ-01..12 checks in suite e.

Not done, or only partly done (be honest in verification):

- #6 prose above cards: 9 long captions now show one sentence plus a "More" disclosure; about 40 other helper paragraphs (Home, Raid, Attackers, Recs) are unchanged. The copy lint only fails when a caption directly under a title is longer than 2 lines.
- #7 "Why:" walls: moved into a "Why this one" disclosure on the Evolve now card; no verdict chip.
- #11 Today order: live events and GBL this week are moved above the other cards with CSS `order`; the long tail is not collapsed.
- #14 Home button/label/link zoo: only the global button heights and the filled-button rule were applied; no StatusLine component, imports are not a list.
- #16 swipe/long-press: still ask first (transfer safety rules); only the label case was changed. No immediate action with Undo toast.
- #19 chip component unification: not done (chips keep their own styles; only heights are guarded).
- #20 sheets: grabber added to chat, import, file and confirm sheets and the detail sheet, top radius 20; no drag-to-dismiss, no title/close row on the chat sheet.
- #23 sentence case: the runtime layer was extended (caps headings followed by detail text) rather than removed; authored caps remain in the source because logic keys and QA locators read them. Allow-list in qa_e2e_e.js names the exceptions.
- #29 count-up once per session: not changed (tabular figures were already global).
- Attribute-selector overrides: the inline-hex light overrides and the 11px floor rule are removed; the card/chip/input overrides remain.
