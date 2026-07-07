"""Testes do serviço de skills editoriais por canal (E-021).

Cobrem o contrato do `editorial_skills` no mesmo espírito de
`test_editorial_identity`: banco como fonte da verdade, seed/migração idempotente
a partir do estado atual do canal (`.md` + globais de código), resolução
banco→fallback, e as fachadas de gestão (descrever/definir/resetar). Tudo isolado
por `tmp_path` (um `settings.db` + um diretório editorial por teste); os DEFAULTS
genéricos vêm de `examples/instance.example/editorial` e `config.settings` reais.
"""

from __future__ import annotations

from pathlib import Path

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


def test_seed_le_corpo_do_md_e_params_globais(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path, **{"cortes.md": "CORPO DO CANAL"})

    skill = editorial_skills.resolver_skill(
        _SKILL, db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    assert skill.corpo == "CORPO DO CANAL"
    # Params default vêm dos globais de config (preserva comportamento atual).
    assert skill.modelo == settings.claude_model_analise
    assert skill.thinking_tokens == settings.claude_cli_max_thinking_tokens
    assert skill.timeout == settings.claude_cli_timeout
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


def test_thumbnail_tem_thinking_proprio(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial(tmp_path)

    skill = editorial_skills.resolver_skill(
        "thumbnail-prompt-expert", db_path=db, channel_id=_CANAL, editorial_root=editorial
    )

    # Thumbnail usa o thinking próprio (maior), não o global.
    assert skill.thinking_tokens == settings.claude_cli_thinking_tokens_thumbnail
    assert skill.modelo == settings.claude_model_thumbnail


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


def test_descrever_skills_traz_as_cinco_com_default_e_atual(tmp_path: Path):
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
    ]
    thumb = next(d for d in descritas if d.key == "thumbnail-prompt-expert")
    assert set(thumb.params) == {"modelo", "thinking_tokens", "timeout"}
    trechos = next(d for d in descritas if d.key == "trechos-expert")
    assert trechos.lentes_default == []  # sem lentes por design


def test_migracao_idempotente_semeia_cinco_uma_vez(tmp_path: Path):
    db = _db(tmp_path)

    primeira = editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)
    segunda = editorial_skills.migrar_skills_do_canal_ativo(db_path=db, channel_id=_CANAL)

    assert primeira == 5
    assert segunda == 0
    assert set(settings_store.ler_skills_do_canal(db, _CANAL)) == {
        c.key for c in editorial_skills.catalogo()
    }


def test_skill_desconhecida_levanta(tmp_path: Path):
    db = _db(tmp_path)
    try:
        editorial_skills.resolver_skill("inexistente", db_path=db, channel_id=_CANAL)
        raise AssertionError("esperava KeyError")
    except KeyError:
        pass
