# D-1111 — Direção de design do CutCut: Sala escura (rodada 6, final)

> Especificação para o Opus conduzir e para Sonnet e Haiku executarem **sem tomar decisão de design**. Onde este documento decide, o executor cumpre; onde não cobre, o executor para e pergunta.
>
> - **Design System** (tokens nos dois temas, 20 componentes com prévia e README): https://claude.ai/artifact/1aukM5aXvYF1g2pB41acwr
> - **Canvas** https://claude.ai/artifact/EQ46AYq2dyze9s5zxqP1yU: página **"F · Identidade"** (F0 fundamentos, F1 componentes em todos os estados) e página **"G · CutCut (final)"** (13 telas, G01 a G13).
> - **CSS de referência** de todos os componentes: [`referencia/sala-escura.css`](referencia/sala-escura.css). É a fonte dos valores exatos.
> - **Capturas:** ficam fora do git, na pasta de trabalho da D-1111 (`.guia/tmp/D-1111/design/rodada5/` e `rodada6/`); o canvas é a fonte visual.
> - A direção anterior (tecla, poço e régua) foi **recusada** pelo dono; ver o ADR-0018. Os arquivos das rodadas 1 a 4 não entram no repositório.
>
> Os dois artifacts são privados até o dono compartilhar.

**A direção em uma frase:** Sala escura: a única luz é o vídeo. O cromo apaga, a capa da live vira a aurora, o vidro pega essa luz e um único feixe aponta a ação da tela.

**O que o dono aprovou (15/11/2026):** a identidade da prancha F e as quatro telas, sem mudança; e o feixe lavanda → céu → menta como assinatura **fixa do CutCut**, que não muda de canal para canal.

**O que mudou desde a rodada 4:** a usabilidade ficou (um primário por tela, um selo por item, medidor no lugar das siglas, vermelho só para erro, piso de 11 px, AA, foco visível) e a organização ficou (casca, telas, mapa da live, régua de dias, "Continue de onde parou"). Saiu a forma inteira: tecla com aresta, poço com sombra interna, régua e agulha, neutros quentes, barra lateral pintada na cor do canal, três famílias de fonte. Entraram: escuro primeiro, aurora, vidro, fio de luz, feixe, pílula, e a regra "aceso × apagado".

---

## 1. Diagnóstico (números da `main` em `e3cd05e5`, conferidos em 15/11)

| Achado | Medida |
|---|---|
| Acento e erro são a mesma cor | `--wb-accent` `oklch(0.52 0.165 28)` × `--wb-err` `oklch(0.58 0.18 25)`: 3° de matiz (`src/index.css`, linhas 47 e 70) |
| Três vocabulários de token | 1.853 `var(--wb-…)`; mais as variáveis curtas da `.ap` (`upgrade/upgrade.css`, 690 linhas) e as escalas `bg-*`, `text-*`, `surface-*`, `accent-*` do `tailwind.config.ts` |
| Cinco temas para um operador | `light`, `papel`, `nevoa`, `ardosia`, `dark` (`upgrade/useUpgradeTheme.ts`, linha 21), mais as paletas |
| Aparência dentro das telas | 736 `style={{` nos `.tsx` |
| Fonte principal nem é carregada | `--font-sans` começa por `'DM Sans'` (`index.css`, linha 17); o `index.html` pede Geist, Geist Mono, Outfit, Inter, Lora, JetBrains Mono, Anton, Bebas Neue, Montserrat, Poppins e Oswald |
| Componentes em dobro | três diálogos (`modal`, `confirm-dialog`, `UpgradeModal`), dois toasts (`toaster`, `UpgradeToast`), três botões de IA (`acao-de-ia`, `claude-button`, `gemini-button`), um menu à mão (`overflow-menu`) |
| O app é claro por padrão | o `:root` do `index.css` é o tema claro; as quatro referências do dono são escuras |
| `backdrop-filter` já existe | 9 ocorrências em `index.css` e `upgrade.css`, e 9 arquivos `.tsx` com `backdrop-blur`: o custo já é conhecido, falta a regra |

Já existem e **ficam**: as catracas `corLiteral.test.ts`, `pisoDeFonte.test.ts` (piso de 11 px, D-859), `tamanhoDeFuncao.test.ts`, `emojiForaDaInterface.test.ts`, `iconeDoTema.test.ts` e `umConceitoUmDesenho.test.ts` em `src/shared/qualidade/__tests__/`; o `comAlfa()` do `tailwind.config.ts` (D-841); `lucide-react` 0.469; `@radix-ui/react-slot` e `react-tooltip`.

---

## 2. Princípios, em ordem

| # | Princípio | A decisão que ele força |
|---|---|---|
| 1 | **A palavra do domínio é lei.** | Rótulo = glossário. Sem siglas (`BRU`, `GRD`), sem caixa-alta, sem "p/" |
| 2 | **A única luz é o vídeo.** | Escuro primeiro. A cor da tela vem da capa (aurora); o cromo é preto azulado e vidro |
| 3 | **Um primário por tela.** | Um `Button primary` no HTML: na barra de ação, ou no cartão "Continue" da Biblioteca |
| 4 | **Um selo por item.** | O resto é texto de metadado |
| 5 | **Profundidade por luz, nunca por aresta.** | Halo, vidro, fio claro, sombra difusa só no que flutua. Nada de aresta dura, sombra interna de poço ou peça que afunda |
| 6 | **Aceso × apagado.** | O que importa brilha: corte pronto é pílula clara, corte aberto é o feixe, trecho que fica é iluminado e o que sai fica sob véu |
| 7 | **Três territórios de cor.** | Feixe = a ação única e o "onde estou". Íris = o que se aperta e o marcado. Estado = selo, medidor, mensagem |
| 8 | **O canal veste o app pela mídia.** | Aurora da capa, anel do avatar, saudação e destino. O feixe é do CutCut e não muda |
| 9 | **Resumo antes do detalhe; todo dado tem quatro estados.** | Medidor + frase; anel + número; vazio, carregando, erro e com dados, desenhados |
| 10 | **Tudo pelo teclado, foco sempre visível.** | Um anel de 2 px; atalhos em `Kbd` |
| 11 | **A luz é barata, o blur ao vivo não.** | Aurora pré-desfocada; `backdrop-filter` só na casca; nada disso sobre vídeo tocando (§3.6) |
| 12 | **O sistema se defende sozinho.** | Catracas no `vitest`; o teto só desce |

---

## 3. Linguagem de forma

É isto que torna um componente "do CutCut". O detalhe de cada um está no README dele, no Design System.

### 3.1 Os quatro gestos

| Gesto | Receita | Onde pode | Onde nunca |
|---|---|---|---|
| **Aurora** | a capa da live aberta em miniatura, ampliada e desfocada; dois halos fixos (`cc-halo-iris`, `cc-halo-menta`); véu para `cc-bg` na metade de baixo | fundo da tela, um por tela | fundo de cartão, botão, selo |
| **Vidro** | fundo translúcido + fio de 1 px + brilho interno de 1 px no topo; `backdrop-filter` só na casca | painel, cartão, trilho, menu, diálogo | sobre vídeo tocando |
| **Fio de luz** | borda de 1 px em degradê, por `mask-composite` (`.cc-fio`) | **um** cartão por tela | linha de lista, botão |
| **Feixe** | `linear-gradient(100deg, cc-feixe-a, cc-feixe-b 52%, cc-feixe-c)` | botão primário; **uma** palavra do `h1`; "onde estou" (traço da aba atual, bolinha da etapa atual, corte aberto no mapa, rótulo da agulha); fio de luz | selo, chip, ícone, gráfico, barra de progresso, fundo de painel |

Quem leva o fio de luz: Biblioteca → cartão "Continue"; Cortes da live → o mapa; Configurações → cartão de identidade do canal; canal novo → cartão "Cole o link". As outras telas, ninguém.

### 3.2 Pílula, cartão, ladrilho

- **Pílula (raio 999):** tudo que se aperta ou informa em uma linha: botão, chip, selo, segmented, busca, corte no mapa, barra de ação, trilha da live.
- **Cartão (raio 20 a 26):** painel, cartão de live, KPI, trilho (24), diálogo e gaveta (26). A capa dentro dele usa 14.
- **Ladrilho (raio 9 a 12):** campo (12), ícone do trilho (9), item de menu (10), miniatura (10), etiqueta e checkbox (6).

### 3.3 Aceso × apagado

| Peça | Apagado | Aceso | No feixe |
|---|---|---|---|
| Corte no mapa | proposto: vidro `cc-vidro-3`; riscado: contorno tracejado | pronto: pílula `cc-fg` a 88%, número escuro, halo | o corte aberto |
| Linha do tempo do editor | o que sai: véu listrado sobre filmstrip e onda | o que fica: sem véu | a agulha (traço branco + rótulo no feixe) |
| Etapa da trilha | falta: contorno | feita: bolinha `cc-vidro-3` com visto | a etapa atual |
| Capa em destaque | — | a capa projeta a própria luz (cópia desfocada atrás) | — |

### 3.4 Estados, em todos os componentes

| Estado | Botão | Campo e controles |
|---|---|---|
| Repouso | pílula de vidro, fio `cc-fio-2`, brilho no topo (primário: feixe + brilho embaixo) | fundo `cc-poco`, fio `cc-fio-campo` |
| Hover | clareia para `cc-vidro-3` (primário: +7% de brilho e halo de 4 px) | fio a 62% de `cc-fg` |
| Ativo | `scale(.97)`, o brilho recolhe; 120 ms | — |
| Foco | anel de 2 px `cc-foco`, afastado 2 px (`:focus-visible`) | campo: fio `cc-iris` + halo de 3 px `cc-iris-suave`; controles: o anel |
| Carregando | `aria-busy`, giro, gerúndio com "…" | desabilitado + giro + "Carregando…" + a frase do que busca |
| Desabilitado | sem fundo, fio `cc-fio`, texto `cc-fg-off` | fio tracejado, sem fundo |
| Inválido | — | fio `cc-erro`, halo vermelho, mensagem ligada |
| Ligado / marcado | fundo `cc-iris-suave`, fio `cc-iris-fio`, texto `cc-iris-2`, visto | fundo `cc-iris`, visto `cc-sobre-iris` |

### 3.5 Elevação e movimento

- Cartão, lista e painel: **fio de 1 px, nenhuma sombra**. Só o que flutua (menu, diálogo, gaveta, toast) tem sombra, e ela é difusa (`cc-sombra-pop`).
- Movimento: 120 ms (cor, apertar), 150 a 200 ms (hover de cartão, menu, toast), 240 ms (diálogo, gaveta). Só `transform`, `opacity`, cor e `box-shadow`. Com `prefers-reduced-motion`, tudo troca na hora. **Nenhum layout depende de animação.**

### 3.6 Desempenho da luz (regra, não sugestão)

O risco é real: `filter: blur(90px)` sobre uma imagem de 1280 px e `backdrop-filter` em muitos painéis custam composição a cada quadro, e o editor toca vídeo.

| Regra | Como se cumpre |
|---|---|
| A aurora é **uma imagem pequena desfocada uma vez** | o `<img>` usa a miniatura de 64 px de largura da capa (dado novo B-3; enquanto não existe, o front reduz a capa num `<canvas>` uma vez por live e guarda o `blob:`). Desfocar 64 px ampliados é barato |
| A aurora é uma camada só e **não anima** | `transform: translateZ(0)`, `pointer-events: none`, `aria-hidden`. Trocar de live troca o `src` com `opacity` de 200 ms; nunca se anima `filter` |
| `backdrop-filter` só na casca | permitido em: trilho, barra de ação, trilha da live, cartão com fio de luz, menu, popover, diálogo, gaveta, toast. **Proibido** em cartão de lista, linha, tabela, campo e painel de trabalho, que usam `cc-vidro` chapado |
| **Nada de blur sobre vídeo tocando** | no Editor e na Pós a aurora cai para os dois halos (sem capa), e o trilho, a barra de ação e os painéis laterais usam `bg-painel-solido` (sem `backdrop-filter`). O palco tem o fundo desfocado próprio, que é uma imagem parada do quadro, não do vídeo |
| No máximo ~6 superfícies com `backdrop-filter` por tela | contar na revisão de cada tela (lista da §8.2) |
| Saída de emergência | `prefers-reduced-transparency`, o modo foco (`upgrade/useModoFoco.ts`) e uma opção "Reduzir efeitos" em Configurações › Aplicação trocam vidro por sólido e tiram a aurora |
| Medir antes de fechar | H-13 mede no navegador, na máquina do Paulo, o editor tocando vídeo com e sem efeitos (quadros perdidos no painel Performance). Se cair, o editor fica sem `backdrop-filter` nenhum |

---

## 4. Tokens

Arquivo novo e único: `frontend/src/styles/tokens.css`. Prefixo `--cc-` (os nomes curtos `--accent`, `--ok`, `--line` já existem na camada `.ap` com outros valores, e as duas convivem na migração). Valores completos e nota de uso de cada um: `tokens.json` do Design System (41 cores, nos dois temas).

### 4.1 Cor (Escuro / Claro)

| Token | Escuro | Claro | Classe |
|---|---|---|---|
| `--cc-bg` | `#07080b` | `#eceef5` | `bg-app` |
| `--cc-bg-2` | `#0d0e13` | `#f6f7fb` | `bg-app-2` |
| `--cc-painel` | `rgba(15,17,23,.66)` | `rgba(255,255,255,.72)` | `bg-painel` |
| `--cc-painel-solido` | `#0c0e13` | `#fafafc` | `bg-painel-solido` |
| `--cc-vidro` / `-2` / `-3` | branco a 4,5 / 8 / 13% | branco a 58 / 82 / 100% | `bg-vidro` `bg-vidro-2` `bg-vidro-3` |
| `--cc-pop` | `rgba(24,26,34,.94)` | `rgba(255,255,255,.97)` | `bg-pop` |
| `--cc-poco` | `rgba(0,0,0,.32)` | `rgba(14,18,32,.05)` | `bg-poco` |
| `--cc-fio` / `-2` | branco a 9 / 17% | tinta a 8 / 15% | `border-fio` `border-fio-2` |
| `--cc-fio-topo` | branco a 14% | branco a 95% | `shadow-topo` (inset) |
| `--cc-fio-campo` | branco a 36% | tinta a 46% | `border-campo` |
| `--cc-fg` / `-2` / `-3` / `-off` | `#f4f5f8` / `#bcc0cc` / `#9196a4` / `#5d616d` | `#0d0f17` / `#3d414e` / `#585d6b` / `#9b9fab` | `text-fg` `text-fg-2` `text-fg-3` `text-fg-off` |
| `--cc-iris` / `-2` | `#aa9dff` / `#c2b8ff` | `#5443d6` / `#4334bd` | `text-iris` `bg-iris` |
| `--cc-iris-suave` / `-fio` | íris a 16 / 42% | íris a 10 / 40% | `bg-iris-suave` `border-iris` |
| `--cc-sobre-iris` | `#0d0a24` | `#ffffff` | `text-sobre-iris` |
| `--cc-feixe-a` / `-b` / `-c` | `#cbbcff` / `#96d2ff` / `#8ff2cf` | `#5b46e0` / `#4159e2` / `#2f6fdc` | `bg-feixe` `text-feixe` |
| `--cc-feixe-brilho` | `rgba(150,210,255,.5)` | `rgba(65,89,226,.45)` | `shadow-feixe` |
| `--cc-sobre-feixe` | `#090a12` | `#ffffff` | `text-sobre-feixe` |
| `--cc-ok` | `#74e6ab` | `#0a7442` | `text-ok` |
| `--cc-aviso` | `#ffc56e` | `#8a5100` | `text-aviso` |
| `--cc-erro` / `-cheio` / `--cc-sobre-erro` | `#ff8a8a` / `#ff7b7b` / `#1d0508` | `#b5202c` / `#c9283a` / `#ffffff` | `text-erro` `bg-erro-cheio` |
| `--cc-info` | `#7fc8ff` | `#0a5fa6` | `text-info` |
| `--cc-fire` | `#ff9d57` | `#b84a00` | `text-fire` |
| `--cc-canal-a` / `-b` | `#b9f24a` / `#ffe45c` (padrão; por canal, §4.2) | `#6fae00` / `#d9a400` | só em `avatar-do-canal` |
| `--cc-halo-iris` / `-menta` | `rgba(124,104,255,.32)` / `rgba(64,208,190,.2)` | metade | só em `aurora` |
| `--cc-palco` | `#000000` | `#0b0c10` | `bg-palco` |
| `--cc-veu` | `rgba(4,5,8,.62)` | `rgba(20,24,40,.36)` | `bg-veu` |
| `--cc-foco` | `#ffffff` | `#0d0f17` | `outline-foco` |

Fundo tintado de estado não é token: sai da cor a 13% (`bg-ok/13`), com fio a 22%, pelo `comAlfa()` que já existe. `--cc-painel-solido` é o único token que não está no `tokens.json` do Design System: é o `painel` composto sobre o `bg`, para as telas com vídeo (§3.6); entra na H-02.

### 4.2 O papel de cada cor

| Cor | Papel | Onde pode | Onde nunca |
|---|---|---|---|
| Feixe | a ação única e o "onde estou" | §3.1 | selo, chip, ícone, progresso, fundo |
| Íris `cc-iris` | o que se aperta e o que está marcado | ação de linha, checkbox, switch, radio, chip ligado, botão ligado, ladrilho atual do trilho, foco de campo, faísca da IA | selo; fundo de painel |
| Estado `ok` `aviso` `erro` `info` | em que pé está | selo, medidor, barra de progresso, mensagem, toast | botão (exceto destruir); trilho |
| Canal `cc-canal-a/b` | de quem é a casa | anel do avatar; as duas bolinhas de amostra em Configurações | qualquer outro lugar |

**De onde vem a luz do canal.** Função pura nova `frontend/src/lib/luzDoCanal.ts`, nesta ordem: (1) `Canal.paleta.secundaria` e `.acento`, quando cadastradas; (2) a amostra das capas (dado novo B-3); (3) nada: anel neutro `cc-vidro-3`. Na PROD a paleta do `channel.yaml` está **vazia** (linhas 12 a 15), então hoje vale (2) ou (3). A função trava luminosidade OKLCH ≥ 0,78 no escuro e ≤ 0,62 no claro, para o anel dar 3:1 sobre o painel com qualquer cor. As variáveis são aplicadas **no elemento do avatar**, não no `:root`.

### 4.3 Tipografia

Duas famílias: **Plus Jakarta Sans** 300 a 800 (nova no `index.html`) e **JetBrains Mono** 400 e 500 (o `index.html` já a pede).

```
--font-sans: 'Plus Jakarta Sans', ui-sans-serif, system-ui, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace;
```

| Estilo | Tamanho / linha | Peso | Uso | Classe |
|---|---|---|---|---|
| display | 44 / 50, `-0.028em` | 300, com **uma** palavra em 800 | título da tela (h1); a segunda linha vai em `cc-fg-3` | `text-display` |
| titulo | 22 / 28, `-0.02em` | 700 | cartão em destaque, diálogo, corte aberto | `text-titulo` |
| secao | 16 / 22, `-0.015em` | 700 | seção, painel | `text-secao` |
| linha | 14 / 20 | 600 | título de linha e de cartão | `text-linha` |
| corpo | 13 / 20 | 400 | padrão | `text-corpo` |
| pequeno | 12 / 16 | 500 | metadado, ajuda, selo (600) | `text-pequeno` |
| micro | 11 / 16 | 600 | etiqueta, legenda. **Piso** | `text-micro` |
| sobre | 12 / 16 | 700, `cc-iris` | sobretítulo acima do título | `text-sobre` |
| num | mono 12 / 16 | 400 | timecode, duração, contagem | `num` |
| tc | mono 11 / 16 | 500 | timecode na capa, `Kbd`, rótulo da agulha | `num text-micro` |

A Jakarta tem o espaço entre palavras estreito: o corpo leva `word-spacing: .07em` e o display `.1em` (está no CSS de referência). Sem caixa-alta como hierarquia. As fontes do vídeo (Inter, Lora, Anton, Bebas Neue, Montserrat, Poppins, Oswald) saem do `index.html` e passam a ser carregadas sob demanda por `frontend/src/lib/fontesDoRender.ts` nas telas de prévia. Geist, Geist Mono e Outfit somem.

### 4.4 Espaço, raio, altura, sombra

| Família | Valores |
|---|---|
| Espaço | escala do Tailwind. Usados: 4, 6, 8, 12, 16, 22, 28 px. Margem da casca até a janela: 12 |
| Raio | `pilula` 999 · `dialogo` 26 · `painel` 24 · `cartao` 20 · `bloco` 16 · `capa` 14 · `campo` 12 · `ladrilho` 9 · `etiqueta` 6 |
| Altura | botão 30 / **38** / 46 · campo 40 · linha de corte 72 · barra de ação 62 · trilha 46 · trilho 244 / 64 de largura |
| Sombra | `painel`: escuro `0 30px 70px -36px rgba(0,0,0,.85)`, claro `0 26px 60px -34px rgba(40,50,110,.35)` · `pop`: escuro `0 24px 60px -18px rgba(0,0,0,.8)`, claro `0 24px 60px -20px rgba(30,40,90,.3)` · `feixe`: `0 10px 30px -10px var(--cc-feixe-brilho)` |
| Camadas | `aurora` -1 · `sticky` 10 · `pop` 40 · `modal` 50 · `toast` 60 |

### 4.5 Temas

**Escuro** (padrão), **Claro** e **Auto** (segue `prefers-color-scheme`). `data-theme="dark|light"` no `<html>`, com `color-scheme` e `<meta name="theme-color">` (`#07080b` / `#eceef5`). Saem `papel`, `nevoa`, `ardosia`, `data-glass` e as paletas `wb-palette-*`. Migração do que está salvo: `ardosia`/`dark` → `dark`; `light`/`papel`/`nevoa` → `light`; **ausente → `dark`** (era claro: é a mudança que o operador vai ver).

**Não tocar:** "Tema do render" e "Palco do canal" (Configurações) são do vídeo.

### 4.6 Tailwind (`tailwind.config.ts`)

Reaproveita o `comAlfa()` que já está no arquivo (D-841).

```ts
const cc = (t: string) => comAlfa(`--cc-${t}`);

darkMode: ['selector', '[data-theme="dark"]'],   // hoje é 'class'

colors: {
  app: { DEFAULT: cc('bg'), 2: cc('bg-2') },
  painel: { DEFAULT: 'var(--cc-painel)', solido: cc('painel-solido') },
  vidro: { DEFAULT: 'var(--cc-vidro)', 2: 'var(--cc-vidro-2)', 3: 'var(--cc-vidro-3)' },
  pop: 'var(--cc-pop)', poco: 'var(--cc-poco)', veu: 'var(--cc-veu)', palco: cc('palco'),
  fio: { DEFAULT: 'var(--cc-fio)', 2: 'var(--cc-fio-2)' }, campo: 'var(--cc-fio-campo)',
  fg: { DEFAULT: cc('fg'), 2: cc('fg-2'), 3: cc('fg-3'), off: cc('fg-off') },
  iris: { DEFAULT: cc('iris'), 2: cc('iris-2'), suave: 'var(--cc-iris-suave)', fio: 'var(--cc-iris-fio)' },
  'sobre-iris': cc('sobre-iris'), 'sobre-feixe': cc('sobre-feixe'), 'sobre-erro': cc('sobre-erro'),
  ok: cc('ok'), aviso: cc('aviso'), erro: { DEFAULT: cc('erro'), cheio: cc('erro-cheio') }, info: cc('info'), fire: cc('fire'),
  foco: cc('foco'),
},
backgroundImage: { feixe: 'linear-gradient(100deg, var(--cc-feixe-a) 0%, var(--cc-feixe-b) 52%, var(--cc-feixe-c) 100%)' },
fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
fontSize: {
  display: ['44px', { lineHeight: '50px', fontWeight: '300', letterSpacing: '-0.028em' }],
  titulo: ['22px', { lineHeight: '28px', fontWeight: '700', letterSpacing: '-0.02em' }],
  secao: ['16px', { lineHeight: '22px', fontWeight: '700', letterSpacing: '-0.015em' }],
  linha: ['14px', { lineHeight: '20px', fontWeight: '600' }],
  corpo: ['13px', { lineHeight: '20px' }],
  pequeno: ['12px', { lineHeight: '16px', fontWeight: '500' }],
  micro: ['11px', { lineHeight: '16px', fontWeight: '600' }],
},
borderRadius: { none: '0', etiqueta: '6px', ladrilho: '9px', campo: '12px', capa: '14px', bloco: '16px', cartao: '20px', painel: '24px', dialogo: '26px', pilula: '999px' },
boxShadow: {
  none: 'none', topo: 'inset 0 1px 0 var(--cc-fio-topo)',
  painel: 'inset 0 1px 0 var(--cc-fio-topo), var(--cc-sombra-painel)',
  pop: 'inset 0 1px 0 var(--cc-fio-topo), var(--cc-sombra-pop)',
  feixe: 'inset 0 1px 0 rgb(255 255 255 / .55), 0 10px 30px -10px var(--cc-feixe-brilho)',
},
height: { 'botao-pq': '30px', 'botao-md': '38px', 'botao-gd': '46px', campo: '40px', linha: '72px', barra: '62px' },
```

Os tokens translúcidos (`painel`, `vidro*`, `pop`, `poco`, `fio*`) já carregam o alfa e entram sem `comAlfa`: não aceitam modificador `/NN`. Entra em `theme.extend` durante a migração, ao lado das chaves antigas; na última história sobe para `theme` e a paleta padrão do Tailwind deixa de existir. Em `index.css`, camada `components`: `.num`, `.text-feixe` (`background-clip: text`), `.cc-fio` (a borda em degradê por máscara), `.cc-vidro-casca` (o único lugar com `backdrop-filter`), copiadas de `referencia/sala-escura.css`.

---

## 5. Hierarquia de ação e estado

**Ação.** (1) Primária: uma por tela, no feixe. (2) Secundária: até três, vidro. (3) Fantasma: ferramenta dentro de painel e "voltar". (4) Ação de linha (`LinkDeAcao`, texto `cc-iris`): uma por item. (5) "Mais" (⋯): o resto. Destrutiva: texto `cc-erro`, longe da primária; `cc-erro-cheio` só no confirmar do diálogo. Lote mora na barra de ação com a quantidade ("Publicar 6 cortes"); marcar linhas põe a barra em modo seleção. Botão só de ícone: apenas ícone universal ou grupo de transporte, com `aria-label` e tooltip. "Gerar com IA" dispara no gesto, sem diálogo; a faísca em `cc-iris` é o sinal, o provedor é ícone, não cor.

**O primário de cada tela** (confere com o canvas):

| Tela | Primário | Onde |
|---|---|---|
| Biblioteca | o próximo passo da live em andamento ("Publicar 6 cortes") | cartão "Continue" |
| Biblioteca vazia | Baixar a live | cartão "Cole o link" |
| Cortes da live, Metadados, Revisão | Publicar N cortes | barra de ação |
| Editor | Ir para a Pós | barra de ação |
| Pós | Validar plano → Renderizar → Renderizar de novo | barra de ação |
| Shorts, Configurações, Análises, Fila | **nenhum**: são telas de escolha e de leitura | — |
| Diálogo destrutivo | nenhum no feixe; o confirmar é `danger-solid` | diálogo |

**Selo: seis tons, um por item.** inerte (anel) · neutro (ponto) · curso (giro, `info`) · convite (ponto com halo, `aviso`) · ok (visto) · erro (losango).

| Live (`statusMaps.ts`) | Tom | | Corte | O que a linha mostra |
|---|---|---|---|---|
| aguardando | inerte | | proposto | selo "Proposto"; ação "Editar" |
| baixando, transcrevendo, em análise, publicando | curso | | aprovado/processado com etapas faltando | medidor + "N de 8 · falta …" |
| analisado, em edição | neutro | | pronto | medidor 7 de 8 com o último em `aviso`; selo "Pronto" (convite) |
| pronto para publicar | convite | | no YouTube | selo "No ar" |
| publicado → "No ar" | ok | | rejeitado | selo "Riscado", título riscado; "Trazer de volta" |
| erro | erro | | em render | barra de progresso `info` + percentual |

**Medidor de etapas** (no lugar de `BRU CEN GRD OVL FIN THU MET YT`): oito traços em três grupos — Cenas (Bruto, Cenas) · Render (Filtro, Overlays, Final) · Publicação (Capa, Metadados, YouTube). Feito = `fg-2`; agora = `aviso`; falta = contorno `fio-campo`; falha = `erro`. Sempre com a frase ao lado; popover com os oito nomes. A regra continua em `src/upgrade/tiraDoCorte.ts`; acrescenta-se o campo `nome` em `POR_ROTULO` (não renomear os rótulos de `buildStatusPills`, que são chave e estão em testes travados).

---

## 6. Inventário de componentes

Conferido no repositório: `frontend/src/components/ui/` tem 16 arquivos (`acao-de-ia`, `button`, `card`, `claude-button`, `confirm-dialog`, `gemini-button`, `icon-button`, `imagem-ampliavel`, `input`, `label`, `modal`, `overflow-menu`, `selo-provider`, `thumbnail-placeholder`, `toaster`, `tooltip`); `frontend/src/upgrade/` tem a casca (`UpgradeShell`, `UpgradeChrome`, `TopBar`, `GlobalRail`, `ScreenHeader`, `ActionBar`, `PontaDaBarra`, `TrilhaDeEtapas`, `ContextColumn`, `GavetaDaFila`, `LoteNaFila`, `PaletaDeComandos`, `UpgradeModal`, `UpgradeToast`, `SeloDeEstado`, `Icon`, `BarraDoCorte`, `TiraDoCorteAp`, `MolduraDeVideo`, `UmaTelaPorCorte`, `KitScreen`) e as regras puras (`tiraDoCorte.ts`, `trilhaDaLive.ts`, `medidas.ts`, `modoFoco.ts`, `historicoDaCasca.ts`…); de Radix, só `react-slot` e `react-tooltip`.

**Biblioteca:** modelo shadcn (código no repositório, `cva` + `tailwind-merge`) sobre **Radix**. Acrescentar: `@radix-ui/react-dialog`, `react-dropdown-menu`, `react-popover`, `react-select`, `react-tabs`, `react-toggle-group`. Sem framer-motion, sem biblioteca de toast.

Todos em `frontend/src/components/ui/` salvo indicação; `forwardRef`, `className` mesclado com `cn`, zero `style` de aparência. O README de cada um no Design System traz anatomia, variantes, estados, **quando usar** e **o que não fazer**.

| Componente (README no DS) | Arquivo | Reaproveita | Substitui | Primitiva |
|---|---|---|---|---|
| **Aurora** | `aurora.tsx` | — (novo) | — | `<div aria-hidden>` + `<img>` |
| **Feixe** | utilitárias em `index.css` | — (novo) | `--wb-accent` como cor de ação | CSS |
| **Button** | `button.tsx`, `icon-button.tsx`, `link-de-acao.tsx`, `kbd.tsx` | a estrutura (`forwardRef`, `cva`, `asChild`) | `.btn*` do `upgrade.css`; variantes do `IconButton` | `<button>` + Slot |
| Ação de IA | `acao-de-ia.tsx` | o próprio | `claude-button`, `gemini-button`, `selo-provider` | `Button` |
| Ícone | `icon.tsx` | `upgrade/Icon.tsx` (movido; reexport até o fim) | — | `lucide-react` |
| **Field** | `field.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `busca.tsx`, `select.tsx` | `input.tsx`, `label.tsx` | inputs e selects soltos | nativos + **Radix Select** |
| **Controles** | `switch.tsx`, `checkbox.tsx`, `radio.tsx`, `cartao-de-opcao.tsx` | — | inputs soltos; o "selecionado" de fundo vermelho em Configurações | `<button role>` |
| **Selo** | `selo.tsx`, `etiqueta.tsx` | `upgrade/SeloDeEstado.tsx` (`COR_DO_SELO`) | o filete mono em caixa-alta; chips de categoria coloridos | `<span>` |
| **Chip** | `chip.tsx` | — | `.chip`; filtros à mão | `<button aria-pressed>` |
| **Tabs** | `tabs.tsx`, `segmented.tsx` | — | abas e toggles soltos | **Radix Tabs**, **Toggle Group** |
| **CardDeLive** | `card.tsx`, `miniatura.tsx`, `features/projetos/ProjetoCardAp.tsx` | os três (`thumbnail-placeholder`, `imagem-ampliavel`) | botões de ícone no pé, segundo selo, chips de rede | `<article>` / `<a>` |
| **LinhaDeCorte** | `lista.tsx` + linha em `features/projeto-detalhe/` | — | `CorteLinhaAp` (estrutura) | grade CSS com `--cols` |
| **MapaDaLive** | `mapa-da-live.tsx`, `lib/posicaoNoMapa.ts`, `regua-de-dias.tsx` | — (novos) | a lista lateral de cortes do editor | `<nav>` + `<a>` |
| **MedidorDeEtapas** | `medidor-de-etapas.tsx`, `anel.tsx`, `progresso.tsx` | regra de `upgrade/tiraDoCorte.ts` | tira de siglas; barras soltas | `role="img"`, `role="progressbar"` |
| **Menu** | `menu.tsx`, `popover.tsx`, `tooltip.tsx` | API do `overflow-menu.tsx`; `tooltip.tsx` | o menu à mão | **Radix Dropdown Menu**, **Popover** |
| **Dialog** | `dialog.tsx` | — | `modal.tsx`, `confirm-dialog.tsx`, `upgrade/UpgradeModal.tsx` | **Radix Dialog** (460 · 560 · 880 · 1152 · `lateral` 432) |
| **Toast** | `toaster.tsx` | — | `toaster.tsx` antigo, `upgrade/UpgradeToast.tsx` | próprio, `aria-live` |
| **EstadosDeTela** | `estado-vazio.tsx`, `skeleton.tsx`, `estado-de-erro.tsx`, `kpi.tsx` | — | textos soltos; KPIs de `features/analises` | — |
| **Tabela** | `tabela.tsx` | — | tabelas soltas | `<table>` |
| **Canal** | `upgrade/GlobalRail.tsx`, `avatar-do-canal.tsx`, `lib/luzDoCanal.ts` | itens, grupos, recolher (`useTrilho.ts`) | a roupa; "Onde eu estava" sai do trilho | `<nav>` |
| **TrilhaDaLive** | `upgrade/TrilhaDeEtapas.tsx` | o componente, `trilhaDaLive.ts`, `useTrilhaDaLive.ts` | a roupa | `<nav>` + `<Link>` |
| **BarraDeAcao** | `upgrade/ActionBar.tsx`, `PontaDaBarra.tsx` | os dois, `apertoDaBarra.ts` | a roupa | `role="toolbar"` |
| Casca | `upgrade/UpgradeShell.tsx`, `UpgradeChrome.tsx`, `ScreenHeader.tsx` | os três | `TopBar.tsx` deixa de existir (§7.0) | — |
| Palco e linha do tempo | `upgrade/MolduraDeVideo.tsx`; peças em `features/editor/` | os componentes | a roupa; véu de "sai" no lugar das bordas coloridas | — |

Teste de cada primitiva: `vitest` em node com `renderToStaticMarkup`, por variante e estado (a classe certa sai; `IconButton` sem `aria-label` não compila; `Selo` nunca emite `iris` nem `feixe`; `MedidorDeEtapas` emite o `aria-label` com contagem e verbo; `luzDoCanal` respeita as travas e a ordem das três fontes; `Aurora` sem capa só emite os halos). Depois, navegador, na página Kit.

---

## 7. Padrões por tela

Cada tela tem artboard na página "G · CutCut (final)" do canvas. Todas em 1440 × 900.

### 7.0 Casca

Duas formas, as duas flutuando a 12 px da janela sobre a aurora:

- **Fora de uma live** (Biblioteca, Shorts, Prontos, Fila, Inteligência, Configurações): **trilho aberto** (244 px, vidro, raio 24) + conteúdo com cabeçalho próprio: sobretítulo em `cc-iris`, `h1` em display (peso 300 com uma palavra em 800), busca `Ctrl K` em pílula e ações à direita. **Não há barra superior.**
- **Dentro de uma live** (cortes, editor, pós, metadados, revisão): **trilho recolhido** (64 px) + linha do topo com "voltar" (fantasma), a **trilha da live** em cápsula e a busca em botão de ícone + conteúdo + **barra de ação** em pílula no rodapé.

A `TopBar` atual deixa de existir: a busca vai para o cabeçalho ou para a linha do topo, o canal vai para o trilho, o sol/lua vai para Configurações › Aplicação, o estado da sincronização vai para o pé do trilho (só quando há problema). Trilho: ficha do canal (botão que abre a troca), "Produção" (Biblioteca, Shorts, Prontos, Fila de render), "Inteligência" (Buscar lives, Ranking, Padrões de capa, Análises), pé (Atalhos, Configurações, marca CutCut + "local · Windows"). Item atual: ladrilho preenchido em `cc-iris`.

Aurora por tela: §3.6 e o README `Aurora`.

### 7.1 Biblioteca — G01 (escuro), G13 (claro)

De cima para baixo: (1) **saudação**: sobretítulo com a data, `h1` "Boa noite, **Paulo**." com o nome no feixe e a segunda linha em `cc-fg-3` dizendo o estado da casa ("Seis cortes esperam o seu ok."); busca e "Nova live" (secundária) à direita. (2) **"Continue de onde parou"**: cartão com fio de luz, a capa de 384 × 216 com a própria luz, o título, **um** selo, o mini-mapa com os cortes prontos acesos, a **única primária da tela**, "Abrir a live" (fantasma), o destino ("Vai ao ar em @…") e, à direita, um ladrilho com o anel "7/8 etapas em cada corte". (3) **"Os últimos 8 dias"**: a régua de dias, uma casa por dia, com a capa da live do dia, o dia queimado na capa e um ponto de estado; dia sem live é uma casa tracejada. (4) **"Esperando você"** (cartões deitados) e **"No ar há pouco"** (cartões em pé), lado a lado. "Ver as 219 lives" abre a lista completa, com os chips de filtro e a grade.

Regras: a primária do "Continue" é o próximo passo da live mais recente em que o operador mexeu (`features/projetos/proximoPasso.ts`, novo). "Esperando você" = não publicadas menos a do destaque. Um selo e uma ação de texto por cartão.

### 7.2 Cortes da live — G02

Linha do topo → `h1` com o título da live (metade em 300, metade em 800) e o resumo; "Ver no YouTube", "Novo corte" e ⋯ → **mapa da live** num cartão com fio de luz: título, a leitura à direita (anel "42% da live virou corte", "6 cortes · todos prontos", "2 fire · viram shorts"), a pista de 50 px com marcas a cada 30 min, os cortes na posição em que nasceram, e um popover do corte aberto (capa, título, intervalo) → **lista de cortes** (seleção · nº · capa · Corte · Duração · Nota em anel · Etapas · Estado · ação · ⋯) → barra de ação com o resumo, os atalhos, o destino e a primária "Publicar 6 cortes".

Clicar num corte do mapa realça a linha e vice-versa (`aria-current` nos dois). A linha nunca tem botão; a ação é texto. Fire é a chama ao lado do título; shorts do corte, a pilha de capas 9:16.

### 7.3 Editor do corte — G03

Linha do topo (a etapa atual diz "fica 7:10") → sobretítulo "Corte 1 de 6 · [live]" e título do corte; à direita, o **mapa da live compacto** (30 px) entre as setas de anterior e próximo: é como se troca de corte, e a lista lateral de cortes sai → corpo em duas colunas. À esquerda: o **palco** (o quadro centrado sobre o próprio quadro desfocado, parado), com o motivo do trecho numa legenda de vidro ("Sai · 8,8 s · disfluência" + a frase + "Ouvir a emenda"); o **transporte** em pílula (tempo em mono, "Início aqui", anterior, tocar em círculo claro, próximo, "Fim aqui", velocidade, volume, tela cheia); a **linha do tempo** num cartão: régua de tempo, filmstrip, onda, e por cima os véus do que sai (contorno `cc-iris` = ajustado por você; contorno `cc-aviso` = o trecho sob a agulha), a agulha com o rótulo no feixe, e a legenda "fica, aceso · sai, pela IA · sai, ajustado por você" com o resumo "Fica 7:10 de 16:36 · sai 9:26 em 112 trechos". À direita: painel com abas "Decisões · Ordem · Transcrição · Avaliação"; cada decisão é uma pergunta com o quanto sai em mono e um segmented, ou cartões de trecho (intervalo, etiqueta de categoria, quanto sai, motivo, "Riscar"). Barra de ação: nota da IA em anel e "Por quê", avisos de cena, "Riscar corte", "Fire" e "Leitura" (liga/desliga), "Aprovado" (ligado) e a primária "Ir para a Pós".

Sem `backdrop-filter` nesta tela (§3.6).

### 7.4 Pós-produção — G04

Mesmo esqueleto do editor. À esquerda: a prévia com a cena atual na legenda; o transporte com o segmented "Com cenas · Só o vídeo" e "Abrir no Remotion Studio" (saem de cima do vídeo); a **linha do tempo** com três pistas sobre a mesma régua: Cenas (blocos; a atual no feixe; as que pedem conferência em `aviso`), Layout (região em `info`) e Áudio (onda). À direita: abas "Cenas · Layout · Filtro"; cabeçalho com **um** selo ("Plano validado" ok, ou "Falta validar" convite), a origem da rodada e "Gerar cenas"; cada cena é um cartão (título, etiqueta do tipo, citação, intervalo, origem); a que pede conferência ganha fio `aviso`, a frase do aviso e "Riscar cena" + "Conferir". Primária: "Validar plano" enquanto não validado (o render fica travado, decisão de 06/11); depois "Renderizar" ou "Renderizar de novo". Secundárias: "Devolver ao editor", "Ir para Metadados".

### 7.5 Metadados e capas — G05

Três colunas: cortes aprovados (276 px; capa, título, "tudo preenchido" ou o que falta) · formulário · capas (420 px). Formulário: sobretítulo e título; "Título do YouTube" (campo de 40 px, contador e "Gerar de novo" na linha do rótulo); "Texto da capa" (textarea com ajuda); um bloco recolhível com Descrição, Capítulos e Tags mostrando "preenchida" ou "falta"; no pé, **"Como aparece no YouTube"** (capa + título + canal). Capas: YouTube 16:9 grande; TikTok 9:16 com "Pessoas na capa" (chips removíveis) e três botões: "Gerar no ChatGPT", "Subir arte" e "Mais" (menu em dois grupos: Arte — Colar arte, Usar quadro do vídeo, Estilizar capa, Atualizar texto; Prompt — Copiar, Refazer com o Claude, Refazer com o Gemini). Barra de ação: "6 de 6 prontos para o YouTube" e "Publicar 6 cortes". A Revisão usa a lista de 7.2 com a prévia do final.

### 7.6 Shorts — G06

Trilho aberto. `h1` "**Shorts** · 184 fire com bruto" e busca; chips de filtro (o vazio fica desabilitado, com o zero à vista); **lista agrupada por live** dentro de um painel: uma faixa por live (título, "N cortes na fábrica", "Gerar shorts com IA" secundária pequena) e, embaixo, uma linha por fire (chama · capa 9:16 · título e live · duração e tamanho do bruto em mono · **um** selo · contagem de shorts · "Abrir workspace" · ⋯). Sem primária: a tela é de escolha.

### 7.7 Configurações do canal — G07

Trilho aberto. Sobretítulo "1 canal · ativo: @…", `h1`, "Novo canal" secundária; abas "Canal ativo · Aplicação"; à esquerda o índice das seções (Identidade, Tema do render, Palco do canal, Skills editoriais, Destinos, Modelos de IA), à direita as seções. **Identidade** é o cartão com fio de luz: avatar de 72 px, nome, selo "Canal ativo", "Publica em", "Canal-fonte", e a linha da luz do canal ("amostrada das capas; a paleta de identidade está vazia") com "Cadastrar paleta" e "Editar". **Tema do render** e **Palco**: cartões de opção com radio no canto; o escolhido tem fundo `cc-iris-suave` e fio `cc-iris-fio` (o fundo vermelho de hoje sai). Aba Aplicação: segmented "Claro · Escuro · Auto", o campo "Como o app chama você" e o switch "Reduzir efeitos".

### 7.8 Análises — G08

Faixa de quatro KPIs (rótulo com ícone, valor, contexto; sem dado: "Sem dados" em peso 300 + o motivo) → abas → `Select` de live com estado de carregamento próprio (desabilitado, giro, "Carregando lives…", e ao lado "Buscando as 219 lives do canal.") → área de resultado com o estado vazio. "Exportar CSV de todas as lives" secundária no cabeçalho. Ranking, Buscar lives e Padrões de capa usam `Tabela`.

### 7.9 Troca de canal — G09

Popover (`Menu` de 332 px) a partir da ficha do canal: a lista de canais (avatar, nome, handle e contagem de lives, visto em `cc-iris` no ativo), "Novo canal", "Configurar o …", e uma frase dizendo o que muda. Trocar muda a biblioteca, as skills e a aurora; o feixe e os atalhos não mudam.

### 7.10 Confirmação destrutiva — G10

Véu com blur + diálogo de 460 px: sinal de lixeira em `erro`, a pergunta com o nome do objeto, a consequência em duas frases, "Cancelar" (foco inicial) e "Excluir live" em `danger-solid`. Só para o que não se desfaz (excluir live, limpar mídia). Riscar corte não abre diálogo: acontece e oferece "Trazer de volta" no toast.

### 7.11 Fila de render — G11

Gaveta (`Dialog lateral`, 432 px, encostada à direita) sobre a tela em que o operador estava, com véu. Cabeçalho: título, resumo em uma linha ("1 renderizando · 2 esperando · 1 pronto"), fechar. Três grupos: **Agora** (capa, título, selo em curso, barra de progresso com percentual, a etapa do render e "Cancelar"), **Esperando** (posição na fila em selo inerte, ⋯) e **Prontos nesta sessão** (selo ok, "Ver"). Pé: "Os renders seguem com a gaveta fechada." e "Pausar a fila" (secundária). Sem primária.

### 7.12 Canal novo, sem lives — G12

A Biblioteca vazia. Aurora só com os halos (não há capa). Avatar neutro. Saudação com a segunda linha "A sala está pronta. Falta a primeira live." O cartão "Continue" vira **"Cole o link de uma live do YouTube"**, com fio de luz: campo em pílula, a **única primária** ("Baixar a live") e "Ou buscar as lives do canal-fonte". Embaixo, três cartões explicando o caminho (ela baixa e transcreve · a IA propõe os cortes · você aprova e publica). No pé, o lembrete de ligar o canal de destino.

### 7.13 Demais

Prontos, Buscar lives, Ranking, Padrões de capa, Atalhos, Novidades, workspace do fire: mesma casca e mesmos componentes (`Lista`, `Tabela`, `EstadosDeTela`). Novidades entra em Atalhos. "Onde eu estava" fica só na paleta de comandos.

---

## 8. Acessibilidade e aceitação

### 8.1 Contraste medido (WCAG 2.x sobre os valores da §4.1)

Fundos de referência: painel = `cc-painel` sobre `cc-bg` (`#0c0e13` / `#fafafc`); "aurora forte" = o painel com a parte mais clara da aurora atrás (`#221f2b` / `#d9d6ea`), que é o pior caso real.

| Par | Escuro | Claro | Piso |
|---|---|---|---|
| `fg` / bg · painel · aurora forte · `vidro-3` · pop | 18,4 · 17,7 · 14,8 · 12,6 · 15,9 | 16,5 · 18,3 · 13,4 · — · — | 4,5 |
| `fg-2` / bg · painel · aurora forte · `vidro-3` | 11,0 · 10,6 · 8,9 · 7,6 | 8,8 · 9,8 · 7,1 · — | 4,5 |
| `fg-3` / bg · painel · aurora forte · `vidro-3` · pop | 6,8 · 6,5 · 5,5 · 4,6 · 5,9 | 5,7 · 6,3 · 4,6 · — · — | 4,5 |
| `iris` / painel · aurora forte · `vidro-2` | 8,3 · 6,9 · 6,9 | 6,4 · 4,7 · — | 4,5 |
| `sobre-feixe` / `feixe-a` · `-b` · `-c` | 11,4 · 12,2 · 14,8 | 6,2 · 5,6 · 4,7 | 4,5 |
| `sobre-iris` / `iris` | 8,3 | 6,7 | 4,5 |
| `sobre-erro` / `erro-cheio` | 7,8 | 5,5 | 4,5 |
| `ok` · `aviso` · `erro` · `info` / painel | 12,5 · 12,4 · 8,5 · 10,7 | 5,6 · 6,2 · 6,3 · 6,3 | 4,5 |
| `ok` · `aviso` · `erro` · `info` no selo (cor a 13%) | 9,7 · 9,6 · 7,0 · 8,5 | 4,6 · 5,0 · 5,0 · 5,1 | 4,5 |
| número escuro no corte pronto (`fg` a 88%) | 14,2 | — | 4,5 |
| `fire` / painel (glifo) | 9,4 | 5,0 | 3,0 |
| `fio-campo` / painel · bg (borda de controle) | 3,3 · 3,2 | 3,1 · 3,0 | 3,0 |

Todos passam. Restrições: `fg-3` não vai direto sobre a aurora sem painel; `fg-off` só em controle desabilitado; `fio` e `fio-2` são decoração e nunca borda de controle; no claro, cor de estado só sobre painel (sobre a aurora forte `ok` cai a 4,1). A H-02 transforma a tabela em teste.

### 8.2 Lista de aceitação (Web Interface Guidelines da Vercel, adaptada)

**A** = catraca ou teste cobre; **R** = revisão no navegador. Cada PR de tela ou primitiva marca a lista.

- **Semântica:** R · ação é `<button>`, navegação é `<a>`/`<Link>` · A · botão só de ícone tem `aria-label` · R · todo controle tem rótulo ligado · R · um `h1` por tela; link "Pular para o conteúdo" · R · toast e validação em `aria-live` · R · player e mapa operáveis pelo teclado.
- **Ação:** A · **exatamente um** botão primário no HTML das telas que têm primário, e nenhum nas que não têm (§5) · A · `Selo` nunca usa `iris` nem `feixe` · R · um selo por item.
- **Foco:** A · nenhum `outline-none` fora da regra global · R · foco visível nos dois temas, inclusive sobre vidro e sobre a aurora · R · diálogo e gaveta prendem e devolvem o foco; `overscroll-behavior: contain` · R · barra de ação e linha do topo não cobrem o foco (`scroll-padding`).
- **Formulário:** R · `name`, `autocomplete="off"`, `type`/`inputmode`; `spellCheck={false}` em URL e handle; colar nunca bloqueado · R · erro ao lado do campo, com o conserto · R · sair com alteração pendente pede confirmação.
- **Texto:** A · sem `uppercase` · A · nada abaixo de 11 px (catraca `pisoDeFonte`, já existe) · R · "…", aspas curvas, espaço não separável · R · número e data por `Intl` · R · rótulo em frase, verbo + objeto.
- **Conteúdo:** R · título longo trunca e o pai flex tem `min-w-0` (testar com 5 e 120 caracteres) · R · os quatro estados desenhados · R · irreversível pede diálogo; reversível oferece desfazer.
- **Imagem:** R · `<img>` com `width`, `height`, `loading="lazy"`, `alt`; capa em caixa 16:9 ou 9:16 com `object-fit: cover`, **nunca distorcida** · R · lista com mais de 50 itens usa `content-visibility: auto`.
- **Luz e desempenho (§3.6):** A · `backdrop-filter` só dentro de `.cc-vidro-casca` (catraca `vidroSoNaCasca`) · A · `feixe` só nos arquivos permitidos (catraca `feixeSoNoLugar`) · R · no máximo ~6 superfícies com blur por tela · R · Editor e Pós sem blur e sem capa na aurora · R · "Reduzir efeitos" e `prefers-reduced-transparency` tiram vidro e aurora.
- **Movimento:** A · sem `transition: all` · R · `prefers-reduced-motion` respeitado; nada depende de animação.
- **Tema:** R · `color-scheme` e `theme-color` acompanham · R · tela conferida em Escuro e Claro · A · nenhuma cor literal fora de `tokens.css` e das exceções (catraca `corLiteral`, já existe) · A · nenhum `cc-canal-*` fora de `avatar-do-canal` e `luzDoCanal` (catraca `territorioDoCanal`).
- **Estado na URL:** R · filtro, aba, ordenação e corte aberto.

Não se aplicam (app local, Windows, ponteiro fino, sem SSR): áreas seguras, alvo de toque de 44 px, hidratação.

---

## 9. Estratégia de migração

Primeiro os nomes novos existem; depois os antigos apontam para eles; depois cada tela troca de nome; por fim os antigos somem.

### 9.1 Fases

| Fase | O que entra | O que o operador vê |
|---|---|---|
| 0 | ADR e `docs/design/` | nada |
| 1 · Tokens | `tokens.css`, Tailwind, pacotes Radix, catracas com a linha de base de hoje | nada |
| 2 · Ponte | as camadas antigas passam a ler `--cc-*`; temas reduzidos; fontes | **o app inteiro fica escuro, com a fonte nova, de uma vez** |
| 3 · Componentes | `components/ui/*` com a forma nova, conferidos na página Kit | nada nas telas |
| 4 · Casca | aurora, trilho de vidro, trilha, barra de ação; `TopBar` sai | a sala nova |
| 5 · Telas | uma história por tela; depois a varredura mecânica da pasta | tela a tela |
| 6 · Remoção | camadas antigas apagadas; tetos em zero | nada |
| 7 · Auditoria | acessibilidade e desempenho, tela a tela | nada |

A fase 2 pede o ok do Paulo no navegador (as oito telas das capturas, nos dois temas) antes do merge. Na ponte, as superfícies antigas viram **sólidas** (`painel-solido`, `bg-2`): vidro e aurora só chegam na fase 4, para a ponte não espalhar `backdrop-filter`.

### 9.2 Tabela de-para (a varredura mecânica segue só isto)

| Antigo | Novo token | Classe |
|---|---|---|
| `--wb-bg` · `--bg` · `bg-950` | `--cc-bg` | `bg-app` |
| `--wb-bg-panel` · `--wb-bg-card` · `--solid` · `--panel` · `bg-900` · `surface-1` | `--cc-painel-solido` (casca: `--cc-painel`) | `bg-painel-solido` |
| `--wb-bg-card-elev` · `--wb-pill-bg` · `surface-2` | `--cc-vidro-2` | `bg-vidro-2` |
| `--wb-bg-inset` · `--wb-bg-strip` · `--inset` · `--mat` · `bg-800` · `surface-3` | `--cc-poco` | `bg-poco` |
| `--sel-bg` | `--cc-vidro-3` | `bg-vidro-3` |
| `--wb-border` · `--line` · `bg-600` · `border` | `--cc-fio-2` | `border-fio-2` |
| `--wb-border-soft` · `--line2` · `bg-700` | `--cc-fio` | `border-fio` |
| `--border-hover` · `--sel-line` (borda de controle) | `--cc-fio-campo` | `border-campo` |
| `--wb-text` · `--wb-ink` · `--ink` · `--sel-ink` · `text-100/500` | `--cc-fg` | `text-fg` |
| `--wb-text-mute` · `--mute` · `text-200` | `--cc-fg-2` | `text-fg-2` |
| `--wb-text-dim` · `--wb-text-faint` · `--dim` · `text-300/400` · `bg-500` | `--cc-fg-3` | `text-fg-3` |
| `--wb-accent` · `--accent` · `accent-400/500/600` **como fundo de botão** | o feixe | `bg-feixe text-sobre-feixe` (julgamento: só se for o primário da tela; senão `bg-vidro-2`) |
| `--wb-accent` · `--accent` **como texto ou marca** | `--cc-iris` | `text-iris` |
| `--wb-accent-strong` · `--accent2` · `accent-200/700` | `--cc-iris-2` | `text-iris-2` |
| `--wb-accent-soft` · `--accent-soft` · `accent-300` | `--cc-iris-suave` | `bg-iris-suave` |
| `--wb-accent-fg` · `--on-accent` · `--wb-ink-fg` · `--sel-on` | `--cc-sobre-iris` (sobre o feixe: `--cc-sobre-feixe`) | `text-sobre-iris` |
| `--wb-ok*` · `--ok` · `--success` · `--tint-aprovado*` | `--cc-ok` | `text-ok` `bg-ok/13` |
| `--wb-warn*` · `--warn` · `--warning` | `--cc-aviso` | `text-aviso` `bg-aviso/13` |
| `--wb-err*` · `--wb-danger*` · `--err` · `--error` · `--tint-rejeitado*` | `--cc-erro` | `text-erro` `bg-erro/13` |
| `--wb-info*` · `--info` · `--wb-leitura*` · `--wb-violet*` · `--tint-leitura*` | `--cc-info` | `text-info` `bg-info/13` |
| `--wb-fire` · `--tint-fire*` | `--cc-fire` (só glifo; onde era fundo, `bg-vidro-2`) | `text-fire` |
| `--wb-shadow*` · `--shadow` · `--shadow-sm/md` · `--wb-shadow-btn` | cartão: `shadow-topo` · flutuante: `shadow-pop` | — |
| `--wb-focus` · `--accent-glow` · `--hi` · `--glass` · `.glass` · `backdrop-blur-*` solto | (sai; vidro só por `.cc-vidro-casca`) | — |
| `--radius-xs` | `etiqueta` 6 | `rounded-etiqueta` |
| `--radius-sm` · `--radius` | `campo` 12 (botão e chip: `pilula`) | `rounded-campo` |
| `--radius-lg` · `--radius-xl` | `cartao` 20 | `rounded-cartao` |
| `--font-sans` · `--sans` | `--font-sans` (novo valor) | `font-sans` |
| `--font-mono` · `--mono` | `--font-mono` | `font-mono` |
| `--font-serif` · `.font-editorial` | (sai) | — |
| 9 · 10 · 10,5 · 11 · 11,5 px | 11 px | `text-micro` |
| 12 · 12,5 px | 12 px | `text-pequeno` |
| 13 · 13,5 px | 13 px | `text-corpo` |
| 14 · 15 px (título de item) | 14 px | `text-linha` |

A varredura **não** aplica a forma (pílula, vidro, feixe): isso vem de trocar o elemento pelo componente, na história de tela. Três casos pedem julgamento e o Haiku não decide (lista no PR, o Opus resolve): acento usado como **fundo de botão** (primário ou não?), `--wb-fire` usado como **fundo**, e raio de botão que não virou componente.

### 9.3 Zerar os `style={{`

(1) classe do Tailwind; (2) o componente, se o `style` estava desenhando um; (3) variável CSS para geometria de execução — `style={{ '--p': 42 }}` no anel, `style={{ '--inicio': '17.33%', '--largura': '10.32%' }}` no mapa. A catraca não conta `style` cujas chaves começam todas por `--`.

### 9.4 Catracas

No padrão que já existe (`src/shared/qualidade/__tests__/tamanhoDeFuncao.test.ts`): teste do `vitest` sobre `git ls-files`, com linha de base por arquivo, que **só deixa o número cair**. Arquivo novo nasce com teto zero.

| Catraca | Conta | Situação |
|---|---|---|
| `corLiteral` | hex, `rgb(`, `hsl(`, `oklch(` fora de `styles/tokens.css` | **já existe**: a H-06 estende para as classes da paleta padrão do Tailwind |
| `pisoDeFonte` | fonte abaixo de 11 px | **já existe** (D-859); a H-06 acrescenta `text-[…px]` arbitrário |
| `estiloInline` | `style={{` com chave que não seja `--*` | nova; base 736 |
| `tokensLegados` | `var(--wb-`, variáveis curtas da `.ap`, classes `bg-bg-*`, `text-text-*`, `surface-[123]`, `accent-[2-7]00` | nova; base 1.853 + as curtas (medir) |
| `caixaAlta` | `uppercase`, `textTransform` | nova; medir |
| `vidroSoNaCasca` | `backdrop-filter`, `backdrop-blur` fora de `.cc-vidro-casca` e da lista de arquivos da §3.6 | nova; base 9 + 9; **nasce com teto zero para arquivo novo** |
| `feixeSoNoLugar` | `bg-feixe`, `text-feixe`, `cc-fio`, `--cc-feixe` fora de `button`, `tabs`, `mapa-da-live`, `TrilhaDeEtapas`, a agulha, o `h1` de `ScreenHeader` e os quatro cartões do §3.1 | nova; nasce zerada |
| `umPrimarioPorTela` | teste de render de cada tela: conta `data-variant="primary"` | nova; esperado por tela na §5 |
| `territorioDoCanal` | `canal-` fora de `avatar-do-canal` e `luzDoCanal` | nova; nasce zerada |
| `fontesDoIndex` | `index.html` só pede Plus Jakarta Sans e JetBrains Mono | nova; hoje 11 famílias |
| `semTransicaoTotal` | `transition: all`, `transition-all`, `outline-none` sem par | nova; medir |

Exceções fixas, nomeadas dentro de cada catraca (pintam o vídeo ou dado de cor do canal): `src/shared/palco/**`, `features/shorts/LegendaPrevia.tsx`, a prévia de `features/shorts/DefinirPalcoModal.tsx`, `upgrade/MolduraDeVideo.tsx`, as amostras de paleta e de palco em `features/channels/**`, os componentes que desenham o quadro em `features/editor/fase2/`. A lista não cresce sem o Opus.

### 9.5 Testes, navegador e travas

- Toda história traz teste e o PR lista *pedido → teste*. Regra pura nova (`proximoPasso.ts`, `luzDoCanal.ts`, `posicaoNoMapa.ts`, o campo `nome`, a migração de tema) nasce pelo teste.
- Teste de tela afirma comportamento: exatamente um primário no HTML; a ação de cada linha existe; nenhuma sigla; o `aria-label` do medidor e de cada corte do mapa. Não afirma classe de cor.
- Navegador: stack própria do worktree, em portas alternativas (`dev.ports.local.ps1`), com `frontend/.env.local` apontando para o backend do worktree. **Nunca 8000/4300/3200 (PROD).** Conferir Escuro e Claro, 1440 e 1920 px, teclado do início ao fim.
- Portão: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`. Não rodar `npm run format`.
- **Travas:** os testes existentes estão sob `testes-sao-contrato` (D-925). Vários citam tema, paleta ou token antigo, e os de render afirmam o HTML de hoje (inclusive as siglas e a `TopBar`). Antes de editar, `python bin/check-lock.py check <arquivo>` a partir da raiz; cada história lista no plano os testes que precisa mudar e pede a autorização do Paulo antes; o commit leva `[unlock:testes-sao-contrato] motivo: …`. Muda-se a referência, nunca o que o teste garante.

### 9.6 Riscos

| Risco | Mitigação |
|---|---|
| **Blur pesa com vídeo tocando** | §3.6: aurora pré-desfocada, vidro só na casca, Editor e Pós sem blur; H-13 mede; "Reduzir efeitos" como saída |
| A ponte muda tudo de uma vez (claro → escuro) e algum par antigo perde contraste | H-03 varre as oito telas nos dois temas; corrige na ponte; superfícies antigas viram sólidas |
| Texto sobre a aurora perde contraste com uma capa muito clara | opacidade da capa travada (≤ 0,5 no escuro, ≤ 0,3 no claro) e véu para `cc-bg`; teste de `Aurora` afirma os dois limites |
| Sumir com a `TopBar` quebra testes e atalhos da casca | H-13 lista os testes de `upgrade/__tests__` antes; `useAtalhosDaCasca` não muda |
| O feixe se espalha "porque é bonito" | catracas `feixeSoNoLugar` e `umPrimarioPorTela` |
| Pesos 300 e 800 da Jakarta no Windows com ClearType | conferir a G01 em 100% e 125% de escala na H-05; se o 300 ficar fino demais a 44 px, sobe para 400 |
| `mask-composite` do fio de luz em WebView antigo | o app roda no navegador do operador (Edge/Chrome atuais); sem suporte, o cartão fica com `fio-2` comum |
| Duas histórias no mesmo arquivo | cada arquivo tem uma história dona; `components/ui/*` congela na fase 5 |

---

## 10. Histórias

Uma demanda Guia por história, um worktree, um PR, squash com o ok do Paulo. O Guia dá o `D-NNN`. **Opus** conduz todas (plano, unlocks, `pr-audit` em Opus, navegador) e executa as três que são decisão ou auditoria; **Sonnet** escreve componente e tela; **Haiku** faz troca mecânica.

| # | Título | Escopo (arquivos reais em `frontend/src`, salvo indicação) | Aceite | Depende | Modelo |
|---|---|---|---|---|---|
| **Tokens** | | | | | |
| H-01 | Registrar a decisão do sistema de design | `docs/adr/0018-sala-escura-sistema-de-design.md`; `docs/design/` (esta direção, os links, `sala-escura.css`); linha em `AGENTS.md` | ADR aceito; cita a recusa da rodada 4 e o feixe fixo | — | Opus |
| H-02 | Criar os tokens `cc-*` e ligá-los ao Tailwind | `styles/tokens.css` (novo); `index.css` (`@import`, `.num`, `.text-feixe`, `.cc-fio`, `.cc-vidro-casca`); `../tailwind.config.ts` (§4.6, em `extend`); `../package.json` (seis pacotes Radix); `styles/__tests__/tokens.test.ts` | os dois temas declaram o mesmo conjunto; o teste calcula os pares da §8.1; **sem mudança visual** | H-01 | Sonnet |
| H-06 | Criar e estender as catracas de design | `shared/qualidade/__tests__/` (as nove novas da §9.4 e as duas extensões) e as linhas de base | cada uma falha ao acrescentar uma ocorrência (teste de controle) e passa na `main` | H-02 | Sonnet |
| H-03 | Apontar as camadas antigas para os tokens novos | `index.css` (`:root`, `data-wb-theme`, paletas); `upgrade/upgrade.css` (tokens da `.ap`, ponte); `upgrade/upgrade-temas.css` | toda variável antiga resolve para um `--cc-*` pela tabela da §9.2; superfícies sólidas; oito telas conferidas nos dois temas com o ok do Paulo | H-02 | Sonnet |
| H-04 | Reduzir os temas a Escuro, Claro e Auto | `upgrade/useUpgradeTheme.ts` → `lib/tema.ts`; `upgrade/AparenciaDaCasca.tsx`; `upgrade/fontesDaPaleta.ts`; `../index.html` (`theme-color`) | valor salvo migra, ausente vira `dark` (teste); segmented de três opções; `color-scheme` acompanha | H-03 | Sonnet |
| H-05 | Trocar as fontes da interface e carregar as do vídeo sob demanda | `../index.html`; `lib/fontesDoRender.ts` (novo); chamadas nas prévias (`features/shorts/LegendaPrevia.tsx`, `DefinirPalcoModal.tsx`, `features/editor/fase2/`); `--font-*` | `fontesDoIndex` no teto final; prévias com a fonte certa; G01 legível em 100% e 125% | H-02 | Sonnet |
| **Componentes** | | | | | |
| H-07 | Construir o botão: Button, IconButton, LinkDeAcao, Kbd, ação de IA, ícone | `components/ui/{button,icon-button,link-de-acao,kbd,acao-de-ia,icon}.tsx` + testes; `upgrade/kit/KitAcao.tsx` | README `Button` e `Feixe`; apertar não mexe no layout; API antiga do `Button` atendida por mapa de variantes; `data-variant` no HTML | H-02 | Sonnet |
| H-08 | Construir a entrada: campo, select, switch, checkbox, radio, cartão de opção | `components/ui/{field,input,textarea,label,busca,select,switch,checkbox,radio,cartao-de-opcao}.tsx` + testes; `upgrade/kit/KitEntrada.tsx` | READMEs `Field` e `Controles`; todos os estados da §3.4; borda com `fio-campo` | H-02 | Sonnet |
| H-09 | Construir estado e navegação: selo, etiqueta, chip, abas, segmented | `components/ui/{selo,etiqueta,chip,tabs,segmented}.tsx` + testes; `upgrade/kit/KitEstado.tsx` | seis tons com forma; traço da aba no feixe; `Selo` nunca usa íris nem feixe | H-02 | Sonnet |
| H-10 | Construir listas e dados: cartão, miniatura, lista, tabela, KPI, estados de tela | `components/ui/{card,miniatura,lista,tabela,kpi,estado-vazio,skeleton,estado-de-erro}.tsx` + testes; `upgrade/kit/KitListas.tsx` | capa nunca distorce (teste de atributos); duração queimada; quatro estados | H-02 | Sonnet |
| H-11a | Construir o tempo: mapa da live, régua de dias, medidor, anel, progresso | `components/ui/{mapa-da-live,regua-de-dias,medidor-de-etapas,anel,progresso}.tsx` + testes; `upgrade/tiraDoCorte.ts` (campo `nome`); `lib/posicaoNoMapa.ts`; `upgrade/kit/KitTempo.tsx` | README `MapaDaLive`; posição em porcentagem testada com os seis cortes reais; `aria-label` completos; um só corte no feixe | H-09 | Sonnet |
| H-11b | Construir o que flutua: menu, popover, tooltip, diálogo, gaveta, toast | `components/ui/{menu,popover,tooltip,dialog,toaster}.tsx` + testes; `modal`, `confirm-dialog`, `overflow-menu` viram reexports finos; `upgrade/kit/KitFlutua.tsx` | foco preso e devolvido; `aria-disabled`; toast em `aria-live`; `lateral` de 432 | H-07 | Sonnet |
| H-11c | Construir a aurora e a luz do canal | `components/ui/{aurora,avatar-do-canal}.tsx`; `lib/luzDoCanal.ts`; `lib/miniaturaDaCapa.ts` (redução em `<canvas>`, até B-3 existir) + testes; `upgrade/kit/KitLuz.tsx` | README `Aurora`; sem capa só halos; opacidade travada; nenhum `filter` animado; ordem das três fontes da luz testada | H-02 | Sonnet |
| H-12 | Montar a página Kit com os componentes novos | `upgrade/KitScreen.tsx`, `UpgradeKitPage.tsx` | Kit mostra só componentes novos, nos dois temas; `KitScreen` sai da base de `estiloInline` | H-07 … H-11c | Haiku |
| **Casca** | | | | | |
| H-13 | Montar a sala: aurora, trilho de vidro, trilha, barra de ação | `upgrade/{UpgradeShell,UpgradeChrome,GlobalRail,ScreenHeader,ActionBar,PontaDaBarra,TrilhaDeEtapas}.tsx`; apagar `upgrade/TopBar.tsx`; popover de troca de canal; opção "Reduzir efeitos" em `upgrade/AparenciaDaCasca.tsx` | §7.0 e §7.9; trilho 244/64; link "Pular para o conteúdo"; **medição do editor tocando vídeo com e sem efeitos, anexada ao PR**; Editor e Pós sem blur | H-04, H-12 | Sonnet |
| H-14 | Migrar as peças flutuantes da casca | `upgrade/{PaletaDeComandos,GavetaDaFila,LoteNaFila,ContextColumn,BarraDoCorte,TiraDoCorteAp,UpgradeModal,UpgradeToast,MolduraDeVideo,Erro404Page}.tsx`; `upgrade/cartaoDaFila.ts` | §7.11: gaveta = `Dialog lateral` com os três grupos; siglas trocadas pelo medidor; `UpgradeModal` e `UpgradeToast` sem uso | H-12 | Sonnet |
| **Telas** | | | | | |
| H-15 | Redesenhar a Biblioteca e o canal novo | `features/projetos/**` (`BibliotecaPage`, `ProjetoCardAp`, `CapaDoProjetoCard`, `NovoProjetoForm`, `bibliotecaFiltros.ts`, `statusMaps.ts`); `features/projetos/proximoPasso.ts` (novo) | §7.1 e §7.12; saudação, "Continue", régua de dias; **uma** primária; vazio com "Baixar a live"; quatro estados | H-13 | Sonnet |
| H-16 | Redesenhar os cortes da live | `features/projeto-detalhe/**` | §7.2; mapa ligado à lista; uma primária no HTML; nenhuma sigla | H-13, H-14 | Sonnet |
| H-17 | Redesenhar o editor do corte | `features/editor/**` menos `fase2/`; `features/porque-do-corte/**`; `upgrade/UmaTelaPorCorte.tsx` | §7.3; mapa compacto troca de corte; véu de "sai"; sem `backdrop-filter` | H-13, H-14 | Sonnet |
| H-18 | Redesenhar a pós-produção | `features/editor/fase2/**` (menos exceções); `features/post-production/**` | §7.4; uma primária; três pistas na mesma régua | H-17 | Sonnet |
| H-19 | Redesenhar metadados, capas e revisão | `features/metadata/**`; `features/capa-chatgpt/**`; `features/final-review/**` | §7.5; menu "Mais" em dois grupos; "Como aparece no YouTube" | H-13, H-14 | Sonnet |
| H-20 | Redesenhar os shorts | `features/shorts/**` (menos exceções) | §7.6; lista agrupada por live; sem primária | H-13, H-14 | Sonnet |
| H-21 | Redesenhar as configurações | `features/channels/**` (`ChannelsPage`, `ChannelCard`, `ChannelThemeSection`, `PalcoComponentesSection`, `EstiloDoCanal`…); `features/settings/**` | §7.7; cartão de identidade com a luz do canal; cartões de opção; campo do nome do operador (B-1) e "Reduzir efeitos" | H-13 | Sonnet |
| H-22 | Redesenhar análises e inteligência | `features/analises/**`; `features/lives/**`; `features/thumbnail-padroes/**` | §7.8; KPI "Sem dados" com motivo; select com carregamento | H-13 | Sonnet |
| H-23 | Migrar as telas restantes | `features/{fila,atalhos,novidades,sincronizacao,diarizacao,ia,publicacao}/**`; `App.tsx` | §7.13 | H-13, H-14 | Sonnet |
| H-15b … H-23b | Varrer o restante de cada pasta | os arquivos da pasta que a história de tela não tocou | só a tabela de-para; **sem mudança visual**; tetos da pasta em zero; casos de julgamento listados | a tela da pasta | Haiku |
| **Remoção** | | | | | |
| H-24 | Remover as camadas antigas | `index.css`; apagar `upgrade/upgrade-temas.css`; `upgrade/upgrade.css`; `../tailwind.config.ts` (chaves antigas fora, `extend` → `theme`); reexports temporários; `../.eslintrc.cjs` (regra de `style` global) | linhas de base vazias, menos as exceções | todas | Sonnet |
| **Auditoria** | | | | | |
| H-25 | Auditar acessibilidade e desempenho, e fechar | `docs/design/aceitacao.md`; correções pontuais | lista da §8.2 marcada tela a tela, nos dois temas, pelo teclado; contagem de superfícies com blur por tela; medição final do editor | H-24 | Opus |
| **Backend** | | | | | |
| B-1 | Guardar o nome do operador | configuração da aplicação + rota; contrato OpenAPI | `GET`/`PUT` do nome; ausente → saudação sem nome | — | Sonnet |
| B-2 | Guardar a imagem do avatar do canal | arquivo na pasta do canal + rota de envio e leitura | envio valida tipo e tamanho; ausente → iniciais | — | Sonnet |
| B-3 | Servir a miniatura da capa e a luz do canal | rota da capa com `?w=64` (ou arquivo `capa-64.jpg` gerado junto da capa, com PIL); campo `luz` no payload do canal: duas cores amostradas das capas | miniatura ≤ 4 KB; `luz` vazio quando não há capa; a paleta cadastrada tem precedência no front | — | Sonnet |

**São 27 histórias de frontend** (H-01 a H-25, com H-11 em três), **mais 9 varreduras mecânicas** (H-15b a H-23b) **e 3 de backend** (B-1 a B-3).

**Ordem:** tokens (H-01, H-02, H-06, H-03, H-04, H-05) → componentes (H-07 … H-12) → casca (H-13, H-14) → telas (H-15 … H-23 e as varreduras) → remoção (H-24) → auditoria (H-25).

**Em paralelo, sem tocar os mesmos arquivos:** depois da H-02: H-03, H-05, H-06, H-07, H-08, H-09, H-10, H-11c. H-11a depois da H-09; H-11b depois da H-07. H-13 e H-14 em paralelo. Telas em paralelo por pasta (H-18 depois da H-17, que dividem `features/editor`). B-1 a B-3 a qualquer momento antes da H-21, da H-13 e da H-15 (a casca funciona sem elas: sem nome, com iniciais e com a miniatura feita no front). Se for uma tela por vez, comece por **H-15, H-16, H-17**.

**O que cada modelo recebe.** Haiku: a lista de arquivos, a tabela de-para da §9.2, "não mude estrutura, texto nem comportamento", e "catraca da pasta em zero, portão verde". Sonnet: a seção deste documento da sua história, os READMEs dos componentes no Design System, o artboard e a captura da tela, `referencia/sala-escura.css`, os testes travados que vai tocar e a lista da §8.2. Opus: decide o que o documento não cobre, pede os unlocks, audita cada PR e confere no navegador.

---

## 11. O que exige dado ou endpoint novo no backend

| Precisa de | Para quê | Situação |
|---|---|---|
| **Nome do operador** | saudação da Biblioteca | **novo** (B-1). Sem ele, a saudação sai sem nome ("Boa noite.") e sem a palavra no feixe |
| **Imagem do avatar do canal** | avatar | **novo** (B-2). Sem ela, as iniciais do `nome` |
| **Miniatura de 64 px da capa** | aurora (§3.6) | **novo** (B-3). Sem ela, o front reduz a capa num `<canvas>` uma vez por live (`lib/miniaturaDaCapa.ts`); exige que a rota da capa responda com CORS para o front, ou a redução falha e a aurora fica só com os halos |
| **Luz do canal** (duas cores amostradas das capas) | anel do avatar | **novo** (B-3). Sem ela, e com a paleta vazia como na PROD, o anel é neutro |
| Paleta do canal (`primaria`, `secundaria`, `acento`) | luz do canal, quando cadastrada | existe em `backend/app/domain/canal/identidade.py`; **está vazia na PROD**; conferir se a rota de canais devolve a paleta do canal ativo |
| **Capa da live** (a imagem 16:9) | cartão, régua de dias, aurora | conferir: a Biblioteca de hoje mostra um quadro da live; confirmar qual URL de capa cada projeto expõe e se há uma para live sem cortes |
| Canal de destino ("Vai ao ar em @…") | cartão "Continue" e barra de ação | existe na configuração do canal; conferir se está no payload que a casca lê |
| "Continue de onde parou" | cartão de destaque | **parcial**: o histórico de lugares vive no navegador (`upgrade/historicoDaCasca.ts`) |
| Lives por dia, últimos 8 dias | régua de dias | sai da listagem de projetos que a Biblioteca já carrega (data + estado) |
| Contagens do estado da casa | frase da saudação | saem da mesma listagem |
| Posição dos cortes na live | mapa da live | existe (`Corte.inicio_seg`, `fim_seg`, duração do projeto) |
| Etapas por corte | medidor | existe (`StatusExportCorte` + `montarTira`) |
| Trechos do corte | véus da linha do tempo | existe (`Corte.desvios`) |
| Fila de render: item atual, etapa, percentual, posição | gaveta da fila (§7.11) | conferir: `shared/filaGlobal` e `upgrade/cartaoDaFila.ts` já mostram a fila; confirmar que há percentual e nome da etapa por item |
| Contagem de lives por canal | troca de canal | conferir |
| Preferência "Reduzir efeitos" | §3.6 | fica no navegador (`localStorage`), como o tema; não pede backend |
| YouTube Analytics (retenção) | KPI "Retenção média" | não existe; o KPI mostra "Sem dados" até existir |

Não conferi rota por rota: a coluna "situação" diz o que vi no código de domínio e nas telas; onde está "conferir", é a primeira tarefa da história correspondente.

---

## 12. Suposições (marcar como tal ao executar)

1. **A aprovação do dono** ("Sala escura" aprovada sem mudança; feixe "Fixo do CutCut") me chegou pelo coordenador da sessão, não diretamente. Este documento a toma como dada.
2. **As capas são reais, mas o casamento capa ↔ título é ilustrativo** (só a do corte 6 bate com o assunto). O quadro do vídeo no editor e na pós é uma capa, não um frame. As capas 9:16 dos shorts também são reais e também não correspondem aos títulos.
3. **A data das telas é 08/11/2026** (dia da live "Cansei do Youtube…"), para a régua de 8 dias ter as cinco lives reais.
4. **"Boa noite, Paulo."** supõe o dado novo B-1. **Avatar com as iniciais "AI"** supõe a falta de B-2.
5. **A luz do canal** (limão `#b9f24a` e amarelo `#ffe45c`) foi escolhida a olho nas capas; não há amostragem ainda (B-3).
6. **Títulos completados:** "…a guerra é o pacote do fascismo", "…Pres. do Paraguai e da Câmara", "…André Lara Resende", "Engels não era arrogante: o que o socialismo científico quis dizer", "Estoicismo na derrota: controle só você". Os títulos das cenas na Pós e as etiquetas de tipo ("Card de informação", "Citação", "Definição") são leituras da captura.
7. **Números:** 219, 22, 9, 198, 184, 127, 3, 12, 114 e 57 vêm das capturas da PROD. "Esperando você 21" é 22 menos a live do destaque; "Shorts 15" no trilho é 3 + 12. "42% da live virou corte" é a soma das seis durações (1:07:44) sobre 2:41:00.
8. **Fire nos cortes 2 e 3** (os que têm shorts); a captura mostra a chama em mais linhas e o resumo diz "2 fire".
9. **Véus de "sai" na linha do tempo** são ilustrativos (17 blocos no lugar de 112). As posições das cenas na pista da Pós foram calculadas dos tempos reais (0,3 s, 185,3 s, 311,9 s de 431 s); as duas últimas cenas são supostas.
10. **Fila de render (G11):** os quatro itens, o percentual (64%) e a etapa ("Final · overlays compostos") são um exemplo; não li o estado real da fila.
11. **Troca de canal:** só existe um canal. O segundo item ("[Seu outro canal]") é um exemplo marcado.
12. **Canal novo (G12):** "Canal novo / @seucanal" é marcador. O texto dos três passos é meu.
13. **Amostras do "Tema do render" e do "Palco"** em Configurações foram aproximadas da captura; são dado do canal e não fazem parte do sistema.
14. **Custo do blur:** as regras da §3.6 vêm de como o navegador compõe `filter` e `backdrop-filter`, não de medição neste app. A H-13 mede.
15. **Conferência visual:** não abri os artifacts publicados (o navegador da sessão não entra no claude.ai). Servi os mesmos arquivos localmente, com a mesma folha de estilo, e conferi as capturas de `rodada6/`: as 13 telas e as 21 prévias do Design System, em escuro e claro. O que **não** foi conferido: a carga da folha `cc5.css` por caminho relativo dentro do canvas, e, no Design System, o `tokens.css` que a página gera do `tokens.json` (o `bundle.css` tem os valores do escuro como reserva em cada `var()`, e os do claro explícitos).
16. **Referências web** (Dribbble, Behance, UI8) não abriram em nenhuma das duas rodadas; trabalhei pela síntese das referências (fora do git, em `.guia/tmp/D-1111/design/`) e pelo print do Paulo.
