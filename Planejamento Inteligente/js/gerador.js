/*
 * GERADOR DE CIDADES — cenários com nomes reais de BELÉM DO PARÁ
 * --------------------------------------------------------------
 * A malha imita a de um bairro planejado de verdade, como o centro de Belém:
 *
 *   1. CRESCIMENTO   a cidade cresce a partir do centro sobre uma grade de
 *                    quarteirões, com borda irregular (nenhuma cidade é um
 *                    retângulo perfeito)
 *   2. GRADE         esquinas levemente giradas, com pequenas imperfeições e
 *                    ruas que curvam de leve; mais irregular na periferia
 *   3. RUAS          avenidas e ruas num sentido, travessas cruzando na
 *                    perpendicular e uma avenida diagonal cortando a malha;
 *                    cada linha da grade é UMA rua com UM nome
 *   4. QUARTEIRÕES   algumas ruas são retiradas (quarteirões maiores, ruas sem
 *                    saída) sem nunca desconectar a cidade
 *   5. SENTIDOS      mão única em linhas inteiras, alternando o sentido entre
 *                    linhas vizinhas — o "binário" das travessas de Belém
 *   6. USO DO SOLO   quem vai em cada esquina (usoDoSolo.js)
 *   7. PRESÍDIOS     no entorno, longe das moradias e perto de uma delegacia
 *
 * Nenhuma esquina recebe mais de 6 ruas: 4 da grade + 2 da diagonal.
 */

const NOMES_VIAS = {
  DIAGONAL: ["Avenida Almirante Barroso", "Avenida Pedro Miranda"],
  ARTERIAL: [
    "Avenida Presidente Vargas", "Avenida Governador José Malcher", "Avenida Conselheiro Furtado",
    "Avenida Magalhães Barata", "Avenida Visconde de Souza Franco", "Avenida Duque de Caxias",
    "Avenida Senador Lemos", "Avenida Alcindo Cacela", "Avenida José Bonifácio",
    "Avenida Doutor Freitas", "Avenida Marquês de Herval", "Avenida Brás de Aguiar",
    "Avenida Generalíssimo Deodoro", "Avenida Pedro Álvares Cabral", "Avenida Rômulo Maiorana",
    "Avenida Tamandaré", "Avenida Perimetral",
  ],
  COLETORA: [
    "Travessa Padre Eutíquio", "Travessa Rui Barbosa", "Travessa Quintino Bocaiúva",
    "Travessa Quatorze de Março", "Travessa Benjamin Constant", "Travessa Doutor Moraes",
    "Travessa Mariz e Barros", "Travessa Dom Romualdo de Seixas", "Travessa Humaitá",
    "Travessa Curuçá", "Travessa Serzedelo Corrêa", "Travessa Barão de Igarapé-Miri",
    "Travessa Angustura", "Travessa Djalma Dutra", "Travessa dos Tamoios", "Travessa Timbiras",
    "Travessa Lomas Valentinas", "Travessa Vileta", "Travessa Estrella",
  ],
  LOCAL: [
    "Rua dos Mundurucus", "Rua dos Pariquis", "Rua Boaventura da Silva", "Rua Antônio Barreto",
    "Rua Ó de Almeida", "Rua Municipalidade", "Rua Domingos Marreiros", "Rua Oliveira Belo",
    "Rua Aristides Lobo", "Rua Manoel Barata", "Rua Jerônimo Pimentel", "Rua Diogo Móia",
    "Rua Bernal do Couto", "Rua João Balbi", "Rua dos Caripunas", "Rua Conceição",
    "Rua dos Apinagés", "Rua Paes de Souza", "Rua Siqueira Mendes",
  ],
};

/*
 * NOMES DOS LUGARES — só a zona residencial leva nome de bairro. Os demais
 * lugares usam nomes que não citam bairro nem rua: eles mudam de esquina (o
 * "Melhorar cidade" leva o nome junto), e um "Colégio Nazaré" longe do Bairro
 * Nazaré confundiria. Cada nome começa pelo que o lugar é.
 */
const NOMES = {
  RESIDENCIAL: [
    "Nazaré", "Batista Campos", "Umarizal", "Marco", "Pedreira", "Guamá", "Jurunas",
    "Cremação", "Sacramenta", "Telégrafo", "Cidade Velha", "Campina", "Souza",
    "Curió-Utinga", "Tapanã", "Benguí", "Coqueiro", "Parque Verde", "Mangueirão",
    "Val-de-Cans", "Icoaraci", "Condor", "Terra Firme", "Canudos", "Fátima",
    "Maracangalha", "Barreiro",
  ],
  HOSPITAL: [
    "Hospital Ophir Loyola", "Hospital Santa Casa de Misericórdia",
    "Hospital Universitário João de Barros Barreto", "Hospital Metropolitano de Urgência e Emergência",
    "Hospital Pronto-Socorro Mário Pinotti", "Hospital Jean Bitar", "Hospital Abelardo Santos",
    "Hospital Beneficente Portuguesa", "Hospital Adventista de Belém", "Hospital Porto Dias",
    "Hospital Galileu", "Hospital das Clínicas (SP)", "Hospital Albert Einstein (SP)",
    "Hospital Copa D'Or (RJ)",
  ],
  BOMBEIROS: [
    "Bombeiros — Quartel do Comando Geral", "Bombeiros — 1º Grupamento", "Bombeiros — 2º Grupamento",
    "Bombeiros — 3º Grupamento", "Bombeiros — Grupamento de Busca e Salvamento",
    "Bombeiros — 4º Grupamento", "Bombeiros — 5º Grupamento",
  ],
  DELEGACIA: [
    "Delegacia — 1ª Seccional", "Delegacia — 2ª Seccional", "Delegacia da Mulher",
    "Delegacia de Homicídios", "Delegacia — 3ª Seccional", "Delegacia de Crimes Contra o Patrimônio",
    "Delegacia — Central de Flagrantes", "Delegacia — 4ª Seccional", "Delegacia — 5ª Seccional",
  ],
  FARMACIA: [
    "Farmácia Big Ben", "Farmácia Extrafarma", "Farmácia Pague Menos", "Farmácia Drogasil",
    "Farmácia Droga Raia", "Farmácia Popular", "Farmácia São Paulo (SP)", "Farmácia Pacheco (RJ)",
  ],
  // O primeiro lugar de ensino sorteado é SEMPRE o CESUPA.
  EDUCACAO: [
    "CESUPA", "Universidade Federal do Pará (UFPA)", "Colégio Gentil Bittencourt",
    "Universidade do Estado do Pará (UEPA)", "Escola Estadual Paes de Carvalho",
    "Universidade da Amazônia (UNAMA)", "Colégio Tenente Rêgo Barros", "Instituto Federal do Pará (IFPA)",
    "Escola Bosque Eidorfe Moreira", "Faculdade Estácio", "Colégio Marista",
    "Universidade Federal Rural da Amazônia (UFRA)", "Escola Estadual Augusto Meira", "Colégio Moderno",
    "Universidade de São Paulo (SP)", "Colégio Pedro II (RJ)",
  ],
  SHOPPING: [
    "Shopping Boulevard", "Parque Shopping Belém", "Shopping Pátio Belém", "Shopping Grão-Pará",
    "Shopping Castanheira", "Shopping Bosque Grão-Pará", "Shopping Metrópole",
    "Shopping Iguatemi (SP)", "Shopping Leblon (RJ)",
  ],
  LOJA: [
    "Mercado Ver-o-Peso", "Supermercado Líder", "Supermercado Formosa", "Feira do Açaí",
    "Loja Havan", "Loja Magazine Luiza", "Lojas Americanas", "Atacadão", "Assaí Atacadista",
    "Loja Casas Bahia", "Supermercado Pão de Açúcar (SP)", "Supermercado Guanabara (RJ)",
  ],
  INDUSTRIA: [
    "Porto da Companhia Docas do Pará", "Cervejaria Cerpa", "Polo Industrial", "Terminal Graneleiro",
    "Fábrica de Beneficiamento de Açaí", "Estaleiro Naval", "Fábrica de Castanha-do-Pará",
    "Indústria Têxtil",
  ],
  ONIBUS: [
    "Terminal Rodoviário Hildegardo Nunes", "Terminal de Integração Metropolitano",
    "Estação BRT 1", "Estação BRT 2", "Estação BRT 3", "Estação BRT 4", "Estação BRT 5",
    "Estação BRT 6", "Estação BRT 7",
  ],
  AEROPORTO: [
    "Aeroporto Internacional de Belém", "Aeroporto Brigadeiro Protásio de Oliveira",
    "Aeroporto de Congonhas (SP)", "Aeroporto Santos Dumont (RJ)",
  ],
  // O complexo penitenciário real fica em outros municípios, fora da capital.
  PRESIDIO: [
    "Centro de Recuperação Penitenciário do Pará II",
    "Penitenciária de Segurança Máxima de Marituba", "Colônia Penal Agrícola de Santa Izabel",
    "Centro de Triagem Metropolitano", "Presídio Estadual Metropolitano",
  ],
};

/** Nomes numerados: quando a lista acaba, a numeração continua (Estação BRT 8, 9, …). */
const SERIES = {
  ONIBUS: (k) => `Estação BRT ${k}`,
  DELEGACIA: (k) => `Delegacia — ${k}ª Seccional`,
  BOMBEIROS: (k) => `Bombeiros — ${k}º Grupamento`,
};

/** O índice é sequencial por tipo; como o CESUPA é o primeiro, ele sempre aparece. */
function nomePara(tipo, indice) {
  const lista = NOMES[tipo];
  const prefixo = tipo === "RESIDENCIAL" ? "Bairro " : "";
  if (indice < lista.length) return prefixo + lista[indice];
  const serie = SERIES[tipo];
  if (serie) {
    let ultimo = 0;
    while (lista.includes(serie(ultimo + 1))) ultimo++;
    return serie(ultimo + 1 + indice - lista.length);
  }
  return `${prefixo}${lista[indice % lista.length]} ${Math.floor(indice / lista.length) + 1}`;
}

const nomeDaLista = (lista, k) => (k < lista.length ? lista[k] : `${lista[k % lista.length]} (${Math.floor(k / lista.length) + 1})`);

/* ================================================================== */
/* MALHA URBANA                                                        */
/* ================================================================== */
function conexo(adj) {
  if (!adj.length) return true;
  const visto = new Uint8Array(adj.length);
  const fila = [0];
  visto[0] = 1;
  for (let k = 0; k < fila.length; k++) {
    for (const v of adj[fila[k]]) {
      if (!visto[v]) {
        visto[v] = 1;
        fila.push(v);
      }
    }
  }
  return fila.length === adj.length;
}

/**
 * Traça a malha: devolve as posições das esquinas e as ruas, cada rua marcada
 * com a LINHA da grade a que pertence ("R2" = rua na linha 2, "T-1" = travessa
 * na coluna −1, "D0" = diagonal). A linha define nome, classe e sentido.
 */
function tracarMalhaUrbana(n, rng, afastamento, densidade) {
  const passo = 1.55 * afastamento; // km entre esquinas
  const lado = Math.ceil(Math.sqrt(n * 2)) + 4;
  const c0 = Math.floor(lado / 2);
  const chave = (i, j) => j * lado + i;
  const dentro = (i, j) => i >= 0 && j >= 0 && i < lado && j < lado;
  const ruido = Array.from({ length: lado * lado }, () => rng.random());

  // 1. CRESCIMENTO a partir do centro: sempre pega a célula livre mais "barata"
  //    (perto do centro, com um pouco de acaso). A região sai conexa e irregular.
  const indiceDe = new Map();
  const celulas = [];
  const vista = new Set([chave(c0, c0)]);
  const fronteira = new FilaPrioridade();
  fronteira.inserir(0, [c0, c0]);
  while (fronteira.tamanho && celulas.length < n) {
    const [, [i, j]] = fronteira.retirar();
    indiceDe.set(chave(i, j), celulas.length);
    celulas.push([i, j]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (!dentro(a, b) || vista.has(chave(a, b))) continue;
      vista.add(chave(a, b));
      const distancia = Math.hypot(a - c0, (b - c0) * 1.2);
      fronteira.inserir(distancia * (0.7 + 0.7 * ruido[chave(a, b)]), [a, b]);
    }
  }
  const esquina = (i, j) => (dentro(i, j) ? indiceDe.get(chave(i, j)) : undefined);

  // 2. POSIÇÕES: grade girada, curvatura suave e imperfeições maiores na periferia.
  const angulo = rng.uniforme(-0.55, 0.55);
  const [cosA, senA] = [Math.cos(angulo), Math.sin(angulo)];
  const raioMax = Math.max(1, ...celulas.map(([i, j]) => Math.hypot(i - c0, j - c0)));
  const posicoes = celulas.map(([i, j]) => {
    const u = (i - c0) * passo;
    const v = (j - c0) * passo;
    const tremor = passo * (0.04 + 0.12 * (Math.hypot(i - c0, j - c0) / raioMax));
    const cu = u + passo * 0.14 * Math.sin(v / (passo * 3.3));
    const cv = v + passo * 0.14 * Math.sin(u / (passo * 3.9));
    return [cu * cosA - cv * senA + rng.uniforme(-tremor, tremor), cu * senA + cv * cosA + rng.uniforme(-tremor, tremor)];
  });
  const minX = Math.min(...posicoes.map((p) => p[0]));
  const minY = Math.min(...posicoes.map((p) => p[1]));
  posicoes.forEach((p) => {
    p[0] += 0.5 - minX;
    p[1] += 0.5 - minY;
  });

  // 3. RUAS DA GRADE — sempre de índice menor para maior (o "sentido positivo").
  const arestas = [];
  const adj = Array.from({ length: n }, () => new Set());
  const ligar = (u, v, linha) => {
    if (u === undefined || v === undefined || adj[u].has(v)) return false;
    if (adj[u].size >= MAX_RUAS_POR_NO || adj[v].size >= MAX_RUAS_POR_NO) return false;
    arestas.push({ u, v, linha });
    adj[u].add(v);
    adj[v].add(u);
    return true;
  };
  celulas.forEach(([i, j], u) => {
    ligar(u, esquina(i + 1, j), `R${j - c0}`); // ruas e avenidas
    ligar(u, esquina(i, j + 1), `T${i - c0}`); // travessas
  });

  // 4. AVENIDA DIAGONAL cortando os quarteirões, sem cruzar outra diagonal no meio da quadra.
  const diagonais = n < 20 ? 0 : densidade >= 1 && n >= 50 ? 2 : 1;
  for (let k = 0; k < diagonais; k++) {
    const d = k === 0 ? 1 : -1;
    const oi = c0 + rng.inteiro(-1, 1);
    const oj = c0 + rng.inteiro(-1, 1);
    for (let t = -lado; t < lado; t++) {
      const [ai, aj, bi, bj] = [oi + t, oj + d * t, oi + t + 1, oj + d * (t + 1)];
      const outraA = esquina(bi, aj);
      const outraB = esquina(ai, bj);
      if (outraA !== undefined && outraB !== undefined && adj[outraA].has(outraB)) continue;
      ligar(esquina(ai, aj), esquina(bi, bj), `D${k}`);
    }
  }

  // 5. QUARTEIRÕES MAIORES: tira algumas ruas da grade, nunca desconectando.
  const daGrade = arestas.filter((e) => e.linha[0] !== "D");
  const meta = Math.round(daGrade.length * Math.max(0, 0.3 - 0.2 * densidade));
  let retiradas = 0;
  for (const e of rng.amostra(daGrade, daGrade.length)) {
    if (retiradas >= meta) break;
    adj[e.u].delete(e.v);
    adj[e.v].delete(e.u);
    if (conexo(adj)) {
      e.removida = true;
      retiradas++;
    } else {
      adj[e.u].add(e.v);
      adj[e.v].add(e.u);
    }
  }

  return { posicoes, adj, arestas: arestas.filter((e) => !e.removida) };
}

/** Classe e nome de cada linha: as mais centrais recebem os nomes mais conhecidos. */
function planejarLinhas(arestas) {
  const linhas = [...new Set(arestas.map((e) => e.linha))].sort(
    (a, b) => Math.abs(Number(a.slice(1))) - Math.abs(Number(b.slice(1))) || a.localeCompare(b)
  );
  const usados = { DIAGONAL: 0, ARTERIAL: 0, COLETORA: 0, LOCAL: 0 };
  const plano = new Map();
  for (const linha of linhas) {
    const tipo = linha[0];
    const indice = Math.abs(Number(linha.slice(1)));
    let classe;
    let lista;
    if (tipo === "D") [classe, lista] = ["ARTERIAL", "DIAGONAL"];
    else if (tipo === "R") [classe, lista] = indice % 3 === 0 ? ["ARTERIAL", "ARTERIAL"] : ["LOCAL", "LOCAL"];
    else [classe, lista] = indice % 4 === 0 ? ["ARTERIAL", "ARTERIAL"] : ["COLETORA", "COLETORA"];
    plano.set(linha, { classe, nome: nomeDaLista(NOMES_VIAS[lista], usados[lista]++), paridade: indice % 2 });
  }
  return plano;
}

/* ================================================================== */
/* PRESÍDIOS                                                           */
/* ================================================================== */
/**
 * SÍTIO PARA PRESÍDIO no entorno da cidade.
 * 1. Sorteia candidatos num anel em volta da malha e calcula a exposição
 *    Σ 1/distância² até as moradias — dobrar a distância reduz a um quarto.
 * 2. Entre os 12% menos expostos, escolhe a esquina onde chega a rodovia de
 *    acesso: longe de moradias e com uma delegacia perto.
 */
function sugerirSitioPresidio(cidade, rng = criarRng(Date.now()), tentativas = 400) {
  const urbanos = cidade.pontos.filter((p) => !Ponto.presidio(p));
  if (!urbanos.length) return null;
  const xs = urbanos.map((p) => p.x);
  const ys = urbanos.map((p) => p.y);
  const centro = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const raio = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
  const margem = Math.max(2.5, raio * 0.55);
  const extensao = Math.max(1, raio * 2);

  const candidatos = [];
  for (let t = 0; t < tentativas; t++) {
    const ang = rng.uniforme(0, Math.PI * 2);
    const d = raio + rng.uniforme(margem * 0.55, margem);
    const x = centro[0] + Math.cos(ang) * d;
    const y = centro[1] + Math.sin(ang) * d;
    if (cidade.pontos.some((p) => Math.hypot(x - p.x, y - p.y) <= 1)) continue;
    let exposicao = 0;
    for (const p of cidade.pontos) {
      const peso = p.tipo === "RESIDENCIAL" ? 1 : Ponto.presidio(p) ? 4 : 0.15;
      exposicao += peso / Math.max(Math.hypot(x - p.x, y - p.y), 0.25) ** 2;
    }
    candidatos.push({ x, y, exposicao });
  }
  if (!candidatos.length) return null;
  candidatos.sort((a, b) => a.exposicao - b.exposicao);
  const topo = candidatos.slice(0, Math.max(10, Math.round(candidatos.length * 0.12)));

  const moradias = cidade.pontosPorTipo("RESIDENCIAL").map((p) => p.id);
  const delegacias = cidade.pontosPorTipo("DELEGACIA").map((p) => p.id);
  const ateMoradia = moradias.length ? dijkstraMultiOrigem(cidade.reverso(), moradias).dist : null;
  const daDelegacia = delegacias.length ? dijkstraMultiOrigem(cidade, delegacias).dist : null;
  const moradiaSet = new Set(moradias);
  let conexoes = urbanos.filter((p) => p.tipo !== "RESIDENCIAL" && cidade.qtdRuas(p.id) < MAX_RUAS_POR_NO);
  if (!conexoes.length) conexoes = urbanos.filter((p) => cidade.qtdRuas(p.id) < MAX_RUAS_POR_NO);
  if (!conexoes.length) return null;

  let melhor = null;
  topo.forEach((sitio, rank) => {
    const proximas = [...conexoes]
      .sort((a, b) => Math.hypot(sitio.x - a.x, sitio.y - a.y) - Math.hypot(sitio.x - b.x, sitio.y - b.y))
      .slice(0, 6);
    for (const con of proximas) {
      const acessoKm = Math.hypot(sitio.x - con.x, sitio.y - con.y) * 1.08;
      const dMor = ateMoradia ? ateMoradia.get(con.id) / 1000 : extensao;
      const dDel = daDelegacia ? daDelegacia.get(con.id) / 1000 : Infinity;
      const encosta = cidade.vizinhos(con.id).some((v) => moradiaSet.has(v));
      const custo =
        rank / topo.length +
        (dDel === Infinity ? 1 : (0.6 * Math.max(0, dDel - dMor)) / extensao) +
        (0.3 * acessoKm) / extensao +
        (encosta ? 1 : 0) -
        (0.2 * Math.min(dMor, extensao)) / extensao;
      if (!melhor || custo < melhor.custo) melhor = { ...sitio, conexao: con, acessoKm, custo };
    }
  });
  return melhor;
}

function instalarPresidios(cidade, quantidade = 1, rng = criarRng(Date.now())) {
  const criados = [];
  for (let i = 0; i < quantidade; i++) {
    const sitio = sugerirSitioPresidio(cidade, rng);
    if (!sitio) break;
    const nome = nomePara("PRESIDIO", cidade.pontos.filter(Ponto.presidio).length);
    const id = cidade.adicionarPonto({ nome, tipo: "PRESIDIO", x: sitio.x, y: sitio.y });
    cidade.adicionarVia({
      origem: sitio.conexao.id, destino: id, nome: `Rodovia de Acesso — ${nome}`,
      distancia_m: Math.max(400, sitio.acessoKm * 1000), classe: "RAPIDA",
    });
    criados.push(id);
  }
  return criados;
}

/** O aeroporto ganha acesso por via rápida e de mão dupla, a caminho do centro. */
function ligarAeroportos(cidade) {
  const urbanos = cidade.pontos.filter((p) => !Ponto.presidio(p));
  const cx = urbanos.reduce((s, p) => s + p.x, 0) / urbanos.length;
  const cy = urbanos.reduce((s, p) => s + p.y, 0) / urbanos.length;
  cidade.pontosPorTipo("AEROPORTO").forEach((aeroporto, k) => {
    const rumo = cidade
      .vizinhosNaoDirigido(aeroporto.id)
      .filter((r) => r.classe !== "RAPIDA")
      .map((r) => {
        const outro = cidade.ponto(r.origem === aeroporto.id ? r.destino : r.origem);
        return [r, Math.hypot(outro.x - cx, outro.y - cy)];
      })
      .sort((a, b) => a[1] - b[1])[0];
    if (!rumo) return;
    const rua = rumo[0];
    cidade.converterParaMaoDupla(rua.id_rua);
    cidade.definirClasse(rua.id_rua, "RAPIDA");
    cidade.renomearRua(rua.id_rua, k === 0 ? "Avenida Júlio César" : `Rodovia de Acesso — ${aeroporto.nome}`);
  });
}

/* ================================================================== */
/* GERAÇÃO                                                             */
/* ================================================================== */
function gerarCidade({
  n_pontos = 45, seed = 2026, afastamento = 1.0, densidade_extra = 0.8,
  prob_mao_unica = 0.3, reparar = true, n_presidios = 1, aderencia = 0.7,
} = {}) {
  const rng = criarRng(seed);
  const n = Math.max(3, n_pontos);

  // 1–5. MALHA
  const { posicoes, adj, arestas } = tracarMalhaUrbana(n, rng, afastamento, densidade_extra);

  // 6. USO DO SOLO
  const tipos = distribuirUsoDoSolo(posicoes, adj, quantidadesPorTipo(n), rng);
  const cidade = new Cidade(`Belém — Cenário #${seed}`);
  cidade.seed = seed;
  const usados = {};
  posicoes.forEach(([x, y], i) => {
    const indice = usados[tipos[i]] || 0;
    usados[tipos[i]] = indice + 1;
    cidade.adicionarPonto({ nome: nomePara(tipos[i], indice), tipo: tipos[i], x, y });
  });

  // Ruas: nome e classe vêm da linha; mão única vale para a linha inteira e
  // alterna de sentido entre linhas vizinhas.
  const linhas = planejarLinhas(arestas);
  const maoUnica = new Map([...linhas.keys()].map((l) => [l, rng.random() < prob_mao_unica]));
  for (const e of arestas) {
    const { classe, nome, paridade } = linhas.get(e.linha);
    const [a, b] = [posicoes[e.u], posicoes[e.v]];
    const [rua] = cidade.adicionarVia({
      origem: e.u, destino: e.v, nome, classe,
      distancia_m: Math.max(60, Math.hypot(a[0] - b[0], a[1] - b[1]) * 1000 * rng.uniforme(1.0, 1.05)),
    });
    if (classe !== "ARTERIAL" && maoUnica.get(e.linha)) cidade.tornarMaoUnica(rua.id_rua, paridade === 1);
  }

  // 7. PRESÍDIOS
  if (n_presidios > 0) instalarPresidios(cidade, n_presidios, rng);
  if (reparar) repararConexidadeForte(cidade);

  // 8. PLANEJAMENTO — a busca local refina o plano (limitada por número de
  //    tentativas, para a mesma semente dar sempre a mesma cidade) e o acaso
  //    desfaz parte dele conforme o nível escolhido.
  if (aderencia > 0) {
    const refinada = melhorarCidade(cidade, { limiteMs: Infinity, maxAvaliacoes: 3000, corrigirRuas: false, usarPlano: false }).depois;
    for (const v of cidade.vertices) cidade.definirLugar(v, refinada.ponto(v));
  }
  misturarLugares(cidade, aderencia, rng);
  ligarAeroportos(cidade);
  return cidade;
}

/**
 * Embaralha (1 − planejamento)² dos lugares entre as esquinas: 70% mexe em ~9%
 * deles, 40% em ~36%, 0% em todos. Presídios ficam onde estão.
 */
function misturarLugares(cidade, aderencia, rng) {
  const fracao = (1 - aderencia) ** 2;
  const sorteados = cidade.vertices.filter((v) => !Ponto.presidio(cidade.ponto(v)) && rng.random() < fracao);
  const lugares = rng.amostra(sorteados.map((v) => ({ ...cidade.ponto(v) })), sorteados.length);
  sorteados.forEach((v, k) => cidade.definirLugar(v, lugares[k]));
}

/** Recorte didático de 8 lugares do centro de Belém — cabe a matriz 8×8 num slide. */
function cidadeExemplo() {
  const c = new Cidade("Belém — Centro (exemplo didático)");
  const add = (nome, tipo, x, y) => c.adicionarPonto({ nome, tipo, x, y });
  const h = add("Hospital Ophir Loyola", "HOSPITAL", 1.0, 4.0);
  const d = add("Delegacia — 1ª Seccional", "DELEGACIA", 3.0, 5.0);
  const u = add("CESUPA", "EDUCACAO", 5.0, 5.2);
  const t = add("Terminal Rodoviário Hildegardo Nunes", "ONIBUS", 3.2, 3.0);
  const m = add("Mercado Ver-o-Peso", "LOJA", 5.2, 3.1);
  const b = add("Bairro Batista Campos", "RESIDENCIAL", 1.6, 1.6);
  const j = add("Bairro Jurunas", "RESIDENCIAL", 4.0, 1.2);
  const i = add("Porto da Companhia Docas do Pará", "INDUSTRIA", 6.6, 1.4);

  const via = (origem, destino, nome, distancia_m, classe, mao_unica = false) =>
    c.adicionarVia({ origem, destino, nome, distancia_m, classe, mao_unica });
  via(h, d, "Avenida Almirante Barroso", 2300, "ARTERIAL");
  via(d, u, "Avenida Alcindo Cacela", 2050, "ARTERIAL");
  via(d, t, "Avenida Governador José Malcher", 2100, "ARTERIAL");
  via(u, m, "Avenida Tamandaré", 2150, "ARTERIAL", true);
  via(t, m, "Travessa Padre Eutíquio", 2000, "COLETORA");
  via(t, b, "Travessa Quintino Bocaiúva", 2100, "COLETORA", true);
  via(b, h, "Avenida Presidente Vargas", 2500, "ARTERIAL");
  via(b, j, "Rua dos Mundurucus", 2450, "LOCAL");
  via(j, m, "Travessa Rui Barbosa", 2250, "COLETORA");
  via(j, i, "Rodovia Arthur Bernardes", 2600, "RAPIDA", true);
  via(i, m, "Rua Siqueira Mendes", 2100, "LOCAL");
  return c;
}
