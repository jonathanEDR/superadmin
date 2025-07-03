const express = require('express');
const router = express.Router();
const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// GET /api/movimientos - Obtener todos los movimientos (con filtros)
router.get('/', async (req, res) => {
    try {
        const { 
            tipo, 
            tipoItem, 
            fechaInicio, 
            fechaFin, 
            operador,
            limite = 50,
            pagina = 1 
        } = req.query;
        
        let filtros = {};
        
        if (tipo) {
            filtros.tipo = tipo;
        }
        
        if (tipoItem) {
            filtros.tipoItem = tipoItem;
        }
        
        if (operador) {
            filtros.operador = { $regex: operador, $options: 'i' };
        }
        
        if (fechaInicio || fechaFin) {
            filtros.fecha = {};
            if (fechaInicio) filtros.fecha.$gte = new Date(fechaInicio);
            if (fechaFin) filtros.fecha.$lte = new Date(fechaFin);
        }

        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        
        const movimientos = await MovimientoInventario.find(filtros)
            .populate('item')
            .sort({ fecha: -1 })
            .skip(skip)
            .limit(parseInt(limite));

        const total = await MovimientoInventario.countDocuments(filtros);
        
        res.json({
            success: true,
            data: {
                movimientos,
                total,
                pagina: parseInt(pagina),
                totalPaginas: Math.ceil(total / parseInt(limite))
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/movimientos/:id - Obtener movimiento específico
router.get('/:id', async (req, res) => {
    try {
        const movimiento = await MovimientoInventario.findById(req.params.id)
            .populate('item');
        
        if (!movimiento) {
            return res.status(404).json({
                success: false,
                message: 'Movimiento no encontrado'
            });
        }
        
        res.json({
            success: true,
            data: movimiento
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/movimientos/resumen/por-tipo - Resumen de movimientos por tipo
router.get('/resumen/por-tipo', async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        
        let filtros = {};
        if (fechaInicio || fechaFin) {
            filtros.fecha = {};
            if (fechaInicio) filtros.fecha.$gte = new Date(fechaInicio);
            if (fechaFin) filtros.fecha.$lte = new Date(fechaFin);
        }

        const resumen = await MovimientoInventario.aggregate([
            { $match: filtros },
            {
                $group: {
                    _id: '$tipo',
                    total: { $sum: 1 },
                    cantidadTotal: { $sum: '$cantidad' }
                }
            },
            { $sort: { total: -1 } }
        ]);
        
        res.json({
            success: true,
            data: resumen
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/movimientos/resumen/por-operador - Resumen de movimientos por operador
router.get('/resumen/por-operador', async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        
        let filtros = {};
        if (fechaInicio || fechaFin) {
            filtros.fecha = {};
            if (fechaInicio) filtros.fecha.$gte = new Date(fechaInicio);
            if (fechaFin) filtros.fecha.$lte = new Date(fechaFin);
        }

        const resumen = await MovimientoInventario.aggregate([
            { $match: filtros },
            {
                $group: {
                    _id: '$operador',
                    total: { $sum: 1 },
                    tipos: { $addToSet: '$tipo' }
                }
            },
            { $sort: { total: -1 } }
        ]);
        
        res.json({
            success: true,
            data: resumen
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
