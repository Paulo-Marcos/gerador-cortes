# AI Navigation Index

Este arquivo e a porta de entrada para uma IA navegar no projeto sem varrer tudo.
Atualize quando criar fluxos, endpoints, pastas ou decisoes importantes.

## Como Usar

1. Comece por este arquivo.
2. Abra apenas o documento de indice do assunto relevante em `docs/ai-index/`.
3. So depois leia os arquivos fonte citados no indice.
4. Ao concluir uma entrega, registre:
   - arquivos alterados;
   - endpoints envolvidos;
   - artefatos de disco criados;
   - decisoes que evitam investigacao repetida.

## Indices Disponiveis

- [Render pipeline e editor de timeline](docs/ai-index/render-pipeline.md)

## Mapa Rapido

- Backend principal: `backend/app/`
- Frontend React (Vite): `frontend/src/` (páginas em `frontend/src/features/`)
- Remotion renderer e Native Worker: `video-renderer/`
- Dados do canal ativo: `instance/channels/<canal>/projetos/` (resolvido por `channel_paths.projetos_dir()`)
- Fila do Native Worker: `<projetos>/fila_remotion/`
- Artefatos por corte: `<projetos>/{projeto_id}/cortes/{corte_id}/`

## Regras de Manutencao

- Prefira links para arquivos e funcoes em vez de textos longos.
- Mantenha os indices pequenos, orientados a decisao.
- Quando um comportamento parecer estranho, registre a causa raiz depois de corrigir.
- Se um fluxo tem etapas em disco, documente os nomes exatos dos arquivos.
