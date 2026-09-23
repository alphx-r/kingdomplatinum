// middleware.js — colocar na RAIZ do projeto Vercel (mesmo nível do index.html)
// Gera preview (og:image) dinâmico por Pokémon quando o link é aberto por
// bots de preview (WhatsApp, Facebook, Discord, Telegram etc). Usuário comum
// continua recebendo a SPA normalmente — o middleware só age para bots.

export const config = {
  matcher: '/:path*',
};

const BOT_UA =
  /facebookexternalhit|Facebot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Slackbot|SkypeUriPreview|vkShare|Pinterest|redditbot|Applebot|Twitterbot|W3C_Validator/i;

const SUPA_URL = 'https://vnccljhhexlsthjaaorr.supabase.co';
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuY2NsamhoZXhsc3RoamFhb3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTI5NjEsImV4cCI6MjEwMDg2ODk2MX0.XtKUKNMq7MG_NAQo74nbIsvJCKFE-qhH4_AxULF7M1k';

const FALLBACK_IMG =
  'https://64.media.tumblr.com/c429cb57b048b0ba1d90c6451d7c3aa1/8607b48e6654212e-0d/s540x810/c1f9956cc78935a32f53346f3a7a942caa5d1d67.png';

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function rpgUrlSlug(p) {
  return p.url_slug || slugify(p.name) || slugify(String(p.id));
}

function artworkFallback(id) {
  return /^\d+$/.test(String(id))
    ? `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${parseInt(id, 10)}.png`
    : FALLBACK_IMG;
}

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return; // não é bot de preview → deixa a SPA seguir normalmente

  const url = new URL(request.url);
  const m = url.pathname.match(/\/nationaldex\/(.+)$/);
  if (!m) return; // não é uma rota de detalhe de Pokémon

  const slugNorm = slugify(decodeURIComponent(m[1]));
  let poke = null;

  try {
    // Busca todos os campos necessários e resolve o mesmo jeito que o app faz
    // no cliente (rpgUrlSlug = url_slug || slugify(name) || slugify(id)).
    const r = await fetch(
      `${SUPA_URL}/rest/v1/pokemons?select=id,name,sprite,url_slug,tipo1,tipo2`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
    );
    const rows = await r.json();
    poke = Array.isArray(rows) ? rows.find((p) => rpgUrlSlug(p) === slugNorm) : null;
  } catch (e) {
    // Supabase indisponível → cai no fallback genérico abaixo
  }

  const nome = poke?.name || 'NationalDex';
  const img = poke?.sprite || artworkFallback(poke?.id);
  const tipos = [poke?.tipo1, poke?.tipo2].filter(Boolean).join(' / ');
  const desc = poke ? `Tipo: ${tipos || '—'} · Kingdom Platinum` : 'Kingdom Platinum — NationalDex';
  const titulo = `${nome} — NationalDex | KP`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${titulo}</title>
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url.toString()}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
