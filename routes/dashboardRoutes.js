const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate');
const Ingrediente = require('../models/produccion/Ingrediente');
const RecetaProducto = require('../models/produccion/RecetaProducto');
const ProduccionOrden = require('../models/produccion/ProduccionOrden');
const MovimientoInventario = require('../models/produccion/MovimientoInventario');

// GET /api/dashboard/test - Endpoint de prueba sin autenticación
router.get('/test', async (req, res) => {
    try {
        console.log('=== TEST DASHBOARD ===');
        res.json({
            success: true,
            message: 'Dashboard route working',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error en test dashboard:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/dashboard/estadisticas-temp - Versión temporal sin autenticación para diagnóstico
router.get('/estadisticas-temp', async (req, res) => {
    try {
        console.log('=== ESTADÍSTICAS PRODUCCIÓN (TEMP) ===');
        
        // 1. Ingredientes activos
        const ingredientesActivos = await Ingrediente.countDocuments({ activo: true });
        console.log('Ingredientes activos:', ingredientesActivos);
        
        // 2. Recetas registradas (activas)
        const recetasRegistradas = await RecetaProducto.countDocuments({ activo: true });
        console.log('Recetas registradas:', recetasRegistradas);
        
        // 3. Producciones activas (en proceso, pendientes)
        const produccionesActivas = await ProduccionOrden.countDocuments({ 
            estado: { $in: ['pendiente', 'en_proceso'] }
        });
        console.log('Producciones activas:', produccionesActivas);
        
        // 4. Movimientos de inventario hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const movimientosHoy = await MovimientoInventario.countDocuments({
            fecha: {
                $gte: today,
                $lt: tomorrow
            }
        });
        console.log('Movimientos hoy:', movimientosHoy);
        
        const estadisticas = {
            ingredientesActivos,
            recetasRegistradas,
            produccionesActivas,
            movimientosHoy
        };
        
        console.log('Estadísticas finales:', estadisticas);
        
        res.json({
            success: true,
            data: estadisticas,
            note: 'Endpoint temporal sin autenticación'
        });
    } catch (error) {
        console.error('Error al obtener estadísticas de producción:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Middleware de autenticación para las rutas que lo requieren
router.use(authenticate);

// GET /api/dashboard/estadisticas-produccion - Obtener estadísticas del módulo de producción
router.get('/estadisticas-produccion', async (req, res) => {
    try {
        console.log('=== ESTADÍSTICAS PRODUCCIÓN ===');
        
        // 1. Ingredientes activos
        const ingredientesActivos = await Ingrediente.countDocuments({ activo: true });
        console.log('Ingredientes activos:', ingredientesActivos);
        
        // 2. Recetas registradas (activas)
        const recetasRegistradas = await RecetaProducto.countDocuments({ activo: true });
        console.log('Recetas registradas:', recetasRegistradas);
        
        // 3. Producciones activas (en proceso, pendientes)
        const produccionesActivas = await ProduccionOrden.countDocuments({ 
            estado: { $in: ['pendiente', 'en_proceso'] }
        });
        console.log('Producciones activas:', produccionesActivas);
        
        // 4. Movimientos de inventario hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const movimientosHoy = await MovimientoInventario.countDocuments({
            fecha: {
                $gte: today,
                $lt: tomorrow
            }
        });
        console.log('Movimientos hoy:', movimientosHoy);
        
        const estadisticas = {
            ingredientesActivos,
            recetasRegistradas,
            produccionesActivas,
            movimientosHoy
        };
        
        console.log('Estadísticas finales:', estadisticas);
        
        res.json({
            success: true,
            data: estadisticas
        });
    } catch (error) {
        console.error('Error al obtener estadísticas de producción:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
