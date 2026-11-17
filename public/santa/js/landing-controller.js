/**
 * Santa North Pole Landing Page Controller
 * DH auto s.r.o. / Live PayPal Connection
 */
(function(window, document) {
  'use strict';

  // 1. Falling Snow Effect
  const canvas = document.getElementById('snowCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let flakes = [];

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    for (let i = 0; i < 75; i++) {
      flakes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 3 + 1,
        d: Math.random() * 1.5 + 0.5
      });
    }

    function drawSnow() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2, true);
        f.y += f.d;
        f.x += Math.sin(f.y / 30) * 0.45;
        if (f.y > canvas.height) {
          f.y = 0;
          f.x = Math.random() * canvas.width;
        }
      }
      ctx.fill();
      requestAnimationFrame(drawSnow);
    }
    drawSnow();
  }

  // 2. Plan Selection
  let selectedPrice = 4.99;
  let selectedPlan = 'single';
  const planCards = document.querySelectorAll('.plan-card');
  const startBtn = document.getElementById('startCallBtn');

  planCards.forEach(function(card) {
    card.addEventListener('click', function() {
      planCards.forEach(function(c) { c.classList.remove('active'); });
      card.classList.add('active');
      selectedPrice = Number(card.getAttribute('data-price'));
      selectedPlan = card.getAttribute('data-plan');
      if (startBtn) {
        startBtn.textContent = '🎅 Start Live Call With Santa ($' + selectedPrice.toFixed(2) + ')';
      }
    });
  });

  // 3. Audio & Music Toggles
  const audioPreviewBtn = document.getElementById('playAudioPreview');
  if (audioPreviewBtn) {
    audioPreviewBtn.addEventListener('click', function() {
      if (window.SantaVoice) {
        audioPreviewBtn.textContent = '🔊 Santa is speaking...';
        window.SantaVoice.audition(function() {
          audioPreviewBtn.textContent = '🔔 Hear Santa\'s Voice ("Ho Ho Ho!")';
        });
      }
    });
  }

  const musicToggleBtn = document.getElementById('toggleMusicBtn');
  const musicStateText = document.getElementById('musicStateText');
  let bgMusicStarted = false;
  if (musicToggleBtn && window.SantaAudio) {
    musicToggleBtn.addEventListener('click', function() {
      if (!bgMusicStarted) {
        window.SantaAudio.startMusic();
        bgMusicStarted = true;
        if (musicStateText) musicStateText.textContent = 'Playing';
      } else {
        const active = window.SantaAudio.toggleMute();
        if (musicStateText) musicStateText.textContent = active ? 'Playing' : 'Muted';
      }
    });
  }

  // 4. Free Test Call (30-sec preview)
  const freeBtn = document.getElementById('tryFreeTestBtn');
  if (freeBtn) {
    freeBtn.addEventListener('click', function() {
      const nameInput = document.getElementById('childName');
      const topicInput = document.getElementById('praiseTopic');
      const ageInput = document.getElementById('childAge');
      const name = (nameInput && nameInput.value.trim()) || 'My Child';
      const topic = (topicInput && topicInput.value) || 'good_behavior';
      const age = (ageInput && ageInput.value) || '5';
      const targetUrl = '/santa/call?mode=preview&name=' + encodeURIComponent(name) + '&topic=' + encodeURIComponent(topic) + '&age=' + encodeURIComponent(age);
      window.location.href = targetUrl;
    });
  }

  // 5. PayPal Checkout Modal
  const modal = document.getElementById('paypalModal');
  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', function() {
      modal.classList.remove('active');
    });
  }

  const callForm = document.getElementById('callForm');
  let currentCallData = {};

  if (callForm) {
    callForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const nameVal = document.getElementById('childName').value.trim();
      const ageVal = document.getElementById('childAge').value;
      const topicVal = document.getElementById('praiseTopic').value;
      const emailVal = document.getElementById('parentEmail').value.trim();

      currentCallData = {
        name: nameVal,
        age: ageVal,
        topic: topicVal,
        email: emailVal,
        plan: selectedPlan,
        price: selectedPrice
      };

      const modalChild = document.getElementById('modalChildName');
      const modalAmt = document.getElementById('modalAmount');
      if (modalChild) modalChild.textContent = currentCallData.name;
      if (modalAmt) modalAmt.textContent = '$' + selectedPrice.toFixed(2) + ' USD';
      if (modal) modal.classList.add('active');

      renderPayPalButtons();
    });
  }

  let ppButtonsRendered = false;
  function renderPayPalButtons() {
    if (ppButtonsRendered) return;
    const container = document.getElementById('paypal-button-container');
    if (!container) return;
    container.innerHTML = '';

    if (!window.paypal) {
      container.innerHTML = '<p style="color:#f87171;font-size:13px;text-align:center;">Payment system is initializing, please refresh.</p>';
      return;
    }

    window.paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'gold',
        shape: 'pill',
        label: 'paypal'
      },
      createOrder: function(data, actions) {
        return actions.order.create({
          purchase_units: [{
            description: "Santa North Pole Live Call Pass for " + currentCallData.name,
            amount: {
              currency_code: 'USD',
              value: selectedPrice.toFixed(2)
            }
          }]
        });
      },
      onApprove: function(data, actions) {
        return actions.order.capture().then(function(details) {
          fetch('/api/webhooks/paypal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: details.id,
              event_type: 'PAYMENT.CAPTURE.COMPLETED',
              summary: 'Santa Live Call Pass - ' + currentCallData.name,
              amount: selectedPrice,
              currency: 'USD',
              payerEmail: (details.payer && details.payer.email_address) || currentCallData.email,
              status: 'COMPLETED',
              raw: { orderId: data.orderID, captureId: details.id, childName: currentCallData.name }
            })
          }).catch(function() {});

          const ticket = details.id || ('TKT-' + Date.now());
          const targetUrl = '/santa/call?ticket=' + encodeURIComponent(ticket) +
            '&name=' + encodeURIComponent(currentCallData.name) +
            '&topic=' + encodeURIComponent(currentCallData.topic) +
            '&age=' + encodeURIComponent(currentCallData.age);
          window.location.href = targetUrl;
        });
      },
      onError: function(err) {
        alert("Payment could not be completed. Please try again.");
      }
    }).render('#paypal-button-container');

    ppButtonsRendered = true;
  }
})(window, document);
