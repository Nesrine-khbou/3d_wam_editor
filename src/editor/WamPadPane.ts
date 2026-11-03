import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core"
import { html } from "../utils/doc.ts"
import { OValue } from "../observable/collections/OValue.ts"
import { WamGUIGenerator } from "../WamGUIGenerator.ts"
import { DECORATION_SHAPE_MODIFIER, DECORATION_SHAPE_POINTS } from "../utils/visual/Decoration.ts"
import { WamThumbnailReference } from "../utils/thumbnail-reference.ts"
import { HistoryCommandRunner } from "./DocumentHistory.ts"
import { DEFAULT_FACE_TRANSFORM, FaceTransform } from "../utils/visual/faceTransform.ts"

export class WamPadPane implements IContentRenderer{

    private shape = html.a`
        <select>
            ${
                Object.keys(DECORATION_SHAPE_POINTS)
                    .map(it=>html.a`<option value=${it}>${it[0].toUpperCase()+it.substring(1)}</option>`)
            }
        </select>
    ` as HTMLSelectElement
    private aspect_ratio = html.a`<input type="number" min="0.1" max="10" step="0.1" value="1"/>` as HTMLInputElement
    private size = html.a`<input type="number" min="0.1" max="1" step="0.1" value=".8"/>` as HTMLInputElement
    private use_world_width = html.a`<input type="checkbox"/>` as HTMLInputElement
    private world_width = html.a`<input type="number" min="0.01" step="0.01" value="2"/>` as HTMLInputElement
    private world_width_slider = html.a`<input type="range" min="0.01" max="10" step="0.01" value="2"/>` as HTMLInputElement
    private top_color = html.a`<input type="color" value="#555555"/>` as HTMLInputElement
    private bottom_color = html.a`<input type="color" value="#222222"/>` as HTMLInputElement
    private face_color = html.a`<input type="color" value="#ffffff"/>` as HTMLInputElement
    private front_face = html.a`<input type="text" value=""/>` as HTMLInputElement
    private face_x = html.a`<input type="number" step="0.01"/>` as HTMLInputElement
    private face_x_slider = html.a`<input type="range" min="-5" max="5" step="0.01"/>` as HTMLInputElement
    private face_y = html.a`<input type="number" step="0.01"/>` as HTMLInputElement
    private face_y_slider = html.a`<input type="range" min="-5" max="5" step="0.01"/>` as HTMLInputElement
    private face_rotation = html.a`<input type="number" step="1"/>` as HTMLInputElement
    private face_rotation_slider = html.a`<input type="range" min="-180" max="180" step="1"/>` as HTMLInputElement
    private face_scale = html.a`<input type="number" min="0.001" step="0.01"/>` as HTMLInputElement
    private face_scale_slider = html.a`<input type="range" min="0.1" max="3" step="0.01"/>` as HTMLInputElement
    private reset_face_transform = html.a`<button type="button">Reset texture transform</button>` as HTMLButtonElement
    private show_face_transform_overlay = html.a`<input type="checkbox"/>` as HTMLInputElement
    private face_transform_status = html.a`<div role="status" aria-live="polite"></div>`
    private use_reference_texture = html.a`<button type="button">Use reference as body texture</button>` as HTMLButtonElement
    private use_reference_ratio = html.a`<button type="button">Use reference aspect ratio</button>` as HTMLButtonElement
    private reset_aspect_ratio = html.a`<button type="button">Reset aspect ratio to 1:1</button>` as HTMLButtonElement
    private reference_visible = html.a`<input type="checkbox" checked/>` as HTMLInputElement
    private reference_opacity = html.a`<input type="range" min="0" max="1" step="0.01" value="0.35"/>` as HTMLInputElement
    private reference_status = html.a`<div role="status" aria-live="polite"></div>`
    private outline_width = html.a`<input type="range" min="0" max="0.5" step="0.01" value="0"/>` as HTMLInputElement
    private outline_color = html.a`<input type="color" value="#000000"/>` as HTMLInputElement
    private modifier = html.a`<select>${Object.keys(DECORATION_SHAPE_MODIFIER).map(it=>html.a`<option value="${it}">${it}</option>`)}<select/>` as HTMLInputElement
    private modifier_strength = html.a`<input type="range" min="0" max="1" step="0.01" value="0"/>` as HTMLInputElement

    element = html.a/*html*/`
        <div class="menu _vertical _scrollable form_container">
            <label>Shape</label> ${this.shape}
            <label>Modifier</label> ${this.modifier} ${this.modifier_strength}
            <label>Pad Aspect Ratio</label> ${this.aspect_ratio}
            ${this.use_reference_ratio} ${this.reset_aspect_ratio}
            <label>Pad Size</label> ${this.size}
            <label>${this.use_world_width} Use explicit 3D body width</label>
            <label>Logical 3D body width</label> ${this.world_width} ${this.world_width_slider}
            <small>Babylon.js units; body height is width ÷ aspect ratio. Leave unchecked to use legacy size.</small>
            <label>Pad Gradient</label> ${this.top_color} ${this.bottom_color}
            <label>Outline</label> ${this.outline_color} ${this.outline_width}
            <label>Front face image</label> ${this.front_face} ${this.face_color}
            <label>Texture translation X</label> ${this.face_x} ${this.face_x_slider}
            <label>Texture translation Y</label> ${this.face_y} ${this.face_y_slider}
            <label>Texture rotation (clockwise degrees)</label> ${this.face_rotation} ${this.face_rotation_slider}
            <label>Texture uniform scale</label> ${this.face_scale} ${this.face_scale_slider}
            ${this.reset_face_transform}
            <label>${this.show_face_transform_overlay} Show 2D transform overlay</label>
            ${this.face_transform_status}
            <label>Design reference</label>
            <label>${this.reference_visible} Show 2D reference overlay</label>
            ${this.reference_opacity}
            ${this.reference_status}
            ${this.use_reference_texture}
        </div>
    `

    constructor(
        gui_generator: OValue<WamGUIGenerator>,
        private readonly thumbnailReference: WamThumbnailReference,
        private readonly runHistoryCommand: HistoryCommandRunner = async (_label, operation) => operation(),
        private readonly historyTransaction?: {begin(label: string): void; commit(): void},
        private readonly setFaceTransformOverlayVisible: (visible: boolean) => void = () => {},
    ){
        const pane = this

        gui_generator.link(({to:gui})=>{
            gui.pad_shape.link(({to}) => pane.shape.value=to)
            gui.aspect_ratio.link(({to}) => pane.aspect_ratio.value=to.toString())
            gui.size.link(({to}) => pane.size.value=to.toString())
            gui.world_width.link(({to}) => {
                pane.use_world_width.checked = to !== null
                pane.world_width.disabled = to === null
                pane.world_width_slider.disabled = to === null
                const width = to ?? (Number(pane.world_width.value) || 2)
                pane.world_width.value = width.toString()
                pane.world_width_slider.max = Math.max(10, width).toString()
                pane.world_width_slider.value = width.toString()
            })
            gui.top_color.link(({to}) => pane.top_color.value=to)
            gui.bottom_color.link(({to}) => pane.bottom_color.value=to)
            gui.front_face.link(({to}) => pane.front_face.value=to??"")
            gui.face_transform.link(({to}) => {
                for(const input of [
                    pane.face_x, pane.face_x_slider,
                    pane.face_y, pane.face_y_slider,
                    pane.face_rotation, pane.face_rotation_slider,
                    pane.face_scale, pane.face_scale_slider,
                ]){
                    input.removeAttribute("aria-invalid")
                }
                pane.face_transform_status.textContent = ""
                pane.face_x.value = to.x.toString()
                pane.face_x_slider.value = to.x.toString()
                pane.face_y.value = to.y.toString()
                pane.face_y_slider.value = to.y.toString()
                pane.face_rotation.value = to.rotation_degrees.toString()
                pane.face_rotation_slider.value = to.rotation_degrees.toString()
                pane.face_scale.value = to.scale.toString()
                pane.face_scale_slider.value = to.scale.toString()
            })
            gui.pad_outline_color.link(({to}) => pane.outline_color.value=to)
            gui.pad_outline_width.link(({to}) => pane.outline_width.value=to.toString())
            gui.front_face_color.link(({to}) => pane.face_color.value=to)
            gui.modifier.link(({to}) => pane.modifier.value=to)
            gui.modifier_strength.link(({to}) => pane.modifier_strength.value=to.toString())
        })
        
        this.shape.oninput = ()=> gui_generator.value.pad_shape.value = this.shape.value as "rectangle"|"circle"|"triangle"
        this.top_color.oninput = ()=> gui_generator.value.top_color.value = this.top_color.value
        this.bottom_color.oninput = ()=> gui_generator.value.bottom_color.value = this.bottom_color.value
        this.face_color.oninput = ()=> gui_generator.value.front_face_color.value = this.face_color.value
        this.front_face.oninput = ()=> gui_generator.value.front_face.value = this.front_face.value=="" ? null : this.front_face.value
        const transformInputs: [HTMLInputElement, keyof FaceTransform][] = [
            [this.face_x, "x"],
            [this.face_x_slider, "x"],
            [this.face_y, "y"],
            [this.face_y_slider, "y"],
            [this.face_rotation, "rotation_degrees"],
            [this.face_rotation_slider, "rotation_degrees"],
            [this.face_scale, "scale"],
            [this.face_scale_slider, "scale"],
        ]
        const updateFaceTransform = (input: HTMLInputElement, key: keyof FaceTransform) => {
            const value = Number(input.value)
            if(input.value.trim() === "" || !Number.isFinite(value) || (key === "scale" && value <= 0)){
                input.setAttribute("aria-invalid", "true")
                this.face_transform_status.textContent = key === "scale"
                    ? "Scale must be finite and greater than 0."
                    : "Texture transform values must be finite numbers."
                return
            }
            input.removeAttribute("aria-invalid")
            this.face_transform_status.textContent = ""
            gui_generator.value.face_transform.value = {
                ...gui_generator.value.face_transform.value,
                [key]: value,
            }
        }
        for(const [input, key] of transformInputs){
            input.onfocus = () => this.historyTransaction?.begin("Transform face texture")
            input.onpointerdown = () => this.historyTransaction?.begin("Transform face texture")
            input.onkeydown = event => {
                if(!event.repeat) this.historyTransaction?.begin("Transform face texture")
            }
            input.oninput = () => updateFaceTransform(input, key)
            input.onchange = () => this.historyTransaction?.commit()
        }
        this.reset_face_transform.onclick = () => {
            void this.runHistoryCommand(
                "Reset face texture transform",
                () => { gui_generator.value.face_transform.value = {...DEFAULT_FACE_TRANSFORM} },
            ).catch(error => console.error("Unable to reset face texture transform", error))
        }
        this.show_face_transform_overlay.onchange = () =>
            this.setFaceTransformOverlayVisible(this.show_face_transform_overlay.checked)
        this.reference_visible.oninput = () => {
            this.thumbnailReference.visible.value = this.reference_visible.checked
        }
        this.reference_opacity.oninput = () => {
            this.thumbnailReference.opacity.value = parseFloat(this.reference_opacity.value)
        }
        this.use_reference_ratio.onclick = () => {
            const state = this.thumbnailReference.state.value
            if(state.status === "ready"){
                void this.runHistoryCommand(
                    "Set aspect ratio from reference",
                    () => { gui_generator.value.aspect_ratio.value = state.aspectRatio },
                ).catch(error => console.error("Unable to set aspect ratio from reference", error))
            }
        }
        this.reset_aspect_ratio.onclick = () => {
            void this.runHistoryCommand(
                "Reset aspect ratio",
                () => { gui_generator.value.aspect_ratio.value = 1 },
            ).catch(error => console.error("Unable to reset aspect ratio", error))
        }
        this.use_reference_texture.onclick = () => {
            const state = this.thumbnailReference.state.value
            if(state.status === "ready"){
                void this.runHistoryCommand(
                    "Use reference as body texture",
                    () => { gui_generator.value.front_face.value = state.url },
                ).catch(error => console.error("Unable to use reference as body texture", error))
            }
        }
        this.thumbnailReference.visible.link(({to}) => this.reference_visible.checked = to)
        this.thumbnailReference.opacity.link(({to}) => this.reference_opacity.value = to.toString())
        this.thumbnailReference.state.link(({to}) => {
            if(to.status === "loading"){
                this.reference_status.textContent = `Loading reference image: ${to.url}`
            }else if(to.status === "ready"){
                this.reference_status.textContent =
                    `${to.naturalWidth} × ${to.naturalHeight} px · ratio ${to.aspectRatio.toFixed(4)}:1 · ${to.url}`
            }else if(to.status === "error"){
                this.reference_status.textContent = to.message
            }else{
                this.reference_status.textContent = "No WAM thumbnail is available."
            }
        })
        const setWorldWidth = (value: string) => {
            const width = Number(value)
            if(!Number.isFinite(width) || width <= 0){
                this.world_width.value = (gui_generator.value.world_width.value ?? 2).toString()
                return
            }
            this.world_width.value = width.toString()
            this.world_width_slider.max = Math.max(10, width).toString()
            this.world_width_slider.value = width.toString()
            if(this.use_world_width.checked) gui_generator.value.world_width.value = width
        }
        this.use_world_width.onchange = () => {
            gui_generator.value.world_width.value = this.use_world_width.checked
                ? Number(this.world_width.value)
                : null
        }
        this.world_width.oninput = () => setWorldWidth(this.world_width.value)
        this.world_width_slider.oninput = () => setWorldWidth(this.world_width_slider.value)
        this.aspect_ratio.oninput = () => {
            const ratio = Number(this.aspect_ratio.value)
            if(!Number.isFinite(ratio) || ratio <= 0){
                this.aspect_ratio.value = gui_generator.value.aspect_ratio.value.toString()
                return
            }
            gui_generator.value.aspect_ratio.value = ratio
        }
        this.size.oninput = ()=> gui_generator.value.size.value = parseFloat(this.size.value)
        this.outline_color.oninput = ()=> gui_generator.value.pad_outline_color.value = this.outline_color.value
        this.outline_width.oninput = ()=> gui_generator.value.pad_outline_width.value = parseFloat(this.outline_width.value)
        this.modifier.oninput = ()=> gui_generator.value.modifier.value = this.modifier.value as string
        this.modifier_strength.oninput = ()=> gui_generator.value.modifier_strength.value = parseFloat(this.modifier_strength.value)
    }

    init(_: GroupPanelPartInitParameters): void {
    }

}