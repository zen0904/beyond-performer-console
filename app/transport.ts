import { getControl } from "./control-map";

export type ControlEventType =
  | "controlDown"
  | "controlChange"
  | "controlUp"
  | "controlCancel";

export type ControlEventPacket = {
  protocol: "beyond-performer/v1";
  type: "control";
  event: ControlEventType | string;
  id: string;
  value: number;
  pointerId: number;
  layer: 1 | 2 | 3 | 4;
  timestamp: number;
  control: ReturnType<typeof getControl> | null;
};

export type FeedbackItem = {
  id: string;
  value?: number;
  color?: string;
  active?: boolean;
  layer?: 1 | 2 | 3 | 4;
};

export type FeedbackPacket = {
  protocol: "beyond-performer/v1";
  type: "feedback";
  control?: FeedbackItem;
  controls?: FeedbackItem[];
};

export type TransportState = "offline" | "connecting" | "connected";

type StateListener = (state: TransportState) => void;

class BeyondTransport {
  private socket: WebSocket | null = null;
  private state: TransportState = "offline";
  private reconnectTimer: number | null = null;
  private queue: string[] = [];
  private listeners = new Set<StateListener>();
  private manuallyClosed = false;

  get connectionState(): TransportState {
    return this.state;
  }

  get bridgeUrl(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("beyondBridgeUrl");
  }

  setBridgeUrl(url: string | null) {
    if (typeof window === "undefined") return;

    if (url?.trim()) {
      window.localStorage.setItem("beyondBridgeUrl", url.trim());
    } else {
      window.localStorage.removeItem("beyondBridgeUrl");
    }

    this.disconnect();
    this.manuallyClosed = false;
    this.connect();
  }

  onState(listener: StateListener) {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  connect() {
    if (typeof window === "undefined") return;
    if (this.socket || this.state === "connecting") return;

    const url = this.bridgeUrl;
    if (!url) {
      this.setState("offline");
      return;
    }

    this.manuallyClosed = false;
    this.setState("connecting");

    try {
      const ws = new WebSocket(url);
      this.socket = ws;

      ws.addEventListener("open", () => {
        this.setState("connected");
        this.flushQueue();

        ws.send(
          JSON.stringify({
            protocol: "beyond-performer/v1",
            type: "hello",
            client: "ipad-pwa",
          }),
        );
      });

      ws.addEventListener("message", (event) => {
        this.handleIncoming(event.data);
      });

      ws.addEventListener("close", () => {
        this.socket = null;
        this.setState("offline");

        if (!this.manuallyClosed) {
          this.scheduleReconnect();
        }
      });
    } catch {
      this.socket = null;
      this.setState("offline");
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.manuallyClosed = true;

    if (typeof window !== "undefined" && this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.socket?.close();
    this.socket = null;
    this.setState("offline");
  }

  sendControl(args: {
    event: ControlEventType | string;
    id: string;
    value: number;
    pointerId: number;
    layer: 1 | 2 | 3 | 4;
  }) {
    if (typeof window === "undefined") return;

    const packet: ControlEventPacket = {
      protocol: "beyond-performer/v1",
      type: "control",
      event: args.event,
      id: args.id,
      value: args.value,
      pointerId: args.pointerId,
      layer: args.layer,
      timestamp: performance.now(),
      control: getControl(args.id) ?? null,
    };

    window.dispatchEvent(
      new CustomEvent("beyond-control-out", {
        detail: packet,
      }),
    );

    const payload = JSON.stringify(packet);

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
      return;
    }

    this.queue.push(payload);

    if (this.queue.length > 256) {
      this.queue.splice(0, this.queue.length - 256);
    }

    this.connect();
  }

  private handleIncoming(raw: unknown) {
    if (typeof window === "undefined") return;

    let message: FeedbackPacket;

    try {
      message =
        typeof raw === "string"
          ? (JSON.parse(raw) as FeedbackPacket)
          : (raw as FeedbackPacket);
    } catch {
      return;
    }

    if (
      message?.protocol !== "beyond-performer/v1" ||
      message?.type !== "feedback"
    ) {
      return;
    }

    const detail = Array.isArray(message.controls)
      ? { controls: message.controls }
      : message.control;

    if (!detail) return;

    window.dispatchEvent(
      new CustomEvent("beyond-feedback", {
        detail,
      }),
    );
  }

  private flushQueue() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const pending = this.queue.splice(0);

    for (const payload of pending) {
      this.socket.send(payload);
    }
  }

  private scheduleReconnect() {
    if (typeof window === "undefined") return;
    if (this.reconnectTimer !== null) return;
    if (!this.bridgeUrl) return;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1000);
  }

  private setState(next: TransportState) {
    if (this.state === next) return;

    this.state = next;

    for (const listener of this.listeners) {
      listener(next);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("beyond-transport-state", {
          detail: {
            state: next,
            url: this.bridgeUrl,
          },
        }),
      );
    }
  }
}

export const beyondTransport = new BeyondTransport();

if (typeof window !== "undefined") {
  queueMicrotask(() => {
    beyondTransport.connect();
  });
}
