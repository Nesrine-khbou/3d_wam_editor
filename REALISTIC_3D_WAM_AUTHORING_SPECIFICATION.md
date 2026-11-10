# Realistic 3D WAM Authoring Specification

**Status:** Task 0 feasibility spike implemented; companion-runtime contract approval remains pending.
**Audience:** Editor, rendering, descriptor, and companion-runtime developers.  
**Scope:** General-purpose creation of realistic 3D instrument interfaces from original or properly authorized assets. This specification does not authorize or describe copying a third-party product's protected design, branding, artwork, or model.

## 1. Purpose

Extend the WAM GUI editor from a textured 3D control panel with predefined widgets into a tool for authoring a real 3D instrument scene. Authors should be able to create or import a body and detailed controls, arrange and materialize them in 3D, bind interactive parts to parameters/events exposed by a loaded WAM, and save a portable project that a compatible runtime can reproduce.

“Realistic” describes the authoring capability, not a guarantee of exactness. Fidelity depends on the source geometry, textures, material maps, dimensions, and interaction information that the author is entitled to use and supplies. A 2D reference image may assist alignment, but must never be treated as the instrument's geometry or as a substitute for a modeled body.

## 2. Current baseline and gap

The current editor has:

- A shared `WamGUIGenerator` design model with a 2D editor and Babylon.js preview.
- A pad/body generated from simple shapes and an optional front-face image.
- Predefined controls that create their own HTML and/or Babylon.js representations.
- Normalized 2D control rectangles, optional logical body width, texture transforms, and WAM parameter-field bindings.
- A WAM loader that can expose parameter metadata and the WAM's native GUI.

It does **not** currently provide a general 3D scene graph, arbitrary imported model editing, authored PBR materials, per-part pivots, custom control meshes, or a model-component-to-WAM-binding workflow. A face texture and positioned widgets cannot replace those capabilities.

## 3. Goals

1. Make the actual body, panel details, and controls 3D geometry. Keep reference overlays strictly editor-only.
2. Support both importing user-authorized 3D assets and assembling a scene from editor primitives.
3. Let authors organize geometry into named parts and reusable assemblies with sensible pivots.
4. Support realistic material and texture workflows appropriate for real-time rendering.
5. Bind a scene part to a declared WAM parameter or event and define how user interaction changes it.
6. Animate the bound part from parameter changes so the scene reflects both user input and WAM-originated updates.
7. Preserve existing legacy descriptors and the existing shared 2D/3D control workflow.
8. Ensure a compatible runtime can load the same scene and behavior without editor-only dependencies.

## 4. Non-goals

- Automatically inferring a complete 3D instrument from a thumbnail, screenshot, WAM module, or native GUI.
- Promising an exact visual/physical replica without suitable, authorized source assets and measurements.
- Replacing or reverse-engineering the WAM's own native GUI.
- Arbitrary user-supplied executable scripts in descriptors.
- Requiring a specific physical unit such as centimeters before the editor and consuming runtime agree on a scale convention.
- Removing the existing 2D controls, legacy body renderer, or descriptors.

## 5. Author workflow

The completed workflow should support these steps:

1. Create a 3D project and select a design scale and coordinate convention.
2. Create a body from primitives or import a user-authorized GLB/glTF model. Optionally add an editor-only front/side reference image for alignment.
3. Organize body panels, knobs, switches, keys, displays, labels, and other parts in a named scene hierarchy.
4. Import authorized texture assets or create materials with color, roughness, metallic, normal, and other supported maps.
5. Set the origin/pivot, dimensions, initial state, and allowed motion for each moving part.
6. Load the target WAM, select an exposed parameter/event, and bind it to a scene part using a declared behavior.
7. Test the interaction in the editor: moving a part updates the WAM, and WAM changes update the part.
8. Save, close, reopen, and export the project with its assets and required runtime features.
9. Load it in each supported companion runtime and confirm rendering, audio/MIDI behavior, and cleanup.

## 6. Functional requirements

### 6.1 Scene document and coordinate system

- Add an optional versioned 3D scene document to the GUI descriptor. Legacy descriptors without it must render as they do now.
- Define and document the scene coordinate system, axis directions, handedness, unit convention, forward direction, and default origin.
- Separate logical instrument dimensions from normalized 2D layout and from any consumer-owned outer scene transform.
- Represent the scene as a stable-ID hierarchy of nodes. Each node has a name, parent, local transform, visibility/lock state, and an explicit node kind.
- Support at minimum:
  - Imported static mesh/model.
  - Primitive mesh.
  - Group/transform node.
  - Interactive component.
  - Text/decal or other non-interactive visual component.
- Use stable IDs rather than mesh names or Babylon.js runtime object references for descriptor links.
- Validate parent references, cycles, duplicate IDs, finite transforms, and asset references before replacing the current project.
- Preserve unknown optional scene properties where practical. Unsupported required features must fail with an actionable error.

### 6.2 Model and asset import

- Initially support `.glb` and `.gltf` through a maintained Babylon.js loader. The editor must show import progress and report parse, dependency, and unsupported-content errors explicitly.
- Permit multiple meshes, nodes, and materials in one asset. Preserve hierarchy and source mesh/material assignments when possible.
- Provide import options for root scale, axis conversion, unit conversion, and whether to merge meshes. Never silently change orientation or scale.
- Allow the author to select an imported mesh/node and assign a stable scene-node ID. Keep non-selected subparts intact.
- Include a documented asset policy: users must have permission to use imported models, textures, fonts, and other content. The project must not fetch or extract assets from a third-party WAM without authorization.
- Keep asset references project-relative or embedded in a portable project package. Do not rely on temporary file URLs, local absolute paths, or expiring network URLs for exported designs.
- Add asset dependency inspection (missing files, unused files, file type, and size) before export.
- Define size and complexity limits for import, with visible warnings rather than silent truncation.

### 6.3 Editor viewport and scene manipulation

- Provide a 3D editing mode with orbit, pan, zoom, focus-selected, and fit-scene actions.
- Add picking and a scene hierarchy panel. Selection in the hierarchy and viewport must remain synchronized.
- Provide move, rotate, and scale gizmos with numeric transform entry, local/world axis modes, pivot display/editing, and undoable operations.
- Support duplicate, delete, group/ungroup, rename, lock/unlock, hide/show, and isolate selection.
- Provide snapping for translation, rotation, and scale with independent toggles and configurable increments.
- Keep editor overlays (gizmos, reference images, measurement guides, selection outlines) out of runtime rendering and exports.
- Preserve current 2D design and 2D/3D workspace operations. Clearly distinguish normalized 2D widget layout from arbitrary 3D scene transforms.

### 6.4 Geometry authoring

- Add a minimal primitive set useful for instrument parts (box, cylinder, sphere, plane, and rounded/lathed forms).
- Allow primitive dimensions, segment/resolution quality, bevel/chamfer where supported, and local pivot editing.
- Support non-destructive transforms and parameterized primitive properties; do not require mesh vertex editing in the first release.
- Allow imported mesh parts to be assigned as an interactive component without flattening the full model.
- Define geometry optimization (normal generation, tangents, mesh instancing where safe) as a later step after correctness and compatibility.
- Do not claim exact geometry from a 2D texture or an unverified reference.

### 6.5 Materials, textures, and surface detail

- Add a PBR material editor for base color, metallic, roughness, emissive, opacity/alpha mode, and supported texture maps.
- Support at minimum base-color and normal maps; define color-space handling and texture-coordinate selection. Add metallic/roughness and ambient-occlusion maps where the runtime path supports them.
- Support texture tiling/offset/rotation, filtering, and a UV preview. Keep UV texture transforms separate from mesh transforms.
- Provide authored text/label components and decals as geometry/material features, not baked into a required body screenshot.
- Preserve original material assignments on import until the author explicitly changes them.
- Show actionable errors for failed or unsupported textures and shader/material features.
- Add lighting/environment preview controls, while ensuring exported appearance does not depend on editor-only lighting.

### 6.6 Interactive components and WAM bindings

- Separate an interactive component's visual mesh/assembly from its behavior and WAM binding.
- Support a component containing one or more visual meshes and an explicit pivot/interaction axis.
- Initial behaviors:
  - Rotary: angular input mapped to a continuous parameter range.
  - Slider: linear movement mapped to a continuous parameter range.
  - Toggle: discrete two-state parameter.
  - Momentary button: press/release behavior where supported by the target.
  - Multi-position selector: a declared finite set of values/choices.
  - Read-only display: one or more parameter values; never writes unless a distinct behavior explicitly permits it.
- Each binding identifies the source endpoint using the loaded WAM's exposed parameter/event metadata; it must not guess based on a label or control's screen position.
- Store explicit value mapping: minimum, maximum, step, default, optional logarithmic/exponent mapping, inversion, and clamp policy. Validate against the WAM metadata.
- Define event/MIDI behaviors separately from numeric parameter bindings. A component must not claim to control behavior the WAM does not expose.
- Support bidirectional synchronization: user interaction writes through the host binding, and WAM updates animate/set the visual component. Prevent feedback loops and stale updates.
- Expose a clear unbound state, incompatible-binding error, and target list. Renaming a WAM parameter must not silently bind a different endpoint.
- Preserve existing `ParameterControl` behavior for legacy widgets; the new scene component system must not break existing control settings or descriptor IDs.

### 6.7 Animation and interaction testing

- Define deterministic animation mappings for continuous rotation/translation and discrete states.
- Specify axis, zero pose, min/max pose, direction, wrapping behavior (for rotary controls), and easing/response mode.
- Provide a test mode that can exercise components without a running audio engine where possible, and a live mode for WAM integration.
- Show the current target value, normalized value, and visual pose during binding/debugging.
- Verify that control operation is usable with mouse, touch, and keyboard where the component behavior supports those inputs.
- Support reset-to-default and project-defined initial visual state without altering the WAM's persisted audio state unexpectedly.

### 6.8 Persistence, packaging, and runtime compatibility

- Add a versioned optional descriptor field for the 3D scene, its assets, and component bindings. Final field names and feature IDs must be agreed before implementation.
- Use exact, case-sensitive, versioned feature identifiers for scene rendering, imported asset formats, material capabilities, and interactive component behaviors.
- Declare runtime-required features separately from editor-only capabilities, following the current V2 descriptor compatibility rules.
- Ensure assets are packaged or resolvable by a portable project manifest. Validate that no editor-only file path leaks into a runtime export.
- Maintain a transactional load: validate descriptor, assets, and required runtime features before replacing the active project.
- Preserve older consumers' ability to load legacy descriptors. An older consumer must reject an unsupported required 3D-scene feature clearly instead of silently omitting the scene.
- The companion runtime must implement the same transforms, material semantics, parameter mapping, interaction behavior, lifecycle, and disposal. A descriptor alone does not provide runtime support.
- Update and test WAM Jam Party (or any consumer) against the exact editor-library revision that introduces each runtime feature. Advertise only features implemented by that revision.

### 6.9 Usability and diagnostics

- Add an asset browser with imported assets/materials and clear missing-resource states.
- Add an inspector that shows selected node/component properties, transforms, material slots, bindings, and diagnostics.
- Include a design scale/reference measurement tool; values must use the declared project unit.
- Add a validation panel that lists missing assets, unbound interactive components, incompatible parameter ranges, unsupported features, and export blockers.
- Add undo/redo for scene hierarchy operations, transforms, geometry properties, materials, component setup, and bindings. Coalesce gizmo drags into one history transaction.
- Keep the existing document undo boundary and include scene changes in the same project history without storing Babylon.js nodes or DOM objects in history snapshots.

## 7. Descriptor and API design constraints

The following is a conceptual shape, not a finalized schema:

```json
{
  "schema_version": 2,
  "required_features": [
    "wam3dgenerator.scene-graph.v1",
    "wam3dgenerator.asset.glb.v1",
    "wam3dgenerator.interaction.rotary.v1"
  ],
  "scene": {
    "coordinate_system": "project-defined-versioned-id",
    "nodes": [
      {
        "id": "stable-node-id",
        "name": "Component",
        "kind": "interactive",
        "parent": null,
        "transform": {
          "position": [0, 0, 0],
          "rotation": [0, 0, 0],
          "scale": [1, 1, 1]
        },
        "asset": "assets/component.glb",
        "interaction": {
          "behavior": "rotary",
          "pivot": [0, 0, 0],
          "axis": [0, 1, 0],
          "target": "wam-endpoint-id",
          "mapping": {
            "minimum": 0,
            "maximum": 1,
            "step": 0
          }
        }
      }
    ]
  }
}
```

Schema requirements:

- Finalize coordinate and unit semantics before saving any authored transforms.
- Use finite numeric arrays of fixed length and reject zero/invalid scale where it makes a node unusable.
- Use stable endpoint IDs plus a display label; never use the label as the sole binding key.
- Separate asset URI, mesh/node selector within an asset, and runtime node ID.
- Keep editor reference images in editor-only metadata, not in runtime geometry/material slots.
- Define supported asset URI forms and packaging rules before the first import/export implementation.
- Validate IDs, hierarchy, references, mapping ranges, and feature declarations with actionable errors.
- Keep the schema additive and backward compatible; legacy descriptors without `scene` retain current behavior.

## 8. Implementation plan

Tasks are ordered to reduce rework. Each task includes focused automated tests. Runtime-affecting tasks also require integration tests in the consuming application.

### Task 0 — Feasibility, contract, and asset-policy spike

0.1. Confirm the target Babylon.js loader and renderer versions and test a small authorized GLB fixture with hierarchy, materials, and textures.  
0.2. Agree on coordinate axes, handedness, unit, root transform, asset packaging, and node identity.  
0.3. Decide which project package format carries model/texture assets and how URLs resolve after export.  
0.4. Finalize the editor/runtime ownership boundary and feature-ID negotiation with the companion consumer.  
0.5. Document accepted asset rights, file limits, unsupported GLTF extensions, and the behavior when assets are missing.  
0.6. Produce a small proof-of-concept that imports, displays, selects, saves, reloads, and disposes one authorized model without altering legacy projects.

**Exit criteria:** A documented descriptor draft and a passing test fixture demonstrate portable load/save and clean disposal. No user-facing feature work proceeds until scale, packaging, and runtime contracts are agreed.

#### Task 0 spike record (2026-11-05)

This is a non-user-facing feasibility result, not a released scene feature or a final runtime contract.

- **0.1 Loader and fixture:** The editor and the maintained `@babylonjs/loaders` GLTF plugin are pinned to Babylon.js `8.24.0`. The `test/glb-proof-of-concept.test.mjs` fixture is generated locally for this project; it contains an authored hierarchy, two meshes, a glTF metallic/roughness material, and an embedded PNG texture. The test imports it through the real loader into a Babylon.js `NullEngine` scene and checks scene membership, hierarchy, material, and texture objects.
- **0.2 Coordinate and identity draft:** The candidate project coordinate ID is `wam3d-editor-lh-y-up-meter-v1`: left-handed, +Y up, +X right, +Z forward, with one scene unit representing one meter. GLB is imported through Babylon's glTF loader into the editor's existing left-handed scene; no silent user scale or orientation option is applied. The model root remains at identity. A runtime model-node ID is the SHA-256 ID of the exact GLB plus its Babylon imported mesh index. This ID is scoped to an unchanged asset and is not a replacement for final scene-node IDs.
- **0.3 Portable project draft:** The spike uses a single `.wam3d.json`-shaped project document with the GLB bytes embedded as base64 and referenced by their SHA-256 asset ID. It needs no local path, temporary URL, network fetch, or external project asset. The final package extension and external-resource policy still require companion-runtime agreement; the prototype format is intentionally isolated from existing WAM GUI descriptors.
- **0.4 Ownership and feature negotiation:** The proposed boundary is that the editor owns authoring, asset validation, and project packaging; the companion owns runtime rendering, interaction, WAM parameter/event routing, and disposal. Proposed feature IDs are `wam3dgenerator.scene-graph.v1` and `wam3dgenerator.asset.glb.v1`. The WAM Jam Party consumer is not present in this checkout, so its owner has not confirmed the boundary or IDs. These IDs are drafts only and are not emitted in legacy descriptors or advertised as runtime support. Obtain consumer-owner approval and run its integration test before claiming Task 0 exit criteria complete.
- **0.5 Asset policy and limits:** Import only original or otherwise authorized assets; the tool must not fetch, extract, or package content from third-party WAMs without permission. The spike accepts GLB 2.0 with embedded resources and no required glTF extensions. It rejects external resource URIs, unsupported required extensions, malformed files, files larger than 25 MiB, models with more than 250 renderable meshes, and models exceeding 100,000 vertices, with explicit errors instead of truncation. Missing/unembedded dependencies fail before the project is changed. These are initial spike budgets, not production performance guarantees.
- **0.6 Proof of concept:** `src/scene/GlbProofOfConcept.ts` imports a model into a Babylon scene, allows a mesh to be selected by stable asset-scoped ID, serializes the original GLB into a portable project document, reloads it with integrity checking, and disposes the `AssetContainer`. The automated fixture also checks failed imports, integrity errors, and unknown selections. It does not alter `WamGUIGenerator` or legacy descriptors.

Candidate portable project envelope (not yet a consumer-approved runtime descriptor):

```json
{
  "format": "wam3d-glb-poc",
  "version": 1,
  "coordinate_system": "wam3d-editor-lh-y-up-meter-v1",
  "assets": [{
    "id": "glb-<sha256-of-exact-glb-bytes>",
    "file_name": "instrument.glb",
    "content_type": "model/gltf-binary",
    "data_base64": "<embedded-glb-bytes>"
  }],
  "selected_node_id": "glb-<sha256-of-exact-glb-bytes>/mesh/<imported-mesh-index>"
}
```

**Task 0 status:** 0.1, 0.2, 0.3, 0.5, and the isolated 0.6 spike have candidate implementations/documentation and automated coverage. 0.4 remains awaiting approval from the external runtime owner. Consequently the formal exit criteria are not yet fully met; do not begin user-facing scene-authoring or runtime feature work until that approval, package contract, and consumer integration test are complete.

### Task 1 — Versioned scene document model

1.1. Add typed scene node, transform, asset reference, material reference, and component-binding models independent of Babylon.js objects.  
1.2. Add strict validation, normalization rules, migration boundaries, and required-feature checks.  
1.3. Integrate scene snapshots with existing load/save and document undo/redo.  
1.4. Test legacy descriptors, malformed hierarchies, unknown required features, optional-data preservation, and round-trips.  
1.5. Add a serialized fixture containing only editor-neutral data; no renderer object may appear in it.

#### Task 1 implementation record (2026-11-05)

- **1.1 Typed model:** Added the renderer-independent `WamGuiSceneDocument` contract. Scene nodes use stable IDs, explicit parent IDs, local position/Euler-rotation/scale tuples, visibility and lock flags, and the five required node kinds. The scene identifies coordinate system `wam3d-editor-lh-y-up-meter-v1` and transform convention `wam3dgenerator.trs-rz-ry-rx-radians.v1`. The model also types project-relative asset records and mesh/node selectors, material records/references, parameter/event endpoints and mappings, primitive parameters, and interactive pivot/axis data. It contains no Babylon.js or DOM types.
- **1.2 Validation and migration boundary:** Added strict scene normalization for schema version 1. The coordinate system is left-handed, +Y up, +X right, +Z forward, and one unit represents one meter. Transforms are local TRS; position is in scene units, rotation is XYZ Euler in radians composed as `Rz * Ry * Rx` (X applied first), and local points are scaled, rotated, then translated. Root nodes have no parent and default to identity transform; omitted node transforms normalize to identity, visibility defaults true and lock defaults false. IDs must be unique and stable; parent and asset/material references must resolve; parent cycles, invalid vectors/scales, invalid URI traversal, unsupported node/primitive/behavior types, and invalid binding ranges fail with actionable errors. Unknown optional properties are retained. The scene is an additive field on WAM GUI schema version 2 and requires `wam3dgenerator.scene-graph.v1`; scene data on a legacy descriptor is rejected. Compatibility validation rejects required features not declared supported by the caller.
- **1.3 Load/save/history:** `WamGUIGenerator.load` validates the descriptor and scene before changing current document state, then records the normalized scene independently of renderer objects. `save` validates and serializes that scene and declares the required feature. Since the existing `DocumentHistory` captures `WamGUIGenerator.save()` and restores with `load()`, scene edits are part of the existing undo/redo snapshots. A failed scene load leaves the current descriptor intact.
- **1.4 Tests:** Added tests for legacy descriptors, schema and feature declarations, malformed graph structure and references, non-finite/zero transforms, binding validation, optional extension preservation, descriptor round-trips, atomic failed loads, and scene undo/redo.
- **1.5 Editor-neutral fixture:** Added `test/fixtures/scene-document.v1.json`, containing only JSON data (hierarchy, mesh references, materials, a parameter binding and optional extension data). A test asserts that its normalized/serialized shape contains no Babylon runtime object references.

The descriptor shape used by this model is:

```json
{
  "schema_version": 2,
  "required_features": ["wam3dgenerator.scene-graph.v1"],
  "scene": {
    "schema_version": 1,
    "coordinate_system": "wam3d-editor-lh-y-up-meter-v1",
    "transform_convention": "wam3dgenerator.trs-rz-ry-rx-radians.v1",
    "assets": [{
      "id": "instrument-model",
      "uri": "assets/instrument.glb",
      "media_type": "model/gltf-binary"
    }],
    "materials": [{ "id": "panel-material", "name": "Panel" }],
    "nodes": [{
      "id": "body",
      "name": "Body",
      "kind": "imported_mesh",
      "parent": null,
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "asset": { "asset_id": "instrument-model", "node": "body", "mesh": "body-mesh" },
      "material_refs": [{ "material_id": "panel-material" }]
    }]
  }
}
```

**Task 1 status:** 1.1–1.5 are implemented and covered by automated tests. The feature ID is a required descriptor declaration only; this does not claim that the external companion runtime supports rendering the scene. The companion-runtime approval/integration blocker recorded under Task 0 still applies.

### Task 2 — Portable model and texture asset pipeline

2.1. Implement GLB/glTF import with explicit progress, cancellation, and user-visible errors.  
2.2. Preserve hierarchy, mesh identity, materials, UVs, and supported texture dependencies.  
2.3. Implement project-relative asset references and portable package export/import.  
2.4. Add missing/unused/oversized asset validation and dependency summaries.  
2.5. Test embedded and external GLTF resources, bad files, missing textures, reload, and disposal without network access.

#### Task 2 implementation record (2026-11-09)

- **2.1 Import and progress:** Added the public `importGltfAsset(scene, files, primaryFilePath, options)` API in `src/scene/SceneAssetPipeline.ts`. It accepts a selected local `.glb` or `.gltf` plus local dependency files, reports validating/loading/complete progress, accepts an `AbortSignal`, and returns a typed model container or a `SceneAssetPipelineError` with a stable error code and actionable message. Babylon's GLTF loader is pinned to the same `8.24.0` as Babylon core. Aborting prevents the import result from being installed and disposes a model if cancellation arrives while the loader is completing; Babylon.js 8.24.0 does not expose a cancellation parameter for the internal parse itself.
- **2.2 Preservation and supported subset:** Import goes through Babylon's maintained glTF loader and returns the original `AssetContainer` (all imported transform nodes/meshes, materials, and textures) plus stable asset-scoped node and mesh IDs derived from the exact selected model/dependency path and bytes plus imported array indices. Geometry/UV data and source material assignments are retained by the loader. Supported required glTF extensions for this pipeline are `KHR_materials_unlit` and `KHR_texture_transform`; other required extensions fail explicitly. Local texture and buffer dependencies are resolved from the selected file set and converted to in-memory data URIs before loading. No remote dependency is fetched.
- **2.3 Portable project packaging:** Added `exportSceneProjectPackage` and `importSceneProjectPackage`. The version-1 `.wam3d-project` JSON envelope contains the WAM GUI descriptor and every packaged asset as project-relative URI, media type, byte length, SHA-256 integrity value, and base64 bytes. Package import validates the descriptor/scene, safe relative paths, types, sizes, hashes, uniqueness, and scene dependencies before returning the restored descriptor and bytes. A moved package can therefore be reopened without filesystem paths or network access.
- **2.4 Dependency report and limits:** `inspectSceneAssetDependencies` returns per-file IDs/types/sizes and missing, unused, oversized, and unsupported lists with messages. Missing, unsupported, or oversized dependencies block export. Unused files are reported but remain in the portable package. Defaults are 25 MiB per file, 100 MiB total, 256 files, 250 renderable meshes, and 100,000 vertices; import callers may lower/raise per-file and geometry limits explicitly.
- **2.5 Automated coverage:** `test/scene-asset-pipeline.test.mjs` uses authored in-memory fixtures to verify embedded GLB and external `.gltf` dependencies, offline import, preserved hierarchy/PBR/UV/texture data, progress/cancellation/disposal, missing dependencies, unsupported extensions, malformed/unsafe/oversized files, dependency summaries, portable package round-trips after relocation, integrity failures, and export blockers.

**Task 2 status:** 2.1–2.5 have implementation and automated coverage. This delivers a library/API pipeline, not a file-picker, asset-browser, or user-facing import/export UI. Runtime rendering/consumer integration remains outside this repository and is not implied by editor-side loading or packaging.

### Task 3 — Scene hierarchy and transform editing

3.1. Add a scene tree with select, rename, group, ungroup, hide, lock, duplicate, delete, and reparent operations.  
3.2. Add viewport gizmos and numeric position/rotation/scale inputs with local/world modes.  
3.3. Add pivot editing, focus-selected, fit-scene, and configurable snapping.  
3.4. Ensure all operations update the scene model and serialize without retaining runtime mesh references.  
3.5. Test hierarchy edits, transform math, snapping, undo/redo, and reload fidelity.

#### Task 3 implementation record (2026-11-09)

- **3.1 Scene hierarchy:** Added a Scene Hierarchy panel available from the editor's View menu. It displays the loaded scene graph and supports selection (Ctrl/Cmd-click for multi-select), rename, group/ungroup, hide/show, lock/unlock, duplicate, delete, and reparent. Grouping and reparenting preserve world poses where the resulting transform is representable as TRS.
- **3.2 Transforms and gizmos:** Added numeric position, Euler rotation (radians), and scale fields with local/world modes, plus position/rotation/scale Babylon gizmos for the selected scene node. The gizmos operate on transient `TransformNode` proxies; a completed drag is applied to the serializable model as one shared undo/redo transaction. Locked nodes and descendants cannot be moved/rotated/scaled through the transform editor.
- **3.3 Pivot and view tools:** Added a general per-node pivot vector (default `[0, 0, 0]` for older scene documents), pivot fields, Focus selected, Fit scene, and independently configurable translation, rotation, and scale snapping. Translation increments are in scene units, rotation increments in radians, and scale increments in scale units.
- **3.4 Serializable source of truth:** Hierarchy, visibility, lock, pivot, and transform edits update `WamGUIGenerator.scene_document`, so the existing descriptor save/load and document history keep the edits. Babylon nodes exist only as disposable viewport proxies; no Babylon or DOM references enter saved descriptors.
- **3.5 Automated coverage:** `test/scene-document-editor.test.mjs` verifies hierarchy edits, cross-parent grouping, reparent/group world-transform preservation, world/local transforms, snapping validation, pivot serialization/reload normalization, lock behavior, delete/duplicate IDs, and history undo/redo.

**Task 3 status:** 3.1–3.5 are implemented and covered by automated tests. The panel edits scene descriptors but does not yet render imported models or primitive geometry from the new scene graph; its viewport gizmos are attached to transform proxies. Scene visibility is persisted, but does not yet hide rendered imported meshes. Runtime consumer integration remains outside this repository.

### Task 4 — Primitive geometry and reusable assemblies

4.1. Add parameterized box, cylinder, sphere, plane, and rounded/lathed primitives.  
4.2. Support grouping primitives into reusable assemblies and assigning pivots.  
4.3. Add bevel/chamfer only where the chosen implementation can serialize and reproduce it consistently at runtime.  
4.4. Test deterministic rendering and dimensions in both editor and runtime renderers.

### Task 5 — PBR material and decal tools

5.1. Add a material model and inspector for supported PBR values and texture maps.  
5.2. Implement UV selection/transforms and explicit color-space, alpha, tiling, and filtering settings.  
5.3. Add text/decal features with runtime-compatible fonts/asset packaging.  
5.4. Test persistence, missing texture errors, color-space handling, and editor/runtime visual parity.

### Task 6 — Reusable interactive component system

6.1. Define a component contract separating visual assembly, interaction behavior, parameter binding, and animation.  
6.2. Implement rotary, slider, toggle, momentary, multi-position, and read-only display behaviors.  
6.3. Add per-component pivots, axes, rest/min/max poses, and input mappings.  
6.4. Use exposed WAM metadata to validate target range, step, exponent, and parameter identity.  
6.5. Test live bidirectional updates, feedback-loop prevention, external WAM changes, disposal, and unavailable targets.

### Task 7 — 3D authoring UX and project validation

7.1. Add a dedicated scene-editing workspace, hierarchy, inspector, asset browser, and transform gizmos.  
7.2. Keep the 2D editor and reference overlay available without treating them as runtime geometry.  
7.3. Add diagnostics for unbound components, invalid mappings, unsupported assets/features, and missing resources.  
7.4. Add atomic undo/redo for all scene operations and coalescing for continuous transforms.  
7.5. Test keyboard/mouse/touch interactions, accessible controls, persistence, and history boundaries.

### Task 8 — Runtime renderer and consumer integration

8.1. Implement the scene renderer and component interactions in the library/runtime API.  
8.2. Add required-feature detection before scene creation and actionable errors for unsupported features.  
8.3. Update the companion runtime dependency to the selected library revision and implement the declared features.  
8.4. Verify WAM connection, parameter/event routing, audio/MIDI operation, state behavior, and resource disposal.  
8.5. Test legacy descriptor behavior and every new feature against both editor preview and the actual consumer runtime.

### Task 9 — Export, compatibility, and release gates

9.1. Add a project package/export action that includes all referenced authorized assets and a manifest.  
9.2. Validate relative URLs after moving the package to another directory or host.  
9.3. Test round-trip editing, export, reload, and consumer loading with a clean environment.  
9.4. Document supported consumer feature IDs and warnings for older consumers.  
9.5. Do not mark the feature complete until the companion runtime integration test passes.

## 9. Acceptance criteria

The feature set is ready for release only when all of the following hold:

1. A model imported from an authorized local GLB displays as actual 3D geometry; changing the camera reveals its depth and sides. No body screenshot is used as a substitute for the model.
2. The author can select and transform individual hierarchy nodes and create at least a simple primitive assembly without editing source code.
3. Materials and supported texture maps survive save, package export, reload, and runtime loading.
4. An interactive component visibly moves/rotates according to a WAM parameter, and changing the component updates that WAM parameter within its declared range and step.
5. An external WAM parameter update changes the component pose/value without feedback loops.
6. Missing endpoints, invalid ranges, missing assets, malformed hierarchies, and unsupported required features produce explicit actionable errors and do not destroy the currently open project.
7. Existing legacy descriptors and predefined widgets continue to behave as before.
8. A packaged project works without relying on the editor's local filesystem or temporary URLs.
9. Deterministic tests cover schema, mapping, transforms, materials, asset packaging, error cases, and compatibility; an integration test exercises the actual consumer runtime.
10. User-supplied assets remain user-supplied; the editor does not download, extract, or package third-party product assets without authorization.

## 10. Risks and open decisions

- **Visual fidelity depends on inputs:** Geometry and texture tools cannot guarantee realism without sufficient, authorized assets and measurements.
- **External consumer dependency:** Editor preview success does not prove WAM Jam Party supports a new scene or feature ID.
- **Asset portability and size:** Embedded textures can make packages large; external paths can break. The package strategy must be decided in Task 0.
- **Format compatibility:** glTF extensions and PBR features vary by renderer version. The supported subset must be explicit and tested.
- **Parameter identity:** WAM parameter labels can change or be localized. Stable endpoint IDs and compatibility diagnostics are required.
- **Performance:** High-poly meshes and large textures can harm browser and VR performance. Establish measurable budgets and warnings during Task 0.
- **Scope:** Full mesh sculpting, photogrammetry, automatic reconstruction, and arbitrary shaders are intentionally excluded from the initial implementation.

## 11. Definition of done for each task

- Tests are added with the implementation and run at the narrowest relevant level.
- Type-check/build and relevant existing compatibility tests pass.
- User-visible failures are actionable; no silent fallback to a thumbnail, placeholder success, or dropped scene node.
- Descriptor changes are documented and preserve legacy behavior.
- Runtime-required behavior is tested in the consuming application, not only in a Babylon.js editor preview.
- `HANDOFF.md` is updated with actual implementation status, files, tests, decisions, and the next concrete task.
