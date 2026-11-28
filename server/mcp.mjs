/* POST /mcp: the price list for AI agents, as a Model Context Protocol server.

   An agent (Claude, ChatGPT, Cursor, …) connects to https://<site>/mcp and can then ask which
   Bangladeshi shop sells a product for less. It answers from the same price list as the site,
   with the same rate limits. Streamable HTTP without sessions or streams: each POST carries one
   JSON-RPC message (or a batch) and gets its answer as plain JSON. Written without the MCP SDK
   so the server keeps no runtime dependencies. */

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 64 * 1024;
const MAX_OFFERS = 8;

const TOOLS = [
  {
    name: 'compare_prices',
    title: 'Compare prices across Bangladeshi shops',
    description: 'Find a product\'s price at Bangladeshi online shops (Star Tech, Ryans, Techland, Apple Gadgets and about 30 more), '
      + 'cheapest first, one group per version (for example 128GB and 256GB). Each price is read from the shop\'s own page and '
      + 'says when it was checked. Use it to tell someone where a product is cheapest in Bangladesh, in taka (BDT). '
      + 'The query can be English or Bangla, e.g. "iPhone 16 128GB", "rtx 4060", "আইফোন ১৫".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The product to look for: brand, model and version if it matters.', minLength: 2, maxLength: 80 },
        fresh: { type: 'boolean', description: 'Re-read the shops\' pages before answering (a few seconds slower). Use when the person is about to buy.', default: false }
      },
      required: ['query'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  },
  {
    name: 'list_shops',
    title: 'Shops in the price list',
    description: 'The Bangladeshi online shops DaamKhoj reads prices from, with how many prices each has and how old the price list is.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false }
  }
];

const taka = price => `৳${Math.round(price).toLocaleString('en-IN')}`;
const stockWord = inStock => (inStock === true ? 'in stock' : inStock === false ? 'out of stock' : 'stock unknown');
const day = iso => (iso ? String(iso).slice(0, 10) : 'unknown');

/** The search answer as a short report an agent can pass on, cheapest first. */
export function describeAnswer(answer, siteUrl) {
  const groups = (answer.groups ?? []).filter(group => group.offers?.length);
  const lines = [];
  if (answer.broadenedFrom) lines.push(`No exact match for "${answer.broadenedFrom}". Closest in the price list: "${answer.query}".`);
  else if (answer.correctedFrom) lines.push(`Searched for "${answer.query}" (read from "${answer.correctedFrom}").`);
  if (!groups.length) {
    lines.push(`No shop in the price list has "${answer.query}". It may still be sold elsewhere.`);
    return lines.join('\n');
  }
  for (const group of groups) {
    const offers = group.offers.slice(0, MAX_OFFERS);
    const best = group.offers.find(offer => offer.inStock !== false) ?? null;
    lines.push('');
    lines.push(`## ${group.label || answer.query}${group.comparable === false ? ' (version unclear: compare with care)' : ''}`);
    if (best) lines.push(`Cheapest available: ${taka(best.price)} at ${best.shop} — ${best.url}`);
    else lines.push('Every shop shows this as out of stock.');
    for (const offer of offers) {
      lines.push(`- ${taka(offer.price)} · ${offer.shop} · ${stockWord(offer.inStock)} · checked ${day(offer.checkedAt)} · ${offer.title} · ${offer.url}`);
    }
    if (group.offers.length > offers.length) lines.push(`- …and ${group.offers.length - offers.length} more`);
  }
  lines.push('');
  lines.push(`Prices are read from each shop's own page and can change; confirm on the shop's site before paying. All prices: ${siteUrl}/?q=${encodeURIComponent(answer.query)}`);
  return lines.join('\n').trim();
}

/** The same answer, trimmed to what an agent needs, for structured use. */
function compactAnswer(answer, siteUrl) {
  return {
    query: answer.query,
    ...(answer.correctedFrom ? { correctedFrom: answer.correctedFrom } : {}),
    ...(answer.broadenedFrom ? { broadenedFrom: answer.broadenedFrom } : {}),
    groups: (answer.groups ?? []).filter(group => group.offers?.length).map(group => ({
      version: group.label || null,
      comparable: group.comparable !== false,
      offers: group.offers.slice(0, MAX_OFFERS).map(offer => ({
        shop: offer.shop, price: offer.price, currency: 'BDT', inStock: offer.inStock ?? null,
        title: offer.title, url: offer.url, checkedAt: offer.checkedAt ?? null
      }))
    })),
    page: `${siteUrl}/?q=${encodeURIComponent(answer.query)}`
  };
}

class ToolError extends Error {}

export function createMcp({
  searchIndex, recheck = null, allowQuick = () => true, allowRecheck = () => true,
  clientAddress = () => '', siteUrl = 'https://daamkhoj.onrender.com', version = '1.0.0', log = console.error
}) {
  const site = String(siteUrl).replace(/\/+$/, '');

  async function comparePrices(args, req) {
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    if (query.length < 2) throw new ToolError('Give a product name to search for, e.g. "iPhone 16 128GB".');
    const fresh = args?.fresh === true && recheck;
    const allowed = fresh ? allowRecheck(clientAddress(req)) : allowQuick(clientAddress(req));
    if (!allowed) throw new ToolError('Too many searches from this address. Wait a minute and try again.');
    let answer;
    try {
      answer = fresh ? await recheck(query, { product: '' }) : await searchIndex(query, { closest: true });
    } catch (error) {
      throw new ToolError(error?.message || 'The search could not finish. Try again.');
    }
    return { content: [{ type: 'text', text: describeAnswer(answer, site) }], structuredContent: compactAnswer(answer, site) };
  }

  async function listShops(req) {
    if (!allowQuick(clientAddress(req))) throw new ToolError('Too many requests from this address. Wait a minute and try again.');
    const [browse, index] = await Promise.all([searchIndex.browse?.().catch(() => null), searchIndex.index?.().catch(() => null)]);
    const shops = (browse?.shops ?? []).map(entry => ({ shop: entry.shop, prices: entry.prices }));
    const updatedAt = index?.updatedAt ?? null;
    const text = [
      `${shops.length} shops, ${(index?.size ?? browse?.prices ?? 0).toLocaleString('en-IN')} prices, list updated ${updatedAt ?? 'unknown'}.`,
      ...shops.map(entry => `- ${entry.shop}: ${entry.prices.toLocaleString('en-IN')} prices`)
    ].join('\n');
    return { content: [{ type: 'text', text }], structuredContent: { shops, prices: index?.size ?? null, updatedAt } };
  }

  async function callTool(params, req) {
    try {
      if (params?.name === 'compare_prices') return await comparePrices(params.arguments ?? {}, req);
      if (params?.name === 'list_shops') return await listShops(req);
    } catch (error) {
      if (!(error instanceof ToolError)) log(`mcp ${params?.name} failed: ${error.message}`);
      return { content: [{ type: 'text', text: error instanceof ToolError ? error.message : 'The tool failed. Try again.' }], isError: true };
    }
    return null;
  }

  /** One JSON-RPC message in, its answer out (null for a notification). */
  async function answer(message, req) {
    const isRequest = message && typeof message === 'object' && message.jsonrpc === '2.0' && typeof message.method === 'string';
    if (!isRequest) return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
    if (!('id' in message)) return null;
    const reply = result => ({ jsonrpc: '2.0', id: message.id, result });
    const fail = (code, text) => ({ jsonrpc: '2.0', id: message.id, error: { code, message: text } });
    switch (message.method) {
      case 'initialize': {
        const asked = message.params?.protocolVersion;
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'daamkhoj', title: 'DaamKhoj price comparison', version },
          instructions: 'Use compare_prices to find where a product is cheapest at Bangladeshi online shops, in taka. '
            + 'Name the shop and price, link the shop\'s page, say when the price was checked, and remind the person to confirm on the shop\'s site.'
        });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: TOOLS });
      case 'tools/call': {
        const result = await callTool(message.params, req);
        return result ? reply(result) : fail(-32602, `Unknown tool: ${message.params?.name}`);
      }
      default: return fail(-32601, `Method not found: ${message.method}`);
    }
  }

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, authorization',
    'access-control-expose-headers': 'mcp-protocol-version'
  };
  const send = (res, status, body) => {
    res.writeHead(status, { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const readBody = req => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      /* Too big: stop keeping it, answer 413, then close the connection (below). */
      if (size > MAX_BODY) reject(new Error('too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  return async function handle(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    /* No server-to-client stream: a GET is told so, as the transport allows. */
    if (req.method !== 'POST') {
      res.writeHead(405, { ...cors, allow: 'POST, OPTIONS', 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'POST JSON-RPC messages to this address' } }));
    }
    if (!searchIndex) return send(res, 503, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'The price list is not set up on this server' } });

    let parsed;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch (error) {
      if (error.message === 'too large') {
        res.on('finish', () => req.destroy());
        return send(res, 413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } });
      }
      return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const batch = Array.isArray(parsed);
    const messages = batch ? parsed : [parsed];
    if (!messages.length || messages.length > 10) return send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
    const answers = (await Promise.all(messages.map(message => answer(message, req)))).filter(Boolean);
    if (!answers.length) return send(res, 202);
    return send(res, 200, batch ? answers : answers[0]);
  };
}
