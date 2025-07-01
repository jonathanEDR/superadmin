const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando configuración para despliegue en Render...\n');

// Verificar archivos esenciales
const requiredFiles = [
  'package.json',
  'server.js',
  '.env.example',
  'README.md',
  '.gitignore'
];

const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(__dirname, file)));

if (missingFiles.length > 0) {
  console.log('❌ Archivos faltantes:', missingFiles.join(', '));
} else {
  console.log('✅ Todos los archivos esenciales están presentes');
}

// Verificar package.json
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  // Verificar scripts
  if (packageJson.scripts && packageJson.scripts.start) {
    console.log('✅ Script "start" definido:', packageJson.scripts.start);
  } else {
    console.log('❌ Script "start" no definido en package.json');
  }
  
  // Verificar engines
  if (packageJson.engines) {
    console.log('✅ Engines definidos:', JSON.stringify(packageJson.engines, null, 2));
  } else {
    console.log('⚠️  Engines no definidos (recomendado para producción)');
  }
  
  // Verificar dependencias críticas
  const criticalDeps = ['express', 'mongoose', 'cors', 'dotenv'];
  const missingDeps = criticalDeps.filter(dep => !packageJson.dependencies[dep]);
  
  if (missingDeps.length === 0) {
    console.log('✅ Todas las dependencias críticas están presentes');
  } else {
    console.log('❌ Dependencias faltantes:', missingDeps.join(', '));
  }
  
} catch (error) {
  console.log('❌ Error leyendo package.json:', error.message);
}

// Verificar variables de entorno
console.log('\n📋 Variables de entorno necesarias para Render:');
console.log('- MONGODB_URI (obligatorio)');
console.log('- CLERK_SECRET_KEY (obligatorio)');
console.log('- CORS_ORIGINS (recomendado)');
console.log('- NODE_ENV=production (recomendado)');
console.log('- PORT (Render lo asigna automáticamente)');

console.log('\n🚀 Lista para despliegue en Render:');
console.log('1. Sube tu código a GitHub');
console.log('2. Conecta tu repositorio en Render');
console.log('3. Configura las variables de entorno');
console.log('4. ¡Despliega!');

console.log('\n📚 Documentación: README.md actualizado con instrucciones detalladas');
