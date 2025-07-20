const express = require('express');
const router = express.Router();
const recetaService = require('../services/recetaService');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// GET /api/recetas - Obtener todas las recetas
router.get('/', async (req, res) => {
    try {
        const { buscar, categoria, activo } = req.query;
        
        let filtros = {};
        
        if (buscar) {
            filtros.nombre = { $regex: buscar, $options: 'i' };
        }
        
        if (categoria) {
            filtros.categoria = categoria;
        }
        
        if (activo !== undefined) {
            filtros.activo = activo === 'true';
        }

        const recetas = await recetaService.obtenerRecetas(filtros);
        
        res.json({
            success: true,
            data: recetas
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/recetas/:id - Obtener receta por ID
router.get('/:id', async (req, res) => {
    try {
        const receta = await recetaService.obtenerRecetaPorId(req.params.id);
        
        res.json({
            success: true,
            data: receta
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/recetas - Crear nueva receta
router.post('/', async (req, res) => {
    try {
        const { consumirIngredientes = true, ...datosReceta } = req.body;
        const receta = await recetaService.crearReceta(datosReceta, consumirIngredientes);
        
        res.status(201).json({
            success: true,
            data: receta,
            message: consumirIngredientes 
                ? 'Receta creada exitosamente e ingredientes consumidos'
                : 'Receta creada exitosamente (ingredientes no consumidos)'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/recetas/:id - Actualizar receta
router.put('/:id', async (req, res) => {
    try {
        const receta = await recetaService.actualizarReceta(req.params.id, req.body);
        
        res.json({
            success: true,
            data: receta,
            message: 'Receta actualizada exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/recetas/:id/estado - Cambiar estado/categoría de la receta
router.put('/:id/estado', async (req, res) => {
    try {
        const { categoria } = req.body;
        
        if (!['producto_terminado', 'producto_intermedio', 'preparado'].includes(categoria)) {
            return res.status(400).json({
                success: false,
                message: 'Categoría no válida. Debe ser: producto_terminado, producto_intermedio o preparado'
            });
        }

        const receta = await recetaService.cambiarCategoria(req.params.id, categoria);
        
        res.json({
            success: true,
            data: receta,
            message: `Receta cambiada a ${categoria} exitosamente`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// ============= NUEVAS RUTAS PARA FLUJO DE TRABAJO =============

// POST /api/recetas/:id/iniciar-proceso - Iniciar el proceso de producción
router.post('/:id/iniciar-proceso', async (req, res) => {
    try {
        const receta = await recetaService.iniciarProceso(req.params.id);
        
        res.json({
            success: true,
            data: receta,
            message: 'Proceso de producción iniciado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/recetas/:id/avanzar-fase - Avanzar a la siguiente fase del proceso
router.post('/:id/avanzar-fase', async (req, res) => {
    try {
        const { 
            notas, 
            notasNuevaFase, 
            ingredientesAdicionales = [] 
        } = req.body;
        
        const receta = await recetaService.avanzarFase(req.params.id, {
            notas,
            notasNuevaFase,
            ingredientesAdicionales
        });
        
        res.json({
            success: true,
            data: receta,
            message: `Receta avanzada a fase ${receta.faseActual} exitosamente`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/recetas/:id/agregar-ingrediente-fase - Agregar ingrediente a la fase actual
router.post('/:id/agregar-ingrediente-fase', async (req, res) => {
    try {
        const ingredienteData = req.body;
        
        const receta = await recetaService.agregarIngredienteAFaseActual(req.params.id, ingredienteData);
        
        res.json({
            success: true,
            data: receta,
            message: 'Ingrediente agregado a la fase actual exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/recetas/:id/pausar-proceso - Pausar el proceso
router.put('/:id/pausar-proceso', async (req, res) => {
    try {
        const { motivo } = req.body;
        
        const receta = await recetaService.pausarProceso(req.params.id, motivo);
        
        res.json({
            success: true,
            data: receta,
            message: 'Proceso pausado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/recetas/:id/reanudar-proceso - Reanudar el proceso
router.put('/:id/reanudar-proceso', async (req, res) => {
    try {
        const receta = await recetaService.reanudarProceso(req.params.id);
        
        res.json({
            success: true,
            data: receta,
            message: 'Proceso reanudado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// 🎯 NUEVO: PUT /api/recetas/:id/reiniciar - Reiniciar receta al estado inicial
router.put('/:id/reiniciar', async (req, res) => {
    try {
        const { motivo = 'Reinicio manual' } = req.body;
        
        const receta = await recetaService.reiniciarReceta(req.params.id, motivo);
        
        res.json({
            success: true,
            data: receta,
            message: 'Receta reiniciada exitosamente al estado preparado'
        });
    } catch (error) {
        console.error('Error al reiniciar receta:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/recetas/:id/disponibilidad - Verificar disponibilidad para producir
router.get('/:id/disponibilidad', async (req, res) => {
    try {
        const { cantidad = 1 } = req.query;
        
        const disponibilidad = await recetaService.verificarDisponibilidad(
            req.params.id,
            parseInt(cantidad)
        );
        
        res.json({
            success: true,
            data: disponibilidad
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/recetas/:id/costo - Calcular costo de producción
router.get('/:id/costo', async (req, res) => {
    try {
        const { cantidad = 1 } = req.query;
        
        const costo = await recetaService.calcularCosto(
            req.params.id,
            parseInt(cantidad)
        );
        
        res.json({
            success: true,
            data: costo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/recetas/:id/inventario/entrada - Agregar al inventario de receta
router.post('/:id/inventario/entrada', async (req, res) => {
    try {
        const { cantidad, motivo = 'Entrada manual' } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!cantidad || cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Cantidad debe ser mayor a 0'
            });
        }

        const receta = await recetaService.obtenerRecetaPorId(req.params.id);
        await receta.agregarAlInventario(cantidad, `${motivo} - ${operador}`);
        
        res.json({
            success: true,
            data: receta,
            message: 'Inventario actualizado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/recetas/:id/inventario/salida - Usar del inventario de receta
router.post('/:id/inventario/salida', async (req, res) => {
    try {
        const { cantidad, motivo = 'Salida manual' } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!cantidad || cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Cantidad debe ser mayor a 0'
            });
        }

        const receta = await recetaService.obtenerRecetaPorId(req.params.id);
        await receta.usarReceta(cantidad, `${motivo} - ${operador}`);
        
        res.json({
            success: true,
            data: receta,
            message: 'Inventario actualizado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/recetas/:id/inventario/agregar - Agregar al inventario
router.post('/:id/inventario/agregar', async (req, res) => {
    try {
        const { cantidad, motivo = 'Ajuste manual' } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!cantidad || cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a 0'
            });
        }

        const receta = await recetaService.obtenerRecetaPorId(req.params.id);
        await receta.agregarAlInventario(cantidad, `${motivo} - ${operador}`);
        
        res.json({
            success: true,
            data: {
                receta: receta.nombre,
                inventarioAnterior: receta.inventario.cantidadProducida - cantidad,
                inventarioNuevo: receta.inventario.cantidadProducida,
                cantidadAgregada: cantidad
            },
            message: 'Inventario actualizado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/recetas/:id/inventario/usar - Usar del inventario
router.post('/:id/inventario/usar', async (req, res) => {
    try {
        const { cantidad, motivo = 'Uso manual' } = req.body;
        const operador = req.user?.name || 'Usuario';
        
        if (!cantidad || cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a 0'
            });
        }

        const receta = await recetaService.obtenerRecetaPorId(req.params.id);
        await receta.usarReceta(cantidad, `${motivo} - ${operador}`);
        
        res.json({
            success: true,
            data: {
                receta: receta.nombre,
                inventarioAnterior: receta.inventario.cantidadUtilizada - cantidad,
                inventarioNuevo: receta.inventario.cantidadUtilizada,
                cantidadUsada: cantidad,
                disponible: receta.inventarioDisponible
            },
            message: 'Inventario actualizado exitosamente'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/recetas/:id/inventario - Obtener estado del inventario
router.get('/:id/inventario', async (req, res) => {
    try {
        const receta = await recetaService.obtenerRecetaPorId(req.params.id);
        
        res.json({
            success: true,
            data: {
                receta: receta.nombre,
                inventario: receta.inventario,
                disponible: receta.inventarioDisponible
            }
        });
    } catch (error) {
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
});

// ============= RUTAS PARA FLUJO DE TRABAJO =============

// POST /api/recetas/:id/avanzar-fase - Avanzar fase del proceso
router.post('/:id/avanzar-fase', async (req, res) => {
    try {
        console.log('🚀 Ruta avanzar-fase llamada para receta:', req.params.id);
        console.log('📋 Datos recibidos:', req.body);
        
        const recetaActualizada = await recetaService.avanzarFase(req.params.id, req.body);
        
        res.json({
            success: true,
            data: recetaActualizada,
            message: 'Fase avanzada exitosamente'
        });
    } catch (error) {
        console.error('❌ Error en ruta avanzar-fase:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/recetas/:id - Desactivar receta
router.delete('/:id', async (req, res) => {
    try {
        const receta = await recetaService.desactivarReceta(req.params.id);
        
        res.json({
            success: true,
            data: receta,
            message: 'Receta desactivada exitosamente y ingredientes liberados'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
