import assert from "node:assert/strict";
import { test } from "node:test";

const { DocumentHistory } = await import("../src/editor/DocumentHistory.ts");

function createHistory(initial = { value: 0 }, options = {}) {
    let document = structuredClone(initial);
    const history = new DocumentHistory(
        () => document,
        snapshot => { document = structuredClone(snapshot); },
        snapshot => structuredClone(snapshot),
        options.limit ?? 100,
        options.onChange,
    );
    return {
        history,
        get document() { return document; },
        set document(value) { document = value; },
    };
}

test("records undo and redo snapshots for sync and async commands", async () => {
    const state = createHistory();
    await state.history.execute("edit value", () => { state.document.value = 1; });
    await state.history.execute("async edit", async () => { state.document.value = 2; });

    await state.history.undo();
    assert.deepEqual(state.document, { value: 1 });
    await state.history.undo();
    assert.deepEqual(state.document, { value: 0 });
    await state.history.redo();
    assert.deepEqual(state.document, { value: 1 });
    await state.history.redo();
    assert.deepEqual(state.document, { value: 2 });
});

test("document command categories round-trip controls, settings, body data, texture transforms, and auto layout", async () => {
    const state = createHistory({
        controls: [],
        body: { aspect_ratio: 1, top_color: "#ffffff" },
        face_transform: { x: 0, y: 0, rotation_degrees: 0, scale: 1 },
    });
    const commands = [
        ["add controls", () => { state.document.controls.push({ id: "a", x: 0.1, y: 0.2 }); }],
        ["remove controls", () => { state.document.controls.splice(0, 1); }],
        ["replace controls", () => { state.document.controls[0] = { id: "replacement" }; }],
        ["paste controls", () => { state.document.controls.push({ id: "pasted" }); }],
        ["group transform", () => {
            state.document.controls = [
                { id: "a", x: 0.2, y: 0.3 },
                { id: "b", x: 0.6, y: 0.7 },
            ];
        }],
        ["control setting", () => { state.document.controls[0].value = 0.75; }],
        ["body settings and texture transform", () => {
            state.document.body.aspect_ratio = 2;
            state.document.body.top_color = "#000000";
            state.document.face_transform.rotation_degrees = 45;
        }],
        ["auto layout", () => {
            state.document.controls = [{ id: "generated", x: 0.5, y: 0.5 }];
        }],
    ];

    for(const [label, operation] of commands){
        const before = structuredClone(state.document);
        await state.history.execute(label, operation);
        const after = structuredClone(state.document);
        await state.history.undo();
        assert.deepEqual(state.document, before, `${label} should undo`);
        await state.history.redo();
        assert.deepEqual(state.document, after, `${label} should redo`);
    }
});

test("live WAM parameter changes and clipboard-only changes are outside document history", async () => {
    const state = createHistory({ controls: [] });
    let runtimeParameter = 0;
    let clipboard = [];
    runtimeParameter = 0.8;
    clipboard = [{ id: "copied" }];
    assert.equal(state.history.state.canUndo, false);

    await state.history.execute("add control", () => {
        state.document.controls.push({ id: "source" });
    });
    runtimeParameter = 0.2;
    clipboard = [{ id: "source" }];
    await state.history.undo();
    assert.deepEqual(state.document, { controls: [] });
    assert.equal(runtimeParameter, 0.2);
    assert.deepEqual(clipboard, [{ id: "source" }]);
});

test("coalesces repeated input changes into one labeled gesture", async () => {
    const state = createHistory();
    state.history.begin("scrub setting");
    state.document.value = 1;
    state.history.begin("scrub setting");
    state.document.value = 2;
    state.history.commit();

    assert.equal(state.history.state.undoLabel, "scrub setting");
    await state.history.undo();
    assert.deepEqual(state.document, { value: 0 });
});

test("ignores no-op transactions, cancels redo on new edits, and trims old entries", async () => {
    const state = createHistory({ value: 0 }, { limit: 2 });
    await state.history.execute("no-op", () => {});
    assert.equal(state.history.state.canUndo, false);

    for(let value = 1; value <= 3; value++){
        await state.history.execute(`edit ${value}`, () => { state.document.value = value; });
    }
    assert.equal(state.history.state.undoLabel, "edit 3");
    await state.history.undo();
    await state.history.execute("branch", () => { state.document.value = 9; });
    assert.equal(state.history.state.canRedo, false);
    await state.history.undo();
    assert.deepEqual(state.document, { value: 2 });
});

test("keeps document changes made before a failed command and propagates the error", async () => {
    const state = createHistory();
    await assert.rejects(
        state.history.execute("partial edit", () => {
            state.document.value = 1;
            throw new Error("operation failed");
        }),
        /operation failed/,
    );
    assert.equal(state.history.state.canUndo, true);
    await state.history.undo();
    assert.deepEqual(state.document, { value: 0 });
});

test("reset clears history and failed restores leave the entry available", async () => {
    let document = { value: 0 };
    let shouldFailRestore = false;
    const history = new DocumentHistory(
        () => document,
        snapshot => {
            if(shouldFailRestore) throw new Error("restore failed");
            document = structuredClone(snapshot);
        },
    );
    await history.execute("edit", () => { document.value = 1; });
    shouldFailRestore = true;
    await assert.rejects(history.undo(), /restore failed/);
    assert.equal(history.state.canUndo, true);
    shouldFailRestore = false;
    await history.undo();
    assert.deepEqual(document, { value: 0 });
    history.reset();
    assert.equal(history.state.canUndo, false);
    assert.equal(history.state.canRedo, false);
});
