"""Testes do serviço de skills editoriais por canal (E-021).

Cobrem o contrato do `editorial_skills` no mesmo espírito de
`test_editorial_identity`: banco como fonte da verdade, seed/migração idempotente
a partir do estado atual do canal (`.md` + globais de código), resolução
banco→fallback, e as fachadas de gestão (descrever/definir/resetar). Tudo isolado
por `tmp_path` (um `settings.db` + um diretório editorial por teste); os DEFAULTS
genéricos vêm de `examples/instance.example/editorial` e `config.settings` reais.
"""

from __future__ import annotations

import json
from pathlib import Path

from app import editorial_corpos_legados as legados
from app import editorial_skills
from app.config import settings
from app.services import settings_store

_CANAL = "canal-teste"
_SKILL = "cortador-expert"


def _db(tmp_path: Path) -> Path:
    return tmp_path / "settings.db"


def _editorial(tmp_path: Path, **arquivos: str) -> Path:
    raiz = tmp_path / "editorial"
    raiz.mkdir()
    for nome, corpo in arquivos.items():
        (raiz / nome).write_text(corpo, encoding="utf-8")
    return raiz


def _semear_linha_crua(
    db: Path,
    skill_key: str,
    *,
    thinking_tokens: int,
    timeout: float,
    modelo: str = "opus",
    lentes: list[str] | None = None,
) -> None:
    """Grava uma linha diretamente no banco, sem passar pelo seed do serviço —
    simula o estado PRÉ-D-300/D-301 (ou uma customização já feita pela UI de Canais)."""
    settings_store.gravar_skill(
        db,
        _CANAL,
        skill_key,
        {
            "corpo": "CORPO",
            "params_json": json.dumps(
                {"modelo": modelo, "thinking_tokens": thinking_tokens, "timeout": timeout}
            ),
            "lentes_json": json.dumps(lentes if lentes is not None else []),
        },
    )


def test_seed_le_corpo_do_md_e_params_globais(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "CORPO DO CANAL"})

    skill = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    assert skill.corpo == "CORPO DO CANAL"
    # Params default vêm dos globais de config (preserva comportamento atual).
    # D-300: cortes tem thinking/timeout próprios — não os globais de cenas/metadados.
    assert skill.modelo == settings.claude_model_analise
    assert skill.thinking_tokens == settings.claude_cli_thinking_tokens_analise
    assert skill.timeout == settings.claude_cli_timeout_analise
    # Efeito colateral: o banco foi semeado (migração).
    assert settings_store.ler_skill(db, _CANAL, _SKILL) is not None


def test_banco_e_fonte_da_verdade_apos_seed(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "ORIGINAL"})

    primeira = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    # Muda o .md DEPOIS de semeado: a 2ª leitura deve vir do banco.
    (editorial / "cortes.md").write_text("MUDADO", encoding="utf-8")
    segunda = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    assert primeira.corpo == "ORIGINAL"
    assert segunda.corpo == "ORIGINAL"


def test_seed_usa_default_quando_canal_sem_md(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)  # vazio: nenhum .md do canal

    skill = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    # Cai no template genérico versionado (examples/.../editorial/cortes.md).
    assert "Cortador" in skill.corpo


def test_cortador_sem_lentes_de_sorteio_por_design(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)

    skill = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    # D-301: o ângulo do título deriva do conteúdo de cada corte, sem sorteio.
    assert skill.lentes == []


def test_thumbnail_tem_thinking_proprio(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)

    skill = editorial_skills.resolver_skill(
        "thumbnail-prompt-expert", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    # Thumbnail usa o thinking próprio (maior), não o global.
    assert skill.thinking_tokens == settings.claude_cli_thinking_tokens_thumbnail
    assert skill.modelo == settings.claude_model_thumbnail


def test_trechos_tem_thinking_proprio_mas_timeout_global(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)

    skill = editorial_skills.resolver_skill(
        "trechos-expert", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    # D-300: trechos ganhou thinking próprio (menor que cortes, revisa 1 corte só)...
    assert skill.thinking_tokens == settings.claude_cli_thinking_tokens_trechos
    # ...mas não ganhou timeout próprio — continua no global (só cortes ganhou).
    assert skill.timeout == settings.claude_cli_timeout


def test_cenas_e_metadados_continuam_no_thinking_global(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)

    cenas = editorial_skills.resolver_skill(
        "cenas-expert", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    metadados = editorial_skills.resolver_skill(
        "metadados-expert", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    # Fora do escopo do D-300: continuam herdando o default global (desligado).
    assert cenas.thinking_tokens == settings.claude_cli_max_thinking_tokens
    assert metadados.thinking_tokens == settings.claude_cli_max_thinking_tokens


def test_definir_corpo_grava_no_banco_e_espelha_no_md(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "ANTIGO"})

    editorial_skills.definir_skill(
        _SKILL, corpo="NOVO CORPO", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    # Fonte da verdade (banco).
    proxima = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    assert proxima.corpo == "NOVO CORPO"
    # Espelho (.md) atualizado.
    assert (editorial / "cortes.md").read_text(encoding="utf-8").strip() == "NOVO CORPO"


def test_definir_params_faz_merge_sem_tocar_corpo(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "CORPO"})

    editorial_skills.definir_skill(
        _SKILL,
        params={"modelo": "haiku", "thinking_tokens": 5000, "timeout": 120.0},
        db_path=db,
        channel_id=_CANAL,
        editorial_root=editorial,
    )

    skill = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    assert skill.modelo == "haiku"
    assert skill.thinking_tokens == 5000
    assert skill.corpo == "CORPO"  # corpo intacto


def test_definir_lentes_por_canal(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)

    editorial_skills.definir_skill(
        _SKILL,
        lentes=["Lente A", "Lente B", "  "],  # brancos descartados
        db_path=db,
        channel_id=_CANAL,
        editorial_root=editorial,
    )

    skill = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    assert skill.lentes == ["Lente A", "Lente B"]


def test_resetar_corpo_volta_ao_default(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "CUSTOMIZADO"})

    editorial_skills.definir_skill(
        _SKILL, corpo="CUSTOMIZADO", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    descrita = editorial_skills.resetar_skill(
        _SKILL, ["corpo"], db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    assert descrita.corpo == descrita.corpo_default
    assert "Cortador" in descrita.corpo  # template genérico


def test_resetar_campo_invalido_levanta(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)
    try:
        editorial_skills.resetar_skill(
            _SKILL, ["corpo", "xyz"], db_path=db, channel_id=_CANAL, editorial_root=editorial
        )
        raise AssertionError("esperava ValueError")
    except ValueError:
        pass


def test_descrever_skills_traz_todas_com_default_e_atual(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)

    descritas = editorial_skills.descrever_skills(
        db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    assert [d.key for d in descritas] == [
        "cortador-expert",
        "trechos-expert",
        "cenas-expert",
        "metadados-expert",
        "thumbnail-prompt-expert",
        "avaliador-bruto",
        "shorts-expert",
        "capa-tiktok-expert",
        "cenas-short-expert",
    ]
    thumb = next(d for d in descritas if d.key == "thumbnail-prompt-expert")
    assert set(thumb.params) == {"modelo", "thinking_tokens", "timeout"}
    trechos = next(d for d in descritas if d.key == "trechos-expert")
    assert trechos.lentes_default == []  # sem lentes por design
    cortador = next(d for d in descritas if d.key == "cortador-expert")
    assert cortador.lentes_default == []  # D-301: sem lentes de sorteio por design


def test_migracao_idempotente_semeia_o_catalogo_uma_vez(tmp_path: Path):
    db = _db(tmp_path)

    primeira = editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)
    segunda = editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    assert primeira == len(editorial_skills.catalogo())
    assert segunda == 0
    assert set(settings_store.ler_skills_do_canal(db, _CANAL)) == {
        c.key for c in editorial_skills.catalogo()
    }


def test_migracao_d300_eleva_thinking_e_timeout_do_default_antigo(tmp_path: Path):
    db = _db(tmp_path)
    # Simula canais semeados ANTES do D-300: thinking=0 e timeout=300 (globais
    # antigos, compartilhados com cenas/metadados).
    _semear_linha_crua(db, "cortador-expert", thinking_tokens=0, timeout=300.0)
    _semear_linha_crua(db, "trechos-expert", thinking_tokens=0, timeout=300.0)

    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    cortes = editorial_skills.resolver_skill("cortador-expert", db_path=db, channel_id=_CANAL)
    trechos = editorial_skills.resolver_skill("trechos-expert", db_path=db, channel_id=_CANAL)
    assert cortes.thinking_tokens == settings.claude_cli_thinking_tokens_analise
    assert cortes.timeout == settings.claude_cli_timeout_analise
    assert trechos.thinking_tokens == settings.claude_cli_thinking_tokens_trechos
    # Trechos não ganhou timeout próprio no D-300 — continua no global, intocado.
    assert trechos.timeout == 300.0


def test_migracao_d300_preserva_valor_customizado(tmp_path: Path):
    db = _db(tmp_path)
    # Canal já customizou thinking (5000) e timeout (450) pela UI — não é o
    # default antigo (0 / 300), então a migração não deve tocar.
    _semear_linha_crua(db, "cortador-expert", thinking_tokens=5000, timeout=450.0)

    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    cortes = editorial_skills.resolver_skill("cortador-expert", db_path=db, channel_id=_CANAL)
    assert cortes.thinking_tokens == 5000
    assert cortes.timeout == 450.0


def test_migracao_d300_e_idempotente(tmp_path: Path):
    db = _db(tmp_path)
    _semear_linha_crua(db, "cortador-expert", thinking_tokens=0, timeout=300.0)

    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)
    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    cortes = editorial_skills.resolver_skill("cortador-expert", db_path=db, channel_id=_CANAL)
    assert cortes.thinking_tokens == settings.claude_cli_thinking_tokens_analise
    assert cortes.timeout == settings.claude_cli_timeout_analise


def test_migracao_d301_zera_lentes_do_default_antigo(tmp_path: Path):
    db = _db(tmp_path)
    # Simula canal semeado ANTES do D-301: lentes = repertório antigo de sorteio.
    _semear_linha_crua(
        db,
        "cortador-expert",
        thinking_tokens=settings.claude_cli_thinking_tokens_analise,
        timeout=settings.claude_cli_timeout_analise,
        lentes=list(editorial_skills._D301_LENTES_CORTES_ANTIGO),
    )

    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    cortes = editorial_skills.resolver_skill("cortador-expert", db_path=db, channel_id=_CANAL)
    assert cortes.lentes == []


def test_migracao_d301_preserva_lentes_customizadas(tmp_path: Path):
    db = _db(tmp_path)
    # Canal já customizou as lentes pela UI — lista diferente do default antigo,
    # a migração não deve tocar.
    _semear_linha_crua(
        db,
        "cortador-expert",
        thinking_tokens=settings.claude_cli_thinking_tokens_analise,
        timeout=settings.claude_cli_timeout_analise,
        lentes=["Lente própria do canal"],
    )

    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    cortes = editorial_skills.resolver_skill("cortador-expert", db_path=db, channel_id=_CANAL)
    assert cortes.lentes == ["Lente própria do canal"]


def test_migracao_d301_e_d300_juntas_nao_se_pisam(tmp_path: Path):
    db = _db(tmp_path)
    # Canal semeado ANTES de D-300 E D-301: thinking/timeout antigos + lentes
    # antigas na MESMA linha (cortador-expert é alcançado pelas duas migrações).
    _semear_linha_crua(
        db,
        "cortador-expert",
        thinking_tokens=0,
        timeout=300.0,
        lentes=list(editorial_skills._D301_LENTES_CORTES_ANTIGO),
    )

    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    cortes = editorial_skills.resolver_skill("cortador-expert", db_path=db, channel_id=_CANAL)
    # As duas migrações aplicaram: uma não deve reverter o efeito da outra.
    assert cortes.thinking_tokens == settings.claude_cli_thinking_tokens_analise
    assert cortes.timeout == settings.claude_cli_timeout_analise
    assert cortes.lentes == []


def test_migracao_d301_e_idempotente(tmp_path: Path):
    db = _db(tmp_path)
    _semear_linha_crua(
        db,
        "cortador-expert",
        thinking_tokens=settings.claude_cli_thinking_tokens_analise,
        timeout=settings.claude_cli_timeout_analise,
        lentes=list(editorial_skills._D301_LENTES_CORTES_ANTIGO),
    )

    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)
    editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    cortes = editorial_skills.resolver_skill("cortador-expert", db_path=db, channel_id=_CANAL)
    assert cortes.lentes == []


_ARQUIVO = {"cortador-expert": "cortes.md", "trechos-expert": "trechos.md"}


def _semear_corpo(db: Path, skill_key: str, corpo: str) -> None:
    """Grava uma linha com um CORPO específico (params/lentes fixos, para checar
    que a migração D-311 mexe só no corpo)."""
    settings_store.gravar_skill(
        db,
        _CANAL,
        skill_key,
        {
            "corpo": corpo,
            "params_json": json.dumps({"modelo": "opus", "thinking_tokens": 123, "timeout": 300.0}),
            "lentes_json": json.dumps([]),
        },
    )


def test_d311_corpo_concreto_superado_vira_v2_limpo(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)
    # Cada default concreto superado conhecido (todas as variantes históricas)
    # deve convergir para o v2 concreto, em cortador e trechos.
    for skill_key in ("cortador-expert", "trechos-expert"):
        for antigo in legados.CORPOS_SUPERADOS[skill_key]:
            _semear_corpo(db, skill_key, antigo)
            editorial_skills.migrar_skills_do_canal_ativo(
                db_path=db, channel_id=_CANAL, editorial_root=editorial
            )
            skill = editorial_skills.resolver_skill(
                skill_key, db_path=db, channel_id=_CANAL, editorial_root=editorial
            )
            assert skill.corpo == legados.CORPOS_V2[skill_key]
            # Params intocados (a migração mexe só no corpo).
            assert skill.thinking_tokens == 123
            # Espelho .md reescrito com o v2.
            espelho = (editorial / _ARQUIVO[skill_key]).read_text(encoding="utf-8").strip()
            assert espelho == legados.CORPOS_V2[skill_key]


def test_d311_corpo_generico_e_preservado(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)
    # Corpo GENÉRICO (template dos examples) NÃO está no conjunto de superados
    # concretos → install de terceiro permanece genérico.
    for skill_key in ("cortador-expert", "trechos-expert"):
        cat = editorial_skills._exigir_catalogo(skill_key)
        generico = editorial_skills._default_corpo(cat, None)
        _semear_corpo(db, skill_key, generico)

    editorial_skills.migrar_skills_do_canal_ativo(
        db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    for skill_key in ("cortador-expert", "trechos-expert"):
        cat = editorial_skills._exigir_catalogo(skill_key)
        skill = editorial_skills.resolver_skill(
            skill_key, db_path=db, channel_id=_CANAL, editorial_root=editorial
        )
        assert skill.corpo == editorial_skills._default_corpo(cat, None)
        assert skill.corpo != legados.CORPOS_V2[skill_key]


def test_d311_corpo_customizado_e_preservado(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)
    _semear_corpo(db, "cortador-expert", "PROMPT CUSTOMIZADO DO CANAL")

    editorial_skills.migrar_skills_do_canal_ativo(
        db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    skill = editorial_skills.resolver_skill(
        "cortador-expert", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    assert skill.corpo == "PROMPT CUSTOMIZADO DO CANAL"


def test_d311_e_idempotente(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)
    _semear_corpo(db, "cortador-expert", legados.CORPOS_SUPERADOS["cortador-expert"][0])

    editorial_skills.migrar_skills_do_canal_ativo(
        db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    editorial_skills.migrar_skills_do_canal_ativo(
        db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    skill = editorial_skills.resolver_skill(
        "cortador-expert", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    assert skill.corpo == legados.CORPOS_V2["cortador-expert"]


def test_d311_nao_toca_cenas_metadados_thumbnail(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)
    # Skills fora do escopo não têm entrada em CORPOS_SUPERADOS: qualquer corpo
    # (mesmo um que "pareça" um default) é preservado.
    for skill_key in ("cenas-expert", "metadados-expert", "thumbnail-prompt-expert"):
        _semear_corpo(db, skill_key, "CORPO ARBITRARIO")

    editorial_skills.migrar_skills_do_canal_ativo(
        db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    for skill_key in ("cenas-expert", "metadados-expert", "thumbnail-prompt-expert"):
        skill = editorial_skills.resolver_skill(
            skill_key, db_path=db, channel_id=_CANAL, editorial_root=editorial
        )
        assert skill.corpo == "CORPO ARBITRARIO"


def test_d311_v2_limpo_sem_scaffolding(tmp_path: Path):
    # O v2 concreto não carrega o scaffolding genérico ("TEMPLATE GENÉRICO" /
    # "Copie este arquivo") — é o corpo direto do prompt.
    for corpo in legados.CORPOS_V2.values():
        assert "TEMPLATE GENÉRICO" not in corpo
        assert "Copie este arquivo" not in corpo


def test_skill_desconhecida_levanta(tmp_path: Path):
    db = _db(tmp_path)
    try:
        editorial_skills.resolver_skill("inexistente", db_path=db, channel_id=_CANAL)
        raise AssertionError("esperava KeyError")
    except KeyError:
        pass


# --------------------------------------------------------------------------- #
# Histórico de versões (D-312): listar (com resumo do que mudou) e reverter
# --------------------------------------------------------------------------- #


def test_listar_versoes_traz_resumo_do_que_mudou(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "V1"})

    # v1: seed pela primeira resolução; v2: muda o corpo; v3: muda os params.
    editorial_skills.resolver_skill(_SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial)
    editorial_skills.definir_skill(
        _SKILL, corpo="V2", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    editorial_skills.definir_skill(
        _SKILL,
        params={"modelo": "haiku", "thinking_tokens": 10, "timeout": 120.0},
        db_path=db,
        channel_id=_CANAL,
        editorial_root=editorial,
    )

    versoes = editorial_skills.listar_versoes(_SKILL, db_path=db, channel_id=_CANAL)
    # Mais nova primeiro; só a última é vigente.
    assert [v.versao for v in versoes] == [3, 2, 1]
    assert [v.vigente for v in versoes] == [True, False, False]
    assert versoes[2].resumo == "Versão inicial"
    assert versoes[1].mudancas == ["corpo"]  # v2 mexeu no corpo
    assert versoes[0].mudancas == ["params_json"]  # v3 mexeu nos params
    assert "parâmetros" in versoes[0].resumo


def test_reverter_skill_volta_conteudo_e_espelha_md(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "ORIGINAL"})

    editorial_skills.resolver_skill(_SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial)
    editorial_skills.definir_skill(
        _SKILL, corpo="CUSTOMIZADO", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    descrita = editorial_skills.reverter_skill(
        _SKILL, 1, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    # Volta ao corpo da v1 e re-descreve.
    assert descrita.corpo == "ORIGINAL"
    # Fonte da verdade (banco) e espelho (.md) coerentes com o revertido.
    atual = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )
    assert atual.corpo == "ORIGINAL"
    assert (editorial / "cortes.md").read_text(encoding="utf-8").strip() == "ORIGINAL"
    # Append-only: reverter gerou a v3 vigente.
    versoes = editorial_skills.listar_versoes(_SKILL, db_path=db, channel_id=_CANAL)
    assert versoes[0].versao == 3 and versoes[0].vigente is True


def test_reverter_versao_inexistente_levanta(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)
    editorial_skills.resolver_skill(_SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial)
    try:
        editorial_skills.reverter_skill(
            _SKILL, 99, db_path=db, channel_id=_CANAL, editorial_root=editorial
        )
        raise AssertionError("esperava KeyError")
    except KeyError:
        pass


def test_listar_versoes_skill_desconhecida_levanta(tmp_path: Path):
    db = _db(tmp_path)
    try:
        editorial_skills.listar_versoes("inexistente", db_path=db, channel_id=_CANAL)
        raise AssertionError("esperava KeyError")
    except KeyError:
        pass
