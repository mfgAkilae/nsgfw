---
title: "The Rule base gets Folders, one level and contiguous, and the console is one design in light and dark"
author: T3dev
date: 2026-11-10
branch: prototype/console-ui
id: l-b0e20522
scope: repo
status: active
replaces: l-b1d4c590
src: agent
touches:
  - prototypes/console-ui/README.md
  - prototypes/console-ui/src/ChangeViews.tsx
  - prototypes/console-ui/src/Console.tsx
  - prototypes/console-ui/src/app.css
  - prototypes/console-ui/src/i18n.tsx
---

## Decided
- The map owner asked for Folders in the Rule base, to sort Rules into and to collapse. The brief does not know them. The prototype assumes: a Folder is a named, contiguous run of Rules (contiguous because first match wins), one level deep, Rules may stand outside Folders, a Folder only organises and the Translation engine never sees it, Folder changes are edits in the Change set, and collapsing is a view setting of the person.
- The console is one design in light and dark (the map owner called it clearly better after two rejected passes). Colour carries meaning only, flags are words, and the main functions take one click: filter chips, row buttons, own context menu, jump palette, overview ruler, a Rule editor in the side panel, a commit bar with the workflow track, and a wide Review before Submit.
- Shaping a new Rule counts as one edit, and repeated edits of one field fold into one.

## Tried and ruled out
- Folders as free tags: collapsing a group that is not contiguous would hide the real order of the Rules.
- Three shells side by side, and opening the side panel on a row click (it closes the object picker a double click just opened).

## Watch out
- Not decided yet for Folders: nesting, whether a Folder carries more than a name, whether Folder edits that change no NSG need Approval, where imported Rules land, and how a Rebase treats two people who move the same Folder. This needs its own design ticket and a glossary term before the data model.
- AG Grid: give option objects and callbacks a stable identity and never redraw rows on a click (both swallow the double click that starts editing); never set position on a cell class; set the theme's CSS variables before the grid mounts.
- Not confirmed yet: the German terms.

In the code: branch prototype/console-ui, prototypes/console-ui/src (data.ts entries, store.tsx place and relocate, RuleGrid.tsx display and FolderHead, Editor.tsx, Review.tsx, Pages.tsx, theme.tsx, app.css) and its README.
