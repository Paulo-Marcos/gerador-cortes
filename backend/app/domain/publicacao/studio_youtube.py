"""O que o robô faz no YouTube Studio depois do upload pela API (D-895).

A Data API sobe o vídeo, mas três coisas do canal ficam fora dela: a monetização
(`monetizationDetails` é só de "content owner", e os padrões de envio do Studio
valem só para quem sobe pelo navegador — medido: o vídeo da API chega com a
monetização desligada mesmo com o padrão ligado) e o "vídeo relacionado" do
Short. Quem faz é o robô, na janela logada do operador.

RN-27: o robô só toca em vídeo que o app ACABOU de subir, e só com o interruptor
do canal ligado. O relacionado do short é o corte de onde ele saiu — short cujo
corte ainda não está no YouTube sobe sem relacionado, e não com um qualquer.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace

from app.domain.publicacao.youtube_urls import extract_youtube_video_id

URL_DO_STUDIO = "https://studio.youtube.com"
# A sessão caiu: o Studio manda para o login do Google em vez de abrir o vídeo.
TRECHO_DO_LOGIN = "accounts.google.com"


def url_da_monetizacao(video_id: str) -> str:
    return f"{URL_DO_STUDIO}/video/{video_id}/monetization"


def url_da_edicao(video_id: str) -> str:
    return f"{URL_DO_STUDIO}/video/{video_id}/edit"


def id_do_video(url_ou_id: str) -> str:
    """O id de 11 caracteres de um link do YouTube; "" quando não há (ou não é).

    "" e não erro: o link do corte longo é opcional — short de corte que ainda
    não subiu não tem relacionado, e isso não é falha de ninguém.

    >>> id_do_video("https://youtu.be/abcdefghijk")
    'abcdefghijk'
    >>> id_do_video("")
    ''
    >>> id_do_video("https://exemplo.com/x")
    ''
    """
    try:
        return extract_youtube_video_id(url_ou_id)
    except ValueError:
        return ""


def esta_monetizado(texto_do_seletor: str) -> bool:
    """O seletor de monetização já diz "Ativada"? (pt-BR e inglês)

    >>> esta_monetizado("Monetização Ativada")
    True
    >>> esta_monetizado("Desativada")
    False
    >>> esta_monetizado("Monetization On")
    True
    >>> esta_monetizado("Monetization")
    False
    """
    # Por palavra: "Monetization" termina em "on", e "Desativada" contém "ativada".
    palavras = set(re.findall(r"\w+", texto_do_seletor.lower()))
    return bool(palavras & {"ativada", "on"}) and not palavras & {"desativada", "off"}


@dataclass(frozen=True)
class TarefaNoStudio:
    """O que fazer com UM vídeo no Studio."""

    video_id: str
    monetizar: bool = False
    relacionado: str = ""
    """O id do vídeo longo a ligar ao short; "" não liga nada."""

    @property
    def vazia(self) -> bool:
        return not self.monetizar and not self.relacionado


def tarefa_do_upload(
    video_id: str, *, relacionado: str, monetizar: bool, relacionar: bool
) -> TarefaNoStudio:
    """A tarefa de um upload recém-feito, já filtrada pelos interruptores do canal.

    >>> tarefa_do_upload("a" * 11, relacionado="b" * 11, monetizar=True, relacionar=False)
    TarefaNoStudio(video_id='aaaaaaaaaaa', monetizar=True, relacionado='')
    >>> tarefa_do_upload("a" * 11, relacionado="a" * 11, monetizar=False, relacionar=True).vazia
    True
    """
    # Um vídeo relacionado a si mesmo seria um link para onde o espectador já está.
    ligar = relacionar and relacionado and relacionado != video_id
    return TarefaNoStudio(video_id, monetizar, relacionado if ligar else "")


def juntar(tarefas: list[TarefaNoStudio]) -> list[TarefaNoStudio]:
    """Uma tarefa por vídeo, na ordem de chegada — o mesmo vídeo duas vezes vira uma visita.

    >>> a = TarefaNoStudio("a" * 11, monetizar=True)
    >>> juntar([a, TarefaNoStudio("a" * 11, relacionado="b" * 11), a])
    [TarefaNoStudio(video_id='aaaaaaaaaaa', monetizar=True, relacionado='bbbbbbbbbbb')]
    """
    por_video: dict[str, TarefaNoStudio] = {}
    for tarefa in tarefas:
        anterior = por_video.get(tarefa.video_id)
        if anterior is None:
            por_video[tarefa.video_id] = tarefa
            continue
        por_video[tarefa.video_id] = replace(
            anterior,
            monetizar=anterior.monetizar or tarefa.monetizar,
            relacionado=tarefa.relacionado or anterior.relacionado,
        )
    return [t for t in por_video.values() if not t.vazia]
