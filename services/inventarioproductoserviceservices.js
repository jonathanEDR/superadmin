const Inventario = require('../models/Inventario');
const CatalogoProducto = require('../models/CatalogoProducto');
const MovimientoInventario = require('../models/MovimientoInventario');

const inventarioProductoService = {
  // Crear o incrementar inventario
  async agregarStock({ codigoCatalogo, cantidad, userData }) {
    // Buscar producto en catálogo
    let catalogo = await CatalogoProducto.findOne({ codigoCatalogo });
    if (!catalogo) {
      throw { status: 404, message: 'Producto no existe en el catálogo' };
    }
    // Buscar inventario existente
    let inventario = await Inventario.findOne({ catalogo: catalogo._id });
    if (inventario) {
      inventario.cantidad += cantidad;
      await inventario.save();
    } else {
      inventario = new Inventario({
        catalogo: catalogo._id,
        cantidad,
        userId: userData.userId,
        creatorId: userData.creatorId,
        creatorName: userData.creatorName,
        creatorEmail: userData.creatorEmail,
        creatorRole: userData.creatorRole
      });
      await inventario.save();
    }
    // Registrar movimiento
    await MovimientoInventario.create({
      inventario: inventario._id,
      tipo: 'ingreso',
      cantidad,
      usuario: userData.creatorName
    });
    return inventario;
  },

  // Consultar inventario
  async listarInventario() {
    return Inventario.find().populate('catalogo');
  },

  // Registrar venta
  async registrarVenta({ inventarioId, cantidad, usuario }) {
    const inventario = await Inventario.findById(inventarioId);
    if (!inventario) throw { status: 404, message: 'Inventario no encontrado' };
    if (cantidad > inventario.cantidad) throw { status: 400, message: 'Stock insuficiente' };
    inventario.cantidad -= cantidad;
    inventario.cantidadVendida += cantidad;
    await inventario.save();
    await MovimientoInventario.create({
      inventario: inventario._id,
      tipo: 'venta',
      cantidad,
      usuario
    });
    return inventario;
  },

  // Registrar devolución
  async registrarDevolucion({ inventarioId, cantidad, usuario }) {
    const inventario = await Inventario.findById(inventarioId);
    if (!inventario) throw { status: 404, message: 'Inventario no encontrado' };
    inventario.cantidad += cantidad;
    inventario.cantidadDevuelta += cantidad;
    await inventario.save();
    await MovimientoInventario.create({
      inventario: inventario._id,
      tipo: 'devolucion',
      cantidad,
      usuario
    });
    return inventario;
  },

  // Consultar movimientos
  async listarMovimientos(inventarioId) {
    return MovimientoInventario.find({ inventario: inventarioId }).sort({ createdAt: -1 });
  }
};

module.exports = inventarioProductoService;
