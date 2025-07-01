require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

// Importar rutas
const authRoutes = require('./routes/auth');
const notasRoutes = require('./routes/notasRouter'); // Asegúrate de usar el nombre correcto
const adminRoutes = require('./routes/admin');
const productoRoutes = require('./routes/productoRoutes');
const ventaRoutes = require('./routes/ventaRoutes');
const devolucionRoutes = require('./routes/devolucionRoutes');
const cobroRoutes = require('./routes/cobroRoutes');
const gestionPersonalRoutes = require('./routes/gestionPersonalRoutes');
const pagosRealizadosRoutes = require('./routes/pagosRealizadosRoutes');
const gastoRoutes = require('./routes/GastoRoutes');
const cajaRoutes = require('./routes/cajaRoutes');

const app = express();
const port = process.env.PORT || 5000;

// Middleware para CORS y Body Parser
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'x-user-id',
    'x-user-email',
    'x-user-name',
    'x-user-role'
  ]
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rutas de la API
app.use('/api/productos', productoRoutes);
app.use('/api/ventas', ventaRoutes);
app.use('/api/devoluciones', devolucionRoutes);
app.use('/api/cobros', cobroRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/notes', notasRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gestion-personal', gestionPersonalRoutes);
app.use('/api/pagos-realizados', pagosRealizadosRoutes);
app.use('/api/gastos', gastoRoutes);
app.use('/api/caja', cajaRoutes);

// Rutas de prueba y health check
app.get('/', (req, res) => {
  res.json({ message: 'Backend server is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Conectar a MongoDB (sin opciones deprecadas)
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conexión a MongoDB exitosa'))
  .catch((err) => {
    console.error('Error en la conexión a MongoDB', err);
    process.exit(1);
  });

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
