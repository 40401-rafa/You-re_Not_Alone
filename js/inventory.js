/**
 * VOCÊ NÃO ESTÁ SOZINHO - Sistema de Inventário (inventory.js)
 * Gerencia itens coletados (chaves, lanterna, pilhas, anotações), exibição visual e uso.
 */

window.GameInventory = (function() {
  'use strict';

  const itemDefinitions = {
    flashlight: {
      id: 'flashlight',
      name: 'Lanterna Antiga',
      icon: '🔦',
      description: 'Uma lanterna de metal pesada, com lente ligeiramente riscada. Sua lâmpada consome pilhas gradualmente. Pressione [F] para ligar ou desligar.',
      usable: false
    },
    key_bedroom: {
      id: 'key_bedroom',
      name: 'Chave do Quarto',
      icon: '🗝️',
      description: 'Uma chave de latão escurecida pelo tempo. Destranca a porta de saída do quarto inicial.',
      usable: false
    },
    key_exit: {
      id: 'key_exit',
      name: 'Chave da Porta da Frente',
      icon: '🔑',
      description: 'Uma chave pesada de ferro forjado, gelada ao toque. É a sua única chance de abrir a porta principal e escapar da casa.',
      usable: false
    },
    battery: {
      id: 'battery',
      name: 'Pilha Alcalina',
      icon: '🔋',
      description: 'Uma pilha padrão conservada. Restaura 50% da carga de energia da sua lanterna quando utilizada.',
      usable: true,
      actionText: 'USAR PILHA'
    }
  };

  let items = {};
  let selectedItemId = null;
  let isOpen = false;

  function addItem(itemId, count = 1) {
    if (!itemDefinitions[itemId] && !itemId.startsWith('note_')) {
      console.warn('Item desconhecido:', itemId);
      return false;
    }

    if (!items[itemId]) {
      items[itemId] = 0;
    }
    items[itemId] += count;

    if (window.GameAudio) {
      window.GameAudio.playItemPickup();
    }

    const def = getItemInfo(itemId);
    if (window.GameStory) {
      window.GameStory.showToast(`ITEM OBTIDO: ${def.name}`);
    }

    renderInventoryUI();
    return true;
  }

  function removeItem(itemId, count = 1) {
    if (!items[itemId] || items[itemId] < count) return false;
    items[itemId] -= count;
    if (items[itemId] <= 0) {
      delete items[itemId];
      if (selectedItemId === itemId) {
        selectedItemId = null;
      }
    }
    renderInventoryUI();
    return true;
  }

  function hasItem(itemId) {
    return !!items[itemId] && items[itemId] > 0;
  }

  function getItemCount(itemId) {
    return items[itemId] || 0;
  }

  function getItemInfo(itemId) {
    if (itemDefinitions[itemId]) {
      return itemDefinitions[itemId];
    }
    // Suporte para notas guardadas
    if (itemId.startsWith('note_') && window.GameStory) {
      const doc = window.GameStory.getDocument(itemId);
      if (doc) {
        return {
          id: itemId,
          name: doc.title,
          icon: '📜',
          description: `Documento recolhido: "${doc.title}". Registrado em ${doc.date}.\nPressione para ler novamente.`,
          usable: true,
          actionText: 'LER ANOTAÇÃO'
        };
      }
    }
    return { id: itemId, name: 'Item Desconhecido', icon: '❓', description: '', usable: false };
  }

  function useItem(itemId) {
    if (!hasItem(itemId)) return;

    if (itemId === 'battery') {
      if (window.GamePlayer) {
        const recharged = window.GamePlayer.addBattery(50);
        if (recharged) {
          removeItem('battery', 1);
          if (window.GameStory) {
            window.GameStory.showToast('Lanterna recarregada em +50%!');
          }
          if (window.GameAudio) {
            window.GameAudio.playFlashlightClick();
          }
        } else {
          if (window.GameStory) {
            window.GameStory.showToast('A lanterna já está com a bateria cheia.');
          }
        }
      }
    } else if (itemId.startsWith('note_')) {
      if (window.GameStory) {
        close();
        window.GameStory.openDocumentModal(itemId);
      }
    }
    renderInventoryUI();
  }

  function renderInventoryUI() {
    const container = document.getElementById('inventory-slots-container');
    const titleEl = document.getElementById('inv-detail-title');
    const descEl = document.getElementById('inv-detail-desc');
    const actionsEl = document.getElementById('inv-detail-actions');
    if (!container) return;

    container.innerHTML = '';
    const itemKeys = Object.keys(items);

    // Cria 8 slots
    const totalSlots = Math.max(8, itemKeys.length);
    for (let i = 0; i < totalSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot';

      const key = itemKeys[i];
      if (key) {
        const info = getItemInfo(key);
        const count = items[key];

        slot.innerHTML = `
          <div class="slot-icon">${info.icon}</div>
          <div class="slot-name">${info.name}</div>
          ${count > 1 ? `<div class="slot-count">x${count}</div>` : ''}
        `;

        if (selectedItemId === key) {
          slot.classList.add('active');
        }

        slot.addEventListener('click', () => {
          selectedItemId = key;
          renderInventoryUI();
        });
      } else {
        slot.style.opacity = '0.3';
      }

      container.appendChild(slot);
    }

    // Renderiza detalhes do item selecionado
    if (selectedItemId && items[selectedItemId]) {
      const info = getItemInfo(selectedItemId);
      if (titleEl) titleEl.textContent = info.name;
      if (descEl) descEl.textContent = info.description;
      if (actionsEl) {
        actionsEl.innerHTML = '';
        if (info.usable) {
          const btn = document.createElement('button');
          btn.className = 'menu-btn primary-btn';
          btn.textContent = info.actionText || 'USAR';
          btn.addEventListener('click', () => useItem(selectedItemId));
          actionsEl.appendChild(btn);
        }
      }
    } else {
      if (titleEl) titleEl.textContent = 'Nenhum item selecionado';
      if (descEl) descEl.textContent = 'Clique em um item da lista para visualizar suas propriedades.';
      if (actionsEl) actionsEl.innerHTML = '';
    }
  }

  function open() {
    isOpen = true;
    const modal = document.getElementById('inventory-modal');
    if (modal) modal.classList.remove('hidden');
    renderInventoryUI();
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  function close() {
    isOpen = false;
    const modal = document.getElementById('inventory-modal');
    if (modal) modal.classList.add('hidden');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function serialize() {
    return {
      items: { ...items }
    };
  }

  function deserialize(data) {
    if (!data) return;
    items = { ...(data.items || {}) };
    renderInventoryUI();
  }

  return {
    get isOpen() { return isOpen; },
    addItem,
    removeItem,
    hasItem,
    getItemCount,
    useItem,
    open,
    close,
    toggle,
    serialize,
    deserialize
  };
})();
