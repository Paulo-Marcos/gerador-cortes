"""Somar as curvas de correlacao em vez de votar nos picos. (D-602)"""
import glob, sys
import numpy as np

FPS = 30
z = lambda v: (v - v.mean()) / (v.std() + 1e-9)
LAGS = np.arange(-30, 31)


def curva(vis, aud):
    vis, aud = z(vis), z(aud)
    r = []
    for k in LAGS:
        a = aud[k:] if k >= 0 else aud[:k]
        v = vis[:len(a)] if k >= 0 else vis[-len(a):]
        r.append(float(np.dot(z(v), z(a)) / len(a)))
    return np.array(r)


def carregar(pasta):
    saida = []
    for f in sorted(glob.glob(f"{pasta}/*.npz"), key=lambda p: int(p.split("\\")[-1].split("/")[-1][:-4])):
        d = np.load(f)
        vis, rms = d["visual"], d["rms"]
        saida.append((vis, np.abs(np.diff(rms))))
    return saida


def pico(curva_media):
    i = int(np.argmax(curva_media))
    fora = curva_media[np.abs(LAGS - LAGS[i]) > 5]
    return LAGS[i] * 1000 / FPS, curva_media[i], curva_media[i] / (fora.std() + 1e-9)


sinais = carregar(sys.argv[1])
print(f"janelas: {len(sinais)} x 20s\n")

curvas = np.array([curva(v, a[:len(v)]) for v, a in sinais])
ms, alt, snr = pico(curvas.mean(axis=0))
print(f"empilhando as {len(sinais)} curvas → offset {ms:+.0f}ms  (altura {alt:.3f}, pico/ruido {snr:.1f}x)")

# quantas janelas bastam? estabilidade com subconjuntos
print("\nestabilidade (media de 40 sorteios por tamanho):")
rng = np.random.default_rng(7)
for n in (3, 5, 8, 12, 18, len(sinais)):
    vals = []
    for _ in range(40):
        idx = rng.choice(len(sinais), size=min(n, len(sinais)), replace=False)
        vals.append(pico(curvas[idx].mean(axis=0))[0])
    v = np.array(vals)
    print(f"  {n:>2} janelas → mediana {np.median(v):+7.0f}ms   desvio {v.std():6.0f}ms   "
          f"{'estavel' if v.std() <= 35 else ''}")

print("\ncontrole: atraso injetado vs. recuperado pelo empilhamento")
for inj in (0, -9, -3, 3, 9):
    cs = np.array([curva(v, np.roll(a[:len(v)], inj)) for v, a in sinais])
    ms_rec = pico(cs.mean(axis=0))[0]
    ms_inj = inj * 1000 / FPS
    erro = abs(ms_rec - ms_inj - (-133))
    print(f"  injetado {ms_inj:+7.0f}ms → {ms_rec:+7.0f}ms   {'ok' if erro <= 34 else 'ERRO'}")
