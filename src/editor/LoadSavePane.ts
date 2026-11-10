import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core";
import { html } from "../utils/doc.ts";
import { MOValue, OValue } from "../observable/collections/OValue.ts";
import { ControlLibrary, WamGUICode, WamGUIGenerator, WAMGuiInitCode } from "../WamGUIGenerator.ts";
import examples from "../examples.json"
import { HistoryCommandRunner } from "./DocumentHistory.ts"

export class LoadSavePane implements IContentRenderer{

    textarea = html.a`<textarea aria-label="Descriptor JSON" placeholder="Paste a complete WAM GUI descriptor JSON object here."></textarea>` as HTMLTextAreaElement

    status = html.a`<output class="load-save__status" aria-live="polite"></output>` as HTMLOutputElement

    showCurrentButton = html.a`<button type="button">Show current descriptor</button>` as HTMLButtonElement

    loadButton = html.a`<button type="button">Load JSON</button>` as HTMLButtonElement

    presets = html.a`
        <select>
            <option>---Select and Example---</option>
        </select>
    ` as HTMLSelectElement

    element = html.a`
        <div class="menu _vertical _fill form_container load-save">
            <label for="load-save-descriptor">Descriptor JSON</label>
            <p class="load-save__help">Paste a complete descriptor below, then choose “Load JSON”. “Show current descriptor” replaces the text with the editor’s current settings and scene.</p>
            ${this.status}
            ${this.textarea}
            <div class="load-save__actions">
                ${this.showCurrentButton}
                ${this.loadButton}
            </div>
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
        this.textarea.id = "load-save-descriptor"
        for(const [key,example] of Object.entries(examples)){
            const option = html.a`<option value=${key}>${key}</option>` as HTMLOptionElement
            option.onclick = ()=>{
                this.textarea.value = JSON.stringify(example, null, 2)
                void this.load(example as WamGUICode).catch(error => console.error("Unable to load example", error))
            }
            this.presets.appendChild(option)
        }

        this.loadButton.addEventListener("click", () => {
            void this.loadTextArea()
        })
        this.showCurrentButton.addEventListener("click", () => {
            try {
                const descriptor = this.gui.value.save(this.library) as WAMGuiInitCode
                if(this.url.value.length > 0) descriptor.wam_url = this.url.value
                this.textarea.value = JSON.stringify(descriptor, null, 2)
                this.status.textContent = "Current descriptor is ready to copy or edit."
            } catch(error) {
                this.status.textContent = `Unable to serialize current descriptor: ${this.errorMessage(error)}`
                console.error("Unable to serialize current descriptor", error)
            }
        })
    }

    private async loadTextArea(): Promise<void> {
        let descriptor: WamGUICode
        try {
            descriptor = JSON.parse(this.textarea.value) as WamGUICode
        } catch(error) {
            this.status.textContent = `Invalid JSON: ${this.errorMessage(error)}`
            return
        }
        try {
            await this.load(descriptor)
            this.status.textContent = "Descriptor loaded successfully."
        } catch(error) {
            this.status.textContent = `Unable to load descriptor: ${this.errorMessage(error)}`
            console.error("Unable to load descriptor JSON", error)
        }
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    init(_: GroupPanelPartInitParameters): void {
        
    }
    
}