import {
  type Layer,
  type MidiBinding,
  LAYER_SWITCH_NOTES,
  BUTTON_NOTES,
  CC,
  mainGridBinding,
  fxGridBinding,
} from "./performer-midi";

export type ControlKind = "button" | "encoder" | "fader" | "grid";

export type ControlBinding = {
  id: string;
  kind: ControlKind;
  label: string;
  layer?: Layer;
  midi?: MidiBinding;
  feedback?: boolean;
};

export const CONTROL_MAP: Record<string, ControlBinding> = {};

function add(id:string, kind:ControlKind, label:string, midi?:MidiBinding, layer?:Layer) {
  CONTROL_MAP[id] = { id, kind, label, midi, layer, feedback:true };
}

// Master / transport buttons — verified from BEYOND 5.5.0 Build 2030.
add("MASTER-PHYSICS","button","Physics",{type:"note",channel:1,number:BUTTON_NOTES.physics});
add("MASTER-BLACKOUT","button","Blackout",{type:"note",channel:1,number:BUTTON_NOTES.blackout});
add("MASTER-PAUSE","button","Pause",{type:"note",channel:1,number:BUTTON_NOTES.pause});
add("MASTER-ENABLE","button","Enable / Disable",{type:"note",channel:1,number:BUTTON_NOTES.enableDisable});

add("GRID-TOGGLE","button","Toggle",{type:"note",channel:1,number:BUTTON_NOTES.toggle});
add("GRID-RESTART","button","Restart",{type:"note",channel:1,number:BUTTON_NOTES.restart});
add("GRID-FLASH","button","Flash",{type:"note",channel:1,number:BUTTON_NOTES.flash});
add("GRID-ONE-CUE","button","One Cue",{type:"note",channel:1,number:BUTTON_NOTES.oneCue});
add("GRID-MULTI-CUE","button","Multi Cue",{type:"note",channel:1,number:BUTTON_NOTES.multiCue});
add("GRID-GROUPS","button","Groups",{type:"note",channel:1,number:BUTTON_NOTES.groups});

add("BPM-HALF","button","Half",{type:"note",channel:1,number:BUTTON_NOTES.bpmHalf});
add("BPM-DOUBLE","button","Double",{type:"note",channel:1,number:BUTTON_NOTES.bpmDouble});
add("BPM-RESYNC","button","Resync",{type:"note",channel:1,number:BUTTON_NOTES.bpmResync});
add("BPM-TAP","button","Tap",{type:"note",channel:1,number:BUTTON_NOTES.bpmTap});

for (let layer=1 as Layer; layer<=4; layer=(layer+1) as Layer) {
  add(`LAYER-${layer}`,"button",`Layer ${layer}`,{type:"note",channel:1,number:LAYER_SWITCH_NOTES[layer]},layer);
}

// Known continuous controls.
add("LIVE-E1","encoder","Cue Speed",{type:"cc",channel:1,number:CC.cueSpeed});
add("LIVE-E2","encoder","RotoZ Move",{type:"cc",channel:1,number:CC.rotationZ});
add("LIVE-E6","encoder","Hue Shift",{type:"cc",channel:1,number:CC.hueShift});
add("LIVE-E7","encoder","Saturation",{type:"cc",channel:1,number:CC.saturation});

add("ANIM","fader","Anim Speed",{type:"cc",channel:1,number:CC.animationSpeed});
add("CUESFT","fader","Cue-Sft Beat",{type:"cc",channel:1,number:CC.cueShiftBeat});
add("EFSFT","fader","Ef-Sft Beat",{type:"cc",channel:1,number:CC.effectShiftBeat});
add("BRUSH","fader","Brush Value",{type:"cc",channel:1,number:CC.beamBrush});
add("COLOR","fader","Color",{type:"cc",channel:1,number:CC.color});
add("POINTS","fader","Visible Points",{type:"cc",channel:1,number:CC.visiblePoints});
add("BRIGHT","fader","Brightness",{type:"cc",channel:1,number:CC.brightness});

// Main Grid layer 1 + Secondary Grid layer 4.
for (let i=1;i<=48;i++) {
  add(`L1-GRID1-${i}`,"grid",`Main Grid ${i}`,mainGridBinding(i,1),1);
  add(`L4-GRID1-${i}`,"grid",`Secondary Grid ${i}`,mainGridBinding(i,4),4);
}

// FX 4x16.
for (let layer=1 as Layer; layer<=4; layer=(layer+1) as Layer) {
  for (let cell=1; cell<=16; cell++) {
    add(`FX-L${layer}-${cell}`,"grid",`FX L${layer} C${cell}`,fxGridBinding(layer,cell),layer);
  }
}

export function getControl(id:string):ControlBinding|undefined {
  return CONTROL_MAP[id];
}
