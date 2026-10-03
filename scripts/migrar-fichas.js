// Migração ÚNICA: Supabase (tabela fichas) -> data/fichas/*.json + img/fichas/*/ + data/index.json
// Rode na RAIZ do repositório:   GH_REPO=kingdomplatinum/fichas node scripts/migrar-fichas.js
// Opcional (miniaturas de 200px):  npm i sharp
// Depois: git add data img && git commit && git push
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const REPO = process.env.GH_REPO, BRANCH = process.env.GH_BRANCH || 'main';
if (!REPO) { console.error('Defina GH_REPO, ex.: GH_REPO=kingdomplatinum/fichas'); process.exit(1); }
const IMG_BASE = (process.env.IMG_BASE || `https://raw.githubusercontent.com/${REPO}/${BRANCH}`).replace(/\/$/, '');
const SB_URL = process.env.SUPABASE_URL || 'https://whomhpxzkhsdhsxlccvl.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indob21ocHh6a2hzZGhzeGxjY3ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NzcxMzQsImV4cCI6MjEwNjU1MzEzNH0.bgHV3aR3PMSgN6ZvWtC3HICHZWC_xWLmKpY7sf2UFSQ';
let sharp = null; try { sharp = require('sharp'); } catch { console.log('(sem "sharp": fichas migradas ficarão sem miniatura e a lista usará a foto inteira)'); }

const hash = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 10);
const put = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
function dec(v) {
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return { url: v };
  const m = String(v).match(/^data:image\/(jpeg|png|webp);base64,(.+)$/s);
  return m ? { buf: Buffer.from(m[2], 'base64'), ext: m[1] === 'jpeg' ? 'jpg' : m[1] } : null;
}
async function salvaImg(slug, kind, v) {
  const p = dec(v); if (!p) return null; if (p.url) return p.url;
  const rel = `img/fichas/${slug}/${kind}-${hash(p.buf)}.${p.ext}`; put(rel, p.buf); return `${IMG_BASE}/${rel}`;
}

(async () => {
  const rows = [];
  for (let from = 0; ; from += 20) {            // páginas pequenas: as linhas têm imagens em base64
    const r = await fetch(`${SB_URL}/rest/v1/fichas?select=*&order=slug.asc`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Range: `${from}-${from + 19}` } });
    if (!r.ok) throw new Error('Supabase HTTP ' + r.status);
    const j = await r.json(); rows.push(...j); if (j.length < 20) break;
  }
  console.log(rows.length + ' fichas encontradas');
  const index = [];
  for (const x of rows) {
    const slug = x.slug; if (!slug) continue;
    const foto = await salvaImg(slug, 'foto', x.foto), banner = await salvaImg(slug, 'banner', x.banner);
    let thumb = null;
    const fp = dec(x.foto);
    if (sharp && fp && fp.buf) {
      const buf = await sharp(fp.buf).resize(200, 200, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
      const rel = `img/fichas/${slug}/thumb-${hash(buf)}.jpg`; put(rel, buf); thumb = `${IMG_BASE}/${rel}`;
    }
    const d = x.d || {};
    const ficha = { slug, nome: x.nome, player_id: x.player_id ?? null, foto, banner, thumb, d, atualizado_em: x.atualizado_em || new Date().toISOString() };
    put(`data/fichas/${slug}.json`, JSON.stringify(ficha));
    index.push({
      slug, nome: x.nome, foto: thumb || foto, classe: d.classe || null, player: d.player || null,
      desativada: d.desativada ? 'true' : null, cor: d.cor_pri || null,
      time: (Array.isArray(d.time) ? d.time : []).slice(0, 6).map(t => ({ nome: t?.nome || '', apelido: t?.apelido || '' })),
      atualizado_em: ficha.atualizado_em,
    });
    console.log('ok', slug);
  }
  index.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  put('data/index.json', JSON.stringify(index));
  console.log('pronto: data/index.json com ' + index.length + ' fichas');
})().catch(e => { console.error(e); process.exit(1); });
