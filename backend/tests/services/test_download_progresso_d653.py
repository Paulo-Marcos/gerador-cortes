"""Download: ler o cano, mostrar progresso e não martelar o banco (D-653).

Três defeitos com a mesma raiz — ninguém lendo ou lendo demais:

1. `create_subprocess_exec(stdout=PIPE)` seguido de `wait()` abre o cano e não
   lê. Quando o buffer do sistema enche, o yt-dlp PARA de escrever e fica
   pendurado — sem erro, sem log, sem fim.
2. no fallback em thread, o download ficava mudo: a barra parava em 0% por horas
   porque a saída só chegava no fim.
3. e cada linha de progresso abria uma transação no SQLite: centenas de
   escritas por download, disputando o banco com o resto do app.
"""

import subprocess
import sys

import pytest
from app.services.ingestao import (
    _progresso_da_linha,
    _ProgressoGravado,
    _rodar_ytdlp_lendo_saida,
)


def test_le_a_porcentagem_da_linha_do_ytdlp():
    assert _progresso_da_linha("[download]  42.7% of 1.20GiB at 5.00MiB/s") == 42.7
    assert _progresso_da_linha("[info] Writing video metadata") is None


class TestQuandoGravarNoBanco:
    def test_grava_de_1_em_1_por_cento(self):
        gravado = _ProgressoGravado()

        aceitos = [p for p in (0.1, 0.4, 0.9, 1.2, 1.5, 2.3) if gravado.vale_gravar(p)]

        assert aceitos == [0.1, 1.2, 2.3], "só quando anda 1% de verdade"

    def test_cem_por_cento_sempre_grava(self):
        """O fim é o estado que precisa sobreviver a um restart."""
        gravado = _ProgressoGravado()
        gravado.vale_gravar(99.8)

        assert gravado.vale_gravar(100.0) is True

    def test_uma_enxurrada_de_linhas_vira_poucas_gravacoes(self):
        gravado = _ProgressoGravado()
        linhas = [i / 10 for i in range(1001)]  # 0.0 a 100.0, de 0,1 em 0,1

        gravacoes = sum(1 for p in linhas if gravado.vale_gravar(p))

        assert gravacoes <= 101, f"{gravacoes} gravações para 1001 linhas"


class TestLeituraDaSaida:
    def test_progresso_chega_linha_a_linha_e_nao_so_no_fim(self):
        """O fallback em thread precisa informar DURANTE, não depois."""
        falso_ytdlp = (
            "import sys\n"
            "for p in ('10.0', '50.0', '100.0'):\n"
            "    print(f'[download]  {p}% of 1.00GiB'); sys.stdout.flush()\n"
        )
        vistos: list[float] = []

        codigo = _rodar_ytdlp_lendo_saida([sys.executable, "-c", falso_ytdlp], vistos.append)

        assert codigo == 0
        assert vistos == [10.0, 50.0, 100.0]

    def test_saida_gigante_nao_trava_o_processo(self):
        """O bug do cano cheio: sem leitura, isto ficaria pendurado para sempre."""
        tagarela = (
            "import sys\n"
            "for i in range(20000):\n"
            "    print('[download]  %.1f%% of 1.00GiB' % (i / 200))\n"
        )

        codigo = _rodar_ytdlp_lendo_saida([sys.executable, "-c", tagarela], lambda _p: None)

        assert codigo == 0

    def test_codigo_de_erro_do_ytdlp_chega_a_quem_chamou(self):
        codigo = _rodar_ytdlp_lendo_saida(
            [sys.executable, "-c", "import sys; sys.exit(2)"], lambda _p: None
        )

        assert codigo == 2


@pytest.mark.integration  # enche o pipe de um processo real (D-751)
def test_o_cano_cheio_realmente_trava_sem_leitura():
    """A prova do problema, para o teste acima não virar fé.

    Mesmo processo tagarela, agora SEM ninguém ler: ele não termina no prazo.
    """
    tagarela = "for i in range(20000):\n    print('linha de saida numero %d' % i)\n"
    processo = subprocess.Popen(
        [sys.executable, "-c", tagarela],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        with pytest.raises(subprocess.TimeoutExpired):
            processo.wait(timeout=3)
    finally:
        processo.kill()
        processo.communicate()
