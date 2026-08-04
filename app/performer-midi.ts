export type Layer = 1 | 2 | 3 | 4;

export type MidiBinding = {
  type: "note" | "cc";
  channel: number;
  number: number;
  layer?: Layer;
};

export const MAIN_GRID_NOTES = [
  0x10,0x11,0x12,0x13, 0x18,0x19,0x1A,0x1B,
  0x14,0x15,0x16,0x17, 0x1C,0x1D,0x1E,0x1F,
  0x20,0x21,0x22,0x23, 0x28,0x29,0x2A,0x2B,
  0x24,0x25,0x26,0x27, 0x2C,0x2D,0x2E,0x2F,
  0x30,0x31,0x32,0x33, 0x38,0x39,0x3A,0x3B,
  0x34,0x35,0x36,0x37, 0x3C,0x3D,0x3E,0x3F,
] as const;

export const LAYER_SWITCH_NOTES: Record<Layer, number> = {
  1: 0x40, 2: 0x41, 3: 0x42, 4: 0x43,
};

export const BUTTON_NOTES = {
  physics: 0x0C,
  blackout: 0x0D,
  pause: 0x0E,
  enableDisable: 0x0F,
  transition: 0x48,
  back: 0x4A,
  swap: 0x4B,
  tapTempo: 0x4D,
  bpmHalf: 0x44,
  bpmDouble: 0x45,
  bpmResync: 0x46,
  bpmTap: 0x47,
  toggle: 0x58,
  restart: 0x59,
  flash: 0x5A,
  oneCue: 0x5C,
  multiCue: 0x5D,
  groups: 0x5E,
} as const;

export const CC = {
  sizeX: 0x00,
  sizeY: 0x01,
  positionX: 0x02,
  positionY: 0x03,
  cueSpeed: 0x04,
  rotationZ: 0x05,
  channel16: 0x08,
  hueShift: 0x09,
  saturation: 0x0A,
  animationSpeed: 0x24,
  zoom: 0x25,
  cueShiftBeat: 0x26,
  effectShiftBeat: 0x27,
  beamBrush: 0x28,
  color: 0x29,
  visiblePoints: 0x2A,
  brightness: 0x2B,
} as const;

export const RGB_CC = {
  red: 0x00,
  green: 0x01,
  blue: 0x02,
  alpha: 0x03,
} as const;

export const FX_ACTION_CC = {
  action1: 0x01,
  action2: 0x02,
  action3: 0x03,
  action4: 0x04,
} as const;

export const CHANNEL_CC = {
  channel1: { channel: 2, cc: 0x05 },
  channel2: { channel: 2, cc: 0x06 },
  channel3: { channel: 2, cc: 0x07 },
  channel4: { channel: 2, cc: 0x08 },
  channel5: { channel: 1, cc: 0x00, layer: 3 as Layer },
  channel6: { channel: 1, cc: 0x01, layer: 3 as Layer },
  channel7: { channel: 1, cc: 0x02, layer: 3 as Layer },
  channel8: { channel: 1, cc: 0x03, layer: 3 as Layer },
  channel16: { channel: 1, cc: 0x08 },
} as const;

export function fxGridNote(layer: Layer, cell: number): number {
  if (cell < 1 || cell > 16) throw new Error("FX cell must be 1..16");
  return ((layer - 1) * 16) + cell;
}

export const FX_FEEDBACK = {
  1: { empty:0x00, used:0x16, focused:0x18, playing:0x7F },
  2: { empty:0x00, used:0x61, focused:0x62, playing:0x7F },
  3: { empty:0x00, used:0x37, focused:0x38, playing:0x7F },
  4: { empty:0x00, used:0x01, focused:0x02, playing:0x7F },
} as const;

export function mainGridBinding(cell: number, layer: 1|4): MidiBinding {
  if (cell < 1 || cell > 48) throw new Error("Grid cell must be 1..48");
  return { type:"note", channel:1, number:MAIN_GRID_NOTES[cell-1], layer };
}

export function fxGridBinding(layer: Layer, cell: number): MidiBinding {
  return { type:"note", channel:2, number:fxGridNote(layer, cell), layer };
}
