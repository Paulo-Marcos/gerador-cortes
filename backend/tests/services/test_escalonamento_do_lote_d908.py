"""D-908: a agenda do lote antes do clique — o service que junta canal, banco e relógio.

O domínio já provou a aritmética; aqui o que se guarda é a JUNÇÃO: a
configuração do canal entra, o último agendado da rede puxa a partida, o
Instagram sai com "publica no ato", e a saída fala o formato que a tela lê.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from app.domain.publicacao.escalonamento import PADRAO_DO_PUBLICO, ParametrosDoDestino
from app.domain.publicacao.publicacao import Plataforma
from app.services import escalonamento_do_lote as svc
from app.services import registro_do_lote
from app.services.canal import escalonamento_settings

FUSO = timezone(timedelta(hours=-3))
SEGUNDA_10H = datetime(2030, 1, 7, 10, 0, tzinfo=FUSO)
ALVOS = [("short", "s1"), ("short", "s2"), ("short", "s3")]


@pytest.fixture
def canal(monkeypatch):
    """Um canal com blocos conhecidos e nenhum item agendado — a menos que o teste diga."""
    ultimos: dict[str, datetime | None] = {}
    parametros = {
        "youtube_shorts": ParametrosDoDestino(("16:00", "19:00", "22:00"), 1, 3, 180),
        "tiktok": ParametrosDoDestino(("12:00",), 2, 2, 30),
    }

    async def _ultimo(plataformas):
        ultimos.setdefault("perguntadas", []).append(list(plataformas))
        return ultimos.get(plataformas[0])

    monkeypatch.setattr(registro_do_lote, "ultimo_agendado", _ultimo)
    monkeypatch.setattr(escalonamento_settings, "resolver_referencia", lambda: PADRAO_DO_PUBLICO)
    monkeypatch.setattr(escalonamento_settings, "resolver_parametros", lambda d: parametros[d])
    return ultimos


@pytest.mark.asyncio
async def test_cada_rede_recebe_a_sua_agenda_na_ordem_da_selecao(canal):
    linhas = await svc.prever(
        ALVOS, [Plataforma.YOUTUBE_SHORTS, Plataforma.TIKTOK], agora=SEGUNDA_10H
    )

    shorts = [linha for linha in linhas if linha.plataforma == "youtube_shorts"]
    tiktok = [linha for linha in linhas if linha.plataforma == "tiktok"]
    assert [linha.alvo_id for linha in shorts] == ["s1", "s2", "s3"]
    assert [linha.agendar_para for linha in shorts] == [
        "2030-01-07T16:00",
        "2030-01-07T19:00",
        "2030-01-07T22:00",
    ]
    assert [linha.agendar_para for linha in tiktok] == [
        "2030-01-07T12:00",
        "2030-01-07T12:30",
        "2030-01-08T12:00",
    ]


@pytest.mark.asyncio
async def test_a_intensidade_do_publico_acompanha_cada_linha(canal):
    linhas = await svc.prever(ALVOS, [Plataforma.TIKTOK], agora=SEGUNDA_10H)

    # Segunda ao meio-dia é "medio" no padrão; a tela pinta cada linha com isso.
    assert [linha.intensidade for linha in linhas] == ["medio", "medio", "medio"]


@pytest.mark.asyncio
async def test_parte_do_ultimo_agendado_da_rede(canal):
    canal["youtube_shorts"] = datetime(2030, 1, 7, 19, 0, tzinfo=FUSO)

    linhas = await svc.prever(ALVOS[:1], [Plataforma.YOUTUBE_SHORTS], agora=SEGUNDA_10H)

    assert linhas[0].agendar_para == "2030-01-07T22:00"


@pytest.mark.asyncio
async def test_o_tiktok_horizontal_parte_da_mesma_fila_do_tiktok(canal):
    await svc.prever(ALVOS[:1], [Plataforma.TIKTOK_HORIZONTAL], agora=SEGUNDA_10H)

    assert canal["perguntadas"] == [["tiktok", "tiktok_horizontal"]]


@pytest.mark.asyncio
async def test_o_instagram_publica_no_ato(canal):
    linhas = await svc.prever(ALVOS[:2], [Plataforma.INSTAGRAM_REELS], agora=SEGUNDA_10H)

    assert [linha.agendar_para for linha in linhas] == ["", ""]
    assert all("publica no ato" in linha.motivo for linha in linhas)
    # Nenhuma pergunta ao banco: não há fila de que partir.
    assert "perguntadas" not in canal


@pytest.mark.asyncio
async def test_o_que_estoura_o_horizonte_do_tiktok_fica_sem_data(canal):
    muitos = [("short", f"s{n}") for n in range(25)]

    linhas = await svc.prever(muitos, [Plataforma.TIKTOK], agora=SEGUNDA_10H)

    com_data = [linha for linha in linhas if linha.agendar_para]
    sem_data = [linha for linha in linhas if not linha.agendar_para]
    # Dois por dia, dez dias de horizonte: vinte cabem, cinco ficam para fora.
    assert len(com_data) == 20
    assert len(sem_data) == 5
    assert all("10 dias" in linha.motivo for linha in sem_data)


def test_como_dict_fala_o_contrato_da_tela():
    linha = svc.LinhaDaAgenda("short", "s1", "tiktok", "2030-01-07T12:00", "forte", "")

    assert linha.como_dict() == {
        "alvo_tipo": "short",
        "alvo_id": "s1",
        "plataforma": "tiktok",
        "agendar_para": "2030-01-07T12:00",
        "intensidade": "forte",
        "motivo": "",
    }
