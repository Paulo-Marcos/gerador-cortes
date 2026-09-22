"""Onde ha fala continua? Le os timestamps por PALAVRA do VTT. (D-602)"""
import re, sys
import numpy as np

VTT = sys.argv[1]
JAN = int(sys.argv[2]) if len(sys.argv) > 2 else 20

def segundos(hms):
    h, m, s = hms.split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)

texto = open(VTT, encoding="utf-8").read()
# <00:12:34.560> marca o inicio de cada palavra dentro da legenda
palavras = sorted({segundos(t) for t in re.findall(r"<(\d\d:\d\d:\d\d\.\d\d\d)>", texto)})
print(f"palavras com tempo: {len(palavras)}  ({palavras[0]:.0f}s .. {palavras[-1]:.0f}s)")

p = np.array(palavras)
dur = int(p[-1]) + 1
# densidade: quantas palavras comecam dentro de cada janela deslizante
inicios = np.arange(0, dur - JAN, 5)
dens = np.array([((p >= i) & (p < i + JAN)).sum() for i in inicios])
print(f"densidade: mediana {np.median(dens):.0f} palavras/{JAN}s, max {dens.max()}")

# as melhores janelas, sem se sobrepor
ordem = np.argsort(-dens)
escolhidas = []
for i in ordem:
    t = int(inicios[i])
    if all(abs(t - e) >= JAN for e in escolhidas):
        escolhidas.append(t)
    if len(escolhidas) == 15:
        break
escolhidas.sort()
print("janelas mais faladas:", " ".join(str(t) for t in escolhidas))
