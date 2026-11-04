import { AbstractMesh, Color3, MeshBuilder, PointerEventTypes, Scene, StandardMaterial, TransformNode } from "@babylonjs/core"
import { Control, ControlEnv } from "../../Control.ts"
import { CSettings, CSettingsValues, CSettingsValue } from "../settings/settings.ts"
import { ParameterControl, ParameterControlFactory } from "./ParameterControl.ts"

export class RotaryKnobControl extends ParameterControl {
    private element?: HTMLDivElement
    private indicator?: HTMLDivElement
    private baseColor = Color3.FromHexString("#222222")
    private indicatorColor = Color3.FromHexString("#00a6ff")
    private root?: TransformNode
    private knob?: AbstractMesh
    private pointer?: AbstractMesh
    private baseMaterial?: StandardMaterial
    private pointerMaterial?: StandardMaterial
    private pointerObserver?: () => void
    private dragging = false
    private previousPointerY = 0
    private restoreCameraControls?: () => void

    override updateValue(label: string, value: CSettingsValue): void {
        if(label === "Base Color") this.baseColor = Color3.FromHexString(value as string)
        else if(label === "Cursor Color") this.indicatorColor = Color3.FromHexString(value as string)
        else super.updateValue(label, value)
        this.updateVisual()
    }

    override onParamChange(): void {
        this.updateVisual()
    }

    override createElement(): HTMLElement {
        const element = this.element = document.createElement("div")
        element.className = "rotary-knob-skin"
        Object.assign(element.style, {
            display: "block",
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            borderRadius: "50%",
            border: "2px solid #999999",
            boxShadow: "inset 0 0 0 2px #333333, 0 2px 4px #00000066",
            position: "relative",
            cursor: "ns-resize",
            touchAction: "none",
        })
        element.setAttribute("role", "slider")
        element.setAttribute("aria-label", "Rotary parameter")
        element.setAttribute("tabindex", "0")
        element.setAttribute("title", "Alt+drag vertically to adjust; drag normally to move. Arrow keys also adjust.")
        element.addEventListener("pointerdown", this.onPointerDown)
        element.addEventListener("mousedown", this.onMouseDown)
        element.addEventListener("keydown", this.onKeyDown)
        window.addEventListener("pointermove", this.onPointerMove)
        window.addEventListener("pointerup", this.onPointerUp)
        window.addEventListener("pointercancel", this.onPointerUp)
        this.indicator = document.createElement("div")
        Object.assign(this.indicator.style, {
            position: "absolute",
            display: "block",
            width: "8%",
            height: "42%",
            left: "46%",
            top: "8%",
            borderRadius: "999px",
            transformOrigin: "50% 100%",
        })
        element.appendChild(this.indicator)
        this.declareField(this.host.html!!, element)
        this.updateVisual()
        return element
    }

    override destroyElement(): void {
        this.element?.removeEventListener("pointerdown", this.onPointerDown)
        this.element?.removeEventListener("mousedown", this.onMouseDown)
        this.element?.removeEventListener("keydown", this.onKeyDown)
        window.removeEventListener("pointermove", this.onPointerMove)
        window.removeEventListener("pointerup", this.onPointerUp)
        window.removeEventListener("pointercancel", this.onPointerUp)
        this.onPointerUp()
        this.element?.remove()
        this.element = undefined
        this.indicator = undefined
    }

    override createNode(scene: Scene): TransformNode {
        const root = this.root = new TransformNode("rotary_knob_root", scene)
        const knob = this.knob = MeshBuilder.CreateCylinder("rotary_knob", { diameter: 1, height: 0.9, tessellation: 32 }, scene)
        const baseMaterial = this.baseMaterial = new StandardMaterial("rotary_knob_material", scene)
        baseMaterial.diffuseColor = this.baseColor
        baseMaterial.specularColor.set(0.65, 0.65, 0.65)
        knob.material = baseMaterial
        knob.position.y = -0.05
        knob.parent = root

        const pointer = this.pointer = MeshBuilder.CreateBox("rotary_knob_pointer", { width: 0.1, height: 0.12, depth: 0.6 }, scene)
        const pointerMaterial = this.pointerMaterial = new StandardMaterial("rotary_knob_pointer_material", scene)
        pointerMaterial.diffuseColor = this.indicatorColor
        pointerMaterial.emissiveColor = this.indicatorColor.scale(0.15)
        pointerMaterial.specularColor.set(0.5, 0.5, 0.5)
        pointer.material = pointerMaterial
        pointer.position.set(0, 0.46, 0.3)
        pointer.parent = knob
        let lastPointerY = 0
        let dragging = false
        const observer = scene.onPointerObservable.add(pointerInfo => {
            if(pointerInfo.type === PointerEventTypes.POINTERDOWN){
                const picked = pointerInfo.pickInfo?.pickedMesh
                if(picked !== knob && picked !== pointer) return
                dragging = true
                lastPointerY = scene.pointerY
                scene.activeCamera?.detachControl()
                this.restoreCameraControls = () => scene.activeCamera?.attachControl(false, false)
                pointerInfo.event?.preventDefault()
            }else if(pointerInfo.type === PointerEventTypes.POINTERMOVE && dragging){
                const delta = lastPointerY - scene.pointerY
                lastPointerY = scene.pointerY
                this.setNormalizedValue(this.getNormalizedValue() + delta / 150)
            }else if(
                (pointerInfo.type === PointerEventTypes.POINTERUP || pointerInfo.type === PointerEventTypes.POINTERDOUBLETAP)
                && dragging
            ){
                dragging = false
                this.restoreCameraControls?.()
                this.restoreCameraControls = undefined
            }
        })
        this.pointerObserver = () => scene.onPointerObservable.remove(observer)
        this.declareField(this.host.babylonjs!!, knob)
        this.updateVisual()
        return root
    }

    override destroyNode(): void {
        this.pointerObserver?.()
        this.pointerObserver = undefined
        this.restoreCameraControls?.()
        this.restoreCameraControls = undefined
        this.knob?.dispose()
        this.pointer?.dispose()
        this.root?.dispose()
        this.baseMaterial?.dispose()
        this.pointerMaterial?.dispose()
        this.knob = undefined
        this.pointer = undefined
        this.root = undefined
        this.baseMaterial = undefined
        this.pointerMaterial = undefined
    }

    private updateVisual(): void {
        if(this.element){
            this.element.style.backgroundColor = this.baseColor.toHexString()
            const field = this.fields[0]
            this.element.setAttribute("aria-valuemin", (field?.getMin() ?? 0).toString())
            this.element.setAttribute("aria-valuemax", (field?.getMax() ?? 1).toString())
            this.element.setAttribute("aria-valuenow", this.getValue().toString())
            this.element.setAttribute("aria-valuetext", field?.stringify(this.getValue()) ?? this.getValue().toString())
            if(this.hasBoundParameter()) this.element.setAttribute("aria-label", field.getLabel())
        }
        if(this.indicator){
            this.indicator.style.backgroundColor = this.indicatorColor.toHexString()
            this.indicator.style.transform = `rotate(${(this.getNormalizedValue() - 0.5) * 180}deg)`
        }
        if(this.baseMaterial) this.baseMaterial.diffuseColor = this.baseColor
        if(this.pointerMaterial){
            this.pointerMaterial.diffuseColor = this.indicatorColor
            this.pointerMaterial.emissiveColor = this.indicatorColor.scale(0.15)
        }
        if(this.knob) this.knob.rotation.y = (this.getNormalizedValue() - 0.5) * Math.PI
    }

    private onPointerDown = (event: PointerEvent): void => {
        if(event.button !== 0 || !event.altKey) return
        event.preventDefault()
        event.stopPropagation()
        this.dragging = true
        this.previousPointerY = event.clientY
    }

    private onMouseDown = (event: MouseEvent): void => {
        if(event.altKey) event.stopPropagation()
    }

    private onPointerMove = (event: PointerEvent): void => {
        if(!this.dragging) return
        const delta = this.previousPointerY - event.clientY
        this.previousPointerY = event.clientY
        this.setNormalizedValue(this.getNormalizedValue() + delta / 150)
    }

    private onPointerUp = (): void => {
        this.dragging = false
    }

    private onKeyDown = (event: KeyboardEvent): void => {
        const step = this.getNormalizedStepSize() || 0.01
        let next: number | undefined
        if(event.key === "ArrowUp" || event.key === "ArrowRight") next = this.getNormalizedValue() + step
        else if(event.key === "ArrowDown" || event.key === "ArrowLeft") next = this.getNormalizedValue() - step
        else if(event.key === "PageUp") next = this.getNormalizedValue() + 0.1
        else if(event.key === "PageDown") next = this.getNormalizedValue() - 0.1
        else if(event.key === "Home") next = 0
        else if(event.key === "End") next = 1
        if(next === undefined) return
        event.preventDefault()
        event.stopPropagation()
        this.setNormalizedValue(next)
    }

    static Factory = class extends ParameterControlFactory {
        constructor(readonly env: ControlEnv) { super() }

        label = "Rotary Knob"
        description = "A metallic rotary-knob skin using the same normalized parameter binding behavior."

        override getSettings(): CSettings {
            return {
                "Base Color": "color",
                "Cursor Color": "color",
                ...super.getSettings(),
            }
        }

        override getDefaultValues(): CSettingsValues {
            return {
                "Base Color": "#222222",
                "Cursor Color": "#00a6ff",
            }
        }

        override async create(): Promise<Control> {
            await this.init()
            return new RotaryKnobControl(this)
        }
    }

    static Type = async (env: ControlEnv) => new this.Factory(env)
}
