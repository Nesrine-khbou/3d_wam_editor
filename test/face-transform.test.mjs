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
    normalizeFaceTransform,
    svgFaceTransform,
    textureUvToSourceUv,
    transformFacePoint,
} = await import("../dist/index.js");

test("face texture transform uses clockwise rotation, center pivot, and image-relative translation", () => {
    assert.deepEqual(transformFacePoint({ x: 0.5, y: 0.5 }, { x: 0.2, y: -0.1 }), {
        x: 0.7,
        y: 0.4,
    });
    const rotated = transformFacePoint({ x: 0.5, y: 0 }, { rotation_degrees: 90 });
    assert.ok(Math.abs(rotated.x - 1) < 1e-12);
    assert.ok(Math.abs(rotated.y - 0.5) < 1e-12);
    const scaled = transformFacePoint({ x: 0.7, y: 0.5 }, { scale: 2 });
    assert.ok(Math.abs(scaled.x - 0.9) < 1e-12);
    assert.equal(scaled.y, 0.5);
});

test("Babylon UV sampling is the inverse of the shared front-facing transform", () => {
    const transform = { x: 0.2, y: -0.15, rotation_degrees: 37, scale: 1.4 };
    const source = { x: 0.28, y: 0.64 };
    const destination = transformFacePoint(source, transform);
    const sampledUv = textureUvToSourceUv(
        { x: destination.x, y: 1 - destination.y },
        transform,
    );

    assert.ok(Math.abs(sampledUv.x - source.x) < 1e-12);
    assert.ok(Math.abs(sampledUv.y - (1 - source.y)) < 1e-12);
});

test("partial transforms default to identity and reject invalid numeric values", () => {
    assert.deepEqual(normalizeFaceTransform({ x: 0.25 }), {
        x: 0.25,
        y: 0,
        rotation_degrees: 0,
        scale: 1,
    });
    assert.throws(() => normalizeFaceTransform({ scale: 0 }), /greater than 0/);
    assert.throws(() => normalizeFaceTransform({ x: Number.NaN }), /finite number/);
    assert.match(
        svgFaceTransform({ x: 0.25, y: -0.1, rotation_degrees: 15, scale: 1.5 }),
        /^translate\(50 50\) translate\(25 -10\) rotate\(15\) scale\(1.5\) translate\(-50 -50\)$/,
    );
});
