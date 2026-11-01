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
    async load() {
        return this;
    }
};

const {
    normalizeWamGuiDescriptorCompatibility,
    serializeWamGuiDescriptor,
    widgetFeatureId,
    WAM_GUI_FEATURES,
} = await import("../dist/index.js");

const legacyDescriptor = {
    aspect_ratio: 1.5,
    size: 0.8,
    top_color: "#ffffff",
    bottom_color: "#000000",
    controls: [],
    custom_metadata: { preserved: true },
};

function normalize(descriptor, {
    runtime = [],
    editor = [],
} = {}) {
    return normalizeWamGuiDescriptorCompatibility(descriptor, {
        supportedRuntimeFeatures: runtime,
        supportedEditorFeatures: editor,
    });
}

test("legacy descriptors keep version 1, legacy sizing, and identity texture defaults", () => {
    const result = normalize(legacyDescriptor);

    assert.equal(result.schemaVersion, 1);
    assert.equal(result.worldWidth, null);
    assert.equal(result.designReference, null);
    assert.deepEqual(result.faceTransform, {
        x: 0,
        y: 0,
        rotation_degrees: 0,
        scale: 1,
    });
    assert.deepEqual(result.descriptor, legacyDescriptor);
    assert.equal("schema_version" in result.descriptor, false);

    const serialized = serializeWamGuiDescriptor(legacyDescriptor);
    assert.deepEqual(JSON.parse(serialized), legacyDescriptor);
});

test("version 2 fields apply documented partial-object defaults", () => {
    const descriptor = {
        ...legacyDescriptor,
        schema_version: 2,
        editor_features: [WAM_GUI_FEATURES.designReference],
        required_features: [WAM_GUI_FEATURES.worldWidth, WAM_GUI_FEATURES.faceTransform],
        design_reference: { url: "https://example.test/thumbnail.png" },
        world_width: 2.5,
        face_transform: { x: 0.2, rotation_degrees: 15 },
    };

    const result = normalize(descriptor, {
        runtime: descriptor.required_features,
        editor: descriptor.editor_features,
    });

    assert.equal(result.schemaVersion, 2);
    assert.deepEqual(result.designReference, {
        url: "https://example.test/thumbnail.png",
        opacity: 0.35,
        fit: "contain",
    });
    assert.equal(result.worldWidth, 2.5);
    assert.deepEqual(result.faceTransform, {
        x: 0.2,
        y: 0,
        rotation_degrees: 15,
        scale: 1,
    });
});

test("serialization preserves optional omission and unknown optional data", () => {
    const descriptor = {
        ...legacyDescriptor,
        schema_version: 2,
        required_features: [WAM_GUI_FEATURES.worldWidth, "wam3dgenerator.widget.new-knob.v1"],
        editor_features: [WAM_GUI_FEATURES.designReference, "third-party.editor.tool.v1"],
        world_width: 2,
        design_reference: {
            url: "https://example.test/thumbnail.png",
            opacity: 0.7,
            vendor_hint: { id: "reference-1" },
        },
        vendor_extension: { keep: ["all", "values"] },
    };
    const serialized = serializeWamGuiDescriptor(descriptor);
    const reloaded = JSON.parse(serialized);
    const result = normalize(reloaded, {
        runtime: descriptor.required_features,
        editor: [WAM_GUI_FEATURES.designReference],
    });

    assert.deepEqual(reloaded, descriptor);
    assert.equal(result.designReference.opacity, 0.7);
    assert.deepEqual(result.descriptor.vendor_extension, descriptor.vendor_extension);
    assert.deepEqual(result.descriptor.design_reference.vendor_hint, { id: "reference-1" });
    assert.deepEqual(result.unsupportedEditorFeatures, ["third-party.editor.tool.v1"]);
});

test("unsupported required runtime features fail with an actionable error", () => {
    const descriptor = {
        ...legacyDescriptor,
        schema_version: 2,
        required_features: ["wam3dgenerator.widget.unknown-widget.v1"],
    };

    assert.throws(
        () => normalize(descriptor),
        /Unsupported required WAM GUI feature\(s\): wam3dgenerator\.widget\.unknown-widget\.v1.*compatible wam3dgenerator build/,
    );
});

test("version, metadata, and field declarations are validated", () => {
    assert.throws(
        () => normalize({ ...legacyDescriptor, schema_version: 3 }),
        /Unsupported WAM GUI schema_version/,
    );
    assert.throws(
        () => normalize({ ...legacyDescriptor, world_width: 2 }),
        /V2 descriptor fields require schema_version: 2/,
    );
    assert.throws(
        () => normalize({
            ...legacyDescriptor,
            schema_version: 2,
            world_width: 2,
        }, { runtime: [WAM_GUI_FEATURES.worldWidth] }),
        /world_width requires the .* feature declaration/,
    );
    assert.throws(
        () => normalize({
            ...legacyDescriptor,
            schema_version: 2,
            editor_features: [WAM_GUI_FEATURES.designReference, WAM_GUI_FEATURES.designReference],
        }),
        /must not contain duplicate feature identifiers/,
    );
    assert.equal(widgetFeatureId("alternate_knob"), "wam3dgenerator.widget.alternate_knob.v1");
    assert.throws(() => widgetFeatureId(""), /stable lowercase alphanumeric identifier/);
    assert.throws(() => widgetFeatureId("Alternate_Knob"), /stable lowercase alphanumeric identifier/);
});

test("invalid V2 values fail instead of silently clamping or falling back", () => {
    const invalidDescriptors = [
        {
            design_reference: { url: "/relative.png" },
            editor_features: [WAM_GUI_FEATURES.designReference],
        },
        {
            design_reference: { url: "https://example.test/ref.png", opacity: 1.1 },
            editor_features: [WAM_GUI_FEATURES.designReference],
        },
        {
            design_reference: { url: "https://example.test/ref.png", fit: "cover" },
            editor_features: [WAM_GUI_FEATURES.designReference],
        },
        {
            world_width: 0,
            required_features: [WAM_GUI_FEATURES.worldWidth],
        },
        {
            face_transform: { scale: -1 },
            required_features: [WAM_GUI_FEATURES.faceTransform],
        },
        {
            face_transform: { rotation_degrees: Number.NaN },
            required_features: [WAM_GUI_FEATURES.faceTransform],
        },
    ];

    for (const fields of invalidDescriptors) {
        assert.throws(() => normalize({
            ...legacyDescriptor,
            schema_version: 2,
            ...fields,
        }, {
            runtime: fields.required_features ?? [],
            editor: fields.editor_features ?? [],
        }));
    }
});
