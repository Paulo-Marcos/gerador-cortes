# Mapeamento de Funcionalidades de IA (Claude e Gemini)

Este documento descreve quais áreas do **CortadorLive** fazem requisições de IA, para facilitar a manutenção e o entendimento de como as chamadas a LLMs são roteadas.

As funcionalidades abaixo aceitam **Claude** (via Claude CLI, assinatura do Claude) ou **Gemini** (via Antigravity CLI, assinatura do Google) como provedor, escolhido na interface. Nenhum dos dois usa chave de API: cada um roda o CLI oficial já logado na máquina. Isso reduz a chance de ficar parado por limite de uso de um deles.

## 1. Visão Geral da Arquitetura de IA

As requisições são orquestradas no backend pelo serviço `backend/app/services/claude_ia.py`. Apesar do nome, ele roteia entre os provedores.

Os wrappers `_gerar_json_provider` e `_gerar_text_provider` recebem `provider: ProviderIA` (`"claude" | "gemini"`) e chamam:
- **Claude**: `backend/app/infrastructure/claude_cli_client.py`. A skill vai como expertise do CLI (`_args_claude`).
- **Gemini**: `backend/app/infrastructure/antigravity_cli_client.py`, que roda `agy -p` com o prompt pela entrada padrão (`stream-json`). A skill vai como expertise, e o modelo é o `modelo_gemini` da skill, editável em Canais → Skills. O padrão deriva do modelo Claude: Haiku → `AGY_MODEL_RAPIDO` (`gemini-3.8-flash-medium`); Opus/Sonnet → `AGY_MODEL_QUALIDADE` (`gemini-3.1-pro-high`).

**Pré-requisito do Gemini:** instalar o Antigravity CLI e rodar `agy` uma vez no terminal para logar com a conta Google. Cada chamada consome ~37 mil tokens fixos da cota (prompt de sistema do agente) além do prompt. A geração de **imagem** da capa continua no `gemini_client.py` (API), porque o `agy` não devolve imagem.

**Termos do Antigravity:** usar o login dele em ferramenta de terceiros dá banimento. O backend só executa o binário oficial `agy`; nunca extrair o token nem chamar os servidores do Google por fora.

O router (`backend/app/routers/claude_ia.py`, montado em `/api/claude`) valida `provider` como `Literal`: um valor desconhecido devolve 422 em vez de cair em silêncio no Claude.

## 2. Mapa de Funcionalidades

### 2.1 Análise da live (cortes)
- **Descrição**: analisa a transcrição da live inteira e propõe os cortes (início/fim, título, tema), encadeando o refazer-transcrição.
- **Rota**: `POST /api/claude/projeto/{projeto_id}/analisar?usar_diarizacao=&provider=`
- **Service**: `ClaudeIaService.analisar_via_claude` → `_gerar_cortes` / `_gerar_cortes_em_lote`
- **Hook**: `useAnalisarComDiarizacao` (`frontend/src/hooks/useDiarizacao.ts`)
- **UI**: `AnaliseIaModal.tsx`

### 2.2 Trechos a remover (desvios)
- **Descrição**: aponta, dentro de um corte, os trechos que fogem da tese central e devem sair.
- **Rota**: `POST /api/claude/corte/{corte_id}/gerar-trechos?provider=`
- **Service**: `ClaudeIaService.gerar_trechos_via_claude` → `_gerar_desvios`
- **Hook**: `useGerarTrechosClaude` (`frontend/src/hooks/useEditor.ts`)
- **UI**: `RightTabsPanel.tsx` (Fase 1 do Editor)

### 2.3 Cenas (roteiro visual do Remotion)
- **Descrição**: gera as cenas sobrepostas ao corte (cards, citações, ênfases) renderizadas no Remotion.
- **Rota**: `POST /api/claude/corte/{corte_id}/gerar-cenas?provider=`
- **Service**: `ClaudeIaService.gerar_cenas_via_claude` → `_gerar_cenas`
- **Hook**: `useGerarCenasClaude` (`frontend/src/hooks/useEditor.ts`)
- **UI**: `CenasPanel.tsx` (Fase 2 do Editor)

### 2.4 Metadados (título e descrição)
- **Descrição**: produz título, descrição e tags para publicação no YouTube.
- **Rota**: `POST /api/claude/corte/{corte_id}/gerar-metadados?provider=`
- **Service**: `ClaudeIaService.gerar_metadados_via_claude`
- **Hook**: `useGerarMetadadosClaude` (`frontend/src/hooks/useEditor.ts`), usado no fluxo do editor; a tela de metadados tem a própria mutation dentro de `MetadataCard.tsx`
- **UI**: `MetadataCard.tsx`

### 2.5 Prompt da thumbnail
- **Descrição**: escreve o prompt de imagem da capa a partir do conteúdo do corte.
- **Rota**: `POST /api/claude/corte/{corte_id}/gerar-prompt-thumbnail?provider=`
- **Service**: `ClaudeIaService.gerar_prompt_thumbnail_via_claude`
- **Hook**: mutation local em `MetadataCard.tsx` (`generatePromptThumbnailClaude`)
- **UI**: `MetadataCard.tsx`

---

## 3. Como adicionar uma nova chamada de IA

1. Crie a rota em `backend/app/routers/claude_ia.py` com o query param `provider: ProviderIA = "claude"`.
2. No `ClaudeIaService`, chame `_gerar_json_provider` ou `_gerar_text_provider` e **repasse `provider` por todos os métodos intermediários**. Métodos estáticos não enxergam variáveis do método que os chamou (rode `ruff check`: o F821 pega o esquecimento).
3. Adicione a chamada em `frontend/src/lib/api.ts`.
4. Crie a mutation passando o `provider` como `variables`. Assim a tela sabe qual botão está gerando.
5. Use `<ClaudeAiButton />` e `<GeminiAiButton />` (`frontend/src/components/ui/`). Só o botão do provider em voo fica `pending`; o outro fica `disabled`.
