/**
 * VOCÊ NÃO ESTÁ SOZINHO - Sistema de História, Documentos e Objetivos (story.js)
 * Gerencia a narrativa psicológica, anotações misteriosas, pistas e progressão do Capítulo 1.
 */

window.GameStory = (function() {
  'use strict';

  // Banco de anotações encontráveis na casa
  const documents = {
    note_bedroom: {
      id: 'note_bedroom',
      title: 'Anotação Rasgada',
      date: '14 de Outubro',
      text: `Ouvi passos no corredor tarde da noite.

Moro sozinho nesta casa velha há mais de dez anos... ninguém deveria estar aqui a esta hora.

Tranquei a porta do quarto por dentro com a chave, mas a sensação de que há alguém parado do outro lado da fechadura não me deixa dormir.

Seja lá o que for, parece estar esperando.`
    },
    note_living: {
      id: 'note_living',
      title: 'Página Solta',
      date: '17 de Outubro',
      text: `Tenho certeza absoluta de que alguém entrou no meu quarto enquanto eu dormia.

As gavetas da cômoda estavam entreabertas. Encontrei marcas estranhas no assoalho, como cinzas pretas ou poeira queimada.

O telefone tocou pontualmente às 3h33 da madrugada. Quando atendi com as mãos trêmulas, não havia voz... apenas uma respiração lenta e profunda bem no meu ouvido.

Alguém está aqui dentro comigo.`
    },
    note_kitchen: {
      id: 'note_kitchen',
      title: 'Bilhete Apressado',
      date: '21 de Outubro',
      text: `Ele sabe exatamente onde estou a cada segundo.

Quando fecho os olhos na escuridão, sinto o ar gélido da presença dele no meu pescoço. Não adianta ligar as luzes; as lâmpadas estouram sozinhas.

Guardei a Chave da Porta da Frente no balcão da cozinha, escondida entre os armários. 

Preciso fugir desta casa antes do amanhecer. Não aguento mais os olhares.`
    },
    note_study: {
      id: 'note_study',
      title: 'Último Registro',
      date: '24 de Outubro',
      text: `Se você está lendo isso, provavelmente já percebeu que ele também está aí com você.

Ele é O Observador. Ele não corre imediatamente até você. Ele aprende seus hábitos, grava os cômodos onde você se esconde e aguarda você se descuidar.

Não gaste a bateria da lanterna à toa.
Não faça barulho correndo pelos cômodos.

E acima de tudo... NUNCA OLHE PARA TRÁS quando ouvir o assoalho ranger atrás de você.`
    }
  };

  // Fases de objetivos
  const objectives = {
    find_light: {
      id: 'find_light',
      text: 'Explore o quarto e encontre uma lanterna'
    },
    find_bedroom_key: {
      id: 'find_bedroom_key',
      text: 'Procure pela chave do quarto para destrancar a porta'
    },
    explore_hallway: {
      id: 'explore_hallway',
      text: 'Saia do quarto e investigue os sons na casa'
    },
    answer_phone: {
      id: 'answer_phone',
      text: 'Atenda o telefone tocando na sala de estar'
    },
    find_exit_key: {
      id: 'find_exit_key',
      text: 'Encontre a Chave da Porta Principal (verifique a cozinha)'
    },
    escape_house: {
      id: 'escape_house',
      text: 'Corra até a porta da frente e escape da casa!'
    }
  };

  let currentObjective = objectives.find_light;
  let readDocuments = [];
  let flags = {
    hasFlashlight: false,
    bedroomUnlocked: false,
    hallwayEncounterSeen: false,
    phoneRang: false,
    phoneAnswered: false,
    kitchenVisited: false,
    exitKeyFound: false,
    climaxActive: false,
    escaped: false
  };

  let subtitleTimeout = null;

  function setObjective(objKey) {
    if (objectives[objKey]) {
      currentObjective = objectives[objKey];
      const el = document.getElementById('objective-text');
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => {
          el.textContent = currentObjective.text;
          el.style.opacity = '1';
        }, 300);
      }
      showToast('NOVO OBJETIVO: ' + currentObjective.text);
    }
  }

  function getDocument(id) {
    return documents[id] || null;
  }

  function markDocumentRead(id) {
    if (!readDocuments.includes(id)) {
      readDocuments.push(id);
    }
  }

  function hasReadDocument(id) {
    return readDocuments.includes(id);
  }

  function showSubtitle(text, durationMs = 3800) {
    const el = document.getElementById('subtitles');
    if (!el) return;

    if (subtitleTimeout) {
      clearTimeout(subtitleTimeout);
    }

    el.textContent = text;
    el.classList.add('active');

    subtitleTimeout = setTimeout(() => {
      el.classList.remove('active');
    }, durationMs);
  }

  function showToast(text) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 4000);
  }

  function openDocumentModal(docId) {
    const doc = getDocument(docId);
    if (!doc) return;

    markDocumentRead(docId);

    const modal = document.getElementById('document-modal');
    const dateEl = document.getElementById('doc-date');
    const textEl = document.getElementById('doc-text');

    if (dateEl) dateEl.textContent = doc.date;
    if (textEl) textEl.textContent = doc.text;
    if (modal) modal.classList.remove('hidden');

    if (window.GameAudio) {
      window.GameAudio.playWoodCreak(0, 0.1);
    }
  }

  function closeDocumentModal() {
    const modal = document.getElementById('document-modal');
    if (modal) modal.classList.add('hidden');
  }

  function serialize() {
    return {
      currentObjectiveId: currentObjective.id,
      readDocuments: [...readDocuments],
      flags: { ...flags }
    };
  }

  function deserialize(data) {
    if (!data) return;
    if (data.currentObjectiveId && objectives[data.currentObjectiveId]) {
      currentObjective = objectives[data.currentObjectiveId];
      const el = document.getElementById('objective-text');
      if (el) el.textContent = currentObjective.text;
    }
    if (data.readDocuments) {
      readDocuments = [...data.readDocuments];
    }
    if (data.flags) {
      flags = { ...flags, ...data.flags };
    }
  }

  return {
    documents,
    objectives,
    get flags() { return flags; },
    get currentObjective() { return currentObjective; },
    setObjective,
    getDocument,
    markDocumentRead,
    hasReadDocument,
    showSubtitle,
    showToast,
    openDocumentModal,
    closeDocumentModal,
    serialize,
    deserialize
  };
})();
