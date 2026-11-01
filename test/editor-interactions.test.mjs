import assert from "node:assert/strict";
import { test } from "node:test";

const {
    clampWorkspaceSplit,
    isEditableShortcutTarget,
    matchesShortcutModifiers,
    rectanglesIntersect,
    snapCoordinate,
    snapRectPosition,
    shouldSelectInMarquee,
    transformGroupGeometry,
} = await import("../src/gui/editorInteractions.ts");

test("workspace split is finite and clamped to the supported range", () => {
    assert.equal(clampWorkspaceSplit(0.5), 0.5);
    assert.equal(clampWorkspaceSplit(0.05), 0.2);
    assert.equal(clampWorkspaceSplit(0.95), 0.8);
    assert.equal(clampWorkspaceSplit(Number.NaN), 0.5);
});

test("marquee intersection handles overlap, containment, and separation", () => {
    const marquee = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    assert.equal(rectanglesIntersect(marquee, { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }), true);
    assert.equal(rectanglesIntersect(marquee, { x: 0.25, y: 0.25, width: 0.05, height: 0.05 }), true);
    assert.equal(rectanglesIntersect(marquee, { x: 0.6, y: 0.6, width: 0.1, height: 0.1 }), false);
});

test("marquee replace, add, and toggle modes preserve the intended selection state", () => {
    assert.equal(shouldSelectInMarquee("replace", true, false), false);
    assert.equal(shouldSelectInMarquee("replace", false, true), true);
    assert.equal(shouldSelectInMarquee("add", true, false), true);
    assert.equal(shouldSelectInMarquee("add", false, true), true);
    assert.equal(shouldSelectInMarquee("toggle", true, true), false);
    assert.equal(shouldSelectInMarquee("toggle", true, false), true);
    assert.equal(shouldSelectInMarquee("toggle", false, true), true);
});

test("group transform keeps member geometry proportional to its bounds", () => {
    const actual = transformGroupGeometry(
        [
            { x: 0.2, y: 0.3, width: 0.1, height: 0.2 },
            { x: 0.5, y: 0.5, width: 0.2, height: 0.1 },
        ],
        { x: 0.2, y: 0.3, width: 0.5, height: 0.3 },
    );
    const expected = [
        { x: 0, y: 0, width: 0.2, height: 2 / 3 },
        { x: 0.6, y: 2 / 3, width: 0.4, height: 1 / 3 },
    ];
    assert.equal(actual.length, expected.length);
    actual.forEach((rect, index) => {
        for(const key of Object.keys(rect)){
            assert.ok(Math.abs(rect[key] - expected[index][key]) < 1e-12, `${key} should preserve group proportions`);
        }
    });
});

test("grid snapping uses normalized spacing and alignment guides take priority", () => {
    const settings = { enabled: true, spacing: 0.1 };
    assert.deepEqual(snapCoordinate(0.246, [], settings), { value: 0.2, source: "grid" });
    assert.deepEqual(
        snapCoordinate(0.246, [0.25], settings),
        { value: 0.25, source: "alignment" },
    );
    assert.deepEqual(
        snapCoordinate(0.246, [0.27], settings),
        { value: 0.2, source: "grid" },
    );
});

test("grid visibility is independent of snapping and snap override bypasses both sources", () => {
    const disabled = { enabled: false, spacing: 0.1 };
    assert.deepEqual(snapCoordinate(0.246, [], disabled), { value: 0.246, source: "none" });
    assert.deepEqual(
        snapCoordinate(0.246, [0.25], disabled),
        { value: 0.25, source: "alignment" },
    );
    assert.deepEqual(
        snapCoordinate(0.246, [0.25], { enabled: true, spacing: 0.1 }, true),
        { value: 0.246, source: "override" },
    );
    assert.deepEqual(
        snapCoordinate(0.246, [0.25], { enabled: true, spacing: 0.1 }, false, true),
        { value: 0.2, source: "grid" },
    );
});

test("move and resize snapping use normalized control edges and honor design bounds", () => {
    const gridSnap = snapRectPosition(0.146, 0.2, [], { enabled: true, spacing: 0.1 });
    assert.ok(Math.abs(gridSnap.value - 0.1) < 1e-12);
    assert.equal(gridSnap.source, "grid");
    assert.equal(gridSnap.edge, "start");
    const guideSnap = snapRectPosition(0.14, 0.2, [0.345], { enabled: true, spacing: 0.1 });
    assert.ok(Math.abs(guideSnap.value - 0.145) < 1e-12);
    assert.equal(guideSnap.source, "alignment");
    assert.equal(guideSnap.edge, "end");
    assert.deepEqual(
        snapCoordinate(0.99, [], { enabled: true, spacing: 0.3 }),
        { value: 1, source: "grid" },
    );
});

test("the same normalized coordinate snaps identically at different canvas sizes", () => {
    const settings = { enabled: true, spacing: 0.05 };
    const results = [320, 1280].map(canvasPixels => {
        const pointerPixels = 0.247 * canvasPixels;
        const normalizedPosition = pointerPixels / canvasPixels;
        return snapCoordinate(normalizedPosition, [], settings);
    });
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[0].value, 0.25);
});

test("snapping a group boundary preserves child spacing and proportions", () => {
    const group = { x: 0.146, y: 0.146, width: 0.4, height: 0.4 };
    const controls = [
        { x: 0.146, y: 0.146, width: 0.1, height: 0.1 },
        { x: 0.446, y: 0.346, width: 0.1, height: 0.2 },
    ];
    const relative = transformGroupGeometry(controls, group);
    const snappedX = snapRectPosition(group.x, group.width, [], { enabled: true, spacing: 0.05 }).value;
    const snappedY = snapRectPosition(group.y, group.height, [], { enabled: true, spacing: 0.05 }).value;
    const moved = relative.map(rect => ({
        x: snappedX + rect.x * group.width,
        y: snappedY + rect.y * group.height,
        width: rect.width * group.width,
        height: rect.height * group.height,
    }));
    assert.ok(Math.abs((moved[1].x - moved[0].x) - (controls[1].x - controls[0].x)) < 1e-12);
    assert.ok(Math.abs((moved[1].y - moved[0].y) - (controls[1].y - controls[0].y)) < 1e-12);
    assert.ok(Math.abs(moved[1].height - controls[1].height) < 1e-12);
});

test("shortcut guards reject editable fields, buttons, and contenteditable targets", () => {
    const closest = () => null;
    for(const tagName of ["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON"]){
        assert.equal(isEditableShortcutTarget({ tagName, closest }), true);
    }
    assert.equal(isEditableShortcutTarget({ tagName: "DIV", isContentEditable: true, closest }), true);
    assert.equal(
        isEditableShortcutTarget({ tagName: "DIV", closest: selector => selector.includes("button") }),
        true,
    );
    assert.equal(isEditableShortcutTarget({ tagName: "DIV", closest }), false);
    assert.equal(isEditableShortcutTarget(null), false);
});

test("shortcut modifiers require exact modifiers and accept platform command keys", () => {
    assert.equal(
        matchesShortcutModifiers(
            { ctrl: true },
            { ctrlKey: false, metaKey: true, shiftKey: false, altKey: false },
        ),
        true,
    );
    assert.equal(
        matchesShortcutModifiers(
            { ctrl: true },
            { ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
        ),
        false,
    );
    assert.equal(
        matchesShortcutModifiers(
            {},
            { ctrlKey: false, metaKey: false, shiftKey: false, altKey: true },
        ),
        false,
    );
});
