# BEYOND Performer Console — Digital Touch

An iPad-first, landscape performance surface inspired by the workflow of the Pangolin BEYOND Performer Console. Phase 1 focuses on the touch interface and interaction architecture; it does not connect to BEYOND, MIDI, OSC, or WebSocket yet.

## Phase 1 features

- Console-scale landscape layout for iPad Pro 11-inch
- Reusable momentary, toggle, and trigger buttons
- Four vertical faders with direct positioning and drag control
- Four relative-drag encoders with value indicators
- Four selectable interface layers
- Pointer Events with per-control pointer capture
- Concurrent `Map<pointerId, ActiveControl>` architecture
- Independent control release and `pointercancel` cleanup
- Touch gesture, selection, scroll, and context-menu suppression on controls
- Desktop pointer support and portrait orientation prompt

## Multi-touch acceptance tests

The architecture is designed to support all of these combinations without one pointer stealing another control:

1. Hold one button while dragging one fader.
2. Hold two buttons while dragging one fader.
3. Hold two buttons while dragging two faders.
4. Hold a button while dragging a fader and an encoder.
5. Drag two faders simultaneously; each follows only its captured pointer.
6. Keep a momentary button held while other controls move; release it only on its own `pointerup` or `pointercancel`.

The control-event monitor in the lower-right corner shows the latest normalized event and the number of active pointers.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and use landscape orientation.

## Production build

```bash
npm run build
```

The static site is generated in `out/`. Every push to `main` is automatically deployed to GitHub Pages by the included workflow.

## Phase 2 boundary

MIDI output, Virtual MIDI, OSC, WebSocket, the Windows bridge, BEYOND integration, backend services, and authentication are intentionally out of scope.
