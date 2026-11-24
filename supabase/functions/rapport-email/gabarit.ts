// Gabarit de l'email « Ton rapport » : fonction pure, sans accès réseau ni base.
// HTML en tableaux + styles en ligne (Gmail / Outlook), largeur 600, Poppins avec repli Arial.
// Tout texte inséré est échappé. Le vert clair (#80bf9e) n'est jamais utilisé en fond.

export type LienSuivi = { titre?: unknown; texte?: unknown; url?: unknown; bouton?: unknown }

export type DonneesRapport = {
  pseudo?: string | null
  quiz_titre: string
  date?: string | null // ISO
  formateur_nom?: string | null
  nb_questions?: number | null
  nb_bonnes?: number | null
  liens_suivi?: LienSuivi[] | null
  jeton_rapport: string
  jeton_newsletter?: string | null
  url_confidentialite?: string | null
  site_url?: string // ex. https://quiz.revolia.be (sans « / » final)
}

const POLICE = "Poppins,'Trebuchet MS',Arial,Helvetica,sans-serif"

export function echapper(valeur: unknown): string {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Espace insécable avant « ! ? : » (appliqué après l'échappement).
const fine = (s: string) => s.replace(/ ([!?:])/g, '&nbsp;$1')

// Ne garde que les URL https valides ; renvoie null sinon.
export function urlHttps(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null
  try {
    const u = new URL(valeur.trim())
    return u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

function dateLongue(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const t = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Brussels' }).format(d)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

type LienNet = { titre: string; texte: string; url: string; bouton: string }
function liensValides(liens: LienSuivi[] | null | undefined): LienNet[] {
  const sortie: LienNet[] = []
  for (const l of Array.isArray(liens) ? liens : []) {
    if (!l || typeof l !== 'object') continue
    const url = urlHttps(l.url)
    if (!url) continue
    const titre = typeof l.titre === 'string' ? l.titre.trim() : ''
    const bouton = typeof l.bouton === 'string' ? l.bouton.trim() : ''
    if (!titre && !bouton) continue
    sortie.push({ titre: titre || bouton, texte: typeof l.texte === 'string' ? l.texte.trim() : '', url, bouton: bouton || 'Découvrir' })
    if (sortie.length === 5) break
  }
  return sortie
}

function carteLien(l: LienNet, i: number, dernier: boolean): string {
  const premier = i === 0
  const fond = premier ? '#00824d' : '#030159'
  const cadre = premier ? '' : 'border:1px dashed #9fc7b2;'
  const pad = premier ? 22 : 21
  const marges = premier && dernier ? '10px 44px 40px' : premier ? '10px 44px 14px' : dernier ? '0 44px 40px' : '0 44px 14px'
  return `<tr><td class="px" style="background:#f0f6f3;padding:${marges};">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;${cadre}"><tr>
  <td width="64" valign="top" style="padding:${pad}px 0 ${pad}px ${pad}px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="36" align="center" valign="middle" bgcolor="${fond}" style="background:${fond};border-radius:18px;font-family:Poppins,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;">${i + 1}</td></tr></table></td>
  <td valign="top" style="padding:${pad - 2}px 22px ${pad}px 10px;font-family:${POLICE};">
   <div style="font-size:16px;line-height:24px;color:#030159;font-weight:600;">${echapper(l.titre)}</div>
   ${l.texte ? `<div style="padding-top:4px;font-size:14px;line-height:22px;color:#55557a;">${echapper(l.texte)}</div>` : ''}
   <div style="padding-top:10px;font-size:14px;line-height:20px;font-weight:600;"><a href="${echapper(l.url)}" style="color:#00824d;text-decoration:none;">${echapper(l.bouton)}&nbsp;&rarr;</a></div></td></tr></table>
</td></tr>`
}

function statistique(valeur: string, libelle: string, largeur: string): string {
  return `<td class="stat" width="${largeur}" valign="top" style="background:#f0f6f3;border-radius:12px;">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="stat-in" style="padding:18px 16px 16px;font-family:${POLICE};">
    <div style="font-size:34px;line-height:38px;color:#00824d;font-weight:700;">${echapper(valeur)}</div>
    <div style="padding-top:4px;font-size:13px;line-height:19px;color:#004d3d;">${echapper(libelle)}</div></td></tr></table></td>`
}

export function construireEmail(d: DonneesRapport): { html: string; text: string } {
  const site = (d.site_url || 'https://quiz.revolia.be').replace(/\/$/, '')
  const urlRapport = `${site}/rapport/${encodeURIComponent(d.jeton_rapport)}`
  const urlNewsletter = d.jeton_newsletter ? `${site}/newsletter/${encodeURIComponent(d.jeton_newsletter)}` : null
  const confidentialite = urlHttps(d.url_confidentialite)
  const liens = liensValides(d.liens_suivi)
  const titre = (d.quiz_titre || 'ton quiz').trim()
  const pseudo = (d.pseudo ?? '').trim()
  const date = dateLongue(d.date)
  const formateur = (d.formateur_nom ?? '').trim()
  const ligneDate = [date, formateur ? `avec ${formateur}, REVOLia` : 'avec REVOLia'].filter(Boolean).join(' · ')

  const nbQ = typeof d.nb_questions === 'number' && d.nb_questions > 0 ? d.nb_questions : null
  const nbB = typeof d.nb_bonnes === 'number' && d.nb_bonnes >= 0 ? d.nb_bonnes : null
  const deux = nbQ !== null && nbB !== null
  const largeur = deux ? '48%' : '100%'
  const stats: string[] = []
  if (nbQ !== null) stats.push(statistique(String(nbQ), nbQ > 1 ? 'questions explorées ensemble' : 'question explorée ensemble', largeur))
  if (nbB !== null) stats.push(statistique(String(nbB), nbB > 1 ? 'bonnes réponses aux QCM' : 'bonne réponse aux QCM', largeur))
  const blocStats = stats.length === 0 ? '' : `<tr><td class="px" style="padding:22px 44px 8px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  ${stats.join(`\n  <td class="statgap" width="4%" style="font-size:0;line-height:0;">&nbsp;</td>\n  `)}
 </tr></table>
</td></tr>`

  const bonjour = pseudo ? `Bravo ${echapper(pseudo)}&nbsp;!` : 'Bravo&nbsp;!'

  const blocSuite = liens.length === 0 ? '' : `<!-- PROCHAINES ÉTAPES -->
<tr><td class="px" style="background:#f0f6f3;padding:40px 44px 14px;font-family:${POLICE};">
 <div style="font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#00824d;font-weight:600;">Prochaines étapes</div>
 <div style="padding-top:8px;font-size:22px;line-height:30px;color:#030159;font-weight:600;">Pour que ça ne reste pas sur le papier</div>
</td></tr>
${liens.map((l, i) => carteLien(l, i, i === liens.length - 1)).join('\n')}`

  const blocNewsletter = !urlNewsletter ? '' : `<!-- NEWSLETTER -->
<tr><td class="px" style="padding:40px 44px 44px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #cfe3d8;border-radius:16px;"><tr><td style="padding:30px 28px 28px;font-family:${POLICE};">
  <div style="font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#00824d;font-weight:600;">Si ça te dit</div>
  <div style="padding-top:8px;font-size:20px;line-height:28px;color:#030159;font-weight:600;">Garder le contact avec REVOLia&nbsp;?</div>
  <div style="padding-top:10px;font-size:14px;line-height:23px;color:#55557a;">De temps en temps, on partage des nouvelles&nbsp;: nouvelles formations, idées concrètes pour utiliser l'IA au quotidien. Rien d'obligatoire, et tu ne recevras rien sans ton accord.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>
   <td align="center" style="border:2px solid #00824d;border-radius:12px;background:#ffffff;"><a href="${echapper(urlNewsletter)}" style="display:block;padding:14px 22px;font-family:${POLICE};font-size:15px;line-height:21px;font-weight:600;color:#00824d;text-decoration:none;">Je veux continuer à recevoir les nouvelles de REVOLia</a></td></tr></table>
  <div style="padding-top:14px;font-size:12px;line-height:19px;color:#55557a;">Un seul clic suffit. Tu pourras te désinscrire à tout moment.</div>
 </td></tr></table>
</td></tr>`

  const pied = `<tr><td class="px" style="background:#030159;padding:34px 44px 36px;border-radius:0 0 18px 18px;font-family:${POLICE};">
 <img src="${echapper(site)}/marque/logo-vert-pastel.png" width="96" alt="REVOLia" style="width:96px;height:auto;">
 <div style="padding-top:18px;font-size:12px;line-height:20px;color:#c9c9e3;">Tu reçois cet email parce que tu as demandé l'envoi de ton rapport à la fin du quiz «&nbsp;${echapper(titre)}&nbsp;» avec REVOLia. Ton adresse email sert uniquement à cet envoi&nbsp;: elle est supprimée avec les données du quiz après 90&nbsp;jours.</div>
 <div style="padding-top:14px;font-size:12px;line-height:20px;color:#c9c9e3;">${confidentialite ? `<a href="${echapper(confidentialite)}" style="color:#80bf9e;text-decoration:underline;">Confidentialité</a> &nbsp;·&nbsp; ` : ''}<a href="https://revolia.be" style="color:#80bf9e;text-decoration:underline;">revolia.be</a> &nbsp;·&nbsp; REVOLia, formations à l'IA pour les équipes</div>
</td></tr>`

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Ton rapport de quiz – REVOLia</title>
<style>
body{margin:0;padding:0;background:#eaf1ed}
img{border:0;display:block}
a{color:#00824d}
@media only screen and (max-width:620px){
 .ct{width:100%!important}
 .px{padding-left:22px!important;padding-right:22px!important}
 .h1{font-size:34px!important;line-height:40px!important}
 .stat{display:block!important;width:100%!important;box-sizing:border-box;margin-bottom:8px!important}
 .statgap{display:none!important}
 .stat-in{padding:14px 18px!important}
 .btn a{font-size:16px!important}
}
</style></head>
<body style="margin:0;padding:0;background:#eaf1ed;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eaf1ed;">Tes réponses, les bonnes réponses et le « Pourquoi ? » de chaque question, au même endroit.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eaf1ed;"><tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" class="ct" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">

<!-- EN-TÊTE -->
<tr><td class="px" style="background:#030159;padding:34px 44px 44px;border-radius:18px 18px 0 0;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
 <tr><td align="left"><img src="${echapper(site)}/marque/logo-blanc.png" width="140" alt="REVOLia" style="width:140px;height:auto;"></td></tr>
 <tr><td style="padding-top:44px;font-family:${POLICE};font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#80bf9e;font-weight:600;">Ton rapport de quiz</td></tr>
 <tr><td class="h1" style="padding-top:12px;font-family:${POLICE};font-size:42px;line-height:48px;color:#ffffff;font-weight:600;letter-spacing:-0.5px;">${bonjour}<br><span style="color:#80bf9e;">Voici ton rapport.</span></td></tr>
 <tr><td style="padding-top:18px;font-family:${POLICE};font-size:16px;line-height:26px;color:#d9d9ee;">Merci d'avoir joué le jeu pendant la formation. Tout ce que tu as vu ensemble est réuni au même endroit, à relire quand tu veux.</td></tr>
 </table>
</td></tr>

<!-- RÉSUMÉ -->
<tr><td class="px" style="padding:40px 44px 8px;font-family:${POLICE};">
 <div style="font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#00824d;font-weight:600;">Le quiz</div>
 <div style="padding-top:8px;font-size:24px;line-height:32px;color:#030159;font-weight:600;">${fine(echapper(titre))}</div>
 <div style="padding-top:8px;font-size:14px;line-height:22px;color:#55557a;">${echapper(ligneDate).replace(' · ', ' &nbsp;·&nbsp; ')}</div>
</td></tr>
${blocStats}

<!-- BOUTON -->
<tr><td class="px" align="center" style="padding:30px 44px 6px;">
 <table role="presentation" class="btn" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
 <td align="center" bgcolor="#00824d" style="background:#00824d;border-radius:14px;">
  <a href="${echapper(urlRapport)}" style="display:block;padding:19px 24px;font-family:${POLICE};font-size:17px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;">Voir mon rapport complet&nbsp;&nbsp;&rarr;</a></td></tr></table>
</td></tr>
<tr><td class="px" align="center" style="padding:14px 44px 40px;font-family:${POLICE};font-size:13px;line-height:21px;color:#55557a;">Tes réponses, les bonnes réponses et le «&nbsp;Pourquoi&nbsp;?&nbsp;» de chaque question. Le lien est personnel et reste valable 90&nbsp;jours. Tu peux aussi l'enregistrer en PDF.</td></tr>

${blocSuite}

${blocNewsletter}

<!-- PIED -->
${pied}
</table>
</td></tr></table>
</body></html>`

  const lignes: string[] = [
    pseudo ? `Bravo ${pseudo} ! Voici ton rapport.` : 'Bravo ! Voici ton rapport.',
    '',
    `Quiz : ${titre}`,
  ]
  if (ligneDate) lignes.push(ligneDate)
  if (nbQ !== null) lignes.push(`${nbQ} question(s) explorée(s) ensemble`)
  if (nbB !== null) lignes.push(`${nbB} bonne(s) réponse(s) aux QCM`)
  lignes.push(
    '',
    'Voir mon rapport complet (tes réponses, les bonnes réponses et le « Pourquoi ? » de chaque question) :',
    urlRapport,
    "Le lien est personnel et reste valable 90 jours. Tu peux aussi l'enregistrer en PDF.",
  )
  if (liens.length) {
    lignes.push('', 'PROCHAINES ÉTAPES')
    liens.forEach((l, i) => {
      lignes.push('', `${i + 1}. ${l.titre}`)
      if (l.texte) lignes.push(l.texte)
      lignes.push(`${l.bouton} : ${l.url}`)
    })
  }
  if (urlNewsletter) {
    lignes.push(
      '',
      'GARDER LE CONTACT AVEC REVOLIA ?',
      'Je veux continuer à recevoir les nouvelles de REVOLia :',
      urlNewsletter,
      'Un seul clic suffit. Tu pourras te désinscrire à tout moment.',
    )
  }
  lignes.push(
    '',
    '--',
    `Tu reçois cet email parce que tu as demandé l'envoi de ton rapport à la fin du quiz « ${titre} » avec REVOLia. Ton adresse email sert uniquement à cet envoi : elle est supprimée avec les données du quiz après 90 jours.`,
  )
  if (confidentialite) lignes.push(`Confidentialité : ${confidentialite}`)
  lignes.push("REVOLia, formations à l'IA pour les équipes - https://revolia.be")

  return { html, text: lignes.join('\n') }
}
