# ADR-0018: Sistema de design "Sala escura"

- **Status:** Aceito
- **Data:** 2026-11-15 (decisão do dono em 2026-11-15)
- **Decisores:** Paulo Marcos
- **Relacionado:** D-1111 (o desenho), D-1112 (este ADR), épico E-069 (a migração),
  [ADR-0017](0017-casca-unica.md) (a casca única que esta decisão veste)

## Contexto

O visual do frontend nunca teve dono único. Medido na `origin/main` (`e3cd05e5`,
15/11/2026):

| Marca | Quanto |
|---|---|
| Linhas com `var(--wb-…)` (ocorrências) | 1.853 (2.680) |
| Camadas de token coexistindo | 3: `--wb-*` (`src/index.css`, 385 linhas), as variáveis curtas da `.ap` (`src/upgrade/upgrade.css`, 690 linhas) e as escalas do `tailwind.config.ts` |
| Linhas com `style={{` em `.tsx` | 737 |
| Famílias de fonte pedidas no `frontend/index.html` | 11 (Anton, Bebas Neue, Geist, Geist Mono, Inter, JetBrains Mono, Lora, Montserrat, Oswald, Outfit, Poppins) |
| Componentes em dobro | 3 diálogos, 2 toasts, 3 botões de IA |
| Acento e erro | a mesma cor, a 3° de matiz |
| Tema padrão | claro, enquanto as referências do dono são escuras |

A aparência vive espalhada dentro das telas, e cada mudança visual paga três
vocabulários. Em seis rodadas de desenho no ambiente de design, o dono aprovou uma
identidade só.

## Decisão

Um **sistema de design único**, descrito em [`docs/design/`](../design/README.md):

1. **Tokens `--cc-*`**, num arquivo só (`frontend/src/styles/tokens.css`), nos dois
   temas, no lugar das três camadas.
2. **Escuro primeiro.** A única luz é o vídeo; o cromo é preto azulado.
3. **A aurora vem da capa da live**, desfocada uma vez; a cor do canal entra pela
   mídia, não por cadastro.
4. **Vidro com fio de 1 px**; `backdrop-filter` só na casca, nunca sobre vídeo tocando.
5. **O feixe** (degradê lavanda → céu → menta) é **fixo do CutCut**, não muda de canal
   para canal, e marca a única ação primária de cada tela.
6. **Plus Jakarta Sans** e **JetBrains Mono** (só timecode, duração e contagem).

O tema padrão de quem nunca escolheu (escuro ou Auto) fica em aberto e será decidido
na história dos tokens do tema (H-04).

## Consequências

- Uma mudança visual passa a ser feita em um lugar, e a leitura das telas perde a
  aparência embutida (`style={{`).
- **Catracas de design** no `vitest`, com teto que só desce, defendem o sistema
  (cor literal, piso de fonte, `backdrop-filter` só na casca, feixe só no lugar, um
  primário por tela; a lista está nas §8 e §9.4 da direção).
- A migração é em histórias do épico E-069, em ordem fixa: tokens → componentes →
  casca → telas → remoção → auditoria. As duas camadas convivem até a última.
- Custo a vigiar: blur ao vivo. A regra de desempenho (§3.6 da direção) manda medir o
  editor tocando vídeo antes de fechar.

## Alternativas consideradas

- **Rodadas 1 a 4.** Descartadas pelo dono; a rodada 4 (a "tecla": aresta dura, poço
  com sombra interna, régua e agulha, neutros quentes, barra lateral pintada na cor
  do canal) foi a última delas.
- **A "tecla".** Descartada: profundidade por aresta e poço contraria o que o dono
  quer ver (profundidade por luz).
- **Direção editorial clara.** Descartada: tema claro com tipografia de revista
  vai contra as quatro referências do dono, todas escuras.
- **Manter as três camadas e só trocar valores.** Descartada: preserva os 3
  vocabulários e as 737 linhas de `style={{` que causam o problema.

## Gatilho de revisão

Uma segunda identidade de produto (outro app, outra marca) ou o resultado da medição
de desempenho do editor reprovar o vidro: novo ADR que substitua este.
