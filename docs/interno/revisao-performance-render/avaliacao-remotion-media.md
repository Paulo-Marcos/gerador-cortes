# D-443 — Upgrade Remotion 4.0.502 e avaliação de `@remotion/media`

## Upgrade aplicado

`remotion`/`@remotion/*` 4.0.451 → **4.0.502** (patch dentro do v4).
Validações executadas no DEV:

- `npx remotion versions` — todos os pacotes alinhados.
- `npx remotion browser ensure` — headless shell baixou e extraiu OK no
  Node 24 (sem reincidência do bug do extract-zip; ver memória
  `remotion_node24_extract_zip_bug`).
- `npx remotion compositions` — as 5 composições listam normalmente.
- Smoke render: 10 frames de `OverlaySceneV2` em ProRes 4444 com
  `--pixel-format=yuva444p10le` (as mesmas flags do perfil real em
  `backend/app/domain/overlay_codec.py:59`) → saída `prores, yuva444p12le`
  com alpha, correta.
- O fingerprint do cache de bundle inclui `package.json`
  (`pipeline_render.py:1304`), então PRD regera o bundle sozinho após o
  deploy — sem cache stale.

**Pós-deploy em PRD:** rodar `npm ci` no `video-renderer` e depois
`npx remotion browser ensure` (garantia contra o bug de extração no Node 24).

## Avaliação: migrar `OffthreadVideo` → `<Video>` de `@remotion/media`?

**Recomendação: ainda não.** Fatos:

- No projeto, `OffthreadVideo` aparece só em `CenaReacao.tsx` (2 usos). As
  demais composições (cards de cena, overlays) não consomem vídeo — o custo
  dominante dos overlays é DOM/SVG, não extração de frames.
- O `<Video>` novo (Mediabunny/WebCodecs) é o caminho recomendado pela doc
  desde ~fev/2026, mas o pacote segue rotulado experimental; o ganho aparece
  quando a composição extrai muitos frames de vídeo — não é o nosso perfil
  de carga (os chunks de overlay são curtos e majoritariamente estáticos).
- Risco de regressão em PRD (codec do proxy, seek exato) sem ganho mensurável
  esperado → não compensa agora.

Gatilho para reavaliar: se `CenaReacao` (ou uma cena nova baseada em vídeo)
passar a pesar nos tempos de overlays no `pipeline_events.jsonl`, migrar
apenas essa composição e medir A/B.

## Concurrency

O worker força `--concurrency 12` (`native_worker.js`). A doc oficial
recomenda calibrar com `npx remotion benchmark` — vale rodar uma vez em PRD
com uma composição real e ajustar se o ótimo ficar longe de 12. Não alterado
nesta demanda para não mexer em duas variáveis ao mesmo tempo (o pool da
D-441 já muda o paralelismo externo).
