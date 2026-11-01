import { TransformNode } from "@babylonjs/core";
import { WebAudioModule } from "@webaudiomodules/api";
import { ControlMap } from "./control/ControlMap.ts";
import { MOValue } from "./observable/collections/OValue.ts";
import { ControlEnv, ControlFactory, ControlHost, ControlType } from "./control/Control.ts";
import { Decoration } from "./utils/visual/Decoration.ts";
import { CSettingsValues } from "./control/controls/settings/settings.ts";
import { ShareMap } from "./control/ShareMap.ts";
import { WAM_GUI_FEATURES } from "./descriptor/WamGuiDescriptor.ts";

// @ts-ignore
window.WAMExtensions ??= {}

export interface ControlLibrary{
    [id:string]: ControlType
}

export type WamPadShape = "rectangle"
    | "circle"
    | "triangle"

class LogicalWorldWidthValue extends MOValue<number|null>{
    override set(value: number|null): void{
        if(value !== null && (!Number.isFinite(value) || value <= 0)){
            throw new RangeError("world_width must be finite and greater than 0")
        }
        super.set(value)
    }

    override get value(): number|null{
        return super.value
    }

    override set value(value: number|null){
        this.set(value)
    }
}

/**
 * Allow to generated a 3d wam gui from a WamGUICode.
 * It can be used to create a Wam GUI from a WAM GUI code.
 */
export class WamGUIGenerator{
    
    private env
    private controls_factories = new Map<ControlType, ControlFactory>()
    private controls_factories_reverse = new Map<ControlFactory, ControlType>()

    readonly controls: ControlMap

    pad_element?: Element
    pad_node?: TransformNode

    readonly host: ControlHost

    private pad_decoration = new Decoration()
    private disposables = [] as (() => void)[]

    readonly top_color = this.pad_decoration.top_color
    readonly bottom_color = this.pad_decoration.bottom_color
    readonly front_face_color = this.pad_decoration.face_color
    readonly pad_shape = this.pad_decoration.shape
    readonly front_face = this.pad_decoration.front_face
    readonly size = new MOValue(.8)
    readonly aspect_ratio = new MOValue(1)
    readonly world_width = new LogicalWorldWidthValue(null)
    private descriptorSchemaVersion: 1 | 2 = 1
    private requiredFeatures: string[] = []
    private editorFeatures: string[] = []
    readonly pad_outline_width = this.pad_decoration.outline_width
    readonly pad_outline_color = this.pad_decoration.outline_color
    readonly modifier = this.pad_decoration.modifier
    readonly modifier_strength = this.pad_decoration.modifier_strength
    
    private constructor(
        host: Partial<ControlHost>,
    ){
        this.host = {
            ...host,
        }

        this.env = {} as ControlEnv
        this.env.host = host
        this.env.shared = new ShareMap(this.env)
        this.env.sharedTemp = new ShareMap(this.env)


        if(this.host.babylonjs){
            const {root} = this.host.babylonjs

            const visual = this.pad_decoration.createScene(root.getScene())
            const pad_node = this.pad_node = visual.node
            pad_node.parent = root
            this.disposables.push(visual.dispose)

            const updateSize = ()=>{
                const { width, height } = this.getBodyWorldDimensions()
                pad_node.scaling.set(width,0.1,height)
            }

            this.size.observable.add(updateSize)
            this.aspect_ratio.observable.add(updateSize)
            this.world_width.observable.add(updateSize)
            updateSize()
        }


        if(this.host.html){
            const {root} = this.host.html

            const visual = this.pad_decoration.createElement()
            const pad_element = this.pad_element = visual.element as HTMLElement
            this.disposables.push(visual.dispose)

            root.style.contain = "content"
            root.replaceChildren(pad_element)
    
            const updateSize = ()=>{
                const aspect_ratio = this.aspect_ratio.value
                const size = this.size.value
                let [w,h] = aspect_ratio>1 ? [1,1/aspect_ratio] : [aspect_ratio,1]
                let width=size*w
                let height=size*h
                pad_element.style.width = `${Math.round(100*width)}%`
                pad_element.style.height = `${Math.round(100*height)}%`
                pad_element.style.marginLeft = `${Math.round((1-width)*50)}%`
                pad_element.style.marginTop = `${Math.round((1-height)*50)}%`
            }
            this.size.observable.add(updateSize)
            this.aspect_ratio.observable.add(updateSize)
            updateSize()
        }


        //// CONTROLS ////
        this.controls = new ControlMap(this.host.html?.root, this.host.babylonjs?.root)
        const updateControlDimensions = () => {
            const dimensions = this.world_width.value === null
                ? null
                : this.getBodyWorldDimensions()
            this.controls.setWorldDimensions(dimensions)
        }
        this.aspect_ratio.observable.add(updateControlDimensions)
        this.world_width.observable.add(updateControlDimensions)
        updateControlDimensions()

    }

    /**
     * Create a WAM GUI from a WAM GUI code.
     * Don't forget to dispose the wam instance from the control host when you don't need it anymore.
     * @param context The context to use for the WAM GUI.
     * @param gui_target The target of the WAM GUI (An HTML GUI or a 3D GUI ror both)
     * @param init_code The gui code to load.
     * @param library The control library to use for loading the controls.
     * @param audioContext The audio context to use for the WAM GUI.
     * @param groupId The groupd id of the web audio module host.
     * @returns 
     */
    static async create_and_init(context: Partial<ControlHost>, init_code: WAMGuiInitCode, library: ControlLibrary, audioContext: BaseAudioContext, groupId: string): Promise<WamGUIGenerator>{
        const wam_type = (await import(init_code.wam_url))?.default as typeof WebAudioModule
        const wam_instance = await wam_type.createInstance(groupId, audioContext)
        context={...context, wam:wam_instance}
        const generator = new WamGUIGenerator(context)
        await generator.load(init_code, library)
        return generator
    }

    /**
     * Create a WAM GUI Generator.
     * You can then load a WAM GUI descriptor using the load method.
     * @param gui_target 
     * @param context 
     * @returns 
     */
    static create(context: Partial<ControlHost>): WamGUIGenerator{
        return new WamGUIGenerator(context)
    }

    async addControl(added: {control:ControlType, values:CSettingsValues, x:number, y:number, width:number, height:number}){
        const factory = await this.getFactory(added.control)
        const control = await factory.create()
        this.controls.splice(this.controls.length, 0, {control, x:added.x, y:added.y, height:added.height, width:added.width, values:added.values})
    }

    async getFactory(control_type: ControlType): Promise<ControlFactory>{
        if(this.controls_factories.has(control_type)) return this.controls_factories.get(control_type)!!
        const factory = await control_type(this.env)
        this.controls_factories.set(control_type, factory)
        this.controls_factories_reverse.set(factory, control_type)
        return factory
    }

    getType(factory: ControlFactory): ControlType | undefined{
        return this.controls_factories_reverse.get(factory)
    }

    /**
     * Return the body's dimensions in the generator's Babylon.js coordinate system.
     * Legacy descriptors retain their existing size-derived dimensions.
     */
    getBodyWorldDimensions(): { width: number; height: number } {
        const worldWidth = this.world_width.value
        const aspectRatio = this.aspect_ratio.value
        if(worldWidth !== null){
            if(!Number.isFinite(worldWidth) || worldWidth <= 0){
                throw new RangeError("world_width must be finite and greater than 0")
            }
            if(!Number.isFinite(aspectRatio) || aspectRatio <= 0){
                throw new RangeError("aspect_ratio must be finite and greater than 0 when world_width is set")
            }
            return { width: worldWidth, height: worldWidth / aspectRatio }
        }

        const [width, height] = aspectRatio > 1 ? [1, 1 / aspectRatio] : [aspectRatio, 1]
        return { width: width * this.size.value, height: height * this.size.value }
    }

    /**
     * Load the 3DWam GUI descriptor.
     * @param code the 3DWam GUI descriptor
     * @param library The control library to use for loading the controls
     */
    async load(code: WamGUICode, library: ControlLibrary){
        const schemaVersion = code.schema_version ?? 1
        if(schemaVersion !== 1 && schemaVersion !== 2){
            throw new RangeError(`Unsupported WAM GUI schema_version "${schemaVersion}"`)
        }
        if(code.world_width !== undefined){
            if(schemaVersion !== 2){
                throw new TypeError("world_width requires schema_version: 2")
            }
            if(typeof code.world_width !== "number" || !Number.isFinite(code.world_width) || code.world_width <= 0){
                throw new RangeError("world_width must be finite and greater than 0")
            }
            if(typeof code.aspect_ratio !== "number" || !Number.isFinite(code.aspect_ratio) || code.aspect_ratio <= 0){
                throw new RangeError("aspect_ratio must be finite and greater than 0 when world_width is set")
            }
            if(!code.required_features?.includes(WAM_GUI_FEATURES.worldWidth)){
                throw new TypeError(`world_width requires the "${WAM_GUI_FEATURES.worldWidth}" feature declaration`)
            }
        }
        this.descriptorSchemaVersion = schemaVersion
        this.requiredFeatures = [...(code.required_features ?? [])]
        this.editorFeatures = [...(code.editor_features ?? [])]
        this.aspect_ratio.value = code.aspect_ratio
        this.size.value = code.size ?? 1
        this.world_width.value = code.world_width ?? null
        this.pad_shape.value = code.shape as WamPadShape ?? "rectangle"
        this.top_color.value = code.top_color
        this.bottom_color.value = code.bottom_color
        this.front_face.value = code.face??null
        this.front_face_color.value = code.face_color??"#FFFFFF"
        this.pad_outline_width.value = code.outline_width ?? 0
        this.pad_outline_color.value = code.outline_color ?? "#000000"
        this.modifier.value = code.modifier ?? "normal"
        this.modifier_strength.value = code.modifier_strength ?? 0
        this.controls.splice(0,this.controls.length)
        for(let {control,values,x,y,width,height} of code.controls){
            const instance = await (await this.getFactory(library[control])).create()
            this.controls.splice(this.controls.length, 0, {control:instance, values, x, y, width, height})
        }
    }

    /**
     * Free the resource useful for editing the GUI.
     * The controls should not be modified after this call.
     */
    freeze(){
        this.controls.values.forEach(it=>it.control.freeze())
        for(const k of this.env.sharedTemp.keys)this.env.sharedTemp.free(k,9999)
    }

    dispose(){
        this.pad_element?.remove()
        this.pad_node?.dispose()
        this.disposables.forEach(it=>it())
        this.controls.splice(0,this.controls.length)
    }

    /**
     * Save the 3DWam GUI descriptor.
     * @param library The control library to use for saving the controls
     * @returns the 3DWam GUI descriptor
     */
    save(library: ControlLibrary): WamGUICode{
        const descriptor: WamGUICode = {
            aspect_ratio: this.aspect_ratio.value,
            size: this.size.value,
            bottom_color: this.bottom_color.value,
            top_color: this.top_color.value,
            face: this.front_face.value??undefined,
            face_color: this.front_face.value==null ? undefined : this.front_face_color.value,
            outline_color: this.pad_outline_color.value,
            outline_width: this.pad_outline_width.value,
            shape: this.pad_shape.value,
            modifier: this.modifier.value,
            modifier_strength: this.modifier_strength.value,
            controls: this.controls.values.map(({control,values,x,y,width,height})=>{
                const factory = control.factory
                const type = this.controls_factories_reverse.get(factory)
                const type_id = Object.entries(library).find(([_,c])=>c===type)?.[0]
                if(type_id) return {x, y, width, height, values, control:type_id}
                else return null
            }).filter(it=>it!=null)
        }
        if(this.descriptorSchemaVersion === 2 || this.world_width.value !== null){
            descriptor.schema_version = 2
            descriptor.required_features = [...this.requiredFeatures]
            descriptor.editor_features = [...this.editorFeatures]
        }
        if(this.world_width.value !== null){
            descriptor.schema_version = 2
            descriptor.world_width = this.world_width.value
            descriptor.required_features = [...new Set([
                ...this.requiredFeatures,
                WAM_GUI_FEATURES.worldWidth,
            ])]
        }
        return descriptor
    }

    /**
     * Get the average maximum of height and width of the second and third quartiles of the controls sizes.
     * Can be used to determine how the wam has to be scaled.
     */
    calculateAverageControlSize(): number{
        const sizes = Array.from({length: this.controls.length}, (_,i)=>this.controls.get(i))
            .map(it=>Math.max(it.width, it.height))
            .sort((a,b)=>a-b)
        
        const from = Math.floor(sizes.length/4)
        const to = Math.ceil(sizes.length*3/4)
        let accumulator = 0
        let count = 0
        for(let i=from; i<to; i++){
            accumulator += sizes[i]
            count++
        }
        if(count==0) return 1
        else return accumulator/count
    }
}

export interface WamGUICode{
    top_color: string,
    bottom_color: string,
    aspect_ratio: number,
    size: number,
    schema_version?: 1 | 2,
    required_features?: string[],
    editor_features?: string[],
    world_width?: number,
    face?: string,
    face_color?: string,
    shape?: string,
    outline_width?: number,
    outline_color?: string,
    modifier?: string,
    modifier_strength?: number,
    controls: {
        control: string,
        values: CSettingsValues,
        x: number,
        y: number,
        width: number,
        height: number
    }[]
}

export interface WAMGuiInitCode extends WamGUICode{
    wam_url: string,
}