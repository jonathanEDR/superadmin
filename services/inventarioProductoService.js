const InventarioProducto = require('../models/InventarioProducto');
const CatalogoProducto = require('../models/CatalogoProducto');
const MovimientoInventario = require('../models/MovimientoInventario');
const Producto = require('../models/Producto');

class InventarioProductoService {
  
  /**
   * Crear una nueva entrada de inventario
   * Cada entrada es un registro individual con su propio historial
   */
  async crearEntrada(data) {
    try {
      console.log('[DEBUG] crearEntrada iniciado con datos:', JSON.stringify(data, null, 2));
      
      const {
        productoId,
        cantidad,
        precio,
        lote = '',
        observaciones = '',
        usuario,
        usuarioEmail,
        fechaVencimiento,
        proveedor = ''
      } = data;

      // VALIDACIONES ROBUSTAS MEJORADAS
      if (!productoId) {
        throw { status: 400, message: 'El ID del producto es requerido' };
      }

      if (!cantidad || isNaN(cantidad) || Number(cantidad) <= 0) {
        throw { status: 400, message: 'La cantidad debe ser un número mayor a 0' };
      }

      if (!precio || isNaN(precio) || Number(precio) <= 0) {
        throw { status: 400, message: 'El precio debe ser un número mayor a 0' };
      }

      if (!usuario || usuario.trim() === '') {
        throw { status: 400, message: 'El usuario es requerido' };
      }

      console.log('[DEBUG] Validando producto registrado:', productoId);
      
      // Validar que el producto registrado existe
      const producto = await Producto.findById(productoId);
      if (!producto) {
        console.error('[ERROR] Producto registrado no encontrado:', productoId);
        throw { status: 404, message: `Producto registrado no encontrado con ID: ${productoId}` };
      }

      console.log('[DEBUG] Producto encontrado:', {
        id: producto._id,
        nombre: producto.nombre,
        categoria: producto.categoryName,
        catalogoProductoId: producto.catalogoProductoId
      });

      // Validar que el producto del catálogo existe
      if (!producto.catalogoProductoId) {
        throw { status: 400, message: 'El producto no tiene asociado un producto de catálogo' };
      }

      const catalogoProducto = await CatalogoProducto.findById(producto.catalogoProductoId);
      if (!catalogoProducto) {
        console.error('[ERROR] Producto del catálogo no encontrado:', producto.catalogoProductoId);
        
        // REPARACIÓN AUTOMÁTICA: Crear producto faltante en catálogo
        console.log('[REPAIR] Intentando reparar automáticamente...');
        try {
          const nuevoCatalogo = new CatalogoProducto({
            _id: producto.catalogoProductoId,
            codigoproducto: producto.codigoProducto || 'AUTO',
            nombre: producto.nombre,
            activo: true
          });
          await nuevoCatalogo.save();
          console.log('[REPAIR] ✅ Producto del catálogo creado automáticamente');
        } catch (repairError) {
          throw { status: 404, message: `Producto del catálogo no encontrado y no se pudo reparar: ${producto.catalogoProductoId}` };
        }
      }

      const catalogoFinal = catalogoProducto || await CatalogoProducto.findById(producto.catalogoProductoId);
      
      console.log('[DEBUG] Producto del catálogo encontrado:', {
        id: catalogoFinal._id,
        nombre: catalogoFinal.nombre,
        codigo: catalogoFinal.codigoproducto,
        activo: catalogoFinal.activo
      });

      if (!catalogoFinal.activo) {
        console.error('[ERROR] Producto inactivo en catálogo:', producto.catalogoProductoId);
        throw { status: 400, message: `El producto '${catalogoFinal.nombre}' está inactivo en el catálogo` };
      }

      // Convertir valores a números para asegurar consistencia
      const cantidadNum = Number(cantidad);
      const precioNum = Number(precio);
      const costoTotal = cantidadNum * precioNum;

      // GENERACIÓN ROBUSTA DE NÚMERO DE ENTRADA ÚNICO
      const numeroEntrada = await this.generarNumeroEntradaUnico();

      // Crear nueva entrada individual
      const nuevaEntrada = new InventarioProducto({
        productoId: productoId,
        catalogoProductoId: producto.catalogoProductoId,
        cantidad: cantidadNum,
        cantidadInicial: cantidadNum,
        cantidadDisponible: cantidadNum,
        precio: precioNum,
        lote: lote?.trim() || '',
        observaciones: observaciones?.trim() || '',
        usuario: usuario.trim(),
        usuarioEmail: usuarioEmail?.trim() || '',
        fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
        proveedor: proveedor?.trim() || '',
        costoTotal: costoTotal,
        numeroEntrada: numeroEntrada
      });

      console.log('[DEBUG] Guardando nueva entrada:', {
        productoId: nuevaEntrada.productoId,
        catalogoProductoId: nuevaEntrada.catalogoProductoId,
        cantidad: nuevaEntrada.cantidad,
        precio: nuevaEntrada.precio,
        costoTotal: nuevaEntrada.costoTotal
      });

      const entradaGuardada = await nuevaEntrada.save();
      console.log('[DEBUG] Entrada guardada exitosamente:', entradaGuardada._id);
      
      // Poblar información del producto
      await entradaGuardada.populate('productoId');
      await entradaGuardada.populate('catalogoProductoId');

      // Actualizar el stock del producto individual (no del catálogo)
      await this.actualizarStockProductoIndividual(productoId, cantidadNum);

      // Registrar movimiento de inventario
      await this.registrarMovimiento(
        entradaGuardada._id, 
        'ingreso', 
        cantidadNum, 
        usuario.trim(), 
        'Entrada inicial de inventario'
      );

      console.log('[DEBUG] Entrada completada exitosamente');
      return entradaGuardada;
    } catch (error) {
      console.error('[ERROR] Error al crear entrada:', {
        message: error.message,
        status: error.status,
        stack: error.stack,
        data: data
      });
      
      // Si el error ya tiene status, lo mantenemos
      if (error.status) {
        throw error;
      }
      
      // Si es un error de MongoDB, lo manejamos apropiadamente
      if (error.code === 11000) {
        throw { 
          status: 409, 
          message: 'Ya existe una entrada con esos datos. Verifique el número de entrada o el lote.' 
        };
      }
      
      // Si es un error de validación de Mongoose
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw { 
          status: 400, 
          message: `Error de validación: ${messages.join(', ')}` 
        };
      }
      
      // Error genérico
      throw { 
        status: 500, 
        message: `Error interno al crear entrada de inventario: ${error.message}` 
      };
    }
  }

  /**
   * Listar todas las entradas de inventario con filtros
   */
  async listarEntradas(filtros = {}) {
    try {
      const {
        catalogoProductoId,
        estado,
        usuario,
        fechaDesde,
        fechaHasta,
        lote,
        limit = 50,
        skip = 0,
        sortBy = 'fechaEntrada',
        sortOrder = -1
      } = filtros;

      // Construir query
      const query = {};
      
      if (catalogoProductoId) {
        query.catalogoProductoId = catalogoProductoId;
      }
      
      if (estado) {
        query.estado = estado;
      }
      
      if (usuario) {
        query.usuario = { $regex: usuario, $options: 'i' };
      }
      
      if (lote) {
        query.lote = { $regex: lote, $options: 'i' };
      }
      
      if (fechaDesde || fechaHasta) {
        query.fechaEntrada = {};
        if (fechaDesde) {
          query.fechaEntrada.$gte = new Date(fechaDesde);
        }
        if (fechaHasta) {
          query.fechaEntrada.$lte = new Date(fechaHasta);
        }
      }

      // Ejecutar consulta
      const entradas = await InventarioProducto.find(query)
        .populate('catalogoProductoId', 'nombre codigoproducto')
        .sort({ [sortBy]: sortOrder })
        .limit(Number(limit))
        .skip(Number(skip));

      // Mapear datos para el frontend con formato mejorado
      const entradasFormateadas = entradas.map(entrada => ({
        _id: entrada._id,
        numeroEntrada: entrada.numeroEntrada,
        fecha: entrada.fechaEntrada,
        productoNombre: entrada.catalogoProductoId?.nombre || 'Sin nombre',
        codigoproducto: entrada.catalogoProductoId?.codigoproducto || 'Sin código',
        cantidad: entrada.cantidad,
        cantidadInicial: entrada.cantidadInicial,
        cantidadDisponible: entrada.cantidadDisponible,
        cantidadUtilizada: entrada.cantidadInicial - entrada.cantidadDisponible,
        precio: entrada.precio,
        costoTotal: entrada.costoTotal,
        lote: entrada.lote,
        observaciones: entrada.observaciones,
        estado: entrada.estado,
        usuario: entrada.usuario,
        usuarioEmail: entrada.usuarioEmail,
        proveedor: entrada.proveedor,
        fechaVencimiento: entrada.fechaVencimiento,
        fechaCreacion: entrada.createdAt,
        fechaActualizacion: entrada.updatedAt
      }));

      // Contar total para paginación
      const total = await InventarioProducto.countDocuments(query);

      return {
        entradas: entradasFormateadas,
        total,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error al listar entradas:', error);
      throw error;
    }
  }

  /**
   * Obtener entrada por ID
   */
  async obtenerEntradaPorId(id) {
    try {
      const entrada = await InventarioProducto.findById(id)
        .populate('catalogoProductoId', 'nombre codigoproducto');
      
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      return entrada;
    } catch (error) {
      console.error('Error al obtener entrada:', error);
      throw error;
    }
  }

  /**
   * Actualizar entrada de inventario
   */
  async actualizarEntrada(id, data) {
    try {
      const entrada = await InventarioProducto.findById(id);
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      // Campos que se pueden actualizar
      const camposActualizables = [
        'precio', 'lote', 'observaciones', 'fechaVencimiento', 'proveedor', 'estado'
      ];

      camposActualizables.forEach(campo => {
        if (data[campo] !== undefined) {
          entrada[campo] = data[campo];
        }
      });

      // Recalcular costo total si se actualiza el precio
      if (data.precio) {
        entrada.costoTotal = entrada.cantidadInicial * Number(data.precio);
      }

      const entradaActualizada = await entrada.save();
      await entradaActualizada.populate('catalogoProductoId');

      return entradaActualizada;
    } catch (error) {
      console.error('Error al actualizar entrada:', error);
      throw error;
    }
  }

  /**
   * Eliminar entrada de inventario
   */
  async eliminarEntrada(id) {
    try {
      const entrada = await InventarioProducto.findById(id).populate('catalogoProductoId').populate('productoId');
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      // Verificar si la entrada ha sido utilizada
      if (entrada.cantidadDisponible < entrada.cantidadInicial) {
        throw { status: 400, message: 'No se puede eliminar una entrada que ya ha sido utilizada' };
      }

      // Actualizar el stock del producto individual específico (restar la cantidad)
      await this.actualizarStockProductoIndividual(entrada.productoId._id, -entrada.cantidadDisponible);

      await InventarioProducto.findByIdAndDelete(id);
      
      // Eliminar movimientos asociados
      await MovimientoInventario.deleteMany({ inventario: id });

      return { 
        message: 'Entrada eliminada correctamente',
        cantidadRestada: entrada.cantidadDisponible
      };
    } catch (error) {
      console.error('Error al eliminar entrada:', error);
      throw error;
    }
  }

  /**
   * Registrar movimiento de inventario
   */
  async registrarMovimiento(inventarioId, tipo, cantidad, usuario, descripcion = '') {
    try {
      const movimiento = new MovimientoInventario({
        inventario: inventarioId,
        tipo,
        cantidad,
        usuario,
        descripcion
      });

      await movimiento.save();
      return movimiento;
    } catch (error) {
      console.error('Error al registrar movimiento:', error);
      throw error;
    }
  }

  /**
   * Obtener resumen de inventario por producto
   */
  async obtenerResumenPorProducto(catalogoProductoId) {
    try {
      const resumen = await InventarioProducto.aggregate([
        {
          $match: { 
            catalogoProductoId: catalogoProductoId,
            estado: { $ne: 'inactivo' }
          }
        },
        {
          $group: {
            _id: '$catalogoProductoId',
            totalEntradas: { $sum: 1 },
            cantidadTotal: { $sum: '$cantidadInicial' },
            cantidadDisponible: { $sum: '$cantidadDisponible' },
            cantidadUtilizada: { $sum: { $subtract: ['$cantidadInicial', '$cantidadDisponible'] } },
            costoTotal: { $sum: '$costoTotal' },
            precioPromedio: { $avg: '$precio' },
            ultimaEntrada: { $max: '$fechaEntrada' }
          }
        }
      ]);

      return resumen[0] || null;
    } catch (error) {
      console.error('Error al obtener resumen:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas generales del inventario
   */
  async obtenerEstadisticas() {
    try {
      const stats = await InventarioProducto.aggregate([
        {
          $group: {
            _id: null,
            totalEntradas: { $sum: 1 },
            entradasActivas: { $sum: { $cond: [{ $eq: ['$estado', 'activo'] }, 1, 0] } },
            entradasAgotadas: { $sum: { $cond: [{ $eq: ['$estado', 'agotado'] }, 1, 0] } },
            cantidadTotal: { $sum: '$cantidadInicial' },
            cantidadDisponible: { $sum: '$cantidadDisponible' },
            valorTotal: { $sum: '$costoTotal' }
          }
        }
      ]);

      return stats[0] || {
        totalEntradas: 0,
        entradasActivas: 0,
        entradasAgotadas: 0,
        cantidadTotal: 0,
        cantidadDisponible: 0,
        valorTotal: 0
      };
    } catch (error) {
      console.error('Error al obtener estadísticas:', error);
      throw error;
    }
  }

  /**
   * Consumir stock de una entrada específica
   */
  async consumirStock(inventarioId, cantidad, usuario, descripcion = '') {
    try {
      const entrada = await InventarioProducto.findById(inventarioId);
      if (!entrada) {
        throw { status: 404, message: 'Entrada no encontrada' };
      }

      if (!entrada.isDisponible()) {
        throw { status: 400, message: 'La entrada no está disponible' };
      }

      if (entrada.cantidadDisponible < cantidad) {
        throw { status: 400, message: 'Stock insuficiente en esta entrada' };
      }

      // Reducir cantidad disponible
      const reducido = entrada.reducirCantidad(cantidad);
      if (!reducido) {
        throw { status: 400, message: 'No se pudo reducir el stock' };
      }

      await entrada.save();

      // Registrar movimiento
      await this.registrarMovimiento(inventarioId, 'venta', cantidad, usuario, descripcion);

      return entrada;
    } catch (error) {
      console.error('Error al consumir stock:', error);
      throw error;
    }
  }

  /**
   * Actualizar stock del producto individual específico
   */
  async actualizarStockProductoIndividual(productoId, cantidadAAgregar) {
    try {
      console.log('[DEBUG] Actualizando stock del producto:', productoId, 'cantidad:', cantidadAAgregar);
      
      // Buscar el producto específico
      const producto = await Producto.findById(productoId);
      if (!producto) {
        console.log('[WARNING] Producto no encontrado para actualizar stock:', productoId);
        throw { status: 404, message: `Producto no encontrado: ${productoId}` };
      }

      // Validar que la cantidad sea un número válido
      const cantidadNum = Number(cantidadAAgregar);
      if (isNaN(cantidadNum)) {
        throw { status: 400, message: 'La cantidad debe ser un número válido' };
      }

      // Actualizar la cantidad y cantidad restante solo de este producto específico
      const cantidadAnterior = producto.cantidad || 0;
      const cantidadRestanteAnterior = producto.cantidadRestante || 0;

      producto.cantidad = Math.max(0, cantidadAnterior + cantidadNum);
      producto.cantidadRestante = Math.max(0, cantidadRestanteAnterior + cantidadNum);

      const productoActualizado = await producto.save();
      
      console.log(`[DEBUG] Stock actualizado para ${producto.nombre} (${producto.categoryName}):`, {
        cantidadAnterior,
        cantidadNueva: productoActualizado.cantidad,
        cantidadRestanteAnterior,
        cantidadRestanteNueva: productoActualizado.cantidadRestante,
        cambio: cantidadNum >= 0 ? `+${cantidadNum}` : cantidadNum.toString()
      });

      return productoActualizado;
    } catch (error) {
      console.error('[ERROR] Error al actualizar stock del producto individual:', {
        productoId,
        cantidadAAgregar,
        error: error.message
      });
      
      if (error.status) {
        throw error;
      }
      
      throw { 
        status: 500, 
        message: `Error al actualizar stock del producto: ${error.message}` 
      };
    }
  }

  /**
   * Actualizar stock del producto principal basado en el catálogo
   */
  async actualizarStockProducto(catalogoProductoId, cantidadAAgregar) {
    try {
      // Buscar el producto en el catálogo
      const catalogoProducto = await CatalogoProducto.findById(catalogoProductoId);
      if (!catalogoProducto) {
        console.log('Producto no encontrado en catálogo');
        return;
      }

      // Buscar el producto principal por nombre
      const producto = await Producto.findOne({ nombre: catalogoProducto.nombre });
      if (!producto) {
        console.log('Producto principal no encontrado:', catalogoProducto.nombre);
        return;
      }

      // Actualizar la cantidad y cantidad restante (no permitir valores negativos)
      producto.cantidad = Math.max(0, (producto.cantidad || 0) + cantidadAAgregar);
      producto.cantidadRestante = Math.max(0, (producto.cantidadRestante || 0) + cantidadAAgregar);
      
      await producto.save();
      console.log(`Stock actualizado para ${producto.nombre}: ${cantidadAAgregar >= 0 ? '+' : ''}${cantidadAAgregar}`);
      
      return producto;
    } catch (error) {
      console.error('Error al actualizar stock del producto:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  /**
   * Generar número de entrada único y robusto
   * Utiliza un sistema de contadores por día para garantizar unicidad
   */
  async generarNumeroEntradaUnico() {
    const mongoose = require('mongoose');
    
    // Definir esquema de contador si no existe
    const CounterSchema = new mongoose.Schema({
      _id: String,
      seq: { type: Number, default: 0 },
      fecha: { type: Date, default: Date.now }
    });
    
    const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);
    
    try {
      const fecha = new Date();
      const year = fecha.getFullYear();
      const month = String(fecha.getMonth() + 1).padStart(2, '0');
      const day = String(fecha.getDate()).padStart(2, '0');
      const fechaStr = `${year}-${month}-${day}`;
      
      // ID único del contador para este día
      const counterId = `inventario_${fechaStr}`;
      
      // Obtener siguiente número de secuencia para este día
      const counter = await Counter.findByIdAndUpdate(
        counterId,
        { 
          $inc: { seq: 1 },
          $set: { fecha: new Date() }
        },
        { 
          new: true, 
          upsert: true 
        }
      );
      
      const numeroSecuencial = String(counter.seq).padStart(3, '0');
      
      // Generar timestamp único adicional para mayor seguridad
      const timestamp = Date.now().toString().slice(-4);
      const microtime = process.hrtime.bigint().toString().slice(-2);
      
      const numeroEntrada = `ENT-${year}${month}${day}-${numeroSecuencial}-${timestamp}${microtime}`;
      
      // Verificación final de unicidad (doble seguridad)
      const existe = await InventarioProducto.findOne({ numeroEntrada });
      if (existe) {
        console.warn(`[WARNING] Número duplicado detectado: ${numeroEntrada}, regenerando...`);
        // Recursión controlada para regenerar
        return await this.generarNumeroEntradaUnico();
      }
      
      console.log(`[DEBUG] Número único generado: ${numeroEntrada}`);
      return numeroEntrada;
      
    } catch (error) {
      console.error('[ERROR] Error al generar número único:', error);
      
      // Fallback: usar timestamp completo como último recurso
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const fallbackNumber = `ENT-FALLBACK-${timestamp}-${random}`;
      
      console.log(`[FALLBACK] Usando número de emergencia: ${fallbackNumber}`);
      return fallbackNumber;
    }
  }
}

module.exports = new InventarioProductoService();

