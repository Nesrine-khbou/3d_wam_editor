import { WamNode, WebAudioModule } from "@webaudiomodules/api"
import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core"
import { MOValue, OValue } from "../observable/collections/OValue.ts"
import { ControlLibrary, WamGUICode, WamGUIGenerator } from "../WamGUIGenerator.ts"
import { html } from "../utils/doc.ts"
import { Color3 } from "@babylonjs/core"
import { CSettingsValue, CSettingsValues } from "../control/controls/settings/settings.ts"
import { linkInput } from "../observable/input_observable.ts"
import { DEFAULT_CONTROL_CONTEXT_TARGET } from "../control/Control.ts"
import { loadWamThumbnailReference } from "../utils/thumbnail-reference.ts"

export class AutoLayoutPane implements IContentRenderer{

    element = html.a`<div class="menu _center _fill _vertical _scrollable"></div>`

    constructor(
        private wam: OValue<WebAudioModule<WamNode>|null>,
        private url: OValue<string>,
        private library: ControlLibrary,
        private readonly onApplyLayout: (code: WamGUICode) => Promise<void>,
        private controls: {
            parameter: {control:keyof ControlLibrary, values:CSettingsValues}[],
            input: {control:keyof ControlLibrary, values:CSettingsValues}[],
            output: {control:keyof ControlLibrary, values:CSettingsValues}[],
            event_input: {control:keyof ControlLibrary, values:CSettingsValues}[],
            event_output: {control:keyof ControlLibrary, values:CSettingsValues}[],
        }
    ){
        this.parameter = new MOValue(Object.values(this.controls.parameter)[0])
        this.input = new MOValue(Object.values(this.controls.input)[0])
        this.output = new MOValue(Object.values(this.controls.output)[0])
        this.event_input = new MOValue(Object.values(this.controls.event_input)[0])
        this.event_output = new MOValue(Object.values(this.controls.event_output)[0])
    }

    readonly parameter
    readonly input
    readonly output
    readonly event_input
    readonly event_output
    readonly spacing = new MOValue(0.05)
    readonly handle = new MOValue(0.2)

    private replace_value(values: CSettingsValues, map: Record<string,CSettingsValue>){
        for(const [key,value] of Object.entries(values)){
            if(typeof value=="string" && value.startsWith("[") && value.endsWith("]")){
                const replacement = map[value.slice(1,-1)]
                values[key] = replacement
            }
        }
    }

    private calculate_color(canvas: CanvasRenderingContext2D, x1:number, x2:number, y1:number, y2:number){
        const image = canvas.getImageData(x1,y1,x2-x1,y2-y1)
        let count = 0
        let red=0, green=0, blue=0
        for(let i=0; i<image.data.length; i+=4){
            red += image.data[i]
            green += image.data[i+1]
            blue += image.data[i+2]
            count++
        }
        red/=count
        green/=count
        blue/=count
        return Color3.FromInts(red,green,blue).toHexString()

    }

    private async autoLayout(){
        const wam = this.wam.value 

        const reference = await loadWamThumbnailReference(
            this.url.value,
            wam?.descriptor?.thumbnail,
        )
        const image = reference?.image ?? null
        const thumbnail = reference?.url ?? null

        // Get the aspect ratio of the WAM from the thumbnail
        let ratio = 1
        let pad_width = 1
        let pad_height = 1
        let size = 1
        let spacing = this.spacing.value
        let handle = this.handle.value
        if(reference){
            ratio = reference.aspectRatio
            if(ratio<1){
                pad_width = ratio
                pad_height = 1
            }else{
                pad_width = 1
                pad_height = 1/ratio
            }
        }
        if(ratio>.6) size = .6/ratio

        // Get background color
        let top_color = "#ffffff"
        let bottom_color = "#ffffff"
        if(image){
            const canvas = document.createElement("canvas")
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
            const ctx = canvas.getContext("2d")!!
            ctx.drawImage(image,0,0)
            top_color = this.calculate_color(ctx, 0, canvas.width, 0, Math.floor(canvas.height/2))
            bottom_color = this.calculate_color(ctx, 0, canvas.width, Math.floor(canvas.height/2), canvas.height)
        }

        pad_width *= size
        pad_height *= size
        const pad_x = (1-pad_width)/2
        const pad_y = (1-pad_height)/2

        pad_height *= 1-handle

        let infos = Object.values((await wam?.audioNode.getParameterInfo()) ?? {})
            .filter(info=>{
                return true
            })
            .filter(info=>info.maxValue<Number.MAX_SAFE_INTEGER && info.minValue>Number.MIN_SAFE_INTEGER) // Remove bad parameters

        let per_line = 1
        for(let i=2; i<infos.length; i++){
            if(infos.length/per_line<=per_line*pad_height/pad_width) break
            per_line=i
        }
        let line_count = Math.ceil(infos.length/per_line)

        const parameters = []
        const tile_width = pad_width/per_line
        const tile_height = pad_height/line_count
        for(let i=0; i<infos.length; i++){
            const x=i%per_line
            const y=Math.floor(i/per_line)
            parameters.push({
                x: pad_x + x*tile_width + spacing/2,
                y: pad_y + y*tile_height + spacing/2,
                width: tile_width-spacing,
                height: tile_height-spacing,
                id: infos[i],
            })
        }
        
        return {
            ratio,
            size,
            top_color,
            bottom_color,
            thumbnail,
            parameters,
        }
    }

    declare builder: WamGUIGenerator

    init(_: GroupPanelPartInitParameters): void {        
        const viewer_pane = html.a`<div class="display"></div>`
        viewer_pane.style.width = "10rem"
        viewer_pane.style.height = "10rem"
        viewer_pane.style.aspectRatio = "1/1"
        
        const spacingInput = html.a`<input type="range" min="0.0" max="0.1" step="0.01" />` as HTMLInputElement
        
        const handleInput = html.a`<input type="range" min="0.0" max="0.5" step="0.05" />` as HTMLInputElement
        const applyButton = html.a`<button type="button" disabled>Apply layout to editor</button>` as HTMLButtonElement
        const status = html.a`<div role="status" aria-live="polite"></div>`
        
        const parameterInput = html.a`<select></select>` as HTMLSelectElement
        for(const it of this.controls.parameter) parameterInput.appendChild(html.a`<option ${it.control}>${it.control}</option>`)
        
        const inputInput = html.a`<select></select>` as HTMLSelectElement
        for(const it of this.controls.input) inputInput.appendChild(html.a`<option ${it.control}>${it.control}</option>`)

        const outputInput = html.a`<select></select>` as HTMLSelectElement
        for(const it of this.controls.output) outputInput.appendChild(html.a`<option ${it.control}>${it.control}</option>`)

        this.element.replaceChildren(
            viewer_pane,
            applyButton,
            status,
            html.a`
                <div class="form_containe menu _vertical _inner">
                    <label>Spacing</label> ${spacingInput}
                    <label>Handle</label> ${handleInput}
                    <label>Parameter</label> ${parameterInput}
                    <label>Input</label> ${inputInput}
                    <label>Output</label> ${outputInput}
                </div>
            `,
        )

        const regenerate = async ()=>{
            if(this.builder)this.builder.dispose()

            try{
                this.builder = WamGUIGenerator.create({html:{root:viewer_pane, ...DEFAULT_CONTROL_CONTEXT_TARGET}})

                const layout = await this.autoLayout()
                if(!layout) return
                this.builder.size.value = layout.size
                this.builder.aspect_ratio.value = layout.ratio
                this.builder.front_face.value = layout.thumbnail
                this.builder.top_color.value = layout.top_color
                this.builder.bottom_color.value = layout.bottom_color

                const control = Object.values(this.library)[0]
                for(const {x,y,width,height} of layout.parameters){
                    const type = this.library[this.parameter.value.control]
                    const factory = await this.builder.getFactory(type)
                    const completable = structuredClone(this.parameter.value.values)
                    this.replace_value(completable, {color:layout.top_color})
                    const values = {...structuredClone(factory.getDefaultValues()), ...completable }
                    this.replace_value(values, {color:layout.top_color})
                    await this.builder.addControl({control,x,y,width,height,values})
                }
                applyButton.disabled = false
                status.textContent = `${layout.parameters.length} generated controls ready to apply.`
            }catch(e){
                console.error(e)
                applyButton.disabled = true
                status.textContent = "Unable to generate an auto layout. See the console for details."
            }
        }        

        const disposables = [
            linkInput(spacingInput, this.spacing, parseFloat, (value)=>value.toString()),
            linkInput(handleInput, this.handle, parseFloat, (value)=>value.toString()),
            linkInput(parameterInput, this.parameter, (value)=>this.controls.parameter.find(it=>it.control==value)!!, (control)=>control.control as string),
            linkInput(inputInput, this.input, (value)=>this.controls.input.find(it=>it.control==value)!!, (control)=>control.control as string),
            linkInput(outputInput, this.output, (value)=>this.controls.output.find(it=>it.control==value)!!, (control)=>control.control as string),
            this.wam.observable.add(regenerate),
            this.handle.observable.register(regenerate),
            this.spacing.observable.register(regenerate),
            this.parameter.observable.register(regenerate),
            this.input.observable.register(regenerate),
            this.output.observable.register(regenerate),
        ]

        applyButton.onclick = () => {
            if(!this.builder) return
            const code = structuredClone(this.builder.save(this.library))
            applyButton.disabled = true
            void this.onApplyLayout(code).then(() => {
                status.textContent = "Generated layout applied to the editor."
            }).catch(error => {
                console.error("Unable to apply generated layout", error)
                status.textContent = "Unable to apply generated layout. See the console for details."
            }).finally(() => {
                applyButton.disabled = false
            })
        }

        regenerate()

        this.dispose = () => {
            disposables.forEach(d=>d())
            this.element.replaceChildren()
            this.builder.dispose()
        }
    }

    declare dispose: ()=>void

}