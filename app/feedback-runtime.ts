type FeedbackVisualState =
  | "empty"
  | "used"
  | "focused"
  | "playing";

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
  enable: boolean;
  lastEvent: string;
};

const monitor: MonitorState = {
  connected: false,
  blackout: false,
  pause: false,
  enable: false,
  lastEvent: "Waiting for BEYOND feedback",
};

let monitorRoot: HTMLDivElement | null = null;

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
  return `<span style="
    padding:5px 8px;
    border-radius:7px;
    background:${active ? activeColor : "rgba(255,255,255,.09)"};
    opacity:${active ? "1" : ".62"};
  ">${label}</span>`;
}

function renderMonitor() {
  ensureMonitor();
  if (!monitorRoot) return;

  monitorRoot.innerHTML = [
    chip(
      monitor.connected ? "BRIDGE CONNECTED" : "BRIDGE OFF",
      monitor.connected,
      "#138a52",
    ),
    chip(
      monitor.blackout ? "BLACKOUT ON" : "BLACKOUT OFF",
      monitor.blackout,
      "#d7193f",
    ),
    chip(
      monitor.pause ? "PAUSED" : "RUNNING",
      monitor.pause,
      "#c57a00",
    ),
    chip(
      monitor.enable ? "LASER ENABLED" : "LASER DISABLED",
      monitor.enable,
      "#d7193f",
    ),
    `<span style="
      max-width:300px;
      overflow:hidden;
      text-overflow:ellipsis;
      padding:0 4px;
      opacity:.72;
    ">${monitor.lastEvent}</span>`,
  ].join("");
}

function humanEvent(item: FeedbackItem): string {
  const value = item.value ?? 0;

  if (item.id === "MASTER-2") return `BEYOND → BLACKOUT ${value > 0 ? "ON" : "OFF"}`;
  if (item.id === "MASTER-3") return `BEYOND → ${value > 0 ? "PAUSE ON" : "PAUSE OFF"}`;
  if (item.id === "MASTER-4") return `BEYOND → LASER ${value > 0 ? "ENABLED" : "DISABLED"}`;
  if (item.state) return `BEYOND → ${item.sourceId ?? item.id} ${item.state.toUpperCase()}`;
  if (item.sourceId === "BRIGHT") {
    return `BEYOND → BRIGHTNESS ${Math.round((value / 127) * 100)}%`;
  }
  return `BEYOND → ${item.sourceId ?? item.id} ${value}`;
}

function observe(item: FeedbackItem) {
  if (item.id === "MASTER-2") monitor.blackout = Boolean(item.active);
  if (item.id === "MASTER-3") monitor.pause = Boolean(item.active);
  if (item.id === "MASTER-4") monitor.enable = Boolean(item.active);
  monitor.lastEvent = humanEvent(item);
}

function install() {
  if (typeof window === "undefined") return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureMonitor);
  } else {
    ensureMonitor();
  }

  window.addEventListener(
    "beyond-transport-state",
    ((event: Event) => {
      const detail = (event as CustomEvent).detail;
      monitor.connected =
        detail?.wifi?.state === "connected" || detail?.active === "wifi";
      renderMonitor();
    }) as EventListener,
  );

  window.addEventListener(
    "beyond-feedback",
    ((event: Event) => {
      const detail = (event as CustomEvent).detail as
        | FeedbackItem
        | { controls?: FeedbackItem[] }
        | undefined;

      if (!detail) return;

      if ("controls" in detail && Array.isArray(detail.controls)) {
        detail.controls.forEach(observe);
      } else {
        observe(detail as FeedbackItem);
      }

      renderMonitor();
    }) as EventListener,
  );
}

install();
