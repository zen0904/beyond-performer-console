import {
  type Layer,
  type MidiBinding,
  LAYER_SWITCH_NOTES,
  BUTTON_NOTES,
  CC,
  RGB_CC,
  FX_ACTION_CC,
  CHANNEL_CC,
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

// Master + global buttons
add("MASTER-PHYSICS","button","Physics",{type:"note",channel:1,number:BUTTON_NOTES.physics});
add("MASTER-BLACKOUT","button","Blackout",{type:"note",channel:1,number:BUTTON_NOTES.blackout});
add("MASTER-PAUSE","button","Pause",{type:"note",channel:1,number:BUTTON_NOTES.pause});
add("MASTER-ENABLE","button","Enable / Disable",{type:"note",channel:1,number:BUTTON_NOTES.enableDisable});
add("GRID-TRANSITION","button","Transition",{type:"note",channel:1,number:BUTTON_NOTES.transition});
add("GRID-BACK","button","Back",{type:"note",channel:1,number:BUTTON_NOTES.back});
add("GRID-SWAP","button","Swap",{type:"note",channel:1,number:BUTTON_NOTES.swap});
add("GRID-TAP-TEMPO","button","Tap Tempo",{type:"note",channel:1,number:BUTTON_NOTES.tapTempo});
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

// LIVE encoders / faders
add("LIVE-E1","encoder","Cue Speed",{type:"cc",channel:1,number:CC.cueSpeed});
add("LIVE-E2","encoder","Roto Z",{type:"cc",channel:1,number:CC.rotationZ});
add("LIVE-E6","encoder","Hue Shift",{type:"cc",channel:1,number:CC.hueShift});
add("LIVE-E7","encoder","Saturation",{type:"cc",channel:1,number:CC.saturation});

add("SIZE-X","fader","Size X",{type:"cc",channel:1,number:CC.sizeX});
add("SIZE-Y","fader","Size Y",{type:"cc",channel:1,number:CC.sizeY});
add("POS-X","fader","Position X",{type:"cc",channel:1,number:CC.positionX});
add("POS-Y","fader","Position Y",{type:"cc",channel:1,number:CC.positionY});
add("ANIM","fader","Anim Speed",{type:"cc",channel:1,number:CC.animationSpeed});
add("SIZE","fader","Zoom",{type:"cc",channel:1,number:CC.zoom});
add("CUESFT","fader","Cue-Sft Beat",{type:"cc",channel:1,number:CC.cueShiftBeat});
add("EFSFT","fader","Ef-Sft Beat",{type:"cc",channel:1,number:CC.effectShiftBeat});
add("BRUSH","fader","Brush Value",{type:"cc",channel:1,number:CC.beamBrush});
add("COLOR","fader","Color",{type:"cc",channel:1,number:CC.color});
add("POINTS","fader","Visible Points",{type:"cc",channel:1,number:CC.visiblePoints});
add("BRIGHT","fader","Brightness",{type:"cc",channel:1,number:CC.brightness});

// FX action knobs, MIDI channel 2
add("FX-1","encoder","FX Action 1",{type:"cc",channel:2,number:FX_ACTION_CC.action1});
add("FX-2","encoder","FX Action 2",{type:"cc",channel:2,number:FX_ACTION_CC.action2});
add("FX-3","encoder","FX Action 3",{type:"cc",channel:2,number:FX_ACTION_CC.action3});
add("FX-4","encoder","FX Action 4",{type:"cc",channel:2,number:FX_ACTION_CC.action4});

// Channels 1-4
add("CH-1","encoder","Channel 1",{type:"cc",channel:CHANNEL_CC.channel1.channel,number:CHANNEL_CC.channel1.cc});
add("CH-2","encoder","Channel 2",{type:"cc",channel:CHANNEL_CC.channel2.channel,number:CHANNEL_CC.channel2.cc});
add("CH-3","encoder","Channel 3",{type:"cc",channel:CHANNEL_CC.channel3.channel,number:CHANNEL_CC.channel3.cc});
add("CH-4","encoder","Channel 4",{type:"cc",channel:CHANNEL_CC.channel4.channel,number:CHANNEL_CC.channel4.cc});

// Layer 2 AUX encoders = RGBA
add("AUX-L2-1","encoder","RGB Red",{type:"cc",channel:2,number:RGB_CC.red},2);
add("AUX-L2-2","encoder","RGB Green",{type:"cc",channel:2,number:RGB_CC.green},2);
add("AUX-L2-3","encoder","RGB Blue",{type:"cc",channel:2,number:RGB_CC.blue},2);
add("AUX-L2-4","encoder","RGB Alpha",{type:"cc",channel:2,number:RGB_CC.alpha},2);

// Layer 3 AUX encoders = Channels 5-8
add("AUX-L3-1","encoder","Channel 5",{type:"cc",channel:1,number:CHANNEL_CC.channel5.cc,layer:3},3);
add("AUX-L3-2","encoder","Channel 6",{type:"cc",channel:1,number:CHANNEL_CC.channel6.cc,layer:3},3);
add("AUX-L3-3","encoder","Channel 7",{type:"cc",channel:1,number:CHANNEL_CC.channel7.cc,layer:3},3);
add("AUX-L3-4","encoder","Channel 8",{type:"cc",channel:1,number:CHANNEL_CC.channel8.cc,layer:3},3);

for (let i=1;i<=48;i++) {
  add(`L1-GRID1-${i}`,"grid",`Main Grid ${i}`,mainGridBinding(i,1),1);
  add(`L4-GRID1-${i}`,"grid",`Secondary Grid ${i}`,mainGridBinding(i,4),4);
}

for (let layer=1 as Layer; layer<=4; layer=(layer+1) as Layer) {
  for (let cell=1; cell<=16; cell++) {
    add(`FX-L${layer}-${cell}`,"grid",`FX L${layer} C${cell}`,fxGridBinding(layer,cell),layer);
  }
}

export function getControl(id:string):ControlBinding|undefined {
  return CONTROL_MAP[id];
}
