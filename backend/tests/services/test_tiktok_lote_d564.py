"""D-564: a marca da aba e o publicar automático — sem navegador nenhum.

Duas coisas mudam no roteiro da D-537, e as duas por causa do LOTE:

  1. a aba ganha uma etiqueta. Sem ela a vigília procurava "alguma aba em
     /upload", o que basta com um upload por vez e vira loteria com dois — e
     marcar o vídeo errado como publicado libera a limpeza do MP4 (D-512);
  2. o robô pode apertar *Publicar*, mas só com o interruptor ligado. O que se
     testa aqui é justamente que, desligado, ele NÃO aperta.
"""

from pathlib import Path

import pytest
from app.domain.tiktok_studio import (
    Passo,
    RoteiroInterrompido,
    e_a_aba_marcada,
    marca_da_aba,
    porta_de_depuracao,
)
from app.services import tiktok_studio

NA_PAGINA_DE_UPLOAD = "https://www.tiktok.com/tiktokstudio/upload?from=upload"
DEPOIS_DE_PUBLICAR = "https://www.tiktok.com/tiktokstudio/content"


class PaginaFalsa:
    """Dublê enxuto: registra cliques, guarda a etiqueta e pode navegar sozinho.

    `navega_ao_publicar` é o que separa "cliquei" de "publicou" — a mesma
    assimetria que o roteiro de verdade usa como prova.
    """

    def __init__(self, *, navega_ao_publicar=True, marcar_falha=False):
        self.url = NA_PAGINA_DE_UPLOAD
        self.navega_ao_publicar = navega_ao_publicar
        self.marcar_falha = marcar_falha
        self.cliques: list[str] = []
        self.marca = ""
        self.escrito: dict[str, str] = {}

    def abrir(self, url, *, segundos):
        pass

    def url_atual(self):
        return self.url

    def enviar_arquivo(self, alvo, caminho, *, segundos):
        pass

    def escrever(self, alvo, texto, *, segundos):
        self.escrito[alvo] = texto

    def texto_de(self, alvo):
        if alvo == "status_do_upload":
            return "short.mp4\n1080P\nEnviado（1MB）"  # o cartao MEDIDO ao terminar
        return self.escrito.get(alvo, "")

    def atributo_de(self, alvo, atributo):
        return "blob:x"

    def esperar_sumir(self, alvo, *, segundos):
        pass

    def clicar(self, alvo, *, segundos):
        self.cliques.append(alvo)
        if alvo == "botao_publicar" and self.navega_ao_publicar:
            self.url = DEPOIS_DE_PUBLICAR

    def existe(self, alvo, *, segundos, visivel=True):
        # O tour nunca aparece neste dublê; o resto do DOM está lá.
        return alvo not in ("overlay_do_tutorial", "tutorial")

    def remover(self, alvo):
        pass

    def esperar_texto(self, alvo, padrao, *, segundos):
        pass

    def esperar_habilitado(self, alvo, *, segundos):
        pass

    def marcar(self, nome):
        if self.marcar_falha:
            raise RuntimeError("a aba nao aceitou a etiqueta")
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
    """O roteiro espera de 3 em 3 segundos; num teste isso é só demora."""
    monkeypatch.setattr(tiktok_studio, "INTERVALO_DA_VIGILIA", 0.0)
    monkeypatch.setattr(tiktok_studio, "INTERVALO_DO_ENVIO", 0.0)
    monkeypatch.setattr(tiktok_studio, "SEGUNDOS_PARA_CONFIRMAR_PUBLICACAO", 0.2)


class TestMarcaDaAba:
    def test_a_aba_recebe_a_etiqueta_do_item(self, video):
        pagina = PaginaFalsa()

        tiktok_studio.executar_roteiro(
            pagina, video=video, legenda="oi", capa=None, marca="cortadorlive-abc"
        )

        assert pagina.marca == "cortadorlive-abc"

    def test_sem_marca_a_aba_nao_e_etiquetada(self, video):
        """O botão avulso do TikTok (D-537) continua como era."""
        pagina = PaginaFalsa()

        tiktok_studio.executar_roteiro(pagina, video=video, legenda="oi", capa=None)

        assert pagina.marca == ""

    def test_falhar_ao_marcar_nao_derruba_o_upload_ja_feito(self, video):
        """Perder 300 MB de upload por causa de um `window.name` seria trocar o
        principal pelo acessório."""
        pagina = PaginaFalsa(marcar_falha=True)

        relatorio = tiktok_studio.executar_roteiro(
            pagina, video=video, legenda="oi", capa=None, marca="cortadorlive-abc"
        )

        assert Passo.REVISAO.value in relatorio["passos"]
        assert relatorio["publicado"] is False

    def test_duas_abas_do_mesmo_lote_tem_marcas_diferentes(self):
        assert marca_da_aba("a1") != marca_da_aba("b2")
        assert e_a_aba_marcada(marca_da_aba("a1"), marca_da_aba("a1")) is True
        assert e_a_aba_marcada(marca_da_aba("a1"), marca_da_aba("b2")) is False

    def test_sem_marca_qualquer_aba_serve(self):
        """É o critério antigo, e ele continua valendo onde não há lote."""
        assert e_a_aba_marcada("qualquer coisa", "") is True


class TestPublicarSozinho:
    def test_desligado_o_robo_nao_aperta_o_botao(self, video):
        """O padrão, e o mais importante deste arquivo."""
        pagina = PaginaFalsa()

        relatorio = tiktok_studio.executar_roteiro(pagina, video=video, legenda="oi", capa=None)

        assert "botao_publicar" not in pagina.cliques
        assert relatorio["publicado"] is False

    def test_ligado_ele_clica_e_confirma_pela_navegacao(self, video):
        pagina = PaginaFalsa()

        relatorio = tiktok_studio.executar_roteiro(
            pagina, video=video, legenda="oi", capa=None, publicar_sozinho=True
        )

        assert "botao_publicar" in pagina.cliques
        assert relatorio["publicado"] is True
        assert Passo.PUBLICAR.value in relatorio["passos"]

    def test_clicar_sem_a_pagina_navegar_nao_conta_como_publicado(self, video):
        """O TikTok recusa com um aviso NA PRÓPRIA página e fica onde está —
        um clique aceito não é um post publicado."""
        pagina = PaginaFalsa(navega_ao_publicar=False)

        with pytest.raises(RoteiroInterrompido) as erro:
            tiktok_studio.executar_roteiro(
                pagina, video=video, legenda="oi", capa=None, publicar_sozinho=True
            )

        assert erro.value.passo is Passo.PUBLICAR
        assert "nao saiu do upload" in str(erro.value)

    def test_a_marca_e_colada_antes_de_publicar(self, video):
        """Senão a aba navegaria sem etiqueta e a vigília a perderia."""
        pagina = PaginaFalsa()

        tiktok_studio.executar_roteiro(
            pagina,
            video=video,
            legenda="oi",
            capa=None,
            marca="cortadorlive-xyz",
            publicar_sozinho=True,
        )

        assert pagina.marca == "cortadorlive-xyz"
        assert pagina.url == DEPOIS_DE_PUBLICAR


class TestSubirAssistido:
    @pytest.mark.asyncio
    async def test_recusa_video_que_nao_esta_em_disco(self, tmp_path):
        with pytest.raises(RoteiroInterrompido) as erro:
            await tiktok_studio.subir_assistido(
                video=Path(tmp_path / "sumiu.mp4"), legenda="oi", marca="cortadorlive-abc"
            )

        assert erro.value.passo is Passo.ARQUIVO


class TestPortaPorPerfil:
    """D-564: a porta de depuração é do PERFIL, e não da máquina.

    Este teste existe por causa de um acidente real: o backend de DEV achou um
    Chrome vivo na porta 9222, concluiu "já tem um aberto" e conectou — só que
    aquele Chrome era o de PRODUÇÃO, com a conta do canal logada. Nada foi
    publicado, mas o robô abriu uma aba no navegador errado.
    """

    def test_perfis_diferentes_nunca_dividem_a_porta(self):
        prod = r"C:\App\gerador-cortes\instance\channels\default\browser\tiktok"
        dev = r"C:\DEV\gerador-cortes\instance\channels\seucanal\browser\tiktok"

        assert porta_de_depuracao(prod) != porta_de_depuracao(dev)

    def test_a_porta_do_mesmo_perfil_e_sempre_a_mesma(self):
        """Senão o item seguinte do lote não reencontraria a janela aberta."""
        perfil = r"C:\App\gerador-cortes\instance\channels\default\browser\tiktok"

        assert porta_de_depuracao(perfil) == porta_de_depuracao(perfil)

    def test_maiusculas_do_windows_nao_criam_um_segundo_chrome(self):
        r"""`C:\App` e `c:\app` são a mesma pasta — e o Chrome recusa dois
        processos sobre o mesmo perfil."""
        assert porta_de_depuracao("C:/App/x") == porta_de_depuracao("c:/app/x")

    def test_a_porta_fica_numa_faixa_que_nao_pisa_no_app(self):
        portas = {porta_de_depuracao(f"C:/perfil/{i}") for i in range(300)}

        assert portas.isdisjoint({8000, 8002, 8003, 4300, 4304, 4305, 3200})
        assert all(9222 <= p < 9322 for p in portas)
