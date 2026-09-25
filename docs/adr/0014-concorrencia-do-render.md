# ADR-0014: Controle de concorrência do render

- **Status:** Aceito (retroativo)
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Emenda:** [ADR-0002](0002-ipc-fila-de-arquivos-backend-worker.md) (a fila de arquivos continua valendo)

## Contexto

A fila de arquivos (ADR-0002) entrega os jobs ao worker, mas não diz **quantos
pipelines** podem rodar juntos. Sem limite, cada clique em "renderizar" abria um
pipeline novo disputando o mesmo worker: na PROD, a razão tempo-de-render por
tempo-de-clip foi de 1,16x (um de cada vez) para 4,68x (vários ao mesmo tempo).

## Decisão

O render passa por um **portão global** (`services/render/remotion_render.py`):

- **D-440:** um semáforo único para o pipeline inteiro. Ele nasce "preguiçoso", dentro
  do event loop do servidor.
- **D-441:** o portão tem **dois lugares**, com contrapressão de memória: o segundo
  render só entra se houver pelo menos `RENDER_MIN_RAM_LIVRE_MB` livres, porque a
  etapa de grade já trabalha perto do limite de memória. O primeiro render nunca
  espera. Se não der para ler a RAM, o segundo não é vetado.
- O worker (`native_worker.js`) mantém os limites dele por categoria de job, e a
  concorrência de frames do Remotion vem de `REMOTION_CONCURRENCY` (padrão 12,
  validado).

## Consequências

- Dois renders no máximo, e o segundo só com folga de memória: a máquina não trava
  por excesso de paralelismo.
- Renders a mais **esperam** no portão, em vez de falhar.

## Alternativas consideradas

- **Sem limite:** foi o estado anterior, e a medição acima mostra o custo.
- **Um de cada vez, sempre:** desperdiça a máquina quando há memória de sobra.

## Gatilho de revisão

Uma máquina com recursos muito diferentes (onde dois lugares seja pouco ou muito),
ou render remoto.
