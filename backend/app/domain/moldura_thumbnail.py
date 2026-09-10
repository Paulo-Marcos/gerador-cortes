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

## Como a arte e a moldura dividem o quadro

A primeira versão colava a moldura POR CIMA da capa inteira, e a nota aqui dizia
que recuar a arte era pior — porque as quinas comidas da moldura deixavam
aparecer o fundo. Estava certo o diagnóstico e errada a conclusão: em produção a
faixa (uns 6% de espessura) comeu o "EU" de "EU MEREÇO", e perder uma palavra da
manchete é pior que qualquer coisa (D-556).

Hoje a capa recua para a JANELA da moldura, e o buraco das quinas é resolvido
com um fundo em vez de com a desistência: a própria capa, ampliada e borrada,
atrás de tudo. A moldura segue no limite do quadro; quem sai de baixo dela é a
arte. O detalhe de cada escolha está em `emoldurar`.
"""

from __future__ import annotations

import io

from PIL import Image, ImageFilter

# Abaixo disto o pixel é resíduo do PNG, não desenho. Medido na moldura real:
# com limiar 1 o aparo não corta nada (há respingos de alfa ~2 na borda); de 25
# em diante a caixa estabiliza, então o valor não é um ajuste fino de gosto.
LIMIAR_DE_APARO = 25

# Qualidade do JPEG quando a capa que entrou era JPEG. Espelha a decisão de
# `thumbnail_encode`: 4:4:4 (subsampling=0), porque o dano do croma 4:2:0 cai
# justamente na borda colorida de texto — e agora também no fio da moldura.
_QUALIDADE_JPEG = 95

# Raio do borrão do fundo, em fração da largura. O bastante para a tira lateral
# deixar de ser reconhecível como cópia da imagem, e pouco o bastante para as
# cores continuarem sendo as da capa.
_BORRAO_DO_FUNDO = 0.012

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


def nomes_das_molduras() -> tuple[str, ...]:
    """Os nomes que um canal precisa ter em `assets/moldura/`.

    Existe para que a mensagem mostrada ao operador saia DAQUI. Escrita à mão lá
    fora, ela vira uma segunda lista para manter — e a primeira moldura nova
    faria a tela ensinar um nome que o código não procura mais.
    """
    return tuple(dict.fromkeys(_POR_MARCAS.values()))


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


# Até onde vale procurar a faixa a partir de cada borda. Além de um quarto do
# lado não é mais moldura — é desenho que invadiu o meio da capa.
_ALCANCE_DA_BUSCA = 0.25


def _avanco_pela_esquerda(tinta: Image.Image) -> int:
    """Mediana de quão fundo a tinta chega, varrendo cada linha da esquerda.

    `getbbox()` de uma linha devolve o último pixel com tinta dela — o mesmo que
    varrer pixel a pixel, mas em C. Numa moldura de mil linhas isso é a
    diferença entre imperceptível e um segundo por capa.
    """
    largura, altura = tinta.size
    limite = max(1, int(largura * _ALCANCE_DA_BUSCA))
    profundidades = []
    for y in range(altura):
        caixa = tinta.crop((0, y, limite, y + 1)).getbbox()
        profundidades.append(caixa[2] if caixa else 0)
    profundidades.sort()
    return profundidades[len(profundidades) // 2]


def espessura_da_faixa(contorno: Image.Image) -> tuple[int, int]:
    """Quanto a moldura avança para dentro, em (horizontal, vertical).

    Medido NA moldura, não fixado aqui: outra arte, outra espessura, e o encaixe
    se ajusta sozinho.

    Usa a MEDIANA das profundidades, não o máximo. As hachuras de canto entram
    três vezes mais fundo que a faixa — pelo máximo, a arte recuaria o quadro
    inteiro por causa de quatro riscos. E não o mínimo, porque há linhas sem
    tinta nenhuma (as quinas comidas), que puxariam o recuo para zero e trariam
    de volta o problema que isto resolve.
    """
    tinta = contorno.getchannel("A").point(lambda v: 255 if v >= LIMIAR_DE_APARO else 0)
    # Cada lado vira "o lado esquerdo" por rotação: uma medição só, quatro usos.
    esquerda = _avanco_pela_esquerda(tinta)
    direita = _avanco_pela_esquerda(tinta.transpose(Image.ROTATE_180))
    topo = _avanco_pela_esquerda(tinta.transpose(Image.ROTATE_90))
    base = _avanco_pela_esquerda(tinta.transpose(Image.ROTATE_270))
    return max(esquerda, direita), max(topo, base)


def _fundo_borrado(capa: Image.Image) -> Image.Image:
    """A capa borrada, para ficar atrás da arte reduzida.

    Borra numa miniatura e reamplia, em vez de borrar o quadro inteiro: uma
    gaussiana de raio grande sobre 2752x1536 custa mais de um segundo, e o
    resultado de um borrão não distingue as duas rotas — é justamente a
    informação fina que ele existe para jogar fora.
    """
    largura, altura = capa.size
    escala = 8
    pequena = capa.resize((max(1, largura // escala), max(1, altura // escala)), Image.LANCZOS)
    raio = max(1.0, largura * _BORRAO_DO_FUNDO / escala)
    return pequena.filter(ImageFilter.GaussianBlur(raio)).resize(capa.size, Image.LANCZOS)


def _encaixar(capa: Image.Image, folga: tuple[float, float]) -> Image.Image:
    """A capa reduzida para dentro da janela da moldura, sobre o fundo borrado.

    `folga` é a espessura da faixa como FRAÇÃO de cada lado, não em pixels: a
    mesma moldura serve capas de 928 a 2752 de largura.
    """
    largura, altura = capa.size
    janela_larg = largura - round(folga[0] * largura) * 2
    janela_alt = altura - round(folga[1] * altura) * 2
    if janela_larg <= 0 or janela_alt <= 0:
        # Moldura tão grossa que não sobra janela: melhor a capa inteira por
        # baixo do que uma imagem de um pixel.
        return capa

    escala = min(janela_larg / largura, janela_alt / altura)
    reduzida = capa.resize(
        (max(1, round(largura * escala)), max(1, round(altura * escala))), Image.LANCZOS
    )
    tela = _fundo_borrado(capa)
    tela.paste(reduzida, ((largura - reduzida.width) // 2, (altura - reduzida.height) // 2))
    return tela


def emoldurar(arte: bytes, moldura: bytes) -> bytes:
    """A capa com a moldura colada, no MESMO formato em que ela chegou.

    ## Por que a arte recua em vez de ficar por baixo

    A faixa tem uns 6% de espessura, e o capista põe texto encostado na margem:
    colando por cima, a moldura comeu o "EU" de "EU MEREÇO" (D-556). Então a
    capa é reduzida até caber na JANELA da moldura — a moldura continua no
    limite do quadro, e é a arte que sai de baixo dela.

    ## Por que há a própria capa, borrada, no fundo

    Duas coisas exigem um fundo. A moldura tem quinas comidas — linhas inteiras
    sem tinta —, e sem nada atrás elas virariam tarja preta, o defeito que a
    primeira versão já cometera. E a janela é mais larga que a capa reduzida,
    então sobra uma tira nas laterais.

    O fundo é a própria capa ampliada e borrada. Nítida, a tira lateral viraria
    um fantasma da imagem deslocado alguns pixels — o olho pega na hora. Borrada,
    lê como sombra da arte, que é o que uma moldura de cartaz teria mesmo.

    ## Por que a redução é uniforme

    A janela é mais larga que 16:9 (a faixa de cima e de baixo é mais grossa em
    proporção). Esticar a capa até preenchê-la deformaria rostos; cortar para
    preencher comeria justamente o topo, onde o texto mora. Reduzir por igual e
    centralizar não faz nem uma coisa nem outra.
    """
    with Image.open(io.BytesIO(arte)) as aberta:
        formato = aberta.format
        capa = aberta.convert("RGBA")

    with Image.open(io.BytesIO(moldura)) as aberta:
        aparada = aparar_margem(aberta.convert("RGBA"))
        # A espessura sai medida no tamanho NATIVO da moldura e vira fração. Medir
        # depois de esticar para a capa custaria proporcional ao tamanho dela — e
        # a capa chega a 2752x1536, o que levava a colagem a quase dois segundos.
        faixa_x, faixa_y = espessura_da_faixa(aparada)
        folga = (faixa_x / aparada.width, faixa_y / aparada.height)
        contorno = aparada.resize(capa.size, Image.LANCZOS)

    emoldurada = Image.alpha_composite(_encaixar(capa, folga), contorno)

    saida = io.BytesIO()
    if formato == "JPEG":
        emoldurada.convert("RGB").save(
            saida, "JPEG", quality=_QUALIDADE_JPEG, optimize=True, subsampling=0
        )
    else:
        # PNG cobre o resto (é o que o gerador de capas entrega) e preserva o
        # alfa se a capa tiver algum. WEBP e companhia caem aqui de propósito:
        # um formato desconhecido sai como PNG em vez de estourar.
        #
        # Sem `optimize=True`: medido numa capa de 2752x1536, ele custava 4,7s
        # contra 0,8s para economizar 4% de bytes — e os dois tamanhos estouram
        # os 2 MB do YouTube do mesmo jeito, então a capa vira JPEG no upload
        # nas duas rotas. Era pagar cinco segundos por uma diferença que ninguém
        # chega a ver.
        emoldurada.save(saida, "PNG")
    return saida.getvalue()
