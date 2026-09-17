/*
 * ESTRUTURA DE DADOS DO GRAFO — LISTA DE ADJACÊNCIA
 * -------------------------------------------------
 *   adj[v]    = arcos que SAEM de v
 *   adjRev[v] = arcos que CHEGAM em v
 *
 * Por que lista de adjacência: a malha viária é ESPARSA (nenhum lugar tem mais
 * de 6 ruas, nunca |V|). Memória O(|V| + |A|) em vez de O(|V|²), e listar os
 * vizinhos custa O(grau(v)) — exatamente o acesso que BFS e Dijkstra fazem.
 *
 * Matriz de adjacência, matriz de incidência e conjuntos também estão aqui, como
 * VISÕES derivadas, para comparação na apresentação.
 */
class Cidade {
  constructor(nome = "Cidade") {
    this.nome = nome;
    this.seed = 0;
    this._pontos = new Map();
    this._adj = new Map();
    this._adjRev = new Map();
    this._arcos = [];
    this._proximoId = 0;
    this._proximaRua = 0;
    this._proximoArco = 0;
  }

  /* ---------------- propriedades ---------------- */
  get ordem() { return this._pontos.size; }            // |V|
  get tamanho() { return this._arcos.length; }         // |A|
  get totalRuas() { return new Set(this._arcos.map((a) => a.id_rua)).size; }
  get vertices() { return [...this._pontos.keys()].sort((a, b) => a - b); }
  get pontos() { return this.vertices.map((v) => this._pontos.get(v)); }
  get arcos() { return [...this._arcos]; }

  ponto(v) {
    const p = this._pontos.get(v);
    if (!p) throw new Error(`Não existe lugar com id ${v}.`);
    return p;
  }

  /* ---------------- construção ---------------- */
  adicionarPonto({ nome, tipo, x = 0, y = 0 }) {
    const id = this._proximoId++;
    this._pontos.set(id, { id, nome, tipo, importancia: TIPOS[tipo].importancia, x, y });
    this._adj.set(id, []);
    this._adjRev.set(id, []);
    return id;
  }

  /** Muda o que existe num vértice (usado ao reposicionar lugares). */
  definirLugar(v, { nome, tipo }) {
    const p = this.ponto(v);
    p.nome = nome;
    p.tipo = tipo;
    p.importancia = TIPOS[tipo].importancia;
  }

  removerPonto(v) {
    this.ponto(v);
    this._arcos = this._arcos.filter((a) => a.origem !== v && a.destino !== v);
    this._pontos.delete(v);
    this._adj.delete(v);
    this._adjRev.delete(v);
    this._reindexar();
  }

  /** Insere uma rua. Mão única -> 1 arco; mão dupla -> 2 arcos. É o que faz do modelo um DÍGRAFO. */
  adicionarVia({ origem, destino, nome = "", distancia_m = null, classe = "LOCAL", mao_unica = false }) {
    const a = this.ponto(origem);
    const b = this.ponto(destino);
    if (origem === destino) throw new Error("Não são permitidos laços.");
    const distancia = distancia_m ?? Math.max(50, Ponto.distancia(a, b));
    const idRua = this._proximaRua++;
    const sentidos = mao_unica ? [[origem, destino]] : [[origem, destino], [destino, origem]];
    return sentidos.map(([o, d]) =>
      this._inserirArco({ id_rua: idRua, nome: nome || `Rua ${origem}-${destino}`, origem: o, destino: d, distancia_m: distancia, classe, mao_unica })
    );
  }

  _inserirArco(dados) {
    // Contador próprio: usar o tamanho da lista repetiria ids depois de uma remoção.
    const arco = { ...dados, id_arco: this._proximoArco++ };
    this._arcos.push(arco);
    this._adj.get(arco.origem).push(arco);
    this._adjRev.get(arco.destino).push(arco);
    return arco;
  }

  arcosDaRua(idRua) { return this._arcos.filter((a) => a.id_rua === idRua); }

  removerRua(idRua) {
    const antes = this._arcos.length;
    this._arcos = this._arcos.filter((a) => a.id_rua !== idRua);
    this._reindexar();
    return antes - this._arcos.length;
  }

  definirClasse(idRua, classe) {
    for (const a of this.arcosDaRua(idRua)) a.classe = classe;
  }

  renomearRua(idRua, nome) {
    for (const a of this.arcosDaRua(idRua)) a.nome = nome;
  }

  /** Mantém só um dos dois sentidos de uma rua de mão dupla. */
  tornarMaoUnica(idRua, inverter = false) {
    const arcos = this.arcosDaRua(idRua);
    if (arcos.length !== 2) return false;
    const [ida, volta] = inverter ? [arcos[1], arcos[0]] : arcos;
    ida.mao_unica = true;
    this._arcos = this._arcos.filter((a) => a !== volta);
    this._reindexar();
    return true;
  }

  /** Transforma uma rua de mão única em mão dupla (usado no reparo de conexidade). */
  converterParaMaoDupla(idRua) {
    const arcos = this.arcosDaRua(idRua);
    if (arcos.length !== 1) return false;
    const base = arcos[0];
    base.mao_unica = false;
    this._inserirArco({ ...base, origem: base.destino, destino: base.origem, mao_unica: false });
    return true;
  }

  _reindexar() {
    for (const v of this._pontos.keys()) {
      this._adj.set(v, []);
      this._adjRev.set(v, []);
    }
    for (const a of this._arcos) {
      this._adj.get(a.origem).push(a);
      this._adjRev.get(a.destino).push(a);
    }
  }

  /* ---------------- vizinhança ---------------- */
  sucessores(v) { return this._adj.get(v) || []; }
  predecessores(v) { return this._adjRev.get(v) || []; }

  /** Vizinhança no GRAFO SUBJACENTE (sentidos ignorados), uma entrada por rua. */
  vizinhosNaoDirigido(v) {
    const vistos = new Set();
    const saida = [];
    for (const arco of [...this.sucessores(v), ...this.predecessores(v)]) {
      if (vistos.has(arco.id_rua)) continue;
      vistos.add(arco.id_rua);
      saida.push(arco);
    }
    return saida;
  }

  /** Vértices ligados a v por alguma rua, em qualquer sentido. */
  vizinhos(v) {
    return this.vizinhosNaoDirigido(v).map((a) => (a.origem === v ? a.destino : a.origem));
  }

  /** Quantas RUAS chegam ao lugar (grau no grafo subjacente). Limite: 6. */
  qtdRuas(v) { return this.vizinhosNaoDirigido(v).length; }

  grauSaida(v) { return this.sucessores(v).length; }
  grauEntrada(v) { return this.predecessores(v).length; }
  grau(v) { return this.grauSaida(v) + this.grauEntrada(v); }
  arco(u, v) { return this.sucessores(u).find((a) => a.destino === v) || null; }

  /** Um representante por rua física. */
  ruas() {
    const vistos = new Set();
    return this._arcos.filter((a) => (vistos.has(a.id_rua) ? false : vistos.add(a.id_rua)));
  }

  pontosPorTipo(...tipos) {
    return this.pontos.filter((p) => tipos.includes(p.tipo));
  }

  /* ---------------- as outras três representações ---------------- */
  /** MATRIZ DE ADJACÊNCIA |V|×|V|. Assimétrica quando há mão única. */
  matrizAdjacencia() {
    const ids = this.vertices;
    const idx = new Map(ids.map((v, i) => [v, i]));
    const m = ids.map(() => ids.map(() => 0));
    for (const a of this._arcos) m[idx.get(a.origem)][idx.get(a.destino)] = 1;
    return { ids, matriz: m };
  }

  /** MATRIZ DE INCIDÊNCIA |V|×|A|: −1 na cauda (origem), +1 na cabeça (destino). */
  matrizIncidencia() {
    const ids = this.vertices;
    const idx = new Map(ids.map((v, i) => [v, i]));
    const m = ids.map(() => this._arcos.map(() => 0));
    this._arcos.forEach((a, k) => {
      m[idx.get(a.origem)][k] = -1;
      m[idx.get(a.destino)][k] = 1;
    });
    return { ids, arcos: this.arcos, matriz: m };
  }

  /** CONJUNTOS: G = (V, A), com A como pares ordenados. */
  conjuntos() {
    return {
      V: new Set(this.vertices),
      A: new Set(this._arcos.map((a) => `${a.origem},${a.destino}`)),
    };
  }

  /* ---------------- transformações ---------------- */
  /** GRAFO TRANSPOSTO: todos os arcos invertidos (Kosaraju e "quem chega aqui?"). */
  reverso() {
    const g = new Cidade(`${this.nome} (reverso)`);
    g._pontos = this._pontos;
    g._proximoId = this._proximoId;
    for (const v of this._pontos.keys()) {
      g._adj.set(v, []);
      g._adjRev.set(v, []);
    }
    for (const a of this._arcos) {
      const inv = { ...a, origem: a.destino, destino: a.origem };
      g._arcos.push(inv);
      g._adj.get(inv.origem).push(inv);
      g._adjRev.get(inv.destino).push(inv);
    }
    return g;
  }

  clonar() {
    const g = new Cidade(this.nome);
    g.seed = this.seed;
    g._proximoId = this._proximoId;
    g._proximaRua = this._proximaRua;
    g._proximoArco = this._proximoArco;
    for (const [v, p] of this._pontos) g._pontos.set(v, { ...p });
    g._arcos = this._arcos.map((a) => ({ ...a }));
    g._reindexar();
    return g;
  }
}
