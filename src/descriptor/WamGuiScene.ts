export const WAM_GUI_SCENE_SCHEMA_VERSION = 1 as const;
export const WAM_GUI_SCENE_COORDINATE_SYSTEM = "wam3d-editor-lh-y-up-meter-v1" as const;
export const WAM_GUI_SCENE_TRANSFORM_CONVENTION = "wam3dgenerator.trs-rz-ry-rx-radians.v1" as const;
export const WAM_GUI_SCENE_FEATURE = "wam3dgenerator.scene-graph.v1" as const;

export type SceneVector3 = [number, number, number];

export interface SceneTransform {
    position: SceneVector3;
    rotation: SceneVector3;
    scale: SceneVector3;
    [optionalProperty: string]: unknown;
}

export interface SceneAsset {
    id: string;
    uri: string;
    media_type: "model/gltf-binary" | "model/gltf+json" | "application/octet-stream" | "image/png" | "image/jpeg" | "image/webp";
    [optionalProperty: string]: unknown;
}

export interface SceneAssetReference {
    asset_id: string;
    node?: string;
    mesh?: string;
    [optionalProperty: string]: unknown;
}

export interface SceneMaterial {
    id: string;
    name?: string;
    base_color?: [number, number, number, number];
    metallic?: number;
    roughness?: number;
    emissive_color?: [number, number, number];
    normal_scale?: number;
    occlusion_strength?: number;
    alpha_mode?: "opaque" | "mask" | "blend";
    alpha_cutoff?: number;
    double_sided?: boolean;
    textures?: SceneMaterialTextures;
    [optionalProperty: string]: unknown;
}

export interface SceneTextureReference {
    asset_id: string;
    color_space: "srgb" | "linear";
    uv_set?: number;
    offset?: [number, number];
    scale?: [number, number];
    rotation?: number;
    wrap_u?: "clamp" | "repeat" | "mirror";
    wrap_v?: "clamp" | "repeat" | "mirror";
    filtering?: "nearest" | "linear" | "trilinear";
    [optionalProperty: string]: unknown;
}

export interface SceneMaterialTextures {
    base_color?: SceneTextureReference;
    metallic_roughness?: SceneTextureReference;
    normal?: SceneTextureReference;
    occlusion?: SceneTextureReference;
    emissive?: SceneTextureReference;
    alpha?: SceneTextureReference;
    [optionalProperty: string]: unknown;
}

export interface SceneMaterialReference {
    material_id: string;
    [optionalProperty: string]: unknown;
}

export interface SceneParameterMapping {
    minimum: number;
    maximum: number;
    step: number;
    default?: number;
    exponent?: number;
    inverted?: boolean;
    clamp?: "clamp" | "reject";
    [optionalProperty: string]: unknown;
}

export interface SceneComponentBinding {
    endpoint_id: string;
    endpoint_type: "parameter" | "event";
    label?: string;
    mapping?: SceneParameterMapping;
    [optionalProperty: string]: unknown;
}

interface SceneNodeBase {
    id: string;
    name: string;
    kind: "imported_mesh" | "primitive" | "group" | "interactive" | "visual";
    parent: string | null;
    transform: SceneTransform;
    pivot: SceneVector3;
    visible: boolean;
    locked: boolean;
    material_refs?: SceneMaterialReference[];
    [optionalProperty: string]: unknown;
}

export interface SceneImportedMeshNode extends SceneNodeBase {
    kind: "imported_mesh";
    asset: SceneAssetReference;
}

export type ScenePrimitiveType = "box" | "cylinder" | "sphere" | "plane" | "rounded" | "lathed";

export interface ScenePrimitiveNode extends SceneNodeBase {
    kind: "primitive";
    geometry: ScenePrimitiveGeometry;
}

export interface SceneGroupNode extends SceneNodeBase {
    kind: "group";
}

export type SceneInteractionBehavior = "rotary" | "slider" | "toggle" | "momentary" | "multi_position" | "display";

export interface ScenePrimitiveGeometry {
    type: ScenePrimitiveType;
    parameters: Record<string, number>;
    [optionalProperty: string]: unknown;
}

export interface SceneInteraction {
    behavior: SceneInteractionBehavior;
    pivot: SceneVector3;
    axis: SceneVector3;
    binding?: SceneComponentBinding;
    [optionalProperty: string]: unknown;
}

export interface SceneInteractiveNode extends SceneNodeBase {
    kind: "interactive";
    asset?: SceneAssetReference;
    interaction: SceneInteraction;
}

export interface SceneVisualNode extends SceneNodeBase {
    kind: "visual";
    visual_type: "mesh" | "text" | "decal";
    text?: string;
    font_family?: string;
    font_size?: number;
    decal_asset?: SceneAssetReference;
    size?: [number, number];
    asset?: SceneAssetReference;
}

export type SceneNode =
    | SceneImportedMeshNode
    | ScenePrimitiveNode
    | SceneGroupNode
    | SceneInteractiveNode
    | SceneVisualNode;

export interface WamGuiSceneDocument {
    schema_version: typeof WAM_GUI_SCENE_SCHEMA_VERSION;
    coordinate_system: typeof WAM_GUI_SCENE_COORDINATE_SYSTEM;
    transform_convention: typeof WAM_GUI_SCENE_TRANSFORM_CONVENTION;
    nodes: SceneNode[];
    assets?: SceneAsset[];
    materials?: SceneMaterial[];
    [optionalProperty: string]: unknown;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MEDIA_TYPES = new Set<SceneAsset["media_type"]>([
    "model/gltf-binary",
    "model/gltf+json",
    "application/octet-stream",
    "image/png",
    "image/jpeg",
    "image/webp",
]);
const PRIMITIVE_TYPES = new Set<ScenePrimitiveType>(["box", "cylinder", "sphere", "plane", "rounded", "lathed"]);
const INTERACTION_BEHAVIORS = new Set<SceneInteractionBehavior>([
    "rotary",
    "slider",
    "toggle",
    "momentary",
    "multi_position",
    "display",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
    if (!isRecord(value)) throw new TypeError(`${name} must be an object`);
    return value;
}

function requireString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new TypeError(`${name} must be a non-empty string`);
    }
    return value;
}

function requireId(value: unknown, name: string): string {
    const id = requireString(value, name);
    if (!ID_PATTERN.test(id)) throw new TypeError(`${name} must be a stable ID of at most 128 characters`);
    return id;
}

function requireFinite(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
    }
    return value;
}

function readVector(value: unknown, name: string, fallback: SceneVector3): SceneVector3 {
    if (value === undefined) return [...fallback];
    if (!Array.isArray(value) || value.length !== 3) {
        throw new TypeError(`${name} must be an array of exactly 3 finite numbers`);
    }
    return value.map((component, index) => requireFinite(component, `${name}[${index}]`)) as SceneVector3;
}

function readTuple(value: unknown, name: string, length: number, fallback: number[]): number[] {
    if (value === undefined) return [...fallback];
    if (!Array.isArray(value) || value.length !== length) {
        throw new TypeError(`${name} must be an array of exactly ${length} finite numbers`);
    }
    return value.map((component, index) => requireFinite(component, `${name}[${index}]`));
}

function readTransform(value: unknown, name: string): SceneTransform {
    const transform = value === undefined ? {} : requireRecord(value, name);
    const position = readVector(transform.position, `${name}.position`, [0, 0, 0]);
    const rotation = readVector(transform.rotation, `${name}.rotation`, [0, 0, 0]);
    const scale = readVector(transform.scale, `${name}.scale`, [1, 1, 1]);
    if (scale.some(component => component === 0)) {
        throw new RangeError(`${name}.scale components must not be zero`);
    }
    return { ...structuredClone(transform), position, rotation, scale };
}

function readAssetUri(value: unknown, name: string): string {
    const uri = requireString(value, name);
    let decodedUri: string;
    try {
        decodedUri = decodeURIComponent(uri);
    } catch (error) {
        throw new TypeError(`${name} contains invalid URI encoding`, { cause: error });
    }
    if (
        uri.startsWith("/") ||
        uri.includes("\\") ||
        uri.includes("?") ||
        uri.includes("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(uri) ||
        decodedUri.startsWith("/") ||
        decodedUri.includes("\\") ||
        decodedUri.includes("?") ||
        decodedUri.includes("#") ||
        decodedUri.split("/").some(part => part === "" || part === "." || part === "..")
    ) {
        throw new TypeError(`${name} must be a project-relative asset URI without traversal or URL components`);
    }
    return uri;
}

function readAsset(value: unknown, index: number): SceneAsset {
    const source = requireRecord(value, `scene.assets[${index}]`);
    const id = requireId(source.id, `scene.assets[${index}].id`);
    const uri = readAssetUri(source.uri, `scene.assets[${index}].uri`);
    if (typeof source.media_type !== "string" || !MEDIA_TYPES.has(source.media_type as SceneAsset["media_type"])) {
        throw new TypeError(`scene.assets[${index}].media_type is unsupported`);
    }
    return { ...structuredClone(source), id, uri, media_type: source.media_type as SceneAsset["media_type"] };
}

function readTextureReference(value: unknown, name: string, assetIds: Set<string>): SceneTextureReference {
    const source = requireRecord(value, name);
    const assetId = requireId(source.asset_id, `${name}.asset_id`);
    if (!assetIds.has(assetId)) throw new TypeError(`${name}.asset_id "${assetId}" does not reference a declared scene asset`);
    const colorSpace = source.color_space ?? "srgb";
    if (colorSpace !== "srgb" && colorSpace !== "linear") throw new TypeError(`${name}.color_space must be "srgb" or "linear"`);
    const uvSet = source.uv_set === undefined ? undefined : requireFinite(source.uv_set, `${name}.uv_set`);
    if (uvSet !== undefined && (!Number.isInteger(uvSet) || uvSet < 0)) throw new RangeError(`${name}.uv_set must be a non-negative integer`);
    const offset = source.offset === undefined ? undefined : readTuple(source.offset, `${name}.offset`, 2, [0, 0]) as [number, number];
    const scale = source.scale === undefined ? undefined : readTuple(source.scale, `${name}.scale`, 2, [1, 1]) as [number, number];
    const rotation = source.rotation === undefined ? undefined : requireFinite(source.rotation, `${name}.rotation`);
    const wrap = (value: unknown, label: string): "clamp" | "repeat" | "mirror" => {
        const result = value ?? "repeat";
        if (result !== "clamp" && result !== "repeat" && result !== "mirror") throw new TypeError(`${label} must be "clamp", "repeat", or "mirror"`);
        return result;
    };
    const filtering = source.filtering ?? "linear";
    if (filtering !== "nearest" && filtering !== "linear" && filtering !== "trilinear") throw new TypeError(`${name}.filtering is unsupported`);
    return {
        ...structuredClone(source),
        asset_id: assetId,
        color_space: colorSpace,
        ...(uvSet === undefined ? {} : { uv_set: uvSet }),
        ...(offset === undefined ? {} : { offset }),
        ...(scale === undefined ? {} : { scale }),
        ...(rotation === undefined ? {} : { rotation }),
        wrap_u: wrap(source.wrap_u, `${name}.wrap_u`),
        wrap_v: wrap(source.wrap_v, `${name}.wrap_v`),
        filtering,
    };
}

function readMaterial(value: unknown, index: number, assetIds: Set<string>): SceneMaterial {
    const source = requireRecord(value, `scene.materials[${index}]`);
    const id = requireId(source.id, `scene.materials[${index}].id`);
    const name = source.name === undefined ? undefined : requireString(source.name, `scene.materials[${index}].name`);
    const baseColor = source.base_color === undefined ? undefined : readTuple(source.base_color, `scene.materials[${index}].base_color`, 4, [1, 1, 1, 1]);
    if (baseColor?.some(value => value < 0 || value > 1)) throw new RangeError(`scene.materials[${index}].base_color values must be between 0 and 1`);
    const emissiveColor = source.emissive_color === undefined ? undefined : readTuple(source.emissive_color, `scene.materials[${index}].emissive_color`, 3, [0, 0, 0]);
    if (emissiveColor?.some(value => value < 0 || value > 1)) throw new RangeError(`scene.materials[${index}].emissive_color values must be between 0 and 1`);
    const bounded = (key: string): number | undefined => {
        if (source[key] === undefined) return undefined;
        const result = requireFinite(source[key], `scene.materials[${index}].${key}`);
        if (result < 0 || result > 1) throw new RangeError(`scene.materials[${index}].${key} must be between 0 and 1`);
        return result;
    };
    const metallic = bounded("metallic");
    const roughness = bounded("roughness");
    const alphaCutoff = bounded("alpha_cutoff");
    const normalScale = bounded("normal_scale");
    const occlusionStrength = bounded("occlusion_strength");
    const alphaMode = source.alpha_mode ?? "opaque";
    if (alphaMode !== "opaque" && alphaMode !== "mask" && alphaMode !== "blend") throw new TypeError(`scene.materials[${index}].alpha_mode is unsupported`);
    if (source.double_sided !== undefined && typeof source.double_sided !== "boolean") throw new TypeError(`scene.materials[${index}].double_sided must be a boolean`);
    const textures = source.textures === undefined ? undefined : requireRecord(source.textures, `scene.materials[${index}].textures`);
    const normalizedTextures = textures === undefined ? undefined : Object.fromEntries(
        ["base_color", "metallic_roughness", "normal", "occlusion", "emissive", "alpha"]
            .filter(key => textures[key] !== undefined)
            .map(key => [key, readTextureReference(textures[key], `scene.materials[${index}].textures.${key}`, assetIds)]),
    ) as SceneMaterialTextures;
    return {
        ...structuredClone(source),
        id,
        ...(name === undefined ? {} : { name }),
        ...(baseColor === undefined ? {} : { base_color: baseColor as [number, number, number, number] }),
        ...(metallic === undefined ? {} : { metallic }),
        ...(roughness === undefined ? {} : { roughness }),
        ...(emissiveColor === undefined ? {} : { emissive_color: emissiveColor as [number, number, number] }),
        ...(normalScale === undefined ? {} : { normal_scale: normalScale }),
        ...(occlusionStrength === undefined ? {} : { occlusion_strength: occlusionStrength }),
        ...(alphaMode === "opaque" ? {} : { alpha_mode: alphaMode }),
        ...(alphaCutoff === undefined ? {} : { alpha_cutoff: alphaCutoff }),
        ...(source.double_sided === undefined ? {} : { double_sided: source.double_sided }),
        ...(normalizedTextures === undefined ? {} : { textures: normalizedTextures }),
    };
}

function readAssetReference(value: unknown, name: string, assetIds: Set<string>): SceneAssetReference {
    const source = requireRecord(value, name);
    const assetId = requireId(source.asset_id, `${name}.asset_id`);
    if (!assetIds.has(assetId)) throw new TypeError(`${name}.asset_id "${assetId}" does not reference a declared scene asset`);
    const node = source.node === undefined ? undefined : requireString(source.node, `${name}.node`);
    const mesh = source.mesh === undefined ? undefined : requireString(source.mesh, `${name}.mesh`);
    return { ...structuredClone(source), asset_id: assetId, ...(node === undefined ? {} : { node }), ...(mesh === undefined ? {} : { mesh }) };
}

function readMaterialReferences(value: unknown, name: string, materialIds: Set<string>): SceneMaterialReference[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array of material references`);
    const ids = value.map((item, index) => {
        const reference = requireRecord(item, `${name}[${index}]`);
        return requireId(reference.material_id, `${name}[${index}].material_id`);
    });
    if (new Set(ids).size !== ids.length) throw new TypeError(`${name} must not contain duplicate material IDs`);
    for (const id of ids) {
        if (!materialIds.has(id)) throw new TypeError(`${name} references undeclared material "${id}"`);
    }
    return ids.map((material_id, index) => ({
        ...structuredClone(value[index]),
        material_id,
    }));
}

function readMapping(value: unknown, name: string): SceneParameterMapping {
    const mapping = requireRecord(value, name);
    const minimum = requireFinite(mapping.minimum, `${name}.minimum`);
    const maximum = requireFinite(mapping.maximum, `${name}.maximum`);
    const step = requireFinite(mapping.step, `${name}.step`);
    if (maximum <= minimum) throw new RangeError(`${name}.maximum must be greater than minimum`);
    if (step < 0) throw new RangeError(`${name}.step must not be negative`);
    const defaultValue = mapping.default === undefined ? undefined : requireFinite(mapping.default, `${name}.default`);
    if (defaultValue !== undefined && (defaultValue < minimum || defaultValue > maximum)) {
        throw new RangeError(`${name}.default must be within the mapping range`);
    }
    const exponent = mapping.exponent === undefined ? undefined : requireFinite(mapping.exponent, `${name}.exponent`);
    if (exponent !== undefined && exponent <= 0) throw new RangeError(`${name}.exponent must be greater than 0`);
    if (mapping.inverted !== undefined && typeof mapping.inverted !== "boolean") {
        throw new TypeError(`${name}.inverted must be a boolean`);
    }
    const clamp = mapping.clamp ?? "clamp";
    if (clamp !== "clamp" && clamp !== "reject") throw new TypeError(`${name}.clamp must be "clamp" or "reject"`);
    return {
        ...structuredClone(mapping),
        minimum,
        maximum,
        step,
        ...(defaultValue === undefined ? {} : { default: defaultValue }),
        ...(exponent === undefined ? {} : { exponent }),
        ...(mapping.inverted === undefined ? {} : { inverted: mapping.inverted }),
        clamp,
    };
}

function readBinding(value: unknown, name: string): SceneComponentBinding {
    const binding = requireRecord(value, name);
    const endpointId = requireId(binding.endpoint_id, `${name}.endpoint_id`);
    const endpointType = binding.endpoint_type;
    if (endpointType !== "parameter" && endpointType !== "event") {
        throw new TypeError(`${name}.endpoint_type must be "parameter" or "event"`);
    }
    const label = binding.label === undefined ? undefined : requireString(binding.label, `${name}.label`);
    if (endpointType === "parameter" && binding.mapping === undefined) {
        throw new TypeError(`${name}.mapping is required for parameter endpoints`);
    }
    if (endpointType === "event" && binding.mapping !== undefined) {
        throw new TypeError(`${name}.mapping is not valid for event endpoints`);
    }
    return {
        ...structuredClone(binding),
        endpoint_id: endpointId,
        endpoint_type: endpointType,
        ...(label === undefined ? {} : { label }),
        ...(binding.mapping === undefined ? {} : { mapping: readMapping(binding.mapping, `${name}.mapping`) }),
    };
}

function readNode(
    value: unknown,
    index: number,
    assetIds: Set<string>,
    materialIds: Set<string>,
): SceneNode {
    const source = requireRecord(value, `scene.nodes[${index}]`);
    const id = requireId(source.id, `scene.nodes[${index}].id`);
    const name = requireString(source.name, `scene.nodes[${index}].name`);
    const parentValue = source.parent === undefined ? null : source.parent;
    const parent = parentValue === null ? null : requireId(parentValue, `scene.nodes[${index}].parent`);
    const transform = readTransform(source.transform, `scene.nodes[${index}].transform`);
    const pivot = readVector(source.pivot, `scene.nodes[${index}].pivot`, [0, 0, 0]);
    const visible = source.visible ?? true;
    const locked = source.locked ?? false;
    if (typeof visible !== "boolean") throw new TypeError(`scene.nodes[${index}].visible must be a boolean`);
    if (typeof locked !== "boolean") throw new TypeError(`scene.nodes[${index}].locked must be a boolean`);
    const materialReferences = readMaterialReferences(source.material_refs, `scene.nodes[${index}].material_refs`, materialIds);
    const base = {
        ...structuredClone(source),
        id,
        name,
        parent,
        transform,
        pivot,
        visible,
        locked,
        ...(materialReferences === undefined ? {} : { material_refs: materialReferences }),
    };

    switch (source.kind) {
        case "group":
            return { ...base, kind: "group" } as SceneGroupNode;
        case "imported_mesh":
            return {
                ...base,
                kind: "imported_mesh",
                asset: readAssetReference(source.asset, `scene.nodes[${index}].asset`, assetIds),
            } as SceneImportedMeshNode;
        case "primitive": {
            const geometry = requireRecord(source.geometry, `scene.nodes[${index}].geometry`);
            if (typeof geometry.type !== "string" || !PRIMITIVE_TYPES.has(geometry.type as ScenePrimitiveType)) {
                throw new TypeError(`scene.nodes[${index}].geometry.type is unsupported`);
            }
            const parameters = geometry.parameters === undefined
                ? {}
                : requireRecord(geometry.parameters, `scene.nodes[${index}].geometry.parameters`);
            const primitiveParameters: Record<string, number> = {};
            for (const [parameter, rawValue] of Object.entries(parameters)) {
                if (!/^[a-z][a-z0-9_]*$/.test(parameter)) throw new TypeError(`Invalid primitive parameter name "${parameter}"`);
                const parameterValue = requireFinite(rawValue, `scene.nodes[${index}].geometry.parameters.${parameter}`);
                if (parameterValue <= 0) {
                    throw new RangeError(`scene.nodes[${index}].geometry.parameters.${parameter} must be greater than 0`);
                }
                primitiveParameters[parameter] = parameterValue;
            }
            for (const parameter of ["segments", "tessellation"]) {
                const parameterValue = primitiveParameters[parameter];
                if (parameterValue !== undefined && (!Number.isInteger(parameterValue) || parameterValue < 3)) {
                    throw new RangeError(`scene.nodes[${index}].geometry.parameters.${parameter} must be an integer of at least 3`);
                }
            }
            if (geometry.type === "rounded") {
                const width = primitiveParameters.width ?? 1;
                const height = primitiveParameters.height ?? 1;
                const depth = primitiveParameters.depth ?? 1;
                const radius = primitiveParameters.radius ?? 0.1;
                if (radius > Math.min(width, height, depth) / 2) {
                    throw new RangeError(`scene.nodes[${index}].geometry.parameters.radius must not exceed half the smallest dimension`);
                }
            }
            return {
                ...base,
                kind: "primitive",
                geometry: { ...structuredClone(geometry), type: geometry.type as ScenePrimitiveType, parameters: primitiveParameters },
            } as ScenePrimitiveNode;
        }
        case "interactive": {
            const interaction = requireRecord(source.interaction, `scene.nodes[${index}].interaction`);
            if (typeof interaction.behavior !== "string" || !INTERACTION_BEHAVIORS.has(interaction.behavior as SceneInteractionBehavior)) {
                throw new TypeError(`scene.nodes[${index}].interaction.behavior is unsupported`);
            }
            const pivot = readVector(interaction.pivot, `scene.nodes[${index}].interaction.pivot`, [0, 0, 0]);
            const axis = readVector(interaction.axis, `scene.nodes[${index}].interaction.axis`, [0, 1, 0]);
            if (axis.every(component => component === 0)) throw new RangeError(`scene.nodes[${index}].interaction.axis must not be zero`);
            return {
                ...base,
                kind: "interactive",
                ...(source.asset === undefined ? {} : { asset: readAssetReference(source.asset, `scene.nodes[${index}].asset`, assetIds) }),
                interaction: {
                    ...structuredClone(interaction),
                    behavior: interaction.behavior as SceneInteractionBehavior,
                    pivot,
                    axis,
                    ...(interaction.binding === undefined ? {} : { binding: readBinding(interaction.binding, `scene.nodes[${index}].interaction.binding`) }),
                },
            } as SceneInteractiveNode;
        }
        case "visual": {
            const visualType = source.visual_type ?? "mesh";
            if (visualType !== "mesh" && visualType !== "text" && visualType !== "decal") {
                throw new TypeError(`scene.nodes[${index}].visual_type is unsupported`);
            }
            const text = source.text === undefined ? undefined : requireString(source.text, `scene.nodes[${index}].text`);
            const fontFamily = source.font_family === undefined ? undefined : requireString(source.font_family, `scene.nodes[${index}].font_family`);
            const fontSize = source.font_size === undefined ? undefined : requireFinite(source.font_size, `scene.nodes[${index}].font_size`);
            if (fontSize !== undefined && fontSize <= 0) throw new RangeError(`scene.nodes[${index}].font_size must be greater than 0`);
            const size = source.size === undefined ? undefined : readTuple(source.size, `scene.nodes[${index}].size`, 2, [1, 1]) as [number, number];
            if (size?.some(value => value <= 0)) throw new RangeError(`scene.nodes[${index}].size values must be greater than 0`);
            const decalAsset = source.decal_asset === undefined
                ? undefined
                : readAssetReference(source.decal_asset, `scene.nodes[${index}].decal_asset`, assetIds);
            return {
                ...base,
                kind: "visual",
                visual_type: visualType,
                ...(text === undefined ? {} : { text }),
                ...(fontFamily === undefined ? {} : { font_family: fontFamily }),
                ...(fontSize === undefined ? {} : { font_size: fontSize }),
                ...(size === undefined ? {} : { size }),
                ...(decalAsset === undefined ? {} : { decal_asset: decalAsset }),
                ...(source.asset === undefined ? {} : { asset: readAssetReference(source.asset, `scene.nodes[${index}].asset`, assetIds) }),
            } as SceneVisualNode;
        }
        default:
            throw new TypeError(`scene.nodes[${index}].kind is unsupported`);
    }
}

function validateHierarchy(nodes: readonly SceneNode[]): void {
    const ids = new Set(nodes.map(node => node.id));
    for (const node of nodes) {
        if (node.parent !== null && !ids.has(node.parent)) {
            throw new TypeError(`Scene node "${node.id}" references missing parent "${node.parent}"`);
        }
        if (node.parent === node.id) throw new TypeError(`Scene node "${node.id}" cannot parent itself`);
    }

    const parents = new Map(nodes.map(node => [node.id, node.parent]));
    const visited = new Set<string>();
    for (const node of nodes) {
        const path = new Set<string>();
        let current: string | null = node.id;
        while (current !== null && !visited.has(current)) {
            if (path.has(current)) throw new TypeError(`Scene hierarchy contains a parent cycle at node "${current}"`);
            path.add(current);
            current = parents.get(current) ?? null;
        }
        for (const id of path) visited.add(id);
    }
}

export function normalizeWamGuiScene(input: unknown): WamGuiSceneDocument {
    const source = requireRecord(input, "scene");
    if (source.schema_version !== WAM_GUI_SCENE_SCHEMA_VERSION) {
        throw new RangeError(`Unsupported scene schema_version "${String(source.schema_version)}"; supported version is 1`);
    }
    if (source.coordinate_system !== WAM_GUI_SCENE_COORDINATE_SYSTEM) {
        throw new TypeError(`Unsupported scene coordinate_system "${String(source.coordinate_system)}"`);
    }
    if (source.transform_convention !== WAM_GUI_SCENE_TRANSFORM_CONVENTION) {
        throw new TypeError(`Unsupported scene transform_convention "${String(source.transform_convention)}"`);
    }
    if (!Array.isArray(source.nodes)) throw new TypeError("scene.nodes must be an array");

    const assets = source.assets === undefined
        ? []
        : Array.isArray(source.assets)
            ? source.assets.map(readAsset)
            : (() => { throw new TypeError("scene.assets must be an array"); })();
    const assetIds = new Set(assets.map(asset => asset.id));
    const materials = source.materials === undefined
        ? []
        : Array.isArray(source.materials)
            ? source.materials.map((material, index) => readMaterial(material, index, assetIds))
            : (() => { throw new TypeError("scene.materials must be an array"); })();
    const materialIds = new Set(materials.map(material => material.id));
    if (assetIds.size !== assets.length) throw new TypeError("scene.assets must not contain duplicate IDs");
    if (materialIds.size !== materials.length) throw new TypeError("scene.materials must not contain duplicate IDs");

    const nodes = source.nodes.map((node, index) => readNode(node, index, assetIds, materialIds));
    if (new Set(nodes.map(node => node.id)).size !== nodes.length) throw new TypeError("scene.nodes must not contain duplicate IDs");
    validateHierarchy(nodes);

    return {
        ...structuredClone(source),
        schema_version: WAM_GUI_SCENE_SCHEMA_VERSION,
        coordinate_system: WAM_GUI_SCENE_COORDINATE_SYSTEM,
        transform_convention: WAM_GUI_SCENE_TRANSFORM_CONVENTION,
        nodes,
        ...(source.assets === undefined ? {} : { assets }),
        ...(source.materials === undefined ? {} : { materials }),
    } as WamGuiSceneDocument;
}
