type FeedbackItem = {
  id?: string;
  active?: boolean;
  value?: number;
  color?: string;
};

function setButtonState(node: HTMLElement, item: FeedbackItem) {
  if (typeof item.active === "boolean") {
    node.classList.toggle("beyond-active", item.active);
    node.classList.toggle("is-active", item.active);
  }
}

function setEncoderValue(node: HTMLElement, value: number) {
  const leds = Array.from(node.querySelectorAll<HTMLElement>(".enc-ring i"));
  if (!leds.length) return;

  const activeLed = Math.round((Math.max(0, Math.min(127, value)) / 127) * (leds.length - 1));
  leds.forEach((led, index) => led.classList.toggle("on", index <= activeLed));
  node.dataset.feedbackValue = String(value);
}

function setAbsoluteKnobValue(node: HTMLElement, value: number) {
  const cap = node.querySelector<HTMLElement>(".abs-cap");
  if (!cap) return;

  const normalized = Math.max(0, Math.min(127, value)) / 127;
  const angle = -135 + normalized * 270;
  cap.style.transform = `rotate(${angle}deg)`;
  node.dataset.feedbackValue = String(value);
}

function setFaderValue(node: HTMLElement, value: number) {
  const clamped = Math.max(0, Math.min(127, value));
  const pct = (clamped / 127) * 100;

  const cap = node.querySelector<HTMLElement>(".fader-cap");
  const fill = node.querySelector<HTMLElement>(".fader-level-fill");

  if (cap) cap.style.top = `${100 - pct}%`;
  if (fill) fill.style.height = `${pct}%`;
  node.dataset.feedbackValue = String(value);
}

function applyColor(node: HTMLElement, color?: string) {
  if (!color) return;
  node.style.setProperty("--beyond-color", color);
  node.style.setProperty("--ring-color", color);
  node.style.setProperty("--feedback-color", color);
  node.classList.add("has-beyond-feedback");
}

function applyOne(item: FeedbackItem) {
  if (!item.id) return;

  const selector = `[data-control-id="${CSS.escape(item.id)}"]`;
  const nodes = document.querySelectorAll<HTMLElement>(selector);

  nodes.forEach((node) => {
    setButtonState(node, item);
    applyColor(node, item.color);

    if (typeof item.value !== "number") return;

    if (node.classList.contains("enc-unit")) {
      setEncoderValue(node, item.value);
    } else if (node.classList.contains("abs-unit")) {
      setAbsoluteKnobValue(node, item.value);
    } else if (node.classList.contains("fader-unit")) {
      setFaderValue(node, item.value);
    }
  });
}

function installFeedbackRuntime() {
  if (typeof window === "undefined") return;

  window.addEventListener("beyond-feedback", ((event: Event) => {
    const detail = (event as CustomEvent).detail as
      | FeedbackItem
      | { controls?: FeedbackItem[] }
      | undefined;

    if (!detail) return;

    if ("controls" in detail && Array.isArray(detail.controls)) {
      detail.controls.forEach(applyOne);
    } else {
      applyOne(detail as FeedbackItem);
    }
  }) as EventListener);
}

installFeedbackRuntime();
