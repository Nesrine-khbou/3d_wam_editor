import { SceneLoader } from "@babylonjs/core";
import type { AbstractMesh, AssetContainer, Scene } from "@babylonjs/core";
import "@babylonjs/loaders/glTF/index.js";

export const GLB_POC_FORMAT = "wam3d-glb-poc";
export const GLB_POC_VERSION = 1;
export const GLB_POC_MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const GLB_POC_MAX_MESHES = 250;
export const GLB_POC_MAX_VERTICES = 100_000;
export const GLB_POC_COORDINATE_SYSTEM = "wam3d-editor-lh-y-up-meter-v1";

interface GlbAssetDocument {
    id: string;
    file_name: string;
    content_type: "model/gltf-binary";
    data_base64: string;
}

interface GlbProjectDocument {
    format: typeof GLB_POC_FORMAT;
    version: typeof GLB_POC_VERSION;
    coordinate_system: typeof GLB_POC_COORDINATE_SYSTEM;
    assets: [GlbAssetDocument];
    selected_node_id: string | null;
}

function bytesOf(source: ArrayBuffer | Uint8Array): Uint8Array {
    return source instanceof Uint8Array ? source.slice() : new Uint8Array(source.slice(0));
}

function decodeGlbJson(bytes: Uint8Array): Record<string, unknown> {
    if (bytes.byteLength > GLB_POC_MAX_ASSET_BYTES) {
        throw new RangeError(`GLB exceeds the ${GLB_POC_MAX_ASSET_BYTES / (1024 * 1024)} MiB proof-of-concept limit`);
    }
    if (bytes.byteLength < 20) {
        throw new TypeError("GLB file is truncated; expected a GLB 2.0 header and JSON chunk");
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) {
        throw new TypeError("Invalid GLB file; expected the glTF binary magic header");
    }
    if (view.getUint32(4, true) !== 2) {
        throw new TypeError(`Unsupported GLB version "${view.getUint32(4, true)}"; expected version 2`);
    }
    if (view.getUint32(8, true) !== bytes.byteLength) {
        throw new TypeError("Invalid GLB file length in header");
    }

    let offset = 12;
    let json: Record<string, unknown> | undefined;
    while (offset + 8 <= bytes.byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        offset += 8;
        if (offset + chunkLength > bytes.byteLength) {
            throw new TypeError("GLB contains a truncated chunk");
        }
        if (chunkType === 0x4e4f534a) {
            try {
                json = JSON.parse(new TextDecoder().decode(bytes.subarray(offset, offset + chunkLength))) as Record<string, unknown>;
            } catch (error) {
                throw new TypeError("GLB contains invalid JSON", { cause: error });
            }
            break;
        }
        offset += chunkLength;
    }
    if (!json) {
        throw new TypeError("GLB is missing its JSON chunk");
    }

    const extensionsRequired = json.extensionsRequired;
    if (Array.isArray(extensionsRequired) && extensionsRequired.length > 0) {
        throw new Error(
            `This proof of concept does not support required glTF extensions: ${extensionsRequired.join(", ")}`,
        );
    }

    for (const resource of [...(Array.isArray(json.buffers) ? json.buffers : []), ...(Array.isArray(json.images) ? json.images : [])]) {
        if (typeof resource !== "object" || resource === null || !("uri" in resource)) continue;
        const uri = (resource as { uri?: unknown }).uri;
        if (typeof uri === "string" && !uri.startsWith("data:")) {
            throw new Error(`GLB references an external resource "${uri}"; embed all resources in the GLB before importing`);
        }
    }
    return json;
}

function base64Encode(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    let binary: string;
    try {
        binary = atob(value);
    } catch (error) {
        throw new TypeError("Project asset data is not valid base64", { cause: error });
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

async function assetIdFor(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return `glb-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

function validateProjectDocument(value: unknown): GlbProjectDocument {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new TypeError("GLB project must be a JSON object");
    }
    const project = value as Partial<GlbProjectDocument>;
    if (project.format !== GLB_POC_FORMAT || project.version !== GLB_POC_VERSION) {
        throw new TypeError(`Unsupported GLB project format or version; expected ${GLB_POC_FORMAT} version ${GLB_POC_VERSION}`);
    }
    if (project.coordinate_system !== GLB_POC_COORDINATE_SYSTEM) {
        throw new TypeError(`Unsupported project coordinate system "${String(project.coordinate_system)}"`);
    }
    if (!Array.isArray(project.assets) || project.assets.length !== 1) {
        throw new TypeError("GLB proof-of-concept project must contain exactly one model asset");
    }
    const asset = project.assets[0];
    if (
        typeof asset !== "object" || asset === null ||
        typeof asset.id !== "string" || typeof asset.file_name !== "string" ||
        asset.content_type !== "model/gltf-binary" || typeof asset.data_base64 !== "string"
    ) {
        throw new TypeError("GLB project asset must include id, file_name, model/gltf-binary content_type, and data_base64");
    }
    if (asset.data_base64.length > Math.ceil(GLB_POC_MAX_ASSET_BYTES / 3) * 4) {
        throw new RangeError(`Embedded GLB asset exceeds the ${GLB_POC_MAX_ASSET_BYTES / (1024 * 1024)} MiB proof-of-concept limit`);
    }
    if (project.selected_node_id !== null && typeof project.selected_node_id !== "string") {
        throw new TypeError("selected_node_id must be a string or null");
    }
    return project as GlbProjectDocument;
}

export class GlbProofOfConcept {
    readonly assetId: string;
    readonly fileName: string;
    readonly container: AssetContainer;
    readonly nodes: ReadonlyMap<string, AbstractMesh>;
    selectedNodeId: string | null = null;
    private disposed = false;
    private readonly sourceBytes: Uint8Array;

    private constructor(
        fileName: string,
        sourceBytes: Uint8Array,
        assetId: string,
        container: AssetContainer,
        nodes: Map<string, AbstractMesh>,
    ) {
        this.assetId = assetId;
        this.fileName = fileName;
        this.sourceBytes = sourceBytes;
        this.container = container;
        this.nodes = nodes;
        container.addAllToScene();
    }

    static async import(
        scene: Scene,
        source: ArrayBuffer | Uint8Array,
        fileName = "authorized-model.glb",
        onProgress?: (loaded: number, total: number) => void,
    ): Promise<GlbProofOfConcept> {
        const bytes = bytesOf(source);
        decodeGlbJson(bytes);
        const assetId = await assetIdFor(bytes);
        const container = await SceneLoader.LoadAssetContainerAsync(
            "",
            bytes,
            scene,
            event => onProgress?.(event.loaded, event.lengthComputable ? event.total : 0),
            ".glb",
            fileName,
        );
        const meshes = container.meshes.filter(mesh => mesh.getTotalVertices() > 0);
        const vertexCount = meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0);
        if (meshes.length > GLB_POC_MAX_MESHES || vertexCount > GLB_POC_MAX_VERTICES) {
            container.dispose();
            throw new RangeError(
                `GLB exceeds proof-of-concept complexity limits (${GLB_POC_MAX_MESHES} meshes, ${GLB_POC_MAX_VERTICES} vertices); ` +
                `found ${meshes.length} meshes and ${vertexCount} vertices`,
            );
        }
        if (meshes.length === 0) {
            container.dispose();
            throw new Error("GLB did not contain any renderable mesh geometry");
        }

        const nodes = new Map<string, AbstractMesh>();
        for (const mesh of meshes) {
            const meshIndex = container.meshes.indexOf(mesh);
            nodes.set(`${assetId}/mesh/${meshIndex}`, mesh);
        }
        return new GlbProofOfConcept(fileName, bytes, assetId, container, nodes);
    }

    selectNode(nodeId: string): AbstractMesh {
        this.assertActive();
        const mesh = this.nodes.get(nodeId);
        if (!mesh) throw new RangeError(`Unknown model node ID "${nodeId}"`);
        this.selectedNodeId = nodeId;
        return mesh;
    }

    serialize(): string {
        this.assertActive();
        const project: GlbProjectDocument = {
            format: GLB_POC_FORMAT,
            version: GLB_POC_VERSION,
            coordinate_system: GLB_POC_COORDINATE_SYSTEM,
            assets: [{
                id: this.assetId,
                file_name: this.fileName,
                content_type: "model/gltf-binary",
                data_base64: base64Encode(this.sourceBytes),
            }],
            selected_node_id: this.selectedNodeId,
        };
        return JSON.stringify(project);
    }

    static async reload(scene: Scene, serializedProject: string): Promise<GlbProofOfConcept> {
        let value: unknown;
        try {
            value = JSON.parse(serializedProject);
        } catch (error) {
            throw new TypeError("GLB project is not valid JSON", { cause: error });
        }
        const project = validateProjectDocument(value);
        const asset = project.assets[0];
        const bytes = base64Decode(asset.data_base64);
        const actualAssetId = await assetIdFor(bytes);
        if (actualAssetId !== asset.id) {
            throw new Error(`Project asset integrity check failed for "${asset.file_name}"`);
        }
        const model = await GlbProofOfConcept.import(scene, bytes, asset.file_name);
        if (project.selected_node_id !== null) model.selectNode(project.selected_node_id);
        return model;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.container.dispose();
        this.selectedNodeId = null;
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("GLB proof-of-concept model has been disposed");
    }
}
