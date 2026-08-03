"use client";

import { PointerEvent, useCallback, useRef, useState } from "react";

type Color = "white" | "red" | "blue" | "green" | "amber" | "purple" | "cyan";
type ControlEvent = (type: string, id: string, value: number, pointerId: number) => void;

const colors: Color[] = ["amber", "amber", "blue", "blue", "green", "green", "red", "red"];

function Pad({ id, label, color = "white", onEvent }: { id: string; label?: string; color?: Color; onEvent: ControlEvent }) {
  const [pointers, setPointers] = useState<Set<number>>(new Set());
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPointers((value) => new Set(value).add(e.pointerId));
    onEvent("controlDown", id, 1, e.pointerId);
  };
  const up = (e: PointerEvent<HTMLButtonElement>, cancel = false) => {
    setPointers((value) => { const next = new Set(value); next.delete(e.pointerId); return next; });
    onEvent(cancel ? "controlCancel" : "controlUp", id, 0, e.pointerId);
  };
  return <button className={`hardware-pad ${color} ${pointers.size ? "pressed" : ""}`} onPointerDown={down} onPointerUp={(e) => up(e)} onPointerCancel={(e) => up(e, true)} aria-label={label || id}><span>{label}</span></button>;
}

function Knob({ id, label, color = "cyan", onEvent }: { id: string; label: string; color?: Color; onEvent: ControlEvent }) {
  const [value, setValue] = useState(64);
  const active = useRef<Map<number, { y: number; value: number }>>(new Map());
  const down = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); active.current.set(e.pointerId, { y: e.clientY, value }); onEvent("controlDown", id, value, e.pointerId); };
  const move = (e: PointerEvent<HTMLDivElement>) => { const start = active.current.get(e.pointerId); if (!start) return; const next = Math.max(0, Math.min(127, Math.round(start.value + (start.y - e.clientY) * .35))); setValue(next); onEvent("controlChange", id, next, e.pointerId); };
  const up = (e: PointerEvent<HTMLDivElement>, cancel = false) => { if (!active.current.has(e.pointerId)) return; active.current.delete(e.pointerId); onEvent(cancel ? "controlCancel" : "controlUp", id, value, e.pointerId); };
  return <div className={`hardware-knob ${color}`}><div className="knob-touch" onPointerDown={down} onPointerMove={move} onPointerUp={(e) => up(e)} onPointerCancel={(e) => up(e, true)}><div className="led-ring">{Array.from({ length: 13 }, (_, i) => <i key={i} style={{ transform: `rotate(${-135 + i * 22.5}deg)` }} />)}<div className="knob-cap" style={{ transform: `rotate(${-135 + value / 127 * 270}deg)` }}><b /></div></div></div><span>{label}</span></div>;
}

function Fader({ id, label, color = "cyan", initial = 64, onEvent }: { id: string; label: string; color?: Color; initial?: number; onEvent: ControlEvent }) {
  const [value, setValue] = useState(initial);
  const trackRef = useRef<HTMLDivElement>(null);
  const active = useRef<Map<number, { offsetY: number }>>(new Map());
  const HANDLE_HEIGHT = 18;

  const valueAtPointer = (pointerY: number, offsetY: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const topCenter = rect.top + HANDLE_HEIGHT / 2;
    const bottomCenter = rect.bottom - HANDLE_HEIGHT / 2;
    const usableTravel = bottomCenter - topCenter;
    const handleCenterY = pointerY - offsetY;
    const normalized = Math.max(0, Math.min(1, (bottomCenter - handleCenterY) / usableTravel));
    return Math.round(normalized * 127);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const currentCenter = rect.bottom - HANDLE_HEIGHT / 2 - (value / 127) * (rect.height - HANDLE_HEIGHT);
    const handleBottom = parseFloat((e.target as HTMLElement).closest(".fader-handle") ? "1" : "0");
    const offsetY = handleBottom ? e.clientY - currentCenter : 0;
    active.current.set(e.pointerId, { offsetY });
    const next = valueAtPointer(e.clientY, offsetY);
    setValue(next); onEvent("controlDown", id, next, e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const pointer = active.current.get(e.pointerId); if (!pointer) return;
    const next = valueAtPointer(e.clientY, pointer.offsetY);
    setValue(next); onEvent("controlChange", id, next, e.pointerId);
  };
  const up = (e: PointerEvent<HTMLDivElement>, cancel = false) => { if (!active.current.has(e.pointerId)) return; active.current.delete(e.pointerId); onEvent(cancel ? "controlCancel" : "controlUp", id, value, e.pointerId); };
  return <div className={`hardware-fader ${color}`}><div ref={trackRef} className="fader-touch" onPointerDown={down} onPointerMove={move} onPointerUp={(e) => up(e)} onPointerCancel={(e) => up(e, true)}><div className="fader-slot" /><div className="fader-handle" style={{ bottom: `calc(${value / 127} * (100% - ${HANDLE_HEIGHT}px))` }}><i /></div></div><span>{label}</span></div>;
}

function Grid({ id, rows, cols, rectangular = false, onEvent }: { id: string; rows: number; cols: number; rectangular?: boolean; onEvent: ControlEvent }) {
  return <div className={`pad-grid ${rectangular ? "wide" : ""}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>{Array.from({ length: rows * cols }, (_, i) => <Pad key={i} id={`${id}-${i + 1}`} color={colors[Math.floor(i / cols) % colors.length]} onEvent={onEvent} />)}</div>;
}

function Section({ className, title, children }: { className: string; title: string; children: React.ReactNode }) {
  return <section className={`console-section ${className}`}><h2>{title}</h2>{children}</section>;
}

export default function Home() {
  const activePointers = useRef<Map<number, string>>(new Map());
  const [pointerCount, setPointerCount] = useState(0);
  const onEvent = useCallback<ControlEvent>((type, id, _value, pointerId) => {
    if (type === "controlDown") activePointers.current.set(pointerId, id);
    if (type === "controlUp" || type === "controlCancel") activePointers.current.delete(pointerId);
    setPointerCount(activePointers.current.size);
  }, []);

  const qLabels = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const liveLabels = ["Anim Speed", "Size XY", "Cue-Sft Beat", "Ef-Sft Beat", "Brush Value", "Color", "Visible Points", "Brightness"];
  const liveKnobs = ["Cue Speed", "RotoZ Move", "Cue-Sft Clock", "Ef-Sft Clock", "Brush Shift", "Hue Shift", "Saturation", "Scanrate"];

  return <main className="stage"><div className="console">
    <div className="console-brand"><strong>BEYOND</strong><span>Performer Console</span></div>
    <Section className="aux-encoders" title="AUX Encoders: Size-Pos / RGBA / Channels 5-8"><div className="knob-row">{["AUX 1", "AUX 2", "AUX 3", "AUX 4"].map((x, i) => <Knob key={x} id={`AUX-${i + 1}`} label={x} color={i % 2 ? "green" : "red"} onEvent={onEvent} />)}</div></Section>
    <Section className="master-functions" title="Master Functions"><div className="button-row four">{["Physics", "Blackout", "Pause", "Enable / Disable"].map((x, i) => <Pad key={x} id={`MASTER-${i + 1}`} label={x} color={i === 3 ? "red" : "white"} onEvent={onEvent} />)}</div></Section>
    <Section className="grid-two" title="Grid 2 · QuickFX / Color Picker / Zone Selection / Keys"><Grid id="GRID2" rows={8} cols={8} onEvent={onEvent} /></Section>
    <Section className="grid-one" title="Grid 1 · Main Grid / Color-Delays / Zone Parameters / 2nd Workspace"><Grid id="GRID1" rows={6} cols={8} rectangular onEvent={onEvent} /></Section>
    <Section className="fx-actions" title="FX Action"><div className="mini-knobs">{[1, 2, 3, 4].map((x) => <Knob key={x} id={`FX-${x}`} label={String(x)} color="blue" onEvent={onEvent} />)}</div></Section>
    <Section className="channels" title="Channels"><div className="mini-knobs">{[1, 2, 3, 4].map((x) => <Knob key={x} id={`CHANNEL-${x}`} label={String(x)} color="white" onEvent={onEvent} />)}</div></Section>
    <Section className="layers" title="Layers"><div className="button-row four">{["Layer 1 Content", "Layer 2 Colors", "Layer 3 Zones", "Layer 4 Content 2"].map((x, i) => <Pad key={x} id={`LAYER-${i + 1}`} label={x} color="blue" onEvent={onEvent} />)}</div></Section>
    <Section className="bpm" title="BPM Functions"><div className="button-row four">{["Half", "Double", "Resync", "Tap"].map((x, i) => <Pad key={x} id={`BPM-${i + 1}`} label={x} color={i === 3 ? "blue" : "white"} onEvent={onEvent} />)}</div></Section>
    <Section className="color-channels" title="Color Channels"><div className="button-row four">{["CC1", "CC2", "CC3", "CC4"].map((x) => <Pad key={x} id={x} label={x} color="red" onEvent={onEvent} />)}</div></Section>
    <Section className="aux-buttons" title="AUX Button Panel · Grid UI / Preset Pallets / 2nd Grid"><div className="button-row eight">{Array.from({ length: 8 }, (_, i) => <Pad key={i} id={`AUX-B-${i + 1}`} label={String(i + 1)} color="white" onEvent={onEvent} />)}</div></Section>
    <Section className="selection" title="Content Selection Tools"><div className="selection-grid">{["Toggle", "Restart", "Flash", "Page Up", "One Cue", "Multi Cue", "Groups", "Page Down"].map((x, i) => <Pad key={x} id={`SELECT-${i + 1}`} label={x} color={i === 0 || i === 3 ? "green" : i === 7 ? "red" : "white"} onEvent={onEvent} />)}</div></Section>
    <Section className="qshift" title="Q-Shift"><div className="bank"><div className="bank-knobs">{qLabels.map((x, i) => <Knob key={x} id={`QK-${i + 1}`} label={x} color="white" onEvent={onEvent} />)}</div><div className="bank-faders">{qLabels.map((x, i) => <Fader key={x} id={`QF-${i + 1}`} label={x} color="white" initial={45 + i * 4} onEvent={onEvent} />)}</div></div></Section>
    <Section className="live-control" title="LIVE CONTROL EFFECTS"><div className="bank"><div className="bank-knobs">{liveKnobs.map((x, i) => <Knob key={x} id={`LK-${i + 1}`} label={x} color={i === 1 ? "blue" : i === 5 ? "red" : "purple"} onEvent={onEvent} />)}</div><div className="bank-faders">{liveLabels.map((x, i) => <Fader key={x} id={`LF-${i + 1}`} label={x} color={i === 1 ? "blue" : i === 5 ? "red" : "white"} initial={56 + i * 6} onEvent={onEvent} />)}</div></div></Section>
    <div className="touch-status">{pointerCount} TOUCH</div>
  </div></main>;
}
