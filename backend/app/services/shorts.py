import asyncio
import json
import uuid
from pathlib import Path

from app.channel_paths import para_relativo_ao_projeto, projetos_dir, resolver_do_projeto
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.segment_calculator import calcular_segmentos
from app.infrastructure import gemini_client
from app.models import Corte, MetadadoShort, Projeto, Short, StatusShort
from app.services.app_logging import (
    current_log_level,
    operational_debug,
    operational_error,
    operational_info,
)
from app.services.timeline_math import TimelineMath
from pydantic import BaseModel, Field
from sqlalchemy import select


class SugestaoShort(BaseModel):
    titulo: str = Field(description="Título atrativo e viral para o short.")
    inicio_seg: float = Field(description="Tempo de início em segundos (relativo ao corte atual).")
    fim_seg: float = Field(description="Tempo de fim em segundos (relativo ao corte atual).")
    frase_capa: str = Field(description="Frase curta e impactante para o card superior (hook).")
    justificativa: str = Field(description="Por que este trecho é bom para um short?")


class ListaSugestoes(BaseModel):
    shorts: list[SugestaoShort]


class _MetaShort(BaseModel):
    titulo_youtube: str
    descricao_youtube: str


class ShortsService:
    @staticmethod
    async def gerar_sugestoes_ia(corte_id: str):
        """
        [Fase 5] Lê a transcrição do corte (já com silêncios removidos/recalculada)
        e pede para o Gemini extrair pílulas de 30 a 120 segundos.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado.")
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto or not projeto.transcricao_raw:
                raise ValueError("Projeto ou transcrição não encontrados.")

            # 1. Obter a transcrição recalculada (Fase 2)
            transcricao_original = json.loads(projeto.transcricao_raw)
            desvios = json.loads(corte.desvios or "[]")

            # Calcula os segmentos NLE (sem silêncios/desvios)
            segmentos = calcular_segmentos(corte.inicio_seg, corte.fim_seg, desvios)
            segmentos_mantidos = [{"start": s[0], "end": s[1]} for s in segmentos]

            # Recalcula a transcrição para o tempo exato deste corte
            transcricao_corte = TimelineMath.recalcular_transcricao(
                transcricao_original, segmentos_mantidos
            )

            # Formata a transcrição para o prompt
            texto_prompt = ""
            for t in transcricao_corte:
                texto_prompt += f"[{t['inicio']:.2f}s - {t['fim']:.2f}s]: {t['texto']}\n"

            if not texto_prompt:
                raise ValueError("Transcrição resultante está vazia após recálculo.")

            sugestoes = []
            if getattr(corte, "sugestoes_ia_raw", None):
                try:
                    resultado_json = json.loads(corte.sugestoes_ia_raw)
                    sugestoes = resultado_json.get("shorts", [])
                    operational_debug(
                        "ShortsService",
                        f"Usando sugestões cacheadas no DB para o corte {corte_id}",
                    )
                except Exception:
                    sugestoes = []

            if not sugestoes:
                # 2. Chama o Gemini
                prompt = f"""
                Você é um editor especialista em conteúdo viral para TikTok e YouTube Shorts.
                Abaixo está a transcrição de um trecho de vídeo, com as marcações de tempo exatas em segundos.
                Sua tarefa é encontrar pílulas (sub-cortes) que sejam altamente engajantes, que tenham começo, meio e fim,
                e que tenham duração entre 30 e 120 segundos.

                Para cada pílula, você deve sugerir:
                1. Um título viral.
                2. Uma 'frase_capa': Esta frase aparecerá num card fixo no topo do vídeo durante todo o Short. Deve ser um hook (gancho) extremamente forte.
                3. Justificativa do engajamento.

                Transcrição do vídeo:
                {texto_prompt}
                """

                resultado_json = await gemini_client.generate_json(
                    "gemini-2.5-flash", prompt, schema=ListaSugestoes, temperature=0.7
                )

                sugestoes = resultado_json.get("shorts", [])

                corte.sugestoes_ia_raw = json.dumps(resultado_json, ensure_ascii=False)
                await db.commit()

            novos_shorts = []
            for i, sug in enumerate(sugestoes):
                short_id = str(uuid.uuid4())
                novo_short = Short(
                    id=short_id,
                    corte_id=corte_id,
                    numero=i + 1,
                    titulo_sugerido=sug["titulo"],
                    inicio_seg=sug["inicio_seg"],
                    fim_seg=sug["fim_seg"],
                    status=StatusShort.SUGERIDO,
                )
                db.add(novo_short)

                # Cria metadado inicial com a frase da capa
                meta = MetadadoShort(
                    id=str(uuid.uuid4()), short_id=short_id, frase_capa=sug["frase_capa"]
                )
                db.add(meta)

                novos_shorts.append(
                    {
                        "id": novo_short.id,
                        "titulo": novo_short.titulo_sugerido,
                        "inicio_seg": novo_short.inicio_seg,
                        "fim_seg": novo_short.fim_seg,
                        "frase_capa": sug["frase_capa"],
                        "justificativa": sug.get("justificativa", ""),
                    }
                )
            await db.commit()

        return novos_shorts

    @staticmethod
    async def analisar_cenas_ia(short_id: str):
        """
        [Fase 5.5] Analisa visualmente o trecho do short para sugerir enquadramentos
        (Split Screen, Reação, Fullscreen) e zooms dinâmicos.
        """
        res = await ShortsService.montar_prompt_cenas(short_id)
        prompt = res["prompts"][0]["texto"]  # Shorts são curtos, pegamos a primeira parte

        response = await gemini_client.generate_json(
            model="gemini-2.0-flash",  # Upgrade model for scenes
            prompt=prompt,
            temperature=0.5,
        )

        cenas = response.get("cenas", [])
        return await ShortsService.importar_cenas(short_id, {"cenas": cenas})

    @staticmethod
    async def montar_prompt_cenas(short_id: str):
        """Gera o prompt (podendo ser em chunks) para análise de cenas de um Short."""
        async with AsyncSessionLocal() as db:
            short = await db.get(Short, short_id)
            if not short:
                raise ValueError("Short não encontrado")
            corte = await db.get(Corte, short.corte_id)
            projeto = await db.get(Projeto, corte.projeto_id)

            transcricao_original = json.loads(projeto.transcricao_raw)
            desvios = json.loads(corte.desvios or "[]")
            segmentos = calcular_segmentos(float(corte.inicio_seg), float(corte.fim_seg), desvios)
            segmentos_mantidos = [{"start": s[0], "end": s[1]} for s in segmentos]
            transcricao_corte = TimelineMath.recalcular_transcricao(
                transcricao_original, segmentos_mantidos
            )

            # Filtra apenas o trecho do Short
            inicio_ms = int(short.inicio_seg * 1000)
            fim_ms = int(short.fim_seg * 1000)
            transcricao_short = [
                w
                for w in transcricao_corte
                if int(w["start"] * 1000) >= inicio_ms and int(w["start"] * 1000) <= fim_ms
            ]

            from app.services.cenas_remotion import CenasRemotionService

            # Reutiliza o formatador de prompt mas ajustado para Short
            # Note: Shorts geralmente não precisam de hook de 15s pois eles SÃO o hook.
            # Mas vamos manter o padrão se o usuário quiser.
            prompts = await CenasRemotionService.montar_prompt(
                corte.id, transcricao_override=transcricao_short
            )
            return prompts

    @staticmethod
    async def importar_cenas(short_id: str, dados: dict):
        """Importa o JSON de cenas para um Short."""
        async with AsyncSessionLocal() as db:
            s = await db.get(Short, short_id)
            if not s:
                raise ValueError("Short não encontrado")

            cenas_raw = dados.get("cenas", [])

            corte = await db.get(Corte, s.corte_id)

            # Recalcula a transcrição do Short para converter startLeg -> segundos
            projeto = await db.get(Projeto, corte.projeto_id)
            transcricao_original = json.loads(projeto.transcricao_raw)
            desvios = json.loads(corte.desvios or "[]")
            segmentos = calcular_segmentos(float(corte.inicio_seg), float(corte.fim_seg), desvios)
            segmentos_mantidos = [{"start": s[0], "end": s[1]} for s in segmentos]
            transcricao_corte = TimelineMath.recalcular_transcricao(
                transcricao_original, segmentos_mantidos
            )

            inicio_ms = int(s.inicio_seg * 1000)
            fim_ms = int(s.fim_seg * 1000)
            transcricao_short = [
                w
                for w in transcricao_corte
                if int(w["start"] * 1000) >= inicio_ms and int(w["start"] * 1000) <= fim_ms
            ]

            from app.services.cenas_remotion import CenasRemotionService

            transcricao_granular = CenasRemotionService._get_granular(transcricao_short)
            cenas_convertidas = CenasRemotionService._converter_startleg(
                cenas_raw, transcricao_granular
            )

            resultado = {"formato": "vlog_analitico", "cenas": cenas_convertidas}
            s.cenas_remotion = json.dumps(resultado, ensure_ascii=False)
            await db.commit()
            return resultado

    @staticmethod
    async def montar_prompt_desvios(short_id: str):
        """Gera o prompt para análise de trechos removíveis de um Short."""
        async with AsyncSessionLocal() as db:
            short = await db.get(Short, short_id)
            if not short:
                raise ValueError("Short não encontrado")
            corte = await db.get(Corte, short.corte_id)
            projeto = await db.get(Projeto, corte.projeto_id)

            transcricao_original = json.loads(projeto.transcricao_raw)
            desvios_horizontal = json.loads(corte.desvios or "[]")
            segmentos = calcular_segmentos(
                float(corte.inicio_seg), float(corte.fim_seg), desvios_horizontal
            )
            segmentos_mantidos = [{"start": s[0], "end": s[1]} for s in segmentos]
            transcricao_corte = TimelineMath.recalcular_transcricao(
                transcricao_original, segmentos_mantidos
            )

            # Filtra apenas o trecho do Short
            inicio_ms = int(short.inicio_seg * 1000)
            fim_ms = int(short.fim_seg * 1000)
            transcricao_short = [
                w
                for w in transcricao_corte
                if int(w["start"] * 1000) >= inicio_ms and int(w["start"] * 1000) <= fim_ms
            ]

            from app.services.desvios import DesviosService

            # Note: Shorts geralmente são muito curtos para chunking de desvios (10m),
            # mas vamos manter a consistência.
            prompts = await DesviosService.montar_prompt(
                corte.id, transcricao_override=transcricao_short
            )
            return prompts

    @staticmethod
    async def importar_desvios(short_id: str, dados: dict):
        """Importa o JSON de desvios para um Short."""
        async with AsyncSessionLocal() as db:
            s = await db.get(Short, short_id)
            if not s:
                raise ValueError("Short não encontrado")

            desvios = dados.get("desvios", [])
            s.desvios = json.dumps(desvios, ensure_ascii=False)
            await db.commit()
            return desvios

    @staticmethod
    async def listar_shorts(corte_id: str):
        """Retorna todos os shorts já gerados para um corte."""
        async with AsyncSessionLocal() as db:
            stmt = select(Short).where(Short.corte_id == corte_id).order_by(Short.numero)
            result = await db.execute(stmt)
            shorts = result.scalars().all()

            lista = []
            for s in shorts:
                res_meta = await db.execute(
                    select(MetadadoShort).where(MetadadoShort.short_id == s.id)
                )  # type: ignore
                meta = res_meta.scalar_one_or_none()

                lista.append(
                    {
                        "id": s.id,
                        "titulo": s.titulo_sugerido,
                        "inicio_seg": s.inicio_seg,
                        "fim_seg": s.fim_seg,
                        "frase_capa": meta.frase_capa if meta else "",
                        "titulo_youtube": meta.titulo_youtube if meta else "",
                        "descricao_youtube": meta.descricao_youtube if meta else "",
                        "youtube_video_id": meta.youtube_video_id if meta else "",
                        "youtube_url_publicado": meta.youtube_url_publicado if meta else "",
                        "justificativa": "Recuperado do banco de dados",
                        "status": s.status,
                        "arquivo_short_path": s.arquivo_short_path,
                        "cenas_remotion": json.loads(s.cenas_remotion or "[]"),
                        "desvios": json.loads(s.desvios or "[]"),
                    }
                )
            return lista

    @staticmethod
    async def renderizar_short(short_id: str):
        """
        [Fase 6] Pega o clip_raw horizontal finalizado, extrai as legendas do sub-trecho e renderiza
        usando o template CenaShortViral no Remotion.
        """
        async with AsyncSessionLocal() as db:
            short = await db.get(Short, short_id)
            if not short:
                raise ValueError("Short não encontrado")

            corte = await db.get(Corte, short.corte_id)
            if not corte or not corte.arquivo_clip_path:
                raise ValueError("Corte original não finalizado")

            projeto = await db.get(Projeto, corte.projeto_id)
            transcricao_original = json.loads(projeto.transcricao_raw)
            desvios = json.loads(corte.desvios or "[]")

            res_meta = await db.execute(
                select(MetadadoShort).where(MetadadoShort.short_id == short_id)
            )
            meta_db = res_meta.scalar_one_or_none()
            frase_capa = meta_db.frase_capa if meta_db else ""

        segmentos = calcular_segmentos(float(corte.inicio_seg), float(corte.fim_seg), desvios)
        segmentos_mantidos = [{"start": s[0], "end": s[1]} for s in segmentos]
        transcricao_corte = TimelineMath.recalcular_transcricao(
            transcricao_original, segmentos_mantidos
        )

        inicio_ms = int(short.inicio_seg * 1000)
        fim_ms = int(short.fim_seg * 1000)
        remotion_captions = []
        for word_data in transcricao_corte:
            w_start_ms = int(word_data["start"] * 1000)
            w_end_ms = int(word_data["end"] * 1000)
            if w_start_ms >= inicio_ms and w_start_ms <= fim_ms:
                # leading space for correct line-break handling in Remotion caption renderer
                remotion_captions.append(
                    {
                        "text": " " + word_data["texto"].strip(),
                        "startMs": w_start_ms - inicio_ms,
                        "endMs": w_end_ms - inicio_ms,
                        "timestampMs": None,
                        "confidence": 1.0,
                    }
                )

        short_dir = projetos_dir() / corte.projeto_id / "shorts" / short_id
        short_dir.mkdir(parents=True, exist_ok=True)
        props_data = {
            "videoUrl": str(resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)).replace(
                "\\", "/"
            ),
            "inicio_seg": short.inicio_seg,
            "fim_seg": short.fim_seg,
            "frase_capa": frase_capa,
            "captions": remotion_captions,
            "cenas_remotion": json.loads(short.cenas_remotion or "[]"),
        }

        props_file = short_dir / "short_props.json"
        props_file.write_text(json.dumps(props_data, ensure_ascii=False), encoding="utf-8")

        short_final = short_dir / "short_final.mp4"
        remotion_dir = Path(settings.video_renderer_dir)
        cmd = [
            "npx",
            "remotion",
            "render",
            "src/index.ts",
            "CenaShortViral",
            str(short_final.absolute()),
            "--props",
            str(props_file.absolute()),
            "--log=info",
            "--disable-web-security",
            "--gl=angle",
            "--codec=h264",
        ]

        fila_dir = projetos_dir() / "fila_remotion"
        fila_dir.mkdir(parents=True, exist_ok=True)

        job_id = f"short_{short_id}"
        req_file = fila_dir / f"req_{job_id}.json"
        res_file = fila_dir / f"res_{job_id}.json"

        if req_file.exists():
            req_file.unlink()
        if res_file.exists():
            res_file.unlink()

        job_data = {
            "id": job_id,
            "cwd": str(remotion_dir.absolute()),
            "cmd": cmd,
            "log_level": current_log_level().value,
        }

        operational_info(
            "ShortsService", f"⚛️ Enfileirando renderização nativa do Short {short_id}..."
        )
        with open(req_file, "w", encoding="utf-8") as f:
            json.dump(job_data, f, ensure_ascii=False)

        operational_info("ShortsService", "Aguardando Worker Nativo...")

        while True:
            if res_file.exists():
                break
            await asyncio.sleep(2)

        try:
            with open(res_file, encoding="utf-8") as f:
                resultado_job = json.load(f)
        except Exception as e:
            resultado_job = {"status": "erro", "erro": f"Falha ler res: {e}"}

        try:
            res_file.unlink()
        except Exception:
            pass

        if resultado_job.get("status") != "sucesso":
            err_msg = resultado_job.get("erro", "Erro desconhecido")
            operational_error("ShortsService", f"❌ Erro do Worker Nativo: {err_msg}")
            raise RuntimeError(f"Erro ao renderizar Short. Msg: {err_msg}")

        operational_info("ShortsService", "✅ Short Renderizado Nativamente! Salvando dados...")

        operational_info("ShortsService", "🧠 Gerando Metadados virais com Gemini...")
        client = gemini_client._get_client()
        prompt_meta = f"""
        Você é um social media manager de TikTok e YouTube Shorts.
        Crie um Título curto e uma Descrição chamativa com hashtags para o seguinte vídeo.

        Tema sugerido original: {short.titulo_sugerido}

        Retorne APENAS um JSON no formato:
        {{
            "titulo_youtube": "Título do Short",
            "descricao_youtube": "Descrição chamativa... \\n\\n#Hashtags"
        }}
        """

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt_meta,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": _MetaShort,
                    "temperature": 0.8,
                },
            )
            meta_json = json.loads(response.text)
        except Exception as e_ia:
            operational_error("ShortsService", f"Aviso: Erro ao gerar metadados via IA: {e_ia}")
            meta_json = {
                "titulo_youtube": short.titulo_sugerido,
                "descricao_youtube": "Confira este corte incrível! #shorts #viral",
            }

        async with AsyncSessionLocal() as db:
            s = await db.get(Short, short_id)
            if s:
                # Grava RELATIVO ao projeto (D-172): sobrevive a relocação do canal.
                s.arquivo_short_path = para_relativo_ao_projeto(str(short_final), corte.projeto_id)
                s.status = StatusShort.RENDERIZADO

                res_m = await db.execute(
                    select(MetadadoShort).where(MetadadoShort.short_id == short_id)
                )
                m = res_m.scalar_one_or_none()
                if not m:
                    m = MetadadoShort(short_id=short_id)
                    db.add(m)

                m.titulo_youtube = meta_json.get("titulo_youtube", s.titulo_sugerido)
                m.descricao_youtube = meta_json.get("descricao_youtube", "")
                m.tags_youtube = json.dumps(["shorts", "viral", "cortes"], ensure_ascii=False)
                meta_txt = short_dir / "metadados.txt"
                meta_txt.write_text(
                    f"TÍTULO:\n{m.titulo_youtube}\n\nDESCRIÇÃO:\n{m.descricao_youtube}",
                    encoding="utf-8",
                )
                await db.commit()

        return {
            "status": "ok",
            "mensagem": "Short renderizado com sucesso e metadados gerados!",
            "caminho": str(short_final),
        }

    @staticmethod
    async def atualizar_short(short_id: str, dados: dict):
        """Atualiza tempos ou outros metadados do short sugerido."""
        async with AsyncSessionLocal() as db:
            s = await db.get(Short, short_id)
            if not s:
                return None

            if "inicio_seg" in dados:
                s.inicio_seg = float(dados["inicio_seg"])
            if "fim_seg" in dados:
                s.fim_seg = float(dados["fim_seg"])
            if "cenas_remotion" in dados:
                s.cenas_remotion = json.dumps(dados["cenas_remotion"], ensure_ascii=False)
            if "desvios" in dados:
                s.desvios = json.dumps(dados["desvios"], ensure_ascii=False)

            if any(k in dados for k in ["frase_capa", "titulo_youtube", "descricao_youtube"]):
                res_meta = await db.execute(
                    select(MetadadoShort).where(MetadadoShort.short_id == short_id)
                )
                meta = res_meta.scalar_one_or_none()
                if not meta:
                    meta = MetadadoShort(short_id=short_id)
                    db.add(meta)

                if "frase_capa" in dados:
                    meta.frase_capa = dados["frase_capa"]
                if "titulo_youtube" in dados:
                    meta.titulo_youtube = dados["titulo_youtube"]
                if "descricao_youtube" in dados:
                    meta.descricao_youtube = dados["descricao_youtube"]

            await db.commit()
            return s
