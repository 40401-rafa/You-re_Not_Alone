/**
 * VOCÊ NÃO ESTÁ SOZINHO - Controlador em Primeira Pessoa (player.js)
 * Câmera 6-DOF com Pointer Lock, movimentação, corrida, agachamento,
 * lanterna com drenagem de bateria e sistema de paranoia/sanidade.
 */

window.GamePlayer = (function() {
  'use strict';

  // Posição e Rotação da Câmera
  const pos = { x: -4.0, y: 0.0, z: -4.0 }; // Inicia no Quarto
  let yaw = 0.0;     // Rotação horizontal (radianos)
  let pitch = 0.0;   // Rotação vertical (radianos)

  const forward = { x: 0, y: 0, z: -1 };
  const right = { x: 1, y: 0, z: 0 };

  // Configurações de Câmera
  let mouseSensitivity = 0.0022;
  let invertY = false;
  const fovRad = 70 * Math.PI / 180;

  // Alturas e Transição de Agachamento
  const STAND_HEIGHT = 1.65;
  const CROUCH_HEIGHT = 0.95;
  let currentHeight = STAND_HEIGHT;
  let targetHeight = STAND_HEIGHT;
  let cameraHeightOffset = STAND_HEIGHT;

  // Estados de Movimento
  let isMoving = false;
  let isRunning = false;
  let isCrouching = false;
  let isHiding = false;
  let hidingSpotId = null;

  // Estamina (0 a 100)
  let stamina = 100.0;
  const MAX_STAMINA = 100.0;

  // Lanterna
  let hasFlashlight = false;
  let isFlashlightOn = false;
  let battery = 100.0; // 0 a 100%
  let flashlightFlicker = 1.0;
  let flickerTimer = 0;

  // Paranoia / Sanidade (0 a 100)
  let sanity = 0.0;
  let cameraShake = 0.0;

  // Balanço da Câmera (Head Bobbing)
  let bobTimer = 0.0;
  let footstepTimer = 0.0;

  // Dicionário de estado contínuo das teclas (baseado em event.code)
  const keys = {};

  function init() {
    setupInputListeners();
    updateVectors();
  }

  function setupInputListeners() {
    window.addEventListener('keydown', (event) => {
      keys[event.code] = true;

      // Impede comportamentos padrão do navegador (ex: scroll nas setas / espaço)
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }

      if (event.repeat) return;

      // Agachar ao pressionar C ou Ctrl
      if (event.code === 'KeyC' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
        toggleCrouch();
      }

      // Alternar Lanterna [F]
      if (event.code === 'KeyF') {
        toggleFlashlight();
      }
    });

    window.addEventListener('keyup', (event) => {
      keys[event.code] = false;
    });

    // Se a janela perder foco, limpa o estado das teclas para não travar andando
    window.addEventListener('blur', () => {
      for (const k in keys) {
        keys[k] = false;
      }
    });

    // Movimentação do Mouse via Pointer Lock
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        handleMouseMove(e.movementX, e.movementY);
      }
    });

    // Botão direito do mouse também alterna a lanterna
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2 && document.pointerLockElement) {
        e.preventDefault();
        toggleFlashlight();
      }
    });

    // Bloqueia menu de contexto no botão direito do mouse
    window.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement) e.preventDefault();
    });
  }

  function handleMouseMove(dx, dy) {
    if (isHiding) return; // Não vira a câmera livremente quando escondido

    yaw -= dx * mouseSensitivity;

    const yFactor = invertY ? -1 : 1;
    pitch -= dy * mouseSensitivity * yFactor;

    // Limita inclinação vertical (Pitch) entre -84° e +84°
    const maxPitch = 84 * Math.PI / 180;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

    updateVectors();
  }

  function updateVectors() {
    // Vetores de direção da câmera
    forward.x = Math.sin(yaw) * Math.cos(pitch);
    forward.y = Math.sin(pitch);
    forward.z = -Math.cos(yaw) * Math.cos(pitch);

    // Normaliza Forward
    const fLen = Math.hypot(forward.x, forward.y, forward.z);
    forward.x /= fLen;
    forward.y /= fLen;
    forward.z /= fLen;

    // Vetor lateral (Right) perpendicular no plano XZ
    right.x = Math.cos(yaw);
    right.y = 0;
    right.z = Math.sin(yaw);

    const rLen = Math.hypot(right.x, right.z);
    right.x /= rLen;
    right.z /= rLen;
  }

  function toggleCrouch() {
    if (isHiding) return;
    isCrouching = !isCrouching;
    targetHeight = isCrouching ? CROUCH_HEIGHT : STAND_HEIGHT;
  }

  function toggleFlashlight() {
    if (!hasFlashlight) {
      if (window.GameStory) {
        window.GameStory.showSubtitle('Não tenho nenhuma lanterna... preciso encontrar uma fonte de luz.', 2500);
      }
      return;
    }

    if (battery <= 0) {
      if (window.GameStory) {
        window.GameStory.showSubtitle('A lanterna está totalmente sem bateria.', 2500);
      }
      if (window.GameAudio) window.GameAudio.playFlashlightClick();
      isFlashlightOn = false;
      return;
    }

    isFlashlightOn = !isFlashlightOn;

    if (window.GameAudio) {
      window.GameAudio.playFlashlightClick();
    }
  }

  function addBattery(amount) {
    if (battery >= 99.5) return false;
    battery = Math.min(100.0, battery + amount);
    updateBatteryHUD();
    return true;
  }

  function updateBatteryHUD() {
    const hud = document.getElementById('flashlight-hud');
    const bar = document.getElementById('battery-level-bar');
    const text = document.getElementById('battery-percent-text');

    if (!hud) return;

    if (hasFlashlight) {
      hud.classList.remove('hidden');
    }

    if (bar && text) {
      bar.style.width = Math.max(0, battery) + '%';
      text.textContent = Math.round(battery) + '%';

      if (battery > 40) {
        bar.className = 'battery-level';
      } else if (battery > 15) {
        bar.className = 'battery-level warning';
      } else {
        bar.className = 'battery-level critical';
      }
    }
  }

  function setHiding(active, spotId = null) {
    isHiding = active;
    hidingSpotId = spotId;

    const ind = document.getElementById('hiding-indicator');
    if (ind) {
      if (active) ind.classList.remove('hidden');
      else ind.classList.add('hidden');
    }

    if (active) {
      targetHeight = CROUCH_HEIGHT;
      if (window.GameStory) {
        window.GameStory.showSubtitle('Você está escondido. Fique em silêncio absoluto...', 3000);
      }
    } else {
      targetHeight = isCrouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    }
  }

  // =========================================================================
  // ATUALIZAÇÃO DO JOGADOR NO CICLO PRINCIPAL (PHYSICS & LOGIC)
  // =========================================================================
  function update(dt, world, entity) {
    if (isHiding) {
      // Se escondido, acalma o jogador gradualmente
      if (sanity > 0) sanity = Math.max(0, sanity - dt * 4.0);
      updateSanityEffects(dt);
      return;
    }

    // 1. Transição suave de altura da câmera (Agachamento)
    currentHeight += (targetHeight - currentHeight) * Math.min(1.0, dt * 10.0);
    cameraHeightOffset = currentHeight;

    // 2. Verificação contínua das teclas de movimentação WASD e Setas
    const isForward = !!(keys['KeyW'] || keys['ArrowUp']);
    const isBackward = !!(keys['KeyS'] || keys['ArrowDown']);
    const isLeft = !!(keys['KeyA'] || keys['ArrowLeft']);
    const isRight = !!(keys['KeyD'] || keys['ArrowRight']);
    const isRunKey = !!(keys['ShiftLeft'] || keys['ShiftRight']);

    isRunning = isRunKey && !isCrouching && stamina > 5 && (isForward || isBackward || isLeft || isRight);

    let speed = 2.6; // Andar padrão ágil e responsivo (m/s)
    if (isRunning) {
      speed = 5.0;
      stamina = Math.max(0, stamina - dt * 25.0);
    } else {
      if (isCrouching) {
        speed = 1.4;
      }
      // Regeneração de estamina
      stamina = Math.min(MAX_STAMINA, stamina + dt * 16.0);
    }

    // Atualiza barra de estamina na interface
    const staminaBar = document.getElementById('stamina-bar');
    const staminaHud = document.getElementById('stamina-hud');
    if (staminaBar && staminaHud) {
      staminaBar.style.width = stamina + '%';
      if (stamina < 98) staminaHud.classList.add('visible');
      else staminaHud.classList.remove('visible');
    }

    // 3. Vetor de Movimento Contínuo e Imediato
    let moveX = 0;
    let moveZ = 0;

    // Projeção no plano horizontal XZ
    const fHorizX = Math.sin(yaw);
    const fHorizZ = -Math.cos(yaw);

    if (isForward)  { moveX += fHorizX; moveZ += fHorizZ; }
    if (isBackward) { moveX -= fHorizX; moveZ -= fHorizZ; }
    if (isRight)    { moveX += right.x; moveZ += right.z; }
    if (isLeft)     { moveX -= right.x; moveZ -= right.z; }

    const moveLen = Math.hypot(moveX, moveZ);
    isMoving = moveLen > 0.01;

    // Feedback visual imediato de movimentação no retículo
    const crosshairEl = document.getElementById('crosshair');
    if (crosshairEl) {
      if (isMoving) {
        crosshairEl.classList.add('moving');
        if (isRunning) crosshairEl.classList.add('running');
        else crosshairEl.classList.remove('running');
      } else {
        crosshairEl.classList.remove('moving');
        crosshairEl.classList.remove('running');
      }
    }

    if (isMoving) {
      moveX = (moveX / moveLen) * speed * dt;
      moveZ = (moveZ / moveLen) * speed * dt;

      // Colisão Deslizante em X
      const newX = pos.x + moveX;
      if (!world.checkCollision(newX, pos.z, 0.32)) {
        pos.x = newX;
      }

      // Colisão Deslizante em Z
      const newZ = pos.z + moveZ;
      if (!world.checkCollision(pos.x, newZ, 0.32)) {
        pos.z = newZ;
      }

      // Balanço de passos (Head Bobbing)
      const bobFreq = isRunning ? 14.0 : (isCrouching ? 6.0 : 9.0);
      bobTimer += dt * bobFreq;
      const bobAmt = isRunning ? 0.045 : (isCrouching ? 0.012 : 0.024);
      cameraHeightOffset = currentHeight + Math.sin(bobTimer) * bobAmt;

      // Disparo de Som de Passos
      const footInterval = isRunning ? 0.32 : (isCrouching ? 0.65 : 0.48);
      footstepTimer += dt;
      if (footstepTimer >= footInterval) {
        footstepTimer = 0;
        const surface = detectSurface(pos.x, pos.z);
        if (window.GameAudio) {
          window.GameAudio.playFootstep(surface, isRunning, isCrouching);
        }

        // Corrida faz barulho e alerta o Observador!
        if (isRunning && entity) {
          entity.reportSound(pos.x, pos.z, 12.0);
        }
      }
    } else {
      // Respiração suave ao ficar parado
      bobTimer += dt * 1.8;
      cameraHeightOffset = currentHeight + Math.sin(bobTimer) * 0.008;
      footstepTimer = 0.2;
    }

    // 4. Drenagem de Bateria da Lanterna
    if (hasFlashlight && isFlashlightOn) {
      battery = Math.max(0, battery - dt * 0.12);
      if (battery <= 0) {
        isFlashlightOn = false;
        if (window.GameAudio) window.GameAudio.playFlashlightClick();
      }
      updateBatteryHUD();
    }

    // 5. Tremor da Lanterna (Flickering)
    updateFlashlightFlicker(dt, entity);

    // 6. Atualização de Sanidade e Paranoia
    updateSanity(dt, entity);
  }

  function detectSurface(x, z) {
    // Banheiro fica em x: 2.4 a 7.4, z: -4 a 1
    if (x >= 2.4 && x <= 7.4 && z >= -4.0 && z <= 1.0) {
      return 'tile';
    }
    // Cozinha fica em x: 2.4 a 8.4, z: 1 a 7
    if (x >= 2.4 && x <= 8.4 && z >= 1.0 && z <= 7.0) {
      return 'tile';
    }
    return 'wood';
  }

  function updateFlashlightFlicker(dt, entity) {
    if (!isFlashlightOn) {
      flashlightFlicker = 0.0;
      return;
    }

    flickerTimer += dt;
    // Pequena oscilação sutil e realista no filamento da lâmpada
    let baseFlicker = 1.0 + Math.sin(flickerTimer * 5.0) * 0.025;

    // Pisca apenas quando a bateria está criticamente baixa (< 12%)
    if (battery < 12.0) {
      if (Math.random() < 0.12) {
        baseFlicker = Math.random() * 0.4 + 0.2;
      }
    }

    // Pisca ocasionalmente se O Observador estiver muito perto (< 5.0m)
    if (entity && entity.isActive) {
      const dist = Math.hypot(entity.pos.x - pos.x, entity.pos.z - pos.z);
      if (dist < 5.0) {
        const glitchFactor = (5.0 - dist) / 5.0;
        if (Math.random() < glitchFactor * 0.25) {
          baseFlicker = Math.random() * 0.35 + 0.2;
          if (Math.random() < 0.15 && window.GameAudio) {
            window.GameAudio.playFlickerSpark((Math.random() - 0.5) * 0.5);
          }
        }
      }
    }

    flashlightFlicker = baseFlicker;
  }

  function getFlashlightIntensity() {
    if (!isFlashlightOn) return 0.0;
    const battFactor = Math.min(1.0, battery / 20.0);
    return flashlightFlicker * Math.max(0.45, battFactor);
  }

  function updateSanity(dt, entity) {
    let deltaSanity = 0;

    // Escuridão total aumenta paranoia
    if (!isFlashlightOn) {
      deltaSanity += dt * 3.5;
    } else {
      deltaSanity -= dt * 2.0;
    }

    // Proximidade com o Observador
    if (entity && entity.isActive) {
      const dist = Math.hypot(entity.pos.x - pos.x, entity.pos.z - pos.z);
      if (dist < 8.0) {
        deltaSanity += dt * (8.0 - dist) * 2.8;

        // Se o jogador estiver olhando diretamente para a criatura, pânico extremo!
        const toEntX = (entity.pos.x - pos.x) / dist;
        const toEntZ = (entity.pos.z - pos.z) / dist;
        const dot = forward.x * toEntX + forward.z * toEntZ;
        if (dot > 0.65) {
          deltaSanity += dt * 22.0;
        }
      }
    }

    sanity = Math.max(0, Math.min(100, sanity + deltaSanity));
    updateSanityEffects(dt);
  }

  function updateSanityEffects(dt) {
    const pulseEl = document.getElementById('sanity-pulse');

    if (sanity > 25) {
      // Ativa batimentos cardíacos
      const bpm = 65 + (sanity - 25) * 1.1; // 65 a 145 BPM
      const intensity = (sanity - 25) / 75;
      if (window.GameAudio) {
        window.GameAudio.setHeartbeat(true, bpm, intensity);
      }

      if (pulseEl) {
        const opacity = ((sanity - 25) / 75) * 0.65;
        pulseEl.style.opacity = opacity.toFixed(2);
      }
    } else {
      if (window.GameAudio) {
        window.GameAudio.setHeartbeat(false);
      }
      if (pulseEl) {
        pulseEl.style.opacity = '0';
      }
    }
  }

  function setSensitivity(val) {
    mouseSensitivity = 0.0015 * val;
  }

  function setInvertY(val) {
    invertY = !!val;
  }

  return {
    init,
    update,
    get pos() { return pos; },
    get forward() { return forward; },
    get right() { return right; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    set yaw(v) { yaw = v; updateVectors(); },
    set pitch(v) { pitch = v; updateVectors(); },
    get cameraHeightOffset() { return cameraHeightOffset; },
    get fovRad() { return fovRad; },
    get hasFlashlight() { return hasFlashlight; },
    set hasFlashlight(v) { hasFlashlight = v; updateBatteryHUD(); },
    get isFlashlightOn() { return isFlashlightOn; },
    set isFlashlightOn(v) { isFlashlightOn = v; },
    get battery() { return battery; },
    set battery(v) { battery = v; updateBatteryHUD(); },
    get sanity() { return sanity; },
    set sanity(v) { sanity = v; },
    get isHiding() { return isHiding; },
    get isRunning() { return isRunning; },
    get isCrouching() { return isCrouching; },
    toggleFlashlight,
    addBattery,
    setHiding,
    setSensitivity,
    setInvertY,
    getFlashlightIntensity
  };
})();
