# Contribuindo com o CortadorLive

Projeto pessoal. Estas notas mantêm o repo legível e sem regressões.

## Ambiente
Pré-requisitos e setup completo no [README](README.md). Subir tudo: `.\dev.ps1`.

## Antes de editar — locks
Cheque `.guia/locks/registry.yaml` antes de tocar qualquer arquivo. Arquivo travado
não pode ser editado/movido/renomeado sem autorização explícita + marca
`[unlock:<id>]` no commit. Detalhes em [CLAUDE.md](CLAUDE.md).

## Padrão de commit
Conventional Commits + gitmoji ANTES do tipo, descrição em PT no imperativo,
escopo `(D-NNN)`. Ex.: `🧹 chore(D-090): adiciona llms.txt e CONTRIBUTING`.
Um commit por funcionalidade. Tabela de tipos/emoji em [CLAUDE.md](CLAUDE.md).

## Princípios de engenharia
- Backend em camadas (routers → services → domain/infrastructure); `domain/` é puro.
- Código novo em domain/services nasce com ao menos 1 teste de caminho feliz.
- Sem refactor de brinde; rode os testes da área alterada antes de fechar.

## Antes de abrir PR
Rode localmente o que o CI (`.github/workflows/ci.yml`) valida:
- **Backend**: `ruff check .`, `ruff format --check .` e `pytest` (dentro de `backend/`).
- **Frontend**: `npm run lint`, `npx tsc --noEmit`, `npx vitest run` e `npm run build` (dentro de `frontend/`).
- **Video-renderer**: `npm run lint` (dentro de `video-renderer/`).
- CI também valida locks (`.github/workflows/lock-check.yml`).
