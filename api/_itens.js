// Regras de inventário das fichas (arquivo com "_" não vira rota na Vercel).
// Usado por /api/ficha-salvar (action 'consumir' e 'adicionar').
const nk = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const int = v => { const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const brl = n => String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');   // 36350 -> "36.350"
const erro = (status, message) => Object.assign(new Error(message), { status });
// qtd vazia com nome preenchido conta como 1 (a ficha mostra "1" como padrão)
const qLinha = x => (String(x?.qtd ?? '').trim() === '' ? 1 : int(x.qtd));
const qtdDe = (d, nome) => { const k = nk(nome); return (d?.inventario || []).reduce((s, x) => (x && nk(x.nome) === k ? s + qLinha(x) : s), 0); };

// modo: 'consumir' | 'adicionar'. Não altera `d`: devolve uma cópia. Lança erro 409 se faltar item/dinheiro.
// `op` = id da operação (evita descontar duas vezes se a requisição for repetida).
function aplicar(d, modo, itens, custo = 0, op = '') {
  const nd = JSON.parse(JSON.stringify(d || {}));
  const ops = Array.isArray(nd._ops) ? nd._ops : [];
  if (op && ops.includes(op)) return { d: nd, repetida: true };
  const inv = Array.isArray(nd.inventario) ? nd.inventario : (nd.inventario = []);

  if (modo === 'consumir') {
    const pedido = new Map();
    for (const it of itens) pedido.set(nk(it.nome), { nome: it.nome, qtd: (pedido.get(nk(it.nome))?.qtd || 0) + it.qtd });
    for (const [k, it] of pedido) if (qtdDe(nd, it.nome) < it.qtd) throw erro(409, `${it.nome} insuficiente no inventário.`);
    for (const [k, it] of pedido) {
      let falta = it.qtd;
      for (let i = 0; i < inv.length && falta > 0; i++) {
        const x = inv[i];
        if (!x || nk(x.nome) !== k) continue;
        const q = qLinha(x), t = Math.min(q, falta);
        falta -= t;
        if (q - t <= 0) inv.splice(i--, 1); else x.qtd = String(q - t);
      }
    }
  } else {
    if (custo > 0) {
      const din = int(nd.dinheiro);
      if (din < custo) throw erro(409, 'Dinheiro insuficiente.');
      nd.dinheiro = brl(din - custo);
    }
    for (const it of itens) {
      const k = nk(it.nome), x = inv.find(y => y && nk(y.nome) === k);
      if (x) { x.qtd = String(qLinha(x) + it.qtd); continue; }
      const novo = { nome: it.nome, qtd: String(it.qtd) };
      const vazio = inv.findIndex(y => !y || !String(y.nome || '').trim());
      if (vazio >= 0) inv.splice(vazio, 1, novo); else inv.push(novo);
    }
  }
  if (op) nd._ops = [...ops, op].slice(-40);
  return { d: nd };
}
module.exports = { nk, qtdDe, aplicar };
