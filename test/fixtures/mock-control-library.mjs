export function createMockControlLibrary(controlNames, { statefulControls = [] } = {}) {
    const instances = [];
    const library = Object.fromEntries(controlNames.map(name => {
        const controlType = async env => {
            const factory = {
                env,
                label: name,
                description: `Fixture control: ${name}`,
                getSettings: () => ({}),
                getDefaultValues: () => ({}),
                async create() {
                    const instance = {
                        factory,
                        values: {},
                        destroyed: false,
                        setDefaultValues() {
                            for (const [label, value] of Object.entries(factory.getDefaultValues())) {
                                this.updateValue(label, value);
                            }
                        },
                        updateValue(label, value) {
                            this.values[label] = value;
                        },
                        destroy() {
                            this.destroyed = true;
                        },
                        destroyElement() {},
                        destroyNode() {},
                        createElement() {
                            throw new Error("Fixture controls must not render HTML in model tests");
                        },
                        createNode() {
                            return {
                                scaling: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                                position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                                setPivotPoint(point) { this.pivot = point; },
                            };
                        },
                    };

                    if (statefulControls.includes(name)) {
                        let state = null;
                        instance.getStateName = () => name;
                        instance.getState = async () => state;
                        instance.setState = async value => {
                            state = value;
                            instance.onStateChange?.();
                        };
                    }

                    instances.push(instance);
                    return instance;
                },
            };
            return factory;
        };
        return [name, controlType];
    }));

    return { library, instances };
}
