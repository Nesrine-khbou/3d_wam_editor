import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { createMockControlLibrary } from "./fixtures/mock-control-library.mjs";
import {
    legacyExampleNames,
    loadAllLegacyExampleDescriptors,
    loadLegacyExampleDescriptor,
} from "./fixtures/legacy-examples.mjs";

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
    async load() {
        return this;
    }
};
const libraryApi = await import("../dist/index.js");
const sourceExamples = JSON.parse(await readFile(new URL("../src/examples.json", import.meta.url), "utf8"));
const controlNames = [...new Set(Object.values(sourceExamples).flatMap(example =>
    example.controls.map(control => control.control)
))];

function getExpectedSavedDescriptor(source) {
    return {
        aspect_ratio: source.aspect_ratio,
        size: source.size,
        bottom_color: source.bottom_color,
        top_color: source.top_color,
        face: source.face ?? undefined,
        face_color: source.face == null ? undefined : source.face_color ?? "#FFFFFF",
        outline_color: source.outline_color ?? "#000000",
        outline_width: source.outline_width ?? 0,
        shape: source.shape ?? "rectangle",
        modifier: source.modifier ?? "normal",
        modifier_strength: source.modifier_strength ?? 0,
        controls: structuredClone(source.controls),
    };
}

function getExpectedAverageControlSize(controls) {
    const sizes = controls
        .map(({ width, height }) => Math.max(width, height))
        .sort((a, b) => a - b);
    const from = Math.floor(sizes.length / 4);
    const to = Math.ceil(sizes.length * 3 / 4);
    const selected = sizes.slice(from, to);
    return selected.length === 0
        ? 1
        : selected.reduce((total, size) => total + size, 0) / selected.length;
}

test("the public library exports the legacy WAM Jam Party integration surface", () => {
    assert.equal(typeof libraryApi.WamGUIGenerator.create, "function");
    assert.equal(typeof libraryApi.ControlStateManager, "function");
    assert.equal(typeof libraryApi.controls, "object");

    for (const controlName of controlNames) {
        assert.equal(typeof libraryApi.controls[controlName], "function", `missing control mapping ${controlName}`);
    }

    for (const method of ["load", "save", "calculateAverageControlSize", "dispose"]) {
        assert.equal(typeof libraryApi.WamGUIGenerator.prototype[method], "function", `missing generator method ${method}`);
    }
});

test("all bundled examples load, preserve their model, and save with legacy defaults", async t => {
    assert.equal(legacyExampleNames.length, 42);
    assert.deepEqual(Object.keys(loadAllLegacyExampleDescriptors()), legacyExampleNames);

    for (const name of legacyExampleNames) {
        await t.test(name, async () => {
            const descriptor = loadLegacyExampleDescriptor(name);
            const source = sourceExamples[name];
            const { library, instances } = createMockControlLibrary(controlNames);
            const generator = libraryApi.WamGUIGenerator.create({});
            const reloadedGenerator = libraryApi.WamGUIGenerator.create({});

            try {
                assert.equal("wam_url" in descriptor, false);
                await generator.load(descriptor, library);

                assert.equal(generator.controls.length, source.controls.length);
                for (let index = 0; index < source.controls.length; index++) {
                    const expected = source.controls[index];
                    const actual = generator.controls.get(index);
                    assert.equal(libraryApi.controls[expected.control] !== undefined, true);
                    assert.deepEqual(
                        {
                            x: actual.x,
                            y: actual.y,
                            width: actual.width,
                            height: actual.height,
                            control: actual.control.factory.label,
                            values: actual.values,
                            appliedValues: actual.control.values,
                        },
                        {
                            x: expected.x,
                            y: expected.y,
                            width: expected.width,
                            height: expected.height,
                            control: expected.control,
                            values: expected.values,
                            appliedValues: expected.values,
                        },
                        `control ${index} model`,
                    );
                }

                const saved = generator.save(library);
                assert.deepEqual(saved, getExpectedSavedDescriptor(source));
                await reloadedGenerator.load(saved, library);
                assert.deepEqual(reloadedGenerator.save(library), saved, "saved descriptor should survive reload");
                assert.equal(
                    generator.calculateAverageControlSize(),
                    getExpectedAverageControlSize(source.controls),
                );
            } finally {
                generator.dispose();
                reloadedGenerator.dispose();
            }

            assert.equal(instances.every(instance => instance.destroyed), true, "all loaded controls should be disposed");
        });
    }
});

test("the consumer state API reads, writes, notifies, and disposes control state", async () => {
    const { library, instances } = createMockControlLibrary(
        ["stateful_control"],
        { statefulControls: ["stateful_control"] },
    );
    const generator = libraryApi.WamGUIGenerator.create({});
    await generator.load({
        aspect_ratio: 1,
        size: 1,
        top_color: "#ffffff",
        bottom_color: "#000000",
        controls: [{
            control: "stateful_control",
            values: {},
            x: 0,
            y: 0,
            width: 0.25,
            height: 0.25,
        }],
    }, library);

    const manager = new libraryApi.ControlStateManager(generator.controls);
    const changes = [];
    manager.onStateChange = name => changes.push(name);
    const state = { active: true, values: [0.25, "saved"] };

    assert.deepEqual([...manager.names], ["stateful_control"]);
    assert.equal(await manager.get("stateful_control"), null);
    await manager.set("stateful_control", state);
    assert.deepEqual(await manager.get("stateful_control"), state);
    assert.deepEqual(changes, ["stateful_control"]);

    manager.dispose();
    assert.equal(instances[0].onStateChange, undefined);
    await manager.set("stateful_control", { active: false });
    assert.deepEqual(changes, ["stateful_control"]);
    generator.dispose();
    assert.equal(instances[0].destroyed, true);
});

test("Babylon rendering keeps legacy pad and normalized control scaling", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode("compatibility-root", scene);
    const { library, instances } = createMockControlLibrary(["fixture_control"]);
    const generator = libraryApi.WamGUIGenerator.create({
        babylonjs: {
            root,
            defineField() {},
            defineDraggableField() {},
            defineAnInput() {},
            defineAnOutput() {},
            defineAnEventInput() {},
            defineAnEventOutput() {},
        },
    });
    try {
        await generator.load({
            aspect_ratio: 2,
            size: 0.8,
            top_color: "#ffffff",
            bottom_color: "#000000",
            controls: [{
                control: "fixture_control",
                values: {},
                x: 0.25,
                y: 0.4,
                width: 0.2,
                height: 0.1,
            }],
        }, library);

        assert.deepEqual(
            [generator.pad_node.scaling.x, generator.pad_node.scaling.y, generator.pad_node.scaling.z],
            [0.8, 0.1, 0.4],
        );
        assert.equal(instances.length, 1);
        const renderedControl = generator.controls.get(0).node;
        assert.deepEqual(
            [renderedControl.scaling.x, renderedControl.scaling.y, renderedControl.scaling.z],
            [0.2, 0.1, 0.1],
        );
        assert.deepEqual(
            [renderedControl.position.x, renderedControl.position.y, renderedControl.position.z],
            [0.25, 0.545, -0.4],
        );

        generator.aspect_ratio.value = 0.5;
        assert.deepEqual(
            [generator.pad_node.scaling.x, generator.pad_node.scaling.y, generator.pad_node.scaling.z],
            [0.4, 0.1, 0.8],
        );
        generator.size.value = 0.5;
        assert.deepEqual(
            [generator.pad_node.scaling.x, generator.pad_node.scaling.y, generator.pad_node.scaling.z],
            [0.25, 0.1, 0.5],
        );
    } finally {
        generator.dispose();
        scene.dispose();
        engine.dispose();
    }
});

test("Babylon face texture UVs transform and reset without changing mesh topology", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode("face-transform-root", scene);
    const generator = libraryApi.WamGUIGenerator.create({
        babylonjs: {
            root,
            defineField() {},
            defineDraggableField() {},
            defineAnInput() {},
            defineAnOutput() {},
            defineAnEventInput() {},
            defineAnEventOutput() {},
        },
    });

    try {
        await generator.load({
            aspect_ratio: 1,
            size: 0.8,
            top_color: "#ffffff",
            bottom_color: "#000000",
            face: "https://example.test/face.png",
            controls: [],
        }, {});
        const face = scene.meshes.find(mesh => mesh.name === "wampad face");
        assert.ok(face);
        const basePositions = [...face.getVerticesData("position")];
        const baseIndices = [...face.getIndices()];
        const baseUvs = [...face.getVerticesData("uv")];

        generator.face_transform.value = {
            x: 0.2,
            y: 0,
            rotation_degrees: 0,
            scale: 1,
        };
        assert.notDeepEqual([...face.getVerticesData("uv")], baseUvs);

        generator.face_transform.value = {
            x: 0.2,
            y: 0.2,
            rotation_degrees: 30,
            scale: 1.5,
        };
        const transformedUvs = [...face.getVerticesData("uv")];
        assert.notDeepEqual(transformedUvs, baseUvs);
        assert.deepEqual([...face.getVerticesData("position")], basePositions);
        assert.deepEqual([...face.getIndices()], baseIndices);

        generator.face_transform.value = {
            x: 0,
            y: 0,
            rotation_degrees: 0,
            scale: 1,
        };
        assert.deepEqual([...face.getVerticesData("uv")], baseUvs);
        assert.deepEqual([...face.getVerticesData("position")], basePositions);
        assert.deepEqual([...face.getIndices()], baseIndices);
        assert.ok(transformedUvs.some((uv, index) => uv !== baseUvs[index]));
        assert.equal(face.material.diffuseTexture.wrapU, 1);
        assert.equal(face.material.diffuseTexture.wrapV, 1);
    } finally {
        generator.dispose();
        scene.dispose();
        engine.dispose();
    }
});

test("V2 logical width scales body and 3D controls without changing normalized layout", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode("v2-world-width-root", scene);
    const { library } = createMockControlLibrary(["fixture_control"]);
    const generator = libraryApi.WamGUIGenerator.create({
        babylonjs: {
            root,
            defineField() {},
            defineDraggableField() {},
            defineAnInput() {},
            defineAnOutput() {},
            defineAnEventInput() {},
            defineAnEventOutput() {},
        },
    });

    try {
        const source = {
            schema_version: 2,
            required_features: ["wam3dgenerator.world-width.v1"],
            aspect_ratio: 2,
            size: 0.8,
            world_width: 4,
            top_color: "#ffffff",
            bottom_color: "#000000",
            controls: [{
                control: "fixture_control",
                values: {},
                x: 0.25,
                y: 0.5,
                width: 0.2,
                height: 0.1,
            }],
        };
        await generator.load(source, library);

        assert.deepEqual(generator.getBodyWorldDimensions(), { width: 4, height: 2 });
        assert.deepEqual(
            [generator.pad_node.scaling.x, generator.pad_node.scaling.y, generator.pad_node.scaling.z],
            [4, 0.1, 2],
        );
        const control = generator.controls.get(0);
        assert.deepEqual([control.x, control.y, control.width, control.height], [0.25, 0.5, 0.2, 0.1]);
        assert.deepEqual(
            [control.node.scaling.x, control.node.scaling.y, control.node.scaling.z],
            [0.8, 0.2, 0.2],
        );
        assert.deepEqual(
            [control.node.position.x, control.node.position.y, control.node.position.z],
            [1, 0.545, -1],
        );
        assert.equal(generator.calculateAverageControlSize(), 0.2);
        assert.throws(() => { generator.world_width.value = 0; }, /world_width must be finite and greater than 0/);

        generator.size.value = 0.4;
        assert.deepEqual(
            [generator.pad_node.scaling.x, generator.pad_node.scaling.z],
            [4, 2],
            "legacy size must not be multiplied into explicit world dimensions",
        );
        generator.aspect_ratio.value = 0.5;
        assert.deepEqual(generator.getBodyWorldDimensions(), { width: 4, height: 8 });
        assert.deepEqual(
            [generator.pad_node.scaling.x, generator.pad_node.scaling.z],
            [4, 8],
            "ratio changes height but leaves explicit width unchanged",
        );
        assert.deepEqual(
            [control.node.scaling.x, control.node.scaling.y, control.node.scaling.z],
            [0.8, 0.8, 0.8],
        );
        assert.deepEqual([control.node.position.x, control.node.position.z], [1, -4]);
        assert.deepEqual([control.x, control.y, control.width, control.height], [0.25, 0.5, 0.2, 0.1]);

        generator.controls.move(0, 0.5, 0.25);
        generator.controls.resize(0, 0.1, 0.2);
        assert.deepEqual(
            [control.node.position.x, control.node.position.z],
            [2, -2],
        );
        assert.deepEqual(
            [control.node.scaling.x, control.node.scaling.y, control.node.scaling.z],
            [0.4, 0.4, 1.6],
        );
        assert.deepEqual([control.x, control.y, control.width, control.height], [0.5, 0.25, 0.1, 0.2]);

        const saved = generator.save(library);
        assert.equal(saved.schema_version, 2);
        assert.equal(saved.world_width, 4);
        assert.deepEqual(saved.required_features, ["wam3dgenerator.world-width.v1"]);
        assert.equal(saved.size, 0.4);
        await generator.load(saved, library);
        assert.deepEqual(generator.getBodyWorldDimensions(), { width: 4, height: 8 });
        assert.equal(generator.save(library).world_width, 4);
    } finally {
        generator.dispose();
        scene.dispose();
        engine.dispose();
    }
});

test("V2 logical width rejects undeclared, legacy, non-finite, and non-positive values", async () => {
    const { library } = createMockControlLibrary(["fixture_control"]);
    const generator = libraryApi.WamGUIGenerator.create({});
    const descriptor = {
        aspect_ratio: 1,
        size: 0.8,
        top_color: "#ffffff",
        bottom_color: "#000000",
        controls: [],
    };

    try {
        for (const invalid of [
            { ...descriptor, world_width: 2 },
            { ...descriptor, schema_version: 1, world_width: 2, required_features: ["wam3dgenerator.world-width.v1"] },
            { ...descriptor, schema_version: 2, world_width: 0, required_features: ["wam3dgenerator.world-width.v1"] },
            { ...descriptor, schema_version: 2, world_width: Number.NaN, required_features: ["wam3dgenerator.world-width.v1"] },
            { ...descriptor, schema_version: 2, world_width: 2, required_features: [] },
        ]) {
            await assert.rejects(generator.load(invalid, library));
        }
    } finally {
        generator.dispose();
    }
});

test("V2 face transforms survive generator save/load for history snapshots", async () => {
    const { library } = createMockControlLibrary(["fixture_control"]);
    const generator = libraryApi.WamGUIGenerator.create({});
    const descriptor = {
        schema_version: 2,
        required_features: ["wam3dgenerator.face-transform.v1"],
        aspect_ratio: 1,
        size: 0.8,
        top_color: "#ffffff",
        bottom_color: "#000000",
        face_transform: { x: 0.125, scale: 1.5 },
        controls: [],
    };

    try {
        await generator.load(descriptor, library);
        assert.deepEqual(generator.save(library).face_transform, descriptor.face_transform);
        await generator.load(generator.save(library), library);
        assert.deepEqual(generator.save(library).face_transform, descriptor.face_transform);
        await assert.rejects(
            generator.load({ ...descriptor, required_features: [] }, library),
            /requires the "wam3dgenerator.face-transform.v1" feature declaration/,
        );
    } finally {
        generator.dispose();
    }
});

test("editing a legacy face transform materializes the V2 feature without changing untouched legacy saves", async () => {
    const { library } = createMockControlLibrary(["fixture_control"]);
    const generator = libraryApi.WamGUIGenerator.create({});
    const descriptor = {
        aspect_ratio: 1,
        size: 0.8,
        top_color: "#ffffff",
        bottom_color: "#000000",
        controls: [],
    };

    try {
        await generator.load(descriptor, library);
        assert.deepEqual(generator.save(library), getExpectedSavedDescriptor(descriptor));

        generator.face_transform.value = {
            ...generator.face_transform.value,
            x: 0.25,
        };
        const saved = generator.save(library);
        assert.equal(saved.schema_version, 2);
        assert.ok(saved.required_features.includes("wam3dgenerator.face-transform.v1"));
        assert.deepEqual(saved.face_transform, {
            x: 0.25,
            y: 0,
            rotation_degrees: 0,
            scale: 1,
        });

        await generator.load(saved, library);
        assert.deepEqual(generator.save(library), { ...saved, editor_features: [] });
    } finally {
        generator.dispose();
    }
});
