// Berries do RPG em JSON no GitHub: data/berries.json
//   GET  /api/ficha-salvar?berries=1                                  -> lista (array) ou [] se ainda não existe
//   POST /api/ficha-salvar { action:'berries_salvar', nome, senha, berries:[...], por }  -> ADM grava a lista inteira
// (arquivo com "_" não conta como função na Vercel)
const { readFile, commit } = require('./_gh');

const CAMINHO = 'data/berries.json';
const RAR = ['comum', 'incomum', 'rara', 'rarissima'];
const SAB = ['apimentado', 'seco', 'azedo', 'amargo', 'doce'];
const TIPOS = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];

function normalizar(arr) {
  if (!Array.isArray(arr)) throw Object.assign(new Error('Lista de berries inválida.'), { status: 400 });
  if (arr.length < 1 || arr.length > 300) throw Object.assign(new Error('A lista precisa ter entre 1 e 300 berries.'), { status: 400 });
  const vistos = new Set();
  return arr.map(b => {
    const nome = String(b && b.nome || '').trim().slice(0, 40);
    if (!nome) throw Object.assign(new Error('Há berry sem nome.'), { status: 400 });
    const k = nome.toLowerCase();
    if (vistos.has(k)) throw Object.assign(new Error('Berry duplicada: ' + nome), { status: 400 });
    vistos.add(k);
    const num = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 1e6 ? n : 0; };
    return {
      nome,
      tipo: TIPOS.includes(b.tipo) ? b.tipo : 'normal',
      sabor: SAB.includes(b.sabor) ? b.sabor : null,
      raridade: RAR.includes(b.raridade) ? b.raridade : 'comum',
      efeito: String(b.efeito || '').slice(0, 600),
      triturada: num(b.triturada),
      colheita: num(b.colheita),
    };
  });
}

// mesma conferência de ADM da ação 'atribuir' (admin_login no projeto do index)
async function conferirAdm(nome, senha) {
  if (!nome || !senha) throw Object.assign(new Error('Informe o nome e a senha do admin.'), { status: 401 });
  const IU = process.env.INDEX_SUPA_URL, IK = process.env.INDEX_SUPA_KEY;
  if (!IU || !IK) throw Object.assign(new Error('Servidor sem configuração (INDEX_SUPA_URL ou INDEX_SUPA_KEY).'), { status: 500 });
  const a = await fetch(`${IU}/rest/v1/rpc/admin_login`, {
    method: 'POST',
    headers: { apikey: IK, Authorization: 'Bearer ' + IK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_nome: nome, p_senha: senha }),
  });
  if (!a.ok) {
    if (a.status === 400) throw Object.assign(new Error('Nome ou senha de admin incorretos.'), { status: 403 });
    throw Object.assign(new Error('Não consegui conferir o admin (admin_login: HTTP ' + a.status + ').'), { status: 502 });
  }
  let adm = await a.json().catch(() => null); adm = Array.isArray(adm) ? adm[0] : adm;
  if (!adm || !adm.nome) throw Object.assign(new Error('Nome ou senha de admin incorretos.'), { status: 403 });
  return adm;
}

async function obter(res) {
  const t = await readFile(CAMINHO);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(t || '[]');
}

async function acao(action, b, res) {
  if (action !== 'berries_salvar') return res.status(400).json({ error: 'Ação desconhecida.' });
  const adm = await conferirAdm(b.nome, b.senha);
  const lista = normalizar(b.berries);
  await commit(async () => [{ path: CAMINHO, content: JSON.stringify(lista, null, 1) }],
    `berries: ${lista.length} berries (${String(b.por || adm.nome).slice(0, 40)})`);
  return res.json({ ok: true, total: lista.length, berries: lista });
}

module.exports = { obter, acao };
