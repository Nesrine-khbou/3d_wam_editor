import assert from "node:assert/strict";
import { test } from "node:test";
import { NullEngine, Scene } from "@babylonjs/core";

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
    DEFAULT_SCENE_PRIMITIVE_PARAMETERS,
    SceneDocumentEditor,
    WAM_GUI_SCENE_COORDINATE_SYSTEM,
    WAM_GUI_SCENE_TRANSFORM_CONVENTION,
    createSceneMaterial,
    createScenePrimitiveMesh,
    normalizeWamGuiScene,
} = await import("../dist/index.js");

function primitiveNode(type, parameters = {}) {
    return {
        id: `primitive-${type}`,
        name: type,
        kind: "primitive",
        parent: null,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        geometry: {
            type,
            parameters: { ...DEFAULT_SCENE_PRIMITIVE_PARAMETERS[type], ...parameters },
        },
    };
}

function meshBounds(node) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = createScenePrimitiveMesh(scene, node);
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const dimensions = bounds.maximumWorld.subtract(bounds.minimumWorld);
    const positions = [...mesh.getVerticesData("position")];
    const indices = [...mesh.getIndices()];
    const metadata = structuredClone(mesh.metadata);
    mesh.material.dispose();
    mesh.dispose();
    scene.dispose();
    engine.dispose();
    return {
        dimensions: [dimensions.x, dimensions.y, dimensions.z],
        positions,
        indices,
        metadata,
    };
}

function closeVector(actual, expected) {
    for (let index = 0; index < expected.length; index++) {
        assert.ok(Math.abs(actual[index] - expected[index]) < 1e-5, `${actual} should equal ${expected}`);
    }
}

test("box, cylinder, sphere, plane, rounded, and lathed primitives render with expected dimensions", () => {
    const cases = [
        ["box", { width: 2, height: 1, depth: 0.5 }, [2, 1, 0.5]],
        ["cylinder", { diameter: 2, height: 3, tessellation: 24 }, [2, 3, 2]],
        ["sphere", { diameter: 2, segments: 16 }, [2, 2, 2]],
        ["plane", { width: 2, height: 3 }, [2, 3, 0]],
        ["rounded", { width: 2, height: 1, depth: 0.5, radius: 0.2, segments: 4 }, [2, 1, 0.5]],
        ["lathed", { bottom_radius: 1, top_radius: 0.5, height: 3, tessellation: 24 }, [2, 3, 2]],
    ];
    for (const [type, parameters, dimensions] of cases) {
        const result = meshBounds(primitiveNode(type, parameters));
        closeVector(result.dimensions, dimensions);
        assert.equal(result.positions.length > 0, true);
        assert.equal(result.indices.length > 0, true);
    }
});

test("primitive geometry generation is deterministic for the same descriptor", () => {
    for (const type of Object.keys(DEFAULT_SCENE_PRIMITIVE_PARAMETERS)) {
        const first = meshBounds(primitiveNode(type));
        const second = meshBounds(primitiveNode(type));
        assert.deepEqual(second.positions, first.positions, `${type} positions`);
        assert.deepEqual(second.indices, first.indices, `${type} indices`);
        assert.deepEqual(first.metadata, {
            sceneNodeId: `primitive-${type}`,
            primitiveType: type,
        });
    }
});

test("primitive creation and geometry edits update descriptor data", () => {
    let document = normalizeWamGuiScene({
        schema_version: 1,
        coordinate_system: WAM_GUI_SCENE_COORDINATE_SYSTEM,
        transform_convention: WAM_GUI_SCENE_TRANSFORM_CONVENTION,
        nodes: [],
    });
    let nextId = 0;
    const editor = new SceneDocumentEditor({
        read: () => document,
        write: value => { document = value; },
        createId: () => `created-${nextId++}`,
    });
    for (const type of Object.keys(DEFAULT_SCENE_PRIMITIVE_PARAMETERS)) {
        const nodeId = editor.addPrimitive(type);
        const node = document.nodes.find(candidate => candidate.id === nodeId);
        assert.equal(node.geometry.type, type);
        assert.deepEqual(node.geometry.parameters, DEFAULT_SCENE_PRIMITIVE_PARAMETERS[type]);
    }
    const rounded = document.nodes.find(node => node.geometry?.type === "rounded");
    editor.setPrimitiveParameters(rounded.id, { ...rounded.geometry.parameters, width: 2 });
    assert.equal(document.nodes.find(node => node.id === rounded.id).geometry.parameters.width, 2);
    assert.throws(() => editor.setPrimitiveParameters(rounded.id, {
        ...rounded.geometry.parameters,
        radius: 2,
    }), /radius/);
});

test("scene validation rejects impossible rounded radii and invalid tessellation", () => {
    const base = {
        schema_version: 1,
        coordinate_system: WAM_GUI_SCENE_COORDINATE_SYSTEM,
        transform_convention: WAM_GUI_SCENE_TRANSFORM_CONVENTION,
        nodes: [],
    };
    assert.throws(() => normalizeWamGuiScene({
        ...base,
        nodes: [primitiveNode("rounded", { width: 1, height: 1, depth: 1, radius: 0.6 })],
    }), /radius/);
    assert.throws(() => normalizeWamGuiScene({
        ...base,
        nodes: [primitiveNode("cylinder", { tessellation: 2 })],
    }), /integer of at least 3/);
});

test("PBR materials preserve values, UV settings, and reject missing texture assets", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const material = createSceneMaterial(scene, {
        id: "panel",
        base_color: [0.2, 0.4, 0.8, 0.75],
        metallic: 0.7,
        roughness: 0.25,
        alpha_mode: "blend",
    }, new Map());
    assert.equal(material.albedoColor.r, 0.2);
    assert.equal(material.metallic, 0.7);
    assert.equal(material.roughness, 0.25);
    assert.throws(() => createSceneMaterial(scene, {
        id: "panel-with-texture",
        textures: {
            base_color: {
                asset_id: "missing-texture",
                color_space: "srgb",
                offset: [0.1, 0.2],
                scale: [2, 3],
                rotation: 0.5,
                wrap_u: "repeat",
                wrap_v: "clamp",
                filtering: "nearest",
            },
        },
    }, new Map()), /missing-texture/);
    material.dispose();
    scene.dispose();
    engine.dispose();
});
