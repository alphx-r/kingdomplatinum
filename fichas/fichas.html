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


// ---- migração única (Supabase -> GitHub), chamada pelo navegador ----
// Abra:  /api/ficha-salvar?migrar=1&chave=SUA_CHAVE   (repita até aparecer "restam": 0)
// Precisa da variável MIGRAR_KEY na Vercel. Depois de migrar, apague essa variável.
async function migrar(q, res) {
  const KEY = process.env.MIGRAR_KEY;
  if (!KEY || q.chave !== KEY) return res.status(403).json({ error: 'Chave inválida ou MIGRAR_KEY não configurada.' });
  const lim = Math.max(1, Math.min(+q.n || 3, 6));
  const sbGet = async p => {
    const r = await fetch(SB_URL + '/rest/v1/' + p, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    if (!r.ok) throw new Error('Supabase HTTP ' + r.status);
    return r.json();
  };
  const todas = (await sbGet('fichas?select=slug&order=slug.asc')).map(x => x.slug);
  const validas = todas.filter(sl => /^[a-z0-9][a-z0-9-]{0,59}$/.test(sl || ''));
  const feitas = new Set(parseIdx(await readFile('data/index.json')).map(x => x.slug));
  const pend = validas.filter(sl => !feitas.has(sl));
  const lote = pend.slice(0, lim);
  if (!lote.length) return res.json({ ok: true, restam: 0, total: todas.length, ignoradas: todas.length - validas.length, msg: 'Nada a migrar.' });

  const rows = [];
  for (const sl of lote) { const r = await sbGet('fichas?slug=eq.' + encodeURIComponent(sl)); if (r[0]) rows.push(r[0]); }
  let sharp = null; try { sharp = require('sharp'); } catch {}

  await commit(async parent => {
    const ch = [];
    const idx = parseIdx(await readFile('data/index.json', parent));
    for (const x of rows) {
      const slug = x.slug, urls = {}, d = x.d || {};
      let fotoBuf = null;
      for (const kind of ['foto', 'banner']) {
        let p = null; try { p = parseImg(x[kind]); } catch {}
        if (!p) urls[kind] = null;
        else if (p.url) urls[kind] = p.url;
        else {
          const path = `img/fichas/${slug}/${kind}-${hash(p.buf)}.${p.ext}`;
          ch.push({ path, content: p.buf }); urls[kind] = `${IMG_BASE}/${path}`;
          if (kind === 'foto') fotoBuf = p.buf;
        }
      }
      urls.thumb = null;
      if (sharp && fotoBuf) {
        try {
          const tb = await sharp(fotoBuf).resize(200, 200, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
          const path = `img/fichas/${slug}/thumb-${hash(tb)}.jpg`;
          ch.push({ path, content: tb }); urls.thumb = `${IMG_BASE}/${path}`;
        } catch {}
      }
      const ficha = { slug, nome: x.nome, player_id: x.player_id ?? null, foto: urls.foto, banner: urls.banner, thumb: urls.thumb, d, atualizado_em: x.atualizado_em || new Date().toISOString() };
      ch.push({ path: `data/fichas/${slug}.json`, content: JSON.stringify(ficha) });
      const i = idx.findIndex(e => e.slug === slug); if (i >= 0) idx.splice(i, 1);
      idx.push(indexEntry(ficha));
    }
    ch.push({ path: 'data/index.json', content: JSON.stringify(sortIdx(idx)) });
    return ch;
  }, 'ficha: migrar ' + lote.join(', '));

  return res.json({ ok: true, migradas: rows.map(r => r.slug), restam: pend.length - rows.length, total: todas.length, miniaturas: !!sharp, msg: pend.length - rows.length > 0 ? 'Recarregue esta página para continuar.' : 'Pronto! Todas migradas.' });
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const q = req.query || {};
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (q.migrar) { res.setHeader('Cache-Control', 'no-store'); return await migrar(q, res); }
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
