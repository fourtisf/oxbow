"""
The Oxbow intro's soundtrack, synthesized (no samples, nothing licensed):
an ambient pad over Am - F - C - G, a sub bass, a soft pulse and a bell
arpeggio once the features start, noise swells into each scene change, a low
impact under the logo and the outro, all through one reverb.

    python3 scripts/video/music.py out.wav

Scene changes must match SCENES in intro.html.
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 50.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)

# Scene changes, from intro.html.
CUTS = [5.0, 10.0, 17.0, 24.0, 31.6, 36.5, 42.0, 46.0]


def note(n):
    """MIDI note to Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def env(start, attack, hold, release):
    """Linear attack, hold, then a squared release, as a full-length array (any start, even before 0)."""
    x = t - start
    e = np.clip(x / attack, 0, 1)
    tail = (1 - np.clip((x - attack - hold) / release, 0, 1)) ** 2
    e = np.where(x > attack + hold, tail, e)
    return np.where(x < 0, 0.0, e)


def spectral(sig, lo=None, hi=None, slope=1.0):
    """Band-limits `sig` in the frequency domain with soft edges."""
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    S = np.fft.rfft(sig)
    g = np.ones_like(f)
    if hi:
        g *= 1 / (1 + (f / hi) ** (4 * slope))
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1)) ** (4 * slope))
    return np.fft.irfft(S * g, len(sig))


def pad_voice(freq, e, detune=0.004):
    """A soft, slightly detuned stack of sines with a few harmonics."""
    out = np.zeros(N)
    for d in (-detune, 0, detune):
        f = freq * (1 + d)
        ph = rng.uniform(0, 2 * np.pi)
        for h, amp in ((1, 1.0), (2, 0.35), (3, 0.15), (4, 0.06)):
            out += amp * np.sin(2 * np.pi * f * h * t + ph * h)
    return out * e


# Am - F - C - G, two bars each at 96 bpm (5 s), looping; voicings low and open.
CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [55, 60, 64, 67], [55, 59, 62, 67]]
ROOTS = [45, 41, 48, 43]
CHORD_LEN = 5.0

pad = np.zeros(N)
bass = np.zeros(N)
for i in range(int(DUR / CHORD_LEN) + 1):
    start = i * CHORD_LEN
    c = CHORDS[i % 4]
    e = env(start - 0.4, 1.6, CHORD_LEN - 1.2, 2.2)
    for n in c:
        pad += pad_voice(note(n), e) / len(c)
    be = env(start, 0.8, CHORD_LEN - 1.0, 1.4)
    bass += np.sin(2 * np.pi * note(ROOTS[i % 4] - 12) * t) * be
pad = spectral(pad, lo=110, hi=5200)
# Air: the chord an octave up, quiet and bright.
air = np.zeros(N)
for i in range(int(DUR / CHORD_LEN) + 1):
    e = env(i * CHORD_LEN - 0.4, 2.0, CHORD_LEN - 1.6, 2.4)
    for n in CHORDS[i % 4][1:]:
        air += np.sin(2 * np.pi * note(n + 24) * t + rng.uniform(0, 6.28)) * e
pad += 0.12 * spectral(air, lo=800, hi=9000) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.17 * t))
# Slow movement.
pad *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t)

# Pulse: a soft low thump every beat once the features start, with a short hat on the offbeats.
BEAT = 60 / 96
pulse = np.zeros(N)
hats = np.zeros(N)
thump_len = int(0.35 * SR)
tt = np.arange(thump_len) / SR
thump = np.sin(2 * np.pi * (52 + 40 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
hat_len = int(0.06 * SR)
hat = spectral(rng.normal(0, 1, hat_len), lo=6000) * np.exp(-np.arange(hat_len) / SR * 70)
b = 10.0
while b < 45.5:
    i0 = int(b * SR)
    if i0 + thump_len < N:
        pulse[i0:i0 + thump_len] += thump
    h0 = int((b + BEAT / 2) * SR)
    if 17.0 <= b < 42.0 and h0 + hat_len < N:
        hats[h0:h0 + hat_len] += hat
    b += BEAT

# Bell arpeggio over the chords, eighth notes, from the feed scene to the keys scene.
bells = np.zeros(N)
bell_len = int(1.6 * SR)
bt = np.arange(bell_len) / SR
step = BEAT / 2
k = 0
x = 10.0
while x < 42.0:
    c = CHORDS[int(x // CHORD_LEN) % 4]
    pattern = [c[0] + 12, c[2] + 12, c[3] + 12, c[1] + 24, c[2] + 12, c[3] + 12, c[1] + 12, c[2] + 24]
    f = note(pattern[k % len(pattern)])
    tone = (np.sin(2 * np.pi * f * bt) + 0.25 * np.sin(2 * np.pi * f * 2.01 * bt) + 0.08 * np.sin(2 * np.pi * f * 3.98 * bt)) * np.exp(-bt * 4.2)
    i0 = int(x * SR)
    end = min(N, i0 + bell_len)
    bells[i0:end] += tone[: end - i0] * (0.7 if k % 2 else 1.0)
    k += 1
    x += step
bells *= np.clip((t - 10) / 2.5, 0, 1)  # fades in

# Swells into each scene change, and impacts under the logo and the outro.
fx = np.zeros(N)
noise = rng.normal(0, 1, N)
for c in CUTS:
    e = np.zeros(N)
    a0, a1, r1 = int((c - 0.9) * SR), int(c * SR), int((c + 0.5) * SR)
    e[a0:a1] = np.linspace(0, 1, a1 - a0) ** 2
    e[a1:r1] = np.linspace(1, 0, r1 - a1) ** 1.5
    fx += noise * e
fx = spectral(fx, lo=700, hi=10000) * 0.5


def impact(at, gain):
    out = np.zeros(N)
    ln = int(2.5 * SR)
    it = np.arange(ln) / SR
    boom = np.sin(2 * np.pi * (38 + 30 * np.exp(-it * 6)) * it) * np.exp(-it * 2.2)
    i0 = int(at * SR)
    end = min(N, i0 + ln)
    out[i0:end] = boom[: end - i0] * gain
    return out


def bell_chord(at, notes, gain):
    out = np.zeros(N)
    ln = int(4 * SR)
    it = np.arange(ln) / SR
    i0 = int(at * SR)
    end = min(N, i0 + ln)
    for n in notes:
        f = note(n)
        tone = (np.sin(2 * np.pi * f * it) + 0.3 * np.sin(2 * np.pi * f * 2.0 * it)) * np.exp(-it * 1.3)
        out[i0:end] += tone[: end - i0] * gain / len(notes)
    return out


hits = impact(0.25, 1.0) + impact(46.15, 1.0) + bell_chord(0.35, [81, 84, 88], 0.9) + bell_chord(46.25, [79, 83, 86, 91], 0.9)

dry = 0.40 * pad + 0.13 * bass + 0.20 * pulse + 0.10 * hats + 0.24 * bells + 0.20 * fx + 0.32 * hits

# Reverb: an exponentially decaying noise tail, convolved in the frequency domain; a little different per side.
def reverb(sig, seed):
    r = np.random.default_rng(seed)
    ln = int(2.8 * SR)
    ir = r.normal(0, 1, ln) * np.exp(-np.arange(ln) / SR * 2.4)
    ir = spectral(ir, hi=6000)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(sig) + ln)))
    wet = np.fft.irfft(np.fft.rfft(sig, size) * np.fft.rfft(ir, size), size)[: len(sig)]
    return wet


wetL, wetR = reverb(dry, 1), reverb(dry, 2)
# Mostly shared, a little different per side: wide, but still fine on a phone's mono speaker.
L = dry + 0.42 * (0.7 * wetL + 0.3 * wetR)
R = dry + 0.42 * (0.3 * wetL + 0.7 * wetR)
# Bells drift a little left and right.
pan = 0.5 + 0.25 * np.sin(2 * np.pi * 0.07 * t)
L += 0.05 * bells * (1 - pan)
R += 0.05 * bells * pan

master = np.stack([L, R])
master *= np.clip(t / 0.3, 0, 1) * np.clip((DUR - t) / 1.6, 0, 1)  # in and out
master /= np.max(np.abs(master)) + 1e-9
master = np.tanh(master * 1.4) / np.tanh(1.4)  # gentle limiter
master *= 0.89  # about -1 dBFS

out = sys.argv[1] if len(sys.argv) > 1 else "oxbow-intro.wav"
pcm = (master.T * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out)
