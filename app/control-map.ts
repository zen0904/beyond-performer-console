export type Layer = 1 | 2 | 3 | 4;
export type ControlKind = "button" | "encoder" | "fader" | "grid";
export type ButtonMode = "momentary" | "toggle" | "trigger";

export type MidiBinding = {
  type: "note" | "cc";
  channel?: number;
  number?: number;
};

export type ControlBinding = {
  id: string;
  kind: ControlKind;
  layer?: Layer;
  label: string;
  mode?: ButtonMode;
  midi?: MidiBinding;
  feedback?: boolean;
};

/*
 * BEYOND Performer Console functional control map.
 *
 * IMPORTANT:
 * Pangolin's documentation defines the console functions/layout, but the
 * supplied .BeyondMidiMap is a BEYOND-native mapping file. Do NOT invent
 * MIDI Note/CC numbers. Numeric bindings are intentionally left unset until
 * they are verified from BEYOND / MIDI monitoring.
 */

export const LAYER_NAMES: Record<Layer, string> = {
  1: "Content",
  2: "Colors",
  3: "Zones",
  4: "Content 2",
};

export const LAYER_FUNCTIONS = {
  1: {
    auxEncoders: "Geometric Live Effects",
    grid1: "Main Workspace",
    grid2: "QuickFX / Color Picker / Zone Selection / Keys",
    auxButtons: "Grid UI Options",
  },
  2: {
    auxEncoders: "Channels 5-8",
    grid1: "White+ Color / Cue-Sft Beat / Ef-Sft Beat Presets",
    grid2: "Color Channels 1-4 / Individual Color Selections",
    auxButtons: "Color Palette Presets",
  },
  3: {
    auxEncoders: "Channels 5-8",
    grid1: "Zone Flips / Selection Directionality / Groups",
    grid2: "Individual Zone Selections",
    auxButtons: "Zone User Presets",
  },
  4: {
    auxEncoders: "DMX Channel Outs 1-4",
    grid1: "2nd Workspace",
    grid2: "Keys 1 / 8×8 Grid",
    auxButtons: "2nd Workspace Functions",
  },
} as const;

export const LIVE_ENCODERS = [
  ["LIVE-E1", "Cue Speed"],
  ["LIVE-E2", "RotoZ Move"],
  ["LIVE-E3", "Cue-Sft Clock"],
  ["LIVE-E4", "Ef-Sft Clock"],
  ["LIVE-E5", "Brush Shift"],
  ["LIVE-E6", "Hue Shift"],
  ["LIVE-E7", "Saturation"],
  ["LIVE-E8", "Scanrate"],
] as const;

export const LIVE_FADERS = [
  ["ANIM", "Anim Speed"],
  ["SIZE", "Size XY"],
  ["CUESFT", "Cue-Sft Beat"],
  ["EFSFT", "Ef-Sft Beat"],
  ["BRUSH", "Brush Value"],
  ["COLOR", "Color"],
  ["POINTS", "Visible Points"],
  ["BRIGHT", "Brightness"],
] as const;

export const LIVE_ENCODER_FADER_PAIR: Record<string, string> = {
  "LIVE-E1": "ANIM",
  "LIVE-E2": "SIZE",
  "LIVE-E3": "CUESFT",
  "LIVE-E4": "EFSFT",
  "LIVE-E5": "BRUSH",
  "LIVE-E6": "COLOR",
  "LIVE-E7": "POINTS",
  "LIVE-E8": "BRIGHT",
};

export const MASTER_BUTTONS = [
  ["MASTER-PHYSICS", "Physics"],
  ["MASTER-BLACKOUT", "Blackout"],
  ["MASTER-PAUSE", "Pause"],
  ["MASTER-ENABLE", "Enable / Disable"],
] as const;

export const LAYER_BUTTONS = [
  ["LAYER-1", "Content"],
  ["LAYER-2", "Colors"],
  ["LAYER-3", "Zones"],
  ["LAYER-4", "Content 2"],
] as const;

export const BPM_BUTTONS = [
  ["BPM-HALF", "Half"],
  ["BPM-DOUBLE", "Double"],
  ["BPM-RESYNC", "Resync"],
  ["BPM-TAP", "Tap"],
] as const;

export const GRID_MODE_BUTTONS = [
  ["GRID-TOGGLE", "Toggle"],
  ["GRID-RESTART", "Restart"],
  ["GRID-FLASH", "Flash"],
  ["GRID-PAGE-UP", "Page Up"],
  ["GRID-ONE-CUE", "One Cue"],
  ["GRID-MULTI-CUE", "Multi Cue"],
  ["GRID-GROUPS", "Groups"],
  ["GRID-PAGE-DOWN", "Page Down"],
] as const;

export const COLOR_CHANNEL_IDS = [
  "COLOR-CH1",
  "COLOR-CH2",
  "COLOR-CH3",
  "COLOR-CH4",
] as const;

export const ZONE_GROUP_COLORS = {
  A: "orange",
  B: "teal",
  C: "aqua",
  D: "purple",
} as const;

export const ZONE_ORDER = [
  "L1", "L2", "L3", "L4", "R4", "R3", "R2", "R1",
] as const;

export const CONTROL_MAP: Record<string, ControlBinding> = {};

function add(
  id: string,
  kind: ControlKind,
  label: string,
  extra: Partial<ControlBinding> = {},
) {
  CONTROL_MAP[id] = {
    id,
    kind,
    label,
    feedback: true,
    ...extra,
  };
}

MASTER_BUTTONS.forEach(([id, label]) => add(id, "button", label));
LAYER_BUTTONS.forEach(([id, label]) =>
  add(id, "button", label, { mode: "toggle" }),
);
BPM_BUTTONS.forEach(([id, label]) => add(id, "button", label));
GRID_MODE_BUTTONS.forEach(([id, label]) => add(id, "button", label));
LIVE_ENCODERS.forEach(([id, label]) => add(id, "encoder", label));
LIVE_FADERS.forEach(([id, label]) => add(id, "fader", label));

for (let i = 1; i <= 4; i++) add(`AUX-E${i}`, "encoder", `AUX ${i}`);
for (let i = 1; i <= 16; i++) add(`AUX-B${i}`, "button", `AUX ${i}`);
for (let i = 1; i <= 4; i++) add(`CC${i}`, "button", `CC${i}`);
for (let i = 1; i <= 8; i++) add(`FX-E${i}`, "encoder", `FX ${i}`);
for (let i = 1; i <= 8; i++) add(`QSHIFT-E${i}`, "encoder", `Q-Shift ${i}`);
for (let i = 1; i <= 8; i++) add(`QSHIFT-F${i}`, "fader", `Q-Shift ${i}`);

for (let layer = 1 as Layer; layer <= 4; layer = (layer + 1) as Layer) {
  for (let i = 1; i <= 64; i++) {
    add(`L${layer}-GRID1-${i}`, "grid", `Grid 1 ${i}`, { layer });
    add(`L${layer}-GRID2-${i}`, "grid", `Grid 2 ${i}`, { layer });
  }
}

export function getControl(id: string): ControlBinding | undefined {
  return CONTROL_MAP[id];
}

export function setMidiBinding(id: string, midi: MidiBinding) {
  const control = CONTROL_MAP[id];
  if (!control) throw new Error(`Unknown control: ${id}`);
  control.midi = midi;
}
