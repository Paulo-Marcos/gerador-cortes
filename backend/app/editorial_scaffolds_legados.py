"""D-330: scaffold de trechos V1 CONSERVADOR superado, para a migração de boot.

Análogo do `editorial_corpos_legados` (D-311), mas para SCAFFOLDS (D-297): o
scaffold é o invólucro que embrulha a transcrição e FIXA o formato de saída. O
scaffold de trechos por canal vive no banco (`resolver_scaffold("trechos")`) — é
DADO DE RUNTIME e não viaja no deploy git. Como `claude_ia` monta o prompt como
`expertise + scaffold` (o cliente injeta o corpo v2 PRIMEIRO e o scaffold por
ÚLTIMO), o scaffold concreto DOMINA o corpo v2. O scaffold V1 era CONSERVADOR
("só remova o que claramente não agrega") e só admitia 2 tipos (DESVIO/REPETICAO),
contradizendo a skill v2 "editora de coesão" (sem teto, guardrail semântico) — em
corte cheio de repetição saíam pouquíssimos desvios.

Esta migração torna o alinhamento do scaffold ao v2 uma MIGRAÇÃO DE CÓDIGO (padrão
D-311): no boot, o scaffold concreto V1 de um canal é substituído pelo DEFAULT
versionado (o novo `scaffolds/trechos.txt` magro) — mas SÓ quando o scaffold
gravado bate EXATAMENTE com um "default concreto superado conhecido".

Por que o match é só contra o texto CONCRETO V1 (não o novo nem uma customização):
um scaffold customizado pelo dono não bate e é PRESERVADO; o novo default magro
não pertence ao conjunto → a migração é idempotente (roda uma vez e nunca mais).

D-332: o scaffold magro que PEDIA `revisoes`/[REVISÁVEL] (era D-330) também foi
SUPERADO — a revisão automática foi revogada; o novo default só pede os `desvios`
NOVOS. Canais nele convergem para o default atual pela mesma migração.

`*_SUPERADOS` == os `scaffolds/trechos.txt` das eras pré-D-330 e pré-D-332,
`.strip()`ados (como `_default_scaffold` os gravava no banco). Congelados aqui
byte-a-byte; `test_editorial_scaffolds` guarda que NÃO são iguais ao novo default.
"""

from __future__ import annotations

_TRECHOS_V1 = (
    """
{cabecalho_parte}{cabecalho_meta}
Você é um editor de vídeo especialista. Receberá um trecho da transcrição de um corte e deve identificar partes que podem ser removidas sem comprometer o entendimento da tese central:

1. **DESVIO** — Trecho que foge do tema: digressões, avisos técnicos, problemas de transmissão, interação irrelevante com o chat (pedir like/inscrição sem dizer qual canal, ler comentário fora do tema, cumprimentar viewers), tangentes administrativas, silêncios longos, conteúdo fora do tom.
2. **REPETICAO** — Trecho onde o locutor reitera ideia já explicada sem agregar ângulo novo. Marque apenas redundâncias reais, não transições naturais de raciocínio.

A transcrição abaixo usa tempos ABSOLUTOS do vídeo original. Os timestamps de início e fim que você retornar devem ser desses mesmos tempos absolutos, dentro do intervalo do corte.

=== TRANSCRIÇÃO (timestamp absoluto — fala) ===
{texto_transcricao}
=== FIM DA TRANSCRIÇÃO ===

Retorne APENAS o JSON, sem explicações. Formato esperado:
{{
  "desvios": [
    {{
      "inicio_hms": "HH:MM:SS",
      "fim_hms": "HH:MM:SS",
      "tipo": "DESVIO" | "REPETICAO",
      "motivo": "Descrição breve do motivo"
    }}
  ]
}}

Regras importantes:
- Seja conservador: só remova o que claramente não agrega à tese central.
- Encontre TODOS os desvios óbvios — não pare em 2-3. Pedir like/inscrição sem qualificar o canal, comentários administrativos longos e digressões claras DEVEM ser marcados.
- Para REPETICAO: só marque se a ideia já foi explicada antes e a repetição não traz nada novo.
- Não remova transições naturais de raciocínio, apenas redundâncias reais.
- Os timestamps devem estar dentro do intervalo desta parte da transcrição.
- Se realmente não houver nada a remover, retorne {{"desvios": []}}.
"""
).strip()

# D-332: scaffold magro que ainda pedia `revisoes`/[REVISÁVEL] (era D-330),
# superado pela revogação da revisão automática. Congelado byte-a-byte.
_TRECHOS_V2_COM_REVISAO = (
    """
{cabecalho_parte}{cabecalho_meta}=== TRANSCRIÇÃO DO CORTE (timestamp absoluto — fala) ===
{texto_transcricao}
=== FIM DA TRANSCRIÇÃO ===

Marque agora os trechos a remover (a chave `desvios`) e, quando algum desvio [REVISÁVEL] estiver errado, as `revisoes` — em JSON puro, seguindo exatamente o formato e as regras da sua expertise acima. Use timestamps ABSOLUTOS do vídeo original, dentro do intervalo do corte.
"""
).strip()

# Scaffolds concretos superados por skill_key (a linha da tabela onde o scaffold
# é guardado). Só `trechos-expert` tem entrada — cortes/cenas/thumbnail/resumo
# não sofreram esta correção.
SCAFFOLDS_SUPERADOS: dict[str, tuple[str, ...]] = {
    "trechos-expert": (_TRECHOS_V1, _TRECHOS_V2_COM_REVISAO),
}
