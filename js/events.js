/**
 * VOCÊ NÃO ESTÁ SOZINHO - Diretor de Eventos de Terror (events.js)
 * Gerencia eventos com roteiro psicológico (primeiro encontro no corredor, telefone tocando, TV ligando)
 * e eventos randômicos paranormais (passos distantes, portas batendo, sussurros nas paredes).
 */

window.GameEvents = (function() {
  'use strict';

  let randomEventTimer = 18.0;
  const executedScriptedEvents = {};

  function init() {
    randomEventTimer = 15.0 + Math.random() * 10.0;
  }

  // =========================================================================
  // ATUALIZAÇÃO DO DIRETOR NO CICLO PRINCIPAL
  // =========================================================================
  function update(dt, player, world, entity, story) {
    // 1. Verificação de Eventos com Roteiro (Scripted)
    checkScriptedEvents(player, world, entity, story);

    // 2. Eventos Paranormais Randômicos
    randomEventTimer -= dt;
    if (randomEventTimer <= 0) {
      randomEventTimer = 22.0 + Math.random() * 25.0;
      triggerRandomHorrorEvent(player, world);
    }
  }

  // =========================================================================
  // EVENTOS COM ROTEIRO
  // =========================================================================
  function checkScriptedEvents(player, world, entity, story) {
    // Evento 1: Primeiro Encontro no Corredor (Silhueta Distante)
    if (!executedScriptedEvents['corridor_silhouette']) {
      // Quando o jogador destranca a porta do quarto e pisa no corredor (x > -0.2)
      if (story.flags.bedroomUnlocked && player.pos.x > -0.2) {
        executedScriptedEvents['corridor_silhouette'] = true;
        story.flags.hallwayEncounterSeen = true;

        // Spawna a silhueta no fim do corredor
        if (entity) {
          entity.spawnScriptedEncounter(1.2, -8.0);
        }

        // Dá falha temporária na lâmpada do corredor sem deixar o jogo totalmente cego
        setTimeout(() => {
          if (window.GameAudio) window.GameAudio.playFlickerSpark(0);
          world.pointLights[1].intensity = 0.18;

          setTimeout(() => {
            world.pointLights[1].intensity = 0.70;
            if (entity && entity.currentState === 'WATCHING') {
              entity.changeState('RETREATING');
            }
            story.showSubtitle('O que... o que era aquilo no fim do corredor?!', 3500);
            story.setObjective('explore_hallway');
          }, 1200);
        }, 800);
      }
    }

    // Evento 2: Telefone Tocando na Sala
    if (!executedScriptedEvents['phone_ring']) {
      // Ativa depois que o jogador explora o corredor ou lê a nota da sala
      if (story.flags.hallwayEncounterSeen && (player.pos.z > 0 || story.hasReadDocument('note_living'))) {
        executedScriptedEvents['phone_ring'] = true;
        story.flags.phoneRang = true;

        setTimeout(() => {
          if (window.GameAudio) {
            window.GameAudio.startPhoneRing(-0.4);
          }
          const phoneObj = world.interactiveObjects.find(o => o.id === 'telephone');
          if (phoneObj) phoneObj.isRinging = true;

          story.showSubtitle('O telefone... está tocando sozinho no meio da madrugada...', 3800);
          story.setObjective('answer_phone');
        }, 5000);
      }
    }

    // Evento 3: A TV Liga Sozinha
    if (!executedScriptedEvents['tv_turn_on']) {
      // Se o jogador já atendeu o telefone e entrou na cozinha
      if (story.flags.phoneAnswered && player.pos.x > 2.8 && player.pos.z > 2.0) {
        executedScriptedEvents['tv_turn_on'] = true;
        world.setTVState(true);
        story.showSubtitle('A televisão ligou de repente na sala...', 3200);
      }
    }
  }

  // =========================================================================
  // EVENTOS RANDÔMICOS DE TERROR PSICOLÓGICO
  // =========================================================================
  function triggerRandomHorrorEvent(player, world) {
    const roll = Math.random();

    // Evento A: Sussurro Espacial no Ouvido Esquerdo ou Direito (30% de chance)
    if (roll < 0.30) {
      const pan = Math.random() < 0.5 ? -0.85 : 0.85;
      if (window.GameAudio) {
        window.GameAudio.playWhisper(pan);
      }
      player.sanity = Math.min(100, player.sanity + 8);
      return;
    }

    // Evento B: Tábua Rangendo em Cômodo Adjacente (25% de chance)
    if (roll < 0.55) {
      const pan = (Math.random() - 0.5) * 1.5;
      if (window.GameAudio) {
        window.GameAudio.playWoodCreak(pan, 0.3);
      }
      return;
    }

    // Evento C: Queda Repentina de Energia / Lâmpada Oscilando (20% de chance)
    if (roll < 0.75) {
      if (world.pointLights[1]) {
        world.pointLights[1].intensity = 0.20;
        if (window.GameAudio) window.GameAudio.playFlickerSpark(0.1);
        setTimeout(() => {
          world.pointLights[1].intensity = 0.70;
        }, 1800 + Math.random() * 1500);
      }
      return;
    }

    // Evento D: Passos de Alguém Andando no Andar de Cima ou Atrás (15% de chance)
    if (roll < 0.90) {
      if (window.GameAudio) {
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            window.GameAudio.playFootstep('wood', false, false);
          }, i * 550);
        }
      }
      return;
    }

    // Evento E: Trovão Distante e Tremor da Janela (10% de chance)
    if (window.GameAudio) {
      window.GameAudio.playThunder();
    }
  }

  function serialize() {
    return {
      executedScriptedEvents: { ...executedScriptedEvents }
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (data.executedScriptedEvents) {
      Object.assign(executedScriptedEvents, data.executedScriptedEvents);
    }
  }

  return {
    init,
    update,
    serialize,
    deserialize
  };
})();
