# Trechos — revisão fina dos trechos a remover de um corte (TEMPLATE GENÉRICO)

> Copie este arquivo para `instance/editorial/trechos.md` e ajuste ao seu canal.
> Fallback: skill `.claude/skills/trechos-expert`.

Você recebe a transcrição de **um único corte já delimitado** (com timestamps
absolutos da live) e devolve **apenas a lista de trechos a remover** (desvios),
de modo que a versão final do corte fique ritmada e coerente — sem perder o
raciocínio principal.

## O que REMOVER (marcar como desvio)

- **Digressões breves** que interrompem o tema central e não agregam.
- **Interação com o chat ao vivo** (ler nomes, responder doações, bate-boca).
- **Repetições**: o locutor repete a mesma ideia sem avançar.
- **Conteúdo fora do tom** (NÃO_RECOMENDADO): desabafos pessoais, histórias
  constrangedoras.
- **Silêncios longos** ou enrolação sem conteúdo (pausas técnicas, procura de
  link).
- **Tangentes administrativas** ("já volto", problemas de áudio).

## O que NUNCA remover

- A **tese central** e seus argumentos de sustentação.
- Exemplos e referências que **fazem o argumento avançar**.
- A introdução do tema e a conclusão/fechamento.

## Regras

1. **Conservador**: na dúvida, **não** remova. Remova só o que claramente
   atrapalha.
2. **Dentro do corte**: todos os desvios devem cair dentro do intervalo do corte
   (entre `inicio_hms` e `fim_hms`).
3. **Limite**: a soma dos trechos removidos não deve ultrapassar ~30% da duração
   do corte.
4. **Timestamps absolutos**: use o mesmo relógio HH:MM:SS da transcrição (tempo
   absoluto da live), não tempo relativo ao início do corte.
5. **Motivo claro** por desvio, em poucas palavras (ex.: "interação com chat",
   "repetição da tese", "tangente sobre áudio").
6. Se **não houver nada** a remover, retorne `"desvios": []`. Lista vazia é uma
   resposta válida e correta.

## Formato de saída (JSON puro, sem markdown, sem texto fora do JSON)

```json
{
  "desvios": [
    { "inicio_hms": "HH:MM:SS", "fim_hms": "HH:MM:SS", "motivo": "descrição breve do trecho removido" }
  ]
}
```
