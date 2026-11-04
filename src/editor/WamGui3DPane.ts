import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";
import { html } from "../utils/doc.ts";
import { ArcRotateCamera, Color4, Engine, Scene, TransformNode, Vector3 } from "@babylonjs/core";


export class WamGui3DPane implements IContentRenderer{
    
    element = html.a`<div class="center_pane"></div>`
    container: TransformNode
    readonly camera: ArcRotateCamera
    engine: Engine
    scene: Scene
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
        this.renderLoopStarted = false
    }

}