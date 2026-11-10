import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";
import { html } from "../utils/doc.ts";
import {
    ArcRotateCamera,
    Color4,
    Engine,
    GizmoManager,
    Quaternion,
    Scene,
    TransformNode,
    Vector3,
} from "@babylonjs/core";
import type { SceneTransform, WamGuiSceneDocument } from "../descriptor/WamGuiScene.ts";
import type { SceneSnapSettings, SceneTransformSpace } from "../scene/SceneDocumentEditor.ts";


export class WamGui3DPane implements IContentRenderer{
    
    element = html.a`<div class="center_pane"></div>`
    container: TransformNode
    readonly camera: ArcRotateCamera
    engine: Engine
    scene: Scene
    private gizmoManager: GizmoManager
    private readonly sceneNodes = new Map<string, TransformNode>()
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
    
        this.camera = new ArcRotateCamera("camera", -Math.PI/2, 0, 1.7, new Vector3(0,0,0), this.scene);
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
        }
        this.attachSelectedSceneNode()
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
        const min = points.reduce((result, point) => Vector3.Minimize(result, point), points[0].clone())
        const max = points.reduce((result, point) => Vector3.Maximize(result, point), points[0].clone())
        const center = min.add(max).scale(0.5)
        const radius = Math.max(Vector3.Distance(min, max) * 0.75, 0.5)
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