"""Testes para o fingerprint do bundle Remotion (puro)."""

from pathlib import Path

import pytest
from app.domain.remotion_bundle import compute_src_fingerprint

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _criar_src_basico(tmp_path: Path) -> Path:
    src = tmp_path / "src"
    src.mkdir()
    (src / "index.ts").write_text("export const a = 1;\n", encoding="utf-8")
    (src / "Root.tsx").write_text("export const Root = () => null;\n", encoding="utf-8")
    return src


# ─────────────────────────────────────────────────────────────
# Determinismo e sensibilidade ao conteúdo
# ─────────────────────────────────────────────────────────────


class TestDeterminismo:
    def test_mesmo_diretorio_gera_mesmo_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        assert compute_src_fingerprint(src) == compute_src_fingerprint(src)

    def test_fingerprint_e_sha256_hex(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        fp = compute_src_fingerprint(src)
        assert len(fp) == 64
        assert all(c in "0123456789abcdef" for c in fp)

    def test_mudar_conteudo_altera_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        original = compute_src_fingerprint(src)
        (src / "index.ts").write_text("export const a = 2;\n", encoding="utf-8")
        assert compute_src_fingerprint(src) != original

    def test_adicionar_arquivo_altera_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        original = compute_src_fingerprint(src)
        (src / "extra.tsx").write_text("// novo\n", encoding="utf-8")
        assert compute_src_fingerprint(src) != original

    def test_remover_arquivo_altera_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        original = compute_src_fingerprint(src)
        (src / "Root.tsx").unlink()
        assert compute_src_fingerprint(src) != original

    def test_renomear_arquivo_altera_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        original = compute_src_fingerprint(src)
        (src / "index.ts").rename(src / "main.ts")
        assert compute_src_fingerprint(src) != original

    def test_mudar_conteudo_em_subpasta_altera_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        sub = src / "cenas"
        sub.mkdir()
        (sub / "Card.tsx").write_text("X\n", encoding="utf-8")
        primeiro = compute_src_fingerprint(src)

        (sub / "Card.tsx").write_text("Y\n", encoding="utf-8")
        segundo = compute_src_fingerprint(src)

        assert primeiro != segundo


# ─────────────────────────────────────────────────────────────
# Pastas/arquivos ignorados
# ─────────────────────────────────────────────────────────────


class TestArquivosIgnorados:
    def test_node_modules_e_ignorado(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        original = compute_src_fingerprint(src)
        nm = src / "node_modules" / "pkg"
        nm.mkdir(parents=True)
        (nm / "index.ts").write_text("// barulho\n", encoding="utf-8")
        assert compute_src_fingerprint(src) == original

    def test_pasta_bundle_cache_e_ignorada(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        original = compute_src_fingerprint(src)
        cache = src / ".bundle-cache" / "abc"
        cache.mkdir(parents=True)
        (cache / "index.html").write_text("<html/>", encoding="utf-8")
        assert compute_src_fingerprint(src) == original

    def test_arquivo_sem_extensao_relevante_e_ignorado(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        original = compute_src_fingerprint(src)
        (src / "README.md").write_text("doc\n", encoding="utf-8")
        (src / "logo.png").write_bytes(b"\x89PNG\r\n")
        assert compute_src_fingerprint(src) == original


# ─────────────────────────────────────────────────────────────
# Extra files (package.json, etc)
# ─────────────────────────────────────────────────────────────


class TestExtraFiles:
    def test_extra_file_altera_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        pkg = tmp_path / "package.json"
        pkg.write_text('{"name": "x", "version": "1.0.0"}\n', encoding="utf-8")

        sem_extra = compute_src_fingerprint(src)
        com_extra = compute_src_fingerprint(src, extra_files=[pkg])
        assert sem_extra != com_extra

    def test_mudar_extra_file_altera_fingerprint(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        pkg = tmp_path / "package.json"
        pkg.write_text('{"name": "x", "version": "1.0.0"}\n', encoding="utf-8")

        fp1 = compute_src_fingerprint(src, extra_files=[pkg])
        pkg.write_text('{"name": "x", "version": "2.0.0"}\n', encoding="utf-8")
        fp2 = compute_src_fingerprint(src, extra_files=[pkg])
        assert fp1 != fp2

    def test_extra_file_inexistente_e_silenciosamente_ignorado(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        fp_sem = compute_src_fingerprint(src)
        fp_com = compute_src_fingerprint(src, extra_files=[tmp_path / "nao_existe.json"])
        assert fp_sem == fp_com

    def test_ordem_dos_extras_nao_importa(self, tmp_path: Path):
        src = _criar_src_basico(tmp_path)
        a = tmp_path / "a.json"
        b = tmp_path / "b.json"
        a.write_text('{"a": 1}\n', encoding="utf-8")
        b.write_text('{"b": 2}\n', encoding="utf-8")

        fp1 = compute_src_fingerprint(src, extra_files=[a, b])
        fp2 = compute_src_fingerprint(src, extra_files=[b, a])
        assert fp1 == fp2


# ─────────────────────────────────────────────────────────────
# Erros explícitos
# ─────────────────────────────────────────────────────────────


class TestErrosExplicitos:
    def test_diretorio_inexistente_levanta_filenotfounderror(self, tmp_path: Path):
        with pytest.raises(FileNotFoundError):
            compute_src_fingerprint(tmp_path / "nao_existe")

    def test_arquivo_no_lugar_de_diretorio_levanta(self, tmp_path: Path):
        arquivo = tmp_path / "arquivo.txt"
        arquivo.write_text("x\n", encoding="utf-8")
        with pytest.raises(NotADirectoryError):
            compute_src_fingerprint(arquivo)


# ─────────────────────────────────────────────────────────────
# Estabilidade cross-platform (paths Windows/Linux)
# ─────────────────────────────────────────────────────────────


class TestEstabilidadeCrossPlatform:
    def test_diretorios_identicos_em_locais_distintos_mesmo_fingerprint(self, tmp_path: Path):
        """Dois diretórios com mesmo conteúdo (mas paths absolutos
        diferentes) devem produzir o mesmo fingerprint — só o conteúdo
        relativo importa."""
        src_a = tmp_path / "a" / "src"
        src_b = tmp_path / "b" / "src"
        src_a.mkdir(parents=True)
        src_b.mkdir(parents=True)

        for src in (src_a, src_b):
            (src / "index.ts").write_text("export {};\n", encoding="utf-8")
            (src / "Root.tsx").write_text("// r\n", encoding="utf-8")

        assert compute_src_fingerprint(src_a) == compute_src_fingerprint(src_b)
