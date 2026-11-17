/**
 * Santa North Pole Live Call Controller
 * Audio-Driven Video Call, Speech Recognition & Certificate Generator
 */
(function(window, document) {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const childName = params.get('name') || 'Little Star';
  const childAge = params.get('age') || '';
  const topic = params.get('topic') || 'good_behavior';
  const isPreview = params.get('mode') === 'preview';

  const ringingScreen = document.getElementById('ringingScreen');
  const activeScreen = document.getElementById('activeScreen');
  const certificateScreen = document.getElementById('certificateScreen');
  const speechBubble = document.getElementById('speechBubble');
  const santaMouth = document.getElementById('santaMouth');
  const callTimer = document.getElementById('callTimer');
  const goldenToast = document.getElementById('goldenToast');
  const goldenName = document.getElementById('goldenName');
  const toggleCallMusicBtn = document.getElementById('toggleCallMusicBtn');
  const callMusicStatus = document.getElementById('callMusicStatus');

  if (goldenName) goldenName.textContent = childName;

  // Dialogue sequence in English tailored for child and topic
  let topicPraise = "You have been so kind, sharing with everyone and being so good this year!";
  if (topic === 'school_grades') topicPraise = "The elves told me how hard you worked in school and how proud your family is!";
  if (topic === 'tidy_room') topicPraise = "I heard you have been keeping your room tidy and helping around the house so wonderfully!";
  if (topic === 'healthy_eating') topicPraise = "Mrs. Claus told me you have been eating your healthy meals to grow big and strong!";
  if (topic === 'christmas_wish') topicPraise = "The elves in my workshop are putting extra holiday magic into your presents!";

  const dialogueTurns = [
    "HO! HO! HO! Well hello there, " + childName + "! Merry Christmas! It is so wonderful to hear your cheerful voice all the way from the North Pole!",
    "I have my big Golden Book right here by my desk! " + topicPraise,
    "Tell me, " + childName + ", what is the special wish you are hoping for this Christmas? I am listening!",
    "HO! HO! HO! That sounds like a truly magical wish! The elves and reindeer are working extra hard in the workshop right now!",
    "Remember to keep spreading kindness and go to sleep early on Christmas Eve! I am now awarding you your Official North Pole Nice List Certificate! Goodbye, " + childName + ", and Merry Christmas!"
  ];

  let currentTurn = 0;
  let timerSeconds = isPreview ? 35 : 120;
  let timerInterval = null;

  // Answer Call Action
  const answerBtn = document.getElementById('answerBtn');
  if (answerBtn) {
    answerBtn.addEventListener('click', function() {
      ringingScreen.style.display = 'none';
      activeScreen.classList.add('active');

      // Start gentle Jingle Bells background music
      if (window.SantaAudio) {
        window.SantaAudio.startMusic();
      }

      startCallTimer();
      startDialogue();
      setupSpeechRecognition();
    });
  }

  // Toggle Background Music during Call
  if (toggleCallMusicBtn && window.SantaAudio) {
    toggleCallMusicBtn.addEventListener('click', function() {
      const active = window.SantaAudio.toggleMute();
      if (callMusicStatus) {
        callMusicStatus.textContent = active ? 'ON' : 'MUTED';
      }
    });
  }

  function startCallTimer() {
    timerInterval = setInterval(function() {
      timerSeconds--;
      const m = Math.floor(timerSeconds / 60);
      const s = timerSeconds % 60;
      if (callTimer) {
        callTimer.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }

      if (timerSeconds === 90 && goldenToast) {
        goldenToast.style.display = 'inline-flex';
      }

      if (timerSeconds <= 0) {
        endCall();
      }
    }, 1000);
  }

  function startDialogue() {
    if (currentTurn < dialogueTurns.length) {
      const line = dialogueTurns[currentTurn];
      if (speechBubble) speechBubble.textContent = line;

      if (window.SantaVoice) {
        window.SantaVoice.speak(line, {
          onStart: function() {
            if (santaMouth) santaMouth.classList.add('talking');
          },
          onEnd: function() {
            if (santaMouth) santaMouth.classList.remove('talking');
            currentTurn++;
            if (currentTurn < dialogueTurns.length && timerSeconds > 10) {
              setTimeout(startDialogue, 5000); // 5-sec pause for child to respond
            } else if (currentTurn >= dialogueTurns.length) {
              setTimeout(endCall, 3000);
            }
          }
        });
      }
    }
  }

  // Voice recognition for child
  function setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = 'en-US';

        rec.onresult = function(e) {
          const transcript = e.results[e.results.length - 1][0].transcript;
          const status = document.getElementById('micStatus');
          if (status) {
            status.textContent = '👂 Santa heard: "' + transcript.slice(0, 30) + '..."';
          }
        };
        rec.start();
      } catch (err) {}
    }
  }

  const endBtn = document.getElementById('endCallBtn');
  if (endBtn) {
    endBtn.addEventListener('click', endCall);
  }

  function endCall() {
    clearInterval(timerInterval);
    if (window.SantaVoice) window.SantaVoice.cancel();
    if (window.SantaAudio) window.SantaAudio.stopMusic();

    activeScreen.classList.remove('active');
    certificateScreen.classList.add('active');

    const certChild = document.getElementById('certChildName');
    if (certChild) certChild.textContent = childName;

    renderCertificate();
  }

  // Certificate Rendering on Canvas
  function renderCertificate() {
    const c = document.getElementById('certCanvas');
    if (!c) return;
    const g = c.getContext('2d');

    // Parchment gradient background
    const bgGrad = g.createLinearGradient(0, 0, c.width, c.height);
    bgGrad.addColorStop(0, '#fffbf0');
    bgGrad.addColorStop(1, '#fdeece');
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, c.width, c.height);

    // Festive Gold & Crimson ornate borders
    g.strokeStyle = '#c41e3a';
    g.lineWidth = 14;
    g.strokeRect(30, 30, c.width - 60, c.height - 60);

    g.strokeStyle = '#d4af37';
    g.lineWidth = 4;
    g.strokeRect(46, 46, c.width - 92, c.height - 92);

    // Header
    g.textAlign = 'center';
    g.fillStyle = '#1e293b';
    g.font = '700 32px "Cinzel", serif';
    g.fillText('NORTH POLE HEADQUARTERS · OFFICIAL DIPLOMA', c.width / 2, 120);

    g.fillStyle = '#c41e3a';
    g.font = '900 64px "Cinzel", serif';
    g.fillText('OFFICIAL NICE LIST CERTIFICATE', c.width / 2, 200);

    // Subhead
    g.fillStyle = '#334155';
    g.font = 'italic 28px "Georgia", serif';
    g.fillText('This is to certify that Santa Claus and the Elves have proudly placed', c.width / 2, 275);

    // Child Name in Calligraphy
    g.fillStyle = '#c41e3a';
    g.font = 'bold 84px "Great Vibes", cursive';
    g.fillText(childName, c.width / 2, 385);

    // Decorative Line
    g.strokeStyle = '#d4af37';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(350, 420);
    g.lineTo(850, 420);
    g.stroke();

    // Body description
    g.fillStyle = '#1e293b';
    g.font = '500 28px "Inter", sans-serif';
    g.fillText("on Santa's Official Nice List for Christmas 2026", c.width / 2, 480);

    g.font = '400 22px "Inter", sans-serif';
    g.fillStyle = '#64748b';
    g.fillText('Having shown exceptional kindness, a joyful heart, and holiday spirit.', c.width / 2, 530);

    // Golden Wax Seal circle
    g.fillStyle = '#b8860b';
    g.beginPath();
    g.arc(280, 680, 60, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f5c451';
    g.lineWidth = 4;
    g.stroke();

    g.fillStyle = '#ffffff';
    g.font = 'bold 15px "Cinzel", serif';
    g.fillText('OFFICIAL', 280, 672);
    g.fillText('SEAL', 280, 692);

    // Signatures
    g.fillStyle = '#0f172a';
    g.font = 'bold 52px "Great Vibes", cursive';
    g.fillText('Santa Claus', 920, 680);

    g.font = '600 16px "Inter", sans-serif';
    g.fillStyle = '#64748b';
    g.fillText('SANTA CLAUS, NORTH POLE', 920, 715);

    // Date
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    g.fillText('DATE: ' + dateStr, c.width / 2, 770);
  }

  // Certificate Download
  const downloadBtn = document.getElementById('downloadCertBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      const c = document.getElementById('certCanvas');
      if (!c) return;
      const a = document.createElement('a');
      a.download = 'Santa-Nice-List-Certificate-' + childName.replace(/\s+/g, '_') + '.png';
      a.href = c.toDataURL('image/png');
      a.click();
    });
  }

  // WhatsApp Share
  const shareBtn = document.getElementById('shareWhatsappBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', function() {
      const shareText = "🎄 My child " + childName + " just had a live call with Santa Claus and received their Official Nice List Certificate! You can try it here: https://" + window.location.host + "/santa";
      window.open('https://wa.me/?text=' + encodeURIComponent(shareText), '_blank');
    });
  }

  const callAgainBtn = document.getElementById('callAgainBtn');
  if (callAgainBtn) {
    callAgainBtn.addEventListener('click', function() {
      window.location.href = '/santa';
    });
  }
})(window, document);
