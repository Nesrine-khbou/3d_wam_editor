import type { WamGUIGenerator } from "../WamGUIGenerator.ts";
import type { GroupPanelPartInitParameters } from "dockview-core";
import type { WamGui3DPane } from "./WamGui3DPane.ts";
import { html } from "../utils/doc.ts";
import {
    DEFAULT_SCENE_SNAP_SETTINGS,
    SceneDocumentEditor,
    type SceneSnapSettings,
    type SceneTransformKind,
    type SceneTransformSpace,
} from "../scene/SceneDocumentEditor.ts";
import type { SceneAsset, SceneMaterial, SceneMaterialTextures, SceneNode, ScenePrimitiveType, SceneTextureReference, SceneVector3, WamGuiSceneDocument } from "../descriptor/WamGuiScene.ts";
import type { SceneMaterialAssetSource } from "../scene/SceneMaterialRenderer.ts";

interface SceneEditHistory {
    begin(label: string): void;
    commit(): void;
    cancel(): void;
}

type SceneCommandRunner = <R>(label: string, operation: () => R | Promise<R>) => Promise<R>;

export class SceneHierarchyPane {
    readonly element = html.a`<div class="scene-hierarchy"></div>`;
    private readonly generator: WamGUIGenerator;
    private readonly viewport: WamGui3DPane;
    private readonly history: SceneEditHistory;
    private readonly runHistoryCommand: SceneCommandRunner;
    private readonly editor: SceneDocumentEditor;
    private readonly unsubscribe: () => void;
    private selectedId: string | null = null;
    private transformKind: SceneTransformKind = "position";
    private transformSpace: SceneTransformSpace = "local";
    private primitiveType: ScenePrimitiveType = "box";
    private snapSettings: SceneSnapSettings = structuredClone(DEFAULT_SCENE_SNAP_SETTINGS);
    private feedback = "";
    private inspectorScrollTop = 0;
    private treeScrollTop = 0;
    private paneScrollTop = 0;
    private readonly materialAssets = new Map<string, SceneMaterialAssetSource>();
    private treeSize = 35;

    constructor(
        generator: WamGUIGenerator,
        viewport: WamGui3DPane,
        history: SceneEditHistory,
        runHistoryCommand: SceneCommandRunner,
    ) {
        this.generator = generator;
        this.viewport = viewport;
        this.history = history;
        this.runHistoryCommand = runHistoryCommand;
        this.editor = new SceneDocumentEditor({
            read: () => this.generator.scene_document.value,
            write: document => { this.generator.scene_document.value = document; },
        });
        this.unsubscribe = generator.scene_document.link(() => this.render());
        this.viewport.setSceneSnapSettings(this.snapSettings);
    }

    dispose(): void {
        this.unsubscribe();
    }

    init(_: GroupPanelPartInitParameters): void {}

    private render(): void {
        const scrollTop = this.element.scrollTop || this.paneScrollTop;
        const treeScrollTop = this.element.querySelector<HTMLElement>(".scene-hierarchy__tree")?.scrollTop || this.treeScrollTop;
        const inspectorScrollTop = this.element.querySelector<HTMLElement>(".scene-hierarchy__inspector")?.scrollTop || this.inspectorScrollTop;
        const activeLabel = document.activeElement instanceof HTMLElement
            ? document.activeElement.getAttribute("aria-label")
            : null;
        const sceneDocument = this.generator.scene_document.value;
        this.element.replaceChildren();
        const toolbar = html.a`<div class="scene-hierarchy__toolbar"></div>`;
        this.element.appendChild(toolbar);
        const status = html.a`<output class="scene-hierarchy__status" aria-live="polite"></output>`;
        status.textContent = this.feedback;
        this.element.appendChild(status);
        const assemblyButton = this.addButton(toolbar, "Create Assembly", () => this.command("Create scene assembly", () => {
            this.selectedId = this.editor.group(this.editor.selection);
            this.render();
        }), !sceneDocument || this.editor.selection.length === 0);
        assemblyButton.title = "Group selected nodes into a reusable assembly; duplicate the group to reuse it";
        this.addButton(toolbar, "Ungroup", () => this.command("Ungroup scene node", () => {
            if (this.selectedId) this.editor.ungroup(this.selectedId);
            this.selectedId = null;
            this.render();
        }), !sceneDocument || sceneDocument.nodes.find(node => node.id === this.selectedId)?.kind !== "group");
        this.addButton(toolbar, "Duplicate", () => this.command("Duplicate scene nodes", () => {
            this.editor.duplicate(this.editor.selection);
            this.selectedId = this.editor.selection[0] ?? null;
            this.render();
        }), !sceneDocument || this.editor.selection.length === 0);
        this.addButton(toolbar, "Delete", () => this.command("Delete scene nodes", () => {
            this.editor.delete(this.editor.selection);
            this.selectedId = null;
            this.render();
        }), !sceneDocument || this.editor.selection.length === 0);
        const createScene = this.addButton(toolbar, "Create scene", () => this.command("Create 3D scene", () => {
            this.editor.createScene();
            this.render();
        }), sceneDocument !== null);
        createScene.title = "Start a new empty 3D scene document";
        const primitiveControls = html.a`<div class="scene-hierarchy__controls"></div>`;
        const viewHint = html.a`<p class="scene-hierarchy__help"></p>`;
        viewHint.textContent = "3D primitives appear in the 3D preview. The 2D view is reserved for WAM controls.";
        primitiveControls.appendChild(viewHint);
        this.addSelect(primitiveControls, "Primitive", ["box", "cylinder", "sphere", "plane", "rounded", "lathed"], this.primitiveType, value => {
            this.primitiveType = value as ScenePrimitiveType;
        });
        this.addButton(primitiveControls, "Add primitive", () => this.command(`Add ${this.primitiveType}`, () => {
            this.selectedId = this.editor.addPrimitive(this.primitiveType, this.selectedGroupId(sceneDocument));
            this.editor.select([this.selectedId]);
            this.render();
            this.viewport.fitScene();
        }), !sceneDocument);
        this.addButton(primitiveControls, "Add text", () => this.command("Add text visual", () => {
            this.selectedId = this.editor.addTextVisual(this.selectedGroupId(sceneDocument));
            this.editor.select([this.selectedId]);
            this.render();
            this.viewport.fitScene();
        }), !sceneDocument);
        const imageInput = document.createElement("input");
        imageInput.type = "file";
        imageInput.accept = "image/png,image/jpeg,image/webp";
        imageInput.multiple = true;
        imageInput.hidden = true;
        imageInput.addEventListener("change", () => {
            void this.importImages(imageInput.files);
            imageInput.value = "";
        });
        const importImages = this.addButton(primitiveControls, "Import images", () => imageInput.click(), !sceneDocument);
        importImages.title = "Import PNG, JPEG, or WebP files for material texture maps";
        primitiveControls.appendChild(imageInput);
        this.element.appendChild(primitiveControls);

        const modeControls = html.a`<div class="scene-hierarchy__controls"></div>`;
        this.element.appendChild(modeControls);
        this.addSelect(modeControls, "Gizmo", ["position", "rotation", "scale"], this.transformKind, value => {
            this.transformKind = value as SceneTransformKind;
            this.viewport.setSceneTransformMode(this.transformKind, this.transformSpace);
        });
        this.addSelect(modeControls, "Space", ["local", "world"], this.transformSpace, value => {
            this.transformSpace = value as SceneTransformSpace;
            this.viewport.setSceneTransformMode(this.transformKind, this.transformSpace);
            this.render();
        });

        const snapping = html.a`<fieldset class="scene-hierarchy__snapping"><legend>Snapping</legend></fieldset>`;
        this.element.appendChild(snapping);
        for (const [key, title] of [
            ["translation", "Position"],
            ["rotation", "Rotation"],
            ["scale", "Scale"],
        ] as const) {
            const row = html.a`<label class="scene-hierarchy__snap-row"></label>`;
            const enabled = document.createElement("input");
            enabled.type = "checkbox";
            enabled.checked = this.snapSettings[key].enabled;
            enabled.addEventListener("change", () => {
                this.snapSettings[key].enabled = enabled.checked;
                this.viewport.setSceneSnapSettings(this.snapSettings);
            });
            row.append(enabled, document.createTextNode(title));
            const increment = document.createElement("input");
            increment.type = "number";
            increment.min = "0.000001";
            increment.step = "any";
            increment.value = String(this.snapSettings[key].increment);
            increment.setAttribute("aria-label", `${title} snap increment`);
            increment.addEventListener("change", () => {
                const next = Number(increment.value);
                if (!Number.isFinite(next) || next <= 0) {
                    increment.value = String(this.snapSettings[key].increment);
                    return;
                }
                this.snapSettings[key].increment = next;
                this.viewport.setSceneSnapSettings(this.snapSettings);
            });
            row.appendChild(increment);
            snapping.appendChild(row);
        }

        const viewportActions = html.a`<div class="scene-hierarchy__controls"></div>`;
        this.element.appendChild(viewportActions);
        this.addButton(viewportActions, "Focus selected", () => {
            if (this.selectedId) this.viewport.focusSceneNode(this.selectedId);
        }, !this.selectedId);
        this.addButton(viewportActions, "Fit scene", () => this.viewport.fitScene(), !sceneDocument || sceneDocument.nodes.length === 0);

        if (!sceneDocument) {
            const empty = html.a`<p class="scene-hierarchy__empty"></p>`;
            empty.textContent = "No 3D scene is loaded. Create one here or load a descriptor, then add a primitive to begin.";
            this.element.appendChild(empty);
            this.viewport.setSceneDocument(null, null, () => {}, () => {});
            return;
        }

        const tree = html.a`<div class="scene-hierarchy__tree" role="tree" aria-label="3D scene hierarchy"></div>`;
        this.element.appendChild(tree);
        tree.style.flexBasis = `${this.treeSize}%`;
        tree.style.maxHeight = `${this.treeSize}%`;
        const splitter = html.a`<div class="scene-hierarchy__splitter" role="separator" aria-label="Resize hierarchy and inspector" tabindex="0"></div>`;
        this.element.appendChild(splitter);
        this.enableSplitter(splitter, tree);
        const children = new Map<string | null, SceneNode[]>();
        for (const node of sceneDocument.nodes) {
            const group = children.get(node.parent) ?? [];
            group.push(node);
            children.set(node.parent, group);
        }
        const appendChildren = (parent: string | null, depth: number): void => {
            for (const node of children.get(parent) ?? []) {
                const row = html.a`<div class="scene-hierarchy__node" role="treeitem"></div>`;
                row.style.paddingInlineStart = `${depth * 16 + 4}px`;
                row.setAttribute("aria-selected", String(node.id === this.selectedId));
                const select = html.a`<button type="button" class="scene-hierarchy__node-select"></button>`;
                select.textContent = `${node.visible ? "" : "◌ "}${node.locked ? "🔒 " : ""}${node.name}`;
                select.title = `${node.kind}: ${node.name}`;
                select.addEventListener("click", event => {
                    const additive = event.ctrlKey || event.metaKey;
                    const selection = additive
                        ? this.editor.selection.includes(node.id)
                            ? this.editor.selection.filter(id => id !== node.id)
                            : [...this.editor.selection, node.id]
                        : [node.id];
                    this.editor.select(selection);
                    this.selectedId = selection.includes(node.id) ? node.id : selection.at(-1) ?? null;
                    this.render();
                });
                row.appendChild(select);
                const visibility = this.addButton(row, node.visible ? "Hide" : "Show", () => {
                    this.command(node.visible ? "Hide scene node" : "Show scene node", () =>
                        this.editor.setVisibility(node.id, !node.visible));
                }, false);
                visibility.setAttribute("aria-label", `${node.visible ? "Hide" : "Show"} ${node.name}`);
                const lock = this.addButton(row, node.locked ? "Unlock" : "Lock", () => {
                    this.command(node.locked ? "Unlock scene node" : "Lock scene node", () =>
                        this.editor.setLocked(node.id, !node.locked));
                }, false);
                lock.setAttribute("aria-label", `${node.locked ? "Unlock" : "Lock"} ${node.name}`);
                tree.appendChild(row);
                appendChildren(node.id, depth + 1);
            }
        };
        appendChildren(null, 0);

        const selected = sceneDocument.nodes.find(node => node.id === this.selectedId) ?? null;
        if (selected) this.renderInspector(selected, sceneDocument.nodes);
        this.viewport.setSceneDocument(sceneDocument, this.selectedId, () => {
            this.history.begin("Transform scene node");
        }, (nodeId, transform) => {
            try {
                this.editor.setTransform(nodeId, transform, this.transformSpace, this.snapSettings);
                this.history.commit();
            } catch (error) {
                this.history.cancel();
                console.error("Unable to apply scene gizmo transform", error);
                this.render();
            }
        });
        this.viewport.setSceneTransformMode(this.transformKind, this.transformSpace);
        this.viewport.setSceneSnapSettings(this.snapSettings);
        this.viewport.setSceneMaterialAssets(this.materialAssets);
        const restoreScroll = (): void => {
            if (activeLabel) {
                const replacement = [...this.element.querySelectorAll<HTMLElement>("[aria-label]")]
                    .find(element => element.getAttribute("aria-label") === activeLabel);
                replacement?.focus({ preventScroll: true });
            }

            this.element.scrollTop = scrollTop;
            this.element.querySelector<HTMLElement>(".scene-hierarchy__tree")?.scrollTo({ top: treeScrollTop });
            this.element.querySelector<HTMLElement>(".scene-hierarchy__inspector")?.scrollTo({ top: inspectorScrollTop });
            this.paneScrollTop = scrollTop;
            this.treeScrollTop = treeScrollTop;
            this.inspectorScrollTop = inspectorScrollTop;
        };
        restoreScroll();
        requestAnimationFrame(restoreScroll);
        window.setTimeout(restoreScroll, 0);
        window.setTimeout(restoreScroll, 50);
    }

    private enableSplitter(splitter: HTMLElement, tree: HTMLElement): void {
        const update = (clientY: number): void => {
            const bounds = this.element.getBoundingClientRect();
            this.treeSize = Math.max(15, Math.min(70, ((clientY - bounds.top) / bounds.height) * 100));
            tree.style.flexBasis = `${this.treeSize}%`;
            tree.style.maxHeight = `${this.treeSize}%`;
        };
        splitter.addEventListener("pointerdown", event => {
            splitter.setPointerCapture(event.pointerId);
            const move = (moveEvent: PointerEvent): void => update(moveEvent.clientY);
            const stop = (): void => {
                splitter.removeEventListener("pointermove", move);
                splitter.removeEventListener("pointerup", stop);
            };
            splitter.addEventListener("pointermove", move);
            splitter.addEventListener("pointerup", stop);
        });
        splitter.addEventListener("keydown", event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            this.treeSize += event.key === "ArrowDown" ? 5 : -5;
            this.treeSize = Math.max(15, Math.min(70, this.treeSize));
            tree.style.flexBasis = `${this.treeSize}%`;
            tree.style.maxHeight = `${this.treeSize}%`;
        });
    }

    private async importImages(files: FileList | null): Promise<void> {
        if (!files || files.length === 0) return;
        try {
            for (const file of [...files]) {
                const id = `image-${crypto.randomUUID()}`;
                const uri = `textures/${file.name.replaceAll("\\", "_").replaceAll("/", "_")}`;
                const mediaType = file.type as SceneAsset["media_type"];
                const bytes = new Uint8Array(await file.arrayBuffer());
                const asset: SceneAsset = { id, uri, media_type: mediaType };
                this.materialAssets.set(id, { bytes, mediaType });
                await this.runHistoryCommand(`Import image ${file.name}`, () => this.editor.addAsset(asset));
            }
            this.viewport.setSceneMaterialAssets(this.materialAssets);
            this.feedback = `${files.length} image asset(s) imported. Select one in a material texture map.`;
            this.render();
        } catch (error) {
            this.feedback = `Import images failed: ${error instanceof Error ? error.message : String(error)}`;
            console.error("Unable to import scene images", error);
            this.render();
        }
    }

    private renderInspector(node: SceneNode, nodes: SceneNode[]): void {
        const inspector = html.a`<section class="scene-hierarchy__inspector"></section>`;
        const heading = html.a`<h3></h3>`;
        heading.textContent = `Selected: ${node.name}`;
        inspector.appendChild(heading);
        const name = document.createElement("input");
        name.type = "text";
        name.value = node.name;
        name.setAttribute("aria-label", "Scene node name");
        name.addEventListener("change", () => this.command("Rename scene node", () => this.editor.rename(node.id, name.value)));
        inspector.appendChild(this.labeled("Name", name));

        const parent = document.createElement("select");
        const root = document.createElement("option");
        root.value = "";
        root.textContent = "Root";
        parent.appendChild(root);
        for (const candidate of nodes.filter(candidate => candidate.kind === "group" && candidate.id !== node.id)) {
            const option = document.createElement("option");
            option.value = candidate.id;
            option.textContent = candidate.name;
            parent.appendChild(option);
        }
        parent.value = node.parent ?? "";
        parent.setAttribute("aria-label", "Scene node parent");
        parent.addEventListener("change", () => this.command("Reparent scene node", () =>
            this.editor.reparent(node.id, parent.value || null)));
        inspector.appendChild(this.labeled("Parent", parent));

        this.renderVectorInput(inspector, "Position", "position", node.transform.position, node.id);
        this.renderVectorInput(inspector, "Rotation (rad)", "rotation", node.transform.rotation, node.id);
        this.renderVectorInput(inspector, "Scale", "scale", node.transform.scale, node.id);
        this.renderVectorInput(inspector, "Pivot", "pivot", node.pivot, node.id);
        if (node.kind === "visual" && node.visual_type === "text") {
            const text = document.createElement("input");
            text.type = "text";
            text.value = node.text ?? "";
            text.setAttribute("aria-label", "Visual text");
            text.addEventListener("change", () => this.command("Edit visual text", () =>
                this.editor.setVisualText(node.id, text.value)));
            inspector.appendChild(this.labeled("Text", text));
        }
        if (node.kind === "primitive") {
            const geometryHeading = html.a`<h3>Primitive geometry</h3>`;
            inspector.appendChild(geometryHeading);
            const geometryLabel = html.a`<p class="scene-hierarchy__help"></p>`;
            geometryLabel.textContent = `${node.geometry.type} dimensions are stored in scene units.`;
            inspector.appendChild(geometryLabel);
            for (const [parameter, value] of Object.entries(node.geometry.parameters)) {
                const controls = html.a`<div class="scene-hierarchy__parameter"></div>`;
                const numeric = document.createElement("input");
                numeric.type = "number";
                numeric.step = ["segments", "tessellation"].includes(parameter) ? "1" : "0.01";
                numeric.min = ["segments", "tessellation"].includes(parameter) ? "3" : "0.01";
                numeric.value = String(value);
                numeric.setAttribute("aria-label", `Primitive ${parameter}`);
                const slider = document.createElement("input");
                slider.type = "range";
                slider.min = numeric.min;
                slider.step = numeric.step;
                slider.value = String(value);
                slider.setAttribute("aria-label", `Primitive ${parameter} slider`);
                slider.title = "Drag to adjust; release to apply the change";
                const radiusLimit = parameter === "radius" && node.geometry.type === "rounded"
                    ? Math.min(
                        node.geometry.parameters.width ?? 1,
                        node.geometry.parameters.height ?? 1,
                        node.geometry.parameters.depth ?? 1,
                    ) / 2
                    : null;
                const sliderMaximum = radiusLimit ?? Math.max(value * 4, value + 1);
                slider.max = String(Math.max(Number(slider.min), sliderMaximum));
                slider.addEventListener("input", () => {
                    numeric.value = slider.value;
                });
                const commitParameter = (rawValue: string): void => {
                    const nextValue = Number(rawValue);
                    if (
                        !Number.isFinite(nextValue)
                        || nextValue <= 0
                        || (["segments", "tessellation"].includes(parameter) && (!Number.isInteger(nextValue) || nextValue < 3))
                        || (radiusLimit !== null && nextValue > radiusLimit)
                    ) {
                        numeric.value = String(value);
                        slider.value = String(value);
                        return;
                    }
                    numeric.value = String(nextValue);
                    slider.value = String(nextValue);
                    const nextParameters = { ...node.geometry.parameters, [parameter]: nextValue };
                    this.command("Edit primitive geometry", () =>
                        this.editor.setPrimitiveParameters(node.id, nextParameters));
                };
                numeric.addEventListener("change", () => commitParameter(numeric.value));
                slider.addEventListener("change", () => commitParameter(slider.value));
                controls.append(numeric, slider);
                inspector.appendChild(this.labeled(parameter.replaceAll("_", " "), controls));
            }
        }
        this.renderMaterialInspector(inspector, node, this.generator.scene_document.value?.materials ?? []);
        this.element.appendChild(inspector);
    }

    private renderMaterialInspector(inspector: HTMLElement, node: SceneNode, materials: SceneMaterial[]): void {
        const heading = html.a`<h3>Material</h3>`;
        inspector.appendChild(heading);
        const selectedId = node.material_refs?.[0]?.material_id ?? "";
        const materialSelect = document.createElement("select");
        materialSelect.setAttribute("aria-label", "Scene node material");
        const none = document.createElement("option");
        none.value = "";
        none.textContent = "Default";
        materialSelect.appendChild(none);
        for (const material of materials) {
            const option = document.createElement("option");
            option.value = material.id;
            option.textContent = material.name ?? material.id;
            materialSelect.appendChild(option);
        }
        materialSelect.value = selectedId;
        materialSelect.addEventListener("change", () => this.command("Assign scene material", () =>
            this.editor.assignMaterial(node.id, materialSelect.value || null)));
        inspector.appendChild(this.labeled("Material", materialSelect));
        const create = this.addButton(inspector, "Create material", () => this.command("Create scene material", () => {
            const id = this.editor.createMaterial(`${node.name} material`);
            this.editor.assignMaterial(node.id, id);
        }), false);
        create.title = "Create a serializable PBR material and assign it to this node";
        const material = materials.find(candidate => candidate.id === selectedId);
        if (!material) {
            const help = html.a`<p class="scene-hierarchy__help"></p>`;
            help.textContent = "Choose Create material to enable PBR controls. Texture selectors remain None until image assets are imported into this scene.";
            inspector.appendChild(help);
            return;
        }
        this.renderMaterialValue(inspector, material, "Metallic", "metallic", material.metallic ?? 0);
        this.renderMaterialValue(inspector, material, "Roughness", "roughness", material.roughness ?? 0.5);
        const color = document.createElement("input");
        color.type = "color";
        color.value = SceneHierarchyPane.colorToHex(material.base_color ?? [1, 1, 1, 1]);
        color.setAttribute("aria-label", "Material base color");
        color.addEventListener("change", () => this.command("Edit material base color", () =>
            this.editor.setMaterial(material.id, { base_color: SceneHierarchyPane.hexToColor(color.value, material.base_color?.[3] ?? 1) })));
        inspector.appendChild(this.labeled("Base color", color));
        const alphaMode = document.createElement("select");
        for (const mode of ["opaque", "mask", "blend"] as const) {
            const option = document.createElement("option");
            option.value = mode;
            option.textContent = mode[0].toUpperCase() + mode.slice(1);
            alphaMode.appendChild(option);
        }
        alphaMode.value = material.alpha_mode ?? "opaque";
        alphaMode.setAttribute("aria-label", "Material alpha mode");
        alphaMode.addEventListener("change", () => this.command("Edit material alpha mode", () =>
            this.editor.setMaterial(material.id, { alpha_mode: alphaMode.value as "opaque" | "mask" | "blend" })));
        inspector.appendChild(this.labeled("Alpha mode", alphaMode));
        this.renderMaterialTextures(inspector, material);
    }

    private renderMaterialTextures(inspector: HTMLElement, material: SceneMaterial): void {
        const help = html.a`<p class="scene-hierarchy__help"></p>`;
        help.textContent = "Texture maps are optional image assets. None means this material uses its numeric/color value instead.";
        inspector.appendChild(help);
        const assets = (this.generator.scene_document.value?.assets ?? [])
            .filter(asset => ["image/png", "image/jpeg", "image/webp"].includes(asset.media_type));
        const textures = material.textures ?? {};
        for (const key of ["base_color", "metallic_roughness", "normal", "occlusion", "emissive", "alpha"] as const) {
            const select = document.createElement("select");
            const none = document.createElement("option");
            none.value = "";
            none.textContent = "None";
            select.appendChild(none);
            for (const asset of assets) {
                const option = document.createElement("option");
                option.value = asset.id;
                option.textContent = asset.uri;
                select.appendChild(option);
            }
            select.value = textures[key]?.asset_id ?? "";
            select.setAttribute("aria-label", `Material ${key.replace("_", " ")} texture`);
            select.addEventListener("change", () => {
                const nextTextures: SceneMaterialTextures = { ...textures };
                if (!select.value) delete nextTextures[key];
                else {
                    const previous = textures[key];
                    nextTextures[key] = previous ?? {
                        asset_id: select.value,
                        color_space: key === "base_color" || key === "emissive" || key === "alpha" ? "srgb" : "linear",
                        wrap_u: "repeat",
                        wrap_v: "repeat",
                        filtering: "linear",
                    };
                    nextTextures[key] = { ...nextTextures[key], asset_id: select.value };
                }
                this.command(`Set ${key} texture`, () => this.editor.setMaterial(material.id, { textures: nextTextures }));
            });
            const labels: Record<typeof key, string> = {
                base_color: "Base color map",
                metallic_roughness: "Metallic/roughness map",
                normal: "Normal map",
                occlusion: "Occlusion map",
                emissive: "Emissive map",
                alpha: "Alpha map",
            };
            inspector.appendChild(this.labeled(labels[key], select));
            const selectedTexture = textures[key];
            if (selectedTexture) this.renderTextureSettings(inspector, material, key, selectedTexture);
        }
    }

    private renderTextureSettings(
        inspector: HTMLElement,
        material: SceneMaterial,
        key: keyof SceneMaterialTextures,
        texture: SceneTextureReference,
    ): void {
        const colorSpace = document.createElement("select");
        for (const value of ["srgb", "linear"] as const) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            colorSpace.appendChild(option);
        }
        colorSpace.value = texture.color_space;
        colorSpace.setAttribute("aria-label", `${key} texture color space`);
        colorSpace.addEventListener("change", () => this.command(`Set ${key} color space`, () =>
            this.editor.setMaterial(material.id, {
                textures: {
                    ...material.textures,
                    [key]: { ...texture, color_space: colorSpace.value as "srgb" | "linear" },
                },
            })));
        inspector.appendChild(this.labeled(`${key} color space`, colorSpace));
    }

    private renderMaterialValue(
        inspector: HTMLElement,
        material: SceneMaterial,
        label: string,
        key: "metallic" | "roughness",
        value: number,
    ): void {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.max = "1";
        input.step = "0.01";
        input.value = String(value);
        input.setAttribute("aria-label", `Material ${label.toLowerCase()}`);
        input.addEventListener("change", () => {
            const next = Number(input.value);
            if (!Number.isFinite(next) || next < 0 || next > 1) {
                input.value = String(value);
                return;
            }
            void this.command(`Edit material ${key}`, () => this.editor.setMaterial(material.id, { [key]: next }));
        });
        inspector.appendChild(this.labeled(label, input));
    }

    private static colorToHex(color: [number, number, number, number]): string {
        return `#${color.slice(0, 3).map(component => Math.round(component * 255).toString(16).padStart(2, "0")).join("")}`;
    }

    private static hexToColor(value: string, alpha: number): [number, number, number, number] {
        const numeric = Number.parseInt(value.slice(1), 16);
        return [(numeric >> 16 & 255) / 255, (numeric >> 8 & 255) / 255, (numeric & 255) / 255, alpha];
    }

    private selectedGroupId(sceneDocument: WamGuiSceneDocument | null): string | null {
        if (!sceneDocument || !this.selectedId) return null;
        const selected = sceneDocument.nodes.find(node => node.id === this.selectedId);
        if (selected?.kind === "group") return selected.id;
        const parent = sceneDocument.nodes.find(node => node.id === selected?.parent);
        return parent?.kind === "group" ? parent.id : null;
    }

    private renderVectorInput(
        container: HTMLElement,
        label: string,
        kind: SceneTransformKind | "pivot",
        values: SceneVector3,
        nodeId: string,
    ): void {
        const controls = html.a`<div class="scene-hierarchy__vector"></div>`;
        const caption = html.a`<span></span>`;
        caption.textContent = label;
        controls.appendChild(caption);
        const inputs: HTMLInputElement[] = [];
        for (let index = 0; index < 3; index++) {
            const input = document.createElement("input");
            input.type = "number";
            input.step = "any";
            input.value = String(values[index]);
            input.setAttribute("aria-label", `${label} ${["X", "Y", "Z"][index]}`);
            inputs.push(input);
            controls.appendChild(input);
        }
        const commit = (): void => {
            const value = inputs.map(input => Number(input.value)) as SceneVector3;
            if (value.some(component => !Number.isFinite(component))) return;
            if (kind === "pivot") {
                this.command("Edit scene node pivot", () => this.editor.setPivot(nodeId, value));
            } else {
                this.command(`Set scene node ${kind}`, () =>
                    this.editor.setTransformComponent(nodeId, kind, value, this.transformSpace, this.snapSettings));
            }
        };
        for (const input of inputs) input.addEventListener("change", commit);
        container.appendChild(this.labeled(label, controls));
    }

    private labeled(label: string, control: HTMLElement): HTMLElement {
        const row = html.a`<label class="scene-hierarchy__field"></label>`;
        const caption = html.a`<span></span>`;
        caption.textContent = label;
        row.append(caption, control);
        return row;
    }

    private addSelect(
        container: HTMLElement,
        label: string,
        options: string[],
        value: string,
        onChange: (value: string) => void,
    ): void {
        const select = document.createElement("select");
        for (const optionName of options) {
            const option = document.createElement("option");
            option.value = optionName;
            option.textContent = optionName[0].toUpperCase() + optionName.slice(1);
            select.appendChild(option);
        }
        select.value = value;
        select.setAttribute("aria-label", label);
        select.addEventListener("change", () => onChange(select.value));
        container.appendChild(this.labeled(label, select));
    }

    private addButton(
        container: HTMLElement,
        label: string,
        action: () => void,
        disabled: boolean,
    ): HTMLButtonElement {
        const button = html.a`<button type="button"></button>` as HTMLButtonElement;
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener("click", action);
        container.appendChild(button);
        return button;
    }

    private command(label: string, operation: () => void): void {
        void this.runHistoryCommand(label, operation).catch(error => {
            this.feedback = `${label} failed: ${error instanceof Error ? error.message : String(error)}`;
            console.error(`Unable to ${label.toLowerCase()}`, error);
            this.render();
        });
    }
}
