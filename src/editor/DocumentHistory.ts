export interface DocumentHistoryEntry<T> {
    label: string
    before: T
    after: T
}

export interface DocumentHistoryState {
    canUndo: boolean
    canRedo: boolean
    undoLabel: string | null
    redoLabel: string | null
}

export type HistoryCommandRunner = <R>(
    label: string,
    operation: () => R | Promise<R>,
) => Promise<R>

export class DocumentHistory<T> {
    private readonly undoEntries: DocumentHistoryEntry<T>[] = []
    private readonly redoEntries: DocumentHistoryEntry<T>[] = []
    private transaction: { label: string; before: T } | null = null
    private applying = false
    private readonly capture: () => T
    private readonly restore: (snapshot: T) => void | Promise<void>
    private readonly clone: (snapshot: T) => T
    private readonly limit: number
    private readonly onChange: (state: DocumentHistoryState) => void

    constructor(
        capture: () => T,
        restore: (snapshot: T) => void | Promise<void>,
        clone: (snapshot: T) => T = snapshot => structuredClone(snapshot),
        limit = 100,
        onChange: (state: DocumentHistoryState) => void = () => {},
    ) {
        if(!Number.isInteger(limit) || limit < 1){
            throw new RangeError("History limit must be a positive integer")
        }
        this.capture = capture
        this.restore = restore
        this.clone = clone
        this.limit = limit
        this.onChange = onChange
        this.notify()
    }

    get state(): DocumentHistoryState {
        return {
            canUndo: this.undoEntries.length > 0,
            canRedo: this.redoEntries.length > 0,
            undoLabel: this.undoEntries.at(-1)?.label ?? null,
            redoLabel: this.redoEntries.at(-1)?.label ?? null,
        }
    }

    begin(label: string): void {
        if(this.applying || this.transaction) return
        this.transaction = { label, before: this.clone(this.capture()) }
    }

    commit(): void {
        if(this.applying || !this.transaction) return
        const { label, before } = this.transaction
        this.transaction = null
        this.push({ label, before, after: this.clone(this.capture()) })
    }

    cancel(): void {
        this.transaction = null
    }

    async execute<R>(label: string, operation: () => R | Promise<R>): Promise<R> {
        if(this.applying) throw new Error("Cannot edit the document while history is restoring a snapshot")
        if(this.transaction) throw new Error("Cannot start a document command during an active edit transaction")
        this.begin(label)
        try {
            const result = await operation()
            this.commit()
            return result
        } catch(error) {
            this.commit()
            throw error
        }
    }

    reset(): void {
        this.transaction = null
        this.undoEntries.length = 0
        this.redoEntries.length = 0
        this.notify()
    }

    async undo(): Promise<void> {
        this.commit()
        const entry = this.undoEntries.at(-1)
        if(!entry) return
        const current = this.clone(this.capture())
        const target = this.clone(entry.before)
        this.undoEntries.pop()
        this.applying = true
        try {
            await this.restore(target)
            this.redoEntries.push({ ...entry, after: current })
        } catch(error) {
            this.undoEntries.push(entry)
            throw error
        } finally {
            this.applying = false
            this.notify()
        }
    }

    async redo(): Promise<void> {
        this.commit()
        const entry = this.redoEntries.at(-1)
        if(!entry) return
        const current = this.clone(this.capture())
        const target = this.clone(entry.after)
        this.redoEntries.pop()
        this.applying = true
        try {
            await this.restore(target)
            this.undoEntries.push({ ...entry, before: current })
            this.trimUndoEntries()
        } catch(error) {
            this.redoEntries.push(entry)
            throw error
        } finally {
            this.applying = false
            this.notify()
        }
    }

    private push(entry: DocumentHistoryEntry<T>): void {
        if(JSON.stringify(entry.before) === JSON.stringify(entry.after)) return
        this.undoEntries.push(entry)
        this.trimUndoEntries()
        this.redoEntries.length = 0
        this.notify()
    }

    private trimUndoEntries(): void {
        if(this.undoEntries.length > this.limit){
            this.undoEntries.splice(0, this.undoEntries.length - this.limit)
        }
    }

    private notify(): void {
        this.onChange(this.state)
    }
}
