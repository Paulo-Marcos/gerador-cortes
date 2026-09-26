"""D-462: os tokens que o `@remotion/captions` consome.

Duas conversões carregam o arquivo, e as duas quebram em silêncio se saírem
erradas — a legenda renderiza, só sai torta:

  - milissegundos, não segundos (a unidade do pacote);
  - espaço à esquerda em toda palavra menos a primeira. O Remotion concatena os
    tokens crus para montar a linha da página; sem o espaço vira "umtextoassim".
"""

import pytest
from app.domain.short.legenda_short import para_captions
from app.domain.short.transcricao_fiel import Palavra
from app.services import legendas_short
from app.services.transcricao_fiel import TranscricaoFiel


def test_tempos_saem_em_milissegundos():
    captions = para_captions([Palavra("olá", 1.25, 1.8)])

    assert captions[0]["startMs"] == 1250
    assert captions[0]["endMs"] == 1800


def test_so_a_primeira_palavra_vai_sem_espaco():
    captions = para_captions(
        [Palavra("ninguém", 0.0, 0.4), Palavra("te", 0.4, 0.6), Palavra("conta", 0.6, 1.0)]
    )

    assert [c["text"] for c in captions] == ["ninguém", " te", " conta"]


def test_timestamp_fica_no_meio_da_palavra():
    """E o instante que o pacote usa para casar a palavra com o frame."""
    captions = para_captions([Palavra("oi", 2.0, 2.4)])

    assert captions[0]["timestampMs"] == 2200


def test_sem_palavras_devolve_lista_vazia():
    assert para_captions([]) == []


@pytest.mark.asyncio
async def test_montar_recorta_e_rebaseia_para_o_zero_do_short(monkeypatch):
    async def _transcricao(corte_id):
        return TranscricaoFiel(
            palavras=[
                Palavra("antes", 5.0, 5.4),
                Palavra("dentro", 12.0, 12.5),
                Palavra("depois", 40.0, 40.4),
            ],
            fonte="asr_local",
        )

    monkeypatch.setattr(legendas_short.transcricao_fiel, "obter_do_corte", _transcricao)

    legenda = await legendas_short.montar_do_short("c1", inicio_seg=10.0, fim_seg=20.0)

    assert legenda.fonte == "asr_local"
    assert [c["text"] for c in legenda.captions] == ["dentro"]
    assert legenda.captions[0]["startMs"] == 2000


@pytest.mark.asyncio
async def test_trecho_sem_fala_e_resposta_valida(monkeypatch):
    """Short de reacao existe; legenda vazia nao e erro."""

    async def _transcricao(corte_id):
        return TranscricaoFiel(palavras=[Palavra("longe", 300.0, 300.4)], fonte="auto_legenda")

    monkeypatch.setattr(legendas_short.transcricao_fiel, "obter_do_corte", _transcricao)

    legenda = await legendas_short.montar_do_short("c1", inicio_seg=0.0, fim_seg=30.0)

    assert legenda.captions == []
    assert legenda.total == 0
