// POST /api/commit-stores  { lojas: [...], admin: "<email do adm_session>" }
// Valida o admin (mesma lista admin_list que o stores.html usa), sanitiza as lojas e commita
// stores/stores.json no GitHub. O token fica só na Vercel (env GITHUB_TOKEN).
const REPO = process.env.GITHUB_REPO || 'alphx-r/kingdomplatinum';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const PATH = 'stores/stores.json';
const SB_URL = process.env.SUPABASE_URL || 'https://ucbkodkjlbatttiuqjtv.supabase.co';
// chave anon (pública, a mesma que já vai no stores.html)
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjYmtvZGtqbGJhdHR0aXVxanR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NjExODcsImV4cCI6MjA5MzMzNzE4N30.a65MSk7m4DvgTw2pHXhaqMOOEpjTB_wPsXJUfvOGiG4';

const ESTACOES = ['primavera', 'verao', 'outono', 'inverno'];
const RECURSOS = ['reciclagem', 'tm_voucher'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const url = v => { const s = txt(v, 600); return /^(https?:\/\/|\/)/.test(s) ? s : ''; };

function limpa(l, i) {
  if (!l || typeof l !== 'object') throw new Error(`Loja #${i + 1} inválida.`);
  const slug = txt(l.slug, 40).toLowerCase();
  if (!SLUG.test(slug)) throw new Error(`Slug inválido: "${slug}" (use letras minúsculas, números e hífen).`);
  const nome = txt(l.nome, 60);
  if (!nome) throw new Error(`A loja "${slug}" precisa de um nome.`);
  const out = {
    slug, nome,
    empresa: txt(l.empresa, 60),
    descricao: txt(l.descricao, 400),
    logo: url(l.logo),
    banner: url(l.banner),
    modo: l.modo === 'catalogo' ? 'catalogo' : 'loja',
    compra: l.compra !== false,
    sell_pct: Math.min(1, Math.max(0, Number.isFinite(+l.sell_pct) ? +l.sell_pct : 0.5)),
    estacoes: Array.isArray(l.estacoes) && l.estacoes.length ? l.estacoes.filter(e => ESTACOES.includes(e)) : null,
    requisitos: l.requisitos && l.requisitos.vip ? { vip: true } : null,
    recursos: Array.isArray(l.recursos) ? l.recursos.filter(r => RECURSOS.includes(r)) : [],
    ativa: l.ativa !== false,
    ordem: Number.isFinite(+l.ordem) ? Math.trunc(+l.ordem) : 99,
  };
  if (out.estacoes && !out.estacoes.length) out.estacoes = null;
  const t = l.tema || {};
  const tema = {};
  for (const [k, v] of Object.entries({ brand: t.brand, brandMid: t.brandMid, accent: t.accent })) if (HEX.test(v || '')) tema[k] = v;
  if (Object.keys(tema).length) out.tema = tema;
  return out;
}

async function ehAdmin(email) {
  if (!email || typeof email !== 'string') return false;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/admin_list`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) return false;
  const l = await r.json().catch(() => null);
  return Array.isArray(l) && l.some(x => x && x.nome === email);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN não configurado na Vercel.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!(await ehAdmin(body.admin))) return res.status(403).json({ error: 'Sem permissão.' });

    if (!Array.isArray(body.lojas) || !body.lojas.length) return res.status(400).json({ error: 'Lista de lojas vazia.' });
    if (body.lojas.length > 60) return res.status(400).json({ error: 'Lojas demais.' });
    const lojas = body.lojas.map(limpa);
    const slugs = new Set();
    for (const l of lojas) { if (slugs.has(l.slug)) return res.status(400).json({ error: `Slug repetido: ${l.slug}` }); slugs.add(l.slug); }
    if (!slugs.has('pokemart')) return res.status(400).json({ error: 'A loja "pokemart" não pode ser removida.' });
    lojas.sort((a, b) => a.ordem - b.ordem);

    const api = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
    const gh = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'kp-stores-admin', 'X-GitHub-Api-Version': '2022-11-28' };
    let sha;
    const cur = await fetch(`${api}?ref=${BRANCH}`, { headers: gh });
    if (cur.ok) sha = (await cur.json()).sha;
    else if (cur.status !== 404) return res.status(502).json({ error: 'GitHub respondeu ' + cur.status + ' ao ler o arquivo.' });

    const conteudo = JSON.stringify(lojas, null, 2) + '\n';
    const put = await fetch(api, {
      method: 'PUT',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Atualiza lojas (Stores)', content: Buffer.from(conteudo, 'utf8').toString('base64'), branch: BRANCH, ...(sha ? { sha } : {}) }),
    });
    if (!put.ok) {
      const e = await put.json().catch(() => ({}));
      return res.status(502).json({ error: 'Falha ao commitar: ' + (e.message || put.status) });
    }
    return res.status(200).json({ ok: true, lojas });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro inesperado.' });
  }
}
