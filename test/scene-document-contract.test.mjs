import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    WAM_GUI_FEATURES,
    WAM_GUI_SCENE_COORDINATE_SYSTEM,
    WAM_GUI_SCENE_FEATURE,
    WAM_GUI_SCENE_SCHEMA_VERSION,
    WAM_GUI_SCENE_TRANSFORM_CONVENTION,
    WamGUIGenerator,
    normalizeWamGuiDescriptorCompatibility,
    normalizeWamGuiScene,
    serializeWamGuiDescriptor,
} = await import("../dist/index.js");
const { DocumentHistory } = await import("../src/editor/DocumentHistory.ts");

const fixture = JSON.parse(await readFile(new URL("./fixtures/scene-document.v1.json", import.meta.url), "utf8"));
const legacyDescriptor = {
    aspect_ratio: 1.5,
    size: 0.8,
    top_color: "#ffffff",
    bottom_color: "#000000",
    controls: [],
    custom_metadata: { preserved: true },
};

function descriptorWithScene(scene = fixture) {
    return {
        ...legacyDescriptor,
        schema_version: 2,
        required_features: [WAM_GUI_SCENE_FEATURE],
        scene,
    };
}

test("scene fixture is renderer-neutral and normalizes defaults while preserving optional data", () => {
    const original = structuredClone(fixture);
    const scene = normalizeWamGuiScene(fixture);

    assert.equal(scene.schema_version, WAM_GUI_SCENE_SCHEMA_VERSION);
    assert.equal(scene.coordinate_system, WAM_GUI_SCENE_COORDINATE_SYSTEM);
    assert.equal(scene.transform_convention, WAM_GUI_SCENE_TRANSFORM_CONVENTION);
    assert.deepEqual(new Set(scene.nodes.map(node => node.kind)), new Set([
        "group",
        "imported_mesh",
        "interactive",
        "visual",
        "primitive",
    ]));
    assert.deepEqual(scene.nodes[0].transform, {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
    });
    assert.deepEqual(scene.nodes[1].transform.vendor_data, { unit_hint: "meters" });
    assert.equal(scene.nodes[0].visible, true);
    assert.equal(scene.nodes[0].locked, false);
    assert.deepEqual(scene.vendor_extension, fixture.vendor_extension);
    assert.deepEqual(scene.nodes[1].vendor_metadata, fixture.nodes[1].vendor_metadata);
    assert.deepEqual(scene.materials[0].vendor_data, fixture.materials[0].vendor_data);
    assert.deepEqual(fixture, original);

    const serialized = JSON.stringify(scene);
    assert.doesNotMatch(serialized, /babylon|TransformNode|AbstractMesh|SceneLoader|_scene/i);
});

test("legacy descriptors remain unchanged and scene descriptors require schema and feature declarations", () => {
    const legacy = normalizeWamGuiDescriptorCompatibility(legacyDescriptor);
    assert.equal(legacy.scene, null);
    assert.deepEqual(legacy.descriptor, legacyDescriptor);
    assert.deepEqual(JSON.parse(serializeWamGuiDescriptor(legacyDescriptor)), legacyDescriptor);

    assert.throws(
        () => normalizeWamGuiDescriptorCompatibility({ ...legacyDescriptor, scene: fixture }),
        /V2 descriptor fields require schema_version: 2/,
    );
    assert.throws(
        () => normalizeWamGuiDescriptorCompatibility({ ...legacyDescriptor, schema_version: 2, scene: fixture }),
        /scene requires the "wam3dgenerator\.scene-graph\.v1" feature declaration/,
    );
    assert.throws(
        () => normalizeWamGuiDescriptorCompatibility(descriptorWithScene(), {
            supportedRuntimeFeatures: [],
        }),
        /Unsupported required WAM GUI feature\(s\): wam3dgenerator\.scene-graph\.v1/,
    );
    assert.equal(
        normalizeWamGuiDescriptorCompatibility(descriptorWithScene(), {
            supportedRuntimeFeatures: [WAM_GUI_FEATURES.sceneGraph],
        }).scene.nodes.length,
        fixture.nodes.length,
    );
});

test("scene validation rejects malformed node IDs, hierarchy, transforms, references, and mappings", () => {
    const malformedScenes = [
        { ...fixture, schema_version: 2 },
        { ...fixture, coordinate_system: "right-handed-y-up" },
        { ...fixture, transform_convention: "unspecified" },
        { ...fixture, nodes: [{ ...fixture.nodes[0], id: "bad id" }] },
        { ...fixture, nodes: [fixture.nodes[0], { ...fixture.nodes[1], id: fixture.nodes[0].id }] },
        { ...fixture, nodes: [fixture.nodes[0], { ...fixture.nodes[1], parent: "missing-parent" }] },
        { ...fixture, nodes: fixture.nodes.map(node => ({ ...node, parent: node.id })) },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "panel"
                ? { ...node, transform: { position: [0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }
                : node),
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "panel"
                ? { ...node, transform: { position: [0, Number.NaN, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }
                : node),
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "panel"
                ? { ...node, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 0, 1] } }
                : node),
        },
        {
            ...fixture,
            assets: [{ ...fixture.assets[0], uri: "../outside.glb" }],
        },
        {
            ...fixture,
            assets: [{ ...fixture.assets[0], uri: "assets/%2e%2e/outside.glb" }],
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "panel"
                ? { ...node, asset: { asset_id: "missing-asset" } }
                : node),
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "panel"
                ? { ...node, material_refs: [{ material_id: "missing-material" }] }
                : node),
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "volume-knob"
                ? { ...node, interaction: { ...node.interaction, binding: { endpoint_id: "volume", endpoint_type: "parameter", mapping: { minimum: 1, maximum: 1, step: 0 } } } }
                : node),
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "volume-knob"
                ? { ...node, interaction: { ...node.interaction, axis: [0, 0, 0] } }
                : node),
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "volume-knob"
                ? { ...node, interaction: { ...node.interaction, binding: { endpoint_id: "volume", endpoint_type: "parameter" } } }
                : node),
        },
        {
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "stand"
                ? { ...node, geometry: { type: "box", parameters: { width: -1 } } }
                : node),
        },
    ];

    for (const scene of malformedScenes) assert.throws(() => normalizeWamGuiScene(scene));
});

test("descriptor serialization round-trips the scene and preserves unknown optional scene properties", () => {
    const descriptor = descriptorWithScene();
    const serialized = serializeWamGuiDescriptor(descriptor);
    const reloaded = JSON.parse(serialized);
    const normalized = normalizeWamGuiDescriptorCompatibility(reloaded, {
        supportedRuntimeFeatures: [WAM_GUI_SCENE_FEATURE],
    });

    assert.deepEqual(reloaded, descriptor);
    assert.deepEqual(normalized.scene.vendor_extension, fixture.vendor_extension);
    assert.deepEqual(normalized.scene.nodes.find(node => node.id === "panel").vendor_metadata, {
        source_part: "panel-main",
    });
});

test("generator preserves legacy behavior, validates before replacement, and includes scenes in save/load history", async () => {
    const generator = WamGUIGenerator.create({});
    try {
        await generator.load(legacyDescriptor, {});
        const legacySaved = generator.save({});
        assert.equal("scene" in legacySaved, false);
        assert.equal("schema_version" in legacySaved, false);

        const withScene = descriptorWithScene();
        await generator.load(withScene, {});
        const saved = generator.save({});
        assert.deepEqual(saved.scene, normalizeWamGuiScene(fixture));
        assert.equal(saved.required_features.includes(WAM_GUI_SCENE_FEATURE), true);

        const history = new DocumentHistory(
            () => generator.save({}),
            snapshot => generator.load(structuredClone(snapshot), {}),
        );
        await history.execute("Edit scene", () => {
            const scene = structuredClone(generator.scene_document.value);
            scene.nodes[0].name = "Edited instrument";
            generator.scene_document.value = scene;
        });
        assert.equal(generator.save({}).scene.nodes[0].name, "Edited instrument");

        await history.undo();
        assert.equal(generator.save({}).scene.nodes[0].name, "Instrument");
        await history.redo();
        assert.equal(generator.save({}).scene.nodes[0].name, "Edited instrument");

        const beforeInvalidLoad = generator.save({});
        const unknownFeature = {
            ...withScene,
            required_features: [WAM_GUI_SCENE_FEATURE, "wam3dgenerator.unknown-required.v1"],
        };
        await assert.rejects(generator.load(unknownFeature, {}), /Unsupported required WAM GUI feature/);
        assert.deepEqual(generator.save({}), beforeInvalidLoad);

        const invalid = descriptorWithScene({
            ...fixture,
            nodes: fixture.nodes.map(node => node.id === "instrument-root"
                ? { ...node, parent: "panel" }
                : node),
        });
        await assert.rejects(generator.load(invalid, {}), /parent cycle/);
        assert.deepEqual(generator.save({}), beforeInvalidLoad);

        generator.scene_document.value = {
            ...fixture,
            nodes: [...fixture.nodes, structuredClone(fixture.nodes[0])],
        };
        assert.throws(() => generator.save({}), /duplicate IDs/);
    } finally {
        generator.dispose();
    }
});
