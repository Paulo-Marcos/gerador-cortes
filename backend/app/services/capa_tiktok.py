"""Montagem da capa vertical do TikTok (D-519).

Três passos, nenhum deles caro: o FFmpeg tira um still 16:9 do MP4, o still vira
data URI, e o Remotion rasteriza o quadro 1080x1920 com o fundo e o chrome do
canal. Não há geração de imagem por IA aqui — a decisão de projeto foi montar,
não inventar: a identidade da grade do TikTok vem de o layout ser SEMPRE o mesmo,
e um gerador criativo trabalharia contra isso (além de custar uma chamada por
corte).

A geometria vem pronta de `app/domain/capa_tiktok.py`. Este módulo é a
plumbing: arquivos, subprocessos e o caminho gravado no metadado.

Falhar aqui não derruba nada a montante: quem chama recebe `None` e a tela diz
que não deu, porque uma capa que some calada é pior do que capa nenhuma (D-384).
"""

from __future__ import annotations

import base64
import json
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.channel_paths import para_relativo_ao_projeto, projetos_dir
from app.database import AsyncSessionLocal
from app.domain import capa_tiktok as layout_capa
from app.domain.youtube_layout import FUNDO_PADRAO
from app.infrastructure.ffmpeg_runner import probe_duracao, run_ffmpeg_simple
from app.models import Corte, MetadadoCorte
from app.services.channels import identidade_do_canal_ativo
from sqlalchemy import select

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GEN_SCRIPT = _REPO_ROOT / "scripts" / "gen-capa-tiktok.mjs"

# Quantos bytes do fim da saída do gerador entram no log quando ele falha.
_SAIDA_TAIL = 1200

NOME_DA_CAPA = "capa_tiktok"

# Quantas etiquetas anteriores vão no prompt. O bastante para o modelo enxergar
# o vocabulário do canal, pouco o bastante para não virar uma lista que ele
# tenta cobrir.
_ETIQUETAS_NO_HISTORICO = 20
# O resumo é contexto, não a fonte do texto — a etiqueta sai do tema.
_RESUMO_NO_PROMPT = 1200


class CapaTikTokError(RuntimeError):
    """A capa não pôde ser montada. A mensagem é para o operador ler na tela."""


async def gerar(corte_id: str, *, etiqueta: str, instante_seg: float | None = None) -> Path:
    """Monta a capa deste corte e grava o caminho no metadado.

    `instante_seg` escolhe o frame; sem ele, o primeiro terço do vídeo
    (`instante_do_frame`). Levanta `CapaTikTokError` com o motivo em português —
    quem chama devolve isso para a tela em vez de um traceback.
    """
    contexto = await _contexto(corte_id)
    video = contexto["video"]

    instante = instante_seg
    if instante is None:
        duracao = await probe_duracao(video) or 0.0
        instante = layout_capa.instante_do_frame(duracao)

    faixas = layout_capa.montar_layout()
    texto = layout_capa.normalizar_etiqueta(etiqueta)

    destino = contexto["thumb_dir"] / f"{NOME_DA_CAPA}_{corte_id[:8]}.png"
    destino.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="capa-tiktok-") as tmp:
        still = Path(tmp) / "frame.jpg"
        await _extrair_frame(video, still, instante, faixas.frame.w, faixas.frame.h)
        props = {
            "fundo": FUNDO_PADRAO,
            "etiqueta": texto,
            "selo": contexto["selo"],
            "frameDataUri": _data_uri(still),
            "faixas": faixas.como_dict(),
        }
        await _rasterizar(destino, props)

    if not destino.is_file() or destino.stat().st_size == 0:
        raise CapaTikTokError("O gerador rodou mas nao escreveu a imagem.")

    await _gravar_caminho(corte_id, contexto["projeto_id"], destino, etiqueta=texto)
    logger.info("[CapaTikTok] %s gerada", destino.name)
    return destino


async def salvar_upload(corte_id: str, conteudo: bytes, nome_arquivo: str) -> Path:
    """Grava uma capa feita por fora, no lugar da montada.

    Existe porque nem toda capa nasce do vídeo: uma arte específica, um frame
    escolhido a dedo no editor de imagem. O contrato com o resto do sistema é o
    mesmo — muda só quem desenhou.
    """
    contexto = await _contexto(corte_id, exigir_video=False)
    extensao = (nome_arquivo.rsplit(".", 1)[-1] or "png").lower()

    destino = contexto["thumb_dir"] / f"{NOME_DA_CAPA}_{corte_id[:8]}.{extensao}"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(conteudo)

    await _gravar_caminho(corte_id, contexto["projeto_id"], destino)
    return destino


@dataclass(frozen=True)
class ContextoDaEtiqueta:
    """O que a skill da etiqueta lê para nomear o assunto do corte."""

    projeto_id: str
    titulo: str
    tema_central: str
    resumo: str
    etiquetas_recentes: str


async def montar_contexto_da_etiqueta(corte_id: str) -> ContextoDaEtiqueta:
    """O material que a skill da etiqueta precisa ler (D-520).

    Inclui as etiquetas RECENTES do canal, e o motivo é o inverso do resto da
    esteira: em toda parte o histórico serve para evitar repetição; aqui serve
    para permiti-la. Três cortes sobre a Selic devem dizer SELIC — é a repetição
    que faz nove capas parecerem um canal, e não nove cartazes.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        resultado = await db.execute(
            select(MetadadoCorte)
            .where(MetadadoCorte.etiqueta_tiktok != "")
            .where(MetadadoCorte.corte_id != corte_id)
            .order_by(MetadadoCorte.atualizado_em.desc())
            .limit(_ETIQUETAS_NO_HISTORICO)
        )
        recentes = [meta.etiqueta_tiktok for meta in resultado.scalars().all()]

        return ContextoDaEtiqueta(
            projeto_id=corte.projeto_id,
            titulo=corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            resumo=(corte.resumo or "")[:_RESUMO_NO_PROMPT],
            etiquetas_recentes="\n".join(f"- {etiqueta}" for etiqueta in recentes),
        )


async def _contexto(corte_id: str, *, exigir_video: bool = True) -> dict:
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise CapaTikTokError("Corte nao encontrado.")
        projeto_id = corte.projeto_id

    video = projetos_dir() / projeto_id / "cortes" / corte_id / "upload_ready" / "video.mp4"
    if exigir_video and not video.is_file():
        raise CapaTikTokError(
            "O video final deste corte nao esta em upload_ready — gere o corte antes."
        )

    canal = identidade_do_canal_ativo()
    selo = (canal.handle or canal.nome or "").strip()
    if selo and not selo.startswith("@"):
        selo = f"@{selo}"

    return {
        "projeto_id": projeto_id,
        "video": video,
        "thumb_dir": projetos_dir() / projeto_id / "thumbnails",
        "selo": selo,
    }


async def _extrair_frame(
    video: Path, destino: Path, instante: float, largura: int, altura: int
) -> None:
    """Um quadro do vídeo, já no tamanho exato da faixa central.

    `increase` + `crop` em vez de `decrease`: o vídeo é 16:9 como a faixa, então
    na prática é um redimensionamento — mas se um dia entrar um MP4 com outra
    proporção, é melhor cortar as bordas do que devolver uma imagem com tarjas
    dentro de uma capa que já é sobre não ter tarjas.
    """
    cmd = [
        "ffmpeg",
        "-y",
        # Antes do -i: seek rápido por keyframe. Precisão de quadro não importa
        # numa capa, e o seek exato leria o arquivo inteiro até o instante.
        "-ss",
        f"{max(0.0, instante):.3f}",
        "-i",
        str(video),
        "-frames:v",
        "1",
        "-vf",
        f"scale={largura}:{altura}:force_original_aspect_ratio=increase,crop={largura}:{altura}",
        "-q:v",
        "3",
        str(destino),
    ]
    try:
        await run_ffmpeg_simple(cmd, label="capa-tiktok-frame")
    except RuntimeError as exc:
        raise CapaTikTokError(f"Nao consegui tirar o frame do video: {exc}") from exc

    if not destino.is_file():
        raise CapaTikTokError("O FFmpeg terminou sem escrever o frame.")


def _data_uri(imagem: Path) -> str:
    """O still embutido nos props.

    Copiá-lo para `public/` do renderer invalidaria o fingerprint do bundle a
    cada corte (D-190), e o cache do Remotion pararia de acertar — cada capa
    custaria um bundle novo.
    """
    dados = base64.b64encode(imagem.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{dados}"


async def _rasterizar(destino: Path, props: dict) -> None:
    fd, props_path = tempfile.mkstemp(suffix=".capa-tiktok.json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(props, handle)

        returncode, saida = await _rodar_node(destino, props_path)
        if returncode != 0:
            logger.warning(
                "[CapaTikTok] gerador falhou (rc=%s): %s", returncode, saida[-_SAIDA_TAIL:]
            )
            raise CapaTikTokError("O gerador da capa falhou. O detalhe esta no log do backend.")
    finally:
        Path(props_path).unlink(missing_ok=True)


async def _rodar_node(destino: Path, props_path: str) -> tuple[int, str]:
    """Roda o gerador, com o caminho síncrono como rede (D-369).

    `create_subprocess_exec` levanta `NotImplementedError` sob o event loop
    Selector do uvicorn no Windows. Sem o fallback em thread, a geração falharia
    calada.
    """
    import asyncio  # noqa: PLC0415 — usado só aqui e no fallback

    argumentos = ["node", str(_GEN_SCRIPT), str(destino), props_path]
    try:
        proc = await asyncio.create_subprocess_exec(
            *argumentos,
            cwd=str(_REPO_ROOT),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        saida, _ = await proc.communicate()
        return proc.returncode or 0, saida.decode(errors="replace")
    except NotImplementedError:
        import subprocess  # noqa: PLC0415 — só o fallback precisa dele

        def _sincrono():
            return subprocess.run(
                argumentos,
                cwd=str(_REPO_ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
                check=False,
            )

        resultado = await asyncio.to_thread(_sincrono)
        return resultado.returncode, resultado.stdout


async def _gravar_caminho(
    corte_id: str, projeto_id: str, destino: Path, *, etiqueta: str | None = None
) -> None:
    """Persiste RELATIVO ao projeto, reancorável pelo canal ativo (D-158).

    A etiqueta é gravada junto porque ela alimenta o histórico do canal — sem
    isso a skill nunca veria o vocabulário que ela mesma criou, e a coerência da
    grade dependeria de o modelo adivinhar o mesmo nome duas vezes.
    """
    async with AsyncSessionLocal() as db:
        resultado = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
        )
        meta = resultado.scalar_one_or_none()
        if not meta:
            raise CapaTikTokError("Metadados deste corte nao existem ainda.")
        meta.thumbnail_tiktok_path = para_relativo_ao_projeto(str(destino), projeto_id)
        if etiqueta is not None:
            meta.etiqueta_tiktok = etiqueta
        await db.commit()
