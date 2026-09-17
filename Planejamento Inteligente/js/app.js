/*
 * INTERFACE — liga os controles da tela aos algoritmos.
 *
 * Tudo roda no navegador: basta abrir o index.html. Este arquivo só monta
 * pedidos, mostra respostas e pinta realces no mapa. Os algoritmos ficam em
 * js/caminhos.js, js/conexidade.js, js/nota.js e js/otimizador.js; a ponte entre
 * eles e a tela é o js/servico.js.
 */

const $ = (seletor) => document.querySelector(seletor);
const $$ = (seletor) => [...document.querySelectorAll(seletor)];

const mapa = new MapaSatelite($("#tela"));
let mapaAntes = null;
let estado = null;
let comparando = false;
let posicaoCorte = 0.5;

const GRUPOS = ["Moradia", "Serviços Essenciais", "Polo Econômico", "Mobilidade Urbana", "Vizinhança Segura"];

/* ------------------------------------------------------------------ */
/* Comunicação com a camada de serviço (no próprio navegador)          */
/* ------------------------------------------------------------------ */
async function api(acao, corpo = {}) {
  return Servico.chamar(acao, corpo);
}

function carregando(ativo, texto = "Processando…") {
  $("#carregando-texto").textContent = texto;
  $("#carregando").classList.toggle("visivel", ativo);
}

function avisar(mensagem, erro = false) {
  const el = $("#aviso");
  el.textContent = mensagem;
  el.classList.toggle("erro", erro);
  el.classList.add("visivel");
  clearTimeout(avisar._t);
  avisar._t = setTimeout(() => el.classList.remove("visivel"), erro ? 6000 : 3200);
}

/** Envolve uma ação com indicador de carregamento e tratamento de erro. */
async function executar(texto, funcao) {
  fecharMenus();
  carregando(true, texto);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  try {
    await funcao();
  } catch (e) {
    avisar(e.message, true);
    resultado("Erro", `<p>${escapar(e.message)}</p>`);
  } finally {
    carregando(false);
  }
}

/* ------------------------------------------------------------------ */
/* Estado da cidade                                                    */
/* ------------------------------------------------------------------ */
function aplicarEstado(novo) {
  sairComparacao();
  fecharMatrizes();
  estado = novo;
  mapa.definirCidade(estado);
  atualizarInfo();
  montarLegenda();
  $("#cartao").classList.remove("visivel");
  atualizarNota(null);
}

function atualizarInfo() {
  const r = estado.resumo;
  $("#hud-nome").textContent = estado.nome;
  $("#hud-v").textContent = r.vertices;
  $("#hud-a").textContent = r.arcos;
  $("#hud-r").textContent = r.ruas;
}

function atualizarNota(avaliacao) {
  const conceito = $("#hud-conceito");
  const nota = $("#hud-nota");
  if (!avaliacao) {
    conceito.textContent = "?";
    conceito.style.background = "#9aa0a6";
    nota.textContent = "—";
    return;
  }
  conceito.textContent = avaliacao.conceito;
  conceito.style.background = corDaNota(avaliacao.nota);
  nota.textContent = fmtNum(avaliacao.nota);
}

function corDaNota(n) {
  if (n >= 88) return "#1e8e3e";
  if (n >= 74) return "#7cb342";
  if (n >= 58) return "#f9ab00";
  if (n >= 42) return "#e8710a";
  return "#d93025";
}

function montarLegenda() {
  const porTipo = new Map();
  for (const p of estado.pontos) if (!porTipo.has(p.tipo)) porTipo.set(p.tipo, p);
  $("#legenda-itens").innerHTML = GRUPOS.map((grupo) => {
    const itens = [...porTipo.values()].filter((p) => p.grupo === grupo);
    if (!itens.length) return "";
    return `<div class="grupo-legenda">${escapar(grupo)}</div>${itens
      .map((p) => `<div class="item"><i class="bolinha" style="background:${p.cor}"></i>${escapar(p.tipo_rotulo)}</div>`)
      .join("")}`;
  }).join("");
}

/* ------------------------------------------------------------------ */
/* Painel de resultado                                                 */
/* ------------------------------------------------------------------ */
function resultado(titulo, html) {
  $("#painel-titulo").textContent = titulo;
  $("#resultado").innerHTML = html;
  $("#resultado").scrollTop = 0;
  $("#painel").classList.remove("oculto");
  fecharMatrizes();
  $$("#resultado [data-ir]").forEach((el) =>
    el.addEventListener("click", () => {
      const id = Number(el.dataset.ir);
      mapa.centralizarEm(id);
      selecionar(id);
    })
  );
}

function escapar(t) {
  return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function tabela(cabecalhos, linhas) {
  return `<table class="dados"><thead><tr>${cabecalhos.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${linhas.join("")}</tbody></table>`;
}

/** Número no formato brasileiro (vírgula decimal). */
function fmtNum(n, casas = 1) {
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }) : "∞";
}

/* ------------------------------------------------------------------ */
/* Seleção de lugares                                                  */
/* ------------------------------------------------------------------ */
function selecionar(id) {
  mapa.selecionado = id;
  mapa.desenhar();
  const p = estado.pontos.find((x) => x.id === id);
  if (!p) {
    $("#cartao").classList.remove("visivel");
    return;
  }
  $("#cartao-nome").textContent = p.nome;
  $("#cartao-tipo").textContent = `${p.tipo_rotulo} · ${p.grupo} · vértice ${p.id}`;
  $("#cartao-dados").innerHTML = `
    <dt>Ruas conectadas</dt><dd>${p.ruas}</dd>
    <dt>Grau no dígrafo</dt><dd>${p.grau} (${p.grau_entrada} chegam / ${p.grau_saida} saem)</dd>`;
  $("#cartao").classList.add("visivel");
}

/* ------------------------------------------------------------------ */
/* Comparação antes / depois                                           */
/* ------------------------------------------------------------------ */
function entrarComparacao(antes, depois, setas) {
  estado = depois;
  mapa.definirCidade(depois);
  atualizarInfo();
  montarLegenda();

  const telaAntes = $("#tela-antes");
  telaAntes.classList.add("visivel");
  if (!mapaAntes) mapaAntes = new MapaSatelite(telaAntes);
  mapaAntes.redimensionar();
  mapaAntes.definirCidade(antes);
  mapaAntes.definirDestaques({ setas });

  // O mapa "antes" segue a câmera do mapa principal a cada quadro.
  mapa.aoDesenhar = () => {
    if (!comparando) return;
    mapaAntes.camera = { ...mapa.camera };
    mapaAntes.desenhar();
  };
  comparando = true;
  $("#comparador").hidden = false;
  posicionarCorte(0.5);
  mapa.definirDestaques({ setas });
}

function sairComparacao() {
  if (!comparando) return;
  comparando = false;
  $("#comparador").hidden = true;
  $("#tela-antes").classList.remove("visivel");
  $("#tela-antes").style.clipPath = "";
  mapa.definirDestaques({});
}

function posicionarCorte(fracao) {
  posicaoCorte = Math.min(0.96, Math.max(0.04, fracao));
  const largura = $("#mapa").clientWidth;
  const x = posicaoCorte * largura;
  $("#comparador").style.left = `${x}px`;
  $("#tela-antes").style.clipPath = `inset(0 ${largura - x}px 0 0)`;
}

/* ------------------------------------------------------------------ */
/* AÇÕES                                                              */
/* ------------------------------------------------------------------ */
const acoes = {
  /* ------------------------- NOTA DA CIDADE ------------------------- */
  async avaliacao() {
    const a = await api("avaliacao");
    atualizarNota(a);
    mapa.definirDestaques({ circulos: a.destaques.circulos, ruas: a.destaques.ruas, corRuas: "#d93025" });

    const eixos = a.criterios
      .map((c, i) => {
        const titulo = `<span class="funcao">Eixo ${i + 1}</span>`;
        if (!c.aplicavel) {
          return `<div class="eixo">${titulo}
            <div class="topo"><b>${escapar(c.nome)}</b><span class="valor">não se aplica</span></div>
            <p class="regra">${escapar(c.resumo)} — o peso deste eixo vai para os outros.</p></div>`;
        }
        const detalhes = c.detalhes?.length
          ? `<details><summary>ver detalhes</summary><ul>${c.detalhes.map((d) => `<li>${escapar(d)}</li>`).join("")}</ul></details>`
          : "";
        return `<div class="eixo criterio">${titulo}
          <div class="topo"><b>${escapar(c.nome)}</b><span class="valor">${Math.round(c.nota)}/100</span></div>
          <div class="barra"><i style="width:${c.nota}%;background:${corDaNota(c.nota)}"></i></div>
          <p class="regra">${escapar(c.regra)}</p>
          <small>${escapar(c.resumo)}</small>
          <span class="algoritmo">${escapar(c.algoritmo)}</span>
          ${detalhes}
        </div>`;
      })
      .join("");

    const ind = a.indicadores;
    const lista = (titulo, itens) =>
      itens.length ? `<h4>${titulo}</h4><ul>${itens.map((s) => `<li>${escapar(s)}</li>`).join("")}</ul>` : "";

    resultado(
      "Nota da cidade",
      `
      <div class="destaque-nota">
        <span class="valor" style="color:${corDaNota(a.nota)}">${fmtNum(a.nota)}</span>
        <span class="escala">/100 · conceito ${a.conceito}</span>
      </div>
      <p>${escapar(a.descricao)}</p>
      <p class="dica">Quatro eixos com peso 25 cada, todos medidos pela distância nas ruas.</p>

      <div class="legenda-mapa">
        <span style="color:#d93025"><i></i>sem serviço ou uso misto</span>
        <span style="color:#e8710a"><i></i>serviço colado na moradia</span>
        <span style="color:#f9ab00"><i></i>atendimento parcial</span>
        <span style="color:#1e8e3e"><i></i>bloco econômico / vizinho ok</span>
        <span style="color:#039be5"><i></i>terminal de ônibus</span>
        <span style="color:#9334e6"><i></i>moradia sem terminal no caminho</span>
      </div>

      ${eixos}

      <h4>Indicadores</h4>
      ${tabela(
        ["Indicador", "Valor"],
        [
          ["Zonas residenciais", ind.moradias],
          ["Serviços essenciais", ind.servicos],
          ["Lugares do polo econômico", ind.economicos],
          ["Terminais de ônibus", ind.onibus],
          ["Aeroportos", ind.aeroportos],
          ["Presídios", ind.presidios],
          ["Maior cruzamento", `${ind.maior_cruzamento} ruas`],
        ].map(([r, v]) => `<tr><td>${r}</td><td class="num">${v}</td></tr>`)
      )}
      ${lista("Pontos fracos", a.pontos_fracos)}
      ${lista("Pontos fortes", a.pontos_fortes)}
      ${lista("Recomendações", a.recomendacoes)}
      <button class="acao" id="btn-melhorar-painel">Melhorar esta cidade</button>
    `
    );
    $("#btn-melhorar-painel").addEventListener("click", () => executar("Buscando a melhor posição de cada lugar…", () => acoes.melhorar()));
  },

  /* ------------------------- MELHORAR ------------------------- */
  async melhorar() {
    const r = await api("melhorar");
    const setas = r.movimentos.map((m) => ({ de: m.de_xy, para: m.para_xy, cor: m.cor }));
    entrarComparacao(r.antes, r.depois, setas);
    atualizarNota(r.nota_depois);

    const antes = r.nota_antes;
    const depois = r.nota_depois;
    const delta = depois.nota - antes.nota;
    const eixos = depois.criterios
      .map((c, i) => {
        const a = antes.criterios[i];
        if (!c.aplicavel && !a.aplicavel) return "";
        return `<div class="comparacao-eixo">
          <div class="topo"><b>${escapar(c.nome)}</b><span class="valores">${Math.round(a.nota)} → ${Math.round(c.nota)}</span></div>
          <div class="barra"><i style="width:${a.nota}%;background:#c4c7c5"></i></div>
          <div class="barra"><i style="width:${c.nota}%;background:${corDaNota(c.nota)}"></i></div>
        </div>`;
      })
      .join("");

    const mostrados = r.movimentos.slice(0, 14);
    const mudancas = mostrados
      .map(
        (m) => `<li data-ir="${m.para}"><i style="background:${m.cor}"></i>
          <span>${escapar(m.nome)}<small>foi para onde ficava ${escapar(m.ocupava_destino)}</small></span>
          <span class="num">${fmtNum(m.km)} km</span></li>`
      )
      .join("");

    resultado(
      "Antes e depois",
      `
      <div class="placar-comparacao">
        <div><small>Antes</small><span class="numero" style="color:${corDaNota(antes.nota)}">${fmtNum(antes.nota)}</span><span class="conceito-letra">conceito ${antes.conceito}</span></div>
        <span class="seta-placar" aria-hidden="true">→</span>
        <div><small>Depois</small><span class="numero" style="color:${corDaNota(depois.nota)}">${fmtNum(depois.nota)}</span><span class="conceito-letra">conceito ${depois.conceito}</span></div>
      </div>
      <p style="text-align:center"><span class="delta ${delta > 0.05 ? "" : "neutro"}">${delta > 0.05 ? "+" : ""}${fmtNum(delta)} pontos</span></p>
      <p>${
        r.movimentos.length
          ? `<b>${r.movimentos.length}</b> lugar(es) mudaram de posição; as ruas continuam as mesmas. Arraste a
            divisória no mapa para comparar e siga as setas.`
          : "A cidade já estava num ótimo local: nenhuma troca de posição aumentou a nota."
      }</p>
      ${
        r.ruas_corrigidas.length
          ? `<p class="dica">Antes de mover os lugares, ${r.ruas_corrigidas.length} rua(s) de mão única viraram mão
            dupla para haver ida e volta em toda a cidade: ${r.ruas_corrigidas.slice(0, 3).map(escapar).join(", ")}.</p>`
          : ""
      }

      <h4>Eixos</h4>
      ${eixos}

      ${
        r.movimentos.length
          ? `<h4>O que mudou de lugar</h4><ul class="mudancas">${mudancas}</ul>
            ${r.movimentos.length > mostrados.length ? `<p class="dica">e mais ${r.movimentos.length - mostrados.length} mudança(s).</p>` : ""}`
          : ""
      }

      <h4>Como a melhoria é calculada</h4>
      <p class="dica">Busca local (subida de encosta): troca dois lugares de posição e mantém a troca sempre que a
        nota sobe, até nenhuma troca melhorar. As distâncias entre todos os pares vêm de um único Floyd-Warshall,
        então cada tentativa é só uma consulta a tabela. Foram testadas ${r.avaliacoes.toLocaleString("pt-BR")}
        distribuições em ${fmtNum(r.tempo_ms / 1000)} s, partindo da ${escapar(r.origem)}.</p>
      <button class="acao secundaria" id="btn-sair-comparacao">Fechar comparação</button>
    `
    );
    $("#btn-sair-comparacao").addEventListener("click", () => {
      sairComparacao();
      $("#painel").classList.add("oculto");
    });
  },

  /* ------------------------- CAMINHO MÍNIMO ------------------------- */
  async rota() {
    const opcoes = (sel) =>
      estado.pontos.map((p) => `<option value="${p.id}"${p.id === sel ? " selected" : ""}>${escapar(p.nome)}</option>`).join("");
    resultado(
      "Caminho mínimo",
      `
      <p class="dica">Escolha de onde sair e aonde chegar. A rota mais curta é medida pela distância das ruas.</p>
      <label class="campo"><span>Origem</span><select id="r-origem">${opcoes(estado.pontos[0]?.id)}</select></label>
      <label class="campo"><span>Destino</span><select id="r-destino">${opcoes(estado.pontos[estado.pontos.length - 1]?.id)}</select></label>
      <label class="campo"><span>Algoritmo</span><select id="r-alg">
        <option value="dijkstra">Dijkstra — de uma origem para todos</option>
        <option value="floyd">Floyd-Warshall — entre todos os pares</option>
      </select></label>
      <button class="acao" id="r-calcular">Calcular caminho</button>
      <div id="r-saida"></div>
      <h4>Por que estes dois</h4>
      <ul>
        <li><b>Dijkstra</b>: sai da origem e acha o caminho mais curto até os outros lugares. É o mais rápido para uma rota.</li>
        <li><b>Floyd-Warshall</b>: calcula de uma vez a menor distância entre todos os lugares. É o que a nota da cidade usa.</li>
      </ul>
      <p class="dica">Os dois sempre chegam à mesma distância.</p>
    `
    );
    $("#r-calcular").addEventListener("click", () =>
      executar("Calculando caminho mínimo…", async () => {
        const d = await api("rota", {
          origem: Number($("#r-origem").value),
          destino: Number($("#r-destino").value),
          algoritmo: $("#r-alg").value,
        });
        mostrarRota(d);
      })
    );
  },

  /* ------------------------- ESTRUTURAS DE DADOS ------------------------- */
  async estruturas() {
    abrirMatrizes(await api("estruturas"));
  },

  async limpar() {
    fecharMatrizes();
    sairComparacao();
    mapa.definirDestaques({});
    mapa.selecionado = null;
    $("#cartao").classList.remove("visivel");
    $("#painel").classList.add("oculto");
    mapa.desenhar();
  },
};

/* ------------------------------------------------------------------ */
/* Matrizes de adjacência e incidência do grafo atual                  */
/* ------------------------------------------------------------------ */
const matrizes = { dados: null, aba: "adjacencia", valores: "binario", arcoEntre: new Map(), focados: [] };

function abrirMatrizes(dados) {
  matrizes.dados = dados;
  matrizes.arcoEntre = new Map(dados.arcos.map((a, k) => [`${a.origem},${a.destino}`, k]));
  $("#painel").classList.add("oculto");
  $("#matrizes").hidden = false;
  desenharMatriz();
}

function fecharMatrizes() {
  $("#matrizes").hidden = true;
}

function desenharMatriz() {
  const d = matrizes.dados;
  if (!d) return;
  const n = d.ids.length;
  const m = d.arcos.length;
  const milhar = (x) => x.toLocaleString("pt-BR");
  $$("#matrizes [data-aba]").forEach((b) => {
    const ativa = b.dataset.aba === matrizes.aba;
    b.classList.toggle("ativa", ativa);
    b.setAttribute("aria-selected", String(ativa));
  });
  $("#matriz-valores").hidden = matrizes.aba !== "adjacencia";

  const cabecalhoLinha = (i) =>
    `<th scope="row"><i class="cor" style="background:${d.cores[i]}"></i>${d.ids[i]}<span class="nome-linha">${escapar(d.nomes[i])}</span></th>`;
  const memoria = `O programa guarda o grafo em lista de adjacência (|V| + |A| = ${milhar(n + m)} células); a matriz é montada a partir dela.`;

  let html;
  if (matrizes.aba === "adjacencia") {
    const emKm = matrizes.valores === "distancia";
    const celula = (x, i, j) =>
      x
        ? `<td class="um">${emKm ? fmtNum(d.distancias[i][j], 1) : 1}</td>`
        : `<td${i === j ? ' class="diagonal"' : ""}>${emKm ? "" : 0}</td>`;
    html = `<table class="matriz-grande"><thead><tr><th class="canto">de ↓ para →</th>${d.ids
      .map((v) => `<th scope="col">${v}</th>`)
      .join("")}</tr></thead><tbody>${d.adjacencia
      .map((linha, i) => `<tr>${cabecalhoLinha(i)}${linha.map((x, j) => celula(x, i, j)).join("")}</tr>`)
      .join("")}</tbody></table>`;
    $("#matriz-resumo").innerHTML = `<b>${n} × ${n}</b> · M[i][j] = 1 quando há arco de i para j · ${
      d.simetrica ? "simétrica: toda rua é de mão dupla" : "<b>não simétrica</b>: há ruas de mão única, por isso é um dígrafo"
    } · ${milhar(n * n)} células<br>${memoria}`;
  } else {
    html = `<table class="matriz-grande"><thead><tr><th class="canto">lugar ↓ arco →</th>${d.arcos
      .map((a, k) => `<th scope="col" title="${d.ids[a.origem]} → ${d.ids[a.destino]}">a${k}</th>`)
      .join("")}</tr></thead><tbody>${d.incidencia
      .map(
        (linha, i) =>
          `<tr>${cabecalhoLinha(i)}${linha
            .map((x) => (x < 0 ? '<td class="menos">−1</td>' : x > 0 ? '<td class="mais">+1</td>' : "<td>0</td>"))
            .join("")}</tr>`
      )
      .join("")}</tbody></table>`;
    $("#matriz-resumo").innerHTML = `<b>${n} × ${m}</b> · uma linha por lugar e uma coluna por arco · −1 onde o arco sai, +1 onde chega; toda coluna soma zero · ${milhar(
      n * m
    )} células<br>${memoria}`;
  }

  const rolagem = $("#matriz-rolagem");
  rolagem.innerHTML = html;
  rolagem.scrollTop = 0;
  rolagem.scrollLeft = 0;
  matrizes.focados = [];
  $("#matriz-dica").textContent = "Passe o mouse ou toque numa célula para ver o que ela significa.";
}

function explicarCelula(evento) {
  const d = matrizes.dados;
  const td = evento.target.closest("#matriz-rolagem td");
  if (!d || !td) return;
  const tr = td.parentElement;
  const i = tr.sectionRowIndex;
  const j = td.cellIndex - 1;
  matrizes.focados.forEach((el) => el.classList.remove("foco"));
  matrizes.focados = [td, tr.cells[0], $("#matriz-rolagem thead tr").cells[j + 1]];
  matrizes.focados.forEach((el) => el.classList.add("foco"));

  if (matrizes.aba === "adjacencia") {
    const par = `<b>${escapar(d.nomes[i])}</b> → <b>${escapar(d.nomes[j])}</b>`;
    const k = matrizes.arcoEntre.get(`${i},${j}`);
    $("#matriz-dica").innerHTML =
      i === j
        ? `${par}: 0 — um lugar não tem rua para si mesmo (o grafo não tem laços).`
        : k === undefined
          ? `${par}: 0 — não há rua direta neste sentido.`
          : `${par}: 1 — arco pela ${escapar(d.arcos[k].rua)}, ${fmtNum(d.arcos[k].km, 2)} km.`;
  } else {
    const a = d.arcos[j];
    const valor = d.incidencia[i][j];
    const papel =
      valor < 0 ? "−1, o arco <b>sai</b> daqui." : valor > 0 ? "+1, o arco <b>chega</b> aqui." : "0, o arco não passa por aqui.";
    $("#matriz-dica").innerHTML = `Arco a${j}: ${escapar(d.nomes[a.origem])} → ${escapar(d.nomes[a.destino])} pela ${escapar(
      a.rua
    )} (${fmtNum(a.km, 2)} km). Em <b>${escapar(d.nomes[i])}</b>: ${papel}`;
  }
}

function mostrarRota(d) {
  if (!d.caminho || d.caminho.length < 2) {
    mapa.definirDestaques({});
    $("#r-saida").innerHTML = "<h4>Sem caminho</h4><p>Não existe rota entre esses lugares respeitando o sentido das ruas.</p>";
    return;
  }
  mapa.definirDestaques({ caminho: d.caminho, corCaminho: "#1a73e8" });
  let acumulado = 0;
  $("#r-saida").innerHTML = `
    <h4>${escapar(d.algoritmo)}</h4>
    <p><b>${fmtNum(d.distancia_km, 2)} km</b> por ${d.ruas} rua(s) — ${escapar(d.explicacao)}.</p>
    ${tabela(
      ["Rua", "Chega em", "km"],
      d.vias.map((v, i) => {
        acumulado += v.distancia_m / 1000;
        return `<tr class="clicavel" data-ir="${v.destino}">
          <td>${i + 1}. ${escapar(v.nome)}${v.mao_unica ? " ➤" : ""}</td>
          <td>${escapar(v.destino_nome)}</td>
          <td class="num">${fmtNum(acumulado, 2)}</td></tr>`;
      })
    )}`;
  $$("#r-saida [data-ir]").forEach((el) =>
    el.addEventListener("click", () => {
      mapa.centralizarEm(Number(el.dataset.ir));
      selecionar(Number(el.dataset.ir));
    })
  );
}

/* ------------------------------------------------------------------ */
/* Menus da barra superior                                             */
/* ------------------------------------------------------------------ */
function fecharMenus() {
  $$(".menu.aberto").forEach((m) => m.classList.remove("aberto"));
}

function ligarMenus() {
  $$(".menu").forEach((menu) => {
    menu.querySelector(".gatilho").addEventListener("click", (e) => {
      e.stopPropagation();
      const aberto = menu.classList.contains("aberto");
      fecharMenus();
      if (!aberto) menu.classList.add("aberto");
    });
    menu.querySelector(".popover").addEventListener("click", (e) => e.stopPropagation());
  });
  document.addEventListener("click", fecharMenus);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharMenus();
      fecharMatrizes();
      $("#painel").classList.add("oculto");
    }
  });
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */
function ligarEventos() {
  ligarMenus();

  const espelhar = (idEntrada, idSaida, formato) => {
    const entrada = $(idEntrada);
    const atualizar = () => ($(idSaida).textContent = formato(entrada.value));
    entrada.addEventListener("input", atualizar);
    atualizar();
  };
  espelhar("#in-aderencia", "#v-aderencia", (v) => `${v}%`);
  espelhar("#in-pontos", "#v-pontos", (v) => v);
  espelhar("#in-afastamento", "#v-afastamento", (v) => `${(v / 100).toFixed(1)}×`);
  espelhar("#in-densidade", "#v-densidade", (v) => (v / 100).toFixed(2));
  espelhar("#in-mao", "#v-mao", (v) => `${v}%`);

  $("#btn-gerar").addEventListener("click", () =>
    executar("Gerando cidade e imagem de satélite…", async () => {
      const novo = await api("gerar", {
        n_pontos: Number($("#in-pontos").value),
        aderencia: Number($("#in-aderencia").value) / 100,
        seed: Number($("#in-seed").value),
        afastamento: Number($("#in-afastamento").value) / 100,
        densidade_extra: Number($("#in-densidade").value) / 100,
        prob_mao_unica: Number($("#in-mao").value) / 100,
        reparar: $("#in-reparar").value === "1",
        n_presidios: Number($("#in-presidios").value),
      });
      aplicarEstado(novo);
      $("#painel").classList.add("oculto");
      avisar(`${novo.resumo.vertices} lugares e ${novo.resumo.ruas} ruas gerados.`);
    })
  );

  $("#btn-exemplo").addEventListener("click", () =>
    executar("Carregando o centro de Belém…", async () => {
      aplicarEstado(await api("exemplo"));
      $("#painel").classList.add("oculto");
    })
  );

  $("#btn-melhorar").addEventListener("click", () =>
    executar("Buscando a melhor posição de cada lugar…", () => acoes.melhorar())
  );

  $$("[data-acao]").forEach((b) => b.addEventListener("click", () => executar("Calculando…", () => acoes[b.dataset.acao]())));
  $("#chip-nota").addEventListener("click", () => executar("Avaliando a cidade…", () => acoes.avaliacao()));
  $("#fechar-painel").addEventListener("click", () => $("#painel").classList.add("oculto"));

  $("#btn-mais").addEventListener("click", () => mapa.aplicarZoom(1.35));
  $("#btn-menos").addEventListener("click", () => mapa.aplicarZoom(1 / 1.35));
  $("#btn-enquadrar").addEventListener("click", () => mapa.enquadrar());
  $("#alternar-legenda").parentElement.addEventListener("click", () => $("#legenda").classList.toggle("fechada"));

  // Divisória do antes/depois
  const alca = $("#alca-comparador");
  alca.addEventListener("pointerdown", (e) => {
    alca.setPointerCapture(e.pointerId);
    const mover = (ev) => {
      const r = $("#mapa").getBoundingClientRect();
      posicionarCorte((ev.clientX - r.left) / r.width);
    };
    const soltar = () => {
      alca.removeEventListener("pointermove", mover);
      alca.removeEventListener("pointerup", soltar);
    };
    alca.addEventListener("pointermove", mover);
    alca.addEventListener("pointerup", soltar);
  });
  alca.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") posicionarCorte(posicaoCorte - 0.05);
    if (e.key === "ArrowRight") posicionarCorte(posicaoCorte + 0.05);
  });

  // Matrizes do grafo
  $$("#matrizes [data-aba]").forEach((b) =>
    b.addEventListener("click", () => {
      matrizes.aba = b.dataset.aba;
      desenharMatriz();
    })
  );
  $("#in-valores-matriz").addEventListener("change", (e) => {
    matrizes.valores = e.target.value;
    desenharMatriz();
  });
  $("#fechar-matrizes").addEventListener("click", fecharMatrizes);
  $("#matriz-rolagem").addEventListener("mouseover", explicarCelula);

  ligarMapa();
  const aoRedimensionar = () => {
    mapa.redimensionar();
    if (comparando) {
      mapaAntes.redimensionar();
      posicionarCorte(posicaoCorte);
      mapa.desenhar();
    }
  };
  window.addEventListener("resize", aoRedimensionar);
  if (window.ResizeObserver) new ResizeObserver(aoRedimensionar).observe($("#mapa"));
}

function ligarMapa() {
  const tela = $("#tela");
  let arrastando = false;
  let moveu = false;
  let ultimo = { x: 0, y: 0 };

  tela.addEventListener("mousedown", (e) => {
    arrastando = true;
    moveu = false;
    ultimo = { x: e.clientX, y: e.clientY };
    tela.classList.add("arrastando");
  });
  window.addEventListener("mouseup", () => {
    arrastando = false;
    tela.classList.remove("arrastando");
  });
  window.addEventListener("mousemove", (e) => {
    if (!arrastando) return;
    const dx = e.clientX - ultimo.x;
    const dy = e.clientY - ultimo.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) moveu = true;
    ultimo = { x: e.clientX, y: e.clientY };
    mapa.mover(dx, dy);
  });
  tela.addEventListener("mousemove", (e) => {
    if (arrastando || !estado) return;
    const r = tela.getBoundingClientRect();
    const p = mapa.pontoEm(e.clientX - r.left, e.clientY - r.top);
    const novo = p ? p.id : null;
    if (novo !== mapa.sobre) {
      mapa.sobre = novo;
      mapa.desenhar();
    }
  });
  tela.addEventListener("click", (e) => {
    if (moveu || !estado) return;
    const r = tela.getBoundingClientRect();
    const p = mapa.pontoEm(e.clientX - r.left, e.clientY - r.top);
    if (p) selecionar(p.id);
    else {
      mapa.selecionado = null;
      $("#cartao").classList.remove("visivel");
      mapa.desenhar();
    }
  });
  tela.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = tela.getBoundingClientRect();
      mapa.aplicarZoom(e.deltaY < 0 ? 1.16 : 1 / 1.16, { x: e.clientX - r.left, y: e.clientY - r.top });
    },
    { passive: false }
  );
}

/* ------------------------------------------------------------------ */
async function iniciar() {
  carregando(true, "Carregando…");
  try {
    ligarEventos();
    mapa.redimensionar();
    aplicarEstado(await api("estado"));
  } catch (e) {
    avisar(e.message, true);
  } finally {
    carregando(false);
  }
}

iniciar();
