---
title: "Folders in the Rule base are one level, carry only a name and need no Approval while no NSG changes"
author: T3dev
date: 2026-11-10
branch: prototype/console-ui
id: l-036c2ff2
scope: repo
status: active
replaces: l-b0e20522
src: agent
touches:
  - prototypes/console-ui/src/Editor.tsx
  - prototypes/console-ui/src/ObjectPicker.tsx
  - prototypes/console-ui/src/Pages.tsx
  - prototypes/console-ui/src/data.ts
  - prototypes/console-ui/src/i18n.tsx
  - GLOSSARY.md
  - prototypes/console-ui/README.md
---

## Decided
- The map owner asked for Folders in the Rule base, to sort Rules into and to collapse, and decided on 2026-11-10: one level without nesting, a Folder carries only its name, and a Folder edit that changes no Managed NSG needs no Approval.
- It follows from the order of Rules that a Folder is a contiguous run (first match wins), that Rules may stand outside Folders, and that a Folder never reaches the Translation engine. Folder changes are edits in the Change set; a Change set that only organises commits directly and starts no Deployment. Collapsing is a view setting of the person.
- The console prototype is one design in light and dark, which the map owner called clearly better after two rejected passes: colour carries meaning only, flags are words, and the main functions take one click.

## Tried and ruled out
- Folders as free tags: collapsing a group that is not contiguous would hide the real order of the Rules.
- Counting a Rule that joins a Folder at the same position as a move: it would ask for Approval although no NSG changes.
- Treating "any" as outside every Zone in the console: it covers every Zone, so an any Rule lands on every Managed NSG, and the editor has to say so and warn about the cost.

## Watch out
- Import, Rebase and Version storage were designed before Folders existed, so none of them says what happens to a Folder.
- AG Grid: stable identity for option objects and callbacks, no row redraw on a click, no position on a cell class, theme variables set before the grid mounts.

In the code: GLOSSARY.md (Folder); branch prototype/console-ui, prototypes/console-ui/README.md and src (data.ts entries, store.tsx place and logMoves, RuleGrid.tsx FolderHead, Editor.tsx checks).
