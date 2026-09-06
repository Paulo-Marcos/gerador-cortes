"""D-537: o roteiro do upload assistido, testado sem navegador nenhum.

Automacao de navegador tem fama de nao ser testavel, e a fama vem de um erro de
enderecamento: o que quebra quase nunca e o Playwright, e sim a SEQUENCIA — a
ordem dos passos, o que acontece quando um falha, o que a tela conta depois.
Nada disso precisa de Chrome.

O que continua sem cobertura, e vale dizer em voz alta: os SELETORES. Nenhum
teste aqui prova que `botao_da_capa` acha o botao da capa no TikTok de hoje.
Isso so a primeira execucao real diz — e por isso o roteiro foi desenhado para
falhar dizendo QUAL passo quebrou, em vez de morrer com um timeout anonimo.
"""

from pathlib import Path

import pytest
from app.domain.tiktok_studio import ORIENTACOES, PASSOS, ROTULOS, Passo, RoteiroInterrompido
from app.services import tiktok_studio


class PaginaFalsa:
    """Um dublê que registra o que pediram e obedece — ou falha sob encomenda."""

    def __init__(self, *, url="https://www.tiktok.com/tiktokstudio/upload", falhar=()):
        self.url = url
        self.falhar = set(falhar)
        self.chamadas: list[tuple] = []
        self.ausentes: set[str] = set()

    def _registrar(self, verbo, alvo):
        self.chamadas.append((verbo, alvo))
        if alvo in self.falhar:
            raise RuntimeError(f"seletor {alvo} nao casou")

    def abrir(self, url, *, segundos):
        self._registrar("abrir", "pagina")

    def url_atual(self):
        return self.url

    def enviar_arquivo(self, alvo, caminho, *, segundos):
        self._registrar("enviar", alvo)

    def escrever(self, alvo, texto, *, segundos):
        self.chamadas.append(("escrever", alvo, texto))
        if alvo in self.falhar:
            raise RuntimeError(f"seletor {alvo} nao casou")

    def clicar(self, alvo, *, segundos):
        self._registrar("clicar", alvo)

    def existe(self, alvo, *, segundos, visivel=True):
        self.chamadas.append(("existe", alvo))
        return alvo not in self.ausentes

    def esperar_habilitado(self, alvo, *, segundos):
        self._registrar("habilitado", alvo)


@pytest.fixture
def arquivos(tmp_path):
    video = tmp_path / "video.mp4"
    video.write_bytes(b"mp4")
    capa = tmp_path / "capa.png"
    capa.write_bytes(b"png")
    return video, capa


def _rodar(pagina, arquivos, **kwargs):
    video, capa = arquivos
    return tiktok_studio.executar_roteiro(
        pagina,
        video=video,
        legenda=kwargs.pop("legenda", "O juro composto\n\n#pix"),
        capa=kwargs.pop("capa", capa),
    )


class TestCaminhoFeliz:
    def test_faz_os_cinco_passos_e_nao_publica(self, arquivos):
        pagina = PaginaFalsa()

        relatorio = _rodar(pagina, arquivos)

        assert relatorio["capa_aplicada"] is True
        assert relatorio["publicado"] is False
        assert ("clicar", "botao_publicar") not in pagina.chamadas

    def test_a_legenda_vai_inteira_para_a_caixa(self, arquivos):
        pagina = PaginaFalsa()

        _rodar(pagina, arquivos, legenda="TODO MUNDO ASSINOU\n\n#pix #economia")

        escritas = [c for c in pagina.chamadas if c[0] == "escrever"]
        assert escritas == [
            ("escrever", "editor_da_legenda", "TODO MUNDO ASSINOU\n\n#pix #economia")
        ]

    def test_escreve_antes_de_esperar_o_processamento(self, arquivos):
        """A ordem que um humano usa: enquanto a barra sobe, ele digita.

        Esperar primeiro somaria os dois tempos por nada — e o teste existe
        porque a ordem "obvia" (subir, esperar, escrever) e a errada.
        """
        pagina = PaginaFalsa()

        _rodar(pagina, arquivos)

        verbos = [c[1] if c[0] != "escrever" else "editor_da_legenda" for c in pagina.chamadas]
        assert verbos.index("editor_da_legenda") < verbos.index("botao_publicar")

    def test_o_resumo_lista_so_o_que_aconteceu(self, arquivos):
        relatorio = _rodar(PaginaFalsa(), arquivos)

        assert "enviando o vídeo" in relatorio["resumo"]
        assert "trocando a capa" in relatorio["resumo"]


class TestSessao:
    def test_redirecionado_para_o_login_manda_logar(self, arquivos):
        """O TikTok nao devolve 401: redireciona.

        Sem esta checagem o roteiro procuraria o campo de arquivo numa tela de
        login e reportaria "a pagina mudou de layout" — mandando o operador
        investigar um problema que nao existe.
        """
        pagina = PaginaFalsa(url="https://www.tiktok.com/login?redirect_url=%2Fupload")

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        assert erro.value.passo is Passo.SESSAO
        assert "login" in str(erro.value).lower()

    def test_nao_tenta_subir_nada_sem_sessao(self, arquivos):
        pagina = PaginaFalsa(url="https://www.tiktok.com/login")

        with pytest.raises(RoteiroInterrompido):
            _rodar(pagina, arquivos)

        assert not [c for c in pagina.chamadas if c[0] == "enviar"]

    def test_redirecionamento_que_chega_atrasado_tambem_e_pego(self, arquivos):
        """O defeito que o primeiro teste de fumaca encontrou.

        O TikTok redireciona para o login pelo CLIENTE, depois que o `goto`
        retornou. Checar a URL so naquele instante pegava a antiga, e o roteiro
        gastava 30s procurando o campo de arquivo numa tela de login — para
        entao dizer "a pagina mudou de layout", que e o diagnostico errado.
        """

        class RedirecionaDepois(PaginaFalsa):
            def existe(self, alvo, *, segundos, visivel=True):
                self.url = "https://www.tiktok.com/login?redirect_url=x"
                return False

        pagina = RedirecionaDepois()

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        assert erro.value.passo is Passo.SESSAO

    def test_pagina_que_nao_carrega_nao_vira_culpa_do_login(self, arquivos):
        """Sem campo E sem login e outro problema: a pagina mudou.

        Mandar o operador logar quando ele JA esta logado o faz procurar no
        lugar errado — o oposto do que este passo promete.
        """
        pagina = PaginaFalsa()
        pagina.ausentes.add("campo_do_arquivo")

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        assert erro.value.passo is Passo.ARQUIVO

    def test_o_campo_de_arquivo_e_procurado_sem_exigir_visibilidade(self, arquivos):
        """A area de arrastar e a fachada de um <input type=file> escondido.

        Exigir visibilidade daria falso negativo em toda pagina de upload
        legitima — o robo diria "nao carregou" com a pagina na tela.
        """
        vistos = []

        class Anota(PaginaFalsa):
            def existe(self, alvo, *, segundos, visivel=True):
                vistos.append((alvo, visivel))
                return alvo not in self.ausentes

        _rodar(Anota(), arquivos)

        assert ("campo_do_arquivo", False) in vistos


class TestFalhas:
    def test_arquivo_recusado_interrompe_com_o_passo(self, arquivos):
        pagina = PaginaFalsa(falhar={"campo_do_arquivo"})

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        assert erro.value.passo is Passo.ARQUIVO

    def test_legenda_sem_caixa_interrompe(self, arquivos):
        pagina = PaginaFalsa(falhar={"editor_da_legenda"})

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        assert erro.value.passo is Passo.LEGENDA

    def test_o_detalhe_tecnico_viaja_junto_mas_no_fim(self, arquivos):
        """Quem le primeiro precisa da acao; o seletor que falhou vem depois."""
        pagina = PaginaFalsa(falhar={"campo_do_arquivo"})

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        mensagem = str(erro.value)
        assert mensagem.startswith("A pagina de upload nao aceitou")
        assert mensagem.endswith(")")

    def test_processamento_que_nao_termina_interrompe(self, arquivos):
        pagina = PaginaFalsa(falhar={"botao_publicar"})

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        assert erro.value.passo is Passo.PROCESSAMENTO


class TestCapa:
    """A capa e o unico passo que reporta em vez de interromper."""

    def test_capa_que_falha_nao_derruba_o_upload(self, arquivos):
        pagina = PaginaFalsa(falhar={"campo_da_capa"})

        relatorio = _rodar(pagina, arquivos)

        assert relatorio["capa_aplicada"] is False
        assert relatorio["avisos"]
        assert Passo.PROCESSAMENTO.value in relatorio["passos"]

    def test_sem_botao_de_capa_o_aviso_diz_isso(self, arquivos):
        pagina = PaginaFalsa()
        pagina.ausentes.add("botao_da_capa")

        relatorio = _rodar(pagina, arquivos)

        assert relatorio["capa_aplicada"] is False
        assert "editar capa" in relatorio["avisos"][0].lower()

    def test_corte_sem_capa_sobe_do_mesmo_jeito(self, arquivos):
        relatorio = _rodar(PaginaFalsa(), arquivos, capa=None)

        assert relatorio["capa_aplicada"] is False
        assert relatorio["avisos"] == []

    def test_capa_apagada_por_fora_vira_aviso(self, arquivos, tmp_path):
        """O caminho estava no pacote, o arquivo sumiu depois. Nao e erro: e aviso."""
        relatorio = _rodar(PaginaFalsa(), arquivos, capa=tmp_path / "nao-existe.png")

        assert relatorio["capa_aplicada"] is False
        assert "congelar um frame" in relatorio["avisos"][0]

    def test_a_confirmacao_do_modal_e_opcional(self, arquivos):
        """Nem toda versao do modal tem botao de confirmar; a ausencia nao e falha."""
        pagina = PaginaFalsa()
        pagina.ausentes.add("confirmar_capa")

        relatorio = _rodar(pagina, arquivos)

        assert relatorio["capa_aplicada"] is True


class TestContrato:
    def test_todo_alvo_do_roteiro_existe_na_tabela(self, arquivos):
        """Um alvo com erro de digitacao so apareceria as onze da noite.

        O roteiro pede alvos por nome; `PaginaDoPlaywright` os resolve em
        `SELETORES`. Um nome que nao esta la levanta KeyError no meio do
        upload — este teste puxa isso para o pytest.
        """
        pagina = PaginaFalsa()
        _rodar(pagina, arquivos)

        pedidos = {c[1] for c in pagina.chamadas} - {"pagina"}
        assert pedidos <= set(tiktok_studio.SELETORES)

    def test_todo_passo_tem_rotulo_e_orientacao(self):
        """Passo novo sem orientacao vira uma falha muda — o oposto do desenho."""
        assert set(ROTULOS) == set(PASSOS)
        assert set(ORIENTACOES) == set(PASSOS)

    def test_o_perfil_do_chrome_e_por_canal(self, monkeypatch, tmp_path):
        """Quem tem dois canais tem duas contas.

        Um perfil global faria o segundo canal publicar no primeiro — sem erro
        nenhum, que e o pior jeito de errar.
        """
        monkeypatch.setattr(tiktok_studio, "active_channel_root", lambda: tmp_path / "canal-b")

        assert tiktok_studio.perfil_do_chrome() == tmp_path / "canal-b" / "browser" / "tiktok"


@pytest.mark.asyncio
async def test_video_sumido_recusa_antes_de_abrir_o_navegador(tmp_path):
    """Abrir o Chrome para descobrir que nao ha arquivo e desperdicio e susto."""
    with pytest.raises(RoteiroInterrompido) as erro:
        await tiktok_studio.subir_assistido(
            video=tmp_path / "nao-existe.mp4", legenda="x", capa=None
        )

    assert erro.value.passo is Passo.ARQUIVO


def test_a_porta_de_depuracao_nao_e_a_do_dev(tmp_path):
    """8000/4300 sao PROD e 8002/4304 o DEV; colidir aqui derrubaria um deles."""
    assert tiktok_studio.PORTA_DE_DEPURACAO not in {8000, 8002, 4300, 4304, 3200}


def test_o_roteiro_nao_conhece_a_senha_de_ninguem():
    """Guarda de intencao: se um dia alguem 'resolver' o login, isto quebra."""
    fonte = Path(tiktok_studio.__file__).read_text(encoding="utf-8").lower()

    for proibido in ("password", "senha =", "captcha_solver", "type_password"):
        assert proibido not in fonte
