import { CONTROL_MAP, getControl } from "./control-map";
import type { Layer, MidiBinding } from "./performer-midi";

type ControlEventType =
  | "controlDown"
  | "controlUp"
  | "controlCancel"
  | "controlChange"
  | string;

type LinkName = "usb" | "wifi";
type LinkState = "disabled" | "connecting" | "connected";

type Link = {
  name: LinkName;
  priority: number;
  url: string | null;
  socket: WebSocket | null;
  state: LinkState;
  stableSince: number;
  lastPong: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

const links: Record<LinkName, Link> = {
  usb: {
    name: "usb",
    priority: 1,
    url: null,
    socket: null,
    state: "disabled",
    stableSince: 0,
    lastPong: 0,
    reconnectTimer: null,
  },
  wifi: {
    name: "wifi",
    priority: 2,
    url: null,
    socket: null,
    state: "disabled",
    stableSince: 0,
    lastPong: 0,
    reconnectTimer: null,
  },
};

let activeLink: LinkName | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const USB_RETURN_STABLE_MS = 500;
const HEARTBEAT_MS = 800;
const PONG_TIMEOUT_MS = 2400;

function cleanEndpoint(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "")
    .replace(/\/+$/, "");
  return cleaned ? `ws://${cleaned}/ws` : null;
}

function loadEndpoints() {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);

  // Primary: Type-C / USB network interface.
  const usb =
    params.get("usb") ||
    window.localStorage.getItem("beyondUsbBridge");

  // Backup: Wi-Fi / LAN.
  const wifi =
    params.get("wifi") ||
    params.get("bridge") ||
    window.localStorage.getItem("beyondWifiBridge") ||
    window.localStorage.getItem("beyondBridge");

  links.usb.url = cleanEndpoint(usb);

  // When the page is itself served by BeyondBridge, that host is a valid
  // network path and is used as Wi-Fi/LAN fallback unless explicitly set.
  links.wifi.url =
    cleanEndpoint(wifi) ||
    (window.location.port === "8765"
      ? `ws://${window.location.host}/ws`
      : null);
}

function dispatchState() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("beyond-transport-state", {
      detail: {
        active: activeLink,
        usb: {
          state: links.usb.state,
          url: links.usb.url,
          lastPong: links.usb.lastPong,
        },
        wifi: {
          state: links.wifi.state,
          url: links.wifi.url,
          lastPong: links.wifi.lastPong,
        },
      },
    }),
  );
}

function isUsable(link: Link): boolean {
  return (
    link.state === "connected" &&
    !!link.socket &&
    link.socket.readyState === WebSocket.OPEN &&
    Date.now() - link.lastPong < PONG_TIMEOUT_MS
  );
}

function selectActive() {
  const now = Date.now();
  const usbReady =
    isUsable(links.usb) &&
    now - links.usb.stableSince >= USB_RETURN_STABLE_MS;
  const wifiReady = isUsable(links.wifi);

  const next: LinkName | null = usbReady
    ? "usb"
    : wifiReady
      ? "wifi"
      : null;

  if (next !== activeLink) {
    activeLink = next;
    dispatchState();
  }
}

function scheduleReconnect(link: Link) {
  if (link.reconnectTimer || !link.url) return;
  link.reconnectTimer = setTimeout(() => {
    link.reconnectTimer = null;
    connect(link);
  }, 700);
}

function parseBridgeMessage(link: Link, raw: string) {
  try {
    const msg = JSON.parse(raw) as {
      type?: string;
      ts?: number;
      midi?: number[];
    };

    if (msg.type === "pong") {
      link.lastPong = Date.now();
      if (!link.stableSince) link.stableSince = Date.now();
      selectActive();
      return;
    }

    // Only the ACTIVE transport is allowed to drive UI feedback.
    // This prevents duplicate feedback while both links are connected.
    if (
      link.name === activeLink &&
      msg.type === "midi" &&
      Array.isArray(msg.midi)
    ) {
      applyMidiFeedback(msg.midi);
    }
  } catch {
    // Ignore diagnostics/non-JSON strings.
  }
}

function connect(link: Link) {
  if (!link.url || typeof window === "undefined") {
    link.state = "disabled";
    dispatchState();
    return;
  }

  if (
    link.socket &&
    (link.socket.readyState === WebSocket.OPEN ||
      link.socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  link.state = "connecting";
  dispatchState();

  try {
    const ws = new WebSocket(link.url);
    link.socket = ws;

    ws.onopen = () => {
      link.state = "connected";
      link.lastPong = Date.now();
      link.stableSince = Date.now();
      try {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {}
      selectActive();
      dispatchState();
    };

    ws.onmessage = (event) => {
      parseBridgeMessage(link, String(event.data));
    };

    ws.onerror = () => {
      link.state = "connecting";
      dispatchState();
    };

    ws.onclose = () => {
      link.socket = null;
      link.state = "connecting";
      link.stableSince = 0;
      link.lastPong = 0;

      // If primary cable disappears, backup becomes active immediately.
      selectActive();
      dispatchState();
      scheduleReconnect(link);
    };
  } catch {
    link.socket = null;
    link.state = "connecting";
    scheduleReconnect(link);
  }
}

function startHeartbeat() {
  if (heartbeatTimer || typeof window === "undefined") return;

  heartbeatTimer = setInterval(() => {
    const now = Date.now();

    (Object.values(links) as Link[]).forEach((link) => {
      if (
        link.socket &&
        link.socket.readyState === WebSocket.OPEN
      ) {
        try {
          link.socket.send(JSON.stringify({ type: "ping", ts: now }));
        } catch {}
      }

      if (
        link.state === "connected" &&
        now - link.lastPong >= PONG_TIMEOUT_MS
      ) {
        try {
          link.socket?.close();
        } catch {}
      }
    });

    selectActive();
  }, HEARTBEAT_MS);
}

export function ensureBridgeTransport() {
  if (typeof window === "undefined") return;
  loadEndpoints();
  connect(links.usb);
  connect(links.wifi);
  startHeartbeat();
  selectActive();
}

export function configureDualBridge(
  usbHostPort: string | null,
  wifiHostPort: string | null,
) {
  if (typeof window === "undefined") return;

  if (usbHostPort) {
    window.localStorage.setItem("beyondUsbBridge", usbHostPort);
  } else {
    window.localStorage.removeItem("beyondUsbBridge");
  }

  if (wifiHostPort) {
    window.localStorage.setItem("beyondWifiBridge", wifiHostPort);
  } else {
    window.localStorage.removeItem("beyondWifiBridge");
  }

  (Object.values(links) as Link[]).forEach((link) => {
    try {
      link.socket?.close();
    } catch {}
    link.socket = null;
    link.state = "disabled";
    link.stableSince = 0;
    link.lastPong = 0;
  });

  activeLink = null;
  loadEndpoints();
  connect(links.usb);
  connect(links.wifi);
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
    if (
      (layer === 1 || layer === 4) &&
      cell >= 1 &&
      cell <= 48
    ) {
      return `L${layer}-GRID1-${cell}`;
    }
    return null;
  }

  const g2 = id.match(/^G2-(\d+)$/);
  if (g2) {
    const index = Number(g2[1]);
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
  const v = Math.max(0, Math.min(127, Math.round(value)));
  const status =
    (binding.type === "note" ? 0x90 : 0xb0) +
    (binding.channel - 1);
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
    else if (
      type === "controlUp" ||
      type === "controlCancel"
    )
      midiValue = 0;
    else if (type !== "controlChange") return false;
  } else {
    if (
      type === "controlUp" ||
      type === "controlCancel"
    )
      return true;
    if (
      type !== "controlDown" &&
      type !== "controlChange"
    )
      return false;
  }

  selectActive();

  const link = activeLink ? links[activeLink] : null;
  const ws = link?.socket;

  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  const midi = toMidi(control.midi, midiValue);

  // Exactly ONE active link sends the command.
  // The standby link never mirrors the command, preventing double triggers.
  ws.send(
    JSON.stringify({
      type: "midi",
      midi,
      transport: activeLink,
    }),
  );

  return true;
}

export function getTransportSnapshot() {
  return {
    active: activeLink,
    usb: links.usb.state,
    wifi: links.wifi.state,
  };
}
