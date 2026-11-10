import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.window ??= {
    addEventListener() {},
    removeEventListener() {},
};
globalThis.document ??= {
    fonts: { add() {} },
    addEventListener() {},
    removeEventListener() {},
};
globalThis.FontFace ??= class {
    async load() { return this; }
};

const {
    DEFAULT_SCENE_SNAP_SETTINGS,
    SceneDocumentEditor,
    WAM_GUI_SCENE_COORDINATE_SYSTEM,
    WAM_GUI_SCENE_TRANSFORM_CONVENTION,
    normalizeWamGuiScene,
} = await import("../dist/index.js");
const { DocumentHistory } = await import("../src/editor/DocumentHistory.ts");

function createScene() {
    return normalizeWamGuiScene({
        schema_version: 1,
        coordinate_system: WAM_GUI_SCENE_COORDINATE_SYSTEM,
        transform_convention: WAM_GUI_SCENE_TRANSFORM_CONVENTION,
        nodes: [
            {
                id: "group-a",
                name: "Group A",
                kind: "group",
                parent: null,
                transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            },
            {
                id: "node-a",
                name: "Node A",
                kind: "primitive",
                parent: "group-a",
                transform: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                geometry: { type: "box", parameters: { width: 1, height: 1, depth: 1 } },
            },
            {
                id: "node-b",
                name: "Node B",
                kind: "primitive",
                parent: "group-a",
                transform: { position: [0, 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
                geometry: { type: "sphere", parameters: { diameter: 1 } },
            },
        ],
    });
}

function createEditor(initial = createScene()) {
    let document = structuredClone(initial);
    let nextId = 1;
    const editor = new SceneDocumentEditor({
        read: () => document,
        write: value => { document = value; },
        createId: () => `generated-${nextId++}`,
    });
    return {
        editor,
        read: () => document,
        write: value => { document = value; },
    };
}

function closeVector(actual, expected) {
    assert.equal(actual.length, expected.length);
    for (let index = 0; index < actual.length; index++) {
        assert.ok(Math.abs(actual[index] - expected[index]) < 1e-8, `${actual} should equal ${expected}`);
    }
}

test("group and ungroup preserve child world transforms", () => {
    const { editor, read } = createEditor();
    const before = editor.worldTransform("node-a");
    const groupId = editor.group(["node-a", "node-b"], "Controls");
    assert.equal(read().nodes.find(node => node.id === groupId).kind, "group");
    assert.equal(read().nodes.find(node => node.id === "node-a").parent, groupId);
    closeVector(editor.worldTransform("node-a").position, before.position);
    editor.ungroup(groupId);
    assert.equal(read().nodes.some(node => node.id === groupId), false);
    assert.equal(read().nodes.find(node => node.id === "node-a").parent, "group-a");
    closeVector(editor.worldTransform("node-a").position, before.position);
});

test("grouping selections from different parents preserves their world poses", () => {
    const { editor, read } = createEditor();
    const beforeA = editor.worldTransform("node-a");
    const beforeB = editor.worldTransform("node-b");
    editor.reparent("node-b", null);
    const groupId = editor.group(["node-a", "node-b"], "Mixed parents");
    assert.equal(read().nodes.find(node => node.id === groupId).parent, null);
    closeVector(editor.worldTransform("node-a").position, beforeA.position);
    closeVector(editor.worldTransform("node-b").position, beforeB.position);
});

test("reparent preserves world transform and rejects cycles", () => {
    const { editor, read } = createEditor();
    const before = editor.worldTransform("node-a");
    editor.reparent("node-a", null);
    assert.equal(read().nodes.find(node => node.id === "node-a").parent, null);
    closeVector(editor.worldTransform("node-a").position, before.position);
    assert.throws(() => editor.reparent("group-a", "group-a"), /cycle/);
});

test("world-space numeric edits convert back to parent-local coordinates", () => {
    const { editor, read } = createEditor();
    editor.setTransform("group-a", {
        position: [1, 0, 0],
        rotation: [0, 0, Math.PI / 2],
        scale: [2, 2, 2],
    });
    const transformed = editor.worldTransform("node-a");
    closeVector(transformed.position, [1, 4, 0]);
    editor.setTransformComponent("node-a", "position", [3, 4, 0], "world");
    closeVector(editor.worldTransform("node-a").position, [3, 4, 0]);
    assert.notDeepEqual(read().nodes.find(node => node.id === "node-a").transform.position, [3, 4, 0]);
    const snap = structuredClone(DEFAULT_SCENE_SNAP_SETTINGS);
    snap.translation.enabled = true;
    snap.translation.increment = 1;
    editor.setTransform("node-a", {
        ...editor.worldTransform("node-a"),
        position: [3.4, 4.4, 0],
    }, "world", snap);
    closeVector(editor.worldTransform("node-a").position, [3, 4, 0]);
});

test("duplicate assigns fresh IDs and delete removes descendants", () => {
    const { editor, read } = createEditor();
    editor.select(["group-a"]);
    const [copyId] = editor.duplicate(["group-a"]);
    const copy = read().nodes.find(node => node.id === copyId);
    const copiedChildren = read().nodes.filter(node => node.parent === copyId);
    assert.ok(copy);
    assert.equal(copiedChildren.length, 2);
    assert.equal(new Set(read().nodes.map(node => node.id)).size, read().nodes.length);
    assert.equal(editor.selection[0], copyId);
    editor.setVisibility(copyId, false);
    editor.setLocked(copyId, true);
    assert.equal(read().nodes.find(node => node.id === copyId).visible, false);
    assert.equal(read().nodes.find(node => node.id === copyId).locked, true);
    assert.throws(() => editor.setTransform(copyId, copy.transform), /locked/);
    editor.delete([copyId]);
    assert.equal(read().nodes.some(node => node.id === copyId || node.parent === copyId), false);
});

test("snapping, pivot edits, and scene normalization remain serializable", () => {
    const { editor, read } = createEditor();
    const settings = structuredClone(DEFAULT_SCENE_SNAP_SETTINGS);
    settings.translation.enabled = true;
    settings.translation.increment = 0.5;
    editor.setTransform("node-a", {
        position: [1.24, 0.26, -0.74],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
    }, "local", settings);
    closeVector(read().nodes.find(node => node.id === "node-a").transform.position, [1, 0.5, -0.5]);
    editor.setPivot("node-a", [0.25, 0, -0.25]);
    const restored = normalizeWamGuiScene(JSON.parse(JSON.stringify(read())));
    assert.deepEqual(restored.nodes.find(node => node.id === "node-a").pivot, [0.25, 0, -0.25]);
    assert.throws(() => editor.snapTransform(
        { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        { ...settings, rotation: { enabled: true, increment: 0 } },
    ), /greater than 0/);
});

test("scene mutations participate in document undo and redo", async () => {
    let document = createScene();
    const makeEditor = () => new SceneDocumentEditor({
        read: () => document,
        write: value => { document = value; },
        createId: () => "history-group",
    });
    const history = new DocumentHistory(
        () => structuredClone(document),
        snapshot => { document = structuredClone(snapshot); },
    );
    const editor = makeEditor();
    await history.execute("Rename scene node", () => editor.rename("node-a", "Renamed"));
    assert.equal(document.nodes.find(node => node.id === "node-a").name, "Renamed");
    await history.undo();
    assert.equal(document.nodes.find(node => node.id === "node-a").name, "Node A");
    await history.redo();
    assert.equal(document.nodes.find(node => node.id === "node-a").name, "Renamed");
});
