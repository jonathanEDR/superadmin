require('dotenv').config();

// Establecer zona horaria de Perú antes de cualquier otra cosa
process.env.TZ = 'America/Lima';

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

// Importar middleware de zona horaria
const { setPeruTimezone } = require('./middleware/timezoneMiddleware');

// Importar rutas
const authRoutes = require('./routes/auth');
const notasRoutes = require('./routes/notasRouter'); // Asegúrate de usar el nombre correcto
const adminRoutes = require('./routes/admin');
const productoRoutes = require('./routes/productoRoutes');
const catalogoRoutes = require('./routes/catalogoRoutes');
const ventaRoutes = require('./routes/ventaRoutes');
const devolucionRoutes = require('./routes/devolucionRoutes');
const cobroRoutes = require('./routes/cobroRoutes');
const gestionPersonalRoutes = require('./routes/gestionPersonalRoutes');
const pagosRealizadosRoutes = require('./routes/pagosRealizadosRoutes');
const gastoRoutes = require('./routes/GastoRoutes');
const cajaRoutes = require('./routes/cajaRoutes');
// Rutas del módulo de producción
const ingredienteRoutes = require('./routes/ingredienteRoutes');
const materialRoutes = require('./routes/materialRoutes');
const recetaRoutes = require('./routes/recetaRoutes');
const produccionRoutes = require('./routes/produccionRoutes');
const movimientoRoutes = require('./routes/movimientoRoutes');
const movimientoUnificadoRoutes = require('./routes/movimientoUnificadoRoutes');
const catalogoProduccionRoutes = require('./routes/catalogoProduccionRoutes');
const residuoRoutes = require('./routes/residuoRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const estadisticasRoutes = require('./routes/estadisticasRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const inventarioEntradaRoutes = require('./routes/inventarioEntradaRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const inventarioUnificadoRoutes = require('./routes/inventarioUnificadoRoutes');
const inventarioProductoRoutes = require('./routes/inventarioProductoRoutes');
const debugRoutes = require('./routes/debugRoutes');

// Rutas del módulo de finanzas
const finanzasRoutes = require('./routes/Finanzas/finanzasRoutes');
const cuentasBancariasRoutes = require('./routes/Finanzas/cuentasBancariasRoutes'); // Ruta directa para cuentas bancarias
const prestamosRoutes = require('./routes/Finanzas/prestamosRoutes');
const pagosFinanciamientoRoutes = require('./routes/Finanzas/pagosFinanciamientoRoutes');
const garantiasRoutes = require('./routes/Finanzas/garantiasRoutes');
const movimientosCajaRoutes = require('./routes/Finanzas/movimientosCajaRoutes');

const app = express();
const port = process.env.PORT || 5000;

// Configuración para producción
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Lista de orígenes permitidos para CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://fsuperadmin.vercel.app'
];

// ...existing code...

// Middleware para CORS y Body Parser
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como aplicaciones móviles o Postman)
    if (!origin) return callback(null, true);
    
    // En desarrollo, permitir cualquier localhost
    if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // ...existing code...
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
    'x-user-role',
    'Origin',
    'X-Requested-With'
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar']
}));

// Middleware adicional para seguridad y parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Aplicar middleware de zona horaria de Perú
app.use(setPeruTimezone);


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    timezone: process.env.TZ || 'Sistema',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend API funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Rutas de la API
app.use('/api/productos', productoRoutes);
app.use('/api/catalogo', catalogoRoutes);
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
app.use('/api/movimientos-caja', movimientosCajaRoutes);
// Rutas del módulo de producción
// ...existing code...
app.use('/api/ingredientes', ingredienteRoutes);
app.use('/api/materiales', materialRoutes);
app.use('/api/recetas', recetaRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/movimientos', movimientoRoutes);
app.use('/api/movimientos-unificados', movimientoUnificadoRoutes);
app.use('/api/residuos', residuoRoutes);
// ...existing code...
app.use('/api/catalogo-produccion', catalogoProduccionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/estadisticas', estadisticasRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/inventario-producto', inventarioProductoRoutes);
app.use('/api/inventario-unificado', inventarioUnificadoRoutes);

// Rutas del módulo de finanzas
// ...existing code...
app.use('/api/finanzas', finanzasRoutes);
app.use('/api/cuentas-bancarias', cuentasBancariasRoutes); // Ruta directa para cuentas bancarias
app.use('/api/movimientos-caja', movimientosCajaRoutes); // Ruta directa para movimientos de caja
app.use('/api/prestamos', prestamosRoutes);
app.use('/api/pagos-financiamiento', pagosFinanciamientoRoutes);
app.use('/api/garantias', garantiasRoutes);
// ...existing code...

// Ruta de debug (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/debug', debugRoutes);
}

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
    
    // ...existing code...
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Conectar a la base de datos
connectDB();


// Manejo de señales para cierre graceful
process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

if (require.main === module) {
  app.listen(port, '0.0.0.0');
}

module.exports = app;
