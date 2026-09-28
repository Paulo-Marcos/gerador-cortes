# Processo de trabalho

Travas de funcionalidade, padrão de commit e trabalho concorrente. Movido do
`AGENTS.md` na D-786 (o texto é o mesmo), que agora traz só o essencial e aponta
para cá.

## Protocolo de alteração (travas de funcionalidade)

> Vale para qualquer agente.

### Antes de editar QUALQUER arquivo

1. Veja se ele aparece em [`.guia/locks/registry.yaml`](.guia/locks/registry.yaml) (`python bin/check-lock.py check <arquivo>`).
2. Se aparecer, **o arquivo está travado**: pode ler, mas não pode editar, apagar, renomear, mover nem recriar em outro caminho.
3. Antes de pedir desbloqueio, explique: o `id` da trava, o que ela protege, por que a mudança toca nela, o impacto esperado, o risco de regressão e a alternativa sem mexer no arquivo.
4. **Peça autorização explícita ao desenvolvedor.** Não decida sozinho e não contorne (renomear, refazer noutro lugar, dividir em vários).
5. Criar arquivo novo também é trava (`adicoes-exigem-autorizacao`).

As travas protegem **funcionalidades homologadas**, não contextos de arquitetura: um arquivo pode estar em várias, um contexto inteiro pode não ter nenhuma.

### Como o desbloqueio funciona

O commit leva **uma marca por trava que casa** com os arquivos alterados:

```
[unlock:<feature-id>] motivo: <razão curta>
```

O hook `.githooks/commit-msg` e o workflow `.github/workflows/lock-check.yml` validam. Instale o hook uma vez por clone e confirme que ficou ativo — uma IDE pode revertê-lo em silêncio (D-261):

```powershell
git config core.hooksPath .githooks
git config --get core.hooksPath   # deve responder .githooks
```

---

## Padrão de commit (Conventional Commits + gitmoji)

Mensagem em português, no imperativo, com o emoji **antes** do tipo (D-091):

```
<emoji> <tipo>(<D-NNN>): <descrição imperativa, minúscula, sem ponto final>

[corpo: o PORQUÊ, não o "o quê"]

[unlock:<feature-id>] motivo: <razão>   ← só quando tocar arquivo travado
Co-Authored-By: <nome> <email>           ← em commit assistido por IA
```

| Tipo | Emoji | Quando |
|---|---|---|
| `feat` | ✨ | capacidade nova |
| `fix` | 🐛 | correção de defeito ou regressão |
| `refactor` | ♻️ | reestrutura sem mudar comportamento |
| `chore` | 🧹 | manutenção, dependências, configuração |
| `docs` | 📝 | documentação |
| `style` | 🎨 | formatação, sem lógica |
| `test` | ✅ | testes |
| `perf` | ⚡ | desempenho |
| `ci` | 👷 | pipeline de CI |
| `merge` | 🔀 | merge de branch ou worktree |

Escopo `(D-NNN)` sempre que houver tarefa (`(E-NNN)` para épico). **Um commit por funcionalidade**: stage misturado se divide antes de commitar.

---

## Execução concorrente (worktree e árvore compartilhada)

- **Um worktree por frente concorrente**, ou rode uma de cada vez. Frentes na mesma árvore contaminam os commits umas das outras.
- **Commit com pathspec**: `git commit <arquivos> -F msg`. Nunca `git add -A` nem `git commit` sem caminho numa árvore compartilhada. Confira `git diff --cached --name-only` antes. **Exceção que o pathspec não protege:** se o mesmo arquivo tem hunks de outra sessão, o pathspec os leva junto.
- **Nunca `git stash`** para medir linha de base numa árvore compartilhada — o `stash@{0}` muda de dono. Use `git worktree add` ou `git diff HEAD -- <arquivo>`.
- Depois de resolver conflito de rebase, rode `git diff main -- <arquivo> | grep "^-"` antes do `--continue`: "manter os dois lados" já comeu corpo de função.
- **Worktree de frontend precisa de `frontend/.env.local` com `VITE_API_URL`** antes de subir o Vite. Sem ele, a URL da API cai no padrão e o frontend fala com o backend de **outra** instância.
- **Guia Fluxo:** passe sempre o id explícito (`finish D-NNN`, `ready D-NNN`) — o `current-task.json` é compartilhado e deriva entre sessões. O `finish` padrão gera mensagem no formato antigo; com arquivo travado, use `--no-commit` e faça o commit à mão com as marcas.
- Tarefa que **reescreve histórico** (`git filter-repo` e afins) roda sozinha, com o backend e as outras sessões parados.
