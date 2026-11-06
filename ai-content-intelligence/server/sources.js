// Trend Hunter — data ingest. Only reads feeds the user configured; never invents items.
const UA = 'Mozilla/5.0 (compatible; ContentIntelligence/0.1; +local)';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}
export const stripTags = (s = '') => decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : '';
}
function tagAll(block, name) {
  return [...block.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi'))].map((m) => m[1]);
}
function attr(block, name, a) {
  const m = block.match(new RegExp(`<${name}[^>]*\\s${a}="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
}
function toIso(s) {
  if (!s) return null;
  const d = new Date(decode(s).trim());
  return isNaN(d) ? null : d.toISOString();
}

/** Parse RSS 2.0 / Atom / Google Trends RSS into normalized raw items. */
export function parseFeed(xml, feed) {
  const blocks = tagAll(xml, 'item');
  const isAtom = blocks.length === 0;
  const list = isAtom ? tagAll(xml, 'entry') : blocks;
  const out = [];
  for (const b of list) {
    let title = stripTags(tag(b, 'title'));
    if (!title) continue;
    let url = isAtom ? attr(b, 'link', 'href') : decode(tag(b, 'link')).trim();
    let source = feed.name;
    const relatedSources = [];

    if (feed.type === 'trends') {
      // Google Trends: title is the search term; attached news items are real articles Google links to.
      for (const n of tagAll(b, 'ht:news_item')) {
        const t = stripTags(tag(n, 'ht:news_item_title'));
        const u = decode(tag(n, 'ht:news_item_url'));
        const s = stripTags(tag(n, 'ht:news_item_source'));
        if (t && u) relatedSources.push({ title: t, url: u, source: s });
      }
      if (relatedSources[0]) url = relatedSources[0].url;
    }

    if (feed.id?.startsWith('gnews') || /news\.google\.com/.test(feed.url)) {
      const src = stripTags(tag(b, 'source'));
      if (src) {
        source = src;
        title = title.replace(new RegExp(`\\s+-\\s+${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
      }
      // Description holds a list of the same story from other outlets.
      const desc = decode(tag(b, 'description'));
      for (const m of desc.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:&nbsp;|\s)*<font[^>]*>([\s\S]*?)<\/font>/g)) {
        relatedSources.push({ url: decode(m[1]), title: stripTags(m[2]), source: stripTags(m[3]) });
      }
    }

    const isGNews = feed.id?.startsWith('gnews') || /news.google.com/.test(feed.url);
    // Google News descriptions only repeat other outlets' headlines (kept in relatedSources), so no summary.
    const summary = feed.type === 'trends' ? relatedSources.map((r) => r.title).slice(0, 3).join(' · ')
      : isGNews ? '' : stripTags(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 600);

    out.push({
      title,
      summary: summary === title ? '' : summary,
      url: url || null,
      source,
      feedId: feed.id,
      feedCredibility: feed.credibility || 'medium',
      kind: feed.type === 'trends' ? 'trend' : 'news',
      feedType: feed.type,
      publishedAt: toIso(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')),
      trafficHint: feed.type === 'trends' ? stripTags(tag(b, 'ht:approx_traffic')) || null : null,
      relatedSources: relatedSources.filter((r) => r.source !== source).slice(0, 8),
    });
  }
  return out;
}

export async function fetchFeed(feed) {
  if (!/^https?:\/\//i.test(feed.url)) throw new Error('URL ต้องขึ้นต้นด้วย http:// หรือ https://');
  const res = await fetch(feed.url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(text)) throw new Error('ไม่ใช่ฟีด RSS/Atom');
  return parseFeed(text, feed);
}

export async function fetchAll(feeds) {
  const enabled = feeds.filter((f) => f.enabled);
  const results = await Promise.allSettled(enabled.map(fetchFeed));
  const items = [], errors = [], perFeed = [];
  results.forEach((r, i) => {
    const f = enabled[i];
    if (r.status === 'fulfilled') { items.push(...r.value); perFeed.push({ feedId: f.id, name: f.name, count: r.value.length, ok: true }); }
    else { errors.push(`${f.name}: ${r.reason?.message || r.reason}`); perFeed.push({ feedId: f.id, name: f.name, count: 0, ok: false, error: String(r.reason?.message || r.reason) }); }
  });
  return { items, errors, perFeed };
}
