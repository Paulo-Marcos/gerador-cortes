# AUDITORIA v2 — Editor Bruto + Revisão final

> Gerada em 18/07/2026. Fonte da verdade: protótipo `Workbench 1c.dc.html`
> (aba **Cortes/Bruto** e aba **Revisão**). Mesmo formato da auditoria de 18/07:
> **OK / ADAPTAR / REFAZER** por seção, com arquivo-alvo e valores concretos.
>
> Regras que valem para tudo:
> - Toda cor sai de tokens `--wb-*` (ver mapa no fim). Nada de hex solto.
> - Não inventar telas/funções que não existem no app.
> - Painel retrátil sempre tem estado colapsado em faixa vertical de **40px**.
> - O centro nunca fica com menos de **420px**.
> - Viewport de referência: **1600×900** (o auto-colapso reage à largura).

---

## 0. Resumo do que mudou nesta rodada

O foco foi **reconstruir o editor Bruto** (o coração do app) e **adicionar a
timeline à Revisão final**. Direção geral: **vídeo grande e limpo, controles
escondidos atrás de ícones**, no espírito de um editor de vídeo do YouTube.

Mudanças-chave (Bruto):
1. Vídeo passa a ocupar **quase toda a largura** do centro (sem trilhos laterais).
2. **VEREDITO vira 4 ícones** (✓ ✕ 🔥 📖) — sem texto.
3. **Regerar bruto** e **abrir pasta** viram ícones na toolbar (⟳ / 📁).
4. **Sincronia do áudio** fica **oculta**; abre num painel compacto ao clicar 🎧.
5. **Linha de tempos (métricas)** fica **oculta**; abre ao clicar 🕑.
6. **Salvar** vira pílula flutuante no topo-direito (estilo VSCode).
7. **Velocidade + zoom + dividir/trecho** saem da tela e vão para um **menu
   suspenso ⚙** na timeline.
8. **Atalhos** somem da tela (já estão no menu lateral); viram um tooltip no ícone ℹ.
9. **Timeline** com **onda sonora detalhada** (SVG, ~200 barras espelhadas),
   faixa única, sem divisão no meio.
10. Painéis **CORTES** e **TRECHOS/TRANSCRIÇÃO** ganham uma seção retrátil no rodapé
    (2/3 lista + 1/3 ferramentas pouco usadas).

Mudança-chave (Revisão): a tela ganha uma **timeline CENAS + LAYOUT YT** para
conferir se as cenas renderizaram e se o palco foi gerado.

---

## 1. Shell / layout do editor Bruto — **ADAPTAR**

**Arquivo-alvo:** `WorkbenchEditorLayout` (layout de 4 colunas do editor).

Estrutura (esquerda → direita):

| Coluna | Largura | Colapsado |
|---|---|---|
| Rail Projetos ativos | 220px | 40px |
| CORTES | 240px | 40px |
| **Centro (player + timeline)** | flex, **min 420px** | — |
| TRECHOS / TRANSCRIÇÃO | ~300px | 40px |
| FILA GLOBAL | ~220px | **40px (colapsada por padrão)** |

- Centro: `display:flex; flex-direction:column; padding:10px; gap:8px;
  position:relative` (o `relative` ancora a pílula Salvar).
- Ordem vertical do centro: **toolbar → vídeo → (sincronia) → (tempos) → timeline**.

---

## 2. Toolbar do Bruto (veredito + ferramentas) — **REFAZER**

**Arquivo-alvo:** header do editor de corte (hoje botões escritos).

Linha única `display:flex; align-items:center; gap:6px`. Botão-ícone padrão:

```
aspect-ratio:1; flex:0 1 38px; min-width:26px;
display:flex; align-items:center; justify-content:center;
border-radius:9px; cursor:pointer;
```

> ⚠️ **Encolhimento proporcional:** os ícones NÃO devem esticar/espremer só a
> largura quando os painéis abrem. Com `aspect-ratio:1` + `flex:0 1 38px` +
> `min-width:26px` o fundo diminui proporcional (fica sempre quadrado).

Itens, na ordem:

| Ícone | Ação | Fundo / borda | Fonte |
|---|---|---|---|
| ✓ | Aprovar (tecla A) | `--wb-ok` / — | 16px, `#fff` |
| ✕ | Rejeitar (tecla R) | `--wb-err` / — | 15px, `#fff` |
| 🔥 | Marcar fire (F) | `--wb-fire-soft` / `--wb-fire` | 15px |
| 📖 | Modo leitura | `--wb-inset` / `--wb-border` | 15px |
| ⟳ | Regerar bruto | `--wb-inset` / `--wb-border` | 15px |
| 📁 | Abrir pasta do corte | `--wb-inset` / `--wb-border` | 14px |
| 🕑 | Alterna **Tempos** | ativo: `--wb-acc-soft`/`--wb-acc`; inativo: `--wb-inset`/`--wb-border` | 14px |
| 🎧 | Alterna **Sincronia** | idem 🕑 (estado ativo/inativo) | 14px |
| ℹ️ | Tooltip de atalhos (só `title`) | transparente | 14px |

- Separador vertical entre 📖 e ⟳: `width:1px; height:24px; background:--wb-border`.
- Depois do ℹ️: rótulos **`VÍDEO ORIGINAL · 4K`** (chip `--wb-inset`) e
  **`corte de 12:10.2`** (mono, `--wb-dim`), com `flex:0 1 auto; min-width:0;
  overflow:hidden; text-overflow:ellipsis` (encolhem/elipse quando falta espaço).
- Espaçador `flex:1` e, por último, a **pílula Salvar** (ver §3).
- **Tooltip do ℹ️** (atributo `title`): `Aprovar A · Rejeitar R · Fire F ·
  In/Out [ ] · Navegar ←→ 5s · Desfazer ⌘Z`.
- **Removido da tela:** botão de atalhos (⌨) — já existe no menu lateral vertical.

---

## 3. Salvar flutuante (estilo VSCode) — **ADAPTAR**

- Último filho flex da toolbar (**não** `position:absolute` — filho normal, para
  a linha reservar a largura e nada deslizar por baixo). `flex:none`.
- `display:flex; align-items:center; gap:6px; padding:7px 11px; border-radius:8px;
  background:--wb-panel; border:1px solid --wb-border; box-shadow:--wb-shadow`.
- Conteúdo: ponto de "não salvo" (`7×7px; border-radius:50%; background:--wb-warn`)
  + texto **Salvar** (700, 10.5px) + atalho **⌘S** (mono, 9px, `--wb-dim`).
- Comportamento: salva o corte (título/intervalo/trechos). Dispara também com **⌘S**.

---

## 4. Player (vídeo) — **ADAPTAR**

- Largura: **100% do centro** (`width:100%; max-width:100%`), `aspect-ratio:16/9`,
  **`max-height:44vh`** (encolhe centralizado quando falta altura), `min-height:0`.
- `border-radius:12px; box-shadow:--wb-shadow`. Fundo do vídeo real.
- Chips sobre o vídeo: **BRUTO** (topo-esq), **1.5×** (topo-dir),
  **`52:23 / 1:07:15`** (rodapé-esq) — mono 9–10px, fundo `rgb(0 0 0/.5)`.

---

## 5. Sincronia do áudio (oculta) — **REFAZER**

**Arquivo-alvo:** controle de sync de áudio (hoje sempre exposto).

- **Oculto por padrão.** Abre/fecha pelo ícone 🎧 da toolbar (estado destaca o ícone).
- Aparece como **faixa horizontal compacta** entre o vídeo e a timeline:
  `display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:7px 10px;
  border-radius:10px; background:--wb-panel; border:1px solid --wb-acc`.
- Conteúdo: 🎧 + label `SINCRONIA DO ÁUDIO` + valor **`0 ms`** (caixa `--wb-inset`)
  + botões **−100 / −10 / +10 / +100** (`--wb-inset`/`--wb-border`, mono) +
  **slider** (trilho `--wb-inset`, knob `--wb-acc` 14px) + **⟲ resetar** + **✕ fechar**.
- Atalhos de teclado: `,` e `.` ajustam; valor > 0 atrasa a voz.

---

## 6. Linha de tempos / métricas (oculta) — **ADAPTAR**

**Arquivo-alvo:** faixa de métricas do corte.

- **Oculta por padrão.** Abre/fecha pelo ícone 🕑 da toolbar.
- Bloco `--wb-panel`/`--wb-border`, `padding:8px 10px; border-radius:10px`.
- **Linha 1 — grid de 6 campos** `grid-template-columns:repeat(6,minmax(0,1fr));
  gap:8px`. Cada campo: label mono 8px `--wb-dim` + valor mono ~11px em caixa
  `--wb-inset`, tudo com `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`:
  1. `FIM ANTERIOR` → `—`
  2. `NO CORTE` → `00:00.0`
  3. `NO ORIGINAL` → `00:52:23.112` (fonte 10.5px)
  4. `DURAÇÃO` → `12:10.2`
  5. `LÍQUIDO S/ TR.` → `08:02.1` (caixa `--wb-ok-soft`, texto `--wb-ok-ink`)
  6. `INÍCIO PRÓX` → `—`
- **Linha 2:** `TÍTULO DO CORTE` (input flex, elipse) + `TRECHOS` (`113 desvios`) +
  botão **✂ Intervalo** (`--wb-acc-soft`/`--wb-acc`) — abre a edição do
  intervalo in/out do corte (era o "botão de intervalo" que faltava).

---

## 7. Timeline do Bruto — **REFAZER**

**Arquivo-alvo:** componente de timeline/waveform do editor.

Container: `flex:1; min-height:150px; border-radius:11px; background:--wb-panel;
border:1px solid --wb-border; position:relative; overflow:hidden`.

**Header (linha única, `white-space:nowrap; overflow:hidden`):**
- `TIMELINE` + tempo `00:41.2 / 01:12.6` (mono).
- Transporte agrupado (`flex:none`): ⏮ ◀◀ **▶** ▶▶ ⏭ (▶ com `--wb-acc`), depois
  **⚑ In** (`--wb-ok-soft`) e **⚐ Out** (`--wb-err-soft`).
- 🔒 trecho travado (ícone).
- Espaçador `flex:1`.
- **⚙ ▾** → abre o **menu suspenso** (abaixo).
- (Sem "− zoom +" exposto, sem chevron de expandir — a timeline não duplica mais.)

**Menu ⚙ (`position:absolute; top:38px; right:10px; z-index:8; width:190px`):**
`VELOCIDADE` (.5× / 1× / **1.5×** / 2×) · `ZOOM` (− slider +) · separador ·
`÷ dividir corte aqui` · `＋ trecho aqui`.

**Onda sonora — a parte mais importante: precisa ser EXTREMAMENTE detalhada.**
- Faixa **única** (SEM divisão/gap no meio — o efeito antigo de "onda duplicada"
  estava errado).
- Recomendado desenhar a partir dos **samples reais** do áudio (peaks por pixel).
  No protótipo é um **SVG com ~200 barras** espelhadas no eixo central, amplitude
  variável, com fade suave nas pontas — use isto como referência de densidade:
  ```
  viewBox 0 0 1000 100, preserveAspectRatio="none", width/height 100%
  200 <rect> de largura ~2.5, y=50-h .. 50+h (espelhado), rx metade da largura
  fill: var(--wb-dim); opacity .7
  envelope: 0.28 + 0.72 * sin(i/N * π)^0.5 ; amplitude pseudo-aleatória por barra
  ```
  Na aplicação real, troque o pseudo-random pelos **peaks do arquivo** para ficar
  fiel ao áudio (é o que o usuário mais valoriza aqui).
- Sobreposições (camadas `position:absolute` sobre a onda):
  - Seleção IN→OUT: `left:12%; width:46%; background:--wb-ok; opacity:.16`.
  - Desvio removido: `left:34%; width:5%; background:--wb-err; opacity:.28`.
  - Marcadores IN (12%) e OUT (58%): `width:2px; background:--wb-ok`.
  - Playhead: `width:2px; background:--wb-acc; box-shadow:0 0 6px --wb-acc`.
  - Labels `IN 00:12` / `OUT 01:24` (mono 8.5px, `--wb-ok-soft`).

---

## 8. Painel CORTES (2/3 lista + 1/3 ferramentas) — **ADAPTAR**

**Arquivo-alvo:** lista de cortes do editor.

- Lista: `flex:1; min-height:0; overflow-y:auto` (rola).
- Rodapé retrátil `flex:none; border-top:1px solid --wb-border`:
  - Header clicável **`⚙ FERRAMENTAS DO CORTE`** + chevron (`▸`/`▾`); **fechado por padrão**.
  - Aberto: coluna de botões **pouco usados** — `÷ dividir corte em dois`,
    `⧉ duplicar corte`, `↕ reordenar cortes`, `✂ adicionar corte manual`,
    `🗑 excluir corte` (este em `--wb-err-soft`/`--wb-err`).
- Colapsado (40px): faixa vertical com `CORTES · 12/18` e ponto de status.

---

## 9. Painel TRECHOS / TRANSCRIÇÃO (2/3 + 1/3) — **ADAPTAR**

**Arquivo-alvo:** painel de trechos/transcrição.

- Abas `Trechos` / `Transcrição` no topo; lista com `flex:1; overflow-y:auto`.
- Rodapé retrátil `flex:none; border-top`:
  - Header **`⭐ MAIS AÇÕES`** + chevron; **fechado por padrão**.
  - Aberto: `⭐ Influenciar a capa com este trecho`, `⤓ Exportar transcrição (SRT)`,
    `🔍 Buscar na transcrição`, `⟳ Regerar transcrição`.
- Colapsado (40px): faixa vertical `TRECHOS · TRANSCRIÇÃO`.

---

## 10. Revisão final — timeline CENAS + LAYOUT YT — **REFAZER**

**Arquivo-alvo:** tela de revisão final (`final-review`).

Motivo: hoje a Revisão só mostra o vídeo final. O usuário precisa **conferir, na
própria tela, se as cenas renderizaram e se o palco (layout YouTube) foi gerado**.

Centro (coluna, `padding:12px; gap:10px`):
1. **Header:** `VÍDEO FINAL` + chip `1920×1080 · 29.97fps · H264` + `⬇ MP4` + `📁 Pasta`.
2. **Vídeo final** reduzido: `height:clamp(170px,36vh,360px); aspect-ratio:16/9;
   max-width:100%; align-self:center` (menor para caber a timeline).
3. **Ações:** `✓ Aprovar e publicar` (--wb-ok) · `↩ Voltar para pós` · `⟳ Re-renderizar`
   · (flex) · `canal: … · agendar 18:00`.
4. **Timeline** (`flex:1; min-height:150px; --wb-panel`):
   - Header: `TIMELINE · CENAS + LAYOUT YOUTUBE` + badges `9 cenas ✓` e
     `palco gerado ✓` (`--wb-ok-soft`/`--wb-ok-ink`) + transporte (⏮ ▶ ⏭) + `− zoom +`.
   - **Trilha CENAS:** blocos clicáveis (largura ∝ duração de cada cena; cor por
     tipo usando `--wb-info-soft`/`--wb-ok-soft`/`--wb-acc-soft`), `title` = nome +
     "(renderizada)". Clicar → posiciona o playhead / abre a cena.
   - **Trilha LAYOUT YT:** barra do **palco** (`--wb-fire-soft`/`--wb-fire`) com
     `PALCO · TELA CHEIA · 07:09.8`.
   - Playhead vertical `--wb-acc` cruzando as duas trilhas.
   - Eixo de tempo: `00:00.0 … 07:09.8` (mono, alinhado ao início das trilhas).

---

## 11. Mapa de tokens `--wb-*`

Use SEMPRE estes; nada de hex solto. (Nomes conforme a folha de estilo do design
system — confirme os nomes exatos no `.css` do projeto antes de aplicar.)

| Papel | Token |
|---|---|
| Fundo app | `--wb-bg` |
| Painel / cartão | `--wb-panel` |
| Inset (caixas, chips, botões neutros) | `--wb-inset` |
| Borda | `--wb-border` |
| Texto | `--wb-text` |
| Texto secundário | `--wb-mute` |
| Texto terciário / labels | `--wb-dim` |
| Acento | `--wb-acc` / sobre acento `--wb-acc-fg` / suave `--wb-acc-soft` |
| Sucesso / aprovado | `--wb-ok` / `--wb-ok-soft` / `--wb-ok-ink` |
| Erro / rejeitado | `--wb-err` / `--wb-err-soft` |
| Fire | `--wb-fire` / `--wb-fire-soft` |
| Aviso | `--wb-warn` / `--wb-warn-soft` / `--wb-warn-ink` |
| Info (cenas) | `--wb-info` / `--wb-info-soft` |
| Sombra | `--wb-shadow` |

> **Tema escuro** continua pendente da rodada anterior (as capturas `-escuro`
> renderizaram claro). Ao aplicar estes componentes, garanta que TODAS as cores
> venham dos tokens acima para o dark funcionar sem retrabalho.

---

## 12. Checkpoints de implementação (ordem sugerida)

- [ ] **CP1** — Shell/4 colunas do Bruto: centro `min 420px`, FILA colapsada 40px por padrão.
- [ ] **CP2** — Toolbar de ícones (veredito + ⟳/📁/🕑/🎧/ℹ) com encolhimento proporcional (`aspect-ratio:1; flex:0 1 38px; min-width:26px`).
- [ ] **CP3** — Salvar flutuante (último flex, ⌘S) + remover botão de atalhos da tela.
- [ ] **CP4** — Vídeo largo (100% / `max-height:44vh`) com chips BRUTO/velocidade/tempo.
- [ ] **CP5** — Sincronia oculta atrás do 🎧 (faixa compacta).
- [ ] **CP6** — Tempos ocultos atrás do 🕑 (grid de 6 campos) + botão ✂ Intervalo.
- [ ] **CP7** — Timeline: header + transporte + menu ⚙ (velocidade/zoom/dividir/trecho).
- [ ] **CP8** — **Onda sonora detalhada a partir dos peaks reais** (faixa única, sem gap).
- [ ] **CP9** — CORTES: lista rolável + rodapé retrátil "Ferramentas do corte".
- [ ] **CP10** — TRECHOS/TRANSCRIÇÃO: lista + rodapé retrátil "Mais ações".
- [ ] **CP11** — Revisão: header + vídeo reduzido + ações + timeline CENAS/LAYOUT YT clicável.
- [ ] **CP12** — Passar tudo por tokens `--wb-*` e validar tema claro **e** escuro.
- [ ] **CP13** — Conferir no viewport 1600×900: nada truncado, timeline visível, sem sobreposição.

---

## 13. Prompt para o agente de implementação

Cole no agente de código, na raiz do repositório do CortadorLive (`frontend/`):

```
Contexto: sou um app React + Tailwind (CortadorLive) que transforma lives do
YouTube em cortes editados, já rodando com o shell Workbench (VITE_WORKBENCH=1).

Tarefa: implementar EXATAMENTE o redesign descrito em
`design_handoff_workbench/AUDITORIA-v2.md`. Esse arquivo é a fonte da verdade —
siga seção por seção (§1 a §11) e marque os checkpoints de §12 conforme concluir.

Escopo desta rodada: aba **Bruto** (editor de corte) e aba **Revisão final**.
NÃO altere outras telas. NÃO invente funções/telas que não existem no app.

Regras rígidas:
- Toda cor via tokens `--wb-*` (§11). Zero hex solto. Deve funcionar em claro E escuro.
- Painel retrátil sempre tem estado colapsado em faixa vertical de 40px.
- O centro do editor nunca fica com menos de 420px.
- Ícones da toolbar encolhem PROPORCIONAL (fundo quadrado): aspect-ratio:1;
  flex:0 1 38px; min-width:26px. Nunca esticar só a largura.
- Sincronia (🎧) e Tempos (🕑) começam OCULTOS e abrem por clique no ícone.
- Salvar é pílula flutuante (último item flex da toolbar) + atalho ⌘S.
- Onda da timeline: desenhar a partir dos PEAKS reais do áudio (faixa única, sem
  divisão no meio) — é o item mais importante para o usuário.
- Revisão: adicionar a timeline CENAS + LAYOUT YT clicável para conferir cenas
  renderizadas e o palco gerado.

Referência visual/estrutural: o protótipo `Workbench 1c.dc.html` (abas Cortes e
Revisão) reproduz o alvo pixel a pixel — abra e compare. Reaproveite os
componentes existentes (WorkbenchEditorLayout, PlayerCap, timeline atual) em vez
de recriar do zero.

Antes de finalizar: rode o app em 1600×900 e confirme, pra Bruto e Revisão, que
nada está truncado, a onda e a timeline aparecem, os painéis colapsam em 40px e
não há sobreposição. Gere uma nova bateria de capturas (script de captura de
telas, versão v2) para revisão.
```

---

## 14. Qual agente usar

**Recomendado: Claude Code (Sonnet/Opus mais recente) rodando localmente no repo
`frontend/`.**

Por quê, para este caso:
- É um app React + Tailwind **já em produção**, com componentes existentes a
  reaproveitar — o trabalho é *edição cirúrgica multi-arquivo* (layout, estado de
  toggles, SVG de waveform, tokens), não geração greenfield. Claude Code lê a
  árvore, edita vários arquivos e roda o dev server/capturas no mesmo lugar.
- A auditoria é um checklist longo e verificável (§12) — encaixa no ciclo
  "implementa → captura v2 → confere contra o protótipo" que vocês já usam.
- Precisa tocar código real de timeline/áudio (peaks) e do shell — melhor um
  agente com acesso ao filesystem e terminal do que um assistente de chat.

Alternativas aceitáveis: **Cursor** (Composer/Agent) se você preferir revisar
diff a diff no editor; **Codex/agente via API** se for rodar em CI. Evite pedir a
um chat sem acesso ao repositório — o valor aqui está em editar os componentes
existentes com os tokens certos, não em recriar telas.
