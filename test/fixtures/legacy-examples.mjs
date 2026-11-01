import examples from "../../src/examples.json" with { type: "json" };

export const legacyExampleNames = Object.freeze(Object.keys(examples));

export function loadLegacyExampleDescriptor(name) {
    const example = examples[name];
    if (example === undefined) {
        throw new RangeError(`Unknown legacy example: ${name}`);
    }

    const { wam_url: _wam_url, ...descriptor } = example;
    return structuredClone(descriptor);
}

export function loadAllLegacyExampleDescriptors() {
    return Object.fromEntries(
        legacyExampleNames.map(name => [name, loadLegacyExampleDescriptor(name)])
    );
}
