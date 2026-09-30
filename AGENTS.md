# AGENTS.md

**Fonte única de instruções para agentes de IA neste repositório** — Claude, Codex, Cursor, Cline, Copilot e afins. O `CLAUDE.md` só importa este arquivo (`@AGENTS.md`). Curto de propósito: o detalhe mora em `docs/` e é lido quando o assunto aparece.

> Regra de ouro: **confira no código antes de escrever.** Este documento já afirmou que a fila de render era SQLite e que o n8n era o caminho da IA — nenhum dos dois era verdade.

## O projeto

**CutCut / CortadorLive** transforma lives do YouTube em cortes prontos: baixa → transcreve → a IA propõe cortes → o operador aprova → metadados e capa → render → publica (YouTube, TikTok, Instagram) e gera shorts. Roda localmente, só no Windows (ADR-0008), com um banco e uma pasta por **canal**. Domínio: [`docs/dominio/`](docs/dominio/) — [glossário](docs/dominio/glossario.md) e [regras RN-xx](docs/dominio/regras-de-negocio.md); ao tocar numa regra catalogada, cite a RN na docstring.

## Como rodar

`.\dev.ps1` sobe backend (8000), frontend (4300), Remotion Studio (3200) e o worker de render. DEV em outra porta: `dev.ports.local.ps1`. **A PROD mora em `C:\PRD\gerador-cortes`, nas mesmas portas padrão: nunca a derrube.** Instalação: [`docs/SETUP.md`](docs/SETUP.md).

## Arquitetura

- **Backend** (FastAPI, Python 3.11+): `routers/` (só HTTP) → `services/` (orquestração) → `domain/` (regras puras: sem FastAPI, SQLAlchemy, HTTP nem `models`) e `infrastructure/` (mundo externo). SQLite assíncrono (WAL), um banco por canal. Fronteiras verificadas pelo import-linter (`backend/pyproject.toml`).
- **Erros:** service e domínio levantam `ErroDeDominio` (`domain/compartilhado/erros.py`); um tratador global escolhe o status. Router não traduz erro.
- **IA:** pela assinatura do operador, sem chave: Claude CLI e Antigravity CLI (`agy -p`), mais o modo manual e a API do Gemini (cenas, capas). As skills editoriais são **por canal, no banco** (tela de Canais).
- **Frontend** (React 19 + Vite 6 + TanStack Query): páginas em `frontend/src/features/`; fronteiras entre pastas pelo ESLint.
- **Renderer** (`video-renderer/`, Remotion): a fila é **de arquivos** (`req_<id>.json` → `res_<id>.json`), contrato em `video-renderer/protocol/`. A cena tem uma definição só (zod em `video-renderer/src/schema.ts`). **Overlay é ProRes 4444, obrigatório**; filtergraph com fonte infinita precisa de limite.
- **Contrato HTTP:** `backend/openapi.json`; mudança intencional: `ATUALIZAR_OPENAPI=1 pytest tests/test_contrato_openapi_d664.py`.
- **Ciclos de vida** com dono no domínio (`domain/projeto/ciclo_projeto.py`, `domain/corte/ciclo_corte.py`). Schema evolui no boot (`app/migrations/`): coluna nova se declara no modelo; o resto vira migration versionada.

## Configuração

- Segredos no `backend/.env` (o agente não o lê: deny list em `.claude/settings.json`). Configuração e customização **no banco, por canal, editáveis na tela** ([ADR-0012](docs/adr/0012-onde-vive-cada-configuracao.md)).
- `instance/` tem layout vigiado: arquivo solto na raiz trava o boot.
- **Cascata de layout é PARCIAL** (RN-10): chave ausente é a herança; normalize na leitura, nunca materialize ao gravar.

## Regras de produto

- "Gerar com IA" dispara sozinho no gesto do fluxo, sem modal, e nunca sobrescreve texto já gerado (a capa é a exceção).
- Vocabulário do domínio igual em código, banco e tela. Função nova é **verbo em português** (D-718).

## Skills

Por pasta, as rules em `.claude/rules/` e `.agents/rules/` trazem o essencial do escopo e valem sem skill. As skills de desenvolvimento são globais (repositório `my-skills`); no projeto ficam só as do app, no banco.

| Pasta | Principal | Também |
|---|---|---|
| `backend/**` | `clean-architecture-guardian`, `clean-code-review` | `domain-driven-design` (estratégico) |
| `frontend/**` | `react-frontend-engineer` | `ux-usability`, `react-best-practices` |
| `video-renderer/**` | `remotion-best-practices` | `react-best-practices` |

Fluxo: `pr-audit` antes de integrar, `security-audit` em fronteira sensível, `pr-bump` para dependências, `release` para publicar (`bin\release.ps1`), `kaizen` ao fechar com retrabalho.

## Fluxo de entrega, travas e commit

Detalhe em [`docs/processo-de-trabalho.md`](docs/processo-de-trabalho.md). O essencial:

- **Nada entra na `main` sem PR.** Toda implementação nasce num worktree próprio, numa branch `d-NNN-slug` a partir da `origin/main`; vai por PR, o CI roda (`CI ok` + travas), a aprovação passa **sempre** pela `pr-audit` (`pr-bump` no Dependabot) e o merge é squash, com o ok do Paulo. **Sessão na nuvem abre o PR e para**: nunca faz merge, porque as skills de auditoria moram no PC; o check `Auditoria registrada` só fica verde com o relatório comentado no PR com o SHA auditado (D-838). Conflito se resolve na branch (rebase), antes da aprovação. PR não é release: a release é quando o lote usado na PROD está bom.
- **Antes de editar, `python bin/check-lock.py check <arquivo>`.** Travado: não edite, apague, mova nem recrie sem autorização explícita do dono. Arquivo novo também é trava (`adicoes-exigem-autorizacao`). O commit leva `[unlock:<id>] motivo: ...` para cada trava tocada.
- Commit: `<emoji> <tipo>(<D-NNN>): <descrição imperativa>`, em português, um por funcionalidade; tabela de tipos no documento acima.
- Na árvore principal, que outras sessões também usam: commit **com pathspec**, nunca `git add -A` nem `git stash`; confira a HEAD antes de commitar índice montado à mão.

## Portão de qualidade

Detalhe e o que fazer quando uma catraca reprova: [`docs/qualidade.md`](docs/qualidade.md).

```bash
# backend (pelo backend/.venv)
ruff check . && ruff format --check . && lint-imports && pytest
# frontend
npm run lint && npx tsc --noEmit && npx vitest run && npm run build
```

Antes de cada commit: `pytest -m "not integration" -n 6`. Catracas de tamanho de arquivo (500), de função e de tipos: **o teto nunca sobe** — divida o código.

## Armadilhas

- **Rode pelo `backend/.venv`**, nunca pelo Python global; sincronize com `bin\bootstrap.ps1 -Dev` antes de medir linha de base de catraca.
- **Código de saída de pipe mente** (`cmd | tail; echo $?` é o do `tail`): grave em arquivo e leia.
- **Barra invertida** de caminho do Windows numa string Python vira escape (`\b` é backspace): escreva com a ferramenta de edição ou string crua `r"..."`. O teste de encoding acusa.
- `.ps1` com acento precisa de BOM (o PowerShell 5.1 lê sem BOM como ANSI).
- `npm run format` reescreve tudo; o npm global antigo quebra `npm audit fix` — use o npm do Node 24.
- Processo se encerra **pelo PID**, nunca pelo nome; todo subprocesso tem `timeout`.
- Worktree de frontend precisa de `frontend/.env.local` com `VITE_API_URL`, senão fala com o backend de outra instância.

## Princípios

- App pequeno, de um mantenedor: **sem abstração para o futuro**.
- Código novo em `domain/` ou `services/` nasce com teste; **correção de defeito começa pelo teste que falha antes e passa depois**.
- Comentário explica o porquê. Sem código morto, TODO genérico ou `print` esquecido. Sem refactor de carona.
- Mudança de tela se testa no navegador.
- **Na dúvida, pergunte antes de editar.**
