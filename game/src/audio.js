// Every sound is synthesized with the WebAudio API in code: no audio files, no
// downloads. One shared context and master gain, a reusable noise buffer, and one
// small function per sound so the game can call them from anywhere.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 1, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'rifle') {
        noise(0.12, 1800, 0.5);
        tone(160, 0.09, 0.35, 'square', 60);
      } else if (kind === 'smg') {
        noise(0.08, 2400, 0.35);
        tone(220, 0.06, 0.25, 'square', 90);
      } else if (kind === 'pistol') {
        noise(0.1, 1400, 0.45);
        tone(130, 0.08, 0.3, 'square', 55);
      } else {
        noise(0.09, 900, 0.3);
      }
    },
    distantShot() {
      noise(0.18, 500, 0.12);
    },
    dryFire() {
      tone(1400, 0.03, 0.12, 'square');
    },
    reload() {
      tone(900, 0.04, 0.14, 'square');
      setTimeout(() => tone(620, 0.04, 0.14, 'square'), 160);
      setTimeout(() => tone(1100, 0.04, 0.16, 'square'), 420);
    },
    hit() {
      tone(1900, 0.05, 0.2, 'sine');
    },
    kill() {
      tone(1320, 0.07, 0.22, 'sine');
      setTimeout(() => tone(1760, 0.09, 0.22, 'sine'), 70);
    },
    hurt() {
      noise(0.12, 300, 0.4);
      tone(110, 0.12, 0.3, 'sine', 70);
    },
    explosion() {
      noise(0.9, 320, 0.8);
      tone(90, 0.7, 0.6, 'sine', 32);
    },
    beep(high = false) {
      tone(high ? 1320 : 880, 0.09, 0.2, 'sine');
    },
    plantTick() {
      tone(1040, 0.05, 0.14, 'sine');
    },
    buy() {
      tone(990, 0.06, 0.18, 'sine');
      setTimeout(() => tone(1320, 0.08, 0.18, 'sine'), 60);
    },
    denied() {
      tone(220, 0.12, 0.2, 'square', 160);
    },
    roundWin() {
      [523, 659, 784].forEach((freq, i) => setTimeout(() => tone(freq, 0.16, 0.22, 'sine'), i * 110));
    },
    roundLose() {
      [392, 330, 262].forEach((freq, i) => setTimeout(() => tone(freq, 0.18, 0.2, 'sine'), i * 120));
    },
    step() {
      noise(0.05, 700, 0.05);
    },
  };
}
