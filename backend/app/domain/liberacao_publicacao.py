"""Despublicar um destino: o caminho de volta que faltava (D-566).

Um corte subiu para o YouTube, o vídeo foi APAGADO de lá para ser reprocessado,
e o app continuou dizendo "publicado". Não por bug — por premissa: `publicado`
era um estado terminal, como carta posta no correio. Só que a carta pode ser
retirada do destino, e não havia vocabulário para dizer isso ao app.

Este módulo é o vocabulário. Ele responde a UMA pergunta, sem I/O:
**onde cada destino registra que já recebeu o vídeo?**

Com a resposta em forma de DADO — e não de `if` espalhado pelo serviço —
liberar um corte vira uma operação só, igual para todo destino, e o Instagram
(D-471) entra acrescentando uma linha no registro em vez de editar a regra.

Liberar é sobre a MEMÓRIA do app, não sobre a plataforma: nada aqui apaga vídeo
no YouTube nem mexe em arquivo. Quem apaga lá fora é o operador, na mão — e é
justamente por isso que o app precisa aceitar ser informado de que apagou.

Parente próximo: `domain/retencao_publicacao.py` responde "este arquivo já
cumpriu o papel em todos os destinos?". Os dois falam dos mesmos destinos por
ângulos opostos — um pergunta se pode esquecer, o outro desfaz a lembrança.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MarcaDePublicacao:
    """Os campos de `Corte` em que UM destino registra a publicação.

    `limpar` é um par campo→valor-de-vazio, e não uma lista de nomes, porque
    "não publicado" não tem uma representação só: o YouTube guarda strings
    (`""`), o TikTok guarda um carimbo de data (`None`). Deixar cada destino
    declarar o próprio vazio evita o serviço adivinhar pelo tipo do atributo.
    """

    destino: str
    rotulo: str
    limpar: tuple[tuple[str, object], ...]

    @property
    def campos(self) -> tuple[str, ...]:
        """Só os nomes — para quem precisa ler o estado antes de apagá-lo."""
        return tuple(campo for campo, _ in self.limpar)


# O YouTube guarda três marcas do mesmo evento: o id do vídeo (que é o que o
# upload consulta para se declarar idempotente), a URL (que é o que a tela
# mostra) e o agendamento. Liberar pela metade deixaria a tela e o backend
# discordando — o botão voltaria e o upload continuaria dizendo "já publicado".
DESTINOS: dict[str, MarcaDePublicacao] = {
    "youtube": MarcaDePublicacao(
        destino="youtube",
        rotulo="YouTube",
        limpar=(
            ("youtube_video_id", ""),
            ("youtube_url_publicado", ""),
            ("youtube_scheduled_at", ""),
        ),
    ),
    "tiktok": MarcaDePublicacao(
        destino="tiktok",
        rotulo="TikTok",
        limpar=(("tiktok_publicado_em", None),),
    ),
}


def marca_do_destino(destino: str) -> MarcaDePublicacao | None:
    """A marca de um destino, ou `None` se o nome não for conhecido.

    Tolerante com o que vem da tela (espaço, maiúscula), intolerante com o que
    não existe: destino desconhecido volta `None` para o chamador recusar com
    uma mensagem que lista os válidos, em vez de "liberar" nada silenciosamente.

    Exemplos:
        >>> marca_do_destino("YouTube ").rotulo
        'YouTube'
        >>> marca_do_destino("instagram") is None
        True
    """
    return DESTINOS.get((destino or "").strip().lower())


def destinos_conhecidos() -> tuple[str, ...]:
    """Os destinos que sabem ser liberados — para mensagens de erro e docs.

    Exemplos:
        >>> destinos_conhecidos()
        ('youtube', 'tiktok')
    """
    return tuple(DESTINOS)
