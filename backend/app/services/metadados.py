"""
Serviço de Metadados — geração via n8n, monta descrição com créditos obrigatórios
"""

import json
import uuid
import httpx

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Corte, MetadadoCorte, Projeto

# Gradê de cores da série (ciclo)
CORES_SERIE = [
    "Vermelho profundo / Carmesim",
    "Magenta / Roxo-avermelhado escuro",
    "Roxo / Violeta profundo",
    "Índigo / Azul-violeta frio",
    "Azul ciano / Azul profundo",
]

CREDITOS_TEMPLATE = """
🔗 Apoie o criador original:
Todo o crédito deste conteúdo pertence ao Pedro Ivo. Inscreva-se no canal oficial e acompanhe as transmissões:
👉 Canal: @ateuinforma
👉 Gravação da live na íntegra: {link_live}
"""


class MetadadosService:

    @staticmethod
    async def gerar_metadados(corte_id: str):
        """Gera metadados YouTube via n8n e salva no banco."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return

        try:
            # Link da live com timestamp
            link_live = MetadadosService._gerar_link_timestampado(
                projeto.youtube_url, corte.inicio_seg
            )

            payload = {
                "corte_id": corte_id,
                "titulo_proposto": corte.titulo_proposto,
                "resumo": corte.resumo,
                "tema_central": corte.tema_central,
                "inicio_hms": corte.inicio_hms,
                "fim_hms": corte.fim_hms,
                "youtube_url": projeto.youtube_url,
                "titulo_live": projeto.titulo_live,
                "canal_origem": projeto.canal_origem,
                "link_live": link_live,
                "numero_corte": corte.numero,
            }

            webhook_url = f"{settings.n8n_base_url}/webhook/{settings.n8n_webhook_metadados}"
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(webhook_url, json=payload)
                response.raise_for_status()
                resultado = response.json()

            # Monta descrição com créditos obrigatórios
            sinopse = resultado.get("sinopse", "")
            hashtags = resultado.get("hashtags", [])
            creditos = CREDITOS_TEMPLATE.format(link_live=link_live)
            hashtags_str = " ".join(f"#{tag}" for tag in hashtags)
            descricao_completa = f"{sinopse}\n\n{creditos}\n\n{hashtags_str}"

            # Cor da série (baseada no número do corte)
            num_serie = corte.numero
            cor_serie = CORES_SERIE[(num_serie - 1) % len(CORES_SERIE)]

            async with AsyncSessionLocal() as db:
                # Verifica se já existe
                from sqlalchemy import select
                existing = await db.execute(
                    select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
                )
                meta = existing.scalar_one_or_none()

                if not meta:
                    meta = MetadadoCorte(
                        id=str(uuid.uuid4()),
                        corte_id=corte_id,
                    )
                    db.add(meta)

                meta.titulo_youtube = resultado.get("titulo", corte.titulo_proposto)  # Fallback
                meta.descricao_youtube = descricao_completa
                meta.tags_youtube = json.dumps(hashtags, ensure_ascii=False)
                
                # Novas opções múltiplas
                opcoes_titulo = resultado.get("opcoes_titulo", [])
                opcoes_texto_capa = resultado.get("opcoes_texto_capa", [])
                meta.opcoes_titulo = json.dumps(opcoes_titulo, ensure_ascii=False)
                meta.opcoes_texto_capa = json.dumps(opcoes_texto_capa, ensure_ascii=False)
                # Seleciona as primeiras opções como padrão, caso existam,
                # para que haja algo na interface antes do usuário escolher:
                if opcoes_titulo and not meta.titulo_youtube:
                    meta.titulo_youtube = opcoes_titulo[0]
                if opcoes_texto_capa:
                    meta.texto_capa = opcoes_texto_capa[0]

                meta.link_live_com_timestamp = link_live
                meta.canal_credito = projeto.canal_origem
                meta.numero_serie = num_serie
                meta.cor_serie = cor_serie

                await db.commit()

        except Exception as e:
            print(f"Erro ao gerar metadados para corte {corte_id}: {e}")

    @staticmethod
    async def gerar_prompt_thumbnail(corte_id: str):
        """Chama um webhook separado no n8n apenas para gerar o prompt visual baseado na escolha de texto de capa."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return
            
            from sqlalchemy import select
            result = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
            meta = result.scalar_one_or_none()
            if not meta:
                return
        
        try:
            payload = {
                "corte_id": corte_id,
                "tema_central": corte.tema_central,
                "numero_corte": corte.numero,
                "texto_capa_escolhido": meta.texto_capa
            }

            webhook_url = f"{settings.n8n_base_url}/webhook/gerar-prompt-thumbnail"
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(webhook_url, json=payload)
                response.raise_for_status()
                resultado = response.json()
            
            prompt_gerado = resultado.get("prompt_thumbnail", "")

            # Salva o prompt no banco
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
                meta_update = result.scalar_one_or_none()
                if meta_update:
                    meta_update.prompt_thumbnail = prompt_gerado
                    await db.commit()
            
        except Exception as e:
            print(f"Erro ao gerar prompt da thumbnail para {corte_id}: {e}")

    @staticmethod
    def _gerar_link_timestampado(youtube_url: str, inicio_seg: float) -> str:
        """Gera link YouTube com ?t=Xs (timestamp de início do corte)."""
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        parsed = urlparse(youtube_url)
        params = parse_qs(parsed.query)
        params["t"] = [str(int(inicio_seg))]
        novo_query = urlencode({k: v[0] for k, v in params.items()})
        return urlunparse(parsed._replace(query=novo_query))
