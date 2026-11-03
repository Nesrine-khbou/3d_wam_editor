export interface FaceTransform {
    x: number
    y: number
    rotation_degrees: number
    scale: number
}

export const DEFAULT_FACE_TRANSFORM: Readonly<FaceTransform> = Object.freeze({
    x: 0,
    y: 0,
    rotation_degrees: 0,
    scale: 1,
})

export function normalizeFaceTransform(value: Partial<FaceTransform> = {}): FaceTransform {
    const transform = {
        x: value.x ?? DEFAULT_FACE_TRANSFORM.x,
        y: value.y ?? DEFAULT_FACE_TRANSFORM.y,
        rotation_degrees: value.rotation_degrees ?? DEFAULT_FACE_TRANSFORM.rotation_degrees,
        scale: value.scale ?? DEFAULT_FACE_TRANSFORM.scale,
    }
    for(const [key, number] of Object.entries(transform)){
        if(!Number.isFinite(number)){
            throw new TypeError(`face_transform.${key} must be a finite number`)
        }
    }
    if(transform.scale <= 0){
        throw new RangeError("face_transform.scale must be greater than 0")
    }
    return transform
}

export function transformFacePoint(
    point: {x: number; y: number},
    input: Partial<FaceTransform>,
): {x: number; y: number} {
    const transform = normalizeFaceTransform(input)
    const radians = transform.rotation_degrees * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const x = point.x - 0.5
    const y = point.y - 0.5
    return {
        x: 0.5 + transform.x + transform.scale * (cosine * x - sine * y),
        y: 0.5 + transform.y + transform.scale * (sine * x + cosine * y),
    }
}

export function textureUvToSourceUv(
    uv: {x: number; y: number},
    input: Partial<FaceTransform>,
): {x: number; y: number} {
    const transform = normalizeFaceTransform(input)
    const radians = transform.rotation_degrees * Math.PI / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const screenX = uv.x - 0.5 - transform.x
    const screenY = 0.5 - uv.y - transform.y
    const sourceX = (cosine * screenX + sine * screenY) / transform.scale
    const sourceY = (-sine * screenX + cosine * screenY) / transform.scale
    return {
        x: 0.5 + sourceX,
        y: 1 - (0.5 + sourceY),
    }
}

export function svgFaceTransform(input: Partial<FaceTransform>): string {
    const transform = normalizeFaceTransform(input)
    const x = transform.x * 100
    const y = transform.y * 100
    return `translate(50 50) translate(${x} ${y}) rotate(${transform.rotation_degrees}) scale(${transform.scale}) translate(-50 -50)`
}
