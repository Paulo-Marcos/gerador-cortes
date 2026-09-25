import json

from app.core.logging import operational_error
from app.database import AsyncSessionLocal
from app.domain.compartilhado.manual_prompt import pedir_resposta_json_em_bloco_codigo
from app.domain.compartilhado.time_convert import hms_to_seg
from app.domain.corte.desvio_categoria import OUTRO, motivo_com_aviso, normalizar_categoria
from app.models import Corte

PROMPT_ANALISAR_DESVIOS = """Você é um editor de vídeo especialista. Receberá a transcrição de um trecho de vídeo e deverá identificar as partes que podem ser removidas sem comprometer o entendimento da mensagem. Classifique cada trecho em UMA destas categorias:

1. **TANGENTE** — Trecho que foge do tema central: digressões, avisos técnicos, problemas de transmissão, tangentes administrativas.
2. **REPETICAO** — Trecho onde o locutor repete excessivamente a mesma ideia sem agregar informação nova. O interlocutor é prolixo e costuma reiterar pontos já explicados de forma redundante.
3. **CHAT** — Interação com o chat ao vivo: ler nomes, agradecer doações, pedir like/inscrição.
4. **DISFLUENCIA** — Muletas, gagueira, falsos começos, autocorreções e formulações abandonadas que o locutor refaz de forma limpa em seguida.
5. **ENROLACAO** — Enrolação sem conteúdo: procurar link, pausa técnica, silêncio longo sem função retórica.
6. **IMPRECISAO** — Afirmação factualmente **imprecisa ou possivelmente errada**: número, data, nome, atribuição de autoria ou estatística que soa duvidoso, ou generalização apresentada como fato. Marque mesmo sem ter certeza do erro: a dúvida é o critério.
7. **TOM** — Conteúdo fora do tom: desabafos, tretas, histórias constrangedoras.

Retorne um JSON com a lista de trechos a remover. Para cada trecho, identifique o timestamp exato de início e fim (no formato HH:MM:SS, com os mesmos valores da transcrição) e uma descrição breve do motivo.

Para **IMPRECISAO**, o motivo deve dizer explicitamente o que pode estar errado e começar com "Possível imprecisão" — quem revisa precisa ver na mensagem que aquilo é dúvida factual, não gordura.

A transcrição abaixo usa tempos **absolutos do vídeo original**. Os timestamps de início e fim que você retornar devem ser desses mesmos tempos absolutos.

=== TRANSCRIÇÃO ===
{transcricao}
=== FIM DA TRANSCRIÇÃO ===

Retorne APENAS o JSON, sem explicações. Formato esperado:
{{
  "trechos": [
    {{
      "inicio_hms": "HH:MM:SS",
      "fim_hms": "HH:MM:SS",
      "tipo": "TANGENTE" | "REPETICAO" | "CHAT" | "DISFLUENCIA" | "ENROLACAO" | "IMPRECISAO" | "TOM",
      "motivo": "Descrição breve do motivo"
    }}
  ]
}}

Regras importantes:
- Seja conservador: só remova o que claramente não agrega.
- Para REPETICAO: só marque se a ideia já foi explicada anteriormente e a repetição não traz ângulo novo.
- Para IMPRECISAO: marque o menor trecho que contém a afirmação duvidosa; se ela sustenta o argumento inteiro (removê-la quebra o que vem depois), NÃO marque.
- Não remova transições naturais de raciocínio, apenas redundâncias reais.
- Os timestamps devem estar dentro do intervalo da transcrição fornecida.
- Se não houver nada a remover, retorne {{"trechos": []}}.
"""


def desvio_de_trecho(trecho: dict, origem: str) -> dict | None:
    """Converte um trecho devolvido pela IA (ou colado no modal) em desvio.

    Devolve `None` quando o trecho não tem as duas bordas — sem elas não há o que
    remover. Puro: nenhum acesso a banco, testável direto.
    """
    inicio_hms = trecho.get("inicio_hms", "")
    fim_hms = trecho.get("fim_hms", "")
    if not inicio_hms or not fim_hms:
        return None

    categoria = normalizar_categoria(
        trecho.get("categoria") or trecho.get("tipo"), trecho.get("motivo", "")
    )
    motivo = str(trecho.get("motivo", "")).strip()
    # D-422: o badge do painel passa a carregar o motivo da remoção, então o prefixo
    # "[TIPO]" no texto virou redundante — só permanece quando não reconhecemos a
    # categoria, para não perder a única pista que o trecho trazia.
    if categoria == OUTRO:
        motivo = f"[{trecho.get('tipo', 'DESVIO')}] {motivo}".strip()

    return {
        "inicio_hms": inicio_hms,
        "fim_hms": fim_hms,
        "inicio_seg": hms_to_seg(inicio_hms),
        "fim_seg": hms_to_seg(fim_hms),
        "motivo": motivo_com_aviso(motivo, categoria),
        "categoria": categoria,
        "origem": origem,
    }


class DesviosService:
    @staticmethod
    async def montar_prompt(corte_id: str, transcricao_override: list = None) -> dict:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            if transcricao_override is not None:
                transcricao = transcricao_override
            else:
                transcricao = json.loads(corte.transcricao_corte or "[]")

            if not transcricao:
                raise ValueError(
                    "Transcrição não disponível. "
                    "Sincronize a transcrição antes de usar este recurso."
                )

            from app.domain.projeto.transcricao_utils import (
                dividir_segmentos_longos,
                limpar_e_ordenar_transcricao,
            )

            transcricao_limpa = limpar_e_ordenar_transcricao(transcricao)
            transcricao_granular = dividir_segmentos_longos(
                transcricao_limpa, max_duracao=4.0, max_palavras=6
            )
            for idx, seg in enumerate(transcricao_granular):
                seg["global_index"] = idx

            from app.domain.projeto.chunker import fatiar_transcricao

            chunks = fatiar_transcricao(
                transcricao_granular,
                chunk_tamanho_seg=2400.0,
                overlap_seg=300.0,
                min_last_chunk_seg=1200.0,
            )

            from app.domain.compartilhado.time_convert import seg_to_hms_short

            prompts = []
            for i, chunk in enumerate(chunks):
                linhas = []
                for item in chunk:
                    inicio = item.get("start", item.get("inicio", 0))
                    inicio_hms = seg_to_hms_short(float(inicio))
                    texto = item.get("texto", "").strip()
                    if texto:
                        idx_global = item.get("global_index", 0)
                        linhas.append(f"[{idx_global}] ({inicio_hms}) {texto}")

                transcricao_txt = "\n".join(linhas)

                cabecalho_parte = f"*** ATENÇÃO: Esta é a PARTE {i + 1} de {len(chunks)} do trecho de vídeo. Identifique os desvios e repetições APENAS para esta parte. ***\n\n"
                prompt_chunk = cabecalho_parte + PROMPT_ANALISAR_DESVIOS.format(
                    transcricao=transcricao_txt
                )

                prompts.append(
                    {
                        "parte": i + 1,
                        "total_partes": len(chunks),
                        "texto": pedir_resposta_json_em_bloco_codigo(prompt_chunk),
                    }
                )

            formato_esperado = {
                "trechos": [
                    {
                        "inicio_hms": "HH:MM:SS",
                        "fim_hms": "HH:MM:SS",
                        "tipo": (
                            "TANGENTE | REPETICAO | CHAT | DISFLUENCIA | "
                            "ENROLACAO | IMPRECISAO | TOM"
                        ),
                        "motivo": "Descrição breve",
                    }
                ]
            }

            return {"prompts": prompts, "formato_esperado": formato_esperado}

    @staticmethod
    async def importar_resultado(corte_id: str, trechos: list, *, origem: str = "manual") -> Corte:
        """Importa trechos a remover no corte.

        `origem` distingue a procedência editorial: "manual" (cola JSON de IA
        externa via modal), "gemini" (analisar_ia Gemini), etc. — usada pelo
        frontend para exibir o badge correto no painel de trechos.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            desvios_existentes = json.loads(corte.desvios or "[]")

            novos = [d for d in (desvio_de_trecho(t, origem) for t in trechos) if d]

            todos = desvios_existentes + novos
            todos.sort(key=lambda d: d.get("inicio_seg", 0))
            corte.desvios = json.dumps(todos, ensure_ascii=False)

            await db.commit()
            await db.refresh(corte)

            from app.services.corte import CorteService

            await CorteService.sincronizar_transcricao_corte(corte_id)

            async with AsyncSessionLocal() as db2:
                return await db2.get(Corte, corte_id)

    @staticmethod
    async def analisar_ia(corte_id: str) -> Corte:
        """Analisa desvios e repetições via Gemini IA."""
        from app.infrastructure import gemini_client

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            transcricao = json.loads(corte.transcricao_corte or "[]")
            if not transcricao:
                raise ValueError("Transcrição vazia. Sincronize antes.")

            from app.domain.projeto.transcricao_utils import (
                dividir_segmentos_longos,
                limpar_e_ordenar_transcricao,
            )

            transcricao_limpa = limpar_e_ordenar_transcricao(transcricao)
            transcricao_granular = dividir_segmentos_longos(
                transcricao_limpa, max_duracao=4.0, max_palavras=6
            )

            from app.domain.projeto.chunker import fatiar_transcricao

            chunks = fatiar_transcricao(
                transcricao_granular,
                chunk_tamanho_seg=2400.0,
                overlap_seg=300.0,
                min_last_chunk_seg=1200.0,
            )

            from app.domain.compartilhado.time_convert import seg_to_hms_short

            todos_trechos = []
            erros = []

            for i, chunk in enumerate(chunks):
                linhas = []
                for j, item in enumerate(chunk):
                    inicio = item.get("start", item.get("inicio", 0))
                    inicio_hms = seg_to_hms_short(float(inicio))
                    texto = item.get("texto", "").strip()
                    if texto:
                        linhas.append(f"[{j}] ({inicio_hms}) {texto}")

                transcricao_txt = "\n".join(linhas)
                cabecalho_parte = f"*** PARTE {i + 1} de {len(chunks)} ***\n\n"
                prompt = cabecalho_parte + PROMPT_ANALISAR_DESVIOS.format(
                    transcricao=transcricao_txt
                )

                try:
                    resultado = await gemini_client.generate_json(
                        "gemini-2.5-flash",
                        prompt,
                        temperature=0.7,
                        contexto=gemini_client.GeminiCallContext(
                            etapa="desvios", corte_id=corte_id
                        ),
                    )
                    trechos = resultado.get("trechos", [])
                    todos_trechos.extend(trechos)
                except Exception as e:  # noqa: BLE001 — lote: uma parte que falha não para as outras
                    operational_error("Desvios", f"Erro ao analisar parte {i + 1} com Gemini: {e}")
                    erros.append(str(e))

            # D-376: se TODAS as partes falharam, "0 trechos" não é um resultado
            # legítimo (nenhuma IA rodou) — subir o erro real em vez de devolver
            # sucesso silencioso com desvios=[] (mascarava, por exemplo, uma
            # GEMINI_API_KEY inválida).
            if erros and len(erros) == len(chunks):
                raise RuntimeError(f"Gemini falhou em todas as partes: {erros[0]}")

            return await DesviosService.importar_resultado(corte_id, todos_trechos, origem="gemini")
