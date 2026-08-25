/* ══════════════════════════════════════════════════════════════
   WEATHERCAST — MOTOR DE CÁLCULO CLIMÁTICO (compartilhado)

   Única fonte da lógica de clima da Região Nendo. Tanto o
   weathercast.html (exibição pro jogador) quanto o weathercast_adm.html
   (configuração + aba de explicação) carregam este mesmo arquivo — a
   fórmula mora aqui, e só aqui. Nenhum dos dois HTMLs deve reimplementar
   nada disso; eles só alimentam este motor com dados (locais, config,
   pontos climáticos, eventos) e leem o resultado.

   Uso:
     WeathercastCalc.configurar({ locais, pinsClimaticos, overrides,
       limiteLatitude, estacaoAtiva });
     WeathercastCalc.climaDoLocal(local, data);
     WeathercastCalc.climaNaHora(local, data, hora);
     WeathercastCalc.explicarLocal(local, data, hora); // pro adm
   ══════════════════════════════════════════════════════════════ */
(function(global){

/* ── ESTADO (alimentado via configurar()) ───────────────────── */
let LOCAIS = [];
// Dois pins arrastáveis no mapa (ADM → Mapa → 🧭 Pins Norte/Sul), cada um
// com posição (x,y) e um ajuste relativo em °C. Substituem o antigo
// sistema de "zonas climáticas marcadas" (múltiplos pontos com raio).
let PINS_CLIMATICOS = { norte: null, sul: null }; // {x,y,ajuste} cada
let WEATHER_OVERRIDES = [];
let ESTACAO_ATIVA = null;

const GRADIENTE_ZONAS_EXCLUIDAS = new Set(['Vulcânica', 'Subterrânea']);
const TETO_AJUSTE_SUPERFICIE = 10;
const RAIO_INFLUENCIA_VIZINHOS = 22;

const LIMITE_LATITUDE = {
  ativo: true,
  eixo: 'y',
  norte: { pos: 0,   ceiling: 12, floor: -30 },
  sul:   { pos: 100, ceiling: 45, floor: 2   }
};

const BIOMA_TO_ZONA = {
  'Urbano':'Temperada', 'Florestal':'Temperada', 'Planície':'Temperada', 'Rios e Lagos':'Temperada',
  'Assombrado':'Fria', 'Montanhoso':'Fria',
  'Polar':'Polar',
  'Árido':'Desértica',
  'Caverna':'Subterrânea',
  'Pantanoso':'Tropical', 'Praia':'Tropical', 'Recifes':'Tropical',
  'Costeiro':'Oceânica', 'Marítimo':'Oceânica', 'Pelágico':'Oceânica',
  'Vulcânico':'Vulcânica'
};

const CONDICOES = {
  sol:        { nome:'Céu Limpo',            flavor:'Sol forte e poucas nuvens no céu.',                tempMod: 2 },
  parcial:    { nome:'Parcialmente Nublado',  flavor:'Sol intercalado com passagens de nuvens.',         tempMod: 0 },
  nublado:    { nome:'Nublado',               flavor:'Céu encoberto o dia inteiro.',                     tempMod:-1 },
  neblina:    { nome:'Neblina',               flavor:'Névoa reduz a visibilidade pela manhã.',           tempMod:-1 },
  chuva:      { nome:'Chuva',                 flavor:'Chuva constante ao longo do dia.',                 tempMod:-2 },
  tempestade: { nome:'Tempestade',            flavor:'Trovoadas fortes e rajadas de vento.',             tempMod:-3 },
  neve:       { nome:'Neve',                  flavor:'Neve cobrindo o chão aos poucos.',                 tempMod:-3 },
  vento:      { nome:'Ventania',              flavor:'Rajadas fortes o dia todo.',                       tempMod:-1 },
  cinzas:     { nome:'Cinzas no Ar',          flavor:'Uma fina camada de cinza cobre a região.',         tempMod: 0 },
  escuro:     { nome:'Escuridão',             flavor:'Nenhuma luz externa alcança este ponto.',          tempMod: 0 },
  lua:        { nome:'Céu Estrelado',         flavor:'Noite clara e fria.',                              tempMod:-2 }
};

const ZONA_PERFIL = {
  'Tropical': { bg:['#2e6b4a','#123322'], estacoes:{
    primavera:{ tempMin:23, tempMax:29, umid:75, vento:12, condPesos:{ sol:40, parcial:25, chuva:20, vento:15 } },
    verao:    { tempMin:25, tempMax:33, umid:82, vento:14, condPesos:{ chuva:35, tempestade:15, sol:25, parcial:15, vento:10 } },
    outono:   { tempMin:22, tempMax:28, umid:78, vento:13, condPesos:{ sol:30, parcial:25, chuva:25, vento:20 } },
    inverno:  { tempMin:19, tempMax:26, umid:65, vento:11, condPesos:{ sol:45, parcial:30, vento:15, chuva:10 } }
  }},
  'Temperada': { bg:['#3c5c3a','#182818'], estacoes:{
    primavera:{ tempMin:12, tempMax:20, umid:60, vento:14, condPesos:{ sol:30, parcial:25, chuva:25, vento:15, nublado:5 } },
    verao:    { tempMin:21, tempMax:31, umid:55, vento:12, condPesos:{ sol:40, parcial:30, vento:15, chuva:10, tempestade:5 } },
    outono:   { tempMin:9,  tempMax:17, umid:68, vento:16, condPesos:{ nublado:25, chuva:30, vento:20, parcial:15, sol:10 } },
    inverno:  { tempMin:-2, tempMax:8,  umid:70, vento:15, condPesos:{ nublado:30, neve:20, chuva:15, vento:20, sol:15 } }
  }},
  'Fria': { bg:['#3d5266','#182430'], estacoes:{
    primavera:{ tempMin:4,   tempMax:12, umid:65, vento:16, condPesos:{ parcial:30, neblina:25, vento:20, sol:15, chuva:10 } },
    verao:    { tempMin:12,  tempMax:20, umid:58, vento:14, condPesos:{ sol:30, parcial:30, vento:20, chuva:15, neblina:5 } },
    outono:   { tempMin:2,   tempMax:10, umid:70, vento:18, condPesos:{ neblina:30, nublado:25, vento:20, chuva:20, sol:5 } },
    inverno:  { tempMin:-10, tempMax:-1, umid:72, vento:20, condPesos:{ neve:35, neblina:25, vento:20, nublado:15, sol:5 } }
  }},
  'Polar': { bg:['#3d5a6e','#101a2b'], estacoes:{
    primavera:{ tempMin:-10, tempMax:-2,  umid:68, vento:24, condPesos:{ neve:30, sol:25, vento:25, neblina:20 } },
    verao:    { tempMin:-2,  tempMax:6,   umid:60, vento:20, condPesos:{ sol:35, neve:15, vento:25, neblina:25 } },
    outono:   { tempMin:-12, tempMax:-3,  umid:70, vento:26, condPesos:{ neve:35, vento:30, neblina:20, sol:15 } },
    inverno:  { tempMin:-25, tempMax:-14, umid:65, vento:30, condPesos:{ neve:45, vento:35, neblina:20 } }
  }},
  'Desértica': { bg:['#a6672f','#4a2e17'], estacoes:{
    primavera:{ tempMin:20, tempMax:30, umid:22, vento:16, condPesos:{ sol:45, vento:25, parcial:20, lua:10 } },
    verao:    { tempMin:28, tempMax:42, umid:12, vento:18, condPesos:{ sol:55, vento:25, lua:20 } },
    outono:   { tempMin:18, tempMax:28, umid:20, vento:17, condPesos:{ sol:40, vento:30, parcial:20, lua:10 } },
    inverno:  { tempMin:8,  tempMax:18, umid:25, vento:15, condPesos:{ sol:35, vento:30, parcial:25, lua:10 } }
  }},
  'Oceânica': { bg:['#3c7fa0','#154864'], estacoes:{
    primavera:{ tempMin:15, tempMax:22, umid:70, vento:20, condPesos:{ parcial:30, sol:25, vento:25, chuva:20 } },
    verao:    { tempMin:20, tempMax:27, umid:65, vento:18, condPesos:{ sol:35, parcial:30, vento:20, chuva:15 } },
    outono:   { tempMin:14, tempMax:21, umid:75, vento:24, condPesos:{ vento:30, nublado:25, chuva:25, parcial:20 } },
    inverno:  { tempMin:8,  tempMax:15, umid:78, vento:26, condPesos:{ tempestade:20, vento:30, nublado:25, chuva:25 } }
  }},
  'Subterrânea': { bg:['#332c47','#151221'], estacoes:{
    primavera:{ tempMin:13, tempMax:17, umid:75, vento:4, condPesos:{ escuro:30, neblina:30, vento:15, nublado:25 } },
    verao:    { tempMin:14, tempMax:18, umid:73, vento:4, condPesos:{ escuro:30, neblina:28, vento:15, nublado:27 } },
    outono:   { tempMin:13, tempMax:17, umid:76, vento:4, condPesos:{ escuro:30, neblina:30, vento:14, nublado:26 } },
    inverno:  { tempMin:11, tempMax:15, umid:78, vento:5, condPesos:{ escuro:32, neblina:28, vento:16, nublado:24 } }
  }},
  'Vulcânica': { bg:['#a1451f','#4a1b0b'], estacoes:{
    primavera:{ tempMin:28, tempMax:38, umid:18, vento:8, condPesos:{ sol:35, cinzas:30, neblina:20, lua:15 } },
    verao:    { tempMin:32, tempMax:44, umid:15, vento:9, condPesos:{ sol:45, cinzas:25, lua:15, neblina:15 } },
    outono:   { tempMin:26, tempMax:36, umid:20, vento:8, condPesos:{ cinzas:35, sol:30, neblina:20, lua:15 } },
    inverno:  { tempMin:22, tempMax:32, umid:22, vento:8, condPesos:{ cinzas:30, sol:25, neblina:25, lua:20 } }
  }}
};

/* ── CONFIGURAÇÃO ────────────────────────────────────────────── */
// Chame isso depois de carregar os dados do Supabase (locais, pontos
// climáticos, overrides, config de gradiente, estação ativa). Os dois
// HTMLs (weathercast e weathercast_adm) usam a mesma assinatura.
function configurar({ locais, pinsClimaticos, overrides, limiteLatitude, estacaoAtiva } = {}){
  if (locais) LOCAIS = locais;
  if (pinsClimaticos) PINS_CLIMATICOS = pinsClimaticos;
  if (overrides) WEATHER_OVERRIDES = overrides;
  if (limiteLatitude) Object.assign(LIMITE_LATITUDE, limiteLatitude);
  if (estacaoAtiva) ESTACAO_ATIVA = estacaoAtiva;
}

/* ── UTILITÁRIOS ─────────────────────────────────────────────── */
function hashStr(str){
  let h = 0;
  for (let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function fmtData(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function zonaDoLocal(local){
  return local.zona_climatica || BIOMA_TO_ZONA[local.bioma_primario] || 'Temperada';
}

function estacaoPorMesFallback(){
  const agora = new Date();
  const mesBR = parseInt(new Intl.DateTimeFormat('pt-BR', { timeZone:'America/Sao_Paulo', month:'numeric' }).format(agora), 10);
  const mapa = {1:'primavera',2:'verao',3:'outono',4:'inverno',5:'primavera',6:'verao',7:'outono',8:'inverno',9:'primavera',10:'verao',11:'outono',12:'inverno'};
  return mapa[mesBR] || 'primavera';
}

/* ── GRADIENTE DE LATITUDE ───────────────────────────────────── */
function limiteDeLatitude(local, zona){
  if (!LIMITE_LATITUDE.ativo || GRADIENTE_ZONAS_EXCLUIDAS.has(zona)) return null;
  const pos = LIMITE_LATITUDE.eixo === 'x' ? local.pos_x : local.pos_y;
  if (pos == null) return null;
  const t = Math.max(0, Math.min(1, Number(pos) / 100));
  const { norte, sul } = LIMITE_LATITUDE;
  return {
    ceiling: Math.round(norte.ceiling + (sul.ceiling - norte.ceiling) * t),
    floor:   Math.round(norte.floor   + (sul.floor   - norte.floor)   * t)
  };
}

/* ── PINS NORTE/SUL (gradiente por proximidade relativa) ─────
   Cada local recebe um ajuste interpolado entre o pin_norte e o
   pin_sul, de acordo com o quão perto está de cada um — não é mais
   limitado a um raio, vale pro mapa inteiro. t=0 → colado no
   pin_norte (ajuste = norte.ajuste). t=1 → colado no pin_sul
   (ajuste = sul.ajuste). Local exatamente no meio do caminho entre
   os dois pins recebe a média dos dois ajustes.                  */
function ajustePins(local){
  const { norte, sul } = PINS_CLIMATICOS;
  if (!norte || !sul || local.pos_x == null || local.pos_y == null){
    return { ajuste: 0, t: null, dNorte: null, dSul: null };
  }
  const dNorte = Math.hypot(local.pos_x - norte.x, local.pos_y - norte.y);
  const dSul   = Math.hypot(local.pos_x - sul.x,   local.pos_y - sul.y);
  const soma = dNorte + dSul;
  const t = soma > 0 ? dNorte / soma : 0.5; // 0=em cima do norte, 1=em cima do sul
  const ajuste = norte.ajuste + (sul.ajuste - norte.ajuste) * t;
  return { ajuste, t, dNorte, dSul };
}

function ajusteSuperficieMapa(local, zona){
  if (GRADIENTE_ZONAS_EXCLUIDAS.has(zona)) return { ajuste: 0, travado: false, pins: null };
  const pins = ajustePins(local);
  const ajuste = Math.max(-TETO_AJUSTE_SUPERFICIE, Math.min(TETO_AJUSTE_SUPERFICIE, pins.ajuste));
  return { ajuste, travado: ajuste !== pins.ajuste, pins };
}

/* ── PERFIL DO LOCAL (zona × estação + ajustes) ─────────────── */
function perfilDoLocal(local, estacao){
  const zona = zonaDoLocal(local);
  const porZona = ZONA_PERFIL[zona] || ZONA_PERFIL['Temperada'];
  const porEstacao = porZona.estacoes[estacao] || porZona.estacoes.primavera;
  const superficie = ajusteSuperficieMapa(local, zona);
  return {
    zona, bg: porZona.bg, ...porEstacao,
    tempMin: porEstacao.tempMin + superficie.ajuste,
    tempMax: porEstacao.tempMax + superficie.ajuste,
    gradiente: superficie.ajuste,
    _superficie: superficie,
    _base: { tempMin: porEstacao.tempMin, tempMax: porEstacao.tempMax }
  };
}

function distanciaEntreLocais(a, b){
  if (a.pos_x == null || a.pos_y == null || b.pos_x == null || b.pos_y == null) return null;
  const dx = a.pos_x - b.pos_x, dy = a.pos_y - b.pos_y;
  return Math.sqrt(dx*dx + dy*dy);
}

function localCanonicoPorPosicao(local){
  if (local.pos_x == null || local.pos_y == null || !LOCAIS.length) return local;
  const px = Number(local.pos_x), py = Number(local.pos_y);
  const colados = LOCAIS.filter(l =>
    l.pos_x != null && l.pos_y != null &&
    Number(l.pos_x) === px && Number(l.pos_y) === py
  );
  if (colados.length <= 1) return local;
  colados.sort((a,b)=> (a.id ?? 0) - (b.id ?? 0) || a.nome.localeCompare(b.nome));
  return colados[0];
}

function faixaBlendadaComVizinhos(localOriginal, estacao){
  const local = localCanonicoPorPosicao(localOriginal);
  const proprio = perfilDoLocal(local, estacao);
  if (local.pos_x == null || local.pos_y == null || !LOCAIS.length){
    return { ...proprio, _vizinhos: [] };
  }
  let somaW = 1, tMin = proprio.tempMin, tMax = proprio.tempMax, umid = proprio.umid, vento = proprio.vento;
  const vizinhos = [];
  for (const outro of LOCAIS){
    if (outro === local) continue;
    const dist = distanciaEntreLocais(local, outro);
    if (dist == null || dist >= RAIO_INFLUENCIA_VIZINHOS) continue;
    if (dist === 0) continue;
    const w = Math.max(0, 1 - dist / RAIO_INFLUENCIA_VIZINHOS);
    if (w <= 0) continue;
    const pOutro = perfilDoLocal(outro, estacao);
    tMin += pOutro.tempMin * w; tMax += pOutro.tempMax * w;
    umid += pOutro.umid * w;    vento += pOutro.vento * w;
    somaW += w;
    vizinhos.push({ nome: outro.nome, distancia: dist, peso: w });
  }
  return {
    zona: proprio.zona, bg: proprio.bg, condPesos: proprio.condPesos, gradiente: proprio.gradiente,
    tempMin: tMin / somaW, tempMax: tMax / somaW, umid: umid / somaW, vento: vento / somaW,
    _base: proprio._base, _superficie: proprio._superficie, _vizinhos: vizinhos, _local: local
  };
}

function sortearCondicao(condPesos, seed){
  const chaves = Object.keys(condPesos);
  const totalPeso = chaves.reduce((s,k)=>s+condPesos[k],0) || 1;
  const h = hashStr(seed) % totalPeso;
  let roll = h, escolhida = chaves[0];
  for (const k of chaves){
    if (roll < condPesos[k]){ escolhida = k; break; }
    roll -= condPesos[k];
  }
  return escolhida;
}

/* ── EVENTOS FORÇADOS (weathercast_overrides) ───────────────── */
function overrideParaLocalData(local, data){
  if (!WEATHER_OVERRIDES.length) return null;
  const dataStr = fmtData(data);
  const zona = zonaDoLocal(local);
  const ativos = WEATHER_OVERRIDES.filter(o =>
    o.ativo !== false && o.data_inicio <= dataStr && dataStr <= o.data_fim
  );
  if (!ativos.length) return null;
  return ativos.find(o => o.escopo === 'local' && o.escopo_valor === local.nome)
      || ativos.find(o => o.escopo === 'zona' && o.escopo_valor === zona)
      || ativos.find(o => o.escopo === 'global')
      || null;
}

/* ── CLIMA FINAL DO DIA / DA HORA ────────────────────────────── */
function climaDoLocal(local, data, estacaoOverride){
  const estacao = estacaoOverride || ESTACAO_ATIVA || estacaoPorMesFallback();
  const posKey = (local.pos_x != null && local.pos_y != null)
    ? `${Number(local.pos_x).toFixed(2)},${Number(local.pos_y).toFixed(2)}`
    : local.nome;
  const seedBase = `${posKey}-${fmtData(data)}`;
  const faixa = faixaBlendadaComVizinhos(local, estacao);

  const forcado = overrideParaLocalData(local, data);
  const iconEscolhido = (forcado && CONDICOES[forcado.condicao])
    ? forcado.condicao
    : sortearCondicao(faixa.condPesos, seedBase + '-cond');
  const condicaoDef = CONDICOES[iconEscolhido] || CONDICOES.parcial;
  const condicao = { nome: condicaoDef.nome, icon: iconEscolhido, flavor: condicaoDef.flavor, tempMod: condicaoDef.tempMod };

  const tMin = (forcado && forcado.temp_min != null) ? Number(forcado.temp_min) : faixa.tempMin;
  const tMax = (forcado && forcado.temp_max != null) ? Number(forcado.temp_max) : faixa.tempMax;

  const hVar = hashStr(seedBase + '-temp');
  const spread = Math.max(1, tMax - tMin);
  const baseTemp = tMin + (hVar % 100)/100 * spread;
  let temp = Math.round(baseTemp + condicao.tempMod);

  const semEventoDeTemp = !(forcado && (forcado.temp_min != null || forcado.temp_max != null));
  let limite = null, travouLimite = false;
  if (semEventoDeTemp){
    limite = limiteDeLatitude(local, faixa.zona);
    if (limite){
      const antesDoLimite = temp;
      temp = Math.max(limite.floor, Math.min(limite.ceiling, temp));
      travouLimite = temp !== antesDoLimite;
    }
  }

  const hUmid = hashStr(seedBase + '-umid');
  const umidade = Math.max(5, Math.min(98, Math.round(faixa.umid + ((hUmid % 21) - 10))));

  const hVento = hashStr(seedBase + '-vento');
  const vento = Math.max(2, Math.round(faixa.vento + ((hVento % 11) - 5)));

  return {
    perfil: { bg: faixa.bg }, zona: faixa.zona, gradiente: faixa.gradiente, estacao, condicao, temp, umidade, vento,
    forcado: forcado ? { escopo: forcado.escopo, nota: forcado.nota || null } : null,
    _debug: { faixa, limite, travouLimite, baseTemp, forcado }
  };
}

function climaNaHora(local, data, hora){
  const posKey = (local.pos_x != null && local.pos_y != null)
    ? `${Number(local.pos_x).toFixed(2)},${Number(local.pos_y).toFixed(2)}`
    : local.nome;
  const seed = `${posKey}-${fmtData(data)}-h${hora}`;
  const base = climaDoLocal(local, data);
  const hVar = hashStr(seed + '-hvar');
  const oscil = Math.sin((hora/24)*Math.PI*2 - Math.PI/2) * 4;
  const temp = Math.round(base.temp + oscil + ((hVar % 5) - 2));
  const hProb = hashStr(seed + '-prob');
  const chuva = ['chuva','tempestade','neve'].includes(base.condicao.icon) ? 40 + (hProb % 45) : (hProb % 18);
  let icon = base.condicao.icon;
  const noite = hora < 6 || hora >= 19;
  if (icon === 'sol' && noite) icon = 'lua';
  return { temp, chuva, icon, _base: base, _oscil: oscil };
}

/* ── EXPLICAÇÃO (pro ADM — aba "por que essa temperatura") ──── */
// Monta um relato passo a passo de como a temperatura final de um local
// foi composta, pra exibir na aba de diagnóstico do adm.
function explicarLocal(local, data, hora){
  const dia = climaDoLocal(local, data);
  const { faixa, limite, travouLimite, baseTemp, forcado } = dia._debug;
  const passos = [];

  passos.push({
    etapa: 'Zona × estação',
    detalhe: `Zona "${faixa.zona}" na estação "${dia.estacao}" → faixa base ${faixa._base.tempMin.toFixed(1)}°C a ${faixa._base.tempMax.toFixed(1)}°C.`
  });

  if (faixa._superficie && faixa._superficie.pins && faixa._superficie.pins.t != null){
    const { t, dNorte, dSul } = faixa._superficie.pins;
    const pctSul = (t*100).toFixed(0), pctNorte = (100-t*100).toFixed(0);
    passos.push({
      etapa: 'Pins Norte/Sul',
      detalhe: `${pctNorte}% pin_norte / ${pctSul}% pin_sul (dist. ${dNorte.toFixed(1)} / ${dSul.toFixed(1)}) → ajuste ${faixa.gradiente>=0?'+':''}${faixa.gradiente.toFixed(1)}°C${faixa._superficie.travado ? ' (travado no teto de ±'+TETO_AJUSTE_SUPERFICIE+'°C)' : ''}.`
    });
  } else {
    passos.push({ etapa: 'Pins Norte/Sul', detalhe: 'Local sem posição cadastrada, ou pins ainda não configurados.' });
  }

  if (faixa._vizinhos && faixa._vizinhos.length){
    const lista = faixa._vizinhos.map(v => `${v.nome} (peso ${(v.peso*100).toFixed(0)}%)`).join('; ');
    passos.push({ etapa: 'Mistura com vizinhos', detalhe: `Faixa ajustada pela proximidade de: ${lista}.` });
  } else {
    passos.push({ etapa: 'Mistura com vizinhos', detalhe: 'Nenhum vizinho próximo o bastante pra influenciar.' });
  }

  passos.push({
    etapa: 'Sorteio do dia',
    detalhe: `Dentro da faixa ${faixa.tempMin.toFixed(1)}–${faixa.tempMax.toFixed(1)}°C, sorteio determinístico (data+posição) deu ${baseTemp.toFixed(1)}°C, + condição "${dia.condicao.nome}" (${dia.condicao.tempMod>=0?'+':''}${dia.condicao.tempMod}°C).`
  });

  if (forcado){
    passos.push({ etapa: 'Evento forçado (ADM)', detalhe: `Escopo "${forcado.escopo}"${forcado.nota ? ': ' + forcado.nota : ''}.` });
  }

  if (limite){
    passos.push({
      etapa: 'Trava de latitude',
      detalhe: travouLimite
        ? `Resultado ultrapassava a faixa permitida pra essa latitude (${limite.floor}°C a ${limite.ceiling}°C) e foi travado.`
        : `Dentro da faixa permitida pra essa latitude (${limite.floor}°C a ${limite.ceiling}°C) — não precisou travar.`
    });
  }

  let tempFinal = dia.temp;
  if (hora != null){
    const hc = climaNaHora(local, data, hora);
    tempFinal = hc.temp;
    passos.push({ etapa: 'Variação por hora', detalhe: `Às ${hora}h, oscilação de ciclo diário aplicada sobre os ${dia.temp}°C do dia → ${hc.temp}°C.` });
  }

  return { local: local.nome, temperaturaFinal: tempFinal, passos, clima: dia };
}

/* ── EXPORT ──────────────────────────────────────────────────── */
global.WeathercastCalc = {
  configurar,
  hashStr, fmtData, zonaDoLocal, estacaoPorMesFallback,
  climaDoLocal, climaNaHora, explicarLocal,
  overrideParaLocalData, chanceChuvaDia: function(local, data, condicaoIcon){
    const posKey = (local.pos_x != null && local.pos_y != null)
      ? `${Number(local.pos_x).toFixed(2)},${Number(local.pos_y).toFixed(2)}`
      : local.nome;
    const h = hashStr(posKey + fmtData(data) + 'p');
    if (['chuva','tempestade','neve'].includes(condicaoIcon)) return 45 + (h % 45);
    return Math.max(4, h % 35);
  },
  BIOMA_TO_ZONA, CONDICOES, ZONA_PERFIL, LIMITE_LATITUDE, RAIO_INFLUENCIA_VIZINHOS,
  get LOCAIS(){ return LOCAIS; }
};

})(window);
