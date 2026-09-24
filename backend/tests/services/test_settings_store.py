"""Testes do backend de settings no banco (D-191).

Cobrem o `settings_store` (round-trip de app settings e identidade, merge raso,
listagem) e a disciplina DB-first + fallback/migração do `AppSettingsService`:
sem linha no banco, lê o arquivo legado e SEMEIA o banco; depois passa a ler do
banco mesmo que o arquivo suma.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from app.infrastructure import settings_store
from app.services.app_settings import AppSettingsService, LogLevel, RenderSettings


def teardown_function():
    AppSettingsService.set_settings_path_for_tests(None)


# --------------------------------------------------------------------------- #
# settings_store
# --------------------------------------------------------------------------- #


def test_app_settings_round_trip(tmp_path: Path):
    db = tmp_path / "settings.db"
    valores = {
        "log_level": "debug",
        "filtro_global_padrao": "cinematic_iii",
        "youtube_layout_padrao_global": '{"modo_padrao":"full"}',
        # D-532: onde cada componente da capa do TikTok fica.
        "capa_tiktok_layout": '{"etiqueta":{"y":300}}',
        "render_cooldown_sec": 5,
        "render_overlay_concurrency": 2,
        "render_bundle_cache_enabled": 0,
        "render_overlay_codec": "vp9",
        "render_overlay_max_attempts": 4,
        "render_grade_global_quality": 27,
        "velocidade_player_padrao": 1.5,
        "contexto_antes_seg": 180,
        "contexto_depois_seg": 600,
    }
    settings_store.gravar_app_settings(db, "canal-a", valores)

    assert settings_store.ler_app_settings(db, "canal-a") == valores
    # Canal sem linha → None (sinaliza fallback ao arquivo legado).
    assert settings_store.ler_app_settings(db, "outro") is None


def test_app_settings_upsert_sobrescreve(tmp_path: Path):
    db = tmp_path / "settings.db"
    base = {
        "log_level": "info",
        "filtro_global_padrao": "bypass_dourado_aberto",
        "youtube_layout_padrao_global": "{}",
        "capa_tiktok_layout": "{}",
        "render_cooldown_sec": 0,
        "render_overlay_concurrency": 4,
        "render_bundle_cache_enabled": 1,
        "render_overlay_codec": "prores_4444",
        "render_overlay_max_attempts": 3,
        "render_grade_global_quality": 30,
        "velocidade_player_padrao": 1.0,
        "contexto_antes_seg": 60,
        "contexto_depois_seg": 300,
    }
    settings_store.gravar_app_settings(db, "c", base)
    settings_store.gravar_app_settings(db, "c", {**base, "log_level": "debug"})

    assert settings_store.ler_app_settings(db, "c")["log_level"] == "debug"


def test_identidade_merge_preserva_campos(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_identidade(
        db, "canal-a", {"handle": "@meu", "nome": "Meu Canal", "credito": "@meu"}
    )
    # Merge raso: só altera o handle; nome/credito preservados.
    settings_store.gravar_identidade(db, "canal-a", {"handle": "@novo"})

    linha = settings_store.ler_identidade(db, "canal-a")
    assert linha["handle"] == "@novo"
    assert linha["nome"] == "Meu Canal"
    assert linha["credito"] == "@meu"


def test_listar_identidades_indexa_por_canal(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_identidade(db, "a", {"handle": "@a"})
    settings_store.gravar_identidade(db, "b", {"handle": "@b"})

    todas = settings_store.listar_identidades(db)
    assert set(todas) == {"a", "b"}
    assert todas["a"]["handle"] == "@a"


def test_mascote_round_trip(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_mascote(db, "canal-a", {"nome": "Sapo"})

    assert settings_store.ler_mascote(db, "canal-a") == {"nome": "Sapo"}
    # Canal sem linha → None (sinaliza fallback ao mascote.yaml legado).
    assert settings_store.ler_mascote(db, "outro") is None


def test_mascote_upsert_sobrescreve(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_mascote(db, "c", {"nome": "Antigo"})
    settings_store.gravar_mascote(db, "c", {"nome": "Novo"})

    assert settings_store.ler_mascote(db, "c") == {"nome": "Novo"}


# --------------------------------------------------------------------------- #
# Skills editoriais por canal (E-021)
# --------------------------------------------------------------------------- #


def _skill_valores(corpo="corpo", params='{"modelo":"opus"}', lentes='["a"]'):
    return {"corpo": corpo, "params_json": params, "lentes_json": lentes}


def test_skill_round_trip(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "canal-a", "cortador-expert", _skill_valores())

    linha = settings_store.ler_skill(db, "canal-a", "cortador-expert")
    assert linha["corpo"] == "corpo"
    assert linha["params_json"] == '{"modelo":"opus"}'
    assert linha["lentes_json"] == '["a"]'
    assert linha["updated_at"]  # carimbado pelo store
    # Skill sem linha → None (sinaliza fallback/migração ao chamador).
    assert settings_store.ler_skill(db, "canal-a", "outra") is None
    assert settings_store.ler_skill(db, "outro", "cortador-expert") is None


def test_skill_upsert_sobrescreve(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cenas-expert", _skill_valores(corpo="v1"))
    settings_store.gravar_skill(db, "c", "cenas-expert", _skill_valores(corpo="v2"))

    assert settings_store.ler_skill(db, "c", "cenas-expert")["corpo"] == "v2"


def test_listar_skills_do_canal_indexa_por_skill(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores(corpo="a"))
    settings_store.gravar_skill(db, "c", "trechos-expert", _skill_valores(corpo="b"))
    # Outro canal não deve vazar.
    settings_store.gravar_skill(db, "outro", "cortador-expert", _skill_valores(corpo="z"))

    todas = settings_store.ler_skills_do_canal(db, "c")
    assert set(todas) == {"cortador-expert", "trechos-expert"}
    assert todas["cortador-expert"]["corpo"] == "a"


def test_deletar_skill_volta_a_none(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "metadados-expert", _skill_valores())
    settings_store.deletar_skill(db, "c", "metadados-expert")

    assert settings_store.ler_skill(db, "c", "metadados-expert") is None
    # Deletar inexistente é no-op (não levanta).
    settings_store.deletar_skill(db, "c", "metadados-expert")


# --------------------------------------------------------------------------- #
# Versionamento append-only das skills (D-312)
# --------------------------------------------------------------------------- #


def test_gravar_skill_cria_versao_1_vigente(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores(corpo="v1"))

    versoes = settings_store.listar_versoes_skill(db, "c", "cortador-expert")
    assert [v["versao"] for v in versoes] == [1]
    assert versoes[0]["vigente"] == 1
    assert versoes[0]["corpo"] == "v1"
    assert versoes[0]["criado_em"]  # carimbado


def test_editar_cria_nova_versao_e_desmarca_a_anterior(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores(corpo="v1"))
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores(corpo="v2"))

    versoes = settings_store.listar_versoes_skill(db, "c", "cortador-expert")
    # Mais nova primeiro; só a v2 é vigente.
    assert [(v["versao"], v["vigente"], v["corpo"]) for v in versoes] == [
        (2, 1, "v2"),
        (1, 0, "v1"),
    ]
    # A leitura vigente (editorial_skill) reflete a v2 — comportamento externo intacto.
    assert settings_store.ler_skill(db, "c", "cortador-expert")["corpo"] == "v2"


def test_salvar_identico_nao_cria_versao_nova(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cenas-expert", _skill_valores(corpo="igual"))
    # Regravar o MESMO conteúdo (salvar sem mudança real) → dedup, sem versão nova.
    settings_store.gravar_skill(db, "c", "cenas-expert", _skill_valores(corpo="igual"))

    versoes = settings_store.listar_versoes_skill(db, "c", "cenas-expert")
    assert [v["versao"] for v in versoes] == [1]


def test_scaffold_grava_em_tabela_propria_por_scaffold_key(tmp_path: Path):
    # D-349: o scaffold vive em tabela própria keyed por scaffold_key e NÃO versiona
    # a skill (a coluna legada e o histórico de versões ficam intactos).
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores(corpo="v1"))
    settings_store.gravar_scaffold(db, "c", "cortes", "CONTRATO X")

    assert settings_store.ler_scaffold(db, "c", "cortes") == "CONTRATO X"
    # Nenhuma versão nova da skill: gravar o scaffold não toca editorial_skill_version.
    versoes = settings_store.listar_versoes_skill(db, "c", "cortador-expert")
    assert [v["versao"] for v in versoes] == [1]


def test_migrar_scaffolds_para_tabela_propria_idempotente(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "metadados-expert", _skill_valores(corpo="v1"))
    conn = sqlite3.connect(str(db))
    try:
        conn.execute(
            "UPDATE editorial_skill SET scaffold = ? "
            "WHERE channel_id = 'c' AND skill_key = 'metadados-expert'",
            ("SCAFFOLD RESUMO LEGADO",),
        )
        conn.commit()
    finally:
        conn.close()

    mapa = {"metadados-expert": "resumo"}
    assert settings_store.migrar_scaffolds_para_tabela_propria(db, mapa) == 1
    assert settings_store.ler_scaffold(db, "c", "resumo") == "SCAFFOLD RESUMO LEGADO"
    # Idempotente: 2ª rodada não copia de novo nem sobrescreve.
    assert settings_store.migrar_scaffolds_para_tabela_propria(db, mapa) == 0
    assert settings_store.ler_scaffold(db, "c", "resumo") == "SCAFFOLD RESUMO LEGADO"


def test_reverter_cria_nova_versao_com_conteudo_antigo(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores(corpo="v1"))
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores(corpo="v2"))

    revertido = settings_store.reverter_skill_para_versao(db, "c", "cortador-expert", 1)
    assert revertido["corpo"] == "v1"

    versoes = settings_store.listar_versoes_skill(db, "c", "cortador-expert")
    # Append-only: reverter à v1 cria a v3 (cópia da v1) vigente; nada é reativado.
    assert [(v["versao"], v["vigente"], v["corpo"]) for v in versoes] == [
        (3, 1, "v1"),
        (2, 0, "v2"),
        (1, 0, "v1"),
    ]
    assert settings_store.ler_skill(db, "c", "cortador-expert")["corpo"] == "v1"


def test_reverter_versao_inexistente_levanta(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_skill(db, "c", "cortador-expert", _skill_valores())
    try:
        settings_store.reverter_skill_para_versao(db, "c", "cortador-expert", 99)
        raise AssertionError("esperava KeyError")
    except KeyError:
        pass


def test_backfill_linha_legada_vira_versao_1(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.inicializar(db)
    # Simula uma linha gravada ANTES do D-312 (sem histórico): insere direto na
    # editorial_skill, sem passar pelo gravar_skill versionado.
    import sqlite3

    conn = sqlite3.connect(str(db))
    conn.execute(
        "INSERT INTO editorial_skill (channel_id, skill_key, corpo, params_json, lentes_json, "
        "scaffold, updated_at) VALUES ('c', 'cortador-expert', 'CORPO V2 LEGADO', '{}', '[]', '', "
        "'2026-01-01T00:00:00+00:00')"
    )
    conn.commit()
    conn.close()

    # Qualquer reabertura do banco (aqui, a própria leitura) dispara o backfill
    # idempotente do boot — a linha legada ganha a versão 1 vigente.
    versoes = settings_store.listar_versoes_skill(db, "c", "cortador-expert")
    assert [(v["versao"], v["vigente"], v["corpo"]) for v in versoes] == [(1, 1, "CORPO V2 LEGADO")]
    # Preserva o corpo v2 já gravado (não perde nada) e reaproveita o updated_at.
    assert versoes[0]["criado_em"] == "2026-01-01T00:00:00+00:00"
    # Idempotente: reabrir de novo não duplica.
    settings_store.inicializar(db)
    assert len(settings_store.listar_versoes_skill(db, "c", "cortador-expert")) == 1


# --------------------------------------------------------------------------- #
# AppSettingsService: DB-first + fallback/migração do arquivo legado
# --------------------------------------------------------------------------- #


def test_migra_arquivo_legado_para_o_banco(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    settings_path.write_text(
        json.dumps({"log_level": "debug", "render": {"overlay_max_attempts": 5}}),
        encoding="utf-8",
    )
    AppSettingsService.set_settings_path_for_tests(settings_path)

    # Primeira leitura: sem linha no banco → lê o arquivo e SEMEIA o banco.
    app = AppSettingsService.get()
    assert app.log_level == LogLevel.DEBUG
    assert app.render.overlay_max_attempts == 5

    db = tmp_path / "settings.db"
    linha = settings_store.ler_app_settings(db, "default")
    assert linha is not None
    assert linha["log_level"] == "debug"
    assert linha["render_overlay_max_attempts"] == 5


def test_banco_e_fonte_da_verdade_apos_semear(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    settings_path.write_text(json.dumps({"log_level": "info"}), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    AppSettingsService.get()  # semeia o banco a partir do arquivo
    settings_path.unlink()  # arquivo some — o banco deve bastar

    AppSettingsService.set_settings_path_for_tests(settings_path)  # zera cache, mesmo db
    assert AppSettingsService.get().log_level == LogLevel.INFO


def test_update_grava_no_banco_e_no_espelho(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    AppSettingsService.set_settings_path_for_tests(settings_path)

    AppSettingsService.update_render(RenderSettings(cooldown_sec=9))

    # Espelho (arquivo) atualizado.
    espelho = json.loads(settings_path.read_text(encoding="utf-8"))
    assert espelho["render"]["cooldown_sec"] == 9
    # Banco (fonte da verdade) atualizado.
    linha = settings_store.ler_app_settings(tmp_path / "settings.db", "default")
    assert linha["render_cooldown_sec"] == 9


def test_update_log_level_preserva_youtube_layout(tmp_path: Path):
    """Regressão: o update legado esquecia o youtube_layout ao mudar o log level."""
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")

    AppSettingsService.update_youtube_layout_padrao_global('{"modo_padrao":"full"}')
    AppSettingsService.update_log_level(LogLevel.DEBUG)

    assert AppSettingsService.get().youtube_layout_padrao_global == '{"modo_padrao":"full"}'


def test_o_caminho_antigo_e_o_mesmo_modulo_da_infraestrutura():
    """D-696: o atalho em services/ é apelido, não cópia — o cache de schema é
    estado de módulo e partiria em dois."""
    import importlib

    antigo = importlib.import_module("app.services.settings_store")
    novo = importlib.import_module("app.infrastructure.settings_store")

    assert antigo is novo
