---
trigger: model_decision
description: Utilizar quando for mexer no backend (Python/FastAPI).
---

# Backend (Python / FastAPI)

O essencial deste escopo — vale com ou sem skill instalada:

- Camadas: `routers/` (só HTTP) → `services/` (orquestração) → `domain/` (regras puras: sem FastAPI, SQLAlchemy, HTTP nem `models`) / `infrastructure/` (mundo externo). O import-linter (`backend/pyproject.toml`) reprova import na direção errada.
- Código novo em `domain/` ou `services/` nasce com teste do caminho feliz. Regra de negócio catalogada: cite a RN na docstring (`docs/dominio/regras-de-negocio.md`).
- DDD **pragmático**: vocabulário do glossário, ciclos de vida no domínio. Sem aggregates, CQRS ou repositórios de brinde.
- Todo subprocesso tem `timeout`; processo se encerra pelo PID, nunca pelo nome.
- Portão antes de declarar pronto: `ruff check .`, `ruff format --check .`, `lint-imports`, `pytest`.

Skills, quando disponíveis:

- `clean-architecture-guardian` para camadas e dependências (a lente macro);
- `clean-code-review` para legibilidade de função e nome (a lente micro);
- `domain-driven-design` só no modo estratégico (contextos e linguagem).

Não se aplicam aqui (são de projetos .NET): `ddd-implementation`, `csharp-craft`, `ef-core-data-architect`, `tdd-dotnet`.

Regras completas: `AGENTS.md`.
