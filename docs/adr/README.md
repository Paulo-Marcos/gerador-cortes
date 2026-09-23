# Architecture Decision Records (ADRs)

Registro das decisões de arquitetura **em vigor** neste projeto. A maioria documenta
*o que existe hoje e por quê* (status `Aceito (retroativo)`); algumas fixam uma regra
para daqui em diante (status `Aceito`), e dizem o que ainda falta fazer para cumpri-la.

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
| [0001](0001-estrategia-provedores-ia.md) | Estratégia de provedores de IA (n8n / Claude CLI / Gemini) | Substituído por 0004 |
| [0002](0002-ipc-fila-de-arquivos-backend-worker.md) | IPC backend↔worker por fila de arquivos | Aceito (retroativo) — emendado por 0014 |
| [0003](0003-sqlite-wal-single-writer.md) | SQLite WAL single-writer | Substituído por 0005 |
| [0004](0004-provedores-de-ia-v2.md) | Provedores de IA v2 | Aceito |
| [0005](0005-persistencia-multicanal.md) | Persistência multicanal (SQLite WAL, um banco por canal) | Aceito (retroativo) |
| [0006](0006-conta-e-instalacao-mais-canais.md) | "Conta" = uma instalação local com canais | Aceito |
| [0007](0007-evolucao-de-schema.md) | Evolução de schema por migration versionada | Aceito |
| [0008](0008-plataforma-windows.md) | Plataforma-alvo — Windows | Aceito |
| [0009](0009-publicacao-assistida-experimental.md) | Publicação assistida no TikTok e no Instagram é experimental | Aceito |
| [0010](0010-distribuicao-e-atualizacao.md) | Distribuição e atualização | Aceito |
| [0011](0011-skills-editoriais-por-canal.md) | Skills editoriais são dados, por canal | Aceito (retroativo) |
| [0012](0012-onde-vive-cada-configuracao.md) | Onde vive cada configuração | Aceito |
| [0013](0013-heranca-de-configuracao-visual.md) | Herança de configuração visual (cascata parcial) | Aceito (retroativo) |
| [0014](0014-concorrencia-do-render.md) | Controle de concorrência do render | Aceito (retroativo) |
| [0015](0015-estrutura-por-contexto.md) | Estrutura do backend por contexto × camada | Aceito |
