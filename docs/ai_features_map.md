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

### 2.6 Avaliar o bruto
- **Descrição**: lê o bruto com as emendas marcadas e devolve nota, veredito e apontamentos. Roda sozinha ao fim de cada geração de bruto (sempre pelo Claude) e sob demanda no painel.
- **Rota**: `POST /api/avaliacao-bruto/corte/{corte_id}?provider=`
- **Service**: `ClaudeIaService.avaliar_bruto_via_claude`
- **UI**: `AvaliacaoBrutoPanel.tsx` (editor)

### 2.7 Propor shorts
- **Descrição**: lê a transcrição do bruto de um Fire e propõe os trechos verticais.
- **Rota**: `POST /api/shorts/corte/{corte_id}/sugerir?provider=`
- **Service**: `ClaudeIaService.sugerir_shorts_via_claude`
- **UI**: sem botão hoje — dispara no fim do bruto (Claude). O `sugerirAgora` do `shortsApi` não tem tela.

### 2.8 Cenas do short
- **Rota**: `POST /api/shorts/{short_id}/cenas/sugerir?provider=`
- **Service**: `ClaudeIaService.sugerir_cenas_do_short_via_claude`
- **UI**: `CenasDoShort.tsx` — componente sem tela que o renderize hoje.

### 2.9 Gancho da abertura do short
- **Rota**: `POST /api/shorts/{short_id}/ganchos?provider=`
- **Service**: `ClaudeIaService.sugerir_ganchos_via_claude`
- **UI**: `GanchoModal.tsx`

### 2.10 Post do short (título, descrição, hashtags)
- **Rota**: `POST /api/shorts/{short_id}/post/gerar?provider=`
- **Service**: `ClaudeIaService.gerar_post_do_short_via_claude`
- **UI**: `PostModal.tsx`. O Finalizar escreve sozinho, pelo Claude — ali não há botão.

### 2.11 Prompt da capa do short
- **Rota**: `POST /api/shorts/{short_id}/capa/prompt?provider=`
- **Service**: `ClaudeIaService.prompt_da_capa_do_short_via_claude`
- **UI**: `CapaModal.tsx`

### 2.12 Etiqueta e arte da capa do TikTok
- **Rotas**: `POST /api/shorts/corte/{corte_id}/capa-tiktok?provider=` (etiqueta) e `POST /api/shorts/corte/{corte_id}/capa-tiktok/prompt?provider=` (arte)
- **Services**: `ClaudeIaService.sugerir_etiqueta_capa_via_claude` e `prompt_da_arte_da_capa_via_claude`
- **UI**: `CapaTikTokSlot.tsx`

### 2.13 Padrões de thumbnail
- **Descrição**: lê as capas melhor avaliadas e propõe ajuste na skill do capista. Não tem skill editorial no banco: o modelo Gemini sai da faixa equivalente ao Claude desta etapa.
- **Rota**: `POST /api/avaliacoes-thumbnail/padroes?provider=`
- **Service**: `PadroesThumbnailService.analisar` → `_ler_padroes`
- **UI**: `ThumbnailPadroesPage.tsx`

### 2.14 Trechos de todos os cortes
- **Descrição**: roda a geração de trechos a remover em cada corte do projeto, em segundo plano, só acrescentando aos já marcados.
- **Rota**: `POST /api/cortes/projeto/{projeto_id}/analisar-desvios-todos?provider=`
- **Service**: `CorteService.analisar_desvios_todos_impl` → `gerar_trechos_via_claude` por corte
- **UI**: `ProjetoDetalhePage.tsx` (barra de utilitários, `<MenuDeIa />`)

### Fora da escolha
O **sentimento do ranking de lives** (`services/ranking_lives.py`) roda em lote, no fundo, sem tela onde escolher — segue no Claude.

---

## 3. Marcador de quem gerou

Cada resultado mostra o selo `<SeloDeProvider />` com quem o produziu. A origem vem de três lugares, em ordem de confiança:

1. **Gravada na própria entidade**: `Corte.origem_analise` (o provider da análise) e o campo `origem` de cada desvio.
2. **Modelo gravado no registro**: a avaliação do bruto guarda o modelo que atendeu; `provider_do_modelo` traduz (`gemini-*` → Gemini).
3. **Telemetria** (`GET /api/claude/telemetria/ultima-geracao?etapa=&corte_id=&short_id=`): para metadados, cenas, post, gancho e capas, que não guardam a origem. É best-effort — sem registro, a tela fica **sem selo**, nunca com um selo chutado.

A telemetria grava `short_id` desde a D-608: sem ele, dois trechos do mesmo corte mostrariam o selo um do outro.

---

## 4. Como adicionar uma nova chamada de IA

1. Crie a rota em `backend/app/routers/claude_ia.py` com o query param `provider: ProviderIA = "claude"`.
2. No `ClaudeIaService`, chame `_gerar_json_provider` ou `_gerar_text_provider` e **repasse `provider` por todos os métodos intermediários**. Métodos estáticos não enxergam variáveis do método que os chamou (rode `ruff check`: o F821 pega o esquecimento).
3. Adicione a chamada em `frontend/src/lib/api.ts`.
4. Crie a mutation passando o `provider` como `variables`, e derive o provedor em voo com `providerEmVoo` (`frontend/src/lib/providerIa.ts`).
5. Na tela, use `<AcaoDeIa />` (`frontend/src/components/ui/acao-de-ia.tsx`): a ação é dita uma vez ("Regerar metadados") e o provedor é escolhido por ícone, Claude ou Gemini. Nunca repita o verbo em dois botões.
   - `rotulo` é o texto visível; `descricao` é a ação completa, lida por leitor de tela e no tooltip ("Regerar metadados com o Gemini") — use quando o rótulo visível for curto.
   - Enquanto gera, os dois provedores travam: só o que está em voo gira.
   - Coluna estreita: `apenasProvedores` e a legenda acima (veja `CapaTikTokSlot.tsx`), em vez de deixar o texto virar reticências.
   - Barra só de ícones: `<MenuDeIa />`, que abre as duas opções a partir do ícone da ação.
