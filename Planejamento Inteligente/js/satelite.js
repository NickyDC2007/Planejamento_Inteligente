/*
 * RENDERIZADOR "IMAGEM DE SATÉLITE"
 * ---------------------------------
 * Desenha o grafo da cidade como se fosse uma foto aérea, em vez de bolinhas e
 * linhas. Nada aqui altera o grafo: é apenas a camada de apresentação. Os
 * vértices continuam sendo os pontos de interesse e as arestas continuam sendo
 * as vias — só que pintados como quarteirões, telhados, vegetação e asfalto.
 *
 * COMO O TERRENO É GERADO
 *   1. CAMPO DE URBANIDADE — as vias e os pontos são desenhados grossos numa
 *      máscara e depois borrados (blur). O resultado é um mapa suave de "quão
 *      urbano é cada ponto do mapa": alto sobre as avenidas, baixo no meio do
 *      nada. Sai de graça, porque o blur roda na GPU.
 *   2. TERRENO — cada pixel recebe uma cor a partir de ruído fractal (fBm)
 *      misturado com a urbanidade: mata fechada e lavoura no campo, solo
 *      compactado e concreto na cidade, água nas depressões afastadas das vias.
 *   3. DETALHES VETORIAIS — talhões de plantação, árvores e as pegadas dos
 *      prédios ao longo das ruas, todos com sombra na MESMA direção (o que é o
 *      truque que faz o olho ler a imagem como foto de satélite).
 *
 * O terreno é "assado" uma única vez por cidade num canvas fora da tela; o
 * pan e o zoom só reaproveitam essa imagem, então a navegação fica fluida.
 *
 * Toda a aleatoriedade vem de um hash determinístico alimentado pela SEMENTE da
 * cidade: a mesma cidade sempre gera exatamente a mesma imagem.
 */

const PX_POR_KM = 190;

/* Aparência de cada classe viária do CTB: largura do asfalto, da mancha urbana
 * que ela irradia, do corredor claro sob a via e do recuo dos prédios. */
const ORDEM_VIAS = ["RAPIDA", "ARTERIAL", "COLETORA", "LOCAL"];
const ESTILO_VIA = {
  RAPIDA:   { largura: 17, mascara: 30, corredor: 36, recuo: 19, asfalto: "#bcb7aa" },
  ARTERIAL: { largura: 13, mascara: 26, corredor: 30, recuo: 16, asfalto: "#c8c3b6" },
  COLETORA: { largura: 10, mascara: 20, corredor: 24, recuo: 13, asfalto: "#aca89e" },
  LOCAL:    { largura: 7,  mascara: 16, corredor: 19, recuo: 11, asfalto: "#9e9a90" },
};
const estiloVia = (rua) => ESTILO_VIA[rua.classe] || ESTILO_VIA.LOCAL;
const SOL = { x: 0.62, y: 0.78 }; // direção da sombra (sol no canto superior esquerdo)

const CORES = {
  mata: [
    [38, 60, 30],
    [47, 72, 35],
    [58, 84, 42],
  ],
  campo: [
    [104, 124, 62],
    [126, 142, 74],
    [146, 152, 88],
  ],
  solo: [
    [140, 120, 84],
    [158, 138, 100],
    [122, 104, 74],
  ],
  urbano: [
    [122, 118, 111],
    [138, 133, 125],
    [104, 100, 95],
  ],
  agua: [
    [26, 58, 76],
    [33, 74, 92],
    [21, 48, 64],
  ],
  telhados: [
    "#9d9a94",
    "#adaaa2",
    "#8a8681",
    "#a3775f",
    "#b0553f",
    "#77808a",
    "#c2bdb2",
  ],
};

/* ------------------------------------------------------------------ */
/* Ruído determinístico                                                */
/* ------------------------------------------------------------------ */
function hash2(x, y, semente) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(semente | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function ruido(x, y, semente) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, semente);
  const b = hash2(xi + 1, yi, semente);
  const c = hash2(xi, yi + 1, semente);
  const d = hash2(xi + 1, yi + 1, semente);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y, semente, oitavas = 4) {
  let soma = 0;
  let amplitude = 0.5;
  let frequencia = 1;
  let normal = 0;
  for (let i = 0; i < oitavas; i++) {
    soma += amplitude * ruido(x * frequencia, y * frequencia, semente + i * 101);
    normal += amplitude;
    amplitude *= 0.5;
    frequencia *= 2.07;
  }
  return soma / normal;
}

function misturar(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function paleta(lista, t) {
  const escala = t * (lista.length - 1);
  const i = Math.min(lista.length - 2, Math.floor(escala));
  return misturar(lista[i], lista[i + 1], escala - i);
}

/* ------------------------------------------------------------------ */
class MapaSatelite {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.estado = null;
    this.terreno = null;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.destaques = vazios();
    this.selecionado = null;
    this.sobre = null;
    this.mostrarRotulos = true;
    this.arrastando = false;
  }

  /* ---------------- ciclo de vida ---------------- */
  definirCidade(estado) {
    this.estado = estado;
    this.destaques = vazios();
    this.selecionado = null;
    this._calcularMundo();
    this._assarTerreno();
    this.enquadrar();
  }

  _calcularMundo() {
    const l = this.estado.limites;
    const cidadeKm = {
      largura: Math.max(1, l.x_max - l.x_min),
      altura: Math.max(1, l.y_max - l.y_min),
    };

    // Respiro em volta da cidade — o enquadramento inicial mostra a cidade com
    // esta folga, e não colada nas bordas.
    const respiro = Math.max(cidadeKm.largura, cidadeKm.altura) * 0.09 + 0.6;
    this.enquadramentoKm = {
      largura: cidadeKm.largura + respiro * 2,
      altura: cidadeKm.altura + respiro * 2,
    };

    // O terreno precisa ser MAIOR que a área visível, senão sobra fundo preto
    // nas beiradas. Calcula-se quanto o viewport enxerga no zoom de
    // enquadramento e estende-se o terreno além disso, deixando folga de pan.
    const { width, height } = this._tamanhoTela();
    const proporcaoTela = width / Math.max(height, 1);
    let visivelLargura = this.enquadramentoKm.largura;
    let visivelAltura = this.enquadramentoKm.altura;
    if (visivelLargura / visivelAltura > proporcaoTela) {
      visivelAltura = visivelLargura / proporcaoTela;
    } else {
      visivelLargura = visivelAltura * proporcaoTela;
    }

    // O terreno é QUADRADO, com o lado tirado da maior dimensão visível. Assim
    // ele continua cobrindo a tela mesmo que a janela mude de proporção depois
    // de o terreno já ter sido gerado — o que aconteceria, por exemplo, ao
    // maximizar a janela, e deixaria faixas vazias nas laterais.
    const FOLGA = 1.5; // espaço extra para arrastar sem ver a borda do mundo
    const lado = Math.max(visivelLargura, visivelAltura) * FOLGA;
    const larguraKm = lado;
    const alturaKm = lado;
    const centro = {
      x: (l.x_min + l.x_max) / 2,
      y: (l.y_min + l.y_max) / 2,
    };

    this.mundo = {
      x0: centro.x - larguraKm / 2,
      y0: centro.y - alturaKm / 2,
      larguraKm,
      alturaKm,
    };

    // Resolução do terreno, limitada para não estourar memória nem o tempo de
    // geração em cidades grandes.
    const maior = Math.max(larguraKm, alturaKm);
    this.pxKm = Math.min(PX_POR_KM, 2800 / maior);
    this.larguraPx = Math.round(larguraKm * this.pxKm);
    this.alturaPx = Math.round(alturaKm * this.pxKm);
  }

  /* Converte km -> pixel do terreno */
  paraPx(xKm, yKm) {
    return {
      x: (xKm - this.mundo.x0) * this.pxKm,
      // O eixo Y do mundo cresce para cima; o do canvas, para baixo.
      y: (this.mundo.alturaKm - (yKm - this.mundo.y0)) * this.pxKm,
    };
  }

  paraKm(xPx, yPx) {
    return {
      x: xPx / this.pxKm + this.mundo.x0,
      y: this.mundo.alturaKm - yPx / this.pxKm + this.mundo.y0,
    };
  }

  /* ---------------- 1. campo de urbanidade ---------------- */
  _campoUrbanidade(escala) {
    const largura = Math.max(2, Math.round(this.larguraPx * escala));
    const altura = Math.max(2, Math.round(this.alturaPx * escala));
    const mascara = document.createElement("canvas");
    mascara.width = largura;
    mascara.height = altura;
    const c = mascara.getContext("2d");

    c.fillStyle = "#000";
    c.fillRect(0, 0, largura, altura);
    c.strokeStyle = "#fff";
    c.fillStyle = "#fff";
    c.lineCap = "round";
    c.lineJoin = "round";

    // As vias irradiam urbanidade.
    for (const rua of this.estado.ruas) {
      const a = this._ponto(rua.origem);
      const b = this._ponto(rua.destino);
      if (!a || !b) continue;
      const pa = this.paraPx(a.x, a.y);
      const pb = this.paraPx(b.x, b.y);
      c.lineWidth = estiloVia(rua).mascara * escala;
      c.beginPath();
      c.moveTo(pa.x * escala, pa.y * escala);
      c.lineTo(pb.x * escala, pb.y * escala);
      c.stroke();
    }

    // E os pontos importantes formam manchas densas em volta de si.
    for (const p of this.estado.pontos) {
      const px = this.paraPx(p.x, p.y);
      const raio = (p.nocivo ? 22 : 16 + p.importancia * 11) * escala;
      const g = c.createRadialGradient(
        px.x * escala, px.y * escala, 0,
        px.x * escala, px.y * escala, raio
      );
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(px.x * escala, px.y * escala, raio, 0, Math.PI * 2);
      c.fill();
    }

    // O blur transforma os traços em um campo contínuo e suave.
    const suave = document.createElement("canvas");
    suave.width = largura;
    suave.height = altura;
    const s = suave.getContext("2d");
    s.filter = `blur(${Math.max(2, 13 * escala)}px)`;
    s.drawImage(mascara, 0, 0);

    const dados = s.getImageData(0, 0, largura, altura).data;
    return {
      largura,
      altura,
      escala,
      valor(px, py) {
        const x = Math.min(largura - 1, Math.max(0, Math.round(px * escala)));
        const y = Math.min(altura - 1, Math.max(0, Math.round(py * escala)));
        return dados[(y * largura + x) * 4] / 255;
      },
    };
  }

  /* ---------------- 2 e 3. terreno ---------------- */
  _assarTerreno() {
    const semente = (this.estado.seed || 1) * 7919 + this.estado.pontos.length;
    const t0 = performance.now();

    this.urbanidade = this._campoUrbanidade(0.28);

    const terreno = document.createElement("canvas");
    terreno.width = this.larguraPx;
    terreno.height = this.alturaPx;
    const ctx = terreno.getContext("2d");

    // ---- passada por pixel, em meia resolução (satélite é naturalmente macio)
    const escalaBase = 0.5;
    const lb = Math.round(this.larguraPx * escalaBase);
    const ab = Math.round(this.alturaPx * escalaBase);
    const base = document.createElement("canvas");
    base.width = lb;
    base.height = ab;
    const cb = base.getContext("2d");
    const img = cb.createImageData(lb, ab);
    const dados = img.data;

    const escalaRuido = 0.055 / escalaBase;
    for (let y = 0; y < ab; y++) {
      for (let x = 0; x < lb; x++) {
        const px = x / escalaBase;
        const py = y / escalaBase;
        const u = this.urbanidade.valor(px, py);

        const relevo = fbm(x * escalaRuido, y * escalaRuido, semente, 4);
        const detalhe = ruido(x * 0.42, y * 0.42, semente + 77);
        const umidade = fbm(x * escalaRuido * 0.55 + 40, y * escalaRuido * 0.55, semente + 313, 3);

        let cor;
        const ehAgua = umidade < 0.3 && u < 0.06;
        if (ehAgua) {
          const prof = (0.3 - umidade) / 0.3;
          cor = paleta(CORES.agua, Math.min(1, prof * 1.4));
        } else if (u > 0.16) {
          // mancha urbana: solo compactado / concreto
          const mistura = Math.min(1, (u - 0.16) / 0.5);
          const rural = misturar(paleta(CORES.campo, relevo), paleta(CORES.solo, detalhe), 0.35);
          cor = misturar(rural, paleta(CORES.urbano, detalhe), mistura);
        } else {
          // zona rural: mata onde é mais úmido, lavoura onde é mais seco
          const vegetacao = paleta(CORES.mata, relevo);
          const lavoura = paleta(CORES.campo, detalhe * 0.7 + relevo * 0.3);
          cor = misturar(lavoura, vegetacao, Math.min(1, Math.max(0, (umidade - 0.32) * 2.6)));
          if (relevo > 0.72) cor = misturar(cor, paleta(CORES.solo, detalhe), (relevo - 0.72) * 2.2);
        }

        // granulação fina: nenhuma foto de satélite é lisa
        const gr = (detalhe - 0.5) * 16;
        const i = (y * lb + x) * 4;
        dados[i] = Math.max(0, Math.min(255, cor[0] + gr));
        dados[i + 1] = Math.max(0, Math.min(255, cor[1] + gr));
        dados[i + 2] = Math.max(0, Math.min(255, cor[2] + gr));
        dados[i + 3] = 255;
      }
    }
    cb.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, 0, 0, this.larguraPx, this.alturaPx);

    this._desenharTalhoes(ctx, semente);
    this._desenharVegetacao(ctx, semente);
    this._desenharQuarteiroes(ctx, semente);
    this._desenharPredios(ctx, semente);

    // leve vinheta, como nas capturas reais
    const v = ctx.createRadialGradient(
      this.larguraPx / 2, this.alturaPx / 2, Math.min(this.larguraPx, this.alturaPx) * 0.35,
      this.larguraPx / 2, this.alturaPx / 2, Math.max(this.larguraPx, this.alturaPx) * 0.75
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, this.larguraPx, this.alturaPx);

    this.terreno = terreno;
    this.tempoTerreno = Math.round(performance.now() - t0);
  }

  /* Talhões agrícolas: retângulos girados na zona rural. */
  _desenharTalhoes(ctx, semente) {
    const lado = 78;
    let n = 0;
    for (let y = 0; y < this.alturaPx; y += lado) {
      for (let x = 0; x < this.larguraPx; x += lado) {
        n++;
        if (this.urbanidade.valor(x + lado / 2, y + lado / 2) > 0.05) continue;
        const r = hash2(x, y, semente + 991);
        if (r > 0.42) continue;
        const umidade = fbm(x * 0.0275 + 40, y * 0.0275, semente + 313, 3);
        if (umidade < 0.32) continue; // não pinta lavoura em cima da água
        ctx.save();
        ctx.translate(x + lado / 2, y + lado / 2);
        ctx.rotate((hash2(x, y, semente + 55) - 0.5) * 0.7);
        ctx.globalAlpha = 0.16 + r * 0.2;
        ctx.fillStyle = r < 0.2 ? "#8b9a54" : "#a08f5c";
        const w = lado * (0.7 + r);
        const h = lado * (0.55 + r * 0.8);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Vegetação: copas com luz no topo-esquerda e sombra oposta. */
  _desenharVegetacao(ctx, semente) {
    const passo = 13;
    for (let y = 0; y < this.alturaPx; y += passo) {
      for (let x = 0; x < this.larguraPx; x += passo) {
        const u = this.urbanidade.valor(x, y);
        const r = hash2(x, y, semente + 1777);
        const umidade = fbm(x * 0.0275 + 40, y * 0.0275, semente + 313, 3);
        if (umidade < 0.31 && u < 0.06) continue; // água
        const densidade = u > 0.2 ? 0.1 : 0.55 * Math.min(1, Math.max(0, umidade - 0.2) * 3);
        if (r > densidade) continue;

        const jx = x + (hash2(x, y, semente + 3) - 0.5) * passo;
        const jy = y + (hash2(x, y, semente + 4) - 0.5) * passo;
        const raio = 2.6 + hash2(x, y, semente + 5) * 3.6;

        ctx.fillStyle = "rgba(0,0,0,0.32)";
        ctx.beginPath();
        ctx.arc(jx + raio * SOL.x, jy + raio * SOL.y, raio * 0.92, 0, Math.PI * 2);
        ctx.fill();

        const tom = 0.25 + hash2(x, y, semente + 6) * 0.6;
        const c = paleta(CORES.mata, tom);
        ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        ctx.beginPath();
        ctx.arc(jx, jy, raio, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(190,220,150,0.20)";
        ctx.beginPath();
        ctx.arc(jx - raio * 0.28, jy - raio * 0.3, raio * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* Base clara sob as vias, simulando o corredor já pavimentado. */
  _desenharQuarteiroes(ctx) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(150,144,134,0.55)";
    for (const rua of this.estado.ruas) {
      const a = this._ponto(rua.origem);
      const b = this._ponto(rua.destino);
      if (!a || !b) continue;
      const pa = this.paraPx(a.x, a.y);
      const pb = this.paraPx(b.x, b.y);
      ctx.lineWidth = estiloVia(rua).corredor;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Pegadas de prédios ao longo das ruas, com sombra na mesma direção. */
  _desenharPredios(ctx, semente) {
    const segmentos = [];
    for (const rua of this.estado.ruas) {
      const a = this._ponto(rua.origem);
      const b = this._ponto(rua.destino);
      if (!a || !b) continue;
      segmentos.push({
        rua,
        a: this.paraPx(a.x, a.y),
        b: this.paraPx(b.x, b.y),
        pa: a,
        pb: b,
      });
    }

    let contador = 0;
    for (const seg of segmentos) {
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const comprimento = Math.hypot(dx, dy);
      if (comprimento < 24) continue;
      const ang = Math.atan2(dy, dx);
      const nx = -dy / comprimento;
      const ny = dx / comprimento;
      const meiaVia = estiloVia(seg.rua).recuo;

      const passo = 21;
      for (let d = passo * 0.8; d < comprimento - passo * 0.6; d += passo) {
        for (const lado of [-1, 1]) {
          contador++;
          const r = hash2(Math.round(d), seg.rua.id_rua * 31 + lado, semente + 40);
          const importanciaLocal = Math.max(
            seg.pa.importancia * (1 - d / comprimento),
            seg.pb.importancia * (d / comprimento)
          );
          if (r > 0.28 + importanciaLocal * 0.12) continue;

          const cx = seg.a.x + (dx * d) / comprimento + nx * lado * (meiaVia + 9);
          const cy = seg.a.y + (dy * d) / comprimento + ny * lado * (meiaVia + 9);
          if (cx < 4 || cy < 4 || cx > this.larguraPx - 4 || cy > this.alturaPx - 4) continue;
          if (this.urbanidade.valor(cx, cy) < 0.1) continue;
          if (this.estado.pontos.some((p) => {
            if (p.tipo !== "AEROPORTO") return false;
            const a = this.paraPx(p.x, p.y);
            return Math.hypot(cx - a.x, cy - a.y) < Math.max(70, 0.85 * this.pxKm);
          })) continue;

          // não constrói em cima de outra rua
          let colide = false;
          for (const outro of segmentos) {
            if (outro === seg) continue;
            if (distanciaSegmento(cx, cy, outro.a, outro.b) < 15) {
              colide = true;
              break;
            }
          }
          if (colide) continue;

          const grande = importanciaLocal >= 4 && r < 0.12;
          const largura = (grande ? 20 : 10) + hash2(contador, 1, semente) * (grande ? 16 : 9);
          const altura = (grande ? 16 : 9) + hash2(contador, 2, semente) * (grande ? 14 : 8);
          const elevacao = 1.6 + hash2(contador, 3, semente) * (grande ? 7 : 3.2);

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang);

          ctx.fillStyle = "rgba(0,0,0,0.42)";
          ctx.fillRect(
            -largura / 2 + elevacao * SOL.x,
            -altura / 2 + elevacao * SOL.y,
            largura,
            altura
          );

          ctx.fillStyle = CORES.telhados[Math.floor(hash2(contador, 4, semente) * CORES.telhados.length)];
          ctx.fillRect(-largura / 2, -altura / 2, largura, altura);

          ctx.fillStyle = "rgba(255,255,255,0.16)";
          ctx.fillRect(-largura / 2, -altura / 2, largura, Math.max(1.4, altura * 0.22));
          ctx.restore();
        }
      }
    }

    // Muralha e pátio dos presídios: bloco isolado, sem prédios em volta.
    for (const p of this.estado.pontos) {
      if (!p.nocivo) continue;
      const c = this.paraPx(p.x, p.y);
      const lado = 34 + p.importancia * 7;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(hash2(p.id, 9, semente) * 0.6 - 0.3);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(-lado / 2 + 5 * SOL.x, -lado / 2 + 5 * SOL.y, lado, lado * 0.8);
      ctx.fillStyle = "#8f8b84";
      ctx.fillRect(-lado / 2, -lado / 2, lado, lado * 0.8);
      ctx.strokeStyle = "#cfcabf";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-lado / 2, -lado / 2, lado, lado * 0.8);
      ctx.fillStyle = "#6d6a65";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(-lado / 2 + 5, -lado / 2 + 5 + i * (lado * 0.23), lado - 10, lado * 0.13);
      }
      ctx.restore();
    }

    // Pista dos aeroportos: concreto com faixa central e cabeceiras pintadas.
    for (const p of this.estado.pontos) {
      if (p.tipo !== "AEROPORTO") continue;
      const c = this.paraPx(p.x, p.y);
      const comprimento = Math.max(90, 1.4 * this.pxKm);
      const largura = Math.max(10, 0.06 * this.pxKm);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(hash2(p.id, 17, semente) * Math.PI);
      ctx.fillStyle = "rgba(168,176,128,0.6)"; // grama aparada da faixa de pista
      ctx.fillRect(-comprimento / 2 - 20, -largura * 3, comprimento + 40, largura * 6);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(-comprimento / 2 + 3, -largura / 2 + 3, comprimento, largura);
      ctx.fillStyle = "#6f6f6b";
      ctx.fillRect(-comprimento / 2, -largura / 2, comprimento, largura);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let x = -comprimento / 2 + 22; x < comprimento / 2 - 22; x += 22) ctx.fillRect(x, -0.8, 11, 1.6);
      for (let k = -3; k <= 3; k++) {
        ctx.fillRect(-comprimento / 2 + 4, (k * largura) / 8 - 0.8, 10, 1.6);
        ctx.fillRect(comprimento / 2 - 14, (k * largura) / 8 - 0.8, 10, 1.6);
      }
      ctx.fillStyle = "rgba(0,0,0,0.4)"; // terminal de passageiros
      ctx.fillRect(-18 + 3, largura * 1.6 + 3, 36, 14);
      ctx.fillStyle = "#cdc8bc";
      ctx.fillRect(-18, largura * 1.6, 36, 14);
      ctx.restore();
    }
  }

  /* ---------------- câmera ---------------- */
  enquadrar() {
    const { width, height } = this._tamanhoTela();
    // Enquadra a CIDADE (com respiro), não o terreno inteiro.
    const alvoLargura = this.enquadramentoKm.largura * this.pxKm;
    const alvoAltura = this.enquadramentoKm.altura * this.pxKm;
    const zoom = Math.min(width / alvoLargura, height / alvoAltura);

    // Se o canvas ainda não tinha tamanho quando isto rodou (acontece quando a
    // aba está oculta ou o layout ainda não foi calculado), o zoom sai 0 ou NaN
    // e o mapa fica invisível. Nesse caso tenta de novo no próximo quadro.
    if (!isFinite(zoom) || zoom <= 0) {
      if (!this._tentativasEnquadrar) this._tentativasEnquadrar = 0;
      if (this._tentativasEnquadrar++ < 30) {
        requestAnimationFrame(() => this.enquadrar());
      }
      return;
    }

    this._tentativasEnquadrar = 0;
    this.camera = { x: this.larguraPx / 2, y: this.alturaPx / 2, zoom };
    this._limitarCamera();
    this.desenhar();
  }

  /** O zoom atual é utilizável? Usado para detectar medições inválidas. */
  get zoomValido() {
    return isFinite(this.camera.zoom) && this.camera.zoom > 0;
  }

  /**
   * Zoom mínimo em que o terreno ainda COBRE o viewport.
   * Abaixo disso apareceria fundo vazio nas bordas — que é o que se quer evitar.
   */
  get zoomMinimo() {
    const { width, height } = this._tamanhoTela();
    return Math.max(width / this.larguraPx, height / this.alturaPx);
  }

  /** Impede que a câmera saia do terreno, eliminando qualquer borda vazia. */
  _limitarCamera() {
    const { width, height } = this._tamanhoTela();
    const meiaLargura = width / (2 * this.camera.zoom);
    const meiaAltura = height / (2 * this.camera.zoom);

    this.camera.x =
      meiaLargura * 2 >= this.larguraPx
        ? this.larguraPx / 2
        : Math.min(this.larguraPx - meiaLargura, Math.max(meiaLargura, this.camera.x));
    this.camera.y =
      meiaAltura * 2 >= this.alturaPx
        ? this.alturaPx / 2
        : Math.min(this.alturaPx - meiaAltura, Math.max(meiaAltura, this.camera.y));
  }

  aplicarZoom(fator, alvoTela) {
    const { width, height } = this._tamanhoTela();
    const alvo = alvoTela || { x: width / 2, y: height / 2 };
    const antes = this.telaParaTerreno(alvo.x, alvo.y);
    this.camera.zoom = Math.max(this.zoomMinimo, Math.min(12, this.camera.zoom * fator));
    const depois = this.telaParaTerreno(alvo.x, alvo.y);
    this.camera.x += antes.x - depois.x;
    this.camera.y += antes.y - depois.y;
    this._limitarCamera();
    this.desenhar();
  }

  mover(dxTela, dyTela) {
    this.camera.x -= dxTela / this.camera.zoom;
    this.camera.y -= dyTela / this.camera.zoom;
    this._limitarCamera();
    this.desenhar();
  }

  centralizarEm(idPonto, zoomMinimoDesejado = 1.4) {
    const p = this._ponto(idPonto);
    if (!p) return;
    const px = this.paraPx(p.x, p.y);
    this.camera.x = px.x;
    this.camera.y = px.y;
    this.camera.zoom = Math.max(this.camera.zoom, zoomMinimoDesejado);
    this._limitarCamera();
    this.desenhar();
  }

  telaParaTerreno(x, y) {
    const { width, height } = this._tamanhoTela();
    return {
      x: (x - width / 2) / this.camera.zoom + this.camera.x,
      y: (y - height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  terrenoParaTela(x, y) {
    const { width, height } = this._tamanhoTela();
    return {
      x: (x - this.camera.x) * this.camera.zoom + width / 2,
      y: (y - this.camera.y) * this.camera.zoom + height / 2,
    };
  }

  pontoNaTela(p) {
    const px = this.paraPx(p.x, p.y);
    return this.terrenoParaTela(px.x, px.y);
  }

  pontoEm(xTela, yTela, raio = 20) {
    let melhor = null;
    let menor = raio;
    for (const p of this.estado.pontos) {
      const t = this.pontoNaTela(p);
      const d = Math.hypot(t.x - xTela, t.y - yTela);
      if (d < menor) {
        menor = d;
        melhor = p;
      }
    }
    return melhor;
  }

  _tamanhoTela() {
    // O canvas pode ainda não ter caixa calculada; cai para o contêiner e, em
    // último caso, para a janela, para nunca devolver zero.
    let largura = this.canvas.clientWidth;
    let altura = this.canvas.clientHeight;
    const pai = this.canvas.parentElement;
    if ((!largura || !altura) && pai) {
      largura = largura || pai.clientWidth;
      altura = altura || pai.clientHeight;
    }
    return {
      width: largura || window.innerWidth || 900,
      height: altura || window.innerHeight || 600,
    };
  }

  redimensionar() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = this._tamanhoTela();
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    if (this.terreno && !this.zoomValido) {
      this.enquadrar();   // recupera de uma medição anterior inválida
      return;
    }
    if (this.terreno) {
      // Ao mudar o tamanho da janela o terreno pode deixar de cobrir a tela.
      this.camera.zoom = Math.max(this.zoomMinimo, this.camera.zoom);
      this._limitarCamera();
    }
    this.desenhar();
  }

  /* ---------------- desenho ---------------- */
  desenhar() {
    if (!this.estado || !this.terreno) return;
    const ctx = this.ctx;
    const { width, height } = this._tamanhoTela();
    const dpr = this.dpr || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d1411";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terreno, 0, 0);

    this._desenharVias(ctx);
    this._desenharRealces(ctx);

    ctx.restore();

    this._desenharMarcadores(ctx);
    this._desenharEscala(ctx);
    if (this.aoDesenhar) this.aoDesenhar();
  }

  _desenharVias(ctx) {
    const z = this.camera.zoom;
    const destaqueRuas = this.destaques.ruas;
    const cor = this.destaques.corRuas || "#ff2d78";
    const transito = this.destaques.coresRuas;
    const traco = (pa, pb) => {
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    };

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Ruas locais embaixo, rodovias por cima — como num mapa de verdade.
    const ruas = [...this.estado.ruas].sort(
      (a, b) => ORDEM_VIAS.indexOf(b.classe) - ORDEM_VIAS.indexOf(a.classe)
    );

    // 1ª passada: contorno escuro (o "casing" dos mapas)
    ctx.strokeStyle = "rgba(24,24,22,0.78)";
    for (const rua of ruas) {
      const [pa, pb] = this._extremos(rua);
      if (!pa) continue;
      ctx.lineWidth = this._larguraVia(rua) + 3.5 / z;
      traco(pa, pb);
    }

    // 2ª passada: asfalto, com o tom da classe da via
    for (const rua of ruas) {
      const [pa, pb] = this._extremos(rua);
      if (!pa) continue;
      const realce = destaqueRuas.has(rua.id_rua);
      ctx.strokeStyle = realce ? cor : estiloVia(rua).asfalto;
      ctx.lineWidth = this._larguraVia(rua) + (realce ? 2.5 / z : 0);
      traco(pa, pb);
    }

    // 3ª passada: sinalização horizontal, camada de trânsito e setas
    for (const rua of ruas) {
      const [pa, pb] = this._extremos(rua);
      if (!pa) continue;
      const largura = this._larguraVia(rua);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const comprimento = Math.hypot(dx, dy) || 1;
      const nx = -dy / comprimento;
      const ny = dx / comprimento;

      if (rua.classe === "RAPIDA" && z > 0.3) {
        // Pista dupla: canteiro central gramado e faixas tracejadas de cada lado.
        ctx.strokeStyle = "rgba(88,116,60,0.95)";
        ctx.lineWidth = largura * 0.16;
        traco(pa, pb);
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = Math.max(0.35, 0.9 / z);
        ctx.setLineDash([6 / z, 6 / z]);
        for (const lado of [-0.3, 0.3]) {
          const o = largura * lado;
          traco({ x: pa.x + nx * o, y: pa.y + ny * o }, { x: pb.x + nx * o, y: pb.y + ny * o });
        }
        ctx.setLineDash([]);
      } else if (rua.classe === "ARTERIAL" && z > 0.45) {
        ctx.strokeStyle = "rgba(250,225,120,0.7)";
        ctx.lineWidth = Math.max(0.4, 1.1 / z);
        ctx.setLineDash([7 / z, 7 / z]);
        traco(pa, pb);
        ctx.setLineDash([]);
      }

      if (transito && transito[rua.id_rua]) {
        ctx.strokeStyle = transito[rua.id_rua];
        ctx.lineWidth = Math.max(2.4 / z, largura * 0.42);
        traco(pa, pb);
      }

      if (rua.mao_unica && z > 0.35) this._seta(ctx, pa, pb, z);
    }
  }

  _seta(ctx, pa, pb, z) {
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const comprimento = Math.hypot(dx, dy);
    if (comprimento < 20) return;
    const ang = Math.atan2(dy, dx);
    const tamanho = Math.max(5, 9 / Math.sqrt(z));
    const quantidade = Math.max(1, Math.floor(comprimento / 70));
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.7 / z;
    for (let i = 1; i <= quantidade; i++) {
      const t = i / (quantidade + 1);
      const x = pa.x + dx * t;
      const y = pa.y + dy * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(tamanho, 0);
      ctx.lineTo(-tamanho * 0.6, tamanho * 0.55);
      ctx.lineTo(-tamanho * 0.6, -tamanho * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  _desenharRealces(ctx) {
    const d = this.destaques;
    const z = this.camera.zoom;

    if (d.caminho && d.caminho.length > 1) {
      const pontos = d.caminho.map((id) => {
        const p = this._ponto(id);
        return p ? this.paraPx(p.x, p.y) : null;
      }).filter(Boolean);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 11 / z + 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      pontos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();

      ctx.strokeStyle = d.corCaminho || "#3ea6ff";
      ctx.lineWidth = 8 / z + 2;
      ctx.beginPath();
      pontos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }

    if (d.circulos && d.circulos.length) {
      for (const c of d.circulos) {
        const p = this._ponto(c.id);
        if (!p) continue;
        const px = this.paraPx(p.x, p.y);
        ctx.strokeStyle = c.cor;
        ctx.lineWidth = 3.5 / z;
        ctx.beginPath();
        ctx.arc(px.x, px.y, (c.raio || 26) / Math.sqrt(z), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (d.setas && d.setas.length) {
      for (const seta of d.setas) {
        const a = this.paraPx(seta.de.x, seta.de.y);
        const b = this.paraPx(seta.para.x, seta.para.y);
        const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
        if (comprimento < 4) continue;
        const ux = (b.x - a.x) / comprimento;
        const uy = (b.y - a.y) / comprimento;
        const ponta = Math.max(9, 15 / Math.sqrt(z));
        const fim = { x: b.x - ux * ponta * 0.9, y: b.y - uy * ponta * 0.9 };
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 6 / z + 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(fim.x, fim.y);
        ctx.stroke();
        ctx.strokeStyle = seta.cor;
        ctx.lineWidth = 3.2 / z + 1;
        ctx.setLineDash([10 / z, 6 / z]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(fim.x, fim.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = seta.cor;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(fim.x - uy * ponta * 0.55, fim.y + ux * ponta * 0.55);
        ctx.lineTo(fim.x + uy * ponta * 0.55, fim.y - ux * ponta * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2 / z;
        ctx.stroke();
      }
    }

    if (d.sitio) {
      const px = this.paraPx(d.sitio.x, d.sitio.y);
      ctx.setLineDash([9 / z, 6 / z]);
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3 / z;
      ctx.beginPath();
      ctx.arc(px.x, px.y, 34 / Math.sqrt(z), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _desenharMarcadores(ctx) {
    const z = this.camera.zoom;
    const { width, height } = this._tamanhoTela();
    const pintados = [];

    const ordenados = [...this.estado.pontos].sort((a, b) => a.importancia - b.importancia);
    for (const p of ordenados) {
      const t = this.pontoNaTela(p);
      if (t.x < -60 || t.y < -60 || t.x > width + 60 || t.y > height + 60) continue;

      const cores = this.destaques.coresPontos;
      const cor = (cores && cores[p.id]) || p.cor;
      const escala = 0.62 + p.importancia * 0.1;
      const selecionado = this.selecionado === p.id;
      const sobre = this.sobre === p.id;
      const raio = (selecionado || sobre ? 13 : 10.5) * escala;

      // pino no estilo de mapa
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(1.5, 3, raio * 0.85, raio * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, -raio, raio, Math.PI * 0.15, Math.PI * 0.85, true);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fillStyle = cor;
      ctx.fill();
      ctx.lineWidth = selecionado ? 2.6 : 1.5;
      ctx.strokeStyle = selecionado ? "#ffffff" : "rgba(255,255,255,0.82)";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -raio, raio * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();

      if (z > 0.5 && raio > 8) {
        ctx.font = `${Math.round(raio * 0.72)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ICONES[p.tipo] || "•", 0, -raio + 0.5);
      }
      ctx.restore();

      const mostrar =
        this.mostrarRotulos &&
        (selecionado || sobre || p.importancia >= 3 || p.nocivo || z > 1.6);
      if (mostrar) {
        pintados.push({ p, t, raio, prioridade: selecionado || sobre ? 99 : p.importancia });
      }
    }

    this._desenharRotulos(ctx, pintados);
  }

  /**
   * Rótulos com PREVENÇÃO DE COLISÃO.
   *
   * Sem isso o mapa vira uma sopa de nomes sobrepostos. A regra é a mesma dos
   * mapas de verdade: os rótulos são tentados em ordem de prioridade (ponto
   * selecionado primeiro, depois por importância) e um rótulo só é desenhado se
   * a caixa dele não encostar em nenhuma já desenhada.
   */
  _desenharRotulos(ctx, candidatos) {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    const ocupadas = [];
    const colide = (a) =>
      ocupadas.some(
        (b) =>
          a.x1 < b.x2 + 3 && a.x2 > b.x1 - 3 && a.y1 < b.y2 + 2 && a.y2 > b.y1 - 2
      );

    const ordenados = [...candidatos].sort((a, b) => b.prioridade - a.prioridade);
    for (const { p, t, raio, prioridade } of ordenados) {
      const limite = p.importancia >= 4 ? 30 : 22;
      const texto = p.nome.length > limite ? p.nome.slice(0, limite - 1) + "…" : p.nome;
      const tamanho = p.importancia >= 4 ? 12.5 : 11.5;
      ctx.font = `600 ${tamanho}px "Segoe UI",system-ui,sans-serif`;
      const largura = ctx.measureText(texto).width;
      const y = t.y - raio * 2 - 6;

      const caixa = {
        x1: t.x - largura / 2 - 6,
        x2: t.x + largura / 2 + 6,
        y1: y - 12,
        y2: y + 5,
      };
      // O ponto selecionado ou sob o cursor sempre aparece, custe o que custar.
      if (prioridade < 99 && colide(caixa)) continue;
      ocupadas.push(caixa);

      ctx.fillStyle = p.nocivo ? "rgba(120,20,20,0.82)" : "rgba(20,22,20,0.74)";
      arredondado(ctx, caixa.x1, caixa.y1, caixa.x2 - caixa.x1, 17, 5);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(texto, t.x, y);
    }
  }

  _desenharEscala(ctx) {
    const { height } = this._tamanhoTela();
    const pxPorKm = this.pxKm * this.camera.zoom;
    let km = 1;
    while (pxPorKm * km < 60) km *= 2;
    while (pxPorKm * km > 190) km /= 2;
    const comprimento = pxPorKm * km;

    const x = 18;
    const y = height - 22;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y);
    ctx.lineTo(x + comprimento, y);
    ctx.lineTo(x + comprimento, y - 6);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = '600 11px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(km >= 1 ? `${km} km` : `${Math.round(km * 1000)} m`, x + 4, y - 9);
  }

  /* ---------------- utilidades ---------------- */
  _ponto(id) {
    if (!this._indice || this._indiceVersao !== this.estado) {
      this._indice = new Map(this.estado.pontos.map((p) => [p.id, p]));
      this._indiceVersao = this.estado;
    }
    return this._indice.get(id);
  }

  _extremos(rua) {
    const a = this._ponto(rua.origem);
    const b = this._ponto(rua.destino);
    if (!a || !b) return [null, null];
    return [this.paraPx(a.x, a.y), this.paraPx(b.x, b.y)];
  }

  _larguraVia(rua) {
    return Math.max(estiloVia(rua).largura, 2.5 / this.camera.zoom);
  }

  definirDestaques(destaques) {
    this.destaques = Object.assign(vazios(), destaques || {});
    if (this.destaques.ruas && !(this.destaques.ruas instanceof Set)) {
      this.destaques.ruas = new Set(this.destaques.ruas);
    }
    this.desenhar();
  }
}

function vazios() {
  return {
    ruas: new Set(),
    caminho: null,
    circulos: [],
    coresPontos: null,
    corRuas: null,
    coresRuas: null,
    corCaminho: null,
    sitio: null,
    setas: [],
  };
}

function arredondado(ctx, x, y, largura, altura, raio) {
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, raio);
  ctx.arcTo(x + largura, y + altura, x, y + altura, raio);
  ctx.arcTo(x, y + altura, x, y, raio);
  ctx.arcTo(x, y, x + largura, y, raio);
  ctx.closePath();
}

function distanciaSegmento(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  if (comprimento2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / comprimento2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

const ICONES = {
  RESIDENCIAL: "🏘️",
  HOSPITAL: "🏥",
  BOMBEIROS: "🚒",
  DELEGACIA: "🚓",
  FARMACIA: "💊",
  EDUCACAO: "🎓",
  SHOPPING: "🛍️",
  LOJA: "🏪",
  INDUSTRIA: "🏭",
  ONIBUS: "🚌",
  AEROPORTO: "✈️",
  PRESIDIO: "🔒",
};
