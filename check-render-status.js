// check-render-status.js - Script para verificar el estado del backend en Render
const https = require('https');

async function checkRenderBackend() {
  // Reemplaza con tu URL real de Render
  const RENDER_URL = 'https://admincomercial.onrender.com'; // ✅ URL REAL
  
  console.log('🔍 Verificando backend en Render...');
  console.log('URL base:', RENDER_URL);
  
  // Lista de endpoints a verificar
  const endpoints = [
    '/health',
    '/api/health', 
    '/',
    '/api/auth/check'
  ];
  
  for (const endpoint of endpoints) {
    const url = RENDER_URL + endpoint;
    console.log(`\n📡 Probando: ${url}`);
    
    try {
      const response = await fetch(url);
      console.log(`✅ Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.text();
        console.log(`📄 Response: ${data.substring(0, 200)}...`);
      } else {
        console.log(`❌ Error: ${response.statusText}`);
      }
      
    } catch (error) {
      console.log(`💥 Error de conexión: ${error.message}`);
      
      if (error.code === 'ENOTFOUND') {
        console.log('🔧 Solución: Verifica que la URL de Render sea correcta');
      }
    }
  }
}

// Verificar si fetch está disponible
if (typeof fetch === 'undefined') {
  console.log('📦 Instalando node-fetch...');
  console.log('Ejecuta: npm install node-fetch');
  console.log('Luego ejecuta: node check-render-status.js');
} else {
  checkRenderBackend();
}
