"""Serviço de avaliação de thumbnails (D-066).

Orquestra o registro do histórico de avaliações do par prompt+imagem e a sua
leitura. No momento do registro, tira um *snapshot* do prompt e copia a imagem
avaliada para uma pasta de histórico — assim a avaliação continua íntegra mesmo
que o corte regenere prompt/thumbnail depois (o arquivo da capa é sobrescrito
no caminho fixo `thumb_<corte>.jpg`).

Aditivo: não toca no fluxo de geração existente; apenas lê o que ele produziu.
"""

import asyncio
import os
import shutil
import uuid
from datetime import datetime

from app.channel_paths import para_relativo_ao_projeto, projetos_dir
from app.database import AsyncSessionLocal
from app.domain.avaliacao_thumbnail import (
    CRITERIOS,
    agregar_avaliacoes,
    normalizar_nota,
    normalizar_veredito,
)
from app.models import AvaliacaoThumbnail, Corte, MetadadoCorte
from sqlalchemy import select


def _serializar(avaliacao: AvaliacaoThumbnail) -> dict:
    """Converte uma linha em dict pronto para a API/agregação."""
    return {
        "id": avaliacao.id,
        "corte_id": avaliacao.corte_id,
        "prompt_snapshot": avaliacao.prompt_snapshot,
        "thumbnail_path_snapshot": avaliacao.thumbnail_path_snapshot,
        "titulo_youtube_snapshot": avaliacao.titulo_youtube_snapshot,
        "texto_capa_snapshot": avaliacao.texto_capa_snapshot,
        "veredito": avaliacao.veredito,
        "nota_fidelidade": avaliacao.nota_fidelidade,
        "nota_clareza": avaliacao.nota_clareza,
        "nota_beleza": avaliacao.nota_beleza,
        "nota_impacto": avaliacao.nota_impacto,
        "nota_honestidade": avaliacao.nota_honestidade,
        "comentario": avaliacao.comentario,
        "criado_em": avaliacao.criado_em.isoformat() if avaliacao.criado_em else None,
    }


async def _snapshot_imagem(origem: str, projeto_id: str, avaliacao_id: str) -> str:
    """Copia a imagem avaliada para a pasta de histórico e devolve o caminho.

    Retorna string vazia quando ainda não há imagem (avaliação só do prompt) ou
    quando o arquivo de origem não existe mais.
    """
    if not origem:
        return ""
    # D-158: a origem pode estar gravada RELATIVA ao projeto — reancora pela raiz
    # de dados vigente antes de checar/copiar. Usa o `projetos_dir` do módulo para
    # honrar override em teste.
    origem_rel = para_relativo_ao_projeto(origem, projeto_id)
    origem_abs = os.path.join(str(projetos_dir()), projeto_id, origem_rel)
    if not os.path.exists(origem_abs):
        return ""

    destino_dir = os.path.join(str(projetos_dir()), projeto_id, "thumbnails", "avaliacoes")
    os.makedirs(destino_dir, exist_ok=True)

    extensao = os.path.splitext(origem_abs)[1] or ".jpg"
    destino = os.path.join(destino_dir, f"{avaliacao_id}{extensao}")
    await asyncio.to_thread(shutil.copy2, origem_abs, destino)
    # Persiste o snapshot RELATIVO ao projeto (reancorável pelo canal ativo).
    return para_relativo_ao_projeto(destino, projeto_id)


class AvaliacaoThumbnailService:
    @staticmethod
    async def registrar(
        corte_id: str,
        *,
        veredito: str,
        notas: dict | None = None,
        comentario: str = "",
    ) -> dict:
        """Registra uma avaliação do par prompt+imagem atual do corte.

        `notas` é um dict opcional `{criterio: 1..5}`; critérios ausentes ficam
        como NULL (não avaliados). Levanta ValueError se o corte/metadado não
        existir ou se veredito/nota forem inválidos.
        """
        veredito_norm = normalizar_veredito(veredito)
        notas = notas or {}
        notas_norm = {criterio: normalizar_nota(notas.get(criterio)) for criterio in CRITERIOS}

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if not meta:
                raise ValueError("Metadados não encontrados")

            projeto_id = corte.projeto_id
            prompt = meta.prompt_thumbnail or ""
            thumbnail_origem = meta.thumbnail_path or ""
            titulo = meta.titulo_youtube or ""
            texto_capa = meta.texto_capa or ""

        if not prompt:
            raise ValueError("Não há prompt de thumbnail para avaliar. Gere o prompt antes.")

        avaliacao_id = str(uuid.uuid4())
        thumbnail_snapshot = await _snapshot_imagem(thumbnail_origem, projeto_id, avaliacao_id)

        async with AsyncSessionLocal() as db:
            avaliacao = AvaliacaoThumbnail(
                id=avaliacao_id,
                corte_id=corte_id,
                prompt_snapshot=prompt,
                thumbnail_path_snapshot=thumbnail_snapshot,
                titulo_youtube_snapshot=titulo,
                texto_capa_snapshot=texto_capa,
                veredito=veredito_norm,
                nota_fidelidade=notas_norm["fidelidade"],
                nota_clareza=notas_norm["clareza"],
                nota_beleza=notas_norm["beleza"],
                nota_impacto=notas_norm["impacto"],
                nota_honestidade=notas_norm["honestidade"],
                comentario=(comentario or "").strip(),
                criado_em=datetime.utcnow(),
            )
            db.add(avaliacao)
            await db.commit()
            await db.refresh(avaliacao)
            return _serializar(avaliacao)

    @staticmethod
    async def listar_por_corte(corte_id: str) -> dict:
        """Histórico de um corte (mais recentes primeiro) + resumo agregado."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AvaliacaoThumbnail)
                .where(AvaliacaoThumbnail.corte_id == corte_id)
                .order_by(AvaliacaoThumbnail.criado_em.desc())
            )
            linhas = result.scalars().all()

        avaliacoes = [_serializar(linha) for linha in linhas]
        return {"avaliacoes": avaliacoes, "resumo": agregar_avaliacoes(avaliacoes)}

    @staticmethod
    async def listar_recentes(limite: int = 100) -> dict:
        """Histórico global recente — base para o futuro agente de padrões."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AvaliacaoThumbnail)
                .order_by(AvaliacaoThumbnail.criado_em.desc())
                .limit(limite)
            )
            linhas = result.scalars().all()

        avaliacoes = [_serializar(linha) for linha in linhas]
        return {"avaliacoes": avaliacoes, "resumo": agregar_avaliacoes(avaliacoes)}
