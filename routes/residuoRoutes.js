const express = require('express');
const router = express.Router();
const residuoService = require('../services/residuoService');
const Residuo = require('../models/Residuo');
const { authenticate } = require('../middleware/authenticate');

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// POST /api/residuos - Registrar nuevo residuo
router.post('/', async (req, res) => {
    try {
        const usuario = req.user?.name || req.user?.email || 'Usuario Anónimo';
        const residuo = await residuoService.registrarResiduo(req.body, usuario);
        
        res.status(201).json({
            success: true,
            data: residuo,
            message: 'Residuo registrado exitosamente e inventario actualizado'
        });
    } catch (error) {
        console.error('Error al registrar residuo:', error.message);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/residuos - Obtener lista de residuos
router.get('/', async (req, res) => {
    try {
        const { 
            fechaInicio, 
            fechaFin, 
            tipoProducto, 
            motivo, 
            operador, 
            buscar,
            limite = 50,
            pagina = 1 
        } = req.query;
        
        const filtros = {};
        if (fechaInicio) filtros.fechaInicio = fechaInicio;
        if (fechaFin) filtros.fechaFin = fechaFin;
        if (tipoProducto) filtros.tipoProducto = tipoProducto;
        if (motivo) filtros.motivo = motivo;
        if (operador) filtros.operador = operador;
        if (buscar) filtros.buscar = buscar;
        
        const resultado = await residuoService.obtenerResiduos(
            filtros,
            parseInt(limite),
            parseInt(pagina)
        );
        
        res.json({
            success: true,
            data: resultado
        });
    } catch (error) {
        console.error('Error al obtener residuos:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/residuos/productos/:tipo - Obtener productos por tipo
router.get('/productos/:tipo', async (req, res) => {
    try {
        const { tipo } = req.params;
        const productos = await residuoService.obtenerProductosPorTipo(tipo);
        
        res.json({
            success: true,
            data: productos
        });
    } catch (error) {
        console.error('Error al obtener productos:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/residuos/estadisticas - Obtener estadísticas básicas
router.get('/estadisticas', async (req, res) => {
    try {
        const estadisticas = await residuoService.obtenerEstadisticas();
        
        res.json({
            success: true,
            data: estadisticas
        });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/residuos/:id - Eliminar residuo
router.delete('/:id', async (req, res) => {
    try {
        const usuario = req.user?.name || req.user?.email || 'Usuario Anónimo';
        const residuo = await residuoService.eliminarResiduo(req.params.id, usuario);
        
        res.json({
            success: true,
            data: residuo,
            message: 'Residuo eliminado e inventario revertido exitosamente'
        });
    } catch (error) {
        console.error('Error al eliminar residuo:', error.message);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/residuos/:id - Obtener residuo específico
router.get('/:id', async (req, res) => {
    try {
        const residuo = await Residuo.findById(req.params.id);
        if (!residuo) {
            return res.status(404).json({
                success: false,
                message: 'Residuo no encontrado'
            });
        }
        
        res.json({
            success: true,
            data: residuo
        });
    } catch (error) {
        console.error('Error al obtener residuo:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
