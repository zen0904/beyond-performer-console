"use client";

import React, { PointerEvent, useCallback, useMemo, useRef, useState } from "react";

type ButtonMode = "momentary" | "toggle" | "trigger";
type Layer = 1 | 2 | 3 | 4;
type EventSink = (type: string, id: string, value: number, pointerId: number) => void;

const clamp = (n: number, min = 0, max = 127) => Math.max(min, Math.min(max, n));
const toMidi = (pct: number) => Math.round(clamp(pct, 0, 100) * 1.27);

function SurfaceButton({
  id, label, mode = "momentary", className = "", accent = "#d9d9d9",
  active = false, onEvent, onPress
}: {
  id: string; label?: string; mode?: ButtonMode; className?: string; accent?: string;
  active?: boolean; onEvent: EventSink; onPress?: () => void;
}) {
  const [pointers, setPointers] = useState<Set<number>>(new Set());
  const [latched, setLatched] = useState(false);
  const pressed = pointers.size > 0;
  const visualActive = active || pressed || latched;

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointers((current) => new Set(current).add(event.pointerId));
    if (mode === "toggle" && !onPress) setLatched((v) => !v);
    onPress?.();
    onEvent("controlDown", id, 127, event.pointerId);
  };

  const up = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    setPointers((current) => {
      const next = new Set(current);
      next.delete(event.pointerId);
      return next;
    });
    onEvent(cancelled ? "controlCancel" : "controlUp", id, 0, event.pointerId);
  };

  return (
    <button
      type="button"
      className={`surface-button ${className} ${visualActive ? "is-active" : ""}`}
      style={{ "--accent": accent } as React.CSSProperties}
      onPointerDown={down}
      onPointerUp={(e) => up(e)}
      onPointerCancel={(e) => up(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label ? <span className="button-label">{label}</span> : null}
    </button>
  );
}

function AbsoluteKnob({
  id, label, initial = 0, defaultValue = 0, accent = "#e7e7df", onEvent
}: {
  id: string; label: string; initial?: number; defaultValue?: number; accent?: string; onEvent: EventSink;
}) {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const drags = useRef<Map<number, { startY: number; startValue: number }>>(new Map());
  const lastTap = useRef(0);

  const setPct = (pct: number, pointerId: number, type = "controlChange") => {
    const next = clamp(Math.round(pct), 0, 100);
    valueRef.current = next;
    setValue(next);
    onEvent(type, id, toMidi(next), pointerId);
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const now = performance.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      setPct(defaultValue, event.pointerId);
      return;
    }
    lastTap.current = now;
    event.currentTarget.setPointerCapture(event.pointerId);
    drags.current.set(event.pointerId, { startY: event.clientY, startValue: valueRef.current });
    onEvent("controlDown", id, toMidi(valueRef.current), event.pointerId);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = drags.current.get(event.pointerId);
    if (!drag) return;
    // 220 px finger travel = full 0–100% travel. No acceleration.
    const next = drag.startValue + ((drag.startY - event.clientY) / 220) * 100;
    setPct(next, event.pointerId);
  };

  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!drags.current.has(event.pointerId)) return;
    drags.current.delete(event.pointerId);
    onEvent(cancelled ? "controlCancel" : "controlUp", id, toMidi(valueRef.current), event.pointerId);
  };

  const turn = -135 + (value / 100) * 270;

  return (
    <div className="absolute-knob-unit" style={{ "--accent": accent } as React.CSSProperties}>
      <div
        className="absolute-knob-touch"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="absolute-scale" />
        <div className="absolute-knob" style={{ transform: `rotate(${turn}deg)` }}><i /></div>
      </div>
      <span>{label}</span>
    </div>
  );
}

function LedEncoder({
  id, label, initial = 64, defaultValue = 64, accent = "#68e8ff", onEvent
}: {
  id: string; label: string; initial?: number; defaultValue?: number; accent?: string; onEvent: EventSink;
}) {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const drags = useRef<Map<number, { startY: number; startValue: number }>>(new Map());
  const lastTap = useRef(0);

  const setVal = (nextValue: number, pointerId: number, type = "controlChange") => {
    const next = clamp(Math.round(nextValue));
    valueRef.current = next;
    setValue(next);
    onEvent(type, id, next, pointerId);
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const now = performance.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      setVal(defaultValue, event.pointerId);
      return;
    }
    lastTap.current = now;
    event.currentTarget.setPointerCapture(event.pointerId);
    drags.current.set(event.pointerId, { startY: event.clientY, startValue: valueRef.current });
    onEvent("controlDown", id, valueRef.current, event.pointerId);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = drags.current.get(event.pointerId);
    if (!drag) return;
    // Deliberately slower than the previous prototype.
    setVal(drag.startValue + ((drag.startY - event.clientY) / 240) * 127, event.pointerId);
  };

  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!drags.current.has(event.pointerId)) return;
    drags.current.delete(event.pointerId);
    onEvent(cancelled ? "controlCancel" : "controlUp", id, valueRef.current, event.pointerId);
  };

  const ringPct = (value / 127) * 100;
  const turn = -135 + (value / 127) * 270;

  return (
    <div className="encoder-unit" style={{ "--accent": accent, "--ringPct": `${ringPct}%` } as React.CSSProperties}>
      <div
        className="encoder-touch"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="encoder-led-ring" />
        <div className="encoder-knob" style={{ transform: `rotate(${turn}deg)` }}><i /></div>
      </div>
      <span className="encoder-label">{label}</span>
    </div>
  );
}

function VerticalFader({
  id, label, initial = 64, accent = "#d9dedc", variant = "normal", onEvent
}: {
  id: string; label: string; initial?: number; accent?: string;
  variant?: "normal" | "color" | "led"; onEvent: EventSink;
}) {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const drags = useRef<Map<number, { grabOffset: number }>>(new Map());

  const valueFromY = (track: HTMLDivElement, clientY: number, grabOffset = 0) => {
    const rect = track.getBoundingClientRect();
    const usableTop = rect.top + 8;
    const usableBottom = rect.bottom - 8;
    const usableHeight = usableBottom - usableTop;
    const y = clamp(clientY - grabOffset, usableTop, usableBottom);
    const normalized = (usableBottom - y) / usableHeight;
    return Math.round(normalized * 127);
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const track = event.currentTarget;
    track.setPointerCapture(event.pointerId);
    const rect = track.getBoundingClientRect();
    const usableTop = rect.top + 8;
    const usableBottom = rect.bottom - 8;
    const currentHandleY = usableBottom - (valueRef.current / 127) * (usableBottom - usableTop);
    const grabOffset = Math.abs(event.clientY - currentHandleY) <= 24 ? event.clientY - currentHandleY : 0;
    drags.current.set(event.pointerId, { grabOffset });
    const next = valueFromY(track, event.clientY, grabOffset);
    valueRef.current = next;
    setValue(next);
    onEvent("controlDown", id, next, event.pointerId);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = drags.current.get(event.pointerId);
    if (!drag) return;
    const next = valueFromY(event.currentTarget, event.clientY, drag.grabOffset);
    valueRef.current = next;
    setValue(next);
    onEvent("controlChange", id, next, event.pointerId);
  };

  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!drags.current.has(event.pointerId)) return;
    drags.current.delete(event.pointerId);
    onEvent(cancelled ? "controlCancel" : "controlUp", id, valueRef.current, event.pointerId);
  };

  const pct = (value / 127) * 100;

  return (
    <div className={`fader-unit ${variant}`} style={{ "--accent": accent } as React.CSSProperties}>
      <div
        className="fader-touch"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="fader-rail" />
        {variant === "color" ? <div className="color-strip" /> : null}
        {variant === "led" ? <div className="led-meter"><i/><i/><i/><i/><i/><i/></div> : null}
        <div className="fader-cap" style={{ top: `${100 - pct}%` }}><i /></div>
      </div>
      <span className="fader-label">{label}</span>
    </div>
  );
}

const LAYER_COLORS: Record<Layer, string> = {
  1: "#7cc8ff",
  2: "#61d8ff",
  3: "#7edaff",
  4: "#79bfff",
};

const layerNames: Record<Layer, string> = {
  1: "Content",
  2: "Colors",
  3: "Zones",
  4: "Content 2",
};

// Exact layer categories are taken from Pangolin's official BPC function list.
// Where the public manual does not publish per-button MIDI note IDs, labels stay categorical rather than invented.
const auxEncoderLabels: Record<Layer, string[]> = {
  1: ["Geometric 1", "Geometric 2", "Geometric 3", "Geometric 4"],
  2: ["Channel 5", "Channel 6", "Channel 7", "Channel 8"],
  3: ["Channel 5", "Channel 6", "Channel 7", "Channel 8"],
  4: ["DMX 1", "DMX 2", "DMX 3", "DMX 4"],
};

const auxButtonLabels: Record<Layer, string[]> = {
  1: ["Grid UI 1", "Grid UI 2", "Grid UI 3", "Grid UI 4", "Grid UI 5", "Grid UI 6", "Grid UI 7", "Grid UI 8"],
  2: ["Yellow", "Cyan", "Magenta", "Palette 1", "Palette 2", "Palette 3", "Palette 4", "Palette 5"],
  3: ["User 1", "User 2", "User 3", "User 4", "User 5", "User 6", "User 7", "User 8"],
  4: ["2nd UI 1", "2nd UI 2", "2nd UI 3", "2nd UI 4", "2nd UI 5", "2nd UI 6", "2nd UI 7", "2nd UI 8"],
};

function grid2Accent(layer: Layer, row: number) {
  if (layer === 1) return ["#f3ed86","#f3ed86","#9aa3ff","#9aa3ff","#72e1d1","#72e1d1","#ff858e","#ff858e"][row];
  if (layer === 2) return ["#ffffff","#ffe36b","#ff6b6b","#70e870","#64a9ff","#f278ff","#ff9a5d","#eaeaea"][row];
  if (layer === 3) return ["#ff9c5f","#ff9c5f","#63dcc9","#63dcc9","#76def7","#76def7","#a889ff","#a889ff"][row];
  return ["#f2e879","#f2e879","#94a1ff","#94a1ff","#70dfcb","#70dfcb","#ff858b","#ff858b"][row];
}

function grid1Accent(layer: Layer, row: number) {
  if (layer === 1) return ["#ff8f87","#eceb89","#71dc9f","#60d8ff","#7388ff","#996ff8"][row];
  if (layer === 2) return ["#ffffff","#ffd95c","#5fd6ff","#60dd86","#65b3ff","#7de0a3"][row];
  if (layer === 3) return ["#ff9b56","#ff9b56","#b48bff","#b48bff","#ff78ad","#ff78ad"][row];
  return ["#ff8f87","#eceb89","#71dc9f","#60d8ff","#7388ff","#996ff8"][row];
}

export default function Home() {
  const activePointers = useRef<Map<number, string>>(new Map());
  const [activeCount, setActiveCount] = useState(0);
  const [layer, setLayer] = useState<Layer>(1);

  const onEvent = useCallback<EventSink>((type, id, _value, pointerId) => {
    if (type === "controlDown") activePointers.current.set(pointerId, id);
    if (type === "controlUp" || type === "controlCancel") activePointers.current.delete(pointerId);
    setActiveCount(activePointers.current.size);
  }, []);

  const layerCaption = useMemo(() => layerNames[layer], [layer]);

  return (
    <main className="page-shell">
      <section className="console-surface" aria-label="BEYOND Performer Console digital touch surface">

        <section className="top-zone">
          <div className="header-encoders">
            <div className="section-caption">
              AUX Encoders <b>{layerCaption}</b>
            </div>
            {auxEncoderLabels[layer].map((label, i) => (
              <LedEncoder
                key={`${layer}-AUX-${i}`}
                id={`AUX-${i + 1}`}
                label={label}
                accent={i % 2 ? "#62ef8d" : "#ff718e"}
                initial={64}
                defaultValue={64}
                onEvent={onEvent}
              />
            ))}
          </div>

          <div className="master-buttons">
            <div className="section-caption">Master Functions</div>
            <SurfaceButton id="PHYSICS" label="Physics" className="master-key" accent="#f0f0e9" onEvent={onEvent}/>
            <SurfaceButton id="BLACKOUT" label="Blackout" className="master-key" accent="#f0f0e9" mode="toggle" onEvent={onEvent}/>
            <SurfaceButton id="PAUSE" label="Pause" className="master-key" accent="#e9edf0" mode="toggle" onEvent={onEvent}/>
            <SurfaceButton id="ENABLE" label="Enable / Disable" className="master-key" accent="#ff7078" mode="toggle" onEvent={onEvent}/>
          </div>
        </section>

        <section className="upper-zone">
          <div className="grid2-block">
            <div className="grid-caption">
              <span>Grid 2</span>
              <b>{layer === 1 ? "QuickFX Layers 1–4" : layer === 2 ? "Color Channels 1–4" : layer === 3 ? "Individual Zone Selection" : "Page 1 / Keys 1"}</b>
            </div>
            <div className="grid2">
              {Array.from({ length: 8 }, (_, row) =>
                Array.from({ length: 8 }, (_, col) => (
                  <SurfaceButton
                    key={`G2-${row}-${col}`}
                    id={`G2-${row + 1}-${col + 1}`}
                    className="pad small-pad"
                    accent={grid2Accent(layer, row)}
                    onEvent={onEvent}
                  />
                ))
              )}
            </div>
          </div>

          <div className="grid1-block">
            <div className="grid-caption">
              <span>Grid 1</span>
              <b>{layer === 1 ? "Main Workspace" : layer === 2 ? "White+Color / Cue Shift / Effect Shift" : layer === 3 ? "Zone Flips / Direction / Groups" : "Secondary Workspace"}</b>
            </div>
            <div className="grid1">
              {Array.from({ length: 6 }, (_, row) =>
                Array.from({ length: 8 }, (_, col) => (
                  <SurfaceButton
                    key={`G1-${row}-${col}`}
                    id={`G1-${row + 1}-${col + 1}`}
                    className="pad wide-pad"
                    accent={grid1Accent(layer, row)}
                    onEvent={onEvent}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="middle-zone">
          <div className="left-middle">
            <div className="small-knob-section">
              <div className="mini-group-title fx">FX Action</div>
              <div className="mini-group-title ch">Channels</div>
              {Array.from({ length: 8 }, (_, i) => (
                <AbsoluteKnob
                  key={`ABS-TOP-${i}`}
                  id={`ABS-TOP-${i + 1}`}
                  label={`${i < 4 ? i + 1 : i - 3}`}
                  initial={0}
                  defaultValue={0}
                  onEvent={onEvent}
                />
              ))}
            </div>

            <div className="cc-row">
              {["CC1","CC2","CC3","CC4"].map((label, i) => (
                <SurfaceButton key={label} id={label} label={label} className="cc-button" accent="#ff7d83" onEvent={onEvent}/>
              ))}
              <span className="color-pallet">Color<br/>Pallet</span>
            </div>

            <div className="qshift-knobs">
              <div className="mini-group-title q">Q-Shift</div>
              {Array.from({ length: 8 }, (_, i) => (
                <AbsoluteKnob
                  key={`QK-${i}`}
                  id={`QK-${i + 1}`}
                  label={`${i + 1}`}
                  initial={0}
                  defaultValue={0}
                  onEvent={onEvent}
                />
              ))}
            </div>
          </div>

          <div className="right-middle">
            <div className="layer-bpm-row">
              {([1,2,3,4] as Layer[]).map((n) => (
                <div className="labeled-key" key={n}>
                  <span>Layer {n}</span>
                  <SurfaceButton
                    id={`LAYER-${n}`}
                    className="layer-key"
                    accent={LAYER_COLORS[n]}
                    active={layer === n}
                    onPress={() => setLayer(n)}
                    onEvent={onEvent}
                  />
                  <small>{layerNames[n]}</small>
                </div>
              ))}
              {["Half","Double","Resync","Tap"].map((label, i) => (
                <div className="labeled-key" key={label}>
                  <span>{label}</span>
                  <SurfaceButton id={`BPM-${i + 1}`} className="layer-key" accent={i === 1 ? "#73edff" : "#a9b6ff"} onEvent={onEvent}/>
                  <small>BPM</small>
                </div>
              ))}
            </div>

            <div className="utility-row">
              {["Toggle","Restart","Flash","Page Up","One Cue","Multi Cue","Groups","Page Down"].map((label, i) => (
                <div className="utility-key" key={label}>
                  <span>{label}</span>
                  <SurfaceButton
                    id={`UTIL-${i + 1}`}
                    className="utility-button"
                    accent={i === 0 || i === 3 ? "#6fed91" : i === 4 || i === 7 ? "#ff797f" : "#d7dadd"}
                    mode={i === 0 ? "toggle" : "momentary"}
                    onEvent={onEvent}
                  />
                </div>
              ))}
            </div>

            <div className="aux-panel">
              <div className="section-caption">AUX Button Panel <b>{layerCaption}</b></div>
              {auxButtonLabels[layer].map((label, i) => (
                <SurfaceButton
                  key={`${layer}-AUXB-${i}`}
                  id={`AUXB-${i + 1}`}
                  label={label}
                  className="aux-mini"
                  accent={layer === 2 && i < 3 ? ["#ffe45f","#62ecff","#ff79e4"][i] : "#d8dce0"}
                  onEvent={onEvent}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="bottom-zone">
          <div className="left-fader-bank">
            {Array.from({ length: 8 }, (_, i) => (
              <VerticalFader key={`LEFT-F${i}`} id={`LEFT-F${i + 1}`} label={`${i + 1}`} initial={0} onEvent={onEvent}/>
            ))}
          </div>

          <div className="right-performance-bank">
            <div className="knob-row">
              {[
                ["Cue Speed","#e776ff",64],
                ["RotoZ Move","#64b9ff",64],
                ["Cue-Sft Clock","#9d6fff",0],
                ["Ef-Sft Clock","#7ce8ba",0],
                ["Brush Shift","#ff78ae",64],
                ["Hue Shift","#ff5e80",64],
                ["Saturation","#d87aff",64],
                ["Scanrate","#ff8e57",64],
              ].map(([label, accent, def], i) => (
                <LedEncoder
                  key={String(label)}
                  id={`PERF-E${i + 1}`}
                  label={String(label)}
                  accent={String(accent)}
                  initial={Number(def)}
                  defaultValue={Number(def)}
                  onEvent={onEvent}
                />
              ))}
            </div>

            <div className="performance-faders">
              <VerticalFader id="ANIM-SPEED" label="Anim Speed" initial={40} accent="#9b43ff" variant="led" onEvent={onEvent}/>
              <VerticalFader id="SIZE-XY" label="Size XY" initial={64} accent="#39c5ff" onEvent={onEvent}/>
              <VerticalFader id="CUE-SFT" label="Cue-Sft Beat" initial={0} onEvent={onEvent}/>
              <VerticalFader id="EF-SFT" label="Ef-Sft Beat" initial={0} onEvent={onEvent}/>
              <VerticalFader id="BRUSH" label="Brush Value" initial={64} onEvent={onEvent}/>
              <VerticalFader id="COLOR" label="Color" initial={64} variant="color" onEvent={onEvent}/>
              <VerticalFader id="POINTS" label="Visible Points" initial={96} onEvent={onEvent}/>
              <VerticalFader id="BRIGHTNESS" label="Brightness" initial={127} onEvent={onEvent}/>
            </div>
          </div>
        </section>

        <div className="status-strip">
          <span>Layer {layer}: {layerCaption}</span>
          <b>{activeCount} TOUCH</b>
        </div>
      </section>
    </main>
  );
}
