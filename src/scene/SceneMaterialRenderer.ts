import {
    Color3,
    Constants,
    PBRMaterial,
    Scene,
    Texture,
} from "@babylonjs/core";
import type { SceneAsset, SceneMaterial, SceneTextureReference } from "../descriptor/WamGuiScene.ts";

export interface SceneMaterialAssetSource {
    bytes: ArrayBuffer | Uint8Array;
    mediaType: string;
}

export type SceneMaterialAssets = ReadonlyMap<string, SceneMaterialAssetSource>;

function dataUri(asset: SceneAsset, source: SceneMaterialAssetSource): string {
    const bytes = source.bytes instanceof Uint8Array ? source.bytes : new Uint8Array(source.bytes);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
    }
    return `data:${source.mediaType};base64,${btoa(binary)}`;
}

function texture(
    scene: Scene,
    material: SceneMaterial,
    reference: SceneTextureReference,
    assets: SceneMaterialAssets,
    label: string,
): Texture {
    const asset = assets.get(reference.asset_id);
    if (!asset) throw new RangeError(`Material "${material.id}" ${label} texture references missing asset "${reference.asset_id}"`);
    const loaded = new Texture(dataUri({ id: reference.asset_id, uri: reference.asset_id, media_type: asset.mediaType as SceneAsset["media_type"] }, asset), scene, false, false);
    loaded.name = `${material.id}:${label}`;
    loaded.uOffset = reference.offset?.[0] ?? 0;
    loaded.vOffset = reference.offset?.[1] ?? 0;
    loaded.uScale = reference.scale?.[0] ?? 1;
    loaded.vScale = reference.scale?.[1] ?? 1;
    loaded.uAng = reference.rotation ?? 0;
    loaded.wrapU = reference.wrap_u === "clamp" ? Constants.TEXTURE_CLAMP_ADDRESSMODE
        : reference.wrap_u === "mirror" ? Constants.TEXTURE_MIRROR_ADDRESSMODE : Constants.TEXTURE_WRAP_ADDRESSMODE;
    loaded.wrapV = reference.wrap_v === "clamp" ? Constants.TEXTURE_CLAMP_ADDRESSMODE
        : reference.wrap_v === "mirror" ? Constants.TEXTURE_MIRROR_ADDRESSMODE : Constants.TEXTURE_WRAP_ADDRESSMODE;
    loaded.updateSamplingMode(reference.filtering === "nearest"
        ? Constants.TEXTURE_NEAREST_SAMPLINGMODE
        : reference.filtering === "trilinear"
            ? Constants.TEXTURE_TRILINEAR_SAMPLINGMODE
            : Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    loaded.gammaSpace = reference.color_space === "srgb";
    return loaded;
}

export function createSceneMaterial(
    scene: Scene,
    material: SceneMaterial,
    assets: SceneMaterialAssets = new Map(),
): PBRMaterial {
    const result = new PBRMaterial(material.id, scene);
    const base = material.base_color ?? [1, 1, 1, 1];
    result.albedoColor = new Color3(base[0], base[1], base[2]);
    result.alpha = base[3];
    result.metallic = material.metallic ?? 0;
    result.roughness = material.roughness ?? 0.5;
    const emissive = material.emissive_color ?? [0, 0, 0];
    result.emissiveColor = new Color3(emissive[0], emissive[1], emissive[2]);
    result.backFaceCulling = material.double_sided !== true;
    result.alphaCutOff = material.alpha_cutoff ?? 0.5;
    if (material.alpha_mode === "blend") result.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    if (material.alpha_mode === "mask") result.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    const textures = material.textures;
    if (textures?.base_color) result.albedoTexture = texture(scene, material, textures.base_color, assets, "base_color");
    if (textures?.metallic_roughness) result.metallicTexture = texture(scene, material, textures.metallic_roughness, assets, "metallic_roughness");
    if (textures?.normal) result.bumpTexture = texture(scene, material, textures.normal, assets, "normal");
    if (textures?.occlusion) result.ambientTexture = texture(scene, material, textures.occlusion, assets, "occlusion");
    if (textures?.emissive) result.emissiveTexture = texture(scene, material, textures.emissive, assets, "emissive");
    if (textures?.alpha) result.opacityTexture = texture(scene, material, textures.alpha, assets, "alpha");
    return result;
}

export function applySceneMaterial(
    target: PBRMaterial,
    material: SceneMaterial,
    assets: SceneMaterialAssets = new Map(),
): void {
    const replacement = createSceneMaterial(target.getScene(), material, assets);
    target.albedoColor = replacement.albedoColor;
    target.alpha = replacement.alpha;
    target.metallic = replacement.metallic;
    target.roughness = replacement.roughness;
    target.emissiveColor = replacement.emissiveColor;
    target.backFaceCulling = replacement.backFaceCulling;
    target.alphaCutOff = replacement.alphaCutOff;
    target.transparencyMode = replacement.transparencyMode;
    target.albedoTexture = replacement.albedoTexture;
    target.metallicTexture = replacement.metallicTexture;
    target.bumpTexture = replacement.bumpTexture;
    target.ambientTexture = replacement.ambientTexture;
    target.emissiveTexture = replacement.emissiveTexture;
    target.opacityTexture = replacement.opacityTexture;
    replacement.dispose(false, true);
}
