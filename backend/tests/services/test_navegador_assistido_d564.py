"""D-564: a camada de navegador, e o gesto que quase jogou um post fora.

A `PaginaDoPlaywright` nasceu dentro do `tiktok_studio` e carregava um hábito de
lá: depois de digitar, ela pressiona Escape — no TikTok isso fecha o menu de
sugestão de hashtag, que senão engole o clique seguinte.

Na calibração de 10/09/2026 contra o Instagram real, esse mesmo Escape abriu
**"Descartar publicação?"** por cima do compositor, com o post inteiro a um
clique de sumir. O gesto não era da casa: era da plataforma.

Estes testes são o que impede alguém de "simplificar" isso de volta.
"""

from __future__ import annotations

import pytest
from app.domain.tiktok_studio import (
    mesma_pasta,
    perfil_na_linha_de_comando,
    porta_de_depuracao,
)
from app.services.navegador_assistido import (
    NavegadorIndisponivel,
    PaginaDoPlaywright,
    aba_marcada,
    perfil_do_canal,
    porta_do_chrome,
)


class TecladoFalso:
    def __init__(self) -> None:
        self.teclas: list[str] = []
        self.texto: list[str] = []

    def press(self, tecla: str) -> None:
        self.teclas.append(tecla)

    def insert_text(self, texto: str) -> None:
        self.texto.append(texto)


class LocalizadorFalso:
    @property
    def first(self):
        return self

    def wait_for(self, **kwargs) -> None:
        pass

    def click(self, **kwargs) -> None:
        pass


class PaginaFalsaDoPlaywright:
    """O mínimo que `PaginaDoPlaywright.escrever` toca."""

    def __init__(self) -> None:
        self.keyboard = TecladoFalso()
        self.url = "https://exemplo/"

    def locator(self, css: str):
        return LocalizadorFalso()


SELETORES = {"caixa": "div.caixa"}


class TestEscapeDepoisDeEscrever:
    def test_por_padrao_ele_escapa_como_o_tiktok_sempre_fez(self):
        """O default é o do TikTok, onde o gesto nasceu e é necessário."""
        page = PaginaFalsaDoPlaywright()

        PaginaDoPlaywright(page, SELETORES).escrever("caixa", "oi", segundos=1)

        assert page.keyboard.teclas[-1] == "Escape"
        assert page.keyboard.texto == ["oi"]

    def test_desligado_ele_nao_escapa(self):
        """No Instagram o Escape abre "Descartar publicação?" — medido na página
        real em 10/09/2026, com o post a um clique de ser jogado fora."""
        page = PaginaFalsaDoPlaywright()

        PaginaDoPlaywright(page, SELETORES, escapar_apos_escrever=False).escrever(
            "caixa", "oi", segundos=1
        )

        assert "Escape" not in page.keyboard.teclas
        assert page.keyboard.texto == ["oi"]

    def test_o_texto_entra_de_uma_vez_e_nao_tecla_a_tecla(self):
        """Digitar caractere a caractere abriria o menu de hashtag a cada "#",
        e a primeira sugestão aceita trocaria a tag escrita por outra parecida."""
        page = PaginaFalsaDoPlaywright()

        PaginaDoPlaywright(page, SELETORES).escrever("caixa", "um #pix", segundos=1)

        assert page.keyboard.texto == ["um #pix"]


class TestSeletoresInjetados:
    def test_a_pagina_nao_conhece_plataforma_nenhuma(self):
        """O mapa vem de fora — é o que permitiu o Instagram reusar esta camada."""
        page = PaginaFalsaDoPlaywright()

        assert PaginaDoPlaywright(page, {"x": "div.x"})._css("x") == "div.x"
        with pytest.raises(KeyError):
            PaginaDoPlaywright(page, {})._css("campo_do_arquivo")


class TestIsolamentoPorPerfil:
    def test_cada_plataforma_tem_a_sua_pasta(self, monkeypatch, tmp_path):
        """Perfil compartilhado faria um Chrome herdar cookies do outro."""
        from app.services import navegador_assistido

        monkeypatch.setattr(navegador_assistido, "active_channel_root", lambda: tmp_path)

        assert perfil_do_canal("tiktok") == tmp_path / "browser" / "tiktok"
        assert perfil_do_canal("instagram") == tmp_path / "browser" / "instagram"

    def test_porta_livre_e_a_preferida(self, monkeypatch, tmp_path):
        from app.services import navegador_assistido

        monkeypatch.setattr(navegador_assistido, "_porta_responde", lambda porta: False)

        perfil = tmp_path / "tiktok"
        assert porta_do_chrome(perfil) == porta_de_depuracao(str(perfil))

    def test_porta_de_OUTRO_perfil_empurra_para_a_seguinte(self, monkeypatch, tmp_path):
        """O caso que a suite inteira flagrou — e que aconteceu de verdade.

        A porta sai de um hash, e hash colide: na maquina do operador os perfis
        do TikTok e do Instagram cairam os dois na 9294. Insistir ali seria
        dirigir a janela alheia, que e exatamente o bug que a porta por perfil
        existe para matar.
        """
        from app.services import navegador_assistido

        perfil = tmp_path / "instagram"
        preferida = porta_de_depuracao(str(perfil))

        monkeypatch.setattr(
            navegador_assistido, "_porta_responde", lambda porta: porta == preferida
        )
        monkeypatch.setattr(navegador_assistido, "perfil_na_porta", lambda porta: "C:/outro/perfil")

        assert porta_do_chrome(perfil) == preferida + 1

    def test_a_nossa_propria_janela_e_reaproveitada(self, monkeypatch, tmp_path):
        """Publicar cinco cortes seguidos usa a MESMA janela, e nao empilha cinco."""
        from app.services import navegador_assistido

        perfil = tmp_path / "tiktok"
        preferida = porta_de_depuracao(str(perfil))

        monkeypatch.setattr(navegador_assistido, "_porta_responde", lambda porta: True)
        monkeypatch.setattr(navegador_assistido, "perfil_na_porta", lambda porta: str(perfil))

        assert porta_do_chrome(perfil) == preferida

    def test_todas_ocupadas_por_terceiros_falha_dizendo_o_que_fazer(self, monkeypatch, tmp_path):
        from app.services import navegador_assistido

        monkeypatch.setattr(navegador_assistido, "_porta_responde", lambda porta: True)
        monkeypatch.setattr(navegador_assistido, "perfil_na_porta", lambda porta: "C:/alheio")

        with pytest.raises(NavegadorIndisponivel) as erro:
            porta_do_chrome(tmp_path / "tiktok")

        assert "feche um Chrome" in str(erro.value)


class TestDonoDaPorta:
    """Ler a linha de comando e a unica resposta confiavel: o CDP nao conta qual
    perfil o navegador abriu, e "responde na porta" nao diz QUEM responde."""

    def test_acha_o_perfil_nas_duas_formas_que_o_chrome_aceita(self):
        assert perfil_na_linha_de_comando(["chrome", "--user-data-dir=C:/a"]) == "C:/a"
        assert perfil_na_linha_de_comando(["chrome", "--user-data-dir", "C:/a"]) == "C:/a"
        assert perfil_na_linha_de_comando(["chrome", "--no-first-run"]) == ""

    def test_o_windows_escreve_o_mesmo_caminho_de_varios_jeitos(self):
        """O Chrome recusa dois processos sobre um perfil so, entao confundir as
        duas grafias do mesmo caminho quebraria o lote no meio."""
        assert mesma_pasta("C:\\App\\x", "C:/app/x/") is True
        assert mesma_pasta("C:/a/b", "C:/a/c") is False

    def test_nao_saber_de_quem_e_nunca_vira_um_sim(self):
        """Vazio e "nao sei", e "nao sei" tem de empurrar para a porta seguinte."""
        assert mesma_pasta("", "C:/a") is False
        assert mesma_pasta("C:/a", "") is False


class TestAbaMarcada:
    class _Aba:
        def __init__(self, nome: str, url: str = "https://instagram.com/") -> None:
            self._nome = nome
            self.url = url
            self.keyboard = TecladoFalso()

        def evaluate(self, script):
            return self._nome

        def locator(self, css):
            return LocalizadorFalso()

    class _Contexto:
        def __init__(self, abas) -> None:
            self.pages = abas

    def test_acha_a_aba_pela_etiqueta_e_ignora_a_url(self):
        """A aba pode ter navegado entre o preparo e a vigília; exigir uma URL
        ali faria perder justamente a que acabou de publicar."""
        certa = self._Aba("cortadorlive-abc", url="https://instagram.com/outra/coisa")
        contexto = self._Contexto([self._Aba("cortadorlive-xyz"), certa])

        assert aba_marcada(contexto, "cortadorlive-abc") is certa

    def test_sem_marca_cai_no_criterio_antigo_da_url(self):
        """É o que o botão avulso do TikTok (D-537) ainda usa."""
        certa = self._Aba("", url="https://www.tiktok.com/tiktokstudio/upload")
        contexto = self._Contexto([self._Aba("", url="https://outra/"), certa])

        assert aba_marcada(contexto, "", "tiktokstudio/upload") is certa

    def test_nenhuma_aba_casa_devolve_none(self):
        contexto = self._Contexto([self._Aba("cortadorlive-xyz")])

        assert aba_marcada(contexto, "cortadorlive-abc") is None


def test_navegador_indisponivel_e_excecao_propria():
    """Esta camada não sabe em que passo de que plataforma foi chamada — quem
    traduz isso para "falhou ao abrir" é o roteiro."""
    assert issubclass(NavegadorIndisponivel, RuntimeError)


# ── D-598: o robo nao guarda copia do que ja subiu ─────────────────────────


class SessaoCdpFalsa:
    def __init__(self) -> None:
        self.enviados: list[tuple[str, dict]] = []

    def send(self, metodo: str, parametros: dict) -> None:
        self.enviados.append((metodo, parametros))


class AbaFalsa:
    def __init__(self, url: str) -> None:
        self.url = url


class ContextoFalso:
    def __init__(self, *urls: str) -> None:
        self.pages = [AbaFalsa(url) for url in urls]
        self.sessao = SessaoCdpFalsa()

    def new_cdp_session(self, pagina) -> SessaoCdpFalsa:
        return self.sessao


def test_depois_de_publicar_apaga_a_copia_do_site_sem_tocar_nos_cookies():
    from app.services.navegador_assistido import apagar_copias_do_upload

    contexto = ContextoFalso("https://www.tiktok.com/tiktokstudio/content")

    assert apagar_copias_do_upload(contexto, "https://www.tiktok.com", "tiktokstudio/upload")
    metodo, parametros = contexto.sessao.enviados[0]
    assert metodo == "Storage.clearDataForOrigin"
    assert parametros["origin"] == "https://www.tiktok.com"
    assert "cookies" not in parametros["storageTypes"]


def test_nao_apaga_enquanto_outra_aba_de_upload_espera_o_operador():
    from app.services.navegador_assistido import apagar_copias_do_upload

    contexto = ContextoFalso(
        "https://www.tiktok.com/tiktokstudio/content",
        "https://www.tiktok.com/tiktokstudio/upload?from=lote",
    )

    assert not apagar_copias_do_upload(contexto, "https://www.tiktok.com", "tiktokstudio/upload")
    assert not contexto.sessao.enviados


class TestChromeDoUploadAssistido:
    """D-634: onde procurar o Chrome e o que dizer quando ele não existe."""

    def test_chrome_path_configurado_e_usado(self, monkeypatch, tmp_path):
        from app.services import navegador_assistido

        exe = tmp_path / "chrome.exe"
        exe.write_text("x")
        monkeypatch.setattr(navegador_assistido.settings, "chrome_path", str(exe))

        assert navegador_assistido._chrome_no_disco() == exe

    def test_chrome_path_inexistente_explica_a_configuracao(self, monkeypatch, tmp_path):
        from app.services import navegador_assistido

        monkeypatch.setattr(navegador_assistido.settings, "chrome_path", str(tmp_path / "nao.exe"))
        monkeypatch.setattr(navegador_assistido, "porta_do_chrome", lambda perfil: 9999)
        monkeypatch.setattr(navegador_assistido, "_porta_responde", lambda porta: False)

        with pytest.raises(NavegadorIndisponivel) as erro:
            navegador_assistido.garantir_chrome(tmp_path / "tiktok", "https://exemplo")

        assert "CHROME_PATH" in str(erro.value)

    def test_sem_chrome_diz_como_resolver(self, monkeypatch, tmp_path):
        from app.services import navegador_assistido

        monkeypatch.setattr(navegador_assistido.settings, "chrome_path", "")
        monkeypatch.setattr(navegador_assistido, "_chrome_no_disco", lambda: None)
        monkeypatch.setattr(navegador_assistido, "porta_do_chrome", lambda perfil: 9999)
        monkeypatch.setattr(navegador_assistido, "_porta_responde", lambda porta: False)

        with pytest.raises(NavegadorIndisponivel) as erro:
            navegador_assistido.garantir_chrome(tmp_path / "tiktok", "https://exemplo")

        assert "Instale o Google Chrome" in str(erro.value)
        assert "CHROME_PATH" in str(erro.value)
