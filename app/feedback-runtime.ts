type FeedbackVisualState = "empty" | "used" | "focused" | "playing";

type FeedbackItem = {
  id?: string;
  sourceId?: string;
  active?: boolean;
  value?: number;
  color?: string;
  raw?: number[];
  state?: FeedbackVisualState;
};

type MonitorState = {
  connected: boolean;
  blackout: boolean;
  pause: boolean;
  feedbackHealth: "unknown" | "alive" | "stale";
  lastEvent: string;
};

const monitor: MonitorState = {
  connected: false,
  blackout: false,
  pause: false,
  feedbackHealth: "unknown",
  lastEvent: "Waiting for BEYOND feedback",
};

let monitorRoot: HTMLDivElement | null = null;
let styleRoot: HTMLStyleElement | null = null;

function ensureRuntimeStyles() {
  if (styleRoot || typeof document === "undefined") return;
  styleRoot = document.createElement("style");
  styleRoot.id = "beyond-wing-feedback-v09";
  styleRoot.textContent = `
    /* Idle key = translucent/frosted white, not solid white. */
    .pad {
      background: linear-gradient(180deg, rgba(245,246,240,.58), rgba(174,180,172,.38)) !important;
      border-color: rgba(255,255,255,.28) !important;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.28), 0 2px 3px rgba(0,0,0,.65) !important;
    }
    .pad::after {
      background: rgba(242,244,238,.34) !important;
      box-shadow: inset 0 0 7px rgba(255,255,255,.24) !important;
    }

    /* Local touch is only transient and must never override BEYOND state. */
    .pad.is-active:not(.has-beyond-feedback)::after {
      background: rgba(85,216,255,.72) !important;
      box-shadow: 0 0 10px rgba(85,216,255,.7), inset 0 0 8px rgba(255,255,255,.75) !important;
    }
    .pad.has-beyond-feedback.is-active::before { display:none !important; }

    .pad.has-beyond-feedback {
      background: linear-gradient(180deg,
        color-mix(in srgb, var(--feedback-color, #f3f5ef) 82%, white 18%),
        color-mix(in srgb, var(--feedback-color, #f3f5ef) 58%, black 42%)) !important;
      border-color: color-mix(in srgb, var(--feedback-color, #f3f5ef) 70%, white 30%) !important;
      box-shadow:
        0 0 0 1px color-mix(in srgb, var(--feedback-color, #f3f5ef) 66%, transparent),
        0 0 17px color-mix(in srgb, var(--feedback-color, #f3f5ef) 72%, transparent) !important;
    }
    .pad.has-beyond-feedback::after {
      background: color-mix(in srgb, var(--feedback-color, #f3f5ef) 78%, white 22%) !important;
      opacity:.96 !important;
      box-shadow: inset 0 0 7px rgba(255,255,255,.66), 0 0 10px var(--feedback-color, #f3f5ef) !important;
    }

    .pad.feedback-used {
      opacity:.72 !important;
      box-shadow: inset 0 -3px 0 rgba(138,145,155,.92) !important;
    }
    .pad.feedback-focused {
      opacity:.93 !important;
      border-color:#f4f6ff !important;
      box-shadow: inset 0 0 0 2px rgba(244,246,255,.9) !important;
    }
    .pad.feedback-playing { opacity:1 !important; }

    /* LED ring values: normal feedback = bright grey-white, direct touch = cyan. */
    .enc-ring i.on { background:#bac4b9 !important; box-shadow:0 0 4px rgba(225,235,225,.75) !important; opacity:.9 !important; }
    .enc-unit.touching .enc-ring i.on { background:#55d8ff !important; box-shadow:0 0 7px #55d8ff !important; opacity:1 !important; }
  `;
  document.head.appendChild(styleRoot);
}

function ensureMonitor() {
  if (monitorRoot || typeof document === "undefined") return;
  monitorRoot = document.createElement("div");
  monitorRoot.id = "beyond-wing-monitor";
  Object.assign(monitorRoot.style, {
    position: "fixed",
    top: "8px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    display: "flex",
    gap: "6px",
    alignItems: "center",
    padding: "5px 8px",
    borderRadius: "10px",
    background: "rgba(5, 8, 14, 0.88)",
    border: "1px solid rgba(255,255,255,.18)",
    boxShadow: "0 8px 24px rgba(0,0,0,.36)",
    color: "#ffffff",
    font: "700 11px/1.1 system-ui, -apple-system, sans-serif",
    pointerEvents: "none",
    backdropFilter: "blur(10px)",
    whiteSpace: "nowrap",
  });
  document.body.appendChild(monitorRoot);
  renderMonitor();
}

function chip(label: string, active: boolean, activeColor: string): string {
  const bg = active ? activeColor : "rgba(255,255,255,.09)";
  const opacity = active ? "1" : ".62";
  return `<span style="padding:5px 8px;border-radius:7px;background:${bg};opacity:${opacity}">${label}</span>`;
}

function renderMonitor() {
  ensureMonitor();
  if (!monitorRoot) return;
  monitorRoot.innerHTML = [
    chip(monitor.connected ? "BRIDGE CONNECTED" : "BRIDGE OFF", monitor.connected, "#138a52"),
    chip(monitor.blackout ? "BLACKOUT ON" : "BLACKOUT OFF", monitor.blackout, "#d7193f"),
    chip(monitor.pause ? "PAUSED" : "RUNNING", monitor.pause, "#c57a00"),
    chip(
      monitor.feedbackHealth === "stale" ? "FEEDBACK STALE" : monitor.feedbackHealth === "alive" ? "FEEDBACK LIVE" : "FEEDBACK ?",
      monitor.feedbackHealth === "alive",
      monitor.feedbackHealth === "stale" ? "#b51d32" : "#176f9a",
    ),
    `<span style="max-width:260px;overflow:hidden;text-overflow:ellipsis;padding:0 4px;opacity:.72">${monitor.lastEvent}</span>`,
  ].join("");
}

function clearFeedbackStyle(node: HTMLElement) {
  node.classList.remove(
    "beyond-active",
    "has-beyond-feedback",
    "feedback-empty",
    "feedback-used",
    "feedback-focused",
    "feedback-playing",
  );
  node.style.removeProperty("--beyond-color");
  node.style.removeProperty("--feedback-color");
  node.style.removeProperty("--ring-color");
  node.removeAttribute("data-feedback-state");
}

function applyFeedbackColor(node: HTMLElement, color?: string) {
  const resolved = color || "#f3f5ef";
  node.style.setProperty("--beyond-color", resolved);
  node.style.setProperty("--feedback-color", resolved);
  node.style.setProperty("--ring-color", resolved);
}

function styleMasterButton(node: HTMLElement, item: FeedbackItem) {
  const active = Boolean(item.active);
  clearFeedbackStyle(node);

  if (active) {
    node.classList.add("beyond-active", "has-beyond-feedback", "feedback-playing");
    if (item.id === "MASTER-2") applyFeedbackColor(node, "#ff2448");
    if (item.id === "MASTER-3") applyFeedbackColor(node, "#ffb020");
    if (item.id === "MASTER-4") applyFeedbackColor(node, "#ff2448");
  }

  const label = node.querySelector("span");
  if (item.id === "MASTER-2") {
    if (label) label.textContent = active ? "BLACKOUT ON" : "Blackout";
    monitor.blackout = active;
  }
  if (item.id === "MASTER-3") {
    if (label) label.textContent = active ? "PAUSED" : "Pause";
    monitor.pause = active;
  }
  if (item.id === "MASTER-4" && label) {
    label.textContent = active ? "LASER ENABLED" : "Enable / Disable";
  }
}

function styleStateButton(node: HTMLElement, item: FeedbackItem) {
  const visualState = item.state ?? (item.active ? "playing" : "empty");
  clearFeedbackStyle(node);
  node.setAttribute("data-feedback-state", visualState);
  node.classList.add(`feedback-${visualState}`);

  if (visualState === "playing") {
    node.classList.add("beyond-active", "has-beyond-feedback");
    applyFeedbackColor(node, item.color);
    return;
  }
  if (visualState === "focused") {
    node.classList.add("has-beyond-feedback");
    applyFeedbackColor(node, item.color || "#e7ebf4");
    return;
  }
  if (visualState === "used") {
    node.classList.add("has-beyond-feedback");
    applyFeedbackColor(node, item.color || "#8a919b");
  }
}

function styleOrdinaryButton(node: HTMLElement, item: FeedbackItem) {
  const active = Boolean(item.active);
  clearFeedbackStyle(node);
  if (!active) return;
  node.classList.add("beyond-active", "has-beyond-feedback", "feedback-playing");
  applyFeedbackColor(node, item.color);
}

function humanEvent(item: FeedbackItem): string {
  const value = item.value ?? 0;
  if (item.id === "MASTER-2") return `BEYOND → BLACKOUT ${value > 0 ? "ON" : "OFF"}`;
  if (item.id === "MASTER-3") return `BEYOND → ${value > 0 ? "PAUSE ON" : "PAUSE OFF"}`;
  if (item.id === "MASTER-4") return `BEYOND → LASER ${value > 0 ? "ENABLED" : "DISABLED"}`;
  if (item.state) return `BEYOND → ${item.sourceId ?? item.id} ${item.state.toUpperCase()}`;
  if (item.sourceId === "BRIGHT") return `BEYOND → BRIGHTNESS ${Math.round((value / 127) * 100)}%`;
  return `BEYOND → ${item.sourceId ?? item.id} ${value}`;
}

function applyOne(item: FeedbackItem) {
  if (!item.id || typeof document === "undefined") return;
  const selector = `[data-control-id="${CSS.escape(item.id)}"]`;
  document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
    if (item.id === "MASTER-2" || item.id === "MASTER-3" || item.id === "MASTER-4") {
      styleMasterButton(node, item);
      return;
    }
    if (item.sourceId?.startsWith("FX-L") || item.state) {
      styleStateButton(node, item);
      return;
    }
    if (node.classList.contains("pad")) styleOrdinaryButton(node, item);
  });
  monitor.lastEvent = humanEvent(item);
  renderMonitor();
}

function install() {
  if (typeof window === "undefined") return;
  const ready = () => {
    ensureRuntimeStyles();
    ensureMonitor();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();

  window.addEventListener(
    "beyond-transport-state",
    ((event: Event) => {
      const detail = (event as CustomEvent).detail;
      monitor.connected = detail?.wifi?.state === "connected" || detail?.active === "wifi";
      renderMonitor();
    }) as EventListener,
  );


  window.addEventListener(
    "beyond-feedback-health",
    ((event: Event) => {
      const detail = (event as CustomEvent).detail;
      monitor.feedbackHealth = detail?.state ?? "unknown";
      if (monitor.feedbackHealth === "stale") {
        monitor.lastEvent = "Feedback stalled · reconnect requested";
      }
      renderMonitor();
    }) as EventListener,
  );

  window.addEventListener(
    "beyond-feedback",
    ((event: Event) => {
      const detail = (event as CustomEvent).detail as FeedbackItem | { controls?: FeedbackItem[] } | undefined;
      if (!detail) return;
      if ("controls" in detail && Array.isArray(detail.controls)) detail.controls.forEach(applyOne);
      else applyOne(detail as FeedbackItem);
    }) as EventListener,
  );
}

install();
