import { Control, ControlContextTarget, ControlFactory, ControlEnv, ControlState } from "../../Control.ts"
import { CSettings, CSettingsValue, CSettingsValues } from "../settings/settings.ts"
import { FieldValue, FieldValueUtils } from "../../value/FieldValue.ts"
import { NoneFieldValue } from "../../value/NoneFieldValue.ts"
import { ControlShared } from "../../ControlShared.ts"

/**
 * A color coded controls that change a numeric value.
 */
export abstract class ParameterControl extends Control{

    declare fields: FieldValue[]
    declare fields_ids: string[]

    promise = Promise.resolve()
    private fieldRevisions: number[]
    private disposed = false

    constructor(factory: ControlFactory){
        super(factory)
        this.fields = Array.from((factory as ParameterControlFactory).getParameterLabels(), ()=>NoneFieldValue.INSTANCE)
        this.fields_ids = Array.from((factory as ParameterControlFactory).getParameterLabels(), ()=>"none")
        this.fieldRevisions = this.fields.map(()=>0)
    }

    override updateValue(label: string, value: CSettingsValue){
        let i=0
        const fields = this.env.sharedTemp.get(ControlShared.FIELDS)!!
        for(const l of (this.factory as ParameterControlFactory).getParameterLabels()){
            if(label==l){
                const newfield = fields[value as string] ?? NoneFieldValue.Factory.INSTANCE
                const index = i
                const revision = ++this.fieldRevisions[index]
                if(this.fields[index] !== NoneFieldValue.INSTANCE) this.fields[index].dispose()
                this.fields[index] = NoneFieldValue.INSTANCE
                this.fields_ids[i] = value as string
                void newfield.create(()=>{
                    if(!this.disposed && revision === this.fieldRevisions[index]) this.onParamChange(index)
                }).then(field=>{
                    if(this.disposed || revision !== this.fieldRevisions[index]){
                        field.dispose()
                        return
                    }
                    this.fields[index] = field
                    this.onParamChange(index)
                }).catch(error=>{
                    console.error(`Unable to bind widget parameter "${String(value)}"`, error)
                })
                break
            }
            i++
        }
    }

    abstract onParamChange(index:number): void

    getNormalizedValue(index: number=0): number {
        const field = this.fields[index]
        if(!field) return 0
        const value = field.getValue()
        const normalized = FieldValueUtils.normalize(value, field)
        return normalized
    }

    getNormalizedStepSize(index: number=0): number {
        const field = this.fields[index]
        if(!field) return 0
        return FieldValueUtils.getNormalizedStepSize(field)
    }

    protected hasBoundParameter(index = 0): boolean {
        return this.fields[index] !== undefined && this.fields[index] !== NoneFieldValue.INSTANCE
    }

    protected setNormalizedValue(value: number, index = 0): void {
        const field = this.fields[index]
        if(!field || field === NoneFieldValue.INSTANCE) return
        const min = field.getMin()
        const max = field.getMax()
        const step = field.getStepSize()
        let next = min + Math.max(0, Math.min(1, value)) * (max - min)
        if(step > 0) next = min + Math.round((next - min) / step) * step
        field.setValue(Math.max(min, Math.min(max, next)))
    }

    declareField<C,T>(target: ControlContextTarget<C,T>, mesh: T|(T[]), index: number=0){
        const control = this
        target.defineField({
            id: control.fields_ids[index],
            target: Array.isArray(mesh) ? mesh : [mesh],

            getLabel() { return control.fields[index].getLabel() },
            
            getMin() { return control.fields[index].getMin() },
            getMax() { return control.fields[index].getMax() },
            getStepSize() { return control.fields[index].getStepSize() },
            getExponant() { return control.fields[index].getExponant() },
            
            getValue() {
                return control.fields[index].getValue()
            },
            setValue(value) {
                control.onStateChange?.()
                control.fields[index].setValue(value)
            },
            
            stringify(value) {
                return control.fields[index].stringify(value) ?? "none"
            },
        })
    }

    setValue(value: number, index: number=0){
        this.fields[index]?.setValue(value)
    }

    getValue(index: number=0): number {
        return this.fields[index]?.getValue()??0
    }

    destroy(): void {
        this.disposed = true
        this.fieldRevisions = this.fieldRevisions.map(revision=>revision+1)
        this.fields.forEach(f=>{
            if(f && f !== NoneFieldValue.INSTANCE) f.dispose()
        })
        this.env.sharedTemp.free(ControlShared.FIELDS)
    }

    async getState(): Promise<ControlState> {
        return this.fields.map(f=>f.getValue())
    }

    async setState(state: ControlState): Promise<void> {
        if(Array.isArray(state)) state.forEach((value, i) => this.fields[i]?.setValue(value as number))
    }

    getStateName(): string {
        return this.fields.map(f=>f.getLabel()).join(", ")
    }

}

export abstract class ParameterControlFactory implements ControlFactory {
    
    abstract label: string
    
    abstract description: string

    abstract env: ControlEnv
    
    abstract  getDefaultValues(): CSettingsValues

    abstract create(): Promise<Control>

    getParameterLabels(){ return ["Target"] }

    declare names: string[]

    getSettings(){
        const settings: CSettings = {}
        for(const label of this.getParameterLabels()){
            settings[label] = {choice:this.names}
        }
        return settings
    }

    async init(){
        const fields = await this.env.sharedTemp.allocate_async(ControlShared.FIELDS)
        this.names = Object.keys(fields)
    }

}