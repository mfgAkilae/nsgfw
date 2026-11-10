---
title: The console is one design in light and dark where colour only carries meaning; the map owner called it clearly better
author: T3dev
date: 2026-11-10
branch: prototype/console-ui
id: l-b1d4c590
scope: repo
status: active
replaces: l-3cfc7f00
src: agent
touches:
  - prototypes/console-ui/README.md
  - prototypes/console-ui/src/ChangeViews.tsx
  - prototypes/console-ui/src/Console.tsx
  - prototypes/console-ui/src/ZoneGrid.tsx
  - prototypes/console-ui/src/app.css
  - prototypes/console-ui/src/i18n.tsx
---

## Decided
- After two rejected passes (Fluent defaults, then the same three shells restyled), one console built from the layout up, in light and dark, was called clearly better by the map owner. Two more passes followed on the same direction.
- Colour carries meaning only (green allow, red deny or blocking, amber pending, iris for interaction). Pills filter, rounded rectangles are objects with a glyph per kind, hatched bands are the locked rows above and below the Rules. Flags are words, not icons.
- Few clicks: filter chips with counts on every page, row buttons and an own context menu, a jump palette on Ctrl K, an overview ruler beside the table, a side panel that shows where a Rule lands in Azure, and a commit bar with the workflow track. The Zone view is a lens on the Rule base. An edit continues the current Change set without asking.
- Type: Atkinson Hyperlegible Next and Mono (OFL, fits ADR 0002).

## Tried and ruled out
- Polishing three shells side by side: three times the work, and the feedback was about quality, not about which shell.
- Opening the side panel on a row click: the table narrows and closes the object picker that a double click just opened.

## Watch out
- Give AG Grid option objects and callbacks a stable identity, and never call redrawRows on a click: both swallow the double click that starts editing.
- Never set position on an AG Grid cell class, and set the theme's CSS variables before the grid mounts.
- Not confirmed yet: the three calls made without asking (one console, implicit Change set, Rule cost outside the table) and the German terms.

In the code: branch prototype/console-ui, prototypes/console-ui/src (theme.tsx, Console.tsx, RuleGrid.tsx, Pages.tsx, app.css); passes in commits 00fa08b, 2513ff4, 680460f, 9d11e1b and the one after.
