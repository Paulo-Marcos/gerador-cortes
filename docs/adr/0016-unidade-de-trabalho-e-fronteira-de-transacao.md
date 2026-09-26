# ADR-0016: Unidade de trabalho e fronteira de transação

- **Status:** Aceito
- **Data:** 2026-09-25
- **Decisores:** Paulo Marcos
- **Relacionado:** [ADR-0015](0015-camadas-globais-e-dominio-por-agregado.md) (§5, como
  uma requisição corre), [ADR-0005](0005-persistencia-multicanal.md) (SQLite WAL),
  [ADR-0007](0007-evolucao-de-schema.md), D-702, épico E-053

## Contexto

O `projetos.db` é SQLite em WAL: leituras concorrentes, **um escritor por vez**. Quem
segura uma escrita pendente segura o banco do app inteiro. Hoje três jeitos de abrir e
fechar transação convivem sem regra (medido em 25/09/2026):

| Padrão | Quanto |
|---|---|
| O router recebe a sessão do `get_db`, que faz commit no fim da requisição | 94 endpoints |
| O router faz `commit()` à mão ou abre sessão | 18 commits; 4 aberturas em 2 routers |
| O service abre a própria sessão | 156 blocos em 35 arquivos (85 só leem); nenhum `db.begin()`, 2 `rollback()` |
| Endpoint com `get_db` chama service que abre outra sessão — duas transações numa requisição | 25 endpoints (12 nem usam a sessão que recebem) |
| Service com sessão aberta chama outro que abre a sua e grava; a de fora faz `refresh` | ex.: `ExportService.gerar_bruto_via_worker` |
| Bloco de sessão que espera I/O longo (IA, ffmpeg, rede) | 8 blocos, 5 deles escrevem |

Nenhum defeito medido: nos 25 endpoints, o router só lê antes de chamar o service (não
disputa o lock consigo mesmo); nos 5 blocos que escrevem, a escrita vem **depois** da
espera. A sessão aninhada funciona porque o `sqlite3` do Python não abre transação para
`SELECT` — cada leitura enxerga o último commit. É o que está certo por acaso: nada
escrito impede a próxima mudança de gravar antes de uma espera de minutos e travar o
banco.

## Decisão

1. **O caso de uso é a unidade de trabalho.** O service abre a sessão e marca a
   transação com o idioma do SQLAlchemy — commit ao sair do bloco, rollback se ele
   levantar:

   ```python
   async with AsyncSessionLocal() as db, db.begin():
       ...
   ```

   É o que o ADR-0015 §5 já pede: o service carrega, chama o domínio e persiste.
2. **Service chamado por outro, no mesmo caso de uso, recebe a sessão** (`db`) como
   parâmetro e não abre outra. Some a sessão aninhada, e com ela a dependência do
   detalhe do driver.
3. **Nenhuma escrita pendente atravessa I/O longo.** Operação longa — render, download,
   transcrição, IA, ffmpeg, rede — trabalha em sessões curtas: lê e fecha, espera o I/O,
   abre de novo e grava. Atribuir a um objeto carregado também conta: o *autoflush* da
   consulta seguinte transforma a atribuição em escrita.
4. **Router não abre sessão nem faz commit.** O `get_db` fica como transição para os
   endpoints que o E-053 ainda vai afinar; endpoint novo nasce sem ele. A existência do
   recurso (o 404) se confere dentro do service, com `NaoEncontrado` e o tratador
   global do D-697.

Uma catraca guarda a regra 4: `tests/test_transacao_nos_routers_d702.py` conta, nos
routers, os `Depends(get_db)`, os `commit()` e as aberturas de sessão, e os números só
diminuem.

## Alternativa descartada

**Unidade de trabalho por requisição** — o `get_db` descendo como parâmetro até o fim.
É simples para o pedido curto, mas não serve ao trabalho em segundo plano (a requisição
termina antes dele), prenderia a transação durante as operações longas, o que o
escritor único do SQLite não tolera, e contraria o ADR-0015 §5 (router sem banco).

## Consequências

- A migração do código acontece nas demandas do E-053 (D-703 a D-707), router por
  router: os 25 endpoints de sessão dupla passam a conferir o 404 no service. Este ADR
  não muda código de produção.
- A catraca aperta a cada router afinado; quando os três números chegarem a zero, o
  `get_db` sai.
- Fora do escopo: o `settings.db` e o `llm_calls.db`, que são `sqlite3` síncrono na
  infraestrutura, cada um com o seu mecanismo.
