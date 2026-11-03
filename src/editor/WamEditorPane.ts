import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";
import { html } from "../utils/doc.ts";
import { AbstractMesh, TransformNode } from "@babylonjs/core";
import { MOValue, OValue } from "../observable/collections/OValue.ts";
import { WamGUIGenerator } from "../WamGUIGenerator.ts";
import { Selector } from "../gui/Selector.ts";
import { ControlMap } from "../control/ControlMap.ts";
import { OSource } from "../observable/source/OSource.ts";
import { WebAudioModule } from "@webaudiomodules/api";
import { ControlContextTarget, DEFAULT_CONTROL_CONTEXT_TARGET } from "../control/Control.ts";
import { WamThumbnailReference } from "../utils/thumbnail-reference.ts";
import {
    GridSnapSettings,
    NormalizedRect,
    clampWorkspaceZoom,
    rectanglesIntersect,
    shouldSelectInMarquee,
    SnapSource,
} from "../gui/editorInteractions.ts";
import { svgFaceTransform } from "../utils/visual/faceTransform.ts";

export class WamEditorPane implements IContentRenderer{

    container = html.a`<div class=container></div>`
    element = html.a`<div class="editor_pane center_pane _contain">${this.container}</div>`
    private reference_overlay = html.a`<div aria-hidden="true"></div>`
    private grid_overlay = html.a`<div class="editor-grid" aria-hidden="true"></div>`
    private marquee = html.a`<div class="selection-marquee" aria-hidden="true"></div>`
    private faceTransformOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    private showFaceTransformOverlay = false
    private referenceOverlayDisposables: (() => void)[] = []
    private gridSettings = { visible: false, snapEnabled: false, spacing: 0.05 }
    onSnapFeedback: (source: SnapSource) => void = () => {}
    private marqueeStart: {
        x: number
        y: number
        mode: "replace" | "add" | "toggle"
        originalSelection: Set<ReturnType<ControlMap["get"]>>
    } | null = null
    gui_generator: MOValue<WamGUIGenerator>
    selector: Selector<{element:HTMLElement,infos:ReturnType<ControlMap['get']>}>
    on_select = new OSource<Parameters<WamEditorPane['selector']['on_select']>[0]>()
    on_unselect = new OSource<Parameters<WamEditorPane['selector']['on_select']>[0]>()

    constructor(
        wam: OValue<WebAudioModule|null>,
        node_container?: TransformNode,
        private readonly thumbnailReference?: WamThumbnailReference,
    ){
        this.container.style.cssText = `
            display: flex;
            aspect-ratio: 1/1;
            width: 100%;
            overflow: hidden;
            position: relative;
            transform: scale(1);
            transform-origin: center center;
        `
        this.reference_overlay.style.cssText = `
            position: absolute;
            display: none;
            pointer-events: none;
            overflow: hidden;
        `
        this.grid_overlay.style.cssText = `
            position: absolute;
            display: none;
            pointer-events: none;
        `
        this.marquee.style.cssText = `
            position: absolute;
            display: none;
            pointer-events: none;
            border: 1px dashed var(--select2);
            background: var(--select1);
            opacity: 0.35;
            z-index: 3;
        `
        this.faceTransformOverlay.setAttribute("viewBox", "0 0 100 100")
        this.faceTransformOverlay.setAttribute("preserveAspectRatio", "none")
        this.faceTransformOverlay.setAttribute("aria-hidden", "true")
        this.faceTransformOverlay.style.cssText = `
            position: absolute;
            display: none;
            pointer-events: none;
            overflow: visible;
            z-index: 4;
        `
        const faceTransformBorder = document.createElementNS("http://www.w3.org/2000/svg", "rect")
        faceTransformBorder.setAttribute("x", "0")
        faceTransformBorder.setAttribute("y", "0")
        faceTransformBorder.setAttribute("width", "100")
        faceTransformBorder.setAttribute("height", "100")
        faceTransformBorder.setAttribute("fill", "none")
        faceTransformBorder.setAttribute("stroke", "#ff8c42")
        faceTransformBorder.setAttribute("stroke-width", "0.8")
        faceTransformBorder.setAttribute("stroke-dasharray", "3 2")
        this.faceTransformOverlay.appendChild(faceTransformBorder)

        const html: ControlContextTarget<HTMLElement,HTMLElement> = {
            root: this.container,
            ...DEFAULT_CONTROL_CONTEXT_TARGET,
        }

        const babylonjs: ControlContextTarget<TransformNode,AbstractMesh>|undefined = node_container ? {
            root: node_container,
            ...DEFAULT_CONTROL_CONTEXT_TARGET,
        } : undefined 

        this.gui_generator = new MOValue(WamGUIGenerator.create({wam:wam.value??undefined, html, babylonjs}))
        this.attachReferenceOverlay(this.gui_generator.value)
        this.container.appendChild(this.grid_overlay)
        this.container.appendChild(this.marquee)
        this.container.appendChild(this.faceTransformOverlay)
        this.thumbnailReference?.state.link(({to})=>{
            if(to.status === "ready"){
                const image = to.image
                image.style.width = "100%"
                image.style.height = "100%"
                image.style.objectFit = "contain"
                image.style.opacity = this.thumbnailReference?.opacity.value.toString() ?? "0.35"
                image.draggable = false
                this.reference_overlay.replaceChildren(image)
            }else{
                this.reference_overlay.replaceChildren()
            }
            this.updateReferenceOverlay()
        })
        this.thumbnailReference?.visible.link(()=>this.updateReferenceOverlay())
        this.thumbnailReference?.opacity.link(({to})=>{
            const image = this.reference_overlay.firstElementChild as HTMLImageElement | null
            if(image) image.style.opacity = to.toString()
        })

        wam.observable.register(({})=>{
            console.trace()
            this.gui_generator.value.dispose()
            this.gui_generator.value = WamGUIGenerator.create({wam:wam.value??undefined, html, babylonjs})
            this.attachReferenceOverlay(this.gui_generator.value)
        })
        
        this.selector = new Selector<{element:HTMLElement,infos:ReturnType<ControlMap['get']>}>(
            it=>it.infos,
            this.container,
            this.getTransformerLines.bind(this),
            () => this.getGridSnapSettings(),
            source => this.onSnapFeedback(source),
        )

        this.selector.on_move = (moved, x,y, width,height)=>{
            const controls = this.gui_generator.value.controls; if(!controls)return
            const index = controls.values.indexOf(moved.infos)
            controls.move(index,x,y)
            controls.resize(index,width,height)
        }

        this.selector.on_select = it => this.on_select.notify(it)
        this.selector.on_unselect = it => this.on_unselect.notify(it)

        this.gui_generator.link(({to:gen})=>{
            gen.controls.on_add.register((item)=>{
                const {container} = item
                if(container)container.onmousedown = (e: MouseEvent)=>{
                    e.stopPropagation()
                    const selected = {element:container, infos:item}
                    if(e.ctrlKey || e.metaKey){
                        const existing = [...this.selector.selecteds].find(selection => selection.infos === item)
                        if(existing){
                            this.selector.unselect(existing)
                            return
                        }
                        this.selector.select(selected)
                    }else if(e.shiftKey){
                        if(![...this.selector.selecteds].some(selection => selection.infos === item)){
                            this.selector.select(selected)
                        }
                    }else if(![...this.selector.selecteds].some(selection => selection.infos === item)){
                        this.selector.selecteds = [selected]
                    }
                    this.selector.transformer?.startMoving(e.pageX,e.pageY,()=>this.getTransformerLines([...this.selector.selecteds.values()]))
                }
            })

            gen.controls.on_remove.add((item)=>{
                for(const s of this.selector.selecteds) if(s.infos==item) this.selector.unselect(s)
            })
        })

        this.container.addEventListener("mousedown", this.onCanvasMouseDown)
        window.addEventListener("mousemove", this.onMarqueeMouseMove)
        window.addEventListener("mouseup", this.onMarqueeMouseUp)
    }

    get selectionCount(): number {
        return this.selector.selecteds.size
    }

    getGridSettings(): Readonly<{visible: boolean; snapEnabled: boolean; spacing: number}> {
        return { ...this.gridSettings }
    }

    setGridSettings(settings: {visible: boolean; snapEnabled: boolean; spacing: number}): void {
        if(!Number.isFinite(settings.spacing) || settings.spacing < 0.01 || settings.spacing > 0.5){
            throw new RangeError("Grid spacing must be between 1% and 50% of the design area")
        }
        this.gridSettings = { ...settings }
        this.updateGridOverlay()
    }

    setFaceTransformOverlayVisible(visible: boolean): void {
        this.showFaceTransformOverlay = visible
        this.updateFaceTransformOverlay()
    }

    setZoom(zoom: number): void {
        const scale = clampWorkspaceZoom(zoom)
        this.container.style.setProperty("--editor-zoom", scale.toString())
        this.container.style.setProperty("--editor-zoom-inverse", (1 / scale).toString())
        this.container.style.transform = `scale(${scale})`
    }

    private getGridSnapSettings(): GridSnapSettings {
        return { enabled: this.gridSettings.snapEnabled, spacing: this.gridSettings.spacing }
    }

    toggleSelection(selection: {element: HTMLElement, infos: ReturnType<ControlMap["get"]>}): void {
        const existing = [...this.selector.selecteds].find(item => item.infos === selection.infos)
        if(existing) this.selector.unselect(existing)
        else this.selector.select(selection)
    }

    private isCanvasBackground(target: EventTarget | null): boolean {
        if(target === this.container || target === this.reference_overlay || target === this.marquee) return true
        const pad = this.gui_generator.value.pad_element
        return target instanceof Node && pad instanceof Node && pad.contains(target)
    }

    private onCanvasMouseDown = (event: MouseEvent): void => {
        if(event.button !== 0 || !this.isCanvasBackground(event.target)) return
        const bounds = this.container.getBoundingClientRect()
        if(bounds.width <= 0 || bounds.height <= 0) return
        const x = (event.clientX - bounds.left) / bounds.width
        const y = (event.clientY - bounds.top) / bounds.height
        const mode = event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace"
        const additive = mode !== "replace"
        const originalSelection = new Set(
            additive ? [...this.selector.selecteds].map(selection => selection.infos) : [],
        )
        this.marqueeStart = { x, y, mode, originalSelection }
        this.marquee.style.display = "block"
        this.updateMarquee(x, y, x, y)
        if(!additive) this.selector.unselect_all()
        event.preventDefault()
    }

    private updateMarquee(x1: number, y1: number, x2: number, y2: number): NormalizedRect {
        const x = Math.min(x1, x2)
        const y = Math.min(y1, y2)
        const width = Math.abs(x2 - x1)
        const height = Math.abs(y2 - y1)
        this.marquee.style.left = `${x * this.container.clientWidth}px`
        this.marquee.style.top = `${y * this.container.clientHeight}px`
        this.marquee.style.width = `${width * this.container.clientWidth}px`
        this.marquee.style.height = `${height * this.container.clientHeight}px`
        return { x, y, width, height }
    }

    private onMarqueeMouseMove = (event: MouseEvent): void => {
        if(!this.marqueeStart) return
        const bounds = this.container.getBoundingClientRect()
        if(bounds.width <= 0 || bounds.height <= 0) return
        const x = (event.clientX - bounds.left) / bounds.width
        const y = (event.clientY - bounds.top) / bounds.height
        const marquee = this.updateMarquee(this.marqueeStart.x, this.marqueeStart.y, x, y)
        for(const item of this.gui_generator.value.controls.values){
            if(!item.container) continue
            const control = { x: item.x, y: item.y, width: item.width, height: item.height }
            const selected = [...this.selector.selecteds].find(selection => selection.infos === item)
            const intersects = rectanglesIntersect(marquee, control)
            const wasSelected = this.marqueeStart.originalSelection.has(item)
            const shouldBeSelected = shouldSelectInMarquee(this.marqueeStart.mode, wasSelected, intersects)
            if(shouldBeSelected && !selected){
                this.selector.select({element: item.container, infos: item})
            }else if(!shouldBeSelected && selected){
                this.selector.unselect(selected)
            }
        }
    }

    private onMarqueeMouseUp = (): void => {
        if(!this.marqueeStart) return
        this.marqueeStart = null
        this.marquee.style.display = "none"
    }

    private attachReferenceOverlay(generator: WamGUIGenerator): void {
        this.referenceOverlayDisposables.forEach(dispose => dispose())
        this.referenceOverlayDisposables = []
        this.container.appendChild(this.reference_overlay)
        const update = () => this.updateReferenceOverlay(generator)
        this.referenceOverlayDisposables.push(
            generator.aspect_ratio.observable.add(update),
            generator.size.observable.add(update),
            generator.aspect_ratio.observable.add(() => this.updateFaceTransformOverlay(generator)),
            generator.size.observable.add(() => this.updateFaceTransformOverlay(generator)),
            generator.face_transform.observable.add(() => this.updateFaceTransformOverlay(generator)),
            generator.front_face.observable.add(() => this.updateFaceTransformOverlay(generator)),
        )
        this.referenceOverlayDisposables.push(
            generator.aspect_ratio.observable.add(() => this.updateGridOverlay(generator)),
            generator.size.observable.add(() => this.updateGridOverlay(generator)),
        )
        update()
        this.updateGridOverlay(generator)
        this.updateFaceTransformOverlay(generator)
    }

    private updateFaceTransformOverlay(generator = this.gui_generator.value): void {
        const ratio = generator.aspect_ratio.value
        const size = generator.size.value
        const width = size * (ratio > 1 ? 1 : ratio)
        const height = size * (ratio > 1 ? 1 / ratio : 1)
        this.faceTransformOverlay.style.display =
            this.showFaceTransformOverlay && generator.front_face.value ? "block" : "none"
        this.faceTransformOverlay.style.left = `${(1 - width) * 50}%`
        this.faceTransformOverlay.style.top = `${(1 - height) * 50}%`
        this.faceTransformOverlay.style.width = `${width * 100}%`
        this.faceTransformOverlay.style.height = `${height * 100}%`
        this.faceTransformOverlay.firstElementChild?.setAttribute(
            "transform",
            svgFaceTransform(generator.face_transform.value),
        )
    }

    private updateGridOverlay(generator = this.gui_generator.value): void {
        const ratio = generator.aspect_ratio.value
        const size = generator.size.value
        const width = size * (ratio > 1 ? 1 : ratio)
        const height = size * (ratio > 1 ? 1 / ratio : 1)
        this.grid_overlay.style.display = this.gridSettings.visible ? "block" : "none"
        this.grid_overlay.style.left = `${(1 - width) * 50}%`
        this.grid_overlay.style.top = `${(1 - height) * 50}%`
        this.grid_overlay.style.width = `${width * 100}%`
        this.grid_overlay.style.height = `${height * 100}%`
        const spacing = `${this.gridSettings.spacing * 100}%`
        this.grid_overlay.style.backgroundSize = `${spacing} ${spacing}`
    }

    private updateReferenceOverlay(generator = this.gui_generator.value): void {
        const reference = this.thumbnailReference
        const ready = reference?.state.value.status === "ready"
        this.reference_overlay.style.display = ready && reference.visible.value ? "block" : "none"
        if(!ready) return

        const ratio = generator.aspect_ratio.value
        const size = generator.size.value
        const width = size * (ratio > 1 ? 1 : ratio)
        const height = size * (ratio > 1 ? 1 / ratio : 1)
        this.reference_overlay.style.left = `${(1 - width) * 50}%`
        this.reference_overlay.style.top = `${(1 - height) * 50}%`
        this.reference_overlay.style.width = `${width * 100}%`
        this.reference_overlay.style.height = `${height * 100}%`
    }

    getTransformerLines(selecteds: {element: HTMLElement, infos: ReturnType<ControlMap["get"]>}[]){
        const horizontal: number[] = []
        const vertical: number[] = []
        for(const selectable of this.gui_generator.value.controls.values){
            if(selecteds.some(e=>e.infos==selectable)) continue
            horizontal.push(selectable.x)
            vertical.push(selectable.y)
            horizontal.push(selectable.x+selectable.width)
            vertical.push(selectable.y+selectable.height)
            
            horizontal.push(1.-selectable.x)
            vertical.push(1.-selectable.y)
            horizontal.push(1.-selectable.x-selectable.width)
            vertical.push(1.-selectable.y-selectable.height)
        }

        return {horizontal, vertical}
    }

    init(_: GroupPanelPartInitParameters): void {
    }

    dispose(): void {
        this.container.removeEventListener("mousedown", this.onCanvasMouseDown)
        window.removeEventListener("mousemove", this.onMarqueeMouseMove)
        window.removeEventListener("mouseup", this.onMarqueeMouseUp)
        this.referenceOverlayDisposables.forEach(dispose => dispose())
        this.referenceOverlayDisposables = []
        this.grid_overlay.remove()
        this.marqueeStart = null
    }

}