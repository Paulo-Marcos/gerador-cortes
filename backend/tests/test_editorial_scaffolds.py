"""Testes do serviço de scaffolds (contrato de saída) por canal (D-297).

Cobrem o contrato do `editorial_scaffolds` no mesmo espírito de
`test_editorial_skills`: banco como fonte da verdade, seed idempotente a partir do
default versionado, o guardrail do contrato (`validar_scaffold`), e as fachadas de
gestão (descrever/definir/resetar). Tudo isolado por `tmp_path` (um `settings.db` +
um diretório editorial por teste); os DEFAULTS vêm de
`examples/instance.example/editorial/scaffolds` e do `channel_config_loader` reais.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from app import channel_config_loader, editorial_scaffolds, editorial_scaffolds_legados
from app.services import settings_store

_CANAL = "canal-teste"


def _gravar_scaffold_legado(db: Path, channel_id: str, skill_key: str, template: str) -> None:
    """Escreve na coluna LEGADA `editorial_skill.scaffold` (pré-D-349) para simular
    um canal com scaffold customizado antes da migração para a tabela própria."""
    settings_store.gravar_skill(
        db,
        channel_id,
        skill_key,
        {"corpo": "expertise", "params_json": "{}", "lentes_json": "[]"},
    )
    conn = sqlite3.connect(str(db))
    try:
        conn.execute(
            "UPDATE editorial_skill SET scaffold = ? WHERE channel_id = ? AND skill_key = ?",
            (template, channel_id, skill_key),
        )
        conn.commit()
    finally:
        conn.close()


def _db(tmp_path: Path) -> Path:
    return tmp_path / "settings.db"


def _editorial(tmp_path: Path) -> Path:
    raiz = tmp_path / "editorial"
    raiz.mkdir()
    return raiz


def _kw(tmp_path: Path) -> dict:
    return {"db_path": _db(tmp_path), "channel_id": _CANAL, "editorial_root": _editorial(tmp_path)}


def test_seed_le_default_versionado_e_grava_no_banco(tmp_path: Path):
    kw = _kw(tmp_path)
    scaffold = editorial_scaffolds.resolver_scaffold("cortes", **kw)

    assert "=== DADOS DA LIVE ===" in scaffold
    assert "{texto_transcricao}" in scaffold
    # Efeito colateral: o banco foi semeado na tabela própria, keyed por scaffold_key.
    assert settings_store.ler_scaffold(kw["db_path"], _CANAL, "cortes")


def test_resolver_scaffold_tambem_semeia_corpo_da_skill(tmp_path: Path):
    # Regressão-chave: resolver o scaffold NÃO pode deixar a linha da skill nascer
    # com corpo vazio (o E-021 pularia o seed e a geração perderia a expertise).
    kw = _kw(tmp_path)
    editorial_scaffolds.resolver_scaffold("cortes", **kw)

    linha = settings_store.ler_skill(kw["db_path"], _CANAL, "cortador-expert")
    assert linha is not None
    assert linha["corpo"].strip() != ""  # corpo semeado pelo E-021


def test_cenas_default_vem_do_channel_config_loader(tmp_path: Path):
    scaffold = editorial_scaffolds.resolver_scaffold("cenas", **_kw(tmp_path))
    assert scaffold == channel_config_loader.PROMPT_DIRECAO.strip()


def test_banco_e_fonte_da_verdade_apos_definir(tmp_path: Path):
    kw = _kw(tmp_path)
    # Um scaffold válido para 'resumo' (todos os placeholders + marcador).
    novo = (
        "{variacao} {titulo} {tema} {resumo_antigo} {transcricao} "
        'Retorne o JSON {{"resumo": "..."}}'
    )
    editorial_scaffolds.definir_scaffold("resumo", novo, **kw)

    assert editorial_scaffolds.resolver_scaffold("resumo", **kw) == novo


def test_editar_resumo_nao_toca_corpo_da_skill_metadados(tmp_path: Path):
    # 'resumo' guarda seu scaffold na linha de metadados-expert; isso não pode
    # sobrescrever o corpo (expertise) da skill de metadados.
    kw = _kw(tmp_path)
    from app import editorial_skills

    antes = editorial_skills.resolver_skill("metadados-expert", **kw).corpo
    novo = (
        "{variacao} {titulo} {tema} {resumo_antigo} {transcricao} "
        'Retorne o JSON {{"resumo": "..."}}'
    )
    editorial_scaffolds.definir_scaffold("resumo", novo, **kw)
    depois = editorial_skills.resolver_skill("metadados-expert", **kw).corpo

    assert antes == depois


def test_resetar_scaffold_volta_ao_default(tmp_path: Path):
    kw = _kw(tmp_path)
    valido = '{variacao} {titulo} {tema} {resumo_antigo} {transcricao} JSON {{"resumo": "..."}}'
    editorial_scaffolds.definir_scaffold("resumo", valido, **kw)
    descrito = editorial_scaffolds.resetar_scaffold("resumo", **kw)

    assert descrito.scaffold == descrito.scaffold_default
    assert descrito.scaffold == editorial_scaffolds._default_scaffold(
        editorial_scaffolds._exigir_catalogo("resumo")
    )


def test_descrever_scaffolds_traz_todos_na_ordem(tmp_path: Path):
    descritos = editorial_scaffolds.descrever_scaffolds(**_kw(tmp_path))
    assert [d.key for d in descritos] == [
        "cortes",
        "trechos",
        "cenas",
        "thumbnail",
        "resumo",
        "metadados",
        "avaliacao-bruto",
        "shorts",
        # D-520: a etiqueta da capa do TikTok, na mesma posicao do catalogo
        # de skills.
        "capa-tiktok",
        "capa-tiktok-imagem",
        "cenas-short",
        "gancho-short",
        "metadados-short",
    ]
    cortes = next(d for d in descritos if d.key == "cortes")
    assert cortes.marcador == "JSON"
    assert "texto_transcricao" in cortes.placeholders


def test_metadados_seed_le_default_e_grava_por_scaffold_key(tmp_path: Path):
    # O novo scaffold 'metadados' (D-349) nasce do default versionado e é gravado
    # na tabela própria sob a chave 'metadados' — SEM colidir com 'resumo', que
    # também reusa a skill metadados-expert.
    kw = _kw(tmp_path)
    scaffold = editorial_scaffolds.resolver_scaffold("metadados", **kw)

    assert "=== INPUT DO CORTE ===" in scaffold
    assert "{transcricao_marcada}" in scaffold
    assert settings_store.ler_scaffold(kw["db_path"], _CANAL, "metadados")
    # 'resumo' e 'metadados' convivem, cada um sob sua própria chave.
    editorial_scaffolds.resolver_scaffold("resumo", **kw)
    assert settings_store.ler_scaffold(kw["db_path"], _CANAL, "resumo") != scaffold


def test_definir_metadados_valida_guardrail(tmp_path: Path):
    # Placeholder desconhecido → o guardrail do contrato rejeita (→ 422 no router).
    with pytest.raises(ValueError, match="desconhecidos"):
        editorial_scaffolds.definir_scaffold(
            "metadados",
            "{variacao} {titulo_proposto} {tema_central} {numero_corte} "
            "{resumo_historico} {transcricao_marcada} {historico_titulos} "
            "{campo_inventado} — devolva o JSON",
            **_kw(tmp_path),
        )


def test_scaffold_desconhecido_levanta(tmp_path: Path):
    with pytest.raises(KeyError):
        editorial_scaffolds.resolver_scaffold("inexistente", **_kw(tmp_path))


# --- D-349: migração da coluna legada → tabela própria por scaffold_key ------ #


def test_migracao_move_scaffold_legado_para_scaffold_key_certo(tmp_path: Path):
    kw = _kw(tmp_path)
    db = kw["db_path"]
    # Canal com scaffold customizado na coluna ANTIGA da linha metadados-expert
    # (onde morava o scaffold 'resumo' antes do D-349).
    custom = (
        "{variacao} {titulo} {tema} {resumo_antigo} {transcricao} "
        'meu resumo — retorne o JSON {{"resumo": "..."}}'
    )
    _gravar_scaffold_legado(db, _CANAL, "metadados-expert", custom)

    migrados = settings_store.migrar_scaffolds_para_tabela_propria(
        db, editorial_scaffolds._MAPA_MIGRACAO_LEGADO
    )

    assert migrados == 1
    # Migrou para a chave 'resumo' (não 'metadados').
    assert settings_store.ler_scaffold(db, _CANAL, "resumo") == custom
    assert settings_store.ler_scaffold(db, _CANAL, "metadados") is None
    # E o serviço devolve o customizado, sem re-semear o default.
    assert editorial_scaffolds.resolver_scaffold("resumo", **kw) == custom


def test_migracao_e_idempotente_e_nao_sobrescreve(tmp_path: Path):
    kw = _kw(tmp_path)
    db = kw["db_path"]
    _gravar_scaffold_legado(
        db, _CANAL, "cortador-expert", "SCAFFOLD LEGADO {texto_transcricao} JSON"
    )

    assert (
        settings_store.migrar_scaffolds_para_tabela_propria(
            db, editorial_scaffolds._MAPA_MIGRACAO_LEGADO
        )
        == 1
    )
    # 2ª rodada: nada a migrar (NOT EXISTS), e o valor já migrado é preservado.
    assert (
        settings_store.migrar_scaffolds_para_tabela_propria(
            db, editorial_scaffolds._MAPA_MIGRACAO_LEGADO
        )
        == 0
    )
    assert (
        settings_store.ler_scaffold(db, _CANAL, "cortes")
        == "SCAFFOLD LEGADO {texto_transcricao} JSON"
    )


def test_migracao_boot_preserva_scaffold_legado_customizado(tmp_path: Path):
    # A migração de dados roda dentro de `migrar_scaffolds_do_canal_ativo` (boot):
    # um scaffold de cortes customizado na coluna antiga sobrevive e é lido de volta.
    kw = _kw(tmp_path)
    db = kw["db_path"]
    custom = "{variacao}{cabecalho_section}{titulo_live}{duracao_humana}{youtube_url}{texto_transcricao} custom JSON"
    _gravar_scaffold_legado(db, _CANAL, "cortador-expert", custom)

    editorial_scaffolds.migrar_scaffolds_do_canal_ativo(**kw)

    assert editorial_scaffolds.resolver_scaffold("cortes", **kw) == custom


# --- Guardrail do contrato de saída (validar_scaffold) ---------------------- #

_CAT_CORTES = editorial_scaffolds._exigir_catalogo("cortes")
_VALIDO_CORTES = (
    "{variacao}{cabecalho_section}{titulo_live}{duracao_humana}"
    "{youtube_url}{texto_transcricao} — gere em JSON"
)


def test_validar_aceita_scaffold_completo():
    editorial_scaffolds.validar_scaffold(_VALIDO_CORTES, _CAT_CORTES)  # não levanta


def test_validar_rejeita_placeholder_obrigatorio_ausente():
    sem_transcricao = _VALIDO_CORTES.replace("{texto_transcricao}", "")
    with pytest.raises(ValueError, match="texto_transcricao"):
        editorial_scaffolds.validar_scaffold(sem_transcricao, _CAT_CORTES)


def test_validar_rejeita_placeholder_desconhecido():
    com_extra = _VALIDO_CORTES + " {campo_inventado}"
    with pytest.raises(ValueError, match="desconhecidos"):
        editorial_scaffolds.validar_scaffold(com_extra, _CAT_CORTES)


def test_validar_rejeita_marcador_de_contrato_ausente():
    sem_json = _VALIDO_CORTES.replace(" — gere em JSON", "")
    with pytest.raises(ValueError, match="JSON"):
        editorial_scaffolds.validar_scaffold(sem_json, _CAT_CORTES)


def test_validar_rejeita_chaves_desbalanceadas():
    with pytest.raises(ValueError):
        editorial_scaffolds.validar_scaffold("{variacao " + _VALIDO_CORTES, _CAT_CORTES)


def test_validar_rejeita_placeholder_posicional():
    com_posicional = _VALIDO_CORTES + " {}"
    with pytest.raises(ValueError, match="posicionais"):
        editorial_scaffolds.validar_scaffold(com_posicional, _CAT_CORTES)


def test_todos_os_defaults_passam_no_guardrail():
    # Invariante: cada default versionado é montável e respeita o próprio contrato.
    for cat in editorial_scaffolds.catalogo():
        editorial_scaffolds.validar_scaffold(editorial_scaffolds._default_scaffold(cat), cat)


def test_definir_scaffold_invalido_levanta_valueerror(tmp_path: Path):
    with pytest.raises(ValueError):
        editorial_scaffolds.definir_scaffold(
            "cortes", "sem placeholders nem contrato", **_kw(tmp_path)
        )


# --- D-330: scaffold de trechos magro + migração de boot -------------------- #

_TRECHOS_V1 = editorial_scaffolds_legados.SCAFFOLDS_SUPERADOS["trechos-expert"][0]


def test_novo_default_trechos_e_magro_e_delega_a_expertise():
    # O novo default não carrega mais as regras conservadoras que dominavam o
    # corpo v2 — delega tudo à expertise e passa no próprio guardrail.
    cat = editorial_scaffolds._exigir_catalogo("trechos")
    novo = editorial_scaffolds._default_scaffold(cat)

    editorial_scaffolds.validar_scaffold(novo, cat)  # marcador `desvios` presente
    assert "seguindo exatamente o formato e as regras da sua expertise" in novo
    assert "Seja conservador" not in novo
    assert "REPETICAO" not in novo
    assert novo != _TRECHOS_V1  # idempotência: novo default nunca é um superado


def test_novo_scaffold_trechos_formata_com_kwargs_reais():
    # Os kwargs EXATOS de `_montar_prompt_trechos`; o `.format` não pode dar KeyError.
    cat = editorial_scaffolds._exigir_catalogo("trechos")
    novo = editorial_scaffolds._default_scaffold(cat)
    montado = novo.format(
        cabecalho_parte="*** PARTE 1 de 2 ***\n\n",
        cabecalho_meta="=== CORTE ===\n",
        texto_transcricao="(00:00:01) fala de teste",
    )
    assert "fala de teste" in montado
    assert "{" not in montado.replace("{{", "").replace("}}", "")  # nada por resolver


def test_migracao_troca_v1_conservador_pelo_novo_default(tmp_path: Path):
    kw = _kw(tmp_path)
    # Canal semeado com o scaffold V1 conservador (estado pré-D-330).
    editorial_scaffolds.definir_scaffold("trechos", _TRECHOS_V1, **kw)

    migrados = editorial_scaffolds.migrar_scaffolds_do_canal_ativo(**kw)

    assert migrados == 1
    cat = editorial_scaffolds._exigir_catalogo("trechos")
    assert editorial_scaffolds.resolver_scaffold("trechos", **kw) == (
        editorial_scaffolds._default_scaffold(cat)
    )


def test_migracao_troca_v2_com_revisao_pelo_novo_default(tmp_path: Path):
    # D-332: o scaffold magro que ainda pedia `revisoes`/[REVISÁVEL] (era D-330)
    # também é superado — canais nele convergem para o novo default sem revisão.
    kw = _kw(tmp_path)
    v2_com_revisao = editorial_scaffolds_legados.SCAFFOLDS_SUPERADOS["trechos-expert"][1]
    editorial_scaffolds.definir_scaffold("trechos", v2_com_revisao, **kw)

    migrados = editorial_scaffolds.migrar_scaffolds_do_canal_ativo(**kw)

    assert migrados == 1
    cat = editorial_scaffolds._exigir_catalogo("trechos")
    novo = editorial_scaffolds.resolver_scaffold("trechos", **kw)
    assert novo == editorial_scaffolds._default_scaffold(cat)
    assert "revisoes" not in novo and "REVIS" not in novo


def test_migracao_preserva_default_novo_e_e_idempotente(tmp_path: Path):
    kw = _kw(tmp_path)
    # Canal genérico: 1º acesso semeia o NOVO default; a migração é no-op.
    novo = editorial_scaffolds.resolver_scaffold("trechos", **kw)

    assert editorial_scaffolds.migrar_scaffolds_do_canal_ativo(**kw) == 0
    assert editorial_scaffolds.resolver_scaffold("trechos", **kw) == novo


def test_migracao_preserva_scaffold_customizado(tmp_path: Path):
    kw = _kw(tmp_path)
    custom = (
        "{cabecalho_parte}{cabecalho_meta}{texto_transcricao} "
        "minha regra própria — retorne `desvios` em JSON"
    )
    editorial_scaffolds.definir_scaffold("trechos", custom, **kw)

    assert editorial_scaffolds.migrar_scaffolds_do_canal_ativo(**kw) == 0
    assert editorial_scaffolds.resolver_scaffold("trechos", **kw) == custom
