# Planejamento Inteligente

Projeto de **Teoria dos Grafos** — planejamento urbano com a malha viária
modelada como **dígrafo ponderado pela distância**, com cenários nomeados a
partir de **Belém do Pará**. Roda **100% no navegador**: sem Python, sem
servidor, sem instalação.

## Como abrir

- **No computador:** dê dois cliques em `index.html`.
- **Na internet:** envie esta pasta para o GitHub Pages, o Netlify ou outra
  hospedagem de site estático.
- **Testes:** dê dois cliques em `testes.html`.

## Conteúdo da pasta

| Arquivo | Conteúdo |
|---|---|
| `index.html` | a aplicação |
| `testes.html` | testes de correção |
| `Como funciona a nota e a geração das cidades.pdf` | explicação completa da geração das cidades e do cálculo da nota, com exemplo |
| `css/estilo.css` | aparência |
| `js/modelo.js` | tipos de lugar, grupos, peso por distância |
| `js/grafo.js` | classe `Cidade`: lista de adjacência e as outras três representações |
| `js/caminhos.js` | BFS, DFS, Dijkstra, Floyd-Warshall |
| `js/conexidade.js` | conexidade fraca e forte (Kosaraju) e reparo de mão única |
| `js/gerador.js` | malha urbana, nomes de Belém, presídios |
| `js/usoDoSolo.js` | plano inicial: onde vai cada lugar |
| `js/nota.js` | os quatro eixos da nota |
| `js/otimizador.js` | busca local do botão "Melhorar cidade" |
| `js/servico.js` | ponte entre os algoritmos e a tela |
| `js/satelite.js` | desenho do mapa em estilo satélite (canvas) |
| `js/app.js` | menus, painéis e comparação antes/depois |
| `js/testes.js` | as verificações rodadas por `testes.html` |

## A modelagem

| Mundo real | Grafo |
|---|---|
| Uma esquina com um lugar | **Vértice** |
| Um sentido de circulação de uma rua | **Arco** |
| Rua de mão dupla | dois arcos opostos |
| Rua de mão única | um arco — é isto que torna o grafo um **dígrafo** |
| Comprimento do trecho | **Peso** do arco — a única ponderação do projeto |

### Os lugares

| Grupo | Lugares |
|---|---|
| **Moradia** | Zona residencial — o foco da cidade |
| **Serviços Essenciais** | Hospital, corpo de bombeiros, delegacia, farmácia, escola/universidade |
| **Polo Econômico** | Shopping, loja/mercado, indústria |
| **Mobilidade Urbana** | Terminal de ônibus, aeroporto |
| **Vizinhança Segura** | Presídio (aeroporto e indústria também entram neste eixo) |

**Só a zona residencial leva nome de bairro** (Bairro Nazaré, Bairro Umarizal…).
Os outros lugares têm nomes que não citam bairro nem rua: Hospital Ophir Loyola,
CESUPA, Farmácia Big Ben, Delegacia — 1ª Seccional, Estação BRT 3. Um lugar pode
mudar de esquina no "Melhorar cidade", e uma "Farmácia do Marco" longe do Bairro
Marco confundiria. Cada nome começa pelo que o lugar é.

Toda cidade com ensino tem o **CESUPA**, que é sempre o primeiro nome sorteado.
Quando os nomes de Belém acabam, entram referências de SP e RJ, e as séries
numeradas continuam (Estação BRT 8, 9…). As ruas mantêm nomes reais de Belém:
Avenida Almirante Barroso, Travessa Padre Eutíquio…

## A malha urbana

As ruas imitam um bairro planejado como o centro de Belém:

1. **Crescimento** — a cidade cresce a partir do centro sobre uma grade de
   quarteirões, com a borda irregular.
2. **Grade imperfeita** — esquinas levemente giradas, ruas que curvam de leve e
   mais irregularidade na periferia.
3. **Ruas contínuas** — avenidas e ruas correm num sentido, travessas cruzam na
   perpendicular e uma avenida diagonal corta os quarteirões. Cada linha da
   grade é uma rua com um só nome, atravessando vários quarteirões.
4. **Quarteirões maiores** — algumas ruas são retiradas, formando quadras
   maiores e ruas sem saída, sem nunca desconectar a cidade.
5. **Mão única em binário** — quando uma rua é de mão única, ela é inteira, e o
   sentido alterna entre ruas vizinhas, como nas travessas de Belém. Avenidas
   ficam em mão dupla.
6. **Acessos** — o aeroporto recebe via rápida a caminho do centro; o presídio,
   uma rodovia de acesso própria.

Nenhuma esquina recebe mais de **6 ruas** (4 da grade + 2 da diagonal), e
nenhuma rua cruza outra fora de uma esquina.

## A nota: quatro eixos

Cada eixo vale 25. Um eixo que não se aplica sai da conta e seu peso vai para os
outros. Conceitos: **A** ≥ 88 · **B** ≥ 74 · **C** ≥ 58 · **D** ≥ 42 · **E** abaixo.

| Eixo | Regra | Algoritmo | Pontuação |
|---|---|---|---|
| **1. Acesso a Serviços Essenciais** | Toda moradia alcança os cinco serviços, mas o serviço não fica colado nela. | BFS (busca em largura) | Cada zona residencial vale 1/5 por serviço a até **3 ruas**; serviço **vizinho direto** corta o ponto pela metade. |
| **2. Polo Econômico** | Shopping, loja e indústria num único bloco contínuo, sem encostar em moradia. | BFS (busca em largura), uma busca por bloco | `100 × (maior bloco ÷ total) × (1 − fração encostada em moradia)²` |
| **3. Vizinhança Segura** | Presídio, aeroporto e indústria a distância aceitável das moradias, cada um com sua regra. | Floyd-Warshall (a excentricidade sai da mesma tabela) | **Presídio:** longe das moradias e com a delegacia mais perto dele do que a casa mais próxima. **Aeroporto:** na borda da cidade e longe das moradias. **Indústria:** longe das moradias e junto ao comércio. |
| **4. Mobilidade Urbana** | Terminais de ônibus entre as moradias e o polo econômico; aeroporto alcançável sem grandes voltas. | Floyd-Warshall (reconstrução do caminho mínimo) | Fração das moradias cujo caminho mínimo até o polo econômico passa por um terminal + quanto o caminho até o aeroporto é maior que a linha reta. |

Como a malha não muda quando os lugares trocam de esquina, as distâncias entre
todos os pares (Floyd-Warshall) e as contagens de ruas (BFS) são calculadas uma
vez; avaliar uma distribuição de lugares vira consulta a tabela.

## Melhorar cidade

O botão **Melhorar cidade** reposiciona os lugares existentes sobre as mesmas
ruas até chegar à melhor nota, e mostra **antes e depois** com uma divisória
arrastável no mapa, setas indicando o que mudou de lugar e a nota de cada eixo.

O algoritmo é uma **busca local (subida de encosta)**:

1. Se há trechos sem retorno, as mãos únicas culpadas viram mão dupla
   (componentes fortemente conexas de Kosaraju).
2. Parte de duas distribuições: a cidade como está e o plano do gerador.
3. Troca dois lugares de esquina; se a nota sobe, a troca fica. Repete até
   nenhuma troca melhorar — um ótimo local.
4. Fica com a melhor; em empate, com a que move menos lugares.

Presídios não saem do lugar e nenhum lugar é criado ou removido.

### Nível de planejamento

O controle **Planejamento** do gerador distribui os lugares com um plano
refinado pela mesma busca local e depois embaralha (1 − nível)² deles. Média em
8 cidades de 45 lugares:

| Planejamento | Nota gerada | Depois de "Melhorar" |
|---|---|---|
| 100% | 86,3 | 87,6 |
| 70% (padrão) | 73,5 | 87,5 |
| 40% | 44,0 | 87,7 |
| 0% | 31,5 | 88,0 |

## Relação com o Plano Piloto de Lúcio Costa

A nota nasceu inspirada no Plano Piloto de Brasília (1957), que separa a cidade
por funções — morar, trabalhar, circular, recrear — seguindo a Carta de Atenas.
A comparação abaixo é uma leitura qualitativa, princípio a princípio:

| Princípio do Plano Piloto | No Planejamento Inteligente | Semelhança |
|---|---|---|
| Cidade separada por funções | Eixos 2 e 3 afastam comércio, indústria, aeroporto e presídio das moradias | Alinhado |
| Centro comercial concentrado (setores comercial, bancário e de diversões) | Polo econômico num bloco contínuo, que o gerador põe no centro | Alinhado |
| Rodoviária no coração do plano, ligando as asas residenciais ao centro | Terminal de ônibus como ponte entre moradia e polo econômico | Alinhado |
| Superquadras residenciais separadas do comércio central | Comércio encostado em moradia é punido | Alinhado |
| Aeroporto fora da área urbana | Aeroporto na borda e longe das moradias | Alinhado |
| Serviços especializados em setores próprios, como o Setor Hospitalar | Hospitais espalhados para ficar a até 3 ruas de cada moradia | Parcial |
| Indústria num setor próprio, afastado das asas residenciais | Indústria longe das moradias, porém junto ao comércio | Parcial |
| Unidade de vizinhança: comércio local e escola dentro ou junto das superquadras | Farmácia e escola coladas na moradia perdem pontos | Contrário |
| Vias expressas sem cruzamento em nível (as "tesourinhas" do Eixo Rodoviário) | A malha tem hierarquia de vias, mas a nota só usa distância | Não medido |
| Dois eixos cruzados como estrutura da cidade | Grade de quarteirões com avenida diagonal | Diferente |
| Grandes áreas verdes (a escala bucólica) | Não há parques | Ausente |
| — | Presídio perto de delegacia | Regra própria do projeto |

**Resultado:** 5 princípios alinhados, 2 parciais, 1 contrário e 3 não
representados. Contando os parciais como meio, a nota se parece com o Plano
Piloto em **cerca de metade** dos seus princípios. A semelhança está na
**separação de funções e no papel do centro e da rodoviária**; as diferenças
estão na **escala da vizinhança** (Lúcio Costa punha comércio local e escola
junto das superquadras) e na **estrutura viária**.

## Os quatro algoritmos principais

| Algoritmo | Onde está | Para que serve no projeto |
|---|---|---|
| **BFS** (busca em largura) | `bfs` em `js/caminhos.js`; versões diretas em `contextoRede` e `eixoEconomia` (`js/nota.js`), `conexo` (`js/gerador.js`) e `matrizDeSaltos` (`js/usoDoSolo.js`) | Conta ruas entre serviços e moradias (critério 1), separa os blocos do polo econômico (critério 2) e testa a conexidade da malha |
| **Dijkstra** | `dijkstra` e `dijkstraMultiOrigem` em `js/caminhos.js` | Caminho mínimo de uma origem (menu) e distâncias usadas para escolher o local do presídio |
| **Floyd-Warshall** | `floydWarshall` e `caminhoFloyd` em `js/caminhos.js` | Distâncias entre todos os pares: base dos critérios 3 e 4 e da otimização; opção do menu Caminho mínimo |
| **Kosaraju** | `componentesFortementeConexas` em `js/conexidade.js`, usando a `dfs` de `js/caminhos.js` | Conexidade forte e correção das ruas de mão única |

A DFS (primeira etapa do Kosaraju) e a busca local do botão "Melhorar cidade" são algoritmos de apoio.
"Componentes conexas" e "excentricidade" não são algoritmos: são o que a BFS e o Floyd-Warshall calculam.

## Algoritmos no menu

- **Nota da cidade** — os quatro eixos, com realces no mapa.
- **Caminho mínimo** — dois algoritmos, pela distância:
  - **Dijkstra** — de uma origem para todos, O((|V| + |A|) log |V|). É o mais
    eficiente quando os pesos são positivos, e toda rua tem comprimento
    positivo, o que dispensa o Bellman-Ford.
  - **Floyd-Warshall** — todos os pares de uma vez, O(|V|³). É o que a nota e o
    "Melhorar cidade" usam por dentro.

  Os dois sempre chegam à mesma distância. O BFS continua no projeto, contando
  ruas no eixo 1.
- **Estruturas de dados** — abre as matrizes completas da cidade atual: a de
  **adjacência** (|V| × |V|, com a opção de mostrar a distância em km) e a de
  **incidência** (|V| × |A|, −1 onde o arco sai e +1 onde chega). Cabeçalhos
  fixos na rolagem; passar o mouse numa célula explica o que ela significa. O
  programa guarda o grafo em lista de adjacência e monta as matrizes a partir
  dela.

## Testes

`testes.html` confronta cada algoritmo com uma verificação independente —
Dijkstra × Floyd-Warshall em todos os pares de cinco cidades, os dois × força
bruta (todos os caminhos simples) em duas cidades pequenas, BFS × Dijkstra com
todas as ruas valendo 1, Kosaraju × alcançabilidade mútua — e confere as regras:
nenhuma rua cruzando outra fora de uma esquina, no máximo 6 ruas por esquina,
linhas e colunas da matriz de adjacência somando os graus, ruas contínuas com o
mesmo nome, mão única só em travessas e ruas, nome de bairro só em zona
residencial, nenhum nome repetido, CESUPA, nota rápida igual à detalhada, os
eixos 1 e 2 em cenários feitos à mão, mesma semente gerando a mesma cidade e o
"Melhorar" nunca piorando a nota, nunca sumindo com lugares e nunca movendo
presídios.
