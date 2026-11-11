import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";
import { html } from "../utils/doc.ts";
import {
    ArcRotateCamera,
    Color4,
    DynamicTexture,
    Engine,
    GizmoManager,
    Mesh,
    MeshBuilder,
    Quaternion,
    Scene,
    StandardMaterial,
    TransformNode,
    Vector3,
} from "@babylonjs/core";
import type { SceneTransform, WamGuiSceneDocument } from "../descriptor/WamGuiScene.ts";
import type { SceneSnapSettings, SceneTransformSpace } from "../scene/SceneDocumentEditor.ts";
import { createScenePrimitiveMesh } from "../scene/ScenePrimitiveRenderer.ts";
import { createSceneMaterial } from "../scene/SceneMaterialRenderer.ts";
import type { SceneMaterialAssets } from "../scene/SceneMaterialRenderer.ts";
import type { SceneMaterial, SceneVisualNode } from "../descriptor/WamGuiScene.ts";


export class WamGui3DPane implements IContentRenderer{
    
    element = html.a`<div class="center_pane"></div>`
    container: TransformNode
    readonly camera: ArcRotateCamera
    engine: Engine
    scene: Scene
    private gizmoManager: GizmoManager
    private readonly sceneNodes = new Map<string, TransformNode>()
    private readonly primitiveMeshes = new Map<string, Mesh>()
    private readonly visualMeshes = new Map<string, Mesh>()
    private materialAssets: SceneMaterialAssets = new Map()
    private readonly wiredGizmos = new WeakSet<object>()
    private sceneDocument: WamGuiSceneDocument | null = null
    private selectedSceneNode: string | null = null
    private transformSpace: SceneTransformSpace = "local"
    private onSceneTransformStart: (() => void) | null = null
    private onSceneTransformEnd: ((nodeId: string, transform: SceneTransform) => void) | null = null
    private renderLoopStarted = false
    declare key_handler: (e:KeyboardEvent)=>void

    constructor(){
        let canvas= html.a`<canvas width=500 height=500></canvas>` as HTMLCanvasElement
        this.element.appendChild(canvas)

        canvas.classList.add("container")
        canvas.style.cssText = `
            display: flex;
            width: 100%;
            height: 100%;
            min-width: 0;
            min-height: 0;
        `
        
        let ctx= canvas.getContext("webgl2");
        this.engine= new Engine(ctx);
        this.scene= new Scene(this.engine);
        this.scene.createDefaultLight();
        this.scene.clearColor = new Color4(0,0,0,0)
    
        this.camera = new ArcRotateCamera("camera", -Math.PI/2, Math.PI/3, 1.7, new Vector3(0,0,0), this.scene);
        this.camera.minZ = 0.05
        this.camera.wheelPrecision = 100
        this.camera.lowerRadiusLimit = 0.25
        this.camera.upperRadiusLimit = 20
        this.camera.panningSensibility = 1000
        this.camera.attachControl(false, false, 2)
        this.camera.setTarget(Vector3.Zero())
    
        this.container = new TransformNode("node_container", this.scene)
        this.gizmoManager = new GizmoManager(this.scene)
        this.gizmoManager.usePointerToAttachGizmos = false
        this.gizmoManager.positionGizmoEnabled = true
        this.gizmoManager.rotationGizmoEnabled = false
        this.gizmoManager.scaleGizmoEnabled = false
        this.gizmoManager.onAttachedToNodeObservable.add(() => {
            const gizmos = [
                this.gizmoManager.gizmos.positionGizmo,
                this.gizmoManager.gizmos.rotationGizmo,
                this.gizmoManager.gizmos.scaleGizmo,
            ]
            for (const gizmo of gizmos) {
                if (!gizmo || this.wiredGizmos.has(gizmo)) continue
                this.wiredGizmos.add(gizmo)
                gizmo.onDragStartObservable.add(() => this.onSceneTransformStart?.())
                gizmo.onDragEndObservable.add(() => this.finishSceneTransform())
            }
        })
    }

    setSceneDocument(
        document: WamGuiSceneDocument | null,
        selectedNodeId: string | null,
        onTransformStart: () => void,
        onTransformEnd: (nodeId: string, transform: SceneTransform) => void,
    ): void {
        this.sceneDocument = document
        this.selectedSceneNode = selectedNodeId
        this.onSceneTransformStart = onTransformStart
        this.onSceneTransformEnd = onTransformEnd
        const nodes = new Set(document?.nodes.map(node => node.id) ?? [])
        for (const [id, runtimeNode] of this.sceneNodes) {
            if (!nodes.has(id)) {
                runtimeNode.dispose()
                this.sceneNodes.delete(id)
            }

        }
        for (const mesh of this.primitiveMeshes.values()) {
            mesh.material?.dispose()
            mesh.dispose()
        }
        this.primitiveMeshes.clear()
        for (const mesh of this.visualMeshes.values()) {
            mesh.material?.dispose()
            mesh.dispose()
        }
        this.visualMeshes.clear()
        for (const node of document?.nodes ?? []) {
            let runtimeNode = this.sceneNodes.get(node.id)
            if (!runtimeNode) {
                runtimeNode = new TransformNode(`scene-editor:${node.id}`, this.scene)
                this.sceneNodes.set(node.id, runtimeNode)
            }
            runtimeNode.parent = null
        }
        for (const node of document?.nodes ?? []) {
            const runtimeNode = this.sceneNodes.get(node.id)!
            runtimeNode.parent = node.parent === null ? null : this.sceneNodes.get(node.parent) ?? null
            runtimeNode.position.set(...node.transform.position)
            runtimeNode.rotationQuaternion = Quaternion.RotationYawPitchRoll(
                node.transform.rotation[1],
                node.transform.rotation[0],
                node.transform.rotation[2],
            )
            runtimeNode.scaling.set(...node.transform.scale)
            runtimeNode.setPivotPoint(new Vector3(...node.pivot))
            runtimeNode.setEnabled(this.isEffectivelyVisible(node.id))
            if (node.kind === "primitive") {
                const mesh = createScenePrimitiveMesh(this.scene, node)
                mesh.parent = runtimeNode
                mesh.position.set(0, 0, 0)
                this.applyMaterial(mesh, node.material_refs, document?.materials ?? [])
                this.primitiveMeshes.set(node.id, mesh)
            }
            if (node.kind === "visual" && node.visual_type === "text") {
                const mesh = this.createTextMesh(node)
                mesh.parent = runtimeNode
                this.applyMaterial(mesh, node.material_refs, document?.materials ?? [])
                this.visualMeshes.set(node.id, mesh)
            }
        }
        this.attachSelectedSceneNode()
    }

    setSceneMaterialAssets(assets: SceneMaterialAssets): void {
        this.materialAssets = assets
        if (this.sceneDocument) {
            this.setSceneDocument(
                this.sceneDocument,
                this.selectedSceneNode,
                this.onSceneTransformStart ?? (() => {}),
                this.onSceneTransformEnd ?? (() => {}),
            )
        }
    }

    setSceneTransformMode(mode: "position" | "rotation" | "scale", space: SceneTransformSpace): void {
        this.transformSpace = space
        this.gizmoManager.positionGizmoEnabled = mode === "position"
        this.gizmoManager.rotationGizmoEnabled = mode === "rotation"
        this.gizmoManager.scaleGizmoEnabled = mode === "scale"
        this.updateGizmoSpace()
    }

    setSceneSnapSettings(settings: SceneSnapSettings): void {
        const position = this.gizmoManager.gizmos.positionGizmo
        const rotation = this.gizmoManager.gizmos.rotationGizmo
        const scale = this.gizmoManager.gizmos.scaleGizmo
        if (position) position.snapDistance = settings.translation.enabled ? settings.translation.increment : 0
        if (rotation) rotation.snapDistance = settings.rotation.enabled ? settings.rotation.increment : 0
        if (scale) scale.snapDistance = settings.scale.enabled ? settings.scale.increment : 0
    }

    focusSceneNode(nodeId: string): void {
        const node = this.sceneNodes.get(nodeId)
        if (!node) throw new RangeError(`Unknown scene node ID "${nodeId}"`)
        this.camera.setTarget(node.getAbsolutePosition())
    }

    fitScene(): void {
        if (this.sceneNodes.size === 0) {
            this.camera.setTarget(Vector3.Zero())
            this.camera.radius = 1.7
            return
        }
        const points = [...this.sceneNodes.values()].map(node => node.getAbsolutePosition())
        const bounds = [...this.primitiveMeshes.values()].map(mesh => {
            mesh.computeWorldMatrix(true)
            const box = mesh.getBoundingInfo().boundingBox
            return { min: box.minimumWorld, max: box.maximumWorld }
        })
        const min = bounds.length > 0
            ? bounds.reduce((result, box) => Vector3.Minimize(result, box.min), points[0].clone())
            : points[0].clone()
        const max = bounds.length > 0
            ? bounds.reduce((result, box) => Vector3.Maximize(result, box.max), points[0].clone())
            : points[0].clone()
        for (const point of points) {
            min.copyFrom(Vector3.Minimize(min, point))
            max.copyFrom(Vector3.Maximize(max, point))
        }
        const center = min.add(max).scale(0.5)
        const radius = Math.max(Vector3.Distance(min, max) * 1.5, 1.7)
        this.camera.setTarget(center)
        this.camera.radius = Math.min(this.camera.upperRadiusLimit ?? 20, Math.max(this.camera.lowerRadiusLimit ?? 0.25, radius))
    }

    zoomIn(): void {
        this.camera.radius = Math.max(this.camera.lowerRadiusLimit ?? 0.25, this.camera.radius / 1.2)
    }

    zoomOut(): void {
        this.camera.radius = Math.min(this.camera.upperRadiusLimit ?? 20, this.camera.radius * 1.2)
    }

    resetZoom(): void {
        this.camera.radius = 1.7
    }

    setCanvasZoom(zoom: number): void {
        const size = `${Math.max(0.5, Math.min(3, zoom)) * 100}%`
        this.element.style.width = size
        this.element.style.height = size
        this.engine.resize()
    }

    init(_: GroupPanelPartInitParameters): void {
        this.startRenderLoop()
    }

    startRenderLoop(): void {
        if(this.renderLoopStarted) return
        this.renderLoopStarted = true
        //this.key_handler = (event)=>{
        //    switch(event.key){
        //        case "z": this.container.position.x+=0.1; break
        //        case "s": this.container.position.x-=0.1; break
        //        case "q": this.container.position.z-=0.1; break
        //        case "d": this.container.position.z+=0.1; break
        //    }
        //}
        //document.addEventListener("keypress", this.key_handler)

        this.engine.runRenderLoop(()=>this.scene.render())
    }

    dispose(): void {
        document.removeEventListener("keypress", this.key_handler)
        this.engine.stopRenderLoop()
        this.gizmoManager.dispose()
        for (const node of this.sceneNodes.values()) node.dispose()
        this.sceneNodes.clear()
        for (const mesh of this.primitiveMeshes.values()) {
            mesh.material?.dispose()
            mesh.dispose()
        }
        this.primitiveMeshes.clear()
        for (const mesh of this.visualMeshes.values()) {
            mesh.material?.dispose()
            mesh.dispose()
        }
        this.visualMeshes.clear()
        this.renderLoopStarted = false
    }

    private attachSelectedSceneNode(): void {
        const node = this.selectedSceneNode === null ? null : this.sceneNodes.get(this.selectedSceneNode) ?? null
        const selectedDocumentNode = this.sceneDocument?.nodes.find(candidate => candidate.id === this.selectedSceneNode)
        const locked = selectedDocumentNode?.locked === true
            || (selectedDocumentNode?.parent ? this.isAncestorLocked(selectedDocumentNode.parent) : false)
        this.gizmoManager.attachToNode(locked ? null : node)
        this.updateGizmoSpace()
    }

    private isAncestorLocked(nodeId: string): boolean {
        const node = this.sceneDocument?.nodes.find(candidate => candidate.id === nodeId)
        if (!node) return false
        return node.locked || (node.parent !== null && this.isAncestorLocked(node.parent))
    }

    private isEffectivelyVisible(nodeId: string): boolean {
        const node = this.sceneDocument?.nodes.find(candidate => candidate.id === nodeId)
        if (!node || !node.visible) return false
        return node.parent === null || this.isEffectivelyVisible(node.parent)
    }

    private applyMaterial(mesh: Mesh, references: SceneVisualNode["material_refs"], materials: SceneMaterial[]): void {
        const materialId = references?.[0]?.material_id
        const material = materials.find(candidate => candidate.id === materialId)
        if (!material) return
        mesh.material?.dispose()
        mesh.material = createSceneMaterial(this.scene, material, this.materialAssets)
    }

    private createTextMesh(node: SceneVisualNode): Mesh {
        const size = node.size ?? [1, 0.3]
        const texture = new DynamicTexture(`${node.id}:text`, { width: 1024, height: 256 }, this.scene, true)
        texture.hasAlpha = true
        const context = texture.getContext() as CanvasRenderingContext2D
        context.clearRect(0, 0, 1024, 256)
        context.fillStyle = "white"
        context.font = `${Math.max(12, Math.round((node.font_size ?? 48) * 2))}px ${node.font_family ?? "Arial"}`
        context.textAlign = "center"
        context.textBaseline = "middle"
        context.fillText(node.text ?? "", 512, 128)
        texture.update()
        const mesh = MeshBuilder.CreatePlane(node.name, { width: size[0], height: size[1] }, this.scene)
        const material = new StandardMaterial(`${node.id}:text-material`, this.scene)
        material.diffuseTexture = texture
        material.opacityTexture = texture
        material.emissiveColor.set(1, 1, 1)
        material.backFaceCulling = false
        mesh.material = material
        return mesh
    }

    private updateGizmoSpace(): void {
        const useLocalRotation = this.transformSpace === "local"
        if (this.gizmoManager.gizmos.positionGizmo) {
            this.gizmoManager.gizmos.positionGizmo.updateGizmoRotationToMatchAttachedMesh = useLocalRotation
        }
        if (this.gizmoManager.gizmos.rotationGizmo) {
            this.gizmoManager.gizmos.rotationGizmo.updateGizmoRotationToMatchAttachedMesh = useLocalRotation
        }
        if (this.gizmoManager.gizmos.scaleGizmo) {
            this.gizmoManager.gizmos.scaleGizmo.updateGizmoRotationToMatchAttachedMesh = useLocalRotation
        }
    }

    private finishSceneTransform(): void {
        if (this.selectedSceneNode === null) return
        const node = this.sceneNodes.get(this.selectedSceneNode)
        if (!node) return
        const rotationQuaternion = node.rotationQuaternion ?? Quaternion.Identity()
        let position = node.position
        let rotation = rotationQuaternion.toEulerAngles()
        let scale = node.scaling
        if (this.transformSpace === "world") {
            const worldRotation = Quaternion.Identity()
            const worldPosition = Vector3.Zero()
            const worldScale = Vector3.One()
            if (!node.computeWorldMatrix(true).decompose(worldScale, worldRotation, worldPosition)) {
                throw new RangeError(`Scene node "${this.selectedSceneNode}" has an invalid world transform`)
            }
            position = worldPosition
            rotation = worldRotation.toEulerAngles()
            scale = worldScale
        }
        this.onSceneTransformEnd?.(this.selectedSceneNode, {
            position: [position.x, position.y, position.z],
            rotation: [rotation.x, rotation.y, rotation.z],
            scale: [scale.x, scale.y, scale.z],
        })
    }

}