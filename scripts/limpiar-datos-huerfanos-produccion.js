const mongoose = require('mongoose');
const produccionService = require('../services/produccionService');
require('dotenv').config();

async function limpiarDatosHuerfanos() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventario');
        console.log('✅ Conectado a MongoDB');

        // Ejecutar limpieza usando el servicio
        const resultado = await produccionService.limpiarDatosHuerfanos();
        
        console.log('\n📊 Resultado de la limpieza:');
        console.log(`  - Producciones revisadas: ${resultado.produccionesRevisadas}`);
        console.log(`  - Producciones corregidas: ${resultado.produccionesCorregidas}`);
        console.log(`  - Ingredientes huérfanos limpiados: ${resultado.ingredientesHuerfanosLimpiados}`);
        console.log(`  - Recetas huérfanas limpiadas: ${resultado.recetasHuerfanasLimpiadas}`);

        if (resultado.produccionesCorregidas === 0) {
            console.log('✅ No se encontraron datos huérfanos para limpiar');
        } else {
            console.log('✅ Limpieza completada exitosamente');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Desconectado de MongoDB');
    }
}

// Ejecutar
limpiarDatosHuerfanos();
