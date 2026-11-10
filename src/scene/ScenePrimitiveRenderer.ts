import {
    Mesh,
    MeshBuilder,
    Scene,
    StandardMaterial,
    Vector3,
    VertexData,
} from "@babylonjs/core";
import type { ScenePrimitiveNode, ScenePrimitiveType } from "../descriptor/WamGuiScene.ts";

export type ScenePrimitiveParameters = Record<string, number>;

export const DEFAULT_SCENE_PRIMITIVE_PARAMETERS: Readonly<Record<ScenePrimitiveType, ScenePrimitiveParameters>> = {
    box: { width: 1, height: 1, depth: 1 },
    cylinder: { diameter: 1, height: 1, tessellation: 32 },
    sphere: { diameter: 1, segments: 16 },
    plane: { width: 1, height: 1 },
    rounded: { width: 1, height: 1, depth: 1, radius: 0.1, segments: 4 },
    lathed: { bottom_radius: 0.5, top_radius: 0.25, height: 1, tessellation: 32 },
};

function parameter(node: ScenePrimitiveNode, key: string): number {
    return node.geometry.parameters[key] ?? DEFAULT_SCENE_PRIMITIVE_PARAMETERS[node.geometry.type][key] ?? 1;
}

function positiveInteger(node: ScenePrimitiveNode, key: string, minimum: number): number {
    const value = parameter(node, key);
    if (!Number.isInteger(value) || value < minimum) {
        throw new RangeError(`Primitive "${node.id}" parameter "${key}" must be an integer of at least ${minimum}`);
    }
    return value;
}

function roundedBox(scene: Scene, node: ScenePrimitiveNode): Mesh {
    const width = parameter(node, "width");
    const height = parameter(node, "height");
    const depth = parameter(node, "depth");
    const radius = parameter(node, "radius");
    const segments = positiveInteger(node, "segments", 1);
    const half = new Vector3(width / 2, height / 2, depth / 2);
    if (radius > Math.min(half.x, half.y, half.z)) {
        throw new RangeError(`Rounded primitive "${node.id}" radius must not exceed half its smallest dimension`);
    }
    const inner = half.subtract(new Vector3(radius, radius, radius));
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    const faces: Array<{ origin: Vector3; u: Vector3; v: Vector3; normal: Vector3 }> = [
        { origin: new Vector3(-half.x, -half.y, half.z), u: new Vector3(width, 0, 0), v: new Vector3(0, height, 0), normal: new Vector3(0, 0, 1) },
        { origin: new Vector3(half.x, -half.y, -half.z), u: new Vector3(-width, 0, 0), v: new Vector3(0, height, 0), normal: new Vector3(0, 0, -1) },
        { origin: new Vector3(-half.x, -half.y, -half.z), u: new Vector3(0, 0, depth), v: new Vector3(0, height, 0), normal: new Vector3(-1, 0, 0) },
        { origin: new Vector3(half.x, -half.y, half.z), u: new Vector3(0, 0, -depth), v: new Vector3(0, height, 0), normal: new Vector3(1, 0, 0) },
        { origin: new Vector3(-half.x, half.y, half.z), u: new Vector3(width, 0, 0), v: new Vector3(0, 0, -depth), normal: new Vector3(0, 1, 0) },
        { origin: new Vector3(-half.x, -half.y, -half.z), u: new Vector3(width, 0, 0), v: new Vector3(0, 0, depth), normal: new Vector3(0, -1, 0) },
    ];

    for (const face of faces) {
        const base = positions.length / 3;
        for (let y = 0; y <= segments; y++) {
            for (let x = 0; x <= segments; x++) {
                const point = face.origin
                    .add(face.u.scale(x / segments))
                    .add(face.v.scale(y / segments));
                const nearest = new Vector3(
                    Math.min(inner.x, Math.max(-inner.x, point.x)),
                    Math.min(inner.y, Math.max(-inner.y, point.y)),
                    Math.min(inner.z, Math.max(-inner.z, point.z)),
                );
                const offset = point.subtract(nearest);
                const normal = offset.lengthSquared() === 0 ? face.normal : offset.normalize();
                const rounded = nearest.add(normal.scale(radius));
                positions.push(rounded.x, rounded.y, rounded.z);
                uvs.push(x / segments, y / segments);
            }
        }
        for (let y = 0; y < segments; y++) {
            for (let x = 0; x < segments; x++) {
                const topLeft = base + y * (segments + 1) + x;
                const topRight = topLeft + 1;
                const bottomLeft = topLeft + segments + 1;
                const bottomRight = bottomLeft + 1;
                indices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft);
            }
        }
    }

    const mesh = new Mesh(node.name, scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.uvs = uvs;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);
    return mesh;
}

export function createScenePrimitiveMesh(scene: Scene, node: ScenePrimitiveNode): Mesh {
    const geometry = node.geometry;
    let mesh: Mesh;
    switch (geometry.type) {
        case "box":
            mesh = MeshBuilder.CreateBox(node.name, {
                width: parameter(node, "width"),
                height: parameter(node, "height"),
                depth: parameter(node, "depth"),
            }, scene);
            break;
        case "cylinder":
            mesh = MeshBuilder.CreateCylinder(node.name, {
                height: parameter(node, "height"),
                diameter: parameter(node, "diameter"),
                tessellation: positiveInteger(node, "tessellation", 3),
            }, scene);
            break;
        case "sphere":
            mesh = MeshBuilder.CreateSphere(node.name, {
                diameter: parameter(node, "diameter"),
                segments: positiveInteger(node, "segments", 3),
            }, scene);
            break;
        case "plane":
            mesh = MeshBuilder.CreatePlane(node.name, {
                width: parameter(node, "width"),
                height: parameter(node, "height"),
            }, scene);
            break;
        case "rounded":
            mesh = roundedBox(scene, node);
            mesh.name = node.name;
            break;
        case "lathed":
            mesh = MeshBuilder.CreateCylinder(node.name, {
                height: parameter(node, "height"),
                diameterTop: parameter(node, "top_radius") * 2,
                diameterBottom: parameter(node, "bottom_radius") * 2,
                tessellation: positiveInteger(node, "tessellation", 3),
            }, scene);
            break;
        default: {
            const exhaustive: never = geometry.type;
            throw new TypeError(`Unsupported primitive type "${exhaustive}"`);
        }
    }

    mesh.isPickable = true;
    mesh.metadata = { sceneNodeId: node.id, primitiveType: geometry.type };
    const material = new StandardMaterial(`${node.id}:default-material`, scene);
    material.diffuseColor.set(0.35, 0.65, 0.9);
    material.specularColor.set(0.2, 0.2, 0.2);
    mesh.material = material;
    return mesh;
}
