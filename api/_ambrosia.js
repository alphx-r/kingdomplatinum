// api/_ambrosia.js — Ambrosia Academy (aulas, avisos, matrículas e inscrições) em JSON no GitHub, no mesmo molde das fichas.
// (arquivo com "_" não conta como função na Vercel; é chamado pelo ficha-salvar.js)
//   GET  /api/ficha-salvar?ambrosia=1   -> { aulas, avisos, alunos }
//   POST { action:'ambrosia_matricular', token, slug, mod, curso, fmt, duracao?, inicial? }   aluno (token da ficha)
//   POST { action:'ambrosia_inscrever',  token, slug, aula_id }                              aluno
//   POST { action:'ambrosia_cancelar',   token, slug, aula_id }                              aluno
//   POST { action:'ambrosia_aula_salvar', nome, senha, aula:{id?,...} }   ADM/MOD
//   POST { action:'ambrosia_aula_apagar', nome, senha, id }               só ADM/chefe
//   POST { action:'ambrosia_aviso_salvar', nome, senha, aviso:{id?,...} } ADM/MOD
//   POST { action:'ambrosia_aviso_apagar', nome, senha, id }              ADM/MOD
//   POST { action:'ambrosia_matricula_status', nome, senha, slug, status, obs? }  ADM/MOD
//   POST { action:'ambrosia_matricula_apagar', nome, senha, slug }        só ADM/chefe
// Cada matrícula, inscrição ou cancelamento é UM commit (como nas fichas): o arquivo do aluno e o índice são lidos de dentro
// do commit (`parent`), então pedidos simultâneos de alunos diferentes não se atropelam.
// Arquivos: data/ambrosia/aulas.json, avisos.json, index.json (resumo dos alunos) e alunos/<slug>.json.
const { readFile, commit } = require('./_gh');
const ST = require('./_staff');
const SITE = 'ambrosiacademy';   // nome do site na lista kp_staff (mods[SITE])
const P = { aulas: 'data/ambrosia/aulas.json', avisos: 'data/ambrosia/avisos.json', idx: 'data/ambrosia/index.json', aluno: s => `data/ambrosia/alunos/${s}.json` };
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const MODS = ['Matrícula Regular', 'Matrícula Parcial', 'Matrícula Temporária', 'Matrícula Livre', 'Matrícula em Cursos'];
const CURSOS = ['Batalha e Estratégia', 'Ecologia dos Biomas', 'Criação e Cuidados', 'Treinamento de Campo', 'Exploração', 'Agricultura e Botânica', 'Ciências Pokémon', 'Tecnologia', 'Culinária', 'Outro (informar à secretaria)'];
const FMTS = ['Presencial', 'Remoto', 'Externo (campo)', 'Híbrido'];
const STATUS = ['pendente', 'aprovada', 'recusada'];

const erro = (status, msg) => Object.assign(new Error(msg), { status });
const arr = x => Array.isArray(x) ? x : [];
const txt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const txtL = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const nid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const escolha = (v, lista, rot) => { if (!lista.includes(v)) throw erro(400, rot + ' inválido.'); return v; };
async function lerJ(path, parent) { const t = await readFile(path, parent); if (t == null) return null; try { return JSON.parse(t); } catch { return null; } }
const entrada = a => ({ slug: a.slug, nome: a.nome, player: a.player || '', player_id: a.player_id ?? null, matricula: a.matricula || null, inscricoes: arr(a.inscricoes).map(i => i.aula_id), atualizado_em: a.atualizado_em });
const ordena = l => l.sort((x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR'));

async function lista(res) {
  res.setHeader('Cache-Control', 'no-store');
  const [aulas, avisos, alunos] = await Promise.all([lerJ(P.aulas), lerJ(P.avisos), lerJ(P.idx)]);
  return res.status(200).json({ aulas: arr(aulas), avisos: arr(avisos), alunos: arr(alunos) });
}

// um commit por pedido: lê o aluno e o índice dentro do commit, aplica `fn` e grava os dois juntos.
// f0 = ficha do dono (cria o registro do aluno se ainda não existe); sem f0, o aluno precisa existir (ações de ADM/MOD).
async function mexerAluno(slug, f0, fn, msg) {
  let saida = null;
  await commit(async parent => {
    let a = await lerJ(P.aluno(slug), parent);
    if (!a && !f0) throw erro(404, 'Aluno não encontrado.');
    a = a || { slug, matricula: null, inscricoes: [] };
    if (f0) { a.nome = f0.nome; a.player = (f0.d && f0.d.player) || ''; a.player_id = f0.player_id ?? null; }
    a.inscricoes = arr(a.inscricoes);
    saida = await fn(a, parent);
    if (!saida.mudou) return [];
    a.atualizado_em = new Date().toISOString();
    const idx = arr(await lerJ(P.idx, parent)).filter(x => x && x.slug !== slug);
    idx.push(entrada(a));
    return [{ path: P.aluno(slug), content: JSON.stringify(a) }, { path: P.idx, content: JSON.stringify(ordena(idx)) }];
  }, msg);
  return saida;
}

// ---- aluno: token da ficha, conferido por donoOk (mesma regra de editar a ficha) ----
async function acaoAluno(action, b, res, donoOk) {
  const slug = String(b.slug || '');
  if (!b.token || typeof b.token !== 'string') throw erro(401, 'Sessão ausente.');
  if (!SLUG.test(slug)) throw erro(400, 'Slug inválido.');
  const f0 = await donoOk(b.token, slug);
  if (action === 'ambrosia_matricular') {
    const mod = escolha(b.mod, MODS, 'Modalidade'), curso = escolha(b.curso, CURSOS, 'Curso'), fmt = escolha(b.fmt, FMTS, 'Formato');
    const duracao = mod === 'Matrícula Temporária' ? txt(b.duracao, 60) : '', inicial = txt(b.inicial, 60);
    const r = await mexerAluno(slug, f0, async a => {
      if (a.matricula && a.matricula.status !== 'recusada') return { mudou: false, repetida: true, status: a.matricula.status };
      a.matricula = { status: 'pendente', mod, curso, fmt, duracao, inicial, obs: '', criado: new Date().toISOString() };
      return { mudou: true, status: 'pendente' };
    }, `ambrosia: matrícula (${slug})`);
    return res.json({ ok: true, repetida: !!r.repetida, status: r.status });
  }
  const id = txt(b.aula_id, 40);
  if (!id) throw erro(400, 'Aula inválida.');
  if (action === 'ambrosia_inscrever') {
    const r = await mexerAluno(slug, f0, async (a, parent) => {
      if (!a.matricula || a.matricula.status !== 'aprovada') throw erro(403, 'A matrícula ainda não foi aprovada.');
      const aula = arr(await lerJ(P.aulas, parent)).find(x => x && x.id === id);
      if (!aula || !aula.pub) throw erro(404, 'Aula não encontrada.');
      if (a.inscricoes.some(i => i.aula_id === id)) return { mudou: false, repetida: true };
      if (aula.vagas > 0) {
        const n = arr(await lerJ(P.idx, parent)).filter(x => x && x.slug !== slug && arr(x.inscricoes).includes(id)).length;
        if (n >= aula.vagas) throw erro(409, 'Turma cheia.');
      }
      a.inscricoes.push({ aula_id: id, em: new Date().toISOString() });
      return { mudou: true };
    }, `ambrosia: inscrição ${id} (${slug})`);
    return res.json({ ok: true, repetida: !!r.repetida });
  }
  const r = await mexerAluno(slug, f0, async a => {
    const n = a.inscricoes.length;
    a.inscricoes = a.inscricoes.filter(i => i.aula_id !== id);
    return { mudou: a.inscricoes.length !== n };
  }, `ambrosia: cancelar inscrição ${id} (${slug})`);
  return res.json({ ok: true, removida: !!r.mudou });
}

// ---- ADM/MOD: nome + senha do player, papel lido de config.kp_staff (mods[SITE]) ----
async function quemE(b) {
  const nome = String(b.admin_nome || b.nome || ''), senha = String(b.admin_senha || b.senha || '');
  if (!nome || !senha) throw erro(401, 'Informe o nome e a senha do player.');
  const eu = await ST.verificarPlayer(nome, senha);
  if (!eu) throw erro(403, 'Nome ou senha incorretos.');
  const p = ST.papel(await ST.lerStaff(), eu.nome, SITE);
  if (p !== 'chefe' && p !== 'admin' && p !== 'mod') throw erro(403, 'Acesso restrito a ADM e MOD.');
  return { nome: eu.nome, adm: p === 'chefe' || p === 'admin' };
}

async function acaoStaff(action, b, res) {
  const eu = await quemE(b), agora = new Date().toISOString();
  const soAdm = () => { if (!eu.adm) throw erro(403, 'Só ADM apaga aulas e matrículas.'); };

  if (action === 'ambrosia_aula_salvar') {
    const a = b.aula || {}, data = new Date(a.data), titulo = txt(a.titulo, 120);
    if (!titulo || isNaN(data)) throw erro(400, 'Informe o título e a data da aula.');
    const d = { titulo, curso: txt(a.curso, 80), prof: txt(a.prof, 80), data: data.toISOString(), fmt: txt(a.fmt, 40), local: txt(a.local, 200),
      vagas: Math.max(0, Math.min(999, parseInt(a.vagas, 10) || 0)), desc: txtL(a.desc, 1500), pub: !!a.pub };
    let id = null;
    await commit(async parent => {
      const l = arr(await lerJ(P.aulas, parent)), i = a.id ? l.findIndex(x => x && x.id === a.id) : -1;
      if (a.id && i < 0) throw erro(404, 'Aula não encontrada.');
      if (i >= 0) { l[i] = { ...l[i], ...d, por: eu.nome, atualizado_em: agora }; id = l[i].id; }
      else { id = nid('a'); l.push({ id, ...d, criado: agora, por: eu.nome }); }
      return [{ path: P.aulas, content: JSON.stringify(l) }];
    }, `ambrosia: aula ${d.titulo}`);
    return res.json({ ok: true, id });
  }

  if (action === 'ambrosia_aula_apagar') {
    soAdm();
    const id = txt(b.id, 40);
    await commit(async parent => {
      const l = arr(await lerJ(P.aulas, parent));
      if (!l.some(x => x && x.id === id)) throw erro(404, 'Aula não encontrada.');
      const ch = [{ path: P.aulas, content: JSON.stringify(l.filter(x => x && x.id !== id)) }];
      const idx = arr(await lerJ(P.idx, parent));
      for (const e of idx) {   // tira a aula das inscrições dos alunos, tudo no mesmo commit
        if (!e || !arr(e.inscricoes).includes(id)) continue;
        const al = await lerJ(P.aluno(e.slug), parent);
        if (al) { al.inscricoes = arr(al.inscricoes).filter(i => i.aula_id !== id); al.atualizado_em = agora; ch.push({ path: P.aluno(e.slug), content: JSON.stringify(al) }); }
        e.inscricoes = arr(e.inscricoes).filter(x => x !== id);
      }
      if (ch.length > 1) ch.push({ path: P.idx, content: JSON.stringify(idx) });
      return ch;
    }, `ambrosia: apagar aula ${id}`);
    return res.json({ ok: true });
  }

  if (action === 'ambrosia_aviso_salvar') {
    const a = b.aviso || {}, titulo = txt(a.titulo, 120), texto = txtL(a.texto, 2000);
    if (!titulo || !texto) throw erro(400, 'Informe o título e o texto do aviso.');
    await commit(async parent => {
      const l = arr(await lerJ(P.avisos, parent)), i = a.id ? l.findIndex(x => x && x.id === a.id) : -1;
      if (a.id && i < 0) throw erro(404, 'Aviso não encontrado.');
      if (i >= 0) l[i] = { ...l[i], titulo, texto, fixado: !!a.fixado, por: eu.nome, atualizado_em: agora };
      else l.unshift({ id: nid('v'), titulo, texto, fixado: !!a.fixado, criado: agora, por: eu.nome });
      return [{ path: P.avisos, content: JSON.stringify(l) }];
    }, `ambrosia: aviso ${titulo}`);
    return res.json({ ok: true });
  }

  if (action === 'ambrosia_aviso_apagar') {
    const id = txt(b.id, 40);
    await commit(async parent => {
      const l = arr(await lerJ(P.avisos, parent));
      if (!l.some(x => x && x.id === id)) throw erro(404, 'Aviso não encontrado.');
      return [{ path: P.avisos, content: JSON.stringify(l.filter(x => x && x.id !== id)) }];
    }, `ambrosia: apagar aviso ${id}`);
    return res.json({ ok: true });
  }

  const slug = String(b.slug || '');
  if (!SLUG.test(slug)) throw erro(400, 'Slug inválido.');

  if (action === 'ambrosia_matricula_status') {
    const status = escolha(b.status, STATUS, 'Status'), obs = txt(b.obs, 300);
    await mexerAluno(slug, null, async a => {
      if (!a.matricula) throw erro(404, 'Este aluno não tem matrícula.');
      a.matricula = { ...a.matricula, status, obs, analisadoPor: eu.nome, analisadoEm: agora };
      return { mudou: true };
    }, `ambrosia: matrícula ${status} (${slug})`);
    return res.json({ ok: true });
  }

  if (action === 'ambrosia_matricula_apagar') {
    soAdm();
    await commit(async parent => {
      const idx = arr(await lerJ(P.idx, parent)).filter(x => x && x.slug !== slug);
      return [{ path: P.aluno(slug), content: null }, { path: P.idx, content: JSON.stringify(idx) }];
    }, `ambrosia: apagar aluno (${slug})`);
    return res.json({ ok: true });
  }
  throw erro(400, 'Ação desconhecida.');
}

async function acao(action, b, res, donoOk) {
  if (['ambrosia_matricular', 'ambrosia_inscrever', 'ambrosia_cancelar'].includes(action)) return acaoAluno(action, b, res, donoOk);
  return acaoStaff(action, b, res);
}
module.exports = { lista, acao };
