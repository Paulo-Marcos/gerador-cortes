# F-038 — Geração via Claude na pipeline de prompts

> Provider **alternativo** (não substitui n8n/Gemini) que usa o **Claude CLI local**
> (`claude -p`) para gerar, com expertise versionada em skills, cada etapa de
> prompt da pipeline do CortadorLive.

## 1. Visão geral

Adiciona um caminho de geração **via Claude** em 6 pontos da pipeline, cada um com
botão próprio na UI e uma **skill** dedicada. Usa a assinatura local do Claude
(sem API key, sem custo por token). É **opt-in**: os caminhos n8n/Gemini não foram
removidos do backend — apenas os botões n8n da UI de análise/trechos foram
escondidos por opção do usuário.

| # | Etapa | Botão (UI) | Skill | Endpoint |
|---|-------|------------|-------|----------|
| 1 | Análise → cortes + trechos (encadeia refazer-transcrição) | ✦ Claude — modal **Análise IA** | `cortador-expert` | `POST /api/claude/projeto/{id}/analisar` |
| 2 | Trechos a remover de 1 corte | Claude — editor, aba **Trechos** | `trechos-expert` | `POST /api/claude/corte/{id}/gerar-trechos` |
| 3 | Cenas Remotion | Claude — painel **Cenas** | `cenas-expert` | `POST /api/claude/corte/{id}/gerar-cenas` |
| 4 | Metadados | Claude — **MetadataCard** | `metadados-expert` | `POST /api/claude/corte/{id}/gerar-metadados` |
| 5 | Prompt de thumbnail (capista editorial) | Claude — **MetadataCard** | `thumbnail-prompt-expert` | `POST /api/claude/corte/{id}/gerar-prompt-thumbnail` |
| 6 | **No gerar/regerar bruto:** cenas encadeadas ao FIM (backend, após re-sync sem silêncios) + metadados em paralelo (frontend) | clique em **Gerar bruto** | — | `export.py` + frontend |

## 2. Arquitetura

```
UI (botão Claude)
   └─ api.ts → POST /api/claude/...
        └─ routers/claude_ia.py        (router próprio; não toca routers travados)
             └─ services/claude_ia.py  (ClaudeIaService — orquestra)
                  ├─ montar_prompt*()        ← REUSA serviços de domínio existentes
                  ├─ skill="<nome>" → /skill ATIVADA nativamente (.claude/skills)
                  ├─ variacao_prompt.bloco_variacao()  ← lente rotativa (dinamismo)
                  ├─ infrastructure/claude_cli_client.py  ← subprocess `claude -p`
                  └─ importar_*()            ← REUSA persistência existente
```

**Princípio condutor (não-regressão):** cada etapa já tinha a costura
`montar_prompt*()` (exporta prompt) + `importar_*()` (salva resultado). O provider
Claude **pluga entre elas** — sem reescrever lógica de domínio nem duplicar schema.

### Camadas (Clean Architecture / DDD)
- `domain/variacao_prompt.py` — **puro** (sem I/O), lentes de variação.
- `infrastructure/claude_cli_client.py` — adapter do CLI (subprocess), espelha `gemini_client`.
- Skills são **ativadas nativamente** (`generate_*(..., skill="<nome>")` → o adapter roda `claude -p` na raiz do projeto e passa `/<nome>` na 1ª linha; o Claude carrega o `SKILL.md` do disco). **Não** injetamos o corpo da skill no prompt.
- `services/claude_ia.py` — orquestração; **chama** (sem editar) serviços travados (`metadados`, `cenas_remotion`).
- `routers/claude_ia.py` — converte HTTP ↔ serviço; nada de regra de negócio.

## 3. Adapter `claude -p` (decisões técnicas)

- **`--output-format json`** → envelope `{is_error, result, total_cost_usd, ...}`. O texto do modelo fica em `result`.
- **Sem `--json-schema`** — instável/lento na versão atual do CLI (2.1.x). O formato é instruído no prompt e o JSON é extraído com a mesma lógica de fences do `gemini_client` (`_extract_json`), validado/normalizado pelos `importar_*`.
- **Windows:** invoca via `cmd /c claude` (o `claude.cmd` não roda direto por `CreateProcess`). Prompt vai por **stdin** (sem limite de linha/quoting). `ProactorEventLoop` já é configurado em `main.py`.
- **stderr ignorado** para status — hooks de sessão escrevem ruído benigno mesmo com `returncode 0`; confiamos em exit code + `is_error`.
- **cwd neutro** (temp) por padrão, para a geração não herdar o `CLAUDE.md` do projeto.
- Modelos por etapa (config): `claude_model_analise=opus`, `cenas/metadados=sonnet`, `thumbnail=opus`.

### ⚠️ Limitação consciente
O binário `claude` **não existe no container Docker** do backend → este provider
só funciona no **fluxo local** (`dev.ps1` / backend nativo). Se um dia o backend
for containerizado em produção, trocar para a API direta (`anthropic` SDK) atrás
da mesma interface `claude_cli_client`.

## 4. Lote vs direto (análise)

A análise manda a **transcrição inteira numa só chamada** (melhor coerência
temática). Acima de `claude_analise_max_chars_direto` (~480k chars ≈ 120k tokens)
cai para **lote** (janelas de 40 min com overlap, reusando `fatiar_transcricao`),
deduplicando cortes no overlap. Lives de até ~5-6 h cabem no modo direto.

## 5. Meta-prompt dinâmico (Fase 6)

`domain/variacao_prompt.py` sorteia, por execução, uma **lente editorial** (ângulo)
injetada no prompt — para que duas gerações do mesmo corte não saiam iguais, sem
perder rigor. Lentes para `cortes`, `cenas`, `metadados`, `thumbnail`. `trechos`
**não** tem lente (a remoção deve ser consistente, não variada).

Validação real (haiku), mesmo corte, duas lentes → títulos distintos e coerentes
("O apocalipse como desculpa política" vs "Se o mundo vai acabar, por que lutar?").

## 6. Configuração (`backend/app/config.py`)

```
CLAUDE_CLI_ENABLED=true
CLAUDE_CLI_PATH=            # vazio = resolve no PATH
CLAUDE_CLI_CWD=            # vazio = temp
CLAUDE_CLI_TIMEOUT=600
CLAUDE_MODEL_ANALISE=opus
CLAUDE_MODEL_CENAS=sonnet
CLAUDE_MODEL_METADADOS=sonnet
CLAUDE_MODEL_THUMBNAIL=opus
CLAUDE_ANALISE_MAX_CHARS_DIRETO=480000
```

## 7. Arquivos

**Novos:** `infrastructure/claude_cli_client.py`,
`services/claude_ia.py`, `routers/claude_ia.py`, `domain/variacao_prompt.py`,
`tests/infrastructure/test_claude_cli_client.py`,
`tests/services/test_claude_ia_service.py`, `tests/domain/test_variacao_prompt.py`,
e 5 skills-expert (`cortador`, `trechos`, `cenas`, `metadados`, `thumbnail-prompt`).

> **Nota (D-162):** as três skills específicas do canal (`cenas-expert`,
> `metadados-expert`, `thumbnail-prompt-expert`) foram **despromovidas do
> versionamento** e passaram a viver por canal na instância local
> (`instance/`), fora do repositório público — o código as ativa por nome em
> tempo de execução. Só `cortador-expert` e `trechos-expert` (genéricas)
> permanecem versionadas em `.claude/skills/`.

**Editados livres:** `config.py`, `AnaliseIaModal.tsx`.

**Editados travados (aditivos — marcas `[unlock:...]` no commit):**
- `editor-cortes-stage-medallion`: `main.py`, `api.ts`, `useEditor.ts`, `useProjetoDetalhe.ts`, `EditorPage.tsx`, `services/export.py`
- `f024-bruto-completo`: `EditorPage.tsx`, `EditorFase1.tsx`, `RightTabsPanel.tsx`
- `f024-pos-cenas`: `CenasPanel.tsx`
- `thumbnail-agent-prompt-livre` + `thumbnail-paste-image`: `services/metadados.py`, `MetadataCard.tsx`, `api.ts`
- `publicacao-manual-upload-individual-estudio`: `api.ts`, `useProjetoDetalhe.ts`
- `post-production-video-routing`: `EditorPage.tsx`

**Decisões de robustez (pós-validação real):**
- Adapter usa `--tools ""` (geração single-shot; evita `error_during_execution` por tentativa de tool) e `raw_decode` no parse (tolera "Extra data" no stdout).
- **Thumbnail:** a skill `thumbnail-prompt-expert` contém TODA a expertise do capista (INSTRUCOES + CONHECIMENTO + modo livre); o serviço usa `montar_contexto_thumbnail` (só dados) + `generate_text` e salva o prompt de imagem. Não usa mais o template básico.
- **Cenas no bruto:** geradas no backend ao FIM do `gerar_bruto_via_worker` (após o re-sync sem silêncios) → timings precisos.

## 8. Como testar (app local)

1. `.\dev.ps1` (ou reinicie o backend para carregar o router novo).
2. **Análise:** projeto com transcrição → modal **Análise IA** → aba **✦ Claude** → **Gerar com Claude**.
3. **Trechos:** editor de um corte → aba **Trechos a remover** → **Claude**.
4. **Cenas:** painel Cenas → **Claude**. **Metadados/Thumbnail:** MetadataCard → **Claude**.
5. **Bruto:** clicar **Gerar bruto** dispara metadados em paralelo e, ao FIM do bruto, gera as cenas (transcrição já sem silêncios). Depois do botão **Claude** no Prompt thumbnail, clique em **Copiar** para usar o prompt.

## 9. Testes

- Backend: **859** testes (suíte completa) verdes; novos: adapter (11), serviço (12), variação (4).
- Frontend: `tsc --noEmit` limpo após toda a cirurgia em arquivos travados (`noUnusedLocals`/`noUnusedParameters` on).

## 10. Notas / melhorias futuras

- **Paralelo no bruto:** cenas/metadados usam a `transcricao_final` **atual**; se o corte ainda não tiver transcrição final, esses dois mostram erro no toast (o bruto segue normal). É esperado — regerar depois.
- **"Gerar trechos Claude"** sobrescreve os desvios atuais do corte (é "regerar"). Avaliar um confirm antes, se desejado.
- Endpoints de cenas/metadados/thumbnail/trechos são **síncronos** (aguardam o `claude -p`). Para cortes longos, avaliar mover para background + WebSocket.
- Futuro: empacotar as 5 skills + um MCP da app num **plugin** distribuível.
