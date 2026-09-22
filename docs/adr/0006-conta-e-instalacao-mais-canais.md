# ADR-0006: "Conta" = uma instalação local com canais

- **Status:** Aceito
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Relacionado:** ADR-0005 (persistência multicanal)

## Contexto

A release pública precisa responder "como outra pessoa cria a conta dela". O app é
local, de um operador, e não tem login nem isolamento entre pessoas.

## Decisão

**Uma pessoa = uma instalação.** Dentro dela, cada **canal** tem uma pasta em
`instance/channels/<canal>/` (banco de dados, mídias, tema, mascote e credenciais do
YouTube próprios) e as suas linhas no `settings.db` (identidade, skills e ajustes). "Criar a conta" é instalar o app e criar
o primeiro canal pela tela de Canais.

**Multiusuário, login e SaaS estão fora do escopo.**

## Consequências

- Não há cadastro, senha nem permissão por pessoa: quem abre o app usa todos os
  canais daquela instalação.
- Duas pessoas na mesma máquina = duas instalações.
- Trocar de canal exige reiniciar (ADR-0005).

## Alternativas consideradas

- **Multiusuário com login:** exigiria autenticação, isolamento de dados e
  permissões para um cenário que ninguém pediu.

## Gatilho de revisão

Um pedido real de uso compartilhado da mesma instalação por pessoas diferentes.
