// /api/admin/backup-pokemon-now.js
//
// Versão "sob demanda" de /api/cron/backup-pokemon: chamada pelo botão
// "Commitar pokemon.json" do datadex_adm.html. Roda a mesma lógica
// (backupPokemonToGithub, em /lib/backupPokemon.js) mas sem exigir o
// CRON_SECRET — não dá pra expor esse secret no JS do navegador, então
// esta rota tem sua própria porta de entrada, protegida só por estar
// dentro do painel admin (mesma sessão do datadex_adm).

import { backupPokemonToGithub } from '../../lib/backupPokemon.js';

export default async function handler(req, res) {
  // Aceita GET (chamada atual do botão no datadex_adm, via fetch simples)
  // e POST, pra ficar consistente com as outras rotas /api/commit-*.
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const result = await backupPokemonToGithub();
    return res.status(200).json(result);
  } catch (e) {
    console.error('backup-pokemon (manual) falhou:', e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
}
