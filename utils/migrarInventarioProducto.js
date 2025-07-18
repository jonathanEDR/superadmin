const mongoose = require('mongoose');
const InventarioProducto = require('../models/InventarioProducto');
require('dotenv').config();

/**
 * Script de migración para actualizar registros existentes
 * Ejecutar solo una vez después de los cambios al modelo
 */

async function migrarInventarioProducto() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('Conectado a MongoDB');

    // Obtener todos los registros existentes
    const registrosExistentes = await InventarioProducto.find({});
    console.log(`Encontrados ${registrosExistentes.length} registros para migrar`);

    let migrados = 0;

    for (const registro of registrosExistentes) {
      try {
        // Establecer campos nuevos si no existen
        let actualizado = false;

        if (!registro.cantidadInicial) {
          registro.cantidadInicial = registro.cantidad;
          actualizado = true;
        }

        if (!registro.cantidadDisponible) {
          registro.cantidadDisponible = registro.cantidad;
          actualizado = true;
        }

        if (!registro.costoTotal) {
          registro.costoTotal = registro.cantidad * registro.precio;
          actualizado = true;
        }

        if (!registro.numeroEntrada) {
          // Generar número de entrada basado en la fecha
          const fecha = new Date(registro.fechaEntrada || registro.createdAt);
          const year = fecha.getFullYear();
          const month = String(fecha.getMonth() + 1).padStart(2, '0');
          const day = String(fecha.getDate()).padStart(2, '0');
          const timestamp = Date.now().toString().slice(-4);
          registro.numeroEntrada = `ENT-${year}${month}${day}-${timestamp}`;
          actualizado = true;
        }

        if (!registro.usuario) {
          registro.usuario = 'Sistema';
          actualizado = true;
        }

        if (actualizado) {
          await registro.save();
          migrados++;
          console.log(`Migrado registro ${registro._id}`);
        }

      } catch (error) {
        console.error(`Error al migrar registro ${registro._id}:`, error.message);
      }
    }

    console.log(`Migración completada. ${migrados} registros actualizados.`);

  } catch (error) {
    console.error('Error durante la migración:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Conexión cerrada');
  }
}

// Ejecutar migración si se llama directamente
if (require.main === module) {
  migrarInventarioProducto();
}

module.exports = migrarInventarioProducto;
