const socket = io();
let currentState = null;

// Elementos del DOM
const elements = {
    eventName: document.getElementById('event-name'),
    timer10k: document.getElementById('timer-10k'),
    timer5k: document.getElementById('timer-5k'),
    status10k: document.getElementById('status-10k'),
    status5k: document.getElementById('status-5k'),
    timerBox10k: document.getElementById('timer-10k-box'),
    timerBox5k: document.getElementById('timer-5k-box'),
    leaderboard: document.getElementById('leaderboard'),
    finishBanner: document.getElementById('finish-banner'),
    finishCategory: document.getElementById('finish-category'),
    finishRunner: document.getElementById('finish-runner'),
    finishTime: document.getElementById('finish-time'),
    finishPosition: document.getElementById('finish-position'),
    startAlert: document.getElementById('start-alert'),
    alertCategory: document.getElementById('alert-category')
};

// Inicialización
socket.on('init', (data) => {
    currentState = data;
    updateUI(data);
});

// Actualización de estado
socket.on('stateUpdate', (data) => {
    currentState = data;
    updateUI(data);
});

// Actualización de timers
socket.on('timerUpdate', (timers) => {
    Object.keys(timers).forEach(cat => {
        const timerData = timers[cat];
        const element = elements[`timer${cat === '10K' ? '10k' : '5k'}`];
        const statusEl = elements[`status${cat === '10K' ? '10k' : '5k'}`];
        const boxEl = elements[`timerBox${cat === '10K' ? '10k' : '5k'}`];
        
        if (element) {
            element.textContent = formatTime(timerData.time);
        }
        
        if (statusEl) {
            if (timerData.finished) {
                statusEl.textContent = 'FINALIZADO';
                statusEl.style.color = '#ff6b6b';
            } else if (timerData.started) {
                statusEl.textContent = 'EN CARRERA';
                statusEl.style.color = '#00ff88';
            }
        }
        
        if (boxEl) {
            if (timerData.started && !timerData.finished) {
                boxEl.classList.add('running');
            } else {
                boxEl.classList.remove('running');
            }
        }
    });
});

// Carrera iniciada
socket.on('raceStarted', (data) => {
    showStartAlert(data.category);
});

// Corredor finalizó
socket.on('runnerFinished', (runner) => {
    showFinishBanner(runner);
});

// Funciones de utilidad
function formatTime(ms) {
    if (!ms || ms < 0) return '00:00:00';
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    
    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}:${pad(centiseconds)}`;
}

function pad(n) {
    return n.toString().padStart(2, '0');
}

function updateUI(data) {
    // Nombre del evento
    if (elements.eventName) {
        elements.eventName.textContent = data.eventName;
    }
    
    // Leaderboard
    updateLeaderboard(data.leaderboard);
}

function updateLeaderboard(leaderboard) {
    if (!leaderboard || leaderboard.length === 0) {
        elements.leaderboard.innerHTML = '<div class="empty-state">Esperando resultados...</div>';
        return;
    }
    
    const html = leaderboard.map((runner, index) => `
        <div class="leaderboard-row">
            <span class="position">${index + 1}°</span>
            <div class="runner-info">
                <span class="runner-name">${runner.name}</span>
                <span class="runner-bib">Dorsal #${runner.bib}</span>
            </div>
            <span class="category-tag ${runner.category === '5K' ? 'k5' : 'k10'}">${runner.category}</span>
            <span class="finish-time">${formatTime(runner.finishTime)}</span>
        </div>
    `).join('');
    
    elements.leaderboard.innerHTML = html;
}

function showFinishBanner(runner) {
    elements.finishCategory.textContent = `${runner.category} - META`;
    elements.finishRunner.textContent = runner.name;
    elements.finishTime.textContent = formatTime(runner.finishTime);
    elements.finishPosition.textContent = `Posición: ${runner.position}°`;
    
    elements.finishBanner.classList.add('show');
    
    // Sonido opcional (descomentar si se quiere)
    // playSound('finish');
    
    setTimeout(() => {
        elements.finishBanner.classList.remove('show');
    }, 6000);
}

function showStartAlert(category) {
    elements.alertCategory.textContent = category;
    elements.startAlert.classList.add('show');
    
    setTimeout(() => {
        elements.startAlert.classList.remove('show');
    }, 3000);
}

function toggleLeaderboard() {
    document.getElementById('leaderboard-container').classList.toggle('minimized');
}

// Atajos de teclado para pruebas
document.addEventListener('keydown', (e) => {
    if (e.key === 'l' || e.key === 'L') {
        toggleLeaderboard();
    }
    if (e.key === 't' || e.key === 'T') {
        // Test banner
        showFinishBanner({
            category: '10K',
            name: 'Corredor Test',
            finishTime: 3425000,
            position: 1
        });
    }
});