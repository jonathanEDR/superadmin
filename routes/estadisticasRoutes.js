const express = require('express');
const router = express.Router();
const Ingrediente = require('../models/pruduccion/Ingrediente');
const RecetaProducto = require('../models/pruduccion/RecetaProducto');
const Produccion = require('../models/pruduccion/Produccion');
const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');

// GET /api/estadisticas/dashboard - Obtener estadísticas del dashboard
router.get('/dashboard', async (req, res) => {
  try {
    console.log('Obteniendo estadísticas del dashboard...');

    // Obtener estadísticas en paralelo para mejor rendimiento
    const [
      ingredientesActivos,
      recetasDisponibles,
      produccionesCompletadas,
      movimientosHoy
    ] = await Promise.all([
      // Ingredientes activos CON STOCK > 0 (cantidad - procesado > 0)
      Ingrediente.countDocuments({ 
        activo: true,
        $expr: { 
          $gt: [
            { $subtract: [
              { $ifNull: ["$cantidad", 0] }, 
              { $ifNull: ["$procesado", 0] }
            ]}, 
            0
          ] 
        }
      }),
      
      // Recetas CON STOCK DISPONIBLE > 0 (cantidadProducida - cantidadUtilizada > 0)
      RecetaProducto.countDocuments({
        activo: true,
        $expr: { 
          $gt: [
            { $subtract: [
              { $ifNull: ["$inventario.cantidadProducida", 0] }, 
              { $ifNull: ["$inventario.cantidadUtilizada", 0] }
            ]}, 
            0
          ] 
        }
      }),
      
      // Producciones COMPLETADAS (conteo de producciones completadas)
      Produccion.countDocuments({ 
        estado: 'completada'
      }),
      
      // Movimientos de hoy
      MovimientoInventario.countDocuments({
        fecha: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lte: new Date(new Date().setHours(23, 59, 59, 999))
        }
      })
    ]);

    // Estadísticas adicionales para métricas complementarias
    const [
      totalIngredientes,
      totalRecetas,
      totalProducciones,
      movimientosUltimos7Dias
    ] = await Promise.all([
      Ingrediente.countDocuments({ activo: true }),
      RecetaProducto.countDocuments({ activo: true }),
      Produccion.countDocuments(),
      MovimientoInventario.countDocuments({
        fecha: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      })
    ]);

    const estadisticas = {
      ingredientesActivos, // Ingredientes con stock > 0
      recetasDisponibles,  // Recetas con stock disponible > 0
      produccionesCompletadas, // Producciones completadas
      movimientosHoy,
      // Estadísticas adicionales para métricas
      totalIngredientes,
      totalRecetas,
      totalProducciones,
      movimientosUltimos7Dias,
      // Porcentajes para indicadores
      porcentajeIngredientesConStock: totalIngredientes > 0 
        ? Math.round((ingredientesActivos / totalIngredientes) * 100) 
        : 0,
      porcentajeRecetasDisponibles: totalRecetas > 0 
        ? Math.round((recetasDisponibles / totalRecetas) * 100) 
        : 0
    };

    console.log('Estadísticas obtenidas:', estadisticas);

    res.json({
      success: true,
      data: estadisticas
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// GET /api/estadisticas/resumen-inventario - Resumen del estado del inventario
router.get('/resumen-inventario', async (req, res) => {
  try {
    const resumenInventario = await Ingrediente.aggregate([
      {
        $group: {
          _id: null,
          totalIngredientes: { $sum: 1 },
          ingredientesActivos: {
            $sum: { $cond: [{ $eq: ['$activo', true] }, 1, 0] }
          },
          stockTotal: { $sum: '$cantidadStock' },
          valorTotalInventario: {
            $sum: { $multiply: ['$cantidadStock', '$precio'] }
          }
        }
      }
    ]);

    const ingredientesBajoStock = await Ingrediente.countDocuments({
      activo: true,
      cantidadStock: { $lte: 10 } // Consideramos bajo stock <= 10
    });

    res.json({
      success: true,
      data: {
        ...resumenInventario[0],
        ingredientesBajoStock
      }
    });

  } catch (error) {
    console.error('Error al obtener resumen de inventario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

module.exports = router;
