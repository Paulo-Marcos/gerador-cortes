"""D-804: a capa gerada no ChatGPT do operador, pelo navegador dele.

O roteiro roda contra um dublê de página — o mesmo jeito dos robôs do TikTok e
do Instagram: o que se testa é a SEQUÊNCIA de intenções e o que acontece em
cada desvio, não o Chromium.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from app.core import channel_paths
from app.domain.compartilhado.chatgpt_imagem import (
    ProjetoInvalido,
    montar_pedido,
    nome_de_ficha_valido,
    tipo_da_imagem,
    url_do_projeto_valida,
)
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido, ServicoExternoFalhou
from app.infrastructure import executaveis_do_navegador
from app.services import capa_no_chatgpt, retrato_wikipedia

PROJETO = "https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project"
PNG = bytes.fromhex("89504e470d0a1a0a") + b"resto-da-imagem"


class RelogioFalso:
    """Tempo que só anda quando o roteiro dorme — o teste não espera de verdade."""

    def __init__(self) -> None:
        self.t = 0.0

    def agora(self) -> float:
        return self.t

    def dormir(self, segundos: float) -> None:
        self.t += segundos


class PaginaFalsa:
    """Uma aba do ChatGPT que responde como a medida em 28/09/2026."""

    def __init__(
        self,
        relogio: RelogioFalso,
        *,
        url_depois_de_abrir: str = PROJETO,
        imagem_em: float | None = 30.0,
        gerando_ate: float = 40.0,
        imagem: bytes = PNG,
    ) -> None:
        self.relogio = relogio
        self.url_depois_de_abrir = url_depois_de_abrir
        self.imagem_em = imagem_em
        self.gerando_ate = gerando_ate
        self.imagem = imagem
        self.passos: list[tuple] = []
        self._url = ""
        self._enviado_em: float | None = None

    def abrir(self, url, *, segundos):
        self.passos.append(("abrir", url))
        self._url = self.url_depois_de_abrir

    def url_atual(self):
        return self._url

    def existe(self, alvo, *, segundos, visivel=True):
        if alvo == "campo_do_prompt":
            return True
        decorrido = None if self._enviado_em is None else self.relogio.agora() - self._enviado_em
        if alvo == "imagem_gerada":
            return (
                decorrido is not None and self.imagem_em is not None and decorrido >= self.imagem_em
            )
        if alvo == "parar":
            return decorrido is not None and 2 <= decorrido < self.gerando_ate
        raise AssertionError(alvo)

    def enviar_arquivos(self, alvo, caminhos, *, segundos):
        self.passos.append(("anexar", alvo, [c.name for c in caminhos]))

    def escrever(self, alvo, texto, *, segundos):
        self.passos.append(("escrever", alvo, texto))

    def esperar_habilitado(self, alvo, *, segundos):
        self.passos.append(("esperar_habilitado", alvo))

    def clicar(self, alvo, *, segundos):
        self.passos.append(("clicar", alvo))
        self._enviado_em = self.relogio.agora()

    def baixar_imagem(self, alvo):
        self.passos.append(("baixar", alvo))
        return self.imagem

    def fechar(self):
        self.passos.append(("fechar",))


def _rodar(pagina, relogio, fichas=()):
    return capa_no_chatgpt.executar_roteiro(
        pagina,
        projeto_url=PROJETO,
        pedido="o pedido",
        fichas=list(fichas),
        dormir=relogio.dormir,
        agora=relogio.agora,
    )


class TestRoteiro:
    def test_chat_novo_fichas_pedido_enviar_e_baixar(self, tmp_path):
        relogio = RelogioFalso()
        pagina = PaginaFalsa(relogio)
        fichas = [tmp_path / "1-poses.png", tmp_path / "2-expressoes.png"]

        imagem = _rodar(pagina, relogio, fichas)

        assert imagem == PNG
        assert pagina.passos == [
            ("abrir", PROJETO),
            ("anexar", "anexo_de_fotos", ["1-poses.png", "2-expressoes.png"]),
            ("escrever", "campo_do_prompt", "o pedido"),
            ("esperar_habilitado", "enviar"),
            ("clicar", "enviar"),
            ("baixar", "imagem_gerada"),
            ("fechar",),
        ]

    def test_erro_deixa_a_aba_aberta_para_o_operador_ver(self):
        # D-821: a aba fecha quando a imagem sai; quando nao sai, e nela que o
        # operador ve a recusa ou o limite do plano — fechar esconderia o motivo.
        relogio = RelogioFalso()
        pagina = PaginaFalsa(relogio, imagem_em=None, gerando_ate=8)

        with pytest.raises(ServicoExternoFalhou):
            _rodar(pagina, relogio)
        assert ("fechar",) not in pagina.passos

    def test_so_baixa_quando_a_resposta_termina(self):
        # A prévia borrada aparece antes da imagem final: baixar ali entregaria a prévia.
        relogio = RelogioFalso()
        pagina = PaginaFalsa(relogio, imagem_em=10, gerando_ate=60)

        _rodar(pagina, relogio)

        assert relogio.agora() >= 60

    def test_sem_fichas_nao_anexa_nada(self):
        relogio = RelogioFalso()
        pagina = PaginaFalsa(relogio)

        _rodar(pagina, relogio)

        assert not [p for p in pagina.passos if p[0] == "anexar"]

    def test_sessao_perdida_pede_login_na_janela_do_robo(self):
        relogio = RelogioFalso()
        pagina = PaginaFalsa(relogio, url_depois_de_abrir="https://chatgpt.com/auth/login/?next=x")

        with pytest.raises(ServicoExternoFalhou, match="login"):
            _rodar(pagina, relogio)
        assert [p[0] for p in pagina.passos] == ["abrir"]

    def test_resposta_sem_imagem_desiste_sem_esperar_o_prazo_inteiro(self):
        # Recusa ou limite do plano: o chat termina e nenhuma imagem vem.
        relogio = RelogioFalso()
        pagina = PaginaFalsa(relogio, imagem_em=None, gerando_ate=8)

        with pytest.raises(ServicoExternoFalhou, match="sem imagem"):
            _rodar(pagina, relogio)
        assert relogio.agora() < capa_no_chatgpt.PRAZO_PARA_GERAR

    def test_imagem_que_nao_baixa_vira_erro_com_saida(self):
        relogio = RelogioFalso()
        pagina = PaginaFalsa(relogio, imagem=b"")

        with pytest.raises(ServicoExternoFalhou, match="Copie"):
            _rodar(pagina, relogio)


@pytest.fixture
def canal(monkeypatch, tmp_path):
    """Canal ativo e settings.db numa pasta do teste."""
    raiz = tmp_path / "channels" / "meucanal"
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: raiz)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(
        channel_paths, "fichas_do_chatgpt_dir", lambda: raiz / "capa_chatgpt" / "fichas"
    )
    return raiz


class TestConfiguracao:
    def test_canal_novo_comeca_sem_projeto_e_sem_fichas(self, canal):
        assert capa_no_chatgpt.ler_configuracao() == {
            "projeto_url": "",
            "fichas": [],
            "maximo_de_fichas": 10,
        }

    def test_grava_o_link_do_projeto(self, canal):
        capa_no_chatgpt.gravar_projeto(f"  {PROJETO}  ")

        assert capa_no_chatgpt.ler_configuracao()["projeto_url"] == PROJETO

    def test_recusa_o_link_de_um_chat_no_lugar_do_projeto(self, canal):
        with pytest.raises(ProjetoInvalido):
            capa_no_chatgpt.gravar_projeto("https://chatgpt.com/c/6aba9577-16fc-83e9")

    def test_fichas_entram_saem_e_o_mesmo_nome_substitui(self, canal):
        capa_no_chatgpt.salvar_ficha("Poses.PNG", PNG)
        capa_no_chatgpt.salvar_ficha("poses.png", PNG + b"nova")
        config = capa_no_chatgpt.salvar_ficha("expressoes.png", PNG)

        assert config["fichas"] == ["expressoes.png", "poses.png"]
        assert capa_no_chatgpt.caminho_da_ficha("poses.png").read_bytes() == PNG + b"nova"

        assert capa_no_chatgpt.remover_ficha("poses.png")["fichas"] == ["expressoes.png"]
        with pytest.raises(NaoEncontrado):
            capa_no_chatgpt.caminho_da_ficha("poses.png")

    def test_recusa_arquivo_que_nao_e_imagem(self, canal):
        with pytest.raises(PedidoInvalido):
            capa_no_chatgpt.salvar_ficha("poses.png", b"%PDF-1.7")

    def test_gerar_sem_projeto_configurado_diz_onde_configurar(self, canal):
        import asyncio

        with pytest.raises(PedidoInvalido, match="Canais"):
            asyncio.run(capa_no_chatgpt.gerar_imagem("um prompt", "16:9"))


class TestDominio:
    def test_link_do_projeto_com_slug_vale(self):
        com_slug = PROJETO.replace("/project", "-imagens-sapo/project")
        assert url_do_projeto_valida(com_slug) == com_slug

    def test_link_vazio_desliga(self):
        assert url_do_projeto_valida("   ") == ""

    def test_pedido_leva_o_prompt_e_o_quadro_da_capa(self):
        pedido = montar_pedido("  o sapo aponta  ", "4:5")
        assert pedido.startswith("o sapo aponta\n\n")
        assert "4:5" in pedido

    def test_pedido_diz_qual_foto_e_de_quem(self):
        pedido = montar_pedido("o sapo e o Lula", "16:9", [("Lula", "lula.jpg")])
        assert "lula.jpg = Lula" in pedido
        assert "não são fichas do personagem" in pedido
        assert "Fotos de pessoas" not in montar_pedido("o sapo", "16:9")

    def test_pedido_sem_prompt_e_recusado(self):
        with pytest.raises(PedidoInvalido):
            montar_pedido("  ", "16:9")

    def test_nome_de_ficha_nao_vira_caminho_fora_da_pasta(self):
        assert nome_de_ficha_valido("..\\..\\segredo.png") == "segredo.png"
        with pytest.raises(PedidoInvalido):
            nome_de_ficha_valido("ficha.exe")

    def test_tipo_da_imagem_pela_assinatura(self):
        assert tipo_da_imagem(PNG) == "image/png"
        assert tipo_da_imagem(b"\xff\xd8\xff\xe0") == "image/jpeg"
        assert tipo_da_imagem(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
        assert tipo_da_imagem(b"texto") == ""


class TestNavegador:
    def test_abre_no_edge_quando_ha_edge(self, monkeypatch, tmp_path):
        edge = tmp_path / "msedge.exe"
        edge.write_bytes(b"")
        monkeypatch.setattr(executaveis_do_navegador, "Path", lambda _caminho: edge)

        assert executaveis_do_navegador.edge_no_disco() == edge

    def test_sem_edge_devolve_nada_e_o_robo_cai_no_chrome(self, monkeypatch, tmp_path):
        monkeypatch.setattr(
            executaveis_do_navegador, "Path", lambda _caminho: tmp_path / "nao-existe.exe"
        )
        monkeypatch.setattr(executaveis_do_navegador.shutil, "which", lambda _nome: None)

        assert executaveis_do_navegador.edge_no_disco() is None

    def test_garantir_chrome_abre_o_executavel_pedido(self, monkeypatch, tmp_path):
        from app.services import navegador_assistido

        lancados = []
        respostas = iter([False, True])
        monkeypatch.setattr(navegador_assistido, "porta_do_chrome", lambda _perfil: 9300)
        monkeypatch.setattr(navegador_assistido, "_porta_responde", lambda _porta: next(respostas))
        monkeypatch.setattr(
            navegador_assistido.subprocess, "Popen", lambda args, **_: lancados.append(args)
        )
        edge = tmp_path / "msedge.exe"

        navegador_assistido.garantir_chrome(tmp_path / "perfil", PROJETO, executavel=edge)

        assert lancados[0][0] == str(edge)


class TestJanelaDoRoboNoChatGPT:
    """D-799 deu ao robô uma janela que nasce fora da tela. No ChatGPT ela tem de
    voltar quando o robô para por algo que só o operador resolve (login, recusa,
    prazo) — e ficar escondida quando a imagem volta sozinha."""

    @pytest.fixture
    def robo(self, monkeypatch):
        from contextlib import contextmanager

        from app.services import janela_do_robo, navegador_assistido

        class Aba:
            def bring_to_front(self):
                pass

        class Contexto:
            pages: list = []

            def new_page(self):
                return Aba()

        @contextmanager
        def sessao(_perfil):
            yield type("Navegador", (), {"contexts": [Contexto()]})(), False

        mostradas: list = []
        monkeypatch.setattr(navegador_assistido, "garantir_chrome", lambda *a, **k: False)
        monkeypatch.setattr(navegador_assistido, "sessao_no_chrome", sessao)
        monkeypatch.setattr(janela_do_robo, "mostrar", mostradas.append)
        monkeypatch.setattr(capa_no_chatgpt, "edge_no_disco", lambda: None)
        return mostradas

    def test_parada_que_pede_o_operador_traz_a_janela(self, robo, monkeypatch):
        def pede_login(*_a, **_k):
            raise ServicoExternoFalhou("O ChatGPT pediu login na janela do robô.")

        monkeypatch.setattr(capa_no_chatgpt, "executar_roteiro", pede_login)

        with pytest.raises(ServicoExternoFalhou, match="login"):
            capa_no_chatgpt._gerar_no_navegador(PROJETO, "pedido", [])

        assert len(robo) == 1

    def test_imagem_que_volta_sozinha_deixa_a_janela_escondida(self, robo, monkeypatch):
        monkeypatch.setattr(capa_no_chatgpt, "executar_roteiro", lambda *_a, **_k: PNG)

        assert capa_no_chatgpt._gerar_no_navegador(PROJETO, "pedido", []) == PNG
        assert robo == []


@pytest.fixture
def retratos(canal, monkeypatch, tmp_path):
    """Banco de retratos falso: Neymar tem foto, a rede cai para "Erro", o resto não existe."""
    pasta = tmp_path / "retratos"
    pasta.mkdir()
    buscados: list[str] = []

    async def buscar(nome, **_kw):
        buscados.append(nome)
        if nome == "Erro":
            raise OSError("sem rede")
        if nome != "Neymar":
            return None
        foto = pasta / "neymar.jpg"
        foto.write_bytes(b"jpg")
        return retrato_wikipedia.RetratoEncontrado(
            nome=nome, slug="neymar", caminho_arquivo=foto, url_publica="/", fonte="cache"
        )

    monkeypatch.setattr(retrato_wikipedia, "buscar_wikipedia", buscar)
    monkeypatch.setattr(
        capa_no_chatgpt, "identidade_do_mascote", lambda: SimpleNamespace(nome="Sapo")
    )
    return buscados


PROMPT_COM_ELENCO = (
    '[VARIATION_TAGS] personagens="Neymar e Sapo" | referencias="Neymar; Fulano Sem Foto; Erro"'
    "\n\nA frog and Neymar."
)


class TestElenco:
    """D-840: a foto de quem a capa desenha vai junto das fichas."""

    def test_elenco_traz_a_foto_de_quem_tem_e_nada_de_quem_nao_tem(self, retratos):
        elenco = asyncio.run(capa_no_chatgpt.elenco_do_prompt(PROMPT_COM_ELENCO))

        assert elenco == [
            {"nome": "Neymar", "slug": "neymar"},
            {"nome": "Fulano Sem Foto", "slug": None},
            {"nome": "Erro", "slug": None},
        ]

    @pytest.fixture
    def robo(self, monkeypatch):
        capa_no_chatgpt.gravar_projeto(PROJETO)
        chamadas: list[tuple[str, list]] = []

        def gerar(_projeto, pedido, anexos):
            chamadas.append((pedido, anexos))
            return PNG

        monkeypatch.setattr(capa_no_chatgpt, "_gerar_no_navegador", gerar)
        return chamadas

    def test_sem_elenco_conferido_le_do_prompt_e_anexa_depois_das_fichas(self, retratos, robo):
        capa_no_chatgpt.salvar_ficha("poses.png", PNG)

        asyncio.run(capa_no_chatgpt.gerar_imagem(PROMPT_COM_ELENCO, "16:9"))

        pedido, anexos = robo[0]
        assert [a.name for a in anexos] == ["poses.png", "neymar.jpg"]
        assert "neymar.jpg = Neymar" in pedido
        assert "= Fulano" not in pedido

    def test_elenco_conferido_manda_mesmo_vazio(self, retratos, robo):
        asyncio.run(capa_no_chatgpt.gerar_imagem(PROMPT_COM_ELENCO, "16:9", pessoas=[]))

        assert robo[0][1] == []
        assert retratos == []
