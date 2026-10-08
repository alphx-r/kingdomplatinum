// Vercel serverless: valida o player (ou o ADM) no projeto do index e emite o token no projeto das fichas.
// Variáveis de ambiente (Vercel > Settings > Environment Variables, marcadas para Production):
//   INDEX_SUPA_URL, INDEX_SUPA_KEY            -> projeto do index (URL e chave anon)
//   FICHAS_SUPA_URL, FICHAS_SUPA_SERVICE_KEY  -> projeto das fichas (URL e chave service_role, NUNCA no front)
const H = k => ({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' });
// Players com poder de admin (mesma lista do fichas.html): entram com a senha de player, mas o token sai como 'admin',
// que é o que o ficha_salvar do Supabase aceita para editar ficha de outro player.
const ADM_PLAYERS = ['ricky', 'jef', 'lucas'];
const nrm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();
const ENV = ['INDEX_SUPA_URL', 'INDEX_SUPA_KEY', 'FICHAS_SUPA_URL', 'FICHAS_SUPA_SERVICE_KEY'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const falta = ENV.filter(k => !process.env[k]);
  if (falta.length) {
    console.error('ficha-token: variáveis de ambiente faltando:', falta.join(', '));
    return res.status(500).json({ error: 'Servidor sem configuração.' });
  }

  const { nome, senha } = req.body || {};
  if (!nome || !senha) return res.status(400).json({ error: 'Informe nome e senha.' });

  try {
    // 1) player comum
    let id = null, nomeFinal = nome;
    const a = await fetch(`${process.env.INDEX_SUPA_URL}/rest/v1/rpc/player_login`, {
      method: 'POST', headers: H(process.env.INDEX_SUPA_KEY),
      body: JSON.stringify({ p_nome: nome, p_senha: senha })
    });
    if (a.ok) {
      let r = await a.json().catch(() => null); r = Array.isArray(r) ? r[0] : r;
      if (r && r.id != null) { id = String(r.id); nomeFinal = r.nome || nome; }
    }
    // 2) não é player: tenta como ADM (mesma função que o login da Área ADM do index usa).
    //    O id 'admin' é o que o servidor de fichas já espera para fichas criadas pelo ADM.
    if (id == null) {
      const ad = await fetch(`${process.env.INDEX_SUPA_URL}/rest/v1/rpc/admin_login`, {
        method: 'POST', headers: H(process.env.INDEX_SUPA_KEY),
        body: JSON.stringify({ p_nome: nome, p_senha: senha })
      });
      if (ad.ok) {
        let y = await ad.json().catch(() => null); y = Array.isArray(y) ? y[0] : y;
        if (y && y.nome) { id = 'admin'; nomeFinal = y.nome; }
      }
    }
    if (id != null && id !== 'admin' && (ADM_PLAYERS.includes(nrm(nomeFinal)) || ADM_PLAYERS.includes(nrm(nome)))) id = 'admin';
    if (id == null) return res.status(401).json({ error: 'Nome ou senha incorretos.' });

    // p_admin: grava player_tokens.admin = true; é essa coluna que o ficha_salvar/ficha_excluir conferem para liberar edição de ficha alheia.
    const b = await fetch(`${process.env.FICHAS_SUPA_URL}/rest/v1/rpc/ficha_emitir_token`, {
      method: 'POST', headers: H(process.env.FICHAS_SUPA_SERVICE_KEY),
      body: JSON.stringify({ p_player_id: id, p_nome: nomeFinal, p_admin: id === 'admin' })
    });
    if (!b.ok) {
      console.error('ficha-token: ficha_emitir_token falhou:', b.status, await b.text().catch(() => ''));
      return res.status(500).json({ error: 'Falha ao iniciar a sessão.' });
    }
    return res.status(200).json(await b.json());
  } catch (e) {
    console.error('ficha-token:', e);
    return res.status(500).json({ error: 'Erro no servidor.' });
  }
};
