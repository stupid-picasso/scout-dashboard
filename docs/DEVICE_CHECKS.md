# Real-device checks (iPhone)

## A. Add to Home Screen (3 min)
1. Open the app URL in **Safari** (not Chrome/in-app browser).
2. Tap **Share** (square + arrow, bottom bar) -> **Add to Home Screen**.
3. Name it **Professor** -> **Add**.
4. Open from the Home Screen icon. Check:
   - No Safari address bar (standalone).
   - Status bar and top edge look right (notch/Dynamic Island not overlapped).
   - Icon looks sharp, not cropped.
5. Turn on **Airplane mode**, kill the app (swipe up), reopen. Roster still shows; "OFFLINE" banner appears.
6. Turn Airplane mode off; app recovers.
Report: anything cropped, blank, or a version number differing from Home -> About.

## B. VoiceOver (10 min)
Enable: Settings -> Accessibility -> VoiceOver (or triple-click side button if set up).
Gestures: swipe right/left = next/prev item; double-tap = activate; two-finger swipe up = read all; three-finger swipe = scroll.
1. Open app. Swipe right through the header: expect "Professor, heading", "Import", "Export", mic button, each with a name.
2. Swipe to the bottom bar: expect "Today, tab, selected", "Roster", "PvP", "Raid", "More". Double-tap More: sheet opens, focus lands inside; "Close" is reachable.
3. Roster: swipe through one row. Expect name, CP, verdict read as one sentence. Double-tap opens detail. Swipe to find "Close"; double-tap closes and focus returns to the row.
4. Detail sheet: every control has a spoken name (no "button" alone, no "unlabelled").
5. Import: Import button announces; after choosing a CSV, the confirm dialog is announced and "Replace"/"Cancel" are reachable.
6. Settings -> Display & Brightness -> Text Size: set to the largest. Reopen app: nothing clipped, still scrolls.
Report: any element read as just "button", any silent element, any trap you cannot leave.
