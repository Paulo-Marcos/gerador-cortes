"""D-1083: o VTT do YouTube chega escapado em HTML e o parser o decodifica.

A máscara de palavrão vem como `[&nbsp;__&nbsp;]`; sem decodificar, ela vira
palavra na fala do trecho e aparece assim na tela.
"""

from app.domain.projeto.vtt_parser import parse_vtt


def _vtt(texto: str) -> str:
    return f"WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n{texto}"


def test_mascara_de_palavrao_sai_como_no_json3():
    assert parse_vtt(_vtt("não é [&nbsp;__&nbsp;] velho"))[0]["texto"] == "não é [ __ ] velho"


def test_troca_de_falante_e_e_comercial_saem_decodificados():
    assert parse_vtt(_vtt("&gt;&gt; P&amp;D"))[0]["texto"] == ">> P&D"
