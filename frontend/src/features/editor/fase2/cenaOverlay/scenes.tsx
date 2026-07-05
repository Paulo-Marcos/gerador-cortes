/**
 * Cenas do CenaOverlay + roteador CenaStage (E-006).
 * Port fiel das cenas do Remotion; usa o kit de estilo compartilhado.
 */
import type { CenaRemotion } from '@/types/models';

import {
  C,
  cardBase,
  cluster,
  css,
  Mascote,
  STAGE_H,
  STAGE_W,
  textoTitulo,
} from './sceneKit';

function SceneTela({ cena }: { cena: CenaRemotion }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg,rgba(23,62,85,0.7) 0%,rgba(0,0,0,0.88) 100%)',
        }}
      />
      <div style={cluster('left:5%;top:18%;right:5%;gap:36px;')}>
        <Mascote tamanho={cena.mascotTamanho ?? 'grande'} mood={cena.mascotMood} />
        <div style={{ ...cardBase, flex: 1, padding: '48px 56px', borderRadius: 24 }}>
          <div
            style={{
              width: 350,
              height: 18,
              borderRadius: 3,
              background: `linear-gradient(90deg,${C.verdePrimario},${C.azulLagoa})`,
              marginBottom: 28,
            }}
          />
          <p style={textoTitulo(64, 900)}>{cena.texto}</p>
          {cena.subtexto && (
            <div style={{ marginTop: 32, display: 'flex', alignItems: 'center' }}>
              <div style={{ height: 2, width: 50, background: C.azulLagoa, marginRight: 16 }} />
              <p style={{ fontSize: 26, color: C.verdePrimario, margin: 0 }}>{cena.subtexto}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SceneBarra({ cena }: { cena: CenaRemotion }) {
  return (
    <div style={cluster('left:3%;bottom:12%;gap:16px;')}>
      <Mascote tamanho={cena.mascotTamanho ?? 'mini'} mood={cena.mascotMood} />
      <div style={{ width: 900, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 5,
            background: C.verdePrimario,
            borderRadius: 3,
          }}
        />
        <div
          style={css(
            'margin-left:18px;padding:20px 32px;background:linear-gradient(90deg,rgba(10,10,20,0.95) 0%,rgba(79,168,201,0.45) 60%,rgba(0,0,0,0) 100%);border-radius:0 12px 12px 0;',
          )}
        >
          <p style={textoTitulo(42, 800)}>{cena.texto}</p>
          {cena.subtexto && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
              <div style={{ height: 1, flex: 0.1, background: C.verdePrimario, marginRight: 10 }} />
              <p style={{ fontSize: 24, color: 'rgba(245,245,245,0.6)', margin: 0 }}>
                {cena.subtexto}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneCard({ cena }: { cena: CenaRemotion }) {
  return (
    <div style={cluster('left:3%;top:14%;gap:20px;')}>
      <Mascote tamanho={cena.mascotTamanho ?? 'pequeno'} mood={cena.mascotMood} />
      <div style={{ position: 'relative', width: 480 }}>
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            width: 40,
            height: 40,
            borderTop: `3px solid ${C.verdePrimario}`,
            borderLeft: `3px solid ${C.verdePrimario}`,
            borderRadius: '8px 0 0 0',
          }}
        />
        <div
          style={{
            ...cardBase,
            padding: '36px 40px',
            borderRadius: 16,
            background: 'rgba(15,15,30,0.95)',
          }}
        >
          {cena.icone && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                fontSize: 36,
                background: 'rgba(79,168,201,0.27)',
                borderRadius: 14,
                marginBottom: 20,
                border: `1px solid ${C.azulLagoa}`,
              }}
            >
              {cena.icone}
            </div>
          )}
          <p style={textoTitulo(44, 900)}>{cena.texto}</p>
          {cena.subtexto && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center' }}>
              <div style={{ height: 2, flex: 1, background: C.verdePrimario }} />
              <p style={{ fontSize: 24, color: 'rgba(245,245,245,0.7)', margin: '0 0 0 12px' }}>
                {cena.subtexto}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneDestaque({ cena }: { cena: CenaRemotion }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 50%, rgba(23,62,85,0.55) 0%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 320,
            height: 320,
            border: `2px solid ${C.verdePrimario}`,
            borderRadius: '50%',
            opacity: 0.2,
          }}
        />
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 180,
              fontWeight: 800,
              color: C.verdePrimario,
              margin: 0,
              lineHeight: 1,
              letterSpacing: '-8px',
              textShadow: `0 0 60px rgba(63,166,106,0.27), 0 10px 40px rgba(0,0,0,0.5)`,
            }}
          >
            {cena.numero ?? cena.texto ?? '0'}
          </p>
          {cena.subtexto && (
            <div
              style={{
                marginTop: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ height: 2, width: 30, background: C.azulLagoa, marginRight: 12 }} />
              <p
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  color: C.brancoNeve,
                  margin: 0,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                }}
              >
                {cena.subtexto}
              </p>
              <div style={{ height: 2, width: 30, background: C.azulLagoa, marginLeft: 12 }} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SceneComparativo({ cena }: { cena: CenaRemotion }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 50%, rgba(23,62,85,0.55) 0%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 60,
        }}
      >
        <p
          style={{
            fontSize: 60,
            fontWeight: 900,
            color: C.brancoNeve,
            margin: 0,
            textAlign: 'right',
            letterSpacing: -2,
          }}
        >
          {cena.texto}
        </p>
        <div
          style={{
            width: 6,
            height: 220,
            background: `linear-gradient(180deg,${C.verdePrimario} 0%,${C.azulLagoa} 100%)`,
            borderRadius: 3,
            boxShadow: '0 0 30px rgba(63,166,106,0.33)',
          }}
        />
        <p
          style={{
            fontSize: 60,
            fontWeight: 900,
            color: C.verdePrimario,
            margin: 0,
            textAlign: 'left',
            letterSpacing: -2,
          }}
        >
          {cena.subtexto}
        </p>
      </div>
    </>
  );
}

function ScenePergunta({ cena }: { cena: CenaRemotion }) {
  return (
    <div style={cluster('left:5%;top:16%;gap:24px;')}>
      <Mascote tamanho={cena.mascotTamanho ?? 'medio'} mood={cena.mascotMood} />
      <div
        style={{
          position: 'relative',
          width: 640,
          padding: '26px 32px',
          borderRadius: 20,
          background: `linear-gradient(135deg,${C.azulLagoa} 0%,${C.azulNoite} 100%)`,
          border: '1px solid rgba(63,166,106,0.33)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* calda do balão */}
        <div
          style={{
            position: 'absolute',
            left: -14,
            top: '50%',
            transform: 'translateY(-50%) rotate(45deg)',
            width: 28,
            height: 28,
            background: `linear-gradient(135deg,${C.azulLagoa} 0%,${C.azulNoite} 100%)`,
            borderBottom: '1px solid rgba(63,166,106,0.33)',
            borderLeft: '1px solid rgba(63,166,106,0.33)',
          }}
        />
        <div
          style={{
            width: 40,
            height: 4,
            background: C.ouroOlho,
            borderRadius: 2,
            marginBottom: 12,
            boxShadow: '0 0 12px rgba(255,217,61,0.6)',
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 14,
            letterSpacing: 1.5,
            color: C.ouroOlho,
            fontWeight: 700,
          }}
        >
          PERGUNTA
        </p>
        <p
          style={{
            margin: '10px 0 0 0',
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1.3,
            color: C.brancoNeve,
          }}
        >
          {cena.texto}
        </p>
      </div>
    </div>
  );
}

function SceneChamada({ cena }: { cena: CenaRemotion }) {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 48,
        }}
      >
        <Mascote tamanho={cena.mascotTamanho ?? 'grande'} mood={cena.mascotMood} />
        <div style={{ textAlign: 'center' }}>
          {cena.icone && (
            <p
              style={{
                fontSize: 72,
                margin: '0 0 20px 0',
                filter: 'drop-shadow(0 0 20px rgba(63,166,106,0.53))',
              }}
            >
              {cena.icone}
            </p>
          )}
          <p style={{ ...textoTitulo(60, 900), textAlign: 'center' }}>{cena.texto}</p>
          {cena.subtexto && (
            <div
              style={{
                marginTop: 32,
                display: 'inline-flex',
                padding: '16px 48px',
                background: C.verdePrimario,
                borderRadius: 50,
                boxShadow: '0 0 50px rgba(63,166,106,0.4)',
              }}
            >
              <p
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: C.brancoNeve,
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: 3,
                }}
              >
                {cena.subtexto}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SceneFicha({ cena }: { cena: CenaRemotion }) {
  const nome = cena.nome_curto ?? cena.texto;
  return (
    <div style={cluster('left:3%;top:16%;gap:22px;')}>
      <Mascote tamanho={cena.mascotTamanho ?? 'pequeno'} mood={cena.mascotMood} />
      <div style={{ width: 520 }}>
        <div
          style={{
            height: 3,
            width: '100%',
            background: `linear-gradient(90deg,${C.verdePrimario} 0%,${C.azulLagoa} 100%)`,
            marginBottom: 4,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            padding: '24px 32px',
            background: 'rgba(10,10,20,0.92)',
            borderRadius: '0 0 16px 16px',
            borderLeft: `4px solid ${C.verdePrimario}`,
          }}
        >
          <p style={textoTitulo(nome && nome.length > 26 ? 32 : 40, 800)}>{nome}</p>
          {cena.subtexto && (
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
              <div style={{ width: 20, height: 2, background: C.azulLagoa, marginRight: 8 }} />
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.verdePrimario,
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {cena.subtexto}
              </p>
            </div>
          )}
          {cena.contexto && (
            <p
              style={{
                fontSize: 19,
                color: 'rgba(245,245,245,0.6)',
                margin: '12px 0 0 0',
                fontStyle: 'italic',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: 10,
              }}
            >
              {cena.contexto}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneMarco({ cena }: { cena: CenaRemotion }) {
  return (
    <div style={cluster('left:5%;top:12%;gap:24px;')}>
      <Mascote tamanho={cena.mascotTamanho ?? 'pequeno'} mood={cena.mascotMood} />
      <div style={{ width: 760 }}>
        <div style={{ ...cardBase, padding: '26px 34px', borderRadius: 18 }}>
          <div
            style={{
              width: 200,
              height: 6,
              borderRadius: 2,
              marginBottom: 16,
              background: `linear-gradient(90deg,${C.verdePrimario},${C.azulLagoa})`,
              boxShadow: '0 0 15px rgba(63,166,106,0.3)',
            }}
          />
          <p style={{ ...textoTitulo(36, 800), marginLeft: '10%' }}>{cena.texto}</p>
          {cena.subtexto && (
            <p
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: C.verdePrimario,
                margin: '12px 0 0 10%',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {cena.subtexto}
            </p>
          )}
          {cena.contexto && (
            <div
              style={{
                margin: '16px 0 0 10%',
                paddingLeft: 14,
                borderLeft: `3px solid ${C.azulLagoa}`,
              }}
            >
              <p
                style={{
                  fontSize: 26,
                  color: 'rgba(245,245,245,0.75)',
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {cena.contexto}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SceneCitacao({ cena }: { cena: CenaRemotion }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 50%, rgba(23,62,85,0.6) 0%, rgba(0,0,0,0.92) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: '8%',
          fontSize: 280,
          lineHeight: 1,
          fontFamily: "'Lora', serif",
          color: C.ouroOlho,
          opacity: 0.85,
          textShadow: '0 0 40px rgba(255,217,61,0.4)',
        }}
      >
        "
      </div>
      <div style={{ position: 'absolute', top: '28%', left: '12%', right: '12%' }}>
        <p
          style={{
            fontFamily: "'Lora', serif",
            fontSize: 56,
            fontWeight: 500,
            fontStyle: 'italic',
            color: C.brancoNeve,
            margin: 0,
            lineHeight: 1.25,
            letterSpacing: '-0.5px',
          }}
        >
          {cena.texto}
        </p>
        {(cena.autor || cena.obra) && (
          <div style={{ marginTop: 36, display: 'flex', alignItems: 'center', gap: 20 }}>
            <Mascote tamanho={cena.mascotTamanho ?? 'mini'} mood={cena.mascotMood} />
            <div
              style={{
                width: 60,
                height: 2,
                background: `linear-gradient(90deg,${C.verdePrimario},transparent)`,
              }}
            />
            <div>
              {cena.autor && (
                <p
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: C.verdePrimario,
                    margin: 0,
                    letterSpacing: 0.5,
                  }}
                >
                  {cena.autor}
                </p>
              )}
              {(cena.obra || cena.ano) && (
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 18,
                    color: 'rgba(245,245,245,0.6)',
                    margin: '4px 0 0 0',
                    letterSpacing: 1,
                  }}
                >
                  {[cena.obra, cena.ano].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SceneLinhaTempo({ cena }: { cena: CenaRemotion }) {
  const marcos = (cena.marcos ?? []).slice(0, 5);
  const total = marcos.length;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 50%, rgba(23,62,85,0.55) 0%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      {cena.texto && (
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          <Mascote tamanho={cena.mascotTamanho ?? 'mini'} mood={cena.mascotMood} />
          <div style={{ textAlign: 'left' }}>
            <p
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: C.verdePrimario,
                letterSpacing: 4,
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              LINHA DO TEMPO
            </p>
            <p
              style={{
                fontSize: 42,
                fontWeight: 800,
                color: C.brancoNeve,
                margin: '4px 0 0 0',
                letterSpacing: -1,
              }}
            >
              {cena.texto}
            </p>
          </div>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '9%',
          right: '9%',
          height: 240,
          transform: 'translateY(-50%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 2,
            background: 'rgba(255,255,255,0.08)',
            transform: 'translateY(-50%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            height: 4,
            width: '100%',
            background: `linear-gradient(90deg,${C.verdePrimario},${C.azulLagoa})`,
            borderRadius: 2,
            transform: 'translateY(-50%)',
            boxShadow: '0 0 18px rgba(63,166,106,0.45)',
          }}
        />
        {marcos.map((m, i) => {
          const xPct = total === 1 ? 50 : (i / (total - 1)) * 100;
          const acima = i % 2 === 0;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: '50%',
                left: `${xPct}%`,
                transform: 'translate(-50%,-50%)',
                width: 220,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: C.ouroOlho,
                  border: `3px solid ${C.brancoNeve}`,
                  transform: 'translate(-50%,-50%)',
                  boxShadow: '0 0 12px rgba(255,217,61,0.6)',
                  zIndex: 2,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  ...(acima ? { bottom: 28 } : { top: 28 }),
                  textAlign: 'center',
                  width: 210,
                }}
              >
                <p
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 22,
                    fontWeight: 700,
                    color: C.ouroOlho,
                    margin: 0,
                    letterSpacing: 1,
                  }}
                >
                  {m.data}
                </p>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: C.brancoNeve,
                    margin: '4px 0 0 0',
                    lineHeight: 1.15,
                  }}
                >
                  {m.titulo}
                </p>
                {m.detalhe && (
                  <p
                    style={{
                      fontSize: 14,
                      color: 'rgba(245,245,245,0.6)',
                      margin: '4px 0 0 0',
                      lineHeight: 1.2,
                    }}
                  >
                    {m.detalhe}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SceneDefinicao({ cena }: { cena: CenaRemotion }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg,rgba(23,62,85,0.7) 0%,rgba(0,0,0,0.88) 100%)',
        }}
      />
      <div style={cluster('left:5%;top:16%;gap:28px;')}>
        <Mascote tamanho={cena.mascotTamanho ?? 'pequeno'} mood={cena.mascotMood} />
        <div style={{ maxWidth: 1100 }}>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 16,
              fontWeight: 600,
              color: C.verdePrimario,
              letterSpacing: 4,
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            DEFINIÇÃO
          </p>
          <p
            style={{
              fontSize: 96,
              fontWeight: 900,
              color: C.brancoNeve,
              margin: '8px 0 0 0',
              lineHeight: 1,
              letterSpacing: -3,
            }}
          >
            {cena.texto}
          </p>
          {cena.subtexto && (
            <p
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 22,
                color: C.ouroOlho,
                margin: '12px 0 0 0',
                fontStyle: 'italic',
                letterSpacing: 0.5,
              }}
            >
              {cena.subtexto}
            </p>
          )}
          <div
            style={{
              marginTop: 24,
              height: 3,
              width: 120,
              background: `linear-gradient(90deg,${C.verdePrimario},${C.azulLagoa})`,
              borderRadius: 2,
              boxShadow: '0 0 18px rgba(63,166,106,0.45)',
            }}
          />
          {cena.contexto && (
            <p
              style={{
                fontFamily: "'Lora', serif",
                fontSize: 32,
                fontWeight: 400,
                color: C.brancoNeve,
                margin: '28px 0 0 0',
                lineHeight: 1.4,
                maxWidth: 900,
              }}
            >
              {cena.contexto}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function SceneFonte({ cena }: { cena: CenaRemotion }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 48,
        right: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        borderRadius: 12,
        background: 'rgba(10,10,20,0.78)',
        border: '1px solid rgba(63,166,106,0.33)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
        maxWidth: 720,
      }}
    >
      <div
        style={{
          fontFamily: "'Lora', serif",
          fontSize: 24,
          fontWeight: 700,
          color: C.ouroOlho,
          lineHeight: 1,
        }}
      >
        §
      </div>
      <div style={{ width: 1, height: 26, background: 'rgba(63,166,106,0.4)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            color: C.verdePrimario,
            letterSpacing: 2.5,
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          FONTE
        </p>
        <p
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: C.brancoNeve,
            margin: 0,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cena.fonte ?? cena.texto}
        </p>
        {cena.subtexto && (
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: 'rgba(245,245,245,0.6)',
              margin: '2px 0 0 0',
              letterSpacing: 0.5,
            }}
          >
            {cena.subtexto}
          </p>
        )}
      </div>
    </div>
  );
}

function SceneLista({ cena }: { cena: CenaRemotion }) {
  const itens = (cena.itens ?? []).slice(0, 5);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg,rgba(23,62,85,0.7) 0%,rgba(0,0,0,0.88) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: '8%',
          right: '8%',
          bottom: '8%',
          display: 'flex',
          alignItems: 'center',
          gap: 32,
        }}
      >
        <Mascote tamanho={cena.mascotTamanho ?? 'medio'} mood={cena.mascotMood} />
        <div style={{ flex: 1 }}>
          {cena.texto && (
            <div style={{ marginBottom: 28 }}>
              <p
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 16,
                  fontWeight: 600,
                  color: C.verdePrimario,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                  margin: 0,
                }}
              >
                {itens.length} PONTOS
              </p>
              <p
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  color: C.brancoNeve,
                  margin: '8px 0 0 0',
                  lineHeight: 1.05,
                  letterSpacing: -1.5,
                }}
              >
                {cena.texto}
              </p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {itens.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: 64,
                    height: 64,
                    borderRadius: 14,
                    background: `linear-gradient(135deg,${C.verdePrimario} 0%,${C.verdeProfundo} 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 32,
                    fontWeight: 800,
                    color: C.brancoNeve,
                    boxShadow: '0 0 20px rgba(63,166,106,0.33)',
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 1, paddingTop: 6 }}>
                  <p
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      color: C.brancoNeve,
                      margin: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    {item.titulo}
                  </p>
                  {item.detalhe && (
                    <p
                      style={{
                        fontFamily: "'Lora', serif",
                        fontSize: 19,
                        fontWeight: 400,
                        fontStyle: 'italic',
                        color: 'rgba(245,245,245,0.6)',
                        margin: '4px 0 0 0',
                        lineHeight: 1.3,
                      }}
                    >
                      {item.detalhe}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function SceneImagem({ cena }: { cena: CenaRemotion }) {
  return (
    <>
      {cena.url ? (
        <img
          src={cena.url}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            background: '#000',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#111',
          }}
        >
          <p style={{ fontSize: 40, color: 'rgba(245,245,245,0.3)', margin: 0 }}>🖼️</p>
        </div>
      )}
      {cena.texto && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '32px 48px',
            background: 'linear-gradient(0deg,rgba(0,0,0,0.85) 0%,transparent 100%)',
          }}
        >
          <p style={textoTitulo(44, 700)}>{cena.texto}</p>
          {cena.subtexto && (
            <p style={{ fontSize: 26, color: 'rgba(245,245,245,0.7)', margin: '8px 0 0 0' }}>
              {cena.subtexto}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function SceneDesconhecida({ cena }: { cena: CenaRemotion }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%,-50%)',
        padding: '24px 32px',
        border: `2px dashed rgba(63,166,106,0.6)`,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.6)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          color: C.verdePrimario,
          fontSize: 14,
          fontWeight: 800,
          textTransform: 'uppercase',
          margin: '0 0 8px 0',
          letterSpacing: 2,
        }}
      >
        Tipo desconhecido
      </p>
      <p style={{ color: C.brancoNeve, fontSize: 24, margin: 0 }}>{cena.tipo}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage + roteador principal
// ---------------------------------------------------------------------------

export function CenaStage({
  cena,
  scale,
  offsetX,
  offsetY,
}: {
  cena: CenaRemotion;
  scale: number;
  offsetX: number;
  offsetY: number;
}) {
  function inner() {
    switch (cena.tipo) {
      case 'tela_cheia':
        return <SceneTela cena={cena} />;
      case 'barra_inferior':
        return <SceneBarra cena={cena} />;
      case 'card_informacao':
        return <SceneCard cena={cena} />;
      case 'destaque_numerico':
        return <SceneDestaque cena={cena} />;
      case 'comparativo_contraponto':
      case 'comparativo_enfase':
        return <SceneComparativo cena={cena} />;
      case 'enfase':
        return <SceneTela cena={cena} />;
      case 'pergunta_transicao':
        return <ScenePergunta cena={cena} />;
      case 'chamada_final':
        return <SceneChamada cena={cena} />;
      case 'ficha_biografica':
        return <SceneFicha cena={cena} />;
      case 'marco_historico':
        return <SceneMarco cena={cena} />;
      case 'citacao_autor':
        return <SceneCitacao cena={cena} />;
      case 'linha_tempo':
        return <SceneLinhaTempo cena={cena} />;
      case 'definicao_termo':
        return <SceneDefinicao cena={cena} />;
      case 'fonte_referencia':
        return <SceneFonte cena={cena} />;
      case 'lista_enumerada':
        return <SceneLista cena={cena} />;
      case 'mostrar_imagem':
        return <SceneImagem cena={cena} />;
      default:
        return <SceneDesconhecida cena={cena} />;
    }
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: offsetY,
        left: offsetX,
        width: STAGE_W,
        height: STAGE_H,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
      }}
    >
      {inner()}
    </div>
  );
}
