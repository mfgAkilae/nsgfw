---
title: "Console prototype styles in a feature stylesheet need higher specificity than app.css, and the published copy only takes #names"
author: MfgAkilae
date: 2026-11-10
branch: prototype/console-ui-35
id: l-3e8b8b22
scope: repo
status: active
src: agent
touches:
  - prototypes/console-ui/src/zone.css
---

## Decided
- New console views keep their CSS in their own file (zone.css for issue 35) so parallel sessions do not collide in app.css.
- The published Artifact copy of the prototype is opened with #names (#zone-flows, #objects, #onboard); the viewer passes no query string.

## Watch out
- app.css is imported after the feature stylesheets, so a rule in zone.css with the same specificity as an app.css rule loses. The band layout broke this way (headers centered) until the selector became `.band.band`.
- Files in the worktree are CRLF (core.autocrlf=true); scripted replacements must match \r\n.

In the code: prototypes/console-ui/src/zone.css (.band.band), Console.tsx (HASH map next to the ?zone= deep links), vite build with base './' publishes as-is.
