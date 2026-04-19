# Overflow Sorting — Agent Instructions

## Project
Casual puzzle game for iOS and Android. Tile-sort mechanics with contamination spread, staging pressure, and buried item layers. Built with Expo + React Native + TypeScript + react-native-skia + Reanimated 3 + Zustand.

## Stack
- Expo SDK 52+ (managed workflow)
- TypeScript strict mode
- react-native-skia for board rendering
- react-native-reanimated v3 for gestures/animations
- zustand for game state (single store, slice pattern)
- vitest for unit tests (logic layer)
- @testing-library/react-native for component tests
- No class components. Functional components with hooks only.

## Directory structure
- `src/engine/` — pure game logic, zero React imports. All mechanics live here.
- `src/state/` — zustand stores. Thin wrappers over engine.
- `src/components/` — React components. No game logic.
- `src/screens/` — full screens (Level, Menu, etc).
- `src/data/levels/` — JSON level definitions.
- `src/assets/` — images, sounds.
- `tests/` — vitest tests mirror src/ structure.

## Conventions
- Engine code is pure functions. Board state is immutable; every mechanic returns a new state.
- No mutations. No side effects in engine/.
- Every engine function has a vitest test.
- Components receive data via props and callbacks. No direct store access from deep components; use selector hooks at screen level.
- File names: kebab-case for files, PascalCase for components, camelCase for functions.
- Types before implementation. When adding a mechanic, define its types in a `types.ts` first.

## Commands
- `npm run dev` — start Expo dev server
- `npm run test` — run vitest
- `npm run typecheck` — tsc --noEmit
- `npm run lint` — eslint

## Verification requirements
Before completing any task:
1. `npm run typecheck` must pass
2. `npm run test` must pass
3. `npm run lint` must pass with zero warnings
Run all three. Report the output in your summary.

## What NOT to do
- Do not add runtime dependencies without stating why in the PR description.
- Do not put game logic inside components.
- Do not use `any` type. Use `unknown` with narrowing if the type is genuinely dynamic.
- Do not add comments that just describe what the code does. Only comment *why*.
- Do not use localStorage, AsyncStorage, or any persistence in Phase 1. State is in-memory only.
