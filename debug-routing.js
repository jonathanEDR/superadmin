require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

// Simulamos el middleware de autenticación
app.use((req, res, next) => {
  req.user = {
    id: 'test_user',
    email: 'test@test.com',
    role: 'super_admin'
  };
  next();
});

// Mock de las rutas para debuggear
app.post('/api/inventario-producto', (req, res) => {
  console.log('✅ Ruta de INVENTARIO llamada correctamente');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  res.json({ message: 'Ruta de inventario funcionando' });
});

app.post('/api/productos', (req, res) => {
  console.log('❌ Ruta de PRODUCTOS llamada incorrectamente!');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  res.status(409).json({ message: 'Este producto ya existe en esta categoría' });
});

// Iniciar servidor de debug
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🔍 Servidor de debug ejecutándose en puerto ${PORT}`);
  console.log('📋 Rutas configuradas:');
  console.log('  POST /api/inventario-producto - ✅ CORRECTO');
  console.log('  POST /api/productos - ❌ INCORRECTO');
  console.log('\\nPrueba enviando requests a ambas rutas para ver cuál se está llamando');
});

// Test automático
setTimeout(() => {
  const axios = require('axios');
  
  const testData = {
    productoId: "687e5495af76045e61985dbf",
    cantidad: 10,
    precio: 4,
    lote: "",
    observaciones: "",
    proveedor: "",
    fechaVencimiento: null
  };
  
  console.log('\\n🧪 Ejecutando prueba automática...');
  
  // Probar ruta correcta
  axios.post('http://localhost:3001/api/inventario-producto', testData)
    .then(response => {
      console.log('✅ Test ruta inventario: OK');
    })
    .catch(error => {
      console.log('❌ Test ruta inventario: ERROR');
    });
    
  // Probar ruta incorrecta
  axios.post('http://localhost:3001/api/productos', testData)
    .then(response => {
      console.log('❌ Test ruta productos: No debería funcionar');
    })
    .catch(error => {
      console.log('✅ Test ruta productos: Error esperado (409)');
    });
    
}, 2000);
