/*
 * CONEXIDADE
 * ----------
 * Num DÍGRAFO há duas conexidades, e a diferença entre elas é o efeito das ruas
 * de mão única:
 *   FRACA — ignorando os sentidos, está tudo ligado ("no mapa, tudo liga").
 *   FORTE — respeitando as mãos, chega-se a qualquer lugar E se volta.
 */

function ordenarComponentes(lista) {
  return lista.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/** Componentes do grafo subjacente (conexidade fraca), por BFS. */
function componentesConexas(cidade) {
  const visitado = new Set();
  const componentes = [];
  for (const inicio of cidade.vertices) {
    if (visitado.has(inicio)) continue;
    const comp = [...bfs(cidade, inicio, false).alcancados];
    comp.forEach((v) => visitado.add(v));
    componentes.push(comp.sort((a, b) => a - b));
  }
  return ordenarComponentes(componentes);
}

/**
 * KOSARAJU — componentes fortemente conexas em O(|V| + |A|).
 *
 * 1ª DFS em G anota a ORDEM DE FINALIZAÇÃO. Inverte-se o grafo (Gᵀ) e roda-se a
 * 2ª busca em ordem DECRESCENTE de finalização: cada árvore é uma componente
 * fortemente conexa. O último a finalizar está numa componente "fonte"; em Gᵀ
 * ela vira "sorvedouro" e prende a busca dentro de si.
 */
function componentesFortementeConexas(cidade) {
  const ordem = [...dfs(cidade).ordemFinalizacao].reverse();
  const transposto = cidade.reverso();
  const visitado = new Set();
  const componentes = [];
  for (const raiz of ordem) {
    if (visitado.has(raiz)) continue;
    const comp = [];
    const pilha = [raiz];
    visitado.add(raiz);
    while (pilha.length) {
      const u = pilha.pop();
      comp.push(u);
      for (const arco of transposto.sucessores(u)) {
        if (!visitado.has(arco.destino)) {
          visitado.add(arco.destino);
          pilha.push(arco.destino);
        }
      }
    }
    componentes.push(comp.sort((a, b) => a - b));
  }
  return ordenarComponentes(componentes);
}

/**
 * Desfaz mãos únicas que ligam componentes fortemente conexas diferentes até
 * sobrar uma só — a cidade passa a ter ida e volta entre quaisquer dois lugares.
 * Devolve os ids das ruas alteradas.
 */
function repararConexidadeForte(cidade, limite = 500) {
  const alteradas = [];
  for (let i = 0; i < limite; i++) {
    const comps = componentesFortementeConexas(cidade);
    if (comps.length <= 1) break;
    const compDe = new Map();
    comps.forEach((c, k) => c.forEach((v) => compDe.set(v, k)));
    const candidata = cidade.arcos.find((a) => a.mao_unica && compDe.get(a.origem) !== compDe.get(a.destino));
    if (!candidata) break;
    if (cidade.converterParaMaoDupla(candidata.id_rua)) alteradas.push(candidata.id_rua);
  }
  return alteradas;
}
