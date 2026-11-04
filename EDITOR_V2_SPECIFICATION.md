# WAM 3D Editor V2 Specification

**Status:** Incremental implementation in progress; Tasks 1–4 have completed implementation increments recorded in the handoff log.  
**Inspection date:** 2026-10-23

## 1. Purpose

This document records what the current WAM 3D Editor does and how it is structured, then specifies a backward-compatible direction for editing larger, denser WAM interfaces such as Cmajor's Pro-54. It separates observed behavior from requested and proposed behavior so the V2 work can be implemented incrementally.

## 2. Project summary

The editor is a browser-based TypeScript application for designing a custom HTML and Babylon.js 3D control surface for a Web Audio Module (WAM). It loads a WAM from a JavaScript module URL, reads its parameter metadata and descriptor, and provides:

- An HTML editing surface and a synchronized 3D preview.
- A palette of reusable control types and a settings panel.
- Pad/body appearance settings and thumbnail use.
- Automatic parameter layout.
- WAM, audio, MIDI/event, example and descriptor loading/testing panels.
- A JSON descriptor that can be loaded by the project's HTML or Babylon.js runtime.

The application is organized around `WamGUIGenerator`, rather than separate 2D and 3D layouts. The generator owns the control model and can render controls to HTML, Babylon.js, or both.

## 3. Current architecture and behavior

### 3.1 Application shell and main components

`index.html` loads `src/editor2.ts`. That entry point initializes an `AudioContext` and WAM host, creates the editor panes, and arranges them with `dockview-core`.

Main components and responsibilities:

| Component | Current responsibility |
| --- | --- |
| `WamLoaderPane` | Accept a WAM module URL, create the WAM instance, read parameter metadata, display its native GUI, and report load status. |
| `WamEditorPane` | Provide the HTML canvas/surface, zoom controls, and selection/drag/resize interactions. |
| `WamGui3DPane` | Provide the Babylon.js scene, camera, render loop, resize handling, and a maximize/restore action. |
| `ControlSelectorPane` | Show available controls and select a control type to add or use for replacement. |
| `SettingsPane` | Edit settings of the selected palette item or selected placed controls. |
| `WamPadPane` | Edit pad shape, aspect ratio, size, colors, outline, modifier and front-face image. |
| `AutoLayoutPane` | Preview and generate a layout from the loaded WAM's parameter list and thumbnail. |
| `LoadSavePane` | Load or display a JSON descriptor and select bundled examples. |
| `ExamplesPane` | Preview and load included saved interfaces. |
| `ImagesPane` | Browse bundled decoration images. |
| `Test2DPane` | Preview the current descriptor with HTML controls and test their interactions. |
| `AudioTestPane` | Test audio through the loaded WAM. |
| `OneWamPane` | Host the configured MIDI keyboard WAM for event testing. |
| `DebugPane` | Expose generator/debug information. |

The default dock layout includes Controls, Editor Toolbar, Web Audio Module, Settings, Images, Examples, Editor, 3D View, Auto Layout, Pad, and Load/Save. Other components, including audio/MIDI testing and Debug, are also available from the View menu. Dockview's splitter allows panels to be resized, and the 3D pane has its own fullscreen action. The current editor surface itself is not a dedicated full-screen 2D-plus-3D workspace.

### 3.2 Core model and 2D/3D synchronization

`WamGUIGenerator` owns:

- A `ControlMap` containing each control's type-specific values and normalized `x`, `y`, `width`, and `height`.
- Pad properties such as size, aspect ratio, shape, colors, image, outline and shape modifier.
- A `ControlHost` which may have an HTML root, a Babylon.js root, a WAM, or a combination.
- The mapping from a control type to its factory and back.

The same control instance creates an HTML element and/or a Babylon.js node. `ControlMap` applies the same normalized position and dimensions to both render targets; generator observables propagate changes to the views. Thus the HTML editor and 3D preview are views of the same model, not independent designs. The 2D editor zoom is a viewport operation; it should not change saved normalized positions.

Control factories provide labels, descriptions, default values, settings and asynchronous control creation. A control implementation defines its HTML element and Babylon.js node, updates its values, and disposes of resources. `ControlContextTarget` exposes typed hooks for parameter fields, draggable fields, audio connections and MIDI/event connections.

The WAM pad aspect ratio and size affect its body in the HTML/3D renderers. The controls themselves are positioned using normalized surface coordinates. The existing model does not define an explicit, user-calibrated physical width for a WAM body that independently determines the corresponding world-space dimensions of its controls.

### 3.3 Existing control types

The current control library exports these 13 palette types:

| Palette key | Current role |
| --- | --- |
| `input_control` | Audio input connection point |
| `output_control` | Audio output connection point |
| `midi_input_control` | MIDI/event input connection point |
| `midi_output_control` | MIDI/event output connection point |
| `color_control` | Color-oriented parameter control |
| `cursor_control` | Rotating-cursor parameter control; available in HTML and 3D |
| `3d_joystick_control` | Three-dimensional draggable/parameter control |
| `grow_control` | Growth-based parameter control |
| `morph_control` | Morphing parameter control |
| `hash_control` | Discrete/choice parameter control |
| `jauge` | Gauge/display control |
| `text` | Text decoration |
| `decoration` | Shape decoration |

The current `CursorControl` is an example of a widget with two visual implementations and one parameter-oriented behavior: it accepts base and cursor colors, declares a WAM parameter field, and rotates the cursor from the normalized parameter value. The existing settings system supports checkbox, choice, error, font, range, select, string and nested/sub-settings fields.

These types are concrete implementations, not yet a pluggable catalog of independently selectable widget appearances and interaction behaviors.

### 3.4 Existing editing, selection and layout

The editor currently supports:

- Single selection and Shift-click multi-selection.
- Dragging and resizing selected controls.
- Alignment guides based on control edges and mirrored positions.
- Delete/Backspace, cut, copy and paste.
- Replacing selected controls with the selected palette type.
- Horizontal and vertical realignment of multiple selections.
- Zoom buttons and Ctrl/Shift+wheel zoom in the editor.

Copy/paste clones control settings and offsets pasted controls slightly. Existing alignment guides are not a configurable magnetic grid. There is no marquee/lasso selection, adjustable grid or undo/redo command history.

### 3.5 WAM loading, auto-layout and thumbnail handling

The WAM loader dynamically imports a module URL, creates an instance through the WAM host, reads parameter information and connects its audio node to the audio destination. It displays a native WAM GUI when one is provided and destroys the previous WAM GUI/audio node when replacing the instance.

Auto-layout currently:

1. Resolves `descriptor.thumbnail` relative to the loaded WAM URL.
2. Loads the image and uses its natural width/height ratio for the pad.
3. Samples the top and bottom halves of the thumbnail to choose pad colors.
4. Lays out parameter controls in a grid, with configurable spacing and reserved handle area.
5. Provides selectors for parameter, audio input, and audio output control types.

The Wam Pad panel can also set the thumbnail URL as the pad's front-face image. This is an existing partial use of the descriptor thumbnail, not a full screenshot-reference editing workflow. Browser cross-origin permissions may affect reading image pixels for color sampling.

Task 3 adds a shared thumbnail-reference loader that resolves relative thumbnail URLs against an optional descriptor URL or the WAM module URL, reads natural image dimensions, and surfaces load/CORS failures in the Pad panel. The 2D editor can display the loaded image as a contain-fit overlay with independent visibility and opacity. These overlay controls are editor-session settings; the source WAM thumbnail is not silently written into the GUI descriptor's body texture.

### 3.6 Existing body and texture settings

Current editable pad properties include shape (rectangle, circle, triangle, pentagon, hexagon or octagon), aspect ratio, size, top/bottom colors, front-face image and color, outline, shape modifier and modifier strength. The face image can be a bundled image key or URL.

There is no exposed, persisted set of precise image translation, rotation and scale controls for aligning a screenshot/texture to the body. `Decoration` contains an internal rotation observable, but it is not exposed as a complete front-face transform workflow in the Pad panel or the saved GUI descriptor.

### 3.7 Descriptor and runtime pages

The saved GUI descriptor contains pad properties and an array of controls. Each control stores its palette key, settings, and normalized rectangle. `WAMGuiInitCode` adds the WAM module URL. The included HTML-only and Babylon.js runtime pages load this descriptor and use the same control library.

The library currently does not declare a schema version or migration system. V2 descriptor changes should therefore be optional/additive and retain sensible defaults for older descriptors.

## 4. Shared library and WAM Jam Party status

### 4.1 What the library is

This editor also builds a library named `wam3dgenerator`:

- `src/index.ts` exports `WamGUIGenerator`, the control types, `ControlMap`, `ControlStateManager` and the control library.
- The package is private in the editor's `package.json`, currently marked version `0.0.11`, with an ES-module export from `dist/index.js`. The root `package-lock.json` still identifies version `0.0.2`, so package-version metadata is not currently a reliable compatibility signal.
- `npm run lib` builds its TypeScript library bundle/declarations using `vite_lib.config.js`; Babylon.js core and WAM API are external dependencies.

The companion application does not appear to consume a separately published, semantically versioned npm release. Its package manifest declares `wam3dgenerator` as a GitHub dependency:

```text
github:Jempasam/3d_wam_editor
```

The companion repository's `pnpm-lock.yaml` resolves that dependency to commit `ac87b723420259d0da068be8c344e13dc5ab9f24`. This indicates the application uses a reproducible source snapshot, but updates to the editor library are not automatically shared unless that dependency is updated and relocked. The dependency owner/repository URL (`Jempasam/3d_wam_editor`) differs from the WAM Jam Party repository owner; this source choice has been confirmed for V2.

### 4.2 How WAM Jam Party reuses it

In WAM Jam Party, `src/node3d/subs/Wam3DGeneratorN3D.ts` imports `controls`, `WamGUIGenerator`, `WAMGuiInitCode` and `ControlStateManager` from `wam3dgenerator`. Its adapter:

- Creates a generator with the application's 3D control context, then loads the supplied GUI descriptor.
- Connects WAM parameter fields to the host application's parameter mechanism.
- Adds the generated pad to the application's bounds.
- Derives a runtime world-size factor from `calculateAverageControlSize()`.
- Uses `ControlStateManager` to expose eligible control state through the host's state API.
- Disposes the generator and state manager with the runtime node.

WAM Jam Party also reads a WAM `descriptor.json` to classify/catalog WAMs and obtain metadata. Its WAM GUI runtime accepts a `WAMGuiInitCode`; the editor's generator is the rendering/control layer, while the companion app supplies scene, audio, parameter, lifecycle and state integration.

### 4.3 Status assessment

The library is demonstrably integrated into the companion application rather than being an unused experiment: it is an explicit dependency, imported by a concrete runtime adapter and used for scene rendering, parameter wiring and control state. It is currently coupled through a GitHub source dependency and a lockfile commit, not through a separately managed published release. V2 work that changes the descriptor, control contract, or world-space scale should preserve compatibility with that locked consumer or be coordinated with an intentional dependency update.

Sources checked:

- [WAM 3D Editor package manifest](./package.json), [library entry point](./src/index.ts), and [generator](./src/WamGUIGenerator.ts).
- [WAM Jam Party repository](https://github.com/doriangirard9/musical-multiverse-vr), its `package.json`, `pnpm-lock.yaml`, and [`Wam3DGeneratorN3D.ts`](https://github.com/doriangirard9/musical-multiverse-vr/blob/main/src/node3d/subs/Wam3DGeneratorN3D.ts).

## 5. V2 goals and proposed behavior

### 5.1 Full-screen 2D editor with resizable 3D preview

Provide a dedicated design workspace that can be maximized/full-screen and keeps the 2D surface and 3D preview visible together:

- The 2D editor is the primary, large work area.
- The 3D preview occupies a resizable dock/split pane; dragging the divider changes available width without changing project data.
- Keep the shared generator/model as the single source of truth. Edits in 2D update 3D immediately, and serialized/imported data updates both.
- Preserve the existing docked panels and allow restoring the prior layout.
- Provide independent zoom-in, zoom-out, and reset controls for the 2D and 3D views in dedicated strips above their respective panes, using recognizable zoom icons without obscuring either canvas, plus a clearly displayed design ratio/dimensions.

This is a workspace/layout enhancement, not a second independent editor model. The 2D zoom is bounded from 50% to 300% and must not change normalized control geometry; selection handles should remain a usable screen size at every zoom. 3D zoom adjusts camera distance, remains compatible with mouse-wheel zoom, and has a reset action.
The 2D zoom is bounded from 50% to 300% and must not change normalized control geometry; 3D zoom adjusts camera distance, remains compatible with mouse-wheel zoom, and has a reset action.

### 5.2 Descriptor thumbnail as design reference and aspect-ratio source

When a WAM is loaded, read `thumbnail` from the WAM's adjacent `descriptor.json` and display the image's natural dimensions and ratio. Resolve the relative filename against that descriptor URL. This file is authoritative over a potentially stale thumbnail value embedded in the loaded module; when the descriptor cannot be read, use the module metadata as a reported fallback. The reference image shall:

- Be toggleable as a 2D design reference, with adjustable opacity and fit/contain behavior.
- Have a clear distinction between a non-exported design reference and the optional front-face image/texture.
- Offer an action to set the design surface aspect ratio from the image, preserving the full image area without accidental crop.
- Provide manual numeric ratio entry and reset-to-thumbnail-ratio.
- Retain explicit loading/error feedback for unavailable images or blocked cross-origin access.

The aspect ratio defines proportions only. It must not be treated as the physical/world size of the instrument.
The loaded Web Audio Module GUI pane shall have an independently scrollable viewport on both axes. Its content must retain its authored size when it exceeds the pane; the docked viewport must not shrink or crop the GUI.

#### Pro-54 reference values

The inspected descriptor is `https://wam-4tt.pages.dev/Pro54/descriptor.json`; its thumbnail is `thumbnail.png`. The resolved image is `https://wam-4tt.pages.dev/Pro54/thumbnail.png`, whose observed natural dimensions are 682 × 319 pixels, a ratio of approximately **2.1379:1**. This should be presented as a convenient starting ratio, not a claim about the instrument's absolute dimensions.

### 5.3 Separate aspect ratio from absolute 3D size

Add a body-width/absolute-size control that is independent of the thumbnail ratio:

- Store a single explicit logical world-space width (with a numeric entry as well as a slider); calculate the height from the chosen aspect ratio.
- Keep UI placement values normalized to the design rectangle. Convert normalized control rectangles into world-space positions and sizes using the body's absolute dimensions so the 3D controls scale with the body.
- Changing absolute body width must visibly change knob/switch size in the 3D preview without changing the normalized design arrangement or the aspect ratio.
- Keep the control available when no thumbnail exists; its default should preserve the current descriptor's effective appearance.
- Define the logical unit and recommended slider range with the WAM Jam Party host/world scale before implementation. Do not infer instrument width solely from pixels or set a physical unit such as centimeters without a host convention.
- Save the explicit scale as an optional descriptor field and keep legacy `size` interpretation for existing projects until a migration is deliberately defined.

The intent is to let a designer decide that a wide synthesizer needs a wider body and correspondingly smaller controls than a compact pedal, despite both having a valid independent aspect ratio.

### 5.4 Multi-selection, grid and everyday editing

Retain current single/multi-selection and clipboard operations, then make them discoverable and consistent:

- Add marquee selection by dragging on empty canvas; retain Shift-click for additive/toggle selection.
- Show selection count and a clear multi-selection bounding box/handles.
- Keep delete, cut, copy, paste, duplicate, move, resize, replace, and align actions available in toolbar/context menu and keyboard shortcuts.
- Preserve the relative spacing of copied groups; offset duplicates by a predictable amount while keeping them inside the design bounds when possible.
- Add a magnetic-grid toggle and adjustable grid spacing. Show/hide grid lines independently from snapping.
- Snap positions and resize edges to grid lines when enabled; retain the existing alignment guides and use a deterministic priority when grid and guide targets are near each other.
- Provide a temporary modifier-key override for snapping and visible feedback when snapping is active.
- Make selection and keyboard shortcuts safe while text fields, dropdowns and settings inputs have focus.

Grid spacing should be expressed in normalized surface units (and may additionally be displayed in pixels at the current zoom). Grid snapping is an editing aid and must not alter the saved design ratio or body scale.

### 5.5 Complete undo/redo

Add a bounded, document-level undo/redo history for editor changes. History entries must be serializable snapshots or reversible commands, not Babylon.js nodes or DOM objects.

At minimum, history shall cover:

- Add, remove, duplicate, cut, paste and replace controls.
- Move, resize, alignment and grid-snapped transforms, including multi-selection.
- Control settings and parameter-target assignment.
- Body ratio, absolute size, shape, colors, outline and texture/reference transforms.
- Auto-layout as one undoable operation.
- Loading/importing a descriptor as a document boundary with a defined, user-safe policy.

Coalesce continuous gestures (drag, resize, slider scrubbing) into one undo step per completed gesture, rather than one step per pointer/input event. Provide undo/redo toolbar actions and standard Ctrl+Z / Ctrl+Y and Ctrl+Shift+Z shortcuts, with disabled states at history boundaries. A new edit after undo clears the redo branch. Saving/exporting does not clear history; loading a different project must not silently mix its edits into the previous project's history.

The existing `ControlStateManager` is for reading/writing eligible runtime widget state in WAM Jam Party. It is not an editor undo/redo system and should not be repurposed as one.

### 5.6 Accurate body-image/texture adjustment

Extend front-face image editing with precise, persisted controls for:

- Horizontal and vertical translation.
- Rotation in degrees.
- Uniform scale for the initial implementation; independent X/Y scaling is out of scope.
- Reset and numeric inputs; sliders may be provided as a convenient secondary input.
- A visible 2D transform overlay/handles and immediate 3D preview.

Use a documented coordinate convention (recommended: normalized texture UV translation around a center pivot, degrees for rotation, and dimensionless scale). Keep texture transform separate from body shape/size and from the 2D-only reference overlay. Persist it in the GUI descriptor, with defaults that render older projects exactly as before. Texture-load and cross-origin errors must remain visible.

### 5.7 Extensible future widget catalog

The widget system should permit a new appearance without reimplementing an existing parameter interaction, while allowing genuinely new behaviors when needed:

- Keep a common definition of widget identity, label, description, settings schema, default values, lifecycle and supported render targets.
- Separate/reuse parameter binding and interaction behavior (for example rotary numeric parameter, boolean toggle, momentary button, discrete selector, read-only display) from the visual skin (shape, material, labels, animation and styling).
- Provide paired HTML/2D and Babylon.js/3D rendering for widgets intended to work in both views; explicitly mark a target unsupported rather than silently omitting it.
- Keep WAM parameter metadata mapping (min/max/step/exponent/string formatting) independent from skin, so a new-looking rotary knob can reuse the existing rotary behavior.
- Support digital displays as display widgets with a defined data source, formatting/units, update behavior and optional multi-value layout. A display should not be modeled as an editable parameter unless it actually writes a parameter.
- Persist stable widget type identifiers and settings in the descriptor. Unknown types must produce an actionable load error or deliberate placeholder rather than silently disappearing.
- Make widget factories dispose listeners/resources correctly and integrate with settings, selection, clipboard and undo/redo.

Initial future candidates include alternate rotary knob skins, toggle and momentary switches, labeled/discrete selectors, and one- or multi-line numeric/readout screens. This specification does not prescribe their final visual design.

## 6. V2 descriptor field proposal

The following optional fields are proposed for `WamGUICode`. They are additive to the legacy descriptor shape and do not replace `aspect_ratio`, `size`, `face`, or normalized control rectangles. This section defines their names, types, defaults, and compatibility contract. The proposed format uses an optional `schema_version`: absence means legacy version 1; version 2 opts into the V2 metadata contract.

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | integer or omitted | Descriptor format version. Omission means legacy version 1; `2` means this contract. |
| `required_features` | string array or omitted | Versioned runtime capability identifiers which a consumer must support to render this descriptor correctly. |
| `editor_features` | string array or omitted | Versioned editor capability identifiers; these do not require a runtime renderer. |
| `design_reference` | object or omitted | Editor-only image reference metadata. It is not a body texture and must not be rendered by the runtime. |
| `world_width` | finite positive number or omitted | Explicit logical body width in the Babylon.js world coordinate system. Body height is derived from `aspect_ratio`; normalized control geometry remains authored independently. |
| `face_transform` | object or omitted | Transform for the existing front-face image (`face`), separate from the design reference and body geometry. |

Proposed shape when all three fields are present:

```json
{
  "schema_version": 2,
  "required_features": [
    "wam3dgenerator.world-width.v1",
    "wam3dgenerator.face-transform.v1"
  ],
  "editor_features": [
    "wam3dgenerator.editor.design-reference.v1"
  ],
  "design_reference": {
    "url": "https://example.test/Pro54/thumbnail.png",
    "opacity": 0.35,
    "fit": "contain"
  },
  "world_width": 2.0,
  "face_transform": {
    "x": 0.0,
    "y": 0.0,
    "rotation_degrees": 0.0,
    "scale": 1.0
  }
}
```

### Versioning and feature identifiers

- `schema_version` is an integer. A missing field is interpreted as version 1; version 1 is the existing descriptor format. Version 2 is the first format with the metadata and optional fields defined here. A consumer must reject versions newer than it supports with an actionable error; it must not guess how to interpret them.
- New V2 exports set `schema_version` to `2`. Legacy files remain valid without a version field and need not be rewritten just because they were opened or saved.
- V2 metadata and V2-only fields require `schema_version: 2`. A known V2-only field or feature metadata in an unversioned/version-1 file is an actionable format error, not a cue to silently upgrade it.
- `required_features` contains stable, versioned runtime feature identifiers. The initial identifiers are `wam3dgenerator.world-width.v1`, `wam3dgenerator.face-transform.v1`, and `wam3dgenerator.widget.<widget-id>.v1` for each V2-only widget type used by the document. These are capabilities, not package-version strings.
- `editor_features` contains stable, versioned editor-only capability identifiers. The initial identifier is `wam3dgenerator.editor.design-reference.v1`.
- A descriptor using a field-backed feature must declare its corresponding identifier in the appropriate list. A newly introduced widget identifier is stable and must not repurpose an existing identifier; a V2-only widget must also declare its widget feature in `required_features`.
- Feature identifiers are compared exactly and case-sensitively. Unknown optional properties are retained when a consumer can preserve them, but unknown entries in `required_features` cannot be ignored: consumers must fail clearly and name the unsupported feature. Unknown `editor_features` may be preserved and reported as unsupported for editing without preventing a runtime-only consumer from rendering the file.
- Do not add a numeric minimum library version to the descriptor contract yet. The library is currently consumed as a GitHub-pinned source revision rather than a separately released semver package; capability identifiers provide the checkable requirement. WAM Jam Party should advertise the feature identifiers supported by its installed dependency.

### `design_reference`

- `url` is the resolved image URL used for the editor guide. When derived from a WAM descriptor's relative `thumbnail`, resolve it against that descriptor's URL before storing it.
- `url` is required and must be a non-empty absolute URL.
- `opacity` is a finite number from 0 to 1; if omitted, it defaults to `0.35`. Values outside this range are invalid and must not be silently clamped.
- `fit` is `"contain"` for the initial contract; if omitted, it defaults to `"contain"` and preserves the complete image without cropping. Other values are invalid until explicitly added to the contract.
- This metadata describes a 2D authoring guide only. It must not be interpreted as `face`, loaded into the exported instrument's 3D material, or included in runtime rendering. Runtime consumers may ignore this editor-only field.
- Image natural dimensions and aspect ratio are derived from the image and the existing design `aspect_ratio`; they are not duplicated in this object.
- If `design_reference` is omitted, no guide is shown. If present without its required `editor_features` entry, the descriptor is invalid. The field may be preserved by a runtime that does not edit the guide.

### `world_width`

- This is the explicit logical width of the body in the shared 3D world coordinate system, not centimeters and not a pixel measurement.
- The body height is derived as `world_width / aspect_ratio`.
- It is independent of aspect ratio and of the legacy `size` field. When present it takes precedence for body dimensions; `size` remains present and readable to preserve the legacy descriptor contract.
- Normalized control positions and dimensions remain the authored 2D representation. A runtime applying `world_width` scales body and controls consistently without rewriting those normalized values.
- One logical unit is one Babylon.js world-coordinate unit before any consumer-owned instrument/root transform. `world_width` is the body's X-axis width; body height is `world_width / aspect_ratio`, with the existing body depth of `0.1` unchanged. The editor exposes a numeric input and a slider initially spanning `0.01`–`10` units; the slider expands for larger loaded values, and the numeric field is not capped at 10.
- `calculateAverageControlSize()` continues to return its legacy normalized control-size statistic. A V2 consumer uses `getBodyWorldDimensions()` to obtain the body's exact dimensions and must not multiply those dimensions by `calculateAverageControlSize()` a second time. A host may apply its own outer scene transform after consuming these dimensions, but it must apply it uniformly and only once.
- If omitted, preserve the current `size` plus `aspect_ratio` rendering behavior exactly; do not materialize a guessed `world_width` during migration. If present, it must be finite and greater than zero, and `required_features` must include `wam3dgenerator.world-width.v1`.

### `face_transform`

- `x` and `y` are texture-coordinate translations measured in multiples of the untransformed image's width and height. Positive `x` moves the image right; positive `y` moves it down when viewing the panel from the front.
- `rotation_degrees` is rotation about the image center; positive values rotate clockwise from the same front-facing view.
- `scale` is dimensionless uniform scaling about the image center; non-uniform X/Y scale is not part of this proposal.
- Apply scale, then rotation, then translation. Clip the transformed image to the body's front-face shape.
- These values affect only the optional `face` texture. They do not alter the 2D-only design reference, body shape, aspect ratio, absolute world width, or normalized control geometry.
- If omitted, use the identity transform `(x: 0, y: 0, rotation_degrees: 0, scale: 1)`, which preserves legacy texture appearance. A partial object defaults each omitted component to that identity value. Translation and rotation must be finite; scale must be finite and greater than zero. Invalid values are errors, not silently clamped values. If present, `required_features` must include `wam3dgenerator.face-transform.v1`.

### Migration and validation behavior

- Loading a version-1 descriptor with no V2 fields preserves its original data and rendering semantics. In memory, readers may treat its effective schema version as 1, but must not inject V2 defaults into the serialized legacy object.
- Loading a version-2 descriptor applies the defaults above for omitted optional fields. Defaulted values are runtime/editor values; serialization preserves the original omission unless the user explicitly edits or chooses to materialize them.
- A partial `design_reference` may omit only `opacity` and `fit`; `url` is required. Partial `face_transform` values are allowed and default independently to identity.
- Wrong types, non-finite numeric values, non-positive widths/scales, out-of-range opacity, unsupported fit strings, missing version/feature declarations, duplicate or malformed feature entries, and unsupported schema versions produce actionable validation errors. Implementations must not use a success-shaped fallback.
- Preserve unknown optional root/object properties through load/save where practical. Unknown required features are a hard incompatibility, even if the remaining fields are understood.
- Migration is additive: never rewrite legacy controls, parameter targets, normalized geometry, `size`, body appearance, WAM URL, or control ordering solely to add metadata. Loading and saving a legacy descriptor with no edits must not silently convert its version.

The machine-checkable descriptor contract is implemented by `normalizeWamGuiDescriptorCompatibility` and `serializeWamGuiDescriptor` in `src/descriptor/WamGuiDescriptor.ts`. The generator and control map also apply `world_width` to Babylon.js body and normalized control geometry. Design-reference display and face-texture transform rendering remain separate follow-up work.

## 7. Descriptor compatibility and integration requirements

### 7.1 Backward compatibility guarantees

Backward compatibility is a release requirement for V2, not a best-effort goal:

1. **Existing editor examples remain editable.** Every existing 3D WAM in the current Examples tab must load into V2 as a fully editable project. Its controls, settings, bindings, geometry, pad shape/appearance and WAM URL must be preserved. It must be possible to edit, save/export, reload and continue editing each example.
2. **Existing WAM Jam Party projects continue to work.** If WAM Jam Party adopts the V2 library/dependency, all 3D WAMs created before V2 must still load and behave as before, without requiring users to manually convert their saved GUI descriptors.
3. **New V2 projects require a compatible consumer.** Newly created WAMs that use V2-only descriptor properties, widget type identifiers or behaviors are required to work in WAM Jam Party when it uses a compatible V2 editor library/dependency. Compatibility with an older Jam Party dependency is not required for V2-only features, but exports must list the required feature identifiers and clearly warn that an older consumer may not render the project correctly.
4. V2-only descriptor properties are optional and default to behavior matching the existing implementation when absent.
5. Existing palette keys and saved settings remain readable; existing widget identifiers must not be repurposed to mean different behavior.
6. Normalized positions and sizes remain the authored 2D representation; any world-size conversion is performed consistently by the shared generator/runtime.
7. Keep the 2D and 3D renderers driven by the same model.
8. Legacy world-space scaling remains coordinated with WAM Jam Party's `calculateAverageControlSize()` behavior. For V2 descriptors with `world_width`, consumers use the generator's explicit body dimensions exactly once instead of multiplying by that normalized statistic.
9. Version-2 descriptors declare `schema_version: 2`; V2-only runtime behavior is listed in `required_features`, and editor-only behavior is listed in `editor_features`. Consumers return actionable errors for unsupported required features and preserve unknown optional data where practical.
10. Make failed WAM, descriptor or image loads visible and recoverable; do not silently replace user data with a fallback layout.

### 7.2 Feature test policy

Every new feature must include automated unit tests in the same change that implements it. Tests are part of the feature's definition of done, not a later cleanup task. The smallest relevant test set should be run for each change, with the focused compatibility suite run for changes to descriptors, widgets, rendering, scaling or the public library contract.

At minimum, the project should build a regression suite around:

- **Example-project fixtures:** Load each current `examples.json` GUI descriptor with the V2 library; verify its controls, types, settings, normalized geometry and body properties round-trip through load/save without losing editable data.
- **Legacy descriptor compatibility:** Load representative pre-V2 descriptors with omitted V2 fields; verify default values and rendered/model behavior match the legacy semantics.
- **WAM Jam Party integration contract:** Exercise the public library APIs used by `Wam3DGeneratorN3D` (generator creation, descriptor loading, control mapping, world-size calculation, state access and disposal) against legacy projects.
- **V2 feature descriptors/widgets:** Verify each V2-only property and widget round-trips and renders as expected; verify a V2-capable consumer can load and use it.
- **Compatibility declarations:** Verify schema and required-feature metadata is present when a project uses a V2-only capability, and that unsupported required features are rejected clearly. Because the library is source-pinned rather than released under a dependable semver contract, use feature identifiers instead of a numeric minimum library version.

Where a behavior depends on Babylon.js, the DOM, audio APIs or external WAM hosting, keep unit tests focused on deterministic model/serialization/contract behavior and add integration tests for the renderer/host boundary. Tests should not require network access to load live WAM URLs; use local fixtures or mocked host/module boundaries.

### 7.3 WAM Jam Party public library/runtime contract

The editor library and WAM Jam Party have separate responsibilities. The editor owns descriptor editing and serialization; the Jam Party adapter owns runtime scene integration, WAM parameter wiring, host/world scaling, state exposure, and lifecycle.

#### Legacy consumer contract

- Continue to import the established `controls`, `WamGUIGenerator`, `WAMGuiInitCode`, and `ControlStateManager` APIs from `wam3dgenerator`.
- Continue to create a generator, load a legacy descriptor with the control library, use `calculateAverageControlSize()` only as its existing normalized control-size statistic, expose eligible runtime control state through `ControlStateManager`, and dispose resources with the runtime node.
- Descriptors without `schema_version` remain version 1. Their `aspect_ratio`, `size`, body properties, control identifiers/settings/order, and normalized control geometry keep their existing interpretation. No manual rewrite is required.
- `ControlStateManager` remains a runtime widget-state API and is not an editor undo/redo history.

#### V2 descriptor consumer contract

- Before passing a descriptor to `WamGUIGenerator.load`, an updated adapter validates it with `normalizeWamGuiDescriptorCompatibility`, passing the exact runtime and editor feature IDs implemented by that installed library build. Do not treat a feature as supported merely because it appears in the descriptor or in the exported identifier constants.
- The helper reports effective schema version and normalized defaults, rejects unsupported schema versions and required runtime features with an actionable error, and reports unsupported editor-only features separately. Preserve the original descriptor for round-trip saving; normalization is not permission to discard unrecognized optional fields.
- The runtime adapter may ignore `design_reference` when rendering. The editor must retain it so the project can still be edited. A runtime must honor `world_width` and `face_transform` only when it declares the corresponding feature IDs as supported.
- An export using V2-only runtime behavior includes `schema_version: 2` and its matching `required_features`; V2 editor-only data is declared in `editor_features`. The editor/export UI must show these requirements. An older consumer that does not implement metadata checking may silently ignore unknown properties, so metadata alone cannot make that old consumer safe or guarantee it will show a warning.
- For a V2 world-width descriptor, the adapter reads `getBodyWorldDimensions()` and uses its width/height directly; it must not multiply these dimensions by legacy `size` or `calculateAverageControlSize()` again. `calculateAverageControlSize()` remains unchanged as a normalized statistic for legacy behavior.
- Runtime support is declared using versioned feature identifiers, not a numeric minimum package version. The package is private, WAM Jam Party pins a GitHub source revision, and the checked `package.json` (`0.0.11`) and `package-lock.json` (`0.0.2`) disagree. The consuming project must update its dependency source revision and lockfile deliberately and advertise only features that revision actually implements.

#### Validation boundary and coordinated release

- This repository's deterministic contract tests exercise its public exports, descriptor normalization/serialization, mock controls, and headless Babylon.js behavior. They do not execute the external WAM Jam Party adapter.
- Before release, WAM Jam Party must add or run an integration test against its actual `Wam3DGeneratorN3D` adapter and the selected editor-library commit. Verify legacy examples and runtime state behavior first; then test each declared V2 runtime feature with a descriptor that requires it.
- If an updated consumer cannot support a descriptor's required feature, fail before creating/loading the runtime GUI, surface the unsupported feature ID to the user, and leave the project data intact for reopening with a compatible consumer.

## 8. Incremental implementation task breakdown

Implement in numbered increments. Each subtask should be independently reviewable where practical; add or update unit tests alongside each feature. Do not begin dependent feature work until its prerequisite tasks are complete.

### 8.1 Task 1 — Establish compatibility fixtures and tests

- **1.1** Inventory all current `examples.json` entries and identify the legacy descriptor fields, widget types, parameter bindings and body settings they use.
- **1.2** Create deterministic test fixtures or fixture-loading helpers for those examples; avoid network-dependent WAM loading.
- **1.3** Add load/save round-trip and model-preservation tests for every existing example.
- **1.4** Add baseline legacy rendering/library contract tests for the public APIs used by WAM Jam Party.
- **1.5** Record current rendering/world-scale expectations so later scale or renderer changes can be regression-tested.

### 8.2 Task 2 — Define V2 descriptor and compatibility contract

- **2.1** Specify optional V2 fields for design reference metadata, absolute logical width and texture transform.
- **2.2** Define version-1 compatibility and V2 field defaults, partial-object behavior, validation failures, and non-destructive migration rules.
- **2.3** Keep existing control IDs immutable; use exact, case-sensitive, versioned runtime/editor feature identifiers, including `wam3dgenerator.widget.<widget-id>.v1` for V2-only widgets.
- **2.4** Test descriptor serialization, legacy and V2 defaults, optional-field round-trips, unsupported required features, unsupported editor-feature reporting, invalid metadata, and version/feature declaration failures.
- **2.5** Document and validate the editor library/WAM Jam Party boundary, supported-feature declaration, dependency pin/update process, legacy behavior, and required external adapter integration suite.

### 8.3 Task 3 — Add descriptor thumbnail reference and ratio workflow

- **3.1** Resolve relative thumbnails against an optional descriptor URL or WAM module URL; report loading, image natural dimensions, aspect ratio, and actionable URL/decode/CORS errors.
- **3.2** Show the image only in the 2D editor as a contain-fit overlay; provide independent visibility and opacity controls, defaulting to visible at 0.35 opacity.
- **3.3** Offer an explicit action to set the design aspect ratio from natural image dimensions and a reset action that restores 1:1.
- **3.4** Keep the reference image separate from `face` and add a deliberate action to copy its resolved URL into the existing optional body-texture setting.
- **3.5** Test URL resolution, exact natural-dimension ratio, missing/invalid image errors, cross-origin rejection and reference/body-texture separation without network access.

### 8.4 Task 4 — Separate logical 3D size from aspect ratio

- **4.1** Define one logical unit as one Babylon.js world-coordinate unit before host/root transforms; expose body dimensions to consumers and keep `calculateAverageControlSize()` as a separate normalized legacy statistic.
- **4.2** Add an opt-in explicit-width control with numeric and slider inputs; derive body height as width divided by design aspect ratio and leave width unchanged when ratio changes.
- **4.3** Scale Babylon.js control positions and dimensions from normalized layout values using the logical body width/height; keep saved normalized values and HTML composition unchanged.
- **4.4** Retain `size` and exact legacy rendering when `world_width` is absent; load/save the optional V2 `world_width` with `schema_version: 2` and `wam3dgenerator.world-width.v1`.
- **4.5** Test legacy scale parity, width/ratio independence, body/control world scaling, normalized-data preservation, serialization, invalid descriptors, and the local public consumer contract. The companion WAM Jam Party adapter is external and requires its own integration run.

### 8.5 Task 5 — Improve editing workspace and selection

- **5.1** Add a maximizable combined workspace with the 2D editor and 3D preview visible together. **Implemented:** the Dockview workspace hosts both views in one panel and maximizes/restores as one unit; independent 2D and 3D zoom controls were added, with reset actions and view-only scaling.
- **5.2** Add a user-resizable divider and preserve/restore dock layout. **Implemented:** pointer dragging and arrow keys resize the split, constrained to 20–80%; the split and Dockview layout persist separately in versioned local-storage keys. Invalid saved layouts are reported and fall back to the default.
- **5.3** Add marquee selection, explicit toggle/add selection, selection count and grouped transform handles. **Implemented:** background dragging selects intersecting controls; Shift adds to the selection; Ctrl/Cmd toggles intersecting controls; the toolbar reports the selection count and shared transform handles resize/move groups.
- **5.4** Improve discoverability of delete, move, resize, copy, cut, paste, duplicate, replace and alignment actions. **Implemented:** toolbar controls have visible labels, accessible names, disabled states, and shortcuts; duplicate is explicit, shortcuts ignore editable targets and require exact modifiers, and remove no longer conflicts with cut.
- **5.5** Test selection state, grouped geometry operations, workspace resize behavior and shortcut focus guards. **Implemented:** deterministic tests cover marquee selection modes and geometry, split clamping, focus guards, and shortcut modifiers. A browser smoke check exercised divider dragging and maximize/restore; full interactive and accessibility acceptance remains a manual check.

### 8.6 Task 6 — Add adjustable magnetic grid and snapping

- **6.1** Add independent grid visibility and snap enable/disable controls. **Implemented:** separate controls toggle a normalized design-area overlay and snapping; both are off by default to preserve prior editing behavior.
- **6.2** Add adjustable normalized grid spacing and deterministic snapping for move and resize. **Implemented:** spacing is configurable from 1% to 50% (default 5%); normalized rectangle edges snap consistently during movement and resizing, independent of canvas pixel dimensions.
- **6.3** Define and test tie-breaking between grid snapping and existing alignment guides. **Implemented:** the closest alignment guide within the existing 1%-of-design-area tolerance wins; otherwise enabled grid snapping selects the closest grid line. Ctrl retains its existing alignment-guide precision override while grid snapping remains enabled.
- **6.4** Add temporary snap override and visible snap-state feedback. **Implemented:** holding Alt during a drag bypasses both grid and alignment snapping; the workspace status reports grid snaps, guide alignment, no snap, or the active override.
- **6.5** Test snap math, bounds/edge behavior, zoom independence and grouped transforms. **Implemented:** deterministic tests cover grid/guide priority, disabled and override behavior, normalized bounds, move/resize anchors, equal normalized results at different canvas sizes, and preservation of grouped control spacing/proportions.

### 8.7 Task 7 — Implement document undo/redo

- **7.1** Define document history representation, history boundaries and a practical history limit. **Implemented:** history stores cloned before/after editor descriptors, has a 100-entry undo limit, clears on WAM replacement, and excludes runtime WAM parameter state and clipboard-only changes.
- **7.2** Record add/remove/replace/clipboard operations and grouped geometry changes. **Implemented:** add, remove, replace, cut, paste, duplicate and alignment commands are atomic entries; pointer movement/resizing records complete descriptor geometry, including groups.
- **7.3** Record control settings, body settings, texture transforms and auto-layout as one logical operation. **Implemented:** control/body setting edits are captured as document snapshots, reference-ratio/texture actions and Apply Auto Layout are single commands, and optional V2 `face_transform` metadata now survives generator load/save for history round-trips. Texture-transform editing/rendering remains Task 8.
- **7.4** Coalesce pointer drags, resizes and slider scrubs into one history entry per completed gesture. **Implemented:** document-form input/change events and control pointer/mouse gestures use begin/commit transactions, with no-op transactions discarded.
- **7.5** Add toolbar actions, keyboard shortcuts, disabled states and redo-branch clearing. **Implemented:** Undo/Redo toolbar controls use Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z; disabled states follow history availability and a new edit clears the redo branch.
- **7.6** Test undo/redo round-trips for each command category and verify live WAM parameter changes are excluded. **Implemented:** history tests cover command categories, undo/redo, coalescing, no-ops, limits, branch clearing, failed restores, runtime parameter exclusion, and V2 face-transform load/save preservation.

### 8.8 Task 8 — Add precise body texture transforms

- **8.1** Define UV translation origin/pivot, rotation convention and uniform-scale semantics.
- **8.2** Add numeric inputs, convenient sliders, reset action and a 2D transform overlay.
- **8.3** Persist transforms and apply them consistently in HTML/2D and Babylon.js/3D previews.
- **8.4** Ensure old projects render identically when transform fields are absent.
- **8.5** Test transform math, persistence, defaults and cross-renderer consistency.

**Implementation note:** The shared transform model uses image-relative translation, a center pivot, clockwise front-view rotation and positive uniform scale. The 2D preview applies the transform to its SVG image and can show a matching editor-only outline. Babylon.js remaps UV coordinates on the original body-face mesh, clamping texture edges while preserving its original vertices, normals, colors and indices. Untouched legacy descriptors retain identity rendering and do not gain V2 transform metadata.

### 8.9 Task 9 — Extend the reusable widget catalog

- **9.1** Define/review the factory contract separating widget behavior, parameter binding and visual skin. **Implemented:** the existing factory methods remain responsible for identity text, settings schema/defaults, creation and destruction; optional stable `WidgetDefinition` metadata declares behavior, skin, render targets, V2 feature ID and state persistence. `ParameterControl` remains the shared numeric binding behavior.
- **9.2** Confirm HTML/3D support declarations, lifecycle/disposal and actionable handling for unknown widget types. **Implemented:** every built-in widget declares HTML and Babylon.js support; target mismatches fail before a descriptor replaces the current design. Unknown descriptor IDs report the missing type and available catalog IDs. Parameter-field listeners now use revision/disposal guards, and palette previews clone their static rendering and dispose the temporary control.
- **9.3** Add the first requested alternate rotary skin reusing an existing parameter behavior. **Implemented:** `rotary_knob` reuses normalized WAM parameter binding and settings patterns while rendering an alternate dial/indicator in HTML and Babylon.js.
- **9.4** Add switch behaviors/skins and digital display/readout widgets with explicitly defined data sources. **Implemented:** `toggle_switch` and `momentary_button` bind one numeric target and map its normalized range to on/off; momentary input resets on pointer/keyboard release. `numeric_display` observes one or two selected target fields, supports parameter/decimal/percent/label formats, precision and custom units, and does not declare an editable field or participate in persisted WAM state.
- **9.5** Test each widget's settings, binding, 2D/3D rendering, serialization, clipboard and undo/redo behavior. **Implemented:** focused catalog tests cover settings/defaults, target declarations, field behavior, HTML and Babylon.js creation/disposal, live display updates, V2 feature declarations and save/reload, clipboard-shaped descriptor copies, undo/redo, state exclusion, unknown-type errors, and rotary drag/keyboard operation in HTML and simulated Babylon.js pointer interaction.

**Implementation note:** New descriptor types use stable IDs `rotary_knob`, `toggle_switch`, `momentary_button` and `numeric_display`, each with a matching `wam3dgenerator.widget.<id>.v1` required feature. Numeric displays are observers, not editable controls; their second target is optional. Existing descriptor control IDs and factory settings remain unchanged.

### 8.10 Task 10 — Integrate and release the V2 library with WAM Jam Party

- **10.1** Build the library and validate its exported types/API against the consumer's actual adapter.
- **10.2** Update WAM Jam Party's dependency and lockfile to the agreed V2 source revision.
- **10.3** Run the complete legacy example/project compatibility suite using the updated dependency.
- **10.4** Verify V2-only descriptors and widgets in WAM Jam Party; expose clear compatibility requirements for projects opened by older consumers.
- **10.5** Document the coordinated editor/library/consumer release and rollback expectations.

### 8.11 Task 11 — End-to-end acceptance

- **11.1** Run all unit tests and the focused compatibility/integration suites.
- **11.2** Manually verify Pro-54 reference ratio, body size independence, workspace behavior, texture alignment, editing tools and history.
- **11.3** Verify every existing Examples tab project remains editable and round-trips.
- **11.4** Verify legacy WAM Jam Party projects work unchanged with the V2 dependency, and new V2-feature projects work with that updated dependency.
- **11.5** Update user/developer documentation and capture any remaining compatibility limitations before release.

## 9. Acceptance criteria for a V2 implementation

- Loading a WAM with a valid relative thumbnail displays its image ratio and resolves the thumbnail against the WAM/descriptor location.
- A V2 `world_width` sets the Babylon.js body width exactly, derives its height from the aspect ratio, and scales Babylon.js control nodes using normalized geometry without rewriting the descriptor's normalized coordinates.
- Missing, invalid, decode-failed or cross-origin-blocked reference images display an actionable status; they do not leave thumbnail-dependent operations pending.
- For Pro-54, the initial ratio reads approximately 2.1379:1 and the complete thumbnail can be shown without crop in reference mode.
- Changing the ratio changes the design rectangle; changing the absolute size changes 3D body and control dimensions but does not change normalized placement or ratio.
- A 2D move/resize/settings change is visible in 3D immediately, and the exported descriptor reloads to the same layout in both runtime modes.
- The design workspace can be maximized with both canvases visible and a draggable divider adjusts the preview allocation.
- Independent icon-based 2D/3D zoom controls sit beside their respective views and change only the view; 2D control geometry and saved descriptor coordinates remain unchanged, selection handles stay usable when zoomed, and 3D mouse-wheel zoom continues to work.
- Marquee/Shift selection, grid visibility, snap toggle/spacing, delete, copy/cut/paste, duplicate, move and undo/redo work with single and grouped controls.
- One drag or slider gesture creates one undo step. Undo then redo restores the same control geometry, widget values and body/texture settings.
- Texture position, rotation and scale can be entered precisely, previewed, saved and restored.
- A new visual skin can use an existing behavior without changing its parameter mapping, and supported HTML/3D targets remain consistent.
- Every existing 3D WAM in the Examples tab remains fully editable in V2 and preserves its content through save/reload.
- All pre-V2 3D WAMs continue to work as before when WAM Jam Party adopts the V2 library/dependency.
- Projects using new V2 features/widgets work in WAM Jam Party with the compatible V2 library/dependency, and older consumers receive a clear compatibility warning/requirement.
- Every feature has automated unit tests, including example round-trip, legacy descriptor and library-consumer compatibility tests.

## 10. Confirmed decisions

The following choices were confirmed during specification review:

1. Keep the thumbnail as a separate 2D guide and provide an explicit action to copy it into the body-texture field.
2. Represent absolute body width with a unitless logical 3D-world scale. The numeric range should be chosen when the scale is compared with WAM Jam Party's current instruments.
3. Limit undo/redo to editor/document authoring changes; live WAM parameter changes remain runtime state.
4. Keep `Jempasam/3d_wam_editor` as the current canonical library dependency for WAM Jam Party.
5. Start texture adjustment with uniform scale, translation and rotation; non-uniform X/Y scaling is not required for the initial version.
