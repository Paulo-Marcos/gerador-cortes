# Duvida de design — voltar ao Bruto a partir da Pos-producao

Gerado em 19/07/2026, depois de implementar a AUDITORIA-v2 (D-396). Paulo testou e notou que **nao existe, dentro da tela de Pos-producao, nenhum jeito de voltar para o editor Bruto do mesmo corte**.

## O que ja checamos

- Nem o `DE-PARA.md` nem o prototipo `Workbench 1c.dc.html` desenham um botao explicito de "voltar" na Pos — o unico "Voltar" documentado e da **Revisao final** (volta para a Pos), nao da Pos para o Bruto.
- O `DE-PARA.md` secao 0 diz que a navegacao entre fases (que antes vivia numa sidebar com item "Bruto") "migrou pro shell" — virou o **TabStrip** (abas no topo). Isso funciona **so se a aba "Cortes" do mesmo projeto ja foi aberta nesta sessao** (ela e criada ao navegar, nao existe por padrao).
- Se o usuario chega na Pos de um jeito que nunca passou pela aba do Bruto (ex.: o card do corte ja roteia direto pra Pos porque o bruto ja estava pronto), **nao sobra nenhuma aba "Cortes" pra clicar de volta** — e nao ha nenhum atalho/botao dentro da propria tela de Pos que resolva isso.

## O print anexo (`pos-sem-botao-voltar.jpg`)

Recorte do topo da tela de Pos-producao (projeto real, corte aprovado ainda sem render). Repare: a faixa de abas mostra `Workspace`, `Cortes` (de OUTRO projeto) e `Pos` (o atual) — nenhuma aba `Cortes` para ESTE projeto. A barra de steps abaixo (`Metadados — 2 Cenas (ativo) — 3 Validar — 4 Renderizar`) tambem nao tem nenhum jeito de voltar.

## O que precisamos decidir

Como deveria funcionar o "voltar pro Bruto" a partir da Pos, visualmente e comportamentalmente? Algumas opcoes pra voces avaliarem (nenhuma implementada ainda):

1. Um icone/botao dedicado no header da Pos (ex.: seta de voltar ou tesoura, ao lado do stepper) que abre/foca a aba do Bruto para o MESMO corte, criando a aba se ela nao existir.
2. Tornar o chip "1 Bruto" do stepper clicavel (hoje so e informativo).
3. Outra abordagem que voces prefiram.

Se puderem escrever a resposta no formato de uma secao nova em `design_handoff_workbench/AUDITORIA-v2.md` (ou um arquivo `AUDITORIA-v2-complemento.md`), o Claude Code ja sabe seguir esse formato para implementar.
