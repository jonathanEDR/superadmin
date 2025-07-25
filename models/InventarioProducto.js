const mongoose = require('mongoose');

const inventarioProductoSchema = new mongoose.Schema({
  productoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true,
    index: true
  },
  catalogoProductoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CatalogoProducto',
    required: true,
    index: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 0
  },
  cantidadInicial: {
    type: Number,
    required: true,
    min: 0
  },
  cantidadDisponible: {
    type: Number,
    required: true,
    min: 0,
    default: function() {
      return this.cantidad;
    }
  },
  precio: {
    type: Number,
    required: true,
    min: 0
  },
  fechaEntrada: {
    type: Date,
    default: Date.now,
    index: true
  },
  lote: {
    type: String,
    default: '',
    index: true
  },
  numeroEntrada: {
    type: String,
    unique: true,
    index: true
  },
  observaciones: {
    type: String,
    default: ''
  },
  estado: {
    type: String,
    enum: ['activo', 'inactivo', 'agotado'],
    default: 'activo',
    index: true
  },
  usuario: {
    type: String,
    required: true,
    index: true
  },
  usuarioEmail: {
    type: String,
    required: false
  },
  fechaVencimiento: {
    type: Date,
    required: false,
    index: true
  },
  proveedor: {
    type: String,
    default: ''
  },
  costoTotal: {
    type: Number,
    default: function() {
      return this.cantidad * this.precio;
    }
  }
}, {
  timestamps: true
});

// Middleware para establecer valores iniciales
inventarioProductoSchema.pre('save', async function(next) {
  try {
    if (this.isNew) {
      // Solo generar número si no se proporciona uno (para compatibilidad)
      if (!this.numeroEntrada) {
        console.log('[MODEL] Generando número de entrada en modelo (fallback)');
        const fecha = new Date();
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        
        // Usar timestamp como fallback para evitar duplicados
        const timestamp = Date.now().toString().slice(-6);
        this.numeroEntrada = `ENT-FALLBACK-${year}${month}${day}-${timestamp}`;
      }
      
      // Establecer cantidad inicial si no se especifica
      if (!this.cantidadInicial) {
        this.cantidadInicial = this.cantidad;
      }
      
      // Establecer cantidad disponible inicial
      if (!this.cantidadDisponible) {
        this.cantidadDisponible = this.cantidad;
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Índices compuestos para mejorar consultas
inventarioProductoSchema.index({ catalogoProductoId: 1, fechaEntrada: -1 });
inventarioProductoSchema.index({ estado: 1, fechaEntrada: -1 });
inventarioProductoSchema.index({ usuario: 1, fechaEntrada: -1 });

// Método para verificar si el lote está disponible
inventarioProductoSchema.methods.isDisponible = function() {
  return this.estado === 'activo' && this.cantidadDisponible > 0;
};

// Método para reducir cantidad disponible
inventarioProductoSchema.methods.reducirCantidad = function(cantidad) {
  if (this.cantidadDisponible >= cantidad) {
    this.cantidadDisponible -= cantidad;
    if (this.cantidadDisponible === 0) {
      this.estado = 'agotado';
    }
    return true;
  }
  return false;
};

// Método para obtener información del producto del catálogo
inventarioProductoSchema.methods.getProductoInfo = function() {
  return this.populate('catalogoProductoId');
};

const InventarioProducto = mongoose.model('InventarioProducto', inventarioProductoSchema);

module.exports = InventarioProducto;
