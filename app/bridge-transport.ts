import { CONTROL_MAP, getControl } from "./control-map";
import type { Layer, MidiBinding } from "./performer-midi";

type ControlEventType =
  | "controlDown"
  | "controlUp"
  | "controlCancel"
  | "controlChange"
  | string;

type BridgeMidiMessage = {
  type?: string;
  midi?: number[];
};

let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let currentUrl = "";
let bridgeState: "disconnected" | "connecting" | "connected" = "disconnected";

function dispatchBridgeState() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("beyond-bridge-state", {
      detail: { state: bridgeState, url: currentUrl },
    }),
  );
}

function bridgeUrl(): string | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const explicit =
    params.get("bridge") || window.localStorage.getItem("beyondBridge");

  if (explicit) {
    const cleaned = explicit
      .replace(/^https?:\/\//, "")
      .replace(/^wss?:\/\//, "")
      .replace(/\/$/, "");
    return `ws://${cleaned}`;
  }

  // Preferred runtime: full UI served by BeyondBridge on port 8765.
  if (window.location.port === "8765") {
    return `ws://${window.location.host}`;
  }

  return null;
}

function scheduleReconnect() {
  if (retryTimer || typeof window === "undefined") return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    ensureBridgeSocket();
  }, 1200);
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
    .map((entry) => ({
      id: entry.id,
      active: value > 0,
      value,
    }));

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
    const msg = JSON.parse(raw) as BridgeMidiMessage;
    if (msg?.type === "midi" && Array.isArray(msg.midi)) {
      applyMidiFeedback(msg.midi);
    }
  } catch {
    // Ignore non-JSON diagnostics.
  }
}

export function ensureBridgeSocket(): WebSocket | null {
  if (typeof window === "undefined") return null;

  const url = bridgeUrl();
  if (!url) return null;

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING) &&
    currentUrl === url
  ) {
    return socket;
  }

  if (socket) {
    try {
      socket.close();
    } catch {}
    socket = null;
  }

  currentUrl = url;
  bridgeState = "connecting";
  dispatchBridgeState();

  try {
    socket = new WebSocket(url);

    socket.onopen = () => {
      bridgeState = "connected";
      dispatchBridgeState();
    };

    socket.onmessage = (event) => {
      handleBridgeMessage(String(event.data));
    };

    socket.onerror = () => {
      bridgeState = "disconnected";
      dispatchBridgeState();
    };

    socket.onclose = () => {
      socket = null;
      bridgeState = "disconnected";
      dispatchBridgeState();
      scheduleReconnect();
    };
  } catch {
    socket = null;
    bridgeState = "disconnected";
    dispatchBridgeState();
    scheduleReconnect();
  }

  return socket;
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

  if (/^LAYER-[1-4]$/.test(id)) return id;

  const g1 = id.match(/^G1-(\d+)$/);
  if (g1) {
    const cell = Number(g1[1]);
    if ((layer === 1 || layer === 4) && cell >= 1 && cell <= 48) {
      return `L${layer}-GRID1-${cell}`;
    }
    return null;
  }

  const g2 = id.match(/^G2-(\d+)$/);
  if (g2) {
    const index = Number(g2[1]);
    if (index >= 1 && index <= 64) {
      const fxLayer = (Math.floor((index - 1) / 16) + 1) as Layer;
      const cell = ((index - 1) % 16) + 1;
      return `FX-L${fxLayer}-${cell}`;
    }
  }

  if (getControl(id)) return id;
  return null;
}

function toMidi(binding: MidiBinding, value: number): number[] {
  const v = Math.max(0, Math.min(127, Math.round(value)));
  const status =
    (binding.type === "note" ? 0x90 : 0xb0) + (binding.channel - 1);

  return [status, binding.number & 0x7f, v];
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
    if (type === "controlDown") midiValue = 127;
    else if (type === "controlUp" || type === "controlCancel") midiValue = 0;
    else if (type !== "controlChange") return false;
  } else {
    if (type === "controlUp" || type === "controlCancel") return true;
    if (type !== "controlDown" && type !== "controlChange") return false;
  }

  const ws = ensureBridgeSocket();
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  const midi = toMidi(control.midi, midiValue);
  ws.send(JSON.stringify({ type: "midi", midi }));
  return true;
}

export function configureBridge(hostPort: string) {
  if (typeof window === "undefined") return;

  const cleaned = hostPort
    .replace(/^https?:\/\//, "")
    .replace(/^wss?:\/\//, "")
    .replace(/\/$/, "");

  window.localStorage.setItem("beyondBridge", cleaned);

  if (socket) {
    try {
      socket.close();
    } catch {}
    socket = null;
  }

  ensureBridgeSocket();
}
