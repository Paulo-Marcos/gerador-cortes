# Git hooks do projeto

## Instalacao (uma vez por clone)

```powershell
git config core.hooksPath .githooks
```

Isso aponta o git deste repositorio para os hooks aqui versionados.
Os hooks ficam no controle de versao, entao qualquer clone que rode o
comando acima passa a usa-los.

## Hooks disponiveis

- **commit-msg** - valida travas declaradas em `.guia/locks/registry.yaml`.
  Rejeita commits que modifiquem arquivos travados sem a marca
  `[unlock:<feature-id>] motivo: <razao>` na mensagem.

## Bypass

Em emergencia: `git commit --no-verify`.
Nao recomendado: o workflow `.github/workflows/lock-check.yml` re-checa
no PR e barra o merge de qualquer jeito.

## Dependencia

Os hooks chamam `python bin/check-lock.py`. Requer Python 3.8+ e
`pip install pyyaml`.
