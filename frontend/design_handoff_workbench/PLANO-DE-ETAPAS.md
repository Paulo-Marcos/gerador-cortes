# Plano de implementação por etapas — anti-alucinação e anti-regressão

## Regras de ouro (valem para TODAS as etapas)

1. **Uma etapa por sessão/PR.** Não iniciar a próxima sem os aceites da atual verificados.
2. **Nunca escrever um valor que não se pode apontar**: cor/token → `index.css`; comportamento → arquivo citado no DE-PARA; layout → `Workbench 1c.dc.html`. Se não encontrar a fonte, PARAR e perguntar — não inventar.
3. **Não tocar** em `hooks/`, `lib/`, `types/`, lógica de `editorEditState`/`regerarBrutoPlan`/`renderEtapas`/`sceneValidation`, nem nos testes existentes, exceto onde a etapa mandar explicitamente.
4. **Rotas estáveis**: todas as rotas de `routes.tsx` continuam funcionando em todas as etapas (deep-links não quebram).
5. Cada etapa termina com: `npm run lint && npx vitest run` verdes + smoke manual do checklist da etapa + as telas antigas não migradas ainda abrindo normalmente.
6. Feature flag `VITE_WORKBENCH=1` (ou toggle em localStorage) até a Etapa 8 — shell novo e antigo coexistem; rollback é desligar a flag.

---

## Etapa 0 — Tokens e fundação (sem mudança visível)
- Adicionar em `index.css`: `--wb-bg-strip`, `--wb-accent-fg` (claro e escuro, todas as paletas de `usePalette`).
- Criar pasta `src/components/workbench/` vazia + `useWorkbenchPanels.ts` (estado aberto/colapsado + auto-colapso + persistência `workbench-panels-v1`) e `useWorkbenchTabs.ts` (abas + persistência `workbench-tabs-v1`) com testes unitários (ordem de auto-colapso: rail→fila→dir→esq; centro mín. 420px; expandir manual vence).
- **Aceite:** app idêntico ao atual; testes novos verdes.

## Etapa 1 — Shell: TabStrip + ProjectRail + GlobalQueue + PanelShell
- Implementar `PanelShell` (aberto/colapsado com barra vertical clicável, transição `width .22s`), `TabStrip`, `ProjectRail`, `GlobalQueue` conforme DE-PARA §0, atrás da flag.
- `AppShell` com flag ligada: tab strip no topo, rail à esquerda, fila à direita, `<Outlet/>` no centro. Sidebar antiga permanece com flag desligada.
- Fila global: derivar jobs de `useExportStatus`/`usePipelineStatus` dos projetos com render ativo; item concluído tem "abrir na aba".
- **Aceite:** navegar por todas as rotas com flag ligada; abas abrem/fecham/persistem/restauram; auto-colapso em 1024px e 768px; nenhuma página interna alterada.

## Etapa 2 — Biblioteca + Workspace do projeto
- Migrar `ProjetosPage` e `ProjetoDetalhePage` para os layouts do DE-PARA §1–2. Reusar filtros, busca, mutations e modais existentes sem alteração de lógica.
- **Aceite:** todos os filtros com contagens corretas; criar/remover/limpar projeto; reiniciar falhados; card→aba do workspace; card de corte→aba do editor no corte certo.

## Etapa 3 — Editor Bruto (a etapa mais sensível — fazer em 3 sub-passos)
- 3a: re-hospedar `EditorPage` no conteúdo da aba; `UnifiedSidebar` vira painel "CORTES" no `PanelShell` (tints preservados); nav duplicada removida.
- 3b: centro novo — player 16:9 com cap de altura, linha de transporte (A/R/🔥/📖), faixa de contexto do corte (título/IN/OUT/líquida/trechos/salvar/regerar).
- 3c: `TimelinePanel` em container `flex:1` + `RightTabsPanel` no `PanelShell` direito.
- ⚠ **Aceite crítico de waveform (DE-PARA §3):** onda real do WaveSurfer com peaks, altura preenchendo o painel; cursor sincronizado com o vídeo (<1 frame de drift, verificar com `audioOffsetSec`≠0); zoom sem perda de resolução; IN/OUT/desvios posicionados por tempo; arrastar bordas de desvio continua preciso; ⌘Z; dirty-state e Salvar; atalhos atuais todos funcionando.

## Etapa 4 — Pós-produção
- Steps 1–4 no topo, `CenasPanel` e `YoutubeLayoutPanel` em `PanelShell`, preview Remotion com cap 16:9, `SceneTimeline` `flex:1`, render → fila global ("renderizar em 2º plano" não bloqueia a aba).
- **Aceite:** fluxo completo cenas→grade→final; Ctrl+Alt+R; validação de cenas; job aparece na fila global e notifica ao concluir; `/export` (step 4) funciona.

## Etapa 5 — Metadados + Revisão final
- DE-PARA §5–6. **Aceite:** gerar/regerar títulos com score, copiar, avaliação de thumb com hints, publicar em massa; revisão aprova e publica.

## Etapa 6 — Páginas globais (Ranking, Buscar, Padrões, Análises)
- DE-PARA §7–9. **Aceite:** criar projeto do ranking abre aba; embasamento; as 3 sub-abas de Análises com dados reais; linhas com `flex-wrap` sem overlap em 900px.

## Etapa 7 — Configurações unificadas + Atalhos + customização
- Página Configurações (Canal ativo + Aplicação) com busca e "↺ padrão" por item; subpáginas skills/scaffolds/prompts master-detail; página Atalhos renderizada do `shortcutsRegistry`; adicionar os atalhos novos de `ATALHOS-E-CONFIGURACOES.md` §2 um a um, rodando `assertNoShortcutConflicts` a cada inclusão.
- **Aceite:** salvar/resetar cada setting; histórico de versões de skill com reverter; validação de placeholders de scaffold (⚠ ausente bloqueia salvar via 422); Ctrl+[/], Ctrl+B, Ctrl+K, Ctrl+Tab funcionando; export/import de settings.

## Etapa 8 — Remoção do shell antigo
- Apagar `Sidebar.tsx`, `SettingsModal` (shell), `CommonTopBar`/`EditorNavbar`/`PosTopbarExtra` (o que restou), flag `VITE_WORKBENCH`.
- **Aceite:** grep sem referências mortas; lint/testes verdes; smoke completo do `scripts/smoke-editor.md` atualizado.

---

## Checklist anti-alucinação por PR
- [ ] Todo componente citado no PR existe no DE-PARA (coluna "Hoje" ou marcado [NOVO]).
- [ ] Nenhum endpoint/hook novo inventado — apenas os de `lib/` e `hooks/` atuais.
- [ ] Nenhuma cor fora de `index.css`.
- [ ] Diff não toca arquivos da lista "não tocar" (DE-PARA §12).
- [ ] Screenshots antes/depois anexados nas larguras 1440 e 1024.
