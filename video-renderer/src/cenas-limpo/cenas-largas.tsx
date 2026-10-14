import type { FC } from "react";
import type { CenaRemotion } from "../schema";
import { Mascote } from "../Mascote";
import { COR_DO_ACENTO } from "../youtube-bg/palco-limpo";
import { Bloco, COLUNA, GIZ_35, GIZ_55, Kicker, TIPO, Traco, linhasDoBloco } from "./Bloco";
import { Enquadramento, QuadroInteiro, estaNaZona } from "./Enquadramento";

// D-916: as cenas LARGAS, de quadro e de rodapé no estilo limpo (canvas
// "Catálogo B"). Na coluna do palco compartilhado elas encolhem para 440 —
// comparativo empilhado, linha do tempo em lista — porque a zona do corte é
// estreita; sobre o vídeo cheio usam a largura do catálogo.

type Cena = { cena: CenaRemotion };

const Lado: FC<{ rotulo: string; texto?: string; corpo?: string; principal: boolean; largura: number }> = ({
  rotulo,
  texto,
  corpo,
  principal,
  largura,
}) => (
  <Bloco
    largura={largura}
    corDoTraco={principal ? COR_DO_ACENTO : GIZ_35}
    corDoKicker={principal ? COR_DO_ACENTO : GIZ_55}
    kicker={rotulo}
    titulo={texto}
    tituloStyle={{ fontSize: 36, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" }}
    corpo={corpo}
    gap={12}
  />
);

/** Comparativo: o lado A no acento, o lado B em giz a 35%, com "vs" entre eles. */
export const CenaComparativoLimpo: FC<Cena> = ({ cena }) => {
  const naZona = estaNaZona(cena);
  const rotuloA = cena.rotuloA || cena.contexto || "Lado A";
  const rotuloB = cena.rotuloB || "Lado B";
  const vs = <div style={{ fontSize: 20, fontWeight: 800, color: GIZ_35, padding: naZona ? "0 0 0 34px" : "60px 0 0" }}>vs</div>;
  return (
    <Enquadramento cena={cena}>
      <div style={{ display: "flex", flexDirection: naZona ? "column" : "row", gap: naZona ? 20 : 40, alignItems: "flex-start" }}>
        <Lado rotulo={rotuloA} texto={cena.texto} principal largura={naZona ? COLUNA : 420} />
        {vs}
        <Lado rotulo={rotuloB} texto={cena.subtexto} principal={false} largura={naZona ? COLUNA : 420} />
      </div>
    </Enquadramento>
  );
};

/** Lista: os números são o traço. */
export const CenaListaLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <div style={{ display: "flex", flexDirection: "column", gap: 22, width: COLUNA }}>
      {linhasDoBloco([
        cena.texto ? <Kicker key="k">{cena.texto}</Kicker> : null,
        ...(cena.itens ?? []).slice(0, 5).map((item, i) => (
        <div key={`${i}-${item.titulo}`} style={{ display: "flex", gap: 22 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COR_DO_ACENTO, width: 36, paddingTop: 6, flex: "0 0 auto" }}>
            {String(i + 1).padStart(2, "0")}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{item.titulo}</div>
            {item.detalhe ? <div style={{ fontSize: 20, fontWeight: 500, color: "rgba(243,242,238,0.7)", marginTop: 4 }}>{item.detalhe}</div> : null}
          </div>
        </div>
        )),
      ])}
    </div>
  </Enquadramento>
);

/** Linha do tempo: o traço vira trilho de 2 px com pontos no acento (o último em giz). */
export const CenaLinhaTempoLimpo: FC<Cena> = ({ cena }) => {
  const naZona = estaNaZona(cena);
  const marcos = (cena.marcos ?? []).slice(0, 5);
  return (
    <Enquadramento cena={cena}>
      <div style={{ width: naZona ? COLUNA : 1100, display: "flex", flexDirection: "column", gap: 24 }}>
        {cena.texto ? <Kicker>{cena.texto}</Kicker> : null}
        <div style={{ position: "relative", paddingTop: naZona ? 0 : 24, paddingLeft: naZona ? 24 : 0 }}>
          <div style={{ position: "absolute", background: "rgba(243,242,238,0.25)", ...(naZona ? { left: 5, top: 0, bottom: 0, width: 2 } : { left: 0, right: 0, top: 10, height: 2 }) }} />
          <div style={{ display: "grid", gap: 24, gridTemplateColumns: naZona ? "1fr" : `repeat(${Math.max(1, marcos.length)}, minmax(0, 1fr))` }}>
            {marcos.map((marco, i) => {
              const ultimo = i === marcos.length - 1 && marcos.length > 2;
              return (
                <div key={`${i}-${marco.data}`} style={{ position: "relative", color: ultimo ? GIZ_55 : undefined }}>
                  <div style={{ position: "absolute", width: 12, height: 12, borderRadius: "50%", background: ultimo ? GIZ_35 : COR_DO_ACENTO, ...(naZona ? { left: -24, top: 10 } : { left: 0, top: -20 }) }} />
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{marco.data}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>{marco.titulo}</div>
                  {marco.detalhe ? <div style={{ fontSize: 16, color: GIZ_55, marginTop: 4 }}>{marco.detalhe}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Enquadramento>
  );
};

/** Fonte: um rodapé pequeno, traço de 4 px. */
export const CenaFonteLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <div style={{ display: "flex", gap: 16, alignItems: "center", width: 360 }}>
      <Traco espessura={4} />
      <div>
        {linhasDoBloco([
          <div key="f">
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 3, color: COR_DO_ACENTO }}>FONTE</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: "rgba(243,242,238,0.7)" }}>{cena.fonte ?? cena.texto}</div>
            {cena.subtexto ? <div style={{ ...TIPO.rodape, fontSize: 16, color: GIZ_55 }}>{cena.subtexto}</div> : null}
          </div>,
        ])}
      </div>
    </div>
  </Enquadramento>
);

/** Barra inferior: nome e papel de quem fala, no rodapé, com o papel no acento. */
export const CenaBarraInferiorLimpo: FC<Cena> = ({ cena }) => (
  <Enquadramento cena={cena}>
    <div style={{ display: "flex", gap: 20, width: COLUNA }}>
      <Traco espessura={4} />
      <div>
        {linhasDoBloco([
          <div key="n" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {cena.texto}
          </div>,
          cena.subtexto ? (
            <div key="p" style={{ fontSize: 20, fontWeight: 600, color: COR_DO_ACENTO }}>
              {cena.subtexto}
            </div>
          ) : null,
        ])}
      </div>
    </div>
  </Enquadramento>
);

/** Tese: o quadro inteiro sob um scrim de 60%, o texto no centro. */
export const CenaTelaCheiaLimpo: FC<Cena> = ({ cena }) => {
  if (estaNaZona(cena)) {
    return (
      <Enquadramento cena={cena}>
        <Bloco kicker={cena.contexto || "A tese"} titulo={cena.texto} corpo={cena.subtexto} />
      </Enquadramento>
    );
  }
  return (
    <QuadroInteiro cena={cena} opacidade={0.6}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 20, maxWidth: 1200 }}>
        {linhasDoBloco([
          <Kicker key="k">{cena.contexto || "A tese"}</Kicker>,
          <div key="t" style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.03em" }}>
            {cena.texto}
          </div>,
          cena.subtexto ? (
            <div key="s" style={{ ...TIPO.corpo, fontSize: 32 }}>
              {cena.subtexto}
            </div>
          ) : null,
        ])}
      </div>
    </QuadroInteiro>
  );
};

/** Chamada final: scrim de 70% e o sapo — a única cena em que ele cresce. */
export const CenaChamadaFinalLimpo: FC<Cena> = ({ cena }) => {
  const texto = cena.texto || "A live completa está no canal";
  if (estaNaZona(cena)) {
    return (
      <Enquadramento cena={cena}>
        <Bloco kicker={cena.contexto || "Até aqui"} titulo={texto} corpo={cena.subtexto} />
      </Enquadramento>
    );
  }
  return (
    <QuadroInteiro cena={cena} opacidade={0.7}>
      <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
        <Mascote mood={cena.mascotMood || "animado"} tamanho="pequeno" />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 900 }}>
          {linhasDoBloco([
            <div key="t" style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              {texto}
            </div>,
            cena.subtexto ? (
              <div key="s" style={{ fontSize: 30, fontWeight: 700, color: COR_DO_ACENTO }}>
                {cena.subtexto}
              </div>
            ) : null,
          ])}
        </div>
      </div>
    </QuadroInteiro>
  );
};
