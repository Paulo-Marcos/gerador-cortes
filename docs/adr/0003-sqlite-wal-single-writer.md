# ADR-0003: SQLite WAL single-writer

- **Status:** Aceito (retroativo)
- **Data:** 2026-06-24
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0002 (IPC backend↔worker)

> ADR retroativo: descreve a decisão **já em vigor e estável**, registrando o que
> existe hoje. Não propõe troca de stack.

## Contexto

A aplicação é **single-user**, rodando localmente. O backend é async-first (FastAPI +
asyncio): downloads (yt-dlp), transcodificação (FFmpeg), chamadas de IA e exports rodam
como tarefas `asyncio` fire-and-forget, enquanto o frontend lê estado via HTTP/WebSocket.

O padrão de acesso é, portanto, **muitas leituras concorrentes** (UI consultando projetos,
cortes e progresso) com **escritas pontuais** vindas das tarefas de pipeline. Não há
múltiplos usuários nem escrita concorrente real de processos distintos sobre as mesmas
linhas.

## Decisão

Usar **SQLite** (arquivo único `projetos.db`) via **SQLAlchemy async + aiosqlite**, em
modo **WAL (Write-Ahead Logging)**. Configuração em `backend/app/database.py:1-26`:

- `DATABASE_URL = sqlite+aiosqlite:///{PROJETOS_DIR}/projetos.db`
- `connect_args`: `check_same_thread=False`, `timeout=30`
- PRAGMAs aplicados em toda conexão nova (listener de `connect`):
  - `PRAGMA journal_mode=WAL` — leituras concorrentes durante escritas;
  - `PRAGMA busy_timeout=30000` — espera 30s antes de `database is locked`;
  - `PRAGMA synchronous=NORMAL` — menos `fsync`, ainda seguro sob WAL.

O **single-writer é consequência natural do WAL** (escritas serializadas, leitores nunca
bloqueiam o escritor). A serialização adicional necessária é feita por **locks de
aplicação por chave** (*single-flight*), não por lock global de banco — ex.:
`media_proxy.py` (lock por `corte_id`) e `pipeline_event_log.py` (lock por log). Assim,
operações de cortes diferentes correm em paralelo; só as do mesmo recurso esperam.

## Consequências

**Positivas**
- Zero setup operacional: arquivo único, backup trivial (copiar o `.db`), sem servidor.
- WAL entrega o que o app precisa: leituras da UI não travam enquanto o pipeline escreve.
- `synchronous=NORMAL` + WAL dão boa performance de escrita mantendo segurança aceitável.
- Adequado ao escopo single-user — sem complexidade prematura.

**Negativas / custos**
- **Não suporta multi-writer entre processos.** Concorrência real de escrita exigiria
  outra solução; hoje isso é evitado por design (escrita centralizada no backend).
- `database is locked` ainda é possível sob contenção extrema; mitigado por
  `busy_timeout=30s` e pelos locks single-flight.
- WAL acrescenta arquivos `-wal`/`-shm` ao lado do banco (atenção em cópia/backup).

## Gatilho de revisão

Reavaliar a escolha de banco quando surgir **qualquer** destes:

1. **Mais de um usuário concorrente** acessando/escrevendo (multi-tenant ou colaboração),
   ou backend escalado para **múltiplos processos/instâncias** que escrevem no mesmo dado;
2. **Escrita concorrente real** de processos distintos sobre as mesmas tabelas (além do
   `native_worker`, que hoje não escreve no banco diretamente nesse caminho);
3. Necessidade de **acesso remoto/em rede** ao banco (deploy distribuído).

Nesse ponto, migrar para **PostgreSQL** passa a se justificar — mudança *breaking* que
implicaria pool de conexões, isolamento de dados e, possivelmente, autenticação multi-user.
Enquanto nenhuma dessas condições existir, **SQLite/WAL permanece a escolha correta**.

## Alternativas consideradas

- **PostgreSQL desde já** — rejeitada: overhead operacional (servidor, deploy, backup) sem
  benefício para um app single-user; só compensa sob os gatilhos acima.
- **SQLite com journal rollback (modo padrão)** — rejeitada: leitores bloqueiam o escritor,
  prejudicando a UI durante escritas do pipeline.
- **Banco em memória / arquivos avulsos** — rejeitada: perde durabilidade e consultas
  relacionais que os modelos SQLAlchemy já exploram.

## Referências

- `backend/app/database.py:1-26` (engine, `connect_args`, PRAGMAs WAL)
- `backend/app/models.py` (modelos SQLAlchemy)
- `backend/app/services/media_proxy.py:17-58` (single-flight por `corte_id`)
- `backend/app/services/pipeline_event_log.py:21-32` (lock por log)
- `CLAUDE.md` ("SQLite via SQLAlchemy async ← WAL mode for concurrency")
