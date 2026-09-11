"""D-564 onda 3: o roteiro do Reels, testado sem navegador nenhum.

O que estes testes NÃO provam, e vale dizer em voz alta: que os seletores achem
os elementos no Instagram de hoje. Eles não foram medidos na página real — a
sessão logada é do operador. Isso só a primeira execução real diz, e é por isso
que o roteiro foi escrito para falhar dizendo QUAL passo quebrou.

O que eles provam é a SEQUÊNCIA, que é onde mora o comportamento: quantas etapas
de "Avançar" ele aguenta, o que acontece quando a sessão caiu, e — o mais
importante — que fechar o compositor sozinho NÃO conta como publicação.
"""

from pathlib import Path

import pytest
from app.domain.instagram_reels import (
    ORIENTACOES,
    PASSOS,
    ROTULOS,
    Passo,
    RoteiroInterrompido,
    pede_login,
    publicou,
)
from app.services import instagram_reels

FEED = "https://www.instagram.com/"
LOGIN = "https://www.instagram.com/accounts/login/?next=%2F"


class PaginaFalsa:
    """Dublê do compositor do Instagram.

    `etapas` é quantas telas de "Avançar" existem antes da legenda — é o número
    que o Instagram muda sozinho, e o motivo de o roteiro não contar cliques.
    """

    def __init__(
        self, *, url=FEED, etapas=2, falhar=(), ausentes=(), confirma_ao_compartilhar=True
    ):
        self.url = url
        self.etapas = etapas
        self.falhar = set(falhar)
        self.ausentes = set(ausentes)
        # MEDIDO em 10/09/2026: compartilhar NAO fecha o compositor — ele e
        # substituido por um dialogo de confirmacao. O duble imita isso.
        self.confirma_ao_compartilhar = confirma_ao_compartilhar
        self.cliques: list[str] = []
        self.escrito: dict[str, str] = {}
        self.marca = ""
        self.dialogo_aberto = True
        self.confirmado = False

    def _registrar(self, verbo, alvo):
        self.cliques.append(f"{verbo}:{alvo}")
        if alvo in self.falhar:
            raise RuntimeError(f"seletor {alvo} nao casou")

    def abrir(self, url, *, segundos):
        pass

    def url_atual(self):
        return self.url

    def enviar_arquivo(self, alvo, caminho, *, segundos):
        self._registrar("enviar", alvo)

    def escrever(self, alvo, texto, *, segundos):
        self._registrar("escrever", alvo)
        self.escrito[alvo] = texto

    def texto_de(self, alvo):
        return self.escrito.get(alvo, "")

    def atributo_de(self, alvo, atributo):
        return ""

    def esperar_sumir(self, alvo, *, segundos):
        pass

    def clicar(self, alvo, *, segundos):
        self._registrar("clicar", alvo)
        if alvo == "botao_avancar":
            self.etapas = max(0, self.etapas - 1)
        if alvo == "botao_compartilhar" and self.confirma_ao_compartilhar:
            self.confirmado = True

    def existe(self, alvo, *, segundos, visivel=True):
        if alvo in self.ausentes:
            return False
        if alvo == "editor_da_legenda":
            # A legenda só aparece depois de vencidas as etapas intermediárias.
            return self.etapas == 0
        if alvo == "dialogo":
            return self.dialogo_aberto
        if alvo == "confirmacao_de_envio":
            return self.confirmado
        if alvo == "botao_concluir":
            return self.confirmado
        return True

    def remover(self, alvo):
        pass

    def esperar_texto(self, alvo, padrao, *, segundos):
        pass

    def esperar_habilitado(self, alvo, *, segundos):
        self._registrar("habilitar", alvo)

    def marcar(self, nome):
        self.marca = nome

    def nome_da_janela(self):
        return self.marca


@pytest.fixture
def video(tmp_path):
    caminho = tmp_path / "short.mp4"
    caminho.write_bytes(b"video")
    return caminho


@pytest.fixture(autouse=True)
def sem_espera_real(monkeypatch):
    monkeypatch.setattr(instagram_reels, "INTERVALO_DA_VIGILIA", 0.0)
    monkeypatch.setattr(instagram_reels, "SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO", 0.2)


class TestCaminhoFeliz:
    def test_faz_todos_os_passos_e_nao_compartilha(self, video):
        pagina = PaginaFalsa()

        relatorio = instagram_reels.executar_roteiro(pagina, video=video, legenda="o gancho")

        assert relatorio["passos"] == [
            "abrir",
            "sessao",
            "compositor",
            "arquivo",
            "avancar",
            "legenda",
            "revisao",
        ]
        assert "clicar:botao_compartilhar" not in pagina.cliques
        assert relatorio["publicado"] is False

    def test_a_legenda_vai_inteira_para_a_caixa(self, video):
        pagina = PaginaFalsa()
        legenda = "O juro composto\n\nCorte completo: x #pix"

        instagram_reels.executar_roteiro(pagina, video=video, legenda=legenda)

        assert pagina.escrito["editor_da_legenda"] == legenda

    def test_o_arquivo_vai_antes_de_avancar(self, video):
        """Avançar sem vídeo levaria o compositor a uma etapa que não existe."""
        pagina = PaginaFalsa()

        instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        envio = pagina.cliques.index("enviar:campo_do_arquivo")
        avanco = pagina.cliques.index("clicar:botao_avancar")
        assert envio < avanco


class TestEtapasDoCompositor:
    def test_clica_avancar_quantas_vezes_precisar(self, video):
        """Três etapas hoje, uma amanhã: o roteiro espera pela LEGENDA."""
        pagina = PaginaFalsa(etapas=3)

        instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert pagina.cliques.count("clicar:botao_avancar") == 3

    def test_sem_etapa_nenhuma_nao_clica_avancar(self, video):
        pagina = PaginaFalsa(etapas=0)

        instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert "clicar:botao_avancar" not in pagina.cliques

    def test_etapas_demais_interrompem_em_vez_de_girar_em_falso(self, video):
        pagina = PaginaFalsa(etapas=99)

        with pytest.raises(RoteiroInterrompido) as erro:
            instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert erro.value.passo is Passo.AVANCAR
        assert pagina.cliques.count("clicar:botao_avancar") == instagram_reels.MAXIMO_DE_AVANCOS


class TestSessao:
    def test_redirecionado_para_o_login_manda_logar(self, video):
        pagina = PaginaFalsa(url=LOGIN)

        with pytest.raises(RoteiroInterrompido) as erro:
            instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert erro.value.passo is Passo.SESSAO
        assert "Faca login" in str(erro.value)

    def test_nao_tenta_subir_nada_sem_sessao(self, video):
        pagina = PaginaFalsa(url=LOGIN)

        with pytest.raises(RoteiroInterrompido):
            instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert pagina.cliques == []

    def test_home_que_nao_carrega_nao_vira_culpa_do_login(self, video):
        """Diagnóstico errado manda o operador consertar o que não está quebrado.

        Sem botão de criar E sem marca de login: a sessão está de pé e o que
        mudou foi o menu. Dizer SESSAO aqui mandaria o operador logar de novo
        para resolver um problema que não é dele.
        """
        pagina = PaginaFalsa(ausentes=("botao_criar", "marca_de_login"))

        with pytest.raises(RoteiroInterrompido) as erro:
            instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert erro.value.passo is Passo.COMPOSITOR

    def test_compositor_que_nao_abre_interrompe_com_o_passo(self, video):
        pagina = PaginaFalsa(ausentes=("campo_do_arquivo",))

        with pytest.raises(RoteiroInterrompido) as erro:
            instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert erro.value.passo is Passo.COMPOSITOR
        assert "nao abriu" in str(erro.value)


class TestCompartilharSozinho:
    def test_desligado_o_robo_nao_compartilha(self, video):
        """O padrão, e o mais importante deste arquivo."""
        pagina = PaginaFalsa()

        instagram_reels.executar_roteiro(pagina, video=video, legenda="oi")

        assert "clicar:botao_compartilhar" not in pagina.cliques

    def test_ligado_ele_clica_e_confirma_pelo_modal_fechar(self, video):
        pagina = PaginaFalsa()

        relatorio = instagram_reels.executar_roteiro(
            pagina, video=video, legenda="oi", publicar_sozinho=True
        )

        assert "clicar:botao_compartilhar" in pagina.cliques
        assert relatorio["publicado"] is True
        assert Passo.PUBLICAR.value in relatorio["passos"]

    def test_sem_confirmacao_nao_conta_como_publicado(self, video):
        """Clicar nao e publicar: o Instagram pode barrar com um aviso na propria
        tela. So a confirmacao prova."""
        pagina = PaginaFalsa(confirma_ao_compartilhar=False)

        with pytest.raises(RoteiroInterrompido) as erro:
            instagram_reels.executar_roteiro(
                pagina, video=video, legenda="oi", publicar_sozinho=True
            )

        assert erro.value.passo is Passo.PUBLICAR
        assert "confirmacao" in str(erro.value)

    def test_depois_de_confirmar_ele_fecha_a_confirmacao(self, video):
        """Senao o item seguinte do lote encontraria a confirmacao do anterior
        empilhada por cima do compositor."""
        pagina = PaginaFalsa()

        instagram_reels.executar_roteiro(pagina, video=video, legenda="oi", publicar_sozinho=True)

        assert "clicar:botao_concluir" in pagina.cliques


class TestSinalDePublicacao:
    def test_sem_confirmacao_na_tela_nao_houve_publicacao(self):
        """O ponto mais importante do dominio do Instagram.

        Descartar tira o compositor da frente igualzinho a publicar. Tratar o
        sumico como publicacao marcaria como no ar um video que ninguem postou —
        e a marca libera a limpeza do MP4 (D-512), cuja volta e render novo.
        """
        assert publicou(confirmacao_visivel=False) is False

    def test_a_confirmacao_na_tela_e_a_prova(self):
        """MEDIDO publicando de verdade: "Seu reel foi compartilhado." num
        dialogo que SUBSTITUI o compositor — ele nao fecha."""
        assert publicou(confirmacao_visivel=True) is True

    def test_a_url_do_instagram_nao_serve_de_sinal(self):
        """Ao contrário do TikTok: aqui o compositor é modal e a URL não muda."""
        assert pede_login(FEED) is False
        assert pede_login(LOGIN) is True


class TestContrato:
    def test_todo_passo_tem_rotulo_e_orientacao(self):
        """Passo novo sem orientação vira uma falha muda — o oposto do desenho."""
        assert set(ROTULOS) == set(PASSOS)
        assert set(ORIENTACOES) == set(PASSOS)

    def test_o_perfil_do_instagram_nao_e_o_do_tiktok(self, monkeypatch, tmp_path):
        """Perfil compartilhado faria um Chrome herdar cookies do outro."""
        from app.services import navegador_assistido, tiktok_studio

        monkeypatch.setattr(navegador_assistido, "active_channel_root", lambda: tmp_path / "canal")

        assert instagram_reels.perfil_do_chrome() != tiktok_studio.perfil_do_chrome()
        assert instagram_reels.perfil_do_chrome().name == "instagram"

    def test_os_dois_robos_nunca_dividem_a_porta(self, monkeypatch, tmp_path):
        """Duas sessões, dois Chromes, duas portas — senão um mata o outro."""
        from app.services import navegador_assistido, tiktok_studio
        from app.services.navegador_assistido import porta_do_chrome

        monkeypatch.setattr(navegador_assistido, "active_channel_root", lambda: tmp_path / "canal")

        assert porta_do_chrome(instagram_reels.perfil_do_chrome()) != porta_do_chrome(
            tiktok_studio.perfil_do_chrome()
        )

    def test_o_roteiro_nao_conhece_a_senha_de_ninguem(self):
        """Guarda de intencao: se um dia alguem 'resolver' o login, isto quebra.

        A lista proibe VERBOS de credencial, e nao a palavra "password" solta —
        `input[type="password"]` aparece no `marca_de_login`, e ele existe para
        o oposto do que esta guarda teme: e como o roteiro RECONHECE uma tela de
        login e PARA, em vez de tentar passar por ela.
        """
        fonte = Path(instagram_reels.__file__).read_text(encoding="utf-8").lower()

        for proibido in ("senha =", "captcha_solver", "type_password", "fill_password"):
            assert proibido not in fonte

        # E o que ele faz com a senha e so isto: reconhecer o campo para desistir.
        assert 'input[type="password"]' in fonte
        assert "keyboard.type" not in fonte


@pytest.mark.asyncio
async def test_recusa_video_que_nao_esta_em_disco(tmp_path):
    with pytest.raises(RoteiroInterrompido) as erro:
        await instagram_reels.subir_assistido(video=tmp_path / "sumiu.mp4", legenda="oi")

    assert erro.value.passo is Passo.ARQUIVO
