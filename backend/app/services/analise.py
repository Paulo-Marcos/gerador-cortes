"""
Serviço de Análise — envia transcrição para n8n e salva cortes gerados
"""

import json
import uuid
import httpx

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Projeto, Corte, StatusProjeto


class AnaliseService:

    @staticmethod
    async def analisar_transcricao(projeto_id: str):
        """Envia transcrição para o workflow n8n e salva os cortes retornados."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if not projeto or not projeto.transcricao_raw:
                return

            # Atualiza status
            projeto.status = StatusProjeto.ANALISANDO
            await db.commit()

        try:
            transcricao = json.loads(projeto.transcricao_raw)

            # Monta payload para o n8n
            payload = {
                "projeto_id": projeto_id,
                "youtube_url": projeto.youtube_url,
                "titulo_live": projeto.titulo_live,
                "duracao_segundos": projeto.duracao_segundos,
                "transcricao": transcricao,
                "guia_cortes": AnaliseService._ler_guia(),
            }

            # Chama webhook n8n
            webhook_url = f"{settings.n8n_base_url}/webhook/{settings.n8n_webhook_analise}"
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(webhook_url, json=payload)
                response.raise_for_status()
                resultado = response.json()

            # Salva cortes no banco
            cortes_data = resultado.get("cortes", [])
            async with AsyncSessionLocal() as db:
                for i, corte_data in enumerate(cortes_data):
                    corte = Corte(
                        id=str(uuid.uuid4()),
                        projeto_id=projeto_id,
                        numero=i + 1,
                        titulo_proposto=corte_data.get("titulo_proposto", ""),
                        resumo=corte_data.get("resumo", ""),
                        tema_central=corte_data.get("tema_central", ""),
                        inicio_hms=corte_data.get("inicio_hms", "00:00:00"),
                        fim_hms=corte_data.get("fim_hms", "00:00:00"),
                        inicio_seg=corte_data.get("inicio_seg", 0.0),
                        fim_seg=corte_data.get("fim_seg", 0.0),
                        desvios=json.dumps(corte_data.get("desvios", []), ensure_ascii=False),
                    )
                    db.add(corte)

                # Atualiza status do projeto
                projeto = await db.get(Projeto, projeto_id)
                if projeto:
                    projeto.status = StatusProjeto.ANALISADO
                await db.commit()

        except Exception as e:
            async with AsyncSessionLocal() as db:
                projeto = await db.get(Projeto, projeto_id)
                if projeto:
                    projeto.status = StatusProjeto.ERRO
                    projeto.erro_msg = str(e)
                    await db.commit()

    @staticmethod
    def _ler_guia() -> str:
        """Lê o GUIA_CRIAÇÃO_CORTES.md para enviar como context ao n8n."""
        guia_paths = [
            "/app/assets/GUIA_CRIACAO_CORTES.md",
            "./GUIA_CRIACAO_CORTES.md",
        ]
        for path in guia_paths:
            try:
                with open(path, encoding="utf-8") as f:
                    return f.read()
            except FileNotFoundError:
                continue
        return ""  # Fallback: n8n usa o guia hardcoded no workflow
