"""
Serviço de Metadados — geração via Claude, monta descrição com créditos obrigatórios
"""

import json
import uuid
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from app.channel_config_loader import (
    CREDITOS_TEMPLATE,
    PROMPT_GERAR_METADADOS,
    PROMPT_GERAR_THUMBNAIL,
    PROMPT_GERAR_THUMBNAIL_AGENTE,
    PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE,
)
from app.config import settings
from app.database import AsyncSessionLocal
from app.editorial_identity import identidade_do_mascote
from app.domain.manual_prompt import pedir_resposta_json_em_bloco_codigo
from app.domain.reading_metadata import (
    aplicar_emojis_texto_capa,
    aplicar_prefixo_leitura_titulo,
)
from app.models import Corte, MetadadoCorte, Projeto
from app.services.app_logging import operational_error
from sqlalchemy import select

# Gradê de cores da série (ciclo)
CORES_SERIE = [
    "Vermelho profundo / Carmesim",
    "Magenta / Roxo-avermelhado escuro",
    "Roxo / Violeta profundo",
    "Índigo / Azul-violeta frio",
    "Azul ciano / Azul profundo",
]


def formatar_bloco_hints_thumbnail(hints: str | None) -> str:
    """F-058: bloco opcional com as sugestões manuais do editor para a capa.

    Quando o editor preenche `corte.hints_thumbnail`, o texto entra no prompt
    da thumbnail como direção PRIORITÁRIA — o capista/skill deve incorporá-lo à
    própria inteligência, sem contrariar a identidade do mascote nem inventar
    fatos. Vazio retorna "" (prompt idêntico ao comportamento anterior).

    E-010: o nome do mascote vem do instance/editorial (D-220), não mais embutido
    no código; com nome="Sapo" o bloco fica idêntico ao anterior.
    """
    texto = (hints or "").strip()
    if not texto:
        return ""
    mascote = identidade_do_mascote().nome
    return (
        "\n=== SUGESTÕES DO EDITOR PARA A CAPA (PRIORIDADE — incorpore à sua "
        f"direção de arte, mantendo a identidade do {mascote} e sem inventar fatos) "
        "===\n"
        f"{texto}\n"
    )


class MetadadosService:
    @staticmethod
    async def toggle_fire(corte_id: str) -> dict:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            corte = await db.get(Corte, corte_id)

            if not meta:
                if not corte:
                    raise ValueError("Corte não encontrado")
                meta = MetadadoCorte(
                    id=str(uuid.uuid4()),
                    corte_id=corte_id,
                    titulo_youtube=corte.titulo_proposto,
                    descricao_youtube="",
                    is_fire=False,
                )
                db.add(meta)

            meta.is_fire = not meta.is_fire

            emoji = "🔥 "
            titulo = meta.titulo_youtube or ""

            if meta.is_fire:
                if not titulo.startswith(emoji):
                    meta.titulo_youtube = emoji + titulo
            else:
                if titulo.startswith(emoji):
                    meta.titulo_youtube = titulo[len(emoji) :]

            if corte:
                meta.texto_capa = aplicar_emojis_texto_capa(
                    meta.texto_capa,
                    bool(meta.is_fire),
                    bool(corte.is_leitura),
                )

            await db.commit()
            return {"is_fire": bool(meta.is_fire), "titulo_youtube": meta.titulo_youtube}

    @staticmethod
    async def _obter_transcricao_final(corte_id: str) -> str:
        """Retorna a transcrição final limpa (sem desvios/silêncios) gerada pelo sincronizador."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return ""
            return corte.transcricao_final_texto or ""

    @staticmethod
    async def _obter_historico_thumbnails(
        projeto_id: str, corte_id_atual: str, limite: int | None = None
    ) -> list[dict]:
        """Últimas N thumbnails geradas em QUALQUER projeto (memória global).

        WHY: rotular a memória por projeto deixava cada vídeo começar do zero —
        e o modelo voltava aos mesmos defaults. A memória global das últimas N
        capas (independente do projeto) força variação real entre vídeos do
        canal, que é o que o espectador vê na grade do YouTube.

        `limite` vem de `settings.thumbnail_anti_repeticao_janela` (fonte única;
        era um 4 hard-coded espalhado por 4 call-sites, curto demais — a mesma
        roupa voltava ao sair da janela). Passe `limite` só para sobrescrever.

        Cada item retorna o prompt completo: o parser de tags
        (`parse_variation_tags`) extrai os eixos usados; o formatador injeta
        como ELEMENTOS PROIBIDOS no meta-prompt do Claude.
        """
        n = limite if limite is not None else settings.thumbnail_anti_repeticao_janela
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte)
                .where(MetadadoCorte.corte_id != corte_id_atual)
                .where(MetadadoCorte.prompt_thumbnail.isnot(None))
                .where(MetadadoCorte.prompt_thumbnail != "")
                .order_by(MetadadoCorte.id.desc())
                .limit(n)
            )
            rows = result.scalars().all()

        return [
            {
                "texto_capa": meta.texto_capa or "",
                "prompt": meta.prompt_thumbnail or "",
            }
            for meta in rows
        ]

    @staticmethod
    def _formatar_historico_visual(historico: list[dict]) -> str:
        """Formata o histórico das últimas N capas como ELEMENTOS PROIBIDOS.

        Lê a linha `[VARIATION_TAGS]` do início de cada prompt salvo, consolida
        os eixos usados (cenário, pose, paleta, tipografia, roupa) e devolve um
        bloco pronto pra concatenar no meta-prompt. Prompts sem tags (legacy)
        contribuem com 0 valores — não quebram o fluxo.
        """
        from app.domain.variacao_prompt import (
            coletar_eixos_proibidos,
            contar_eixos_modais,
            formatar_eixos_proibidos,
            formatar_pressao_positiva,
            parse_variation_tags,
        )

        if not historico:
            return "(nenhuma capa anterior registrada — esta é a primeira da série)"

        historico_tags = [parse_variation_tags(h["prompt"]) for h in historico]
        consolidado = coletar_eixos_proibidos(historico_tags)
        bloco = formatar_eixos_proibidos(consolidado)

        # Pressão POSITIVA: além de proibir o valor exato, manda inverter o eixo
        # que SATUROU (apareceu 2+ vezes). Ataca direto a recorrência de roupa e
        # de registro tonal (dark) que a memória só-negativa não resolvia.
        pressao = formatar_pressao_positiva(contar_eixos_modais(historico_tags))
        if pressao:
            bloco += (
                "\n\n  >>> EIXOS SATURADOS — leve ao polo OPOSTO nesta capa "
                "(não basta evitar repetir):\n" + pressao
            )
        return bloco

    @staticmethod
    async def _obter_historico_titulos(corte_id_atual: str, limite: int = 5) -> list[str]:
        """Últimos N títulos YouTube já publicados na memória global do canal.

        Espelha _obter_historico_thumbnails: memória global (não por projeto),
        para que cada novo título evite repetir estrutura/tom dos anteriores na
        mesma série do canal.
        """
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte)
                .where(MetadadoCorte.corte_id != corte_id_atual)
                .where(MetadadoCorte.titulo_youtube.isnot(None))
                .where(MetadadoCorte.titulo_youtube != "")
                .order_by(MetadadoCorte.id.desc())
                .limit(limite)
            )
            rows = result.scalars().all()
        return [meta.titulo_youtube for meta in rows if meta.titulo_youtube]

    @staticmethod
    def _formatar_historico_titulos(titulos: list[str]) -> str:
        if not titulos:
            return "(nenhum título anterior registrado — esta é a primeira da série)"
        return "\n".join(f"- {t}" for t in titulos)

    @staticmethod
    async def montar_contexto_meta(corte_id: str) -> dict:
        """Retorna apenas os DADOS do corte para gerar metadados (sem template).

        Espelha `montar_contexto_thumbnail`: a expertise (regras, famílias de
        título, lista negra, checklist) vive inteira na skill
        `metadados-expert`. O service só fornece o input.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

        transcricao = await MetadadosService._obter_transcricao_final(corte_id)
        historico_titulos = await MetadadosService._obter_historico_titulos(corte_id)

        return {
            "titulo_proposto": corte.titulo_proposto or "",
            "tema": corte.tema_central or "",
            "resumo": corte.resumo or "",
            "numero_corte": corte.numero,
            "transcricao": transcricao
            or "(transcrição indisponível — sincronize o corte primeiro)",
            "historico_titulos": MetadadosService._formatar_historico_titulos(historico_titulos),
        }

    @staticmethod
    async def gerar_metadados(corte_id: str):
        """Gera metadados YouTube via Claude (skill metadados-expert) e salva.

        Delega ao caminho Claude (`ClaudeIaService.gerar_metadados_via_claude`),
        que monta o contexto do corte e persiste via `importar_resultado_meta`
        (créditos, cores da série, prefixo de leitura, emojis). Mantém a
        semântica de background task: em falha apenas loga, sem derrubar a task.
        """
        # Import local: claude_ia importa este módulo no topo (evita ciclo).
        from app.services.claude_ia import ClaudeIaService

        try:
            await ClaudeIaService.gerar_metadados_via_claude(corte_id)
        except Exception as e:  # noqa: BLE001 — background task: loga e segue
            operational_error("Metadados", f"Erro ao gerar metadados para corte {corte_id}: {e}")

    @staticmethod
    async def gerar_prompt_thumbnail(corte_id: str):
        """Gera o prompt visual da thumbnail via Claude (skill thumbnail-prompt-expert).

        Delega ao caminho Claude (`ClaudeIaService.gerar_prompt_thumbnail_via_claude`),
        que reusa o builder/importador existentes. Mantém a semântica de
        background task: em falha apenas loga.
        """
        # Import local: claude_ia importa este módulo no topo (evita ciclo).
        from app.services.claude_ia import ClaudeIaService

        try:
            await ClaudeIaService.gerar_prompt_thumbnail_via_claude(corte_id)
        except Exception as e:  # noqa: BLE001 — background task: loga e segue
            operational_error("Metadados", f"Erro ao gerar prompt da thumbnail para {corte_id}: {e}")

    @staticmethod
    async def montar_prompt_meta(corte_id: str) -> dict:
        """Retorna o prompt de geração de metadados sem chamar o n8n.

        Usa a transcrição final (pós-remoção de desvios) como fonte primária
        para que a IA tenha acesso a tudo que foi falado no corte.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

        transcricao = await MetadadosService._obter_transcricao_final(corte_id)
        historico_titulos = await MetadadosService._obter_historico_titulos(corte_id)

        prompt = PROMPT_GERAR_METADADOS.format(
            titulo=corte.titulo_proposto,
            resumo=corte.resumo or "(não disponível)",
            tema=corte.tema_central or "(não disponível)",
            numero=corte.numero,
            transcricao=transcricao or "(transcrição não disponível — sincronize o corte primeiro)",
            historico_titulos=MetadadosService._formatar_historico_titulos(historico_titulos),
        )
        return {
            "prompt": pedir_resposta_json_em_bloco_codigo(prompt),
            "formato_esperado": {
                "opcoes_titulo": ["", "", "", ""],
                "opcoes_texto_capa": ["", "", "", ""],
                "sinopse": "",
                "hashtags": [],
            },
        }

    @staticmethod
    async def importar_resultado_meta(corte_id: str, resultado: dict):
        """Salva metadados vindos de IA externa com a mesma lógica do gerar_metadados."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                raise ValueError("Projeto não encontrado")

        link_live = MetadadosService._gerar_link_timestampado(projeto.youtube_url, corte.inicio_seg)
        sinopse = resultado.get("sinopse", "")
        hashtags = resultado.get("hashtags", [])
        creditos = CREDITOS_TEMPLATE.format(link_live=link_live)
        hashtags_str = " ".join(f"#{tag}" for tag in hashtags)
        descricao_completa = f"{sinopse}\n\n{creditos}\n\n{hashtags_str}"

        num_serie = corte.numero
        cor_serie = CORES_SERIE[(num_serie - 1) % len(CORES_SERIE)]

        async with AsyncSessionLocal() as db:
            existing = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = existing.scalar_one_or_none()
            if not meta:
                meta = MetadadoCorte(id=str(uuid.uuid4()), corte_id=corte_id)
                db.add(meta)

            opcoes_titulo = resultado.get("opcoes_titulo") or []
            opcoes_texto_capa = resultado.get("opcoes_texto_capa") or []

            meta.titulo_youtube = (
                resultado.get("titulo")
                or (opcoes_titulo[0] if opcoes_titulo else None)
                or corte.titulo_proposto
            )
            if corte.is_leitura:
                meta.titulo_youtube = aplicar_prefixo_leitura_titulo(
                    meta.titulo_youtube,
                    corte.autor_leitura,
                    getattr(corte, "parte_leitura", 1),
                )

            meta.descricao_youtube = descricao_completa
            meta.tags_youtube = json.dumps(hashtags, ensure_ascii=False)
            meta.opcoes_titulo = json.dumps(opcoes_titulo, ensure_ascii=False)
            meta.opcoes_texto_capa = json.dumps(opcoes_texto_capa, ensure_ascii=False)

            if opcoes_texto_capa:
                tc = opcoes_texto_capa[0]
                meta.texto_capa = aplicar_emojis_texto_capa(
                    tc, bool(meta.is_fire), bool(corte.is_leitura)
                )

            meta.link_live_com_timestamp = link_live
            meta.canal_credito = projeto.canal_origem
            meta.numero_serie = num_serie
            meta.cor_serie = cor_serie
            await db.commit()

    @staticmethod
    async def montar_prompt_thumbnail_externo(corte_id: str) -> dict:
        """Retorna o prompt de geração de thumbnail sem chamar o n8n."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        transcricao_final = await MetadadosService._obter_transcricao_final(corte_id)
        texto_capa = aplicar_emojis_texto_capa(
            meta.texto_capa if meta else "",
            bool(meta.is_fire) if meta else False,
            bool(corte.is_leitura),
        )

        historico = await MetadadosService._obter_historico_thumbnails(corte.projeto_id, corte_id)
        historico_visual = MetadadosService._formatar_historico_visual(historico)

        prompt = PROMPT_GERAR_THUMBNAIL.format(
            titulo=corte.titulo_proposto or "",
            tema=corte.tema_central or "",
            resumo=corte.resumo or "",
            transcricao=transcricao_final or "(transcrição indisponível)",
            texto_capa=texto_capa,
            historico_visual=historico_visual,
        )
        prompt += formatar_bloco_hints_thumbnail(corte.hints_thumbnail)
        return {
            "prompt": pedir_resposta_json_em_bloco_codigo(prompt),
            "formato_esperado": {
                "diferenca_planejada": [],
                "beat": "",
                "momento_visual": "",
                "vibe": "",
                "intensidade": 0,
                "expressao": {"boca": "", "olhos": "", "sobrancelhas": "", "corpo": ""},
                "shot_type": "",
                "paleta": "",
                "cenario_factual": "",
                "personagens_identificados": [],
                "atuacao_do_mascote": "",
                "prompt_thumbnail": "...",
            },
        }

    @staticmethod
    async def montar_prompt_thumbnail_agente(corte_id: str) -> dict:
        """Retorna um prompt para o GPT capista gerar imagens diretamente."""
        return await MetadadosService._montar_prompt_agente(corte_id, PROMPT_GERAR_THUMBNAIL_AGENTE)

    @staticmethod
    async def montar_prompt_thumbnail_agente_livre(corte_id: str) -> dict:
        """Variante permissiva: libera composicao e texto, mantendo a identidade do mascote."""
        return await MetadadosService._montar_prompt_agente(
            corte_id, PROMPT_GERAR_THUMBNAIL_AGENTE_LIVRE
        )

    @staticmethod
    async def _montar_prompt_agente(corte_id: str, template: str) -> dict:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte nao encontrado")
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        transcricao_final = await MetadadosService._obter_transcricao_final(corte_id)
        texto_capa = aplicar_emojis_texto_capa(
            meta.texto_capa if meta else "",
            bool(meta.is_fire) if meta else False,
            bool(corte.is_leitura),
        )
        historico = await MetadadosService._obter_historico_thumbnails(corte.projeto_id, corte_id)
        titulo_youtube = (
            meta.titulo_youtube if meta and meta.titulo_youtube else corte.titulo_proposto or ""
        )

        prompt = template.format(
            titulo_youtube=titulo_youtube,
            tema=corte.tema_central or "",
            resumo=corte.resumo or "",
            transcricao=transcricao_final or "(transcricao indisponivel)",
            texto_capa=texto_capa or "(defina o texto de capa antes de gerar)",
            historico_visual=MetadadosService._formatar_historico_visual(historico),
        )
        prompt += formatar_bloco_hints_thumbnail(corte.hints_thumbnail)
        return {
            "prompt": prompt,
            "formato_esperado": {
                "acao": "gerar_3_imagens_16_9",
                "destino": "GPT customizado Capista Editorial do canal",
            },
        }

    @staticmethod
    async def montar_contexto_thumbnail(corte_id: str) -> dict:
        """Retorna apenas os DADOS do corte para gerar a thumbnail (sem template).

        Usado pelo provider Claude, cuja expertise (instruções + conhecimento +
        modo livre do capista) vive inteira na skill `thumbnail-prompt-expert`.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        transcricao_final = await MetadadosService._obter_transcricao_final(corte_id)
        texto_capa = aplicar_emojis_texto_capa(
            meta.texto_capa if meta else "",
            bool(meta.is_fire) if meta else False,
            bool(corte.is_leitura),
        )
        historico = await MetadadosService._obter_historico_thumbnails(corte.projeto_id, corte_id)
        titulo_youtube = (
            meta.titulo_youtube if meta and meta.titulo_youtube else corte.titulo_proposto or ""
        )
        return {
            "tema": corte.tema_central or "",
            "titulo_youtube": titulo_youtube,
            "texto_capa": texto_capa or "",
            "resumo": corte.resumo or "",
            "transcricao": transcricao_final or "(transcricao indisponivel)",
            "historico_visual": MetadadosService._formatar_historico_visual(historico),
            # F-058: sugestões manuais do editor (vazio = sem influência).
            "hints": corte.hints_thumbnail or "",
            # Flags editoriais para o capista. Quando ativas, os emojis 🔥/📖
            # JÁ aparecem prefixados em `texto_capa`, mas precisam ser
            # explicitamente entregues na arte (o Claude vinha descartando-os
            # ao condensar o apoio para ≤3 palavras).
            "is_fire": bool(meta.is_fire) if meta else False,
            "is_leitura": bool(corte.is_leitura),
        }

    @staticmethod
    async def importar_prompt_thumbnail(corte_id: str, prompt_thumbnail: str):
        """Salva prompt de thumbnail vindo de IA externa."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if not meta:
                raise ValueError("Metadados não encontrados — gere os metadados primeiro")
            meta.prompt_thumbnail = prompt_thumbnail.strip()
            await db.commit()

    @staticmethod
    def _gerar_link_timestampado(youtube_url: str, inicio_seg: float) -> str:
        """Gera link YouTube com ?t=Xs (timestamp de início do corte)."""
        parsed = urlparse(youtube_url)
        params = parse_qs(parsed.query)
        params["t"] = [str(int(inicio_seg))]
        novo_query = urlencode({k: v[0] for k, v in params.items()})
        return urlunparse(parsed._replace(query=novo_query))
