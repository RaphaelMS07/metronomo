const timeline = document.getElementById('timeline');
const addBtn = document.getElementById('addBlockBtn');
const playBtn = document.getElementById('playBtn');
const timelineLoopInput = document.getElementById('timelineLoop');
const globalBpmInput = document.getElementById('globalBpm'); // Referência ao BPM Global

let draggedElement = null;

let audioCtx = null;
let isRunning = false;
let timerID = null;

let currentTimeline = [];
let currentBlockIdx = 0;
let currentTickInBlock = 0;
let currentBeatInTick = 0;
let nextNoteTime = 0.0;

let timelinePlayCount = 0;
let timelineLoopLimit = 1;


const timelineTitleInput = document.getElementById('timelineTitle'); // NOVA VARIÁVEL
const lookahead = 25.0;
const scheduleAheadTime = 0.1;

// --- LÓGICA DE LOCALSTORAGE (SALVAR E CARREGAR) ---

// --- LÓGICA DE LOCALSTORAGE (SALVAR E CARREGAR) ---
function saveToLocalStorage() {
    const data = {
        title: timelineTitleInput.value, // Salva o nome do treino
        globalBpm: parseInt(globalBpmInput.value) || 120,
        loopLimit: parseInt(timelineLoopInput.value) || 0,
        blocks: []
    };

    const boxes = timeline.querySelectorAll('.config-box');
    boxes.forEach(box => {
        data.blocks.push({
            bpm: parseInt(box.querySelector('.bpm-input').value) || 120,
            beatsPerTick: parseInt(box.querySelector('.beats-input').value) || 1,
            limit: parseInt(box.querySelector('.limit-input').value) || 0,
            color: box.dataset.color // Caso esteja usando a mecânica das bordas coloridas
        });
    });

    localStorage.setItem('metronomeTimeline', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const savedData = localStorage.getItem('metronomeTimeline');
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            
            // Restaura o título do treino
            if (data.title !== undefined) {
                timelineTitleInput.value = data.title;
            }
            
            if (data.globalBpm !== undefined) {
                globalBpmInput.value = data.globalBpm;
            }
            if (data.loopLimit !== undefined) {
                timelineLoopInput.value = data.loopLimit;
            }
            
            const existingBoxes = timeline.querySelectorAll('.config-box');
            existingBoxes.forEach(box => box.remove());

            if (data.blocks && data.blocks.length > 0) {
                data.blocks.forEach(block => {
                    const newBox = createConfigBox(block.bpm, block.beatsPerTick, block.limit, block.color);
                    timeline.insertBefore(newBox, addBtn);
                });
            } else {
                const defaultBox = createConfigBox(120, 1, 4);
                timeline.insertBefore(defaultBox, addBtn);
            }
        } catch (e) {
            console.error("Erro ao carregar dados do LocalStorage", e);
        }
    }
}

// Monitora alterações nos inputs
document.addEventListener('input', (e) => {
    // Se a alteração for no BPM Global, atualiza todos os blocos antes de salvar
    if (e.target.id === 'globalBpm') {
        const newGlobalBpm = e.target.value;
        const bpmInputs = timeline.querySelectorAll('.bpm-input');
        bpmInputs.forEach(input => {
            input.value = newGlobalBpm;
        });
        saveToLocalStorage();
    }
    // Se a alteração for em qualquer outro input pertinente, apenas salva
    else if (e.target.matches('.bpm-input, .beats-input, .limit-input, #timelineLoop')) {
        saveToLocalStorage();
    }
});


// --- LÓGICA DE ÁUDIO ---
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

    if (isRunning) {
        timerID = setTimeout(scheduler, lookahead);
    }
}

function startMetronome() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    currentTimeline = [];
    const boxes = timeline.querySelectorAll('.config-box');

    if (boxes.length === 0) return;

    boxes.forEach(box => {
        currentTimeline.push({
            bpm: parseInt(box.querySelector('.bpm-input').value) || 120,
            beatsPerTick: parseInt(box.querySelector('.beats-input').value) || 1,
            limit: parseInt(box.querySelector('.limit-input').value) || 0
        });
    });

    isRunning = true;
    currentBlockIdx = 0;
    currentTickInBlock = 0;
    currentBeatInTick = 0;

    timelinePlayCount = 0;
    timelineLoopLimit = parseInt(timelineLoopInput.value) || 0;

    nextNoteTime = audioCtx.currentTime + 0.05;

    playBtn.textContent = '■';
    playBtn.style.backgroundColor = '#cc0000';

    scheduler();
}

function stopMetronome() {
    isRunning = false;
    clearTimeout(timerID);

    playBtn.textContent = '▶';
    playBtn.style.backgroundColor = '#007acc';
}

playBtn.addEventListener('click', () => {
    if (isRunning) {
        stopMetronome();
    } else {
        startMetronome();
    }

    if (e.target.id === 'globalBpm') {
        const newGlobalBpm = e.target.value;
        const bpmInputs = timeline.querySelectorAll('.bpm-input');
        bpmInputs.forEach(input => {
            input.value = newGlobalBpm;
        });
        saveToLocalStorage();
    } 
    else if (e.target.matches('.bpm-input, .beats-input, .limit-input, #timelineLoop, #timelineTitle')) {
        saveToLocalStorage();
    }
});


function createConfigBox(defaultBpm = 120, defaultBeats = 1, defaultLimit = 4, savedColor = null) {
    const box = document.createElement('div');
    box.classList.add('config-box');
    box.setAttribute('draggable', 'true');

    // Define a cor da borda (usa a salva ou gera uma nova)
    const boxColor = savedColor || getRandomPastelColor();
    box.style.borderColor = boxColor;
    box.dataset.color = boxColor; // Salva a cor no dataset do elemento para facilitar o salvamento depois

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
    const hue = Math.floor(Math.random() * 360); // Cor aleatória de 0 a 360
    const saturation = Math.floor(Math.random() * 30) + 40; // Saturação entre 40% e 70%
    const lightness = Math.floor(Math.random() * 20) + 60; // Luminosidade entre 60% e 80%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

addBtn.addEventListener('click', () => {
    const allBoxes = timeline.querySelectorAll('.config-box');

    // Por padrão, tenta puxar do BPM Global
    let lastBpm = globalBpmInput.value || 120;
    let lastBeats = 1;
    let lastLimit = 4;

    if (allBoxes.length > 0) {
        const lastBox = allBoxes[allBoxes.length - 1];
        lastBpm = lastBox.querySelector('.bpm-input').value;
        lastBeats = lastBox.querySelector('.beats-input').value;
        lastLimit = lastBox.querySelector('.limit-input').value;
    }

    const newBox = createConfigBox(lastBpm, lastBeats, lastLimit);
    timeline.insertBefore(newBox, addBtn);

    saveToLocalStorage();
});

document.addEventListener('dragover', (e) => {
    if (draggedElement) {
        const rect = timeline.getBoundingClientRect();

        if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
        ) {
            draggedElement.classList.add('delete-ready');
        } else {
            draggedElement.classList.remove('delete-ready');
        }
    }
});

timeline.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('config-box')) {
        draggedElement = e.target;
        setTimeout(() => e.target.classList.add('dragging'), 0);
    }
});

timeline.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('config-box')) {
        e.target.classList.remove('dragging');

        if (e.target.classList.contains('delete-ready')) {
            e.target.remove();
        }

        draggedElement = null;

        saveToLocalStorage();
    }
});

timeline.addEventListener('dragover', (e) => {
    e.preventDefault();

    if (draggedElement && !draggedElement.classList.contains('delete-ready')) {
        const afterElement = getDragAfterElement(timeline, e.clientX);

        if (afterElement == null || afterElement === addBtn) {
            timeline.insertBefore(draggedElement, addBtn);
        } else {
            timeline.insertBefore(draggedElement, afterElement);
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

// Inicia carregando os dados salvos previamente
loadFromLocalStorage();