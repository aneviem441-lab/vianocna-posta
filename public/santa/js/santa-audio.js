/**
 * Festive Soundscape & Procedural Jingle Bells Music Box
 * Web Audio API Engine — Zero External Dependencies, 100% Reliable
 */
(function(window) {
  'use strict';

  let audioCtx = null;
  let bgMusicGain = null;
  let sfxGain = null;
  let isMusicPlaying = false;
  let isMuted = false;
  let musicLoopTimeout = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();

      bgMusicGain = audioCtx.createGain();
      bgMusicGain.gain.setValueAtTime(0.08, audioCtx.currentTime); // Gentle background volume

      sfxGain = audioCtx.createGain();
      sfxGain.gain.setValueAtTime(0.35, audioCtx.currentTime);

      bgMusicGain.connect(audioCtx.destination);
      sfxGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Musical Note Frequencies (Hz)
  const NOTES = {
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'C6': 1046.50
  };

  // Authentic "Jingle Bells" Score (Chorus melody)
  // Durations are relative beats (tempo = 118 BPM)
  const JINGLE_BELLS_SCORE = [
    // "Jingle bells, jingle bells, jingle all the way"
    { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.58 },
    { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.58 },
    { note: 'E5', dur: 0.28 }, { note: 'G5', dur: 0.28 }, { note: 'C5', dur: 0.28 }, { note: 'D5', dur: 0.28 }, { note: 'E5', dur: 1.15 },

    // "Oh what fun it is to ride in a one-horse open sleigh, hey!"
    { note: 'F5', dur: 0.28 }, { note: 'F5', dur: 0.28 }, { note: 'F5', dur: 0.28 }, { note: 'F5', dur: 0.28 },
    { note: 'F5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.14 }, { note: 'E5', dur: 0.14 },
    { note: 'E5', dur: 0.28 }, { note: 'D5', dur: 0.28 }, { note: 'D5', dur: 0.28 }, { note: 'E5', dur: 0.28 },
    { note: 'D5', dur: 0.56 }, { note: 'G5', dur: 0.56 },

    // Repeat Chorus
    { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.58 },
    { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.58 },
    { note: 'E5', dur: 0.28 }, { note: 'G5', dur: 0.28 }, { note: 'C5', dur: 0.28 }, { note: 'D5', dur: 0.28 }, { note: 'E5', dur: 1.15 },

    // "Oh what fun it is to ride in a one-horse open sleigh!" (Ending cadence)
    { note: 'F5', dur: 0.28 }, { note: 'F5', dur: 0.28 }, { note: 'F5', dur: 0.28 }, { note: 'F5', dur: 0.28 },
    { note: 'F5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.28 }, { note: 'E5', dur: 0.14 }, { note: 'E5', dur: 0.14 },
    { note: 'G5', dur: 0.28 }, { note: 'G5', dur: 0.28 }, { note: 'F5', dur: 0.28 }, { note: 'D5', dur: 0.28 },
    { note: 'C5', dur: 1.2 }
  ];

  // Play a single bell / celesta chime note
  function scheduleChimeNote(freq, startTime, duration) {
    if (!audioCtx || !bgMusicGain) return;

    // Primary fundamental bell oscillator (triangle)
    const osc = audioCtx.createOscillator();
    const noteGain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    // Soft music-box envelope
    noteGain.gain.setValueAtTime(0.001, startTime);
    noteGain.gain.linearRampToValueAtTime(0.22, startTime + 0.03);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(noteGain);
    noteGain.connect(bgMusicGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);

    // Subtle harmonic overtone (octave higher sine for sparkling Christmas sheen)
    const overtone = audioCtx.createOscillator();
    const overGain = audioCtx.createGain();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(freq * 2, startTime);
    overGain.gain.setValueAtTime(0.001, startTime);
    overGain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
    overGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.6);

    overtone.connect(overGain);
    overGain.connect(bgMusicGain);

    overtone.start(startTime);
    overtone.stop(startTime + duration * 0.6 + 0.05);
  }

  // Play a subtle sleigh bell shake
  function scheduleSleighBell(startTime) {
    if (!audioCtx || !bgMusicGain) return;
    [2300, 2900, 3700, 4200].forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.015, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);

      osc.connect(gain);
      gain.connect(bgMusicGain);

      osc.start(startTime);
      osc.stop(startTime + 0.13);
    });
  }

  // Play complete Jingle Bells melody loop
  function playJingleBellsLoop() {
    if (!isMusicPlaying) return;
    const ctx = initAudio();
    let now = ctx.currentTime + 0.05;

    let beatTime = now;
    JINGLE_BELLS_SCORE.forEach((item, index) => {
      const freq = NOTES[item.note] || 523.25;
      const dur = item.dur * 0.95;

      scheduleChimeNote(freq, beatTime, dur);

      // Add rhythmic sleigh bell on major beats
      if (index % 2 === 0) {
        scheduleSleighBell(beatTime);
      }

      beatTime += item.dur;
    });

    const totalSongDuration = (beatTime - now) * 1000;
    // Loop with 1.8 second holiday pause between repetitions
    musicLoopTimeout = setTimeout(() => {
      if (isMusicPlaying) {
        playJingleBellsLoop();
      }
    }, totalSongDuration + 1800);
  }

  const SantaAudio = {
    startMusic: function() {
      initAudio();
      if (isMusicPlaying) return;
      isMusicPlaying = true;
      playJingleBellsLoop();
    },

    stopMusic: function() {
      isMusicPlaying = false;
      if (musicLoopTimeout) clearTimeout(musicLoopTimeout);
    },

    toggleMute: function() {
      initAudio();
      isMuted = !isMuted;
      if (bgMusicGain) {
        bgMusicGain.gain.setValueAtTime(isMuted ? 0 : 0.08, audioCtx.currentTime);
      }
      return !isMuted;
    },

    isMuted: function() {
      return isMuted;
    },

    // Sleigh bell fanfare for Santa's speech turn
    playSantaSleighBells: function() {
      const ctx = initAudio();
      const now = ctx.currentTime;
      [2093, 2793, 3322, 4186].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0.09, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.65);

        osc.connect(gain);
        gain.connect(sfxGain);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.7);
      });
    },

    // Deep chest resonance "Ho! Ho! Ho!" belly chuckle pulse
    playHoHoHoResonance: function() {
      const ctx = initAudio();
      const now = ctx.currentTime;
      [0, 0.28, 0.56].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        // 90Hz to 68Hz bass register
        osc.frequency.setValueAtTime(92, now + offset);
        osc.frequency.exponentialRampToValueAtTime(68, now + offset + 0.22);

        gain.gain.setValueAtTime(0.22, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.24);

        osc.connect(gain);
        gain.connect(sfxGain);

        osc.start(now + offset);
        osc.stop(now + offset + 0.25);
      });
    }
  };

  window.SantaAudio = SantaAudio;
})(window);
