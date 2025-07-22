const mongoose = require('mongoose');

const recetaIngredienteSchema = new mongoose.Schema({
    ingrediente: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingrediente',
        required: true
    },
    cantidad: {
        type: Number,
        required: true,
        min: 0
    },
    unidadMedida: {
        type: String,
        required: true
    }
});

const recetaProductoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    productoReferencia: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CatalogoProducto',
        required: false // Opcional para mantener compatibilidad con recetas existentes
    },
    descripcion: {
        type: String,
        trim: true
    },
    ingredientes: [recetaIngredienteSchema],
    rendimiento: {
        cantidad: {
            type: Number,
            required: true,
            min: 1
        },
        unidadMedida: {
            type: String,
            required: true
        }
    },
    tiempoPreparacion: {
        type: Number, // en minutos
        default: 0
    },
    categoria: {
        type: String,
        enum: ['producto_terminado', 'producto_intermedio', 'preparado'],
        default: 'preparado' // Cambiar default para que inicie en preparado
    },
    
    // NUEVOS CAMPOS PARA EVOLUCIÓN GRADUAL
    // Estado del proceso actual
    estadoProceso: {
        type: String,
        enum: ['borrador', 'en_proceso', 'completado', 'pausado'],
        default: 'borrador'
    },
    
    // Fase actual del proceso (para flujo de trabajo)
    faseActual: {
        type: String,
        enum: ['preparado', 'intermedio', 'terminado'],
        default: 'preparado'
    },

    // 🎯 NUEVO: Rastrear si se consumieron ingredientes al crear
    ingredientesConsumidos: {
        type: Boolean,
        default: false // Por defecto no consumir ingredientes
    },
    
    // Historial de transiciones entre fases
    historicoFases: [{
        fase: {
            type: String,
            enum: ['preparado', 'intermedio', 'terminado'],
            required: true
        },
        fechaInicio: {
            type: Date,
            required: true
        },
        fechaFinalizacion: {
            type: Date
        },
        notas: {
            type: String,
            trim: true
        },
        ingredientesAgregados: [{
            ingrediente: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Ingrediente'
            },
            cantidad: {
                type: Number,
                min: 0
            },
            unidadMedida: {
                type: String
            },
            motivo: {
                type: String,
                enum: ['inicial', 'mejora', 'ajuste', 'sabor', 'textura', 'conservante'],
                default: 'inicial'
            },
            fechaAgregado: {
                type: Date,
                default: Date.now
            }
        }]
    }],
    
    // Configuración del proceso
    puedeAvanzar: {
        type: Boolean,
        default: true
    },
    
    // Control de inventario de recetas (extendido por fase)
    inventario: {
        cantidadProducida: {
            type: Number,
            default: 0,
            min: 0
        },
        cantidadUtilizada: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    
    // Control de inventario por fase
    inventarioPorFase: {
        preparado: {
            cantidadProducida: { type: Number, default: 0, min: 0 },
            cantidadUtilizada: { type: Number, default: 0, min: 0 }
        },
        intermedio: {
            cantidadProducida: { type: Number, default: 0, min: 0 },
            cantidadUtilizada: { type: Number, default: 0, min: 0 }
        },
        terminado: {
            cantidadProducida: { type: Number, default: 0, min: 0 },
            cantidadUtilizada: { type: Number, default: 0, min: 0 }
        }
    },
    
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual para calcular el inventario disponible
recetaProductoSchema.virtual('inventarioDisponible').get(function() {
    return this.inventario.cantidadProducida - this.inventario.cantidadUtilizada;
});

// NUEVOS VIRTUALS Y MÉTODOS PARA FLUJO DE TRABAJO
// Virtual para obtener la fase actual del historial
recetaProductoSchema.virtual('faseActualInfo').get(function() {
    // VALIDACIÓN DEFENSIVA: Verificar que historicoFases existe y es un array
    if (!this.historicoFases || !Array.isArray(this.historicoFases)) {
        return null;
    }
    
    const fasesActivas = this.historicoFases.filter(f => !f.fechaFinalizacion);
    return fasesActivas.length > 0 ? fasesActivas[fasesActivas.length - 1] : null;
});

// Virtual para verificar si puede avanzar de fase
recetaProductoSchema.virtual('puedeAvanzarFase').get(function() {
    const fasesOrden = ['preparado', 'intermedio', 'terminado'];
    const indiceActual = fasesOrden.indexOf(this.faseActual);
    return this.estadoProceso === 'en_proceso' && 
           this.puedeAvanzar && 
           indiceActual < fasesOrden.length - 1;
});

// Virtual para obtener la siguiente fase
recetaProductoSchema.virtual('siguienteFase').get(function() {
    const fasesOrden = ['preparado', 'intermedio', 'terminado'];
    const indiceActual = fasesOrden.indexOf(this.faseActual);
    return indiceActual < fasesOrden.length - 1 ? fasesOrden[indiceActual + 1] : null;
});

// Método para iniciar el proceso (cambiar de borrador a en_proceso)
recetaProductoSchema.methods.iniciarProceso = async function() {
    if (this.estadoProceso !== 'borrador') {
        throw new Error('El proceso ya ha sido iniciado');
    }
    
    this.estadoProceso = 'en_proceso';
    this.faseActual = 'preparado';
    this.categoria = 'preparado'; // 🎯 AGREGAR: Asegurar que categoría esté sincronizada
    
    // Agregar la fase inicial al historial
    if (!this.historicoFases) {
        this.historicoFases = [];
    }
    this.historicoFases.push({
        fase: 'preparado',
        fechaInicio: new Date(),
        notas: 'Proceso iniciado',
        ingredientesAgregados: []
    });
    
    return await this.save();
};

// Método para avanzar a la siguiente fase
recetaProductoSchema.methods.avanzarAProximaFase = async function(datosAdicionales = {}) {
    const fasesOrden = ['preparado', 'intermedio', 'terminado'];
    const indiceActual = fasesOrden.indexOf(this.faseActual);
    
    if (!this.puedeAvanzarFase) {
        throw new Error('No se puede avanzar de fase en el estado actual');
    }
    
    if (indiceActual >= fasesOrden.length - 1) {
        throw new Error('Ya se encuentra en la última fase del proceso');
    }
    
    // Finalizar fase actual
    const faseActual = this.faseActualInfo;
    if (faseActual) {
        faseActual.fechaFinalizacion = new Date();
        if (datosAdicionales.notas) {
            faseActual.notas = datosAdicionales.notas;
        }
    }
    
    // Avanzar a la siguiente fase
    const siguienteFase = fasesOrden[indiceActual + 1];
    this.faseActual = siguienteFase;
    this.categoria = siguienteFase === 'terminado' ? 'producto_terminado' : 
                    siguienteFase === 'intermedio' ? 'producto_intermedio' : 'preparado';
    
    // Agregar nueva fase al historial
    if (!this.historicoFases) {
        this.historicoFases = [];
    }
    this.historicoFases.push({
        fase: siguienteFase,
        fechaInicio: new Date(),
        notas: datosAdicionales.notasNuevaFase || `Avance a fase ${siguienteFase}`,
        ingredientesAgregados: datosAdicionales.ingredientesAdicionales || []
    });
    
    // Si llegamos a terminado, marcar como completado
    if (siguienteFase === 'terminado') {
        this.estadoProceso = 'completado';
    }
    
    return await this.save();
};

// Método para agregar ingredientes a la fase actual
recetaProductoSchema.methods.agregarIngredienteAFaseActual = async function(ingredienteData) {
    const faseActual = this.faseActualInfo;
    if (!faseActual) {
        throw new Error('No hay una fase activa para agregar ingredientes');
    }
    
    faseActual.ingredientesAgregados.push({
        ...ingredienteData,
        fechaAgregado: new Date()
    });
    
    return await this.save();
};

// Método para pausar el proceso
recetaProductoSchema.methods.pausarProceso = async function(motivo = '') {
    if (this.estadoProceso !== 'en_proceso') {
        throw new Error('Solo se pueden pausar procesos que están en curso');
    }
    
    this.estadoProceso = 'pausado';
    const faseActual = this.faseActualInfo;
    if (faseActual && motivo) {
        faseActual.notas = (faseActual.notas || '') + `\nPausado: ${motivo}`;
    }
    
    return await this.save();
};

// Método para reanudar el proceso
recetaProductoSchema.methods.reanudarProceso = async function() {
    if (this.estadoProceso !== 'pausado') {
        throw new Error('Solo se pueden reanudar procesos pausados');
    }
    
    this.estadoProceso = 'en_proceso';
    return await this.save();
};

// 🎯 NUEVO: Método para reiniciar receta a estado inicial
recetaProductoSchema.methods.reiniciarReceta = async function(motivo = 'Reinicio manual') {
    // Solo permitir reinicio si no está en borrador
    if (this.estadoProceso === 'borrador') {
        throw new Error('La receta ya se encuentra en estado inicial');
    }
    
    // Finalizar fase actual si existe
    const faseActual = this.faseActualInfo;
    if (faseActual && !faseActual.fechaFinalizacion) {
        faseActual.fechaFinalizacion = new Date();
        faseActual.notas = (faseActual.notas || '') + `\nReiniciado: ${motivo}`;
    }
    
    // Resetear estado y fase
    this.estadoProceso = 'borrador';
    this.faseActual = 'preparado';
    this.categoria = 'preparado';
    this.puedeAvanzar = true;
    
    // Agregar entrada de reinicio al historial
    if (!this.historicoFases) {
        this.historicoFases = [];
    }
    this.historicoFases.push({
        fase: 'preparado',
        fechaInicio: new Date(),
        notas: `Receta reiniciada - ${motivo}`,
        ingredientesAgregados: []
    });
    
    // TODO: Aquí podríamos restaurar inventario si es necesario
    // this.inventario.cantidadProducida = 0;
    // this.inventario.cantidadUtilizada = 0;
    
    return await this.save();
};

// Método para verificar disponibilidad de inventario de receta
recetaProductoSchema.methods.verificarDisponibilidadInventario = function(cantidadRequerida) {
    return this.inventarioDisponible >= cantidadRequerida;
};

// Método para usar receta (descontar del inventario)
recetaProductoSchema.methods.usarReceta = async function(cantidad, motivo = 'Utilizada en producción') {
    if (!this.verificarDisponibilidadInventario(cantidad)) {
        throw new Error(`Inventario insuficiente de receta ${this.nombre}. Disponible: ${this.inventarioDisponible}, Requerido: ${cantidad}`);
    }
    
    this.inventario.cantidadUtilizada += cantidad;
    await this.save();
    
    // Registrar movimiento de inventario
    const MovimientoInventario = require('./MovimientoInventario');
    await MovimientoInventario.registrarMovimiento({
        tipo: 'salida',
        item: this._id,
        tipoItem: 'RecetaProducto',
        cantidad: cantidad,
        cantidadAnterior: this.inventario.cantidadUtilizada - cantidad,
        cantidadNueva: this.inventario.cantidadUtilizada,
        motivo: motivo,
        operador: 'sistema'
    });
};

// Método para agregar al inventario (cuando se produce)
recetaProductoSchema.methods.agregarAlInventario = async function(cantidad, motivo = 'Producción completada') {
    this.inventario.cantidadProducida += cantidad;
    await this.save();
    
    // Registrar movimiento de inventario
    const MovimientoInventario = require('./MovimientoInventario');
    await MovimientoInventario.registrarMovimiento({
        tipo: 'entrada',
        item: this._id,
        tipoItem: 'RecetaProducto',
        cantidad: cantidad,
        cantidadAnterior: this.inventario.cantidadProducida - cantidad,
        cantidadNueva: this.inventario.cantidadProducida,
        motivo: motivo,
        operador: 'sistema'
    });
};

// Método para calcular costo total de la receta
recetaProductoSchema.methods.calcularCostoTotal = async function() {
    await this.populate('ingredientes.ingrediente');
    let costoTotalIngredientes = 0;
    
    for (const item of this.ingredientes) {
        costoTotalIngredientes += item.cantidad * (item.ingrediente.precioUnitario || 0);
    }
    
    // Calcular el costo por unidad producida considerando el rendimiento
    const rendimiento = this.rendimiento?.cantidad || 1;
    const costoPorUnidadProducida = costoTotalIngredientes / rendimiento;
    
    return costoPorUnidadProducida;
};

// Método para calcular el costo total de ingredientes (sin dividir por rendimiento)
recetaProductoSchema.methods.calcularCostoIngredientes = async function() {
    await this.populate('ingredientes.ingrediente');
    let costoTotalIngredientes = 0;
    
    for (const item of this.ingredientes) {
        costoTotalIngredientes += item.cantidad * (item.ingrediente.precioUnitario || 0);
    }
    
    return costoTotalIngredientes;
};

// Método para verificar disponibilidad de todos los ingredientes
recetaProductoSchema.methods.verificarDisponibilidadCompleta = async function(cantidadAPrducir = 1) {
    await this.populate('ingredientes.ingrediente');
    
    const faltantes = [];
    
    for (const item of this.ingredientes) {
        const cantidadRequerida = item.cantidad * cantidadAPrducir;
        if (!item.ingrediente.verificarDisponibilidad(cantidadRequerida)) {
            faltantes.push({
                ingrediente: item.ingrediente.nombre,
                requerido: cantidadRequerida,
                disponible: item.ingrediente.total,
                faltante: cantidadRequerida - item.ingrediente.total
            });
        }
    }
    
    return {
        disponible: faltantes.length === 0,
        faltantes
    };
};

module.exports = mongoose.model('RecetaProducto', recetaProductoSchema);