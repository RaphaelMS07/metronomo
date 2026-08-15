// VARIÁVEIS GLOBAIS DE ÁUDIO E ESTADO
let audioCtx = null;
let isRunning = false;
let timerID = null;
let playingCard = null; // Rastreia qual card (treino) está tocando no momento

let currentTimeline = [];
let currentBlockIdx = 0;
let currentTickInBlock = 0;
let currentBeatInTick = 0;
let nextNoteTime = 0.0;
let timelinePlayCount = 0;
let timelineLoopLimit = 1;

const lookahead = 25.0;
const scheduleAheadTime = 0.1;
let draggedElement = null;


// --- LÓGICA DE LOCALSTORAGE MULTI-TREINO ---
function saveToLocalStorage() {
    const data = [];
    const cards = document.querySelectorAll('.training-card');

    // Varre todos os cards criados na tela e salva os dados de cada um
    cards.forEach(card => {
        const title = card.querySelector('.timeline-title').value;
        const globalBpm = parseInt(card.querySelector('.global-bpm').value) || 120;
        const loopLimit = parseInt(card.querySelector('.timeline-loop').value) || 0;
        const blocks = [];

        const boxes = card.querySelectorAll('.config-box');
        boxes.forEach(box => {
            blocks.push({
                bpm: parseInt(box.querySelector('.bpm-input').value) || 120,
                beatsPerTick: parseInt(box.querySelector('.beats-input').value) || 1,
                limit: parseInt(box.querySelector('.limit-input').value) || 0,
                color: box.dataset.color
            });
        });

        data.push({ title, globalBpm, loopLimit, blocks });
    });

    localStorage.setItem('metronomeTrainings', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const container = document.getElementById('trainingsContainer');
    container.innerHTML = ''; // Limpa antes de carregar

    const savedTrainings = localStorage.getItem('metronomeTrainings');

    if (savedTrainings) {
        try {
            const data = JSON.parse(savedTrainings);
            data.forEach(training => {
                container.appendChild(createTrainingDOM(training));
            });
        } catch (e) { console.error("Erro ao carregar do LS", e); }
    } else {
        // Tenta migrar o save antigo (caso exista), senão cria um default
        const oldData = localStorage.getItem('metronomeTimeline');
        if (oldData) {
            try {
                container.appendChild(createTrainingDOM(JSON.parse(oldData)));
            } catch (e) { }
        } else {
            container.appendChild(createTrainingDOM({
                title: 'Treino de Aquecimento', globalBpm: 120, loopLimit: 1,
                blocks: [{ bpm: 120, beatsPerTick: 1, limit: 4, color: getRandomPastelColor() }]
            }));
        }
    }
}


// --- GERAÇÃO DOS ELEMENTOS DOM (HTML) ---
function createTrainingDOM(training) {
    const card = document.createElement('div');
    card.classList.add('section', 'training-card');

    const title = training.title || "Novo Treino";
    const globalBpm = training.globalBpm || 120;
    const loopLimit = training.loopLimit !== undefined ? training.loopLimit : 1;

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <input type="text" class="timeline-title" value="${title}" placeholder="Nome do treino...">
            <button class="delete-training-btn" title="Excluir Treino" style="background:transparent; border:none; color:#cc0000; cursor:pointer; font-size:1.2em;"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="controls-wrapper">
            <div class="global-settings">
                <label>BPM</label>
                <input type="number" class="global-bpm" value="${globalBpm}" min="40" max="240">
                <span style="margin: 0 10px; color: #555;">|</span>
                <label><i class="fa-solid fa-repeat" title="Repetições (0 = ∞)"></i></label>
                <input type="number" class="timeline-loop" value="${loopLimit}" min="0">
            </div>
        </div>
        <div class="timeline-wrapper">
            <div class="controls">
                <button class="play-btn" style="height: 90px; min-width: 90px; border-radius: 60px;">▶</button>
            </div>
            <div class="timeline">
                <!-- Blocos serão inseridos aqui -->
                <button class="add-btn add-block-btn">+</button>
            </div>
        </div>
    `;

    const timelineEl = card.querySelector('.timeline');
    const addBtn = card.querySelector('.add-block-btn');

    // Insere os blocos correspondentes a este treino
    if (training.blocks && training.blocks.length > 0) {
        training.blocks.forEach(block => {
            timelineEl.insertBefore(createConfigBox(block.bpm, block.beatsPerTick, block.limit, block.color), addBtn);
        });
    }

    return card;
}

function createConfigBox(defaultBpm = 120, defaultBeats = 1, defaultLimit = 4, savedColor = null) {
    const box = document.createElement('div');
    box.classList.add('config-box');
    box.setAttribute('draggable', 'true');

    const boxColor = savedColor || getRandomPastelColor();
    box.style.borderColor = boxColor;
    box.dataset.color = boxColor;

    box.innerHTML = `
        <div class="form-group">
            <label>BPM:</label>
            <input type="number" class="bpm-input" value="${defaultBpm}" min="40" max="240">
        </div>
        <div class="form-group">
            <label>Beats/tick:</label>
            <input type="number" class="beats-input" value="${defaultBeats}" min="1" max="16">
        </div>
        <div class="form-group">
            <label><i class="fa-solid fa-infinity" title="Limite (0 = ∞)"></i></label>
            <input type="number" class="limit-input" value="${defaultLimit}" min="0">
        </div>
    `;
    return box;
}

function getRandomPastelColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 30) + 40;
    const lightness = Math.floor(Math.random() * 20) + 60;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}


// --- DELEGAÇÃO DE EVENTOS (CLIQUE, DIGITAÇÃO E ARRASTE) ---
document.addEventListener('click', (e) => {

    // 1. Clicar no botão PLAY do card
    if (e.target.closest('.play-btn')) {
        const btn = e.target.closest('.play-btn');
        const card = btn.closest('.training-card');

        if (isRunning && playingCard === card) {
            stopMetronome(); // Clicou no card que já tá tocando, então para
        } else {
            if (isRunning) stopMetronome(); // Para o card anterior antes de começar o novo
            startMetronome(card);
        }
    }

    // 2. Clicar no "+" dentro da linha do tempo (Adicionar bloco)
    if (e.target.matches('.add-block-btn')) {
        const card = e.target.closest('.training-card');
        const timeline = card.querySelector('.timeline');
        const allBoxes = timeline.querySelectorAll('.config-box');

        let lastBpm = card.querySelector('.global-bpm').value || 120;
        let lastBeats = 1, lastLimit = 4;

        if (allBoxes.length > 0) {
            const lastBox = allBoxes[allBoxes.length - 1];
            lastBpm = lastBox.querySelector('.bpm-input').value;
            lastBeats = lastBox.querySelector('.beats-input').value;
            lastLimit = lastBox.querySelector('.limit-input').value;
        }

        timeline.insertBefore(createConfigBox(lastBpm, lastBeats, lastLimit), e.target);
        saveToLocalStorage();
    }

    // 3. Adicionar um Novo Treino Completo (Botão Gigante Global)
    if (e.target.closest('#addTrainingBtn')) {
        const container = document.getElementById('trainingsContainer');
        container.appendChild(createTrainingDOM({
            title: 'Novo Treino', globalBpm: 120, loopLimit: 1,
            blocks: [{ bpm: 120, beatsPerTick: 1, limit: 4, color: getRandomPastelColor() }]
        }));
        saveToLocalStorage();
    }

    // 4. Excluir o Treino
    if (e.target.closest('.delete-training-btn')) {
        const card = e.target.closest('.training-card');
        if (isRunning && playingCard === card) stopMetronome(); // Para se estiver tocando
        card.remove();
        saveToLocalStorage();
    }
});

// Monitorar alterações nos inputs de qualquer card
document.addEventListener('input', (e) => {
    // Se mudou o BPM Global, propaga apenas para os cards irmãos (do mesmo treino)
    if (e.target.classList.contains('global-bpm')) {
        const card = e.target.closest('.training-card');
        const bpmInputs = card.querySelectorAll('.bpm-input');
        bpmInputs.forEach(input => input.value = e.target.value);
        saveToLocalStorage();
    }
    else if (e.target.matches('.bpm-input, .beats-input, .limit-input, .timeline-loop, .timeline-title')) {
        saveToLocalStorage();
    }
});


// --- LÓGICA DE DRAG & DROP (ARRASTE) ---
document.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('config-box')) {
        draggedElement = e.target;
        setTimeout(() => e.target.classList.add('dragging'), 0);
    }
});

document.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('config-box')) {
        e.target.classList.remove('dragging');
        if (e.target.classList.contains('delete-ready')) {
            e.target.remove();
        }
        draggedElement = null;
        saveToLocalStorage(); // Salva qualquer modificação de estrutura de qualquer card
    }
});

document.addEventListener('dragover', (e) => {
    if (draggedElement) {
        e.preventDefault();

        // Permite mover o bloco entre TREINOS diferentes
        const hoverTimeline = e.target.closest('.timeline');

        if (!hoverTimeline) {
            draggedElement.classList.add('delete-ready'); // Fora de uma timeline, marca para deletar
        } else {
            draggedElement.classList.remove('delete-ready');
            const afterElement = getDragAfterElement(hoverTimeline, e.clientX);
            const addBtn = hoverTimeline.querySelector('.add-block-btn');

            if (afterElement == null || afterElement === addBtn) {
                hoverTimeline.insertBefore(draggedElement, addBtn);
            } else {
                hoverTimeline.insertBefore(draggedElement, afterElement);
            }
        }
    }
});

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.config-box:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


// --- LÓGICA DE ÁUDIO ---
function startMetronome(card) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    currentTimeline = [];
    const boxes = card.querySelectorAll('.config-box');
    if (boxes.length === 0) return;

    boxes.forEach(box => {
        currentTimeline.push({
            bpm: parseInt(box.querySelector('.bpm-input').value) || 120,
            beatsPerTick: parseInt(box.querySelector('.beats-input').value) || 1,
            limit: parseInt(box.querySelector('.limit-input').value) || 0
        });
    });

    playingCard = card;
    isRunning = true;
    currentBlockIdx = 0;
    currentTickInBlock = 0;
    currentBeatInTick = 0;
    timelinePlayCount = 0;
    timelineLoopLimit = parseInt(card.querySelector('.timeline-loop').value) || 0;

    nextNoteTime = audioCtx.currentTime + 0.05;

    const playBtn = card.querySelector('.play-btn');
    playBtn.textContent = '■';
    playBtn.style.backgroundColor = '#cc0000';

    scheduler();
}

function stopMetronome() {
    isRunning = false;
    clearTimeout(timerID);

    if (playingCard) {
        const playBtn = playingCard.querySelector('.play-btn');
        if (playBtn) {
            playBtn.textContent = '▶';
            playBtn.style.backgroundColor = '#007acc';
        }
        playingCard = null;
    }
}

function scheduleClick(time, isMain) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    if (isMain) {
        osc.frequency.setValueAtTime(1200, time);
        osc.frequency.exponentialRampToValueAtTime(300, time + 0.03);
    } else {
        osc.frequency.setValueAtTime(800, time);
        osc.frequency.exponentialRampToValueAtTime(200, time + 0.03);
    }

    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.04);
}

function nextNote() {
    const block = currentTimeline[currentBlockIdx];
    const secondsPerBeat = 60.0 / block.bpm;

    nextNoteTime += secondsPerBeat / block.beatsPerTick;
    currentBeatInTick++;

    if (currentBeatInTick >= block.beatsPerTick) {
        currentBeatInTick = 0;
        currentTickInBlock++;

        if (block.limit > 0 && currentTickInBlock >= block.limit) {
            currentBlockIdx++;
            currentTickInBlock = 0;

            if (currentBlockIdx >= currentTimeline.length) {
                timelinePlayCount++;
                if (timelineLoopLimit > 0 && timelinePlayCount >= timelineLoopLimit) {
                    stopMetronome();
                } else {
                    currentBlockIdx = 0;
                }
            }
        }
    }
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime && isRunning) {
        if (currentBlockIdx >= currentTimeline.length) break;
        const isMain = (currentBeatInTick === 0);
        scheduleClick(nextNoteTime, isMain);
        nextNote();
    }
    if (isRunning) timerID = setTimeout(scheduler, lookahead);
}

// --- LÓGICA DE IMPORTAÇÃO E EXPORTAÇÃO ---

// Exportar: Lê do LocalStorage, cria um Blob JSON e força o download
function exportData() {
    const data = localStorage.getItem('metronomeTrainings');

    if (!data || data === '[]') {
        alert('Não há treinos salvos para exportar.');
        return;
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;

    // Cria um nome de arquivo com a data atual
    const date = new Date().toISOString().slice(0, 10);
    a.download = `backup_metronomo_${date}.json`;

    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Importar: Lê o arquivo JSON, valida e salva no LocalStorage
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedData = JSON.parse(e.target.result);

            // Validação simples para garantir que a estrutura seja um Array
            if (Array.isArray(importedData)) {
                // Sobrescreve o LocalStorage
                localStorage.setItem('metronomeTrainings', JSON.stringify(importedData));

                // Recarrega a interface com os novos dados
                loadFromLocalStorage();
                alert('Treinos importados com sucesso!');
            } else {
                alert('Arquivo inválido: o formato do backup não é reconhecido.');
            }
        } catch (error) {
            alert('Erro ao ler o arquivo. Certifique-se de que é um arquivo .json válido.');
        }

        // Reseta o valor do input para permitir a importação do mesmo arquivo novamente se necessário
        event.target.value = '';
    };
    reader.readAsText(file);
}

// Adiciona os ouvintes de evento de clique globalmente para os novos botões
document.addEventListener('click', (e) => {
    // Clique no botão de exportar
    if (e.target.closest('#exportBtn')) {
        exportData();
    }

    // Clique no botão de importar (finge um clique no input file escondido)
    if (e.target.closest('#importBtn')) {
        document.getElementById('importFile').click();
    }
});

// Ouve a seleção de arquivo no input escondido
document.getElementById('importFile').addEventListener('change', importData);

// Inicia chamando o load da página
loadFromLocalStorage();
