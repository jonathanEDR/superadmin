const express = require('express');
const router = express.Router();
const produccionService = require('../services/produccionService');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// GET /api/produccion/verificar-nombre/:nombre - Verificar si un nombre está disponible
router.get('/verificar-nombre/:nombre', async (req, res) => {
    try {
        const { nombre } = req.params;
        const { excluirId } = req.query;
        
        const disponible = await produccionService.verificarNombreDisponible(nombre, excluirId);
        
        res.json({
            success: true,
            disponible,
            message: disponible ? 'Nombre disponible' : 'Ya existe una producción con este nombre'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/produccion/agrupadas - Obtener producciones agrupadas por producto
router.get('/agrupadas', async (req, res) => {
    try {
        const { 
            buscar, 
            estado, 
            fechaInicio, 
            fechaFin, 
            operador,
            limite = 50,
            pagina = 1 
        } = req.query;
        
        let filtros = {};
        
        if (buscar) {
            filtros.nombre = { $regex: buscar, $options: 'i' };
        }
        
        if (estado) {
            filtros.estado = estado;
        }
        
        if (operador) {
            filtros.operador = { $regex: operador, $options: 'i' };
        }
        
        if (fechaInicio || fechaFin) {
            filtros.fechaProduccion = {};
            if (fechaInicio) filtros.fechaProduccion.$gte = new Date(fechaInicio);
            if (fechaFin) filtros.fechaProduccion.$lte = new Date(fechaFin);
        }

        const resultado = await produccionService.obtenerProduccionesAgrupadas(
            filtros,
            parseInt(limite),
            parseInt(pagina)
        );
        
        res.json({
            success: true,
            data: resultado
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/produccion - Obtener todas las producciones
router.get('/', async (req, res) => {
    try {
        const { 
            buscar, 
            estado, 
            fechaInicio, 
            fechaFin, 
            operador,
            limite = 50,
            pagina = 1 
        } = req.query;
        
        let filtros = {};
        
        if (buscar) {
            filtros.nombre = { $regex: buscar, $options: 'i' };
        }
        
        if (estado) {
            filtros.estado = estado;
        }
        
        if (operador) {
            filtros.operador = { $regex: operador, $options: 'i' };
        }
        
        if (fechaInicio || fechaFin) {
            filtros.fechaProduccion = {};
            if (fechaInicio) filtros.fechaProduccion.$gte = new Date(fechaInicio);
            if (fechaFin) filtros.fechaProduccion.$lte = new Date(fechaFin);
        }

        const resultado = await produccionService.obtenerProducciones(
            filtros,
            parseInt(limite),
            parseInt(pagina)
        );
        
        res.json({
            success: true,
            data: resultado
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/produccion/:id - Obtener producción por ID
router.get('/:id', async (req, res) => {
    try {
        const produccion = await produccionService.obtenerProduccionPorId(req.params.id);
        
        res.json({
            success: true,
            data: produccion
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/produccion/desde-receta - Crear producción desde receta
router.post('/desde-receta', async (req, res) => {
    try {
        const { recetaId, cantidad, observaciones } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!recetaId || !cantidad) {
            return res.status(400).json({
                success: false,
                message: 'Receta ID y cantidad son requeridos'
            });
        }

        const produccion = await produccionService.crearProduccionDesdeReceta(
            recetaId,
            cantidad,
            operador,
            observaciones
        );
        
        res.status(201).json({
            success: true,
            data: produccion,
            message: 'Producción creada exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/produccion/manual - Crear producción manual
router.post('/manual', async (req, res) => {
    try {
        console.log('🎯 Ruta /manual llamada');
        console.log('👤 Usuario:', req.user);
        console.log('📦 Body recibido:', req.body);
        
        const operador = req.user?.name || 'Usuario';
        const datosProduccion = {
            ...req.body,
            operador
        };

        console.log('📋 Datos finales para servicio:', datosProduccion);
        
        const produccion = await produccionService.crearProduccionManual(datosProduccion);
        
        console.log('✅ Producción creada exitosamente en ruta');
        
        res.status(201).json({
            success: true,
            data: produccion,
            message: 'Producción manual creada exitosamente'
        });
    } catch (error) {
        console.error('❌ Error en ruta /manual:', error.message);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/produccion/:id/ejecutar - Ejecutar producción
router.post('/:id/ejecutar', async (req, res) => {
    try {
        const operador = req.user?.name || 'Usuario';
        
        const produccion = await produccionService.ejecutarProduccion(
            req.params.id,
            operador
        );
        
        res.json({
            success: true,
            data: produccion,
            message: 'Producción ejecutada exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/produccion/:id/cancelar - Cancelar producción
router.post('/:id/cancelar', async (req, res) => {
    try {
        const { motivo } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!motivo) {
            return res.status(400).json({
                success: false,
                message: 'Motivo de cancelación es requerido'
            });
        }

        const produccion = await produccionService.cancelarProduccion(
            req.params.id,
            motivo,
            operador
        );
        
        res.json({
            success: true,
            data: produccion,
            message: 'Producción cancelada exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/produccion/reportes/resumen - Obtener reporte de producción
router.get('/reportes/resumen', async (req, res) => {
    try {
        const { fechaInicio, fechaFin } = req.query;
        
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({
                success: false,
                message: 'Fecha de inicio y fin son requeridas'
            });
        }

        const reporte = await produccionService.obtenerReporteProduccion(
            fechaInicio,
            fechaFin
        );
        
        res.json({
            success: true,
            data: reporte
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/produccion/:id - Actualizar producción (solo si no está ejecutada)
router.put('/:id', async (req, res) => {
    try {
        const produccion = await produccionService.obtenerProduccionPorId(req.params.id);
        
        if (produccion.estado === 'completada') {
            return res.status(400).json({
                success: false,
                message: 'No se puede modificar una producción completada'
            });
        }
        
        Object.assign(produccion, req.body);
        await produccion.save();
        
        res.json({
            success: true,
            data: produccion,
            message: 'Producción actualizada exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/produccion/:id - Eliminar producción
router.delete('/:id', async (req, res) => {
    try {
        console.log('🗑️ Solicitud de eliminación de producción:', req.params.id);
        
        // Verificar que la producción existe antes de eliminar
        const produccion = await produccionService.obtenerProduccionPorId(req.params.id);
        console.log(`📋 Producción encontrada: "${produccion.nombre}" - Estado: ${produccion.estado}`);
        
        // Permitir eliminar producciones en cualquier estado
        const resultado = await produccionService.eliminarProduccion(req.params.id);
        
        res.json({
            success: true,
            message: resultado.message
        });
    } catch (error) {
        console.error('❌ Error al eliminar producción:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
