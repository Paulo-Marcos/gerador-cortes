# Segurança

## Como reportar uma vulnerabilidade

**Não abra issue pública.** Use o reporte privado do GitHub:
**Security → Report a vulnerability**
([link direto](https://github.com/Paulo-Marcos/gerador-cortes/security/advisories/new)).
O aviso chega só ao mantenedor.

Conte o que encontrou, como reproduzir e o que alguém conseguiria fazer com isso.
O CutCut é mantido por uma pessoa no tempo livre: a resposta vem assim que possível,
sem prazo garantido.

## Versões com correção

Só a **última release** recebe correção de segurança. Atualize antes de reportar,
se puder ([docs/SETUP.md](docs/SETUP.md#7-atualizar-sem-perder-dados)).

## O que o app assume

O CutCut é um app **local, de uma pessoa**, sem login: quem alcança a API pode
fazer tudo que a tela faz — inclusive publicar na conta do YouTube conectada.
A proteção é ninguém mais alcançá-la.

- **Use numa máquina e numa rede em que você confia.**
- **Segredos ficam na sua máquina** e fora do git: `backend/.env` (chaves de API),
  `client_secrets.json` (a credencial do app no Google) e o `token.json` de cada
  canal (o login do YouTube). Se um deles vazar, revogue na origem (Google Cloud,
  Google AI Studio, HuggingFace) e gere outro.
- **Limitação conhecida (D-745):** hoje o backend escuta em todas as interfaces de
  rede e aceita requisições de qualquer origem. Enquanto isso não for corrigido,
  um aparelho na mesma rede — ou uma página aberta no seu navegador — pode chamar a
  API local. Evite rodar o app em rede pública.
