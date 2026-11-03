import { WebAudioModule } from "@webaudiomodules/api"
import { MOValue, OValue } from "../observable/collections/OValue.ts"

export type ThumbnailReferenceState =
    | { status: "empty" }
    | { status: "loading"; url: string }
    | {
        status: "ready"
        url: string
        image: HTMLImageElement
        naturalWidth: number
        naturalHeight: number
        aspectRatio: number
    }
    | { status: "error"; url?: string; message: string }

export interface LoadedThumbnailReference {
    url: string
    image: HTMLImageElement
    naturalWidth: number
    naturalHeight: number
    aspectRatio: number
}

export function resolveThumbnailUrl(
    thumbnail: unknown,
    moduleUrl: string,
    descriptorUrl?: string,
): string | null {
    if (thumbnail === undefined || thumbnail === null || thumbnail === "") return null
    if (typeof thumbnail !== "string" || thumbnail.trim().length === 0) {
        throw new TypeError("WAM thumbnail must be a non-empty URL")
    }

    const baseUrl = descriptorUrl || moduleUrl
    if (baseUrl.length === 0) {
        throw new TypeError("A WAM descriptor or module URL is required to resolve its thumbnail")
    }

    return new URL(thumbnail.trim(), baseUrl).href
}

export async function loadThumbnailReference(
    thumbnail: unknown,
    moduleUrl: string,
    descriptorUrl?: string,
    createImage: () => HTMLImageElement = () => new Image(),
): Promise<LoadedThumbnailReference | null> {
    const url = resolveThumbnailUrl(thumbnail, moduleUrl, descriptorUrl)
    if (url === null) return null

    const image = createImage()
    image.crossOrigin = "anonymous"
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error(
            `Unable to load reference image "${url}". Check that it exists and permits cross-origin access.`,
        ))
        image.src = url
    })

    const { naturalWidth, naturalHeight } = image
    if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
        throw new Error(`Reference image "${url}" loaded without valid natural dimensions`)
    }

    return {
        url,
        image,
        naturalWidth,
        naturalHeight,
        aspectRatio: naturalWidth / naturalHeight,
    }
}

export async function loadWamThumbnailReference(
    moduleUrl: string,
    fallbackThumbnail: unknown,
    fetchDescriptor: typeof fetch = fetch,
    createImage: () => HTMLImageElement = () => new Image(),
): Promise<LoadedThumbnailReference | null> {
    if(!moduleUrl){
        if(fallbackThumbnail === undefined || fallbackThumbnail === null || fallbackThumbnail === ""){
            return null
        }
        throw new TypeError("A WAM module URL is required to resolve its descriptor thumbnail")
    }
    const descriptorUrl = new URL("./descriptor.json", moduleUrl).href
    let thumbnail = fallbackThumbnail
    let useDescriptorUrl = false

    try {
        const response = await fetchDescriptor(descriptorUrl)
        if(!response.ok){
            throw new Error(`WAM descriptor request failed with HTTP ${response.status}`)
        }
        const descriptor: unknown = await response.json()
        if(typeof descriptor !== "object" || descriptor === null || Array.isArray(descriptor)){
            throw new TypeError("WAM descriptor must be a JSON object")
        }
        if("thumbnail" in descriptor){
            thumbnail = descriptor.thumbnail
            useDescriptorUrl = true
        }
    } catch(error) {
        if(thumbnail === undefined || thumbnail === null || thumbnail === ""){
            throw new Error(
                `Unable to read WAM descriptor "${descriptorUrl}" to find its thumbnail: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
        console.warn(
            `Unable to read WAM descriptor "${descriptorUrl}"; using the module's thumbnail metadata instead`,
            error,
        )
    }

    return loadThumbnailReference(
        thumbnail,
        moduleUrl,
        useDescriptorUrl ? descriptorUrl : undefined,
        createImage,
    )
}

export class WamThumbnailReference {
    readonly state = new MOValue<ThumbnailReferenceState>({ status: "empty" })
    readonly visible = new MOValue(true)
    readonly opacity = new MOValue(0.35)

    private requestId = 0
    private readonly disposables: (() => void)[]

    constructor(
        private readonly wam: OValue<WebAudioModule | null>,
        private readonly moduleUrl: OValue<string>,
    ) {
        this.disposables = [
            wam.observable.add(() => { void this.refresh() }),
            moduleUrl.observable.add(() => { void this.refresh() }),
        ]
        void this.refresh()
    }

    async refresh(): Promise<void> {
        const requestId = ++this.requestId
        const thumbnail = this.wam.value?.descriptor?.thumbnail
        const moduleUrl = this.moduleUrl.value

        if (!this.wam.value || !moduleUrl) {
            this.state.value = { status: "empty" }
            return
        }

        try {
            const descriptorUrl = new URL("./descriptor.json", moduleUrl).href
            if (!thumbnail) {
                this.state.value = { status: "loading", url: descriptorUrl }
            } else {
                const url = resolveThumbnailUrl(thumbnail, moduleUrl)
                this.state.value = { status: "loading", url: url ?? descriptorUrl }
            }
            const loaded = await loadWamThumbnailReference(moduleUrl, thumbnail)
            if (requestId !== this.requestId) return
            if (loaded === null) {
                this.state.value = { status: "empty" }
                return
            }
            this.state.value = { status: "ready", ...loaded }
        } catch (error) {
            if (requestId !== this.requestId) return
            this.state.value = {
                status: "error",
                message: error instanceof Error ? error.message : String(error),
            }
        }
    }

    dispose(): void {
        this.requestId++
        this.disposables.forEach(dispose => dispose())
    }
}
