import { normalizeWamGuiScene, WAM_GUI_SCENE_FEATURE } from "./WamGuiScene.ts";
import type { WamGuiSceneDocument } from "./WamGuiScene.ts";

export const WAM_GUI_SCHEMA_VERSION = 2 as const

export const WAM_GUI_FEATURES = Object.freeze({
    designReference: "wam3dgenerator.editor.design-reference.v1",
    worldWidth: "wam3dgenerator.world-width.v1",
    faceTransform: "wam3dgenerator.face-transform.v1",
    sceneGraph: WAM_GUI_SCENE_FEATURE,
})

export interface DescriptorCompatibilityOptions {
    supportedRuntimeFeatures?: readonly string[]
    supportedEditorFeatures?: readonly string[]
}

export interface NormalizedWamGuiDescriptorCompatibility {
    schemaVersion: 1 | 2
    requiredFeatures: string[]
    editorFeatures: string[]
    unsupportedEditorFeatures: string[]
    designReference: {
        url: string
        opacity: number
        fit: "contain"
    } | null
    worldWidth: number | null
    faceTransform: {
        x: number
        y: number
        rotation_degrees: number
        scale: number
    }
    scene: WamGuiSceneDocument | null
    descriptor: Record<string, unknown>
}

const V2_FIELDS = [
    "required_features",
    "editor_features",
    "design_reference",
    "world_width",
    "face_transform",
    "scene",
] as const

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
    if (!isObject(value)) {
        throw new TypeError(`${name} must be an object`)
    }
    return value
}

function requireFiniteNumber(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`)
    }
    return value
}

function readFeatureList(value: unknown, name: string): string[] {
    if (value === undefined) return []
    if (!Array.isArray(value)) {
        throw new TypeError(`${name} must be an array of versioned feature identifiers`)
    }

    const features = value.map((feature, index) => {
        if (typeof feature !== "string" || !/^[a-z0-9][a-z0-9._:-]*\.v[1-9]\d*$/.test(feature)) {
            throw new TypeError(`${name}[${index}] must be a versioned feature identifier`)
        }
        return feature
    })

    if (new Set(features).size !== features.length) {
        throw new TypeError(`${name} must not contain duplicate feature identifiers`)
    }
    return features
}

function requireFeature(features: readonly string[], feature: string, field: string): void {
    if (!features.includes(feature)) {
        throw new TypeError(`${field} requires the "${feature}" feature declaration`)
    }
}

function readDesignReference(value: unknown): NormalizedWamGuiDescriptorCompatibility["designReference"] {
    if (value === undefined) return null
    const reference = requireObject(value, "design_reference")

    if (typeof reference.url !== "string" || reference.url.trim().length === 0) {
        throw new TypeError("design_reference.url must be a non-empty absolute URL")
    }
    try {
        new URL(reference.url)
    } catch {
        throw new TypeError("design_reference.url must be a non-empty absolute URL")
    }

    const opacity = reference.opacity === undefined
        ? 0.35
        : requireFiniteNumber(reference.opacity, "design_reference.opacity")
    if (opacity < 0 || opacity > 1) {
        throw new RangeError("design_reference.opacity must be between 0 and 1")
    }

    const fit = reference.fit ?? "contain"
    if (fit !== "contain") {
        throw new TypeError('design_reference.fit must be "contain"')
    }

    return { url: reference.url, opacity, fit }
}

function readFaceTransform(value: unknown): NormalizedWamGuiDescriptorCompatibility["faceTransform"] {
    const transform = value === undefined ? {} : requireObject(value, "face_transform")
    const x = transform.x === undefined ? 0 : requireFiniteNumber(transform.x, "face_transform.x")
    const y = transform.y === undefined ? 0 : requireFiniteNumber(transform.y, "face_transform.y")
    const rotation = transform.rotation_degrees === undefined
        ? 0
        : requireFiniteNumber(transform.rotation_degrees, "face_transform.rotation_degrees")
    const scale = transform.scale === undefined
        ? 1
        : requireFiniteNumber(transform.scale, "face_transform.scale")

    if (scale <= 0) {
        throw new RangeError("face_transform.scale must be greater than 0")
    }

    return { x, y, rotation_degrees: rotation, scale }
}

export function widgetFeatureId(widgetId: string): string {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(widgetId)) {
        throw new TypeError("widgetId must be a stable lowercase alphanumeric identifier")
    }
    return `wam3dgenerator.widget.${widgetId}.v1`
}

export function normalizeWamGuiDescriptorCompatibility(
    input: unknown,
    options: DescriptorCompatibilityOptions = {},
): NormalizedWamGuiDescriptorCompatibility {
    const descriptor = requireObject(input, "WAM GUI descriptor")
    const declaredVersion = descriptor.schema_version
    const schemaVersion = declaredVersion === undefined ? 1 : declaredVersion

    if (schemaVersion !== 1 && schemaVersion !== 2) {
        throw new RangeError(`Unsupported WAM GUI schema_version "${String(schemaVersion)}"; supported versions are 1 and 2`)
    }

    const hasV2Metadata = V2_FIELDS.some(field => Object.hasOwn(descriptor, field))
    if (schemaVersion === 1 && hasV2Metadata) {
        throw new TypeError("V2 descriptor fields require schema_version: 2")
    }

    const requiredFeatures = readFeatureList(descriptor.required_features, "required_features")
    const editorFeatures = readFeatureList(descriptor.editor_features, "editor_features")
    const designReference = readDesignReference(descriptor.design_reference)
    const worldWidth = descriptor.world_width === undefined
        ? null
        : requireFiniteNumber(descriptor.world_width, "world_width")
    if (worldWidth !== null && worldWidth <= 0) {
        throw new RangeError("world_width must be greater than 0")
    }
    const faceTransform = readFaceTransform(descriptor.face_transform)
    const scene = descriptor.scene === undefined ? null : normalizeWamGuiScene(descriptor.scene)
    if (scene !== null) {
        if (schemaVersion !== 2) throw new TypeError("scene requires schema_version: 2")
        requireFeature(requiredFeatures, WAM_GUI_FEATURES.sceneGraph, "scene")
    }

    if (designReference !== null) {
        requireFeature(editorFeatures, WAM_GUI_FEATURES.designReference, "design_reference")
    }
    if (worldWidth !== null) {
        requireFeature(requiredFeatures, WAM_GUI_FEATURES.worldWidth, "world_width")
    }
    if (Object.hasOwn(descriptor, "face_transform")) {
        requireFeature(requiredFeatures, WAM_GUI_FEATURES.faceTransform, "face_transform")
    }

    const supportedRuntimeFeatures = new Set(options.supportedRuntimeFeatures ?? [])
    const unsupportedRequiredFeatures = requiredFeatures.filter(feature => !supportedRuntimeFeatures.has(feature))
    if (unsupportedRequiredFeatures.length > 0) {
        throw new Error(
            `Unsupported required WAM GUI feature(s): ${unsupportedRequiredFeatures.join(", ")}. ` +
            "Update the runtime or open the project with a compatible wam3dgenerator build.",
        )
    }

    const supportedEditorFeatures = new Set(options.supportedEditorFeatures ?? [])
    const unsupportedEditorFeatures = editorFeatures.filter(feature => !supportedEditorFeatures.has(feature))

    return {
        schemaVersion,
        requiredFeatures,
        editorFeatures,
        unsupportedEditorFeatures,
        designReference,
        worldWidth,
        faceTransform,
        scene,
        descriptor: { ...descriptor },
    }
}

export function serializeWamGuiDescriptor(descriptor: Record<string, unknown>): string {
    const declaredRuntimeFeatures = readFeatureList(descriptor.required_features, "required_features")
    const declaredEditorFeatures = readFeatureList(descriptor.editor_features, "editor_features")
    normalizeWamGuiDescriptorCompatibility(descriptor, {
        supportedRuntimeFeatures: declaredRuntimeFeatures,
        supportedEditorFeatures: declaredEditorFeatures,
    })

    const serialized = JSON.stringify(descriptor)
    if (serialized === undefined) {
        throw new TypeError("WAM GUI descriptor could not be serialized")
    }
    return serialized
}
