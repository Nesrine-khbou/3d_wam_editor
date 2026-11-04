import {
    AbstractMesh,
    ActionManager,
    Color3,
    ExecuteCodeAction,
    MeshBuilder,
    PointerEventTypes,
    Scene,
    StandardMaterial,
    TransformNode,
} from "@babylonjs/core"
import { Control, ControlEnv } from "../../Control.ts"
import { CSettings, CSettingsValues } from "../settings/settings.ts"
import { ParameterControl, ParameterControlFactory } from "./ParameterControl.ts"

abstract class BooleanParameterControl extends ParameterControl {
    protected element?: HTMLButtonElement
    protected root?: TransformNode
    protected housing?: AbstractMesh
    protected switchMesh?: AbstractMesh
    protected housingMaterial?: StandardMaterial
    protected switchMaterial?: StandardMaterial
    protected isPressed = false
    private readonly elementDisposables: (() => void)[] = []
    private removePointerObserver?: () => void
    protected onColor = Color3.FromHexString("#46c887")
    protected offColor = Color3.FromHexString("#555b66")

    protected abstract readonly interaction: "toggle" | "momentary"
    protected abstract readonly labelText: string

    override updateValue(label: string, value: string | number | boolean): void {
        if(label === "On Color") this.onColor = Color3.FromHexString(value as string)
        else if(label === "Off Color") this.offColor = Color3.FromHexString(value as string)
        else super.updateValue(label, value)
        this.updateVisual()
    }

    override onParamChange(): void {
        this.updateVisual()
    }

    protected get isOn(): boolean {
        return this.getNormalizedValue(0) >= 0.5
    }

    protected toggle = (): void => {
        this.setNormalizedValue(this.isOn ? 0 : 1)
    }

    protected press = (): void => {
        if(this.isPressed) return
        this.isPressed = true
        this.setNormalizedValue(1)
    }

    protected release = (): void => {
        if(!this.isPressed) return
        this.isPressed = false
        this.setNormalizedValue(0)
    }

    override destroy(): void {
        if(this.interaction === "momentary") this.release()
        super.destroy()
    }

    override createElement(): HTMLElement {
        const element = this.element = document.createElement("button")
        element.type = "button"
        element.className = `wam-boolean-control wam-boolean-control--${this.interaction}`
        element.textContent = this.labelText
        element.setAttribute("aria-label", this.labelText)
        element.setAttribute("aria-pressed", "false")
        element.style.width = "100%"
        element.style.height = "100%"
        element.style.boxSizing = "border-box"
        element.style.borderRadius = "999px"
        element.style.cursor = "pointer"
        element.style.fontWeight = "bold"
        this.declareField(this.host.html!!, element)

        if(this.interaction === "toggle"){
            element.addEventListener("click", this.toggle)
            this.elementDisposables.push(() => element.removeEventListener("click", this.toggle))
        }else{
            const startPress = (event: Event): void => {
                event.preventDefault()
                this.press()
            }
            const endPress = (): void => this.release()
            element.addEventListener("pointerdown", startPress)
            element.addEventListener("pointercancel", endPress)
            element.addEventListener("lostpointercapture", endPress)
            element.addEventListener("keydown", this.onKeyDown)
            element.addEventListener("keyup", this.onKeyUp)
            window.addEventListener("pointerup", endPress)
            window.addEventListener("blur", endPress)
            this.elementDisposables.push(
                () => element.removeEventListener("pointerdown", startPress),
                () => element.removeEventListener("pointercancel", endPress),
                () => element.removeEventListener("lostpointercapture", endPress),
                () => element.removeEventListener("keydown", this.onKeyDown),
                () => element.removeEventListener("keyup", this.onKeyUp),
                () => window.removeEventListener("pointerup", endPress),
                () => window.removeEventListener("blur", endPress),
            )
        }
        this.updateVisual()
        return element
    }

    private onKeyDown = (event: KeyboardEvent): void => {
        if(event.code !== "Space" && event.code !== "Enter") return
        event.preventDefault()
        this.press()
    }

    private onKeyUp = (event: KeyboardEvent): void => {
        if(event.code === "Space" || event.code === "Enter") this.release()
    }

    override destroyElement(): void {
        if(this.interaction === "momentary") this.release()
        this.elementDisposables.splice(0).forEach(dispose => dispose())
        this.element?.remove()
        this.element = undefined
    }

    override createNode(scene: Scene): TransformNode {
        const root = this.root = new TransformNode(`${this.interaction}_switch`, scene)
        const housing = this.housing = MeshBuilder.CreateBox("switch_housing", { width: 0.9, height: 0.18, depth: 0.9 }, scene)
        this.housingMaterial = new StandardMaterial("switch_housing_material", scene)
        this.housingMaterial.diffuseColor = Color3.FromHexString("#252a31")
        this.housingMaterial.specularColor.set(0.08, 0.08, 0.08)
        housing.material = this.housingMaterial
        housing.position.y = -0.43
        housing.parent = root

        const switchMesh = this.switchMesh = MeshBuilder.CreateBox("switch_control", { width: 0.55, height: 0.22, depth: 0.55 }, scene)
        this.switchMaterial = new StandardMaterial("switch_control_material", scene)
        switchMesh.material = this.switchMaterial
        switchMesh.parent = root
        switchMesh.actionManager = new ActionManager(scene)
        if(this.interaction === "toggle"){
            switchMesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickTrigger, this.toggle))
        }else{
            switchMesh.actionManager.registerAction(new ExecuteCodeAction(ActionManager.OnPickDownTrigger, this.press))
            const observer = scene.onPointerObservable.add(pointerInfo => {
                if(pointerInfo.type === PointerEventTypes.POINTERUP) this.release()
            })
            this.removePointerObserver = () => scene.onPointerObservable.remove(observer)
        }
        this.declareField(this.host.babylonjs!!, switchMesh)
        this.updateVisual()
        return root
    }

    private updateVisual(): void {
        const active = this.isOn
        const color = active ? this.onColor : this.offColor
        if(this.element){
            this.element.setAttribute("aria-pressed", active.toString())
            this.element.textContent = this.interaction === "toggle"
                ? (active ? "ON" : "OFF")
                : (active ? "Pressed" : this.labelText)
            this.element.style.backgroundColor = color.toHexString()
            this.element.style.color = active ? "#101820" : "#ffffff"
            this.element.style.transform = this.interaction === "momentary" && active ? "translateY(2px)" : ""
        }
        if(this.switchMaterial) this.switchMaterial.diffuseColor = color
        if(this.switchMesh){
            if(this.interaction === "toggle"){
                this.switchMesh.position.x = active ? 0.16 : -0.16
                this.switchMesh.rotation.z = active ? -0.2 : 0.2
            }else{
                this.switchMesh.position.y = active ? -0.28 : -0.16
            }
        }
    }

    override destroyNode(): void {
        this.removePointerObserver?.()
        this.removePointerObserver = undefined
        this.housing?.dispose()
        this.switchMesh?.dispose()
        this.root?.dispose()
        this.housingMaterial?.dispose()
        this.switchMaterial?.dispose()
        this.housing = undefined
        this.switchMesh = undefined
        this.root = undefined
        this.housingMaterial = undefined
        this.switchMaterial = undefined
    }
}

export class ToggleSwitchControl extends BooleanParameterControl {
    protected readonly interaction = "toggle" as const
    protected readonly labelText = "Toggle"

    static Factory = class extends ParameterControlFactory {
        constructor(readonly env: ControlEnv) { super() }
        label = "Toggle Switch"
        description = "A two-state switch bound to one numeric WAM parameter."
        override getSettings(): CSettings {
            return { "On Color": "color", "Off Color": "color", ...super.getSettings() }
        }
        override getDefaultValues(): CSettingsValues {
            return { "On Color": "#46c887", "Off Color": "#555b66" }
        }
        override async create(): Promise<Control> {
            await this.init()
            return new ToggleSwitchControl(this)
        }
    }

    static Type = async (env: ControlEnv) => new this.Factory(env)
}

export class MomentaryButtonControl extends BooleanParameterControl {
    protected readonly interaction = "momentary" as const
    protected readonly labelText = "Press"

    static Factory = class extends ParameterControlFactory {
        constructor(readonly env: ControlEnv) { super() }
        label = "Momentary Button"
        description = "A press-and-release button bound to one numeric WAM parameter."
        override getSettings(): CSettings {
            return { "On Color": "color", "Off Color": "color", ...super.getSettings() }
        }
        override getDefaultValues(): CSettingsValues {
            return { "On Color": "#ffbc42", "Off Color": "#555b66" }
        }
        override async create(): Promise<Control> {
            await this.init()
            return new MomentaryButtonControl(this)
        }
    }

    static Type = async (env: ControlEnv) => new this.Factory(env)
}
