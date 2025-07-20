const express = require('express');
const router = express.Router();
const materialService = require('../services/materialService');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// GET /api/materiales/productos-catalogo - Obtener productos del catálogo
router.get('/productos-catalogo', async (req, res) => {
    try {
        const productos = await materialService.obtenerProductosCatalogo();
        
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

// GET /api/materiales/estadisticas - Obtener estadísticas
router.get('/estadisticas', async (req, res) => {
    try {
        const estadisticas = await materialService.obtenerEstadisticas();
        
        res.json({
            success: true,
            data: estadisticas
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/materiales/bajo-stock - Obtener materiales con bajo stock
router.get('/bajo-stock', async (req, res) => {
    try {
        const materiales = await materialService.obtenerMaterialesBajoStock();
        
        res.json({
            success: true,
            data: materiales
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/materiales - Obtener todos los materiales
router.get('/', async (req, res) => {
    try {
        const { buscar, unidadMedida, proveedor, activo } = req.query;
        
        let filtros = {};
        
        if (buscar) {
            filtros.nombre = { $regex: buscar, $options: 'i' };
        }
        
        if (unidadMedida) {
            filtros.unidadMedida = unidadMedida;
        }

        if (proveedor) {
            filtros.proveedor = { $regex: proveedor, $options: 'i' };
        }
        
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }

        const materiales = await materialService.obtenerMateriales(filtros);
        
        res.json({
            success: true,
            data: materiales
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/materiales/:id - Obtener material por ID
router.get('/:id', async (req, res) => {
    try {
        const material = await materialService.obtenerMaterialPorId(req.params.id);
        
        res.json({
            success: true,
            data: material
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/materiales - Crear nuevo material
router.post('/', async (req, res) => {
    try {
        const material = await materialService.crearMaterial(req.body);
        
        res.status(201).json({
            success: true,
            data: material,
            message: 'Material creado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/materiales/:id - Actualizar material
router.put('/:id', async (req, res) => {
    try {
        const material = await materialService.obtenerMaterialPorId(req.params.id);
        
        // Actualizar campos permitidos
        const camposPermitidos = [
            'nombre', 'precioUnitario', 'proveedor', 'numeroLote',
            'fechaVencimiento', 'ubicacionAlmacen', 'stockMinimo', 'activo'
        ];

        camposPermitidos.forEach(campo => {
            if (req.body[campo] !== undefined) {
                material[campo] = req.body[campo];
            }
        });

        await material.save();
        
        res.json({
            success: true,
            data: material,
            message: 'Material actualizado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/materiales/:id/cantidad - Actualizar cantidad de material
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

        const material = await materialService.actualizarCantidad(
            req.params.id,
            cantidad,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: material,
            message: 'Cantidad actualizada exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/materiales/:id/ajustar - Ajustar inventario (sumar/restar)
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

        const material = await materialService.ajustarInventario(
            req.params.id,
            ajuste,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: material,
            message: 'Inventario ajustado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/materiales/:id/consumir - Consumir material
router.post('/:id/consumir', async (req, res) => {
    try {
        const { cantidad, motivo = 'Consumo manual' } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!cantidad || cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a 0'
            });
        }

        const material = await materialService.consumirMaterial(
            req.params.id,
            cantidad,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: material,
            message: 'Material consumido exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/materiales/:id/restaurar - Restaurar material
router.post('/:id/restaurar', async (req, res) => {
    try {
        const { cantidad, motivo = 'Restauración manual' } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!cantidad || cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a 0'
            });
        }

        const material = await materialService.restaurarMaterial(
            req.params.id,
            cantidad,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: material,
            message: 'Material restaurado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/materiales/:id/agregar-stock - Agregar stock
router.post('/:id/agregar-stock', async (req, res) => {
    try {
        const { cantidad, motivo = 'Entrada de stock' } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!cantidad || cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a 0'
            });
        }

        const material = await materialService.agregarStock(
            req.params.id,
            cantidad,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: material,
            message: 'Stock agregado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/materiales/:id/movimientos - Obtener movimientos de inventario
router.get('/:id/movimientos', async (req, res) => {
    try {
        const { limite = 50 } = req.query;
        
        const movimientos = await materialService.obtenerMovimientos(
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

// PUT /api/materiales/:id/activar - Activar material
router.put('/:id/activar', async (req, res) => {
    try {
        const material = await materialService.activarMaterial(req.params.id);
        
        res.json({
            success: true,
            data: material,
            message: 'Material activado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/materiales/:id - Desactivar material
router.delete('/:id', async (req, res) => {
    try {
        const material = await materialService.desactivarMaterial(req.params.id);
        
        res.json({
            success: true,
            data: material,
            message: 'Material desactivado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
