import { ColorControl } from "./controls/parameter/ColorControl.js"
import { CursorControl } from "./controls/parameter/CursorControl.js"
import { GrowControl } from "./controls/parameter/GrowControl.js"
import { TextControl } from "./controls/decoration/TextControl.js"
import { ConnectionControl } from "./controls/connection/ConnectionControl.js"
import { Joystick3DControl } from "./controls/parameter/Joystick3DControl.js"
import { DecorationControl } from "./controls/decoration/DecorationControl.js"
import { ControlLibrary } from "../WamGUIGenerator.js"
import { CSettingsValues } from "./controls/settings/settings.js"
import { MorphControl } from "./controls/parameter/MorphControl.js"
import { HashControl } from "./controls/parameter/HashControl.js"
import { JaugeControl } from "./controls/parameter/JaugeControl.js"
import { RotaryKnobControl } from "./controls/parameter/RotaryKnobControl.js"
import { ToggleSwitchControl, MomentaryButtonControl } from "./controls/parameter/BooleanParameterControl.js"
import { NumericDisplayControl } from "./controls/parameter/NumericDisplayControl.js"
import { ControlEnv, ControlType, WidgetDefinition, WidgetRenderTarget } from "./Control.js"
import { widgetFeatureId } from "../descriptor/WamGuiDescriptor.js"

const bothRenderTargets: readonly WidgetRenderTarget[] = Object.freeze(["html", "babylonjs"])

/** Stable catalog metadata; factory methods continue to own settings and lifecycle. */
export const widget_catalog: Readonly<Record<string, Omit<WidgetDefinition, "featureId"> & { featureId?: string }>> = Object.freeze({
    input_control: { id: "input_control", behavior: "connection", skin: "port", renderTargets: bothRenderTargets },
    output_control: { id: "output_control", behavior: "connection", skin: "port", renderTargets: bothRenderTargets },
    midi_input_control: { id: "midi_input_control", behavior: "connection", skin: "midi-port", renderTargets: bothRenderTargets },
    midi_output_control: { id: "midi_output_control", behavior: "connection", skin: "midi-port", renderTargets: bothRenderTargets },
    color_control: { id: "color_control", behavior: "continuous-parameter", skin: "color-dome", renderTargets: bothRenderTargets },
    cursor_control: { id: "cursor_control", behavior: "continuous-parameter", skin: "rotating-cursor", renderTargets: bothRenderTargets },
    rotary_knob: { id: "rotary_knob", behavior: "continuous-parameter", skin: "metallic-rotary", renderTargets: bothRenderTargets, featureId: widgetFeatureId("rotary_knob") },
    toggle_switch: { id: "toggle_switch", behavior: "toggle-parameter", skin: "two-position-switch", renderTargets: bothRenderTargets, featureId: widgetFeatureId("toggle_switch") },
    momentary_button: { id: "momentary_button", behavior: "momentary-parameter", skin: "press-and-release", renderTargets: bothRenderTargets, featureId: widgetFeatureId("momentary_button") },
    numeric_display: { id: "numeric_display", behavior: "read-only-display", skin: "digital-readout", renderTargets: bothRenderTargets, featureId: widgetFeatureId("numeric_display"), statePersistence: false },
    "3d_joystick_control": { id: "3d_joystick_control", behavior: "continuous-parameter", skin: "three-axis-joystick", renderTargets: bothRenderTargets },
    grow_control: { id: "grow_control", behavior: "continuous-parameter", skin: "grow-indicator", renderTargets: bothRenderTargets },
    text: { id: "text", behavior: "decoration", skin: "text", renderTargets: bothRenderTargets },
    decoration: { id: "decoration", behavior: "decoration", skin: "shape", renderTargets: bothRenderTargets },
    morph_control: { id: "morph_control", behavior: "continuous-parameter", skin: "morphing-shape", renderTargets: bothRenderTargets },
    hash_control: { id: "hash_control", behavior: "continuous-parameter", skin: "hashed-color", renderTargets: bothRenderTargets },
    jauge: { id: "jauge", behavior: "continuous-parameter", skin: "gauge", renderTargets: bothRenderTargets },
})

function registerWidget(id: keyof typeof widget_catalog, type: ControlType): ControlType {
    const catalogDefinition = widget_catalog[id]
    return async (env: ControlEnv) => {
        const factory = await type(env)
        const definition: WidgetDefinition = {
            ...catalogDefinition,
            renderTargets: [...catalogDefinition.renderTargets],
        }
        factory.definition = Object.freeze(definition)
        return factory
    }
}

/** List of available controls */
export const controls: ControlLibrary = Object.fromEntries(
    Object.entries({
        input_control: ConnectionControl.Input,
        output_control: ConnectionControl.Output,
        midi_input_control: ConnectionControl.MidiInput,
        midi_output_control: ConnectionControl.MidiOutput,
        color_control: ColorControl.Type,
        cursor_control: CursorControl.Type,
        rotary_knob: RotaryKnobControl.Type,
        toggle_switch: ToggleSwitchControl.Type,
        momentary_button: MomentaryButtonControl.Type,
        numeric_display: NumericDisplayControl.Type,
        "3d_joystick_control": Joystick3DControl.Type,
        grow_control: GrowControl.Type,
        text: TextControl.Type,
        decoration: DecorationControl.Type,
        morph_control: MorphControl.Type,
        hash_control: HashControl.Type,
        jauge: JaugeControl.Type,
    } satisfies Record<keyof typeof widget_catalog, ControlType>)
        .map(([id, type]) => [id, registerWidget(id, type)]),
)

type ControlCategory = {control:keyof ControlLibrary, values: CSettingsValues}[]

export const control_categories = {
    input: [
        {control:"input_control", values: {}},
    ] as ControlCategory,
    output: [
        {control:"output_control", values: {}},
    ] as ControlCategory,
    event_input: [
        {control:"midi_input_control", values: {}},
    ] as ControlCategory,
    event_output: [
        {control:"midi_output_control", values: {}},
    ] as ControlCategory,
    parameter: [
        {control:"color_control", values: {}},
        {control:"cursor_control", values: {"Base Color":"[color]"}},
        {control:"rotary_knob", values: {"Base Color":"[color]"}},
        {control:"toggle_switch", values: {}},
        {control:"momentary_button", values: {}},
        {control:"grow_control", values: {"Base Color":"[color]"}},
    ] as ControlCategory,
}

export default controls