// POST /api/ficha-salvar
//   { action:'save',   token, slug, nome, foto, banner, thumb, player_id, d }
//   { action:'delete', token, slug }
// A validação do token/permissão é feita pelas MESMAS funções que já existem no Supabase
// (ficha_salvar / ficha_excluir). Se o Supabase recusar, nada é gravado no GitHub.
const crypto = require('crypto');
const { REPO, BRANCH, readFile, listDir, commit } = require('./_gh');
// Uma função só (plano Hobby da Vercel: máx. 12 funções):
//   GET  /api/ficha-salvar?lista=1      -> data/index.json
//   GET  /api/ficha-salvar?slug=zach    -> data/fichas/zach.json
//   POST /api/ficha-salvar              -> salvar / excluir

const SB_URL = process.env.SUPABASE_URL || 'https://whomhpxzkhsdhsxlccvl.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indob21ocHh6a2hzZGhzeGxjY3ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NzcxMzQsImV4cCI6MjEwNjU1MzEzNH0.bgHV3aR3PMSgN6ZvWtC3HICHZWC_xWLmKpY7sf2UFSQ';
const IMG_BASE = (process.env.IMG_BASE || `https://raw.githubusercontent.com/${REPO}/${BRANCH}`).replace(/\/$/, '');
const MAX_IMG = 1.5 * 1024 * 1024;

async function sbRpc(nome, body) {
  const r = await fetch(SB_URL + '/rest/v1/rpc/' + nome, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) { const e = new Error(j?.message || 'Permissão negada (HTTP ' + r.status + ')'); e.status = r.status === 401 || r.status === 403 ? 403 : 400; throw e; }
  return j;
}

// "data:image/jpeg;base64,..." -> {buf, ext}; URL http(s) -> mantém; vazio -> null
function parseImg(v) {
  if (!v) return null;
  if (typeof v !== 'string') throw new Error('Imagem inválida.');
  if (/^https?:\/\//i.test(v)) return { url: v };
  const m = v.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('Formato de imagem inválido.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMG) throw new Error('Imagem grande demais.');
  return { buf, ext: m[1] === 'jpeg' ? 'jpg' : m[1] };
}
const hash = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 10);

function indexEntry(f) {
  const d = f.d || {};
  return {
    slug: f.slug, nome: f.nome,
    foto: f.thumb || f.foto || null,
    classe: d.classe || null, player: d.player || null,
    desativada: d.desativada ? 'true' : null,
    cor: d.cor_pri || null,
    time: (Array.isArray(d.time) ? d.time : []).slice(0, 6).map(t => ({ nome: t?.nome || '', apelido: t?.apelido || '' })),
    atualizado_em: f.atualizado_em,
  };
}
const sortIdx = a => a.sort((x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
const parseIdx = t => { try { const j = JSON.parse(t); return Array.isArray(j) ? j : []; } catch { return []; } };

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const q = req.query || {};
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (q.lista) {
        const t = await readFile('data/index.json');
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15');
        return res.status(200).send(t || '[]');
      }
      const sl = String(q.slug || '');
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(sl)) return res.status(400).json({ error: 'Slug inválido.' });
      const t = await readFile(`data/fichas/${sl}.json`);
      if (t == null) { res.setHeader('Cache-Control', 's-maxage=5'); return res.status(404).json({ error: 'Ficha não encontrada.' }); }
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10');
      return res.status(200).send(t);
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { action = 'save', token, slug } = b;
    if (!token || typeof token !== 'string') return res.status(401).json({ error: 'Sessão ausente.' });
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug || '')) return res.status(400).json({ error: 'Slug inválido.' });

    if (action === 'delete') {
      await sbRpc('ficha_excluir', { p_token: token, p_slug: slug });
      await commit(async parent => {
        const ch = [{ path: `data/fichas/${slug}.json`, content: null }];
        for (const f of await listDir(`img/fichas/${slug}`, parent)) ch.push({ path: f.path, content: null });
        const idx = parseIdx(await readFile('data/index.json', parent)).filter(x => x.slug !== slug);
        ch.push({ path: 'data/index.json', content: JSON.stringify(idx) });
        return ch;
      }, `ficha: excluir ${slug}`);
      return res.json({ ok: true });
    }

    // ---- salvar ----
    const nome = String(b.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório.' });
    if (!b.d || typeof b.d !== 'object') return res.status(400).json({ error: 'Dados inválidos.' });

    const novas = {};   // kind -> {path, buf}
    const urls = {};
    for (const kind of ['foto', 'banner', 'thumb']) {
      const p = parseImg(b[kind]);
      if (!p) urls[kind] = null;
      else if (p.url) urls[kind] = p.url;
      else {
        const path = `img/fichas/${slug}/${kind}-${hash(p.buf)}.${p.ext}`;
        novas[kind] = { path, buf: p.buf };
        urls[kind] = `${IMG_BASE}/${path}`;
      }
    }
    const atualizado_em = new Date().toISOString();

    // 1) o Supabase confere o token e a permissão. Guarda só texto e URLs (sem base64).
    await sbRpc('ficha_salvar', { p_token: token, p_slug: slug, p_nome: nome, p_foto: urls.foto, p_banner: urls.banner, p_d: b.d });

    // 2) um único commit no GitHub: JSON + imagens novas + índice (+ apaga imagens antigas)
    const ficha = { slug, nome, player_id: b.player_id ?? null, foto: urls.foto, banner: urls.banner, thumb: urls.thumb, d: b.d, atualizado_em };
    await commit(async parent => {
      const ch = [{ path: `data/fichas/${slug}.json`, content: JSON.stringify(ficha) }];
      const manter = new Set(Object.values(novas).map(n => n.path));
      for (const [kind, n] of Object.entries(novas)) {
        ch.push({ path: n.path, content: n.buf });
      }
      const existentes = await listDir(`img/fichas/${slug}`, parent);
      for (const f of existentes) {
        const kind = f.name.split('-')[0];
        const emUso = Object.values(urls).some(u => u && u.endsWith('/' + f.path));
        if (!manter.has(f.path) && !emUso && ['foto', 'banner', 'thumb'].includes(kind)) ch.push({ path: f.path, content: null });
      }
      const idx = parseIdx(await readFile('data/index.json', parent)).filter(x => x.slug !== slug);
      idx.push(indexEntry(ficha));
      ch.push({ path: 'data/index.json', content: JSON.stringify(sortIdx(idx)) });
      return ch;
    }, `ficha: ${slug}`);

    return res.json({ ok: true, slug, foto: urls.foto, banner: urls.banner, thumb: urls.thumb, atualizado_em });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Erro ao salvar.' });
  }
};
