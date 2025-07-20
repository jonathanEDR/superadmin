const express = require('express');
const router = express.Router();
const ingredienteService = require('../services/ingredienteService');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// GET /api/ingredientes/productos-catalogo - Obtener productos del catálogo
router.get('/productos-catalogo', async (req, res) => {
    try {
        const productos = await ingredienteService.obtenerProductosCatalogo();
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/ingredientes - Obtener todos los ingredientes
router.get('/', async (req, res) => {
    try {
        const { buscar, unidadMedida, activo } = req.query;
        
        let filtros = {};
        
        if (buscar) {
            filtros.nombre = { $regex: buscar, $options: 'i' };
        }
        
        if (unidadMedida) {
            filtros.unidadMedida = unidadMedida;
        }
        
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }

        const ingredientes = await ingredienteService.obtenerIngredientes(filtros);
        
        res.json({
            success: true,
            data: ingredientes
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/ingredientes/:id - Obtener ingrediente por ID
router.get('/:id', async (req, res) => {
    try {
        const ingrediente = await ingredienteService.obtenerIngredientePorId(req.params.id);
        
        res.json({
            success: true,
            data: ingrediente
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/ingredientes - Crear nuevo ingrediente
router.post('/', async (req, res) => {
    try {
        const ingrediente = await ingredienteService.crearIngrediente(req.body);
        
        res.status(201).json({
            success: true,
            data: ingrediente,
            message: 'Ingrediente creado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/ingredientes/:id - Actualizar ingrediente
router.put('/:id', async (req, res) => {
    try {
        const ingrediente = await ingredienteService.obtenerIngredientePorId(req.params.id);
        
        Object.assign(ingrediente, req.body);
        await ingrediente.save();
        
        res.json({
            success: true,
            data: ingrediente,
            message: 'Ingrediente actualizado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/ingredientes/:id/cantidad - Actualizar cantidad de ingrediente
router.put('/:id/cantidad', async (req, res) => {
    try {
        const { cantidad, motivo } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (cantidad === undefined || !motivo) {
            return res.status(400).json({
                success: false,
                message: 'Cantidad y motivo son requeridos'
            });
        }

        const ingrediente = await ingredienteService.actualizarCantidad(
            req.params.id,
            cantidad,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: ingrediente,
            message: 'Cantidad actualizada exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/ingredientes/:id/ajustar - Ajustar inventario (sumar/restar)
router.post('/:id/ajustar', async (req, res) => {
    try {
        const { ajuste, motivo } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (ajuste === undefined || !motivo) {
            return res.status(400).json({
                success: false,
                message: 'Ajuste y motivo son requeridos'
            });
        }

        const ingrediente = await ingredienteService.ajustarInventario(
            req.params.id,
            ajuste,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: ingrediente,
            message: 'Inventario ajustado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/ingredientes/:id/movimientos - Obtener movimientos de inventario
router.get('/:id/movimientos', async (req, res) => {
    try {
        const { limite = 50 } = req.query;
        
        const movimientos = await ingredienteService.obtenerMovimientos(
            req.params.id,
            parseInt(limite)
        );
        
        res.json({
            success: true,
            data: movimientos
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/ingredientes/:id - Desactivar ingrediente
router.delete('/:id', async (req, res) => {
    try {
        const ingrediente = await ingredienteService.obtenerIngredientePorId(req.params.id);
        
        ingrediente.activo = false;
        await ingrediente.save();
        
        res.json({
            success: true,
            message: 'Ingrediente desactivado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
