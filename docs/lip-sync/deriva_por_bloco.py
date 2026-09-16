"""O offset ANDA ao longo da live? Empilha por bloco de tempo. (D-602)"""
import glob, os, sys
import numpy as np

FPS = 30
LAGS = np.arange(-30, 31)
z = lambda v: (v - v.mean()) / (v.std() + 1e-9)


def curva(vis, aud):
    vis, aud = z(vis), z(aud)
    r = []
    for k in LAGS:
        a = aud[k:] if k >= 0 else aud[:k]
        v = vis[:len(a)] if k >= 0 else vis[-len(a):]
        r.append(float(np.dot(z(v), z(a)) / len(a)))
    return np.array(r)


itens = []
for f in glob.glob(f"{sys.argv[1]}/*.npz"):
    t = int(os.path.basename(f)[:-4])
    d = np.load(f)
    vis, rms = d["visual"], d["rms"]
    itens.append((t, curva(vis, np.abs(np.diff(rms))[:len(vis)])))
itens.sort()
tempos = np.array([t for t, _ in itens])
curvas = np.array([c for _, c in itens])


def pico(c):
    i = int(np.argmax(c))
    fora = c[np.abs(LAGS - LAGS[i]) > 5]
    return LAGS[i] * 1000 / FPS, c[i] / (fora.std() + 1e-9)


print("bloco                janelas   offset   pico/ruido")
for nome, mask in (
    ("live inteira", tempos >= 0),
    ("1a metade (300-2200s)", tempos <= 2200),
    ("2a metade (2400-5100s)", tempos > 2200),
    ("1o terco", tempos <= 1305),
    ("2o terco", (tempos > 1305) & (tempos <= 2770)),
    ("3o terco", tempos > 2770),
):
    n = int(mask.sum())
    ms, snr = pico(curvas[mask].mean(axis=0))
    print(f"{nome:<22} {n:>5}   {ms:>+6.0f}ms   {snr:>6.1f}x")

print("\nresolucao do metodo: 1 quadro = 33ms a 30fps")
print("desvio esperado por bloco de ~13 janelas: ~110ms (medido antes)")
