import { CONTROL_MAP, getControl } from "./control-map";
import {
  FX_FEEDBACK,
  type Layer,
  type MidiBinding,
} from "./performer-midi";
import "./feedback-runtime";

type ControlEventType =
  | "controlDown"
  | "controlUp"
  | "controlCancel"
  | "controlChange"
  | string;

type TransportState = "disconnected" | "connecting" | "connected";
type FeedbackHealth = "unknown" | "alive" | "stale";

export type FeedbackVisualState = "empty" | "used" | "focused" | "playing";

export type FeedbackItem = {
  id: string;
  sourceId?: string;
  active?: boolean;
  value?: number;
  color?: string;
  raw?: number[];
  state?: FeedbackVisualState;
};

const FEEDBACK_CACHE_KEY = "beyondWingFeedbackCacheV3";
const MAIN_GRID_RELEASE_GUARD_MS = 450;
const FEEDBACK_EXPECT_TIMEOUT_MS = 1800;
const FEEDBACK_RECOVERY_COOLDOWN_MS = 3500;

let socket: WebSocket | null = null;
let state: TransportState = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;
let cacheLoaded = false;
let feedbackHealth: FeedbackHealth = "unknown";
let lastFeedbackAt = 0;
let lastControlAt = 0;
let lastRecoveryAt = 0;
let feedbackExpectTimer: number | null = null;
const feedbackCache = new Map<string, FeedbackItem>();
const mainGridLastOnAt = new Map<string, number>();

function isRelayMode(): boolean {
  return typeof window !== "undefined" && window.parent !== window;
}

function loadFeedbackCache() {
  if (cacheLoaded || typeof window === "undefined") return;
  cacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(FEEDBACK_CACHE_KEY);
    if (!raw) return;
    const items = JSON.parse(raw) as FeedbackItem[];
    if (!Array.isArray(items)) return;
    items.forEach((item) => item?.id && feedbackCache.set(item.id, item));
  } catch {
    // cache is optional
  }
}

function persistFeedbackCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FEEDBACK_CACHE_KEY,
      JSON.stringify(Array.from(feedbackCache.values())),
    );
  } catch {
    // live transport continues without storage
  }
}

function cacheFeedback(items: FeedbackItem[]) {
  loadFeedbackCache();
  items.forEach((item) => {
    const previous = feedbackCache.get(item.id);
    feedbackCache.set(item.id, { ...previous, ...item });
  });
  persistFeedbackCache();
}

function dispatchFeedback(items: FeedbackItem[]) {
  if (typeof window === "undefined" || items.length === 0) return;
  window.dispatchEvent(new CustomEvent("beyond-feedback", { detail: { controls: items } }));
}

export function getControlFeedback(id: string): FeedbackItem | undefined {
  loadFeedbackCache();
  return feedbackCache.get(id);
}

export function replayFeedback() {
  loadFeedbackCache();
  dispatchFeedback(Array.from(feedbackCache.values()));
}

function dispatchFeedbackHealth(next: FeedbackHealth, reason?: string) {
  feedbackHealth = next;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("beyond-feedback-health", {
      detail: {
        state: next,
        lastFeedbackAt,
        lastControlAt,
        reason,
      },
    }),
  );
}

function markFeedbackAlive() {
  lastFeedbackAt = Date.now();
  if (feedbackExpectTimer) {
    window.clearTimeout(feedbackExpectTimer);
    feedbackExpectTimer = null;
  }
  if (feedbackHealth !== "alive") dispatchFeedbackHealth("alive", "midi-feedback");
}

function recoverFeedbackTransport(reason: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastRecoveryAt < FEEDBACK_RECOVERY_COOLDOWN_MS) return;
  lastRecoveryAt = now;

  dispatchFeedbackHealth("stale", reason);

  if (isRelayMode()) {
    window.parent.postMessage(
      { source: "beyond-wing", type: "reconnect", reason },
      "*",
    );
    window.setTimeout(() => {
      window.parent.postMessage({ source: "beyond-wing", type: "hello" }, "*");
    }, 250);
    return;
  }

  if (socket) {
    try { socket.close(); } catch {}
  }
  socket = null;
  window.setTimeout(connectDirect, 250);
}

function expectFeedbackAfterControl() {
  if (typeof window === "undefined") return;
  lastControlAt = Date.now();
  const controlAt = lastControlAt;
  const feedbackSeenBeforeControl = lastFeedbackAt;

  if (feedbackExpectTimer) window.clearTimeout(feedbackExpectTimer);
  feedbackExpectTimer = window.setTimeout(() => {
    feedbackExpectTimer = null;
    if (lastControlAt !== controlAt) return;
    if (lastFeedbackAt > feedbackSeenBeforeControl && lastFeedbackAt >= controlAt) return;
    recoverFeedbackTransport("no-feedback-after-control");
  }, FEEDBACK_EXPECT_TIMEOUT_MS);
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
  if (next === "connected") {
    if (!lastFeedbackAt) dispatchFeedbackHealth("unknown", "bridge-connected");
    window.setTimeout(replayFeedback, 0);
  } else {
    dispatchFeedbackHealth("unknown", "bridge-disconnected");
  }
}

function normalizeBridgeAddress(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^wss?:\/\//i, "").replace(/\/+$/, "");
}

function ensureWsPath(address: string): string {
  const normalized = normalizeBridgeAddress(address);
  return normalized.includes("/") ? normalized : `${normalized}/ws`;
}

function directBridgeUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const saved = params.get("bridge") || window.localStorage.getItem("beyondBridge");
  if (saved) return `ws://${ensureWsPath(saved)}`;
  if (window.location.port === "8765") return `ws://${window.location.host}/ws`;
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
    "GRID-PAGE-UP": "TOOL-4",
    "GRID-ONE-CUE": "TOOL-5",
    "GRID-MULTI-CUE": "TOOL-6",
    "GRID-GROUPS": "TOOL-7",
    "GRID-PAGE-DOWN": "TOOL-8",
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

function feedbackColor(
  controlId: string,
  active: boolean,
  visualState?: FeedbackVisualState,
): string | undefined {
  if (!active && visualState !== "focused" && visualState !== "used") return undefined;
  if (controlId === "MASTER-BLACKOUT") return "#ff2448";
  if (controlId === "MASTER-PAUSE") return "#ffb020";
  if (controlId === "MASTER-ENABLE") return "#ff2448";

  // Do NOT hard-code cue/FX playing to cyan/blue. If BEYOND later supplies an
  // actual LED color decoder, FeedbackItem.color will carry it. Until then the
  // runtime uses a neutral bright fallback.
  if (visualState === "focused") return "#e7ebf4";
  if (visualState === "used") return "#8a919b";
  return undefined;
}

function getFxFeedbackState(controlId: string, value: number): FeedbackVisualState | undefined {
  const match = controlId.match(/^FX-L([1-4])-\d+$/);
  if (!match) return undefined;
  const layer = Number(match[1]) as Layer;
  const values = FX_FEEDBACK[layer];
  if (value === values.playing) return "playing";
  if (value === values.focused) return "focused";
  if (value === values.used) return "used";
  return "empty";
}

function isMainGridControl(controlId: string): boolean {
  return /^L[14]-GRID1-\d+$/.test(controlId);
}

function normalizeMainGridFeedback(
  controlId: string,
  value: number,
): { active: boolean; state: FeedbackVisualState; value: number } {
  const now = performance.now();
  const previous = feedbackCache.get(controlToUiIds(controlId)[0]);

  if (value > 0) {
    mainGridLastOnAt.set(controlId, now);
    return { active: true, state: "playing", value };
  }

  const lastOn = mainGridLastOnAt.get(controlId) ?? -Infinity;
  const looksLikeImmediateKeyRelease = now - lastOn <= MAIN_GRID_RELEASE_GUARD_MS;

  if (looksLikeImmediateKeyRelease && previous?.active) {
    return {
      active: true,
      state: previous.state ?? "playing",
      value: previous.value ?? 127,
    };
  }

  mainGridLastOnAt.delete(controlId);
  return { active: false, state: "empty", value: 0 };
}

function applyMidiFeedback(bytes: number[]) {
  if (typeof window === "undefined" || bytes.length < 3) return;
  markFeedbackAlive();

  const [status, number, rawValue] = bytes.map((n) => n & 0xff);
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const isNoteOff = command === 0x80 || (command === 0x90 && rawValue === 0);
  const value = isNoteOff ? 0 : rawValue;

  const type: MidiBinding["type"] | null =
    command === 0x90 || command === 0x80 ? "note" : command === 0xb0 ? "cc" : null;
  if (!type) return;

  const controls = Object.values(CONTROL_MAP)
    .filter(
      (entry) =>
        entry.midi &&
        entry.midi.type === type &&
        entry.midi.channel === channel &&
        entry.midi.number === number,
    )
    .flatMap((entry) => {
      const fxState = getFxFeedbackState(entry.id, value);
      const mainGrid = isMainGridControl(entry.id)
        ? normalizeMainGridFeedback(entry.id, value)
        : null;
      const visualState = fxState ?? mainGrid?.state;
      const active = mainGrid ? mainGrid.active : fxState ? fxState === "playing" : value > 0;
      const normalizedValue = mainGrid?.value ?? value;

      return controlToUiIds(entry.id).map((id) => ({
        id,
        sourceId: entry.id,
        active,
        value: normalizedValue,
        state: visualState,
        color: feedbackColor(entry.id, active, visualState),
        raw: bytes,
      } satisfies FeedbackItem));
    });

  window.dispatchEvent(new CustomEvent("beyond-raw-feedback", { detail: { midi: bytes, controls } }));
  if (controls.length) {
    cacheFeedback(controls);
    dispatchFeedback(controls);
  }
}

function handleBridgeMessage(raw: string) {
  try {
    const message = JSON.parse(raw) as { type?: string; midi?: number[] };
    if (message.type === "midi" && Array.isArray(message.midi)) applyMidiFeedback(message.midi);
  } catch {
    // diagnostic/non-json bridge message
  }
}

function installWindowListeners() {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  loadFeedbackCache();

  window.addEventListener("online", () => recoverFeedbackTransport("browser-online"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (isRelayMode()) window.parent.postMessage({ source: "beyond-wing", type: "hello" }, "*");
      else ensureBridgeTransport();
    }
  });

  window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as
      | { source?: string; type?: string; connected?: boolean; data?: string }
      | undefined;
    if (!message || message.source !== "beyond-wing-parent") return;
    if (message.type === "bridge-status") {
      dispatchTransportState(message.connected ? "connected" : "disconnected");
      return;
    }
    if (message.type === "bridge-message" && typeof message.data === "string") {
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
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  dispatchTransportState("connecting");
  try {
    socket = new WebSocket(url);
    socket.onopen = () => dispatchTransportState("connected");
    socket.onmessage = (event) => handleBridgeMessage(String(event.data));
    socket.onerror = () => dispatchTransportState("disconnected");
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
    window.parent.postMessage({ source: "beyond-wing", type: "hello" }, "*");
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
    "TOOL-4": "GRID-PAGE-UP",
    "TOOL-5": "GRID-ONE-CUE",
    "TOOL-6": "GRID-MULTI-CUE",
    "TOOL-7": "GRID-GROUPS",
    "TOOL-8": "GRID-PAGE-DOWN",
  };
  if (tools[id]) return tools[id];

  const auxEncoder = id.match(/^AUX-E([1-4])$/);
  if (auxEncoder) {
    const index = Number(auxEncoder[1]);
    if (layer === 2 || layer === 3) return `AUX-L${layer}-${index}`;
    return null;
  }

  if (/^LAYER-[1-4]$/.test(id)) return id;

  const grid1 = id.match(/^G1-(\d+)$/);
  if (grid1) {
    const cell = Number(grid1[1]);
    if ((layer === 1 || layer === 4) && cell >= 1 && cell <= 48) return `L${layer}-GRID1-${cell}`;
    return null;
  }

  const grid2 = id.match(/^G2-(\d+)$/);
  if (grid2) {
    const index = Number(grid2[1]);
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
  const clamped = Math.max(0, Math.min(127, Math.round(value)));
  const status = (binding.type === "note" ? 0x90 : 0xb0) + (binding.channel - 1);
  return [status, binding.number & 0x7f, clamped];
}

function sendMidi(midi: number[]): boolean {
  if (typeof window === "undefined") return false;
  if (isRelayMode()) {
    window.parent.postMessage({ source: "beyond-wing", type: "midi", midi }, "*");
    expectFeedbackAfterControl();
    return true;
  }
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    ensureBridgeTransport();
    return false;
  }
  socket.send(JSON.stringify({ type: "midi", midi }));
  expectFeedbackAfterControl();
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
    if (type === "controlDown") midiValue = 127;
    else if (type === "controlUp" || type === "controlCancel") midiValue = 0;
    else return false;
  } else {
    if (type === "controlUp" || type === "controlCancel") return true;
    if (type !== "controlDown" && type !== "controlChange") return false;
  }

  return sendMidi(toMidi(control.midi, midiValue));
}

export function configureBridge(hostPort: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("beyondBridge", normalizeBridgeAddress(hostPort));
  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
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
    feedback: feedbackHealth,
    lastFeedbackAt,
  };
}
