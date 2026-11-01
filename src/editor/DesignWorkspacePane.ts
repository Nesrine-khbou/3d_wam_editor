import { DockviewPanelApi, GroupPanelPartInitParameters, IContentRenderer } from "dockview-core"
import { html } from "../utils/doc.ts"
import { clampWorkspaceSplit } from "../gui/editorInteractions.ts"
import { WamEditorPane } from "./WamEditorPane.ts"
import { WamGui3DPane } from "./WamGui3DPane.ts"

const SPLIT_STORAGE_KEY = "wam3dgenerator-workspace-split-v1"
const GRID_SETTINGS_STORAGE_KEY = "wam3dgenerator-grid-snap-v1"

export class DesignWorkspacePane implements IContentRenderer {
    readonly element = html.a`<div class="design-workspace"></div>`
    private readonly content = html.a`<div class="design-workspace__content"></div>`
    private readonly editorRegion = html.a`<section class="design-workspace__editor" aria-label="2D editor"></section>`
    private readonly previewRegion = html.a`<section class="design-workspace__preview" aria-label="3D preview"></section>`
    private readonly divider = html.a`
        <div class="design-workspace__divider" role="separator" aria-label="Resize 2D and 3D views"
            aria-orientation="vertical" tabindex="0"></div>
    ` as HTMLDivElement
    private readonly maximizeButton = html.a`<button type="button" class="design-workspace__maximize"></button>` as HTMLButtonElement
    private readonly toolbar = html.a`<div class="design-workspace__toolbar"></div>`
    private readonly gridToggle = html.a`<input type="checkbox" aria-label="Show design grid">` as HTMLInputElement
    private readonly snapToggle = html.a`<input type="checkbox" aria-label="Enable grid snapping">` as HTMLInputElement
    private readonly spacingInput = html.a`
        <input type="number" min="1" max="50" step="1" value="5" aria-label="Grid spacing percentage">
    ` as HTMLInputElement
    private readonly snapFeedback = html.a`<output class="design-workspace__snap-feedback" aria-live="polite"></output>`
    private readonly gridControls = html.a`<div class="design-workspace__grid-controls"></div>`
    private panelApi: DockviewPanelApi | null = null
    private split = 0.5
    private removeResizeObserver: (() => void) | null = null
    private dragging = false

    constructor(
        private readonly editor: WamEditorPane,
        private readonly preview: WamGui3DPane,
    ) {
        this.gridControls.append(
            html.a`<label class="design-workspace__grid-option">Grid ${this.gridToggle}</label>`,
            html.a`<label class="design-workspace__grid-option">Snap ${this.snapToggle}</label>`,
            html.a`<label class="design-workspace__grid-option">Spacing ${this.spacingInput}<span>%</span></label>`,
            this.snapFeedback,
        )
        this.toolbar.append(this.gridControls, this.maximizeButton)
        this.element.append(this.toolbar, this.content)
        this.content.append(this.editorRegion, this.divider, this.previewRegion)
        this.editorRegion.append(this.editor.element)
        this.previewRegion.append(this.preview.element)
        this.element.style.cssText = "display:grid;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:0"
        this.content.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) 8px minmax(0,1fr);min-height:0;min-width:0"
        this.editor.element.style.width = "100%"
        this.editor.element.style.height = "100%"
        this.preview.element.style.width = "100%"
        this.preview.element.style.height = "100%"
        this.applySplit(this.readStoredSplit())
        this.applyGridSettings(this.readStoredGridSettings())

        this.maximizeButton.addEventListener("click", this.toggleMaximized)
        this.gridToggle.addEventListener("change", this.onGridSettingsChange)
        this.snapToggle.addEventListener("change", this.onGridSettingsChange)
        this.spacingInput.addEventListener("change", this.onGridSettingsChange)
        this.editor.onSnapFeedback = this.onSnapFeedback
        this.divider.addEventListener("pointerdown", this.onPointerDown)
        this.divider.addEventListener("pointermove", this.onPointerMove)
        this.divider.addEventListener("keydown", this.onDividerKeyDown)
        this.divider.addEventListener("pointerup", this.onPointerUp)
        this.divider.addEventListener("pointercancel", this.onPointerUp)
        this.divider.setAttribute("aria-valuemin", "20")
        this.divider.setAttribute("aria-valuemax", "80")
    }

    private readStoredGridSettings(): {visible: boolean; snapEnabled: boolean; spacing: number} {
        try {
            const stored = localStorage.getItem(GRID_SETTINGS_STORAGE_KEY)
            if(stored === null) return this.editor.getGridSettings()
            const settings: unknown = JSON.parse(stored)
            if(
                typeof settings !== "object" || settings === null
                || !("visible" in settings) || typeof settings.visible !== "boolean"
                || !("snapEnabled" in settings) || typeof settings.snapEnabled !== "boolean"
                || !("spacing" in settings) || typeof settings.spacing !== "number"
                || !Number.isFinite(settings.spacing) || settings.spacing < 0.01 || settings.spacing > 0.5
            ){
                throw new Error("Saved grid settings must contain boolean visibility/snap flags and spacing from 1% to 50%")
            }
            return {
                visible: settings.visible,
                snapEnabled: settings.snapEnabled,
                spacing: settings.spacing,
            }
        } catch(error) {
            console.error("Unable to restore grid and snap settings; using defaults", error)
            return this.editor.getGridSettings()
        }
    }

    private applyGridSettings(settings: {visible: boolean; snapEnabled: boolean; spacing: number}): void {
        this.editor.setGridSettings(settings)
        this.gridToggle.checked = settings.visible
        this.snapToggle.checked = settings.snapEnabled
        this.spacingInput.value = Math.round(settings.spacing * 100).toString()
        this.updateSnapSummary()
        try {
            localStorage.setItem(GRID_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
        } catch(error) {
            console.error("Unable to save grid and snap settings", error)
        }
    }

    private onGridSettingsChange = (): void => {
        const percentage = Number(this.spacingInput.value)
        if(!this.spacingInput.validity.valid || !Number.isFinite(percentage)){
            this.spacingInput.value = Math.round(this.editor.getGridSettings().spacing * 100).toString()
            this.snapFeedback.textContent = "Grid spacing must be between 1% and 50%."
            return
        }
        this.applyGridSettings({
            visible: this.gridToggle.checked,
            snapEnabled: this.snapToggle.checked,
            spacing: percentage / 100,
        })
    }

    private onSnapFeedback = (source: "alignment" | "grid" | "none" | "override"): void => {
        const messages = {
            alignment: "Aligned to a control guide",
            grid: `Snapped to grid (${Math.round(this.editor.getGridSettings().spacing * 100)}%)`,
            none: "No snap applied",
            override: "Snap temporarily overridden (Alt)",
        }
        this.snapFeedback.textContent = messages[source]
    }

    private updateSnapSummary(): void {
        const settings = this.editor.getGridSettings()
        const state = settings.snapEnabled
            ? `Grid snap on (${Math.round(settings.spacing * 100)}%); alignment guides take priority`
            : "Grid snap off; alignment guides remain active"
        this.snapFeedback.textContent = `${state}. Hold Alt to override snapping; Ctrl bypasses alignment guides.`
    }

    init(parameters: GroupPanelPartInitParameters): void {
        this.panelApi = parameters.api
        this.editor.init(parameters)
        this.preview.startRenderLoop()
        this.updateMaximizeLabel()
        const observer = new ResizeObserver(() => this.preview.engine.resize())
        observer.observe(this.element)
        this.removeResizeObserver = () => observer.disconnect()
    }

    private readStoredSplit(): number {
        try {
            const stored = localStorage.getItem(SPLIT_STORAGE_KEY)
            if(stored === null) return 0.5
            const value = Number(stored)
            if(!Number.isFinite(value)){
                throw new Error(`Invalid stored workspace split ratio: ${stored}`)
            }
            return clampWorkspaceSplit(value)
        } catch(error) {
            console.error("Unable to restore the workspace split ratio", error)
            return 0.5
        }
    }

    private applySplit(value: number): void {
        this.split = clampWorkspaceSplit(value)
        this.content.style.gridTemplateColumns =
            `minmax(0, ${this.split}fr) 8px minmax(0, ${1 - this.split}fr)`
        this.divider.setAttribute("aria-valuenow", Math.round(this.split * 100).toString())
        this.preview.engine?.resize()
        try {
            localStorage.setItem(SPLIT_STORAGE_KEY, this.split.toString())
        } catch(error) {
            console.error("Unable to save the workspace split ratio", error)
        }
    }

    private setSplitFromPointer(clientX: number): void {
        const bounds = this.content.getBoundingClientRect()
        if(bounds.width <= 0) return
        this.applySplit((clientX - bounds.left) / bounds.width)
    }

    private onPointerDown = (event: PointerEvent): void => {
        if(event.button !== 0) return
        this.dragging = true
        this.divider.setPointerCapture(event.pointerId)
        this.setSplitFromPointer(event.clientX)
        event.preventDefault()
    }

    private onPointerUp = (): void => {
        this.dragging = false
    }

    private onPointerMove = (event: PointerEvent): void => {
        if(this.dragging) this.setSplitFromPointer(event.clientX)
    }

    private onDividerKeyDown = (event: KeyboardEvent): void => {
        if(event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
        const delta = event.shiftKey ? 0.1 : 0.02
        this.applySplit(this.split + (event.key === "ArrowRight" ? delta : -delta))
        event.preventDefault()
    }

    private toggleMaximized = (): void => {
        if(!this.panelApi) return
        if(this.panelApi.isMaximized()) this.panelApi.exitMaximized()
        else this.panelApi.maximize()
        this.updateMaximizeLabel()
        requestAnimationFrame(() => this.preview.engine.resize())
    }

    private updateMaximizeLabel(): void {
        const maximized = this.panelApi?.isMaximized() ?? false
        this.maximizeButton.textContent = maximized ? "Restore workspace" : "Maximize workspace"
        this.maximizeButton.setAttribute("aria-pressed", maximized.toString())
    }

    dispose(): void {
        this.removeResizeObserver?.()
        this.removeResizeObserver = null
        this.maximizeButton.removeEventListener("click", this.toggleMaximized)
        this.gridToggle.removeEventListener("change", this.onGridSettingsChange)
        this.snapToggle.removeEventListener("change", this.onGridSettingsChange)
        this.spacingInput.removeEventListener("change", this.onGridSettingsChange)
        this.divider.removeEventListener("pointerdown", this.onPointerDown)
        this.divider.removeEventListener("pointermove", this.onPointerMove)
        this.divider.removeEventListener("keydown", this.onDividerKeyDown)
        this.divider.removeEventListener("pointerup", this.onPointerUp)
        this.divider.removeEventListener("pointercancel", this.onPointerUp)
        this.preview.dispose()
        if(this.editor.onSnapFeedback === this.onSnapFeedback) this.editor.onSnapFeedback = () => {}
    }
}
