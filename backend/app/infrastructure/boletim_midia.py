"""As medições do boletim técnico: FFmpeg e numpy (D-1015).

Tudo aqui é CARO e SÍNCRONO — um `ebur128` num `video.mp4` grande passou de 150 s
com uma thread. Quem chama (`services/boletim_tecnico`) roda estas funções em
thread, uma medição por vez, e cada processo nasce com `timeout` e prioridade
abaixo do normal, para não disputar a CPU com um render em andamento.

Nada aqui altera o arquivo medido: só lê.
"""

from __future__ import annotations

import subprocess
import threading
from collections.abc import Callable, Sequence
from pathlib import Path

import numpy as np
from app.domain.corte.boletim_tecnico import (
    JANELA_DA_EMENDA_SEG,
    MUDANCA_MINIMA_EM_CINZA,
    PIXELS_QUE_PODEM_MUDAR,
    SOM_MINIMO_DBFS,
    TOLERANCIA_DO_INSTANTE_SEG,
    Volume,
    ler_resumo_ebur128,
)
from app.infrastructure import processos_em_voo
from app.infrastructure.worker_queue import dono_dos_jobs

LARGURA_DA_MEDIDA = 320
ALTURA_DA_MEDIDA = 180
_BYTES_POR_QUADRO = LARGURA_DA_MEDIDA * ALTURA_DA_MEDIDA
_QUADROS_POR_LOTE = 240
TAXA_DO_AUDIO = 48000
_TIMEOUT_DA_SONDA_SEG = 30
_BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
_THREADS = "2"

# Achar a emenda (D-1027): o último segundo de cada trecho, como ele soa na live,
# é procurado no vídeo final perto de onde a soma das durações o põe. O render
# alonga o vídeo de 0,01 s a 2 s, e a deriva se acumula emenda a emenda.
MOLDE_DA_EMENDA_SEG = 1.0
BUSCA_DA_EMENDA_SEG = 2.0
# Correlação normalizada mínima para aceitar que o molde foi achado.
CORRELACAO_MINIMA = 0.7
# Molde mais fraco que isto é silêncio: qualquer lugar "casa" com ele.
_MOLDE_MUDO_DBFS = -50.0


class ErroDeMedicao(Exception):
    """A medição não saiu: FFmpeg falhou, estourou o tempo ou o arquivo não tem a trilha."""


def _iniciar(cmd: list[str], *, stderr: int) -> subprocess.Popen:
    try:
        return subprocess.Popen(  # noqa: S603 — comando montado por nós
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=stderr,
            creationflags=_BELOW_NORMAL_PRIORITY_CLASS,
        )
    except OSError as exc:
        raise ErroDeMedicao(f"Não consegui iniciar o FFmpeg: {exc}") from exc


class _Vigia:
    """Mata a árvore do processo se o tempo acabar; sinaliza que foi por isso."""

    def __init__(self, processo: subprocess.Popen, timeout: float) -> None:
        self.estourou = False
        self._processo = processo
        self._relogio = threading.Timer(timeout, self._matar)
        self._relogio.daemon = True
        self._relogio.start()

    def _matar(self) -> None:
        self.estourou = True
        processos_em_voo.matar_arvore(self._processo)

    def encerrar(self) -> None:
        self._relogio.cancel()


def _rodar(cmd: list[str], timeout: float, consumir, *, stderr: int):
    """Roda `cmd` com vigia de tempo; `consumir(processo)` lê a saída. Devolve o que ele devolver."""
    dono = dono_dos_jobs()
    processo = _iniciar(cmd, stderr=stderr)
    processos_em_voo.registrar(dono, processo)
    vigia = _Vigia(processo, timeout)
    try:
        resultado = consumir(processo)
        processo.wait()
    except BaseException:
        processos_em_voo.matar_arvore(processo)  # senão o FFmpeg fica órfão, fora do registro
        raise
    finally:
        vigia.encerrar()
        processos_em_voo.esquecer(dono, processo)
    if vigia.estourou:
        raise ErroDeMedicao(f"A medição passou de {timeout:.0f}s e foi interrompida.")
    if processo.returncode != 0:
        # FFmpeg que morre no meio deixa uma saída parcial que parece medida.
        raise ErroDeMedicao(f"O FFmpeg terminou com o código {processo.returncode}.")
    return resultado


def medir_volume(caminho: Path, timeout: float) -> Volume:
    """LUFS integrado, pico verdadeiro e LRA (`ebur128=peak=true`)."""
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-nostats", "-threads", _THREADS,
        "-i", str(caminho), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-",
    ]  # fmt: skip
    # O resumo sai no stderr; stdout fica vazio e é descartado junto.
    saida = _rodar(
        cmd, timeout, lambda p: p.stderr.read().decode("utf-8", "replace"), stderr=subprocess.PIPE
    )
    volume = ler_resumo_ebur128(saida)
    if volume is None:
        raise ErroDeMedicao("O arquivo não tem áudio medível.")
    return volume


def _fps_do_video(caminho: Path) -> float:
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=avg_frame_rate", "-of", "default=nw=1:nk=1", str(caminho),
    ]  # fmt: skip
    try:
        saida = subprocess.run(  # noqa: S603 — comando montado por nós
            cmd, capture_output=True, text=True, timeout=_TIMEOUT_DA_SONDA_SEG, check=False
        ).stdout.strip()
        numerador, _, denominador = saida.partition("/")
        fps = float(numerador) / float(denominador or 1)
    except (OSError, subprocess.TimeoutExpired, ValueError, ZeroDivisionError) as exc:
        raise ErroDeMedicao("Não consegui ler a taxa de quadros do vídeo.") from exc
    if fps <= 0:
        raise ErroDeMedicao("Taxa de quadros inválida no vídeo.")
    return fps


def medir_quadros_parados(caminho: Path, timeout: float) -> tuple[float, list[bool]]:
    """Por quadro: repete o anterior? Escala 320x180 em cinza (método da D-1009).

    Devolve `(fps, repete)`. Um quadro repete quando no máximo 3 pixels mudaram
    mais que 6 níveis de cinza. Lê em lotes: um corte de 10 min são ~1 GB de
    quadros pequenos, que nunca estão todos na memória.
    """
    fps = _fps_do_video(caminho)
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-threads", _THREADS,
        "-i", str(caminho), "-an", "-fps_mode", "passthrough",
        "-vf", f"scale={LARGURA_DA_MEDIDA}:{ALTURA_DA_MEDIDA},format=gray",
        "-f", "rawvideo", "-",
    ]  # fmt: skip

    def consumir(processo: subprocess.Popen) -> list[bool]:
        repete: list[bool] = []
        anterior: np.ndarray | None = None
        saida = processo.stdout
        if saida is None:  # stdout=PIPE sempre cria; o tipo é que admite None
            raise ErroDeMedicao("Não consegui ler a saída do FFmpeg.")
        while True:
            bloco = saida.read(_BYTES_POR_QUADRO * _QUADROS_POR_LOTE)
            quadros = len(bloco) // _BYTES_POR_QUADRO
            if quadros == 0:
                break
            lote = np.frombuffer(bloco[: quadros * _BYTES_POR_QUADRO], dtype=np.uint8)
            lote = lote.reshape(quadros, _BYTES_POR_QUADRO).astype(np.int16)
            if anterior is not None:
                lote = np.vstack([anterior, lote])
            else:
                repete.append(False)  # o primeiro quadro não repete ninguém
            mudaram = (np.abs(np.diff(lote, axis=0)) > MUDANCA_MINIMA_EM_CINZA).sum(axis=1)
            repete.extend((mudaram <= PIXELS_QUE_PODEM_MUDAR).tolist())
            anterior = lote[-1:]
        return repete

    repete = _rodar(cmd, timeout, consumir, stderr=subprocess.DEVNULL)
    if not repete:
        raise ErroDeMedicao("O arquivo não tem vídeo legível.")
    return fps, repete


def ler_audio(caminho: Path, timeout: float) -> np.ndarray:
    """O áudio inteiro em mono, 48 kHz, inteiros de 16 bits (~5,7 MB por minuto)."""
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-threads", _THREADS,
        "-i", str(caminho), "-vn", "-ac", "1", "-ar", str(TAXA_DO_AUDIO),
        "-f", "s16le", "-",
    ]  # fmt: skip
    bruto = _rodar(cmd, timeout, lambda p: p.stdout.read(), stderr=subprocess.DEVNULL)
    amostras = np.frombuffer(bruto[: len(bruto) // 2 * 2], dtype=np.int16)
    if amostras.size == 0:
        raise ErroDeMedicao("O arquivo não tem áudio medível.")
    return amostras


def _dbfs(trecho: np.ndarray) -> float:
    if trecho.size == 0:
        return -120.0
    rms = float(np.sqrt(np.mean(np.square(trecho.astype(np.float64)))))
    return 20 * np.log10(rms / 32768) if rms > 0 else -120.0


def _largura_da_janela_do_degrau() -> int:
    return int(2 * TOLERANCIA_DO_INSTANTE_SEG * TAXA_DO_AUDIO)


def p99_do_degrau_da_fala(amostras: np.ndarray) -> float:
    """O degrau que 99% das janelas de fala não passam (fração da escala cheia).

    O instante da emenda tem folga de até um quadro, então o degrau da emenda é
    o MAIOR salto entre amostras vizinhas dentro de uma janela de mesma largura.
    Comparar esse máximo com o p99 dos saltos avulsos acusaria quase toda emenda
    (uma janela tem milhares de saltos). A régua certa é a mesma: o p99 dos
    máximos de janelas de fala, isto é, de blocos acima de -40 dBFS.
    """
    largura = _largura_da_janela_do_degrau()
    n = amostras.size // largura * largura
    if n < largura * 2:
        return 0.0
    blocos = amostras[:n].astype(np.float64).reshape(-1, largura)
    rms = np.sqrt(np.mean(np.square(blocos), axis=1))
    com_som = rms > 32768 * 10 ** (SOM_MINIMO_DBFS / 20)
    if not com_som.any():
        return 0.0
    maximos = np.abs(np.diff(blocos[com_som], axis=1)).max(axis=1)
    return float(np.percentile(maximos, 99)) / 32768


def _maior_degrau(amostras: np.ndarray, i: int) -> float:
    """O maior salto entre amostras vizinhas ao redor de `i`, na folga do instante."""
    folga = _largura_da_janela_do_degrau() // 2
    trecho = amostras[max(0, i - folga) : i + folga].astype(np.int32)
    if trecho.size < 2:  # noqa: PLR2004 — um salto precisa de duas amostras
        return 0.0
    return float(np.abs(np.diff(trecho)).max()) / 32768


def medir_emendas(
    amostras: np.ndarray, instantes_seg: list[float]
) -> list[tuple[float, float, float, float]]:
    """Por emenda: (instante, nível antes, nível depois, degrau).

    Níveis em dBFS, degrau em fração da escala cheia. Emenda fora do áudio
    (vídeo mais curto que o previsto) é descartada, e o instante vai junto para
    quem chama saber qual sobrou.
    """
    janela = int(JANELA_DA_EMENDA_SEG * TAXA_DO_AUDIO)
    medidas: list[tuple[float, float, float, float]] = []
    for instante in instantes_seg:
        i = int(round(instante * TAXA_DO_AUDIO))
        if i < 1 or i >= amostras.size:
            continue
        degrau = _maior_degrau(amostras, i)
        antes = _dbfs(amostras[max(0, i - janela) : i])
        depois = _dbfs(amostras[i : i + janela])
        medidas.append((instante, antes, depois, degrau))
    return medidas


def ler_trecho(caminho: Path, inicio_seg: float, duracao_seg: float, timeout: float) -> np.ndarray:
    """`duracao_seg` de áudio mono, 48 kHz, a partir de `inicio_seg` (vazio se passar do fim)."""
    cmd = [
        "ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-threads", _THREADS,
        "-ss", f"{max(0.0, inicio_seg):.3f}", "-i", str(caminho), "-t", f"{duracao_seg:.3f}",
        "-vn", "-ac", "1", "-ar", str(TAXA_DO_AUDIO), "-f", "s16le", "-",
    ]  # fmt: skip
    bruto = _rodar(cmd, timeout, lambda p: p.stdout.read(), stderr=subprocess.DEVNULL)
    return np.frombuffer(bruto[: len(bruto) // 2 * 2], dtype=np.int16)


def _correlacao(molde: np.ndarray, trecho: np.ndarray) -> np.ndarray:
    """Correlação normalizada de `molde` em cada posição de `trecho` (-1 a 1)."""
    n = molde.size
    if trecho.size < n:
        return np.array([])
    m = molde.astype(np.float64)
    m -= m.mean()
    t = trecho.astype(np.float64)
    tam = t.size + n
    numerador = np.fft.irfft(np.fft.rfft(t, tam) * np.conj(np.fft.rfft(m, tam)), tam)
    numerador = numerador[: t.size - n + 1]
    c1 = np.concatenate(([0.0], np.cumsum(t)))
    c2 = np.concatenate(([0.0], np.cumsum(t**2)))
    soma, soma2 = c1[n:] - c1[:-n], c2[n:] - c2[:-n]
    denominador = np.sqrt(np.maximum(soma2 - soma**2 / n, 1e-12) * np.sum(m**2))
    return numerador / denominador


def localizar_emendas(
    final: np.ndarray,
    trechos: Sequence[tuple[float, float]],
    ler_molde: Callable[[float, float], np.ndarray],
) -> list[float | None]:
    """Onde cada emenda está no vídeo final, ou `None` quando não dá para ter certeza.

    A emenda j é onde o trecho j termina. O molde é o último segundo dele na
    fonte (`ler_molde(inicio, duração)`); acha-se por correlação perto da soma
    das durações mais a deriva já vista. Molde mudo ou sem correlação forte não
    chuta uma posição: vira `None` e quem chama conta como não localizada.
    """
    achadas: list[float | None] = []
    acumulado = 0.0
    deriva = 0.0
    for inicio, fim in list(trechos)[:-1]:
        acumulado += fim - inicio
        molde = ler_molde(fim - MOLDE_DA_EMENDA_SEG, MOLDE_DA_EMENDA_SEG)
        posicao = _achar(final, molde, acumulado + deriva)
        achadas.append(None if posicao is None else round(posicao, 3))
        if posicao is not None:
            deriva = posicao - acumulado
    return achadas


def _achar(final: np.ndarray, molde: np.ndarray, esperado_seg: float) -> float | None:
    if molde.size < TAXA_DO_AUDIO // 2 or _dbfs(molde) < _MOLDE_MUDO_DBFS:
        return None
    ini = max(0, int((esperado_seg - MOLDE_DA_EMENDA_SEG - BUSCA_DA_EMENDA_SEG) * TAXA_DO_AUDIO))
    fim = min(final.size, int((esperado_seg + BUSCA_DA_EMENDA_SEG) * TAXA_DO_AUDIO))
    correlacao = _correlacao(molde, final[ini:fim])
    if correlacao.size == 0:
        return None
    melhor = int(np.argmax(correlacao))
    if correlacao[melhor] < CORRELACAO_MINIMA:
        return None
    return (ini + melhor + molde.size) / TAXA_DO_AUDIO
