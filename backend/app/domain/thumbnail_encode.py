"""Preparo da capa para o YouTube: caber no limite perdendo o mínimo possível.

O YouTube aceita thumbnail de até 2 MB. As capas do canal saem do gerador em PNG
de 1672x941 pesando 2,5-3,3 MB — ou seja, TODAS precisam ser convertidas. O que
existia antes salvava com `Image.save("JPEG", quality=92)` e o resultado era pior
do que precisava por um detalhe invisível no código: o padrão do PIL é subsampling
de croma **4:2:0**, que descarta 3/4 da informação de COR.

Numa foto isso quase não aparece. Numa capa editorial — texto grande em cor
saturada, com contorno, sobre fundo escuro — aparece muito: a borda colorida do
texto é exatamente informação de croma de alta frequência.

Medido numa capa real (1672x941), comparando contra o PNG original:

    q92 4:2:0 (o que era feito)   525 KB   34,6 dB
    q98 4:2:0                     948 KB   36,2 dB
    q95 4:4:4                     907 KB   41,3 dB   <-- escolhido

Quase 7 dB de ganho usando menos da metade do orçamento de 2 MB. Subir a
qualidade sem corrigir o croma renderia menos de 2 dB pelo dobro do tamanho: o
gargalo era o subsampling, não o fator de qualidade.

Reduzir para 1280x720 antes de comprimir PIORA (34,4 dB) — o YouTube reescala
melhor a partir do original do que nós entregando já reduzido.
"""

from __future__ import annotations

import io

from PIL import Image

LIMITE_YOUTUBE_BYTES = 2_000_000

# Da melhor para a pior. A primeira que couber vence — com 4:4:4 a q95 já sobra
# espaço, então na prática as demais só existem para capas atipicamente pesadas.
_QUALIDADES = (95, 92, 88, 84, 80, 75, 70, 60, 50)

_ASSINATURAS = (
    (b"\xff\xd8", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"RIFF", "image/webp"),
)


def detectar_mimetype(dados: bytes) -> str:
    """Mimetype pelo CONTEÚDO, não pela extensão.

    As capas eram gravadas como `thumbnail.jpg` contendo PNG e enviadas ao
    YouTube declarando `image/jpeg` — o arquivo dizia uma coisa e o cabeçalho
    outra.
    """
    for assinatura, mime in _ASSINATURAS:
        if dados.startswith(assinatura):
            return mime
    return "application/octet-stream"


def _codificar(imagem: Image.Image, qualidade: int) -> bytes:
    buffer = io.BytesIO()
    # subsampling=0 é 4:4:4 — croma na resolução total.
    imagem.save(buffer, "JPEG", quality=qualidade, optimize=True, subsampling=0)
    return buffer.getvalue()


def preparar_para_youtube(
    dados: bytes, limite: int = LIMITE_YOUTUBE_BYTES
) -> tuple[bytes, str, str]:
    """Devolve `(bytes, mimetype, o_que_foi_feito)` prontos para o upload.

    Quando a imagem já cabe no limite ela passa INTACTA — reencodar um PNG que
    cabia só jogaria qualidade fora. Só acima do limite há conversão, sempre em
    4:4:4, pela melhor qualidade que couber.

    É MELHOR ESFORÇO, não garantia: nunca redimensiona, porque reduzir antes de
    enviar piora o resultado (o YouTube reescala melhor a partir do original).
    Com capa real e os 2 MB do YouTube isso é teórico — a q95 sobra espaço.
    """
    if len(dados) <= limite:
        return dados, detectar_mimetype(dados), "original preservado (já cabia no limite)"

    with Image.open(io.BytesIO(dados)) as aberta:
        imagem = aberta.convert("RGB")

    for qualidade in _QUALIDADES:
        convertido = _codificar(imagem, qualidade)
        if len(convertido) <= limite:
            return (
                convertido,
                "image/jpeg",
                f"convertido para JPEG q{qualidade} 4:4:4",
            )

    # Nem a pior qualidade em 4:4:4 coube: só aqui o croma é sacrificado, porque
    # a alternativa seria não ter capa nenhuma.
    buffer = io.BytesIO()
    imagem.save(buffer, "JPEG", quality=50, optimize=True)
    return buffer.getvalue(), "image/jpeg", "convertido para JPEG q50 4:2:0 (último recurso)"
