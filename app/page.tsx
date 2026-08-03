"use client";

import { PointerEvent, useCallback, useRef, useState } from "react";

type Layer = "MAIN" | "LIVE" | "FX" | "UTILITY";
type ButtonMode = "momentary" | "toggle" | "trigger";
type ActiveControl = { id: string; kind: "button" | "fader" | "encoder"; startY: number; startValue: number };

const COLORS = ["cyan", "magenta", "amber", "lime"] as const;

function ConsoleButton({ id, label, sublabel, mode = "momentary", color = "cyan", onEvent }: {
  id: string; label: string; sublabel?: string; mode?: ButtonMode; color?: typeof COLORS[number];
  onEvent: (type: string, id: string, value: number, pointerId: number) => void;
}) {
  const [activePointers, setActivePointers] = useState<Set<number>>(new Set());
  const [latched, setLatched] = useState(false);
  const down = activePointers.size > 0;

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setActivePointers((current) => new Set(current).add(event.pointerId));
    if (mode === "toggle") setLatched((value) => !value);
    onEvent("controlDown", id, 1, event.pointerId);
  };
  const release = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    setActivePointers((current) => { const next = new Set(current); next.delete(event.pointerId); return next; });
    onEvent(cancelled ? "controlCancel" : "controlUp", id, 0, event.pointerId);
  };

  return (
    <button className={`console-button ${color} ${down || latched ? "is-active" : ""}`} onPointerDown={press}
      onPointerUp={(e) => release(e)} onPointerCancel={(e) => release(e, true)} aria-pressed={mode === "toggle" ? latched : down}>
      <span className="button-lamp" />
      <strong>{label}</strong><small>{sublabel || mode.toUpperCase()}</small>
    </button>
  );
}

function VerticalFader({ id, label, initial = 64, color = "cyan", onEvent }: {
  id: string; label: string; initial?: number; color?: typeof COLORS[number];
  onEvent: (type: string, id: string, value: number, pointerId: number) => void;
}) {
  const [value, setValue] = useState(initial);
  const drag = useRef<Map<number, { startY: number; startValue: number }>>(new Map());
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const next = Math.round(127 - ((event.clientY - rect.top) / rect.height) * 127);
    const clamped = Math.max(0, Math.min(127, next));
    setValue(clamped); drag.current.set(event.pointerId, { startY: event.clientY, startValue: clamped });
    onEvent("controlDown", id, clamped, event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current.get(event.pointerId); if (!active) return;
    const next = Math.max(0, Math.min(127, Math.round(active.startValue + (active.startY - event.clientY) * .72)));
    setValue(next); onEvent("controlChange", id, next, event.pointerId);
  };
  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!drag.current.has(event.pointerId)) return; drag.current.delete(event.pointerId);
    onEvent(cancelled ? "controlCancel" : "controlUp", id, value, event.pointerId);
  };
  return <div className={`fader ${color}`}>
    <div className="fader-value">{String(value).padStart(3, "0")}</div>
    <div className="fader-track" onPointerDown={begin} onPointerMove={move} onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}>
      <div className="fader-fill" style={{ height: `${value / 1.27}%` }} /><div className="fader-cap" style={{ bottom: `calc(${value / 1.27}% - 11px)` }} />
      <div className="ticks" />
    </div><strong>{label}</strong><small>CC —</small>
  </div>;
}

function Encoder({ id, label, initial = 64, color = "magenta", onEvent }: {
  id: string; label: string; initial?: number; color?: typeof COLORS[number];
  onEvent: (type: string, id: string, value: number, pointerId: number) => void;
}) {
  const [value, setValue] = useState(initial);
  const drag = useRef<Map<number, { y: number; value: number }>>(new Map());
  const begin = (event: PointerEvent<HTMLDivElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current.set(event.pointerId, { y: event.clientY, value }); onEvent("controlDown", id, value, event.pointerId); };
  const move = (event: PointerEvent<HTMLDivElement>) => { const a = drag.current.get(event.pointerId); if (!a) return; const next = Math.max(0, Math.min(127, Math.round(a.value + (a.y - event.clientY) * .55))); setValue(next); onEvent("controlChange", id, next, event.pointerId); };
  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => { if (!drag.current.has(event.pointerId)) return; drag.current.delete(event.pointerId); onEvent(cancelled ? "controlCancel" : "controlUp", id, value, event.pointerId); };
  return <div className={`encoder ${color}`}><div className="encoder-value">{value}</div><div className="knob-wrap" onPointerDown={begin} onPointerMove={move} onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}>
    <div className="knob-ring" style={{ "--turn": `${-135 + value / 127 * 270}deg` } as React.CSSProperties}><div className="knob"><i /></div></div>
  </div><strong>{label}</strong><small>ENCODER</small></div>;
}

export default function Home() {
  const [layer, setLayer] = useState<Layer>("MAIN");
  const [activeCount, setActiveCount] = useState(0);
  const [lastEvent, setLastEvent] = useState("SYSTEM READY");
  const pointers = useRef<Map<number, ActiveControl>>(new Map());
  const handleEvent = useCallback((type: string, id: string, value: number, pointerId: number) => {
    if (type === "controlDown") pointers.current.set(pointerId, { id, kind: id.startsWith("F") ? "fader" : id.startsWith("E") ? "encoder" : "button", startY: 0, startValue: value });
    if (type === "controlUp" || type === "controlCancel") pointers.current.delete(pointerId);
    setActiveCount(pointers.current.size); setLastEvent(`${type.replace("control", "").toUpperCase()} · ${id} · ${Math.round(value)}`);
  }, []);
  return <main className="console-shell">
    <header className="topbar"><div className="brand-mark">B</div><div><p>PANGOLIN</p><h1>BEYOND <span>PERFORMER CONSOLE</span></h1></div>
      <div className="status-strip"><span className="status-dot" /><div><small>TOUCH ENGINE</small><b>ONLINE · {activeCount} ACTIVE</b></div></div>
      <div className="clock"><small>PHASE 1</small><b>DIGITAL TOUCH</b></div>
    </header>

    <section className="workspace">
      <aside className="layers"><div className="section-title"><span>01</span> LAYERS</div>{(["MAIN", "LIVE", "FX", "UTILITY"] as Layer[]).map((item, i) =>
        <button key={item} className={`layer-button ${layer === item ? "selected" : ""}`} onClick={() => setLayer(item)}><span>0{i + 1}</span><strong>{item}</strong><i /></button>)}
        <div className="connection"><span /><small>LOCAL MODE</small><b>NO MIDI</b></div>
      </aside>

      <section className="module performance"><div className="module-head"><div><span>02</span><h2>PERFORMANCE</h2></div><small>{layer} LAYER</small></div>
        <div className="button-grid">{["FLASH", "BLACKOUT", "STROBE", "FREEZE", "BEAM", "COLOR", "GOBO", "PRISM", "LASER", "ATMOS", "SCENE A", "SCENE B"].map((label, i) =>
          <ConsoleButton key={`${layer}-${label}`} id={`B${i + 1}`} label={label} mode={i === 1 ? "toggle" : i > 9 ? "trigger" : "momentary"} color={COLORS[i % 4]} onEvent={handleEvent} />)}</div>
        <div className="scene-row"><ConsoleButton id="B13" label="PREV" sublabel="CUE" color="amber" onEvent={handleEvent} /><div className="cue-display"><small>CURRENT CUE</small><b>001</b><span>OPENING LOOK</span></div><ConsoleButton id="B14" label="GO" sublabel="NEXT CUE" color="lime" onEvent={handleEvent} /></div>
      </section>

      <section className="module mix"><div className="module-head"><div><span>03</span><h2>MASTER MIX</h2></div><small>LEVELS</small></div>
        <div className="fader-bank"><VerticalFader id="F1" label="MASTER" initial={100} color="cyan" onEvent={handleEvent} /><VerticalFader id="F2" label="SPEED" initial={72} color="magenta" onEvent={handleEvent} /><VerticalFader id="F3" label="SIZE" initial={85} color="amber" onEvent={handleEvent} /><VerticalFader id="F4" label="DIMMER" initial={112} color="lime" onEvent={handleEvent} /></div>
      </section>

      <section className="module shape"><div className="module-head"><div><span>04</span><h2>SHAPE</h2></div><small>PARAMETERS</small></div>
        <div className="encoder-grid"><Encoder id="E1" label="POSITION" initial={64} color="cyan" onEvent={handleEvent} /><Encoder id="E2" label="ROTATION" initial={42} color="magenta" onEvent={handleEvent} /><Encoder id="E3" label="ZOOM" initial={90} color="amber" onEvent={handleEvent} /><Encoder id="E4" label="RATE" initial={76} color="lime" onEvent={handleEvent} /></div>
        <div className="event-monitor"><small>CONTROL EVENT</small><b>{lastEvent}</b><div>{Array.from({ length: 8 }).map((_, i) => <i key={i} className={i < activeCount ? "on" : ""} />)}</div></div>
      </section>
    </section>
    <footer><span>BEYOND PERFORMER CONSOLE</span><p>TOUCH-FIRST · POINTER CAPTURE · MULTI-CONTROL</p><b>v1.0 / DIGITAL</b></footer>
  </main>;
}
