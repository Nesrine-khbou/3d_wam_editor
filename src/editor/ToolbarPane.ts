import { GroupPanelPartInitParameters, IContentRenderer } from "dockview-core"
import { html } from "../utils/doc.ts"
import { isEditableShortcutTarget, matchesShortcutModifiers } from "../gui/editorInteractions.ts"

export type ToolbarItem = 
    {
        id: string,
        icon: string, 
        label: string,
        shortcut?: {
            key:string,
            ctrl?: boolean,
            shift?: boolean,
            alt?: boolean
        }[],
        disabled?: boolean,
        description?: string,
        action: (index:string)=>void
    }
    | "separator"

export class ToolbarPane implements IContentRenderer{

    element = html.a`<ul class="toolbar"></ul>` as HTMLUListElement

    private button_elements = {} as Record<string,HTMLButtonElement>
    private status_element = html.a`<li class="toolbar-status" aria-live="polite"></li>`

    private buttons: Record<string,{ctrl?: boolean, shift?: boolean, alt?: boolean, id:string, action:(index:string)=>void}[]> = {}

    constructor(
        ...items: ToolbarItem[]
    ){
        let i=0
        for(const item of items){
            if(item=="separator"){
                this.element.appendChild(html.a`<li><hr/></li>`)
            }
            else{
                const {id,icon,label,action,disabled,shortcut,description} = item
                const shortcuts = (shortcut??[])
                    .map(it=>{
                        let shortcut = ""
                        if(it.ctrl)shortcut += "Ctrl "
                        if(it.shift)shortcut += "Shift "
                        if(it.alt)shortcut += "Alt "
                        shortcut += it.key.length==1 ? it.key.toUpperCase() : it.key
                        return shortcut
                    })
                    .join(" or ")
                const button = html.a`
                    <button type="button" class="tooltip_holder" aria-label="${label}" title="${label}">
                        <span class="toolbar-icon" aria-hidden="true">${icon}</span>
                        <span class="toolbar-label">${label}</span>
                        <div class="-tooltip">
                            ${label}
                            <span class="-shortcut">${shortcuts}</span>
                            <span class="-description">${description??""}</span>
                        </div>
                    </button>
                ` as HTMLButtonElement
                const li = html.a`<li>${button}</li>`
                li.classList.toggle("_disabled",!!disabled)
                button.disabled = !!disabled
                button.addEventListener("click",()=>action(id))
                this.button_elements[id]=button
                this.element.appendChild(li)
            }
            i++
        }

        this.buttons = {}
        i=0
        for(const {action,shortcut,id} of items.filter(it=>typeof it == "object" && "action" in it)){
            for(let {key,alt,ctrl,shift} of shortcut??[]){
                const normalizedKey = this.normalizeKey(key)
                this.buttons[normalizedKey] ??= []
                this.buttons[normalizedKey].push({ctrl,alt,shift,action,id})
            }
            i++
        }
        this.element.append(this.status_element)
    }

    setDisabled(id:string, isDisabled:boolean){
        const button = this.button_elements[id]
        button.disabled = isDisabled
        button.parentElement?.classList.toggle("_disabled",isDisabled)
    }

    setStatus(message: string): void {
        this.status_element.textContent = message
    }

    private normalizeKey(key: string): string {
        return key.length === 1 ? key.toLowerCase() : key
    }

    on_input = (event: KeyboardEvent)=>{
        if(event.defaultPrevented || event.repeat) return
        if(isEditableShortcutTarget(event.target) || isEditableShortcutTarget(document.activeElement)) return

        const bindings = this.buttons[this.normalizeKey(event.key)]
        if(!bindings)return
        const binding = bindings.find(({ctrl,shift,alt,id}) =>
            !this.button_elements[id].disabled && matchesShortcutModifiers({ctrl,shift,alt}, event),
        )
        if(!binding)return

        binding.action(binding.id)

        event.preventDefault()
    }

    init(_: GroupPanelPartInitParameters): void {
        document.addEventListener("keydown",this.on_input)
    }

    dispose(): void {
        document.removeEventListener("keydown",this.on_input)
    }

}