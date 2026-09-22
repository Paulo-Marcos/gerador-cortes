# Contribuindo com o CutCut

O CutCut tem **um mantenedor**. Contribuições de fora entram por **issue**: bugs,
ideias e perguntas são bem-vindos; o código é escrito pelo mantenedor.

## Por que só issues

Boa parte do app é protegida por **travas de funcionalidade**
(`.guia/locks/registry.yaml`): comportamentos já validados que não podem mudar
sem a autorização do mantenedor, registrada no commit com uma marca `[unlock:<id>]`.
Criar qualquer arquivo novo também é travado. Um PR de fora quase sempre esbarra
numa trava, e o CI (`lock-check`) o reprova — não por ser ruim, mas porque só o
mantenedor pode liberar. Em vez de você fazer o trabalho e ele ficar parado, a
issue leva a ideia até quem pode aplicá-la.

**Pull requests só a convite.** Se uma issue virar um PR combinado, o mantenedor
diz como proceder.

## Como abrir uma boa issue

Use os modelos em **Issues → New issue**.

- **Bug:** o que você fez, o que esperava e o que aconteceu; a versão (tag ou
  commit) e a versão do Windows; o que a tela **Configurações → Aplicação →
  Pré-requisitos** mostra; e o trecho do log do backend perto do erro.
- **Ideia:** o problema que você quer resolver, antes da solução que imaginou.

**Nunca cole segredos numa issue:** nada do `backend/.env`, do `client_secrets.json`
ou do `token.json`. Revise o log antes de colar.

Vulnerabilidade de segurança **não** vai em issue: veja o [SECURITY.md](SECURITY.md).

## Para o mantenedor (e para o agente de IA dele)

As regras de trabalho vivem no [AGENTS.md](AGENTS.md). O essencial:

- **Travas:** confira `python bin/check-lock.py check <arquivo>` antes de editar;
  arquivo travado só muda com autorização e a marca `[unlock:<id>]` no commit.
- **Commit:** Conventional Commits + gitmoji antes do tipo, em português no
  imperativo, escopo `(D-NNN)`, um commit por funcionalidade, sempre com pathspec.
- **Camadas:** routers → services → domain (puro) / infrastructure, verificadas
  pelo import-linter; código novo em domain/services nasce com teste.
- **Portão de qualidade**, o mesmo do CI:
  - backend: `ruff check .`, `ruff format --check .`, `lint-imports`, `pytest`;
  - frontend: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`;
  - video-renderer: `npm run lint`.
- **Não rode `npm run format`**: o CI não usa prettier e o comando reescreve o
  repositório inteiro.
