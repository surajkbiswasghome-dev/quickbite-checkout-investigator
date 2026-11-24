// Optional Vercel serverless function. The published claude.ai artifact has no server, so there the page falls back to official links.
// Deploy this file at /api/news on your own host to get live headlines. Edit FEEDS for the domain.
const FEEDS = [
  { tag: 'World',  url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-IN&gl=IN&ceid=IN:en' },
  { tag: 'Domain', url: 'https://news.google.com/rss/search?q=food+delivery+payments+UPI+India+when:7d&hl=en-IN&gl=IN&ceid=IN:en' }
];
const OFFICIAL = [
  { tag: 'Official', title: 'RBI press releases', url: 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx' },
  { tag: 'Official', title: 'NPCI UPI statistics', url: 'https://www.npci.org.in/what-we-do/upi/product-statistics' }
];
let cache = { at: 0, items: [] };
const dec = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
function parse(xml, tag) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6).map(m => {
    const g = k => (m[1].match(new RegExp('<' + k + '[^>]*>([\\s\\S]*?)</' + k + '>')) || [])[1];
    const src = dec(g('source') || ''); let title = dec(g('title') || ''); if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
    const d = new Date(dec(g('pubDate') || '')); return { tag, title, source: src, url: dec(g('link') || ''), date: isNaN(d) ? null : d.toISOString() };
  }).filter(x => x.title && /^https?:/.test(x.url));
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=1200, stale-while-revalidate=3600');
  if (Date.now() - cache.at < 20 * 60 * 1000 && cache.items.length) return res.status(200).json({ items: cache.items, official: OFFICIAL, live: true });
  const out = await Promise.all(FEEDS.map(async f => { try { const r = await fetch(f.url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } }); return r.ok ? parse(await r.text(), f.tag) : []; } catch { return []; } }));
  const items = out.flat().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (items.length) cache = { at: Date.now(), items };
  return res.status(200).json({ items, official: OFFICIAL, live: items.length > 0 });
}
