const express = require('express');
const router = express.Router();
// Usar el nuevo servicio de inventario de productos
const inventarioService = require('../services/inventarioproductoserviceservices');
const { authenticate, requireAdmin, requireUser } = require('../middleware/authenticate');

// Alta o incremento de stock (POST /api/inventario)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { codigoCatalogo, cantidad, precio, lote, observaciones } = req.body;
    const userData = {
      userId: req.user.clerk_id || req.user.id,
      creatorId: req.user.clerk_id || req.user.id,
      creatorName: req.user.email.split('@')[0],
      creatorEmail: req.user.email,
      creatorRole: req.user.role
    };
    // Puedes pasar los campos extra si tu servicio los usa
    const inventario = await inventarioService.agregarStock({ codigoCatalogo, cantidad, precio, lote, observaciones, userData });
    res.status(201).json(inventario);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});
// Historial de entradas de inventario (GET /api/inventario/historial)
router.get('/historial', authenticate, requireUser, async (req, res) => {
  try {
    const historial = await inventarioService.listarInventario();
    res.json(historial);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Consulta de inventario
router.get('/', authenticate, requireUser, async (req, res) => {
  try {
    const inventario = await inventarioService.listarInventario();
    res.json(inventario);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Registrar venta
router.post('/venta', authenticate, requireAdmin, async (req, res) => {
  try {
    const { inventarioId, cantidad } = req.body;
    const usuario = req.user.email.split('@')[0];
    const inventario = await inventarioService.registrarVenta({ inventarioId, cantidad, usuario });
    res.json(inventario);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Registrar devolución
router.post('/devolucion', authenticate, requireAdmin, async (req, res) => {
  try {
    const { inventarioId, cantidad } = req.body;
    const usuario = req.user.email.split('@')[0];
    const inventario = await inventarioService.registrarDevolucion({ inventarioId, cantidad, usuario });
    res.json(inventario);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

// Consultar movimientos de un inventario
router.get('/:inventarioId/movimientos', authenticate, requireUser, async (req, res) => {
  try {
    const movimientos = await inventarioService.listarMovimientos(req.params.inventarioId);
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
