"""O boletim técnico de um corte ou de um short: pedir, medir em segundo plano, guardar (D-1015).

## Por que não mede no render

A medição é cara (um `ebur128` num `video.mp4` grande passou de 150 s) e o render
já é o gargalo do app. Então o boletim nasce **depois**: a primeira vez que a
Revisão Final pergunta por um arquivo sem boletim válido, a medição começa em
segundo plano e a resposta é "medindo"; a tela pergunta de novo até ele chegar.
Uma medição por vez na máquina — duas disputariam a CPU entre si e com o render.

## Onde fica e quando vale

O resultado é um arquivo ao lado da mídia (`video.mp4.boletim.json`). A
**assinatura** dele é tamanho + data de modificação do arquivo + durações dos
trechos: render novo ou short regerado mudam a assinatura e o boletim velho é
ignorado, sem ninguém precisar apagá-lo. Mídia apagada pela limpeza vira o
estado `arquivo_ausente`, não erro.

## Onde a emenda está: achada no vídeo, não calculada (D-1027)

Somar as durações dos trechos e esticar pela duração do vídeo põe a emenda até
2 s fora do lugar (a D-1017 mediu 8 cortes: 25,8% das emendas "com som dos dois
lados" por esse cálculo contra 1,7% na posição real). Por isso cada emenda é
ACHADA: o último segundo do trecho, tal como soa na fonte (a live no corte, o
bruto no short), é procurado no vídeo final por correlação. Emenda que não se
acha com certeza não entra na conta: é contada como "não localizada", nunca
chutada. Sem a fonte no disco, a linha de emendas diz por quê.

## As emendas do corte vêm do que o bruto GUARDOU (D-1024)

O banco diz os desvios de hoje; o `video.mp4` foi cortado com os de quando o
bruto saiu. Medir um com a régua do outro apontaria emendas em instantes
errados e mostraria isso como certo. Por isso as durações vêm do registro ao lado
do bruto (`infrastructure/trechos_do_bruto`). Sem registro, ou com o bruto mais
novo que o vídeo (regerado depois do render), as emendas não são medidas e o
boletim diz por quê — volume e imagem parada não dependem dos trechos.

Falha de medição não é gravada em disco: fica na memória até a assinatura mudar
ou o operador pedir de novo, para a tela não disparar o mesmo FFmpeg a cada
consulta.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.core.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte import boletim_tecnico as regra
from app.domain.short import segmentos_short
from app.infrastructure import boletim_midia as medicao
from app.infrastructure import trechos_do_bruto
from app.infrastructure.worker_queue import escrever_json_atomico
from app.models import Corte, Projeto, Short
from app.services.tasks import fire_and_forget

logger = logging.getLogger(__name__)

ESTADO_PRONTO = "pronto"
ESTADO_MEDINDO = "medindo"
ESTADO_FALHOU = "falhou"
ESTADO_ARQUIVO_AUSENTE = "arquivo_ausente"

# Teto de cada passada do FFmpeg. O `ebur128` num vídeo grande levou 150 s com
# uma thread; o resto da folga cobre disco frio e a máquina ocupada com render.
_TIMEOUT_DO_VOLUME_SEG = 600
_TIMEOUT_DAS_PARADAS_SEG = 900
_TIMEOUT_DO_AUDIO_SEG = 600
_TIMEOUT_DO_MOLDE_SEG = 60
_MIN_TRECHOS_PARA_EMENDA = 2

_VERSAO_DO_FORMATO = 2

# Uma medição por vez; as pedidas enquanto outra roda esperam a vez.
_vez = asyncio.Lock()
_em_voo: dict[str, asyncio.Task] = {}
_falhas: dict[str, tuple[str, str]] = {}


@dataclass(frozen=True)
class _Alvo:
    """O que medir e o que se sabe do arquivo, vindo do banco (lido e solto)."""

    chave: str
    midia: Path
    bruto: Path | None
    # Início e fim de cada trecho na `fonte`, na ordem em que entraram no vídeo.
    trechos: list[tuple[float, float]]
    # Instante do vídeo medido -> instante no bruto (identidade no corte).
    no_bruto: Callable[[float], float]
    # Preenchido quando as emendas não podem ser medidas com confiança.
    emendas_aviso: str | None = None
    # O áudio de onde os trechos saíram: a live no corte, o bruto no short.
    fonte: Path | None = None

    @property
    def duracoes_dos_trechos(self) -> list[float]:
        return [fim - inicio for inicio, fim in self.trechos]


async def consultar(tipo: str, alvo_id: str, *, remedir: bool = False) -> dict:
    """O boletim de agora: pronto, medindo, falhou ou arquivo ausente.

    Nunca bloqueia na medição. `remedir` descarta o boletim e a falha lembrada.
    """
    alvo = await _descrever(tipo, alvo_id)
    if not alvo.midia.is_file():
        return {"estado": ESTADO_ARQUIVO_AUSENTE}

    assinatura = _assinatura(alvo)
    arquivo = _sidecar(alvo.midia)
    if remedir:
        # Sem apagar, o boletim guardado ainda vale pela assinatura e o GET
        # seguinte devolveria o velho como `pronto`, parando o polling.
        _falhas.pop(alvo.chave, None)
        arquivo.unlink(missing_ok=True)
    elif (guardado := _ler_valido(arquivo, assinatura)) is not None:
        return {"estado": ESTADO_PRONTO, **guardado}

    if alvo.chave in _em_voo and not _em_voo[alvo.chave].done():
        return {"estado": ESTADO_MEDINDO}
    falha = _falhas.get(alvo.chave)
    if falha and falha[0] == assinatura:
        return {"estado": ESTADO_FALHOU, "erro": falha[1]}

    _em_voo[alvo.chave] = fire_and_forget(
        _medir_e_guardar(alvo, assinatura, arquivo), name=f"boletim-{alvo_id[:8]}"
    )
    return {"estado": ESTADO_MEDINDO}


async def _descrever(tipo: str, alvo_id: str) -> _Alvo:
    async with AsyncSessionLocal() as db, db.begin():
        if tipo == "short":
            short = await db.get(Short, alvo_id)
            corte = await db.get(Corte, short.corte_id) if short else None
            if not short or not corte or not short.arquivo_short_path:
                raise NaoEncontrado("Short sem vídeo renderizado.")
            return _alvo_do_short(short, corte)
        corte = await db.get(Corte, alvo_id)
        if not corte:
            raise NaoEncontrado("Corte não encontrado.")
        projeto = await db.get(Projeto, corte.projeto_id)
        return _alvo_do_corte(corte, projeto)


def _bruto_do_corte(corte: Corte) -> Path | None:
    if not corte.arquivo_clip_path:
        return None
    return resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)


def _alvo_do_corte(corte: Corte, projeto: Projeto | None) -> _Alvo:
    midia = projetos_dir() / corte.projeto_id / "cortes" / corte.id / "upload_ready" / "video.mp4"
    bruto = _bruto_do_corte(corte)
    trechos, aviso = _trechos_do_video(midia, bruto)
    live = (
        resolver_do_projeto(projeto.arquivo_video_path, projeto.id)
        if projeto and projeto.arquivo_video_path
        else None
    )
    return _Alvo(f"corte:{corte.id}", midia, bruto, trechos, lambda t: t, aviso, live)


def _trechos_do_video(
    midia: Path, bruto: Path | None
) -> tuple[list[tuple[float, float]], str | None]:
    """As durações dos trechos com que o vídeo foi feito, ou o motivo de não saber."""
    if bruto is None or not bruto.is_file():
        return [], "O bruto não está mais no disco, então não dá para localizar as emendas."
    if not midia.is_file():
        return [], None  # sem vídeo o estado é `arquivo_ausente`; nada a avisar
    if bruto.stat().st_mtime > midia.stat().st_mtime:
        return [], "O bruto foi gerado de novo depois deste vídeo: renderize para medir as emendas."
    gravadas = trechos_do_bruto.ler_trechos(bruto)
    if gravadas is None:
        return [], "Este bruto é de antes do registro dos trechos: gere o bruto de novo."
    return gravadas, None


def _alvo_do_short(short: Short, corte: Corte) -> _Alvo:
    midia = resolver_do_projeto(short.arquivo_short_path, corte.projeto_id)
    trechos = segmentos_short.de_json(short.segmentos)
    janela = {"inicio_seg": short.inicio_seg, "fim_seg": short.fim_seg}
    fatias = segmentos_short.efetivos(trechos, **janela)

    def no_bruto(instante: float) -> float:
        return segmentos_short.no_bruto(instante, trechos, **janela)

    # A emenda do short é a junção entre as fatias que o operador montou.
    pares = [(f.inicio_seg, f.fim_seg) for f in fatias] if len(fatias) > 1 else []
    bruto = _bruto_do_corte(corte)
    return _Alvo(f"short:{short.id}", midia, bruto, pares, no_bruto, fonte=bruto)


def _assinatura(alvo: _Alvo) -> str:
    estado = alvo.midia.stat()
    trechos = ",".join(f"{i:.3f}-{f:.3f}" for i, f in alvo.trechos)
    resumo = hashlib.sha1((trechos + (alvo.emendas_aviso or "")).encode()).hexdigest()[:12]  # noqa: S324 — identidade, não segurança
    return f"v{_VERSAO_DO_FORMATO}-{estado.st_size}-{estado.st_mtime_ns}-{resumo}"


def _sidecar(midia: Path) -> Path:
    return midia.with_name(f"{midia.name}.boletim.json")


def _ler_valido(arquivo: Path, assinatura: str) -> dict | None:
    try:
        guardado = json.loads(arquivo.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(guardado, dict) or guardado.get("assinatura") != assinatura:
        return None
    return guardado


async def _medir_e_guardar(alvo: _Alvo, assinatura: str, arquivo: Path) -> None:
    try:
        async with _vez:
            # Esperar a vez pode levar minutos: o arquivo pode ter mudado ou
            # sumido nesse tempo, e medir o que já não vale gasta CPU à toa.
            if not alvo.midia.is_file() or _assinatura(alvo) != assinatura:
                return
            resultado = await asyncio.to_thread(_medir, alvo)
        resultado = {
            "assinatura": assinatura,
            "medido_em": datetime.now(UTC).isoformat(timespec="seconds"),
            **resultado,
        }
        await asyncio.to_thread(escrever_json_atomico, arquivo, resultado)
        _falhas.pop(alvo.chave, None)
    except (medicao.ErroDeMedicao, OSError) as exc:
        logger.warning("[Boletim] %s: %s", alvo.chave, exc)
        _falhas[alvo.chave] = (assinatura, str(exc))
    except Exception as exc:  # noqa: BLE001 — tarefa de fundo: qualquer falha vira estado, nunca derruba o app
        logger.exception("[Boletim] %s falhou", alvo.chave)
        _falhas[alvo.chave] = (assinatura, f"Falha inesperada: {exc}")
    finally:
        _em_voo.pop(alvo.chave, None)


def _medir(alvo: _Alvo) -> dict:
    """Tudo o que o boletim mede, em sequência. Síncrono: roda em thread."""
    volume = medicao.medir_volume(alvo.midia, _TIMEOUT_DO_VOLUME_SEG)
    fps, repete = medicao.medir_quadros_parados(alvo.midia, _TIMEOUT_DAS_PARADAS_SEG)
    paradas = regra.paradas_de_quadros(repete, fps)
    amostras = medicao.ler_audio(alvo.midia, _TIMEOUT_DO_AUDIO_SEG)
    aviso = alvo.emendas_aviso or _aviso_sem_fonte(alvo)
    return {
        "volume": {**asdict(volume), "avisos": regra.avisos_de_volume(volume)},
        "paradas": _paradas_com_origem(alvo, paradas),
        "emendas": None if aviso else _emendas(alvo, amostras),
        "emendas_aviso": aviso,
    }


def _aviso_sem_fonte(alvo: _Alvo) -> str | None:
    """Sem o áudio de onde os trechos saíram não há como achar a emenda no vídeo."""
    if len(alvo.trechos) < _MIN_TRECHOS_PARA_EMENDA or (alvo.fonte and alvo.fonte.is_file()):
        return None
    onde = "O bruto" if alvo.chave.startswith("short:") else "A live"
    return f"{onde} não está mais no disco, então não dá para localizar as emendas."


def _paradas_com_origem(alvo: _Alvo, paradas: list[regra.Parada]) -> list[dict]:
    """Cada parada com a origem; o bruto só é medido se houver parada para explicar."""
    do_bruto: list[regra.Parada] | None = None
    if paradas and alvo.bruto is not None and alvo.bruto.is_file():
        try:
            fps_bruto, repete_bruto = medicao.medir_quadros_parados(
                alvo.bruto, _TIMEOUT_DAS_PARADAS_SEG
            )
            do_bruto = regra.paradas_de_quadros(repete_bruto, fps_bruto)
        except medicao.ErroDeMedicao as exc:
            logger.info("[Boletim] bruto não medido para dar origem: %s", exc)
    itens = []
    for parada in paradas:
        no_bruto = regra.Parada(alvo.no_bruto(parada.inicio_seg), parada.duracao_seg)
        itens.append({**asdict(parada), "origem": regra.origem_da_parada(no_bruto, do_bruto)})
    return itens


def _emendas(alvo: _Alvo, amostras) -> dict:
    fonte = alvo.fonte

    def molde(inicio: float, duracao: float):
        return medicao.ler_trecho(fonte, inicio, duracao, _TIMEOUT_DO_MOLDE_SEG)

    achadas = medicao.localizar_emendas(amostras, alvo.trechos, molde)
    instantes = [t for t in achadas if t is not None]
    medidas = medicao.medir_emendas(amostras, instantes)
    p99 = medicao.p99_do_degrau_da_fala(amostras)
    julgadas = [
        regra.julgar_emenda(t, antes, depois, degrau, p99) for t, antes, depois, degrau in medidas
    ]
    resumo = regra.resumir_emendas(julgadas)
    return {
        **asdict(resumo),
        "total": len(achadas),
        "nao_localizadas": achadas.count(None),
        "p99_da_fala": round(p99, 5),
        "itens": [asdict(e) for e in julgadas],
    }
