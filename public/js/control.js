const socket = io();
let currentState = null;
let currentTab = 'all';

// Conexión
socket.on('connect', () => {
    document.getElementById('connection-status').innerHTML = 
        '<span class="status-dot"></span>Conectado';
});

socket.on('disconnect', () => {
    document.getElementById('connection-status').innerHTML = 
        '<span class="status-dot" style="background: #ff3366;"></span>Desconectado';
});

// Inicialización
socket.on('init', (data) => {
    currentState = data;
    updateControlUI(data);
});

socket.on('stateUpdate', (data) => {
    currentState = data;
    updateControlUI(data);
});

socket.on('timerUpdate', (timers) => {
    Object.keys(timers).forEach(cat => {
        const element = document.getElementById(`control-timer-${cat.toLowerCase()}`);
        const statusEl = document.getElementById(`status-${cat.toLowerCase()}`);
        const timerData = timers[cat];
        
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
            } else {
                statusEl.textContent = 'ESPERANDO';
                statusEl.style.color = 'rgba(255,255,255,0.6)';
            }
        }
    });
});

function updateControlUI(data) {
    // Actualizar tabla de resultados
    updateResultsTable(data.runners);
    
    // Actualizar nombre de evento
    document.getElementById('event-name-input').value = data.eventName;
    
    // Actualizar URL
    document.getElementById('vmix-url').textContent = 
        `${window.location.origin}`;
}

function updateResultsTable(runners) {
    const tbody = document.getElementById('results-body');
    
    let filtered = runners;
    if (currentTab !== 'all') {
        filtered = runners.filter(r => r.category === currentTab);
    }
    
    filtered = filtered.sort((a, b) => a.finishTime - b.finishTime);
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Sin resultados registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = filtered.map((runner, idx) => `
        <tr>
            <td>${idx + 1}°</td>
            <td>#${runner.bib}</td>
            <td>${runner.name}</td>
            <td><span class="cat-badge ${runner.category === '5K' ? 'k5' : 'k10'}">${runner.category}</span></td>
            <td>${formatTime(runner.finishTime)}</td>
            <td>
                <button class="btn btn-small btn-danger" onclick="deleteRunner(${runner.id})">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

// Acciones de categoría
async function startCategory(category) {
    try {
        const response = await fetch(`/api/start/${category}`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            showNotification(`Carrera ${category} iniciada`, 'success');
        }
    } catch (e) {
        showNotification('Error al iniciar', 'error');
    }
}

async function stopCategory(category) {
    try {
        const response = await fetch(`/api/stop/${category}`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            showNotification(`Carrera ${category} detenida`, 'warning');
        }
    } catch (e) {
        showNotification('Error al detener', 'error');
    }
}

async function resetCategory(category) {
    if (!confirm(`¿Resetear categoría ${category}? Se perderán todos los datos.`)) return;
    
    try {
        const response = await fetch(`/api/reset/${category}`, { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            showNotification(`Categoría ${category} reseteada`, 'success');
        }
    } catch (e) {
        showNotification('Error al resetear', 'error');
    }
}

// Registrar llegada
async function registerFinish(e) {
    e.preventDefault();
    
    const category = document.getElementById('finish-category').value;
    const bib = document.getElementById('finish-bib').value;
    const name = document.getElementById('finish-name').value;
    
    if (!category || !bib) {
        showNotification('Complete todos los campos', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, bib, name })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`¡Llegada registrada! Posición ${data.runner.position}`, 'success');
            document.getElementById('finish-form').reset();
            document.getElementById('finish-bib').focus();
        } else {
            showNotification(data.error || 'Error al registrar', 'error');
        }
    } catch (e) {
        showNotification('Error de conexión', 'error');
    }
}

// Test
function testFinish() {
    const cats = ['10K', '5K'];
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const bib = Math.floor(Math.random() * 999) + 1;
    
    fetch('/api/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            category: cat, 
            bib: bib, 
            name: `Test ${bib}` 
        })
    });
}

// Eliminar corredor
async function deleteRunner(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    
    try {
        await fetch(`/api/runner/${id}`, { method: 'DELETE' });
        showNotification('Registro eliminado', 'success');
    } catch (e) {
        showNotification('Error al eliminar', 'error');
    }
}

// Tabs
function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === tab.toLowerCase() || 
            (tab === 'all' && btn.textContent === 'Todos')) {
            btn.classList.add('active');
        }
    });
    updateResultsTable(currentState.runners);
}

// Exportar
function exportCSV() {
    if (!currentState.runners.length) {
        showNotification('No hay datos para exportar', 'error');
        return;
    }
    
    const csv = [
        ['Posición', 'Dorsal', 'Nombre', 'Categoría', 'Tiempo', 'Tiempo (ms)'].join(','),
        ...currentState.runners
            .sort((a, b) => a.finishTime - b.finishTime)
            .map((r, i) => [
                i + 1,
                r.bib,
                `"${r.name}"`,
                r.category,
                formatTime(r.finishTime),
                r.finishTime
            ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resultados-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    showNotification('CSV descargado', 'success');
}

// Limpiar todo
async function clearAll() {
    if (!confirm('¿Eliminar TODOS los registros?')) return;
    
    for (const cat of ['10K', '5K']) {
        await fetch(`/api/reset/${cat}`, { method: 'POST' });
    }
    showNotification('Datos eliminados', 'success');
}

// Deshacer último
async function clearLast() {
    if (!currentState.runners.length) return;
    const last = currentState.runners[currentState.runners.length - 1];
    await deleteRunner(last.id);
}

// Configuración
async function updateEventName() {
    const name = document.getElementById('event-name-input').value;
    try {
        await fetch('/api/event-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        showNotification('Nombre actualizado', 'success');
    } catch (e) {
        showNotification('Error al actualizar', 'error');
    }
}

function copyUrl() {
    const url = document.getElementById('vmix-url').textContent;
    navigator.clipboard.writeText(url);
    showNotification('URL copiada', 'success');
}

// Utilidades
function formatTime(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centis = Math.floor((ms % 1000) / 10);
    
    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}:${pad(centis)}`;
}

function pad(n) {
    return n.toString().padStart(2, '0');
}

function showNotification(message, type = 'info') {
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#00d4aa' : type === 'error' ? '#ff3366' : '#667eea'};
    `;
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// Atajos de teclado
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        document.getElementById('finish-form').dispatchEvent(new Event('submit'));
    }
    if (e.key === 'F1') {
        e.preventDefault();
        startCategory('10K');
    }
    if (e.key === 'F2') {
        e.preventDefault();
        startCategory('5K');
    }
});