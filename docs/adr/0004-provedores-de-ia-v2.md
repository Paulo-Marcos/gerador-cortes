# ADR-0004: Provedores de IA v2

- **Status:** Aceito
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Substitui:** [ADR-0001](0001-estrategia-provedores-ia.md)

## Contexto

O ADR-0001 descrevia o n8n como provedor ativo de quatro fases e citava um
`infrastructure/n8n_client.py` que não existe mais. O n8n saiu do código (D-344):
não há cliente, e as variáveis `N8N_*` antigas são ignoradas por `app/config.py`.
Enquanto isso, a IA de texto passou a rodar por dois CLIs que usam a **assinatura**
do operador, e as skills editoriais foram para o banco, por canal (ADR-0011).

Para uma release pública, depender de duas assinaturas pessoais é a maior barreira
de entrada: quem instala precisa ter as duas, e o próprio cliente do Antigravity
registra risco de termos de uso.

## Decisão

A IA atende por **provedor**, escolhido por geração:

| Provedor | Como | Onde |
|---|---|---|
| `claude` | Claude CLI (`claude -p`), assinatura do operador | `infrastructure/claude_cli_client.py` |
| `gemini` | Antigravity CLI (`agy -p`), assinatura do operador | `infrastructure/antigravity_cli_client.py` |
| `claude`, pela chave | API da Anthropic, com a chave do operador (BYOK, D-720) | `infrastructure/anthropic_api_client.py` |
| manual | o prompt é copiado e a resposta colada na tela | `domain/compartilhado/manual_prompt.py` |

O tipo `ProviderIA` (`"claude" | "gemini"`) vive em `app/domain/compartilhado/provider_ia.py`. A API do
Gemini (`infrastructure/gemini_client.py`) continua servindo cenas, desvios e
thumbnails. **O modo manual é o mínimo funcional sem assinatura nenhuma**: todo
fluxo de IA precisa ter esse caminho.

**O n8n está removido formalmente.** A pasta `n8n-workflows/` é legado.

## Consequências

- Quem não tem assinatura usa o modo manual: funciona, mas é mais trabalhoso.
- **Chave de API (BYOK, D-720).** Entrou como um segundo *transporte* do provedor
  `claude`, e não como um terceiro provedor: a skill, o modelo (`opus`/`sonnet`/
  `haiku`, traduzidos para os ids da API), o selo na tela e os botões continuam os
  mesmos. A escolha é da instalação, no `backend/.env`: `IA_CLAUDE_TRANSPORTE=api` e
  `IA_ANTHROPIC_API_KEY`. Só a escolha explícita liga a API — a presença de um
  `ANTHROPIC_API_KEY` no ambiente não liga nada, porque outra ferramenta pode tê-lo
  exportado (a máquina de produção tem um, sem créditos). O padrão segue sendo a
  assinatura. O Gemini continua só pelo `agy`.
- Documentos e docstrings não descrevem mais o Claude como "alternativo ao n8n".

## Alternativas consideradas

- **Manter o n8n como opcional:** sem cliente e sem ninguém usando, seria
  documentar algo que não existe.
- **Exigir chave de API desde já:** troca a barreira da assinatura pela do custo
  por uso, e ainda não existe; fica para a E-056.

## Gatilho de revisão

Quando o provedor BYOK (E-056) entrar, ou se um dos CLIs mudar os termos de uso de
forma que impeça o uso automatizado.
