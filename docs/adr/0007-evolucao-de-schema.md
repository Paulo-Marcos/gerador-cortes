# ADR-0007: Evolução de schema por migration versionada

- **Status:** Aceito
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0005 (persistência multicanal)

## Contexto

O schema evolui hoje por **três caminhos ao mesmo tempo**:

1. 29 `ALTER TABLE` no boot (`app/database.py`), cada um num `try/except` que engole
   o erro;
2. migrations versionadas por `PRAGMA user_version` (`app/migrations/`, de 001 a 006);
3. uma reconciliação que deriva colunas ausentes do `Base.metadata`
   (`app/migrations/reconciliacao.py`).

Para uma única instalação isso funciona. Para bancos de terceiros em versões
diferentes, o erro engolido esconde falha real, e a lista de `ALTER` não tem ordem
nem registro do que já rodou.

## Decisão

**Daqui para frente, toda mudança de schema entra como migration versionada** em
`app/migrations/`, com número sequencial e teste.

- Os 29 `ALTER TABLE` do boot ficam **congelados**: nenhum novo é acrescentado.
- A **reconciliação** continua como rede de segurança. Ela já registra no log
  (`Schema drift reparado em ...`) cada coluna que cria: esse aviso é sinal de
  migration que faltou e deve virar uma.
- Migration que muda dado roda primeiro sobre cópias dos bancos de DEV e PROD
  (padrão da migration 006).

## Consequências

- Cada banco sabe em que versão está (`user_version`), e atualizar é aplicar as que
  faltam, em ordem.
- A limpeza dos `ALTER` antigos (transformá-los em uma migration inicial e tirar o
  `except` que engole erro) é uma demanda à parte, não esta decisão.

## Alternativas consideradas

- **Alembic:** peso de ferramenta para um só dialeto (SQLite) e um só mantenedor.
  Reabrir se surgir um segundo banco.
- **Manter os três caminhos:** documentaria o problema sem resolvê-lo.

## Gatilho de revisão

Um segundo dialeto de banco, ou migrations que precisem de *downgrade*.
