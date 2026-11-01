# Legacy Example Descriptor Inventory

Inventory of `src/examples.json` for V2 compatibility work, inspected 2026-11-01. This is a data inventory, not an automated fixture or compatibility test.

The deterministic fixture loader is `test/fixtures/legacy-examples.mjs`. It reads this local JSON corpus, returns cloned descriptors without `wam_url`, and never initializes a WAM. Remote image URL strings in `face` remain data only; the loader does not fetch or render them. The fixture loader is consumed by `test/legacy-example-compatibility.test.mjs`, which exercises descriptor load/save/reload and consumer API contracts without live WAMs.

## Corpus Summary

- 42 named examples; all include `wam_url`.
- 356 controls total, using 11 of the 13 registered control types.
- Control-type totals: `grow_control` 99, `cursor_control` 46, `color_control` 45, `text` 41, `output_control` 41, `decoration` 40, `input_control` 28, `midi_input_control` 13, `hash_control` 1, `morph_control` 1, `midi_output_control` 1.
- Registered types not present in the examples: `3d_joystick_control` and `jauge`.
- There are 191 controls with a `Target` setting across 179 distinct target strings. Eleven target strings occur more than once across the corpus; `portamentoMode` is repeated within Synth 101, and ten other targets occur in multiple examples. Target-bearing types are `cursor_control`, `grow_control`, `color_control`, `morph_control`, and `hash_control`.
- All 356 control records have exactly `control`, `x`, `y`, `width`, `height`, and `values`; geometry is numeric, has positive dimensions, and remains within the normalized 0–1 surface. Every `values` field is an object.
- Every descriptor has numeric `aspect_ratio` and `size`, `top_color`, `bottom_color`, `controls`, and `wam_url`.

## Per-example Controls and Parameter Bindings

Control types are listed as `type x count`. The final column lists each control's `values.Target`, in control-array order; `—` means the example has no target-bound controls.

| Example | Controls | Types | `Target` values |
|---|---:|---|---|
| Big Muff | 8 | cursor_control x3, input_control x1, output_control x1, text x3 | `/BigMuff/Input`, `/BigMuff/Tone`, `/BigMuff/Drive` |
| Death Gate | 4 | grow_control x2, input_control x1, output_control x1 | `/deathgate/DeadZone`, `/deathgate/NoiseGate` |
| Disto Machine | 11 | grow_control x8, input_control x1, output_control x1, text x1 | `volume`, `master`, `drive`, `presence`, `bass`, `middle`, `reverb`, `treble` |
| KVerb | 4 | color_control x1, input_control x1, output_control x1, text x1 | `/kbverb/feedback` |
| Sweet Wah | 7 | color_control x4, input_control x1, output_control x1, text x1 | `/Sweet/Mix`, `/Sweet/Frequency`, `/Sweet/Low`, `/Sweet/High` |
| Grey Hole | 11 | cursor_control x7, input_control x1, output_control x1, text x2 | `/greyhole/damping`, `/greyhole/modFreq`, `/greyhole/diffusion`, `/greyhole/size`, `/greyhole/feedback`, `/greyhole/delayTime`, `/greyhole/modDepth` |
| Weird Phaser | 6 | color_control x4, input_control x1, output_control x1 | `/weirdPhaser/Feedback`, `/weirdPhaser/L-ROffset`, `/weirdPhaser/Rate`, `/weirdPhaser/RateScalar` |
| Ping Pong Delay | 6 | cursor_control x3, input_control x1, output_control x1, text x1 | `feedback`, `time`, `mix` |
| Thru Zero Flanger | 6 | color_control x4, input_control x1, output_control x1 | `/ThruZeroFlanger/Delay`, `/ThruZeroFlanger/Depth`, `/ThruZeroFlanger/L-ROffset`, `/ThruZeroFlanger/Rate` |
| Simple Delay | 10 | color_control x1, grow_control x6, input_control x1, output_control x1, text x1 | `time`, `wet`, `feedback`, `stereo`, `lowpass`, `highpass`, `pingpong` |
| TS9 Overdrive | 7 | cursor_control x3, grow_control x1, input_control x1, output_control x1, text x1 | `/TS9_OverdriveFaustGenerated/TubeScreamer/drive`, `/TS9_OverdriveFaustGenerated/TubeScreamer/tone`, `/TS9_OverdriveFaustGenerated/TubeScreamer/level` |
| Faust Flute | 12 | cursor_control x9, midi_input_control x1, output_control x1, text x1 | `/flute/midi/freq`, `/flute/midi/bend`, `/flute/midi/gain`, `/flute/midi/envAttack`, `/flute/midi/sustain`, `/flute/otherParams/mouthPosition`, `/flute/otherParams/outGain`, `/flute/otherParams/vibratoFreq`, `/flute/otherParams/vibratoGain` |
| Modal | 18 | color_control x7, cursor_control x4, grow_control x4, midi_input_control x1, output_control x1, text x1 | `exciterBowTimbre`, `exciterBlowTimbre`, `exciterStrikeTimbre`, `exciterEnvShape`, `space`, `exciterBowLevel`, `exciterBlowLevel`, `exciterStrikeLevel`, `resonatorPosition`, `resonatorDamping`, `exciterBlowMeta`, `resonatorGeometry`, `exciterStrikeMeta`, `resonatorBrightness`, `resonatorModel` |
| Distortion | 6 | cursor_control x3, input_control x1, output_control x1, text x1 | `overdrive`, `level`, `offset` |
| Smooth Delay | 8 | cursor_control x5, input_control x1, output_control x1, text x1 | `/smoothDelay/Feedback`, `/smoothDelay/Interpolation`, `/smoothDelay/Delay`, `/smoothDelay/Super Wet`, `/smoothDelay/Dry/Wet` |
| Vox Amp 30 | 9 | decoration x1, grow_control x5, input_control x1, output_control x1, text x1 | `/GuitarAmpSim60s/Volume`, `/GuitarAmpSim60s/Master`, `/GuitarAmpSim60s/Bass`, `/GuitarAmpSim60s/Middle`, `/GuitarAmpSim60s/Treble` |
| Faust VocalBP | 12 | color_control x2, decoration x4, grow_control x4, midi_input_control x1, output_control x1 | `/vocal/otherParams/voiceType`, `/vocal/otherParams/vowel`, `/vocal/otherParams/outGain`, `/vocal/otherParams/fricative`, `/vocal/otherParams/vibratoGain`, `/vocal/otherParams/vibratoFreq` |
| PitchShifter | 5 | cursor_control x2, input_control x1, output_control x1, text x1 | `pitch_shift`, `formant_shift` |
| Blipper | 7 | grow_control x4, input_control x1, output_control x1, text x1 | `/blipper/BasePitch`, `/blipper/Mix`, `/blipper/Release`, `/blipper/PitchMod` |
| Owl Dirty | 9 | color_control x4, decoration x1, input_control x1, output_control x1, text x2 | `/OwlDirty/DECAY`, `/OwlDirty/DRIVE`, `/OwlDirty/TONE`, `/OwlDirty/MIX` |
| Owl Shimmer | 13 | color_control x4, decoration x6, input_control x1, output_control x1, text x1 | `/untitled/SHIMMER`, `/untitled/TONE`, `/untitled/MIX`, `/untitled/DECAY` |
| QuadraFuzz | 7 | grow_control x4, input_control x1, output_control x1, text x1 | `highGain`, `midHighGain`, `midLowGain`, `lowGain` |
| Stone Phaser | 10 | color_control x1, decoration x2, grow_control x4, input_control x1, output_control x1, text x1 | `/untitled/Feedback depth`, `/untitled/Dry/wet mix`, `/untitled/Feedback bass cut`, `/untitled/LFO frequency`, `/untitled/Color` |
| Kpp Fuze | 6 | grow_control x3, input_control x1, output_control x1, text x1 | `/Kpp_fuzz/fuzz`, `/Kpp_fuzz/tone`, `/Kpp_fuzz/volume` |
| Osc Tube | 7 | decoration x1, grow_control x3, input_control x1, output_control x1, text x1 | `/OscTube/Fuzz`, `/OscTube/Resonance`, `/OscTube/Vibrato` |
| Stereo Enhancer | 5 | color_control x2, input_control x1, output_control x1, text x1 | `/StereoEnhancer/Delay_width`, `/StereoEnhancer/Frequency_width` |
| DualPitchShifet | 8 | decoration x1, grow_control x4, input_control x1, output_control x1, text x1 | `/DualPitchShifter/Mix`, `/DualPitchShifter/WindowSize`, `/DualPitchShifter/ShiftR`, `/DualPitchShifter/ShiftL` |
| Simple Equalizer | 9 | color_control x3, decoration x1, grow_control x3, input_control x1, output_control x1 | `lowGain`, `lowFrequency`, `highFrequency`, `mediumFrequency`, `highGain`, `mediumGain` |
| Wooden Flute | 7 | grow_control x4, midi_input_control x1, output_control x1, text x1 | `/flute/otherParams/mouthPosition`, `/flute/otherParams/outGain`, `/flute/otherParams/vibratoFreq`, `/flute/otherParams/vibratoGain` |
| Round KVerb | 3 | cursor_control x1, input_control x1, output_control x1 | `/kbverb/feedback` |
| FAUST Guitar | 7 | color_control x2, decoration x3, midi_input_control x1, output_control x1 | `/guitar/outGain`, `/guitar/pluckPosition` |
| Blue Distorder | 9 | grow_control x6, input_control x1, output_control x1, text x1 | `/compressor/bass`, `/compressor/middle`, `/compressor/drive`, `/compressor/voice`, `/compressor/volume`, `/compressor/treble` |
| French Bell | 8 | cursor_control x1, decoration x2, grow_control x2, midi_input_control x1, output_control x1, text x1 | `/frenchBell/strikeCutOff`, `/frenchBell/strikeSharpness`, `/frenchBell/strikePosition` |
| Marimba | 12 | cursor_control x1, decoration x5, grow_control x3, midi_input_control x1, output_control x1, text x1 | `/marimba/otherParams/strikeCutOff`, `/marimba/otherParams/outGain`, `/marimba/otherParams/strikeSharpness`, `/marimba/otherParams/strikePosition` |
| Clarinet | 12 | decoration x4, grow_control x5, midi_input_control x1, output_control x1, text x1 | `/clarinet/otherParams/reedStiffness`, `/clarinet/otherParams/bellOpening`, `/clarinet/otherParams/vibratoFreq`, `/clarinet/otherParams/vibratoGain`, `/clarinet/otherParams/outGain` |
| Synth 101 | 31 | color_control x6, cursor_control x1, grow_control x18, midi_input_control x1, output_control x1, text x4 | `mixerPulse`, `mixerSaw`, `mixerSub`, `mixerNoise`, `filterFreq`, `filterRes`, `filterEnv`, `filterMod`, `filterKeyboard`, `envAttack`, `envTrigger`, `envDecay`, `envSustain`, `envRelease`, `vcaSource`, `portamentoMode`, `portamentoMode`, `lfoRate`, `lfoWaveform`, `oscRange`, `subRange`, `pwmSource`, `oscMod`, `pulseWidth`, `detune` |
| Kool Verb | 4 | input_control x1, morph_control x1, output_control x1, text x1 | `/kbverb/feedback` |
| Nylon Guitar | 7 | cursor_control x2, decoration x3, midi_input_control x1, output_control x1 | `/nylonGuitar/outGain`, `/nylonGuitar/pluckPosition` |
| Micro 54 | 4 | cursor_control x1, midi_input_control x1, output_control x1, text x1 | `Program Change` |
| Tiny Synth | 4 | hash_control x1, midi_input_control x1, output_control x1, text x1 | `Program Change` |
| Random Note | 11 | decoration x3, grow_control x6, midi_output_control x1, text x1 | `pitchMin`, `pitchMax`, `velocityMax`, `velocityMin`, `length`, `pause` |
| Drum | 6 | decoration x3, midi_input_control x1, output_control x1, text x1 | — |

## Descriptor and Body Fields

The descriptor contract is declared by `WamGUICode` and `WAMGuiInitCode` in `src/WamGUIGenerator.ts`.

- Required root fields observed in all 42 examples: `aspect_ratio`, `bottom_color`, `controls`, `size`, `top_color`; the initializer extension adds `wam_url`.
- Optional body fields: `face` (34 examples), `face_color` (26), `shape` (30), `outline_color` and `outline_width` (30 each), `modifier` and `modifier_strength` (19 each).
- Observed body shapes: `rectangle` (16), `circle` (7), `hexagon` (2), `octagon` (2), `pentagon` (2), `triangle` (1); 12 examples omit `shape`.
- Observed shape modifiers: `normal` (11), `down_wide` (5), `left_wide` (1), `thin` (1), `up_wide` (1); 23 examples omit modifier fields.
- `face` contains image URLs as well as texture identifiers (including `wood`, `leather`, `iron`, `cloth`, `satin`, `spiral`, `flame`, `square_grid`, `squares`, `strip`, `maze`, `perlin`, `laser`, `cubism`, and `circle`); 8 examples omit it.
- The 2D normalized position and size fields are `x`, `y`, `width`, and `height`. All current control records contain them and `values`.

Control `values` fields observed by widget type:

| Type | Observed value keys |
|---|---|
| `color_control` | `Base Color`, `Color`, `Cursor Color`, `High Color`, `Low Color`, `Target` |
| `cursor_control` | `Base Color`, `Color`, `Cursor Color`, `Target` |
| `decoration` | `Outline Width`, `Shape/Bottom Color`, `Shape/Front Face Color`, `Shape/Front Face Image`, `Shape/Height`, `Shape/Modifier`, `Shape/Modifier Strength`, `Shape/Outline Color`, `Shape/Outline Width`, `Shape/Rotation`, `Shape/Shape`, `Shape/Top Color` |
| `grow_control` | `Base Color`, `Color`, `Cursor Color`, `High Color`, `Low Color`, `Target` |
| `hash_control` | `Base Color`, `Cursor Color`, `Target` |
| `input_control`, `midi_input_control`, `midi_output_control`, `output_control` | `Color` |
| `morph_control` | `High Shape/Bottom Color`, `High Shape/Front Face Color`, `High Shape/Front Face Image`, `High Shape/Height`, `High Shape/Modifier`, `High Shape/Modifier Strength`, `High Shape/Outline Color`, `High Shape/Outline Width`, `High Shape/Rotation`, `High Shape/Shape`, `High Shape/Top Color`, `Low Shape/Bottom Color`, `Low Shape/Front Face Color`, `Low Shape/Front Face Image`, `Low Shape/Height`, `Low Shape/Modifier`, `Low Shape/Modifier Strength`, `Low Shape/Outline Color`, `Low Shape/Outline Width`, `Low Shape/Rotation`, `Low Shape/Shape`, `Low Shape/Top Color`, `Target` |
| `text` | `Color`, `Font`, `Outline Color`, `Outline Width`, `Text` |

## Compatibility Test Implications

- Preserve the example names and exact descriptor data, including optional-field omission, target spelling/case, repeated bindings, and control-array order.
- Cover all 11 present widget types in round-trip fixtures; the two registered-but-absent types require separate tests if their compatibility matters.
- Include examples with image URLs and texture identifiers, non-default body shape/modifier/outline, MIDI input/output, decoration/morph controls, and the 31-control Synth 101 layout.
- This inventory does not establish that WAM URLs or remote images remain reachable. Later deterministic tests should use local descriptor fixtures or mocked WAM/image loading rather than network access.
