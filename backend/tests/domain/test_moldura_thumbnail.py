"""Testes de `app.domain.moldura_thumbnail` — a moldura colada na capa.

Função pura de imagem: entra a capa e o PNG da moldura, sai a capa emoldurada.
Os casos abaixo cobrem o que quebrou de verdade durante a construção, não o
caminho feliz sozinho.
"""

from __future__ import annotations

import io

import pytest
from app.domain.moldura_thumbnail import (
    ARQUIVO_LEGADO,
    ARQUIVO_PADRAO,
    LIMIAR_DE_APARO,
    aparar_margem,
    arquivos_da_moldura,
    emoldurar,
    espessura_da_faixa,
    nomes_das_molduras,
)
from PIL import Image

LARGURA, ALTURA = 320, 180
MARGEM_VAZIA = 12
FAIXA = 8


MARCA = (0, 255, 64)


def _capa(cor=(200, 30, 30), formato="PNG", marca_na_borda=False) -> bytes:
    """Uma capa lisa; com `marca_na_borda`, uma listra colada na margem esquerda.

    A listra imita o que o capista faz de verdade: texto encostado no limite do
    quadro. É por ela que se sabe se a moldura comeu conteúdo.
    """
    capa = Image.new("RGB", (LARGURA, ALTURA), cor)
    if marca_na_borda:
        capa.paste(Image.new("RGB", (6, ALTURA), MARCA), (0, 0))
    buffer = io.BytesIO()
    capa.save(buffer, formato)
    return buffer.getvalue()


def _moldura(margem: int = MARGEM_VAZIA, faixa: int = FAIXA) -> Image.Image:
    """Uma moldura no formato do arquivo real: faixa opaca com VAZIO em volta."""
    moldura = Image.new("RGBA", (LARGURA, ALTURA), (0, 0, 0, 0))
    desenho = Image.new("RGBA", (LARGURA - margem * 2, ALTURA - margem * 2), (255, 190, 0, 255))
    vazado = Image.new(
        "RGBA",
        (desenho.width - faixa * 2, desenho.height - faixa * 2),
        (0, 0, 0, 0),
    )
    desenho.paste(vazado, (faixa, faixa))
    moldura.paste(desenho, (margem, margem))
    return moldura


def _cores(imagem: Image.Image) -> set[tuple[int, int, int]]:
    """As cores presentes na imagem. `getcolors` em vez de `getdata` porque este
    ja esta marcado para sumir no Pillow 14."""
    return {cor for _, cor in imagem.getcolors(maxcolors=1 << 20)}


def _bytes_da(imagem: Image.Image) -> bytes:
    buffer = io.BytesIO()
    imagem.save(buffer, "PNG")
    return buffer.getvalue()


class TestAparo:
    def test_corta_a_margem_vazia_em_volta_do_desenho(self):
        aparada = aparar_margem(_moldura())

        assert aparada.size == (LARGURA - MARGEM_VAZIA * 2, ALTURA - MARGEM_VAZIA * 2)

    def test_respingo_quase_invisivel_na_borda_nao_impede_o_aparo(self):
        """O motivo do limiar existir.

        A moldura real tem pixels de alfa ~2 encostando nas bordas. Aparando por
        alfa > 0 — que é o que `getbbox()` faz sozinho —, a caixa é a imagem
        inteira e nada é cortado: o defeito que fazia a capa aparecer POR FORA
        da moldura.
        """
        com_poeira = _moldura()
        com_poeira.putpixel((0, 0), (255, 255, 255, LIMIAR_DE_APARO - 1))
        com_poeira.putpixel((LARGURA - 1, ALTURA - 1), (255, 255, 255, 1))

        assert com_poeira.getchannel("A").getbbox() == (0, 0, LARGURA, ALTURA)
        assert aparar_margem(com_poeira).size == (
            LARGURA - MARGEM_VAZIA * 2,
            ALTURA - MARGEM_VAZIA * 2,
        )

    def test_moldura_toda_transparente_passa_intacta(self):
        vazia = Image.new("RGBA", (LARGURA, ALTURA), (0, 0, 0, 0))

        assert aparar_margem(vazia).size == (LARGURA, ALTURA)


class TestEmoldurar:
    def test_a_faixa_encosta_na_borda_do_quadro(self):
        """A prova contra a tarja preta.

        Antes do aparo sobrava uma tira da capa entre o limite do quadro e a
        faixa. Com o aparo, o pixel do canto JÁ É moldura.
        """
        emoldurada = Image.open(io.BytesIO(emoldurar(_capa(), _bytes_da(_moldura()))))

        assert emoldurada.convert("RGB").getpixel((0, 0)) == (255, 190, 0)

    def test_o_miolo_da_capa_fica_intocado(self):
        emoldurada = Image.open(io.BytesIO(emoldurar(_capa(), _bytes_da(_moldura()))))

        assert emoldurada.convert("RGB").getpixel((LARGURA // 2, ALTURA // 2)) == (200, 30, 30)

    def test_o_tamanho_da_capa_manda_na_moldura(self):
        """Capas do canal saem em tamanhos diferentes; a moldura se ajusta."""
        grande = io.BytesIO()
        Image.new("RGB", (LARGURA * 3, ALTURA * 3), (10, 10, 10)).save(grande, "PNG")

        emoldurada = Image.open(io.BytesIO(emoldurar(grande.getvalue(), _bytes_da(_moldura()))))

        assert emoldurada.size == (LARGURA * 3, ALTURA * 3)

    @pytest.mark.parametrize("formato", ["PNG", "JPEG"])
    def test_o_formato_de_entrada_e_preservado(self, formato):
        emoldurada = Image.open(
            io.BytesIO(emoldurar(_capa(formato=formato), _bytes_da(_moldura())))
        )

        assert emoldurada.format == formato


class TestEscolhaPelasMarcas:
    """As quatro molduras, indexadas pelo mesmo par que decide 🔥 e 📖."""

    @pytest.mark.parametrize(
        ("is_fire", "is_leitura", "esperada"),
        [
            (False, False, ARQUIVO_PADRAO),
            (True, False, "thumb_fire.png"),
            (False, True, "thumb_livro.png"),
            (True, True, "thumb_fire_livro.png"),
        ],
    )
    def test_cada_combinacao_pede_a_sua_moldura(self, is_fire, is_leitura, esperada):
        assert arquivos_da_moldura(is_fire, is_leitura)[0] == esperada

    def test_a_padrao_e_a_rede_quando_a_exata_nao_existir(self):
        """Canal com só uma moldura ainda emoldura — não cai para capa crua."""
        preferencia = arquivos_da_moldura(is_fire=True, is_leitura=True)

        assert preferencia == ("thumb_fire_livro.png", ARQUIVO_PADRAO, ARQUIVO_LEGADO)

    def test_o_corte_padrao_nao_pede_a_padrao_duas_vezes(self):
        """A exata JÁ É a padrão aqui; repeti-la seria uma tentativa à toa."""
        assert arquivos_da_moldura(False, False) == (ARQUIVO_PADRAO, ARQUIVO_LEGADO)

    def test_inteiros_do_banco_valem_como_booleanos(self):
        """`is_fire`/`is_leitura` são colunas INTEGER: chegam 0 e 1, não False/True."""
        assert arquivos_da_moldura(1, 0)[0] == "thumb_fire.png"
        assert arquivos_da_moldura(0, 1)[0] == "thumb_livro.png"


class TestNomesDasMolduras:
    def test_lista_o_que_o_canal_precisa_ter(self):
        """A mensagem de erro da tela sai daqui, e não de uma lista escrita à mão."""
        assert set(nomes_das_molduras()) == {
            ARQUIVO_PADRAO,
            "thumb_fire.png",
            "thumb_livro.png",
            "thumb_fire_livro.png",
        }

    def test_nao_repete_nome(self):
        nomes = nomes_das_molduras()

        assert len(nomes) == len(set(nomes))


class TestEspessuraDaFaixa:
    def test_mede_a_faixa_da_propria_moldura(self):
        """A espessura sai do arquivo, não de um número escrito no código."""
        assert espessura_da_faixa(aparar_margem(_moldura(faixa=8))) == (8, 8)

    def test_moldura_mais_grossa_da_medida_maior(self):
        fina = espessura_da_faixa(aparar_margem(_moldura(faixa=4)))
        grossa = espessura_da_faixa(aparar_margem(_moldura(faixa=16)))

        assert grossa > fina


class TestArteNaoEComida:
    """D-556: a faixa cobria o texto que a arte poe na borda."""

    def test_conteudo_colado_na_margem_sobrevive(self):
        """Colando por cima, esta listra sumia inteira debaixo da faixa."""
        emoldurada = Image.open(
            io.BytesIO(emoldurar(_capa(marca_na_borda=True), _bytes_da(_moldura())))
        ).convert("RGB")

        assert MARCA in _cores(emoldurada)

    def test_a_moldura_continua_encostada_no_limite(self):
        """Recuar a arte nao pode ter afastado a moldura da borda."""
        emoldurada = Image.open(
            io.BytesIO(emoldurar(_capa(marca_na_borda=True), _bytes_da(_moldura())))
        ).convert("RGB")

        assert emoldurada.getpixel((0, 0)) == (255, 190, 0)

    def test_nao_sobra_buraco_preto_em_volta(self):
        """O fundo borrado existe para isto: onde a moldura falha, aparece a
        capa — nunca preto."""
        emoldurada = Image.open(io.BytesIO(emoldurar(_capa(), _bytes_da(_moldura())))).convert(
            "RGB"
        )

        assert (0, 0, 0) not in _cores(emoldurada)
