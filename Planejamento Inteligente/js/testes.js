/*
 * TESTES DE CORREÇÃO — rodam no navegador (abra testes.html)
 * ---------------------------------------------------------
 * Cada algoritmo é confrontado com uma verificação INDEPENDENTE:
 *   Dijkstra × Floyd-Warshall × força bruta       coincidem nas menores distâncias
 *   BFS × Dijkstra com todas as ruas valendo 1
 *   Kosaraju × alcançabilidade mútua par a par
 * E as regras do projeto: malha sem ruas se cruzando fora das esquinas, no máximo
 * 6 ruas por esquina, nome de bairro só em moradia, CESUPA, nota rápida igual à detalhada, e o botão "Melhorar"
 * nunca piorar a cidade nem sumir com lugares.
 */
const resultados = [];

function checar(ok, titulo, detalhe = "") {
  resultados.push({ ok: Boolean(ok), titulo, detalhe });
}

const quase = (a, b, tol = 1e-6) => (a === Infinity && b === Infinity) || Math.abs(a - b) < tol;

function fechoIngenuo(cidade, origem) {
  const alcancados = new Set([origem]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const a of cidade.arcos) {
      if (alcancados.has(a.origem) && !alcancados.has(a.destino)) {
        alcancados.add(a.destino);
        mudou = true;
      }
    }
  }
  return alcancados;
}

const comoConjunto = (componentes) => new Set(componentes.map((c) => [...c].sort((a, b) => a - b).join(",")));
const mesmosConjuntos = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

/** Dois trechos de rua se cruzam fora de uma esquina? */
function cruzamSemEsquina(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (o(c, d, a) > 0) !== (o(c, d, b) > 0) && (o(a, b, c) > 0) !== (o(a, b, d) > 0);
}

/* ---------------- por cenário ---------------- */
function testarCenario(nome, cidade) {
  const p = `[${nome}]`;

  // Malha
  checar(cidade.vertices.every((v) => cidade.qtdRuas(v) <= MAX_RUAS_POR_NO), `${p} nenhuma esquina tem mais de 6 ruas`);
  const ruas = cidade.ruas().filter((r) => r.classe !== "RAPIDA");
  let cruzamentos = 0;
  for (let i = 0; i < ruas.length; i++) {
    for (let j = i + 1; j < ruas.length; j++) {
      const [a, b, c, d] = [ruas[i].origem, ruas[i].destino, ruas[j].origem, ruas[j].destino];
      if (new Set([a, b, c, d]).size < 4) continue;
      if (cruzamSemEsquina(cidade.ponto(a), cidade.ponto(b), cidade.ponto(c), cidade.ponto(d))) cruzamentos++;
    }
  }
  checar(cruzamentos === 0, `${p} nenhuma rua cruza outra fora de uma esquina`, `${cruzamentos} cruzamentos`);

  // Estruturas
  const { matriz: inc } = cidade.matrizIncidencia();
  checar(
    cidade.arcos.every((_, k) => {
      const col = inc.map((linha) => linha[k]).filter((x) => x !== 0).sort();
      return col.length === 2 && col[0] === -1 && col[1] === 1;
    }),
    `${p} toda coluna da matriz de incidência tem um −1 e um +1`
  );
  const { ids, matriz: adj } = cidade.matrizAdjacencia();
  checar(
    ids.every((v, i) => adj[i].reduce((s, x) => s + x, 0) === cidade.grauSaida(v) && adj.reduce((s, linha) => s + linha[i], 0) === cidade.grauEntrada(v)),
    `${p} matriz de adjacência: soma da linha = grau de saída, da coluna = grau de entrada`
  );
  const entrada = cidade.vertices.reduce((s, v) => s + cidade.grauEntrada(v), 0);
  const saida = cidade.vertices.reduce((s, v) => s + cidade.grauSaida(v), 0);
  checar(entrada === saida && saida === cidade.tamanho, `${p} soma dos graus de entrada = de saída = |A|`);

  // BFS e DFS
  const origem = cidade.vertices[0];
  const b = bfs(cidade, origem);
  const unit = dijkstra(cidade, origem, () => 1);
  checar(cidade.vertices.every((v) => quase(b.nivel.has(v) ? b.nivel.get(v) : Infinity, unit.custo(v))),
    `${p} BFS = Dijkstra com todas as ruas valendo 1`);
  const fecho = fechoIngenuo(cidade, origem);
  checar(b.alcancados.size === fecho.size && [...fecho].every((v) => b.alcancados.has(v)),
    `${p} alcançáveis do BFS = fecho transitivo ingênuo`);
  const d = dfs(cidade);
  checar(d.ordem.length === cidade.ordem && d.classificacao.size === cidade.tamanho,
    `${p} DFS visita todos os vértices e classifica todos os arcos`);

  // Caminhos mínimos: Dijkstra × Floyd-Warshall em todos os pares
  const fw = floydWarshall(cidade);
  let divergFW = 0;
  let caminhosRuins = 0;
  for (const o of cidade.vertices) {
    const dj = dijkstra(cidade, o);
    for (const v of cidade.vertices) {
      if (!quase(dj.custo(v), fw.dist[fw.idx.get(o)][fw.idx.get(v)])) divergFW++;
      const cam = caminhoFloyd(fw, o, v);
      if (cam.length > 1) {
        const soma = cam.slice(1).reduce((s, w, i) => s + cidade.arco(cam[i], w).distancia_m, 0);
        if (!quase(soma, dj.custo(v))) caminhosRuins++;
      }
      if (dj.alcancavel(v) && !quase(dj.viasDoCaminho(v).reduce((s, a) => s + a.distancia_m, 0), dj.custo(v))) caminhosRuins++;
    }
  }
  checar(divergFW === 0, `${p} Dijkstra = Floyd-Warshall em todos os pares`, `${divergFW} divergências`);
  checar(caminhosRuins === 0, `${p} os caminhos reconstruídos pelos dois somam a distância mínima`, `${caminhosRuins} caminhos`);

  // Conexidade
  const fechos = new Map(cidade.vertices.map((v) => [v, fechoIngenuo(cidade, v)]));
  const bruta = [];
  const restantes = new Set(cidade.vertices);
  while (restantes.size) {
    const v = Math.min(...restantes);
    const comp = [...restantes].filter((u) => fechos.get(v).has(u) && fechos.get(u).has(v));
    bruta.push(comp);
    comp.forEach((u) => restantes.delete(u));
  }
  checar(mesmosConjuntos(comoConjunto(componentesFortementeConexas(cidade)), comoConjunto(bruta)),
    `${p} Kosaraju = alcançabilidade mútua par a par`);

  // A nota rápida (usada pelo otimizador) tem de ser idêntica à detalhada.
  const ctx = contextoRede(cidade);
  const tipos = ctx.ids.map((v) => cidade.ponto(v).tipo);
  checar(quase(calcularNota(ctx, tipos).exata, calcularNota(ctx, tipos, true).exata), `${p} nota rápida = nota detalhada`);
}

/* ---------------- regras e otimizador ---------------- */
function rodarTestes() {
  const cenarios = [
    ["Centro de Belém", cidadeExemplo()],
    ["seed 1, 20 lugares, sem reparo", gerarCidade({ n_pontos: 20, seed: 1, reparar: false })],
    ["seed 7, 30 lugares", gerarCidade({ n_pontos: 30, seed: 7 })],
    ["seed 13, 70% mão única", gerarCidade({ n_pontos: 25, seed: 13, prob_mao_unica: 0.7, reparar: false })],
    ["seed 5, malha esparsa", gerarCidade({ n_pontos: 18, seed: 5, densidade_extra: 0, prob_mao_unica: 0 })],
  ];
  for (const [nome, cidade] of cenarios) testarCenario(nome, cidade);

  // Força bruta: percorre TODOS os caminhos simples — não depende de nenhum dos dois algoritmos.
  const menoresPorForcaBruta = (cidade, origem) => {
    const melhor = new Map(cidade.vertices.map((v) => [v, Infinity]));
    const naPilha = new Set([origem]);
    const explorar = (u, soma) => {
      if (soma < melhor.get(u)) melhor.set(u, soma);
      for (const arco of cidade.sucessores(u)) {
        if (naPilha.has(arco.destino)) continue;
        naPilha.add(arco.destino);
        explorar(arco.destino, soma + arco.distancia_m);
        naPilha.delete(arco.destino);
      }
    };
    explorar(origem, 0);
    return melhor;
  };
  for (const [nome, cidade] of [["Centro de Belém", cidadeExemplo()], ["seed 4, 10 lugares", gerarCidade({ n_pontos: 10, seed: 4 })]]) {
    const fw = floydWarshall(cidade);
    let divergencias = 0;
    for (const o of cidade.vertices) {
      const bruta = menoresPorForcaBruta(cidade, o);
      const dj = dijkstra(cidade, o);
      for (const v of cidade.vertices) {
        if (!quase(bruta.get(v), dj.custo(v)) || !quase(bruta.get(v), fw.dist[fw.idx.get(o)][fw.idx.get(v)])) divergencias++;
      }
    }
    checar(divergencias === 0, `[força bruta: ${nome}] Dijkstra e Floyd-Warshall = menor de todos os caminhos simples`, `${divergencias} divergências`);
  }

  // Malha urbana realista
  const grande = gerarCidade({ n_pontos: 60, seed: 3 });
  const nomesPorRua = new Map();
  grande.ruas().forEach((r) => nomesPorRua.set(r.nome, (nomesPorRua.get(r.nome) || 0) + 1));
  checar([...nomesPorRua.values()].some((qtd) => qtd >= 3), "[malha] uma mesma rua atravessa vários quarteirões com o mesmo nome");
  checar(grande.ruas().some((r) => r.nome.startsWith("Travessa")) && grande.ruas().some((r) => r.nome.startsWith("Avenida")),
    "[malha] há avenidas e travessas");
  checar(grande.ruas().every((r) => !r.mao_unica || r.classe === "COLETORA" || r.classe === "LOCAL"), "[malha] mão única só em travessas e ruas");

  // Regras do projeto
  checar(grande.pontosPorTipo("EDUCACAO").some((pt) => pt.nome === "CESUPA"), "[regra] toda cidade com ensino tem o CESUPA");
  checar([1, 2, 3, 4, 5].every((seed) => gerarCidade({ n_pontos: 20, seed }).pontosPorTipo("EDUCACAO").some((pt) => pt.nome === "CESUPA")),
    "[regra] o CESUPA aparece em cidades pequenas também");
  checar(Object.keys(TIPOS).length === 12 && Object.keys(TIPOS).every((t) => grande.pontosPorTipo(t).length > 0),
    "[regra] a cidade de 60 lugares tem os 12 tipos de lugar");
  // Nomes: bairro só em zona residencial, para ninguém procurar a farmácia "do Marco" no Marco.
  const semBairro = (cid) =>
    cid.pontos
      .filter((pt) => pt.tipo !== "RESIDENCIAL")
      .every((pt) => !pt.nome.includes("Bairro") && !NOMES.RESIDENCIAL.some((bairro) => pt.nome.includes(bairro)));
  checar(semBairro(grande) && semBairro(cidadeExemplo()) && semBairro(melhorarCidade(grande, { limiteMs: 800 }).depois),
    "[nomes] só zona residencial tem nome de bairro, também depois de Melhorar");
  checar(Object.keys(NOMES).filter((t) => t !== "RESIDENCIAL").every((t) => NOMES[t].every((nome) => !NOMES.RESIDENCIAL.some((bairro) => nome.includes(bairro)))),
    "[nomes] nenhuma lista de lugar cita um bairro");
  checar(grande.pontosPorTipo("RESIDENCIAL").every((pt) => pt.nome.startsWith("Bairro ")), "[nomes] toda zona residencial se chama Bairro …");
  checar(Object.keys(NOMES).every((t) => new Set(Array.from({ length: 40 }, (_, k) => nomePara(t, k))).size === 40),
    "[nomes] nenhum nome se repete, mesmo quando a lista acaba");
  checar(nomePara("ONIBUS", NOMES.ONIBUS.length) === "Estação BRT 8", "[nomes] a numeração continua depois da lista", nomePara("ONIBUS", NOMES.ONIBUS.length));
  const presidio = grande.pontosPorTipo("PRESIDIO")[0];
  checar(presidio && grande.qtdRuas(presidio.id) === 1, "[regra] o presídio tem uma única via de acesso");

  // Regras de cada eixo em cenários mínimos feitos à mão.
  const eixo = (cidade, chave) => avaliar(cidade).criterios.find((e) => e.chave === chave);
  const colada = new Cidade("serviço colado");
  const casa = colada.adicionarPonto({ nome: "Casa", tipo: "RESIDENCIAL", x: 0, y: 0 });
  SERVICOS_ESSENCIAIS.forEach((t, k) => {
    const s = colada.adicionarPonto({ nome: t, tipo: t, x: 1 + k, y: 1 });
    colada.adicionarVia({ origem: casa, destino: s, distancia_m: 1000 });
  });
  checar(quase(eixo(colada, "servicos").nota, 50), "[eixo 1] todos os serviços colados valem metade", `${eixo(colada, "servicos").nota}`);

  const misto = new Cidade("uso misto");
  const m1 = misto.adicionarPonto({ nome: "Loja", tipo: "LOJA", x: 0, y: 0 });
  const m2 = misto.adicionarPonto({ nome: "Shopping", tipo: "SHOPPING", x: 1, y: 0 });
  const m3 = misto.adicionarPonto({ nome: "Casa", tipo: "RESIDENCIAL", x: 2, y: 0 });
  misto.adicionarVia({ origem: m1, destino: m2, distancia_m: 1000 });
  misto.adicionarVia({ origem: m2, destino: m3, distancia_m: 1000 });
  checar(quase(eixo(misto, "economia").nota, 25), "[eixo 2] metade do comércio encostado em moradia: (1 − 0,5)² = 25", `${eixo(misto, "economia").nota}`);

  // O botão Melhorar
  for (const aderencia of [0, 0.6]) {
    const cidade = gerarCidade({ n_pontos: 35, seed: 11, aderencia });
    const antes = avaliar(cidade).nota;
    const inventario = (cid) => cid.pontos.map((pt) => `${pt.tipo}:${pt.nome}`).sort().join("|");
    const r = melhorarCidade(cidade, { limiteMs: 1500 });
    const depois = avaliar(r.depois).nota;
    checar(depois >= antes, `[melhorar ${aderencia * 100}%] a nota nunca piora`, `${antes} → ${depois}`);
    checar(inventario(r.depois) === inventario(cidade), `[melhorar ${aderencia * 100}%] nenhum lugar some ou é criado`);
    checar(avaliar(cidade).nota === antes, `[melhorar ${aderencia * 100}%] a cidade original não é alterada`);
    checar(r.depois.pontosPorTipo("PRESIDIO").every((pt) => cidade.ponto(pt.id).tipo === "PRESIDIO"), `[melhorar ${aderencia * 100}%] presídios ficam onde estão`);
  }

  const notaMedia = (aderencia) => [1, 2, 3, 4].reduce((s, seed) => s + avaliar(gerarCidade({ n_pontos: 45, seed, aderencia })).nota, 0) / 4;
  const planejada = notaMedia(1);
  const caotica = notaMedia(0);
  checar(planejada > caotica, "[nota] cidade planejada > cidade ao acaso", `${planejada.toFixed(1)} > ${caotica.toFixed(1)}`);
  checar(gerarCidade({ seed: 42 }).pontos.map((pt) => pt.nome).join() === gerarCidade({ seed: 42 }).pontos.map((pt) => pt.nome).join(),
    "[regra] a mesma semente gera a mesma cidade");
  return resultados;
}
