const mongoose = require('mongoose');
require('dotenv').config();

async function migrateIngredientesIndex() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventario');
        console.log('✅ Conectado a MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('ingredientes');

        // Verificar índices existentes
        console.log('\n📋 Índices existentes:');
        const existingIndexes = await collection.indexes();
        existingIndexes.forEach(index => {
            console.log(`  - ${index.name}:`, index.key);
        });

        // Eliminar el índice único de nombre si existe
        try {
            await collection.dropIndex('nombre_1');
            console.log('\n🗑️  Índice único de nombre eliminado');
        } catch (error) {
            if (error.code === 27) {
                console.log('\n⚠️  El índice único de nombre no existe (ya fue eliminado)');
            } else {
                console.error('Error al eliminar índice:', error.message);
            }
        }

        // Crear el nuevo índice compuesto con filtro parcial
        try {
            await collection.createIndex(
                { nombre: 1, activo: 1 }, 
                { 
                    unique: true,
                    partialFilterExpression: { activo: true },
                    name: 'nombre_activo_unique'
                }
            );
            console.log('✅ Nuevo índice único parcial creado: nombre + activo (solo para activos)');
        } catch (error) {
            console.error('Error al crear nuevo índice:', error.message);
        }

        // Verificar ingredientes duplicados que podrían causar conflictos
        console.log('\n🔍 Verificando posibles duplicados...');
        const duplicados = await collection.aggregate([
            { $match: { activo: true } },
            { 
                $group: { 
                    _id: { nombre: { $toLower: "$nombre" } }, 
                    count: { $sum: 1 }, 
                    ingredientes: { $push: { _id: "$_id", nombre: "$nombre", activo: "$activo" } }
                } 
            },
            { $match: { count: { $gt: 1 } } }
        ]).toArray();

        if (duplicados.length > 0) {
            console.log(`⚠️  Se encontraron ${duplicados.length} nombres duplicados entre ingredientes activos:`);
            duplicados.forEach(dup => {
                console.log(`  - Nombre: "${dup._id.nombre}" (${dup.count} ingredientes)`);
                dup.ingredientes.forEach((ing, index) => {
                    console.log(`    ${index + 1}. ID: ${ing._id} - Nombre: "${ing.nombre}" - Activo: ${ing.activo}`);
                });
            });
            
            console.log('\n⚠️  NOTA: Deberás resolver estos duplicados manualmente antes de que el nuevo índice funcione correctamente.');
            console.log('    Puedes desactivar los ingredientes duplicados o cambiar sus nombres.');
        } else {
            console.log('✅ No se encontraron duplicados en ingredientes activos');
        }

        // Mostrar índices finales
        console.log('\n📋 Índices finales:');
        const finalIndexes = await collection.indexes();
        finalIndexes.forEach(index => {
            console.log(`  - ${index.name}:`, index.key);
            if (index.partialFilterExpression) {
                console.log(`    Filtro parcial:`, index.partialFilterExpression);
            }
        });

        console.log('\n✅ Migración completada exitosamente');

    } catch (error) {
        console.error('❌ Error en la migración:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Desconectado de MongoDB');
    }
}

// Ejecutar migración
migrateIngredientesIndex();
