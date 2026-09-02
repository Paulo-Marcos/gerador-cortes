"""D-488: o filter_complex do palco vertical.

Erro em filtergraph nao levanta excecao em Python: ele sai como um MP4 torto, ou
um ffmpeg que morre com -22 no meio do render — foi assim que o crop presumido
da D-481 chegou ao operador. Por isso estes testes leem o grafo montado em vez
de confiar que ele esta certo.

O que eles protegem:

  - a ORDEM (fundo -> recortes -> grade -> saida) e o encadeamento dos rotulos;
  - COBRIR corta apos escalar; CABER nao corta e centraliza no slot;
  - a fonte `color` SEMPRE tem duracao — ela e infinita, e o projeto ja pagou
    por isso uma vez com um render de base preta que nao fechava.
"""

from pathlib import Path

import pytest
from app.domain.ffmpeg_short import FUNDO_PADRAO, build_palco_vertical_cmd
from app.domain.palco_short import MODELOS, montar_plano

FACECAM = {"x": 24, "y": 410, "w": 340, "h": 260}
TELA = {"x": 365, "y": 180, "w": 1325, "h": 720}


def montar(modelo_id: str, regioes: dict, **kwargs) -> list[str]:
    return build_palco_vertical_cmd(
        Path("bruto.mkv"),
        Path("saida.mp4"),
        inicio_seg=kwargs.pop("inicio_seg", 10.0),
        duracao_seg=kwargs.pop("duracao_seg", 30.0),
        plano=montar_plano(modelo_id, regioes),
        **kwargs,
    )


def grafo(cmd: list[str]) -> list[str]:
    return cmd[cmd.index("-filter_complex") + 1].split(";")


class TestFundo:
    def test_a_fonte_color_sempre_tem_duracao(self):
        """`color=` e infinita. Sem `d=`, o encode so termina pelo -t.

        Licao ja paga por este projeto num render de base preta que nao fechava.
        """
        for duracao in (5.0, 30.0, 90.0):
            cmd = montar("pessoa_cheia", {"pessoa": FACECAM}, duracao_seg=duracao)

            assert f"d={duracao}" in grafo(cmd)[0]

    def test_o_fundo_tem_o_tamanho_do_short_e_a_cor_do_canal(self):
        fundo = grafo(montar("pessoa_cheia", {"pessoa": FACECAM}))[0]

        assert "s=1080x1920" in fundo
        assert FUNDO_PADRAO in fundo

    def test_a_cor_do_fundo_e_parametrizavel(self):
        cmd = montar("pessoa_cheia", {"pessoa": FACECAM}, fundo_cor="0xff0000")

        assert "c=0xff0000" in grafo(cmd)[0]


class TestRecortes:
    def test_cada_regiao_vira_um_fluxo_proprio(self):
        partes = grafo(montar("tela_cima_pessoa_baixo", {"pessoa": FACECAM, "tela": TELA}))
        fluxos = [p for p in partes if p.startswith("[0:v]")]

        assert len(fluxos) == 2

    def test_o_crop_da_fonte_usa_as_coordenadas_da_regiao(self):
        partes = grafo(montar("pessoa_cheia", {"pessoa": FACECAM}))
        fluxo = next(p for p in partes if p.startswith("[0:v]"))

        assert "crop=340:260:24:410" in fluxo

    def test_cobrir_corta_depois_de_escalar(self):
        """Transborda de proposito; o excesso sai num segundo crop, centralizado."""
        fluxo = next(p for p in grafo(montar("pessoa_cheia", {"pessoa": FACECAM})) if "[r0]" in p)

        assert fluxo.count("crop=") == 2, "faltou o corte do excesso"
        assert "crop=1080:1920:" in fluxo, "o corte final tem de ter o tamanho do slot"

    def test_caber_nao_corta(self):
        """Cortar a tela compartilhada esconderia o que a pessoa esta mostrando."""
        partes = grafo(montar("tela_cima_pessoa_baixo", {"pessoa": FACECAM, "tela": TELA}))
        fluxo_tela = partes[1]  # a tela e o primeiro slot do modelo

        assert fluxo_tela.count("crop=") == 1, "cortou a tela"

    def test_caber_centraliza_a_sobra_dentro_do_slot(self):
        """Sem isso a tela ficaria colada num canto do proprio slot."""
        partes = grafo(montar("tela_cima_pessoa_baixo", {"pessoa": FACECAM, "tela": TELA}))
        overlay_tela = next(p for p in partes if "[r0]overlay" in p)
        slot = MODELOS["tela_cima_pessoa_baixo"].slots["tela"]

        x = int(overlay_tela.split("x=")[1].split(":")[0])

        assert x >= slot.x

    def test_toda_cadeia_termina_em_rgba(self):
        """O overlay precisa de alpha; sem rgba o ffmpeg converte na marra."""
        for parte in grafo(montar("pessoa_com_insert", {"pessoa": FACECAM, "tela": TELA})):
            if parte.startswith("[0:v]"):
                assert parte.split("[r")[0].endswith("format=rgba")


class TestEncadeamento:
    def test_os_overlays_se_encadeiam_ate_comp(self):
        """Cada overlay consome a saida do anterior — um elo solto some do video."""
        partes = grafo(montar("pessoa_com_insert", {"pessoa": FACECAM, "tela": TELA}))
        overlays = [p for p in partes if "overlay=" in p]

        assert overlays[0].startswith("[palco]")
        assert overlays[-1].endswith("[comp]")
        for anterior, seguinte in zip(overlays, overlays[1:], strict=False):
            rotulo = anterior[anterior.rindex("[") :]
            assert seguinte.startswith(rotulo), f"elo solto entre {anterior} e {seguinte}"

    def test_a_ordem_dos_recortes_e_a_de_empilhamento(self):
        """No insert, a tela entra DEPOIS da pessoa — senao fica atras dela."""
        partes = grafo(montar("pessoa_com_insert", {"pessoa": FACECAM, "tela": TELA}))
        ordem = [p for p in partes if p.startswith("[0:v]")]

        assert "crop=340:260" in ordem[0], "a pessoa tem de ser composta primeiro"
        assert "crop=1325:720" in ordem[1]

    def test_a_saida_final_e_v_em_yuv420p(self):
        final = grafo(montar("pessoa_cheia", {"pessoa": FACECAM}))[-1]

        assert final.startswith("[comp]")
        assert final.endswith("format=yuv420p[v]")
        assert "-map" in montar("pessoa_cheia", {"pessoa": FACECAM})


class TestGrade:
    def test_o_filtro_roda_sobre_o_quadro_composto(self):
        """Gradar regiao a regiao deixaria pessoa e tela com curvas diferentes."""
        cmd = montar(
            "tela_cima_pessoa_baixo", {"pessoa": FACECAM, "tela": TELA}, filtro="cinematic_iii"
        )
        partes = grafo(cmd)

        for parte in partes:
            if parte.startswith("[0:v]"):
                assert "eq=" not in parte and "curves=" not in parte, "gradou uma regiao sozinha"
        assert len(partes[-1]) > len("[comp]format=yuv420p[v]"), "a grade sumiu"

    def test_sem_filtro_a_saida_e_so_a_conversao(self):
        partes = grafo(montar("pessoa_cheia", {"pessoa": FACECAM}, filtro=None))

        assert partes[-1] == "[comp]format=yuv420p[v]"


class TestComando:
    def test_o_seek_vem_antes_da_entrada(self):
        """Depois do -i, o ffmpeg decodifica o bruto inteiro ate o ponto do corte."""
        cmd = montar("pessoa_cheia", {"pessoa": FACECAM})

        assert cmd.index("-ss") < cmd.index("-i")

    def test_o_audio_e_opcional(self):
        """Bruto sem faixa de audio nao pode derrubar o render."""
        cmd = montar("pessoa_cheia", {"pessoa": FACECAM})

        assert "0:a?" in cmd

    @pytest.mark.parametrize("modelo_id", sorted(MODELOS))
    def test_os_quatro_modelos_montam_um_grafo_valido(self, modelo_id):
        regioes = {
            "pessoa": FACECAM,
            "tela": TELA,
            "quadro": {"x": 0, "y": 0, "w": 1920, "h": 1080},
        }
        partes = grafo(montar(modelo_id, regioes))

        assert partes[0].startswith("color=")
        assert partes[-1].endswith("[v]")
