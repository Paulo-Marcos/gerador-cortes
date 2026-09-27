# ADR-0017: Casca única de interface

- **Status:** Aceito
- **Data:** 2026-09-27 (decisão do dono em 2026-09-16)
- **Decisores:** Paulo Marcos
- **Relacionado:** D-599 (a casca nova atrás de flag), D-726 (este ADR), D-727, D-728,
  D-724, épico E-058

## Contexto

O frontend carrega três cascas de interface, escolhidas em tempo de execução pelo
`AppShell` (`frontend/src/components/layout/AppShell.tsx`):

| Casca | Como liga | Onde mora |
|---|---|---|
| Nova (upgrade) | `VITE_UPGRADE_SHELL=1` ou `localStorage['upgrade-shell']` | `src/upgrade/` |
| Workbench | `VITE_WORKBENCH=1` ou o override local do `workbenchFlag` | `src/components/workbench/` |
| Legada | nenhuma das duas | `LegacyShell`, dentro do `AppShell` |

A casca nova nasceu atrás de flag (D-599) justamente para que o rollback fosse uma
tecla, não um deploy, enquanto as telas migravam. O custo de manter as três ficou
visível no diagnóstico de 16/09 e continua medido hoje (27/09/2026):

| Marca da bifurcação | Quanto |
|---|---|
| Módulos que leem `CASCA_NOVA` | 27 |
| Usos de `isWorkbenchEnabled` | 32, em 16 arquivos |
| Ramos por `variant` (`legacy` / `workbench` / `ap`) | 25 |
| Telas duplicadas por casca | `ProjetoDetalhePage` × `WorkspaceProjetoPage`; render final da Pós × da Revisão |

Cada mudança de tela paga três vezes, ou deixa uma das cascas para trás em silêncio.
E o padrão é o pior dos três: sem `.env`, uma instalação limpa cai na casca **legada**,
que não é a que o dono usa nem a que as telas novas miram.

A casca nova é a de uso real desde a v0.3.0 (22/09/2026): a PROD roda com
`VITE_UPGRADE_SHELL=1` e o Workbench comentado. A v0.3 foi, portanto, o ciclo em que o
rollback ficou disponível.

## Decisão

1. **Só a casca nova fica.** O legado e o Workbench saem do código na v0.4, pela D-728.
   A data de remoção é essa release; não há outro ciclo de convivência.
2. **As flags acabam junto.** `VITE_UPGRADE_SHELL`, `VITE_WORKBENCH`, o override
   `localStorage['upgrade-shell']` e o do Workbench deixam de existir. Quem lia
   `CASCA_NOVA`, `isWorkbenchEnabled` ou `variant` fica com o ramo da casca nova, e a
   condição sai.
3. **O rollback é o git, não uma flag.** Voltar para uma casca removida é reverter
   commits; ninguém mantém uma alternativa viva "por garantia".
4. **Telas duplicadas se unificam na versão da casca nova** (D-727), e o que é da casca
   passa a morar como casca, separado das telas (D-724).

## Consequências

- Uma instalação limpa abre na casca que o app usa de verdade, sem configurar nada.
- As mudanças de tela deixam de pagar três vezes, e a leitura do código perde as
  bifurcações por casca.
- Some a rede de segurança de trocar de casca por uma tecla. É aceito: a casca nova
  já passou por uma release inteira em uso.

## Alternativas consideradas

- **Manter a flag por mais uma release.** Descartada: prolonga o custo triplo e deixa
  a instalação limpa na casca errada, sem ganho que a v0.3 já não tenha dado.
- **Remover só o Workbench e manter o legado como rollback.** Descartada: o legado é
  justamente o padrão sem `.env`, e mantê-lo conserva a duplicação de telas que a
  D-727 existe para eliminar.

## Gatilho de revisão

Uma segunda interface com público próprio (por exemplo, um modo compacto para outra
plataforma) pediria um novo ADR — como casca planejada, não como flag de convivência.
