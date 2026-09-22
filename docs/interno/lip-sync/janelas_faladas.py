"""Duas alavancas, isoladas: escolher janelas FALADAS, e filtrar a banda de voz."""
import subprocess, sys, os
import numpy as np, cv2

VIDEO, TMP = sys.argv[1], sys.argv[2]
JANELAS = [int(t) for t in sys.argv[3].split(",")]
LP, AP, FPS, SR, JAN = 480, 270, 30, 16000, 20
cascata = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_alt2.xml")
z = lambda v: (v - v.mean()) / (v.std() + 1e-9)


def ff(t, args, saida):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-t", str(JAN),
                    "-i", VIDEO] + args + [saida], check=True)


def sinal_visual(t):
    ff(t, ["-an", "-vf", f"fps={FPS},scale={LP}:{AP},format=gray", "-f", "rawvideo"], f"{TMP}/p.gray")
    fr = np.fromfile(f"{TMP}/p.gray", dtype=np.uint8).reshape(-1, AP, LP)
    cx = [c for i in np.linspace(0, len(fr) - 1, 20, dtype=int)
          for c in cascata.detectMultiScale(fr[i], 1.1, 5, minSize=(30, 30))]
    if len(cx) < 8:
        return None, 0
    x, y, w, h = np.median(np.array(cx), axis=0).astype(int)
    boca = fr[:, y + int(h * .60): y + h, x: x + w].astype(np.float32)
    return np.abs(np.diff(boca, axis=0)).mean(axis=(1, 2)), len(cx)


def sinal_audio(t, banda_de_voz):
    filtro = ["-af", "highpass=f=300,lowpass=f=3400"] if banda_de_voz else []
    ff(t, ["-vn"] + filtro + ["-ac", "1", "-ar", str(SR), "-f", "s16le"], f"{TMP}/a.pcm")
    pcm = np.fromfile(f"{TMP}/a.pcm", dtype=np.int16).astype(np.float32)
    passo = SR // FPS
    n = len(pcm) // passo
    rms = np.array([np.sqrt((pcm[i * passo:(i + 1) * passo] ** 2).mean() + 1e-9) for i in range(n)])
    return np.abs(np.diff(rms))


def medir(vis, aud):
    m = min(len(vis), len(aud))
    vis, aud = z(vis[:m]), z(aud[:m])
    lags = np.arange(-30, 31)
    r = []
    for k in lags:
        a = aud[k:] if k >= 0 else aud[:k]
        v = vis[:len(a)] if k >= 0 else vis[-len(a):]
        r.append(float(np.dot(z(v), z(a)) / len(a)))
    r = np.array(r)
    i = int(np.argmax(r))
    return lags[i] * 1000 / FPS, r[i]


print(f"{'t':>7} {'rostos':>7} | {'largo':>17} | {'banda de voz':>17}")
bl, bv = [], []
for t in JANELAS:
    vis, nr = sinal_visual(t)
    if vis is None:
        print(f"{t:>6}s {nr:>7} | {'sem rosto':>17} |")
        continue
    ms1, r1 = medir(vis, sinal_audio(t, False))
    ms2, r2 = medir(vis, sinal_audio(t, True))
    if r1 >= .30: bl.append(ms1)
    if r2 >= .30: bv.append(ms2)
    m1 = "*" if r1 >= .30 else " "
    m2 = "*" if r2 >= .30 else " "
    print(f"{t:>6}s {nr:>7} | {ms1:>+7.0f}ms r={r1:.3f}{m1} | {ms2:>+7.0f}ms r={r2:.3f}{m2}")

for nome, b in (("largo", bl), ("banda de voz", bv)):
    a = np.array(b)
    s = f"{len(b)}/{len(JANELAS)}"
    extra = f"  mediana {np.median(a):+.0f}ms  desvio {a.std():.0f}ms" if len(b) else ""
    print(f"\n{nome:>13}: {s} confiaveis{extra}")
for f in ("p.gray", "a.pcm"):
    if os.path.exists(f"{TMP}/{f}"): os.remove(f"{TMP}/{f}")
