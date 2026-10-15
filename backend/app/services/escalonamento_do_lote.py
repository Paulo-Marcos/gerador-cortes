"""A agenda do lote, calculada ANTES do clique (D-908).

O operador escolhe os trechos e as redes; esta previsão diz, item a item, em
que dia e hora cada um vai ao ar — e por quê, quando algum fica sem data. A
tela mostra a lista, ele ajusta uma linha se quiser e só então dispara o lote
com a agenda já decidida (`publicacao_lote.criar(agenda=...)`).

O que decide mora no domínio (`escalonamento.escalonar`); aqui só se juntam os
três ingredientes que ele não tem como buscar: a configuração do canal, o
último item já agendado naquela rede e o relógio.

Vale também para os horizontais (D-934): o lote do YouTube longo pede a agenda
dos cortes no destino `youtube` (`prever_youtube`), e o TikTok horizontal entra
pelo `prever`, na mesma fila dos shorts do TikTok.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.domain.publicacao.agendamento import HORIZONTE_EM_DIAS
from app.domain.publicacao.escalonamento import (
    FaixaDoPublico,
    destino_de,
    escalonar,
    intensidade_em,
)
from app.domain.publicacao.publicacao import Plataforma
from app.services import registro_do_lote
from app.services.canal import escalonamento_settings

PUBLICA_NO_ATO = "publica no ato: o Instagram não agenda pelo compositor da web"

# O formato que o `<input type="datetime-local">` da tela fala, no fuso local.
FORMATO_DA_TELA = "%Y-%m-%dT%H:%M"

# O vídeo horizontal do corte no YouTube. Não é uma `Plataforma` do lote de
# shorts: quem publica é o upload do YouTube; daqui sai só a agenda (D-934).
YOUTUBE_LONGO = "youtube"


@dataclass(frozen=True)
class LinhaDaAgenda:
    """Um item do lote com a data proposta — ou sem ela, com o motivo."""

    alvo_tipo: str
    alvo_id: str
    plataforma: str
    agendar_para: str
    """`AAAA-MM-DDTHH:MM` local, ou vazio."""
    intensidade: str
    """Força do público na hora proposta (forte/medio/fraco), ou vazio."""
    motivo: str
    """Por que não há data: fora do horizonte, ou destino que publica no ato."""

    def como_dict(self) -> dict:
        return {
            "alvo_tipo": self.alvo_tipo,
            "alvo_id": self.alvo_id,
            "plataforma": self.plataforma,
            "agendar_para": self.agendar_para,
            "intensidade": self.intensidade,
            "motivo": self.motivo,
        }


def _mesma_conta(plataforma: Plataforma) -> list[str]:
    """As plataformas que dividem a mesma fila de agendamento.

    O TikTok vertical e o horizontal vão para a MESMA conta, e um lote de um
    precisa partir do último do outro; cada uma das demais é a própria fila.
    """
    if plataforma in (Plataforma.TIKTOK, Plataforma.TIKTOK_HORIZONTAL):
        return [Plataforma.TIKTOK.value, Plataforma.TIKTOK_HORIZONTAL.value]
    return [plataforma.value]


async def prever(
    alvos: list[tuple[str, str]],
    plataformas: list[Plataforma],
    *,
    agora: datetime | None = None,
) -> list[LinhaDaAgenda]:
    """A data de cada (alvo, plataforma), na ordem da seleção, rede a rede."""
    agora = agora or datetime.now().astimezone()
    faixas = escalonamento_settings.resolver_referencia()
    linhas: list[LinhaDaAgenda] = []

    for plataforma in plataformas:
        destino = destino_de(plataforma.value)
        if destino is None:
            linhas.extend(
                LinhaDaAgenda(tipo, alvo, plataforma.value, "", "", PUBLICA_NO_ATO)
                for tipo, alvo in alvos
            )
            continue

        ultimo = await registro_do_lote.ultimo_agendado(_mesma_conta(plataforma))
        linhas.extend(_distribuir(alvos, plataforma.value, destino, ultimo, agora, faixas))
    return linhas


async def prever_youtube(
    alvos: list[tuple[str, str]], *, agora: datetime | None = None
) -> list[LinhaDaAgenda]:
    """A data de cada corte no YouTube longo, a partir do último do canal (D-934).

    Com um corte só, é o próximo horário livre da janela: a sugestão do envio
    avulso sai daqui também.
    """
    agora = agora or datetime.now().astimezone()
    faixas = escalonamento_settings.resolver_referencia()
    ultimo = await registro_do_lote.ultimo_no_youtube()
    return _distribuir(alvos, YOUTUBE_LONGO, YOUTUBE_LONGO, ultimo, agora, faixas)


def _distribuir(
    alvos: list[tuple[str, str]],
    plataforma: str,
    destino: str,
    ultimo: datetime | None,
    agora: datetime,
    faixas: tuple[FaixaDoPublico, ...] | list[FaixaDoPublico],
) -> list[LinhaDaAgenda]:
    """As linhas de UMA rede: o motor decide, aqui só se fala o formato da tela."""
    vagas = escalonar(
        len(alvos),
        escalonamento_settings.resolver_parametros(destino),
        agora=agora,
        ultimo=ultimo,
        horizonte_dias=HORIZONTE_EM_DIAS.get(plataforma),
    )
    linhas: list[LinhaDaAgenda] = []
    for (tipo, alvo), vaga in zip(alvos, vagas, strict=True):
        if vaga.agendamento is None:
            linhas.append(LinhaDaAgenda(tipo, alvo, plataforma, "", "", vaga.motivo))
            continue
        quando = vaga.agendamento.quando
        linhas.append(
            LinhaDaAgenda(
                tipo,
                alvo,
                plataforma,
                quando.strftime(FORMATO_DA_TELA),
                intensidade_em(faixas, quando).value,
                "",
            )
        )
    return linhas
