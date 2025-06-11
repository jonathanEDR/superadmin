require('dotenv').config();
const express = require('express');
const cors = require('cors');  // Middleware para CORS
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');  // Importar las rutas de autenticación
const notesRoutes = require('./routes/notes');  // Importa las rutas para las notas
const adminRoutes = require('./routes/admin');  // Importa las rutas de admin
const productoRoutes = require('./routes/productoRoutes');  // Importar las rutas de productos


// Cargar las variables de entorno desde el archivo .env
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;  // Usar el puerto de la variable de entorno o el 5000 por defecto

// Middleware para CORS y Body Parser
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Configurar body-parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rutas de la API
app.use('/api/productos', productoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/admin', adminRoutes);

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

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conexión a MongoDB exitosa'))  // Mensaje en caso de éxito
  .catch((err) => {
    console.error('Error en la conexión a MongoDB', err);  // Manejo de errores de conexión
    process.exit(1);  // Finaliza el proceso si la conexión falla
  });

// Iniciar el servidor en el puerto definido
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
