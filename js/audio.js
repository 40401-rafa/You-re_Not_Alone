/**
 * VOCÊ NÃO ESTÁ SOZINHO - Motor de Áudio Procedural (audio.js)
 * Desenvolvido 100% com Web Audio API nativa.
 * Sintetiza atmosfera, passos, rangidos, batimentos cardíacos, chuva, telefone, TV e sussurros espaciais.
 */

window.GameAudio = (function() {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let ambientGain = null;
  let isInitialized = false;

  // Nós de áudio contínuos
  let droneOsc1 = null;
  let droneOsc2 = null;
  let droneFilter = null;
  let windNode = null;
  let rainNode = null;
  let tvStaticNode = null;
  let tvGain = null;
  let phoneOsc1 = null;
  let phoneOsc2 = null;
  let phoneMod = null;
  let phoneGain = null;
  let phoneInterval = null;

  // Batimentos cardíacos
  let heartbeatInterval = null;
  let heartbeatBpm = 65;
  let heartbeatActive = false;
  let heartbeatGain = null;

  let masterVolume = 0.8;

  function init() {
    if (isInitialized && ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();

      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);

      ambientGain = ctx.createGain();
      ambientGain.gain.setValueAtTime(0.7, ctx.currentTime);
      ambientGain.connect(masterGain);

      heartbeatGain = ctx.createGain();
      heartbeatGain.gain.setValueAtTime(0, ctx.currentTime);
      heartbeatGain.connect(masterGain);

      startAmbientAmbience();
      startRain();

      isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API não pôde ser iniciada:', e);
    }
  }

  function setMasterVolume(val) {
    masterVolume = Math.max(0, Math.min(1, val));
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.05);
    }
  }

  // =========================================================================
  // RUÍDO BRANCO E GERADORES DE TEXTURA
  // =========================================================================
  function createNoiseBuffer(duration = 2) {
    if (!ctx) return null;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // =========================================================================
  // AMBIÊNCIA ESCURA & DRONE DE BAIXA FREQUÊNCIA
  // =========================================================================
  function startAmbientAmbience() {
    if (!ctx) return;

    // Oscilador 1 de drone subgrave (43Hz)
    droneOsc1 = ctx.createOscillator();
    droneOsc1.type = 'sine';
    droneOsc1.frequency.setValueAtTime(43, ctx.currentTime);

    // Oscilador 2 desafinado (55Hz com leve batimento)
    droneOsc2 = ctx.createOscillator();
    droneOsc2.type = 'triangle';
    droneOsc2.frequency.setValueAtTime(54.5, ctx.currentTime);

    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.setValueAtTime(110, ctx.currentTime);

    // LFO para modular lentamente o filtro de escuridão
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.08, ctx.currentTime); // 1 ciclo a cada 12s
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(35, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);
    lfo.start();

    const droneGainNode = ctx.createGain();
    droneGainNode.gain.setValueAtTime(0.35, ctx.currentTime);

    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGainNode);
    droneGainNode.connect(ambientGain);

    droneOsc1.start();
    droneOsc2.start();

    // Vento sinistro nas frestas da casa
    startWind();
  }

  function startWind() {
    if (!ctx) return;
    const noiseBuffer = createNoiseBuffer(3);
    if (!noiseBuffer) return;

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(380, ctx.currentTime);
    windFilter.Q.setValueAtTime(3.5, ctx.currentTime);

    // Modulação do uivo do vento
    const windLfo = ctx.createOscillator();
    windLfo.type = 'sine';
    windLfo.frequency.setValueAtTime(0.12, ctx.currentTime);
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.setValueAtTime(180, ctx.currentTime);
    windLfo.connect(windLfoGain);
    windLfoGain.connect(windFilter.frequency);
    windLfo.start();

    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.08, ctx.currentTime);

    noiseSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ambientGain);

    noiseSource.start();
    windNode = noiseSource;
  }

  function startRain() {
    if (!ctx) return;
    const noiseBuffer = createNoiseBuffer(2);
    if (!noiseBuffer) return;

    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer;
    rainSrc.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.setValueAtTime(800, ctx.currentTime);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.045, ctx.currentTime);

    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(ambientGain);

    rainSrc.start();
    rainNode = rainSrc;
  }

  // Trovão distante ocasional
  function playThunder() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const noiseBuffer = createNoiseBuffer(3);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(160, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 2.5);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    src.start(now);
    src.stop(now + 3);
  }

  // =========================================================================
  // SISTEMA DE PASSOS (MADEIRA, AZULEJO, CARPETE)
  // =========================================================================
  function playFootstep(surface = 'wood', isRun = false, isCrouch = false) {
    if (!ctx) return;
    const now = ctx.currentTime;

    const volMult = isCrouch ? 0.25 : (isRun ? 1.3 : 0.8);
    const speedMult = isRun ? 1.2 : (isCrouch ? 0.8 : 1.0);

    // Impacto mecânico (ruído filtrado curto)
    const noiseBuffer = createNoiseBuffer(0.15);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (surface === 'tile') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200 * speedMult, now);
      filter.Q.setValueAtTime(1.5, now);
    } else {
      // Madeira com estalo e ressonância grave
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450 * speedMult, now);
      filter.Q.setValueAtTime(2.0, now);
    }

    gain.gain.setValueAtTime(0.2 * volMult, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    noise.start(now);
    noise.stop(now + 0.1);

    // Rangido sutil de tábua solta
    if (surface === 'wood' && Math.random() < 0.45 && !isCrouch) {
      playWoodCreak((Math.random() - 0.5) * 0.4, 0.15 * volMult);
    }
  }

  // =========================================================================
  // EFEITOS SONOROS DE PORTAS E RANGIDOS
  // =========================================================================
  function playDoorCreak(panVal = 0) {
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(280 + Math.random() * 80, now + 0.4);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.8);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);
    filter.Q.setValueAtTime(4.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    const panner = createPanner(panVal);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.9);
  }

  function playDoorLatching(panVal = 0) {
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    const panner = createPanner(panVal);

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  function playDoorSlam(panVal = 0) {
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pancada seca grave
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.65, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    // Ruído do impacto da madeira
    const noiseBuffer = createNoiseBuffer(0.3);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    const panner = createPanner(panVal);

    osc.connect(oscGain);
    oscGain.connect(panner);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(panner);
    panner.connect(masterGain);

    osc.start(now);
    noise.start(now);
    osc.stop(now + 0.4);
    noise.stop(now + 0.4);
  }

  function playWoodCreak(panVal = 0, vol = 0.2) {
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const startFreq = 180 + Math.random() * 80;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.linearRampToValueAtTime(startFreq + (Math.random() - 0.5) * 120, now + 0.35);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800 + Math.random() * 400, now);
    filter.Q.setValueAtTime(5.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    const panner = createPanner(panVal);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // =========================================================================
  // INTERRUPTOR DA LANTERNA
  // =========================================================================
  function playFlashlightClick() {
    if (!ctx) return;
    const now = ctx.currentTime;

    // Dois pulsos mecânicos de alta frequência
    [0, 0.025].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(idx === 0 ? 1400 : 950, now + offset);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.02);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + offset);
      osc.stop(now + offset + 0.03);
    });
  }

  // =========================================================================
  // BATIMENTOS CARDÍACOS (AUMENTA COM O TERROR/PARANOIA)
  // =========================================================================
  function setHeartbeat(active, bpm = 65, intensity = 0.5) {
    heartbeatActive = active;
    heartbeatBpm = Math.max(50, Math.min(150, bpm));

    if (active && !heartbeatInterval) {
      scheduleNextHeartbeat(intensity);
    } else if (!active && heartbeatInterval) {
      clearTimeout(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function scheduleNextHeartbeat(intensity) {
    if (!heartbeatActive || !ctx) {
      heartbeatInterval = null;
      return;
    }

    playSingleHeartbeat(intensity);

    const intervalMs = (60 / heartbeatBpm) * 1000;
    heartbeatInterval = setTimeout(() => {
      scheduleNextHeartbeat(intensity);
    }, intervalMs);
  }

  function playSingleHeartbeat(intensity = 0.5) {
    if (!ctx) return;
    const now = ctx.currentTime;

    // Batida dupla clássica: "Lub-Dub"
    const playThump = (time, freq, gainVal) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(28, time + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainVal * intensity, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(time);
      osc.stop(time + 0.15);
    };

    playThump(now, 68, 0.45);
    playThump(now + 0.14, 52, 0.32);
  }

  // =========================================================================
  // TELEFONE TOCANDO (CADÊNCIA VINTAGE)
  // =========================================================================
  function startPhoneRing(panVal = 0) {
    if (phoneInterval || !ctx) return;

    const ringCycle = () => {
      const now = ctx.currentTime;

      // Frequências clássicas de toque (440Hz + 480Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      // Tremolo de 20Hz do martelo
      const tremolo = ctx.createOscillator();
      tremolo.type = 'square';
      tremolo.frequency.setValueAtTime(20, now);

      const ringGain = ctx.createGain();
      ringGain.gain.setValueAtTime(0, now);

      // 1.8 segundos tocando
      ringGain.gain.setValueAtTime(0.2, now);
      ringGain.gain.setValueAtTime(0, now + 1.8);

      const panner = createPanner(panVal);

      osc1.connect(ringGain);
      osc2.connect(ringGain);
      ringGain.connect(panner);
      panner.connect(masterGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.85);
      osc2.stop(now + 1.85);
    };

    ringCycle();
    phoneInterval = setInterval(ringCycle, 4200);
  }

  function stopPhoneRing() {
    if (phoneInterval) {
      clearInterval(phoneInterval);
      phoneInterval = null;
    }
  }

  function playPhoneAnswer() {
    stopPhoneRing();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Clique mecânico de tirar o fone do gancho
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(400, now);
    clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.3, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);
    clickOsc.start(now);
    clickOsc.stop(now + 0.12);

    // Ruído telefônico estático + respiração soturna
    const noiseBuffer = createNoiseBuffer(3);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1000, now);
    bandpass.Q.setValueAtTime(2.0, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now + 0.1);
    noiseGain.gain.linearRampToValueAtTime(0.14, now + 0.4);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(masterGain);

    noise.start(now + 0.1);
    noise.stop(now + 3.3);
  }

  // =========================================================================
  // ESTÁTICA DE TV
  // =========================================================================
  function startTVStatic(panVal = 0, volume = 0.12) {
    if (tvStaticNode || !ctx) return;

    const noiseBuffer = createNoiseBuffer(2);
    tvStaticNode = ctx.createBufferSource();
    tvStaticNode.buffer = noiseBuffer;
    tvStaticNode.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, ctx.currentTime);
    filter.Q.setValueAtTime(1.0, ctx.currentTime);

    tvGain = ctx.createGain();
    tvGain.gain.setValueAtTime(volume, ctx.currentTime);

    const panner = createPanner(panVal);

    tvStaticNode.connect(filter);
    filter.connect(tvGain);
    tvGain.connect(panner);
    panner.connect(masterGain);

    tvStaticNode.start();
  }

  function stopTVStatic() {
    if (tvStaticNode) {
      try {
        tvStaticNode.stop();
        tvStaticNode.disconnect();
      } catch (e) {}
      tvStaticNode = null;
    }
  }

  // =========================================================================
  // SUSSURROS E ALUCINAÇÕES ESPACIAIS
  // =========================================================================
  function playWhisper(panVal = 0.8) {
    if (!ctx) return;
    const now = ctx.currentTime;

    const noiseBuffer = createNoiseBuffer(2.2);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    // Filtros formantes para simular voz humana sibilante
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 1.2);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 2.0);
    filter.Q.setValueAtTime(8.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);

    const panner = createPanner(panVal);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    noise.start(now);
    noise.stop(now + 2.2);
  }

  // =========================================================================
  // STINGER DE TERROR PSICOLÓGICO (ENCONTRO COM O OBSERVADOR)
  // =========================================================================
  function playStinger() {
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sub-queda violenta
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(110, now);
    subOsc.frequency.exponentialRampToValueAtTime(22, now + 1.5);

    const subFilter = ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(180, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.7, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(masterGain);

    subOsc.start(now);
    subOsc.stop(now + 1.7);

    // Som estridente agudo de metal rasgado
    const screechOsc = ctx.createOscillator();
    screechOsc.type = 'sawtooth';
    screechOsc.frequency.setValueAtTime(1250, now);
    screechOsc.frequency.linearRampToValueAtTime(2400, now + 0.3);
    screechOsc.frequency.exponentialRampToValueAtTime(600, now + 1.1);

    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.setValueAtTime(1600, now);
    screechFilter.Q.setValueAtTime(6.0, now);

    const screechGain = ctx.createGain();
    screechGain.gain.setValueAtTime(0.35, now);
    screechGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    screechOsc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(masterGain);

    screechOsc.start(now);
    screechOsc.stop(now + 1.3);
  }

  function playItemPickup() {
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  function playFlickerSpark(panVal = 0) {
    if (!ctx) return;
    const now = ctx.currentTime;

    const noiseBuffer = createNoiseBuffer(0.08);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3200, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    const panner = createPanner(panVal);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);

    noise.start(now);
    noise.stop(now + 0.08);
  }

  // =========================================================================
  // AUXILIAR: PANNER ESTÉREO ESPACIAL
  // =========================================================================
  function createPanner(pan = 0) {
    if (!ctx) return masterGain;
    const clampedPan = Math.max(-1, Math.min(1, pan));

    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(clampedPan, ctx.currentTime);
      return p;
    }
    // Fallback simples caso navegador antigo não suporte StereoPanner
    return ctx.createGain();
  }

  return {
    init,
    setMasterVolume,
    playFootstep,
    playDoorCreak,
    playDoorLatching,
    playDoorSlam,
    playWoodCreak,
    playFlashlightClick,
    setHeartbeat,
    startPhoneRing,
    stopPhoneRing,
    playPhoneAnswer,
    startTVStatic,
    stopTVStatic,
    playWhisper,
    playStinger,
    playItemPickup,
    playFlickerSpark,
    playThunder
  };
})();
