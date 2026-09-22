# ADR-0005: Persistência multicanal (SQLite WAL, um banco por canal)

- **Status:** Aceito (retroativo)
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Substitui:** [ADR-0003](0003-sqlite-wal-single-writer.md)

## Contexto

O ADR-0003 descrevia **um** arquivo `projetos.db`. Com o multicanal (D-155) passaram
a existir três bancos, e a decisão nunca foi registrada. O que o ADR-0003 dizia sobre
WAL e escritor único continua valendo e é carregado para cá.

## Decisão

**Três bancos SQLite**, todos em modo WAL via SQLAlchemy async + aiosqlite:

| Banco | Escopo | Onde |
|---|---|---|
| `projetos.db` | **por canal**: projetos, cortes, metadados, shorts | `instance/channels/<canal>/projetos/` |
| `settings.db` | global, **com linhas por canal**: ajustes do app, identidade dos canais e skills editoriais (D-191) | `instance/` (`channel_paths.settings_db_path`) |
| `llm_calls.db` | global: telemetria das chamadas de IA (D-353) | `instance/` (`services/llm_calls_store.py`) |

- O banco do canal ativo sai de `channel_paths.database_url()`. A virada para a
  pasta do canal só acontece quando o banco **já foi consolidado lá**
  (`consolidar_dados_do_canal`); até isso, o app lê do local legado, para não abrir
  um banco vazio paralelo enquanto os dados ainda estão no lugar antigo.
- Em toda conexão: `journal_mode=WAL` (leitura concorrente durante escrita),
  `busy_timeout=30000` e `synchronous=NORMAL` (`app/database.py`).
- O **escritor único** é consequência do WAL. A serialização extra é feita por
  locks de aplicação **por chave** (*single-flight*, ex.: um lock por corte no proxy
  de mídia), não por um lock global.

O `settings.db` fica à parte do `projetos.db` de propósito: evoluir a configuração
nunca toca o banco pesado de dados e mídias.

## Consequências

- Os **dados e mídias** de um canal são uma pasta: copiá-la ou apagá-la não toca os
  outros. A **configuração** do canal (identidade, skills, ajustes) está no
  `settings.db`: um backup completo de um canal leva a pasta **e** esse banco.
- **Trocar de canal exige reiniciar o app**: o engine nasce no import, a partir do
  canal ativo (ver ADR-0006; a troca a quente está no backlog, D-736).
- Caminhos de artefato são gravados **relativos à pasta do projeto** (D-158), para
  sobreviver à relocação da pasta do canal.

## Alternativas consideradas

- **Um banco único com coluna de canal:** mistura dados de canais e torna backup e
  remoção por canal cirúrgicos demais.
- **Postgres:** exige servidor para um app local de uma pessoa.

## Gatilho de revisão

Necessidade de escrita concorrente real entre processos, ou de trocar de canal sem
reiniciar.
