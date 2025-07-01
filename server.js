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

// Configuración para producción
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Lista de orígenes permitidos para CORS
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

console.log('Allowed CORS origins:', allowedOrigins);

// Middleware para CORS y Body Parser
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como aplicaciones móviles o Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
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

// Middleware adicional para seguridad y parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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
  res.json({ 
    message: 'Backend server is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : err.message,
    timestamp: new Date().toISOString()
  });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Conectar a MongoDB con configuración mejorada
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Configuraciones recomendadas para producción
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Conectar a la base de datos
connectDB();

// Manejo de señales para cierre graceful
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await mongoose.connection.close();
  process.exit(0);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${port}/health`);
});
