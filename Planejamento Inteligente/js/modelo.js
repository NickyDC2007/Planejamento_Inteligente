/*
 * MODELO DE DOMÍNIO
 * -----------------
 *   VÉRTICE = um lugar da cidade (moradia, hospital, loja, aeroporto...).
 *   ARCO    = um sentido de circulação de uma rua. Mão única gera 1 arco,
 *             mão dupla gera 2 — por isso o modelo é um DÍGRAFO.
 *   PESO    = a DISTÂNCIA da rua, em metros. É a única ponderação do projeto.
 *
 * Os lugares se dividem em cinco grupos, que são a base da nota:
 *   Moradia · Serviços Essenciais · Polo Econômico · Vizinhança Segura ·
 *   Mobilidade Urbana
 */

/*
 * Cada tipo carrega:
 *   rotulo, grupo, cor, sigla
 *   importancia   só visual: define o tamanho do pino no mapa
 *   frequencia    fração de lugares desse tipo numa cidade gerada
 */
const TIPOS = {
  RESIDENCIAL: { rotulo: "Zona Residencial",      grupo: "Moradia",             importancia: 3, cor: "#8d6e63", sigla: "RES", frequencia: 0.38 },
  HOSPITAL:    { rotulo: "Hospital",              grupo: "Serviços Essenciais", importancia: 5, cor: "#e53935", sigla: "HOS", frequencia: 0.05 },
  BOMBEIROS:   { rotulo: "Corpo de Bombeiros",    grupo: "Serviços Essenciais", importancia: 5, cor: "#f4511e", sigla: "BOM", frequencia: 0.03 },
  DELEGACIA:   { rotulo: "Delegacia",             grupo: "Serviços Essenciais", importancia: 4, cor: "#283593", sigla: "DEL", frequencia: 0.05 },
  FARMACIA:    { rotulo: "Farmácia",              grupo: "Serviços Essenciais", importancia: 3, cor: "#ec407a", sigla: "FAR", frequencia: 0.07 },
  EDUCACAO:    { rotulo: "Escola / Universidade", grupo: "Serviços Essenciais", importancia: 4, cor: "#43a047", sigla: "EDU", frequencia: 0.08 },
  SHOPPING:    { rotulo: "Shopping",              grupo: "Polo Econômico",      importancia: 4, cor: "#f9a825", sigla: "SHO", frequencia: 0.04 },
  LOJA:        { rotulo: "Loja / Mercado",        grupo: "Polo Econômico",      importancia: 3, cor: "#fdd835", sigla: "LOJ", frequencia: 0.12 },
  INDUSTRIA:   { rotulo: "Indústria",             grupo: "Polo Econômico",      importancia: 4, cor: "#827717", sigla: "IND", frequencia: 0.05 },
  ONIBUS:      { rotulo: "Terminal de Ônibus",    grupo: "Mobilidade Urbana",   importancia: 4, cor: "#039be5", sigla: "ONI", frequencia: 0.08 },
  AEROPORTO:   { rotulo: "Aeroporto",             grupo: "Mobilidade Urbana",   importancia: 5, cor: "#546e7a", sigla: "AER", frequencia: 0.00 },
  PRESIDIO:    { rotulo: "Presídio",              grupo: "Vizinhança Segura",   importancia: 4, cor: "#212121", sigla: "PRE", frequencia: 0.00 },
};

/* Grupos usados pelas regras da nota. */
const SERVICOS_ESSENCIAIS = ["HOSPITAL", "BOMBEIROS", "DELEGACIA", "FARMACIA", "EDUCACAO"];
const POLO_ECONOMICO = ["SHOPPING", "LOJA", "INDUSTRIA"];
const COMERCIO = ["SHOPPING", "LOJA"];
const VIZINHOS_INCOMODOS = ["PRESIDIO", "AEROPORTO", "INDUSTRIA"];

/** Nenhum lugar recebe mais do que 6 ruas. */
const MAX_RUAS_POR_NO = 6;

/* ------------------------------------------------------------------ */
/* Hierarquia viária — só aparência e nome, não entra em nenhum cálculo */
/* ------------------------------------------------------------------ */
/* As ruas mais usadas pelos caminhos mínimos viram avenidas e rodovias,
 * como numa cidade real; o que pesa nos algoritmos é apenas a distância. */
const CLASSES_VIA = {
  RAPIDA:   { rotulo: "Rodovia" },
  ARTERIAL: { rotulo: "Avenida" },
  COLETORA: { rotulo: "Travessa" },
  LOCAL:    { rotulo: "Rua" },
};
const ORDEM_CLASSES = ["RAPIDA", "ARTERIAL", "COLETORA", "LOCAL"];

/* ------------------------------------------------------------------ */
/* Grandezas derivadas                                                 */
/* ------------------------------------------------------------------ */
const Ponto = {
  presidio: (p) => p.tipo === "PRESIDIO",
  /** Distância em linha reta, em metros (coordenadas em km). */
  distancia: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * 1000,
};

/* ------------------------------------------------------------------ */
/* PESO — a distância da rua                                           */
/* ------------------------------------------------------------------ */
const PESOS = {
  distancia: {
    rotulo: "Distância (m)",
    fn: (via) => via.distancia_m,
  },
};

/* ------------------------------------------------------------------ */
/* Gerador pseudoaleatório com semente (mesma semente = mesma cidade)  */
/* ------------------------------------------------------------------ */
function criarRng(semente) {
  let s = (semente >>> 0) || 1;
  const proximo = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random: proximo,
    uniforme: (a, b) => a + (b - a) * proximo(),
    inteiro: (a, b) => a + Math.floor(proximo() * (b - a + 1)),
    escolher: (lista) => lista[Math.floor(proximo() * lista.length)],
    amostra(lista, k) {
      const copia = [...lista];
      for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(proximo() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
      }
      return copia.slice(0, k);
    },
  };
}
