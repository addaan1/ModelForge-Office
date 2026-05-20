---
name: kaggle-war-room-3d-builder
description: Use when building, improving, debugging, or visually QA-ing the Kaggle War Room Three.js first-person 3D office. Enforces modern-office prop placement, collision safety, signage orientation, NPC/lift/game visual checks, Playwright screenshot QA, and performance guardrails before claiming completion.
---

# Kaggle War Room 3D Builder

Use this skill for any Kaggle War Room request involving Three.js, 3D office layout, props, collision, lift, NPCs, signage, lighting, floor design, arcade games, first-person controls, or visual QA.

## Required Workflow

1. State the intended visual/interaction goal in one sentence.
2. Inspect the relevant files before editing:
   - `js/world.js` for scene, props, collision, animation, NPC/lift logic.
   - `js/config.js` for rooms, agents, interactables.
   - `js/app.js` for interaction handlers and state.
   - `css/style.css` and `index.html` for overlays/panels.
3. Keep edits scoped. Prefer reusable prop helpers in `world.js` over one-off geometry scattered in room cases.
4. Before final response, run:
   - `node --check js/world.js js/app.js js/config.js js/audio.js js/advisors.js`
   - `npm test`
   - `npm run qa:visual`
5. Inspect generated screenshots from `qa-artifacts/` with image viewing before claiming visual quality.

## 3D Quality Rules

- Treat the office like a real walkable workplace: every room needs a clear entrance, a clear main path, and furniture that faces the likely user approach.
- Small decorative props must be non-blocking. Collision is only for walls, large desks, counters, conference tables, server racks, and deliberate barriers.
- Signage must be physical, small, aligned to walls/doors, and readable from the direction the player approaches. Avoid floating labels for room identity.
- Workstations: chair faces monitor, monitor faces chair, stand position does not overlap desk/collision.
- Lift: player must enter/exit without snagging; buttons should be visible inside cabin; no modal-only floor travel.
- NPCs: faces should point toward player when nearby; wandering must stay inside room waypoints and never cross furniture blockers.
- Floor 3 should feel like a recharge/game zone without blocking the lift corridor.

## Prop Placement Heuristics

- Floor props use `y + 0.02` to `y + 1.1` depending on object height.
- Wall signs usually sit around `y + 1.6` to `y + 2.1`; avoid `y + 2.4+` unless it is a lift/header sign.
- Desk accessories should sit on actual desk/table top heights, not arbitrary world positions.
- Use room bounds from `ROOMS`; keep at least about 2 units of navigable space near doors/lift paths.
- After adding an interactable, add/debug its radius and ensure it is reachable from first-person view.

## Visual QA Checklist

For each meaningful 3D change, inspect at least:

- `qa-artifacts/desktop-1920x1080.png`
- `qa-artifacts/laptop-1366x768.png`
- `qa-artifacts/mobile-390x844.png`
- `qa-artifacts/visual-report.json`

Look for:

- blank/failed canvas, console errors, CDN/network failures;
- objects floating, intersecting, mirrored, or facing backward;
- Mission Control/overlays covering critical controls;
- unreadable labels or huge signs;
- lift corridor, spawn, and room entries blocked by props;
- obvious performance warnings or repeated WebGL errors.

If screenshots only show the default spawn, add or use QA camera positions/scripts before claiming that other floors/rooms look good.

## Preferred Improvement Pattern

- First stabilize layout/collision/signage.
- Then improve interaction depth.
- Then add visual detail.
- Then add animation/audio polish.
- Avoid adding many new props before visual QA confirms pathing and orientation.

## Verification Language

In final responses, separate:

- what was implemented;
- what was verified by commands;
- what was visually inspected from screenshots;
- remaining risks if a room/floor was not directly inspected.
