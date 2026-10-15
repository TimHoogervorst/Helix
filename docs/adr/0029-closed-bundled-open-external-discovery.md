# ADR-0029: Closed Bundled and Open External Discovery

> Date: 2026-10-12
> Status: Accepted

Bundled and External Mod discovery intentionally have different shapes. The frontend loads the closed Bundled Mod set through explicit imports in `src/shell/src/mod-system/bundled.ts`; the backend loads the matching explicit dotted paths from `helix_core.mod_system.bundled`. External Mods remain open through installed package composition: the frontend consumes npm package entry points and the backend consumes Python `helix.mods` entry points. Both sets then use the same manifest validation, dependency sort, and registration APIs.

This asymmetry is deliberate. Explicit Bundled enumeration prevents an unreviewed file from changing the shipped artifact, while open External discovery preserves the build-time composition seam. The frontend and backend explicit Bundled enumerations must contain the same set; a parity test is the appropriate future enforcement point.
