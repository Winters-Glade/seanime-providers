/**
 * Type definitions for Seanime Online Streaming Provider extensions.
 * 
 * Reference this in your provider code:
 *   /// <reference path="./online-streaming-provider.d.ts" />
 * 
 * The class MUST be named "Provider" (case-sensitive).
 * All four methods must be implemented.
 */

declare type SearchResult = {
    id: string
    title: string
    url: string
    subOrDub: SubOrDub
}

declare type SubOrDub = "sub" | "dub" | "both"

declare type EpisodeDetails = {
    id: string
    number: number
    url: string
    title?: string
}

declare type EpisodeServer = {
    server: string
    headers: { [key: string]: string }
    videoSources: VideoSource[]
}

declare type VideoSourceType = "mp4" | "m3u8" | "unknown"

declare type VideoSource = {
    url: string
    type: VideoSourceType
    quality: string      // e.g., "1080p", "1080p - English", must be unique
    label?: string       // e.g., "English"
    subtitles: VideoSubtitle[]
}

declare type VideoSubtitle = {
    id: string
    url: string
    language: string
    isDefault: boolean
}

declare interface Media {
    id: number
    idMal?: number
    status?: string
    format?: string
    englishTitle?: string
    romajiTitle?: string
    episodeCount?: number
    absoluteSeasonOffset?: number
    synonyms: string[]
    isAdult: boolean
    startDate?: FuzzyDate
}

declare interface FuzzyDate {
    year: number
    month?: number
    day?: number
}

declare type SearchOptions = {
    media: Media
    query: string
    dub: boolean
    year?: number
}

declare type Settings = {
    episodeServers: string[]  // e.g., ["server1", "server2"]
    supportsDub: boolean
}

declare abstract class AnimeProvider {
    search(opts: SearchOptions): Promise<SearchResult[]>
    findEpisodes(id: string): Promise<EpisodeDetails[]>
    findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer>
    getSettings(): Settings
}
