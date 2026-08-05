"use client";

import React, { PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ensureBridgeTransport,
  getControlFeedback,
  replayFeedback,
  sendControlEvent,
  type FeedbackItem,
} from "./bridge-transport";

type EventSink = (type: string, id: string, value: number, pointerId: number) => void;
type Layer = 1 | 2 | 3 | 4;
type ButtonMode = "momentary" | "toggle" | "trigger";
type TransportName = "usb" | "wifi" | null;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

type FeedbackDetail = FeedbackItem | { controls?: FeedbackItem[] };

function feedbackForId(detail: FeedbackDetail | undefined, id: string): FeedbackItem | undefined {
  if (!detail) return undefined;

  if ("id" in detail) {
    return detail.id === id ? detail : undefined;
  }

  return detail.controls?.find((item) => item.id === id);
}

function Pad({
  id,
  label,
  mode = "momentary",
  active = false,
  onPress,
  onEvent,
}: {
  id: string;
  label?: string;
  mode?: ButtonMode;
  active?: boolean;
  onPress?: () => void;
  onEvent: EventSink;
}) {
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [latched, setLatched] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackItem | null>(null);

  useEffect(() => {
    const apply = (item: FeedbackItem | undefined) => {
      if (!item) return;
      setFeedback(item);
    };

    apply(getControlFeedback(id));

    const handler = (event: Event) => {
      apply(feedbackForId((event as CustomEvent<FeedbackDetail>).detail, id));
    };

    window.addEventListener("beyond-feedback", handler as EventListener);
    return () => window.removeEventListener("beyond-feedback", handler as EventListener);
  }, [id]);

  const isPressed = held.size > 0;
  const feedbackKnown = feedback !== null;
  const feedbackState = feedback?.state;
  const feedbackActive = feedback?.active === true || feedbackState === "playing";
  const feedbackVisible =
    feedbackActive || feedbackState === "used" || feedbackState === "focused";
  const localActive = active || isPressed || (!feedbackKnown && latched);

  const fallbackFeedbackColor =
    id === "MASTER-2" || id === "MASTER-4"
      ? "#ff2448"
      : id === "MASTER-3"
        ? "#ffb020"
        : feedbackState === "focused"
          ? "#d9e2ff"
          : feedbackState === "used"
            ? "#718096"
            : "#f2f2ea";

  const beyondColor = feedback?.color || fallbackFeedbackColor;
  const className = [
    "pad",
    localActive ? "is-active" : "",
    feedbackVisible ? "has-beyond-feedback" : "",
    feedbackActive ? "beyond-active" : "",
    feedbackState ? `feedback-${feedbackState}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const feedbackStyle = feedbackVisible
    ? ({
        "--beyond-color": beyondColor,
        "--feedback-color": beyondColor,
      } as React.CSSProperties)
    : undefined;

  const shownLabel =
    id === "MASTER-2"
      ? feedbackActive
        ? "BLACKOUT ON"
        : "Blackout"
      : id === "MASTER-3"
        ? feedbackActive
          ? "PAUSED"
          : "Pause"
        : label;

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld((prev) => {
      const next = new Set(prev);
      next.add(e.pointerId);
      return next;
    });
    if (mode === "toggle" && !onPress && !feedbackKnown) setLatched((v) => !v);
    onPress?.();
    onEvent("controlDown", id, 127, e.pointerId);
  };

  const up = (e: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    setHeld((prev) => {
      const next = new Set(prev);
      next.delete(e.pointerId);
      return next;
    });
    onEvent(cancelled ? "controlCancel" : "controlUp", id, 0, e.pointerId);
  };

  return (
    <button
      type="button"
      data-control-id={id}
      data-feedback-state={feedbackState}
      className={className}
      style={feedbackStyle}
      onPointerDown={down}
      onPointerUp={(e) => up(e)}
      onPointerCancel={(e) => up(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {shownLabel ? <span>{shownLabel}</span> : null}
    </button>
  );
}

function AbsoluteKnob({
  id,
  label,
  initial = 0,
  defaultValue = 0,
  onEvent,
}: {
  id: string;
  label: string;
  initial?: number;
  defaultValue?: number;
  onEvent: EventSink;
}) {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const active = useRef<Map<number, { startY: number; startValue: number }>>(new Map());
  const lastTap = useRef(0);

  const applyFeedback = useCallback((item: FeedbackItem | undefined) => {
    if (!item || typeof item.value !== "number" || active.current.size > 0) return;
    const next = clamp(Math.round((item.value / 127) * 100), 0, 100);
    valueRef.current = next;
    setValue(next);
  }, []);

  useEffect(() => {
    applyFeedback(getControlFeedback(id));

    const handler = (event: Event) => {
      applyFeedback(feedbackForId((event as CustomEvent<FeedbackDetail>).detail, id));
    };

    window.addEventListener("beyond-feedback", handler as EventListener);
    return () => window.removeEventListener("beyond-feedback", handler as EventListener);
  }, [id, applyFeedback]);

  const update = (nextValue: number, pointerId: number, type = "controlChange") => {
    const next = clamp(Math.round(nextValue), 0, 100);
    valueRef.current = next;
    setValue(next);
    onEvent(type, id, Math.round(next * 1.27), pointerId);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      update(defaultValue, e.pointerId);
      return;
    }
    lastTap.current = now;
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current.set(e.pointerId, { startY: e.clientY, startValue: valueRef.current });
    onEvent("controlDown", id, Math.round(valueRef.current * 1.27), e.pointerId);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const drag = active.current.get(e.pointerId);
    if (!drag) return;
    update(drag.startValue + ((drag.startY - e.clientY) / 240) * 100, e.pointerId);
  };

  const end = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!active.current.has(e.pointerId)) return;
    active.current.delete(e.pointerId);
    onEvent(cancelled ? "controlCancel" : "controlUp", id, Math.round(valueRef.current * 1.27), e.pointerId);
    if (active.current.size === 0) applyFeedback(getControlFeedback(id));
  };

  const angle = -135 + (value / 100) * 270;

  return (
    <div className="abs-unit" data-control-id={id}>
      <div
        className="abs-touch"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="abs-scale" />
        <div className="abs-cap" style={{ transform: `rotate(${angle}deg)` }}>
          <i />
        </div>
      </div>
      <span>{label}</span>
    </div>
  );
}

function EndlessEncoder({
  id,
  label,
  initial = 64,
  defaultValue = 64,
  onEvent,
}: {
  id: string;
  label: string;
  initial?: number;
  defaultValue?: number;
  onEvent: EventSink;
}) {
  const LED_COUNT = 19;
  const [value, setValue] = useState(initial);
  const [touching, setTouching] = useState(false);
  const valueRef = useRef(initial);
  const active = useRef<Map<number, { startY: number; startValue: number }>>(new Map());
  const lastTap = useRef(0);

  const applyFeedback = useCallback((item: FeedbackItem | undefined) => {
    if (!item || typeof item.value !== "number" || active.current.size > 0) return;
    const next = clamp(Math.round(item.value), 0, 127);
    valueRef.current = next;
    setValue(next);
  }, []);

  useEffect(() => {
    applyFeedback(getControlFeedback(id));

    const handler = (event: Event) => {
      applyFeedback(feedbackForId((event as CustomEvent<FeedbackDetail>).detail, id));
    };

    window.addEventListener("beyond-feedback", handler as EventListener);
    return () => window.removeEventListener("beyond-feedback", handler as EventListener);
  }, [id, applyFeedback]);

  const update = (nextValue: number, pointerId: number, type = "controlChange") => {
    const next = clamp(Math.round(nextValue), 0, 127);
    valueRef.current = next;
    setValue(next);
    onEvent(type, id, next, pointerId);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      update(defaultValue, e.pointerId);
      return;
    }
    lastTap.current = now;
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current.set(e.pointerId, { startY: e.clientY, startValue: valueRef.current });
    setTouching(true);
    onEvent("controlDown", id, valueRef.current, e.pointerId);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const drag = active.current.get(e.pointerId);
    if (!drag) return;
    update(drag.startValue + ((drag.startY - e.clientY) / 280) * 127, e.pointerId);
  };

  const end = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!active.current.has(e.pointerId)) return;
    active.current.delete(e.pointerId);
    if (active.current.size === 0) {
      setTouching(false);
      applyFeedback(getControlFeedback(id));
    }
    onEvent(cancelled ? "controlCancel" : "controlUp", id, valueRef.current, e.pointerId);
  };

  const activeLed = Math.round((value / 127) * (LED_COUNT - 1));

  return (
    <div className={`enc-unit ${touching ? "touching" : ""}`} data-control-id={id}>
      <div
        className="enc-touch"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="enc-ring" aria-hidden="true">
          {Array.from({ length: LED_COUNT }, (_, i) => {
            const angle = -135 + (270 / (LED_COUNT - 1)) * i;
            return (
              <i
                key={i}
                className={i <= activeLed ? "on" : ""}
                style={{ "--a": `${angle}deg` } as React.CSSProperties}
              />
            );
          })}
        </div>
        <div className="enc-cap" />
      </div>
      <span>{label}</span>
    </div>
  );
}

function VerticalFader({
  id,
  label,
  initial = 0,
  variant = "normal",
  onEvent,
}: {
  id: string;
  label: string;
  initial?: number;
  variant?: "normal" | "color" | "led";
  onEvent: EventSink;
}) {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const active = useRef<Map<number, { grabOffset: number }>>(new Map());

  const applyFeedback = useCallback((item: FeedbackItem | undefined) => {
    if (!item || typeof item.value !== "number" || active.current.size > 0) return;
    const next = clamp(Math.round(item.value), 0, 127);
    valueRef.current = next;
    setValue(next);
  }, []);

  useEffect(() => {
    applyFeedback(getControlFeedback(id));

    const handler = (event: Event) => {
      applyFeedback(feedbackForId((event as CustomEvent<FeedbackDetail>).detail, id));
    };

    window.addEventListener("beyond-feedback", handler as EventListener);
    return () => window.removeEventListener("beyond-feedback", handler as EventListener);
  }, [id, applyFeedback]);

  const fromY = (el: HTMLDivElement, y: number, grabOffset: number) => {
    const rect = el.getBoundingClientRect();
    const top = rect.top + 8;
    const bottom = rect.bottom - 8;
    const usable = Math.max(1, bottom - top);
    const pointer = clamp(y - grabOffset, top, bottom);
    return Math.round(((bottom - pointer) / usable) * 127);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const rect = el.getBoundingClientRect();
    const top = rect.top + 8;
    const bottom = rect.bottom - 8;
    const handleY = bottom - (valueRef.current / 127) * (bottom - top);
    const grabOffset = Math.abs(e.clientY - handleY) < 28 ? e.clientY - handleY : 0;

    active.current.set(e.pointerId, { grabOffset });
    const next = fromY(el, e.clientY, grabOffset);
    valueRef.current = next;
    setValue(next);
    onEvent("controlDown", id, next, e.pointerId);
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const drag = active.current.get(e.pointerId);
    if (!drag) return;
    const next = fromY(e.currentTarget, e.clientY, drag.grabOffset);
    valueRef.current = next;
    setValue(next);
    onEvent("controlChange", id, next, e.pointerId);
  };

  const end = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!active.current.has(e.pointerId)) return;
    active.current.delete(e.pointerId);
    onEvent(cancelled ? "controlCancel" : "controlUp", id, valueRef.current, e.pointerId);
    if (active.current.size === 0) applyFeedback(getControlFeedback(id));
  };

  const pct = (value / 127) * 100;

  return (
    <div className={`fader-unit ${variant}`} data-control-id={id}>
      <div
        className="fader-touch"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="rail" />
        <div className="fader-level" aria-hidden="true">
          <div className="fader-level-fill" style={{ height: `${pct}%` }} />
          {Array.from({ length: 11 }, (_, i) => <i key={i} style={{ bottom: `${i * 10}%` }} />)}
        </div>
        {variant === "led" ? <div className="mini-meter"><i/><i/><i/><i/><i/></div> : null}
        {variant === "color" ? <div className="rainbow" /> : null}
        <div className="fader-cap" style={{ top: `${100 - pct}%` }}><i /></div>
      </div>
      <span>{label}</span>
    </div>
  );
}

const LAYER_NAMES: Record<Layer, string> = {
  1: "Content",
  2: "Colors",
  3: "Zones",
  4: "Content 2",
};

/*
  TEXT/LABEL MAP ONLY.
  These strings mirror the functional legends documented for the Performer Console.
  They do not change control IDs, layout, sizing, positions, MIDI behavior, or feedback.
*/
const AUX_ENCODER_LEGEND: Record<Layer, string> = {
  1: "Geometric Live Effects",
  2: "Channels 5-8",
  3: "Channels 5-8",
  4: "DMX Channel Outs 1-4",
};

const GRID1_LEGEND: Record<Layer, string> = {
  1: "Main Workspace",
  2: "White+ Color / Cue-Sft Beat / Ef-Sft Beat Presets",
  3: "Zone Flips / Selection Directionality / Groups",
  4: "2nd Workspace",
};

const GRID2_LEGEND: Record<Layer, string> = {
  1: "QuickFX / Color Picker / Zone Selection / Keys",
  2: "Color Channels 1-4 / Individual Color Selections",
  3: "Individual Zone Selections",
  4: "Keys 1 / 8×8 Grid",
};

const AUX_BUTTON_LEGEND: Record<Layer, string> = {
  1: "Grid UI Options",
  2: "Color Palette Presets",
  3: "Zone User Presets",
  4: "2nd Workspace Functions",
};

export default function Home() {
  const [layer, setLayer] = useState<Layer>(1);
  const activePointers = useRef<Map<number, string>>(new Map());
  const [activeCount, setActiveCount] = useState(0);
  const [transport, setTransport] = useState<{
    active: TransportName;
    usb: string;
    wifi: string;
  }>({ active: null, usb: "disabled", wifi: "disabled" });

  useEffect(() => {
    ensureBridgeTransport();

    const transportHandler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setTransport({
        active: detail?.active ?? null,
        usb: detail?.usb?.state ?? "disabled",
        wifi: detail?.wifi?.state ?? "disabled",
      });
    };

    window.addEventListener("beyond-transport-state", transportHandler as EventListener);
    window.setTimeout(replayFeedback, 0);

    return () => {
      window.removeEventListener("beyond-transport-state", transportHandler as EventListener);
    };
  }, []);

  const onEvent = useCallback<EventSink>((type, id, value, pointerId) => {
    if (type === "controlDown") activePointers.current.set(pointerId, id);
    if (type === "controlUp" || type === "controlCancel") activePointers.current.delete(pointerId);
    setActiveCount(activePointers.current.size);
    sendControlEvent(type, id, value, layer);
  }, [layer]);

  return (
    <main className="surface">

      <section className="top-row">
        <div className="aux-encoders">
          <div className="caption">
            AUX Encoders: <b style={{ fontSize: "1.12em" }}>{AUX_ENCODER_LEGEND[layer]}</b>
          </div>
          {[1,2,3,4].map((n) => (
            <EndlessEncoder key={n} id={`AUX-E${n}`} label={`AUX ${n}`} onEvent={onEvent}/>
          ))}
        </div>

        <div className="master">
          <div className="caption">Master Functions</div>
          {["Physics","Blackout","Pause","Enable / Disable"].map((label, i) => (
            <Pad key={label} id={`MASTER-${i+1}`} label={label} mode={i === 1 || i === 2 || i === 3 ? "toggle" : "momentary"} onEvent={onEvent}/>
          ))}
        </div>
      </section>

      <section className="grid-row">
        <div className="grid-block">
          <div className="caption">
            Grid 2: <b style={{ fontSize: "1.12em" }}>{GRID2_LEGEND[layer]}</b>
          </div>
          <div className="grid grid2">
            {Array.from({ length: 64 }, (_, i) => (
              <Pad key={i} id={`G2-${i+1}`} onEvent={onEvent}/>
            ))}
          </div>
        </div>

        <div className="grid-block">
          <div className="caption">
            Grid 1: <b style={{ fontSize: "1.12em" }}>{GRID1_LEGEND[layer]}</b>
          </div>
          <div className="grid grid1">
            {Array.from({ length: 48 }, (_, i) => (
              <Pad key={i} id={`G1-${i+1}`} onEvent={onEvent}/>
            ))}
          </div>
        </div>
      </section>

      <section className="controls-row row-knobs-layers">
        <div className="fx-channels">
          <div className="subgroup"><span>FX Action</span>
            <div className="four-knobs">
              {[1,2,3,4].map((n) => <EndlessEncoder key={n} id={`FX-${n}`} label={`${n}`} initial={0} defaultValue={0} onEvent={onEvent}/>)}
            </div>
          </div>
          <div className="subgroup"><span>Channels</span>
            <div className="four-knobs">
              {[1,2,3,4].map((n) => <AbsoluteKnob key={n} id={`CH-${n}`} label={`${n}`} onEvent={onEvent}/>)}
            </div>
          </div>
        </div>

        <div className="layers">
          {[1,2,3,4].map((n) => (
            <div className="named-key" key={n}>
              <span>Layer {n}</span>
              <Pad id={`LAYER-${n}`} active={layer === n} onPress={() => setLayer(n as Layer)} onEvent={onEvent}/>
              <small>{LAYER_NAMES[n as Layer]}</small>
            </div>
          ))}
        </div>

        <div className="bpm">
          {["Half","Double","Resync","Tap"].map((label, i) => (
            <div className="named-key" key={label}>
              <span>{label}</span>
              <Pad id={`BPM-${i+1}`} onEvent={onEvent}/>
              <small>BPM</small>
            </div>
          ))}
        </div>
      </section>

      <section className="controls-row row-buttons">
        <div className="cc-buttons">
          {["CC1","CC2","CC3","CC4"].map((label, i) => (
            <div className="named-key cc" key={label}>
              <Pad id={`CC-${i+1}`} onEvent={onEvent}/>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="aux-buttons">
          <div className="caption">
            AUX Button Panel: <b style={{ fontSize: "1.12em" }}>{AUX_BUTTON_LEGEND[layer]}</b>
          </div>
          {Array.from({ length: 16 }, (_, i) => (
            <Pad key={i} id={`AUX-B${i+1}`} label={`${i+1}`} onEvent={onEvent}/>
          ))}
        </div>

        <div className="content-tools">
          {["Toggle","Restart","Flash","Page Up","One Cue","Multi Cue","Groups","Page Down"].map((label, i) => (
            <div className="tool-key" key={label}>
              <span>{label}</span>
              <Pad id={`TOOL-${i+1}`} mode={i === 0 ? "toggle" : "momentary"} onEvent={onEvent}/>
            </div>
          ))}
        </div>
      </section>

      <section className="controls-row row-encoder-banks">
        <div className="qshift-knobs">
          <div className="caption">Q-Shift</div>
          {[1,2,3,4,5,6,7,8].map((n) => (
            <EndlessEncoder key={n} id={`Q-${n}`} label={`${n}`} initial={0} defaultValue={0} onEvent={onEvent}/>
          ))}
        </div>

        <div className="live-encoders">
          <div className="caption">LIVE CONTROL EFFECTS</div>
          {["Cue Speed","RotoZ Move","Cue-Sft Clock","Ef-Sft Clock","Brush Shift","Hue Shift","Saturation","Scanrate"].map((label, i) => (
            <EndlessEncoder key={label} id={`LIVE-E${i+1}`} label={label} defaultValue={i === 2 || i === 3 ? 0 : 64} initial={i === 2 || i === 3 ? 0 : 64} onEvent={onEvent}/>
          ))}
        </div>
      </section>

      <section className="fader-row">
        <div className="qshift-faders">
          {[1,2,3,4,5,6,7,8].map((n) => (
            <VerticalFader key={n} id={`QF-${n}`} label={`${n}`} initial={0} onEvent={onEvent}/>
          ))}
        </div>

        <div className="live-faders">
          <VerticalFader id="ANIM" label="Anim Speed" initial={38} variant="led" onEvent={onEvent}/>
          <VerticalFader id="SIZE" label="Size XY" initial={62} onEvent={onEvent}/>
          <VerticalFader id="CUESFT" label="Cue-Sft Beat" initial={0} onEvent={onEvent}/>
          <VerticalFader id="EFSFT" label="Ef-Sft Beat" initial={0} onEvent={onEvent}/>
          <VerticalFader id="BRUSH" label="Brush Value" initial={62} onEvent={onEvent}/>
          <VerticalFader id="COLOR" label="Color" initial={62} variant="color" onEvent={onEvent}/>
          <VerticalFader id="POINTS" label="Visible Points" initial={95} onEvent={onEvent}/>
          <VerticalFader id="BRIGHT" label="Brightness" initial={127} onEvent={onEvent}/>
        </div>
      </section>

      <div className="status">
        LAYER {layer} · {LAYER_NAMES[layer]} · {activeCount} TOUCH ·
        TRANSPORT {transport.active ? transport.active.toUpperCase() : "OFF"} ·
        USB {transport.usb.toUpperCase()} · WIFI {transport.wifi.toUpperCase()}
      </div>
    </main>
  );
}
