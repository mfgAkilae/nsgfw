---
title: "The console is one design in light and dark where colour only carries meaning, after two weaker passes were rejected"
author: T3dev
date: 2026-11-10
branch: prototype/console-ui
id: l-3cfc7f00
scope: repo
status: active
replaces: l-458f26c9
src: agent
touches:
  - prototypes/console-ui/README.md
  - prototypes/console-ui/package.json
  - prototypes/console-ui/pnpm-lock.yaml
  - prototypes/console-ui/src/ChangeViews.tsx
  - prototypes/console-ui/src/ObjectPicker.tsx
  - prototypes/console-ui/src/RuleGrid.tsx
  - prototypes/console-ui/src/ZoneGrid.tsx
  - prototypes/console-ui/src/app.css
  - prototypes/console-ui/src/bits.tsx
  - prototypes/console-ui/src/data.ts
---

## Decided
- The map owner rejected the console prototype twice for its look: first Fluent UI defaults, then the same three shells with new colours. The third pass replaces the three shells with one console, built from the layout up, in light and dark.
- Colour carries meaning only: green allow, red deny or blocking, amber pending, iris for interaction. A coloured left edge on every row shows the action. Pills filter, rounded rectangles are objects with a glyph per kind, hatched bands are the locked rows above and below the Rules.
- Few clicks: filter chips with counts, row buttons on hover, a jump palette on Ctrl K, a side panel that shows one Rule and what it becomes in Azure, and a commit bar that shows what the pending edits mean and submits in one click. The Zone view is a lens on the Rule base, not its own screen. An edit continues the current Change set without asking.
- Type: Atkinson Hyperlegible Next and Mono (OFL, fits ADR 0002), because the family keeps look-alike characters apart in a console full of addresses.

## Tried and ruled out
- Fluent defaults, and a restyle of the same layout: both read as a generic admin table.
- Three shells side by side: polishing three to this level costs three times the work, and the feedback was about quality, not about which shell.
- Opening the side panel on a row click: the table narrows, and the object picker that a double click had just opened closes again. A row button opens it instead.

## Watch out
- Give AG Grid option objects and callbacks a stable identity. A re-render with new ones, or a redrawRows, between two clicks swallows the double click that starts editing.
- Never set position on an AG Grid cell class: one relative cell pushes the other cells of the row down, where the next row hides them.
- Set the CSS variables of the theme before the grid mounts, and give border parameters an explicit style and width.
- The map owner has not confirmed this pass yet, nor the German terms.

In the code: branch prototype/console-ui, prototypes/console-ui/src/theme.tsx (palettes, Fluent themes), Console.tsx (shell, commit bar, inspector, palette), RuleGrid.tsx (opts memo, Toks fit), app.css; the three shells are in commits 00fa08b and 2513ff4.
