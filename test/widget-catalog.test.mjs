import assert from "node:assert/strict";
import { test } from "node:test";
import { NullEngine, PointerEventTypes, Scene, TransformNode } from "@babylonjs/core";
import { DocumentHistory } from "../src/editor/DocumentHistory.ts";

class FakeElement {
    constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.style = {};
        this.attributes = new Map();
        this.children = [];
        this.listeners = new Map();
        this.classList = {
            add: (...names) => names.forEach(name => this.classes.add(name)),
            remove: (...names) => names.forEach(name => this.classes.delete(name)),
            contains: name => this.classes.has(name),
        };
        this.classes = new Set();
        this.textContent = "";
    }

    appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
    }

    remove() {
        if(this.parentElement) {
            this.parentElement.children = this.parentElement.children.filter(child => child !== this);
            this.parentElement = undefined;
        }
    }

    setAttribute(name, value) {
        this.attributes.set(name, value);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    addEventListener(name, callback) {
        const listeners = this.listeners.get(name) ?? new Set();
        listeners.add(callback);
        this.listeners.set(name, listeners);
    }

    removeEventListener(name, callback) {
        this.listeners.get(name)?.delete(callback);
    }

    dispatch(name, event = {}) {
        for(const callback of this.listeners.get(name) ?? []) callback({ preventDefault() {}, stopPropagation() {}, ...event });
    }

    cloneNode(deep = false) {
        const clone = new FakeElement(this.tagName);
        clone.style = { ...this.style };
        clone.attributes = new Map(this.attributes);
        clone.classes = new Set(this.classes);
        clone.classList = {
            add: (...names) => names.forEach(name => clone.classes.add(name)),
            remove: (...names) => names.forEach(name => clone.classes.delete(name)),
            contains: name => clone.classes.has(name),
        };
        clone.textContent = this.textContent;
        if(deep) this.children.forEach(child => clone.appendChild(child.cloneNode(true)));
        return clone;
    }

    getContext() {
        return {
            clearRect() {},
            fillRect() {},
            fillText() {},
            set fillStyle(_) {},
            set font(_) {},
            set textAlign(_) {},
            set textBaseline(_) {},
        };
    }
}

globalThis.window = new FakeElement("window");
globalThis.document = {
    fonts: { add() {} },
    createElement: name => new FakeElement(name),
    createElementNS: (_, name) => new FakeElement(name),
    addEventListener() {},
    removeEventListener() {},
};
globalThis.FontFace ??= class {
    async load() { return this; }
};

const libraryApi = await import("../dist/index.js");
const { controls, widget_catalog, widgetFeatureId, WamGUIGenerator, ControlStateManager } = libraryApi;

const renderTarget = (root, fields) => ({
    root,
    defineAnOutput() {},
    defineAnInput() {},
    defineAnEventInput() {},
    defineAnEventOutput() {},
    defineDraggableField() {},
    defineField(field) { fields.push(field); },
});

function createFieldFactory({ label, min = 0, max = 1, initial = 0.25, step = 0 }) {
    let value = initial;
    let listeners = [];
    return {
        create(onChange) {
            listeners.push(onChange);
            return Promise.resolve({
                getLabel: () => label,
                getMin: () => min,
                getMax: () => max,
                getExponant: () => 1,
                getStepSize: () => step,
                getValue: () => value,
                setValue(next) {
                    value = next;
                    onChange(value);
                },
                stringify: next => `${next.toFixed(2)} Hz`,
                dispose() {
                    listeners = listeners.filter(listener => listener !== onChange);
                },
            });
        },
        setExternalValue(next) {
            value = next;
            listeners.forEach(listener => listener(value));
        },
    };
}

function createWidgetEnvironment() {
    const none = createFieldFactory({ label: "None", min: 0, max: 0, initial: 0 });
    const parameter = createFieldFactory({ label: "Frequency", min: 20, max: 20000, initial: 440, step: 10 });
    const secondParameter = createFieldFactory({ label: "Resonance", min: 0, max: 10, initial: 2.5, step: 0.1 });
    const fieldFactories = { None: none, frequency: parameter, resonance: secondParameter };
    const htmlFields = [];
    const babylonFields = [];
    const host = {
        html: renderTarget(new FakeElement("div"), htmlFields),
        babylonjs: renderTarget(new TransformNode("widget-root", scene), babylonFields),
    };
    const env = {
        host,
        shared: { allocate() {}, get() {}, free() {}, keys: [] },
        sharedTemp: {
            async allocate_async() { return fieldFactories; },
            get() { return fieldFactories; },
            free() {},
        },
    };
    return { env, htmlFields, babylonFields, parameter, secondParameter };
}

const engine = new NullEngine();
const scene = new Scene(engine);

test("the built-in catalog declares stable identities, behavior, skins, targets and V2 features", () => {
    for(const id of Object.keys(controls)){
        const definition = widget_catalog[id];
        assert.ok(definition, `${id} has a catalog definition`);
        assert.equal(definition.id, id);
        assert.ok(["html", "babylonjs"].every(target => definition.renderTargets.includes(target)));
    }

    assert.equal(widget_catalog.rotary_knob.behavior, "continuous-parameter");
    assert.equal(widget_catalog.rotary_knob.featureId, widgetFeatureId("rotary_knob"));
    assert.equal(widget_catalog.toggle_switch.behavior, "toggle-parameter");
    assert.equal(widget_catalog.momentary_button.behavior, "momentary-parameter");
    assert.equal(widget_catalog.numeric_display.behavior, "read-only-display");
    assert.equal(widget_catalog.numeric_display.statePersistence, false);
});

test("widget factories expose settings schemas and usable defaults for each new type", async () => {
    for(const id of ["rotary_knob", "toggle_switch", "momentary_button", "numeric_display"]){
        const { env } = createWidgetEnvironment();
        const factory = await controls[id](env);
        const settings = factory.getSettings();
        const defaults = factory.getDefaultValues();
        assert.ok(Object.hasOwn(settings, "Target") || Object.hasOwn(settings, "Target 1"), `${id} declares a parameter source`);
        assert.ok(Object.keys(defaults).every(label => Object.hasOwn(settings, label)), `${id} defaults are covered by its settings schema`);
    }

    const { env } = createWidgetEnvironment();
    const display = await controls.numeric_display(env);
    assert.ok(Object.hasOwn(display.getSettings(), "Target 2"));
    assert.deepEqual(display.getSettings()["Display Format"].choice, ["parameter", "decimal", "percent", "label"]);
});

test("new widgets create and dispose HTML and Babylon.js views and expose field bindings", async () => {
    for(const id of ["rotary_knob", "toggle_switch", "momentary_button", "numeric_display"]){
        const { env, htmlFields, babylonFields } = createWidgetEnvironment();
        const factory = await controls[id](env);
        const widget = await factory.create();
        widget.setDefaultValues();
        widget.updateValue(id === "numeric_display" ? "Target 1" : "Target", "frequency");
        await new Promise(resolve => setTimeout(resolve, 0));

        const element = widget.createElement();
        const node = widget.createNode(scene);
        assert.ok(element instanceof FakeElement, `${id} creates its HTML target`);
        assert.ok(node instanceof TransformNode, `${id} creates its Babylon.js target`);
        assert.equal(htmlFields.length, id === "numeric_display" ? 0 : 1);
        assert.equal(babylonFields.length, id === "numeric_display" ? 0 : 1);
        assert.ok(node.getChildMeshes().length > 0, `${id} creates visible 3D geometry`);

        widget.destroy();
        widget.destroyElement();
        widget.destroyNode();
        assert.equal(element.parentElement, undefined);
        assert.equal(node.isDisposed(), true);
    }
});

test("toggle and momentary controls write normalized values through the shared parameter binding", async () => {
    for(const [id, input, expected] of [
        ["toggle_switch", ["click"], 1],
        ["momentary_button", ["pointerdown", "pointerup"], 0],
    ]){
        const { env } = createWidgetEnvironment();
        const factory = await controls[id](env);
        const widget = await factory.create();
        widget.updateValue("Target", "frequency");
        await new Promise(resolve => setTimeout(resolve, 0));
        const element = widget.createElement();
        element.dispatch(input[0]);
        if(input[1] === "pointerup") window.dispatch(input[1]);
        if(id === "toggle_switch") assert.equal(widget.getValue(), 20000);
        else assert.equal(widget.getValue(), 20);
        assert.equal(element.getAttribute("aria-pressed"), id === "toggle_switch" ? "true" : "false");
        widget.destroy();
        widget.destroyElement();
    }
});

test("rotary knob supports vertical dragging and keyboard adjustment", async () => {
    const { env } = createWidgetEnvironment();
    const factory = await controls.rotary_knob(env);
    const widget = await factory.create();
    widget.updateValue("Target", "frequency");
    await new Promise(resolve => setTimeout(resolve, 0));
    const element = widget.createElement();

    element.dispatch("pointerdown", { button: 0, altKey: true, clientY: 100 });
    window.dispatch("pointermove", { clientY: -50 });
    window.dispatch("pointerup");
    assert.equal(widget.getValue(), 20000);
    assert.equal(element.getAttribute("aria-valuenow"), "20000");

    widget.setValue(440);
    element.dispatch("pointerdown", { button: 0, altKey: false, clientY: 100 });
    window.dispatch("pointermove", { clientY: -50 });
    window.dispatch("pointerup");
    assert.equal(widget.getValue(), 440, "plain drag does not change the rotary value");
    element.dispatch("keydown", { key: "ArrowDown" });
    assert.equal(widget.getValue(), 430);
    assert.equal(element.getAttribute("aria-valuetext"), "430.00 Hz");
    let movePropagationStopped = false;
    element.dispatch("mousedown", {
        altKey: false,
        stopPropagation() { movePropagationStopped = true; },
    });
    assert.equal(movePropagationStopped, false, "plain drag remains available to move the control");
    element.dispatch("mousedown", {
        altKey: true,
        stopPropagation() { movePropagationStopped = true; },
    });
    assert.equal(movePropagationStopped, true, "Alt-drag is reserved for rotary adjustment");
    widget.setValue(440);
    const node = widget.createNode(scene);
    const knob = node.getChildMeshes().find(mesh => mesh.name === "rotary_knob");
    scene.pointerY = 100;
    scene.onPointerObservable.notifyObservers({
        type: PointerEventTypes.POINTERDOWN,
        event: { preventDefault() {} },
        pickInfo: { pickedMesh: knob },
    });
    scene.pointerY = -50;
    scene.onPointerObservable.notifyObservers({
        type: PointerEventTypes.POINTERMOVE,
        event: {},
        pickInfo: { pickedMesh: knob },
    });
    scene.onPointerObservable.notifyObservers({
        type: PointerEventTypes.POINTERUP,
        event: {},
        pickInfo: { pickedMesh: knob },
    });
    assert.equal(widget.getValue(), 20000);
    widget.destroy();
    widget.destroyElement();
    widget.destroyNode();
});

test("numeric display formats one or two live parameter sources without declaring editable fields", async () => {
    const { env, htmlFields, babylonFields, parameter, secondParameter } = createWidgetEnvironment();
    const factory = await controls.numeric_display(env);
    const display = await factory.create();
    display.updateValue("Target 1", "frequency");
    display.updateValue("Target 2", "resonance");
    await new Promise(resolve => setTimeout(resolve, 0));
    display.updateValue("Display Format", "decimal");
    display.updateValue("Decimal Places", 1);
    display.updateValue("Units", "Hz");
    const element = display.createElement();
    assert.equal(element.children[0].textContent, "440.0 Hz");
    assert.equal(element.children[1].textContent, "2.5 Hz");
    assert.equal(htmlFields.length, 0);
    assert.equal(babylonFields.length, 0);

    parameter.setExternalValue(880);
    assert.equal(element.children[0].textContent, "880.0 Hz");
    secondParameter.setExternalValue(4.5);
    assert.equal(element.children[1].textContent, "4.5 Hz");
    display.updateValue("Display Format", "percent");
    assert.equal(element.children[0].textContent, "4% Hz");
    display.destroy();
    display.destroyElement();
    display.destroyNode();
});

test("new widget descriptors round-trip through JSON, clipboard-shaped copies, and document undo/redo", async () => {
    const generator = WamGUIGenerator.create({});
    const history = new DocumentHistory(
        () => generator.save(controls),
        snapshot => generator.load(snapshot, controls),
    );
    try {
        await history.execute("Add rotary", () => generator.addControl({
            control: controls.rotary_knob,
            values: { "Target": "None", "Base Color": "#222222", "Cursor Color": "#00a6ff" },
            x: 0.1, y: 0.2, width: 0.15, height: 0.15,
        }));
        const saved = generator.save(controls);
        assert.equal(saved.schema_version, 2);
        assert.deepEqual(saved.required_features, [widgetFeatureId("rotary_knob")]);
        const copy = structuredClone(saved.controls[0]);
        copy.x += 0.02;
        copy.y += 0.02;
        assert.equal(copy.control, "rotary_knob");
        assert.equal(copy.values["Cursor Color"], "#00a6ff");

        const reloaded = WamGUIGenerator.create({});
        await reloaded.load(JSON.parse(JSON.stringify(saved)), controls);
        assert.deepEqual(reloaded.save(controls), saved);
        reloaded.dispose();

        await history.undo();
        assert.equal(generator.controls.length, 0);
        await history.redo();
        assert.deepEqual(generator.save(controls), saved);

        await history.execute("Add toggle", () => generator.addControl({
            control: controls.toggle_switch,
            values: { Target: "None", "On Color": "#46c887", "Off Color": "#555b66" },
            x: 0.3, y: 0.2, width: 0.15, height: 0.15,
        }));
        assert.ok(generator.save(controls).required_features.includes(widgetFeatureId("toggle_switch")));
        await history.undo();
        assert.equal(generator.controls.length, 1);
        await history.redo();
        assert.equal(generator.controls.length, 2);
    } finally {
        generator.dispose();
    }
});

test("unknown widget types fail with an actionable error before replacing the current design", async () => {
    const generator = WamGUIGenerator.create({});
    await generator.addControl({
        control: controls.cursor_control,
        values: { Target: "None" },
        x: 0.1, y: 0.1, width: 0.2, height: 0.2,
    });
    const before = generator.save(controls);
    await assert.rejects(
        generator.load({
            aspect_ratio: 1,
            size: 1,
            top_color: "#ffffff",
            bottom_color: "#000000",
            controls: [{ control: "missing_widget", values: {}, x: 0, y: 0, width: 0.2, height: 0.2 }],
        }, controls),
        /Unknown widget type "missing_widget".*compatible widget catalog.*available:/,
    );
    assert.deepEqual(generator.save(controls), before);
    generator.dispose();
});

test("new widget feature declarations are required and readouts are excluded from persisted WAM state", async () => {
    const generator = WamGUIGenerator.create({});
    await assert.rejects(
        generator.load({
            schema_version: 2,
            aspect_ratio: 1,
            size: 1,
            top_color: "#ffffff",
            bottom_color: "#000000",
            controls: [{ control: "numeric_display", values: {}, x: 0, y: 0, width: 0.3, height: 0.2 }],
        }, controls),
        /numeric_display.*requires schema_version: 2.*required feature declaration/,
    );
    await generator.addControl({
        control: controls.numeric_display,
        values: { "Target 1": "None", "Target 2": "None", "Display Format": "parameter", "Decimal Places": 2, Units: "" },
        x: 0, y: 0, width: 0.3, height: 0.2,
    });
    const states = new ControlStateManager(generator.controls);
    assert.deepEqual([...states.names], []);
    states.dispose();
    generator.dispose();
});
