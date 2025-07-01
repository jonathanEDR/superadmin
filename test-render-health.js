// test-render-health.js - Script para probar el health check de Render
const fetch = require('node-fetch').default || require('node-fetch');

async function testRenderHealth() {
  // Reemplaza con tu URL real de Render cuando la tengas
  const RENDER_URL = 'https://tu-app-backend.onrender.com'; // ACTUALIZAR CON TU URL
  
  console.log('🔍 Probando health check de Render...');
  console.log('URL:', RENDER_URL + '/health');
  
  try {
    const response = await fetch(RENDER_URL + '/health');
    const data = await response.json();
    
    console.log('✅ Respuesta del servidor:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));
    
    if (data.status === 'OK' && data.database === 'connected') {
      console.log('🎉 ¡Backend funcionando correctamente en Render!');
    } else {
      console.log('⚠️ Backend responde pero hay problemas');
    }
    
  } catch (error) {
    console.error('❌ Error conectando a Render:');
    console.error('Mensaje:', error.message);
    
    if (error.message.includes('fetch')) {
      console.log('\n📦 Instalando node-fetch...');
      console.log('Ejecuta: npm install node-fetch');
    }
  }
}

testRenderHealth();
