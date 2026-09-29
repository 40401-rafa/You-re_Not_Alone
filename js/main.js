/**
 * VOCÊ NÃO ESTÁ SOZINHO - Loop Principal & Orquestrador (main.js)
 * Inicialização dos subsistemas, loop de animação via requestAnimationFrame,
 * gerenciamento de estados do jogo (MENU, PLAYING, PAUSED, GAMEOVER, VICTORY),
 * menus, controles e captura de cursor (Pointer Lock API).
 */

window.GameMain = (function() {
  'use strict';

  const STATES = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER',
    VICTORY: 'VICTORY'
  };

  let gameState = STATES.MENU;
  let lastTime = performance.now();
  let totalTimeSec = 0;

  // Elementos do DOM
  let renderCanvas = null;
  let mainMenu = null;
  let pauseModal = null;
  let settingsModal = null;
  let controlsModal = null;
  let gameOverModal = null;
  let victoryModal = null;
  let documentModal = null;
  let inventoryModal = null;
  let btnContinue = null;
  let pointerLockPrompt = null;

  function init() {
    renderCanvas = document.getElementById('render-canvas');
    mainMenu = document.getElementById('main-menu');
    pauseModal = document.getElementById('pause-modal');
    settingsModal = document.getElementById('settings-modal');
    controlsModal = document.getElementById('controls-modal');
    gameOverModal = document.getElementById('game-over-modal');
    victoryModal = document.getElementById('victory-modal');
    documentModal = document.getElementById('document-modal');
    inventoryModal = document.getElementById('inventory-modal');
    btnContinue = document.getElementById('btn-continue');
    pointerLockPrompt = document.getElementById('pointer-lock-prompt');

    // Inicializa Módulos
    window.GamePlayer.init();
    window.GameInteraction.init();
    window.GameEvents.init();
    window.GameEntity.init();

    const worldReady = window.GameWorld.init();
    if (!worldReady) {
      console.error('Falha ao inicializar o Mundo WebGL.');
    }

    // Configura Listeners de Interface
    setupMenuListeners();
    setupSettingsListeners();
    setupPointerLock();
    setupGlobalKeys();

    // Verifica se há jogo salvo para habilitar "CONTINUAR"
    updateContinueButton();

    // Inicia Loop do Jogo
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  // =========================================================================
  // LOOP PRINCIPAL (requestAnimationFrame)
  // =========================================================================
  function gameLoop(currentTime) {
    const dt = Math.min((currentTime - lastTime) / 1000, 0.1); // Trava delta time máximo
    lastTime = currentTime;
    totalTimeSec += dt;

    if (gameState === STATES.PLAYING) {
      // 1. Atualizações Lógicas
      window.GamePlayer.update(dt, window.GameWorld, window.GameEntity);
      window.GameEntity.update(dt, window.GamePlayer, window.GameWorld);
      window.GameEvents.update(dt, window.GamePlayer, window.GameWorld, window.GameEntity, window.GameStory);
      window.GameInteraction.update(window.GamePlayer, window.GameWorld);
      window.GameWorld.update(dt, totalTimeSec);

      // 2. Renderização 3D WebGL
      window.GameWorld.render(window.GamePlayer, window.GameEntity, totalTimeSec);
    } else if (gameState === STATES.MENU || gameState === STATES.PAUSED) {
      // Renderiza atmosfera de fundo suave mesmo pausado
      window.GameWorld.render(window.GamePlayer, window.GameEntity, totalTimeSec);
    }

    requestAnimationFrame(gameLoop);
  }

  // =========================================================================
  // POINTER LOCK API (CAPTURA DE CURSOR EM PRIMEIRA PESSOA)
  // =========================================================================
  function setupPointerLock() {
    const activateLock = () => {
      if (gameState === STATES.PLAYING) {
        // Só solicita lock se nenhum modal de UI estiver aberto
        if (documentModal.classList.contains('hidden') && 
            inventoryModal.classList.contains('hidden') &&
            pauseModal.classList.contains('hidden') &&
            settingsModal.classList.contains('hidden') &&
            controlsModal.classList.contains('hidden')) {
          requestPointerLock();
        }
      }
    };

    renderCanvas.addEventListener('click', activateLock);
    if (pointerLockPrompt) {
      pointerLockPrompt.addEventListener('click', activateLock);
    }

    document.addEventListener('pointerlockchange', () => {
      const isLocked = document.pointerLockElement === renderCanvas;
      if (isLocked) {
        if (pointerLockPrompt) pointerLockPrompt.classList.add('hidden');
      } else {
        if (gameState === STATES.PLAYING) {
          // Se saiu do Pointer Lock e não está em modais de menu/inventário/documento,
          // mostra discretamente o prompt "Clique na tela para continuar"
          if (documentModal.classList.contains('hidden') && 
              inventoryModal.classList.contains('hidden') &&
              pauseModal.classList.contains('hidden') &&
              settingsModal.classList.contains('hidden') &&
              controlsModal.classList.contains('hidden')) {
            if (pointerLockPrompt) pointerLockPrompt.classList.remove('hidden');
          }
        }
      }
    });

    document.addEventListener('pointerlockerror', () => {
      console.warn('Pointer Lock falhou ao capturar.');
      if (gameState === STATES.PLAYING && pointerLockPrompt) {
        pointerLockPrompt.classList.remove('hidden');
      }
    });
  }

  function requestPointerLock() {
    if (renderCanvas.requestPointerLock) {
      renderCanvas.requestPointerLock();
    }
  }

  function exitPointerLock() {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  // =========================================================================
  // CONTROLE DE TECLAS GLOBAIS (ESC, TAB, INVENTÁRIO)
  // =========================================================================
  function setupGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();

      // Abrir / Fechar Inventário [TAB ou I]
      if (k === 'tab' || k === 'i') {
        e.preventDefault();
        if (gameState === STATES.PLAYING) {
          if (pointerLockPrompt) pointerLockPrompt.classList.add('hidden');
          window.GameInventory.toggle();
        } else if (window.GameInventory.isOpen) {
          window.GameInventory.close();
          requestPointerLock();
        }
        return;
      }

      // Tecla [ESC]
      if (e.key === 'Escape') {
        if (pointerLockPrompt && !pointerLockPrompt.classList.contains('hidden')) {
          pointerLockPrompt.classList.add('hidden');
          pauseGame();
          return;
        }

        if (!documentModal.classList.contains('hidden')) {
          window.GameStory.closeDocumentModal();
          requestPointerLock();
          return;
        }

        if (window.GameInventory.isOpen) {
          window.GameInventory.close();
          requestPointerLock();
          return;
        }

        if (!settingsModal.classList.contains('hidden')) {
          settingsModal.classList.add('hidden');
          return;
        }

        if (!controlsModal.classList.contains('hidden')) {
          controlsModal.classList.add('hidden');
          return;
        }

        if (gameState === STATES.PLAYING) {
          pauseGame();
        } else if (gameState === STATES.PAUSED) {
          resumeGame();
        }
      }
    });

    // Fechar modal de documento no botão 'X'
    const docCloseBtn = document.getElementById('doc-close-btn');
    if (docCloseBtn) {
      docCloseBtn.addEventListener('click', () => {
        window.GameStory.closeDocumentModal();
        if (gameState === STATES.PLAYING) requestPointerLock();
      });
    }

    // Fechar inventário no botão 'X'
    const invCloseBtn = document.getElementById('inv-close-btn');
    if (invCloseBtn) {
      invCloseBtn.addEventListener('click', () => {
        window.GameInventory.close();
        if (gameState === STATES.PLAYING) requestPointerLock();
      });
    }
  }

  // =========================================================================
  // LISTENERS DE MENUS
  // =========================================================================
  function setupMenuListeners() {
    // 1. Novo Jogo
    const btnNewGame = document.getElementById('btn-new-game');
    if (btnNewGame) {
      btnNewGame.addEventListener('click', () => {
        startNewGame();
      });
    }

    // 2. Continuar
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        loadSavedGame();
      });
    }

    // 3. Configurações (Menu Principal & Pausa)
    const btnSettingsMain = document.getElementById('btn-settings-main');
    const btnSettingsPause = document.getElementById('btn-settings-pause');
    const btnCloseSettings = document.getElementById('btn-close-settings');

    if (btnSettingsMain) {
      btnSettingsMain.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
      });
    }
    if (btnSettingsPause) {
      btnSettingsPause.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
      });
    }
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
      });
    }

    // 4. Controles & Guia
    const btnControls = document.getElementById('btn-controls');
    const btnCloseControls = document.getElementById('btn-close-controls');
    if (btnControls) {
      btnControls.addEventListener('click', () => {
        controlsModal.classList.remove('hidden');
      });
    }
    if (btnCloseControls) {
      btnCloseControls.addEventListener('click', () => {
        controlsModal.classList.add('hidden');
      });
    }

    // 5. Menu de Pausa: Continuar, Salvar, Menu Principal
    const btnResume = document.getElementById('btn-resume');
    const btnSaveGame = document.getElementById('btn-save-game');
    const btnQuitToMenu = document.getElementById('btn-quit-to-menu');

    if (btnResume) btnResume.addEventListener('click', resumeGame);
    if (btnSaveGame) {
      btnSaveGame.addEventListener('click', () => {
        saveCurrentProgress();
      });
    }
    if (btnQuitToMenu) {
      btnQuitToMenu.addEventListener('click', () => {
        returnToMainMenu();
      });
    }

    // 6. Game Over e Vitória
    const btnRestartDeath = document.getElementById('btn-restart-death');
    const btnMenuDeath = document.getElementById('btn-menu-death');
    const btnVictoryMenu = document.getElementById('btn-victory-menu');

    if (btnRestartDeath) {
      btnRestartDeath.addEventListener('click', () => {
        gameOverModal.classList.add('hidden');
        if (window.GameSave.hasSave()) {
          loadSavedGame();
        } else {
          startNewGame();
        }
      });
    }
    if (btnMenuDeath) {
      btnMenuDeath.addEventListener('click', () => {
        gameOverModal.classList.add('hidden');
        returnToMainMenu();
      });
    }
    if (btnVictoryMenu) {
      btnVictoryMenu.addEventListener('click', () => {
        victoryModal.classList.add('hidden');
        returnToMainMenu();
      });
    }
  }

  // =========================================================================
  // CONFIGURAÇÕES (VOLUME, SENSIBILIDADE, VHS, INVERTER Y)
  // =========================================================================
  function setupSettingsListeners() {
    const volInput = document.getElementById('setting-volume');
    const volDisplay = document.getElementById('vol-display');
    const sensInput = document.getElementById('setting-mouse-sens');
    const sensDisplay = document.getElementById('sens-display');
    const vhsCheckbox = document.getElementById('setting-vhs');
    const invertYCheckbox = document.getElementById('setting-invert-y');

    const savedSettings = window.GameSave.loadSettings();

    if (volInput) {
      volInput.value = savedSettings.volume;
      if (volDisplay) volDisplay.textContent = savedSettings.volume + '%';
      volInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (volDisplay) volDisplay.textContent = val + '%';
        if (window.GameAudio) window.GameAudio.setMasterVolume(val / 100);
        saveSettingsToStorage();
      });
    }

    if (sensInput) {
      sensInput.value = savedSettings.sensitivity;
      if (sensDisplay) sensDisplay.textContent = savedSettings.sensitivity;
      sensInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (sensDisplay) sensDisplay.textContent = val;
        window.GamePlayer.setSensitivity(val);
        saveSettingsToStorage();
      });
    }

    if (vhsCheckbox) {
      vhsCheckbox.checked = savedSettings.vhsEnabled;
      vhsCheckbox.addEventListener('change', (e) => {
        const fxCanvas = document.getElementById('fx-canvas');
        if (fxCanvas) {
          fxCanvas.style.display = e.target.checked ? 'block' : 'none';
        }
        saveSettingsToStorage();
      });
    }

    if (invertYCheckbox) {
      invertYCheckbox.checked = savedSettings.invertY;
      invertYCheckbox.addEventListener('change', (e) => {
        window.GamePlayer.setInvertY(e.target.checked);
        saveSettingsToStorage();
      });
    }

    function saveSettingsToStorage() {
      window.GameSave.saveSettings({
        volume: volInput ? parseInt(volInput.value) : 80,
        sensitivity: sensInput ? parseFloat(sensInput.value) : 1.5,
        vhsEnabled: vhsCheckbox ? vhsCheckbox.checked : true,
        invertY: invertYCheckbox ? invertYCheckbox.checked : false
      });
    }
  }

  // =========================================================================
  // FLUXO DO JOGO
  // =========================================================================
  function startNewGame() {
    window.GameSave.clearSave();
    if (window.GameAudio) window.GameAudio.init();

    // Reseta Player
    window.GamePlayer.pos.x = -4.0;
    window.GamePlayer.pos.y = 0.0;
    window.GamePlayer.pos.z = -4.0;
    window.GamePlayer.yaw = 0.0;
    window.GamePlayer.pitch = 0.0;
    window.GamePlayer.hasFlashlight = false;
    window.GamePlayer.isFlashlightOn = false;
    window.GamePlayer.battery = 100.0;
    window.GamePlayer.sanity = 0.0;

    // Reseta Story
    window.GameStory.setObjective('find_light');

    // Transição de Telas
    mainMenu.classList.add('hidden');
    gameState = STATES.PLAYING;
    requestPointerLock();

    window.GameStory.showSubtitle('Minha cabeça está doendo... Onde estou? Preciso encontrar uma lanterna e sair daqui.', 4200);
  }

  function loadSavedGame() {
    const save = window.GameSave.loadGame();
    if (!save) return;

    if (window.GameAudio) window.GameAudio.init();

    // Restaura Player
    window.GamePlayer.pos.x = save.player.x;
    window.GamePlayer.pos.y = save.player.y;
    window.GamePlayer.pos.z = save.player.z;
    window.GamePlayer.yaw = save.player.yaw;
    window.GamePlayer.pitch = save.player.pitch;
    window.GamePlayer.hasFlashlight = save.player.hasFlashlight;
    window.GamePlayer.isFlashlightOn = save.player.isFlashlightOn;
    window.GamePlayer.battery = save.player.battery;
    window.GamePlayer.sanity = save.player.sanity || 0;

    // Restaura Inventário, Mundo, História, Eventos e Entidade
    window.GameInventory.deserialize(save.inventory);
    window.GameWorld.deserialize(save.world);
    window.GameStory.deserialize(save.story);
    window.GameEvents.deserialize(save.events);
    window.GameEntity.deserialize(save.entity);

    mainMenu.classList.add('hidden');
    gameState = STATES.PLAYING;
    requestPointerLock();

    window.GameStory.showToast('PROGRESSO CARREGADO COM SUCESSO!');
  }

  function saveCurrentProgress() {
    const success = window.GameSave.saveGame({
      player: window.GamePlayer,
      inventory: window.GameInventory,
      world: window.GameWorld,
      story: window.GameStory,
      events: window.GameEvents,
      entity: window.GameEntity
    });

    if (success) {
      window.GameStory.showToast('PROGRESSO SALVO!');
      updateContinueButton();
    }
  }

  function pauseGame() {
    if (pointerLockPrompt) pointerLockPrompt.classList.add('hidden');
    gameState = STATES.PAUSED;
    pauseModal.classList.remove('hidden');
    exitPointerLock();
  }

  function resumeGame() {
    if (pointerLockPrompt) pointerLockPrompt.classList.add('hidden');
    pauseModal.classList.add('hidden');
    gameState = STATES.PLAYING;
    requestPointerLock();
  }

  function returnToMainMenu() {
    if (pointerLockPrompt) pointerLockPrompt.classList.add('hidden');
    pauseModal.classList.add('hidden');
    gameOverModal.classList.add('hidden');
    victoryModal.classList.add('hidden');
    mainMenu.classList.remove('hidden');
    gameState = STATES.MENU;
    exitPointerLock();
    updateContinueButton();
  }

  function triggerGameOver() {
    if (pointerLockPrompt) pointerLockPrompt.classList.add('hidden');
    gameState = STATES.GAMEOVER;
    exitPointerLock();
    gameOverModal.classList.remove('hidden');
  }

  function triggerVictory() {
    if (pointerLockPrompt) pointerLockPrompt.classList.add('hidden');
    gameState = STATES.VICTORY;
    exitPointerLock();
    victoryModal.classList.remove('hidden');
    if (window.GameAudio) {
      window.GameAudio.playStinger();
    }
  }

  function updateContinueButton() {
    if (btnContinue) {
      btnContinue.disabled = !window.GameSave.hasSave();
    }
  }

  // Executa inicialização assim que o DOM carregar
  window.addEventListener('DOMContentLoaded', init);

  return {
    get gameState() { return gameState; },
    triggerGameOver,
    triggerVictory,
    saveCurrentProgress
  };
})();
