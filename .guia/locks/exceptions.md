# Exceções registradas ao sistema de travas

Registro de casos em que um commit tocou um arquivo travado sem a marca
`[unlock:<feature-id>]`, junto da causa raiz e da decisão tomada — sem
reescrever o histórico existente.

## 2026-07-04 — AGENTS.md sem `[unlock:editor-cortes-stage-medallion]` (D-269)

`AGENTS.md` está listado na trava `editor-cortes-stage-medallion`
(`.guia/locks/registry.yaml`). Os commits abaixo o editaram sem a marca
`[unlock:editor-cortes-stage-medallion]` na mensagem:

- `d6626dc` — docs(D-238): reescrever seção de IA no AGENTS.md
- `ef542b5` — docs(D-239): corrigir rotas frontend e path de rules no AGENTS.md
- `d9eab62` — docs(D-240): remover env vars de canal obsoletas do AGENTS.md
- `45864be` — chore(D-241): remover seção Docker do AGENTS.md

**Causa raiz (ver D-267):** o hook local `.githooks/commit-msg` que valida a
marca `[unlock:]` estava desligado neste clone no momento desses commits
(`git config core.hooksPath` não apontava para `.githooks`). Não houve
intenção de burlar a trava — as edições em si eram legítimas realinhamentos
de documentação (D-238..D-241), só a marca de auditoria ficou faltando.

**Decisão (D-269):** registrar a exceção via este documento, sem reescrever
os 4 commits. Motivos: (1) reescrever exigiria `git rebase -i`, mudando os
SHAs de `d6626dc..45864be` e de tudo commitado depois deles em `main`, com
risco de quebrar branches/worktrees locais divergentes
(`cenas-nova-identidade`, `feat/motion-cortes-v2`, `worktree-agent-*`,
`worktree-render-logs-codec`) e colidir com sessões guia concorrentes na
mesma árvore; (2) o conteúdo das edições era legítimo, só faltou a marca de
auditoria — o risco de reescrever supera o ganho de "consertar" o
histórico.

O hook foi corrigido em D-267/D-268 para não voltar a acontecer.
