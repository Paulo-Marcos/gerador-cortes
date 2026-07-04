# instance.example

Estrutura de exemplo para configurar sua instância do CortadorLive.

## Como usar

Copie esta pasta para a raiz do repositório como `instance/`:

```bash
cp -r examples/instance.example/ instance/
```

Em seguida edite `instance/channel.yaml` com os dados do seu canal.

## Estrutura

```
instance/
├── channel.yaml      # Identidade do canal (handle, nome, crédito, paleta de cores)
├── editorial/        # Guias editoriais, prompts e templates específicos do canal
├── mascot/           # Imagens do mascote/avatar do canal
└── projetos/         # Projetos de corte (pode apontar PROJETOS_DIR para este diretório)
```

## Configuração do backend

Em `backend/.env`, aponte `PROJETOS_DIR` para a pasta de projetos da instância:

```env
PROJETOS_DIR=../instance/projetos
```

> A pasta `instance/` não deve ser versionada. Adicione `instance/` ao `.gitignore` do repositório.
