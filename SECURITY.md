# Security

## Reporting a problem

Please report privately, not in a public issue. Use GitHub's "Report a vulnerability" button on the Security tab of this
repository, or write to `<SECURITY CONTACT ADDRESS: the owner fills this in>`. Do not include real account data, keys or tokens
in the report. You will get an answer within a reasonable time; this is a hobby project with one maintainer.

## Supported version

Only the latest build published on GitHub Pages (the `main` branch). There are no maintained older versions.

## How keys are handled

* Gemini keys and an optional GitHub token are stored in the browser's `localStorage` on the device (key `scout.secrets.v1`) and
  never written to Firestore, to a backup file, or to a snapshot. An older build could upload them; the app deletes those copies
  on its next save and does not read them back.
* The Gemini key is sent only to `generativelanguage.googleapis.com`, in the `x-goog-api-key` header, never in a URL.
* The custom "proxy endpoint" setting is removed from the public build (see the CSP section).
* Anything in `localStorage` can be read by script running on the same origin. That is why the app has no `innerHTML`, `eval`
  in its own code and why a CSP is present (below). Use a key restricted in Google AI Studio and revoke it if you doubt it.
* The Firebase web `apiKey` in the source is public by design. Restrict it to the app's domain in the Google Cloud console.

## Content-Security-Policy

`index.html` carries a CSP as a `<meta>` tag, injected by `scripts/build_index.js` (never edit it by hand). The same tag is set
by that script in the other pages served on the same origin (`Scout Dashboard.html`, `Scout Dashboard Standalone.dc.html`,
`Scout Dashboard.dc.html`), because they share the origin and its `localStorage`. GitHub Pages cannot send headers, so
`frame-ancestors` and report-only mode are not available.

What it does: scripts load only from this origin, `blob:` (the unpacked page), `unpkg.com` (React, with SRI), `www.gstatic.com`
(Firebase, with SRI) and `apis.google.com` (sign-in popups); the page may connect only to this origin and `*.googleapis.com`,
`raw.githubusercontent.com`, `api.github.com`; no plug-ins (`object-src 'none'`), no `<base>` tricks, forms post only to this
origin. A script tag or request to any other host is blocked, which limits where stolen data could be sent.

What it does not do: **`'unsafe-inline'` and `'unsafe-eval'` are required.** The runtime compiles the component with
`new Function` (`support.js`) and the page unpacks itself with inline bootstrap scripts. So the CSP does **not** stop injected
inline script; the protection against that is the code rule (no `innerHTML`, `document.write`, `eval(`; enforced by
`scripts/test_no_dangerous_sinks.js` and an XSS import test). What would remove the limitation: precompile the component at build
time (drops `unsafe-eval`), move the bootstrap into hashed or nonce'd scripts (drops `unsafe-inline`), and host where real
headers can be set (then add `frame-ancestors` and a report endpoint).

`scripts/test_csp.js` serves the built page over `http://localhost` and loads it in Chromium and WebKit, and fails on any
violation through launch, CSV import, the detail sheet and the chat sheet, and unless a request to `https://example.com` is blocked.

## Subresource Integrity for the Firebase SDK

The three Firebase files (version 10.12.2) are loaded with `integrity` and `crossorigin="anonymous"`. Google does not publish
these hashes; they were computed from the files fetched on 2026-11-17 (two fetches gave identical bytes):

| File | sha384 |
|---|---|
| `firebase-app-compat.js` | `AQ3POAMqIhwS81FrUH95ekxqBZHeP5tG2JfEL3+7GuTtfRLWnrRh32UxwzM+//A9` |
| `firebase-auth-compat.js` | `TnlRYaR4JYz/lpaGuaiU61PjNberSA4vjLjtF+oRC/IkohkJqnWxw5EmDSOt1vA1` |
| `firebase-firestore-compat.js` | `qn4Jh88HhJA8dplNQyGjOh9OGI4izVhrfj/qIFgaKcdgOE06pXqIKGlsCILZcLAC` |

Recompute (or verify) with: `SRI_VERIFY=1 node scripts/test_sri.js`, or by hand:
`curl -s https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js | openssl dgst -sha384 -binary | openssl base64 -A`.
To upgrade the SDK, change the version in `loadFirebaseSdk()`, recompute all three, and run the QA suites. The QA harness serves
stand-in scripts, so it records the integrity value the app asks for and then drops it (see `scripts/qa/qa_lib.js`).

## CI

Every workflow has a `permissions:` block (read by default, write only on the jobs that commit), untrusted values such as
workflow inputs reach shell steps only through `env:`, and there is no `pull_request_target` or `workflow_run`.
`scripts/test_workflows.py` enforces this.
