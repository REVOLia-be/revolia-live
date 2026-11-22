// Relais Cloudflare Pages : https://quiz.revolia.be/mcp → connecteur MCP chez Supabase.
// Seules les adresses listées dans public/_routes.json passent par ici ; le reste du site
// est servi normalement, sans fonction.
const CIBLE = 'https://igwnzxyraxxyaprdkkvu.supabase.co/functions/v1/mcp'

export async function onRequest({ request, next }) {
  const url = new URL(request.url)
  let suite = null
  if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
    suite = url.pathname.slice('/mcp'.length)
  } else if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    // Forme « racine » des métadonnées (RFC 9728) : /.well-known/oauth-protected-resource/mcp
    suite = '/.well-known/oauth-protected-resource'
  }
  if (suite === null) return next()

  const entetes = new Headers(request.headers)
  entetes.delete('host')
  entetes.set('x-revolia-proxy', '1')
  const avecCorps = !['GET', 'HEAD'].includes(request.method)
  const reponse = await fetch(CIBLE + suite + url.search, {
    method: request.method,
    headers: entetes,
    body: avecCorps ? request.body : undefined,
    duplex: avecCorps ? 'half' : undefined,
    redirect: 'manual',
  })
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: reponse.headers })
}
