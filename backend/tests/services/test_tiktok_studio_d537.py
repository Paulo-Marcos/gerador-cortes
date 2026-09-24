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
from app.domain.publicacao.tiktok_studio import (
    ORIENTACOES,
    PASSOS,
    ROTULOS,
    Passo,
    RoteiroInterrompido,
    publicou,
)
from app.services import tiktok_studio


class PaginaFalsa:
    """Um dublê que registra o que pediram e obedece — ou falha sob encomenda."""

    def __init__(self, *, url="https://www.tiktok.com/tiktokstudio/upload", falhar=()):
        self.url = url
        self.falhar = set(falhar)
        self.chamadas: list[tuple] = []
        self.ausentes: set[str] = set()
        # D-545: a pagina passou a ser LIDA de volta, entao o duble precisa
        # guardar o que foi escrito — e poder mentir sobre isso, que e como se
        # reproduz o preenchimento automatico do TikTok por cima do texto.
        self.escrito: dict[str, str] = {}
        self.sobrescreve = 0
        self.miniatura = "blob:antes"
        # D-580: os campos de data e hora sao `readonly` e so mudam por clique
        # no seletor. O duble imita isso — escrever neles nao existe.
        self.campos = {"campo_da_data": "2026-09-12", "campo_da_hora": "00:00"}
        self.mes_visivel = "2026-09"
        # Opcoes que o seletor NAO oferece, no formato "chave:texto". E assim
        # que se encena "esse dia esta fora da janela de agendamento".
        self.opcoes_ausentes: set[str] = set()
        # Quantas vezes o seletor de minuto se fecha sozinho antes de aceitar.
        self.minutos_teimosos = 0

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
        self.escrito[alvo] = texto

    def texto_de(self, alvo):
        self.chamadas.append(("ler", alvo))
        if alvo == "status_do_upload":
            # O cartao MEDIDO quando o arquivo terminou de subir. Falhando, ele
            # nunca mostra nada — nem percentual, nem "Enviado".
            return "" if alvo in self.falhar else "video.mp4\n1080P\nEnviado（1MB）"
        if self.sobrescreve > 0:
            # O TikTok acabou de por o nome do arquivo por cima do que
            # escrevemos — exatamente o que acontecia no upload de verdade.
            self.sobrescreve -= 1
            return "grande"
        return self.escrito.get(alvo, "")

    def atributo_de(self, alvo, atributo):
        return self.miniatura

    def esperar_sumir(self, alvo, *, segundos):
        self.chamadas.append(("sumir", alvo))
        self.ausentes.add(alvo)

    def clicar(self, alvo, *, segundos):
        self._registrar("clicar", alvo)
        if alvo == "confirmar_capa":
            self.miniatura = "blob:depois"
        if alvo == "mes_seguinte":
            ano, mes = (int(x) for x in self.mes_visivel.split("-"))
            ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
            self.mes_visivel = f"{ano}-{mes:02d}"
            self.opcoes_ausentes = {o for o in self.opcoes_ausentes if not o.startswith("dia_")}

    def existe(self, alvo, *, segundos, visivel=True):
        self.chamadas.append(("existe", alvo))
        return alvo not in self.ausentes

    def remover(self, alvo):
        self.chamadas.append(("remover", alvo))
        self.ausentes.add(alvo)

    def esperar_texto(self, alvo, padrao, *, segundos):
        self.chamadas.append(("texto", alvo))
        if alvo in self.falhar:
            raise RuntimeError(f"texto de {alvo} nunca apareceu")

    def esperar_habilitado(self, alvo, *, segundos):
        self._registrar("habilitado", alvo)

    def clicar_opcao(self, alvo, texto, *, segundos):
        self.chamadas.append(("opcao", alvo, texto))
        if f"{alvo}:{texto}" in self.opcoes_ausentes:
            return False
        if alvo == "dia_do_calendario":
            self.campos["campo_da_data"] = f"{self.mes_visivel}-{texto.zfill(2)}"
        elif alvo == "hora_do_seletor":
            _, minuto = self.campos["campo_da_hora"].split(":")
            self.campos["campo_da_hora"] = f"{texto}:{minuto}"
        elif alvo == "minuto_do_seletor":
            if self.minutos_teimosos > 0:
                self.minutos_teimosos -= 1
                return False
            hora, _ = self.campos["campo_da_hora"].split(":")
            self.campos["campo_da_hora"] = f"{hora}:{texto}"
        return True

    def valor_de(self, alvo):
        self.chamadas.append(("valor", alvo))
        return self.campos.get(alvo, "")


@pytest.fixture
def arquivos(tmp_path):
    video = tmp_path / "video.mp4"
    video.write_bytes(b"mp4")
    capa = tmp_path / "capa.png"
    capa.write_bytes(b"png")
    return video, capa


@pytest.fixture(autouse=True)
def sem_espera_no_envio(monkeypatch):
    """O acompanhamento le o cartao de meio em meio segundo; num teste e so demora."""
    monkeypatch.setattr(tiktok_studio, "INTERVALO_DO_ENVIO", 0.0)


def _rodar(pagina, arquivos, **kwargs):
    video, capa = arquivos
    return tiktok_studio.executar_roteiro(
        pagina,
        video=video,
        legenda=kwargs.pop("legenda", "O juro composto\n\n#pix"),
        capa=kwargs.pop("capa", capa),
        **kwargs,
    )


class TestCaminhoFeliz:
    def test_faz_todos_os_passos_e_nao_publica(self, arquivos):
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

    def test_escreve_DEPOIS_do_upload_terminar(self, arquivos):
        """D-545: a inversao que fez a legenda sumir no uso real.

        A ordem anterior era "escreve enquanto a barra sobe", pela analogia com
        o que uma pessoa faz. A analogia falhava num detalhe que decide tudo: ao
        aceitar o arquivo, o TikTok PREENCHE a caixa com o nome dele. Uma pessoa
        ve isso por cima do que digitou e corrige; o robo escrevia antes, era
        sobrescrito, e seguia convencido.

        Num clipe de teste de 23 KB o preenchimento chegava ANTES de nos e nada
        aparecia. Num corte de verdade chega depois. O ensaio passava e a
        execucao real falhava — a assinatura de uma corrida, nao de lentidao.
        """
        pagina = PaginaFalsa()

        _rodar(pagina, arquivos)

        ordem = [c[1] for c in pagina.chamadas]
        assert ordem.index("status_do_upload") < ordem.index("editor_da_legenda")

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

    def test_upload_incompleto_nao_devolve_a_aba_como_pronta(self, arquivos):
        """O botao de publicar acende cedo — num clipe de 23 KB ja estava aceso.

        Sozinho, ele devolveria a aba no meio do upload de um corte de 300 MB.
        O cartao de status e quem diz que o arquivo chegou inteiro.
        """
        pagina = PaginaFalsa(falhar={"status_do_upload"})

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos)

        assert erro.value.passo is Passo.PROCESSAMENTO

    def test_espera_o_status_antes_de_olhar_o_botao(self, arquivos):
        pagina = PaginaFalsa()

        _rodar(pagina, arquivos)

        ordem = [c[1] for c in pagina.chamadas]
        assert ordem.index("status_do_upload") < ordem.index("botao_publicar")


# Textos do cartao de status copiados da medicao de 14/09/2026 (short de 68 MB).
CARTAO_A_7 = "short.mp4\n1080P\n5.34MB/68.3MB\nDuração: 0m40s\nFaltam 39 segundos\nCancelar\n7.82%"
CARTAO_A_14 = (
    "short.mp4\n1080P\n9.84MB/68.3MB\nDuração: 0m40s\nFaltam 26 segundos\nCancelar\n14.41%"
)
CARTAO_A_18 = (
    "short.mp4\n1080P\n12.84MB/68.3MB\nDuração: 0m40s\nFaltam 23 segundos\nCancelar\n18.8%"
)
CARTAO_A_41 = (
    "short.mp4\n1080P\n28.1MB/68.3MB\nDuração: 0m40s\nFaltam 17 segundos\nCancelar\n41.15%"
)
CARTAO_ENVIADO = "short.mp4\n1080P\nEnviado（68.3MB）\nSubstituir"


class TestAcompanhamentoDoEnvio:
    """O percentual do envio no log, lido do cartao de status."""

    def test_le_percentual_tamanho_e_tempo_do_cartao_medido(self):
        from app.domain.publicacao.tiktok_studio import leitura_do_envio

        leitura = leitura_do_envio(CARTAO_A_14)

        assert leitura.percentual == 14.41
        assert leitura.detalhe == "9.84MB/68.3MB, faltam 26 segundos"

    def test_o_cartao_concluido_nao_tem_percentual_mas_casa_com_enviado(self):
        import re

        from app.domain.publicacao.tiktok_studio import leitura_do_envio

        assert leitura_do_envio(CARTAO_ENVIADO) is None
        assert re.search(tiktok_studio.ENVIO_CONCLUIDO, CARTAO_ENVIADO, re.IGNORECASE)

    def test_o_log_fala_de_dez_em_dez_e_avisa_o_fim(self, arquivos, caplog):
        import logging

        class CartaoQueSobe(PaginaFalsa):
            cartoes = [CARTAO_A_7, CARTAO_A_14, CARTAO_A_18, CARTAO_A_41, CARTAO_ENVIADO]

            def texto_de(self, alvo):
                if alvo == "status_do_upload":
                    return self.cartoes.pop(0) if len(self.cartoes) > 1 else self.cartoes[0]
                return super().texto_de(alvo)

        caplog.set_level(logging.INFO, logger="app.services.tiktok_studio")

        _rodar(CartaoQueSobe(), arquivos)

        assert "envio 7%" not in caplog.text  # abaixo do primeiro marco
        assert "envio 14% (9.84MB/68.3MB, faltam 26 segundos)" in caplog.text
        assert "envio 18%" not in caplog.text  # mesmo marco dos 14%
        assert "envio 41%" in caplog.text
        assert "envio concluido" in caplog.text

    def test_cartao_sem_percentual_para_de_acompanhar_e_o_roteiro_segue(self, arquivos):
        class CartaoMudo(PaginaFalsa):
            def texto_de(self, alvo):
                if alvo == "status_do_upload":
                    self.chamadas.append(("ler", alvo))
                    return "short.mp4\n1080P"  # layout novo: nem numero, nem "Enviado"
                return super().texto_de(alvo)

        pagina = CartaoMudo()

        relatorio = _rodar(pagina, arquivos)

        leituras = [c for c in pagina.chamadas if c == ("ler", "status_do_upload")]
        assert len(leituras) == tiktok_studio.LEITURAS_SEM_PERCENTUAL + 1
        assert "enviando o vídeo" in relatorio["resumo"]


class TestTutorial:
    """O tour de novidades do TikTok cobre a pagina com um overlay."""

    def test_dispensa_o_tour_antes_de_escrever(self, arquivos):
        """Ele apareceu no ensaio real e travou tudo o que vinha depois.

        O overlay intercepta pointer events: com o tour aberto, o clique na
        caixa da legenda e retentado por 30s e morre em "elemento nao
        clicavel" — um sintoma que nao aponta a causa nenhuma vez.
        """
        pagina = PaginaFalsa()

        _rodar(pagina, arquivos)

        ordem = [c[1] for c in pagina.chamadas]
        assert ordem.index("tutorial") < ordem.index("editor_da_legenda")

    def test_sem_overlay_nao_procura_botao_de_tour(self, arquivos):
        """O caso comum. Nao pode custar clique nem espera extra."""
        pagina = PaginaFalsa()
        pagina.ausentes.add("overlay_do_tutorial")

        relatorio = _rodar(pagina, arquivos)

        assert ("clicar", "tutorial") not in pagina.chamadas
        assert ("remover", "overlay_do_tutorial") not in pagina.chamadas
        assert relatorio["capa_aplicada"] is True

    def test_overlay_teimoso_e_removido_do_DOM(self, arquivos):
        """A segunda camada, e o motivo de ela existir.

        O botao do tour nem sempre diz "Entendi": num passo intermediario diz
        "Avancar", e clicar ali so avanca o tour. Clicar e a educacao; remover
        e a garantia.
        """
        pagina = PaginaFalsa()
        pagina.ausentes.add("tutorial")  # overlay presente, botao nao

        _rodar(pagina, arquivos)

        assert ("remover", "overlay_do_tutorial") in pagina.chamadas

    def test_tour_que_falha_ao_fechar_nao_derruba_o_upload(self, arquivos):
        pagina = PaginaFalsa(falhar={"tutorial"})

        relatorio = _rodar(pagina, arquivos)

        assert relatorio["publicado"] is False


class TestConferencia:
    """D-545: escrever nao e o mesmo que ter escrito."""

    def test_reescreve_quando_o_tiktok_sobrescreve(self, arquivos):
        """O defeito, em um teste.

        Um `escrever` que nao levanta excecao nao prova que o texto ficou:
        prova que o clique e as teclas foram aceitos. Numa pagina que se
        redesenha sozinha, as duas coisas sao diferentes.
        """
        pagina = PaginaFalsa()
        pagina.sobrescreve = 1  # a primeira leitura devolve o nome do arquivo

        relatorio = _rodar(pagina, arquivos)

        escritas = [c for c in pagina.chamadas if c[0] == "escrever"]
        assert len(escritas) == 2
        assert Passo.LEGENDA.value in relatorio["passos"]
        assert relatorio["avisos"] == []

    def test_desiste_avisando_em_vez_de_mentir(self, arquivos):
        """Tres tentativas, e dai o problema e outro.

        O video ja subiu: derrubar tudo aqui trocaria um contratempo por
        retrabalho. Mas dizer "legenda escrita" sem ter conferido e pior — foi
        assim que o defeito passou despercebido na primeira vez.
        """
        pagina = PaginaFalsa()
        pagina.sobrescreve = 99

        relatorio = _rodar(pagina, arquivos)

        assert Passo.LEGENDA.value not in relatorio["passos"]
        assert any("confirmar" in a for a in relatorio["avisos"])

    def test_legenda_que_bate_de_primeira_nao_reescreve(self, arquivos):
        pagina = PaginaFalsa()

        _rodar(pagina, arquivos)

        assert len([c for c in pagina.chamadas if c[0] == "escrever"]) == 1


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

    def test_espera_o_salvar_habilitar_antes_de_clicar(self, arquivos):
        """O relato foi exato: a imagem estava la, escolhida e nao salva.

        O TikTok mantem o Salvar desabilitado enquanto processa a imagem que
        acabou de receber, e um clique nesse intervalo nao e recusado com erro —
        ele simplesmente nao acontece.
        """
        pagina = PaginaFalsa()

        _rodar(pagina, arquivos)

        ordem = [(c[0], c[1]) for c in pagina.chamadas if c[1] == "confirmar_capa"]
        assert ("habilitado", "confirmar_capa") in ordem
        assert ordem.index(("habilitado", "confirmar_capa")) < ordem.index(
            ("clicar", "confirmar_capa")
        )

    def test_capa_que_nao_muda_a_miniatura_vira_aviso(self, arquivos):
        """O TikTok SEMPRE mostra alguma capa — um quadro do video.

        Entao "existe capa" nao prova nada; o que prova e ela ter MUDADO. Sem
        esta conferencia, o relatorio diria "capa aplicada" tendo clicado num
        botao que nao fez efeito.
        """

        class NaoTroca(PaginaFalsa):
            def clicar(self, alvo, *, segundos):
                self._registrar("clicar", alvo)  # sem mexer na miniatura

        relatorio = _rodar(NaoTroca(), arquivos)

        assert relatorio["capa_aplicada"] is False
        assert any("continua a mesma" in a for a in relatorio["avisos"])

    def test_modal_sem_botao_de_salvar_vira_aviso(self, arquivos):
        """Salvar e obrigatorio: sem o clique, a capa escolhida nao e aplicada.

        Antes isto era tratado como opcional, e o relatorio diria "capa
        aplicada" tendo aberto um modal e desistido no meio.
        """
        pagina = PaginaFalsa()
        pagina.ausentes.add("confirmar_capa")

        relatorio = _rodar(pagina, arquivos)

        assert relatorio["capa_aplicada"] is False
        assert "salvar" in relatorio["avisos"][0].lower()

    def test_nunca_encosta_no_salvar_rascunho(self, arquivos):
        """ "Salvar" casa por substring com "Salvar rascunho", na MESMA pagina.

        Um `has-text("Salvar")` solto salvaria um rascunho em vez de aplicar a
        capa. O seletor esta ancorado no dialogo, e este teste guarda isso.
        """
        assert '[role="dialog"]' in tiktok_studio.SELETORES["confirmar_capa"]
        assert "rascunho" not in tiktok_studio.SELETORES["confirmar_capa"]

    def test_os_campos_de_arquivo_sao_CSS_puro(self):
        """D-544: quem resolve estes dois e o `querySelector` do navegador.

        O arquivo vai por `DOM.setFileInputFiles` (CDP), porque o
        `set_input_files` do Playwright empacota os bytes e recusa acima de
        50 MB — teto nosso, nao do TikTok, que aceita 30 GB. O navegador nao
        conhece `:has-text` e afins: um pseudo-seletor do Playwright aqui
        derrubaria o upload de volta para o caminho limitado, em silencio.
        """
        for chave in ("campo_do_arquivo", "campo_da_capa"):
            seletor = tiktok_studio.SELETORES[chave]
            assert ":has-text" not in seletor
            assert "text=" not in seletor

    def test_o_botao_de_publicar_usa_o_gancho_do_proprio_tiktok(self):
        """`data-e2e` sobrevive a troca de idioma; texto nao."""
        assert tiktok_studio.SELETORES["botao_publicar"] == '[data-e2e="post_video_button"]'


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

        D-564: o `active_channel_root` mudou de casa junto com a camada de
        navegador; o que se guarda aqui continua sendo o mesmo — o caminho que
        `tiktok_studio.perfil_do_chrome()` devolve.
        """
        from app.services import navegador_assistido

        monkeypatch.setattr(
            navegador_assistido, "active_channel_root", lambda: tmp_path / "canal-b"
        )

        assert tiktok_studio.perfil_do_chrome() == tmp_path / "canal-b" / "browser" / "tiktok"


@pytest.mark.asyncio
async def test_video_sumido_recusa_antes_de_abrir_o_navegador(tmp_path):
    """Abrir o Chrome para descobrir que nao ha arquivo e desperdicio e susto."""
    with pytest.raises(RoteiroInterrompido) as erro:
        await tiktok_studio.subir_assistido(
            video=tmp_path / "nao-existe.mp4", legenda="x", capa=None
        )

    assert erro.value.passo is Passo.ARQUIVO


class TestPublicou:
    """D-546: o sinal que marca um corte como publicado no TikTok.

    A marca LIBERA a limpeza automatica do `upload_ready/video.mp4` (D-512):
    um falso positivo apaga o arquivo, e a volta e render novo. Errar para
    menos custa um clique no "publiquei"; errar para mais custa o material.
    Todo teste aqui existe para manter essa assimetria.
    """

    def test_sair_da_pagina_de_upload_e_o_sinal(self):
        assert publicou("https://www.tiktok.com/tiktokstudio/content") is True

    def test_continuar_no_upload_nao_e(self):
        # Descartar reseta a propria pagina de upload: a aba fica onde estava.
        # E essa assimetria que separa publicar de descartar sem ambiguidade.
        assert publicou("https://www.tiktok.com/tiktokstudio/upload?from=upload") is False

    def test_cair_no_login_nao_e_publicacao(self):
        # A sessao pode expirar no meio da revisao. Marcar publicado ali seria
        # apagar o MP4 de um video que nunca subiu.
        assert publicou("https://www.tiktok.com/login?redirect_url=x") is False

    def test_sair_do_tiktok_nao_e_publicacao(self):
        assert publicou("https://www.google.com") is False

    def test_url_vazia_nao_e_publicacao(self):
        # Aba fechada, pagina em branco: "nao sei" tem de dar em nao marcar.
        assert publicou("") is False


def test_a_porta_de_depuracao_nao_e_a_do_dev(tmp_path):
    """8000/4300 sao PROD e 8002/4304 o DEV; colidir aqui derrubaria um deles."""
    assert tiktok_studio.PORTA_DE_DEPURACAO not in {8000, 8002, 4300, 4304, 3200}


def test_o_roteiro_nao_conhece_a_senha_de_ninguem():
    """Guarda de intencao: se um dia alguem 'resolver' o login, isto quebra."""
    fonte = Path(tiktok_studio.__file__).read_text(encoding="utf-8").lower()

    for proibido in ("password", "senha =", "captcha_solver", "type_password"):
        assert proibido not in fonte


class TestAgendamento:
    """D-580: dia e hora marcados no proprio Studio, antes da revisao.

    O que estes testes protegem nao e o clique — e a CONFERENCIA. Num formulario
    onde os dois campos sao `readonly`, um clique que erra o alvo nao levanta
    erro nenhum: ele acerta outro dia. Sem ler o campo de volta, o robo
    devolveria a aba com a data errada e a consciencia tranquila.
    """

    def _amanha(self, hora="14:05"):
        from datetime import datetime, timedelta

        from app.domain.publicacao.agendamento import Agendamento

        dia = datetime.now().astimezone() + timedelta(days=1)
        return Agendamento.de_texto(f"{dia.strftime('%Y-%m-%d')}T{hora}")

    def _preparar(self, pagina, agendamento):
        """Poe o duble no mes do alvo — o calendario real abre no mes corrente."""
        pagina.mes_visivel = agendamento.quando.strftime("%Y-%m")

    def test_sem_data_nada_muda(self, arquivos):
        pagina = PaginaFalsa()

        relatorio = _rodar(pagina, arquivos)

        assert Passo.AGENDAMENTO.value not in relatorio["passos"]
        assert relatorio["agendado_para"] == ""
        assert ("clicar", "ligar_agendamento") not in pagina.chamadas

    def test_marca_dia_e_hora_e_confere_os_dois(self, arquivos):
        agendamento = self._amanha("14:05")
        pagina = PaginaFalsa()
        self._preparar(pagina, agendamento)

        relatorio = _rodar(pagina, arquivos, agendamento=agendamento)

        assert Passo.AGENDAMENTO.value in relatorio["passos"]
        assert relatorio["agendado_para"] == agendamento.legivel()
        assert pagina.campos["campo_da_data"] == agendamento.data_iso()
        assert pagina.campos["campo_da_hora"] == "14:05"

    def test_o_agendamento_vem_antes_da_revisao(self, arquivos):
        agendamento = self._amanha()
        pagina = PaginaFalsa()
        self._preparar(pagina, agendamento)

        passos = _rodar(pagina, arquivos, agendamento=agendamento)["passos"]

        assert passos.index(Passo.AGENDAMENTO.value) < passos.index(Passo.REVISAO.value)

    def test_vira_o_mes_quando_o_dia_nao_esta_a_vista(self, arquivos):
        """O alvo cai no mes seguinte — e o calendario abre no corrente.

        E o caso de virada de mes: pedir dia 2 no fim de janeiro nao significa
        2 de janeiro, que ja passou. Sem virar a pagina do calendario o robo
        so acharia dias que nao servem.
        """
        from datetime import datetime

        from app.domain.publicacao.agendamento import Agendamento

        hoje = datetime.now().astimezone()
        ano, mes = (hoje.year + 1, 1) if hoje.month == 12 else (hoje.year, hoje.month + 1)
        agendamento = Agendamento.de_texto(f"{ano}-{mes:02d}-02T10:00")

        pagina = PaginaFalsa()
        pagina.mes_visivel = hoje.strftime("%Y-%m")
        pagina.opcoes_ausentes = {f"dia_do_calendario:{agendamento.dia()}"}

        _rodar(pagina, arquivos, agendamento=agendamento)

        assert ("clicar", "mes_seguinte") in pagina.chamadas
        assert pagina.campos["campo_da_data"] == agendamento.data_iso()

    def test_dia_fora_da_janela_interrompe_no_passo_certo(self, arquivos):
        agendamento = self._amanha()
        pagina = PaginaFalsa()
        self._preparar(pagina, agendamento)
        # Ausente antes E depois de virar o mes: e um dia que nao da para pedir.
        pagina.opcoes_ausentes = {f"dia_do_calendario:{agendamento.dia()}"}
        original = pagina.clicar

        def clicar(alvo, *, segundos):
            original(alvo, segundos=segundos)
            if alvo == "mes_seguinte":  # o dia continua fora da janela
                pagina.opcoes_ausentes = {f"dia_do_calendario:{agendamento.dia()}"}

        pagina.clicar = clicar

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos, agendamento=agendamento)

        assert erro.value.passo == Passo.AGENDAMENTO

    def test_campo_com_data_diferente_da_pedida_interrompe(self, arquivos):
        agendamento = self._amanha()
        pagina = PaginaFalsa()
        self._preparar(pagina, agendamento)
        # O clique "funciona", mas o calendario estava noutro mes: o campo fica
        # com uma data que nao e a pedida. E o bug que a conferencia pega.
        pagina.mes_visivel = "2019-01"

        with pytest.raises(RoteiroInterrompido) as erro:
            _rodar(pagina, arquivos, agendamento=agendamento)

        assert erro.value.passo == Passo.AGENDAMENTO
        assert "2019-01" in str(erro.value)

    def test_reabre_o_seletor_quando_o_minuto_nao_entra_de_primeira(self, arquivos):
        agendamento = self._amanha("09:30")
        pagina = PaginaFalsa()
        self._preparar(pagina, agendamento)
        pagina.minutos_teimosos = 1

        _rodar(pagina, arquivos, agendamento=agendamento)

        assert pagina.campos["campo_da_hora"] == "09:30"
        assert pagina.chamadas.count(("clicar", "campo_da_hora")) == 2

    def test_a_falha_do_agendamento_avisa_para_marcar_a_mao(self):
        assert "a mao" in ORIENTACOES[Passo.AGENDAMENTO]
        assert "agora" in ORIENTACOES[Passo.AGENDAMENTO]
