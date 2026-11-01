import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";
import { html } from "../utils/doc.ts";
import { MOValue, OValue } from "../observable/collections/OValue.ts";
import { ControlLibrary, WamGUICode, WamGUIGenerator, WAMGuiInitCode } from "../WamGUIGenerator.ts";
import examples from "../examples.json"
import { HistoryCommandRunner } from "./DocumentHistory.ts"

export class LoadSavePane implements IContentRenderer{

    textarea = html.a`<textarea></textarea>` as HTMLTextAreaElement

    presets = html.a`
        <select>
            <option>---Select and Example---</option>
        </select>
    ` as HTMLSelectElement

    element = html.a`
        <div class="menu _vertical _center _fill form_container">
            ${this.textarea}
            ${this.presets}
        </div>
    `

    async load(code: WamGUICode|WAMGuiInitCode): Promise<void> {
        const pane = this
        if("wam_url" in code){
            const load = () => {
                pane.gui.observable.unregister(load)
                void pane.runHistoryCommand("Load descriptor", () =>
                    pane.gui.value.load(code, pane.library),
                ).catch(error => console.error("Unable to load descriptor", error))
            }
            pane.gui.observable.register(load)
            this.url.value = code.wam_url
            return
        }
        else await this.runHistoryCommand(
            "Load descriptor",
            () => this.gui.value.load(code,this.library),
        )
    }


    constructor(
        private gui: OValue<WamGUIGenerator>,
        private url: MOValue<string>,
        private library: ControlLibrary,
        private readonly runHistoryCommand: HistoryCommandRunner = async (_label, operation) => operation(),
    ){
        for(const [key,example] of Object.entries(examples)){
            const option = html.a`<option value=${key}>${key}</option>` as HTMLOptionElement
            option.onclick = ()=>{
                this.textarea.value = JSON.stringify(example, null, 2)
                void this.load(example as WamGUICode).catch(error => console.error("Unable to load example", error))
            }
            this.presets.appendChild(option)
        }

        this.textarea.onchange = ()=> {
            try{
                void this.load(JSON.parse(this.textarea.value) as WamGUICode)
                    .catch(error => console.error("Unable to load descriptor", error))
            }catch(error){
                console.error("Unable to parse descriptor JSON", error)
            }
        }
        this.textarea.onfocus = ()=>{
            const object = this.gui.value.save(library) as WAMGuiInitCode
            if(url.value.length>0) object.wam_url = url.value
            this.textarea.value = JSON.stringify(object)
        }
    }

    init(_: GroupPanelPartInitParameters): void {
        
    }
    
}