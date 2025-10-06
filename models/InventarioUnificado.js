const mongoose = require('mongoose');

/**
 * MODELO UNIFICADO DE INVENTARIO - FASE 1
 * 
 * Este modelo consolida:
 * - Inventario.js (modelo simplificado)  
 * - InventarioProducto.js (modelo detallado por lotes)
 * - Funcionalidades de MovimientoInventario.js
 * 
 * Diseño híbrido que mantiene compatibilidad con datos existentes
 * pero unifica toda la lógica en una sola entidad robusta.
 */

const inventarioUnificadoSchema = new mongoose.Schema({
  
  // ========================================
  // IDENTIFICACIÓN Y REFERENCIAS
  // ========================================
  
  /** Referencia al producto en el catálogo */
  catalogoProductoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CatalogoProducto',
    required: true,
    index: true
  },
  
  /** Referencia al producto registrado (si existe) */
  productoRegistradoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: false,
    index: true
  },
  
  /** Código único del producto (desnormalizado para performance) */
  codigoProducto: {
    type: String,
    required: true,
    index: true
  },
  
  /** Nombre del producto (desnormalizado para performance) */
  nombreProducto: {
    type: String,
    required: true,
    index: true
  },

  // ========================================
  // CONTROL DE LOTES Y TRAZABILIDAD
  // ========================================
  
  /** Número único de entrada (formato: ENT-YYYY-MM-NNNN) */
  numeroEntrada: {
    type: String,
    required: false, // Se genera automáticamente en pre-save
    unique: true,
    sparse: true, // Permite valores null/undefined durante la creación
    index: true
  },
  
  /** Lote o código de producción */
  lote: {
    type: String,
    default: '',
    index: true
  },
  
  /** Fecha de ingreso al inventario */
  fechaEntrada: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },
  
  /** Fecha de vencimiento del lote */
  fechaVencimiento: {
    type: Date,
    required: false,
    index: true
  },

  // ========================================
  // CANTIDADES Y CONTROL DE STOCK
  // ========================================
  
  /** Cantidad inicial ingresada */
  cantidadInicial: {
    type: Number,
    required: true,
    min: 0
  },
  
  /** Cantidad actualmente disponible */
  cantidadDisponible: {
    type: Number,
    required: true,
    min: 0,
    default: function() {
      return this.cantidadInicial;
    }
  },
  
  /** Cantidad reservada (pedidos pendientes) */
  cantidadReservada: {
    type: Number,
    default: 0,
    min: 0
  },
  
  /** Cantidad vendida/consumida */
  cantidadVendida: {
    type: Number,
    default: 0,
    min: 0
  },
  
  /** Cantidad devuelta */
  cantidadDevuelta: {
    type: Number,
    default: 0,
    min: 0
  },
  
  /** Cantidad perdida/dañada */
  cantidadPerdida: {
    type: Number,
    default: 0,
    min: 0
  },

  // ========================================
  // INFORMACIÓN FINANCIERA
  // ========================================
  
  /** Precio de compra unitario */
  precioCompra: {
    type: Number,
    required: true,
    min: 0
  },
  
  /** Precio de venta sugerido */
  precioVenta: {
    type: Number,
    required: false,
    min: 0
  },
  
  /** Costo total de la entrada (cantidad * precio) */
  costoTotal: {
    type: Number,
    required: true,
    default: function() {
      return this.cantidadInicial * this.precioCompra;
    }
  },

  // ========================================
  // ESTADO Y CONTROL
  // ========================================
  
  /** Estado del lote */
  estado: {
    type: String,
    enum: [
      'activo',        // Stock disponible para venta
      'agotado',       // Sin stock disponible
      'vencido',       // Pasó fecha de vencimiento
      'retenido',      // Bloqueado por problemas
      'reservado',     // Completamente reservado
      'inactivo'       // Deshabilitado manualmente
    ],
    default: 'activo',
    index: true
  },
  
  /** Motivo del estado actual */
  motivoEstado: {
    type: String,
    default: ''
  },
  
  /** Prioridad FIFO/LIFO (menor número = mayor prioridad) */
  prioridadRotacion: {
    type: Number,
    default: function() {
      // Por defecto usar timestamp para FIFO
      return this.fechaEntrada ? this.fechaEntrada.getTime() : Date.now();
    },
    index: true
  },

  // ========================================
  // INFORMACIÓN DE PROVEEDOR
  // ========================================
  
  /** Nombre del proveedor */
  proveedor: {
    type: String,
    default: '',
    index: true
  },
  
  /** Número de factura o documento */
  numeroFactura: {
    type: String,
    default: ''
  },

  // ========================================
  // OBSERVACIONES Y METADATOS
  // ========================================
  
  /** Observaciones de la entrada */
  observaciones: {
    type: String,
    default: ''
  },
  
  /** Ubicación física en almacén */
  ubicacionFisica: {
    tipo: {
      type: String,
      enum: ['estante', 'refrigerador', 'congelador', 'vitrina', 'almacen'],
      default: 'almacen'
    },
    zona: {
      type: String,
      default: ''
    },
    posicion: {
      type: String,
      default: ''
    }
  },

  // ========================================
  // INFORMACIÓN DE USUARIO Y AUDITORÍA
  // ========================================
  
  /** Usuario que registró la entrada */
  usuarioCreacion: {
    type: String,
    required: true,
    index: true
  },
  
  /** Email del usuario que registró */
  emailUsuarioCreacion: {
    type: String,
    required: false
  },
  
  /** Rol del usuario que registró */
  rolUsuarioCreacion: {
    type: String,
    default: 'user'
  },
  
  /** Usuario que realizó la última modificación */
  usuarioModificacion: {
    type: String,
    default: function() {
      return this.usuarioCreacion;
    }
  },
  
  /** Fecha de última modificación */
  fechaModificacion: {
    type: Date,
    default: Date.now
  },

  // ========================================
  // ALERTAS Y NOTIFICACIONES
  // ========================================
  
  /** Alertas activas para este lote */
  alertas: [{
    tipo: {
      type: String,
      enum: ['vencimiento', 'stock_bajo', 'problema_calidad', 'revision_requerida']
    },
    mensaje: String,
    fecha: {
      type: Date,
      default: Date.now
    },
    activa: {
      type: Boolean,
      default: true
    }
  }],
  
  /** Fecha de próxima alerta (para optimizar consultas) */
  proximaAlerta: {
    type: Date,
    index: true
  },

  // ========================================
  // CONFIGURACIONES AVANZADAS
  // ========================================
  
  /** Configuración específica del lote */
  configuracion: {
    /** Permitir ventas parciales */
    permitirVentasParciales: {
      type: Boolean,
      default: true
    },
    
    /** Días de alerta antes del vencimiento */
    diasAlertaVencimiento: {
      type: Number,
      default: 7
    },
    
    /** Stock mínimo para alerta */
    stockMinimo: {
      type: Number,
      default: 0
    },
    
    /** Requiere autorización para vender */
    requiereAutorizacion: {
      type: Boolean,
      default: false
    }
  }

}, {
  timestamps: true, // Agrega createdAt y updatedAt automáticamente
  collection: 'inventariounificado' // Nombre explícito de la colección
});

// ========================================
// ÍNDICES COMPUESTOS OPTIMIZADOS
// ========================================

// Índice para consultas de stock disponible por producto
inventarioUnificadoSchema.index({ 
  catalogoProductoId: 1, 
  estado: 1, 
  cantidadDisponible: -1 
});

// Índice para rotación FIFO/LIFO
inventarioUnificadoSchema.index({ 
  catalogoProductoId: 1, 
  estado: 1, 
  prioridadRotacion: 1 
});

// Índice para alertas de vencimiento
inventarioUnificadoSchema.index({ 
  fechaVencimiento: 1, 
  estado: 1 
});

// Índice para búsquedas de usuario
inventarioUnificadoSchema.index({ 
  usuarioCreacion: 1, 
  fechaEntrada: -1 
});

// Índice para reportes por proveedor
inventarioUnificadoSchema.index({ 
  proveedor: 1, 
  fechaEntrada: -1 
});

// ========================================
// MIDDLEWARE PRE-SAVE
// ========================================

inventarioUnificadoSchema.pre('save', async function(next) {
  try {
    // 1. Generar número de entrada si no existe
    if (this.isNew && !this.numeroEntrada) {
      const fecha = this.fechaEntrada || new Date();
      const year = fecha.getFullYear();
      const month = String(fecha.getMonth() + 1).padStart(2, '0');
      const day = String(fecha.getDate()).padStart(2, '0');
      
      // Obtener el siguiente número secuencial del día
      const inicioDelDia = new Date(year, fecha.getMonth(), fecha.getDate());
      const finDelDia = new Date(year, fecha.getMonth(), fecha.getDate() + 1);
      
      const contadorDia = await this.constructor.countDocuments({
        fechaEntrada: {
          $gte: inicioDelDia,
          $lt: finDelDia
        }
      });
      
      const numeroSecuencial = String(contadorDia + 1).padStart(4, '0');
      this.numeroEntrada = `ENT-${year}${month}${day}-${numeroSecuencial}`;
    }
    
    // 2. Actualizar costo total
    this.costoTotal = this.cantidadInicial * this.precioCompra;
    
    // 3. Validar estado basado en cantidades
    if (this.cantidadDisponible === 0 && this.estado === 'activo') {
      this.estado = 'agotado';
      this.motivoEstado = 'Stock agotado automáticamente';
    }
    
    // 4. Validar fecha de vencimiento
    if (this.fechaVencimiento && this.fechaVencimiento <= new Date() && this.estado === 'activo') {
      this.estado = 'vencido';
      this.motivoEstado = 'Producto vencido automáticamente';
    }
    
    // 5. Actualizar fecha de modificación
    if (!this.isNew) {
      this.fechaModificacion = new Date();
    }
    
    // 6. Calcular próxima alerta
    if (this.fechaVencimiento && this.configuracion.diasAlertaVencimiento > 0) {
      const diasAlerta = this.configuracion.diasAlertaVencimiento;
      this.proximaAlerta = new Date(this.fechaVencimiento.getTime() - (diasAlerta * 24 * 60 * 60 * 1000));
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// ========================================
// MÉTODOS DE INSTANCIA
// ========================================

/** Verificar si el lote está disponible para venta */
inventarioUnificadoSchema.methods.estaDisponible = function() {
  return this.estado === 'activo' && this.cantidadDisponible > 0;
};

/** Reducir cantidad disponible (para ventas) */
inventarioUnificadoSchema.methods.consumirStock = function(cantidad, motivo = 'venta') {
  if (this.cantidadDisponible >= cantidad) {
    this.cantidadDisponible -= cantidad;
    
    if (motivo === 'venta') {
      this.cantidadVendida += cantidad;
    } else if (motivo === 'perdida') {
      this.cantidadPerdida += cantidad;
    }
    
    if (this.cantidadDisponible === 0) {
      this.estado = 'agotado';
      this.motivoEstado = `Stock agotado por ${motivo}`;
    }
    
    return true;
  }
  return false;
};

/** Incrementar stock (devoluciones) */
inventarioUnificadoSchema.methods.incrementarStock = function(cantidad, motivo = 'devolucion') {
  this.cantidadDisponible += cantidad;
  
  if (motivo === 'devolucion') {
    this.cantidadDevuelta += cantidad;
    this.cantidadVendida = Math.max(0, this.cantidadVendida - cantidad);
  }
  
  if (this.estado === 'agotado' && this.cantidadDisponible > 0) {
    this.estado = 'activo';
    this.motivoEstado = `Stock restaurado por ${motivo}`;
  }
};

/** Reservar stock */
inventarioUnificadoSchema.methods.reservarStock = function(cantidad) {
  if (this.cantidadDisponible >= cantidad) {
    this.cantidadDisponible -= cantidad;
    this.cantidadReservada += cantidad;
    return true;
  }
  return false;
};

/** Liberar reserva */
inventarioUnificadoSchema.methods.liberarReserva = function(cantidad) {
  const cantidadALiberar = Math.min(cantidad, this.cantidadReservada);
  this.cantidadReservada -= cantidadALiberar;
  this.cantidadDisponible += cantidadALiberar;
  return cantidadALiberar;
};

/** Obtener porcentaje de stock usado */
inventarioUnificadoSchema.methods.getPorcentajeUso = function() {
  if (this.cantidadInicial === 0) return 0;
  const usado = this.cantidadVendida + this.cantidadPerdida;
  return Math.round((usado / this.cantidadInicial) * 100);
};

/** Verificar si necesita alerta de vencimiento */
inventarioUnificadoSchema.methods.necesitaAlertaVencimiento = function() {
  if (!this.fechaVencimiento || this.estado !== 'activo') return false;
  
  const ahora = new Date();
  const diasParaVencer = Math.ceil((this.fechaVencimiento - ahora) / (1000 * 60 * 60 * 24));
  
  return diasParaVencer <= this.configuracion.diasAlertaVencimiento && diasParaVencer > 0;
};

// ========================================
// MÉTODOS ESTÁTICOS
// ========================================

/** Obtener stock total por producto */
inventarioUnificadoSchema.statics.obtenerStockPorProducto = function(catalogoProductoId) {
  return this.aggregate([
    {
      $match: {
        catalogoProductoId: new mongoose.Types.ObjectId(catalogoProductoId),
        estado: { $in: ['activo', 'reservado'] }
      }
    },
    {
      $group: {
        _id: '$catalogoProductoId',
        stockTotal: { $sum: '$cantidadDisponible' },
        stockReservado: { $sum: '$cantidadReservada' },
        valorTotal: { $sum: '$costoTotal' },
        lotes: { $sum: 1 },
        proximoVencimiento: { $min: '$fechaVencimiento' }
      }
    }
  ]);
};

/** Obtener productos próximos a vencer */
inventarioUnificadoSchema.statics.obtenerProximosAVencer = function(dias = 7) {
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() + dias);
  
  return this.find({
    fechaVencimiento: { $lte: fechaLimite },
    estado: 'activo',
    cantidadDisponible: { $gt: 0 }
  }).sort({ fechaVencimiento: 1 });
};

/** Obtener productos con stock bajo */
inventarioUnificadoSchema.statics.obtenerStockBajo = function() {
  return this.find({
    $expr: {
      $lte: ['$cantidadDisponible', '$configuracion.stockMinimo']
    },
    estado: 'activo'
  });
};

// ========================================
// CREAR Y EXPORTAR MODELO
// ========================================

const InventarioUnificado = mongoose.model('InventarioUnificado', inventarioUnificadoSchema);

module.exports = InventarioUnificado;