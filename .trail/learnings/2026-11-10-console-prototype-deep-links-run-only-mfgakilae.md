---
title: "Console prototype deep links run only on a full page load, so a hash change alone shows the old view"
author: MfgAkilae
date: 2026-11-10
branch: prototype/console-ui-37
id: l-b7288808
scope: repo
status: active
src: agent
touches:
  - prototypes/console-ui/src/Console.tsx
---

## Decided
- The console prototype reads its #names and query parameters once, when Console mounts. Screenshot runs and manual checks that jump between deep links must force a reload, for example with a different query string per view (?r=2#deployment-running).
- Issue 37 split the prototype work into parallel lanes: the main session first wrote stub files with the final exports and wired them into the shared files, then each lane filled only its own files. Navigation between the new views goes through a small event bus, so lanes never touch Console.tsx.

## Tried and ruled out
- Navigating headless Chrome from ?theme=light#deployments to ?theme=light#deployment-running: same document, no reload, the screenshot shows the previous page.

## Watch out
- Version numbers in the mock history are shared by issues 36 and 37. Issue 37 added Versions 1289 and 1290 and moved issue 36's numbers up by two (latest 1290, kim's conflicting Commit 1291). A new mock Version must keep the literals in flow, inbox, pages, store, Decide, Rebase and the German dictionaries in step.

In the code: prototypes/console-ui/src/Console.tsx (HASH map and the mount effect, navBus listener), src/ops37.ts (go37, useOps), src/versions36.ts (1289, 1290), data.ts versions.latest.
