/* Honours each shop's robots.txt: wildcards apply, the longest matching rule wins, and Allow
   wins a tie. If a site's rules can't be read because the site is failing, it stays out. */

const AGENT = 'daamkhojbot';
const TTL_MS = 60 * 60 * 1000;

export function parseRobots(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  let collecting = false;

  const flush = () => { if (agents.length) groups.push({ agents, rules }); };

  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (collecting) { flush(); agents = []; rules = []; collecting = false; }
      agents.push(value.toLowerCase());
    } else if (field === 'allow' || field === 'disallow') {
      collecting = true;
      if (value) rules.push({ allow: field === 'allow', value });
    }
  }
  flush();

  /* A group naming this bot replaces the wildcard group; it doesn't add to it. */
  const own = groups.filter(group => group.agents.includes(AGENT));
  const chosen = own.length ? own : groups.filter(group => group.agents.includes('*'));
  return chosen.flatMap(group => group.rules);
}

function ruleMatches(rule, target) {
  const anchored = rule.value.endsWith('$');
  const body = (anchored ? rule.value.slice(0, -1) : rule.value)
    .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(target);
}

export function isAllowed(rules, url) {
  const { pathname, search } = new URL(url);
  const target = pathname + search;
  let best = null;
  for (const rule of rules) {
    if (!ruleMatches(rule, target)) continue;
    const longer = !best || rule.value.length > best.value.length;
    const tieWon = best && rule.value.length === best.value.length && rule.allow;
    if (longer || tieWon) best = rule;
  }
  return !best || best.allow;
}

/** @param fetchPage resolves to { status, text } and may throw */
export function createRobots(fetchPage, now = Date.now) {
  const cache = new Map();

  async function rulesFor(origin) {
    try {
      const { status, text } = await fetchPage(`${origin}/robots.txt`);
      if (status >= 500) return null;
      return status >= 400 ? [] : parseRobots(text);
    } catch {
      return null;
    }
  }

  return {
    async allows(url) {
      const { origin } = new URL(url);
      let entry = cache.get(origin);
      if (!entry || now() - entry.at > TTL_MS) {
        entry = { at: now(), rules: rulesFor(origin) };
        cache.set(origin, entry);
      }
      const rules = await entry.rules;
      return rules !== null && isAllowed(rules, url);
    }
  };
}
