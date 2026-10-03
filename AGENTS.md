# AGENTS.md

## Project

Reverspin is a small browser-based 2D arcade game.

The player continuously orbits around the center of the game world and can reverse
their direction of rotation. The game is a web-based reimplementation of an older
Unity prototype.

This repository should remain small, simple, and easy to understand. Prefer direct
solutions over unnecessary abstractions or framework-like architecture.

## Technology

- Language: TypeScript
- Package manager: pnpm
- Build tool: Vite
- Rendering: HTML Canvas 2D
- UI: HTML/CSS and vanilla DOM APIs
- Runtime: Modern evergreen browsers
- Game loop: `requestAnimationFrame`

Do not introduce a game engine or rendering framework unless explicitly requested.

In particular, do not add Phaser, PixiJS, Three.js, Matter.js, React, Vue, Svelte,
or similar dependencies merely for convenience.

External dependencies should only be added when they solve a concrete problem that
would otherwise require significant custom implementation.

Always use `pnpm` for package management.

## General Engineering Principles

Keep the implementation simple and explicit.

Do not recreate Unity concepts such as GameObject, MonoBehaviour, Component,
Transform, or Unity-style lifecycle methods unless there is a concrete architectural
reason to do so.

Prefer composition and plain TypeScript data structures over deep class hierarchies.

Avoid premature abstraction. A helper or abstraction should exist because it makes
the current code clearer, not because it might theoretically become useful later.

Do not build a generic game engine. Build Reverspin.

Use TypeScript's strict type checking and avoid `any` unless interacting with an API
that genuinely cannot be typed more precisely.

Prefer immutable configuration values and clearly owned mutable game state.

Keep functions reasonably small and give variables and functions descriptive names.

Comments should explain non-obvious reasoning, mathematical behavior, invariants, or
browser-specific details. Do not comment code that is already self-explanatory.

## Architecture

Separate game simulation from rendering as much as reasonably possible.

The game should conceptually contain these layers:

1. Game state and simulation
2. Input
3. Rendering
4. Audio
5. DOM-based UI

Simulation code should not depend directly on DOM elements where avoidable.

Rendering should read game state rather than own gameplay state.

Input handling should translate browser events into game actions instead of allowing
gameplay code to depend directly on raw keyboard events.

Do not require every conceptual layer to have its own class or file. Keep the actual
file structure proportional to the size of the project.

## Game Loop

Use `requestAnimationFrame` as the main game loop.

Gameplay movement must be based on elapsed time rather than frame count.

Use seconds as the standard unit for delta time and other gameplay durations unless
there is a strong reason not to.

Do not assume a specific refresh rate such as 60 Hz.

Handle unusually large frame gaps safely so that returning to a backgrounded tab does
not cause objects to jump across the game world or break collision detection.

Keep simulation/update logic distinguishable from rendering logic.

## Coordinate System

Game-world coordinates must be independent from the physical Canvas resolution.

Do not base gameplay behavior directly on CSS pixels, physical display pixels, or
`devicePixelRatio`.

Maintain a logical game coordinate system and map it to the Canvas during rendering.

The game must remain visually correct when the browser window changes size.

Preserve the intended game aspect ratio when appropriate rather than stretching the
game world.

Support high-DPI displays by accounting for `devicePixelRatio` when configuring the
Canvas backing resolution.

Changing display resolution must not change gameplay speed, distances, collision
behavior, or difficulty.

## Mathematics

Use radians internally for angular calculations.

Use standard mathematical functions such as `Math.sin`, `Math.cos`, and `Math.atan2`
for orbital movement and orientation.

Keep gameplay units internally consistent.

When possible, compare squared distances for simple circular collision checks instead
of calculating square roots unnecessarily.

Do not introduce a physics engine for simple movement or collision detection.

## Input

Keyboard input must use standard browser keyboard events.

Gameplay actions should be represented independently from their physical key bindings.

Prevent unwanted browser behavior only for keys actively used by the game and only
when necessary.

Input should remain predictable when keys are held, released, or pressed repeatedly.

Do not allow browser key-repeat behavior to accidentally trigger gameplay actions that
are intended to occur once per press.

## Rendering

Use the Canvas 2D API for gameplay rendering.

Keep rendering deterministic with respect to the current game state.

Avoid unnecessary allocations inside the per-frame rendering path.

Do not manipulate the DOM every frame for objects that belong inside the game world.

DOM elements may be used for menus, settings, overlays, accessibility-related UI,
and other interface elements that are not naturally part of the Canvas scene.

Prefer simple procedural rendering during early development. Assets can replace
temporary graphics later without requiring changes to gameplay logic.

## Assets

Store static assets under `public/assets/` unless there is a concrete reason to import
them through the module graph.

Organize assets by type when necessary, for example:

- `public/assets/images/`
- `public/assets/audio/`
- `public/assets/fonts/`

Do not embed large binary assets directly into TypeScript source files.

Gameplay logic must not depend on the exact dimensions of a particular sprite unless
that dependency is intentional and documented.

## Audio

Use browser-native audio capabilities unless the audio requirements become complex
enough to justify a dedicated library.

Audio playback must not be required for the game simulation to function.

Respect browser autoplay restrictions. Audio should begin only after an appropriate
user interaction when required by the browser.

## Performance

Target smooth gameplay on ordinary modern desktop browsers.

Avoid premature micro-optimization, but keep per-frame code reasonably efficient.

Avoid unnecessary object creation, array copying, DOM operations, or expensive layout
work inside the game loop.

Do not sacrifice code clarity for insignificant performance improvements.

If optimization becomes necessary, identify the actual bottleneck before changing the
architecture.

## Browser Behavior

The game should behave correctly when:

- the window is resized,
- the display uses a high device pixel ratio,
- the tab temporarily becomes inactive,
- frame rate fluctuates,
- keyboard focus changes.

Do not rely on browser-specific behavior when a standard web API is available.

## Styling

Keep application styling in CSS rather than generating large amounts of style
information from TypeScript.

The Canvas should be responsive within the page.

Avoid hard-coding layout assumptions that only work at one screen resolution.

## Dependencies

Before adding a runtime dependency, consider whether the browser platform already
provides a sufficiently simple solution.

A dependency is justified when it substantially improves correctness,
maintainability, or implementation complexity.

Do not add dependencies solely to avoid writing a small amount of straightforward
TypeScript.

When adding or removing dependencies, use pnpm commands rather than manually editing
the lockfile.

## Verification

After meaningful changes:

1. Run the TypeScript/build checks.
2. Run relevant tests if tests exist.
3. Run `pnpm build`.
4. Fix warnings or errors caused by the change.
5. Verify gameplay behavior in the browser when the change affects runtime behavior.

Do not consider a gameplay feature complete solely because it compiles.

When fixing a bug, preserve existing intended behavior unless the task explicitly
changes that behavior.

## Scope Discipline

Implement only what is required by the current task plus small supporting changes
necessary to implement it correctly.

Do not redesign unrelated systems while implementing a feature.

Do not add speculative systems for achievements, networking, accounts, multiplayer,
save synchronization, analytics, monetization, or other features unless explicitly
requested.

When requirements are ambiguous, prefer the smallest implementation consistent with
the existing architecture and game design.

The repository should always remain runnable after a completed task.
