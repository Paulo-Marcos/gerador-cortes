"""A URL que vai para o yt-dlp é reconstruída, nunca repassada (D-807).

O CodeQL apontou (py/command-line-injection, crítico) que a URL da live ia
direto para a linha de comando do yt-dlp. Não havia shell, mas havia argumento:
um "URL" como `--exec=...` é lido pelo yt-dlp como opção — e `--exec` roda um
comando. A correção reconstrói a URL a partir do id de 11 caracteres; o texto
de quem pediu nunca chega ao processo.
"""

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.compartilhado.url_do_youtube import url_canonica_do_video
from app.infrastructure.ytdlp import argv_do_ytdlp

ID = "dQw4w9WgXcQ"
CANONICA = f"https://www.youtube.com/watch?v={ID}"


@pytest.mark.parametrize(
    "entrada",
    [
        f"https://www.youtube.com/watch?v={ID}",
        f"https://youtube.com/watch?v={ID}&t=42s&list=PL1",
        f"http://m.youtube.com/watch?v={ID}",
        f"https://youtu.be/{ID}?si=abc",
        f"https://www.youtube.com/live/{ID}",
        f"https://www.youtube.com/shorts/{ID}",
        f"  https://www.youtube.com/watch?v={ID}  ",
        # Não-regressão: o extrator antigo aceitava URL sem esquema e id solto,
        # e projeto já gravado assim precisa continuar baixando.
        f"youtube.com/watch?v={ID}",
        f"www.youtube.com/live/{ID}",
        f"youtu.be/{ID}",
        ID,
    ],
)
def test_url_legitima_vira_a_forma_canonica(entrada):
    assert url_canonica_do_video(entrada) == CANONICA


@pytest.mark.parametrize(
    "entrada",
    [
        "--exec=calc.exe",
        f"--exec=calc.exe https://youtu.be/{ID}",
        f"-o C:/Windows/x https://youtu.be/{ID}",
        f"https://evilyoutube.com/watch?v={ID}",
        f"https://youtube.com.evil.example/watch?v={ID}",
        f"file:///C:/Windows/watch?v={ID}",
        f"ftp://youtube.com/watch?v={ID}",
        "https://www.youtube.com/watch?v=curto",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ;rm",
        "",
    ],
)
def test_entrada_que_nao_e_video_do_youtube_e_recusada(entrada):
    with pytest.raises(PedidoInvalido):
        url_canonica_do_video(entrada)


def test_argv_poe_o_separador_e_so_a_url_canonica():
    argv = argv_do_ytdlp(["--skip-download"], f"https://youtu.be/{ID}?si=x")

    assert argv == ["yt-dlp", "--skip-download", "--", CANONICA]


def test_argv_recusa_antes_de_montar_o_comando():
    with pytest.raises(PedidoInvalido):
        argv_do_ytdlp(["--skip-download"], "--exec=calc.exe")
