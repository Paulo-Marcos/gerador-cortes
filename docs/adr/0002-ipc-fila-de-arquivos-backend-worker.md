# ADR-0002: IPC backend↔worker por fila de arquivos

- **Status:** Aceito (retroativo)
- **Data:** 2026-06-24
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0003 (SQLite WAL)

> ADR retroativo: descreve a decisão **já em vigor e estável**, registrando o que
> existe hoje. Não propõe troca de stack.

## Contexto

O backend é FastAPI/Python; o processamento pesado de render (FFmpeg, bundle e render
Remotion) roda num worker Node.js de longa duração (`video-renderer/native_worker.js`).
Os dois processos precisam trocar trabalho: o backend enfileira jobs de render e aguarda
o resultado; o worker executa e responde.

São dois runtimes distintos (Python ↔ Node.js) na **mesma máquina** (Windows/NTFS),
em uma aplicação single-user. Era preciso um mecanismo de IPC que não exigisse
infraestrutura adicional (broker, porta de rede) e que fosse robusto sob carga.

## Decisão

Usar uma **fila baseada em arquivos JSON** num diretório compartilhado
`backend/projetos/fila_remotion/`, com o protocolo request/response:

- **Backend → worker:** escreve `req_<id>.json` com o payload do job
  (`{ id, logical_id, cwd, cmd, log_level, category }`).
- **Worker → backend:** escreve `res_<id>.json` com `{ status: "sucesso" }` ou
  `{ status: "erro", erro: "…" }`, e remove o `req_` correspondente.

Mecânica que torna o esquema confiável:

- **Escrita atômica.** O backend grava em `<arquivo>.tmp` e faz `os.replace()` (rename
  atômico no NTFS) — evita o worker ler um JSON pela metade sob carga.
  Ver `backend/app/infrastructure/worker_queue.py:178-186`.
- **Espera por eventos com fallback de polling (lado backend).** `submit_and_wait()`
  aguarda `res_*.json` via `watchfiles.awatch()` (latência ~ms) e cai para polling de
  0,5s se o watcher falhar. Ver `worker_queue.py:100-142` e `:201-229`.
- **Observação com eventos + polling (lado worker).** O worker usa `fs.watch(filaDir)`
  para reagir na hora e um `setInterval(checkFilaParallel, 1500)` como rede de segurança.
  Ver `video-renderer/native_worker.js:1136-1143`.
- **Paralelismo controlado por categoria.** `WorkerJobCategory`
  (`DEFAULT`, `BUNDLE`, `GRADE`, `OVERLAY`, `RENDER_FINAL`) define o que pode rodar junto;
  o **worker** decide a ordem via `canStartJob()` respeitando GPU/RAM compartilhadas.
  Ver `worker_queue.py:39-53` e `native_worker.js:185-227`.
- **ID único por job** (`req_<id>.json` com hash) evita colisão mesmo com `logical_id`
  repetido.

## Consequências

**Positivas**
- Zero infraestrutura extra: sem Redis/RabbitMQ, sem porta de rede aberta entre processos.
- Neutralidade cross-runtime: Python e Node.js só precisam de I/O de arquivo + JSON.
- Atomicidade NTFS (`os.replace`) protege contra leitura parcial.
- Resiliência por design: o par eventos+polling garante que o job eventualmente é
  processado mesmo se o `fs.watch`/`watchfiles` falhar.
- Inspecionável: a fila é visível no disco; um `req_`/`res_` órfão é fácil de diagnosticar.

**Negativas / custos**
- Acoplamento ao filesystem local: **não cruza máquinas** (worker e backend precisam
  compartilhar o diretório). Não serve para deploy distribuído.
- Sem entrega garantida transacional: limpeza de arquivos órfãos é responsabilidade do
  código (`remotion_render.py` varre `res_*` pendentes).
- A semântica de atomicidade depende do NTFS/`os.replace`; portar para outro FS exige
  revalidar a garantia de rename atômico.

## Alternativas consideradas

- **HTTP (worker como servidor)** — rejeitada: exige subir/gerir um servidor e porta,
  com tratamento de reconexão; overhead desnecessário para IPC local single-user.
- **Socket/named pipe** — rejeitada: mais código de protocolo e tratamento de erros,
  menos inspecionável que arquivos no disco.
- **Broker de mensagens (Redis/RabbitMQ)** — rejeitada: infraestrutura externa pesada
  demais para uma aplicação pessoal numa única máquina.
- **Fila em SQLite** — não adotada para o canal req/res em tempo real: arquivos + eventos
  do FS dão latência menor e evitam contenção de escrita no banco (ver ADR-0003).

## Gatilho de revisão

Reavaliar quando: (a) backend e worker precisarem rodar em **máquinas diferentes**
(deploy distribuído), ou (b) for preciso **mais de um worker concorrente** com balanceamento
e entrega garantida. Nesses cenários, migrar para um broker (Redis Streams/RabbitMQ) ou
HTTP/gRPC passa a se justificar.

## Referências

- `backend/app/infrastructure/worker_queue.py` (escrita atômica, espera, categorias)
- `backend/app/services/pipeline_render.py:1518-1543` (`_executar_via_worker`)
- `backend/app/services/remotion_render.py` (varredura de respostas órfãs)
- `video-renderer/native_worker.js` (observação da fila, `processJob`, paralelismo)
