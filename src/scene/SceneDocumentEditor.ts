import { Matrix, Quaternion, Vector3 } from "@babylonjs/core";
import { normalizeWamGuiScene } from "../descriptor/WamGuiScene.ts";
import type { SceneNode, SceneTransform, SceneVector3, WamGuiSceneDocument } from "../descriptor/WamGuiScene.ts";

export type SceneTransformSpace = "local" | "world";
export type SceneTransformKind = "position" | "rotation" | "scale";

export interface SceneSnapSettings {
    translation: { enabled: boolean; increment: number };
    rotation: { enabled: boolean; increment: number };
    scale: { enabled: boolean; increment: number };
}

export const DEFAULT_SCENE_SNAP_SETTINGS: SceneSnapSettings = Object.freeze({
    translation: { enabled: false, increment: 0.1 },
    rotation: { enabled: false, increment: Math.PI / 12 },
    scale: { enabled: false, increment: 0.1 },
});

export interface SceneDocumentEditorOptions {
    read: () => WamGuiSceneDocument | null;
    write: (document: WamGuiSceneDocument) => void;
    createId?: () => string;
}

function vector(values: SceneVector3): Vector3 {
    return new Vector3(values[0], values[1], values[2]);
}

function tuple(value: Vector3): SceneVector3 {
    return [value.x, value.y, value.z];
}

function matrixFromTransform(transform: SceneTransform): Matrix {
    const position = vector(transform.position);
    const rotation = vector(transform.rotation);
    const scale = vector(transform.scale);
    const quaternion = Quaternion.RotationYawPitchRoll(rotation.y, rotation.x, rotation.z);
    return Matrix.Compose(scale, quaternion, position);
}

function transformFromMatrix(matrix: Matrix): SceneTransform {
    const scale = Vector3.One();
    const rotation = Quaternion.Identity();
    const position = Vector3.Zero();
    if (!matrix.decompose(scale, rotation, position)) {
        throw new RangeError("World transform cannot be represented as position, rotation, and scale");
    }
    return {
        position: tuple(position),
        rotation: tuple(rotation.toEulerAngles()),
        scale: tuple(scale),
    };
}

function roundToIncrement(value: number, increment: number): number {
    return Math.round(value / increment) * increment;
}

function validateIncrement(increment: number, name: string): void {
    if (!Number.isFinite(increment) || increment <= 0) {
        throw new RangeError(`${name} snap increment must be finite and greater than 0`);
    }
}

function deepClone<T>(value: T): T {
    return structuredClone(value);
}

export class SceneDocumentEditor {
    private readonly read: SceneDocumentEditorOptions["read"];
    private readonly write: SceneDocumentEditorOptions["write"];
    private readonly createId: () => string;
    private selectedIds: string[] = [];

    constructor(options: SceneDocumentEditorOptions) {
        this.read = options.read;
        this.write = options.write;
        this.createId = options.createId ?? (() => crypto.randomUUID());
    }

    get document(): WamGuiSceneDocument | null {
        const document = this.read();
        return document === null ? null : deepClone(document);
    }

    get selection(): readonly string[] {
        return [...this.selectedIds];
    }

    select(nodeIds: readonly string[]): void {
        const document = this.requireDocument();
        const nodeIdsSet = new Set(nodeIds);
        if (nodeIdsSet.size !== nodeIds.length) throw new TypeError("Scene selection must not contain duplicate node IDs");
        for (const id of nodeIds) this.requireNode(document, id);
        this.selectedIds = [...nodeIds];
    }

    rename(nodeId: string, name: string): void {
        if (typeof name !== "string" || name.trim().length === 0) throw new TypeError("Scene node name must not be empty");
        this.update(document => {
            const node = this.requireNode(document, nodeId);
            node.name = name.trim();
        });
    }

    setVisibility(nodeId: string, visible: boolean): void {
        if (typeof visible !== "boolean") throw new TypeError("Visibility must be a boolean");
        this.update(document => { this.requireNode(document, nodeId).visible = visible; });
    }

    setLocked(nodeId: string, locked: boolean): void {
        if (typeof locked !== "boolean") throw new TypeError("Lock state must be a boolean");
        this.update(document => { this.requireNode(document, nodeId).locked = locked; });
    }

    setPivot(nodeId: string, pivot: SceneVector3): void {
        this.update(document => {
            const node = this.requireNode(document, nodeId);
            this.assertUnlocked(document, node);
            node.pivot = this.validateVector(pivot, `Node "${nodeId}" pivot`);
        });
    }

    setTransform(
        nodeId: string,
        transform: SceneTransform,
        space: SceneTransformSpace = "local",
        snap: SceneSnapSettings = DEFAULT_SCENE_SNAP_SETTINGS,
    ): void {
        this.update(document => {
            const node = this.requireNode(document, nodeId);
            this.assertUnlocked(document, node);
            const validated = this.validateTransform(transform, nodeId);
            if (space === "local") {
                node.transform = this.snapTransform(validated, snap);
            } else {
                const snappedWorld = this.snapTransform(validated, snap);
                node.transform = this.worldToLocal(document, node, snappedWorld);
            }
        });
    }

    setTransformComponent(
        nodeId: string,
        kind: SceneTransformKind,
        value: SceneVector3,
        space: SceneTransformSpace = "local",
        snap: SceneSnapSettings = DEFAULT_SCENE_SNAP_SETTINGS,
    ): void {
        const document = this.requireDocument();
        const node = this.requireNode(document, nodeId);
        const current = space === "local" ? deepClone(node.transform) : transformFromMatrix(this.worldMatrix(document, nodeId));
        const next = { ...current, [kind]: this.validateVector(value, `${kind} transform`) };
        this.setTransform(nodeId, next, space, snap);
    }

    group(nodeIds: readonly string[], name = "Group"): string {
        const document = this.requireDocument();
        const roots = this.normalizeSelection(document, nodeIds);
        if (roots.length === 0) throw new RangeError("Select at least one scene node to group");
        if (typeof name !== "string" || name.trim().length === 0) throw new TypeError("Group name must not be empty");
        const parentId = this.commonParent(document, roots);
        const worldMatrices = new Map(roots.map(node => [node.id, this.worldMatrix(document, node.id)]));
        const center = roots.reduce((sum, node) => {
            const position = worldMatrices.get(node.id)!.getTranslation();
            return sum.addInPlace(position);
        }, Vector3.Zero()).scaleInPlace(1 / roots.length);
        const parentWorld = parentId === null ? Matrix.Identity() : this.worldMatrix(document, parentId);
        const localPosition = Vector3.TransformCoordinates(center, parentWorld.clone().invert());
        const groupId = this.uniqueId(document);

        this.update(current => {
            const group: SceneNode = {
                id: groupId,
                name: name.trim(),
                kind: "group",
                parent: parentId,
                transform: {
                    position: tuple(localPosition),
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                },
                pivot: [0, 0, 0],
                visible: true,
                locked: false,
            };
            const groupWorld = this.worldMatrix(current, groupId, group);
            current.nodes.push(group);
            for (const root of roots) {
                const node = this.requireNode(current, root.id);
                node.parent = groupId;
                node.transform = transformFromMatrix(worldMatrices.get(root.id)!.multiply(groupWorld.clone().invert()));
            }
        });
        this.selectedIds = [groupId];
        return groupId;
    }

    ungroup(groupId: string): void {
        this.update(document => {
            const group = this.requireNode(document, groupId);
            if (group.kind !== "group") throw new TypeError(`Scene node "${groupId}" is not a group`);
            const parentId = group.parent;
            const children = document.nodes.filter(node => node.parent === groupId);
            const childWorlds = new Map(children.map(node => [node.id, this.worldMatrix(document, node.id)]));
            const parentWorldInverse = parentId === null ? Matrix.Identity() : this.worldMatrix(document, parentId).clone().invert();
            for (const child of children) {
                child.parent = parentId;
                child.transform = transformFromMatrix(childWorlds.get(child.id)!.multiply(parentWorldInverse));
            }
            document.nodes = document.nodes.filter(node => node.id !== groupId);
        });
        this.selectedIds = [];
    }

    reparent(nodeId: string, parentId: string | null): void {
        this.update(document => {
            const node = this.requireNode(document, nodeId);
            if (parentId !== null) {
                const parent = this.requireNode(document, parentId);
                if (parent.kind !== "group") throw new TypeError(`Parent "${parentId}" must be a group node`);
                if (nodeId === parentId || this.descendantIds(document, nodeId).has(parentId)) {
                    throw new TypeError(`Reparenting "${nodeId}" under "${parentId}" would create a cycle`);
                }
            }
            const world = this.worldMatrix(document, nodeId);
            const parentInverse = parentId === null ? Matrix.Identity() : this.worldMatrix(document, parentId).clone().invert();
            node.parent = parentId;
            node.transform = transformFromMatrix(world.multiply(parentInverse));
        });
    }

    duplicate(nodeIds: readonly string[]): string[] {
        const document = this.requireDocument();
        const roots = this.normalizeSelection(document, nodeIds);
        if (roots.length === 0) throw new RangeError("Select at least one scene node to duplicate");
        const source = deepClone(document);
        const duplicates: SceneNode[] = [];
        const duplicatedRoots: string[] = [];
        for (const root of roots) {
            const subtreeIds = new Set([root.id, ...this.descendantIds(source, root.id)]);
            const duplicateDocument = { ...source, nodes: [...source.nodes, ...duplicates] };
            const remap = new Map<string, string>();
            for (const id of subtreeIds) {
                const newId = this.uniqueId(duplicateDocument);
                remap.set(id, newId);
                duplicateDocument.nodes.push({ ...this.requireNode(source, id), id: newId });
            }
            for (const original of source.nodes.filter(node => subtreeIds.has(node.id))) {
                const copy = deepClone(original);
                copy.id = remap.get(original.id)!;
                copy.parent = original.id === root.id
                    ? original.parent
                    : remap.get(original.parent ?? "") ?? original.parent;
                if (original.id === root.id) {
                    copy.transform.position[0] += 0.1;
                    duplicatedRoots.push(copy.id);
                }
                duplicates.push(copy);
            }
        }
        this.update(current => { current.nodes.push(...duplicates); });
        this.selectedIds = duplicatedRoots;
        return duplicatedRoots;
    }

    delete(nodeIds: readonly string[]): void {
        const document = this.requireDocument();
        const roots = this.normalizeSelection(document, nodeIds);
        if (roots.length === 0) return;
        const removed = new Set<string>();
        for (const root of roots) {
            removed.add(root.id);
            for (const descendant of this.descendantIds(document, root.id)) removed.add(descendant);
        }
        this.update(current => {
            current.nodes = current.nodes.filter(node => !removed.has(node.id));
        });
        this.selectedIds = this.selectedIds.filter(id => !removed.has(id));
    }

    worldTransform(nodeId: string): SceneTransform {
        return transformFromMatrix(this.worldMatrix(this.requireDocument(), nodeId));
    }

    snapTransform(transform: SceneTransform, settings: SceneSnapSettings): SceneTransform {
        const result = deepClone(transform);
        const groups: Array<[keyof SceneSnapSettings, keyof SceneTransform]> = [
            ["translation", "position"],
            ["rotation", "rotation"],
            ["scale", "scale"],
        ];
        for (const [settingName, valueName] of groups) {
            const setting = settings[settingName];
            if (!setting.enabled) continue;
            validateIncrement(setting.increment, settingName);
            const values = result[valueName] as SceneVector3;
            result[valueName] = values.map(value => roundToIncrement(value, setting.increment)) as SceneVector3;
        }
        if (result.scale.some(value => value === 0)) {
            throw new RangeError("Snapped scale components must not be zero");
        }
        return result;
    }

    private update(operation: (document: WamGuiSceneDocument) => void): void {
        const document = this.requireDocument();
        const next = deepClone(document);
        operation(next);
        this.write(normalizeWamGuiScene(next));
    }

    private requireDocument(): WamGuiSceneDocument {
        const document = this.read();
        if (document === null) throw new Error("No 3D scene document is loaded");
        return document;
    }

    private requireNode(document: WamGuiSceneDocument, id: string): SceneNode {
        const node = document.nodes.find(candidate => candidate.id === id);
        if (!node) throw new RangeError(`Unknown scene node ID "${id}"`);
        return node;
    }

    private uniqueId(document: WamGuiSceneDocument): string {
        let id = this.createId();
        while (document.nodes.some(node => node.id === id)) id = this.createId();
        return id;
    }

    private assertUnlocked(document: WamGuiSceneDocument, node: SceneNode): void {
        let current: SceneNode | undefined = node;
        while (current) {
            if (current.locked) throw new Error(`Scene node "${node.id}" or one of its ancestors is locked`);
            current = current.parent === null ? undefined : this.requireNode(document, current.parent);
        }
    }

    private normalizeSelection(document: WamGuiSceneDocument, ids: readonly string[]): SceneNode[] {
        const unique = [...new Set(ids)];
        const selected = unique.map(id => this.requireNode(document, id));
        const selectedIds = new Set(unique);
        return selected.filter(node => {
            let parent = node.parent;
            while (parent !== null) {
                if (selectedIds.has(parent)) return false;
                parent = this.requireNode(document, parent).parent;
            }
            return true;
        });
    }

    private commonParent(document: WamGuiSceneDocument, nodes: SceneNode[]): string | null {
        const candidates: Array<string | null> = [];
        let current = nodes[0].parent;
        while (current !== null) {
            candidates.push(current);
            current = this.requireNode(document, current).parent;
        }
        candidates.push(null);
        for (const candidate of candidates) {
            const common = nodes.every(node => {
                let parent = node.parent;
                while (parent !== null) {
                    if (parent === candidate) return true;
                    parent = this.requireNode(document, parent).parent;
                }
                return candidate === null;
            });
            if (common) return candidate;
        }
        return null;
    }

    private descendantIds(document: WamGuiSceneDocument, nodeId: string): Set<string> {
        const descendants = new Set<string>();
        const pending = [nodeId];
        while (pending.length > 0) {
            const parent = pending.pop()!;
            for (const child of document.nodes) {
                if (child.parent === parent && !descendants.has(child.id)) {
                    descendants.add(child.id);
                    pending.push(child.id);
                }
            }
        }
        return descendants;
    }

    private worldMatrix(document: WamGuiSceneDocument, nodeId: string, pendingNode?: SceneNode): Matrix {
        const node = pendingNode ?? this.requireNode(document, nodeId);
        const local = matrixFromTransform(node.transform);
        if (node.parent === null) return local;
        return local.multiply(this.worldMatrix(document, node.parent));
    }

    private worldToLocal(document: WamGuiSceneDocument, node: SceneNode, world: SceneTransform): SceneTransform {
        if (node.parent === null) return world;
        const parentWorld = this.worldMatrix(document, node.parent);
        return transformFromMatrix(matrixFromTransform(world).multiply(parentWorld.clone().invert()));
    }

    private validateVector(value: SceneVector3, name: string): SceneVector3 {
        if (!Array.isArray(value) || value.length !== 3 || value.some(component => !Number.isFinite(component))) {
            throw new TypeError(`${name} must contain exactly 3 finite numbers`);
        }
        return [...value];
    }

    private validateTransform(transform: SceneTransform, nodeId: string): SceneTransform {
        const position = this.validateVector(transform.position, `Node "${nodeId}" position`);
        const rotation = this.validateVector(transform.rotation, `Node "${nodeId}" rotation`);
        const scale = this.validateVector(transform.scale, `Node "${nodeId}" scale`);
        if (scale.some(component => component === 0)) throw new RangeError(`Node "${nodeId}" scale components must not be zero`);
        return { ...deepClone(transform), position, rotation, scale };
    }
}
