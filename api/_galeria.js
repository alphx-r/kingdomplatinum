// api/_galeria.js — Galeria da escola (Ambrosia Academy), em JSON no kpfichas_db
//   data/ambrosia/galeria.json          -> { imagens: [ { id, src, nome, legenda, criado } ] }  (a ordem do array é a ordem do carrossel)
//   data/ambrosia/galeria/<id>.jpg|png|webp
// Arquivo com "_" não conta como função na Vercel (plano Hobby: máx. 12).
//   GET  /api/ficha-salvar?galeria=1                                   -> { imagens: [...] }
//   POST { action:'ambrosia_galeria_salvar',  nome, senha, imagem:{ nome, legenda, dados:'data:image/jpeg;base64,...' } }  -> nova imagem (1 commit)
//   POST { action:'ambrosia_galeria_salvar',  nome, senha, imagem:{ id, nome, legenda } }                            -> só edita nome e descrição
//   POST { action:'ambrosia_galeria_apagar',  nome, senha, id }
//   POST { action:'ambrosia_galeria_ordenar', nome, senha, ids:[...] }
// Acesso: ADM/chefe e MOD do site (nome+senha do player, papel em config.kp_staff) — a mesma conferência do _ambrosia.js.
const crypto = require('crypto');
const { REPO, BRANCH, readFile, commit } = require('./_gh');
const ST = require('./_staff');
const SITE = 'ambrosiacademy';   // nome do site na lista kp_staff (mods[SITE]) — o mesmo do _ambrosia.js

const IMG_BASE = (process.env.IMG_BASE || `https://raw.githubusercontent.com/${REPO}/${BRANCH}`).replace(/\/$/, '');
const IDX = 'data/ambrosia/galeria.json';
const DIR = 'data/ambrosia/galeria';
const MAX_IMG = 3 * 1024 * 1024;   // corpo da requisição na Vercel = 4,5 MB (base64 pesa ~33% a mais)
const MAX_ITENS = 10;

const erro = (status, msg) => Object.assign(new Error(msg), { status });
const limpaLegenda = v => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 400);
const limpaNome = v => limpaLegenda(v).slice(0, 60);
// ADM/MOD: nome + senha do player, papel lido de config.kp_staff (mods[SITE])
async function quemE(b) {
  const nome = String(b.admin_nome || b.nome || ''), senha = String(b.admin_senha || b.senha || '');
  if (!nome || !senha) throw erro(401, 'Informe o nome e a senha do player.');
  const eu = await ST.verificarPlayer(nome, senha);
  if (!eu) throw erro(403, 'Nome ou senha incorretos.');
  const p = ST.papel(await ST.lerStaff(), eu.nome, SITE);
  if (p !== 'chefe' && p !== 'admin' && p !== 'mod') throw erro(403, 'Acesso restrito a ADM e MOD.');
  return { nome: eu.nome, adm: p === 'chefe' || p === 'admin' };
}
const idOk = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(v);

function parseIdx(t) {
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = null; }
  const l = Array.isArray(j) ? j : (j && Array.isArray(j.imagens) ? j.imagens : []);
  return l.filter(x => x && typeof x === 'object' && x.src).map(x => ({
    id: String(x.id || ''), src: String(x.src), nome: limpaNome(x.nome), legenda: limpaLegenda(x.legenda), criado: x.criado || undefined,
  }));
}
const serializa = l => JSON.stringify({ imagens: l });

function parseImg(v) {
  if (typeof v !== 'string') throw erro(400, 'Imagem inválida.');
  const m = v.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw erro(400, 'Formato de imagem inválido (use JPEG, PNG ou WebP).');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw erro(400, 'Imagem vazia.');
  if (buf.length > MAX_IMG) throw erro(413, 'Imagem grande demais.');
  return { buf, ext: m[1] === 'jpeg' ? 'jpg' : m[1] };
}
// caminho do arquivo a partir da URL gravada (só apaga o que está dentro da pasta da galeria)
const caminhoDe = src => { const i = String(src).indexOf(DIR + '/'); return i < 0 ? null : String(src).slice(i).split(/[?#]/)[0]; };

async function lista(res) {
  const t = await readFile(IDX);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5');
  return res.status(200).json({ imagens: parseIdx(t) });
}

async function acao(action, b, res) {   // a conferência é sempre a daqui; um 4º argumento é ignorado
  try {
    await quemE(b);   // ADM/MOD (nome+senha do player); lança erro se não puder

    if (action === 'ambrosia_galeria_salvar') {
      const im = b.imagem && typeof b.imagem === 'object' ? b.imagem : null;
      if (!im) throw erro(400, 'Envie a imagem.');
      const legenda = limpaLegenda(im.legenda);
      if (im.id) {   // só edita nome e descrição
        if (!idOk(im.id)) throw erro(400, 'Imagem inválida.');
        let ed = null;
        await commit(async parent => {
          const l = parseIdx(await readFile(IDX, parent));
          const x = l.find(e => e.id === im.id);
          if (!x) throw erro(404, 'Imagem não encontrada.');
          x.legenda = legenda; if (im.nome !== undefined) x.nome = limpaNome(im.nome); ed = { ...x };
          return [{ path: IDX, content: serializa(l) }];
        }, 'ambrosia: galeria (texto)');
        return res.json({ ok: true, imagem: ed });
      }
      const { buf, ext } = parseImg(im.dados);
      const id = Date.now().toString(36) + '-' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
      const path = `${DIR}/${id}.${ext}`, novo = { id, src: `${IMG_BASE}/${path}`, nome: limpaNome(im.nome), legenda, criado: new Date().toISOString() };
      await commit(async parent => {
        const l = parseIdx(await readFile(IDX, parent));
        if (l.length >= MAX_ITENS) throw erro(400, `A galeria já tem o máximo de ${MAX_ITENS} imagens. Apague alguma antes.`);
        l.push(novo);
        return [{ path, content: buf }, { path: IDX, content: serializa(l) }];
      }, 'ambrosia: galeria (nova imagem)');
      return res.json({ ok: true, imagem: novo });
    }

    if (action === 'ambrosia_galeria_apagar') {
      if (!idOk(b.id)) throw erro(400, 'Imagem inválida.');
      await commit(async parent => {
        const l = parseIdx(await readFile(IDX, parent));
        const x = l.find(e => e.id === b.id);
        if (!x) throw erro(404, 'Imagem não encontrada.');
        const ch = [{ path: IDX, content: serializa(l.filter(e => e.id !== b.id)) }];
        const p = caminhoDe(x.src);
        if (p) ch.push({ path: p, content: null });
        return ch;
      }, 'ambrosia: galeria (apagar)');
      return res.json({ ok: true });
    }

    if (action === 'ambrosia_galeria_ordenar') {
      const ids = Array.isArray(b.ids) ? b.ids.filter(idOk) : null;
      if (!ids || !ids.length) throw erro(400, 'Ordem inválida.');
      await commit(async parent => {
        const l = parseIdx(await readFile(IDX, parent)), por = new Map(l.map(e => [e.id, e]));
        const nova = [];
        for (const id of ids) if (por.has(id)) { nova.push(por.get(id)); por.delete(id); }
        for (const e of por.values()) nova.push(e);   // o que chegou no meio-tempo vai para o fim
        return [{ path: IDX, content: serializa(nova) }];
      }, 'ambrosia: galeria (ordem)');
      return res.json({ ok: true });
    }

    throw erro(400, 'Ação desconhecida.');
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'Erro ao salvar a galeria.' });
  }
}

module.exports = { lista, acao };
