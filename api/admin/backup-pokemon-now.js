// /api/admin/backup-pokemon-now.js
//
// Versão "manual" do backup: mesma lógica de /api/cron/backup-pokemon, mas
// sem exigir o header Authorization com CRON_SECRET — porque esse secret
// não pode ser colocado no JS do navegador (client-side é público, qualquer
// pessoa vê o código-fonte pelo DevTools). Existe só pra alimentar o botão
// "💾 Backup agora" do painel admin, já que no plano gratuito da Vercel o
// cron só roda 1x/dia.
//
// Segurança: como não há um secret client-safe aqui, a proteção real desta
// rota é o Vercel Deployment/Access Protection já configurado no projeto
// (o mesmo que pede senha pra abrir /datadex/adm — "Ação necessária" no
// screenshot). Se você desligar essa proteção do projeto em algum momento,
// esta rota fica publicamente chamável por qualquer um (o único efeito
// colateral seria gastar chamadas de API e criar commits de backup extras
// no GitHub — não há escrita de dados arbitrários, o conteúdo vem sempre
// do que já está no Supabase). Ainda assim, put um rate-limit simples
// abaixo como camada extra.
import { backupPokemonToGithub } from '../../lib/backupPokemon.js';

// Rate-limit best-effort em memória (reseta a cada cold start da função
// serverless — não é perfeito, mas evita clique-duplo/loop acidental).
let lastRunAt = 0;
const MIN_INTERVAL_MS = 30 * 1000; // 30s entre execuções manuais

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) {
    return res.status(429).json({ error: 'Aguarde alguns segundos antes de rodar o backup de novo.' });
  }
  lastRunAt = now;
  try {
    const result = await backupPokemonToGithub();
    return res.status(200).json(result);
  } catch (e) {
    console.error('backup-pokemon (manual) falhou:', e);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
}
