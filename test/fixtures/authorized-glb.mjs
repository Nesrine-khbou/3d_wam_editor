const PNG_BYTES = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZ8AAAAASUVORK5CYII=",
    "base64",
);

function pad4(buffer, fill = 0) {
    const padding = (4 - (buffer.length % 4)) % 4;
    return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, fill)]);
}

export function createAuthorizedGlb({ extensionsRequired = [], externalImage = false } = {}) {
    const positions = Buffer.from([
        -0.5, 0, 0, 0.5, 0, 0, 0, 1, 0,
    ].flatMap(value => {
        const bytes = Buffer.alloc(4);
        bytes.writeFloatLE(value);
        return [...bytes];
    }));
    const uvs = Buffer.from([0, 0, 1, 0, 0.5, 1].flatMap(value => {
        const bytes = Buffer.alloc(4);
        bytes.writeFloatLE(value);
        return [...bytes];
    }));
    const indices = Buffer.alloc(6);
    indices.writeUInt16LE(0, 0);
    indices.writeUInt16LE(1, 2);
    indices.writeUInt16LE(2, 4);

    let binary = Buffer.alloc(0);
    const bufferViews = [];
    function appendBufferView(data, target) {
        binary = pad4(binary);
        const view = { buffer: 0, byteOffset: binary.length, byteLength: data.length };
        if (target !== undefined) view.target = target;
        bufferViews.push(view);
        binary = Buffer.concat([binary, data]);
        return bufferViews.length - 1;
    }

    const positionView = appendBufferView(positions, 34962);
    const uvView = appendBufferView(uvs, 34962);
    const indexView = appendBufferView(indices, 34963);
    const imageView = externalImage ? undefined : appendBufferView(PNG_BYTES);
    binary = pad4(binary);

    const gltf = {
        asset: { version: "2.0", generator: "wam3d-authorized-fixture" },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [
            { name: "fixture-root", children: [1, 2] },
            { name: "body", mesh: 0 },
            { name: "detail-group", children: [3] },
            { name: "detail", mesh: 1 },
        ],
        meshes: [
            { name: "body-mesh", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] },
            { name: "detail-mesh", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] },
        ],
        materials: [{
            name: "fixture-pbr",
            pbrMetallicRoughness: {
                baseColorFactor: [0.8, 0.7, 0.6, 1],
                metallicFactor: 0.15,
                roughnessFactor: 0.65,
                baseColorTexture: { index: 0 },
            },
        }],
        textures: [{ source: 0 }],
        images: [externalImage
            ? { uri: "textures/albedo.png" }
            : { bufferView: imageView, mimeType: "image/png" }],
        accessors: [
            { bufferView: positionView, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, 0, 0], max: [0.5, 1, 0] },
            { bufferView: uvView, componentType: 5126, count: 3, type: "VEC2" },
            { bufferView: indexView, componentType: 5123, count: 3, type: "SCALAR", min: [0], max: [2] },
        ],
        bufferViews,
        buffers: [{ byteLength: binary.length }],
    };
    if (extensionsRequired.length > 0) gltf.extensionsRequired = extensionsRequired;

    const jsonChunk = pad4(Buffer.from(JSON.stringify(gltf)), 0x20);
    const binaryChunk = pad4(binary);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binaryChunk.length, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonChunk.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(binaryChunk.length, 0);
    binaryHeader.writeUInt32LE(0x004e4942, 4);

    return Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]);
}

export function createAuthorizedGltfFiles({ extensionsRequired = [] } = {}) {
    const glb = createAuthorizedGlb();
    const jsonLength = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8").trim());
    const binaryHeaderOffset = 20 + jsonLength;
    const binaryLength = glb.readUInt32LE(binaryHeaderOffset);
    const binary = glb.subarray(binaryHeaderOffset + 8, binaryHeaderOffset + 8 + binaryLength);
    const imageView = json.bufferViews[3];
    const texture = binary.subarray(imageView.byteOffset, imageView.byteOffset + imageView.byteLength);
    json.buffers[0].uri = "buffers/mesh.bin";
    json.images[0] = { uri: "textures/albedo.png" };
    if (extensionsRequired.length > 0) json.extensionsRequired = extensionsRequired;

    return [
        { path: "instrument.gltf", data: Buffer.from(JSON.stringify(json)) },
        { path: "buffers/mesh.bin", data: binary },
        { path: "textures/albedo.png", data: texture },
    ];
}
