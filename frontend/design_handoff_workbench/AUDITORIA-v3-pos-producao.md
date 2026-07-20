# AUDITORIA v3 — Pós-produção (Cenas + Layout YouTube)

> Gerada em 19/07/2026. **Fonte da verdade: o código real do `frontend/`**
> (as capturas `v2-pos-*.jpg` chegaram corrompidas/em branco — 260×277px sem
> pixels; ver nota no fim). Mesmo formato da AUDITORIA-v2:
> **OK / ADAPTAR / REFAZER** por seção, com arquivo-alvo e valores concretos.
>
> Regras que valem para tudo (iguais à v2):
> - Toda cor sai de tokens `--wb-*`. Nada de hex solto nem tokens legados
>   (`--surface-*`, `--text-100…500`, `--error`, `--info`, `accent-500`).
> - Não inventar telas/funções que não existem no app.
> - Viewport de referência: **1600×900**.

---

## 0. Resumo — descoberta importante desta auditoria

Ao auditar o código atual, os painéis **CenasPanel / CenaItem /
YoutubeLayoutPanel / PosTopbarExtra JÁ estão no padrão denso do Bruto**
(replicam `design_reference/src/v3_pos.jsx`, com as decisões do Paulo
registradas em comentário). O que faz a Pós parecer "datada" **não são os
painéis — são os primitivos compartilhados** que esses painéis abrem:

1. **`ui/modal.tsx`** — shell de TODOS os modais (Metadados, Cenas manual,
   Render steps, Análise IA, Publicar em massa) ainda usa tokens legados
   (`bg-surface-1`, `text-text-100`, `accent-500`) e tipografia genérica.
   É a causa raiz do item 2 do README-v2.
2. **`ui/input.tsx` e `ui/card.tsx`** — idem (tokens legados).
3. **Stragglers pontuais** de tokens legados em 4 arquivos da Pós (§5).

Portanto: as seções 1–2 abaixo **canonizam** os valores já implementados
(para o protótipo e futuras telas seguirem), e as seções 3–6 são o trabalho
real desta rodada.

---

## 1. Painel CENAS — **OK** (canonizar, não mexer)

**Arquivo:** `features/editor/fase2/CenasPanel.tsx` + `CenaItem.tsx`.

Valores canônicos (já no código — usar como referência de densidade):

- **Shell:** `rounded-[var(--radius)] border --wb-border-soft bg --wb-bg-card`;
  header com `border-b --wb-border-soft bg --wb-bg` e `padding:12px`.
- **Título:** serif (`font-editorial`) **17px/500** cor `--wb-ink` + chips
  contagem (`--wb-accent-soft`/`--wb-accent`, mono 10px bold uppercase
  tracking 0.04em) + caption direita mono **9.5px bold uppercase
  tracking 0.08em** `--wb-text-dim`.
- **Stats grid 3** (Duração/Densidade/Cobertura): card
  `--wb-bg-card` borda `--wb-border-soft` raio `--radius-xs`,
  `padding:6px 8px`; label mono 9px bold uppercase 0.08em `--wb-text-dim`;
  valor mono 11.5px tabular `--wb-text`.
- **Item de cena fechado:** ícone do tipo 32×32
  (`color-mix(meta.color 18%, --wb-bg-card)`, borda
  `color-mix(meta.color 50%, --wb-border)`), título 12.5px semibold,
  timecodes mono 10px tabular `--wb-text-dim`, chip do tipo pill mono 9px
  bold uppercase (`color-mix(meta.color 14%, transparent)`).
- **Item ativo:** fundo `color-mix(meta.color 10%, --wb-bg-card)` + borda
  `meta.color` + `--wb-shadow`. Sobreposto: `--wb-err-soft`/`--wb-err`.
- **Footer:** `bg --wb-bg-inset`, `padding:10px`, "Tipos disponíveis ▾"
  11px `--wb-text-mute` + CTA "Marcar validadas" (accent; validada → `--wb-ok`).

## 2. Painel LAYOUT YOUTUBE — **OK** (canonizar, não mexer)

**Arquivo:** `features/editor/fase2/YoutubeLayoutPanel.tsx` (+
`youtubeLayoutPanel/components.tsx`). Já replica `v3_pos.jsx > TabLayout`
com FundoThumb SVG, card "Padrão" destacado e as decisões do Paulo
(modo do projeto lido de `layout_youtube_padrao.modo_padrao` etc.).
Mesma linguagem do §1. Nenhuma mudança de estilo nesta rodada.

## 3. Barra de steps da Pós — **OK, manter os 4 rótulos reais**

**Arquivo:** `features/editor/PosTopbarExtra.tsx`.

Decisão de design: **manter "Metadados / Cenas / Validar / Renderizar"**
(passos reais e clicáveis > rótulos ilustrativos "Bruto/Cenas/Grade/Final"
do protótipo — o protótipo será atualizado, não o app). A aparência atual
já está correta; valores canônicos:

- Pill container: `border --wb-border-soft; bg --wb-bg-inset; padding:4px;
  border-radius:9999px`.
- Passo: `h-28px; border-radius:9999px; padding:0 12px 0 6px; gap:6px`;
  numeral em disco 20×20 mono 10.5px bold.
- Ativo: `bg --wb-accent; texto --wb-ink-fg` (disco invertido
  `--wb-ink-fg`/`--wb-accent`). Concluído: disco `--wb-ok` + ✓ branco,
  texto `--wb-ok`. Futuro: disco `--wb-bg-card` borda `--wb-border`,
  texto `--wb-text-mute`.
- Conector: `2×14px`; `--wb-accent` até o passo atual, `--wb-border` depois.

## 4. Shell de modal — **REFAZER** (causa raiz do "modal datado")

**Arquivo:** `components/ui/modal.tsx`. Único lugar com `bg-surface-1`,
`text-text-100/300`, `bg-bg-800`, `ring-accent-500` — todos legados.

Trocar por:

- Container: `background: var(--wb-bg-panel); border:1px solid
  var(--wb-border); border-radius: var(--radius-lg); box-shadow:
  var(--wb-shadow)`. Backdrop mantém `black/60 + blur`.
- Header: `padding:12px 16px; border-bottom:1px solid var(--wb-border-soft);
  background: var(--wb-bg)`. Título: **serif `font-editorial` 17px/500
  cor `--wb-text`** (mesma voz dos headers de painel). Description:
  **mono (`font-code`) 10.5px `--wb-text-dim`**, uppercase opcional só
  quando for metadado curto (ex.: "Corte #12").
- Botão fechar: 28×28, raio `--radius-xs`, `--wb-text-mute`,
  hover `bg --wb-bg-inset` + `--wb-text`; ring `--wb-focus`.
- Body: `padding:14px 16px`. Footer: `padding:10px 16px; border-top
  --wb-border-soft; bg --wb-bg-inset; gap:8px`.

Efeito colateral desejado: **MetadataModal, CenasManualModal,
RenderStepsModal, AnaliseIaModal, AuditoriaAnaliseModal e
PublicarMassaModal ficam no padrão sem tocar em cada um** (o conteúdo do
MetadataCard já está 100% em tokens `--wb-*`).

## 5. Primitivos e stragglers legados — **ADAPTAR**

| Arquivo | Linha(s) | Trocar por |
|---|---|---|
| `ui/input.tsx` | 11 | `bg --wb-bg-panel; border --wb-border; texto --wb-text; placeholder --wb-text-dim; focus:border --wb-accent` (h-9 → manter; fonte 13px) |
| `ui/card.tsx` | 9, 31 | `bg --wb-bg-card; border --wb-border-soft; shadow --wb-shadow`; título serif 17px/500 `--wb-text` |
| `PostProductionPage.tsx` | 557–570 | `text-text-100` → `text-[var(--wb-text)]`; `text-text-300` → `text-[var(--wb-text-mute)]` |
| `PostProductionPage.tsx` + `postProductionPage/components.tsx` | `text-error`, `bg-error`, `text-info`, `border-info/30`, `bg-info/10` | `--wb-err`, `--wb-info`, `--wb-info-soft` (soft já existe; não usar `/10` de token legado) |
| `fase2/sceneTypes.ts` | 139 | `tone` fallback → `border --wb-border; bg --wb-bg-inset; texto --wb-text-mute` |
| `fase2/EditorFase2.tsx` | 745 | resize handle hover → `hover:bg-[var(--wb-accent)]/50` |

Depois disso, `grep -n "surface-\|text-text-\|bg-bg-\|accent-500\|text-error\|text-info"`
em `src/` deve retornar **zero** fora de `index.css`/`tailwind.config.ts`
(remover os aliases legados do config quando zerar é opcional, mas recomendado).

## 6. Protótipo (`Workbench 1c.dc.html`, seção ABA POS) — **ATUALIZADO 19/07**

O protótipo foi atualizado nesta rodada para refletir os §1–3:

- **Steps** agora usam os 4 rótulos reais (Metadados ✓ / Cenas ativo /
  Validar / Renderizar) na pill inset com discos numerados e conectores,
  + marcador de tipo "🔥 TOP" à esquerda (VideoTypeMarker). Clicar em
  **Metadados** abre o modal de metadados no shell do §4 (header serif
  17px + description mono, body denso com labels mono 10.5px uppercase,
  footer inset) — referência visual viva do item 2 do README-v2.
- **Painel CENAS** (292px) no padrão denso: header serif "Cenas Remotion"
  17px/500 + chips contagem/"1 sem retrato", linha de ação primária
  (Gerar por IA accent + Retratos + ⋯), linha PADRÕES + AVANÇADO ▾,
  stats grid 3 (Duração/Densidade/Cobertura), itens com ícone 32×32 na cor
  do tipo + timecodes mono + pill do tipo (ativa = borda accent + mix 10%;
  sobreposta = err), footer "Tipos disponíveis 12 ▾" + "Marcar validadas".
- **Painel LAYOUT YOUTUBE** (276px): header serif + caption "TIPO DO
  PROJETO", seções mono uppercase (FUNDO com 3 mini-thumbs, POSICIONAMENTO
  com link "preset ↗", ESCALA/ZOOM, REGIÕES com chips COMP/FULL,
  card PADRÃO destacado em accent, ETAPAS DO RENDER).

Ou seja: protótipo e código agora contam a mesma história; qualquer
divergência futura resolve-se pelos valores canônicos dos §1–3.

---

## Nota sobre as capturas

`v2-pos-cenas-densidade.jpg` e `v2-pos-layout-youtube-densidade.jpg`
chegaram corrompidas (decodificam em branco). Se quiserem validação visual
das telas reais contra os §1–2, reenviem as capturas em PNG.

## Mapa de tokens

Sem tokens novos nesta rodada — tudo usa o mapa da AUDITORIA-v2
(`--wb-*` em `frontend/src/index.css:28-72` claro / `125-167` escuro).
