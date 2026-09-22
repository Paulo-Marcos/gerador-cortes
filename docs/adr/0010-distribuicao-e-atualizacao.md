# ADR-0010: Distribuição e atualização

- **Status:** Aceito
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0008 (Windows), ADR-0006 (instalação)

## Contexto

Instalar exige três runtimes (Python do backend, Node do frontend e do renderer),
ffmpeg, yt-dlp, os CLIs de IA e as credenciais do Google — e um passo pulado vira
um erro três telas adiante. Os dados de cada canal vivem fora do git
(`instance/channels/<canal>/`), e atualizar não pode tocar neles.

## Decisão

- **Versões saem por tag** `vX.Y.Z`: o workflow `.github/workflows/release.yml`
  cria o GitHub Release com as notas daquela versão tiradas do `CHANGELOG.md`.
- **Instalar é rodar o bootstrap**: `bin/bootstrap.ps1` (e `bin/bootstrap.sh`) cria
  o venv, instala as dependências e gera o `.env` a partir do exemplo. Pode rodar
  de novo quantas vezes quiser: reaproveita o venv e nunca sobrescreve um `.env`
  existente (D-630).
- **Os pré-requisitos são conferidos pelo próprio app**: a tela de Canais mostra o
  que falta na máquina (`GET /api/sincronizacao/ambiente`, D-627), sem expor
  nenhum valor de credencial.
- **Atualizar é `git pull` guardado**: `bin/check_update_safety.py` (D-159) confere,
  antes, que nada de produção está versionado e que o pull não toca os dados.

## Consequências

- Quem instala precisa de git, e o canal de atualização é o repositório.
- Os dados do usuário ficam fora do alcance de qualquer atualização, por construção.

## Alternativas consideradas

- **Instalador (MSI/exe) ou pacote zip com os runtimes:** mais amigável, mas
  empacotar Python + Node + ffmpeg é um projeto à parte; fica para quando houver
  usuários pedindo.
- **Docker:** não suportado (ADR-0008).

## Gatilho de revisão

Usuários que não conseguem instalar com git, ou uma atualização que precise
migrar dados de forma que o `git pull` não resolva.
