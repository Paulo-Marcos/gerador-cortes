# Aceitação da Sala escura (H-25, D-1195)

A auditoria que fecha o épico E-069. Ela confere a lista da [§8.2](DIRECAO.md#82-lista-de-aceitação-web-interface-guidelines-da-vercel-adaptada)
tela a tela, conta o blur da [§3.6](DIRECAO.md#36-desempenho-da-luz-regra-não-sugestão) e mede o editor.
Conferida em 22/11/2026, na `main` em `da04eaaa` (H-24 e D-1147 já dentro), mais as correções desta história.

## Como foi medido

- **Stack própria e dados sintéticos.** Backend em 8295 e frontend em 4395. Os dados foram criados pelo ORM: uma live de 10 min, 6 cortes,
  o corte 1 com 5 min de bruto e 3 shorts em cada Fire. Os vídeos são `testsrc2` do ffmpeg, e o corte 3 tem título de ~150 caracteres.
  O "canal novo" (G12) é a Biblioteca com `GET /api/projetos` respondendo `[]`. Nada veio da PROD.
- **17 telas:** Biblioteca, Cortes da live, Editor, Pós, Metadados, Revisão, Shorts (lista, Curadoria, Prateleira), Prontos,
  Configurações, Análises, Fila, Atalhos, Novidades, a paleta de comandos e o canal novo. Cada uma foi vista em
  **Escuro e Claro, a 1440 e 1920 px** (68 combinações).
- **Pelo teclado:** em cada combinação, o script (Playwright sobre o Chrome) percorre até 70 paradas de Tab e volta 6 com Shift+Tab.
  Em cada parada ele anota se o anel de foco aparece, inclusive dentro de shadow DOM, e se o foco está coberto ou fora da tela.
  Enter, Esc e setas foram exercitados à mão no navegador, nos componentes compartilhados: paleta, menu ⋯, Dialog (Novo canal,
  Editar identidade), troca de canal e Riscar/Desfazer.
- **Medido no DOM** (`getComputedStyle` sobre os elementos visíveis): `backdrop-filter`, aurora, h1, marcos `<main>`, link de pular,
  nomes acessíveis, rótulos, `<img>`, `aria-live`, overflow horizontal, `color-scheme`/`theme-color`, primários, reticências,
  aspas e fonte < 11 px. Também foi medido em três modos: "Reduzir efeitos", `prefers-reduced-transparency` e `prefers-reduced-motion`.
  O estado de erro foi visto com o backend bloqueado por 20 s.
- Scripts, JSON e capturas ficam fora do git, na pasta de notas da sessão (`side-session-notes/…/D-1195-auditoria/`):
  `auditar.py`, `erro.py`, `desempenho.py`, `auditoria-final.json`, `auditoria-antes-escuro.json` e `capturas/`.

## Resumo

| | |
|---|---|
| Itens **A** (catraca ou teste) | **12 de 12 passam**: `shared/qualidade` (24 arquivos, 176 testes) e `selo.test.tsx` |
| Itens **R** (revisão) | **27**: 20 passam (4 deles por correção desta história), 2 passam em parte (um com parte corrigida aqui) e 5 falham; o que falta virou proposta |
| Blur por tela | no máximo **3** superfícies (teto ~6); **0** no Editor, na Pós, na Revisão, na Curadoria e na Prateleira |
| Saídas de emergência | "Reduzir efeitos", transparência reduzida e movimento reduzido zeram vidro, aurora e animação nas 17 telas |
| Editor | pronto em **~2,2 s**, nenhum quadro acima de 50 ms ao tocar, arrastar ou clicar na onda, nenhuma long task durante o uso; **igual à `main` antes do épico** |
| Correções aqui | 7, cada uma com teste que falha antes e passa depois |
| Propostas | 9 (D-1196 a D-1204) |

## Itens A

| Item da §8.2 | Onde se prova | Resultado |
|---|---|---|
| botão só de ícone tem `aria-label` | medido: 0 botões sem nome em 68 combinações; `trilhoRecolhidoD1195.test.tsx` | passa (o trilho recolhido foi corrigido aqui) |
| exatamente um primário por tela | `umPrimarioPorTela`, `reguaDePrimarios.d1165`; medido: 1 ou 0 em todas | passa |
| `Selo` nunca usa `iris` nem `feixe` | `components/ui/__tests__/selo.test.tsx` | passa |
| nenhum `outline-none` fora da regra global | `semTransicaoTotal` (conta `outline-none` sem par) | passa |
| sem `uppercase` | `caixaAlta`; medido: 0 | passa |
| nada abaixo de 11 px | `pisoDeFonte`; medido: 0 | passa |
| `backdrop-filter` só na casca | `vidroSoNaCasca` | passa |
| `feixe` só nos lugares marcados | `feixeSoNoLugar` | passa |
| sem `transition: all` | `semTransicaoTotal` | passa |
| nenhuma cor literal fora dos tokens | `corLiteral`, `corLiteralCss` | passa |
| `cc-canal-*` só no avatar e na luz do canal | `territorioDoCanal` | passa |
| um `<main>` por tela (novo, desta auditoria) | `umMainPorTela.d1195.test.ts` | passa (corrigido aqui) |

## Itens R

"Passa" vale para as 17 telas, nos dois temas e nas duas larguras, salvo quando a linha diz outra coisa.

| # | Item da §8.2 | Resultado | Onde falha e o que acontece | Destino |
|---|---|---|---|---|
| 1 | ação é `<button>`, navegação é `<a>` | passa | 0 clicáveis sem papel | — |
| 2 | todo controle tem rótulo ligado | passa | 0 campos sem rótulo | — |
| 3 | um `h1` por tela; "Pular para o conteúdo" | passa, corrigido | o h1 e o link (para `#conteudo`) existiam em todas, mas Configurações, Metadados, Curadoria, Prateleira e Prontos desenhavam um segundo `<main>` dentro do da casca | D-1195 |
| 4 | toast e validação em `aria-live` | passa | região `status` e `polite` em todas; erro do `Field` em `role="alert"` | — |
| 5 | player e mapa operáveis pelo teclado | passa | `<video>` com controles nativos; o mapa da live são links; a onda recebe foco (ver 7) | — |
| 6 | um selo por item | passa | nas capturas | — |
| 7 | foco visível nos dois temas, sobre vidro e aurora | passa, corrigido | antes: no Editor e na Curadoria, o Tab parava na rolagem da onda (shadow DOM do wavesurfer) sem anel | D-1195 |
| 8 | diálogo e gaveta prendem e devolvem o foco; `overscroll-behavior: contain` | passa, corrigido | o foco preso e devolvido já passava (Dialog, paleta, troca de canal); faltava `overscroll-contain` em todo o app. O menu ⋯ não andava pelas setas | D-1195 |
| 9 | barra de ação e linha do topo não cobrem o foco | passa | 0 paradas cobertas ou fora da tela | — |
| 10 | `name`, `autocomplete="off"`, `type`; `spellCheck={false}` em URL | em parte | `autocomplete` e `spellCheck` corrigidos nos primitivos. Faltam o `name` em Metadados (2), Shorts, Atalhos, paleta, Curadoria (3), Nova live e Novo canal (8) | D-1195 · **D-1198** |
| 11 | erro ao lado do campo, com o conserto | passa | `Field` desenha o erro sob o campo | — |
| 12 | sair com alteração pendente pede confirmação | **falha** | Configurações › Editar identidade: Esc fecha e perde o texto. Editor, Pós e Metadados passam (salvam ao sair) | **D-1197** |
| 13 | "…", aspas curvas, espaço não separável | passa | 0 "..." na interface; a única aspa reta é texto do CHANGELOG em Novidades | — |
| 14 | número e data por `Intl` | passa | amostra nas capturas ("dom, 22 de nov", contagens, durações) | — |
| 15 | rótulo em frase, verbo + objeto | passa, corrigido | antes: "Inicio", "Play/Pause", "Ferramentas avancadas", "regiao", "Marcar inicio aqui", "Atualizar transcricao"… (os dois últimos com unlock do Paulo, 22/11) | D-1195 |
| 16 | título longo trunca, pai com `min-w-0` | passa | 0 px de overflow horizontal; o título de 150 caracteres trunca com reticências | — |
| 17 | os quatro estados desenhados | **falha** | com o backend fora, o Editor fica em "Carregando o corte…", Análises não avisa e a Fila mostra "Nada na fila"; Shorts e Prontos avisam sem "Tentar de novo"; várias mostram "Failed to fetch" cru | **D-1204** |
| 18 | irreversível pede diálogo; reversível oferece desfazer | passa | Remover projeto pede o diálogo destrutivo; Riscar corte oferece Desfazer | — |
| 19 | `<img>` com `width`, `height`, `loading`, `alt`; capa sem distorção | **falha** | `alt` e `object-fit: cover` passam; `width`/`height` faltam em Biblioteca, Cortes da live, Pós, Metadados e Revisão | **D-1199** |
| 20 | lista com mais de 50 itens usa `content-visibility` | **falha** | nenhum uso no código; o dado sintético não passa de 50 itens | **D-1203** |
| 21 | no máximo ~6 superfícies com blur | passa | máximo 3 (ver a tabela abaixo) | — |
| 22 | Editor e Pós sem blur e sem capa na aurora | passa | 0 superfícies; aurora em `halos` | — |
| 23 | "Reduzir efeitos" e `prefers-reduced-transparency` tiram vidro e aurora | passa | 0 superfícies e aurora `nenhuma` nas 17 telas, nos dois modos | — |
| 24 | `prefers-reduced-motion` respeitado | passa | 0 animações rodando nas 17 telas | — |
| 25 | `color-scheme` e `theme-color` acompanham | passa | `dark`/`#07080b` e `light`/`#eceef5` | — |
| 26 | tela conferida em Escuro e Claro | em parte | as 68 combinações conferidas. No Escuro, o subtítulo do cabeçalho de Cortes da live e de Metadados fica a ~1,5–2,6:1 sobre a aurora de uma capa clara (§8.1) | **D-1196** |
| 27 | filtro, aba, ordenação e corte aberto na URL | **falha** | o corte aberto passa; a aba de Configurações e os filtros de Shorts não vão para a URL | **D-1202** |

A auditoria também achou dois problemas fora das linhas da §8.2:

- **Paleta sem papel de combobox (D-1200).** Ela funciona pelas setas, Enter, Tab e Esc, mas o leitor de tela não anuncia qual opção as setas escolheram.
- **Foco perdido ao riscar ou trocar de corte no Editor (D-1201).** O botão some e o foco cai no `<body>`.

## Por tela

Blur: superfícies com `backdrop-filter` visíveis. Os quatro números são Escuro 1440, Escuro 1920, Claro 1440 e Claro 1920.
"Tab" conta as paradas percorridas (até 70). "Sem anel" e "coberto" são contados depois das correções.

| Tela | Blur | Aurora | Tab | Sem anel / coberto | Falhas R que ficam |
|---|---|---|---|---|---|
| Biblioteca | 1 · 1 · 1 · 1 | halos | 30 (volta ao início) | 0 / 0 | 19 |
| Cortes da live | 3 · 3 · 3 · 3 | capa | 70 | 0 / 0 | 19, 26 |
| Editor | 0 · 0 · 0 · 0 | halos | 70 | 0 / 0 | 17, foco ao riscar |
| Pós | 0 · 0 · 0 · 0 | halos | 62 | 0 / 0 | 19 |
| Metadados | 3 · 3 · 3 · 3 | capa | 48 | 0 / 0 | 10, 19, 26 |
| Revisão | 0 · 0 · 0 · 0 | halos | 44 | 0 / 0 | 19 |
| Shorts | 1 · 1 · 1 · 1 | halos | 25 | 0 / 0 | 10, 17 (sem tentar), 27 |
| Curadoria | 0 · 0 · 0 · 0 | halos | 54 | 0 / 0 | 10 |
| Prateleira | 0 · 0 · 0 · 0 (era 3; D-1147) | halos | 23 | 0 / 0 | — |
| Prontos | 2 · 2 · 2 · 2 | halos | 17 | 0 / 0 | 17 (sem tentar) |
| Configurações | 1 · 1 · 1 · 1 | halos | 60 | 0 / 0 | 10 (Novo canal), 12, 27 |
| Análises | 1 · 1 · 1 · 1 | halos | 20 | 0 / 0 | 17 |
| Fila | 1 · 1 · 1 · 1 | halos | 17 | 0 / 0 | 17 |
| Atalhos | 1 · 1 · 1 · 1 | halos | 70 | 0 / 0 | 10 |
| Novidades | 1 · 1 · 1 · 1 | halos | 66–70 | 0 / 0 | — |
| Paleta | 1 · 1 · 1 · 1 | (Biblioteca) | setas, Enter, Tab, Esc | — | 10, papel de combobox |
| Canal novo | 1 · 1 · 1 · 1 | halos | 21 | 0 / 0 | 10 |

A superfície de blur que se repete é o trilho (`aside.cc-vidro-casca`). Cortes da live e Metadados somam a trilha da live
("Etapas da live") e a barra de ação; Prontos soma a barra de ação. A paleta, o menu e o diálogo não desfocam (são flutuantes chapados). Nenhuma tela com vídeo tem vidro. A Prateleira entrou em `TELAS_COM_VIDEO` pela D-1147
(`upgrade/luzDaSala.ts`) e foi medida depois dela.

## Desempenho do editor

O corte 1 tem bruto `testsrc2` 1280×720 a 30 fps e 5 min. Medido no Chrome (headless, Playwright) desta máquina, a 1440×900, no
Escuro, com efeitos ligados. Foram 5 repetições depois de um aquecimento (o Vite compila na primeira visita); a tabela dá a mediana.
"Antes" é a `main` em `399f9e32`, o último commit antes do primeiro código do épico, servida pelo mesmo backend com o mesmo dado.

| Medida | Antes (`399f9e32`) | Depois (H-25) |
|---|---|---|
| pronto (onda montada e `<video>` com `readyState ≥ 3`) | 2 269 ms | 2 235 ms |
| interativo (fim da última long task antes de 2 s de silêncio) | 2 269 ms | 2 235 ms |
| long tasks na carga: quantas · soma · maior | 4 · 443 ms · 221 ms | 3 · 434 ms · 192 ms |
| TBT da carga | 264 ms | 284 ms |
| tocar 6 s: quadros de rAF por segundo · p95 do intervalo | 47,5 · 25,3 ms | 46,6 · 25,3 ms |
| tocar: intervalos > 50 ms · long tasks | 0 · 0 | 0 · 0 |
| tocar: quadros do vídeo descartados (de ~180) | 30 | 34 |
| arrastar a agulha 3 s sobre a onda: rAF/s · p95 · > 50 ms · long tasks | 44,8 · 25,4 ms · 0 · 0 | 45,7 · 25,2 ms · 0 · 0 |
| 30 cliques de busca seguidos: rAF/s · p95 · > 50 ms · long tasks | 43,5 · 24,9 ms · 0 · 0 | 43,9 · 25,2 ms · 0 · 0 |

O épico não custou desempenho ao editor: as duas colunas empatam dentro da variação entre repetições (pronto entre 2,2 e 2,8 s nas duas).
Os ~45 quadros de rAF por segundo e os ~30 quadros de vídeo descartados vêm do Chrome headless, que não sincroniza com o monitor, e
aparecem iguais antes e depois. O número absoluto vale para esta máquina; o que importa é a comparação. Os traces do DevTools
(Performance) da primeira repetição de cada lado ficaram na pasta temporária da sessão: são 128 MB cada e não entram no git.

## Correções desta história

Cada pedido tem um teste que falhou antes da correção e passa depois.

| Falha (tela, item) | Correção | Teste |
|---|---|---|
| telas de live, item A de ícone: link do trilho recolhido sem nome além do `title` | `upgrade/GlobalRail.tsx`: `aria-label` quando recolhido, com o aviso | `upgrade/__tests__/trilhoRecolhidoD1195.test.tsx` |
| Configurações, Metadados, Curadoria, Prateleira, Prontos, item 3: segundo `<main>` | `<main>` → `<div>` nas cinco telas | `shared/qualidade/__tests__/umMainPorTela.d1195.test.ts` |
| todo diálogo e gaveta, item 8: rolagem vazava para trás do véu | `components/ui/dialog.tsx`: `overscroll-contain` no miolo | `components/ui/__tests__/dialogRolagemD1195.test.tsx` |
| Editor e Curadoria, item 7: onda com foco sem anel | `index.css`: `.onda-com-foco ::part(scroll):focus-visible`; a classe em `TimelinePanel.tsx` e `ReguaDeOnda.tsx` | `features/editor/fase1/__tests__/focoNaOnda.d1195.test.tsx` |
| Editor e Pós, item 15: rótulos sem acento e em inglês | `TimelinePanel`, `RightTabsPanel`, `BrutoContextStrip`, `AdicionarCorteModal`, `CenaItem`, `SceneTimeline`; a referência em `TimelinePanel.cores.test.tsx` e `RightTabsPanel.test.tsx` com unlock | `shared/qualidade/__tests__/acentoNoNomeAcessivel.d1195.test.ts` |
| Metadados, Shorts, Atalhos, paleta, item 10: campos sem `autocomplete="off"`; URL com corretor | `Input`, `Busca` e `Textarea` nascem com `autocomplete="off"`; `type="url"` ganha `spellCheck={false}`; quem chama pode trocar | `components/ui/__tests__/campoSemPreenchimentoD1195.test.tsx` |
| Biblioteca, linha do corte, Metadados, item 8: menu ⋯ sem setas | `components/ui/overflow-menu.tsx`: setas, Home, End; o foco entra no primeiro item e volta ao gatilho | `components/ui/__tests__/overflowMenuTecladoD1195.test.ts` |

## Propostas (Planejadas, `--from D-1195`)

| Demanda | Tela e item | Arquivo de partida |
|---|---|---|
| D-1196 | Cortes da live, Metadados: contraste do cabeçalho sobre a aurora de uma capa clara (§8.1) | `components/ui/aurora.tsx` (véu), `upgrade/ScreenHeader.tsx` |
| D-1197 | Configurações: diálogo descarta alteração sem perguntar (item 12) | `components/ui/dialog.tsx`, `features/channels/ChannelForm.tsx` |
| D-1198 | todas com campo: `name` (item 10) | ~50 `<input>` fora dos primitivos |
| D-1199 | Biblioteca, Cortes da live, Pós, Metadados, Revisão: `<img>` sem `width`/`height` (item 19) | `components/ui/miniatura.tsx`, `upgrade/ContextColumn.tsx`, `features/projetos/CartaoContinue.tsx` |
| D-1200 | paleta: papel de combobox e listbox | `upgrade/PaletaDeComandos.tsx` |
| D-1201 | Editor: foco cai no `<body>` ao riscar ou trocar de corte | `features/editor/useEditorPage.tsx` |
| D-1202 | Configurações, Shorts: aba e filtro fora da URL (item 27) | `features/channels/ChannelsPage.tsx`, `features/shorts/ShortsPage.tsx` |
| D-1203 | listas longas: `content-visibility` (item 20) | Biblioteca, Shorts, Prontos, Ranking |
| D-1204 | Editor, Análises, Fila (e Shorts, Prontos): estado de erro (item 17) | `components/ui/estado-de-erro.tsx` e as páginas |

## Limites da medição

- **Leitor de tela.** A auditoria mediu papéis, nomes e foco no DOM, mas não ouviu um leitor de tela (NVDA) de ponta a ponta.
- **Desempenho.** Medido em Chrome headless, sem sincronia com o monitor e sem GPU de vídeo dedicada. Ele compara antes e depois,
  mas não mede a fluidez absoluta na tela do Paulo, e a §3.6 pede essa medida na máquina dele.
- **Lista longa.** Com 6 cortes, o item 20 não pôde ser medido em uso.
- **Primeira rodada sujou o Claro.** O Vite recarregou correções no meio da primeira rodada, e ela caiu no Claro. Por isso o "antes"
  desta auditoria (`auditoria-antes-escuro.json`) é só do Escuro. A rodada final rodou com o código congelado.
