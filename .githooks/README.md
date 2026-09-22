# Git hooks do projeto

## Instalacao (uma vez por clone)

```powershell
git config core.hooksPath .githooks
```

Isso aponta o git deste repositorio para os hooks aqui versionados.
Os hooks ficam no controle de versao, entao qualquer clone que rode o
comando acima passa a usa-los.

## Hooks disponiveis

- **commit-msg** - faz duas conferencias, nesta ordem:
  1. **Padrao da mensagem** (`bin/check_commit_msg.py`, D-684): rejeita cabecalho
     fora de `<emoji> <tipo>(<escopo>): <descricao>` ou com tipo fora da lista
     canonica do `AGENTS.md`. Cabecalho acima de 72 caracteres, emoji diferente
     do da tabela e ponto final so geram aviso. Merge, revert e fixup! passam.
  2. **Travas** (`bin/check-lock.py`): rejeita commits que modifiquem arquivos
     travados em `.guia/locks/registry.yaml` sem a marca
     `[unlock:<feature-id>] motivo: <razao>` na mensagem.

## Bypass

Em emergencia: `git commit --no-verify`.
Nao recomendado: o workflow `.github/workflows/lock-check.yml` re-checa as
duas coisas (padrao e travas) no push e no PR.

## Dependencia

Os hooks chamam `python bin/check_commit_msg.py` e `python bin/check-lock.py`.
Requer Python 3.9+ e `pip install pyyaml`.
