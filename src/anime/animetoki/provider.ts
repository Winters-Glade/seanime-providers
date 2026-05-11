/// <reference path="./online-streaming-provider.d.ts" />

/**
 * AnimeToki Online Streaming Provider for Seanime
 *
 * Features:
 * - Searches animetoki.com via WordPress REST API
 * - Discovers all episodes of a series from any single episode page's
 *   "Download The Anime From Cloud" section (which lists ALL episodes)
 * - Extracts direct MKV video URLs from Cloudflare Workers (served as video/mp4)
 * - Attaches WebVTT subtitles from stream.animetoki.com
 *
 * Limitations:
 * - Completed series with only batch download pages do NOT have streamable
 *   individual episode pages and will not appear in search results.
 * - The Cloudflare Worker domain may change over time.
 */

class Provider {
    // ─── Site Constants ───────────────────────────────────────────────

    private BASE = "https://animetoki.com";
    private API = "https://animetoki.com/wp-json/wp/v2";
    private STREAM_HOST = "cool-salad-a91a.animeshmeta31320024340.workers.dev";
    private DOWNLOAD_HOST = "ongoing-at.25002.workers.dev";
    private SUB_HOST = "stream.animetoki.com";

    // ─── Settings ─────────────────────────────────────────────────────

    getSettings() {
        return {
            episodeServers: ["default", "sub", "dual"],
            supportsDub: true,
        };
    }

    // ─── Search ───────────────────────────────────────────────────────

    async search(opts) {
        var encoded = encodeURIComponent(opts.query);
        var url = this.API + "/posts?search=" + encoded + "&per_page=20&_fields=id,title,slug,link";

        var res = await fetch(url);
        if (!res.ok) return [];

        var posts = await res.json();
        var results = [];

        for (var i = 0; i < posts.length; i++) {
            var post = posts[i];
            var slug = post.slug;
            var title = post.title.rendered;

            // Only include episode pages, skip series/download pages
            if (!slug.match(/episode-\d+/)) continue;

            var isDub = slug.indexOf("dual-audio") !== -1
                || title.toLowerCase().indexOf("dual audio") !== -1;

            results.push({
                id: String(post.id),
                title: title,
                url: post.link,
                subOrDub: isDub ? "dub" : "sub",
            });
        }

        return results;
    }

    // ─── Episode Discovery ────────────────────────────────────────────

    async findEpisodes(id) {
        var postId = parseInt(id, 10);

        // Fetch the full post content via WordPress REST API
        var res = await fetch(this.API + "/posts/" + postId + "?_fields=id,content");
        if (!res.ok) throw new Error("No episodes found.");

        var post = await res.json();
        var html = post.content.rendered;

        // Step 1: Extract the "Download The Anime From Cloud" section
        // This section contains download links for ALL episodes of this series
        var dlSection = html.match(
            /Download\s+The\s+Anime\s+From\s+Cloud[\s\S]*?<\/div>\s*<\/div>/i
        );
        if (!dlSection) {
            // Fallback: try to find any download-list div
            dlSection = html.match(
                /id="download-list"[\s\S]*?<\/div>/i
            );
        }
        if (!dlSection) throw new Error("No episodes found.");

        var dlHtml = dlSection[0];

        // Step 2: Parse episode download links
        // Pattern: <a href="https://ongoing-at.25002.workers.dev/0:/...mkv?a=view" ...>
        //    <span class="fas fa-download" ...></span> Episode NN (1080) </a>
        var linkRegex = /<a\s+href="([^"]+)"[^>]*>[\s\S]*?Episode\s+(\d+)\s*\((\d+)\)\s*<\/a>/gi;
        var episodes = [];
        var match;

        while ((match = linkRegex.exec(dlHtml)) !== null) {
            var downloadUrl = match[1];
            var epNumber = parseInt(match[2], 10);
            var quality = match[3]; // e.g., "1080"

            // Transform download URL → stream URL
            var streamUrl = this.transformDownloadToStream(downloadUrl);

            // Derive subtitle URL from the stream filename
            var subUrl = this.deriveSubtitleUrl(streamUrl);

            // Encode stream URL into the episode ID so findEpisodeServer
            // can extract it without another network fetch
            episodes.push({
                id: postId + ":" + epNumber + ":" + encodeURIComponent(streamUrl) + ":" + encodeURIComponent(subUrl),
                number: epNumber,
                url: streamUrl,
                title: "Episode " + epNumber,
            });
        }

        // Sort by episode number ascending
        episodes.sort(function (a, b) { return a.number - b.number; });

        if (episodes.length === 0) throw new Error("No episodes found.");
        return episodes;
    }

    // ─── Video Source Extraction ──────────────────────────────────────

    async findEpisodeServer(episode, server) {
        var streamUrl = episode.url;
        var subtitleUrl = null;

        // If the episode ID has stream/sub URL encoded, extract it
        if (episode.id.indexOf(":") !== -1) {
            var parts = episode.id.split(":");
            if (parts.length >= 4) {
                streamUrl = decodeURIComponent(parts[2]);
                subtitleUrl = decodeURIComponent(parts[3]);
            } else if (parts.length >= 3) {
                streamUrl = decodeURIComponent(parts[2]);
                // Derive subtitle from stream URL
                subtitleUrl = this.deriveSubtitleUrl(streamUrl);
            }
        } else {
            // Fallback: extract from episode page
            var postId = parseInt(episode.id, 10);
            var res = await fetch(this.API + "/posts/" + postId + "?_fields=id,content");
            if (!res.ok) throw new Error("Failed to fetch episode server.");

            var post = await res.json();
            var html = post.content.rendered;

            var srcMatch = html.match(/source\s+src="([^"]+\.(?:mkv|mp4|m3u8))"/i);
            if (!srcMatch) throw new Error("No video source found.");
            streamUrl = srcMatch[1];

            var subMatch = html.match(/track[^>]*src="([^"]+\.vtt)"/i);
            if (subMatch) subtitleUrl = subMatch[1];
        }

        // Build subtitles array
        var subtitles = [];
        if (subtitleUrl) {
            subtitles.push({
                id: "en",
                url: subtitleUrl,
                language: "English",
                isDefault: true,
            });
        }

        var isDual = server === "dual";

        return {
            server: isDual ? "Dual Audio" : "English Subbed",
            headers: {
                "Referer": "https://animetoki.com/",
                "Origin": "https://animetoki.com",
            },
            videoSources: [{
                url: streamUrl,
                type: "mp4",
                quality: "1080p",
                subtitles: subtitles,
            }],
        };
    }

    // ─── Helper: Transform download URL → stream URL ──────────────────

    transformDownloadToStream(downloadUrl) {
        // Remove protocol-relative prefix (//) if present
        var cleaned = downloadUrl;
        if (cleaned.indexOf("//") === 0) {
            cleaned = "https:" + cleaned;
        }

        // Strip ?a=view query param
        cleaned = cleaned.replace(/\?a=view$/, "");

        // Replace download host + path prefix with stream host + path prefix
        cleaned = cleaned.replace(
            "//" + this.DOWNLOAD_HOST + "/0:/",
            "//" + this.STREAM_HOST + "/1:/"
        );
        cleaned = cleaned.replace(
            "https://" + this.DOWNLOAD_HOST + "/0:/",
            "https://" + this.STREAM_HOST + "/1:/"
        );

        // Ensure protocol is https
        if (cleaned.indexOf("http://") === 0) {
            cleaned = "https://" + cleaned.substring(7);
        }
        if (cleaned.indexOf("//") === 0) {
            cleaned = "https:" + cleaned;
        }

        return cleaned;
    }

    // ─── Helper: Derive subtitle URL from stream URL ──────────────────

    deriveSubtitleUrl(streamUrl) {
        var filename = decodeURIComponent(streamUrl.split("/").pop() || "");
        var subFilename = filename.replace(/\.mkv$/i, ".vtt");
        return "https://" + this.SUB_HOST + "/subs/" + encodeURIComponent(subFilename);
    }
}
