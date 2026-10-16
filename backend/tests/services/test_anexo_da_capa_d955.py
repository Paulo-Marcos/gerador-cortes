"""D-955: os anexos da capa vão para o campo de anexar fotos, não para a câmera.

Em 16/10/2026 o formulário do ChatGPT ganhou um "Tirar uma foto" — também um
`<input type=file accept="image/*">`, sem `multiple`, com `capture`, ANTES do
campo de anexar. O robô entregava os arquivos ao primeiro campo que casava com
o seletor, e o pedido saía sem nenhum anexo: nem os quadros do apresentador,
nem as fotos das pessoas.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.domain.compartilhado.chatgpt_imagem import indice_do_campo_de_fotos
from app.domain.compartilhado.erros import ServicoExternoFalhou
from app.services import capa_no_chatgpt

# Os campos que casam com o seletor `anexo_de_fotos`, na ordem da página,
# como lidos na janela do robô em 16/10/2026.
CAMERA = {"multiple": False, "capture": True}
FOTOS = {"multiple": True, "capture": False}


class TestCampoDeFotos:
    def test_pula_a_camera_que_vem_antes(self):
        assert indice_do_campo_de_fotos([CAMERA, FOTOS]) == 1

    def test_campo_unico_de_varias_fotos(self):
        assert indice_do_campo_de_fotos([FOTOS]) == 0

    def test_campo_de_um_arquivo_so_nao_serve(self):
        """Os anexos são vários: um campo de um arquivo só perderia o resto."""
        assert indice_do_campo_de_fotos([{"multiple": False, "capture": False}]) is None

    def test_sem_campo_que_sirva(self):
        assert indice_do_campo_de_fotos([CAMERA]) is None
        assert indice_do_campo_de_fotos([]) is None


class LocatorFalso:
    def __init__(self) -> None:
        self.first = self

    def wait_for(self, **_kwargs) -> None:
        pass


class SessaoCdpFalsa:
    def __init__(self) -> None:
        self.expressoes: list[str] = []
        self.arquivos: list[str] = []

    def send(self, metodo: str, params: dict) -> dict:
        if metodo == "Runtime.evaluate":
            self.expressoes.append(params["expression"])
            return {"result": {"objectId": "campo"}}
        self.arquivos = params["files"]
        return {}

    def detach(self) -> None:
        pass


class PageFalsa:
    """A página com os campos de arquivo de hoje; o CDP é o que recebe a entrega."""

    def __init__(self, campos: list[dict]) -> None:
        self.campos = campos
        self.sessao = SessaoCdpFalsa()
        self.context = self

    def locator(self, _css: str) -> LocatorFalso:
        return LocatorFalso()

    def evaluate(self, _script: str, _css: str) -> list[dict]:
        return self.campos

    def new_cdp_session(self, _page) -> SessaoCdpFalsa:
        return self.sessao


def _pagina(campos: list[dict]) -> tuple[capa_no_chatgpt.PaginaDoPlaywrightNoChatGPT, PageFalsa]:
    page = PageFalsa(campos)
    return capa_no_chatgpt.PaginaDoPlaywrightNoChatGPT(page, {"anexo_de_fotos": "input"}), page


class TestEntregaDosAnexos:
    def test_anexos_vao_para_o_campo_de_fotos_e_nao_para_a_camera(self, tmp_path):
        pagina, page = _pagina([CAMERA, FOTOS])
        quadros = [tmp_path / "quadro-1.jpg", tmp_path / "quadro-2.jpg"]

        pagina.enviar_arquivos("anexo_de_fotos", quadros, segundos=1)

        assert page.sessao.expressoes == ['document.querySelectorAll("input")[1]']
        assert [Path(a).name for a in page.sessao.arquivos] == ["quadro-1.jpg", "quadro-2.jpg"]

    def test_sem_campo_de_fotos_para_em_vez_de_enviar_sem_anexo(self, tmp_path):
        pagina, page = _pagina([CAMERA])

        with pytest.raises(ServicoExternoFalhou, match="anexar"):
            pagina.enviar_arquivos("anexo_de_fotos", [tmp_path / "quadro-1.jpg"], segundos=1)
        assert page.sessao.arquivos == []
