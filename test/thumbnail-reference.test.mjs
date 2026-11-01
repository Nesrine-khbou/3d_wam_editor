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
    loadThumbnailReference,
    resolveThumbnailUrl,
    serializeWamGuiDescriptor,
} = await import("../dist/index.js");

function fakeImage({ width = 1600, height = 749, fail = false } = {}) {
    const image = {
        crossOrigin: null,
        naturalWidth: width,
        naturalHeight: height,
        onload: null,
        onerror: null,
        _src: "",
    };
    Object.defineProperty(image, "src", {
        get() { return this._src; },
        set(value) {
            assert.equal(this.crossOrigin, "anonymous");
            this._src = value;
            queueMicrotask(() => {
                if (fail) this.onerror?.(new Error("CORS blocked"));
                else this.onload?.();
            });
        },
    });
    return image;
}

test("thumbnail resolution supports module and descriptor URL bases", () => {
    assert.equal(
        resolveThumbnailUrl("../images/panel.png", "https://wam.test/plugin/dist/index.js"),
        "https://wam.test/plugin/images/panel.png",
    );
    assert.equal(
        resolveThumbnailUrl("images/panel.png", "https://wam.test/plugin/index.js", "https://cdn.test/wam/descriptor.json"),
        "https://cdn.test/wam/images/panel.png",
    );
    assert.equal(
        resolveThumbnailUrl("https://assets.test/panel.png", "https://wam.test/index.js"),
        "https://assets.test/panel.png",
    );
    assert.equal(resolveThumbnailUrl(undefined, "", undefined), null);
});

test("loaded thumbnail exposes natural dimensions and exact aspect ratio", async () => {
    const image = fakeImage();
    const loaded = await loadThumbnailReference(
        "panel.png",
        "https://wam.test/plugin/index.js",
        undefined,
        () => image,
    );

    assert.equal(loaded.url, "https://wam.test/plugin/panel.png");
    assert.equal(loaded.image, image);
    assert.equal(loaded.naturalWidth, 1600);
    assert.equal(loaded.naturalHeight, 749);
    assert.equal(loaded.aspectRatio, 1600 / 749);
});

test("missing thumbnails are empty and malformed URLs are explicit errors", async () => {
    assert.equal(await loadThumbnailReference(undefined, ""), null);
    assert.throws(() => resolveThumbnailUrl("panel.png", ""), /descriptor or module URL is required/);
    assert.throws(() => resolveThumbnailUrl({ src: "panel.png" }, "https://wam.test/index.js"), /must be a non-empty URL/);
});

test("image failures report missing or cross-origin access instead of hanging", async () => {
    await assert.rejects(
        loadThumbnailReference(
            "panel.png",
            "https://wam.test/index.js",
            undefined,
            () => fakeImage({ fail: true }),
        ),
        /permits cross-origin access/,
    );
});

test("invalid natural dimensions are rejected", async () => {
    await assert.rejects(
        loadThumbnailReference(
            "panel.png",
            "https://wam.test/index.js",
            undefined,
            () => fakeImage({ width: 0 }),
        ),
        /without valid natural dimensions/,
    );
});

test("reference loading does not replace the independently configured body texture", async () => {
    const descriptor = {
        schema_version: 2,
        editor_features: ["wam3dgenerator.editor.design-reference.v1"],
        design_reference: { url: "https://wam.test/panel.png" },
        face: "https://wam.test/body-texture.png",
        aspect_ratio: 1,
        size: 0.8,
        top_color: "#ffffff",
        bottom_color: "#000000",
        controls: [],
    };

    await loadThumbnailReference(
        descriptor.design_reference.url,
        "https://wam.test/index.js",
        undefined,
        () => fakeImage(),
    );

    const serialized = JSON.parse(serializeWamGuiDescriptor(descriptor));
    assert.equal(serialized.design_reference.url, "https://wam.test/panel.png");
    assert.equal(serialized.face, "https://wam.test/body-texture.png");
});
