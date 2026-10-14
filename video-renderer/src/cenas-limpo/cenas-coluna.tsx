import { useState, type FC } from "react";
import { Img } from "remotion";
import type { CenaRemotion } from "../schema";
import { analisarNumeroDestaque, formatarNucleoDestaque } from "../cenas-v2/_shared/numeroFit";
import { inicialDoAutor } from "../cenas-v2/CenaPerguntaChat";
import { COR_DO_ACENTO, COR_DO_FUNDO } from "../youtube-bg/palco-limpo";
import { Bloco, GIZ_55, GIZ_85, Kicker, TIPO, linhasDoBloco } from "./Bloco";
import { progressoDoSublinhado, valorDaContagem } from "./movimento";
import { useTempoDaCena } from "./tempo-da-cena";
import { Enquadramento, estaNaZona } from "./Enquadramento";

// D-916: as cenas de COLUNA no estilo limpo (canvas "Catálogo A"). Cada uma é
// o Bloco com os campos que o tipo já tem — o mesmo conteúdo das cenas de
// sempre, sem caixa alta forçada, sem HUD e sem mascote.

type Cena = { cena: CenaRemotion };

/** Junta os pedaços que existem com " · ", como os rodapés do catálogo. */
export const juntos = (...partes: (string | undefined | null)[]): string =>
  partes.map((p) => (p ?? "").trim()).filter(Boolean).join(" · ");

export const CenaCardLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <Bloco kicker={cena.contexto || "Contexto"} titulo={cena.texto} corpo={cena.subtexto} />
  </Enquadramento>
);

export const CenaDefinicaoLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <Bloco
      kicker="Definição"
      titulo={cena.texto}
      tituloStyle={{ fontSize: 56, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em" }}
      corpo={cena.contexto}
      rodape={cena.subtexto}
      gap={14}
    />
  </Enquadramento>
);

export const CenaPerguntaLimpo: FC<Cena> = ({ cena }) => {
  const pergunta = (cena.texto ?? "").replace(/\?\s*$/, "");
  return (
    <Enquadramento cena={cena}>
      <Bloco
        kicker={cena.contexto || "Pergunta"}
        titulo={
          <>
            {pergunta}
            <span style={{ color: COR_DO_ACENTO }}>?</span>
          </>
        }
        tituloStyle={{ fontSize: 44, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.03em" }}
        corpo={cena.subtexto}
        gap={14}
      />
    </Enquadramento>
  );
};

const Retrato: FC<{ url?: string }> = ({ url }) =>
  url ? (
    <Img src={url} style={{ width: 112, height: 112, borderRadius: 12, objectFit: "cover", objectPosition: "center top" }} />
  ) : null;

export const CenaFichaLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <Bloco
      antes={<Retrato url={cena.retrato_url} />}
      kicker={juntos(cena.ano, cena.subtexto) || "Ficha"}
      titulo={cena.texto}
      tituloStyle={{ fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em" }}
      corpo={cena.contexto}
      rodape={juntos(cena.obra, cena.fonte)}
      largura={400}
      gap={14}
    />
  </Enquadramento>
);

export const CenaMarcoLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <Bloco
      kicker="Marco"
      antes={null}
      titulo={
        <>
          {cena.ano ? (
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.04em" }}>{cena.ano}</div>
          ) : null}
          <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2, marginTop: 12 }}>{cena.texto}</div>
        </>
      }
      corpo={cena.subtexto}
      rodape={juntos(cena.obra, cena.contexto)}
      gap={12}
    />
  </Enquadramento>
);

export const CenaCitacaoLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <Bloco
      antes={<div style={{ fontSize: 64, fontWeight: 800, lineHeight: 0.6, color: COR_DO_ACENTO, marginTop: 12 }}>“</div>}
      titulo={`${(cena.texto ?? "").replace(/^["“]|["”]$/g, "")}”`}
      tituloStyle={{ fontSize: 30, fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.015em" }}
      depois={
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {cena.autor ? <div style={{ fontSize: 20, fontWeight: 800 }}>{cena.autor}</div> : null}
          {juntos(cena.obra, cena.ano) ? <div style={{ ...TIPO.rodape, color: GIZ_55 }}>{juntos(cena.obra, cena.ano)}</div> : null}
        </div>
      }
      gap={10}
    />
  </Enquadramento>
);

/** O núcleo do número contando até o valor (D-918); sem núcleo único, o texto como veio. */
const NumeroContando: FC<{ bruto: string | number }> = ({ bruto }) => {
  const { quadro } = useTempoDaCena();
  const numero = analisarNumeroDestaque(bruto);
  if (numero.valor === null) return <>{numero.textoFinal}</>;
  return (
    <>
      {numero.prefixo}
      {formatarNucleoDestaque(valorDaContagem(quadro, numero.valor), numero)}
      {numero.sufixo ? <span style={{ fontSize: 48, color: COR_DO_ACENTO, letterSpacing: 0 }}>{numero.sufixo}</span> : null}
    </>
  );
};

export const CenaNumeroLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <Bloco
      kicker={cena.subtexto || "Dado"}
      titulo={
        <span style={{ fontSize: 120, fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.05em" }}>
          <NumeroContando bruto={cena.numero ?? cena.texto ?? ""} />
        </span>
      }
      corpo={cena.contexto}
      rodape={cena.fonte}
      gap={10}
    />
  </Enquadramento>
);

/** O sublinhado da ênfase: se desenha da esquerda para a direita em 8 quadros (D-918). */
const Sublinhado: FC = () => {
  const { quadro } = useTempoDaCena();
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: COR_DO_ACENTO,
        transformOrigin: "0 50%",
        transform: `scaleX(${progressoDoSublinhado(quadro)})`,
      }}
    />
  );
};

/** Ênfase: o traço vira sublinhado da palavra (canvas "Catálogo A", item 8). */
export const CenaEnfaseLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 400 }}>
      {linhasDoBloco([
        <Kicker key="k" cor={GIZ_55}>
          {cena.contexto || "A palavra é"}
        </Kicker>,
        <div key="p" style={{ display: "inline-flex", flexDirection: "column", gap: 10, alignSelf: "flex-start" }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.04em" }}>{cena.texto}</div>
          <Sublinhado />
        </div>,
        cena.subtexto ? (
          <div key="s" style={{ fontSize: 22, fontWeight: 500, color: GIZ_85 }}>
            {cena.subtexto}
          </div>
        ) : null,
      ])}
    </div>
  </Enquadramento>
);

const AvatarDoChat: FC<{ url?: string; autor: string; tamanho: number }> = ({ url, autor, tamanho }) => {
  // Arquivo que sumiu (limpeza da mídia) não derruba o render: vira a inicial.
  const [falhou, setFalhou] = useState(false);
  const circulo = { width: tamanho, height: tamanho, borderRadius: "50%", flex: "0 0 auto" } as const;
  if (url && !falhou) {
    return <Img src={url} maxRetries={1} onError={() => setFalhou(true)} style={{ ...circulo, objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        ...circulo,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Giz-areia com a inicial em grafite: o verde é só do sapo (canvas "Pergunta do chat").
        background: "linear-gradient(160deg, #cfc6b3, #8f877a)",
        color: COR_DO_FUNDO,
        fontSize: tamanho * 0.48,
        fontWeight: 800,
      }}
    >
      {inicialDoAutor(autor)}
    </div>
  );
};

const BalaoDoChat: FC = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden>
    <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
  </svg>
);

/** Pergunta do chat (D-910): um Bloco com avatar + @autor no lugar do título e a mensagem literal. */
export const CenaPerguntaChatLimpo: FC<Cena> = ({ cena }) => {
  const naZona = estaNaZona(cena);
  const autor = cena.autor ?? "";
  return (
    <Enquadramento cena={cena}>
      <Bloco
        largura={naZona ? 440 : 900}
        kicker={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <BalaoDoChat />
            Pergunta do chat
          </span>
        }
        antes={null}
        titulo={
          <div style={{ display: "flex", gap: naZona ? 16 : 22, alignItems: naZona ? "center" : "flex-start" }}>
            <AvatarDoChat url={cena.avatar_url} autor={autor} tamanho={naZona ? 64 : 84} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <div style={{ fontSize: naZona ? 24 : 26, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {autor}
              </div>
              {naZona ? null : <div style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.25 }}>{cena.texto}</div>}
            </div>
          </div>
        }
        depois={naZona ? <div style={{ fontSize: 30, fontWeight: 500, lineHeight: 1.28 }}>{cena.texto}</div> : null}
        gap={14}
      />
    </Enquadramento>
  );
};
