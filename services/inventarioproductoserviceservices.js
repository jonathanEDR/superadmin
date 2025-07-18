const Inventario = require('../models/Inventario');
const CatalogoProducto = require('../models/CatalogoProducto');
const MovimientoInventario = require('../models/MovimientoInventario');

const inventarioProductoService = {
  // Crear o incrementar inventario
  async agregarStock({ codigoCatalogo, cantidad, userData }) {
    // Buscar producto en catálogo
    let catalogo = await CatalogoProducto.findOne({ codigoproducto: codigoCatalogo });
    console.log('[DEBUG] Datos del catálogo encontrado:', catalogo ? catalogo.toObject() : null);
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

    // --- ACTUALIZAR PRODUCTO GESTIONADO USANDO catalogoProductoId O codigoProducto ---
    const Producto = require('../models/Producto');
    let producto;
    try {
      // Buscar primero por catalogoProductoId
      producto = await Producto.findOne({ catalogoProductoId: catalogo._id });
      console.log('[INVENTARIO] Buscando producto gestionado por catalogoProductoId:', catalogo._id);
      if (!producto) {
        // Si no existe, buscar por codigoProducto
        producto = await Producto.findOne({ codigoProducto: codigoCatalogo });
        console.log('[INVENTARIO] Buscando producto gestionado por codigoProducto:', codigoCatalogo);
      }
      if (producto) {
        console.log('[INVENTARIO] Producto gestionado encontrado:', producto ? producto.toObject() : null);
        producto.cantidad = (producto.cantidad || 0) + cantidad;
        // Si no tiene catalogoProductoId, lo asignamos
        if (!producto.catalogoProductoId) {
          producto.catalogoProductoId = catalogo._id;
        }
        await producto.save();
        console.log('[INVENTARIO] Cantidad actualizada:', producto.cantidad);
      } else {
        console.log('[INVENTARIO] Producto gestionado NO encontrado, creando uno nuevo.');
        producto = new Producto({
          codigoProducto: codigoCatalogo,
          catalogoProductoId: catalogo._id,
          nombre: catalogo.nombre,
          cantidad: cantidad,
          precio: 0,
          categoryId: null,
          creatorId: userData.creatorId,
          creatorName: userData.creatorName,
          creatorEmail: userData.creatorEmail,
          creatorRole: userData.creatorRole
        });
        await producto.save();
        console.log('[INVENTARIO] Producto gestionado creado:', producto ? producto.toObject() : null);
      }
    } catch (err) {
      console.error('[INVENTARIO] Error actualizando producto gestionado:', err);
    }

    // Registrar movimiento SOLO si el modelo es el correcto
    if (MovimientoInventario.schema.paths.inventario) {
      await MovimientoInventario.create({
        inventario: inventario._id,
        tipo: 'ingreso',
        cantidad,
        usuario: userData.creatorName
      });
    } else {
      // No registrar movimiento si el modelo no es el esperado
      console.log('[INVENTARIO] MovimientoInventario no tiene campo inventario, se omite registro de movimiento.');
    }
    return inventario;
  },

  // Consultar inventario
  async listarInventario() {
    const entradas = await Inventario.find().populate('catalogo');
    return entradas.map(e => ({
      _id: e._id,
      fecha: e.createdAt || e.fechaEntrada || null,
      productoNombre: e.catalogo?.nombre || '',
      codigoproducto: e.catalogo?.codigoproducto || '',
      cantidad: e.cantidad,
      precio: typeof e.precio === 'number' ? e.precio : (e.catalogo?.precio ?? 0),
      lote: e.lote ?? '-',
      observaciones: e.observaciones ?? '-'
    }));
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
