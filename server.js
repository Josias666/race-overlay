const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'runners.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Asegurar que existe el archivo de datos
if (!fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Datos iniciales
const defaultData = {
  categories: {
    '10K': {
      name: '10K',
      color: '#ff3366',
      started: false,
      startTime: null,
      currentTime: 0,
      finished: false
    },
    '5K': {
      name: '5K',
      color: '#00d4aa',
      started: false,
      startTime: null,
      currentTime: 0,
      finished: false
    }
  },
  runners: [],
  leaderboard: [],
  lastFinish: null,
  eventName: 'Carrera Pedestre 11K'
};

// Cargar o inicializar datos
let raceData = { ...defaultData };
try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    raceData = { ...defaultData, ...saved };
  }
} catch (e) {
  console.log('Iniciando con datos por defecto');
}

// Guardar datos
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(raceData, null, 2));
}

// Actualizar tiempos cada 100ms
setInterval(() => {
  const now = Date.now();
  let updated = false;
  
  Object.keys(raceData.categories).forEach(catKey => {
    const cat = raceData.categories[catKey];
    if (cat.started && !cat.finished && cat.startTime) {
      cat.currentTime = now - cat.startTime;
      updated = true;
    }
  });
  
  if (updated) {
    io.emit('timerUpdate', getTimerData());
  }
}, 100);

function getTimerData() {
  const data = {};
  Object.keys(raceData.categories).forEach(key => {
    data[key] = {
      time: raceData.categories[key].currentTime,
      started: raceData.categories[key].started,
      finished: raceData.categories[key].finished
    };
  });
  return data;
}

// API Routes

// Obtener estado completo
app.get('/api/state', (req, res) => {
  res.json(raceData);
});

// Iniciar categoría
app.post('/api/start/:category', (req, res) => {
  const { category } = req.params;
  const cat = raceData.categories[category];
  
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
  if (cat.started) return res.status(400).json({ error: 'Categoría ya iniciada' });
  
  cat.started = true;
  cat.startTime = Date.now();
  cat.currentTime = 0;
  
  saveData();
  io.emit('raceStarted', { category, timestamp: cat.startTime });
  io.emit('stateUpdate', raceData);
  
  res.json({ success: true, category, startTime: cat.startTime });
});

// Detener categoría
app.post('/api/stop/:category', (req, res) => {
  const { category } = req.params;
  const cat = raceData.categories[category];
  
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
  
  cat.finished = true;
  
  saveData();
  io.emit('raceStopped', { category });
  io.emit('stateUpdate', raceData);
  
  res.json({ success: true, category });
});

// Resetear categoría
app.post('/api/reset/:category', (req, res) => {
  const { category } = req.params;
  const cat = raceData.categories[category];
  
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
  
  cat.started = false;
  cat.startTime = null;
  cat.currentTime = 0;
  cat.finished = false;
  
  // Limpiar corredores de esta categoría
  raceData.runners = raceData.runners.filter(r => r.category !== category);
  updateLeaderboard();
  
  saveData();
  io.emit('raceReset', { category });
  io.emit('stateUpdate', raceData);
  
  res.json({ success: true, category });
});

// Registrar llegada
app.post('/api/finish', (req, res) => {
  const { bib, category, name = '' } = req.body;
  
  if (!bib || !category) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  
  const cat = raceData.categories[category];
  if (!cat || !cat.started) {
    return res.status(400).json({ error: 'Categoría no iniciada' });
  }
  
  const finishTime = Date.now() - cat.startTime;
  
  // Verificar si ya terminó
  const existing = raceData.runners.find(r => r.bib === bib && r.category === category);
  if (existing) {
    return res.status(400).json({ error: 'Corredor ya registrado' });
  }
  
  const runner = {
    id: Date.now(),
    bib: parseInt(bib),
    category,
    name: name || `Corredor ${bib}`,
    finishTime,
    timestamp: Date.now(),
    position: 0
  };
  
  raceData.runners.push(runner);
  updateLeaderboard();
  saveData();
  
  raceData.lastFinish = runner;
  
  io.emit('runnerFinished', runner);
  io.emit('stateUpdate', raceData);
  
  res.json({ success: true, runner });
});

// Eliminar registro
app.delete('/api/runner/:id', (req, res) => {
  const { id } = req.params;
  raceData.runners = raceData.runners.filter(r => r.id != id);
  updateLeaderboard();
  saveData();
  io.emit('stateUpdate', raceData);
  res.json({ success: true });
});

// Actualizar nombre del evento
app.post('/api/event-name', (req, res) => {
  const { name } = req.body;
  raceData.eventName = name || 'Carrera Pedestre 11K';
  saveData();
  io.emit('stateUpdate', raceData);
  res.json({ success: true });
});

// Actualizar leaderboard
function updateLeaderboard() {
  // Agrupar por categoría y ordenar
  const byCategory = {};
  
  Object.keys(raceData.categories).forEach(cat => {
    byCategory[cat] = raceData.runners
      .filter(r => r.category === cat)
      .sort((a, b) => a.finishTime - b.finishTime)
      .map((r, idx) => ({ ...r, position: idx + 1 }));
  });
  
  // Leaderboard general (top 10 de todas las categorías)
  raceData.leaderboard = raceData.runners
    .sort((a, b) => a.finishTime - b.finishTime)
    .slice(0, 10)
    .map((r, idx) => ({ ...r, overallPosition: idx + 1 }));
    
  // Actualizar posiciones en runners
  Object.keys(byCategory).forEach(cat => {
    byCategory[cat].forEach(runner => {
      const r = raceData.runners.find(x => x.id === runner.id);
      if (r) r.position = runner.position;
    });
  });
}

// WebSocket
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Enviar estado actual
  socket.emit('init', raceData);
  socket.emit('timerUpdate', getTimerData());
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║           🏃 RACE OVERLAY SERVER 🏃                    ║
║                                                        ║
║  Overlay URL: http://localhost:${PORT}                   ║
║  Control Panel: http://localhost:${PORT}/control.html   ║
║                                                        ║
║  Para vMix usar: http://[TU_IP]:${PORT}                 ║
╚════════════════════════════════════════════════════════╝
  `);
});