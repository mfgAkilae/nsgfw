---
title: "At Rebase a placed Rule lands after the nearest surviving Rule above it, inside its own Folder"
author: MfgAkilae
date: 2026-11-10
branch: wayfinder/34-folders
cost: { minutes: 1, tokens: 1839 }
id: l-3510e474
scope: repo
status: active
src: agent
touches:
  - docs/adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md
  - docs/design/translation-engine.md
  - docs/adr/0007-isolated-change-sets-with-optimistic-rebase.md
---

## Decided
- The map owner decided on 2026-11-10 how the tool places every Rule that a Change set inserted or moved when it rebases. Before, nothing said where such a Rule goes once its neighbours have drifted apart or been deleted.
- The Rule lands after the nearest Rule that stood above it in the base Version and still exists. If its Folder still exists, only that Folder's Rules count, and with none left it goes to the top of the Folder. A Rule without a Folder never lands inside a Folder; it goes after that Folder's end. The order check then decides whether the new position conflicts.

## Tried and ruled out
- Following the back neighbour: a Rule added at the end of a Folder would drop out of it when the Folder moves.
- Putting a Rule without a Folder before the Folder instead of after its end.
- A conflict whenever a neighbour is gone or has moved out of the Folder: the earlier review round had already made every change next to a placed Rule rebase cleanly unless a verdict can change.

In the code: docs/adr/0021-folders-are-layout-outside-approval-and-rule-conflicts.md, docs/design/translation-engine.md ("Order conflicts at Rebase"), docs/adr/0007-isolated-change-sets-with-optimistic-rebase.md.
