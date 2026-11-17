/**
 * North Pole Security Shield
 * Anti-Tamper, Code Protection & DevTools Interceptor
 * DH auto s.r.o. / Santa's Official North Pole Hotline
 */
(function(window, document) {
  'use strict';

  // 1. Disable Right-Click Context Menu
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, { capture: true });

  // 2. Disable DevTools & View-Source Keyboard Shortcuts
  document.addEventListener('keydown', function(e) {
    // F12
    if (e.keyCode === 123 || e.key === 'F12') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    // Ctrl+Shift+I / Cmd+Opt+I (Inspect)
    if (isCtrlOrMeta && e.shiftKey && (e.keyCode === 73 || e.key === 'I' || e.key === 'i')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+Shift+J / Cmd+Opt+J (Console)
    if (isCtrlOrMeta && e.shiftKey && (e.keyCode === 74 || e.key === 'J' || e.key === 'j')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+Shift+C / Cmd+Opt+C (Select element)
    if (isCtrlOrMeta && e.shiftKey && (e.keyCode === 67 || e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+U (View Source)
    if (isCtrlOrMeta && (e.keyCode === 85 || e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Ctrl+S (Save Page)
    if (isCtrlOrMeta && (e.keyCode === 83 || e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, { capture: true });

  // 3. Disable Dragging of Images & Assets
  document.addEventListener('dragstart', function(e) {
    e.preventDefault();
    return false;
  }, { capture: true });

  // 4. Silence Developer Console in Production
  try {
    const noop = function() {};
    const methods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace', 'dir'];
    for (let i = 0; i < methods.length; i++) {
      window.console[methods[i]] = noop;
    }
  } catch(err) {}

  // 5. Anti-Debugging Watchdog
  try {
    setInterval(function() {
      const start = Date.now();
      (function(){}).constructor('debugger')();
      if (Date.now() - start > 100) {
        window.location.reload();
      }
    }, 2000);
  } catch(e) {}
})(window, document);
