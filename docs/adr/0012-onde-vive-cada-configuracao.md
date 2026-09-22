# ADR-0012: Onde vive cada configuração

- **Status:** Aceito
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0005 (persistência), ADR-0011 (skills)

## Contexto

Configuração vivia em quatro lugares ao mesmo tempo (`.env`, `settings.db`,
`channel.yaml` e o banco do canal), com sobreposição: a identidade do canal, por
exemplo, migrou do `channel.yaml` para o banco (D-191), e parte da documentação
continuou dizendo que ela estava no YAML.

## Decisão

Uma **fonte da verdade** por tipo de configuração:

| O quê | Onde | Por quê |
|---|---|---|
| **Segredos** (chaves de API, credenciais de serviço) | `backend/.env`, lido por `app/config.py` | nunca versionado, nunca na tela |
| **Customização editável** (identidade do canal, ajustes do app, skills editoriais, mascote) | `settings.db`, por canal | o operador muda pela tela, sem deploy |
| **Credencial do app no Google** (`client_secrets.json`) | compartilhada, com substituição por canal (`channel_paths.youtube_client_secrets_path`) | um app no Google Cloud serve todos os canais |
| **Login do YouTube** (`token.json`) | sempre do canal ativo (`<canal>/youtube/`) | cada canal publica na sua conta |
| **Tema** (paleta) | `theme.config.json` do canal ativo | lido também pelo renderer |
| **Presets de layout e palco** | banco do canal (`LayoutPreset`) | fazem parte do trabalho do canal |

O `channel.yaml` **não** é mais a fonte da identidade: é lido só como reserva, para
um canal que ainda não tem linha no banco (`services/channels.py`, `_montar_canal`).

## Consequências

- Configuração nova que o operador edita entra no banco, com tela; não em arquivo.
- Artefato global novo na raiz de `instance/` precisa entrar na lista de
  reservados: o guarda de layout recusa arquivo solto ali e trava o boot.
- O docstring de `identidade_do_canal_ativo()` que dizia "lida do `channel.yaml`
  (fonte única)" foi corrigido junto com esta decisão.

## Alternativas consideradas

- **Tudo no `.env`:** mistura segredo com preferência e obriga editar arquivo para
  mudar uma cor.
- **Tudo em arquivos por canal:** sem tela, e sem transação.

## Gatilho de revisão

Uma configuração que precise ser compartilhada entre instalações, ou um segredo que
precise variar por canal.
