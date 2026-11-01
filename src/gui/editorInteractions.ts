export interface NormalizedRect {
    x: number
    y: number
    width: number
    height: number
}

export interface GridSnapSettings {
    enabled: boolean
    spacing: number
}

export type SnapSource = "alignment" | "grid" | "none" | "override"

export interface SnapResult {
    value: number
    source: SnapSource
    edge?: "start" | "end"
}

function closest<T extends {distance: number}>(candidates: readonly T[]): T | undefined {
    let best: T | undefined
    for(const candidate of candidates){
        if(!best || candidate.distance < best.distance - 1e-12) best = candidate
    }
    return best
}

export function clampWorkspaceSplit(value: number, minimum = 0.2, maximum = 0.8): number {
    if(!Number.isFinite(value)) return 0.5
    return Math.max(minimum, Math.min(maximum, value))
}

export function snapCoordinate(
    value: number,
    guides: readonly number[],
    settings: GridSnapSettings,
    override = false,
    disableGuides = false,
    tolerance = 0.01,
): SnapResult {
    if(override) return { value, source: "override" }

    if(!disableGuides){
        const guide = closest(guides
            .filter(target => Number.isFinite(target) && Math.abs(value - target) <= tolerance)
            .map(target => ({ target, distance: Math.abs(value - target) })))?.target
        if(guide !== undefined) return { value: guide, source: "alignment" }
    }

    if(!settings.enabled || !Number.isFinite(settings.spacing) || settings.spacing <= 0){
        return { value, source: "none" }
    }

    const gridCandidates = [
        Math.round(value / settings.spacing) * settings.spacing,
        0,
        1,
    ]
    const gridValue = closest(gridCandidates.map(target => ({ target, distance: Math.abs(value - target) })))?.target
    return { value: gridValue ?? value, source: "grid" }
}

export function snapRectPosition(
    position: number,
    extent: number,
    guides: readonly number[],
    settings: GridSnapSettings,
    override = false,
    disableGuides = false,
    tolerance = 0.01,
): SnapResult {
    if(override) return { value: position, source: "override" }

    const anchors = [
        { value: position, edge: "start" as const },
        { value: position + extent, edge: "end" as const },
    ]

    if(!disableGuides){
        const guideMatches = anchors.flatMap(anchor =>
            guides
                .filter(target => Number.isFinite(target) && Math.abs(anchor.value - target) <= tolerance)
                .map(target => ({
                    value: position + target - anchor.value,
                    edge: anchor.edge,
                    distance: Math.abs(anchor.value - target),
                })),
        )
        const guideMatch = closest(guideMatches)
        if(guideMatch) return { value: guideMatch.value, source: "alignment", edge: guideMatch.edge }
    }

    if(!settings.enabled || !Number.isFinite(settings.spacing) || settings.spacing <= 0){
        return { value: position, source: "none" }
    }

    const gridMatches = anchors.flatMap(anchor => {
        const candidates = [
            Math.round(anchor.value / settings.spacing) * settings.spacing,
            0,
            1,
        ]
        return candidates.map(target => ({
            value: position + target - anchor.value,
            edge: anchor.edge,
            distance: Math.abs(anchor.value - target),
        }))
    })
    const gridMatch = closest(gridMatches)
    return gridMatch
        ? { value: gridMatch.value, source: "grid", edge: gridMatch.edge }
        : { value: position, source: "none" }
}

export function rectanglesIntersect(a: NormalizedRect, b: NormalizedRect): boolean {
    return a.x <= b.x + b.width
        && a.x + a.width >= b.x
        && a.y <= b.y + b.height
        && a.y + a.height >= b.y
}

export function shouldSelectInMarquee(
    mode: "replace" | "add" | "toggle",
    wasSelected: boolean,
    intersects: boolean,
): boolean {
    if(mode === "toggle") return wasSelected !== intersects
    if(mode === "add") return wasSelected || intersects
    return intersects
}

export function transformGroupGeometry(
    items: readonly NormalizedRect[],
    group: NormalizedRect,
): NormalizedRect[] {
    const safeWidth = Math.max(group.width, Number.EPSILON)
    const safeHeight = Math.max(group.height, Number.EPSILON)

    return items.map(item => ({
        x: (item.x - group.x) / safeWidth,
        y: (item.y - group.y) / safeHeight,
        width: item.width / safeWidth,
        height: item.height / safeHeight,
    }))
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
    if(target === null || typeof target !== "object") return false

    const element = target as {
        tagName?: string
        isContentEditable?: boolean
        closest?: (selector: string) => unknown
    }

    if(element.isContentEditable) return true
    if(["INPUT", "TEXTAREA", "SELECT", "OPTION", "BUTTON"].includes(element.tagName?.toUpperCase() ?? "")){
        return true
    }
    return Boolean(element.closest?.("input, textarea, select, option, button, [contenteditable='true']"))
}

export interface ShortcutModifiers {
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
    altKey: boolean
}

export function matchesShortcutModifiers(
    shortcut: { ctrl?: boolean; shift?: boolean; alt?: boolean },
    event: ShortcutModifiers,
): boolean {
    return (shortcut.ctrl ?? false) === (event.ctrlKey || event.metaKey)
        && (shortcut.shift ?? false) === event.shiftKey
        && (shortcut.alt ?? false) === event.altKey
}
