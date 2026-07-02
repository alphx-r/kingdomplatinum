// /api/cron/backup-pokemon.js
//
// Roda 1x/dia via Vercel Cron (ver vercel.json). Lê a tabela `pokemons`
// do Supabase (fonte de verdade) e sobrescreve o pokemon.json no GitHub,
// que agora é só um backup/export estático — não é mais escrito pelo admin.
//
// Variáveis de ambiente necessárias (configurar no painel da Vercel,
// Project Settings → Environment Variables):
//   GITHUB_TOKEN   -> token com permissão de escrita no repo (NUNCA no client)
//   GITHUB_REPO    -> ex: "alphx-r/kingdomplatinum"
//   GITHUB_FILE    -> ex: "pokemon.json"
//   SUPA_URL       -> https://fatdzivyqipmcbzaiftc.supabase.co
//   SUPA_KEY       -> anon key (a mesma do admin já serve, já que a RLS de
//                      leitura é pública)
//   CRON_SECRET    -> (opcional, recomendado) string aleatória; a Vercel
//                      manda essa mesma string no header Authorization
//                      quando o cron dispara, e checamos abaixo.
//
// Pra rodar backup manual fora do horário do cron (ex: painel admin), use
// /api/admin/backup-pokemon-now — NÃO dá pra chamar esta rota direto do
// navegador porque o CRON_SECRET não pode ficar exposto em JS client-side.
import { backupPokemonToGithub } from '../../lib/backupPokemon.js';

export default async function handler(req, res) {
  // Proteção simples: só aceita chamada do próprio Vercel Cron (ou manual
  // com o secret certo), pra ninguém disparar isso via URL pública.
  const CRON_SECRET = process.env.CRON_SECRET;
  if (CRON_SECRET) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  try {
    const result = await backupPokemonToGithub();
    return res.status(200).json(result);
  } catch (e) {
    console.error('backup-pokemon (cron) falhou:', e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
}
