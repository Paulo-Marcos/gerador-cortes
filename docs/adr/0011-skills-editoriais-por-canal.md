# ADR-0011: Skills editoriais são dados, por canal

- **Status:** Aceito (retroativo)
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0004 (provedores), ADR-0012 (configuração)

## Contexto

As cinco etapas editoriais (propor cortes, trechos a remover, cenas, metadados e
prompt de thumbnail) dependem de um texto de instrução que define a voz do canal.
Antes esse texto era global e espalhado: corpo em arquivos `.md`, lentes de
variação no código e parâmetros no `config`. Dois canais não podiam ter vozes
diferentes.

## Decisão

Cada skill editorial é **um dado do canal**, no `settings.db` (tabela
`editorial_skill`, uma linha por canal e skill, E-021), editável na tela de Canais.
A linha guarda o **corpo** do prompt, as **lentes** de variação e os **parâmetros**
da etapa (modelo, thinking, timeout; temperature quando há um passo Gemini ao lado).

- O **contrato de saída** (o formato que o parser espera) fica separado do corpo,
  como *scaffold* por canal (D-297): editar a voz não quebra o formato.
- Os **padrões genéricos**, alvo do "restaurar o padrão", são os modelos de
  `examples/instance.example/editorial/`, sem marca nenhuma.
- O arquivo `.md` do canal continua sendo escrito como **espelho** do corpo e serve
  de reserva: sem linha no banco, o app lê o arquivo e **semeia** o banco a partir
  dele. `.claude/skills/` é o último recurso de compatibilidade, não a fonte.

## Consequências

- Editar a voz de um canal é uma ação na tela, sem deploy e sem tocar em código.
- O corpo de uma skill não "sobe" com um commit: a versão que roda é a do banco de
  cada canal.

## Alternativas consideradas

- **Skills versionadas em `.claude/skills/`:** exigiriam commit e deploy a cada
  ajuste de voz, e seriam iguais para todos os canais.

## Gatilho de revisão

Necessidade de compartilhar skills entre instalações (exportar e importar), ou de
versionar o histórico de edições de uma skill.
