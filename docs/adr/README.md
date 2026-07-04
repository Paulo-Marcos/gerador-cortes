# Architecture Decision Records (ADRs)

Registro das decisões de arquitetura **já tomadas e estáveis** deste projeto.
Cada ADR documenta *o que existe hoje e por quê* — não uma proposta de mudança.

## Convenção

- Formato: **MADR-lite** (Markdown ADR enxuto) em português.
- Numeração sequencial de 4 dígitos: `0001`, `0002`, …
- Nome do arquivo: `NNNN-titulo-em-kebab-case.md`.
- Cada ADR tem: **Status**, **Data**, **Contexto**, **Decisão**, **Consequências**,
  **Alternativas consideradas** e **Gatilho de revisão**.
- Status possíveis: `Proposto`, `Aceito`, `Aceito (retroativo)`, `Substituído por ADR-NNNN`, `Obsoleto`.
- ADRs são **imutáveis** depois de aceitos: para mudar uma decisão, crie um novo ADR
  que substitua o anterior (atualize o Status do antigo).

## Índice

| ADR | Título | Status |
|-----|--------|--------|
| [0001](0001-estrategia-provedores-ia.md) | Estratégia de provedores de IA (n8n / Claude CLI / Gemini) | Aceito (retroativo) |
| [0002](0002-ipc-fila-de-arquivos-backend-worker.md) | IPC backend↔worker por fila de arquivos | Aceito (retroativo) |
| [0003](0003-sqlite-wal-single-writer.md) | SQLite WAL single-writer | Aceito (retroativo) |
