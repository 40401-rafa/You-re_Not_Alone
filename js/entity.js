/**
 * VOCÊ NÃO ESTÁ SOZINHO - Inteligência Artificial do Observador (entity.js)
 * Máquina de estados: IDLE, WATCHING, INVESTIGATING, SEARCHING, STALKING, ATTACKING, RETREATING.
 * Sistema de perfil do jogador (memoriza esconderijos, tempo nos cômodos, passos e hábitos).
 */

window.GameEntity = (function() {
  'use strict';

  // Estados Comportamentais
  const STATES = {
    IDLE: 'IDLE',
    WATCHING: 'WATCHING',
    INVESTIGATING: 'INVESTIGATING',
    SEARCHING: 'SEARCHING',
    STALKING: 'STALKING',
    ATTACKING: 'ATTACKING',
    RETREATING: 'RETREATING'
  };

  let currentState = STATES.IDLE;
  let isActive = false; // Visível no mundo
  const pos = { x: 1.2, y: 0.0, z: -8.5 }; // Posição 3D da criatura

  // Variáveis de Tempo e Transição
  let stateTimer = 0.0;
  let stateDuration = 5.0;
  let targetPos = { x: 1.2, y: 0.0, z: -8.5 };
  let moveSpeed = 1.4;

  // Profiling e Memória do Jogador
  const playerProfile = {
    roomTimes: {
      bedroom: 0,
      hallway: 0,
      livingRoom: 0,
      bathroom: 0,
      kitchen: 0
    },
    hidingSpotsUsed: {
      bathtub: 0
    },
    sprintCount: 0,
    doorsOpenedCount: 0,
    stareCount: 0,
    lastKnownPlayerPos: { x: 0, y: 0, z: 0 }
  };

  // Cooldown de aparições para priorizar terror psicológico sobre jumpscares
  let appearanceCooldown = 8.0;
  let breathingTimer = 0.0;

  function init() {
    currentState = STATES.IDLE;
    isActive = false;
    stateTimer = 0;
  }

  function reportSound(x, z, intensity = 8.0) {
    playerProfile.sprintCount++;
    playerProfile.lastKnownPlayerPos.x = x;
    playerProfile.lastKnownPlayerPos.z = z;

    // Se estiver em IDLE ou SEARCHING, investiga o ruído
    if (currentState === STATES.IDLE || currentState === STATES.SEARCHING) {
      if (Math.random() < 0.75) {
        changeState(STATES.INVESTIGATING, { x, y: 0, z });
      }
    }
  }

  function reportHiding(spotId) {
    if (spotId && playerProfile.hidingSpotsUsed[spotId] !== undefined) {
      playerProfile.hidingSpotsUsed[spotId]++;
    }
  }

  function changeState(newState, extraData = null) {
    currentState = newState;
    stateTimer = 0.0;

    switch (newState) {
      case STATES.IDLE:
        isActive = false;
        stateDuration = 8.0 + Math.random() * 12.0;
        break;

      case STATES.WATCHING:
        isActive = true;
        stateDuration = 4.5 + Math.random() * 3.5;
        // Posiciona a criatura em uma linha de visão distante (ex: fim do corredor ou fresta da porta)
        if (extraData) {
          pos.x = extraData.x;
          pos.z = extraData.z;
        }
        break;

      case STATES.INVESTIGATING:
        isActive = false; // Move-se nas sombras
        stateDuration = 7.0;
        if (extraData) {
          targetPos.x = extraData.x;
          targetPos.z = extraData.z;
        }
        break;

      case STATES.SEARCHING:
        isActive = false;
        stateDuration = 10.0;
        // Escolhe o cômodo mais frequentado pelo jogador ou onde ele costuma se esconder
        const targetRoom = pickTargetRoomBasedOnProfile();
        targetPos = getRoomCoordinates(targetRoom);
        break;

      case STATES.STALKING:
        isActive = true;
        stateDuration = 6.0;
        moveSpeed = 1.1;
        break;

      case STATES.ATTACKING:
        isActive = true;
        moveSpeed = 3.2;
        stateDuration = 4.0;
        if (window.GameAudio) {
          window.GameAudio.playStinger();
        }
        // Glitch na tela
        triggerGlitchFlash();
        break;

      case STATES.RETREATING:
        isActive = false;
        stateDuration = 9.0;
        break;
    }
  }

  function pickTargetRoomBasedOnProfile() {
    // Se o jogador usou muito a banheira, investiga o banheiro
    if (playerProfile.hidingSpotsUsed.bathtub >= 2 && Math.random() < 0.6) {
      return 'bathroom';
    }

    // Busca o cômodo onde o jogador passou mais tempo
    let maxTime = -1;
    let chosenRoom = 'hallway';
    for (const room in playerProfile.roomTimes) {
      if (playerProfile.roomTimes[room] > maxTime) {
        maxTime = playerProfile.roomTimes[room];
        chosenRoom = room;
      }
    }
    return chosenRoom;
  }

  function getRoomCoordinates(room) {
    switch (room) {
      case 'bedroom':    return { x: -3.0, y: 0, z: -3.0 };
      case 'livingRoom': return { x: -3.5, y: 0, z: 4.0 };
      case 'bathroom':   return { x: 5.0, y: 0, z: -1.5 };
      case 'kitchen':    return { x: 5.4, y: 0, z: 4.0 };
      default:           return { x: 1.2, y: 0, z: -4.0 }; // Corredor
    }
  }

  function updateRoomProfile(playerPos, dt) {
    const x = playerPos.x;
    const z = playerPos.z;

    if (x < 0 && z < 0) {
      playerProfile.roomTimes.bedroom += dt;
    } else if (x < 0 && z >= 0) {
      playerProfile.roomTimes.livingRoom += dt;
    } else if (x >= 2.4 && z < 1.0) {
      playerProfile.roomTimes.bathroom += dt;
    } else if (x >= 2.4 && z >= 1.0) {
      playerProfile.roomTimes.kitchen += dt;
    } else {
      playerProfile.roomTimes.hallway += dt;
    }
  }

  // =========================================================================
  // ATUALIZAÇÃO DA IA NO CICLO PRINCIPAL
  // =========================================================================
  function update(dt, player, world) {
    updateRoomProfile(player.pos, dt);

    stateTimer += dt;
    appearanceCooldown = Math.max(0, appearanceCooldown - dt);

    const distToPlayer = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);

    // Reproduz respiração profunda ocasional em 3D
    breathingTimer += dt;
    if (isActive && distToPlayer < 7.0 && breathingTimer > 5.0) {
      breathingTimer = 0;
      if (window.GameAudio) {
        const pan = (pos.x - player.pos.x) / 7.0;
        window.GameAudio.playWhisper(pan);
      }
    }

    // Máquina de Estados
    switch (currentState) {
      case STATES.IDLE:
        if (stateTimer >= stateDuration && appearanceCooldown <= 0) {
          decideNextAction(player);
        }
        break;

      case STATES.WATCHING:
        // Se o jogador estiver olhando diretamente para a criatura com a lanterna, ela se dissolve
        if (player.isFlashlightOn) {
          const toEntX = (pos.x - player.pos.x) / distToPlayer;
          const toEntZ = (pos.z - player.pos.z) / distToPlayer;
          const dot = player.forward.x * toEntX + player.forward.z * toEntZ;

          if (dot > 0.75) { // No foco central da luz
            playerProfile.stareCount++;
            // Fica por 0.8s estática e some nas sombras!
            if (stateTimer > 0.8) {
              dissolveAndRetreat();
            }
          }
        }

        // Se o jogador chegar muito perto (< 2.5m)
        if (distToPlayer < 2.5) {
          dissolveAndRetreat();
        }

        if (stateTimer >= stateDuration) {
          dissolveAndRetreat();
        }
        break;

      case STATES.INVESTIGATING:
        // Move-se silenciosamente até o ponto de barulho
        stepTowards(targetPos, moveSpeed, dt, world);
        if (Math.hypot(pos.x - targetPos.x, pos.z - targetPos.z) < 1.0 || stateTimer >= stateDuration) {
          changeState(STATES.SEARCHING);
        }
        break;

      case STATES.SEARCHING:
        // Verifica portas próximas ou se o jogador está escondido
        if (player.isHiding) {
          // Chance de descobrir o jogador se ele usou o esconderijo muitas vezes!
          if (playerProfile.hidingSpotsUsed.bathtub >= 3 && Math.random() < 0.02) {
            changeState(STATES.ATTACKING);
          }
        }
        if (stateTimer >= stateDuration) {
          changeState(STATES.IDLE);
        }
        break;

      case STATES.STALKING:
        // Segue atrás do jogador mantendo certa distância (3 a 6m)
        const behindX = player.pos.x - player.forward.x * 4.0;
        const behindZ = player.pos.z - player.forward.z * 4.0;
        targetPos.x = behindX;
        targetPos.z = behindZ;

        stepTowards(targetPos, moveSpeed, dt, world);

        // Se o jogador virar de repente, o Observador some na esquina
        const toEntX = (pos.x - player.pos.x) / distToPlayer;
        const toEntZ = (pos.z - player.pos.z) / distToPlayer;
        const lookDot = player.forward.x * toEntX + player.forward.z * toEntZ;
        if (lookDot > 0.6) {
          dissolveAndRetreat();
        }

        if (stateTimer >= stateDuration) {
          changeState(STATES.IDLE);
        }
        break;

      case STATES.ATTACKING:
        // Persegue diretamente o jogador!
        targetPos.x = player.pos.x;
        targetPos.z = player.pos.z;
        stepTowards(targetPos, moveSpeed, dt, world);

        // Se o jogador ligar a lanterna e encará-lo com luz forte, ele recua!
        if (player.isFlashlightOn && player.getFlashlightIntensity() > 0.6) {
          const toAttX = (pos.x - player.pos.x) / distToPlayer;
          const toAttZ = (pos.z - player.pos.z) / distToPlayer;
          const dot = player.forward.x * toAttX + player.forward.z * toAttZ;
          if (dot > 0.8) {
            triggerGlitchFlash();
            dissolveAndRetreat();
            if (window.GameStory) {
              window.GameStory.showSubtitle('A luz intensa afugentou a presença...', 3000);
            }
            return;
          }
        }

        // Se o jogador estiver escondido, não o pega
        if (player.isHiding) {
          dissolveAndRetreat();
          return;
        }

        // Se tocar no jogador (< 1.1m): Game Over
        if (distToPlayer < 1.1) {
          if (window.GameMain) {
            window.GameMain.triggerGameOver();
          }
        }

        if (stateTimer >= stateDuration) {
          dissolveAndRetreat();
        }
        break;

      case STATES.RETREATING:
        if (stateTimer >= stateDuration) {
          changeState(STATES.IDLE);
        }
        break;
    }
  }

  function decideNextAction(player) {
    appearanceCooldown = 15.0 + Math.random() * 15.0;

    // 1. Aparição sutil no fim do corredor (WATCHING)
    if (Math.random() < 0.6) {
      // Spawna na linha de visão distante
      const spawnDist = 9.0;
      const spawnX = player.pos.x + player.forward.x * spawnDist + (Math.random() - 0.5) * 2;
      const spawnZ = player.pos.z + player.forward.z * spawnDist + (Math.random() - 0.5) * 2;

      changeState(STATES.WATCHING, { x: spawnX, z: spawnZ });
      return;
    }

    // 2. Perseguição sorrateira pelas costas (STALKING)
    if (Math.random() < 0.4) {
      pos.x = player.pos.x - player.forward.x * 5.0;
      pos.z = player.pos.z - player.forward.z * 5.0;
      changeState(STATES.STALKING);
      return;
    }

    // 3. Procura ativa (SEARCHING)
    changeState(STATES.SEARCHING);
  }

  function stepTowards(target, speed, dt, world) {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.1) {
      const step = (speed * dt) / dist;
      pos.x += dx * step;
      pos.z += dz * step;
    }
  }

  function dissolveAndRetreat() {
    triggerGlitchFlash();
    if (window.GameAudio) {
      window.GameAudio.playWhisper(0);
    }
    changeState(STATES.RETREATING);
  }

  function triggerGlitchFlash() {
    const el = document.getElementById('glitch-flash');
    if (el) {
      el.style.opacity = '0.7';
      setTimeout(() => {
        el.style.opacity = '0';
      }, 90);
    }
  }

  function spawnScriptedEncounter(x, z) {
    pos.x = x;
    pos.y = 0;
    pos.z = z;
    changeState(STATES.WATCHING);
    isActive = true;
  }

  function serialize() {
    return {
      playerProfile: JSON.parse(JSON.stringify(playerProfile))
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (data.playerProfile) {
      Object.assign(playerProfile, data.playerProfile);
    }
  }

  return {
    init,
    update,
    reportSound,
    reportHiding,
    spawnScriptedEncounter,
    changeState,
    get pos() { return pos; },
    get isActive() { return isActive; },
    get currentState() { return currentState; },
    get playerProfile() { return playerProfile; },
    serialize,
    deserialize
  };
})();
