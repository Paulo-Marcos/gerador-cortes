# D-602 — Dá para medir o lip-sync sozinho? (experimento, 15/09/2026)

Material: `instance/channels/default/projetos/0a20eb6f.../video.mkv` em PROD
(92 min, 1280x720, 30 fps, AV1 + Opus, ambos com `start_time=0.000`).

## Por que só sobrou leitura labial

Correlação cruzada alinha **dois sinais da mesma natureza** — é como se casa o
áudio da câmera com o da mesa de som. O `ffprobe` dos vídeos-fonte mostra **um**
stream de vídeo e **um** de áudio. Não existe segunda régua: a única testemunha
de quando a boca mexeu é a imagem.

Método testado: caixa do rosto via Haar (reusa `infrastructure/detector_rosto`),
variação de pixels no terço inferior da caixa (30 Hz) contra a variação da
energia RMS do áudio (30 Hz), correlação em ±1 s.

## 1. Controle — o método funciona?

Atraso **conhecido** injetado no áudio, para ver se é reencontrado:

| injetado | recuperado | erro na diferença |
|---------:|-----------:|------------------:|
| +0 ms    | −133 ms    | — |
| −300 ms  | −433 ms    | 0 ms |
| −100 ms  | −233 ms    | 0 ms |
| +100 ms  | −33 ms     | 0 ms |
| +300 ms  | +167 ms    | 0 ms |

Rastreamento **exato**, com viés constante de −133 ms (offset real desta janela
ou viés do método — indistinguível com uma amostra só).

## 2. Varredura — funciona no material REAL?

17 janelas de 20 s ao longo dos 92 min. Critério de confiança: `r >= 0.30`.

- **2 de 17 janelas utilizáveis** (r = 0,323 e 0,497 → −267 ms e −133 ms).
- 2 janelas **sem rosto nenhum** em quadro.
- As 13 restantes: r entre −0,005 e 0,26, com respostas espalhadas de −967 ms a
  +667 ms — várias no **trilho** de ±1 s, assinatura de "não achei pico".
- Medir a janela de 60 s **inteira** foi PIOR que as sub-janelas de 20 s: diluir
  o trecho falado em trechos mudos destrói o sinal.
- `pico/ruído` ficou em 5–6x tanto nas boas quanto nas ruins — **não serve** de
  critério de confiança. Só o `r` separa.

## 3. Resolução não era o gargalo

Suspeita: reduzir para 480x270 deixa a boca com ~20 px. Repetido com a boca
recortada em pixel nativo (108–136 px de largura): `r` = 0,323 e 0,497 — os
**mesmos** valores. O confundidor óbvio foi descartado; o sinal é fraco de fato.

## 4. Janelas faladas e banda de voz — as duas alavancas falharam

O VTT tem timestamp por **palavra** (11.553 no vídeo). Escolhidas as 15 janelas
de maior densidade de fala, e o áudio filtrado em 300–3400 Hz:

- **0 de 15** janelas confiáveis pelo critério `r >= 0.30` — pior que sortear.
- Filtrar a banda de voz não mudou praticamente nada (`r` idêntico até a 3ª casa).

Motivo provável: num canal de reação, a fala mais densa é a do vídeo reagido, e
aí o rosto em quadro não é o que está falando.

**Mas** os offsets se repetiam: −67, −100, −100, −167, −200, −100 ms, num espaço
de busca de ±1000 ms. O pico existe; está abaixo do ruído em cada janela isolada.

## 5. Empilhar as curvas — é isso que funciona

Em vez de votar no pico de cada janela, **somar as curvas de correlação**: o
ruído cancela, o pico compartilhado se reforça.

Controle com atraso injetado, sobre 26 janelas empilhadas (1 quadro = 33 ms):

| injetado | recuperado | erro |
|---------:|-----------:|-----:|
| −300 ms  | −367 ms | ≤1 quadro |
| −100 ms  | −167 ms | ≤1 quadro |
| +0 ms    | −67 ms  | ≤1 quadro |
| +100 ms  | +0 ms   | ≤1 quadro |
| +300 ms  | +200 ms | ≤1 quadro |

Convergência (40 sorteios por tamanho):

| janelas | desvio da estimativa |
|--------:|---------------------:|
| 3       | 309 ms |
| 5       | 291 ms |
| 8       | 222 ms |
| 12      | 114 ms |
| 18      |  58 ms |
| 26      |   0 ms |

Estimativa para este vídeo: **−67 ms ± 33 ms**. Custo medido: **~70 s** por
vídeo (26 janelas de 20 s, extração + Haar + correlação).

## 6. Por trecho: não dá

Empilhando por bloco de tempo:

| bloco | janelas | offset |
|-------|--------:|-------:|
| live inteira | 26 | −67 ms |
| 1ª metade | 16 | +33 ms |
| 2ª metade | 10 | −133 ms |
| 1º terço | 12 | −100 ms |
| 2º terço | 7 | +33 ms |
| 3º terço | 7 | −700 ms |

Os blocos discordam em até 166 ms entre metades — mas o desvio esperado com
10–13 janelas é ~110 ms, e com 7 passa de 220 ms. **A discordância não se
distingue do ruído.** Não dá para confirmar nem descartar deriva neste vídeo.

E o mais importante para o pedido: a estatística precisa de ~9 min de material
amostrado para convergir. **Um trecho tem segundos.** A técnica entrega UM número
por vídeo, não um por trecho.

## Veredito

**Viável** como estimativa única por vídeo: ±33 ms (um quadro), ~70 s de
processamento, sobre material sem rosto falando na maior parte do tempo.

**Inviável** por trecho, e inviável para detectar deriva fina: só deriva maior
que ~200 ms seria distinguível do ruído, e ainda assim por metades da live.

## O que ainda não foi tentado

1. **Landmarks labiais** (mediapipe/dlib) em vez de diferença bruta de pixels,
   que também captura mexida de cabeça, corte de câmera e overlay. É o maior
   ganho possível e o maior custo: dependência nova, com o opencv preso no 4.x
   por causa dos cascades Haar. Se a abertura da boca virasse um sinal limpo, o
   `r` por janela subiria e talvez dispensasse o empilhamento — o que reabriria
   a medição por trecho.
2. **Diarização (D-286)** para separar a fala do canal da fala do vídeo reagido,
   e só então escolher as janelas. A seleção por densidade de palavras falhou
   justamente por não fazer essa distinção.
3. **Vídeos de 60 fps**, onde o quadro vale 17 ms em vez de 33 ms.

Scripts reproduzíveis nesta pasta: `detectar.py` (controle inicial),
`deriva.py` (janelas e sub-janelas), `varredura.py` (17 janelas sorteadas),
`fullres.py` (boca em pixel nativo), `fala.py` (janelas faladas pelo VTT),
`janelas_faladas.py` (janelas faladas + banda de voz),
`extrair_sinais.py` + `empilhar.py` (empilhamento e controle),
`deriva_por_bloco.py` (deriva por bloco de tempo).
