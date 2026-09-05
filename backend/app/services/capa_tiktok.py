"""Montagem da capa vertical do TikTok (D-519).

O LAYOUT é montado, sempre igual — é dele que vem a identidade da grade. O que
entra na faixa central é que mudou (D-523).

A primeira versão usava um frame do próprio vídeo, e a ideia tinha lógica: a
capa citaria o que o espectador vai ver. Na prática saiu ruim por um motivo
estrutural — o vídeo é deitado e costuma ter texto na tela (um documento, um
slide, um navegador), e nada disso sobrevive à miniatura da grade do perfil.

Agora a faixa recebe uma ARTE, e o app NÃO a desenha (D-524). Ele escreve o
prompt; o operador gera a imagem no agente capista dele e sobe de volta. É o
mesmo fluxo manual que a D-413 consolidou no horizontal, e a razão é a mesma:
capa é peça editorial, e o operador quer ver e escolher antes de publicar.

A imagem nasce sem texto de propósito — a etiqueta e o selo são desenhados por
cima, com a tipografia do canal. O frame do vídeo continua disponível como
escape hatch.

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
# A arte fica em disco ao lado da capa: refazer a montagem — etiqueta nova,
# ajuste de layout — não deve exigir que o operador gere a imagem de novo.
NOME_DA_ARTE = "capa_tiktok_arte"

# Quantas etiquetas anteriores vão no prompt. O bastante para o modelo enxergar
# o vocabulário do canal, pouco o bastante para não virar uma lista que ele
# tenta cobrir.
_ETIQUETAS_NO_HISTORICO = 20
# O resumo é contexto, não a fonte do texto — a etiqueta sai do tema.
_RESUMO_NO_PROMPT = 1200


ORIGEM_IA = "ia"
ORIGEM_FRAME = "frame"


class CapaTikTokError(RuntimeError):
    """A capa não pôde ser montada. A mensagem é para o operador ler na tela."""


async def gerar(
    corte_id: str,
    *,
    etiqueta: str = "",
    origem: str = ORIGEM_IA,
    instante_seg: float | None = None,
) -> Path:
    """Monta a capa deste corte e grava o caminho no metadado.

    `origem` decide o que vai na faixa central: `"ia"` (padrão) usa a arte que o
    operador subiu; `"frame"` tira um still do MP4, que é o escape hatch para
    quando não há arte e o vídeo tem um plano que serve.

    `etiqueta` vazia usa o `texto_capa` do metadado — o MESMO texto curado que
    vai na thumbnail do YouTube. Não há razão para inventar outro: quem escolheu
    aquela palavra já decidiu como o corte se chama, e uma segunda versão só
    criaria duas identidades para o mesmo vídeo.

    Levanta `CapaTikTokError` com o motivo em português — quem chama devolve isso
    para a tela em vez de um traceback.
    """
    contexto = await _contexto(corte_id, exigir_video=origem == ORIGEM_FRAME)

    faixas = layout_capa.montar_layout()
    texto = layout_capa.normalizar_etiqueta(etiqueta or contexto["texto_capa"])

    destino = contexto["thumb_dir"] / f"{NOME_DA_CAPA}_{corte_id[:8]}.png"
    destino.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="capa-tiktok-") as tmp:
        if origem == ORIGEM_FRAME:
            imagem = Path(tmp) / "frame.jpg"
            instante = instante_seg
            if instante is None:
                duracao = await probe_duracao(contexto["video"]) or 0.0
                instante = layout_capa.instante_do_frame(duracao)
            await _extrair_frame(
                contexto["video"], imagem, instante, faixas.frame.w, faixas.frame.h
            )
        else:
            arte = _arte_existente(contexto["thumb_dir"], corte_id)
            if arte is None:
                raise CapaTikTokError(
                    "Nao ha arte para esta capa. Gere o prompt, crie a imagem 16:9 no "
                    "agente capista e suba com 'Subir arte'."
                )
            imagem = arte

        props = {
            "fundo": FUNDO_PADRAO,
            "etiqueta": texto,
            "selo": contexto["selo"],
            "frameDataUri": _data_uri(imagem),
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
    # O prompt da thumbnail 16:9 — referência de estilo para a arte (D-524).
    prompt_thumbnail: str = ""


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

        meu = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
        meta_do_corte = meu.scalar_one_or_none()

        return ContextoDaEtiqueta(
            projeto_id=corte.projeto_id,
            titulo=corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            resumo=(corte.resumo or "")[:_RESUMO_NO_PROMPT],
            etiquetas_recentes="\n".join(f"- {etiqueta}" for etiqueta in recentes),
            prompt_thumbnail=(meta_do_corte.prompt_thumbnail if meta_do_corte else "") or "",
        )


async def tem_texto_de_capa(corte_id: str) -> bool:
    """Se o corte já tem `texto_capa`, a skill da etiqueta não precisa rodar."""
    async with AsyncSessionLocal() as db:
        resultado = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
        )
        meta = resultado.scalar_one_or_none()
        return bool(meta and (meta.texto_capa or "").strip())


async def _contexto(corte_id: str, *, exigir_video: bool = True) -> dict:
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise CapaTikTokError("Corte nao encontrado.")
        projeto_id = corte.projeto_id

        resultado = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
        )
        meta = resultado.scalar_one_or_none()
        texto_capa = (meta.texto_capa if meta else "") or ""

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
        "texto_capa": texto_capa,
    }


def caminho_da_arte(thumb_dir: Path, corte_id: str, extensao: str = ".png") -> Path:
    """Onde a arte 16:9 daquele corte mora."""
    return thumb_dir / f"{NOME_DA_ARTE}_{corte_id[:8]}{extensao}"


def _arte_existente(thumb_dir: Path, corte_id: str) -> Path | None:
    """A arte já subida, em qualquer extensão de imagem que o operador usou."""
    for extensao in (".png", ".jpg", ".jpeg", ".webp"):
        caminho = caminho_da_arte(thumb_dir, corte_id, extensao)
        if caminho.is_file() and caminho.stat().st_size > 0:
            return caminho
    return None


async def gerar_prompt_da_arte(corte_id: str) -> str:
    """Escreve o prompt da arte e o guarda no metadado (D-524).

    O app para aqui: quem desenha é o operador, no agente capista dele. Guardar
    o prompt — em vez de só devolvê-lo — é o que torna o fluxo retomável: ele
    fecha a tela, gera a imagem com calma e volta para subir a arte.
    """
    from app.services.claude_ia import ClaudeIaService

    contexto = await _contexto(corte_id, exigir_video=False)
    etiqueta = layout_capa.normalizar_etiqueta(contexto["texto_capa"])

    try:
        prompt = await ClaudeIaService.prompt_da_arte_da_capa_via_claude(corte_id, etiqueta)
    except Exception as exc:
        raise CapaTikTokError(f"Nao consegui escrever o prompt da arte: {exc}") from exc

    if not prompt:
        # Aconteceu de verdade: com o corpo da skill ainda no texto generico do
        # template, o modelo respondeu com uma PERGUNTA pedindo a identidade do
        # mascote em vez de escrever o prompt.
        raise CapaTikTokError(
            "A skill nao devolveu um prompt de imagem valido. Personalize o corpo de "
            "'Arte da capa do TikTok' em /canais."
        )

    async with AsyncSessionLocal() as db:
        resultado = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
        )
        meta = resultado.scalar_one_or_none()
        if not meta:
            raise CapaTikTokError("Metadados deste corte nao existem ainda.")
        meta.prompt_capa_tiktok = prompt
        await db.commit()

    return prompt


async def salvar_arte(corte_id: str, conteudo: bytes, nome_arquivo: str) -> Path:
    """Recebe a arte 16:9 feita a mao, que vai na faixa central.

    Diferente de `salvar_upload`, que recebe a CAPA inteira já montada: aqui
    entra só a ilustração, e o sistema ainda desenha a etiqueta e o selo por
    cima. É o caminho normal — a capa pronta é para quando o operador quer
    controle total.
    """
    contexto = await _contexto(corte_id, exigir_video=False)
    extensao = "." + ((nome_arquivo.rsplit(".", 1)[-1] or "png").lower())

    # Uma arte por corte: subir um JPG por cima de um PNG antigo deixaria os dois
    # em disco, e `_arte_existente` pegaria o errado pela ordem da busca.
    for antiga in (".png", ".jpg", ".jpeg", ".webp"):
        caminho_da_arte(contexto["thumb_dir"], corte_id, antiga).unlink(missing_ok=True)

    destino = caminho_da_arte(contexto["thumb_dir"], corte_id, extensao)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(conteudo)
    return destino


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
    tipo = "png" if imagem.suffix.lower() == ".png" else "jpeg"
    dados = base64.b64encode(imagem.read_bytes()).decode("ascii")
    return f"data:image/{tipo};base64,{dados}"


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
