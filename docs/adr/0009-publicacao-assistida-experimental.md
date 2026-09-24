# ADR-0009: Publicação assistida no TikTok e no Instagram é experimental

- **Status:** Aceito
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos

## Contexto

O upload no TikTok e no Instagram pilota o **Chrome logado do operador** por CDP
(Playwright): a camada comum é `services/navegador_assistido.py`, e cada plataforma
tem o seu roteiro (`services/tiktok_studio.py`, `services/instagram_reels.py`). É
frágil por natureza: quebra quando a plataforma muda a tela, e automatizar o site
de outra empresa tem risco de termos de uso.

## Decisão

A publicação assistida **fica disponível na release, marcada como experimental**.

Limites que valem sempre:

- **O app nunca sabe senha.** A sessão é a do Chrome do operador; nada guarda
  credencial, e a camada do navegador não conhece login por construção.
- **Por padrão o robô prepara e para**: no TikTok, quem clica em Publicar é o
  operador. No Instagram, publicar sozinho é uma escolha explícita no modal de
  publicação em lote (`publicar_sozinho`), **desligada por padrão**.
- Um Reel só conta como publicado com a **confirmação visível** na tela; na dúvida,
  fica como não publicado — marcar no escuro liberaria a limpeza do MP4 (RN-16).

## Consequências

- A documentação avisa que é experimental: pode parar de funcionar a cada mudança
  de interface da plataforma. **A tela ainda não avisa** — um selo "experimental"
  nos botões de publicação assistida é trabalho pendente, não parte desta decisão.
- A porta de depuração do Chrome é derivada do caminho do perfil
  (`domain/publicacao/tiktok_studio.py`, `porta_de_depuracao`): duas instalações na mesma
  máquina não pilotam o navegador uma da outra.

## Alternativas consideradas

- **Desligado por padrão, com opt-in:** mais conservador, mas exige uma chave nova
  e tira de quem instala algo que já funciona.
- **Fora da release pública:** mais seguro para terceiros, ao custo de perder a
  funcionalidade.
- **API oficial das plataformas:** exige aprovação de aplicativo; fica como caminho
  quando houver.

## Gatilho de revisão

Uma mudança de termos de uso que proíba a automação, quebras frequentes que tornem a
manutenção cara, ou acesso à API oficial.
