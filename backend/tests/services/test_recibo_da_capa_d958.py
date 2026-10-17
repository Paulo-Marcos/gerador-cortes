"""D-958: o recibo da capa vale só para a imagem que o robô entregou.

Medido em 17/10/2026 num rascunho do TikTok (vídeo 16:9 de 6 min): o robô
clicou em Salvar 0,05 s depois de entregar a capa, antes de o editor lê-la.
O TikTok salvou um QUADRO do vídeo — subiu duas imagens de 71 KB e 443 KB,
nenhuma do tamanho da capa — e mesmo assim chamou o `get_image_urls`. O
recibo da D-902 chegava para qualquer capa, e o robô dava a nossa por aplicada.

Na passada que deu certo, o TikTok pediu o envio de uma imagem com
`FileSize=` igual ao tamanho exato do arquivo da capa, e só então o recibo.
"""

from pathlib import Path

import pytest
from app.services import capa_no_tiktok_studio
from app.services.capa_no_tiktok_studio import RECIBO_DA_CAPA, PaginaNoTikTok
from app.services.navegador_assistido import PaginaDoPlaywright

PEDIR_ENVIO = "https://www.tiktok.com/top/v1?Action=ApplyUploadInner&SpaceName=tiktok"
RECIBO = f"https://www.tiktok.com/tiktok_creator/editor_tool/api/v1/{RECIBO_DA_CAPA}?aid=1988"


class _Rede:
    def __init__(self, url: str) -> None:
        self.url = url
        self.ok = True


class PageFalsa:
    """A `page` do Playwright, tocando um roteiro de rede na primeira espera."""

    def __init__(self, roteiro: list[tuple[str, str]]) -> None:
        self.roteiro = list(roteiro)
        self.ouvintes: dict[str, list] = {"request": [], "response": []}
        self.esperas: list[float] = []

    def on(self, evento, funcao):
        self.ouvintes[evento].append(funcao)

    def remove_listener(self, evento, funcao):
        self.ouvintes[evento].remove(funcao)

    def wait_for_timeout(self, ms):
        self.esperas.append(ms)
        while self.roteiro:
            evento, url = self.roteiro.pop(0)
            for funcao in list(self.ouvintes[evento]):
                funcao(_Rede(url))


@pytest.fixture
def capa(tmp_path, monkeypatch) -> Path:
    # Entregar o arquivo de verdade fala CDP com um Chrome; aqui só importa o que sobra.
    monkeypatch.setattr(PaginaDoPlaywright, "enviar_arquivo", lambda *a, **k: None)
    arquivo = tmp_path / "capa.png"
    arquivo.write_bytes(b"x" * 3497)
    return arquivo


def _ouvir(capa: Path, roteiro: list[tuple[str, str]]) -> bool:
    pagina = PaginaNoTikTok(PageFalsa([]))
    pagina.enviar_arquivo("campo_da_capa", capa, segundos=1.0)
    pagina._page.roteiro = roteiro
    esperar = pagina.escutar_resposta(RECIBO_DA_CAPA)
    return esperar(1.0)


def test_recibo_de_um_quadro_do_video_nao_e_o_da_capa(capa):
    roteiro = [
        ("request", f"{PEDIR_ENVIO}&FileType=image&IsInner=1&FileSize=71647&s=a"),
        ("request", f"{PEDIR_ENVIO}&FileType=image&IsInner=1&FileSize=443092&s=b"),
        ("response", RECIBO),
    ]

    assert _ouvir(capa, roteiro) is False


def test_recibo_depois_do_envio_da_capa_conta(capa):
    roteiro = [
        ("request", f"{PEDIR_ENVIO}&FileType=image&IsInner=1&FileSize=511546&s=a"),
        ("request", f"{PEDIR_ENVIO}&FileType=image&IsInner=1&FileSize=3497&s=b"),
        ("response", RECIBO),
    ]

    assert _ouvir(capa, roteiro) is True


def test_recibo_que_chega_antes_do_envio_da_capa_nao_conta(capa):
    roteiro = [
        ("response", RECIBO),
        ("request", f"{PEDIR_ENVIO}&FileType=image&IsInner=1&FileSize=3497&s=b"),
    ]

    assert _ouvir(capa, roteiro) is False


def test_tamanho_que_so_comeca_igual_nao_e_a_capa(capa):
    roteiro = [
        ("request", f"{PEDIR_ENVIO}&FileType=image&IsInner=1&FileSize=34970&s=a"),
        ("response", RECIBO),
    ]

    assert _ouvir(capa, roteiro) is False


def test_o_editor_ganha_tempo_de_ler_a_capa_antes_do_salvar(capa):
    """Na passada que falhou, o Salvar foi clicado 0,05 s depois da entrega."""
    pagina = PaginaNoTikTok(PageFalsa([]))

    pagina.enviar_arquivo("campo_da_capa", capa, segundos=1.0)

    assert pagina._page.esperas == [capa_no_tiktok_studio.MS_PARA_O_EDITOR_LER_A_CAPA]
