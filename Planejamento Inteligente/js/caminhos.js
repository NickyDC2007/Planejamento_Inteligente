/*
 * BUSCAS E CAMINHOS MÍNIMOS — sempre ponderados pela DISTÂNCIA
 * ------------------------------------------------------------
 *   ALGORITMO       RESPONDE             COMPLEXIDADE
 *   BFS             menos ruas           O(|V| + |A|)
 *   DFS             circuitos e ordem    O(|V| + |A|)
 *   Dijkstra        1 origem -> todos    O((|V| + |A|) log |V|)
 *   Floyd-Warshall  todos -> todos       O(|V|³)
 */

/* Fila de prioridade (min-heap binário) usada pelo Dijkstra. */
class FilaPrioridade {
  constructor() { this.dados = []; }
  get tamanho() { return this.dados.length; }

  inserir(chave, valor) {
    const d = this.dados;
    d.push([chave, valor]);
    let i = d.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (d[pai][0] <= d[i][0]) break;
      [d[pai], d[i]] = [d[i], d[pai]];
      i = pai;
    }
  }

  retirar() {
    const d = this.dados;
    const topo = d[0];
    const ultimo = d.pop();
    if (d.length) {
      d[0] = ultimo;
      let i = 0;
      for (;;) {
        const e = 2 * i + 1;
        const r = e + 1;
        let m = i;
        if (e < d.length && d[e][0] < d[m][0]) m = e;
        if (r < d.length && d[r][0] < d[m][0]) m = r;
        if (m === i) break;
        [d[m], d[i]] = [d[i], d[m]];
        i = m;
      }
    }
    return topo;
  }
}

/* Resultado comum aos algoritmos de origem única. */
class ResultadoCaminhos {
  constructor(origem, algoritmo) {
    this.origem = origem;
    this.algoritmo = algoritmo;
    this.dist = new Map();
    this.pai = new Map();
    this.viaUsada = new Map();
    this.relaxamentos = 0;
  }
  custo(v) { return this.dist.has(v) ? this.dist.get(v) : Infinity; }
  alcancavel(v) { return this.custo(v) < Infinity; }

  caminho(destino) {
    if (!this.alcancavel(destino)) return [];
    const seq = [];
    for (let v = destino; v !== null && v !== undefined; v = this.pai.get(v)) {
      seq.push(v);
      if (seq.length > this.dist.size + 1) return [];
    }
    seq.reverse();
    return seq[0] === this.origem ? seq : [];
  }

  viasDoCaminho(destino) {
    return this.caminho(destino).slice(1).map((v) => this.viaUsada.get(v));
  }
}

/* ================================================================== */
/* BFS — BUSCA EM LARGURA                                              */
/* ================================================================== */
/**
 * Usa uma FILA e explora em camadas: primeiro tudo a 1 rua, depois a 2... Por
 * isso resolve o CAMINHO COM MENOS RUAS. O conjunto visitado é exatamente o que
 * se alcança respeitando as mãos de direção.
 */
function bfs(cidade, origem, respeitarSentido = true) {
  const nivel = new Map([[origem, 0]]);
  const pai = new Map([[origem, null]]);
  const fila = [origem];
  for (let i = 0; i < fila.length; i++) {
    const atual = fila[i];
    const proximos = respeitarSentido ? cidade.sucessores(atual).map((a) => a.destino) : cidade.vizinhos(atual);
    for (const prox of proximos) {
      if (nivel.has(prox)) continue;
      nivel.set(prox, nivel.get(atual) + 1);
      pai.set(prox, atual);
      fila.push(prox);
    }
  }
  return {
    origem, nivel, pai, ordem: fila,
    alcancados: new Set(nivel.keys()),
    caminhoAte(destino) {
      if (!nivel.has(destino)) return [];
      const seq = [];
      for (let v = destino; v !== null; v = pai.get(v)) seq.push(v);
      return seq.reverse();
    },
  };
}

/** BFS com várias origens: cada vértice recebe o nível da origem mais próxima. */
function bfsMultiOrigem(cidade, origens, respeitarSentido = true) {
  const nivel = new Map();
  const fila = [];
  for (const o of origens) {
    if (!nivel.has(o)) {
      nivel.set(o, 0);
      fila.push(o);
    }
  }
  for (let i = 0; i < fila.length; i++) {
    const u = fila[i];
    const proximos = respeitarSentido ? cidade.sucessores(u).map((a) => a.destino) : cidade.vizinhos(u);
    for (const v of proximos) {
      if (nivel.has(v)) continue;
      nivel.set(v, nivel.get(u) + 1);
      fila.push(v);
    }
  }
  return nivel;
}

/* ================================================================== */
/* DIJKSTRA                                                            */
/* ================================================================== */
/**
 * Guloso com fila de prioridade: retira o vértice de menor distância (nesse
 * instante o valor já é ótimo) e RELAXA seus arcos:
 *     se dist[u] + distância(u,v) < dist[v], então dist[v] melhora.
 */


/* DFS 

/**
 * Usa uma PILHA (a recursão): mergulha e só volta quando trava. Cada arco u->v
 * é classificado:
 *   ÁRVORE     v ainda não descoberto
 *   RETORNO    v é ancestral aberto de u  ->  PROVA QUE EXISTE CIRCUITO
 *   AVANÇO     v é descendente já fechado
 *   CRUZAMENTO v está em outra sub-árvore já fechada
 */
function dfs(cidade, origem = null) {
  const BRANCO = 0, CINZA = 1, PRETO = 2;
  const cor = new Map(cidade.vertices.map((v) => [v, BRANCO]));
  const descoberta = new Map();
  const classificacao = new Map();
  const ordem = [];
  const ordemFinalizacao = [];
  let relogio = 0;

  const visitar = (u) => {
    cor.set(u, CINZA);
    descoberta.set(u, ++relogio);
    ordem.push(u);
    for (const arco of cidade.sucessores(u)) {
      const v = arco.destino;
      if (cor.get(v) === BRANCO) {
        classificacao.set(arco.id_arco, "arvore");
        visitar(v);
      } else if (cor.get(v) === CINZA) {
        classificacao.set(arco.id_arco, "retorno");
      } else if (descoberta.get(u) < descoberta.get(v)) {
        classificacao.set(arco.id_arco, "avanco");
      } else {
        classificacao.set(arco.id_arco, "cruzamento");
      }
    }
    cor.set(u, PRETO);
    relogio++;
    ordemFinalizacao.push(u);
  };

  const inicios = origem === null ? cidade.vertices : [origem, ...cidade.vertices];
  for (const v of inicios) if (cor.get(v) === BRANCO) visitar(v);

  const contagem = { arvore: 0, retorno: 0, avanco: 0, cruzamento: 0 };
  for (const tipo of classificacao.values()) contagem[tipo]++;
  return { ordem, ordemFinalizacao, classificacao, contagem, temCircuito: contagem.retorno > 0 };
}

function dijkstra(cidade, origem, peso = PESOS.distancia.fn) {
  const r = new ResultadoCaminhos(origem, "Dijkstra");
  for (const v of cidade.vertices) r.dist.set(v, Infinity);
  r.dist.set(origem, 0);
  r.pai.set(origem, null);

  const fechados = new Set();
  const fila = new FilaPrioridade();
  fila.inserir(0, origem);
  while (fila.tamanho) {
    const [d, u] = fila.retirar();
    if (fechados.has(u)) continue;
    fechados.add(u);
    for (const arco of cidade.sucessores(u)) {
      const v = arco.destino;
      if (fechados.has(v)) continue;
      const novo = d + peso(arco, cidade);
      r.relaxamentos++;
      if (novo < r.dist.get(v)) {
        r.dist.set(v, novo);
        r.pai.set(v, u);
        r.viaUsada.set(v, arco);
        fila.inserir(novo, v);
      }
    }
  }
  return r;
}

/** Todas as origens entram na fila com distância 0: dá a distância até a MAIS PRÓXIMA. */
function dijkstraMultiOrigem(cidade, origens, peso = PESOS.distancia.fn) {
  const dist = new Map(cidade.vertices.map((v) => [v, Infinity]));
  const fonte = new Map();
  const fila = new FilaPrioridade();
  for (const o of origens) {
    dist.set(o, 0);
    fonte.set(o, o);
    fila.inserir(0, o);
  }
  const fechados = new Set();
  while (fila.tamanho) {
    const [d, u] = fila.retirar();
    if (fechados.has(u)) continue;
    fechados.add(u);
    for (const arco of cidade.sucessores(u)) {
      const novo = d + peso(arco, cidade);
      if (novo < dist.get(arco.destino)) {
        dist.set(arco.destino, novo);
        fonte.set(arco.destino, fonte.get(u));
        fila.inserir(novo, arco.destino);
      }
    }
  }
  return { dist, fonte };
}

/* ================================================================== */
/* FLOYD-WARSHALL                                                      */
/* ================================================================== */
/**
 * Programação dinâmica sobre a matriz de adjacência:
 *     D[i][j] = min( D[i][j],  D[i][k] + D[k][j] )
 * Para cada vértice k, testa se "passar por k" encurta i -> j. Resolve TODOS
 * os pares; `prox` guarda o próximo vértice para reconstruir o caminho.
 */
function floydWarshall(cidade, peso = PESOS.distancia.fn) {
  const ids = cidade.vertices;
  const n = ids.length;
  const idx = new Map(ids.map((v, i) => [v, i]));
  const dist = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  const prox = Array.from({ length: n }, (_, i) => Int32Array.from({ length: n }, (_, j) => (i === j ? i : -1)));

  for (const arco of cidade.arcos) {
    const i = idx.get(arco.origem);
    const j = idx.get(arco.destino);
    const p = peso(arco, cidade);
    if (p < dist[i][j]) {
      dist[i][j] = p;
      prox[i][j] = j;
    }
  }
  for (let k = 0; k < n; k++) {
    const dk = dist[k];
    for (let i = 0; i < n; i++) {
      const dik = dist[i][k];
      if (dik === Infinity) continue;
      const di = dist[i];
      const pi = prox[i];
      for (let j = 0; j < n; j++) {
        const alt = dik + dk[j];
        if (alt < di[j]) {
          di[j] = alt;
          pi[j] = pi[k];
        }
      }
    }
  }
  // `prox` guarda ÍNDICES; `ids[prox[i][j]]` devolve o id do próximo vértice.
  return { ids, idx, dist, prox };
}

/** Reconstrói o caminho origem -> destino (ids) a partir da matriz `prox`. */
function caminhoFloyd(fw, origem, destino) {
  const { idx, prox, ids } = fw;
  let i = idx.get(origem);
  const j = idx.get(destino);
  if (prox[i][j] === -1) return [];
  const caminho = [origem];
  while (i !== j) {
    i = prox[i][j];
    if (i === -1 || caminho.length > ids.length) return [];
    caminho.push(ids[i]);
  }
  return caminho;
}
