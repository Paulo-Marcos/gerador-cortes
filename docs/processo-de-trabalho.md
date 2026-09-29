# Processo de trabalho

Fluxo de entrega, travas de funcionalidade, padrão de commit e trabalho
concorrente. Movido do `AGENTS.md` na D-786, que agora traz só o essencial e
aponta para cá.

## Fluxo de entrega: worktree → PR → main (D-822)

**Nada entra na `main` sem PR.** A `main` é o que a PROD puxa, e o PR é a única
porta: nela o CI prova a mudança **antes** de ela chegar, e não depois.

```
worktree d-NNN-slug ──PR──▶ CI + pr-audit ──squash──▶ main ──(PROD puxa quando o Paulo quiser)
                                                        └── tag vX.Y.Z quando o lote usado na PROD estiver bom
```

1. **Worktree e branch por demanda**, a partir da `origin/main`:
   `git worktree add ..\gerador-cortes-dNNN -b d-NNN-slug origin/main`.
   Branch sozinha não basta: duas frentes na mesma pasta varrem os arquivos
   uma da outra. A pasta `C:\DEV\gerador-cortes` fica na `main`, para puxar,
   ler e rodar o Guia (o estado do Guia mora nela). Sessão na nuvem já trabalha
   numa branch própria: vale como worktree.
2. **Na branch:** commits no padrão abaixo, portão local, entrada no
   `CHANGELOG` em `[Unreleased]`.
3. **PR contra a `main`:** `git push -u origin d-NNN-slug` e `gh pr create`, com
   o título igual ao assunto do commit. Uma demanda, um PR.
4. **CI no PR.** A proteção da `main` exige `CI ok` (o job que espera todos os
   outros, D-820) e `Verificar travas de edicao`, com a branch **atualizada**
   com a `main`.
5. **Aprovação sempre pela skill:** `pr-audit` (PR do Dependabot: `pr-bump`),
   com o relatório. O merge só com o ok do Paulo, por squash, levando a mensagem
   do commit (o Lock Check confere as marcas `[unlock:]` também no push da
   `main`):
   `gh pr merge <N> --squash --delete-branch --subject "<assunto>" --body-file <msg>`.
6. **Depois do merge:** `git worktree remove ..\gerador-cortes-dNNN` e
   `git pull --ff-only` na pasta principal.

**PR não é release.** A `main` acumula no `[Unreleased]`; a PROD puxa a `main`
quando o Paulo quer usar o que entrou. A release é a decisão de dizer "este lote
está bom": a versão sobe num PR como qualquer mudança e a tag vai no commit da
`main` depois do merge (D-823 adapta o `bin\release.py`). A última tag é o ponto
estável de volta: `backup-prod.py` antes de todo pull na PROD, por causa das
migrations do boot.

### Conflitos: resolvem-se na branch, antes da aprovação

A `main` nunca recebe resolução de conflito. Quando um PR entra, os outros
abertos ficam **desatualizados** (a proteção exige a branch em dia), e cada um
se atualiza no próprio worktree:

```
git fetch origin
git rebase origin/main          # resolva arquivo a arquivo
git diff origin/main -- <arquivo> | grep "^-"   # "manter os dois" já comeu função
<portão local>
git push --force-with-lease     # só na própria branch, nunca na main
```

O CI roda de novo e a `pr-audit` revê o head novo. A exigência de branch em dia
existe por causa do **conflito semântico**, que o git não vê: um PR renomeia uma
função, o outro acrescenta uma chamada ao nome antigo; cada um passa sozinho, a
soma quebra. Só o CI rodando sobre a combinação pega.

Duas demandas no mesmo arquivo: prefira em sequência (`depends`); se forem em
paralelo, a menor entra primeiro e a maior se atualiza sobre ela.

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

- **Um worktree por demanda** (ver o fluxo de entrega acima). Frentes na mesma árvore contaminam os commits umas das outras. As regras abaixo valem para a árvore principal, que outras sessões também usam.
- **Commit com pathspec**: `git commit <arquivos> -F msg`. Nunca `git add -A` nem `git commit` sem caminho numa árvore compartilhada. Confira `git diff --cached --name-only` antes. **Exceção que o pathspec não protege:** se o mesmo arquivo tem hunks de outra sessão, o pathspec os leva junto.
- **Nunca `git stash`** para medir linha de base numa árvore compartilhada — o `stash@{0}` muda de dono. Use `git worktree add` ou `git diff HEAD -- <arquivo>`.
- Depois de resolver conflito de rebase, rode `git diff main -- <arquivo> | grep "^-"` antes do `--continue`: "manter os dois lados" já comeu corpo de função.
- **Worktree de frontend precisa de `frontend/.env.local` com `VITE_API_URL`** antes de subir o Vite. Sem ele, a URL da API cai no padrão e o frontend fala com o backend de **outra** instância.
- **Guia Fluxo:** passe sempre o id explícito (`finish D-NNN`, `ready D-NNN`) — o `current-task.json` é compartilhado e deriva entre sessões. O `finish` padrão gera mensagem no formato antigo; com arquivo travado, use `--no-commit` e faça o commit à mão com as marcas.
- Tarefa que **reescreve histórico** (`git filter-repo` e afins) roda sozinha, com o backend e as outras sessões parados.
