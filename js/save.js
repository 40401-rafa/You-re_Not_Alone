/**
 * VOCÊ NÃO ESTÁ SOZINHO - Sistema de Salvamento (save.js)
 * Gerencia persistência de dados no localStorage (progresso, inventário, portas e configurações)
 */

window.GameSave = (function() {
  'use strict';

  const SAVE_KEY = 'vnes_savegame_v1';
  const SETTINGS_KEY = 'vnes_settings_v1';

  const defaultSettings = {
    volume: 80,
    sensitivity: 1.5,
    vhsEnabled: true,
    invertY: false
  };

  function hasSave() {
    try {
      const data = localStorage.getItem(SAVE_KEY);
      return data !== null && data.length > 10;
    } catch (e) {
      console.warn('Erro ao acessar localStorage:', e);
      return false;
    }
  }

  function saveGame(gameState) {
    try {
      const payload = {
        timestamp: Date.now(),
        player: {
          x: gameState.player.pos.x,
          y: gameState.player.pos.y,
          z: gameState.player.pos.z,
          yaw: gameState.player.yaw,
          pitch: gameState.player.pitch,
          hasFlashlight: gameState.player.hasFlashlight,
          isFlashlightOn: gameState.player.isFlashlightOn,
          battery: gameState.player.battery,
          sanity: gameState.player.sanity
        },
        inventory: gameState.inventory.serialize(),
        world: gameState.world.serialize(),
        story: gameState.story.serialize(),
        events: gameState.events.serialize(),
        entity: gameState.entity.serialize()
      };

      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('Falha ao salvar jogo:', e);
      return false;
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Falha ao carregar jogo:', e);
      return null;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (e) {
      console.error('Falha ao limpar save:', e);
      return false;
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...defaultSettings };
      return { ...defaultSettings, ...JSON.parse(raw) };
    } catch (e) {
      return { ...defaultSettings };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    hasSave,
    saveGame,
    loadGame,
    clearSave,
    loadSettings,
    saveSettings
  };
})();
