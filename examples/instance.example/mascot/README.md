# Como habilitar o mascote do seu canal

O mascote é **opcional e por canal**. Por padrão o app roda **sem mascote** — nada
precisa ser configurado para o pipeline funcionar. Se você quiser um mascote
(personagem/avatar sobreposto aos cortes e shorts), siga os passos abaixo.

> Este diretório é só um **modelo vazio**. O conteúdo real do mascote **não é
> versionado** — ele vive na instância local do canal, em `instance/`.

## Passos

1. **Coloque os PNGs do mascote** (as poses) em:

   ```
   instance/channels/<seu-canal>/assets/<mascote>/
   ```

   (`<mascote>` é a pasta de assets do seu mascote — escolha um nome curto e
   sem espaços.)

   Um arquivo `.png` por pose (ex.: `mascote_apontando.png`, `mascote_pensando.png`, ...).

2. **Coloque o catálogo de poses** (`poses.json`) em:

   ```
   instance/channels/<seu-canal>/mascot/poses.json
   ```

   Esse JSON mapeia cada humor/estado ao arquivo da pose correspondente.

3. **Habilite o mascote no env** do frontend e do renderer:

   ```
   VITE_CANAL_MASCOTE_HABILITADO=true
   ```

   (o padrão é `false` — veja `frontend/.env.example`).

## Observações

- Sem esses arquivos e com a flag em `false`, o backend sobe e o render funciona
  normalmente, **sem** o mascote.
- A materialização por canal repõe o cache `public/<mascote>` a partir de
  `instance/`; por isso o cache não precisa (nem deve) ir para o repositório.
