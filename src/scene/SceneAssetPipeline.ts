import { SceneLoader } from "@babylonjs/core";
import type { AbstractMesh, AssetContainer, Scene, TransformNode } from "@babylonjs/core";
import {
    normalizeWamGuiDescriptorCompatibility,
    WAM_GUI_FEATURES,
} from "../descriptor/WamGuiDescriptor.ts";
import { normalizeWamGuiScene } from "../descriptor/WamGuiScene.ts";
import type { SceneAsset, WamGuiSceneDocument } from "../descriptor/WamGuiScene.ts";
import type { WamGUICode } from "../WamGUIGenerator.ts";
import "@babylonjs/loaders/glTF/index.js";

export const SCENE_PACKAGE_FORMAT = "wam3d-project";
export const SCENE_PACKAGE_VERSION = 1;
export const SCENE_ASSET_MAX_BYTES = 25 * 1024 * 1024;
export const SCENE_ASSET_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const SCENE_ASSET_MAX_FILES = 256;
export const SCENE_ASSET_MAX_MESHES = 250;
export const SCENE_ASSET_MAX_VERTICES = 100_000;
export const SCENE_SUPPORTED_REQUIRED_GLTF_EXTENSIONS = Object.freeze([
    "KHR_materials_unlit",
    "KHR_texture_transform",
] as const);

export type SceneAssetMediaType =
    | "model/gltf-binary"
    | "model/gltf+json"
    | "application/octet-stream"
    | "image/png"
    | "image/jpeg"
    | "image/webp";

export interface SceneAssetFile {
    path: string;
    data: ArrayBuffer | Uint8Array;
}

export interface SceneAssetImportProgress {
    phase: "validating" | "loading" | "complete";
    loaded: number;
    total: number;
    message: string;
}

export interface SceneAssetImportOptions {
    signal?: AbortSignal;
    onProgress?: (progress: SceneAssetImportProgress) => void;
    maxAssetBytes?: number;
    maxMeshes?: number;
    maxVertices?: number;
}

export interface ImportedSceneAsset {
    readonly assetId: string;
    readonly fileName: string;
    readonly assetContainer: AssetContainer;
    readonly sceneAssets: readonly SceneAsset[];
    readonly files: ReadonlyMap<string, Uint8Array>;
    readonly nodes: ReadonlyMap<string, TransformNode>;
    readonly meshes: ReadonlyMap<string, AbstractMesh>;
    dispose(): void;
}

export interface ProjectAssetRecord extends SceneAsset {
    size_bytes: number;
    sha256: string;
    data_base64: string;
}

export interface SceneAssetPayload {
    id: string;
    uri: string;
    media_type: string;
    data: ArrayBuffer | Uint8Array;
    source_path?: string;
}

export interface ProjectPackage {
    format: typeof SCENE_PACKAGE_FORMAT;
    version: typeof SCENE_PACKAGE_VERSION;
    descriptor: Record<string, unknown>;
    assets: ProjectAssetRecord[];
}

export interface SceneAssetLimits {
    maxAssetBytes?: number;
    maxTotalBytes?: number;
    maxAssetCount?: number;
}

export interface SceneAssetDependencyIssue {
    code: "missing" | "unused" | "oversized" | "unsupported";
    assetId?: string;
    uri?: string;
    mediaType?: string;
    sizeBytes?: number;
    message: string;
}

export interface SceneAssetDependencySummary {
    files: Array<{ id: string; uri: string; mediaType: string; sizeBytes: number; referenced: boolean }>;
    missing: string[];
    unused: string[];
    oversized: string[];
    unsupported: string[];
    issues: SceneAssetDependencyIssue[];
    exportBlocked: boolean;
}

export class SceneAssetPipelineError extends Error {
    readonly code: "CANCELLED" | "INVALID_FILE" | "MISSING_DEPENDENCY" | "UNSUPPORTED_CONTENT" | "IMPORT_FAILED" | "PACKAGE_INVALID";

    constructor(
        code: "CANCELLED" | "INVALID_FILE" | "MISSING_DEPENDENCY" | "UNSUPPORTED_CONTENT" | "IMPORT_FAILED" | "PACKAGE_INVALID",
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "SceneAssetPipelineError";
        this.code = code;
    }
}

interface PreparedFile {
    path: string;
    data: Uint8Array;
    mediaType: SceneAssetMediaType;
    id: string;
}

interface ParsedGltf {
    json: Record<string, unknown>;
    binaryChunk?: Uint8Array;
}

interface ScenePackageDocument {
    format: typeof SCENE_PACKAGE_FORMAT;
    version: typeof SCENE_PACKAGE_VERSION;
    descriptor: Record<string, unknown>;
    assets: Array<{
        id: string;
        uri: string;
        media_type: SceneAssetMediaType;
        size_bytes: number;
        sha256: string;
        data_base64: string;
    }>;
}

function bytesOf(data: ArrayBuffer | Uint8Array): Uint8Array {
    return data instanceof Uint8Array
        ? data.slice()
        : new Uint8Array(data.slice(0));
}

function checkCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new SceneAssetPipelineError("CANCELLED", "Model import was cancelled");
    }
}

function reportProgress(
    callback: SceneAssetImportOptions["onProgress"],
    progress: SceneAssetImportProgress,
): void {
    callback?.(progress);
}

function normalizeBundlePath(path: string, label: string): string {
    let decoded: string;
    try {
        decoded = decodeURIComponent(path);
    } catch (error) {
        throw new SceneAssetPipelineError("INVALID_FILE", `${label} contains invalid URI encoding`, { cause: error });
    }
    if (
        decoded.length === 0 ||
        decoded.startsWith("/") ||
        decoded.includes("\\") ||
        decoded.includes("?") ||
        decoded.includes("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
        decoded.split("/").some(part => part === "" || part === "." || part === "..")
    ) {
        throw new SceneAssetPipelineError("INVALID_FILE", `${label} must be a safe project-relative file path`);
    }
    return decoded;
}

function mediaTypeForPath(path: string): SceneAssetMediaType {
    const extension = path.split(".").at(-1)?.toLowerCase();
    switch (extension) {
        case "glb": return "model/gltf-binary";
        case "gltf": return "model/gltf+json";
        case "png": return "image/png";
        case "jpg":
        case "jpeg": return "image/jpeg";
        case "webp": return "image/webp";
        case "bin": return "application/octet-stream";
        default:
            throw new SceneAssetPipelineError("UNSUPPORTED_CONTENT", `Unsupported asset file type for "${path}"`);
    }
}

async function sha256Id(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return `sha256-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function assetIdentity(path: string, bytes: Uint8Array): Promise<string> {
    const pathBytes = new TextEncoder().encode(`${path}\0`);
    const identityBytes = new Uint8Array(pathBytes.length + bytes.length);
    identityBytes.set(pathBytes);
    identityBytes.set(bytes, pathBytes.length);
    return sha256Id(identityBytes);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const id = await sha256Id(bytes);
    return id.slice("sha256-".length);
}

function encodeBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
    }
    return btoa(binary);
}

function decodeBase64(value: string, label: string): Uint8Array {
    let binary: string;
    try {
        binary = atob(value);
    } catch (error) {
        throw new SceneAssetPipelineError("PACKAGE_INVALID", `${label} is not valid base64`, { cause: error });
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function dataUri(mediaType: string, bytes: Uint8Array): string {
    return `data:${mediaType};base64,${encodeBase64(bytes)}`;
}

function readGlb(source: Uint8Array): ParsedGltf {
    if (source.byteLength < 20) {
        throw new SceneAssetPipelineError("INVALID_FILE", "GLB is truncated; expected a GLB 2.0 header and JSON chunk");
    }
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) {
        throw new SceneAssetPipelineError("INVALID_FILE", "Invalid GLB magic header");
    }
    if (view.getUint32(4, true) !== 2) {
        throw new SceneAssetPipelineError("UNSUPPORTED_CONTENT", `Unsupported GLB version "${view.getUint32(4, true)}"`);
    }
    if (view.getUint32(8, true) !== source.byteLength) {
        throw new SceneAssetPipelineError("INVALID_FILE", "GLB header length does not match the file size");
    }
    let offset = 12;
    let json: Record<string, unknown> | undefined;
    let binaryChunk: Uint8Array | undefined;
    while (offset + 8 <= source.byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        offset += 8;
        if (offset + chunkLength > source.byteLength) {
            throw new SceneAssetPipelineError("INVALID_FILE", "GLB contains a truncated chunk");
        }
        const chunk = source.subarray(offset, offset + chunkLength);
        if (chunkType === 0x4e4f534a) {
            try {
                json = JSON.parse(new TextDecoder().decode(chunk)) as Record<string, unknown>;
            } catch (error) {
                throw new SceneAssetPipelineError("INVALID_FILE", "GLB contains invalid JSON", { cause: error });
            }
        } else if (chunkType === 0x004e4942) {
            binaryChunk = chunk.slice();
        }
        offset += chunkLength;
    }
    if (!json) throw new SceneAssetPipelineError("INVALID_FILE", "GLB is missing its JSON chunk");
    return { json, binaryChunk };
}

function parseGltf(source: Uint8Array, extension: string): ParsedGltf {
    if (extension === ".glb") return readGlb(source);
    try {
        return { json: JSON.parse(new TextDecoder().decode(source)) as Record<string, unknown> };
    } catch (error) {
        throw new SceneAssetPipelineError("INVALID_FILE", "glTF file contains invalid JSON", { cause: error });
    }
}

function resolveDependencyPath(primaryPath: string, uri: string): string {
    let decoded: string;
    try {
        decoded = decodeURIComponent(uri);
    } catch (error) {
        throw new SceneAssetPipelineError("INVALID_FILE", `glTF dependency URI "${uri}" has invalid encoding`, { cause: error });
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.startsWith("/") || decoded.includes("\\") || decoded.includes("?") || decoded.includes("#")) {
        throw new SceneAssetPipelineError(
            "INVALID_FILE",
            `External glTF dependency "${uri}" must be a local relative file; network and absolute URLs are not loaded`,
        );
    }
    const directory = primaryPath.includes("/") ? primaryPath.slice(0, primaryPath.lastIndexOf("/") + 1) : "";
    const segments = [...directory.split("/").filter(Boolean)];
    for (const segment of decoded.split("/")) {
        if (segment === "" || segment === ".") {
            throw new SceneAssetPipelineError("INVALID_FILE", `Invalid glTF dependency URI "${uri}"`);
        }
        if (segment === "..") {
            if (segments.length === 0) throw new SceneAssetPipelineError("INVALID_FILE", `Dependency URI "${uri}" escapes the supplied project files`);
            segments.pop();
        } else {
            segments.push(segment);
        }
    }
    return segments.join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inlineGltfDependencies(
    parsed: ParsedGltf,
    extension: string,
    primaryPath: string,
    files: ReadonlyMap<string, PreparedFile>,
): Record<string, unknown> {
    const json = structuredClone(parsed.json);
    const required = Array.isArray(json.extensionsRequired) ? json.extensionsRequired : [];
    const unsupported = required.filter(extensionName =>
        typeof extensionName !== "string" ||
        !SCENE_SUPPORTED_REQUIRED_GLTF_EXTENSIONS.includes(extensionName as typeof SCENE_SUPPORTED_REQUIRED_GLTF_EXTENSIONS[number]),
    );
    if (unsupported.length > 0) {
        throw new SceneAssetPipelineError(
            "UNSUPPORTED_CONTENT",
            `Unsupported required glTF extension(s): ${unsupported.join(", ")}`,
        );
    }

    const buffers = Array.isArray(json.buffers) ? json.buffers : [];
    const images = Array.isArray(json.images) ? json.images : [];
    if (extension === ".glb") {
        const uriLessBuffers = buffers.filter(resource => isRecord(resource) && resource.uri === undefined);
        if (uriLessBuffers.length > 0) {
            if (!parsed.binaryChunk) {
                throw new SceneAssetPipelineError("INVALID_FILE", "GLB declares a binary buffer but has no BIN chunk");
            }
            const first = uriLessBuffers[0];
            if (!isRecord(first) || typeof first.byteLength !== "number" || first.byteLength > parsed.binaryChunk.byteLength) {
                throw new SceneAssetPipelineError("INVALID_FILE", "GLB binary buffer length exceeds its BIN chunk");
            }
            first.uri = dataUri("application/octet-stream", parsed.binaryChunk.subarray(0, first.byteLength));
        }
    }

    for (const [resourceName, resources] of [["buffer", buffers], ["image", images]] as const) {
        resources.forEach((resource, index) => {
            if (!isRecord(resource)) {
                throw new SceneAssetPipelineError("INVALID_FILE", `glTF ${resourceName} ${index} must be an object`);
            }
            if (typeof resource.uri === "string") {
                if (resource.uri.startsWith("data:")) return;
                const dependencyPath = resolveDependencyPath(primaryPath, resource.uri);
                const dependency = files.get(dependencyPath);
                if (!dependency) {
                    throw new SceneAssetPipelineError(
                        "MISSING_DEPENDENCY",
                        `Missing glTF ${resourceName} "${resource.uri}" (expected local file "${dependencyPath}")`,
                    );
                }
                const mediaType = resourceName === "image" ? dependency.mediaType : "application/octet-stream";
                if (resourceName === "image" && !mediaType.startsWith("image/")) {
                    throw new SceneAssetPipelineError(
                        "UNSUPPORTED_CONTENT",
                        `glTF image "${resource.uri}" has unsupported media type "${mediaType}"`,
                    );
                }
                resource.uri = dataUri(mediaType, dependency.data);
                return;
            }
            if (resourceName === "image" && resource.bufferView !== undefined) return;
            if (resourceName === "buffer" && extension === ".glb" && resource.uri !== undefined) return;
            throw new SceneAssetPipelineError(
                resourceName === "image" ? "MISSING_DEPENDENCY" : "INVALID_FILE",
                `glTF ${resourceName} ${index} has no embedded or resolvable local data`,
            );
        });
    }
    return json;
}

function extensionFor(path: string): ".gltf" | ".glb" {
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    if (extension !== ".gltf" && extension !== ".glb") {
        throw new SceneAssetPipelineError("UNSUPPORTED_CONTENT", `Model "${path}" must have a .gltf or .glb extension`);
    }
    return extension;
}

function requireDescriptorObject(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) throw new SceneAssetPipelineError("PACKAGE_INVALID", "Project descriptor must be an object");
    return value;
}

function descriptorScene(value: unknown): WamGuiSceneDocument | null {
    const descriptor = requireDescriptorObject(value);
    const declaredRuntimeFeatures = Array.isArray(descriptor.required_features)
        ? descriptor.required_features.filter((feature): feature is string => typeof feature === "string")
        : [];
    try {
        const compatibility = normalizeWamGuiDescriptorCompatibility(descriptor, {
            supportedRuntimeFeatures: [
                ...declaredRuntimeFeatures,
                WAM_GUI_FEATURES.sceneGraph,
            ],
            supportedEditorFeatures: Array.isArray(descriptor.editor_features)
                ? descriptor.editor_features.filter((feature): feature is string => typeof feature === "string")
                : [],
        });
        return compatibility.scene;
    } catch (error) {
        throw new SceneAssetPipelineError("PACKAGE_INVALID", `Invalid WAM GUI descriptor: ${(error as Error).message}`, { cause: error });
    }
}

function normalizeMediaType(value: unknown, name: string): SceneAssetMediaType {
    if (
        value === "model/gltf-binary" ||
        value === "model/gltf+json" ||
        value === "application/octet-stream" ||
        value === "image/png" ||
        value === "image/jpeg" ||
        value === "image/webp"
    ) return value;
    throw new SceneAssetPipelineError("PACKAGE_INVALID", `${name} has unsupported media type "${String(value)}"`);
}

export async function importGltfAsset(
    scene: Scene,
    inputFiles: readonly SceneAssetFile[],
    primaryFilePath: string,
    options: SceneAssetImportOptions = {},
): Promise<ImportedSceneAsset> {
    checkCancelled(options.signal);
    reportProgress(options.onProgress, {
        phase: "validating",
        loaded: 0,
        total: inputFiles.length,
        message: "Validating model and local dependencies",
    });

    const maxAssetBytes = options.maxAssetBytes ?? SCENE_ASSET_MAX_BYTES;
    const maxMeshes = options.maxMeshes ?? SCENE_ASSET_MAX_MESHES;
    const maxVertices = options.maxVertices ?? SCENE_ASSET_MAX_VERTICES;
    if (!Number.isInteger(maxAssetBytes) || maxAssetBytes < 1) {
        throw new RangeError("maxAssetBytes must be a positive integer");
    }
    if (!Number.isInteger(maxMeshes) || maxMeshes < 1) throw new RangeError("maxMeshes must be a positive integer");
    if (!Number.isInteger(maxVertices) || maxVertices < 1) throw new RangeError("maxVertices must be a positive integer");
    if (inputFiles.length === 0 || inputFiles.length > SCENE_ASSET_MAX_FILES) {
        throw new SceneAssetPipelineError("INVALID_FILE", `Select between 1 and ${SCENE_ASSET_MAX_FILES} model/dependency files`);
    }

    const files = new Map<string, PreparedFile>();
    let totalBytes = 0;
    for (let index = 0; index < inputFiles.length; index++) {
        checkCancelled(options.signal);
        const input = inputFiles[index];
        const path = normalizeBundlePath(input.path, `Selected file ${index}`);
        if (files.has(path)) throw new SceneAssetPipelineError("INVALID_FILE", `Duplicate selected file path "${path}"`);
        const mediaType = mediaTypeForPath(path);
        const data = bytesOf(input.data);
        if (data.byteLength > maxAssetBytes) {
            throw new SceneAssetPipelineError("UNSUPPORTED_CONTENT", `Asset "${path}" exceeds the ${maxAssetBytes} byte per-file limit`);
        }
        totalBytes += data.byteLength;
        const id = await assetIdentity(path, data);
        files.set(path, { path, data, mediaType, id });
        reportProgress(options.onProgress, {
            phase: "validating",
            loaded: index + 1,
            total: inputFiles.length,
            message: `Validated ${path}`,
        });
    }
    if (totalBytes > SCENE_ASSET_MAX_TOTAL_BYTES) {
        throw new SceneAssetPipelineError(
            "UNSUPPORTED_CONTENT",
            `Selected model and dependencies exceed the ${SCENE_ASSET_MAX_TOTAL_BYTES} byte total import limit`,
        );
    }

    const normalizedPrimaryPath = normalizeBundlePath(primaryFilePath, "Primary model path");
    const primary = files.get(normalizedPrimaryPath);
    if (!primary) throw new SceneAssetPipelineError("MISSING_DEPENDENCY", `Primary model "${normalizedPrimaryPath}" was not selected`);
    const extension = extensionFor(normalizedPrimaryPath);
    const parsed = parseGltf(primary.data, extension);
    const inlineDocument = inlineGltfDependencies(parsed, extension, normalizedPrimaryPath, files);
    checkCancelled(options.signal);

    const modelId = primary.id;
    const sceneAssets: SceneAsset[] = [...files.values()].map(file => ({
        id: file.id,
        uri: `assets/${modelId}/${file.path}`,
        media_type: file.mediaType,
        source_path: file.path,
    }));

    let container: AssetContainer | undefined;
    try {
        reportProgress(options.onProgress, {
            phase: "loading",
            loaded: 0,
            total: 0,
            message: `Loading ${normalizedPrimaryPath} with Babylon.js`,
        });
        container = await SceneLoader.LoadAssetContainerAsync(
            "",
            `data:${JSON.stringify(inlineDocument)}`,
            scene,
            event => options.onProgress?.({
                phase: "loading",
                loaded: event.loaded,
                total: event.lengthComputable ? event.total : 0,
                message: event.lengthComputable
                    ? `Loaded ${event.loaded} of ${event.total} bytes`
                    : "Decoding model geometry and materials",
            }),
            ".gltf",
            normalizedPrimaryPath,
        );
        checkCancelled(options.signal);
        const meshes = container.meshes.filter(mesh => mesh.getTotalVertices() > 0);
        const vertexCount = meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0);
        if (meshes.length > maxMeshes || vertexCount > maxVertices) {
            throw new SceneAssetPipelineError(
                "UNSUPPORTED_CONTENT",
                `Model exceeds complexity limits (${maxMeshes} meshes, ${maxVertices} vertices); found ${meshes.length} meshes and ${vertexCount} vertices`,
            );
        }
        if (meshes.length === 0) {
            throw new SceneAssetPipelineError("UNSUPPORTED_CONTENT", "glTF did not contain any renderable mesh geometry");
        }

        const nodes = new Map<string, TransformNode>();
        const stablePrefix = modelId;
        container.transformNodes.forEach((node, index) => nodes.set(`${stablePrefix}/node/${index}`, node));
        container.meshes.forEach((mesh, index) => nodes.set(`${stablePrefix}/mesh/${index}`, mesh));
        const stableMeshes = new Map<string, AbstractMesh>(
            container.meshes.map((mesh, index) => [`${stablePrefix}/mesh/${index}`, mesh]),
        );
        container.addAllToScene();
        let disposed = false;
        const imported: ImportedSceneAsset = {
            assetId: primary.id,
            fileName: normalizedPrimaryPath,
            assetContainer: container,
            sceneAssets,
            files: new Map([...files].map(([path, file]) => [path, file.data.slice()])),
            nodes,
            meshes: stableMeshes,
            dispose() {
                if (disposed) return;
                disposed = true;
                container?.dispose();
                nodes.clear();
                stableMeshes.clear();
            },
        };
        reportProgress(options.onProgress, {
            phase: "complete",
            loaded: totalBytes,
            total: totalBytes,
            message: `Imported ${normalizedPrimaryPath} (${meshes.length} meshes, ${container.materials.length} materials, ${container.textures.length} textures)`,
        });
        return imported;
    } catch (error) {
        container?.dispose();
        if (error instanceof SceneAssetPipelineError) throw error;
        if (options.signal?.aborted) throw new SceneAssetPipelineError("CANCELLED", "Model import was cancelled", { cause: error });
        throw new SceneAssetPipelineError(
            "IMPORT_FAILED",
            `Unable to import "${normalizedPrimaryPath}": ${(error as Error).message}`,
            { cause: error },
        );
    }
}

function collectReferences(scene: WamGuiSceneDocument | null): Set<string> {
    return new Set(scene?.assets?.map(asset => asset.id) ?? []);
}

export function inspectSceneAssetDependencies(
    sceneInput: unknown,
    assets: readonly SceneAssetPayload[],
    limits: SceneAssetLimits = {},
): SceneAssetDependencySummary {
    const scene = sceneInput === null || sceneInput === undefined ? null : normalizeWamGuiScene(sceneInput);
    const maxAssetBytes = limits.maxAssetBytes ?? SCENE_ASSET_MAX_BYTES;
    const maxTotalBytes = limits.maxTotalBytes ?? SCENE_ASSET_MAX_TOTAL_BYTES;
    const maxAssetCount = limits.maxAssetCount ?? SCENE_ASSET_MAX_FILES;
    const references = collectReferences(scene);
    const assetIds = new Set<string>();
    const assetUris = new Set<string>();
    const issues: SceneAssetDependencyIssue[] = [];
    const files = assets.map(asset => {
        if (assetIds.has(asset.id)) throw new TypeError(`Duplicate asset ID "${asset.id}"`);
        if (assetUris.has(asset.uri)) throw new TypeError(`Duplicate asset URI "${asset.uri}"`);
        assetIds.add(asset.id);
        assetUris.add(asset.uri);
        const sizeBytes = asset.data instanceof Uint8Array ? asset.data.byteLength : asset.data.byteLength;
        const referenced = references.has(asset.id);
        return { id: asset.id, uri: asset.uri, mediaType: asset.media_type, sizeBytes, referenced };
    });
    const missing = [...references].filter(id => !assetIds.has(id));
    if (scene !== null) {
        const packagedById = new Map(files.map(file => [file.id, file]));
        for (const reference of scene.assets ?? []) {
            const packaged = packagedById.get(reference.id);
            if (packaged && (packaged.uri !== reference.uri || packaged.mediaType !== reference.media_type)) {
                if (!missing.includes(reference.id)) missing.push(reference.id);
                issues.push({
                    code: "missing",
                    assetId: reference.id,
                    uri: reference.uri,
                    mediaType: reference.media_type,
                    message: `Declared asset "${reference.id}" expects ${reference.media_type} at "${reference.uri}", but the package contains ${packaged.mediaType} at "${packaged.uri}"`,
                });
            }
        }
    }
    const unused = files.filter(file => !file.referenced).map(file => file.id);
    const oversized = files.filter(file => file.sizeBytes > maxAssetBytes).map(file => file.id);
    const unsupported = files.filter(file => {
        try {
            normalizeMediaType(file.mediaType, `Asset "${file.id}"`);
            return false;
        } catch {
            return true;
        }
    }).map(file => file.id);

    for (const id of missing) {
        issues.push({
            code: "missing",
            assetId: id,
            message: `Scene references missing asset "${id}"`,
        });
    }
    for (const id of unused) {
        const file = files.find(item => item.id === id)!;
        issues.push({
            code: "unused",
            assetId: id,
            uri: file.uri,
            message: `Asset "${file.uri}" is not referenced by the scene`,
        });
    }
    for (const id of oversized) {
        const file = files.find(item => item.id === id)!;
        issues.push({
            code: "oversized",
            assetId: id,
            uri: file.uri,
            sizeBytes: file.sizeBytes,
            message: `Asset "${file.uri}" is ${file.sizeBytes} bytes; limit is ${maxAssetBytes}`,
        });
    }
    for (const id of unsupported) {
        const file = files.find(item => item.id === id)!;
        issues.push({
            code: "unsupported",
            assetId: id,
            uri: file.uri,
            mediaType: file.mediaType,
            message: `Asset "${file.uri}" has unsupported media type "${file.mediaType}"`,
        });
    }
    const totalBytes = files.reduce((total, file) => total + file.sizeBytes, 0);
    if (totalBytes > maxTotalBytes) {
        issues.push({
            code: "oversized",
            sizeBytes: totalBytes,
            message: `Project assets total ${totalBytes} bytes; limit is ${maxTotalBytes}`,
        });
    }
    if (files.length > maxAssetCount) {
        issues.push({
            code: "oversized",
            message: `Project contains ${files.length} assets; limit is ${maxAssetCount}`,
        });
    }

    return {
        files,
        missing,
        unused,
        oversized,
        unsupported,
        issues,
        exportBlocked: missing.length > 0 || oversized.length > 0 || unsupported.length > 0 ||
            totalBytes > maxTotalBytes || files.length > maxAssetCount,
    };
}

function validatePackageDocument(value: unknown): ScenePackageDocument {
    if (!isRecord(value)) throw new SceneAssetPipelineError("PACKAGE_INVALID", "Portable project package must be a JSON object");
    if (value.format !== SCENE_PACKAGE_FORMAT || value.version !== SCENE_PACKAGE_VERSION) {
        throw new SceneAssetPipelineError(
            "PACKAGE_INVALID",
            `Unsupported project package format or version; expected ${SCENE_PACKAGE_FORMAT} version ${SCENE_PACKAGE_VERSION}`,
        );
    }
    if (!Array.isArray(value.assets)) throw new SceneAssetPipelineError("PACKAGE_INVALID", "Project package assets must be an array");
    const descriptor = requireDescriptorObject(value.descriptor);
    return {
        format: SCENE_PACKAGE_FORMAT,
        version: SCENE_PACKAGE_VERSION,
        descriptor,
        assets: value.assets as ScenePackageDocument["assets"],
    };
}

export async function exportSceneProjectPackage(
    descriptorInput: unknown,
    inputAssets: readonly SceneAssetPayload[],
    limits: SceneAssetLimits = {},
): Promise<string> {
    const descriptor = requireDescriptorObject(descriptorInput);
    const scene = descriptorScene(descriptor);
    if (!scene) throw new SceneAssetPipelineError("PACKAGE_INVALID", "Cannot package a descriptor without a scene document");

    const normalizedAssets = inputAssets.map(asset => ({
        ...asset,
        uri: normalizeBundlePath(asset.uri, `Asset "${asset.id}" URI`),
        media_type: asset.media_type,
        data: bytesOf(asset.data),
    }));
    const summary = inspectSceneAssetDependencies(scene, normalizedAssets, limits);
    if (summary.exportBlocked) {
        throw new SceneAssetPipelineError(
            "PACKAGE_INVALID",
            `Project export is blocked: ${summary.issues.filter(issue => issue.code !== "unused").map(issue => issue.message).join("; ")}`,
        );
    }
    const normalizedDescriptor = {
        ...descriptor,
        scene: normalizeWamGuiScene(scene),
    };
    const packageDocument: ScenePackageDocument = {
        format: SCENE_PACKAGE_FORMAT,
        version: SCENE_PACKAGE_VERSION,
        descriptor: normalizedDescriptor,
        assets: await Promise.all(normalizedAssets.map(async asset => {
            const bytes = asset.data as Uint8Array;
            return {
                id: asset.id,
                uri: asset.uri,
                media_type: normalizeMediaType(asset.media_type, `Asset "${asset.id}"`),
                size_bytes: bytes.byteLength,
                sha256: await sha256Hex(bytes),
                data_base64: encodeBase64(bytes),
            };
        })),
    };
    return JSON.stringify(packageDocument);
}

export async function importSceneProjectPackage(
    serializedPackage: string,
    limits: SceneAssetLimits = {},
): Promise<{ descriptor: Record<string, unknown>; assets: Array<ProjectAssetRecord & { data: Uint8Array }> }> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(serializedPackage);
    } catch (error) {
        throw new SceneAssetPipelineError("PACKAGE_INVALID", "Portable project package is not valid JSON", { cause: error });
    }
    const project = validatePackageDocument(parsed);
    const scene = descriptorScene(project.descriptor);
    if (!scene) throw new SceneAssetPipelineError("PACKAGE_INVALID", "Portable project has no scene document");
    const assets: Array<ProjectAssetRecord & { data: Uint8Array }> = [];
    const ids = new Set<string>();
    const uris = new Set<string>();
    let totalBytes = 0;
    for (const [index, rawAsset] of project.assets.entries()) {
        if (!isRecord(rawAsset)) throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset ${index} must be an object`);
        if (typeof rawAsset.id !== "string" || rawAsset.id.length === 0) {
            throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset ${index} has no stable ID`);
        }
        const id = rawAsset.id;
        if (ids.has(id)) throw new SceneAssetPipelineError("PACKAGE_INVALID", `Duplicate project asset ID "${id}"`);
        ids.add(id);
        if (typeof rawAsset.uri !== "string") throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset "${id}" has no URI`);
        const uri = normalizeBundlePath(rawAsset.uri, `Project asset "${id}" URI`);
        if (uris.has(uri)) throw new SceneAssetPipelineError("PACKAGE_INVALID", `Duplicate project asset URI "${uri}"`);
        uris.add(uri);
        const mediaType = normalizeMediaType(rawAsset.media_type, `Project asset "${id}"`);
        if (typeof rawAsset.data_base64 !== "string" || typeof rawAsset.size_bytes !== "number" || !Number.isInteger(rawAsset.size_bytes)) {
            throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset "${id}" has invalid size or data`);
        }
        if (rawAsset.data_base64.length > Math.ceil((limits.maxAssetBytes ?? SCENE_ASSET_MAX_BYTES) / 3) * 4) {
            throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset "${uri}" exceeds the per-file import limit`);
        }
        const data = decodeBase64(rawAsset.data_base64, `Project asset "${uri}" data`);
        if (data.byteLength !== rawAsset.size_bytes) {
            throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset "${uri}" byte length does not match size_bytes`);
        }
        if (data.byteLength > (limits.maxAssetBytes ?? SCENE_ASSET_MAX_BYTES)) {
            throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset "${uri}" exceeds the per-file import limit`);
        }
        if (typeof rawAsset.sha256 !== "string" || await sha256Hex(data) !== rawAsset.sha256) {
            throw new SceneAssetPipelineError("PACKAGE_INVALID", `Project asset integrity check failed for "${uri}"`);
        }
        totalBytes += data.byteLength;
        assets.push({
            id,
            uri,
            media_type: mediaType,
            size_bytes: data.byteLength,
            sha256: rawAsset.sha256 as string,
            data_base64: rawAsset.data_base64,
            data,
        });
    }
    if (totalBytes > (limits.maxTotalBytes ?? SCENE_ASSET_MAX_TOTAL_BYTES)) {
        throw new SceneAssetPipelineError("PACKAGE_INVALID", "Portable project exceeds the total asset size limit");
    }
    if (assets.length > (limits.maxAssetCount ?? SCENE_ASSET_MAX_FILES)) {
        throw new SceneAssetPipelineError("PACKAGE_INVALID", "Portable project contains too many assets");
    }
    const summary = inspectSceneAssetDependencies(scene, assets, limits);
    if (summary.missing.length > 0 || summary.oversized.length > 0 || summary.unsupported.length > 0) {
        throw new SceneAssetPipelineError(
            "PACKAGE_INVALID",
            `Portable project dependencies are invalid: ${summary.issues.map(issue => issue.message).join("; ")}`,
        );
    }
    return { descriptor: project.descriptor, assets };
}
