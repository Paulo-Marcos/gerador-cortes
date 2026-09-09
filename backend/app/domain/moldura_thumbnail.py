"""A moldura do canal colada na capa do YouTube.

## Por que a moldura é um ARQUIVO, e não código

A primeira versão desenhava o contorno por código — ruído procedural gerando a
borda rasgada, rasterizado pelo Remotion. Funcionava, e era a escolha errada:
custava ~40s por capa (bundle + still), e cada ajuste de espessura ou cor virava
uma tarefa de programação.

A moldura é uma peça de ARTE, e o operador já tem a dele. Recebendo o PNG com
alfa, o trabalho inteiro vira `alpha_composite`: milissegundos, sem Node, sem
bundle. E trocar a moldura do canal passa a ser trocar um arquivo — que é como
uma decisão editorial deve se comportar.

## Por que a margem transparente é aparada

O PNG entregue tinha 10-29px de nada em volta da faixa. Colado como veio, a capa
aparecia POR FORA da moldura — uma tira de imagem além da borda, que denuncia a
colagem. Aparar faz a faixa encostar no limite do quadro.

O aparo é medido no ALFA da própria moldura, não fixado aqui. Outra moldura, com
outra margem, se ajusta sozinha — nenhum número deste módulo precisa mudar.

E se aparasse por alfa > 0, nada seria cortado: há respingos quase invisíveis
tocando as bordas. Daí o limiar — é ele que separa "tinta" de "poeira do PNG".

## Por que a moldura depende das marcas do corte

Fire e Leitura já mudavam a capa: são eles que põem 🔥 e 📖 no texto
(`reading_metadata.aplicar_emojis_texto_capa`). A moldura passa a ler o MESMO
par — o emoji diz o que é aquele corte em cima da imagem, e a moldura diz a
mesma coisa em volta dela. Inventar um terceiro critério faria a capa contradizer
o próprio texto.

## Por que a preferência é uma LISTA, e não um nome

Um canal pode ter só a moldura padrão. Pedindo `thumb_fire.png` e não achando,
a resposta certa não é publicar capa crua — é usar a padrão. Por isso a escolha
devolve os nomes em ordem de preferência, e quem resolve caminhos fica com a
tarefa de achar o primeiro que existe.

## Por que a arte NÃO recua

A tentação era encolher a capa para a moldura não cobrir nada dela. Foi testado
e produziu um defeito pior: existem colunas onde a moldura não tem tinta alguma
(as quinas comidas), e ali o recuo revelava o fundo — uma tarja preta entre a
faixa e a imagem. A capa vai inteira, borda a borda, e a faixa passa por cima
dos ~1% externos. Perde-se margem, não conteúdo.
"""

from __future__ import annotations

import io

from PIL import Image

# Abaixo disto o pixel é resíduo do PNG, não desenho. Medido na moldura real:
# com limiar 1 o aparo não corta nada (há respingos de alfa ~2 na borda); de 25
# em diante a caixa estabiliza, então o valor não é um ajuste fino de gosto.
LIMIAR_DE_APARO = 25

# Qualidade do JPEG quando a capa que entrou era JPEG. Espelha a decisão de
# `thumbnail_encode`: 4:4:4 (subsampling=0), porque o dano do croma 4:2:0 cai
# justamente na borda colorida de texto — e agora também no fio da moldura.
_QUALIDADE_JPEG = 95

ARQUIVO_PADRAO = "thumb_padrao.png"

# O nome usado antes de existirem as quatro variantes. Continua aceito no fim da
# fila para não apagar a moldura de um canal que ainda tenha só o arquivo antigo.
ARQUIVO_LEGADO = "thumbnail.png"

# As quatro molduras, indexadas pelo MESMO par de marcas que decide os emojis do
# texto de capa: (é Fire?, é Leitura?).
_POR_MARCAS = {
    (False, False): ARQUIVO_PADRAO,
    (True, False): "thumb_fire.png",
    (False, True): "thumb_livro.png",
    (True, True): "thumb_fire_livro.png",
}


def arquivos_da_moldura(is_fire: bool, is_leitura: bool) -> tuple[str, ...]:
    """Os nomes de moldura aceitáveis para o corte, do melhor para o pior.

    A exata primeiro; a padrão como rede (canal que só tem uma moldura ainda
    emoldura); o nome legado por último. Quem chama usa a primeira que existir
    em disco — e capa crua só quando nenhuma existir.
    """
    exata = _POR_MARCAS[(bool(is_fire), bool(is_leitura))]
    # `dict.fromkeys` remove a repetição preservando a ordem: para o corte
    # padrão, `exata` JÁ É a padrão, e a lista não deve trazê-la duas vezes.
    return tuple(dict.fromkeys((exata, ARQUIVO_PADRAO, ARQUIVO_LEGADO)))


def aparar_margem(moldura: Image.Image) -> Image.Image:
    """A moldura sem o vazio em volta do desenho."""
    tinta = moldura.getchannel("A").point(lambda v: 255 if v >= LIMIAR_DE_APARO else 0)
    caixa = tinta.getbbox()
    return moldura.crop(caixa) if caixa else moldura


def emoldurar(arte: bytes, moldura: bytes) -> bytes:
    """A capa com a moldura colada, no MESMO formato em que ela chegou.

    A moldura é esticada para o tamanho da capa. As capas do canal saem em
    tamanhos diferentes (2752x1536, 1672x941, 928x522) e todas em 16:9, então o
    esticamento é de escala, não de proporção — e mesmo se não fosse, granulado
    não denuncia distorção do jeito que um rosto denunciaria.
    """
    with Image.open(io.BytesIO(arte)) as aberta:
        formato = aberta.format
        capa = aberta.convert("RGBA")

    with Image.open(io.BytesIO(moldura)) as aberta:
        contorno = aparar_margem(aberta.convert("RGBA")).resize(capa.size, Image.LANCZOS)

    emoldurada = Image.alpha_composite(capa, contorno)

    saida = io.BytesIO()
    if formato == "JPEG":
        emoldurada.convert("RGB").save(
            saida, "JPEG", quality=_QUALIDADE_JPEG, optimize=True, subsampling=0
        )
    else:
        # PNG cobre o resto (é o que o gerador de capas entrega) e preserva o
        # alfa se a capa tiver algum. WEBP e companhia caem aqui de propósito:
        # um formato desconhecido sai como PNG em vez de estourar.
        emoldurada.save(saida, "PNG", optimize=True)
    return saida.getvalue()
