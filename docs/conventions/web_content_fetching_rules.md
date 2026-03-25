# Web Content Fetching Rules

## Purpose

Ensure agents use the web scraper MCP for URLs from sites that require authenticated or JavaScript-rendered scraping, instead of relying on basic fetch tools that return empty or login-gated pages.

## Trigger Patterns

When an agent encounters a URL from a supported source (see list below), agents MUST use the `user-web-scraper` MCP `scrape_content` tool instead of `WebFetch` or other generic fetch tools.

## Supported Sources

The web scraper MCP supports the following sources (check `list_supported_sources` for the current list):

- **ChatGPT**: `chatgpt.com/share/*`, `chatgpt.com/c/*`
- **Claude**: `claude.ai/share/*`
- **Twitter/X**: `twitter.com/*`, `x.com/*` (single tweets and account profiles)
- **Spotify**: `open.spotify.com/playlist/*`
- **NYT Podcast**: `nytimes.com/*/podcasts/*`
- **Metacast**: `metacast.app/podcast/*`

## Agent Actions

### Step 1: Detect supported URL

When the user provides a URL, check whether it matches any supported source pattern above.

### Step 2: Normalize the URL before scraping

Some share URLs contain extra path segments that break scraping (e.g. ChatGPT team/enterprise shares use `/share/e/<id>` instead of `/share/<id>`). Before the first scrape attempt, agents MUST normalize the URL by removing non-standard path segments. Known normalizations:

- **ChatGPT**: Remove `/e/` segment from team/enterprise share links. `chatgpt.com/share/e/<id>` → `chatgpt.com/share/<id>`

If the original URL fails, agents MUST retry with the normalized URL before giving up. If both fail, proceed to fallback.

### Step 3: Use web scraper MCP

If the URL matches a supported source, call:

```
CallMcpTool(server="user-web-scraper", toolName="scrape_content", arguments={"url": "<url>"})
```

MUST NOT use `WebFetch` for these URLs. `WebFetch` returns login pages or empty content for authenticated/JS-rendered sources.

### Step 4: Fall back to WebFetch for unsupported URLs

For URLs that do not match any supported source, `WebFetch` remains the default tool.

## Constraints

- Agents MUST use `user-web-scraper` MCP `scrape_content` for all ChatGPT shared links.
- Agents MUST use `user-web-scraper` MCP `scrape_content` for all other supported source URLs (Claude, Twitter/X, Spotify, NYT Podcast, Metacast).
- Agents MUST NOT use `WebFetch` for URLs matching supported source patterns.
- Agents SHOULD check `list_supported_sources` if uncertain whether a source is supported.
- Agents MAY use the `method` parameter (`auto`, `playwright`, `apify`, `requests`) if a specific scraping method is needed; default `auto` is preferred.
