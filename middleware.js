// middleware.js — colocar na RAIZ do projeto Vercel (mesmo nível do index.html)
// Gera preview (og:title / og:description / og:image) por página quando o link é
// aberto por bots de preview (WhatsApp, Facebook, Discord, Telegram etc).
// Usuário comum continua recebendo a SPA normalmente — o middleware só age para bots.
//
// Padrão de título: "Nome da Página | KPRPG"  (exceção: página inicial = "PKMN Kingdom Platinum")

export const config = {
  matcher: '/:path*',
};

const BOT_UA =
  /facebookexternalhit|Facebot|WhatsApp|TelegramBot|Discordbot|LinkedInBot|Slackbot|SkypeUriPreview|vkShare|Pinterest|redditbot|Applebot|Twitterbot|W3C_Validator/i;

const SUPA_URL = 'https://vnccljhhexlsthjaaorr.supabase.co';
const SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuY2NsamhoZXhsc3RoamFhb3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTI5NjEsImV4cCI6MjEwMDg2ODk2MX0.XtKUKNMq7MG_NAQo74nbIsvJCKFE-qhH4_AxULF7M1k';

// NPCdex usa outro projeto Supabase (tabela npcs: slug, nome, foto)
const NPC_SUPA_URL = 'https://fatdzivyqipmcbzaiftc.supabase.co';
const NPC_SUPA_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhdGR6aXZ5cWlwbWNiemFpZnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NTMyNDAsImV4cCI6MjA5ODQyOTI0MH0.0SRPZt1RYSpEbPQazv7ttHJBZNDOyIax2YRO49bvpmE';

const SUFIXO = 'KPRPG';
const NOME_SITE = 'PKMN Kingdom Platinum';

const escHtml = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FALLBACK_IMG =
  'https://64.media.tumblr.com/c429cb57b048b0ba1d90c6451d7c3aa1/8607b48e6654212e-0d/s540x810/c1f9956cc78935a32f53346f3a7a942caa5d1d67.png';

// Página inicial: título próprio (sem sufixo)
const HOME = {
  titulo: NOME_SITE,
  desc: 'Kingdom Platinum — RPG de mesa de Pokémon.',
};

// Páginas fixas do site: título/descrição/imagem do preview por rota.
// img é opcional (1200x630 recomendado); sem img usa FALLBACK_IMG.
const PAGINAS = {
  '/dados':       { titulo: `Rolador | ${SUFIXO}`,              desc: 'Rolador de encontros e dados do Kingdom Platinum.' },
  '/fichario':    { titulo: `Fichário | ${SUFIXO}`,             desc: 'Fichas dos treinadores do Kingdom Platinum.' },
  '/porlocal':    { titulo: `Pokémon por Local | ${SUFIXO}`,    desc: 'Pokémon e raridade em cada cidade.' },
  '/npcdex':      { titulo: `NPCdex | ${SUFIXO}`,               desc: 'Os NPCs de cada cidade do Kingdom Platinum.' },
  '/nationaldex': { titulo: `NationalDex | ${SUFIXO}`,          desc: 'A Pokédex do Kingdom Platinum.' },
  '/ganhos':      { titulo: `Ganhos | ${SUFIXO}`,               desc: 'Como ganhar pontos, itens e recompensas.' },
  '/sistemas':    { titulo: `Sistemas | ${SUFIXO}`,             desc: 'Regras e mecânicas do RPG.' },
  '/subsistemas': { titulo: `Subsistemas | ${SUFIXO}`,          desc: 'Breeding, Cooking e Farming no Kingdom Platinum.' },
  '/nature':      { titulo: `Natures | ${SUFIXO}`,              desc: 'Natures e seus efeitos.' },
  '/batalhas':    { titulo: `Batalhas | ${SUFIXO}`,             desc: 'Regras, tiers e cálculo de dano das batalhas Pokémon.' },
  '/calendario':  { titulo: `Calendário | ${SUFIXO}`,           desc: 'Eventos e temporadas do RPG.' },
  '/tramas':      { titulo: `Tramas | ${SUFIXO}`,               desc: 'Acompanhe as temporadas e as subtramas do RPG.' },
};

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

const htmlPreview = (titulo, desc, img, url) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escHtml(titulo)}</title>
<meta property="og:site_name" content="${escHtml(NOME_SITE)}">
<meta property="og:title" content="${escHtml(titulo)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:image" content="${escHtml(img)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body></body>
</html>`;

const resposta = (html) =>
  new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return; // não é bot de preview → deixa a SPA seguir normalmente

  const url = new URL(request.url);
  const caminho = url.pathname.replace(/\/+$/, '') || '/';

  // ── Página inicial → "PKMN Kingdom Platinum" ──
  if (caminho === '/') {
    return resposta(htmlPreview(HOME.titulo, HOME.desc, FALLBACK_IMG, url.toString()));
  }

  // ── Páginas fixas (/subsistemas, /sistemas…) → "Nome | KPRPG" ──
  const pag = PAGINAS[caminho];
  if (pag) {
    const img = pag.img ? (pag.img.startsWith('http') ? pag.img : url.origin + pag.img) : FALLBACK_IMG;
    return resposta(htmlPreview(pag.titulo, pag.desc, img, url.toString()));
  }

  // ── /npcdex/:slug → "NOME — NPCdex | KPRPG" ──
  const mn = url.pathname.match(/^\/npcdex\/([^\/]+)\/?$/);
  if (mn && mn[1] !== 'adm') {
    const npcSlug = decodeURIComponent(mn[1]);
    let npc = null;
    try {
      const r = await fetch(
        `${NPC_SUPA_URL}/rest/v1/npcs?slug=eq.${encodeURIComponent(npcSlug)}&select=nome,foto,slogan&limit=1`,
        { headers: { apikey: NPC_SUPA_KEY, Authorization: `Bearer ${NPC_SUPA_KEY}` } }
      );
      const rows = await r.json();
      npc = Array.isArray(rows) ? rows[0] : null;
    } catch (e) {
      // Supabase indisponível → cai no título genérico abaixo
    }
    const tituloNpc = npc?.nome ? `${npc.nome} — NPCdex | ${SUFIXO}` : `NPCdex | ${SUFIXO}`;
    const descNpc = (npc?.slogan || '').trim() || 'NPCdex';
    const imgNpc = npc?.foto && /^https?:\/\//i.test(npc.foto) ? npc.foto : FALLBACK_IMG;
    return resposta(htmlPreview(tituloNpc, descNpc, imgNpc, url.toString()));
  }

  // ── /nationaldex/:slug → "POKÉMON — NationalDex | KPRPG" ──
  const m = url.pathname.match(/\/nationaldex\/(.+)$/);
  if (!m) return; // rota sem preview próprio → SPA normal

  const slugNorm = slugify(decodeURIComponent(m[1]));
  let poke = null;

  try {
    // Resolve o mesmo jeito que o app faz no cliente (rpgUrlSlug = url_slug || slugify(name) || slugify(id)).
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
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
  const tipos = [poke?.tipo1, poke?.tipo2].filter(Boolean).map(cap).join('/');
  const desc = poke ? (tipos ? `${tipos}-type` : 'NationalDex') : 'NationalDex';
  const titulo = poke ? `${nome} — NationalDex | ${SUFIXO}` : `NationalDex | ${SUFIXO}`;

  return resposta(htmlPreview(titulo, desc, img, url.toString()));
}
