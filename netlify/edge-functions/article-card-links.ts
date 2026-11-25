export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const response = await context.next()
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) return response

  const html = await response.text()
  const script = `<script>
(() => {
  const slugify = (value) => value.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).replace(/-+$/g, '') || 'article';
  const hash = (value) => { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const addLinks = () => document.querySelectorAll('#news-grid .legal-card').forEach((card) => {
    const heading = card.querySelector('h3');
    if (!heading || heading.querySelector('a')) return;
    const title = heading.textContent.trim();
    const dateText = card.querySelector('.font-mono')?.textContent || '';
    const date = new Date(dateText.replace('● LIVE', '').trim());
    if (!title || Number.isNaN(date.getTime())) return;
    const sourceLink = card.querySelector('a[href^="http"]');
    const original = sourceLink?.href || title;
    const path = '/articles/' + date.getFullYear() + '/' + slugify(title) + '-' + hash(original) + '.html';
    const link = document.createElement('a'); link.href = path; link.className = 'hover:text-blue-800'; link.setAttribute('aria-label', 'Read article: ' + title);
    heading.replaceChildren(link); link.textContent = title;
  });
  addLinks(); new MutationObserver(addLinks).observe(document.getElementById('news-grid') || document.body, { childList: true, subtree: true });
})();
</script>`
  return new Response(html.replace('</body>', `${script}</body>`), { status: response.status, headers: response.headers })
}

export const config = { path: '/' }
