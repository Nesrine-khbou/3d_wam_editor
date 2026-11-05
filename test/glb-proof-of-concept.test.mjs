import assert from "node:assert/strict";
import { test } from "node:test";
import { NullEngine, Scene } from "@babylonjs/core";
import { createAuthorizedGlb } from "./fixtures/authorized-glb.mjs";
import { GlbProofOfConcept } from "../src/scene/GlbProofOfConcept.ts";

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

test("authorized GLB loads with hierarchy, PBR material, and embedded texture, then saves, reloads, and disposes", async () => {
    const { engine, scene } = createScene();
    let model;
    let reloaded;
    try {
        model = await GlbProofOfConcept.import(scene, createAuthorizedGlb(), "authorized-fixture.glb");

        assert.equal(model.nodes.size, 2);
        assert.equal(scene.meshes.filter(mesh => mesh.getTotalVertices() > 0).length, 2);
        const detailGroup = model.container.transformNodes.find(node => node.name === "detail-group");
        assert.ok(detailGroup);
        assert.ok([...model.nodes.values()].some(mesh => mesh.parent === detailGroup));
        assert.equal(model.container.materials.length, 1);
        assert.equal(model.container.textures.length, 1);
        assert.equal(model.container.meshes.some(mesh => mesh.material === model.container.materials[0]), true);

        const selectedNodeId = model.nodes.keys().next().value;
        const selectedMesh = model.selectNode(selectedNodeId);
        assert.equal(model.selectedNodeId, selectedNodeId);
        assert.equal(model.nodes.get(selectedNodeId), selectedMesh);

        const project = model.serialize();
        const document = JSON.parse(project);
        assert.equal(document.assets[0].content_type, "model/gltf-binary");
        assert.equal(document.coordinate_system, "wam3d-editor-lh-y-up-meter-v1");
        assert.equal(document.selected_node_id, selectedNodeId);
        assert.ok(document.assets[0].data_base64.length > 0);

        model.dispose();
        assert.equal(scene.meshes.filter(mesh => mesh.getTotalVertices() > 0).length, 0);
        assert.throws(() => model.selectNode(selectedNodeId), /has been disposed/);

        reloaded = await GlbProofOfConcept.reload(scene, project);
        assert.equal(reloaded.assetId, document.assets[0].id);
        assert.equal(reloaded.selectedNodeId, selectedNodeId);
        assert.equal(reloaded.nodes.size, 2);
        assert.equal(reloaded.container.materials.length, 1);
        assert.equal(reloaded.container.textures.length, 1);
        assert.equal(scene.meshes.filter(mesh => mesh.getTotalVertices() > 0).length, 2);
    } finally {
        reloaded?.dispose();
        model?.dispose();
        scene.dispose();
        engine.dispose();
    }
});

test("import rejects unsupported required extensions and external texture dependencies explicitly", async () => {
    const { engine, scene } = createScene();
    try {
        await assert.rejects(
            GlbProofOfConcept.import(scene, createAuthorizedGlb({ extensionsRequired: ["KHR_vendor_extension"] })),
            /does not support required glTF extensions: KHR_vendor_extension/,
        );
        await assert.rejects(
            GlbProofOfConcept.import(scene, createAuthorizedGlb({ externalImage: true })),
            /references an external resource "textures\/albedo.png"/,
        );
        assert.equal(scene.meshes.length, 0);
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test("reload rejects modified embedded assets and an unknown selected node", async () => {
    const { engine, scene } = createScene();
    let model;
    try {
        model = await GlbProofOfConcept.import(scene, createAuthorizedGlb());
        model.selectNode(model.nodes.keys().next().value);
        const document = JSON.parse(model.serialize());

        const changedAsset = structuredClone(document);
        changedAsset.assets[0].data_base64 = changedAsset.assets[0].data_base64.slice(0, -4) + "AAAA";
        await assert.rejects(GlbProofOfConcept.reload(scene, JSON.stringify(changedAsset)), /integrity check failed/);

        const unknownSelection = structuredClone(document);
        unknownSelection.selected_node_id = "missing-node";
        await assert.rejects(GlbProofOfConcept.reload(scene, JSON.stringify(unknownSelection)), /Unknown model node ID/);
    } finally {
        model?.dispose();
        scene.dispose();
        engine.dispose();
    }
});
