# MCP server for AI agents

DaamKhoj's price list is also a [Model Context Protocol](https://modelcontextprotocol.io) server,
so an AI agent can tell someone which Bangladeshi shop sells a product for less.

**Address:** `https://daamkhoj.onrender.com/mcp`. No key, nothing to install.

It answers from the same price list as the site (`server/mcp.mjs`), over Streamable HTTP
without sessions: each `POST` carries a JSON-RPC message and gets plain JSON back. A `GET`
answers 405, because there is no event stream.

## Tools

| Tool | Input | Answer |
|---|---|---|
| `compare_prices` | `query` (English or Bangla, 2–80 characters), `fresh` (optional: re-read the shops' pages first, a few seconds slower) | One section per version, cheapest first: the cheapest offer in stock, then up to 8 offers with shop, price in taka, stock, date checked and link. Also as `structuredContent` |
| `list_shops` | none | The shops, how many prices each has, and when the list was updated |

A search that finds nothing exact answers with the closest search and says so, like the site.

Example answer to `compare_prices { "query": "iphone 16 pro 256gb" }`:

```
## 256GB
Cheapest available: ৳1,37,999 at istockbd.com — https://istockbd.com/products/iphone-16-pro?variant=…
- ৳1,37,999 · istockbd.com · in stock · checked 2026-11-27 · iPhone 16 Pro 256GB / Desert Titanium · https://…
```

## Connecting

| Client | How |
|---|---|
| Claude Code | `claude mcp add --transport http daamkhoj https://daamkhoj.onrender.com/mcp` |
| Claude (web, desktop) | Settings → Connectors → Add custom connector → paste the address |
| ChatGPT | Settings → Apps & Connectors → Create (developer mode) → paste the address |
| Cursor, VS Code, others | Add `{ "mcpServers": { "daamkhoj": { "url": "https://daamkhoj.onrender.com/mcp" } } }` to the MCP settings |
| Clients that only start local programs | `npx -y mcp-remote https://daamkhoj.onrender.com/mcp` as the command |

## Limits

Per visitor, per minute: 60 `compare_prices` or `list_shops` calls, and 10 with `fresh: true`.
Over the limit the tool answers with `isError: true` and "Too many searches". Bodies over
64 KB get 413; at most 10 messages per batch.

## Supported

Protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05` (the newest is answered when a
client asks for one it does not know). Methods: `initialize`, `ping`, `tools/list`,
`tools/call`; notifications are accepted with 202. CORS is open, so browser-based clients work.
