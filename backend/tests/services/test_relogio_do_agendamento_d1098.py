"""D-1098: o relógio do agendamento não fica aberto na aba entregue ao operador.

Medido na PROD em 09/11/2026: com a RN-26 segurando a publicação (corte deitado
sem capa vertical), a aba chegava com o seletor de hora ABERTO — e parecia que o
robô tinha travado no meio do agendamento, quando ele já tinha terminado.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.tiktok_studio import Passo, RoteiroInterrompido
from app.services import tiktok_studio
from app.services.capa_no_tiktok_studio import PaginaNoTikTok

from tests.services.test_tiktok_studio_d537 import (  # noqa: F401 — fixtures do teste irmão
    PaginaFalsa,
    _rodar,
    arquivos,
    sem_espera_no_envio,
)


class PaginaComRelogio(PaginaFalsa):
    """O dublê com o seletor de hora que abre no clique e só fecha no Escape."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.relogio_aberto = False
        # Encena um seletor que DESFAZ a escolha no Escape, em vez de confirmá-la.
        self.escape_desfaz = False

    def clicar(self, alvo, *, segundos):
        super().clicar(alvo, segundos=segundos)
        if alvo == "campo_da_hora":
            self.relogio_aberto = True

    def existe(self, alvo, *, segundos, visivel=True):
        if alvo in ("hora_do_seletor", "minuto_do_seletor"):
            self.chamadas.append(("existe", alvo))
            return self.relogio_aberto
        return super().existe(alvo, segundos=segundos, visivel=visivel)

    def apertar(self, tecla):
        self.chamadas.append(("apertar", tecla))
        if tecla == "Escape" and self.relogio_aberto:
            self.relogio_aberto = False
            if self.escape_desfaz:
                self.campos["campo_da_hora"] = "00:00"


def _amanha(hora: str) -> Agendamento:
    dia = datetime.now().astimezone() + timedelta(days=1)
    return Agendamento.de_texto(f"{dia.strftime('%Y-%m-%d')}T{hora}")


def _pagina_para(agendamento: Agendamento) -> PaginaComRelogio:
    pagina = PaginaComRelogio()
    pagina.mes_visivel = agendamento.quando.strftime("%Y-%m")
    return pagina


def test_a_aba_entregue_ao_operador_vem_com_o_relogio_fechado(arquivos):  # noqa: F811
    agendamento = _amanha("16:00")
    pagina = _pagina_para(agendamento)

    relatorio = _rodar(pagina, arquivos, agendamento=agendamento)

    assert relatorio["publicado"] is False  # a vez é do operador
    assert pagina.relogio_aberto is False
    assert pagina.campos["campo_da_hora"] == "16:00"


def test_fecha_o_relogio_antes_de_publicar_sozinho(arquivos):  # noqa: F811
    agendamento = _amanha("22:00")
    pagina = _pagina_para(agendamento)
    pagina.url = "https://www.tiktok.com/tiktokstudio/upload"
    original = pagina.clicar

    def clicar(alvo, *, segundos):
        original(alvo, segundos=segundos)
        if alvo == "botao_publicar":
            assert pagina.relogio_aberto is False, "Publicar clicado com o relogio aberto"
            pagina.url = "https://www.tiktok.com/tiktokstudio/content"

    pagina.clicar = clicar

    relatorio = _rodar(pagina, arquivos, agendamento=agendamento, publicar_sozinho=True)

    assert relatorio["publicado"] is True


def test_escape_que_desfaz_a_hora_interrompe_em_vez_de_entregar_data_errada(arquivos):  # noqa: F811
    agendamento = _amanha("16:00")
    pagina = _pagina_para(agendamento)
    pagina.escape_desfaz = True

    with pytest.raises(RoteiroInterrompido) as erro:
        _rodar(pagina, arquivos, agendamento=agendamento)

    assert erro.value.passo == Passo.AGENDAMENTO
    assert "16:00" in str(erro.value)


def test_fechar_o_relogio_que_falha_nao_derruba_o_agendamento_ja_feito(arquivos):  # noqa: F811
    agendamento = _amanha("16:00")
    pagina = _pagina_para(agendamento)

    def apertar(tecla):
        raise RuntimeError("teclado indisponivel")

    pagina.apertar = apertar

    relatorio = _rodar(pagina, arquivos, agendamento=agendamento)

    assert Passo.AGENDAMENTO.value in relatorio["passos"]
    assert pagina.campos["campo_da_hora"] == "16:00"


def test_a_pagina_de_verdade_aperta_a_tecla_no_teclado_do_playwright():
    class Teclado:
        def __init__(self):
            self.teclas: list[str] = []

        def press(self, tecla):
            self.teclas.append(tecla)

    class Page:
        keyboard = Teclado()

    page = Page()

    PaginaNoTikTok(page, tiktok_studio.SELETORES).apertar("Escape")

    assert page.keyboard.teclas == ["Escape"]
