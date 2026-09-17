"""Não-regressão dos scaffolds externalizados (D-297).

Garante que os prompts-scaffold MIGRADOS para o banco (defaults versionados em
`examples/instance.example/editorial/scaffolds`) reproduzem EXATAMENTE o que os
builders hardcoded produziam antes — a saída do canal ativo não muda ao migrar.

Cada teste usa um ORÁCULO: uma cópia fiel do builder ANTIGO (pré-D-297). O builder
novo resolve o scaffold default (via monkeypatch, sem tocar o banco) e formata; o
resultado deve bater com o oráculo. A comparação normaliza só a quebra de linha
FINAL (`rstrip("\\n")`): armazenar o default "stripado" é a única diferença
intencional e é inerte para o modelo (o cliente Claude ignora whitespace de borda).
"""

from __future__ import annotations

import pytest
from app import editorial_scaffolds
from app.services.claude_ia import ClaudeIaService


@pytest.fixture(autouse=True)
def _scaffold_do_default(monkeypatch):
    """Faz `resolver_scaffold` devolver o default versionado (sem DB nem canal)."""

    def _fake(key, **_kw):
        return editorial_scaffolds._default_scaffold(editorial_scaffolds._exigir_catalogo(key))

    monkeypatch.setattr(editorial_scaffolds, "resolver_scaffold", _fake)


def _igual(novo: str, oraculo: str) -> None:
    assert novo.rstrip("\n") == oraculo.rstrip("\n")


# ─── Oráculos: cópias fiéis dos builders ANTIGOS (pré-D-297) ────────────────


def _oraculo_cortes(texto_transcricao, meta, cabecalho="", variacao=""):
    duracao = int(meta.get("duracao_segundos") or 0)
    cabecalho_section = f"*** {cabecalho} ***\n\n" if cabecalho else ""
    return (
        f"{variacao}\n\n"
        f"{cabecalho_section}"
        "=== DADOS DA LIVE ===\n"
        f"Título: {meta.get('titulo_live', '')}\n"
        f"Duração: {duracao // 3600}h{(duracao % 3600) // 60}m\n"
        f"URL: {meta.get('youtube_url', '')}\n\n"
        "=== TRANSCRIÇÃO (índice global, timestamp, fala) ===\n"
        f"{texto_transcricao}\n"
        "=== FIM DA TRANSCRIÇÃO ===\n\n"
        "Gere agora a lista de cortes em JSON puro, seguindo exatamente o "
        "formato e as regras da sua expertise acima."
    )


def _oraculo_trechos(texto_transcricao, cabecalho_meta, parte, total_partes):
    # D-330: o scaffold de trechos ficou MAGRO (só o envelope + delegação à
    # expertise trechos-expert v2). As regras conservadoras e os 2 tipos fixos
    # (DESVIO/REPETICAO) saíram do scaffold — a fonte única agora é o corpo.
    # D-332: o scaffold só pede os `desvios` NOVOS (a `revisoes`/[REVISÁVEL] saiu
    # — a revisão automática foi revogada).
    cabecalho_parte = (
        f"*** ATENÇÃO: Esta é a PARTE {parte} de {total_partes} do corte. "
        f"Identifique os trechos a remover APENAS para esta parte. ***\n\n"
        if total_partes > 1
        else ""
    )
    return (
        f"{cabecalho_parte}"
        f"{cabecalho_meta}"
        "=== TRANSCRIÇÃO DO CORTE (timestamp absoluto — fala) ===\n"
        f"{texto_transcricao}\n"
        "=== FIM DA TRANSCRIÇÃO ===\n\n"
        "Marque agora os NOVOS trechos a remover (a chave `desvios`) em JSON puro, "
        "seguindo exatamente o formato e as regras da sua expertise acima. Use "
        "timestamps ABSOLUTOS do vídeo original, dentro do intervalo do corte."
    )


def _oraculo_thumbnail(ctx, marca_emojis, bloco_hints, mascote):
    return (
        "=== INPUT DO CORTE ===\n"
        f"tema_central: {ctx['tema']}\n"
        f"titulo_youtube: {ctx['titulo_youtube']}\n"
        f"texto_capa_sugerido: {ctx['texto_capa']}\n"
        f"resumo: {ctx['resumo']}\n"
        f"{marca_emojis}\n"
        f"{bloco_hints}\n"
        "=== TRANSCRIÇÃO FINAL DO CORTE ===\n"
        f"{ctx['transcricao']}\n\n"
        "=== ELEMENTOS PROIBIDOS — últimas capas do canal (NÃO REPITA nem use similar) ===\n"
        f"{ctx['historico_visual']}\n\n"
        "=== DIREÇÃO NÃO-NEGOCIÁVEL DESTA CAPA ===\n"
        "O método completo vive na skill thumbnail-prompt-expert; isto é só o "
        "resumo do que NÃO pode falhar:\n"
        "1) CENÁRIO derivado do contexto REAL do corte (lugar/instituição/"
        "época/cultura citados ou implicados). Nunca cenário neutro/seguro "
        "(lousa, biblioteca genérica, mesa+livro+luminária, fundo escuro "
        "vazio).\n"
        "2) ELENCO: pessoas reconhecíveis relevantes aparecem sempre que "
        f"possível; {mascote} sozinho é fallback, não default. Múltiplas figuras "
        "permitidas com hierarquia clara; descreva cada pessoa real com "
        "fidelidade (idade, cabelo/calvície, barba, óculos, traços, roupa "
        "pública).\n"
        "3) ROUPA: registro relaxado/casual derivado do contexto — o "
        "contraste tema-sério × roupa-informal é da marca. NÃO repita o "
        "registro de roupa das últimas capas; default bege/clara/branca/"
        "linho PROIBIDO. Descreva a roupa exata SÓ no prompt final; nunca "
        "'adult relaxed clothing'.\n"
        "4) LUZ: escolha uma chave de luz/registro tonal e VARIE-A em "
        "relação às últimas capas — não escureça por reflexo, sem penumbra "
        "cinematográfica por default.\n"
        "5) TEXTO: MANCHETE = o titulo_youtube POR INTEIRO — preserve TODO "
        "o conteúdo essencial (sujeito, nomes citados, conceito-chave, ideia "
        "completa). PROIBIDO cortar para 2-6 palavras ou virar fragmento; "
        "compressão só de conectores ('de/que/na/para'), nunca de termos "
        "centrais. Título longo → manchete em 2-3 linhas, legibilidade pela "
        "composição, nunca apagando palavras. Apoio (texto_capa literal até "
        "5 palavras) é camada SEPARADA — acompanha a manchete, não carrega o "
        "resto do título. Tudo como UM sistema gráfico overlay; peso "
        "BLACK/HEAVY, contorno+sombra, alto contraste. Emoji 🔥/📖 só junto "
        "ao apoio, nunca objeto da cena. Sem retângulo sólido nos 15% "
        "inferiores. Anti-slide (sem lista de tópicos, cards ou tags).\n"
        "6) Antes de escrever, gere 3 hipóteses internas e descarte as que "
        "repetem 3+ eixos das últimas capas; nos EIXOS SATURADOS sinalizados "
        "acima, vá ao POLO OPOSTO.\n\n"
        "=== SAÍDA (siga TODAS as regras da skill thumbnail-prompt-expert) ===\n"
        '1ª linha, exatamente: [VARIATION_TAGS] cenario="..." | '
        'personagens="..." | relacao_mascote_personagens="..." | '
        'escala_mascote="..." | camera="..." | pose="..." | paleta="..." '
        '| luminosidade="..." | tipografia="..." | roupa="..." | '
        'layout_texto="..." | apoio_layout="..."  — frases curtas e '
        "CONCRETAS descrevendo a solução escolhida, sem listar opções.\n"
        "Depois, UMA linha em branco e o prompt final em inglês (formato "
        "PROMPT-MODELO da skill), apenas com a solução escolhida. Sem JSON, "
        "sem markdown, sem comentários, sem 'ou'/alternativas/listas de "
        "proibições."
    )


def _oraculo_metadados(
    variacao,
    titulo_proposto,
    tema_central,
    numero_corte,
    resumo_historico,
    transcricao_marcada,
    historico_titulos,
):
    # Cópia fiel do invólucro "INPUT DO CORTE" hardcoded em
    # gerar_metadados_via_claude ANTES do D-349.
    return (
        f"{variacao}\n\n"
        "=== INPUT DO CORTE ===\n"
        f"titulo_proposto: {titulo_proposto}\n"
        f"tema_central: {tema_central}\n"
        f"numero_corte: {numero_corte}\n"
        f"resumo_historico (pode estar desatualizado — em caso de conflito, "
        f"a transcrição prevalece): {resumo_historico}\n\n"
        "=== TRANSCRIÇÃO FINAL DO CORTE (fonte primária de verdade; "
        "marcadores [MM:SS] são relativos ao início do corte — use-os para "
        "posicionar os `chapters`) ===\n"
        f"{transcricao_marcada}\n\n"
        "=== TÍTULOS RECENTES DA SÉRIE (evite repetir estrutura/tom) ===\n"
        f"{historico_titulos}\n\n"
        "Gere os metadados seguindo TODAS as regras da skill metadados-expert "
        "(STEP 0 → checklist final) e devolva APENAS o JSON no formato "
        "exigido pela seção OUTPUT da skill."
    )


def _oraculo_resumo(variacao, titulo, tema, resumo_antigo, transcricao):
    # D-632: a frase de abertura perdeu o nicho ("vídeo-ensaio analítico",
    # "tese → conclusão") no default de canal novo; o resto é cópia fiel.
    return (
        f"{variacao}\n\n"
        "Você é editor de cortes de live. Reescreva o RESUMO de um "
        "corte com base na transcrição abaixo. O resumo deve, em 2-3 frases, "
        "descrever o ARCO do corte (começo → desenvolvimento → fechamento), "
        "com tom maduro, honesto e sem clickbait.\n\n"
        "=== DADOS DO CORTE ===\n"
        f"titulo_proposto: {titulo}\n"
        f"tema_central: {tema}\n"
        f"resumo_antigo (pode estar desatualizado): {resumo_antigo}\n\n"
        "=== TRANSCRIÇÃO DO CORTE (fonte primária de verdade) ===\n"
        f"{transcricao}\n\n"
        'Retorne APENAS o JSON no formato: {"resumo": "..."}'
    )


# ─── Testes de equivalência ─────────────────────────────────────────────────

_META = {
    "titulo_live": "Live sobre pós-modernidade",
    "youtube_url": "https://youtu.be/abc",
    "duracao_segundos": 7530,
}
_TRANSCRICAO = "[0] (00:00) olá\n[1] (00:04) mundo"


@pytest.mark.parametrize("cabecalho", ["", "PARTE 2 de 3 da transcrição."])
@pytest.mark.parametrize("variacao", ["", "LENTE: foque no contraste."])
def test_cortes_identico_ao_oraculo(cabecalho, variacao):
    novo = ClaudeIaService._montar_prompt(
        _TRANSCRICAO, _META, cabecalho=cabecalho, variacao=variacao
    )
    _igual(novo, _oraculo_cortes(_TRANSCRICAO, _META, cabecalho=cabecalho, variacao=variacao))


@pytest.mark.parametrize("total_partes", [1, 3])
def test_trechos_identico_ao_oraculo(total_partes):
    cabecalho_meta = "=== CORTE EM REVISÃO ===\nTítulo: X\nTema central: Y\n"
    novo = ClaudeIaService._montar_prompt_trechos(_TRANSCRICAO, cabecalho_meta, 2, total_partes)
    _igual(novo, _oraculo_trechos(_TRANSCRICAO, cabecalho_meta, 2, total_partes))


def test_thumbnail_identico_ao_oraculo():
    ctx = {
        "tema": "Foucault e o poder",
        "titulo_youtube": "O que Foucault realmente disse sobre poder",
        "texto_capa": "PODER",
        "resumo": "Um resumo qualquer.",
        "transcricao": _TRANSCRICAO,
        "historico_visual": "- capa 1\n- capa 2",
    }
    marca_emojis = "EMOJIS EDITORIAIS: nenhum."
    bloco_hints = ""
    mascote = "Mascote"
    novo = ClaudeIaService._montar_prompt_thumbnail(ctx, marca_emojis, bloco_hints, mascote)
    _igual(novo, _oraculo_thumbnail(ctx, marca_emojis, bloco_hints, mascote))


def test_metadados_default_identico_ao_oraculo():
    # D-349: o invólucro de metadados foi externalizado para scaffold; o default
    # versionado, formatado com os mesmos valores, reproduz o prompt hardcoded antigo.
    valores = {
        "variacao": "LENTE: foque no contraste.",
        "titulo_proposto": "O que Foucault disse sobre poder",
        "tema_central": "Foucault e o poder",
        "numero_corte": 7,
        "resumo_historico": "resumo antigo",
        "transcricao_marcada": "[00:00] olá\n[00:04] mundo",
        "historico_titulos": "- Título A\n- Título B",
    }
    template = editorial_scaffolds._default_scaffold(
        editorial_scaffolds._exigir_catalogo("metadados")
    )
    novo = template.format(**valores)
    _igual(novo, _oraculo_metadados(**valores))


def test_resumo_default_identico_ao_oraculo():
    # O resumo é inline (método async); validamos que o default versionado, ao ser
    # formatado com os mesmos valores, reproduz o prompt antigo.
    variacao, titulo, tema, resumo_antigo, transcricao = (
        "LENTE",
        "Título do corte",
        "Tema",
        "resumo antigo",
        "fala fala fala",
    )
    template = editorial_scaffolds._default_scaffold(editorial_scaffolds._exigir_catalogo("resumo"))
    novo = template.format(
        variacao=variacao,
        titulo=titulo,
        tema=tema,
        resumo_antigo=resumo_antigo,
        transcricao=transcricao,
    )
    _igual(novo, _oraculo_resumo(variacao, titulo, tema, resumo_antigo, transcricao))
