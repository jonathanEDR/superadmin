#!/bin/bash

# Script de build para Render
echo "🚀 Iniciando build para Render..."

# Verificar que package-lock.json existe
if [ ! -f "package-lock.json" ]; then
    echo "⚠️  package-lock.json no encontrado, generando..."
    npm install
else
    echo "✅ package-lock.json encontrado"
fi

# Instalar dependencias de producción
echo "📦 Instalando dependencias..."
npm ci --omit=dev || npm install --only=production

echo "✅ Build completado para Render"
