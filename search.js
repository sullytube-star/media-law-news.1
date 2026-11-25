// Site-wide full-text search powered by Pagefind.
// Any element with [data-site-search] opens the search dialog. "/" or Ctrl/⌘+K also opens it.
// The Pagefind UI and index (generated at build time into /pagefind/) are loaded lazily on first open.
(function () {
  if (window.__siteSearch) return
  var dialog, ui, loading

  function loadAssets() {
    if (loading) return loading
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = '/pagefind/pagefind-ui.css'
      document.head.appendChild(css)
      var script = document.createElement('script')
      script.src = '/pagefind/pagefind-ui.js'
      script.onload = function () { window.PagefindUI ? resolve() : reject(new Error('PagefindUI missing')) }
      script.onerror = function () { reject(new Error('Search index not found')) }
      document.head.appendChild(script)
    })
    loading.catch(function () { loading = null })
    return loading
  }

  function buildDialog() {
    var style = document.createElement('style')
    style.textContent = [
      '#site-search{width:min(46rem,calc(100vw - 2rem));max-height:calc(100vh - 4rem);margin:2rem auto auto;padding:0;border:1px solid #e2e8f0;border-radius:1.5rem;box-shadow:0 25px 50px -12px rgb(15 23 42/.35);color:#0f172a}',
      '#site-search::backdrop{background:rgb(15 23 42/.45);backdrop-filter:blur(2px)}',
      '#site-search .ss-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.25rem .25rem}',
      '#site-search .ss-title{font:600 .7rem/1 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#1d4ed8}',
      '#site-search .ss-close{border:0;background:none;color:#64748b;font-size:1.25rem;line-height:1;cursor:pointer;padding:.25rem .5rem;border-radius:.75rem}',
      '#site-search .ss-close:hover{background:#f1f5f9;color:#0f172a}',
      '#site-search .ss-body{padding:.5rem 1.25rem 1.25rem;overflow:auto;max-height:calc(100vh - 9rem)}',
      '#site-search .ss-msg{font:400 .9rem/1.5 Inter,system-ui,sans-serif;color:#475569;padding:1rem 0}',
      '#site-search{--pagefind-ui-scale:.85;--pagefind-ui-primary:#1e3a8a;--pagefind-ui-text:#0f172a;--pagefind-ui-background:#fff;--pagefind-ui-border:#cbd5e1;--pagefind-ui-tag:#eff6ff;--pagefind-ui-border-width:1px;--pagefind-ui-border-radius:14px;--pagefind-ui-font:Inter,system-ui,sans-serif}',
      '#site-search .pagefind-ui__result-link{color:#0f172a}',
      '#site-search .pagefind-ui__result-link:hover{color:#1e40af}',
      '#site-search mark{background:#fef3c7;color:inherit;padding:0 .1em;border-radius:.2em}',
    ].join('')
    document.head.appendChild(style)

    dialog = document.createElement('dialog')
    dialog.id = 'site-search'
    dialog.setAttribute('aria-label', 'Search Media Law News')
    dialog.innerHTML = '<div class="ss-head"><span class="ss-title">Search articles, categories &amp; archive</span>' +
      '<button type="button" class="ss-close" aria-label="Close search">&times;</button></div>' +
      '<div class="ss-body"><div id="site-search-ui"><p class="ss-msg">Loading search…</p></div></div>'
    dialog.querySelector('.ss-close').addEventListener('click', function () { dialog.close() })
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close() })
    document.body.appendChild(dialog)
  }

  function focusInput() {
    var input = dialog.querySelector('.pagefind-ui__search-input')
    if (input) { input.focus(); input.select() }
    return input
  }

  function open(query) {
    if (!dialog) buildDialog()
    if (!dialog.open) dialog.showModal()
    loadAssets().then(function () {
      if (!ui) {
        dialog.querySelector('#site-search-ui').innerHTML = ''
        ui = new window.PagefindUI({
          element: '#site-search-ui',
          bundlePath: '/pagefind/',
          showSubResults: true,
          showImages: false,
          resetStyles: true,
          pageSize: 8,
          excerptLength: 30,
          translations: { placeholder: 'Search media law news, cases, topics…', zero_results: 'No results for [SEARCH_TERM]' },
        })
      }
      if (query) ui.triggerSearch(query)
      setTimeout(focusInput, 30)
    }).catch(function () {
      dialog.querySelector('#site-search-ui').innerHTML = '<p class="ss-msg">Search isn’t available right now. The search index is generated when the site is deployed.</p>'
    })
  }

  window.__siteSearch = { open: open }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest && e.target.closest('[data-site-search]')
    if (!trigger) return
    e.preventDefault()
    open(trigger.getAttribute('data-site-search-query') || '')
  })

  document.addEventListener('keydown', function (e) {
    var t = e.target
    var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      e.preventDefault()
      open('')
    }
  })

  // Support /?search=term links (e.g. from a no-JS form fallback).
  var initial = new URLSearchParams(location.search).get('search')
  if (initial) document.addEventListener('DOMContentLoaded', function () { open(initial) })
})()
