import { createDockview, DockviewComponentOptions, IContentRenderer, themeAbyss } from "dockview-core"
import { WamLoaderPane } from "./editor/WamLoaderPane.ts"
import { initializeWamHost } from "@webaudiomodules/sdk"
import { WamGui3DPane } from "./editor/WamGui3DPane.ts"
import { WamEditorPane } from "./editor/WamEditorPane.ts"
import { ControlSelectorPane } from "./editor/ControlSelectorPane.ts"
import controls, { control_categories } from "./control/controls.ts"
import { SettingsPane } from "./editor/SettingsPane.ts"
import { ToolbarPane } from "./editor/ToolbarPane.ts"
import { WamPadPane } from "./editor/WamPadPane.ts"
import { LoadSavePane } from "./editor/LoadSavePane.ts"
import { ControlLibrary, WamGUICode } from "./WamGUIGenerator.ts"
import { MOValue } from "./observable/collections/OValue.ts"
import { Item } from "./control/ControlMap.ts"
import { ImagesPane } from "./editor/ImagesPane.ts"
import { DECORATION_IMAGES } from "./utils/visual/Decoration.ts"
import { CSettingsValues } from "./control/controls/settings/settings.ts"
import { ExamplesPane } from "./editor/ExamplesPane.ts"
import example_json from "./examples.json"
import { AutoLayoutPane } from "./editor/AutoLayoutPane.ts"
import { Test2DPane } from "./editor/Test2DPane.ts"
import { ControlFactory, ControlType } from "./control/Control.ts"
import { MenuBar, MenuBarConfig, menubarViewport } from "./editor/MenuBar.ts"
import { OneWamPane } from "./editor/OneWamPane.ts"
import { DebugPane } from "./editor/DebugPane.ts"
import { AudioTestPane } from "./editor/AudioTestPane.ts"
import { WamThumbnailReference } from "./utils/thumbnail-reference.ts"
import { DesignWorkspacePane } from "./editor/DesignWorkspacePane.ts"
import { DocumentHistory, DocumentHistoryState, HistoryCommandRunner } from "./editor/DocumentHistory.ts"
import { SceneHierarchyPane } from "./editor/SceneHierarchyPane.ts"

let audioContext: AudioContext
let host: string

try{
    audioContext = new AudioContext()
    ;[host] = await initializeWamHost(audioContext)
}catch(e){
    console.error(e)
}

const wam_loader = new WamLoaderPane(host!!,audioContext!!)
const thumbnail_reference = new WamThumbnailReference(wam_loader.wam, wam_loader.url)
const view_3d = new WamGui3DPane()
const editor = new WamEditorPane(wam_loader.wam, view_3d.container, thumbnail_reference)
wam_loader.wam.observable.register(() => documentHistory.reset())
let refreshHistoryButtons = (): void => {}
let historyState: DocumentHistoryState = {
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
}
const documentHistory = new DocumentHistory<WamGUICode>(
    () => editor.gui_generator.value.save(controls),
    async snapshot => {
        editor.selector.unselect_all()
        await editor.gui_generator.value.load(structuredClone(snapshot), controls)
        settings.settings.value = null
    },
    snapshot => structuredClone(snapshot),
    100,
    state => {
        historyState = state
        refreshHistoryButtons()
    },
)
const runHistoryCommand: HistoryCommandRunner = (label, operation) =>
    documentHistory.execute(label, operation)
function executeDocumentCommand(label: string, operation: () => void | Promise<void>): void {
    void runHistoryCommand(label, operation).catch(error => {
        console.error(`Unable to ${label.toLowerCase()}`, error)
    })
}
const selector = new ControlSelectorPane(controls,editor.gui_generator)
const wampad = new WamPadPane(
    editor.gui_generator,
    thumbnail_reference,
    runHistoryCommand,
    documentHistory,
    visible => editor.setFaceTransformOverlayVisible(visible),
)
const workspace = new DesignWorkspacePane(editor, view_3d)
const scene_hierarchy = new SceneHierarchyPane(
    editor.gui_generator.value,
    view_3d,
    documentHistory,
    runHistoryCommand,
)
const load_save = new LoadSavePane(editor.gui_generator, wam_loader.url, controls, runHistoryCommand)
const images = new ImagesPane(DECORATION_IMAGES)
const examples = new ExamplesPane(
    example_json as any,
    editor.gui_generator,
    wam_loader.url,
    controls,
    runHistoryCommand,
)
const autolayout = new AutoLayoutPane(
    wam_loader.wam,
    wam_loader.url,
    controls,
    code => runHistoryCommand("Apply auto layout", () => editor.gui_generator.value.load(code, controls)),
    control_categories,
)
const test2d = new Test2DPane(editor.gui_generator)
const keyboard = new OneWamPane(audioContext!!, host!!, "https://mainline.i3s.unice.fr/wam2/packages/VirtualMidiKeyboardNoSound/src/index.js", wam_loader.wam)
const debug = new DebugPane(editor.gui_generator)
const audioTest = new AudioTestPane(audioContext!!, wam_loader.wam)

const beginDocumentEdit = (event: Event): void => {
    const target = event.target
    if(!(target instanceof HTMLElement)) return
    if(target.closest(".scene-hierarchy")) return
    if(target.matches("input, select, textarea")){
        documentHistory.begin("Edit document settings")
    }else if(target.closest(".control_container, .transformer")){
        documentHistory.begin("Move or resize controls")
    }
}
const finishDocumentEdit = (): void => documentHistory.commit()
document.addEventListener("input", beginDocumentEdit, true)
document.addEventListener("change", beginDocumentEdit, true)
document.addEventListener("mousedown", beginDocumentEdit, true)
document.addEventListener("change", finishDocumentEdit)
window.addEventListener("mouseup", finishDocumentEdit)
window.addEventListener("pointerup", finishDocumentEdit)

/* Settings */
const settings = new SettingsPane(()=>wam_loader.parameters_info)

let parameter_values = {} as CSettingsValues

wam_loader.wam.link(({to})=>{
    to?.audioNode.connect(audioContext.destination!!)
})


// Set the settings from the selected control
selector.selected.link(({to:selected})=>{
    const factory = selector.selected.value?.factory
    if(factory){
        parameter_values = factory.getDefaultValues()
        settings.settings.value = {
            title: factory.label,
            description: factory.description,
            settings: factory.getSettings(),
            getValue(label) {
                return parameter_values[label]
            },
            setValue(label, value) {
                parameter_values[label] = value
            },
        }
    }
})

editor.on_select.register(({infos})=>{
    const {control,values} = infos
    settings.settings.value = {
        title: control.factory.label,
        settings: control.factory.getSettings(),
        description: control.factory.description,
        getValue(label) {
            return values[label]
        },    
        setValue(label, value) {
            const selecteds = [...editor.selector.selecteds].map(it=>editor.gui_generator.value.controls.values.indexOf(it.infos))
            for(const i of selecteds){
                editor.gui_generator.value.controls.setValue(i,label,value)
            }
        },
    }
})



function removeSelecteds(){
    const gui = editor.gui_generator.value

    for(const s of editor.selector.selecteds){
        const index = gui.controls.values.indexOf(s.infos)
        editor.gui_generator.value.controls.splice(index,1)
    }
}

async function replaceSelecteds(){
    const control = selector.selected.value?.type; if(control==null)return
    const gui = editor.gui_generator.value
    const selecteds = [...editor.selector.selecteds]

    for(const s of selecteds){
        editor.selector.unselect(s)
        gui.controls.splice(gui.controls.values.indexOf(s.infos),1)
    }
    
    for(const s of selecteds){
        const {infos:{x,y,width,height,values}} = s
        await gui.addControl({x,y,width,height,values,control})
        const e = gui.controls.get(gui.controls.length-1)
        editor.selector.select({element:e.container!!, infos:e})
    }
}

function rearrage(xl: keyof Readonly<Item>, yl:keyof Readonly<Item>, wl:keyof Readonly<Item>, hl:keyof Readonly<Item>){
    const gui = editor.gui_generator.value
    //@ts-ignore
    const selecteds = [...editor.selector.selecteds].sort((a,b)=>a.infos[xl]-b.infos[xl])
    //@ts-ignore
    const minx = Math.min(...selecteds .map(it=>it.infos[xl]))
    //@ts-ignore
    const maxx = Math.max(...selecteds .map(it=>it.infos[xl]+it.infos[wl]))
    //@ts-ignore
    const centery = selecteds .map(it=>it.infos[yl]+it.infos[hl]/2) .reduce((a,b)=>a+b,0) / selecteds.length
    //@ts-ignore
    const total_width = selecteds.map(it=>it.infos[wl]).reduce((a,b)=>a+b,0)
    //@ts-ignore
    const spacing = (maxx-minx-total_width)/(selecteds.length-1)

    let x = minx
    for(const s of selecteds){
        const index = gui.controls.values.indexOf(s.infos)
        const y = centery-(s.infos[hl] as number)/2
        const position = {x:0,y:0} as Item
        //@ts-ignore
        position[xl] = x
        //@ts-ignore
        position[yl] = y
        gui.controls.move(index, position.x, position.y)
        x += spacing + (s.infos[wl] as number)
    }
}

let clipboard = new MOValue<{x:number, y:number, width:number, height:number, values:any, control:ControlType}[]>([])
function copySelecteds(){
    clipboard.value = [...editor.selector.selecteds.values()]
        .map(({infos:{x,y,width,height,values,control}}) =>({
            x:x+0.02, y:y+0.02, width, height,
            values: structuredClone(values),
            control: editor.gui_generator.value.getType(control.factory)!!
        }))
}

async function pasteSelecteds(){
    const controls = editor.gui_generator.value.controls
    let first = controls.length
    let count = clipboard.value.length
    editor.selector.selecteds = []
    for(const {x,y,width,height,values,control} of clipboard.value){
        await editor.gui_generator.value.addControl({
            x,y,width,height,control,
            values: structuredClone(values)
        })
    }
    editor.selector.selecteds = [...controls.values]
        .slice(first,first+count)
        .map(infos=>({element:infos.container!!, infos}))
}

async function duplicateSelecteds(){
        if(editor.selector.selecteds.size === 0) return
        copySelecteds()
        await pasteSelecteds()
}


/* Editor Toolbar */
const editor_toolbar = new ToolbarPane(
    {
        id:"undo", icon:"↶", label:"Undo", description:"last document edit",
        shortcut: [{key:"z",ctrl:true}],
        disabled:true,
        action:()=> {
            void documentHistory.undo().catch(error => console.error("Unable to undo document edit", error))
        }
    },
    {
        id:"redo", icon:"↷", label:"Redo", description:"last undone document edit",
        shortcut: [{key:"y",ctrl:true},{key:"z",ctrl:true,shift:true}],
        disabled:true,
        action:()=> {
            void documentHistory.redo().catch(error => console.error("Unable to redo document edit", error))
        }
    },
    "separator",
    {
        id:"add", icon:"+", label:"Add Control", description: "from the palette",
        shortcut: [{key:"a",ctrl:true}],
        action: (index)=>{
            const gui = editor.gui_generator.value
            const control = selector.selected.value?.type; if(!control) return
            executeDocumentCommand("Add control", () =>
                gui.addControl({control, values:structuredClone(parameter_values), x:0, y:0, width:0.1, height:0.1}),
            )
        }
    },
    {
        id:"remove", icon:"×", label:"Remove Controls", description: "selecteds",
        shortcut: [{key:"Delete"},{key:"Backspace"}],
        action:()=>executeDocumentCommand("Delete controls", removeSelecteds)
    },
    {
        id:"replace", icon:"R", label:"Replace Controls", description: "selecteds by ones from the palette",
        shortcut: [{key:"r",ctrl:true}],
        action:()=>executeDocumentCommand("Replace controls", replaceSelecteds)
    },
    {
        id:"copy", icon:"⿻", label:"Copy Controls",  description: "selecteds to the clipboard",
        shortcut: [{key:"c",ctrl:true}],
        action(){
            copySelecteds()
        }
    },
    {
        id:"cut", icon:"✂", label:"Cut Controls",  description: "selecteds to the clipboard",
        shortcut: [{key:"x",ctrl:true}],
        action(){
            executeDocumentCommand("Cut controls", () => {
                copySelecteds()
                removeSelecteds()
            })
        }
    },
    {
        id:"paste", icon:"📋︎", label:"Paste Controls",  description: "from the clipboard",
        shortcut: [{key:"v",ctrl:true}],
        action:()=>executeDocumentCommand("Paste controls", pasteSelecteds)
    },
    {
        id:"duplicate", icon:"⧉", label:"Duplicate Controls", description:"selected controls with a small offset",
        shortcut: [{key:"d",ctrl:true}],
        action:()=>executeDocumentCommand("Duplicate controls", duplicateSelecteds)
    },
    "separator",
    {
        id:"rearrange_x", icon:"┉", label:"Realign horizontally", description:"selecteds",
        action(){ executeDocumentCommand("Align controls horizontally", () => rearrage("x","y","width","height"))}
    },
    {
        id:"rearrange_y", icon:"┋", label:"Realign vertically", description:"selecteds",
        action(){ executeDocumentCommand("Align controls vertically", () => rearrage("y","x","height","width"))}
    }
)

refreshHistoryButtons = () => {
    editor_toolbar.setDisabled("undo", !historyState.canUndo)
    editor_toolbar.setDisabled("redo", !historyState.canRedo)
}
refreshHistoryButtons()

selector.selected.link(({to:selected})=>{
    editor_toolbar.setDisabled("add", selected==null)
    editor_toolbar.setDisabled("replace", selected==null || editor.selector.selecteds.size==0)
    
})

function updateSelectionTargetButton(){
    const isDisabled = editor.selector.selecteds.size==0
    editor_toolbar.setStatus(
        `${editor.selectionCount} selected · Drag controls to move; drag corner handles to resize`,
    )
    editor_toolbar.setDisabled("remove",isDisabled)
    editor_toolbar.setDisabled("cut",isDisabled)
    editor_toolbar.setDisabled("copy",isDisabled)
    editor_toolbar.setDisabled("duplicate",isDisabled)
    editor_toolbar.setDisabled("replace", selector.selected.value==null || editor.selector.selecteds.size==0)

    const isDisabledMultitarget = editor.selector.selecteds.size<2
    editor_toolbar.setDisabled("rearrange_x",isDisabledMultitarget)
    editor_toolbar.setDisabled("rearrange_y",isDisabledMultitarget)
}
editor.on_select.register(updateSelectionTargetButton)
editor.on_unselect.register(updateSelectionTargetButton)
updateSelectionTargetButton()

clipboard.link(({to})=>{
    editor_toolbar.setDisabled("paste",to.length==0)
})

const components: Record<string,IContentRenderer> = {
    wam_loader, workspace, selector,
    settings, editor_toolbar, wampad, load_save,
    images, examples: examples, autolayout, test2d, scene_hierarchy,
    keyboard, debug, audioTest,
}

/* */
const container = document.getElementById("container")!!

const options: DockviewComponentOptions = {
    theme: themeAbyss,
    createComponent(options) {
        const c = components[options.name]
        if(!c)throw new Error(`Unknown component ${options.id}`)
        return c
    },
}

const api = createDockview(container, options)
/* */


const default_layout = {"grid":{"root":{"type":"branch","data":[{"type":"branch","data":[{"type":"leaf","data":{"views":["selector"],"activeView":"selector","id":"left"},"size":386},{"type":"leaf","data":{"views":["settings","images","examples"],"activeView":"settings","id":"1"},"size":385.20001220703125}],"size":384},{"type":"branch","data":[{"type":"leaf","data":{"views":["editor_toolbar"],"activeView":"editor_toolbar","id":"center"},"size":100},{"type":"leaf","data":{"views":["workspace"],"activeView":"workspace","id":"2"},"size":671.2000122070312}],"size":689},{"type":"branch","data":[{"type":"branch","data":[{"type":"leaf","data":{"views":["wam"],"activeView":"wam","id":"right"},"size":254},{"type":"leaf","data":{"views":["wampad","load_save"],"activeView":"wampad","id":"4"},"size":209}],"size":386},{"type":"leaf","data":{"views":["autolayout"],"activeView":"autolayout","id":"3"},"size":385.20001220703125}],"size":463}],"size":771.2000122070312},"width":1536,"height":771.2000122070312,"orientation":"HORIZONTAL"},"panels":{"selector":{"id":"selector","contentComponent":"selector","title":"Controls"},"editor_toolbar":{"id":"editor_toolbar","contentComponent":"editor_toolbar","title":"Editor Toolbar","maximumHeight":50},"wam":{"id":"wam","contentComponent":"wam_loader","title":"Web Audio Module"},"settings":{"id":"settings","contentComponent":"settings","title":"Settings"},"images":{"id":"images","contentComponent":"images","title":"Images"},"examples":{"id":"examples","contentComponent":"examples","title":"Examples"},"workspace":{"id":"workspace","contentComponent":"workspace","title":"2D / 3D Workspace"},"autolayout":{"id":"autolayout","contentComponent":"autolayout","title":"Auto Layout"},"wampad":{"id":"wampad","contentComponent":"wampad","title":"Pad"},"load_save":{"id":"load_save","contentComponent":"load_save","title":"Load/Save"}},"activeGroup":"center"}
const layoutStorageKey = "wam3dgenerator-dockview-layout-v1"
let savedLayout: unknown = null
try {
    const storedLayout = localStorage.getItem(layoutStorageKey)
    if(storedLayout) savedLayout = JSON.parse(storedLayout)
} catch(error) {
    console.error("Unable to restore the saved editor layout; using the default layout", error)
}
if(savedLayout){
    try {
        api.fromJSON(savedLayout as any)
    } catch(error) {
        console.error("The saved editor layout is invalid; using the default layout", error)
        api.fromJSON(default_layout as any)
    }
}else{
    api.fromJSON(default_layout as any)
}
api.onDidLayoutChange(() => {
    try {
        localStorage.setItem(layoutStorageKey, JSON.stringify(api.toJSON()))
    } catch(error) {
        console.error("Unable to save the editor layout", error)
    }
})
const menu_config = {} as MenuBarConfig
menubarViewport(menu_config, api, Object.keys(components).filter(id => id !== "workspace"), default_layout)
document.getElementById("menubar")!!.replaceWith(new MenuBar(menu_config).element)

document.addEventListener("keypress", event=>{
    if(event.key=="e"){
        console.log(JSON.stringify(api.toJSON()))
    }
})