/*
 * USO DO SOLO — onde vai cada lugar
 * ---------------------------------
 * Dada a malha viária já traçada, decide o que existe em cada vértice seguindo
 * a lógica dos quatro eixos da nota:
 *
 *   a. AEROPORTO no vértice mais periférico.
 *   b. POLO ECONÔMICO no centro: shoppings e lojas num bloco contíguo, e as
 *      indústrias encostadas nele.
 *   c. SERVIÇOS ESSENCIAIS espalhados por cobertura gulosa, para que toda
 *      moradia os alcance em até 3 ruas.
 *   d. MORADIAS nos vértices que não encostam em serviço, comércio, indústria
 *      nem aeroporto.
 *   e. TERMINAIS DE ÔNIBUS nos vértices por onde mais passam os caminhos das
 *      moradias até o polo econômico.
 *
 * Depois disso o gerador ainda refina o plano com a busca local do otimizador e,
 * conforme o nível de planejamento escolhido, embaralha parte dos lugares.
 */

const RAIO_SERVICO = 3;

/** Quantos lugares de cada tipo, com mínimos que tornam a cidade viável. */
function quantidadesPorTipo(n) {
  const tipos = Object.keys(TIPOS).filter((t) => TIPOS[t].frequencia > 0);
  const soma = tipos.reduce((s, t) => s + TIPOS[t].frequencia, 0);
  const contagem = Object.fromEntries(Object.keys(TIPOS).map((t) => [t, 0]));

  // Maiores restos: distribui exatamente n lugares pelas frequências.
  const brutos = tipos.map((t) => [t, (TIPOS[t].frequencia / soma) * n]);
  brutos.forEach(([t, v]) => (contagem[t] = Math.floor(v)));
  const faltam = n - tipos.reduce((s, t) => s + contagem[t], 0);
  [...brutos].sort((a, b) => (b[1] % 1) - (a[1] % 1)).slice(0, faltam).forEach(([t]) => contagem[t]++);

  const minimo = {
    RESIDENCIAL: Math.max(3, Math.round(n * 0.3)),
    HOSPITAL: Math.max(1, Math.ceil(n / 18)),
    DELEGACIA: Math.max(1, Math.round(n / 22)),
    BOMBEIROS: Math.max(1, Math.round(n / 28)),
    FARMACIA: Math.max(1, Math.round(n / 16)),
    EDUCACAO: Math.max(1, Math.round(n / 14)),
    SHOPPING: Math.max(1, Math.round(n / 30)),
    LOJA: Math.max(1, Math.round(n / 10)),
    INDUSTRIA: Math.max(1, Math.round(n / 25)),
    ONIBUS: Math.max(1, Math.round(n / 14)),
    AEROPORTO: n >= 15 ? 1 : 0,
    PRESIDIO: 0,
  };
  for (const tipo of Object.keys(minimo)) {
    while (contagem[tipo] < minimo[tipo]) {
      const doador = Object.keys(contagem)
        .filter((t) => contagem[t] > minimo[t])
        .sort((a, b) => contagem[b] - minimo[b] - (contagem[a] - minimo[a]))[0];
      if (!doador) break;
      contagem[doador]--;
      contagem[tipo]++;
    }
  }
  return contagem;
}

/** Distância em ruas entre todos os pares do grafo subjacente (uma BFS por vértice). */
function matrizDeSaltos(adj) {
  const n = adj.length;
  return Array.from({ length: n }, (_, s) => {
    const linha = new Int16Array(n).fill(-1);
    linha[s] = 0;
    const fila = [s];
    for (let i = 0; i < fila.length; i++) {
      for (const v of adj[fila[i]]) {
        if (linha[v] === -1) {
          linha[v] = linha[fila[i]] + 1;
          fila.push(v);
        }
      }
    }
    return linha;
  });
}

/** Número de caminhos mínimos (em ruas) entre todos os pares. */
function contagemDeCaminhos(adj, saltos) {
  const n = adj.length;
  return Array.from({ length: n }, (_, s) => {
    const sigma = new Float64Array(n);
    sigma[s] = 1;
    const ordem = [...Array(n).keys()].filter((v) => saltos[s][v] >= 0).sort((a, b) => saltos[s][a] - saltos[s][b]);
    for (const v of ordem) {
      if (v === s) continue;
      for (const p of adj[v]) if (saltos[s][p] === saltos[s][v] - 1) sigma[v] += sigma[p];
    }
    return sigma;
  });
}

function distribuirUsoDoSolo(posicoes, adj, contagem, rng) {
  const n = posicoes.length;
  const tipo = new Array(n).fill(null);
  const resta = { ...contagem };
  const livres = () => [...Array(n).keys()].filter((i) => tipo[i] === null);
  const usar = (i, t) => {
    tipo[i] = t;
    resta[t]--;
  };
  const saltos = matrizDeSaltos(adj);
  const cx = posicoes.reduce((s, p) => s + p[0], 0) / n;
  const cy = posicoes.reduce((s, p) => s + p[1], 0) / n;
  const aoCentroide = (i) => Math.hypot(posicoes[i][0] - cx, posicoes[i][1] - cy);
  const somaSaltos = (i) => saltos[i].reduce((s, h) => s + (h < 0 ? n : h), 0);
  const centro = [...Array(n).keys()].reduce((a, b) => (somaSaltos(b) < somaSaltos(a) ? b : a));
  const restritos = new Set(); // vizinho direto de moradia não pode ser nenhum destes

  /* ---- a. aeroporto na periferia ---- */
  while (resta.AEROPORTO > 0) {
    const candidatos = livres();
    const poucasRuas = candidatos.filter((i) => adj[i].size <= 3);
    const i = (poucasRuas.length ? poucasRuas : candidatos).reduce((a, b) => (aoCentroide(b) > aoCentroide(a) ? b : a));
    usar(i, "AEROPORTO");
    restritos.add(i);
  }

  /* ---- b. polo econômico contíguo a partir do centro ---- */
  // Um prefixo da ordem de BFS a partir de um vértice é sempre conexo.
  const ordemBfs = [...Array(n).keys()]
    .filter((i) => saltos[centro][i] >= 0)
    .sort((a, b) => saltos[centro][a] - saltos[centro][b] || aoCentroide(a) - aoCentroide(b));
  const polo = new Set();
  for (const t of ["SHOPPING", "LOJA"]) {
    for (const i of ordemBfs) {
      if (resta[t] <= 0) break;
      if (tipo[i] === null) {
        usar(i, t);
        polo.add(i);
      }
    }
  }
  // Indústria encostada no comércio, no vértice com menos vizinhos livres.
  while (resta.INDUSTRIA > 0) {
    const candidatos = livres();
    if (!candidatos.length) break;
    const encostados = candidatos.filter((i) => [...adj[i]].some((v) => polo.has(v)));
    const livresEmVolta = (i) => [...adj[i]].filter((v) => tipo[v] === null).length;
    const pool = encostados.length ? encostados : candidatos;
    const i = pool.reduce((a, b) => (livresEmVolta(b) < livresEmVolta(a) ? b : a));
    usar(i, "INDUSTRIA");
    polo.add(i);
  }
  polo.forEach((i) => restritos.add(i));

  /* ---- c. serviços essenciais por cobertura gulosa ---- */
  const potenciaisMoradias = new Set(livres().filter((i) => ![...restritos].some((r) => saltos[i][r] === 1)));
  for (const servico of SERVICOS_ESSENCIAIS) {
    const cobertos = new Set();
    const instalados = [];
    while (resta[servico] > 0) {
      const candidatos = livres();
      if (!candidatos.length) break;
      let melhor = null;
      let melhorNota = -Infinity;
      for (const v of candidatos) {
        let ganho = 0;
        for (const u of potenciaisMoradias) {
          if (u !== v && !cobertos.has(u) && saltos[v][u] >= 2 && saltos[v][u] <= RAIO_SERVICO) ganho++;
        }
        const espalhamento = instalados.length ? Math.min(...instalados.map((s) => saltos[v][s])) : 0;
        const nota = ganho * 10 + espalhamento - adj[v].size * 0.5 + rng.random() * 0.1;
        if (nota > melhorNota) {
          melhorNota = nota;
          melhor = v;
        }
      }
      usar(melhor, servico);
      instalados.push(melhor);
      restritos.add(melhor);
      potenciaisMoradias.delete(melhor);
      for (const u of potenciaisMoradias) if (saltos[melhor][u] <= RAIO_SERVICO) cobertos.add(u);
    }
  }

  /* ---- d. moradias longe do que incomoda, mas servidas ---- */
  const encostos = (i) => [...adj[i]].filter((v) => restritos.has(v)).length;
  const servicos = SERVICOS_ESSENCIAIS.map((s) => [...Array(n).keys()].filter((i) => tipo[i] === s));
  const atendimento = (i) => servicos.filter((l) => l.some((s) => saltos[s][i] >= 0 && saltos[s][i] <= RAIO_SERVICO)).length;
  const moradias = [];
  livres()
    .sort((a, b) => -1000 * encostos(b) + atendimento(b) * 100 + saltos[centro][b] - (-1000 * encostos(a) + atendimento(a) * 100 + saltos[centro][a]))
    .forEach((i) => {
      if (resta.RESIDENCIAL > 0) {
        usar(i, "RESIDENCIAL");
        moradias.push(i);
      }
    });

  /* ---- e. terminais de ônibus nas pontes entre moradias e polo econômico ---- */
  if (resta.ONIBUS > 0 && moradias.length && polo.size) {
    const sigma = contagemDeCaminhos(adj, saltos);
    const passagem = livres().map((v) => {
      let total = 0;
      for (const r of moradias) {
        for (const c of polo) {
          const h = saltos[r][c];
          if (h > 0 && saltos[r][v] + saltos[v][c] === h) total += (sigma[r][v] * sigma[c][v]) / sigma[r][c];
        }
      }
      return [v, total];
    });
    passagem.sort((a, b) => b[1] - a[1]).slice(0, resta.ONIBUS).forEach(([v]) => usar(v, "ONIBUS"));
  }

  /* ---- f. o que sobrou ---- */
  for (const [t, qtd] of Object.entries(resta)) {
    for (let k = 0; k < qtd; k++) {
      const candidatos = livres();
      if (!candidatos.length) break;
      usar(rng.escolher(candidatos), t);
    }
  }
  for (const i of livres()) tipo[i] = "RESIDENCIAL";
  return tipo;
}
