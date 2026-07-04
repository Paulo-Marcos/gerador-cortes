"""Testes para o sistema de VARIATION_TAGS — memória global de capas.

WHY: o objetivo é garantir que (1) a linha de tags do prompt salvo é parseada
fielmente nos 5 eixos, (2) é removida antes do prompt ir pro gerador de imagem
(senão a IA renderiza o texto na thumb), (3) o consolidado das últimas N capas
vira bloco proibido injetável, (4) o repertório é formatado como bullets.
"""

from app.domain.variacao_prompt import (
    coletar_eixos_proibidos,
    contar_eixos_modais,
    formatar_eixos_proibidos,
    formatar_pressao_positiva,
    formatar_repertorio,
    parse_variation_tags,
    strip_variation_tags,
)


class TestParseVariationTags:
    def test_extrai_os_doze_eixos(self):
        prompt = (
            '[VARIATION_TAGS] cenario="templo egípcio com hieróglifos" | '
            'personagens="figura central do faraó retratada de perfil" | '
            'relacao_mascote_personagens="Sapo observa o faraó com distância crítica" | '
            'escala_mascote="secundário forte ao lado da figura central" | '
            'camera="plano médio em diagonal" | '
            'pose="sentado no degrau, olhar lateral" | '
            'paleta="ocre + azul-noite + dourado" | '
            'luminosidade="chave-alta diurna, alto contraste quente" | '
            'tipografia="caligráfica oriental em pincel" | '
            'roupa="túnica de linho leve" | '
            'layout_texto="manchete em arco curvado sobre a borda superior" | '
            'apoio_layout="selo dourado em chapa de bronze parafusada na lateral"\n\n'
            "Editorial 2D thumbnail, 16:9..."
        )
        tags = parse_variation_tags(prompt)
        assert tags == {
            "cenario": "templo egípcio com hieróglifos",
            "personagens": "figura central do faraó retratada de perfil",
            "relacao_mascote_personagens": "Sapo observa o faraó com distância crítica",
            "escala_mascote": "secundário forte ao lado da figura central",
            "camera": "plano médio em diagonal",
            "pose": "sentado no degrau, olhar lateral",
            "paleta": "ocre + azul-noite + dourado",
            "luminosidade": "chave-alta diurna, alto contraste quente",
            "tipografia": "caligráfica oriental em pincel",
            "roupa": "túnica de linho leve",
            "layout_texto": "manchete em arco curvado sobre a borda superior",
            "apoio_layout": "selo dourado em chapa de bronze parafusada na lateral",
        }

    def test_aceita_prompt_legacy_sem_eixos_novos(self):
        """Prompts antigos sem relacao/escala/camera/luminosidade continuam parseáveis."""
        prompt = (
            '[VARIATION_TAGS] cenario="x" | personagens="y" | pose="z" | '
            'paleta="w" | tipografia="v" | roupa="u" | '
            'layout_texto="t" | apoio_layout="s"\n\nbody'
        )
        tags = parse_variation_tags(prompt)
        for novo in ("relacao_mascote_personagens", "escala_mascote", "camera", "luminosidade"):
            assert novo not in tags
        assert tags["personagens"] == "y"

    def test_coalesce_chaves_legadas_do_mascote(self):
        """E-010 back-compat: capas antigas com `*_sapo` são lidas como as chaves
        neutras (`*_mascote`), para a memória global cruzar histórico antigo e novo."""
        prompt = (
            '[VARIATION_TAGS] cenario="x" | '
            'relacao_sapo_personagens="Sapo ao lado" | '
            'escala_sapo="dominante"\n\nbody'
        )
        tags = parse_variation_tags(prompt)
        assert tags["relacao_mascote_personagens"] == "Sapo ao lado"
        assert tags["escala_mascote"] == "dominante"
        # as chaves legadas não vazam
        assert "relacao_sapo_personagens" not in tags
        assert "escala_sapo" not in tags

    def test_aceita_prompt_legacy_sem_personagens(self):
        """Prompts gerados antes do eixo personagens continuam parseáveis."""
        prompt = (
            '[VARIATION_TAGS] cenario="x" | pose="y" | paleta="z" | '
            'tipografia="w" | roupa="v" | layout_texto="u" | '
            'apoio_layout="t"\n\nbody'
        )
        tags = parse_variation_tags(prompt)
        assert "personagens" not in tags
        assert tags["apoio_layout"] == "t"

    def test_aceita_prompt_legacy_sem_apoio_layout(self):
        """Prompts gerados antes do eixo apoio_layout continuam parseáveis."""
        prompt = (
            '[VARIATION_TAGS] cenario="x" | pose="y" | paleta="z" | '
            'tipografia="w" | roupa="v" | layout_texto="u"\n\nbody'
        )
        tags = parse_variation_tags(prompt)
        assert "apoio_layout" not in tags
        assert tags["layout_texto"] == "u"

    def test_aceita_prompt_legacy_sem_layout_texto(self):
        """Prompts gerados antes do eixo layout_texto continuam sendo parseáveis
        — o eixo ausente simplesmente não aparece no dict."""
        prompt = (
            '[VARIATION_TAGS] cenario="x" | pose="y" | paleta="z" | '
            'tipografia="w" | roupa="v"\n\nbody'
        )
        tags = parse_variation_tags(prompt)
        assert "layout_texto" not in tags
        assert tags["cenario"] == "x"

    def test_prompt_sem_tags_devolve_dict_vazio(self):
        assert parse_variation_tags("Editorial 2D thumbnail...") == {}

    def test_string_vazia_devolve_dict_vazio(self):
        assert parse_variation_tags("") == {}
        assert parse_variation_tags(None) == {}  # type: ignore[arg-type]

    def test_ignora_eixos_desconhecidos(self):
        prompt = '[VARIATION_TAGS] cenario="praça" | invalido="x" | pose="andando"'
        tags = parse_variation_tags(prompt)
        assert tags == {"cenario": "praça", "pose": "andando"}

    def test_aceita_valores_vazios_silenciosamente(self):
        prompt = '[VARIATION_TAGS] cenario="" | pose="apontando"'
        tags = parse_variation_tags(prompt)
        assert tags == {"pose": "apontando"}


class TestStripVariationTags:
    def test_remove_linha_inicial(self):
        prompt = (
            '[VARIATION_TAGS] cenario="x" | pose="y" | paleta="z" | tipografia="w" | roupa="v"\n\n'
            "Editorial 2D thumbnail, 16:9..."
        )
        stripped = strip_variation_tags(prompt)
        assert "[VARIATION_TAGS]" not in stripped
        assert stripped.startswith("Editorial 2D thumbnail")

    def test_idempotente(self):
        prompt = "Editorial 2D thumbnail, sem tags"
        assert strip_variation_tags(prompt) == prompt

    def test_string_vazia(self):
        assert strip_variation_tags("") == ""

    def test_preserva_corpo_quando_tags_no_meio(self):
        # Tags devem estar na PRIMEIRA linha — se aparecerem no meio, removemos
        # mesmo assim, pra robustez contra modelos que erram a ordem.
        prompt = (
            "Editorial 2D thumbnail, 16:9...\n"
            '[VARIATION_TAGS] cenario="x" | pose="y"\n'
            "rest of prompt"
        )
        stripped = strip_variation_tags(prompt)
        assert "[VARIATION_TAGS]" not in stripped
        assert "Editorial 2D thumbnail" in stripped
        assert "rest of prompt" in stripped


class TestColetarEixosProibidos:
    def test_consolida_sem_duplicatas(self):
        historico = [
            {"cenario": "quadro-negro", "pose": "apontando"},
            {"cenario": "quadro-negro", "pose": "sentado"},  # cenario duplicado
            {"cenario": "cozinha", "pose": "apontando"},  # pose duplicada
        ]
        consolidado = coletar_eixos_proibidos(historico)
        assert consolidado["cenario"] == ["quadro-negro", "cozinha"]
        assert consolidado["pose"] == ["apontando", "sentado"]
        assert consolidado["paleta"] == []

    def test_historico_vazio_devolve_listas_vazias(self):
        consolidado = coletar_eixos_proibidos([])
        assert all(v == [] for v in consolidado.values())


class TestFormatarEixosProibidos:
    def test_lista_eixos_usados(self):
        consolidado = {
            "cenario": ["quadro-negro", "biblioteca antiga"],
            "personagens": ["Lula em primeiro plano"],
            "relacao_mascote_personagens": ["Sapo observa do canto"],
            "escala_mascote": ["dominante"],
            "camera": ["plano médio frontal"],
            "pose": ["apontando"],
            "paleta": [],
            "tipografia": [],
            "roupa": [],
            "layout_texto": [],
            "apoio_layout": ["retângulo vermelho na base"],
        }
        formatado = formatar_eixos_proibidos(consolidado)
        assert "CENÁRIOS já usados" in formatado
        assert "quadro-negro" in formatado
        assert "biblioteca antiga" in formatado
        assert "apontando" in formatado
        # Elenco visual entra na memória global
        assert "ELENCO VISUAL" in formatado
        assert "Lula em primeiro plano" in formatado
        # Novos eixos de rotação dramática (rótulos neutros — E-010)
        assert "RELAÇÕES mascote" in formatado
        assert "Sapo observa do canto" in formatado
        assert "ESCALAS DO MASCOTE" in formatado
        assert "dominante" in formatado
        assert "ENQUADRAMENTOS DE CÂMERA" in formatado
        assert "plano médio frontal" in formatado
        # Apoio do retângulo-vermelho-base entra na lista de banidos
        assert "TRATAMENTOS DO APOIO" in formatado
        assert "retângulo vermelho na base" in formatado
        # Eixos sem valores aparecem com "(nenhum registrado ainda)"
        assert "PALETAS: (nenhum registrado ainda)" in formatado


class TestFormatarRepertorio:
    def test_thumbnail_texto_e_vazio(self):
        """Tipografia da manchete/apoio é decisão criativa do agente —
        cardápio fixo aqui vira mode collapse (capas com mesma fonte).
        Repertório fica vazio; variação acontece pela memória global das
        VARIATION_TAGS (`tipografia` da capa anterior vira proibido na
        próxima)."""
        assert formatar_repertorio("thumbnail_texto") == ""

    def test_thumbnail_layout_texto_e_vazio(self):
        """Mesmo princípio para o layout da manchete — listar 'diagonal /
        vertical / em arco' viraria cardápio fixo. Variação via memória."""
        assert formatar_repertorio("thumbnail_layout_texto") == ""

    def test_thumbnail_apoio_layout_e_vazio(self):
        """Mesmo princípio para o tratamento do apoio."""
        assert formatar_repertorio("thumbnail_apoio_layout") == ""

    def test_thumbnail_roupa_e_vazio(self):
        """Repertório de roupa foi ESVAZIADO (I-038): listar peças concretas
        virava cardápio e o gerador repetia a mesma roupa entre capas. A roupa
        agora nasce do método na skill (registro casual derivado do contexto) +
        memória global + pressão positiva, não de menu."""
        assert formatar_repertorio("thumbnail_roupa") == ""

    def test_tipo_desconhecido_devolve_vazio(self):
        assert formatar_repertorio("inexistente") == ""


class TestContarEixosModais:
    def test_so_entra_eixo_saturado(self):
        # 'roupa' repete 3x → satura; 'pose' nunca repete → não entra.
        historico = [
            {"roupa": "moletom cinza surrado", "pose": "andando"},
            {"roupa": "moletom cinza surrado", "pose": "sentado"},
            {"roupa": "moletom cinza surrado", "pose": "apontando"},
        ]
        modais = contar_eixos_modais(historico)
        assert modais["roupa"] == ("moletom cinza surrado", 3)
        assert "pose" not in modais

    def test_historico_sem_repeticao_devolve_vazio(self):
        historico = [{"roupa": "a"}, {"roupa": "b"}, {"roupa": "c"}]
        assert contar_eixos_modais(historico) == {}

    def test_limiar_configuravel(self):
        historico = [{"luminosidade": "chave-baixa"}, {"luminosidade": "chave-baixa"}]
        assert contar_eixos_modais(historico, min_repeticoes=3) == {}
        assert contar_eixos_modais(historico, min_repeticoes=2) == {
            "luminosidade": ("chave-baixa", 2)
        }


class TestFormatarPressaoPositiva:
    def test_emite_ordem_de_inversao(self):
        formatado = formatar_pressao_positiva(
            {"roupa": ("moletom cinza surrado", 3), "luminosidade": ("chave-baixa", 2)}
        )
        assert "ROUPAS DO MASCOTE" in formatado
        assert "moletom cinza surrado" in formatado
        assert "POLO OPOSTO" in formatado
        assert "3×" in formatado
        assert "REGISTRO TONAL" in formatado

    def test_vazio_quando_nada_satura(self):
        assert formatar_pressao_positiva({}) == ""
