# Mapeamento de Funcionalidades de IA (Claude e Gemini)

Este documento descreve quais áreas e funcionalidades do projeto **CortadorLive** fazem uso de requisições de Inteligência Artificial, de forma a facilitar a manutenção e o entendimento da arquitetura de requisições para LLMs.

Todas essas funcionalidades agora suportam a utilização do **Claude** (via n8n/cli) ou do **Gemini** (via API) como provedores, permitindo trocar entre os modelos pela interface, reduzindo a chance de bloqueios por limite de uso.

## 1. Visão Geral da Arquitetura de IA

As requisições de IA são orquestradas principalmente no backend através do serviço `backend/app/services/claude_ia.py` (que, apesar do nome, agora funciona como um _proxy/router_ entre provedores). 

Os métodos de geração (ex: `_gerar_json_provider` e `_gerar_text_provider`) roteiam a requisição para:
- **Claude**: `backend/app/infrastructure/claude_cli_client.py` 
- **Gemini**: `backend/app/infrastructure/gemini_client.py`

## 2. Mapa de Funcionalidades

Abaixo estão listadas as principais funcionalidades (Skills) e suas respectivas localizações no código onde a IA é invocada.

### 2.1 Análise de Trechos (Diarização e Remoção de Silêncios)
- **Descrição**: Analisa a transcrição da livestream para identificar os melhores pontos para cortes, gerando as marcações de início e fim.
- **Backend Router**: `POST /api/claude/analisar/{projeto_id}`
- **Backend Service**: `ClaudeIAService.analisar_transcricao`
- **Frontend Hook**: `useAnalisarComDiarizacao` (`frontend/src/hooks/useDiarizacao.ts`)
- **UI Component**: `AnaliseIaModal.tsx`

### 2.2 Geração e Análise de Desvios (Trechos Ruins a Remover)
- **Descrição**: Processa um corte bruto gerando e analisando "desvios", que são trechos menos interessantes ou ruídos recomendados para remoção.
- **Backend Router**: `POST /api/claude/trechos/{corte_id}`
- **Backend Service**: `ClaudeIAService.gerar_trechos`
- **Frontend Hook**: `useGerarTrechosClaude` (`frontend/src/hooks/useEditor.ts`)
- **UI Component**: `RightTabsPanel.tsx` (Fase 1 do Editor)

### 2.3 Geração de Cenas (Roteiro Visual/Remotion)
- **Descrição**: Monta o roteiro de edição estruturado definindo a sequência de câmeras, close-ups e b-rolls (cenas) para ser renderizado no Remotion.
- **Backend Router**: `POST /api/claude/cenas/{corte_id}`
- **Backend Service**: `ClaudeIAService.gerar_cenas`
- **Frontend Hook**: `useGerarCenasClaude` (`frontend/src/hooks/useEditor.ts`)
- **UI Component**: `CenasPanel.tsx` (Fase 2 do Editor)

### 2.4 Geração de Metadados (Título e Descrição)
- **Descrição**: Produz os títulos cativantes e a descrição otimizada para SEO e publicação no YouTube.
- **Backend Router**: `POST /api/claude/metadados/{corte_id}`
- **Backend Service**: `ClaudeIAService.gerar_metadados`
- **Frontend Hook**: `useGerarMetadadosClaude` (`frontend/src/hooks/useEditor.ts`)
- **UI Component**: `MetadataCard.tsx` (Tela de Post-Production)

### 2.5 Geração de Prompt para Thumbnail
- **Descrição**: Produz prompts de geração de imagens baseados no conteúdo do corte, focando em gerar a miniatura/thumbnail ideal.
- **Backend Router**: `POST /api/claude/prompt-thumbnail/{corte_id}`
- **Backend Service**: `ClaudeIAService.gerar_prompt_thumbnail`
- **Frontend Hook**: `useGerarPromptThumbnailClaude` (`frontend/src/hooks/useEditor.ts`)
- **UI Component**: `MetadataCard.tsx` (Tela de Post-Production)

---

## 3. Como adicionar novas chamadas de IA?

1. Adicione a rota no backend em `backend/app/routers/claude_ia.py`, incluindo o query_parameter `provider: str = 'claude'`.
2. Adicione a implementação do prompt/skill em `ClaudeIAService` (`claude_ia.py`), utilizando os wrappers `_gerar_json_provider` ou `_gerar_text_provider` passando o parâmetro `provider`.
3. Atualize o client de API no frontend `frontend/src/lib/api.ts` para enviar a chamada.
4. Crie ou atualize o React Query mutation no frontend em `useEditor.ts` ou arquivo relevante, passando o `provider`.
5. Utilize os componentes `<ClaudeAiButton />` e `<GeminiAiButton />` exportados de `frontend/src/components/ui/` nas views em que o usuário irá interagir.
