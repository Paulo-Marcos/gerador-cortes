"""A moldura do canal: qual cada corte merece.

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

O trabalho de imagem — aparar, medir a faixa e compor — está em
`infrastructure/imagem/moldura` (D-696).
"""

from __future__ import annotations

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
