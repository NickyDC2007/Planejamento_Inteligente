/*
 * CAMADA DE SERVIÇO — roda tudo no navegador
 * ------------------------------------------
 * Liga a interface aos algoritmos. Cada ação chama as funções de grafo e devolve
 * um objeto simples, pronto para a tela desenhar. A cidade vive na memória da
 * própria página.
 */
const Servico = (() => {
  let cidade = null;

  const arred = (n, casas = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** casas) / 10 ** casas : null);

  /** Troca Infinity/NaN por null — a tela trata null como "inalcançável". */
  function limpo(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (Array.isArray(valor)) return valor.map(limpo);
    if (valor && typeof valor === "object" && !(valor instanceof Cidade)) {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpo(v)]));
    }
    return valor;
  }

  function atual() {
    if (!cidade) cidade = gerarCidade({ n_pontos: 45, seed: 2026 });
    return cidade;
  }

  function estadoDe(c) {
    const pontos = c.pontos.map((p) => ({
      id: p.id, nome: p.nome, tipo: p.tipo, tipo_rotulo: TIPOS[p.tipo].rotulo, grupo: TIPOS[p.tipo].grupo,
      cor: TIPOS[p.tipo].cor, importancia: p.importancia, nocivo: Ponto.presidio(p), x: p.x, y: p.y,
      ruas: c.qtdRuas(p.id), grau: c.grau(p.id), grau_entrada: c.grauEntrada(p.id), grau_saida: c.grauSaida(p.id),
    }));
    const ruas = c.ruas().map((v) => ({
      id_rua: v.id_rua, nome: v.nome, origem: v.origem, destino: v.destino, mao_unica: v.mao_unica,
      classe: v.classe, distancia_m: arred(v.distancia_m, 1),
    }));
    const xs = pontos.map((p) => p.x);
    const ys = pontos.map((p) => p.y);
    return {
      nome: c.nome, seed: c.seed, pontos, ruas,
      limites: { x_min: Math.min(...xs), x_max: Math.max(...xs), y_min: Math.min(...ys), y_max: Math.max(...ys) },
      resumo: {
        vertices: c.ordem, arcos: c.tamanho, ruas: c.totalRuas,
        mao_unica: ruas.filter((r) => r.mao_unica).length,
      },
    };
  }

  const viaJson = (c, v) => v && ({
    nome: v.nome, origem: v.origem, destino: v.destino, classe: v.classe,
    destino_nome: c.ponto(v.destino).nome, distancia_m: Math.round(v.distancia_m), mao_unica: v.mao_unica,
  });

  const exigirTamanho = () => {
    if (atual().ordem > 220) throw new Error("Floyd-Warshall é O(|V|³): use no máximo 220 lugares.");
  };

  function avaliacaoJson(c) {
    const a = avaliar(c);
    a.criterios.forEach((e) => (e.nota = arred(e.nota, 1)));
    return a;
  }

  const acoes = {
    tipos: () => ({
      tipos: Object.entries(TIPOS).map(([nome, t]) => ({ nome, rotulo: t.rotulo, grupo: t.grupo, cor: t.cor })),
    }),

    estado: () => estadoDe(atual()),

    gerar: (corpo) => {
      cidade = gerarCidade({
        n_pontos: Math.max(3, Math.min(220, corpo.n_pontos ?? 45)),
        seed: corpo.seed ?? 2026,
        afastamento: Math.max(0.5, Math.min(3, corpo.afastamento ?? 1)),
        densidade_extra: corpo.densidade_extra ?? 0.8,
        prob_mao_unica: corpo.prob_mao_unica ?? 0.3,
        reparar: corpo.reparar ?? true,
        n_presidios: Math.max(0, Math.min(6, corpo.n_presidios ?? 1)),
        aderencia: Math.max(0, Math.min(1, corpo.aderencia ?? 0.7)),
      });
      return estadoDe(cidade);
    },

    exemplo: () => {
      cidade = cidadeExemplo();
      return estadoDe(cidade);
    },

    rota: ({ origem, destino, algoritmo = "dijkstra" }) => {
      const c = atual();
      if (algoritmo === "floyd") {
        exigirTamanho();
        const fw = floydWarshall(c);
        const caminho = caminhoFloyd(fw, origem, destino);
        return {
          algoritmo: "Floyd-Warshall",
          explicacao: `${(fw.ids.length ** 2).toLocaleString("pt-BR")} pares de lugares calculados de uma só vez`,
          caminho, ruas: caminho.length ? caminho.length - 1 : null,
          distancia_km: arred(fw.dist[fw.idx.get(origem)][fw.idx.get(destino)] / 1000),
          vias: caminho.slice(1).map((v, i) => viaJson(c, c.arco(caminho[i], v))),
        };
      }
      const r = dijkstra(c, origem);
      const caminho = r.caminho(destino);
      return {
        algoritmo: "Dijkstra",
        explicacao: `${r.relaxamentos} relaxamentos a partir da origem`,
        caminho, ruas: caminho.length ? caminho.length - 1 : null, distancia_km: arred(r.custo(destino) / 1000),
        vias: r.viasDoCaminho(destino).map((v) => viaJson(c, v)),
      };
    },

    avaliacao: () => {
      exigirTamanho();
      return avaliacaoJson(atual());
    },

    /* Reposiciona os lugares para a melhor nota e devolve o antes e o depois. */
    melhorar: () => {
      exigirTamanho();
      const r = melhorarCidade(atual());
      const avAntes = avaliacaoJson(r.antes);
      const avDepois = avaliacaoJson(r.depois);
      cidade = r.depois;
      return {
        antes: estadoDe(r.antes), depois: estadoDe(r.depois),
        nota_antes: avAntes, nota_depois: avDepois,
        movimentos: r.movimentos.map((m) => ({
          ...m, km: arred(m.km), rotulo: TIPOS[m.tipo].rotulo, cor: TIPOS[m.tipo].cor,
          de_xy: { x: r.antes.ponto(m.de).x, y: r.antes.ponto(m.de).y },
          para_xy: { x: r.depois.ponto(m.para).x, y: r.depois.ponto(m.para).y },
          ocupava_destino: r.antes.ponto(m.para).nome,
        })),
        ruas_corrigidas: r.ruasCorrigidas.map((id) => r.depois.arcosDaRua(id)[0].nome),
        origem: r.origem, avaliacoes: r.avaliacoes, trocas: r.trocas, tempo_ms: r.tempoMs,
      };
    },

    /* Matrizes de adjacência e incidência, montadas a partir da lista de adjacência. */
    estruturas: () => {
      const c = atual();
      const { ids, matriz } = c.matrizAdjacencia();
      const incidencia = c.matrizIncidencia();
      const idx = new Map(ids.map((v, i) => [v, i]));
      const distancias = ids.map(() => ids.map(() => 0));
      const arcos = incidencia.arcos.map((a) => {
        const origem = idx.get(a.origem);
        const destino = idx.get(a.destino);
        distancias[origem][destino] = arred(a.distancia_m / 1000);
        return { origem, destino, rua: a.nome, km: arred(a.distancia_m / 1000) };
      });
      return {
        ids,
        nomes: ids.map((v) => c.ponto(v).nome),
        cores: ids.map((v) => TIPOS[c.ponto(v).tipo].cor),
        adjacencia: matriz, distancias, incidencia: incidencia.matriz, arcos,
        simetrica: matriz.every((linha, i) => linha.every((x, j) => x === matriz[j][i])),
      };
    },
  };

  return {
    chamar(nome, corpo = {}) {
      const acao = acoes[nome];
      if (!acao) throw new Error(`Ação desconhecida: ${nome}`);
      return limpo(acao(corpo));
    },
  };
})();
