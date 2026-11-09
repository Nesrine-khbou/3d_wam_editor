import assert from "node:assert/strict";
import { test } from "node:test";
import { NullEngine, Scene } from "@babylonjs/core";
import { createAuthorizedGlb, createAuthorizedGltfFiles } from "./fixtures/authorized-glb.mjs";
import {
    SCENE_ASSET_MAX_BYTES,
    SCENE_PACKAGE_FORMAT,
    SceneAssetPipelineError,
    exportSceneProjectPackage,
    importGltfAsset,
    importSceneProjectPackage,
    inspectSceneAssetDependencies,
} from "../src/scene/SceneAssetPipeline.ts";
import sceneFixture from "./fixtures/scene-document.v1.json" with { type: "json" };

globalThis.Image ??= class {
    width = 1;
    height = 1;
    set src(_) {
        queueMicrotask(() => this.onload?.());
    }
};

function createScene() {
    const engine = new NullEngine();
    return { engine, scene: new Scene(engine) };
}

function createDescriptor(imported) {
    const scene = structuredClone(sceneFixture);
    const model = imported.sceneAssets.find(asset => asset.source_path === "instrument.gltf");
    scene.assets = imported.sceneAssets;
    scene.nodes = scene.nodes.map(node => node.id === "panel"
        ? { ...node, asset: { asset_id: model.id, node: "body", mesh: "body-mesh" } }
        : node);
    return {
        schema_version: 2,
        required_features: ["wam3dgenerator.scene-graph.v1"],
        aspect_ratio: 1,
        size: 1,
        top_color: "#ffffff",
        bottom_color: "#000000",
        controls: [],
        scene,
    };
}

function packageAssets(imported) {
    return imported.sceneAssets.map(asset => ({
        ...asset,
        data: imported.files.get(asset.source_path),
    }));
}

test("imports external glTF dependencies entirely offline and preserves hierarchy, meshes, PBR materials, UVs, and stable identity", async () => {
    const { engine, scene } = createScene();
    let imported;
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        fetchCalls++;
        throw new Error("Network access must not be used by a local import");
    };
    const progress = [];
    try {
        const files = createAuthorizedGltfFiles();
        imported = await importGltfAsset(scene, files, "instrument.gltf", {
            onProgress: update => progress.push(update),
        });

        assert.equal(imported.assetContainer.meshes.filter(mesh => mesh.getTotalVertices() > 0).length, 2);
        assert.equal(imported.assetContainer.materials.length, 1);
        assert.equal(imported.assetContainer.textures.length, 1);
        assert.ok(imported.assetContainer.transformNodes.some(node => node.name === "detail-group"));
        assert.ok(imported.assetContainer.meshes.some(mesh => mesh.geometry?.getVerticesData("uv")?.length === 6));
        assert.ok(imported.assetContainer.meshes.some(mesh => mesh.material?.getClassName() === "PBRMaterial"));
        assert.equal(imported.nodes.size, imported.assetContainer.meshes.length + imported.assetContainer.transformNodes.length);
        assert.equal(imported.meshes.size, imported.assetContainer.meshes.length);
        assert.ok([...imported.nodes.keys()].every(id => id.startsWith(`${imported.assetId}/`)));
        assert.equal(imported.sceneAssets.length, 3);
        assert.deepEqual(new Set(progress.map(update => update.phase)), new Set(["validating", "loading", "complete"]));
        assert.ok(progress.every(update => typeof update.message === "string" && update.message.length > 0));
        assert.equal(fetchCalls, 0);

        const sceneMeshCount = scene.meshes.length;
        const importedMeshCount = imported.assetContainer.meshes.length;
        imported.dispose();
        assert.equal(scene.meshes.length, sceneMeshCount - importedMeshCount);
        assert.equal(imported.nodes.size, 0);
    } finally {
        imported?.dispose();
        globalThis.fetch = originalFetch;
        scene.dispose();
        engine.dispose();
    }
});

test("imports GLB with an explicitly supplied external texture dependency", async () => {
    const { engine, scene } = createScene();
    let imported;
    try {
        const glb = createAuthorizedGlb({ externalImage: true });
        const files = [
            { path: "instrument.glb", data: glb },
            { path: "textures/albedo.png", data: Buffer.from("authorized local texture bytes") },
        ];
        imported = await importGltfAsset(scene, files, "instrument.glb");
        assert.equal(imported.assetContainer.meshes.filter(mesh => mesh.getTotalVertices() > 0).length, 2);
        assert.equal(imported.sceneAssets.length, 2);
    } finally {
        imported?.dispose();
        scene.dispose();
        engine.dispose();
    }
});

test("reports missing local dependencies and rejects malformed, unsafe, oversized, and unsupported files", async () => {
    const { engine, scene } = createScene();
    try {
        const files = createAuthorizedGltfFiles();
        await assert.rejects(
            importGltfAsset(scene, files.slice(0, 2), "instrument.gltf"),
            error => error instanceof SceneAssetPipelineError &&
                error.code === "MISSING_DEPENDENCY" &&
                /textures\/albedo\.png/.test(error.message),
        );
        await assert.rejects(
            importGltfAsset(scene, [{ path: "bad.glb", data: new Uint8Array([1, 2, 3]) }], "bad.glb"),
            error => error instanceof SceneAssetPipelineError && error.code === "INVALID_FILE",
        );
        await assert.rejects(
            importGltfAsset(scene, [{ path: "../outside.glb", data: createAuthorizedGlb() }], "../outside.glb"),
            error => error instanceof SceneAssetPipelineError && error.code === "INVALID_FILE",
        );
        await assert.rejects(
            importGltfAsset(scene, [{ path: "instrument.glb", data: createAuthorizedGlb() }], "instrument.glb", {
                maxAssetBytes: 16,
            }),
            error => error instanceof SceneAssetPipelineError && error.code === "UNSUPPORTED_CONTENT",
        );
        await assert.rejects(
            importGltfAsset(scene, createAuthorizedGltfFiles({ extensionsRequired: ["KHR_vendor_extension"] }), "instrument.gltf"),
            error => error instanceof SceneAssetPipelineError &&
                error.code === "UNSUPPORTED_CONTENT" &&
                /KHR_vendor_extension/.test(error.message),
        );
        assert.equal(scene.meshes.length, 0);
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test("cancellation during import reports a cancellation error and leaves no scene assets behind", async () => {
    const { engine, scene } = createScene();
    const controller = new AbortController();
    try {
        await assert.rejects(
            importGltfAsset(scene, createAuthorizedGltfFiles(), "instrument.gltf", {
                signal: controller.signal,
                onProgress: update => {
                    if (update.phase === "loading") controller.abort();
                },
            }),
            error => error instanceof SceneAssetPipelineError && error.code === "CANCELLED",
        );
        assert.equal(scene.meshes.length, 0);
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test("dependency inspection reports missing, unused, oversized, and unsupported assets", () => {
    const scene = {
        schema_version: sceneFixture.schema_version,
        coordinate_system: sceneFixture.coordinate_system,
        transform_convention: sceneFixture.transform_convention,
        nodes: [],
        assets: [
            { id: "required", uri: "assets/required.glb", media_type: "model/gltf-binary" },
            { id: "missing", uri: "assets/missing.png", media_type: "image/png" },
        ],
    };
    const summary = inspectSceneAssetDependencies(scene, [
        { id: "required", uri: "assets/required.glb", media_type: "model/gltf-binary", data: new Uint8Array(8) },
        { id: "unused", uri: "assets/unused.png", media_type: "image/png", data: new Uint8Array(8) },
        { id: "oversized", uri: "assets/large.bin", media_type: "application/octet-stream", data: new Uint8Array(32) },
        { id: "unsupported", uri: "assets/script.js", media_type: "application/javascript", data: new Uint8Array(8) },
    ], { maxAssetBytes: 16 });

    assert.deepEqual(summary.missing, ["missing"]);
    assert.ok(summary.unused.includes("unused"));
    assert.ok(summary.oversized.includes("oversized"));
    assert.ok(summary.unsupported.includes("unsupported"));
    assert.equal(summary.exportBlocked, true);
    assert.ok(summary.issues.some(issue => issue.code === "missing"));

    const mismatchedUri = inspectSceneAssetDependencies({
        ...scene,
        assets: [{ id: "required", uri: "assets/expected.glb", media_type: "model/gltf-binary" }],
    }, [
        { id: "required", uri: "assets/different.glb", media_type: "model/gltf-binary", data: new Uint8Array(8) },
    ]);
    assert.deepEqual(mismatchedUri.missing, ["required"]);
    assert.equal(mismatchedUri.exportBlocked, true);
});

test("portable package round-trips all assets and can be reopened after relocation without network", async () => {
    const { engine, scene } = createScene();
    let imported;
    let reopened;
    try {
        imported = await importGltfAsset(scene, createAuthorizedGltfFiles(), "instrument.gltf");
        const descriptor = createDescriptor(imported);
        const packageText = await exportSceneProjectPackage(descriptor, packageAssets(imported));
        const packageDocument = JSON.parse(packageText);
        assert.equal(packageDocument.format, SCENE_PACKAGE_FORMAT);
        assert.equal(packageDocument.assets.length, 3);
        assert.ok(packageDocument.assets.every(asset => asset.data_base64 && asset.sha256));
        assert.ok(packageDocument.assets.every(asset => !/^[a-z]:[\\/]/i.test(asset.uri)));

        const restored = await importSceneProjectPackage(packageText);
        assert.deepEqual(restored.descriptor, packageDocument.descriptor);
        assert.equal(restored.assets.length, 3);

        const offlineFiles = restored.assets.map(asset => ({
            path: asset.uri,
            data: asset.data,
        }));
        const portableModelPath = restored.assets.find(asset => asset.media_type === "model/gltf+json").uri;
        imported.dispose();
        imported = undefined;
        reopened = await importGltfAsset(scene, offlineFiles, portableModelPath);
        assert.equal(reopened.assetContainer.meshes.filter(mesh => mesh.getTotalVertices() > 0).length, 2);
        assert.equal(reopened.assetContainer.materials.length, 1);
        assert.equal(reopened.assetContainer.textures.length, 1);

        const tampered = JSON.parse(packageText);
        tampered.assets[0].data_base64 = tampered.assets[0].data_base64.slice(0, -4) + "AAAA";
        await assert.rejects(importSceneProjectPackage(JSON.stringify(tampered)), /integrity check failed/);
    } finally {
        reopened?.dispose();
        imported?.dispose();
        scene.dispose();
        engine.dispose();
    }
});

test("export blocks missing assets and oversized packages, but allows unused assets with diagnostics", async () => {
    const { engine, scene } = createScene();
    let imported;
    try {
        imported = await importGltfAsset(scene, createAuthorizedGltfFiles(), "instrument.gltf");
        const descriptor = createDescriptor(imported);
        const assets = packageAssets(imported);
        const extra = {
            id: "unused-asset",
            uri: "assets/unused.png",
            media_type: "image/png",
            data: new Uint8Array([1]),
        };
        const withUnused = await exportSceneProjectPackage(descriptor, [...assets, extra]);
        assert.equal(JSON.parse(withUnused).assets.length, 4);

        await assert.rejects(
            exportSceneProjectPackage(descriptor, assets.slice(0, -1)),
            error => error instanceof SceneAssetPipelineError &&
                error.code === "PACKAGE_INVALID" &&
                /missing asset/.test(error.message),
        );
        await assert.rejects(
            exportSceneProjectPackage(descriptor, assets, { maxAssetBytes: 8 }),
            error => error instanceof SceneAssetPipelineError && error.code === "PACKAGE_INVALID",
        );
        await assert.rejects(
            importSceneProjectPackage(withUnused, { maxAssetBytes: SCENE_ASSET_MAX_BYTES, maxAssetCount: 2 }),
            /too many assets/,
        );
    } finally {
        imported?.dispose();
        scene.dispose();
        engine.dispose();
    }
});
