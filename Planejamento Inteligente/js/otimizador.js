/*
 * MELHORAR A CIDADE — BUSCA LOCAL (SUBIDA DE ENCOSTA)
 * ---------------------------------------------------
 * As ruas e a lista de lugares continuam as mesmas; o que muda é ONDE cada
 * lugar fica.
 *
 *   1. Se há trechos sem retorno, as mãos únicas culpadas viram mão dupla
 *      (componentes fortemente conexas de Kosaraju).
 *   2. As distâncias entre todos os pares são calculadas uma vez
 *      (Floyd-Warshall); a nota de cada tentativa vira consulta a tabela.
 *   3. Duas partidas: a cidade como está e o plano ideal do gerador.
 *   4. Em cada partida, testa trocar dois lugares de vértice. Se a nota sobe, a
 *      troca fica; se não, desfaz. Repete até nenhuma troca melhorar — um ótimo
 *      local — ou acabar o tempo.
 *   5. Fica com a melhor partida; se as duas empatam (até 2 pontos), com a que
 *      mexe em menos lugares.
 *
 * Presídios não saem do lugar: o sítio deles já foi escolhido fora da cidade.
 */
function melhorarCidade(cidade, { limiteMs = 2500, maxAvaliacoes = Infinity, corrigirRuas = true, usarPlano = true } = {}) {
  const t0 = performance.now();
  const antes = cidade.clonar();
  const depois = cidade.clonar();
  const ruasCorrigidas = corrigirRuas ? repararConexidadeForte(depois) : [];
  const ctx = contextoRede(depois);
  const n = ctx.n;

  const lugares = ctx.ids.map((v) => ({ nome: depois.ponto(v).nome, tipo: depois.ponto(v).tipo }));
  const moveis = [...Array(n).keys()].filter((i) => lugares[i].tipo !== "PRESIDIO");
  let avaliacoes = 0;
  const notaDe = (ocupante) => {
    avaliacoes++;
    return calcularNota(ctx, ocupante.map((k) => lugares[k].tipo)).exata;
  };

  // Limitar por número de tentativas (e não só por tempo) deixa o resultado
  // igual em qualquer computador — é o que o gerador usa para ser reprodutível.
  const podeSeguir = (prazo) => avaliacoes < maxAvaliacoes && performance.now() < prazo;

  const subirEncosta = (inicial, prazo) => {
    const ocupante = [...inicial];
    let atual = notaDe(ocupante);
    let trocas = 0;
    for (let melhorou = true; melhorou && podeSeguir(prazo); ) {
      melhorou = false;
      for (let a = 0; a < moveis.length && podeSeguir(prazo); a++) {
        for (let b = a + 1; b < moveis.length && avaliacoes < maxAvaliacoes; b++) {
          const i = moveis[a];
          const j = moveis[b];
          if (lugares[ocupante[i]].tipo === lugares[ocupante[j]].tipo) continue;
          [ocupante[i], ocupante[j]] = [ocupante[j], ocupante[i]];
          const nova = notaDe(ocupante);
          if (nova > atual + 1e-9) {
            atual = nova;
            trocas++;
            melhorou = true;
          } else {
            [ocupante[i], ocupante[j]] = [ocupante[j], ocupante[i]];
          }
        }
      }
    }
    return { ocupante, nota: atual, trocas };
  };

  // Partida A: a cidade como está.
  const identidade = [...Array(n).keys()];
  const prazoA = t0 + limiteMs / 2;
  const partidaA = subirEncosta(identidade, prazoA);

  // Partida B: o plano do gerador com o mesmo inventário de lugares.
  const contagem = Object.fromEntries(Object.keys(TIPOS).map((t) => [t, 0]));
  lugares.forEach((l) => contagem[l.tipo]++);
  const plano = distribuirUsoDoSolo(ctx.pos, ctx.vizinhos.map((l) => new Set(l)), contagem, criarRng(depois.seed + 1));
  for (const p of ctx.presidios) {
    if (plano[p] === "PRESIDIO") continue;
    const q = plano.findIndex((t, k) => t === "PRESIDIO" && !ctx.presidios.has(k));
    if (q >= 0) [plano[p], plano[q]] = [plano[q], plano[p]];
  }
  const ocupantePlano = new Array(n).fill(-1);
  const sobra = {};
  identidade.forEach((k) => (lugares[k].tipo === plano[k] ? (ocupantePlano[k] = k) : (sobra[lugares[k].tipo] = [...(sobra[lugares[k].tipo] || []), k])));
  for (let i = 0; i < n; i++) {
    if (ocupantePlano[i] >= 0) continue;
    const fila = sobra[plano[i]] || [];
    if (!fila.length) continue;
    // Entre os lugares daquele tipo que precisam mudar, leva o mais próximo.
    const perto = fila.reduce((m, k) =>
      Math.hypot(ctx.pos[k][0] - ctx.pos[i][0], ctx.pos[k][1] - ctx.pos[i][1]) < Math.hypot(ctx.pos[m][0] - ctx.pos[i][0], ctx.pos[m][1] - ctx.pos[i][1]) ? k : m
    );
    ocupantePlano[i] = perto;
    fila.splice(fila.indexOf(perto), 1);
  }
  const partidaB = usarPlano && ocupantePlano.every((k) => k >= 0) ? subirEncosta(ocupantePlano, t0 + limiteMs) : null;

  const movidos = (oc) => oc.filter((k, i) => k !== i).length;
  let escolhida = partidaA;
  let origem = "cidade atual";
  if (partidaB && (partidaB.nota > partidaA.nota + 2 || (Math.abs(partidaB.nota - partidaA.nota) <= 2 && movidos(partidaB.ocupante) < movidos(partidaA.ocupante)))) {
    escolhida = partidaB;
    origem = "plano ideal";
  }

  escolhida.ocupante.forEach((k, i) => depois.definirLugar(ctx.ids[i], lugares[k]));
  const movimentos = escolhida.ocupante
    .map((k, i) => ({ k, i }))
    .filter(({ k, i }) => k !== i)
    .map(({ k, i }) => ({
      nome: lugares[k].nome, tipo: lugares[k].tipo, de: ctx.ids[k], para: ctx.ids[i],
      km: Math.hypot(ctx.pos[k][0] - ctx.pos[i][0], ctx.pos[k][1] - ctx.pos[i][1]),
    }))
    .sort((a, b) => b.km - a.km);

  return {
    antes, depois, movimentos, ruasCorrigidas, origem, avaliacoes,
    trocas: escolhida.trocas,
    tempoMs: Math.round(performance.now() - t0),
  };
}
