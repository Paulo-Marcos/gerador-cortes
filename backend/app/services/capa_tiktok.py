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

from app import editorial_scaffolds, editorial_skills
from app.channel_paths import para_relativo_ao_projeto, projetos_dir
from app.core import process_runner
from app.database import AsyncSessionLocal
from app.domain import capa_tiktok as layout_capa
from app.domain.capa_tiktok import etiqueta_da_resposta, prompt_da_arte
from app.domain.youtube_layout import FUNDO_PADRAO
from app.infrastructure.ffmpeg_runner import probe_duracao, run_ffmpeg_simple
from app.models import Corte, MetadadoCorte
from app.provider_ia import ProviderIA
from app.services.channels import identidade_do_canal_ativo
from app.services.claude_ia import gerar_texto, registrar_skill_usada
from sqlalchemy import select

logger = logging.getLogger(__name__)

_SKILL_CAPA_TIKTOK = "capa-tiktok-expert"
_SKILL_CAPA_TIKTOK_IMAGEM = "capa-tiktok-imagem-expert"

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GEN_SCRIPT = _REPO_ROOT / "scripts" / "gen-capa-tiktok.mjs"
# D-750: ~3x o pior caso medido (101 s, na primeira execução, a frio; o normal é
# 11-38 s). Só existe para um Chromium travado não prender o render para sempre.
_TIMEOUT_DO_GERADOR_SEG = 300

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

    faixas = layout_capa.montar_layout(_ajuste_do_layout())
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


async def sugerir_etiqueta(corte_id: str, provider: ProviderIA = "claude") -> str:
    """As 2-3 palavras que vão no alto da capa vertical do TikTok (D-520).

    Skill separada da do YouTube, e não um parâmetro dela, porque as duas
    escrevem coisas de gêneros diferentes: lá a manchete INTEIRA de um cartaz
    que disputa o clique numa lista; aqui o nome do assunto numa prateleira
    onde nove capas são vistas juntas.

    A diferença mais contra-intuitiva está no histórico. Toda a esteira manda
    o passado para EVITAR repetição; aqui ele vai para permiti-la — três
    cortes sobre a Selic devem dizer SELIC, e é essa repetição que faz a
    grade parecer um canal.

    Levanta `LookupError` (corte inexistente). Devolve a etiqueta já
    normalizada; string vazia quando o modelo não produziu nada aproveitável,
    e nesse caso a capa sai sem texto em vez de não sair.
    """
    contexto = await montar_contexto_da_etiqueta(corte_id)

    skill = editorial_skills.resolver_skill(_SKILL_CAPA_TIKTOK)
    scaffold = editorial_scaffolds.resolver_scaffold("capa-tiktok")
    prompt = scaffold.format(
        titulo_proposto=contexto.titulo,
        tema_central=contexto.tema_central,
        resumo=contexto.resumo,
        etiquetas_recentes=contexto.etiquetas_recentes or "(nenhuma ainda)",
    )
    registrar_skill_usada(_SKILL_CAPA_TIKTOK, skill, scaffold)
    bruto = await gerar_texto(
        provider,
        prompt,
        skill,
        _SKILL_CAPA_TIKTOK,
        projeto_id=contexto.projeto_id,
        corte_id=corte_id,
    )
    return etiqueta_da_resposta(bruto)


def _ajuste_do_layout() -> dict:
    """Onde o operador pôs cada componente, das configurações globais (D-532).

    JSON inválido vira `{}` — a capa sai no padrão em vez de não sair. Config de
    posição não é motivo para uma capa falhar.
    """
    from app.services.app_settings import AppSettingsService

    try:
        return json.loads(AppSettingsService.get().capa_tiktok_layout or "{}")
    except (ValueError, TypeError):
        logger.warning("[CapaTikTok] layout salvo nao e um JSON valido; usando o padrao")
        return {}


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
        prompt_thumbnail = (meta.prompt_thumbnail if meta else "") or ""

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
        "prompt_thumbnail": prompt_thumbnail,
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


async def _escrever_prompt_da_arte(corte_id: str, texto_capa: str, provider: ProviderIA) -> str:
    """O prompt de imagem da faixa central da capa do TikTok (D-523, D-524).

    A primeira versão da capa usava um frame do próprio vídeo. Ficou ruim por
    um motivo estrutural: o vídeo é deitado e cheio de texto na tela — um
    documento, um slide —, e nada disso sobrevive à miniatura da grade do
    perfil. Aqui a faixa passa a receber uma cena feita para ser vista
    pequena.

    A imagem nasce SEM texto de propósito: a etiqueta e o selo são desenhados
    por cima, com a tipografia do canal. Gerador de imagem não escreve
    tipografia confiável, e duas camadas de texto brigariam.

    O estilo é herdado, não redescrito: o prompt que o Capista já escreveu
    para a thumbnail do YouTube vai junto como referência. Manter a
    identidade do mascote em dois corpos de skill é garantir que um dia os
    dois discordem — e aí o mesmo canal teria dois personagens.

    Levanta `LookupError` (corte inexistente).
    """
    contexto = await montar_contexto_da_etiqueta(corte_id)

    skill = editorial_skills.resolver_skill(_SKILL_CAPA_TIKTOK_IMAGEM)
    scaffold = editorial_scaffolds.resolver_scaffold("capa-tiktok-imagem")
    prompt = scaffold.format(
        titulo_proposto=contexto.titulo,
        tema_central=contexto.tema_central,
        texto_capa=texto_capa or "(sem etiqueta)",
        resumo=contexto.resumo,
        prompt_thumbnail=contexto.prompt_thumbnail or "(o Capista ainda nao escreveu)",
    )
    registrar_skill_usada(_SKILL_CAPA_TIKTOK_IMAGEM, skill, scaffold)
    bruto = await gerar_texto(
        provider,
        prompt,
        skill,
        _SKILL_CAPA_TIKTOK_IMAGEM,
        projeto_id=contexto.projeto_id,
        corte_id=corte_id,
    )
    return prompt_da_arte(bruto)


async def gerar_prompt_da_arte(corte_id: str, provider: ProviderIA = "claude") -> str:
    """Escreve o prompt da arte e o guarda no metadado (D-524).

    O app para aqui: quem desenha é o operador, no agente capista dele. Guardar
    o prompt — em vez de só devolvê-lo — é o que torna o fluxo retomável: ele
    fecha a tela, gera a imagem com calma e volta para subir a arte.
    """
    contexto = await _contexto(corte_id, exigir_video=False)
    if not contexto["prompt_thumbnail"]:
        # A arte HERDA o estilo do prompt do YouTube: mascote, paleta, luz. Sem
        # ele a skill compoe do zero, e o resultado e uma cena bonita de outro
        # canal — o pior tipo de erro aqui, porque parece certo na miniatura e
        # so quebra a identidade quando a grade e vista inteira.
        raise CapaTikTokError(
            "Gere antes o prompt da thumbnail do YouTube: e dele que a arte herda "
            "o personagem, a paleta e a luz do canal."
        )

    etiqueta = layout_capa.normalizar_etiqueta(contexto["texto_capa"])

    try:
        prompt = await _escrever_prompt_da_arte(corte_id, etiqueta, provider)
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
    """Um quadro do vídeo, já no tamanho exato da área da arte.

    `increase` + `crop` em vez de `decrease`: melhor cortar as bordas do que
    devolver uma imagem com tarjas dentro de uma capa que já é sobre não ter
    tarjas.

    O corte é agressivo desde a D-526 — a área virou 4:5 e o vídeo é 16:9, então
    sobram só os 45% centrais da largura. É o preço de um escape hatch: quem
    escolhe o frame já sabe que a arte não veio.
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
    """Roda o gerador pelo runner único de processo externo (D-750).

    O runner guarda o fallback síncrono do event loop Selector do Windows (D-369).
    Timeout vira código -1: cai no mesmo caminho de falha de um gerador que
    quebrou, em vez de levantar e derrubar quem chamou.
    """
    try:
        resultado = await process_runner.rodar(
            ["node", str(_GEN_SCRIPT), str(destino), props_path],
            cwd=_REPO_ROOT,
            timeout=_TIMEOUT_DO_GERADOR_SEG,
        )
    except process_runner.ProcessoEstourouOTempo as exc:
        return -1, str(exc)
    return resultado.returncode, resultado.saida


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
