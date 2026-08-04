import { CONTROL_MAP, getControl } from "./control-map";
import type { Layer, MidiBinding } from "./performer-midi";
import "./feedback-runtime";

type ControlEventType =
  | "controlDown"
  | "controlUp"
  | "controlCancel"
  | "controlChange"
  | string;

type TransportState = "disconnected" | "connecting" | "connected";

let socket: WebSocket | null = null;
let state: TransportState = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

function isRelayMode(): boolean {
  return typeof window !== "undefined" && window.parent !== window;
}

function dispatchTransportState(next: TransportState) {
  state = next;

  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("beyond-transport-state", {
      detail: {
        active: next === "connected" ? "wifi" : null,
        wifi: { state: next },
        usb: { state: "disabled" },
        mode: isRelayMode() ? "local-relay" : "direct",
      },
    }),
  );
}

function normalizeBridgeAddress(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "")
    .replace(/\/+$/, "");
}

function directBridgeUrl(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const saved =
    params.get("bridge") ||
    window.localStorage.getItem("beyondBridge");

  if (saved) {
    return `ws://${normalizeBridgeAddress(saved)}`;
  }

  if (window.location.port === "8765") {
    return `ws://${window.location.host}`;
  }

  return null;
}

function scheduleReconnect() {
  if (reconnectTimer || typeof window === "undefined") return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureBridgeTransport();
  }, 900);
}

function controlToUiIds(controlId: string): string[] {
  const fixed: Record<string, string> = {
    "MASTER-PHYSICS": "MASTER-1",
    "MASTER-BLACKOUT": "MASTER-2",
    "MASTER-PAUSE": "MASTER-3",
    "MASTER-ENABLE": "MASTER-4",

    "BPM-HALF": "BPM-1",
    "BPM-DOUBLE": "BPM-2",
    "BPM-RESYNC": "BPM-3",
    "BPM-TAP": "BPM-4",

    "GRID-TOGGLE": "TOOL-1",
    "GRID-RESTART": "TOOL-2",
    "GRID-FLASH": "TOOL-3",
    "GRID-ONE-CUE": "TOOL-5",
    "GRID-MULTI-CUE": "TOOL-6",
    "GRID-GROUPS": "TOOL-7",
  };

  if (fixed[controlId]) return [fixed[controlId]];

  const mainGrid = controlId.match(/^L[14]-GRID1-(\d+)$/);
  if (mainGrid) return [`G1-${mainGrid[1]}`];

  const fxGrid = controlId.match(/^FX-L([1-4])-(\d+)$/);
  if (fxGrid) {
    const layer = Number(fxGrid[1]);
    const cell = Number(fxGrid[2]);
    return [`G2-${(layer - 1) * 16 + cell}`];
  }

  const aux = controlId.match(/^AUX-L[23]-(\d+)$/);
  if (aux) return [`AUX-E${aux[1]}`];

  return [controlId];
}

function feedbackColor(controlId: string, value: number): string | undefined {
  if (value <= 0) return undefined;
  if (controlId === "MASTER-BLACKOUT") return "#ff2448";
  if (controlId === "MASTER-PAUSE") return "#ffb020";
  if (controlId === "MASTER-ENABLE") return "#2ad67d";
  if (controlId.startsWith("FX-L")) return "#34a8ff";
  return undefined;
}

function applyMidiFeedback(bytes: number[]) {
  if (typeof window === "undefined" || bytes.length < 3) return;

  const [status, number, value] = bytes.map((n) => n & 0xff);
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  const type: MidiBinding["type"] | null =
    command === 0x90 || command === 0x80
      ? "note"
      : command === 0xb0
        ? "cc"
        : null;

  if (!type) return;

  const controls = Object.values(CONTROL_MAP)
    .filter(
      (entry) =>
        entry.midi &&
        entry.midi.type === type &&
        entry.midi.channel === channel &&
        entry.midi.number === number,
    )
    .flatMap((entry) =>
      controlToUiIds(entry.id).map((id) => ({
        id,
        sourceId: entry.id,
        active: value > 0,
        value,
        color: feedbackColor(entry.id, value),
        raw: bytes,
      })),
    );

  window.dispatchEvent(
    new CustomEvent("beyond-raw-feedback", {
      detail: { midi: bytes, controls },
    }),
  );

  if (controls.length) {
    window.dispatchEvent(
      new CustomEvent("beyond-feedback", {
        detail: { controls },
      }),
    );
  }
}

function handleBridgeMessage(raw: string) {
  try {
    const message = JSON.parse(raw) as {
      type?: string;
      midi?: number[];
    };

    if (message.type === "midi" && Array.isArray(message.midi)) {
      applyMidiFeedback(message.midi);
    }
  } catch {
    // The bridge may also emit diagnostic strings.
  }
}

function installWindowListeners() {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;

  window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as
      | {
          source?: string;
          type?: string;
          connected?: boolean;
          data?: string;
        }
      | undefined;

    if (!message || message.source !== "beyond-wing-parent") return;

    if (message.type === "bridge-status") {
      dispatchTransportState(
        message.connected ? "connected" : "disconnected",
      );
      return;
    }

    if (
      message.type === "bridge-message" &&
      typeof message.data === "string"
    ) {
      handleBridgeMessage(message.data);
    }
  });
}

function connectDirect() {
  const url = directBridgeUrl();

  if (!url) {
    dispatchTransportState("disconnected");
    return;
  }

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  dispatchTransportState("connecting");

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      dispatchTransportState("connected");
    };

    socket.onmessage = (event) => {
      handleBridgeMessage(String(event.data));
    };

    socket.onerror = () => {
      dispatchTransportState("disconnected");
    };

    socket.onclose = () => {
      socket = null;
      dispatchTransportState("disconnected");
      scheduleReconnect();
    };
  } catch {
    socket = null;
    dispatchTransportState("disconnected");
    scheduleReconnect();
  }
}

export function ensureBridgeTransport() {
  if (typeof window === "undefined") return;

  installWindowListeners();

  if (isRelayMode()) {
    dispatchTransportState("connecting");

    window.parent.postMessage(
      {
        source: "beyond-wing",
        type: "hello",
      },
      "*",
    );

    return;
  }

  connectDirect();
}

function uiIdToControlId(id: string, layer: Layer): string | null {
  const master: Record<string, string> = {
    "MASTER-1": "MASTER-PHYSICS",
    "MASTER-2": "MASTER-BLACKOUT",
    "MASTER-3": "MASTER-PAUSE",
    "MASTER-4": "MASTER-ENABLE",
  };

  if (master[id]) return master[id];

  const bpm: Record<string, string> = {
    "BPM-1": "BPM-HALF",
    "BPM-2": "BPM-DOUBLE",
    "BPM-3": "BPM-RESYNC",
    "BPM-4": "BPM-TAP",
  };

  if (bpm[id]) return bpm[id];

  const tools: Record<string, string> = {
    "TOOL-1": "GRID-TOGGLE",
    "TOOL-2": "GRID-RESTART",
    "TOOL-3": "GRID-FLASH",
    "TOOL-5": "GRID-ONE-CUE",
    "TOOL-6": "GRID-MULTI-CUE",
    "TOOL-7": "GRID-GROUPS",
  };

  if (tools[id]) return tools[id];

  const auxEncoder = id.match(/^AUX-E([1-4])$/);
  if (auxEncoder) {
    const index = Number(auxEncoder[1]);

    if (layer === 2 || layer === 3) {
      return `AUX-L${layer}-${index}`;
    }

    return null;
  }

  if (/^LAYER-[1-4]$/.test(id)) return id;

  const grid1 = id.match(/^G1-(\d+)$/);
  if (grid1) {
    const cell = Number(grid1[1]);

    if (
      (layer === 1 || layer === 4) &&
      cell >= 1 &&
      cell <= 48
    ) {
      return `L${layer}-GRID1-${cell}`;
    }

    return null;
  }

  const grid2 = id.match(/^G2-(\d+)$/);
  if (grid2) {
    const index = Number(grid2[1]);

    if (index >= 1 && index <= 64) {
      const fxLayer =
        (Math.floor((index - 1) / 16) + 1) as Layer;
      const cell = ((index - 1) % 16) + 1;

      return `FX-L${fxLayer}-${cell}`;
    }
  }

  if (getControl(id)) return id;
  return null;
}

function toMidi(binding: MidiBinding, value: number): number[] {
  const clamped = Math.max(0, Math.min(127, Math.round(value)));
  const status =
    (binding.type === "note" ? 0x90 : 0xb0) +
    (binding.channel - 1);

  return [status, binding.number & 0x7f, clamped];
}

function sendMidi(midi: number[]): boolean {
  if (typeof window === "undefined") return false;

  if (isRelayMode()) {
    window.parent.postMessage(
      {
        source: "beyond-wing",
        type: "midi",
        midi,
      },
      "*",
    );

    return true;
  }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    ensureBridgeTransport();
    return false;
  }

  socket.send(JSON.stringify({ type: "midi", midi }));
  return true;
}

export function sendControlEvent(
  type: ControlEventType,
  uiId: string,
  value: number,
  layer: Layer,
): boolean {
  const controlId = uiIdToControlId(uiId, layer);
  if (!controlId) return false;

  const control = getControl(controlId);
  if (!control?.midi) return false;

  let midiValue = value;

  if (control.midi.type === "note") {
    if (type === "controlDown") {
      midiValue = 127;
    } else if (
      type === "controlUp" ||
      type === "controlCancel"
    ) {
      midiValue = 0;
    } else {
      return false;
    }
  } else {
    if (
      type === "controlUp" ||
      type === "controlCancel"
    ) {
      return true;
    }

    if (
      type !== "controlDown" &&
      type !== "controlChange"
    ) {
      return false;
    }
  }

  return sendMidi(toMidi(control.midi, midiValue));
}

export function configureBridge(hostPort: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    "beyondBridge",
    normalizeBridgeAddress(hostPort),
  );

  if (socket) {
    try {
      socket.close();
    } catch {
      // Nothing else to do.
    }
  }

  socket = null;
  ensureBridgeTransport();
}

export function getTransportSnapshot() {
  return {
    active: state === "connected" ? "wifi" : null,
    wifi: state,
    usb: "disabled",
    mode: isRelayMode() ? "local-relay" : "direct",
  };
}
