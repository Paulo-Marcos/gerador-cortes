# ADR-0013: Herança de configuração visual (cascata parcial)

- **Status:** Aceito (retroativo)
- **Data:** 2026-09-22
- **Decisores:** Paulo Marcos
- **Relacionado:** RN-10, RN-11, RN-12 ([catálogo](../dominio/regras-de-negocio.md))

## Contexto

Layout do YouTube, palco dos shorts e aparência do gancho herdam de níveis acima:
o global vale para o projeto, o projeto para o corte, o corte para os seus shorts.
A regra que faz isso funcionar vivia só no código e na memória de quem o escreveu,
e foi fonte recorrente de defeitos (D-594, palco padrão).

## Decisão

1. **Chave ausente é o mecanismo de herança.** Um nível guarda **só o que ele
   decidiu**; o que não decidiu, herda do nível de cima.
2. **Os padrões se materializam na LEITURA, nunca ao gravar.** Gravar o valor
   herdado como se fosse próprio "congela" o nível: quando o de cima mudar, ele não
   acompanha mais. É a regra que mais quebra quando esquecida.
3. **A herança é viva**: o palco padrão do corte vale para os shorts dele enquanto
   eles não decidirem outro, região a região (RN-11).
4. **Aparência herda; texto nunca**: a cor, o realce, a fonte, o tamanho e a duração
   do gancho vêm do preset de gancho do corte (`''` ou `0` = usar o padrão); o texto
   do gancho é sempre de cada short (RN-12).

## Consequências

- Onde mora: `domain/youtube_layout.py` (`resolver_layout_em_cascata`,
  `normalizar_layout_youtube`), `services/palco_shorts.py` (`com_palco_do_corte`) e,
  no frontend, `resolveLayoutChain` em `features/editor/fase2/youtubeLayout.ts`.
- A cascata existe duas vezes (backend e frontend), e as duas precisam concordar.
- **Defeito conhecido que contraria a regra 2:** o PATCH do layout de um corte grava
  hoje o layout **normalizado completo**, com todas as chaves preenchidas (observado
  na D-657, num corte que só tinha `modo_padrao` e `regioes`). Depois disso esse corte
  deixa de herdar do projeto. Corrigir é gravar só as chaves que o operador mudou.

## Alternativas consideradas

- **Copiar o padrão para cada nível ao criar:** simples de ler, mas mata a herança —
  mudar o padrão global não alcança nada que já exista.

## Gatilho de revisão

A cascata precisar de um quarto nível, ou a duplicação entre backend e frontend
causar divergência (sinal de que ela deve vir pronta da API).
