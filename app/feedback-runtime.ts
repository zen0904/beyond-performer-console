type FeedbackItem = {
  id?: string;
  sourceId?: string;
  active?: boolean;
  value?: number;
  color?: string;
  raw?: number[];
};

type MonitorState = {
  connected: boolean;
  blackout: boolean;
  pause: boolean;
  lastEvent: string;
};

const monitor: MonitorState = {
  connected: false,
  blackout: false,
  pause: false,
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

function chip(
  label: string,
  active: boolean,
  activeColor: string,
): string {
  const bg = active ? activeColor : "rgba(255,255,255,.09)";
  const opacity = active ? "1" : ".62";

  return `<span style="
    padding:5px 8px;
    border-radius:7px;
    background:${bg};
    opacity:${opacity};
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
    `<span style="
      max-width:260px;
      overflow:hidden;
      text-overflow:ellipsis;
      padding:0 4px;
      opacity:.72;
    ">${monitor.lastEvent}</span>`,
  ].join("");
}

function clearSpecialButtonStyle(node: HTMLElement) {
  node.style.removeProperty("background");
  node.style.removeProperty("border-color");
  node.style.removeProperty("box-shadow");
  node.style.removeProperty("color");
}

function styleSpecialButton(
  node: HTMLElement,
  item: FeedbackItem,
) {
  const active = Boolean(item.active);

  if (item.id === "MASTER-2") {
    if (active) {
      node.style.background =
        "linear-gradient(180deg,#ff3154,#a90027)";
      node.style.borderColor = "#ff8196";
      node.style.boxShadow =
        "0 0 0 2px rgba(255,36,72,.45),0 0 24px rgba(255,36,72,.85)";
      node.style.color = "#fff";

      const label = node.querySelector("span");
      if (label) label.textContent = "BLACKOUT ON";
    } else {
      clearSpecialButtonStyle(node);

      const label = node.querySelector("span");
      if (label) label.textContent = "Blackout";
    }

    monitor.blackout = active;
  }

  if (item.id === "MASTER-3") {
    if (active) {
      node.style.background =
        "linear-gradient(180deg,#ffc44d,#a66100)";
      node.style.borderColor = "#ffe0a1";
      node.style.boxShadow =
        "0 0 0 2px rgba(255,176,32,.42),0 0 24px rgba(255,176,32,.82)";
      node.style.color = "#fff";

      const label = node.querySelector("span");
      if (label) label.textContent = "PAUSED";
    } else {
      clearSpecialButtonStyle(node);

      const label = node.querySelector("span");
      if (label) label.textContent = "Pause";
    }

    monitor.pause = active;
  }
}

function updateButton(
  node: HTMLElement,
  item: FeedbackItem,
) {
  if (typeof item.active === "boolean") {
    node.classList.toggle("beyond-active", item.active);
    node.classList.toggle("is-active", item.active);
  }

  if (item.color && item.active) {
    node.style.setProperty("--beyond-color", item.color);
    node.style.setProperty("--feedback-color", item.color);
    node.style.setProperty("--ring-color", item.color);
    node.classList.add("has-beyond-feedback");
  }

  styleSpecialButton(node, item);
}

function updateEncoder(node: HTMLElement, value: number) {
  const leds = Array.from(
    node.querySelectorAll<HTMLElement>(".enc-ring i"),
  );

  if (!leds.length) return;

  const clamped = Math.max(0, Math.min(127, value));
  const activeLed = Math.round(
    (clamped / 127) * (leds.length - 1),
  );

  leds.forEach((led, index) => {
    led.classList.toggle("on", index <= activeLed);
  });
}

function updateAbsoluteKnob(
  node: HTMLElement,
  value: number,
) {
  const cap = node.querySelector<HTMLElement>(".abs-cap");
  if (!cap) return;

  const clamped = Math.max(0, Math.min(127, value));
  const angle = -135 + (clamped / 127) * 270;
  cap.style.transform = `rotate(${angle}deg)`;
}

function updateFader(node: HTMLElement, value: number) {
  const clamped = Math.max(0, Math.min(127, value));
  const percent = (clamped / 127) * 100;

  const cap =
    node.querySelector<HTMLElement>(".fader-cap");
  const fill =
    node.querySelector<HTMLElement>(".fader-level-fill");

  if (cap) cap.style.top = `${100 - percent}%`;
  if (fill) fill.style.height = `${percent}%`;
}

function humanEvent(item: FeedbackItem): string {
  const value = item.value ?? 0;

  if (item.id === "MASTER-2") {
    return `BEYOND → BLACKOUT ${value > 0 ? "ON" : "OFF"}`;
  }

  if (item.id === "MASTER-3") {
    return `BEYOND → ${value > 0 ? "PAUSE ON" : "PAUSE OFF"}`;
  }

  if (item.sourceId === "BRIGHT") {
    return `BEYOND → BRIGHTNESS ${Math.round(
      (value / 127) * 100,
    )}%`;
  }

  return `BEYOND → ${item.sourceId ?? item.id} ${value}`;
}

function applyOne(item: FeedbackItem) {
  if (!item.id || typeof document === "undefined") return;

  const selector =
    `[data-control-id="${CSS.escape(item.id)}"]`;

  document
    .querySelectorAll<HTMLElement>(selector)
    .forEach((node) => {
      updateButton(node, item);

      if (typeof item.value !== "number") return;

      if (node.classList.contains("enc-unit")) {
        updateEncoder(node, item.value);
      }

      if (node.classList.contains("abs-unit")) {
        updateAbsoluteKnob(node, item.value);
      }

      if (node.classList.contains("fader-unit")) {
        updateFader(node, item.value);
      }
    });

  monitor.lastEvent = humanEvent(item);
  renderMonitor();
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
        detail?.wifi?.state === "connected" ||
        detail?.active === "wifi";

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

      if (
        "controls" in detail &&
        Array.isArray(detail.controls)
      ) {
        detail.controls.forEach(applyOne);
      } else {
        applyOne(detail as FeedbackItem);
      }
    }) as EventListener,
  );
}

install();
