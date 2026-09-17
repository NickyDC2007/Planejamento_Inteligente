/*
 * NOTA DA CIDADE — quatro eixos, calculados só com DISTÂNCIA
 * ---------------------------------------------------------
 *   EIXO                              ALGORITMO
 *   1. Acesso a Serviços Essenciais   BFS: ruas de cada serviço até as moradias
 *   2. Polo Econômico                 BFS: blocos contínuos de lugares econômicos
 *   3. Vizinhança Segura              Floyd-Warshall: distâncias e excentricidade
 *   4. Mobilidade Urbana              Floyd-Warshall: caminho mínimo moradia → polo
 *
 * A malha não muda quando os lugares trocam de vértice. Por isso as distâncias
 * entre todos os pares (Floyd-Warshall) e as contagens de ruas (BFS) são
 * calculadas UMA vez em `contextoRede`; depois, avaliar uma distribuição de
 * lugares vira consulta a tabelas. É isso que permite ao otimizador testar
 * milhares de distribuições em poucos segundos.
 */

const PESO_EIXO = 25;
const SEM_CAMINHO = 32767;

const CONCEITOS = [
  [88, "A", "Excelente — cidade bem setorizada"],
  [74, "B", "Boa — funciona, com pontos a corrigir"],
  [58, "C", "Regular — falhas relevantes de acesso ou de convivência"],
  [42, "D", "Ruim — boa parte dos princípios não é respeitada"],
  [0, "E", "Crítica — uso do solo desorganizado"],
];

const notaDecrescente = (valor, otimo, pessimo) =>
  valor === Infinity ? 0 : valor <= otimo ? 100 : valor >= pessimo ? 0 : (100 * (pessimo - valor)) / (pessimo - otimo);
const notaCrescente = (valor, pessimo, otimo) =>
  valor === Infinity ? 100 : valor <= pessimo ? 0 : valor >= otimo ? 100 : (100 * (valor - pessimo)) / (otimo - pessimo);
const fmt = (n, casas = 1) => (Number.isFinite(n) ? n.toFixed(casas).replace(".", ",") : "∞");
const media = (lista) => (lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : 0);
const conceitoDe = (nota) => CONCEITOS.find(([corte]) => nota >= corte);

/* ================================================================== */
/* CONTEXTO DA REDE — tudo o que não depende de onde fica cada lugar   */
/* ================================================================== */
function contextoRede(cidade) {
  const ids = cidade.vertices;
  const n = ids.length;
  const idx = new Map(ids.map((v, i) => [v, i]));
  const pos = ids.map((v) => [cidade.ponto(v).x, cidade.ponto(v).y]);
  const vizinhos = ids.map((v) => cidade.vizinhos(v).map((u) => idx.get(u)));
  const sucessores = ids.map((v) => cidade.sucessores(v).map((a) => idx.get(a.destino)));

  // Floyd-Warshall em metros -> km.
  const fw = floydWarshall(cidade);
  const km = fw.dist.map((linha) => linha.map((d) => d / 1000));

  // BFS de cada vértice: quantas ruas até cada outro (com e sem respeitar as mãos).
  const saltosPor = (lista) =>
    Array.from({ length: n }, (_, s) => {
      const linha = new Int16Array(n).fill(SEM_CAMINHO);
      linha[s] = 0;
      const fila = [s];
      for (let k = 0; k < fila.length; k++) {
        for (const v of lista[fila[k]]) {
          if (linha[v] === SEM_CAMINHO) {
            linha[v] = linha[fila[k]] + 1;
            fila.push(v);
          }
        }
      }
      return linha;
    });

  const presidios = new Set(ids.map((v, i) => (cidade.ponto(v).tipo === "PRESIDIO" ? i : -1)).filter((i) => i >= 0));
  const urbanos = [...Array(n).keys()].filter((i) => !presidios.has(i));
  let extensao = 1;
  for (const a of urbanos) for (const b of urbanos) extensao = Math.max(extensao, Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]));
  const ruas = cidade.ruas();
  const ruaMedia = ruas.length ? ruas.reduce((s, r) => s + r.distancia_m, 0) / ruas.length / 1000 : 1;

  // Excentricidade de cada vértice, lida da matriz do Floyd-Warshall (só lugares urbanos).
  const ecc = Array.from({ length: n }, (_, i) =>
    urbanos.reduce((m, j) => (j !== i && Number.isFinite(km[i][j]) ? Math.max(m, km[i][j]) : m), 0)
  );
  const eccUrbanas = urbanos.map((i) => ecc[i]);

  return {
    cidade, ids, idx, n, pos, vizinhos, km, prox: fw.prox,
    saltosDir: saltosPor(sucessores),
    saltosNd: saltosPor(vizinhos),
    presidios, extensao, ruaMedia, ecc,
    raio: Math.min(...eccUrbanas), diametro: Math.max(...eccUrbanas),
  };
}

/* ================================================================== */
/* EIXO 1 — ACESSO A SERVIÇOS ESSENCIAIS                               */
/* ================================================================== */
function eixoServicos(ctx, tipos, lista, detalhar) {
  const base = {
    chave: "servicos", nome: "Acesso a Serviços Essenciais", peso: PESO_EIXO,
    regra: `Toda zona residencial alcança hospital, bombeiros, delegacia, farmácia e escola em até ${RAIO_SERVICO} ruas — perto, mas nunca colado na moradia.`,
    algoritmo: "BFS (busca em largura)",
  };
  const moradias = lista("RESIDENCIAL");
  if (!moradias.length) return { ...base, aplicavel: false, nota: 0, resumo: "nenhuma zona residencial" };

  const ehServico = new Uint8Array(ctx.n);
  SERVICOS_ESSENCIAIS.forEach((t) => lista(t).forEach((i) => (ehServico[i] = 1)));
  const falta = Object.fromEntries(SERVICOS_ESSENCIAIS.map((t) => [t, 0]));
  const orfas = [];
  const parciais = [];
  const coladas = [];
  let soma = 0;

  for (const r of moradias) {
    let atendidos = 0;
    for (const t of SERVICOS_ESSENCIAIS) {
      if (lista(t).some((s) => ctx.saltosDir[s][r] <= RAIO_SERVICO)) atendidos++;
      else falta[t]++;
    }
    let pontos = atendidos / SERVICOS_ESSENCIAIS.length;
    const colado = ctx.vizinhos[r].find((v) => ehServico[v]);
    if (colado !== undefined) {
      pontos *= 0.5;
      coladas.push([r, colado]);
    }
    if (!atendidos) orfas.push(r);
    else if (atendidos < SERVICOS_ESSENCIAIS.length) parciais.push(r);
    soma += pontos;
  }
  const nota = (100 * soma) / moradias.length;
  if (!detalhar) return { ...base, aplicavel: true, nota };

  const nome = (i) => ctx.cidade.ponto(ctx.ids[i]).nome;
  const plenas = moradias.length - orfas.length - parciais.length;
  const pior = SERVICOS_ESSENCIAIS.reduce((a, b) => (falta[b] > falta[a] ? b : a));
  return {
    ...base, aplicavel: true, nota,
    resumo: orfas.length || coladas.length
      ? `${orfas.length} zona(s) sem serviço e ${coladas.length} colada(s) a um serviço`
      : `${Math.round((100 * plenas) / moradias.length)}% das zonas residenciais plenamente atendidas`,
    detalhes: [
      `${plenas} de ${moradias.length} zonas residenciais têm os cinco serviços a até ${RAIO_SERVICO} ruas`,
      `${parciais.length} parcialmente atendida(s) e ${orfas.length} sem nenhum serviço por perto`,
      `${coladas.length} zona(s) com serviço vizinho direto — perdem metade dos pontos`,
      ...SERVICOS_ESSENCIAIS.map((t) => `${TIPOS[t].rotulo}: ${lista(t).length} unidade(s), ${falta[t]} zona(s) fora do alcance`),
      ...coladas.slice(0, 3).map(([r, s]) => `colada: ${nome(r)} ao lado de ${nome(s)}`),
    ],
    recomendacoes: [
      ...(falta[pior] ? [`Faltam ${TIPOS[pior].rotulo.toLowerCase()}s perto de ${falta[pior]} zona(s) residencial(is).`] : []),
      ...(coladas.length ? [`Afastar ${nome(coladas[0][1])} de ${nome(coladas[0][0])}: serviço colado na moradia.`] : []),
    ],
    destaques: {
      circulos: [
        ...orfas.map((i) => ({ id: ctx.ids[i], cor: "#d93025", raio: 28 })),
        ...parciais.map((i) => ({ id: ctx.ids[i], cor: "#f9ab00", raio: 24 })),
        ...coladas.map(([i]) => ({ id: ctx.ids[i], cor: "#e8710a", raio: 32 })),
      ],
    },
  };
}

/* ================================================================== */
/* EIXO 2 — POLO ECONÔMICO                                             */
/* ================================================================== */
function eixoEconomia(ctx, tipos, lista, detalhar) {
  const base = {
    chave: "economia", nome: "Polo Econômico", peso: PESO_EIXO,
    regra: "Shoppings, lojas e indústrias formam um único bloco contínuo, sem encostar em moradias.",
    algoritmo: "BFS (busca em largura)",
  };
  const polo = POLO_ECONOMICO.flatMap(lista);
  if (!polo.length) return { ...base, aplicavel: false, nota: 0, resumo: "nenhum lugar econômico" };

  const noPolo = new Uint8Array(ctx.n);
  polo.forEach((i) => (noPolo[i] = 1));
  // BFS restrita aos lugares econômicos: cada busca que começa num lugar ainda não
  // visitado percorre um bloco inteiro, ou seja, uma componente conexa desse subgrafo.
  const visto = new Uint8Array(ctx.n);
  const blocos = [];
  for (const inicio of polo) {
    if (visto[inicio]) continue;
    const bloco = [inicio];
    visto[inicio] = 1;
    for (let k = 0; k < bloco.length; k++) {
      for (const v of ctx.vizinhos[bloco[k]]) {
        if (noPolo[v] && !visto[v]) {
          visto[v] = 1;
          bloco.push(v);
        }
      }
    }
    blocos.push(bloco);
  }
  blocos.sort((a, b) => b.length - a.length);
  const misturados = polo.filter((i) => ctx.vizinhos[i].some((v) => tipos[v] === "RESIDENCIAL"));
  const fracaoBloco = blocos[0].length / polo.length;
  const f = misturados.length / polo.length;
  const nota = 100 * fracaoBloco * (1 - f) ** 2;
  if (!detalhar) return { ...base, aplicavel: true, nota };

  const nome = (i) => ctx.cidade.ponto(ctx.ids[i]).nome;
  const ruasMistas = ctx.cidade
    .ruas()
    .filter((r) => {
      const a = ctx.idx.get(r.origem);
      const b = ctx.idx.get(r.destino);
      return (noPolo[a] && tipos[b] === "RESIDENCIAL") || (noPolo[b] && tipos[a] === "RESIDENCIAL");
    })
    .map((r) => r.id_rua);
  return {
    ...base, aplicavel: true, nota,
    resumo: `${blocos.length} bloco(s) econômico(s); ${misturados.length} lugar(es) encostado(s) em moradia`,
    detalhes: [
      `${polo.length} lugares econômicos em ${blocos.length} bloco(s); o maior reúne ${Math.round(fracaoBloco * 100)}%`,
      `${misturados.length} encostado(s) em moradia (${Math.round(f * 100)}%) — a penalidade é quadrática: (1 − ${fmt(f, 2)})²`,
      ...misturados.slice(0, 4).map((i) => `uso misto: ${nome(i)} ao lado de ${ctx.vizinhos[i].filter((v) => tipos[v] === "RESIDENCIAL").map(nome).join(", ")}`),
    ],
    recomendacoes: [
      ...(blocos.length > 1 ? [`Reunir o polo econômico: ${nome(blocos[blocos.length - 1][0])} está fora do bloco principal.`] : []),
      ...(misturados.length ? [`Separar ${nome(misturados[0])} das moradias vizinhas.`] : []),
    ],
    destaques: {
      circulos: [
        ...blocos[0].map((i) => ({ id: ctx.ids[i], cor: "#1e8e3e", raio: 24 })),
        ...blocos.slice(1).flat().map((i) => ({ id: ctx.ids[i], cor: "#f9ab00", raio: 24 })),
        ...misturados.map((i) => ({ id: ctx.ids[i], cor: "#d93025", raio: 32 })),
      ],
      ruas: ruasMistas,
    },
  };
}

/* ================================================================== */
/* EIXO 3 — VIZINHANÇA SEGURA                                          */
/* ================================================================== */
/*
 * Cada vizinho incômodo tem sua regra, sempre medida pela menor distância pela
 * malha até a zona residencial mais próxima:
 *   PRESÍDIO   longe das moradias E com a delegacia mais perto do que elas
 *   AEROPORTO  na borda da cidade (excentricidade alta) E longe das moradias
 *   INDÚSTRIA  longe das moradias E perto do comércio
 */
function eixoVizinhanca(ctx, tipos, lista, detalhar) {
  const base = {
    chave: "vizinhanca", nome: "Vizinhança Segura", peso: PESO_EIXO,
    regra: "Presídio, aeroporto e indústria a uma distância aceitável das moradias — o presídio perto de uma delegacia, o aeroporto na borda da cidade e a indústria junto ao comércio.",
    algoritmo: "Floyd-Warshall (caminhos mínimos)",
  };
  const { km, extensao: E, ruaMedia: L } = ctx;
  const moradias = lista("RESIDENCIAL");
  const delegacias = lista("DELEGACIA");
  const comercio = COMERCIO.flatMap(lista);
  const maisPerto = (i, alvos, sentido = "ambos") => {
    let menor = Infinity;
    let quem = -1;
    for (const a of alvos) {
      const d = sentido === "chegada" ? km[a][i] : Math.min(km[i][a], km[a][i]);
      if (d < menor) {
        menor = d;
        quem = a;
      }
    }
    return [menor, quem];
  };
  const saltosAteMoradia = (i) => moradias.reduce((m, r) => Math.min(m, ctx.saltosNd[i][r]), SEM_CAMINHO);

  const laudos = [];
  for (const p of lista("PRESIDIO")) {
    const [dMor, vizinho] = maisPerto(p, moradias);
    const [dDel, delegacia] = maisPerto(p, delegacias, "chegada");
    const isolamento = notaCrescente(dMor, 0.08 * E, 0.25 * E);
    const razao = dDel === Infinity ? Infinity : dMor === Infinity ? 0 : dDel / Math.max(dMor, 1e-6);
    const logistica = notaDecrescente(razao, 1.0, 1.8);
    const saltos = saltosAteMoradia(p);
    const fator = saltos <= 1 ? 0.15 : saltos === 2 ? 0.7 : 1;
    laudos.push({ i: p, tipo: "PRESIDIO", nota: (0.6 * isolamento + 0.4 * logistica) * fator, dMor, vizinho, dDel, delegacia, isolamento, logistica, saltos });
  }
  for (const a of lista("AEROPORTO")) {
    const periferia = (ctx.ecc[a] - ctx.raio) / Math.max(ctx.diametro - ctx.raio, 1e-9);
    const notaPeriferia = notaCrescente(periferia, 0.35, 0.85);
    const [dMor, vizinho] = maisPerto(a, moradias);
    const afastamento = notaCrescente(dMor, 0.06 * E, 0.2 * E);
    const saltos = saltosAteMoradia(a);
    laudos.push({ i: a, tipo: "AEROPORTO", nota: (0.5 * notaPeriferia + 0.5 * afastamento) * (saltos <= 1 ? 0.4 : 1), dMor, vizinho, periferia, notaPeriferia, afastamento, saltos });
  }
  for (const f of lista("INDUSTRIA")) {
    const [dMor, vizinho] = maisPerto(f, moradias);
    const [dCom, loja] = maisPerto(f, comercio);
    const afastamento = notaCrescente(dMor, 1.0 * L, 2.2 * L);
    const proximidade = notaDecrescente(dCom, 1.3 * L, 3.5 * L);
    const saltos = saltosAteMoradia(f);
    laudos.push({ i: f, tipo: "INDUSTRIA", nota: (0.5 * afastamento + 0.5 * proximidade) * (saltos <= 1 ? 0.4 : 1), dMor, vizinho, dCom, loja, afastamento, proximidade, saltos });
  }
  if (!laudos.length) return { ...base, aplicavel: false, nota: 0, resumo: "nenhum presídio, aeroporto ou indústria" };
  const nota = media(laudos.map((l) => l.nota));
  if (!detalhar) return { ...base, aplicavel: true, nota };

  const nome = (i) => (i >= 0 ? ctx.cidade.ponto(ctx.ids[i]).nome : "—");
  const pior = [...laudos].sort((a, b) => a.nota - b.nota)[0];
  const linha = (l) => {
    const comum = `${nome(l.i)}: ${fmt(l.dMor)} km da moradia mais próxima (${nome(l.vizinho)})`;
    if (l.tipo === "PRESIDIO") return `${comum}; delegacia a ${fmt(l.dDel)} km (${nome(l.delegacia)}) — nota ${Math.round(l.nota)}`;
    if (l.tipo === "AEROPORTO") return `${comum}; ${Math.round(l.periferia * 100)}% periférico pela excentricidade — nota ${Math.round(l.nota)}`;
    return `${comum}; comércio a ${fmt(l.dCom)} km (${nome(l.loja)}) — nota ${Math.round(l.nota)}`;
  };
  const recomendacoes = [];
  if (pior.nota < 70) {
    if (pior.tipo === "PRESIDIO") recomendacoes.push(pior.logistica < 70 ? `Levar uma delegacia para perto de ${nome(pior.i)}.` : `Afastar as moradias de ${nome(pior.i)}.`);
    if (pior.tipo === "AEROPORTO") recomendacoes.push(`Levar ${nome(pior.i)} para a borda da cidade, longe das moradias.`);
    if (pior.tipo === "INDUSTRIA") recomendacoes.push(pior.proximidade < 70 ? `Aproximar ${nome(pior.i)} do comércio.` : `Afastar ${nome(pior.i)} das moradias.`);
  }
  return {
    ...base, aplicavel: true, nota,
    resumo: `${laudos.length} vizinho(s) incômodo(s); o pior é ${nome(pior.i)} (${Math.round(pior.nota)}/100)`,
    detalhes: [
      `Presídio: isolado a partir de ${fmt(0.25 * E)} km das moradias, com a delegacia tão perto quanto a casa mais próxima`,
      `Aeroporto: na borda (excentricidade alta) e a ${fmt(0.2 * E)} km ou mais das moradias`,
      `Indústria: a ${fmt(2.2 * L)} km ou mais das moradias e a até ${fmt(1.3 * L)} km do comércio`,
      ...laudos.map(linha),
    ],
    recomendacoes,
    destaques: {
      circulos: laudos.map((l) => ({ id: ctx.ids[l.i], cor: l.nota >= 70 ? "#1e8e3e" : "#d93025", raio: 32 })),
    },
  };
}

/* ================================================================== */
/* EIXO 4 — MOBILIDADE URBANA                                          */
/* ================================================================== */
/*
 * TERMINAIS DE ÔNIBUS: o caminho mínimo de cada zona residencial até o polo
 * econômico deve passar por um terminal — ele é a ponte entre os dois.
 * AEROPORTO: mesmo na borda, precisa ser alcançável sem grandes voltas; mede-se
 * quanto o caminho pela malha é maior que a linha reta (circuidade).
 */
function eixoMobilidade(ctx, tipos, lista, detalhar) {
  const base = {
    chave: "mobilidade", nome: "Mobilidade Urbana", peso: PESO_EIXO,
    regra: "Terminais de ônibus no caminho entre as moradias e o polo econômico; aeroporto alcançável sem grandes voltas.",
    algoritmo: "Floyd-Warshall (caminhos mínimos)",
  };
  const moradias = lista("RESIDENCIAL");
  const polo = POLO_ECONOMICO.flatMap(lista);
  const onibus = lista("ONIBUS");
  const aeroportos = lista("AEROPORTO");
  const partes = [];
  const semPonte = [];
  let fracao = null;
  let circuidades = [];

  if (moradias.length && polo.length) {
    let total = 0;
    let ponte = 0;
    for (const r of moradias) {
      let destino = -1;
      for (const c of polo) if (Number.isFinite(ctx.km[r][c]) && (destino < 0 || ctx.km[r][c] < ctx.km[r][destino])) destino = c;
      if (destino < 0) continue;
      total++;
      let atual = ctx.prox[r][destino];
      let passou = false;
      for (let passos = 0; atual !== destino && atual >= 0 && passos < ctx.n; passos++) {
        if (tipos[atual] === "ONIBUS") {
          passou = true;
          break;
        }
        atual = ctx.prox[atual][destino];
      }
      if (passou) ponte++;
      else semPonte.push(r);
    }
    fracao = total ? ponte / total : 0;
    partes.push(onibus.length ? notaCrescente(fracao, 0.2, 0.8) : 0);
  }

  if (aeroportos.length && moradias.length) {
    partes.push(
      media(
        aeroportos.map((a) => {
          const razoes = moradias
            .filter((r) => Number.isFinite(ctx.km[r][a]))
            .map((r) => ctx.km[r][a] / Math.max(Math.hypot(ctx.pos[r][0] - ctx.pos[a][0], ctx.pos[r][1] - ctx.pos[a][1]), 1e-6));
          const circuidade = razoes.length ? media(razoes) : Infinity;
          circuidades.push([a, circuidade]);
          return notaDecrescente(circuidade, 1.25, 2.0) * (razoes.length / moradias.length);
        })
      )
    );
  }

  if (!partes.length) return { ...base, aplicavel: false, nota: 0, resumo: "sem moradias para conectar" };
  const nota = media(partes);
  if (!detalhar) return { ...base, aplicavel: true, nota };

  const nome = (i) => ctx.cidade.ponto(ctx.ids[i]).nome;
  return {
    ...base, aplicavel: true, nota,
    resumo: fracao === null
      ? `${aeroportos.length} aeroporto(s)`
      : `${Math.round(fracao * 100)}% das moradias passam por um terminal a caminho do polo econômico`,
    detalhes: [
      ...(fracao === null ? [] : [`${onibus.length} terminal(is); ${Math.round(fracao * 100)}% dos caminhos mínimos moradia → polo econômico passam por um deles (pleno a partir de 80%)`]),
      ...circuidades.map(([a, c]) => `${nome(a)}: percorre-se ${fmt(c, 2)}× a linha reta até lá (pleno até 1,25×)`),
      ...semPonte.slice(0, 3).map((r) => `sem terminal no caminho: ${nome(r)}`),
    ],
    recomendacoes: fracao !== null && fracao < 0.8 ? [`Posicionar terminais de ônibus entre as moradias e o polo econômico: ${semPonte.length} zona(s) chegam lá sem passar por um.`] : [],
    destaques: {
      circulos: [
        ...onibus.map((i) => ({ id: ctx.ids[i], cor: "#039be5", raio: 28 })),
        ...semPonte.map((i) => ({ id: ctx.ids[i], cor: "#9334e6", raio: 24 })),
      ],
    },
  };
}

/* ================================================================== */
/* NOTA FINAL                                                          */
/* ================================================================== */
/**
 * Nota de uma distribuição de lugares (`tipos[i]` = o que existe no vértice i).
 * Com `detalhar = false` devolve só os números — é a versão que o otimizador usa.
 */
function calcularNota(ctx, tipos, detalhar = false) {
  const porTipo = {};
  tipos.forEach((t, i) => (porTipo[t] || (porTipo[t] = [])).push(i));
  const lista = (t) => porTipo[t] || [];
  const eixos = [eixoServicos, eixoEconomia, eixoVizinhanca, eixoMobilidade].map((f) => f(ctx, tipos, lista, detalhar));
  const aplicaveis = eixos.filter((e) => e.aplicavel);
  const pesoTotal = aplicaveis.reduce((s, e) => s + e.peso, 0) || 1;
  const exata = aplicaveis.reduce((s, e) => s + e.nota * e.peso, 0) / pesoTotal;
  return { exata, nota: Math.round(exata * 10) / 10, eixos };
}

/** Avaliação completa, com textos e realces para a tela. */
function avaliar(cidade, ctx = contextoRede(cidade)) {
  if (!cidade.ordem) {
    return { nota: 0, conceito: "E", descricao: "Cidade vazia", criterios: [], recomendacoes: [], destaques: {}, indicadores: {} };
  }
  const tipos = ctx.ids.map((v) => cidade.ponto(v).tipo);
  const { nota, eixos } = calcularNota(ctx, tipos, true);
  const [, conceito, descricao] = conceitoDe(nota);
  const aplicaveis = eixos.filter((e) => e.aplicavel);
  const conta = (...t) => cidade.pontosPorTipo(...t).length;
  return {
    nota, conceito, descricao, criterios: eixos,
    pontos_fortes: aplicaveis.filter((e) => e.nota >= 80).map((e) => `${e.nome} (${Math.round(e.nota)}/100): ${e.resumo}`),
    pontos_fracos: aplicaveis.filter((e) => e.nota < 58).map((e) => `${e.nome} (${Math.round(e.nota)}/100): ${e.resumo}`),
    recomendacoes: aplicaveis.flatMap((e) => e.recomendacoes || []),
    destaques: {
      circulos: eixos.flatMap((e) => e.destaques?.circulos || []),
      ruas: eixos.flatMap((e) => e.destaques?.ruas || []),
    },
    indicadores: {
      lugares: cidade.ordem, ruas: cidade.totalRuas,
      moradias: conta("RESIDENCIAL"), servicos: conta(...SERVICOS_ESSENCIAIS), economicos: conta(...POLO_ECONOMICO),
      onibus: conta("ONIBUS"), aeroportos: conta("AEROPORTO"), presidios: conta("PRESIDIO"),
      maior_cruzamento: Math.max(0, ...cidade.vertices.map((v) => cidade.qtdRuas(v))),
    },
  };
}
