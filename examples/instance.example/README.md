# instance.example

Molde de um canal do CutCut. **Não copie esta pasta à mão.**

No primeiro boot, o app cria `instance/channels/<canal>/` a partir daqui e marca o
canal como ativo; um canal novo criado em **Configurações → Novo canal** nasce do
mesmo molde. Os textos em `editorial/` são o ponto de partida das skills
editoriais: depois do primeiro boot elas vivem no banco, por canal, e se editam na
tela (ver `docs/adr/0011-skills-editoriais-por-canal.md`).

## Estrutura

```
instance/channels/<canal>/
├── channel.yaml      # Reserva da identidade; a fonte é o banco (Configurações)
├── editorial/        # Moldes das skills, prompts e scaffolds do canal
├── mascot/           # Imagens do mascote do canal
└── projetos/         # Projetos de corte e o banco do canal (projetos.db)
```

A pasta `instance/` não é versionada: um `git pull` não toca nos dados do canal.
Instalação completa em `docs/SETUP.md`.
