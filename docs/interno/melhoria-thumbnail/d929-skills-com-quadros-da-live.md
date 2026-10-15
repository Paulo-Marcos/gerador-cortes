# D-929 — Skills de capa com quadros da live (texto proposto, não aplicado)

As três skills de capa vivem no banco de cada canal e **não viajam no deploy**.
Nada aqui foi gravado na PROD: são as trocas propostas, para o Paulo aplicar
pela tela de Canais quando a D-929 estiver na PROD.

## O que já funciona sem tocar nas skills

O código cobre o essencial sozinho, nos dois caminhos:

- O bloco `MODO DA CAPA: apresentador` (gerado pelo app, viaja no deploy) agora
  diz ao Capista que o robô anexa quadros da live no momento da frase e pede a
  cara do apresentador numa linha própria, `EXPRESSION (host): ...`.
- Com quadros, o robô reescreve o prompt antes de mandar
  (`chatgpt_imagem.prompt_com_quadros`): a linha `EXPRESSION (host):` passa a
  apontar para os quadros, e o trecho "ignore their facial expressions" vira
  "take his facial expression from them too". O pedido final diz que identidade
  **e** expressão vêm dos quadros.
- Sem quadros (frase não achada, sem bruto, sem rosto vivo), o prompt e os
  anexos são os de antes: o banco de fotos, com a expressão escrita pelo Capista.

As trocas abaixo alinham o corpo das skills com isso — sobretudo nas duas
verticais, que escrevem um parágrafo corrido e espalham a cara do apresentador
no meio dele, onde o robô não consegue trocá-la.

Regra mantida: direção genérica, sem lista de expressões de exemplo.

---

## 1. `thumbnail-prompt-expert` — seção "MODO apresentador"

**Trocar** o item "As fotos são referência de IDENTIDADE, não de expressão" por:

> - **As referências do apresentador.** O robô anexa quadros da própria live no
>   momento em que ele diz a frase da capa; quando não os acha, as fotos do
>   banco. Você não sabe qual dos dois vai: escreva o rosto pelo clima do corte,
>   como sempre, na linha `EXPRESSION (host):` e só nela. É essa linha que o
>   robô troca pela expressão real dos quadros quando eles vão. Em nenhum outro
>   bloco (MAIN CHARACTER, HOST ACTION AND SCALE) descreva a cara dele: lá vão
>   corpo, gesto, roupa e lugar no quadro.

**No §13, bloco MAIN CHARACTER (MODO apresentador)**, apagar o colchete final
`[microexpressão física que o corte realmente tem]` — a expressão mora na linha
abaixo.

**No §13, logo depois de `EXPRESSION (Sapo): ...`**, acrescentar:

> No MODO apresentador esta linha se escreve `EXPRESSION (host): ...`, com esse
> rótulo exato: é por ele que o robô a encontra.

## 2. `capa-tiktok-imagem-expert` — item "MODO apresentador"

**Trocar** o trecho que começa em "**A expressão dele vem do clima do corte**"
e termina em "`...ignore their facial expressions`." por:

> **A expressão dele vem do clima do corte**, nunca de um papel fixo de
> comentarista. Uma sobrancelha erguida com meio-sorriso de canto está proibida
> nele. O robô anexa quadros da própria live no momento da frase e, quando não
> os acha, as fotos do banco: por isso a cara dele vai **fora do parágrafo**,
> numa linha própria logo depois dele, começando por `EXPRESSION (host):` — com
> os quadros, o robô troca essa linha pela expressão real deles. No parágrafo,
> descreva o apresentador pelo corpo, pelo gesto e pelo lugar no quadro, nunca
> pelo rosto, e escreva `use the reference photos only for identity, ignore
> their facial expressions` (vale para o banco; com os quadros, o robô inverte).

**Na seção do formato da resposta**, acrescentar ao "Apenas o prompt final, em
inglês, em um parágrafo": "— no MODO apresentador, seguido da linha
`EXPRESSION (host): ...`".

## 3. `capa-short-imagem-expert` — item "MODO apresentador"

**Trocar** o mesmo trecho (de "**A expressão dele vem do clima do corte**" até
"`...ignore their facial expressions`.") pelo texto do item 2, e acrescentar ao
formato da resposta ("o prompt em inglês e nada mais"): "— no MODO apresentador,
seguido da linha `EXPRESSION (host): ...`".

---

## Como conferir depois de aplicar

1. Com o canal no modo apresentador, gere o prompt das três capas de um corte
   cujo bruto esteja em disco.
2. Cada prompt traz a linha `EXPRESSION (host): ...` separada, e o rosto do
   apresentador não aparece descrito em outro lugar.
3. Peça a imagem: na Fila, o passo "Tirando quadros do apresentador no vídeo"
   aparece antes de "Abrindo o projeto no ChatGPT", e a conversa no ChatGPT tem
   três anexos `quadro-da-live-N.jpg` no lugar das grades.
