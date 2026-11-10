---
title: "Extra Change sets in the console prototype run on their own store seeded one call per render, and must never call the store's discard"
author: MfgAkilae
date: 2026-11-10
branch: prototype/console-ui-36
id: l-c28ae3d8
scope: repo
status: active
src: agent
touches:
  - prototypes/console-ui/src/Decide.tsx
---

## Decided
- A Change set opened beside the current one (approver's view, Revert, Restore, a rejected Change set, the Re-translation) gets its own store instance, provided through the store context, and is seeded through the normal store API: one call per render, because the API functions close over the state of the last render and a second call in the same tick sees stale Rules.
- Approvals reset on every edit except a Folder edit (ADR 0007, ADR 0021), in one helper that every edit path calls, Zone and Object edits included.
- The published copy is built with VITE_PROTOTYPE_BAR=1, or the prototype controls (the flask) disappear from the build.

## Tried and ruled out
- Seeding several edits in one effect: the second call works on the Rules from before the first.
- discard() inside a side Change set: it also runs the global discard hooks of the Zone and Object edits (issue 35) and wipes the current Change set's state. Side Change sets reset their own store through rebaseOnto instead.

## Watch out
- The artifact page must not carry its own html skeleton, and history.replaceState needs a guard there, because the console writes ?theme into the URL.
- Fluent UI v9 class names are hashed: browser tests select by role and name or by own classes, never by fui-Button modifiers.

In the code: prototypes/console-ui/src/Decide.tsx (ChangeSetScreen, specFor, RevertChoice), store.tsx (reopen, rebaseOnto, useStoreValue and Ctx exported), Commit.tsx (CsButtons discard), flow.tsx. Build: VITE_PROTOTYPE_BAR=1 vite build --outDir <dir>.
