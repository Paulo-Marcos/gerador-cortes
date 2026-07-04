# ADR-0001: Estratégia de provedores de IA (n8n / Claude CLI / Gemini)

- **Status:** Aceito (retroativo)
- **Data:** 2026-06-24
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0002 (IPC backend↔worker)

> ADR retroativo: descreve a decisão **já em vigor e estável**, registrando o que
> existe hoje. Não propõe troca de stack.

## Contexto

O pipeline usa IA generativa em várias fases: análise da transcrição (propor cortes),
resumo de corte, detecção de desvios (trechos a remover), geração de cenas Remotion,
metadados (título/sinopse/hashtags), prompt de thumbnail e geração da imagem da thumbnail.

Ao longo do projeto coexistiram três provedores, cada um introduzido em um momento e
para um propósito:

1. **n8n (webhooks)** — primeiro provedor. Workflows externos orquestram a chamada à IA
   fora do Python. Webhooks em `config.py:14-18`; client em
   `backend/app/infrastructure/n8n_client.py`.
2. **Claude CLI (`claude -p`)** — caminho mais recente. Invoca a assinatura local do
   Claude via subprocess, dirigido por *skills* versionadas em `.claude/skills/`
   (`cortador-expert`, `trechos-expert`, `cenas-expert`, `metadados-expert`,
   `thumbnail-prompt-expert`). Client em
   `backend/app/infrastructure/claude_cli_client.py`; orquestração em
   `backend/app/services/claude_ia.py`; rotas em `backend/app/routers/claude_ia.py`.
3. **Gemini (Google AI)** — usado para o que os outros não cobrem: geração da **imagem**
   da thumbnail (Imagen `gemini-2.5-flash-image`) e como **fallback** textual de cenas e
   desvios. Client em `backend/app/infrastructure/gemini_client.py`.

A questão registrada aqui é: **qual provedor faz o quê hoje**, e **sob que critério** a
estratégia seria consolidada num provedor único.

## Decisão

Manter os três provedores em **coexistência pragmática por fase**, sem migração forçada,
com a seguinte divisão de responsabilidades:

| Fase | n8n (legado) | Claude CLI (skill) | Gemini |
|------|:---:|:---:|:---:|
| Análise → cortes | ✅ | ✅ `cortador-expert` (opus) | — |
| Resumo de corte | ✅ | — | — |
| Desvios (trechos a remover) | ✅ | ✅ `trechos-expert` (sonnet) | ⚠️ fallback |
| Cenas Remotion | — | ✅ `cenas-expert` (sonnet) | ⚠️ fallback |
| Metadados | ✅ | ✅ `metadados-expert` (sonnet) | — |
| Prompt de thumbnail | — | ✅ `thumbnail-prompt-expert` (opus, *thinking* 10k) | — |
| Imagem da thumbnail | — | — | ✅ Imagen (único) |

Decisões deliberadas que sustentam essa divisão:

- **Claude CLI usa a assinatura local, não a API.** O client remove `ANTHROPIC_API_KEY`/
  `ANTHROPIC_BASE_URL` do ambiente do subprocess (env scrubbing) para garantir custo zero
  por token e evitar "Credit balance is too low". Ver `claude_cli_client.py`.
- **Chamadas Claude são serializadas** (`claude_cli_max_concurrent=1`, `config.py:32-35`):
  várias chamadas paralelas batem no limite de concorrência da assinatura e falham com
  erro transitório.
- **Backoff exponencial com jitter** para `529 Overloaded` no Claude CLI
  (`claude_cli_retries=4`); n8n e Gemini não têm retry embutido.
- **Modelo por tarefa** é configurável (`claude_model_analise=opus`, `…_cenas=sonnet`,
  `…_metadados=sonnet`, `…_thumbnail=opus`, `…_ranking_sentimento=haiku`).
- **Rotas Claude isoladas** (`routers/claude_ia.py`), separadas dos routers de domínio
  (`cortes.py`, `metadados.py`), para introduzir o caminho novo sem tocar código estável.
- **Gemini é utilitário**, não substituto: cobre a geração de imagem (que Claude não faz)
  e serve de rede de segurança quando o Claude falha em cenas/desvios.

## Gatilho de revisão (consolidação)

Não há migração programada. Consolidar tudo em **Claude CLI** (depreciando os webhooks n8n)
só deve ser considerado quando **todas** estas condições forem verdadeiras:

1. As skills equivalentes (`cortador`, `trechos`, `metadados`) estiverem validadas em uso
   real com qualidade ≥ à dos workflows n8n correspondentes; e
2. A serialização da assinatura (`max_concurrent=1`) não for gargalo para o volume de
   trabalho; e
3. Não houver necessidade de orquestração visual/externa que o n8n hoje oferece.

A geração de **imagem** permanece no Gemini até existir alternativa equivalente — não é
candidata à consolidação.

## Consequências

**Positivas**
- Custo de IA textual tende a zero ao usar a assinatura local via Claude CLI.
- Cada fase usa o provedor mais adequado; o caminho novo entra sem quebrar o legado.
- Fallback Gemini aumenta a resiliência de cenas/desvios.

**Negativas / custos**
- Três caminhos de integração para manter, testar e depurar.
- Comportamento por fase depende de configuração (`claude_cli_enabled`, env vars),
  exigindo atenção para saber qual provedor está ativo.
- A serialização do Claude CLI limita o throughput de geração paralela.

## Alternativas consideradas

- **Consolidar em n8n** — rejeitada: incorre em custo de API e tira o controle das skills
  versionadas do repositório.
- **Consolidar em Claude CLI agora** — adiada: ver Gatilho de revisão; algumas fases ainda
  dependem de validação e o Gemini cobre a geração de imagem.
- **Migrar para SDK Anthropic (API direta) em vez do CLI** — rejeitada no momento: a API
  cobra por token, enquanto o CLI reaproveita a assinatura existente.

## Referências

- `backend/app/config.py:14-18` (n8n), `:20` (Gemini), `:25-66` (Claude CLI)
- `backend/app/infrastructure/{n8n_client,claude_cli_client,gemini_client}.py`
- `backend/app/services/claude_ia.py`, `backend/app/routers/claude_ia.py`
- `.claude/skills/{cortador,trechos,cenas,metadados,thumbnail-prompt}-expert/`
