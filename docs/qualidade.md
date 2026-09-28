# Qualidade: os portões e o que fazer quando um reprova

O que o projeto confere sozinho, a cada commit e no CI — e o que fazer quando uma
dessas conferências reprova. A regra por trás de todas: **o que pode ser medido
por máquina não fica a cargo da palavra do agente** (o portão consultivo do
`guia finish` teve 557 "ok" com 61 arquivos acima do limite; D-771).

## Portão de qualidade (o mesmo do CI)

Antes de declarar pronto, rode exatamente o que o CI roda, **pelo `backend/.venv`**
(sincronizado com `bin\bootstrap.ps1 -Dev`):

```bash
# backend
ruff check . && ruff format --check . && lint-imports && pytest
# frontend
npm run lint && npx tsc --noEmit && npx vitest run && npm run build
```

- **Não rode `npm run format`** (prettier `--write`): o CI não usa prettier e o comando reescreve o repositório inteiro.
- **Nunca declare verde pelo código de saída de um pipe** (`cmd | tail; echo $?` mostra o código do `tail`). Grave a saída num arquivo e leia.
- No Windows, `lint-imports > NUL` sai com 1 mesmo com todos os contratos KEPT (a impressão do `rich` em cp1252). Rode com `PYTHONUTF8=1` ou grave a saída em arquivo.
- **Confira o encoding depois de uma edição feita por agente**: tsc, eslint e vitest não pegam mojibake. O teste `tests/test_sem_mojibake_d668.py` pega — e, por ser pesado, fica fora do ciclo rápido: rode-o explicitamente (`pytest tests/test_sem_mojibake_d668.py`).

### Níveis de teste do backend (D-751)

O portão acima é o **suíte completo**: obrigatório antes de declarar pronto e o que o CI roda sempre. No dia a dia há níveis mais rápidos. Tempos medidos em 23-24/09/2026 nesta máquina (variam com a carga):

| Momento | Comando (em `backend/`) | Custo medido |
|---|---|---|
| Enquanto edita | `pytest --testmon` | 2 s sem mudança; 13 s mudando `hms_to_seg` (132 testes) |
| Antes de cada commit | `pytest -m "not integration" -n 6` | ~50 s (3.474 testes; ~2 min em série) |
| Ao fechar uma demanda e antes do push | `pytest` (em série) | ~5 min (3.516 testes) |

- **`integration` marca o teste pesado pelo recurso que ele usa**, não pelo nome: processo externo real (ffmpeg, worker Node, OpenCV), codificação de imagem, ou uma varredura que custa segundos. Teste novo com esse perfil nasce marcado. **Varredura rápida não se marca** (D-805): as catracas de tamanho custam menos de 1 s e, marcadas, ficavam fora do ciclo antes do commit.
- **O testmon só enxerga código Python executado.** Mudou `pyproject.toml` (contratos), `openapi.json`, script Node ou JSON de fixture: rode o suíte completo.
- A primeira `pytest --testmon` constrói a base local (`.testmondata`, fora do git) rodando tudo, em cerca de 7 min. `--testmon` não funciona com `-p no:cacheprovider`: o plugin lê opções do cache do pytest.
- **`-n 6` (pytest-xdist) só no ciclo antes do commit.** Com 6 processos, 4 rodadas seguidas passaram inteiras; com 4 ou 12 apareceram falhas. Dois testes conhecidos podem falhar por ambiente, não por defeito — se um deles falhar, rode de novo em série: `test_os_dois_robos_nunca_dividem_a_porta` (consulta portas e processos da máquina; D-737) e `test_o_app_continua_respondendo_enquanto_o_disco_apaga` (sensível à disputa de CPU; D-752). Falha em qualquer outro teste é real. O suíte completo e o CI seguem em série: os pesados não foram medidos em paralelo.

## As catracas

Uma catraca guarda a situação de um dia (a "linha de base") e só deixa andar para
um lado. Quem piora é barrado; quem melhora é obrigado a **baixar o teto** no mesmo
commit, e a melhoria fica travada.

| Catraca | Teste | Limite | Ciclo rápido? |
|---|---|---|---|
| Tamanho de arquivo | `backend/tests/test_tamanho_de_arquivo_d771.py` | 500 linhas (backend, frontend, renderer) | sim |
| Tamanho de função (Python) | `backend/tests/test_tamanho_de_funcao_d772.py` | complexidade 10, 40 instruções | sim |
| Tamanho de função (frontend) | `frontend/src/shared/qualidade/__tests__/tamanhoDeFuncao.test.ts` | 100 linhas | sim (vitest) |
| Tipos (pyright) | `backend/tests/test_tipos_pyright_d773.py` | erro novo por arquivo e regra | não (~60 s) |

**Reprovou?**

- **Arquivo ou função novos acima do limite:** divida por responsabilidade — o que
  sai é uma coisa só, que se descreve numa frase (D-806, D-807). **Nunca acrescente
  à lista de exceções nem suba um teto:** afrouxar catraca é decisão do dono.
- **"Baixe o teto" / "remova da lista":** você melhorou algo; atualize a lista no
  mesmo commit.
- **Erro de tipo novo:** corrija o tipo. Se a contagem mudou **sem o código mudar**,
  foi uma dependência: meça de novo no `.venv` sincronizado (D-795).

## Outros portões

| Portão | Teste | Barra |
|---|---|---|
| Ambiente = lock | `backend/tests/test_ambiente_bate_com_lock_d796.py` | `.venv` com versão diferente do `requirements.txt` (o lock). Rode o bootstrap. |
| Encoding | `backend/tests/test_sem_mojibake_d668.py` | mojibake, caractere de controle (barra invertida de caminho do Windows interpretada numa string) e `.ps1` com acento sem BOM |
| Actions por SHA | `backend/tests/test_actions_por_sha_d780.py` | `uses:` por tag e workflow sem `permissions:` |
| Camadas | `lint-imports` (`[tool.importlinter]`) | import na direção errada |
| Contrato HTTP | `tests/test_contrato_openapi_d664.py` | rota que mudou sem atualizar `openapi.json` |
| Dependências | `pip-audit` (lock) e `npm audit --audit-level=high` no CI | vulnerabilidade alta ou crítica conhecida |

## Dependências

- **Python:** `requirements.in` é a intenção; `requirements.txt` é o lock gerado
  (versão exata e hash de cada arquivo). Não edite o `.txt` à mão: edite o `.in` e
  regenere com o comando do cabeçalho do lock (precisa do `uv`). Ver `docs/SETUP.md`.
- **Node:** `package-lock.json` por pacote (`frontend/`, `video-renderer/`). Use o
  npm que vem com o Node 24; um npm global mais antigo na frente do PATH quebra o
  `npm audit fix` (erro `edgesOut`).
- Atualização em lote, nunca bump por bump: skill `pr-bump`.
