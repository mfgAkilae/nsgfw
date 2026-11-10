---
title: "The console needs its own visual design, because stock Fluent UI looked too weak to the map owner"
author: T3dev
date: 2026-11-10
branch: prototype/console-ui
id: l-458f26c9
scope: repo
status: active
src: agent
touches:
  - prototypes/console-ui/src/theme.ts
---

## Decided
- The map owner rejected the first console prototype, which used Fluent UI v9 defaults, as too weak ("Das Design muss signifikant besser werden"). The second pass keeps Fluent components but gives the console its own identity, the "rule ledger": colour only for meaning (allow and deny edge on every row, change markers, amber for edited cells), cobalt only for interaction, quiet object tokens with a glyph per kind, locked boundary bands for system rows, one dark header, hairline lists instead of cards.
- One type family, Recursive (OFL, fits ADR 0002): sans style for the interface, mono style for addresses, Rule IDs and NSG names.

## Tried and ruled out
- Fluent defaults with pastel chips per object kind: seven colours in one row read as noise, and greyed italic system rows looked like disabled Rules.

## Watch out
- Fluent's default font stack starts with Segoe UI, which Linux and the container do not have; the browser falls back to DejaVu Sans and the console looks crude. Ship a web font.
- Fluent TabList and Dropdown assume a light surface; on a dark header the selected tab and the dropdown text become unreadable. Use own header controls there.
- The map owner has not chosen a variant yet; this records the visual direction only.

In the code: branch prototype/console-ui, prototypes/console-ui/src/theme.ts (tokens and Fluent brand ramp), src/app.css, src/Glyph.tsx; font package @fontsource-variable/recursive 5.3.0 (full.css for the MONO axis).
