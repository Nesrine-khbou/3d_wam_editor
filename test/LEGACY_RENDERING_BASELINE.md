# Legacy Rendering and World-Scale Baseline

Observed from `src/WamGUIGenerator.ts` and `src/control/ControlMap.ts`, and exercised by `test/legacy-example-compatibility.test.mjs`. These values describe current behavior to protect during compatibility-sensitive V2 changes; they are not claims of physical instrument units.

## Pad

- The descriptor `aspect_ratio` is width divided by height.
- For aspect ratios greater than 1, the normalized pad dimensions are `(1, 1 / aspect_ratio)`. For ratios at or below 1, they are `(aspect_ratio, 1)`.
- Both dimensions are multiplied by descriptor `size`.
- Babylon.js pad-node scale is `(body_width, 0.1, body_height)`, with the 0.1 depth independent of aspect ratio and size.
- In the HTML view, pad width and height are those body dimensions expressed as percentages of the host, with margins centering the pad.

Examples: ratio `2`, size `0.8` yields Babylon scaling `(0.8, 0.1, 0.4)`; ratio `0.5`, size `0.8` yields `(0.4, 0.1, 0.8)`.

## Controls

- Authored `x`, `y`, `width`, and `height` remain normalized to the design surface.
- HTML control containers use those values directly as percentages of their parent surface.
- Babylon.js control-node scaling is `(width, min(width, height), height)`.
- Babylon.js control-node position is `(x, 0.545, -y)`. The pivot is set to `(-0.5, -0.5, 0.5)`.
- Moving a control updates position without changing its size; resizing updates scale without changing its position.

Example: `(x, y, width, height) = (0.25, 0.4, 0.2, 0.1)` produces scale `(0.2, 0.1, 0.1)` and position `(0.25, 0.545, -0.4)`.

## Consumer World-Scale Helper

`WamGUIGenerator.calculateAverageControlSize()` sorts each control's `max(width, height)`, averages the middle half using indices `floor(n / 4)` through (but excluding) `ceil(3n / 4)`, and returns `1` when there are no controls. The consumer may use this normalized statistic to scale a WAM in its world; it is not itself a physical width.

## V2 Explicit Logical Width

- When `world_width` is absent, pad and control Babylon.js scale/position retain the legacy values above.
- When present, body dimensions are `(world_width, 0.1, world_width / aspect_ratio)`. The explicit width is not multiplied by legacy `size`.
- A normalized control rectangle `(x, y, width, height)` maps to position `(x * world_width, 0.545, -y * body_height)` and scale `(width * world_width, min(width * world_width, height * body_height), height * body_height)`.
- Changing the design ratio changes body/control height and Y-axis layout mapping, but not explicit width. The model's normalized rectangle values and HTML percentage geometry are not rewritten.
- `getBodyWorldDimensions()` exposes the exact body width/height to a V2 consumer. `calculateAverageControlSize()` remains a normalized legacy statistic and must not be used as a second scale multiplier for these dimensions.

## Test Boundary

Headless Babylon.js tests use `NullEngine`, local synthetic descriptors without face images, and mock controls. They do not download WAM modules or images. The companion application's adapter implementation is outside this repository, so the tests exercise the editor library's public APIs consumed by that adapter rather than executing the companion application itself.
