"""Quando o MP4 de publicação pode ser apagado (D-512).

O `upload_ready/video.mp4` era removido assim que o upload do YouTube terminava.
A premissa era razoável enquanto o YouTube fosse o único destino: publicou,
o arquivo cumpriu o papel.

Com o TikTok (D-503/D-510) o MESMO arquivo tem um segundo destino. Apagar depois
do primeiro upload publica num e inviabiliza o outro — e não há como refazer sem
render novo. Foi o que aconteceu em produção.

## Por que a decisão mora aqui, e não no serviço de retenção

Ela não é sobre disco, é sobre CONTRATO: "este arquivo ainda tem trabalho a
fazer?". Enterrada dentro do `aplicar_apos_upload`, a regra fica invisível para
quem adiciona o terceiro destino amanhã — e o Instagram vai ser o terceiro.
Aqui ela é uma função com nome, e o teste dela é o que impede a regressão voltar.

## Por que o default é PRESERVAR

Um destino que o operador nunca marcou como publicado é indistinguível de um
destino ainda pendente. Diante da dúvida, o arquivo fica: disco a mais é um
incômodo, arquivo a menos é um re-render. A limpeza terminal da biblioteca
continua podendo apagar tudo — ali o operador está dizendo explicitamente que
acabou.

Sem I/O.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DestinoDoCorte:
    """Um destino do vídeo horizontal e se ele já recebeu o arquivo."""

    nome: str
    publicado: bool
    """`False` cobre dois casos que a retenção trata igual: ainda não foi, e não
    se sabe. Os dois preservam o arquivo."""


@dataclass(frozen=True)
class Veredito:
    """Se dá para apagar o MP4, e o que sustenta a resposta."""

    liberado: bool
    pendentes: tuple[str, ...]

    @property
    def motivo(self) -> str:
        """Frase pronta para o log e para a tela.

        O motivo viaja junto porque "não apaguei" sem explicação vira suspeita
        de bug — e a suspeita anterior custou um arquivo apagado antes da hora.
        """
        if self.liberado:
            return "todos os destinos publicados"
        return f"ainda falta publicar em: {', '.join(self.pendentes)}"


def pode_apagar_o_mp4(destinos: list[DestinoDoCorte]) -> Veredito:
    """Se o `upload_ready/video.mp4` já cumpriu o papel em TODOS os destinos.

    Lista vazia NÃO libera: um corte sem destino conhecido é um corte que ainda
    não foi a lugar nenhum, e apagar o arquivo dele seria o pior caso possível —
    perder o material antes da primeira publicação.

    Exemplos:
        >>> yt = DestinoDoCorte("YouTube", publicado=True)
        >>> tk = DestinoDoCorte("TikTok", publicado=False)
        >>> pode_apagar_o_mp4([yt, tk]).liberado
        False
        >>> pode_apagar_o_mp4([yt, tk]).pendentes
        ('TikTok',)
        >>> pode_apagar_o_mp4([yt, DestinoDoCorte("TikTok", publicado=True)]).liberado
        True
        >>> pode_apagar_o_mp4([]).liberado
        False
        >>> pode_apagar_o_mp4([]).motivo
        'ainda falta publicar em: nenhum destino conhecido'
    """
    if not destinos:
        return Veredito(liberado=False, pendentes=("nenhum destino conhecido",))

    pendentes = tuple(destino.nome for destino in destinos if not destino.publicado)
    return Veredito(liberado=not pendentes, pendentes=pendentes)


@dataclass(frozen=True)
class GuardaDoFire:
    """O que a limpeza do projeto poupa de UM corte (RN-15)."""

    bruto: bool
    shorts: bool
    mp4: bool


NADA_GUARDADO = GuardaDoFire(bruto=False, shorts=False, mp4=False)


def o_que_o_fire_guarda(
    *,
    e_fire: bool,
    tem_bruto: bool,
    shorts_finalizados: bool,
    destinos: list[DestinoDoCorte],
) -> GuardaDoFire:
    """RN-15: a mídia que um corte Fire ainda precisa para publicar os shorts (D-598).

    O Fire guarda o bruto porque é dele que os shorts nascem, os shorts já
    renderizados porque ainda vão subir, e o MP4 horizontal enquanto algum
    destino não publicou (RN-16). Deixa de guardar quando o operador marca os
    shorts como finalizados — ele está dizendo que já subiu tudo — e quando o
    bruto já não existe: sem bruto não há fábrica de shorts a proteger.

    Mora no domínio desde o D-710; antes a decisão estava misturada com a
    varredura de disco no serviço de retenção.

    Exemplos:
        >>> yt = DestinoDoCorte("YouTube", publicado=True)
        >>> o_que_o_fire_guarda(e_fire=True, tem_bruto=True, shorts_finalizados=False, destinos=[yt])
        GuardaDoFire(bruto=True, shorts=True, mp4=False)
        >>> o_que_o_fire_guarda(e_fire=True, tem_bruto=True, shorts_finalizados=True, destinos=[])
        GuardaDoFire(bruto=False, shorts=False, mp4=False)
    """
    if not (e_fire and tem_bruto) or shorts_finalizados:
        return NADA_GUARDADO
    return GuardaDoFire(bruto=True, shorts=True, mp4=not pode_apagar_o_mp4(destinos).liberado)
