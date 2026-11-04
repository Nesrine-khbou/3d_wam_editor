import { Color3, DynamicTexture, MeshBuilder, Scene, StandardMaterial, TransformNode } from "@babylonjs/core"
import { Control, ControlEnv } from "../../Control.ts"
import { CSettings, CSettingsValues } from "../settings/settings.ts"
import { ParameterControl, ParameterControlFactory } from "./ParameterControl.ts"

export class NumericDisplayControl extends ParameterControl {
    private element?: HTMLDivElement
    private lines: HTMLDivElement[] = []
    private root?: TransformNode
    private mesh?: ReturnType<typeof MeshBuilder.CreatePlane>
    private texture?: DynamicTexture
    private material?: StandardMaterial
    private format: "parameter" | "decimal" | "percent" | "label" = "parameter"
    private precision = 2
    private units = ""

    override updateValue(label: string, value: string | number | boolean): void {
        if(label === "Display Format") this.format = value as typeof this.format
        else if(label === "Decimal Places") this.precision = value as number
        else if(label === "Units") this.units = value as string
        else super.updateValue(label, value)
        this.updateDisplay()
    }

    override onParamChange(): void {
        this.updateDisplay()
    }

    override createElement(): HTMLElement {
        const element = this.element = document.createElement("div")
        element.className = "wam-numeric-display"
        element.setAttribute("role", "status")
        element.setAttribute("aria-label", "Read-only parameter display")
        element.style.width = "100%"
        element.style.height = "100%"
        element.style.boxSizing = "border-box"
        element.style.display = "flex"
        element.style.flexDirection = "column"
        element.style.justifyContent = "center"
        element.style.overflow = "hidden"
        element.style.padding = "4%"
        element.style.background = "#111820"
        element.style.color = "#9effa8"
        element.style.fontFamily = "monospace"
        element.style.fontWeight = "bold"
        element.style.textAlign = "right"
        element.style.border = "2px solid #46515e"
        element.style.borderRadius = "8%"
        this.lines = [document.createElement("div"), document.createElement("div")]
        this.lines.forEach(line => {
            line.style.whiteSpace = "nowrap"
            line.style.overflow = "hidden"
            line.style.textOverflow = "ellipsis"
            line.style.flex = "1 1 50%"
            line.style.display = "flex"
            line.style.alignItems = "center"
            line.style.justifyContent = "flex-end"
            element.appendChild(line)
        })
        this.updateDisplay()
        return element
    }

    override destroyElement(): void {
        this.element?.remove()
        this.element = undefined
        this.lines = []
    }

    override createNode(scene: Scene): TransformNode {
        const root = this.root = new TransformNode("numeric_display_root", scene)
        const mesh = this.mesh = MeshBuilder.CreatePlane("numeric_display", { size: 0.9 }, scene)
        mesh.rotation.x = Math.PI / 2
        mesh.position.y = -0.35
        mesh.parent = root

        const texture = this.texture = new DynamicTexture(
            "numeric_display_texture",
            { width: 512, height: 256 },
            scene,
            false,
        )
        texture.hasAlpha = false
        const material = this.material = new StandardMaterial("numeric_display_material", scene)
        material.diffuseTexture = texture
        material.emissiveColor = Color3.White()
        material.specularColor.set(0, 0, 0)
        mesh.material = material
        this.updateDisplay()
        return root
    }

    override destroyNode(): void {
        this.mesh?.dispose()
        this.root?.dispose()
        this.material?.dispose()
        this.texture?.dispose()
        this.mesh = undefined
        this.root = undefined
        this.material = undefined
        this.texture = undefined
    }

    private formatLine(index: number): string {
        if(!this.hasBoundParameter(index)) return index === 0 ? "—" : ""
        const field = this.fields[index]
        const value = field.getValue()
        let text: string
        switch(this.format){
            case "decimal":
                text = value.toFixed(this.precision)
                break
            case "percent":
                text = `${Math.round(this.getNormalizedValue(index) * 100)}%`
                break
            case "label":
                text = `${field.getLabel()}: ${field.stringify(value)}`
                break
            default:
                text = field.stringify(value)
        }
        return `${text}${this.units ? ` ${this.units}` : ""}`
    }

    private updateDisplay(): void {
        const content = [this.formatLine(0), this.formatLine(1)]
        this.lines.forEach((line, index) => line.textContent = content[index])
        const texture = this.texture
        if(texture){
            const context = texture.getContext() as CanvasRenderingContext2D
            context.clearRect(0, 0, 512, 256)
            context.fillStyle = "#111820"
            context.fillRect(0, 0, 512, 256)
            context.fillStyle = "#9effa8"
            context.font = "bold 64px monospace"
            context.textAlign = "right"
            context.textBaseline = "middle"
            context.fillText(content[0], 480, content[1] ? 86 : 128, 450)
            if(content[1]) context.fillText(content[1], 480, 184, 450)
            texture.update(false)
        }
    }

    static Factory = class extends ParameterControlFactory {
        constructor(readonly env: ControlEnv) { super() }

        label = "Numeric Display"
        description = "A read-only one- or two-line display bound to WAM parameter data."

        override getParameterLabels(): string[] {
            return ["Target 1", "Target 2"]
        }

        override getSettings(): CSettings {
            return {
                ...super.getSettings(),
                "Display Format": { choice: ["parameter", "decimal", "percent", "label"] },
                "Decimal Places": { min: 0, max: 6, step: 1 },
                Units: "text",
            }
        }

        override getDefaultValues(): CSettingsValues {
            return {
                "Target 1": "None",
                "Target 2": "None",
                "Display Format": "parameter",
                "Decimal Places": 2,
                Units: "",
            }
        }

        override async create(): Promise<Control> {
            await this.init()
            return new NumericDisplayControl(this)
        }
    }

    static Type = async (env: ControlEnv) => new this.Factory(env)
}
