const RecetaProducto = require('../models/produccion/RecetaProducto');
const Ingrediente = require('../models/produccion/Ingrediente');

/**
 * Utilidad para limpiar recetas desactivadas (inactivas) de la base de datos
 * Ejecutar este script una vez para migrar de "desactivar" a "eliminar"
 */
async function limpiarRecetasInactivas() {
    try {
        console.log('🧹 Iniciando limpieza de recetas inactivas...');
        
        // Buscar todas las recetas inactivas
        const recetasInactivas = await RecetaProducto.find({ activo: false })
            .populate('ingredientes.ingrediente');
        
        console.log(`📋 Encontradas ${recetasInactivas.length} recetas inactivas para limpiar`);
        
        let eliminadas = 0;
        
        for (const receta of recetasInactivas) {
            console.log(`\n🗑️ Procesando receta inactiva: "${receta.nombre}"`);
            
            try {
                // Restaurar ingredientes si es necesario
                if (receta.ingredientes && receta.ingredientes.length > 0) {
                    console.log('  🔄 Restaurando ingredientes...');
                    
                    for (const itemReceta of receta.ingredientes) {
                        if (itemReceta.ingrediente && itemReceta.ingrediente.activo) {
                            const ingrediente = itemReceta.ingrediente;
                            const cantidadARestaurar = itemReceta.cantidad;
                            
                            // Restaurar usando el método del modelo si existe
                            if (typeof ingrediente.restaurar === 'function') {
                                const exito = await ingrediente.restaurar(
                                    cantidadARestaurar,
                                    `Restaurado por limpieza de receta inactiva: ${receta.nombre}`,
                                    'sistema'
                                );
                                
                                if (exito) {
                                    await ingrediente.save();
                                    console.log(`    📈 Restaurado ${cantidadARestaurar} ${ingrediente.unidadMedida} de ${ingrediente.nombre}`);
                                }
                            } else {
                                // Restaurar manualmente si no existe el método
                                ingrediente.procesado = Math.max(0, ingrediente.procesado - cantidadARestaurar);
                                await ingrediente.save();
                                console.log(`    📈 Restaurado ${cantidadARestaurar} ${ingrediente.unidadMedida} de ${ingrediente.nombre} (manual)`);
                            }
                        }
                    }
                }
                
                // Eliminar la receta completamente
                await RecetaProducto.findByIdAndDelete(receta._id);
                eliminadas++;
                console.log(`  ✅ Receta "${receta.nombre}" eliminada de la base de datos`);
                
            } catch (error) {
                console.error(`  ❌ Error al procesar receta "${receta.nombre}":`, error.message);
            }
        }
        
        console.log(`\n🎉 Limpieza completada:`);
        console.log(`   - Recetas procesadas: ${recetasInactivas.length}`);
        console.log(`   - Recetas eliminadas: ${eliminadas}`);
        console.log(`   - Errores: ${recetasInactivas.length - eliminadas}`);
        
    } catch (error) {
        console.error('❌ Error durante la limpieza:', error);
        throw error;
    }
}

module.exports = { limpiarRecetasInactivas };

// Si se ejecuta directamente
if (require.main === module) {
    const mongoose = require('mongoose');
    
    // Conectar a MongoDB (ajustar según tu configuración)
    mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tu_base_de_datos')
        .then(() => {
            console.log('📦 Conectado a MongoDB');
            return limpiarRecetasInactivas();
        })
        .then(() => {
            console.log('✅ Limpieza completada exitosamente');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}
