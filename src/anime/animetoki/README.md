# AnimeToki — Seanime Online Streaming Provider

Adds `animetoki.com` as an online streaming source for Seanime.

## How It Works

This provider uses animetoki.com's **WordPress REST API** to search for anime episodes and extract their video sources.

### Architecture

```
Search (user query)
  └─→ WordPress REST API /wp-json/wp/v2/posts?search=...
        └─→ Returns episode pages with WordPress post IDs

findEpisodes (post ID)
  └─→ Fetch post content via REST API
        └─→ Extract "Download The Anime From Cloud" section
              └─→ Parse ALL episode download links
                    └─→ Transform download URLs → stream URLs
                          └─→ Derive subtitle URLs from filenames

findEpisodeServer (episode)
  └─→ Extract pre-encoded stream URL from episode ID
        └─→ Build VideoSource with subtitles and Referer headers
```

### Video Sources

| Component | Details |
|-----------|---------|
| **Host** | Cloudflare Workers → Google Cloud Storage |
| **Format** | MKV files served as `video/mp4` |
| **Resolution** | 1080p |
| **Subtitles** | English WebVTT from `stream.animetoki.com` |
| **Audio** | Subbed (`[Sub]`) or Dual Audio (`[Dual Audio]`) |

## Installation

### Via Manifest URL

1. Open Seanime
2. Go to **Extensions** → **Add extensions**
3. Paste the manifest URL:
   ```
   https://raw.githubusercontent.com/Winters-Glade/seanime-providers/main/src/anime/animetoki/manifest.json
   ```

### Local Installation

1. Copy `manifest.json` and `provider.ts` to Seanime's extensions directory:
   - Linux: `~/.config/seanime/extensions/`
   - Windows: `%APPDATA%/seanime/extensions/`
   - macOS: `~/Library/Application Support/seanime/extensions/`

## Development

### Testing in Playground

1. Open Seanime → **Extensions** → **Playground**
2. Select **Online Streaming Provider** type
3. Paste the `provider.ts` code
4. Test each method with the simulation parameters provided

### Build

```bash
npx seanime-tool g-template
```

## Limitations

- ❌ **Completed series**: Only batch download pages exist, no streamable episodes
- ❌ **No episode listing page**: Each episode is a separate WordPress post, not grouped under a series page
- ⚠️ **Cloudflare Worker domains**: May change over time (the stream, download, and subtitle hosts)

## License

MIT
