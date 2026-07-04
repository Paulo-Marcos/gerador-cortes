# Smoke E2E — Editor React (fase 1)

Checklist manual para validar as correções de:

1. Trechos (manual, IA, silêncio) sendo de fato removidos do bruto
2. Transcrição limpa (deduplicada) sendo exibida na fase 1
3. Tempos da transcrição alinhados ao vídeo bruto após corte

## Pré-condições

- Backend rodando (`.\dev.ps1` ou `uvicorn`)
- Native Worker rodando (parte do `dev.ps1`)
- Frontend React em `http://localhost:5173` (`cd frontend; npm run dev`)
- Um projeto com transcrição pronta e ao menos um corte aprovado

## Roteiro

### Cenário A — Bruto honra TODOS os tipos de trechos

1. Abra um corte no editor (`/projetos/{id}/cortes/{corteId}`).
2. Anote a duração teórica: `fim_seg − inicio_seg`.
3. Adicione **um trecho manual** pela seleção do waveform (~5–8s).
4. Clique em **"Gerar silêncios"** (TrechosPanel) e aguarde aparecerem novos trechos do tipo _"Silêncio Detectado (IA/Técnico)"_.
5. (Opcional) Clique em **"Gerar por IA"** para adicionar trechos editoriais.
6. Confirme no painel "Trechos" que há pelo menos 1 trecho de cada origem (manual / silêncio / IA).
7. Clique **"Gerar bruto"**.
8. **Esperado:**
   - Botão fica em estado _processando_ (não bloqueia a UI).
   - Após alguns segundos, status vira _concluído_.
   - Inspecionar `backend/projetos/{projetoId}/cortes/{corteId}/DEBUG_gerar_bruto.log` — todos os trechos aparecem listados, e os "Segmentos CALCULADOS" excluem cada um.
   - Abrir `clip_raw.mkv` resultante: duração ≈ duração líquida (`fim − inicio − soma(trechos)`), com margem ±0.5s.
   - Confirmar visualmente que cada trecho foi removido.

### Cenário B — Transcrição limpa exibida

Após o cenário A:

1. No painel **Transcrição** (lado direito da fase 1), o badge no header deve mudar para **"limpa"** (verde).
2. A contagem de linhas deve ser **menor** que antes do bruto (sem repetições).
3. Busque uma palavra que antes aparecia duplicada — confira que sobrou apenas a(s) ocorrência(s) das falas remanescentes.
4. No DevTools (Network → resposta de `/cortes/{id}`), confirmar que:
   - `transcricao_final` é um array não-vazio
   - `transcricao_final_texto` é uma string longa sem repetições óbvias

### Cenário C — Transcrição alinhada ao bruto

1. Ainda no mesmo corte, recarregar a página para garantir que o estado venha do servidor.
2. No DevTools, conferir que `transcricao_final[0].start ≈ 0` (a primeira linha começa logo no início do bruto).
3. Clicar em uma linha aleatória da transcrição — o player do vídeo deve saltar para o ponto correspondente **dentro do bruto** (sem offset).
4. Dar play e observar que a linha em destaque acompanha exatamente a fala.

### Cenário D — Cenas Remotion precisas

1. Após o bruto pronto, ir para a fase 2 (post-production).
2. Clicar **"Gerar cenas"**.
3. **Esperado:** os tempos das cenas (`cena.inicio`/`cena.fim`) caem em momentos coerentes — confirmar tocando o vídeo e validando que cada cena entra no ponto esperado da fala (que agora está sincronizada).

### Cenário E (regressão) — Corte sem trechos

1. Em um corte limpo, sem nenhum trecho marcado, clicar **"Gerar bruto"**.
2. **Esperado:**
   - `clip_raw.mkv` tem duração exata = `fim_seg − inicio_seg` (sem padding).
   - `transcricao_final` ≈ `transcricao_corte` (filtrada para a janela do corte).
   - Badge da transcrição continua sendo "limpa" (porque o backend sempre popula `transcricao_final`).

## Saída esperada

Marcar ✅ os 5 cenários. Se qualquer um falhar, anexar:

- Log `DEBUG_gerar_bruto.log`
- Print do painel Trechos + Transcrição
- Resposta JSON de `/cortes/{id}` (DevTools)
