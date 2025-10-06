const InventarioUnificado = require('../models/InventarioUnificado');
const CatalogoProducto = require('../models/CatalogoProducto');
const Producto = require('../models/Producto');
const mongoose = require('mongoose');

/**
 * SERVICIO MAESTRO DE INVENTARIO UNIFICADO - FASE 1
 * 
 * Centraliza toda la lógica del módulo de inventario:
 * - Operaciones CRUD de entradas
 * - Gestión de stock (consumo, reservas, devoluciones)
 * - Consultas optimizadas y reportes
 * - Validaciones y alertas automáticas
 * - Migración desde modelos legacy
 */

class InventarioMasterService {
  
  // ========================================
  // OPERACIONES CRUD PRINCIPALES
  // ========================================
  
  /**
   * Crear una nueva entrada de inventario
   */
  async crearEntrada(data) {
    try {
      // 1. Validaciones robustas
      await this._validarDatosEntrada(data);
      
      // 2. Obtener información del producto y catálogo
      const { catalogoProducto, productoRegistrado } = await this._obtenerInfoProducto(data.productoId || data.catalogoProductoId);
      
      // 3. Preparar datos de la entrada
      const datosEntrada = {
        catalogoProductoId: catalogoProducto._id,
        productoRegistradoId: productoRegistrado?._id,
        codigoProducto: catalogoProducto.codigoproducto,
        nombreProducto: catalogoProducto.nombre,
        
        // Cantidades
        cantidadInicial: parseInt(data.cantidad),
        cantidadDisponible: parseInt(data.cantidad),
        
        // Precios
        precioCompra: parseFloat(data.precio),
        precioVenta: parseFloat(data.precioVenta || catalogoProducto.precio || data.precio * 1.3),
        
        // Lote y fechas
        lote: data.lote || '',
        fechaEntrada: new Date(data.fechaEntrada || Date.now()),
        fechaVencimiento: data.fechaVencimiento ? new Date(data.fechaVencimiento) : null,
        
        // Proveedor
        proveedor: data.proveedor || '',
        numeroFactura: data.numeroFactura || '',
        
        // Ubicación
        ubicacionFisica: {
          tipo: data.ubicacionTipo || 'almacen',
          zona: data.ubicacionZona || '',
          posicion: data.ubicacionPosicion || ''
        },
        
        // Observaciones
        observaciones: data.observaciones || '',
        
        // Usuario
        usuarioCreacion: data.usuario || data.usuarioCreacion,
        emailUsuarioCreacion: data.usuarioEmail || data.emailUsuarioCreacion,
        rolUsuarioCreacion: data.usuarioRole || data.rolUsuarioCreacion || 'user',
        
        // Configuraciones
        configuracion: {
          permitirVentasParciales: data.permitirVentasParciales !== false,
          diasAlertaVencimiento: parseInt(data.diasAlertaVencimiento || 7),
          stockMinimo: parseInt(data.stockMinimo || 0),
          requiereAutorizacion: data.requiereAutorizacion === true
        }
      };
      
      // 4. Crear la entrada (sin transacciones para compatibilidad)
      const nuevaEntrada = new InventarioUnificado(datosEntrada);
      const entradaGuardada = await nuevaEntrada.save();
      
      // 5. Actualizar estadísticas del producto si es necesario
      await this._actualizarEstadisticasProducto(catalogoProducto._id);
      
      console.log('[MASTER] ✅ Entrada creada exitosamente:', {
        id: entradaGuardada._id,
        numeroEntrada: entradaGuardada.numeroEntrada,
        producto: entradaGuardada.nombreProducto,
        cantidad: entradaGuardada.cantidadInicial
      });
      
      return this._formatearRespuestaEntrada(entradaGuardada);
      
    } catch (error) {
      console.error('[MASTER] ❌ Error creando entrada:', error);
      throw {
        status: 400,
        message: `Error al crear entrada de inventario: ${error.message}`,
        code: 'CREATION_ERROR',
        details: error
      };
    }
  }
  
  /**
   * Obtener entrada por ID
   */
  async obtenerEntrada(entradaId) {
    try {
      const entrada = await InventarioUnificado.findById(entradaId)
        .populate('catalogoProductoId', 'nombre codigoproducto categoria precio')
        .populate('productoRegistradoId', 'nombre codigoProducto categoria');
      
      if (!entrada) {
        throw { status: 404, message: 'Entrada de inventario no encontrada' };
      }
      
      return this._formatearRespuestaEntrada(entrada);
      
    } catch (error) {
      console.error('[MASTER] ❌ Error obteniendo entrada:', error);
      if (error.status) throw error;
      throw { status: 500, message: `Error al obtener entrada: ${error.message}` };
    }
  }
  
  /**
   * Listar entradas con filtros y paginación
   */
  async listarEntradas(filtros = {}, opciones = {}) {
    try {
      // Listando entradas con filtros aplicados
      
      // Construir query de filtros
      const query = this._construirQueryFiltros(filtros);
      
      // Opciones de paginación y ordenamiento
      const limite = parseInt(opciones.limite) || 50;
      const pagina = parseInt(opciones.pagina) || 1;
      const skip = (pagina - 1) * limite;
      const ordenamiento = opciones.orden || { fechaEntrada: -1 };
      
      // Ejecutar consulta con populate
      const [entradas, totalCount] = await Promise.all([
        InventarioUnificado.find(query)
          .populate('catalogoProductoId', 'nombre codigoproducto categoria precio')
          .sort(ordenamiento)
          .skip(skip)
          .limit(limite),
        InventarioUnificado.countDocuments(query)
      ]);
      
      // Formatear respuestas
      const entradasFormateadas = entradas.map(entrada => this._formatearRespuestaEntrada(entrada));
      
      return {
        entradas: entradasFormateadas,
        paginacion: {
          totalRegistros: totalCount,
          totalPaginas: Math.ceil(totalCount / limite),
          paginaActual: pagina,
          registrosPorPagina: limite,
          tieneProxima: pagina < Math.ceil(totalCount / limite),
          tieneAnterior: pagina > 1
        },
        resumen: {
          totalEntradas: totalCount,
          stockTotalDisponible: await this._calcularStockTotalDisponible(query),
          valorTotalInventario: await this._calcularValorTotalInventario(query)
        }
      };
      
    } catch (error) {
      console.error('[MASTER] ❌ Error listando entradas:', error);
      throw { status: 500, message: `Error al listar entradas: ${error.message}` };
    }
  }
  
  // ========================================
  // OPERACIONES DE STOCK
  // ========================================
  
  /**
   * Consumir stock de una entrada (para ventas)
   */
  async consumirStock(entradaId, cantidad, datosConsumo = {}) {
    try {
      // Obtener la entrada
      const entrada = await InventarioUnificado.findById(entradaId);
      if (!entrada) {
        throw { status: 404, message: 'Entrada de inventario no encontrada' };
      }
      
      // Validar disponibilidad
      if (!entrada.estaDisponible()) {
        throw { status: 400, message: `La entrada ${entrada.numeroEntrada} no está disponible` };
      }
      
      if (entrada.cantidadDisponible < cantidad) {
        throw { 
          status: 400, 
          message: `Stock insuficiente. Disponible: ${entrada.cantidadDisponible}, Solicitado: ${cantidad}` 
        };
      }
      
      // Consumir stock
      const exito = entrada.consumirStock(cantidad, datosConsumo.motivo || 'venta');
      if (!exito) {
        throw { status: 400, message: 'Error al consumir stock' };
      }
      
      // Actualizar información de usuario
      entrada.usuarioModificacion = datosConsumo.usuario || entrada.usuarioCreacion;
      
      // Guardar cambios
      await entrada.save();
      
      // Registrar movimiento si se especifica
      if (datosConsumo.registrarMovimiento !== false) {
        await this._registrarMovimiento({
          entradaId: entrada._id,
          tipo: 'salida',
          cantidad: cantidad,
          motivo: datosConsumo.motivo || 'venta',
          usuario: datosConsumo.usuario,
          observaciones: datosConsumo.observaciones
        });
      }
      
      console.log(`[INVENTARIO] ✅ Stock consumido: ${cantidad} unidades de ${entrada.nombre}`);
      return this._formatearRespuestaEntrada(entrada);
      
    } catch (error) {
      console.error('[MASTER] ❌ Error consumiendo stock:', error);
      if (error.status) throw error;
      throw { status: 500, message: `Error al consumir stock: ${error.message}` };
    }
  }
  
  /**
   * Incrementar stock (devoluciones)
   */
  async incrementarStock(entradaId, cantidad, datosIncremento = {}) {
    try {
      // Obtener la entrada
      const entrada = await InventarioUnificado.findById(entradaId);
      if (!entrada) {
        throw { status: 404, message: 'Entrada de inventario no encontrada' };
      }
      
      // Incrementar stock
      entrada.incrementarStock(cantidad, datosIncremento.motivo || 'devolucion');
      
      // Actualizar información de usuario
      entrada.usuarioModificacion = datosIncremento.usuario || entrada.usuarioCreacion;
      
      // Guardar cambios
      await entrada.save();
      
      // Registrar movimiento
      if (datosIncremento.registrarMovimiento !== false) {
        await this._registrarMovimiento({
          entradaId: entrada._id,
          tipo: 'entrada',
          cantidad: cantidad,
          motivo: datosIncremento.motivo || 'devolucion',
          usuario: datosIncremento.usuario,
          observaciones: datosIncremento.observaciones
        });
      }
      
      console.log(`[INVENTARIO] ✅ Stock incrementado: +${cantidad} unidades de ${entrada.nombre}`);
      return this._formatearRespuestaEntrada(entrada);
      
    } catch (error) {
      console.error('[MASTER] ❌ Error incrementando stock:', error);
      if (error.status) throw error;
      throw { status: 500, message: `Error al incrementar stock: ${error.message}` };
    }
  }
  
  // ========================================
  // CONSULTAS Y REPORTES
  // ========================================
  
  /**
   * Obtener resumen de inventario por producto
   */
  async obtenerResumenPorProducto(catalogoProductoId) {
    try {

      
      const resumen = await InventarioUnificado.obtenerStockPorProducto(catalogoProductoId);
      
      if (resumen.length === 0) {
        return {
          catalogoProductoId,
          stockTotal: 0,
          stockReservado: 0,
          valorTotal: 0,
          lotes: 0,
          proximoVencimiento: null,
          alertas: []
        };
      }
      
      const datos = resumen[0];
      
      // Obtener alertas activas
      const alertas = await this._obtenerAlertasProducto(catalogoProductoId);
      
      return {
        ...datos,
        alertas
      };
      
    } catch (error) {
      console.error('[MASTER] ❌ Error obteniendo resumen:', error);
      throw { status: 500, message: `Error al obtener resumen: ${error.message}` };
    }
  }
  
  /**
   * Obtener estadísticas generales del inventario
   */
  async obtenerEstadisticasGenerales() {
    try {

      
      const [
        totalEntradas,
        entradasActivas,
        stockTotalValor,
        productosConStock,
        proximosVencer,
        stockBajo
      ] = await Promise.all([
        InventarioUnificado.countDocuments(),
        InventarioUnificado.countDocuments({ estado: 'activo' }),
        this._calcularValorTotalInventario({}),
        InventarioUnificado.distinct('catalogoProductoId', { 
          estado: 'activo',
          cantidadDisponible: { $gt: 0 }
        }),
        InventarioUnificado.obtenerProximosAVencer(7),
        InventarioUnificado.obtenerStockBajo()
      ]);
      
      return {
        resumen: {
          totalEntradas,
          entradasActivas,
          entradasInactivas: totalEntradas - entradasActivas,
          valorTotalInventario: stockTotalValor,
          productosConStock: productosConStock.length
        },
        alertas: {
          proximosVencer: proximosVencer.length,
          stockBajo: stockBajo.length,
          totalAlertas: proximosVencer.length + stockBajo.length
        },
        detalleAlertas: {
          proximosVencer: proximosVencer.map(entrada => ({
            numeroEntrada: entrada.numeroEntrada,
            nombreProducto: entrada.nombreProducto,
            fechaVencimiento: entrada.fechaVencimiento,
            cantidadDisponible: entrada.cantidadDisponible,
            diasRestantes: Math.ceil((entrada.fechaVencimiento - new Date()) / (1000 * 60 * 60 * 24))
          })),
          stockBajo: stockBajo.map(entrada => ({
            numeroEntrada: entrada.numeroEntrada,
            nombreProducto: entrada.nombreProducto,
            cantidadDisponible: entrada.cantidadDisponible,
            stockMinimo: entrada.configuracion.stockMinimo
          }))
        }
      };
      
    } catch (error) {
      console.error('[MASTER] ❌ Error obteniendo estadísticas:', error);
      throw { status: 500, message: `Error al obtener estadísticas: ${error.message}` };
    }
  }
  
  // ========================================
  // MÉTODOS PRIVADOS DE UTILIDAD
  // ========================================
  
  async _validarDatosEntrada(data) {
    // Validaciones básicas
    if (!data.cantidad || isNaN(data.cantidad) || parseFloat(data.cantidad) <= 0) {
      throw new Error('La cantidad debe ser un número mayor a 0');
    }
    
    if (!data.precio || isNaN(data.precio) || parseFloat(data.precio) <= 0) {
      throw new Error('El precio debe ser un número mayor a 0');
    }
    
    if (!data.usuario && !data.usuarioCreacion) {
      throw new Error('El usuario es requerido');
    }
    
    if (!data.productoId && !data.catalogoProductoId) {
      throw new Error('El ID del producto o catálogo es requerido');
    }
  }
  
  async _obtenerInfoProducto(id) {
    // Primero intentar como productoId
    let catalogoProducto, productoRegistrado;
    
    if (id) {
      productoRegistrado = await Producto.findById(id);
      if (productoRegistrado && productoRegistrado.catalogoProductoId) {
        catalogoProducto = await CatalogoProducto.findById(productoRegistrado.catalogoProductoId);
      }
    }
    
    // Si no se encontró, intentar directamente como catalogoProductoId
    if (!catalogoProducto) {
      catalogoProducto = await CatalogoProducto.findById(id);
    }
    
    if (!catalogoProducto) {
      throw new Error(`Producto no encontrado en el catálogo: ${id}`);
    }
    
    return { catalogoProducto, productoRegistrado };
  }
  
  _construirQueryFiltros(filtros) {
    const query = {};
    
    // Filtro por estado
    if (filtros.estado) {
      query.estado = filtros.estado;
    }
    
    // Filtro por producto
    if (filtros.catalogoProductoId) {
      query.catalogoProductoId = filtros.catalogoProductoId;
    }
    
    // Filtro por usuario
    if (filtros.usuario) {
      query.usuarioCreacion = new RegExp(filtros.usuario, 'i');
    }
    
    // Filtro por fechas
    if (filtros.fechaDesde || filtros.fechaHasta) {
      query.fechaEntrada = {};
      if (filtros.fechaDesde) query.fechaEntrada.$gte = new Date(filtros.fechaDesde);
      if (filtros.fechaHasta) query.fechaEntrada.$lte = new Date(filtros.fechaHasta);
    }
    
    // Filtro por búsqueda general
    if (filtros.busqueda) {
      const regex = new RegExp(filtros.busqueda, 'i');
      query.$or = [
        { nombreProducto: regex },
        { codigoProducto: regex },
        { numeroEntrada: regex },
        { lote: regex },
        { proveedor: regex }
      ];
    }
    
    return query;
  }
  
  _formatearRespuestaEntrada(entrada) {
    const entradaObj = entrada.toObject ? entrada.toObject() : entrada;
    
    return {
      ...entradaObj,
      porcentajeUso: entrada.getPorcentajeUso ? entrada.getPorcentajeUso() : 0,
      necesitaAlertaVencimiento: entrada.necesitaAlertaVencimiento ? entrada.necesitaAlertaVencimiento() : false,
      estaDisponible: entrada.estaDisponible ? entrada.estaDisponible() : false
    };
  }
  
  async _calcularStockTotalDisponible(query) {
    const resultado = await InventarioUnificado.aggregate([
      { $match: { ...query, estado: 'activo' } },
      { $group: { _id: null, total: { $sum: '$cantidadDisponible' } } }
    ]);
    
    return resultado.length > 0 ? resultado[0].total : 0;
  }
  
  async _calcularValorTotalInventario(query) {
    const resultado = await InventarioUnificado.aggregate([
      { $match: { ...query, estado: 'activo' } },
      { 
        $group: { 
          _id: null, 
          total: { 
            $sum: { 
              $multiply: ['$cantidadDisponible', '$precioCompra'] 
            } 
          } 
        } 
      }
    ]);
    
    return resultado.length > 0 ? resultado[0].total : 0;
  }
  
  async _actualizarEstadisticasProducto(catalogoProductoId, session) {
    // Aquí se pueden actualizar estadísticas en el modelo CatalogoProducto si es necesario
    // Por ahora, solo logging

  }
  
  async _registrarMovimiento(datos) {
    // Por ahora solo logging, en el futuro se puede implementar tabla de movimientos
    // console.log('[INVENTARIO] 📝 Movimiento:', datos.tipo, datos.cantidad, datos.motivo);
  }
  
  async _obtenerAlertasProducto(catalogoProductoId) {
    const entradas = await InventarioUnificado.find({
      catalogoProductoId,
      estado: 'activo'
    });
    
    const alertas = [];
    
    entradas.forEach(entrada => {
      // Alerta de vencimiento
      if (entrada.necesitaAlertaVencimiento && entrada.necesitaAlertaVencimiento()) {
        alertas.push({
          tipo: 'vencimiento',
          mensaje: `Producto próximo a vencer (${entrada.fechaVencimiento})`,
          entrada: entrada.numeroEntrada,
          prioridad: 'alta'
        });
      }
      
      // Alerta de stock bajo
      if (entrada.cantidadDisponible <= entrada.configuracion.stockMinimo && entrada.configuracion.stockMinimo > 0) {
        alertas.push({
          tipo: 'stock_bajo',
          mensaje: `Stock bajo (${entrada.cantidadDisponible} <= ${entrada.configuracion.stockMinimo})`,
          entrada: entrada.numeroEntrada,
          prioridad: 'media'
        });
      }
    });
    
    return alertas;
  }
}

module.exports = new InventarioMasterService();