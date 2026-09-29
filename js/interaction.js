/**
 * VOCÊ NÃO ESTÁ SOZINHO - Sistema de Interação do Jogador (interaction.js)
 * Raycasting frontal, detecção de portas, chaves, documentos, telefone e esconderijos.
 */

window.GameInteraction = (function() {
  'use strict';

  let currentTarget = null;
  const promptEl = document.getElementById('interaction-prompt');
  const promptTextEl = document.getElementById('interaction-text');
  const crosshairEl = document.getElementById('crosshair');

  function init() {
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'e') {
        interact();
      }
    });
  }

  // =========================================================================
  // ATUALIZAÇÃO DO FOCO DE INTERAÇÃO (RAYCASTING FRONTAL)
  // =========================================================================
  function update(player, world) {
    if (player.isHiding) {
      currentTarget = { type: 'exit_hiding', prompt: 'Sair do Esconderijo [E]' };
      showPrompt(currentTarget.prompt);
      return;
    }

    const eye = {
      x: player.pos.x,
      y: player.pos.y + player.cameraHeightOffset,
      z: player.pos.z
    };

    currentTarget = world.getInteractable(eye, player.forward, 2.4);

    if (currentTarget) {
      let promptMsg = currentTarget.prompt;

      // Mensagens contextuais dinâmicas
      if (currentTarget.type === 'door') {
        const door = world.doors[currentTarget.doorRef];
        if (door) {
          if (door.isLocked) {
            promptMsg = `Destrancar ${door.name} [E]`;
          } else {
            promptMsg = door.isOpen ? `Fechar ${door.name} [E]` : `Abrir ${door.name} [E]`;
          }
        }
      } else if (currentTarget.type === 'telephone') {
        promptMsg = currentTarget.isRinging ? 'Atender Telefone [E]' : 'Telefone Mudo';
      }

      showPrompt(promptMsg);
      if (crosshairEl) crosshairEl.classList.add('active');
    } else {
      hidePrompt();
      if (crosshairEl) crosshairEl.classList.remove('active');
    }
  }

  function showPrompt(text) {
    if (promptTextEl) promptTextEl.textContent = text;
    if (promptEl) promptEl.classList.add('visible');
  }

  function hidePrompt() {
    if (promptEl) promptEl.classList.remove('visible');
  }

  // =========================================================================
  // EXECUÇÃO DA INTERAÇÃO ([E])
  // =========================================================================
  function interact() {
    if (!currentTarget) return;

    const player = window.GamePlayer;
    const world = window.GameWorld;
    const inventory = window.GameInventory;
    const story = window.GameStory;
    const audio = window.GameAudio;

    // 1. Sair do esconderijo
    if (currentTarget.type === 'exit_hiding') {
      player.setHiding(false);
      return;
    }

    // 2. Coleta de Itens do Cenário (Lanterna, Chaves, Pilhas)
    if (currentTarget.type === 'item') {
      currentTarget.collected = true;
      inventory.addItem(currentTarget.itemId);

      if (currentTarget.itemId === 'flashlight') {
        player.hasFlashlight = true;
        player.isFlashlightOn = true;
        story.flags.hasFlashlight = true;
        story.setObjective('find_bedroom_key');
        story.showSubtitle('Uma lanterna velha. A lâmpada ainda acende, mas preciso cuidar da bateria.', 3600);
      } else if (currentTarget.itemId === 'key_bedroom') {
        story.showSubtitle('A chave do quarto! Agora posso destrancar a porta.', 3200);
      } else if (currentTarget.itemId === 'key_exit') {
        story.flags.exitKeyFound = true;
        story.setObjective('escape_house');
        story.showSubtitle('Encontrei a Chave da Porta Principal! Preciso correr até a entrada e fugir!', 4000);
      }
      return;
    }

    // 3. Leitura de Documentos
    if (currentTarget.type === 'document') {
      story.openDocumentModal(currentTarget.docId);
      // Adiciona cópia ao inventário para reler
      if (!inventory.hasItem(currentTarget.docId)) {
        inventory.addItem(currentTarget.docId);
      }
      return;
    }

    // 4. Manipulação de Portas
    if (currentTarget.type === 'door') {
      const door = world.doors[currentTarget.doorRef];
      if (!door) return;

      if (door.isLocked) {
        // Verifica se o jogador tem a chave correspondente
        if (door.requiredKey && inventory.hasItem(door.requiredKey)) {
          world.unlockDoor(currentTarget.doorRef);
          world.toggleDoor(currentTarget.doorRef);
          if (audio) {
            audio.playDoorCreak(0);
            audio.playDoorLatching(0);
          }

          if (currentTarget.doorRef === 'bedroomDoor') {
            story.flags.bedroomUnlocked = true;
            story.setObjective('explore_hallway');
            story.showSubtitle('A porta do quarto foi destrancada.', 2800);
          } else if (currentTarget.doorRef === 'frontDoor') {
            // FIM DO CAPÍTULO 1 / VITÓRIA!
            if (window.GameMain) {
              window.GameMain.triggerVictory();
            }
          }
        } else {
          // Trancada sem chave
          if (audio) audio.playDoorLatching(0);
          if (currentTarget.doorRef === 'frontDoor') {
            story.showSubtitle('A porta da frente está travada com cadeados pesados. Preciso da chave da saída.', 3500);
          } else {
            story.showSubtitle('A porta está trancada por fora. Preciso encontrar a chave.', 3000);
          }
        }
      } else {
        // Porta destrancada: abre ou fecha
        const state = world.toggleDoor(currentTarget.doorRef);
        if (audio) {
          if (state === 'opened') audio.playDoorCreak(0);
          else audio.playDoorSlam(0);
        }
      }
      return;
    }

    // 5. Esconderijo (Banheira)
    if (currentTarget.type === 'hiding') {
      player.setHiding(true, 'bathtub');
      if (window.GameEntity) {
        window.GameEntity.reportHiding('bathtub');
      }
      return;
    }

    // 6. Atender Telefone
    if (currentTarget.type === 'telephone') {
      if (currentTarget.isRinging) {
        currentTarget.isRinging = false;
        story.flags.phoneAnswered = true;
        if (audio) audio.playPhoneAnswer();

        story.showSubtitle('A linha fez um estalo estático... E uma voz sussurrou: "ELE ESTÁ ATRÁS DE VOCÊ".', 4500);
        story.setObjective('find_exit_key');

        // Cria pequeno susto na sala
        setTimeout(() => {
          if (audio) audio.playWoodCreak(0.3, 0.4);
        }, 3000);
      } else {
        story.showSubtitle('A linha está completamente muda. Apenas um ruído estático distante.', 2500);
      }
      return;
    }

    // 7. Aparelho de TV
    if (currentTarget.type === 'tv') {
      currentTarget.isOn = !currentTarget.isOn;
      world.setTVState(currentTarget.isOn);
      return;
    }
  }

  return {
    init,
    update
  };
})();
