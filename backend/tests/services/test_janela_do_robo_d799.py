"""D-799: a janela do robô nasce escondida, não rouba o foco e volta na hora certa.

O defeito que isto conserta foi relatado assim: "a tela do Chrome fica branca,
não carrega; aí eu tenho que focar nela". Era a oclusão do Windows — janela
coberta, Chrome para de desenhar. Medido em 28/09/2026 no Chrome de DEV; aqui
fica protegido o que a medição decidiu, sem Chrome nenhum.
"""

import sys
from pathlib import Path
from types import SimpleNamespace

from app.domain.publicacao.janela_do_robo import (
    ARGUMENTOS_INVISIVEIS,
    argumentos_da_janela,
    falta_modo_invisivel,
)
from app.infrastructure import foco_do_windows
from app.services import janela_do_robo


class TestLancamento:
    def test_o_chrome_nasce_sem_oclusao_e_fora_da_tela(self, tmp_path):
        chamados = []

        def popen(argumentos, **kwargs):
            chamados.append(argumentos)
            return SimpleNamespace(pid=4242)

        aberto = janela_do_robo.abrir_escondido(
            popen, Path("chrome.exe"), 9250, tmp_path, "https://www.tiktok.com/x"
        )

        argumentos = chamados[0]
        assert all(a in argumentos for a in ARGUMENTOS_INVISIVEIS)
        assert "--window-position=-2400,-2400" in argumentos
        assert f"--user-data-dir={tmp_path}" in argumentos
        # A URL por último: o Chrome trata o que vem depois dela como outra URL.
        assert argumentos[-1] == "https://www.tiktok.com/x"
        assert aberto.pid == 4242

    def test_o_chrome_antigo_e_reconhecido_pela_linha_de_comando(self):
        antigo = ["chrome.exe", "--remote-debugging-port=9250", "--user-data-dir=C:/p"]
        novo = ["chrome.exe", *argumentos_da_janela()]

        assert falta_modo_invisivel(antigo)
        assert not falta_modo_invisivel(novo)


class TestReinicioDoChromeAntigo:
    """O Chrome aberto por uma versão anterior continua ficando branco: só um
    reinício o conserta. Mas nunca com alguém usando — derrubar uma aba
    esperando o Publicar jogaria fora um upload pronto."""

    def _preparar(self, monkeypatch, linha):
        fechados = []

        class Sessao:
            def send(self, metodo):
                fechados.append(metodo)

        class Navegador:
            def new_browser_cdp_session(self):
                return Sessao()

        class Playwright:
            chromium = SimpleNamespace(connect_over_cdp=lambda url: Navegador())

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        monkeypatch.setitem(
            sys.modules, "playwright.sync_api", SimpleNamespace(sync_playwright=Playwright)
        )
        monkeypatch.setattr(janela_do_robo, "_linha_de_comando_na_porta", lambda porta: linha)
        monkeypatch.setattr(janela_do_robo, "_SEGUNDOS_PARA_FECHAR", 0.0)
        return fechados

    def test_fecha_o_antigo_quando_ninguem_usa(self, monkeypatch, tmp_path):
        fechados = self._preparar(monkeypatch, ["chrome.exe", "--user-data-dir=C:/p"])

        fechou = janela_do_robo.fechar_se_antigo(tmp_path, 9250, responde=lambda p: False)

        assert fechou is True
        assert fechados == ["Browser.close"]

    def test_nao_fecha_com_uma_vigilia_em_curso(self, monkeypatch, tmp_path):
        fechados = self._preparar(monkeypatch, ["chrome.exe", "--user-data-dir=C:/p"])

        with janela_do_robo.em_uso(tmp_path):
            fechou = janela_do_robo.fechar_se_antigo(tmp_path, 9250, responde=lambda p: True)

        assert fechou is False
        assert fechados == []

    def test_nao_mexe_no_chrome_que_ja_e_invisivel(self, monkeypatch, tmp_path):
        fechados = self._preparar(monkeypatch, ["chrome.exe", *argumentos_da_janela()])

        assert janela_do_robo.fechar_se_antigo(tmp_path, 9250, responde=lambda p: True) is False
        assert fechados == []

    def test_o_uso_termina_quando_a_sessao_sai(self, tmp_path):
        with janela_do_robo.em_uso(tmp_path):
            assert janela_do_robo._alguem_usando(tmp_path)
        assert not janela_do_robo._alguem_usando(tmp_path)


class TestFoco:
    """Só o nascimento do Chrome rouba o foco (medido), e só o NOSSO Chrome é
    desfeito: se o operador trocou de janela por conta própria, o robô não
    briga com ele pela tela."""

    def _windows(self, monkeypatch, *, frente, dono):
        estado = {"frente": frente, "devolvidas": []}

        class User32:
            def GetForegroundWindow(self):
                return estado["frente"]

            def IsWindow(self, janela):
                return True

            def keybd_event(self, *args):
                pass

            def SetForegroundWindow(self, janela):
                estado["devolvidas"].append(janela)
                estado["frente"] = janela
                return True

        monkeypatch.setattr(foco_do_windows, "_user32", lambda: User32())
        monkeypatch.setattr(foco_do_windows, "_processo_da_janela", lambda janela: dono)
        return estado

    def test_devolve_o_que_o_chrome_do_robo_roubou(self, monkeypatch):
        estado = self._windows(monkeypatch, frente=200, dono=4242)

        assert foco_do_windows.devolver_se_roubado(100, 4242, espera=0.0) is True
        assert estado["devolvidas"] == [100]

    def test_nao_puxa_o_operador_que_trocou_de_janela_sozinho(self, monkeypatch):
        estado = self._windows(monkeypatch, frente=300, dono=777)

        assert foco_do_windows.devolver_se_roubado(100, 4242, espera=0.0) is False
        assert estado["devolvidas"] == []

    def test_sem_roubo_nao_ha_o_que_devolver(self, monkeypatch):
        estado = self._windows(monkeypatch, frente=100, dono=4242)

        assert foco_do_windows.devolver_se_roubado(100, 4242, espera=0.0) is False
        assert estado["devolvidas"] == []
