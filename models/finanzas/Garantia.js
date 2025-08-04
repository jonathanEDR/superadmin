const mongoose = require('mongoose');

const garantiaSchema = new mongoose.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    // Relación con préstamo
    prestamoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prestamo',
        required: true,
        index: true
    },
    // Información básica de la garantía
    tipo: {
        type: String,
        required: true,
        enum: ['hipotecaria', 'vehicular', 'fianza_personal', 'deposito_garantia', 'aval_bancario', 'prenda', 'warrant', 'otra'],
        default: 'otra'
    },
    subtipo: {
        type: String,
        trim: true
    },
    estado: {
        type: String,
        required: true,
        enum: ['pendiente_evaluacion', 'aprobada', 'rechazada', 'activa', 'liberada', 'ejecutada'],
        default: 'pendiente_evaluacion'
    },
    // Descripción y detalles
    descripcion: {
        type: String,
        required: true,
        trim: true
    },
    // Información del bien/garantía
    bien: {
        nombre: {
            type: String,
            required: true,
            trim: true
        },
        descripcionDetallada: String,
        marca: String,
        modelo: String,
        año: Number,
        numeroSerie: String,
        numeroMotor: String,
        numeroChasis: String,
        color: String,
        estado: {
            type: String,
            enum: ['nuevo', 'usado_excelente', 'usado_bueno', 'usado_regular', 'deteriorado'],
            default: 'usado_bueno'
        }
    },
    // Ubicación del bien (para inmuebles principalmente)
    ubicacion: {
        direccion: String,
        distrito: String,
        provincia: String,
        departamento: String,
        codigoPostal: String,
        referencia: String,
        coordenadas: {
            latitud: Number,
            longitud: Number
        }
    },
    // Valores de la garantía
    valores: {
        comercial: {
            type: Number,
            required: true,
            min: 0
        },
        tasacion: {
            type: Number,
            min: 0
        },
        realizacion: {
            type: Number,
            min: 0
        },
        seguro: {
            type: Number,
            min: 0
        },
        moneda: {
            type: String,
            enum: ['PEN', 'USD', 'EUR'],
            default: 'PEN'
        }
    },
    // Información del propietario/garante
    propietario: {
        nombre: {
            type: String,
            required: true,
            trim: true
        },
        documento: {
            tipo: {
                type: String,
                required: true,
                enum: ['DNI', 'CE', 'RUC', 'PASAPORTE'],
                default: 'DNI'
            },
            numero: {
                type: String,
                required: true,
                trim: true
            }
        },
        email: String,
        telefono: String,
        direccion: String,
        relacion: {
            type: String,
            enum: ['titular', 'conyuge', 'familiar', 'tercero', 'empresa'],
            default: 'titular'
        }
    },
    // Información legal y registral
    informacionLegal: {
        numeroRegistro: String,
        oficina: String, // Registros Públicos, SUNARP, etc.
        folio: String,
        asiento: String,
        partida: String,
        zona: String,
        fechaInscripcion: Date,
        vigenciaInscripcion: Date
    },
    // Seguros asociados
    seguros: [{
        compania: String,
        numeroPoliza: String,
        tipo: {
            type: String,
            enum: ['todo_riesgo', 'incendio', 'robo', 'responsabilidad_civil', 'vida', 'otro']
        },
        cobertura: Number,
        prima: Number,
        moneda: String,
        fechaInicio: Date,
        fechaVencimiento: Date,
        beneficiario: String,
        estado: {
            type: String,
            enum: ['vigente', 'vencido', 'cancelado'],
            default: 'vigente'
        }
    }],
    // Evaluación y tasación
    evaluacion: {
        fechaEvaluacion: Date,
        evaluadoPor: {
            nombre: String,
            empresa: String,
            numeroRegistro: String,
            telefono: String,
            email: String
        },
        metodologia: String,
        observaciones: String,
        recomendaciones: String,
        estadoConservacion: {
            type: String,
            enum: ['excelente', 'bueno', 'regular', 'malo', 'muy_malo']
        },
        riesgos: [String],
        restricciones: [String]
    },
    // Documentos de respaldo
    documentos: [{
        tipo: {
            type: String,
            enum: ['escritura', 'titulo', 'tarjeta_propiedad', 'certificado_registral', 'tasacion', 'seguro', 'otro'],
            required: true
        },
        nombre: String,
        url: String,
        fechaEmision: Date,
        fechaVencimiento: Date,
        entidadEmisora: String,
        numeroDocumento: String,
        observaciones: String,
        fechaSubida: { type: Date, default: Date.now }
    }],
    // Historial de estados
    historialEstados: [{
        estadoAnterior: String,
        estadoNuevo: String,
        fecha: { type: Date, default: Date.now },
        responsable: String,
        motivo: String,
        observaciones: String
    }],
    // Fechas importantes
    fechaConstitucion: {
        type: Date,
        default: Date.now
    },
    fechaLiberacion: Date,
    fechaEjecucion: Date,
    // Información de ejecución (si aplica)
    ejecucion: {
        motivo: String,
        valorObtenido: Number,
        gastos: Number,
        valorNeto: Number,
        fechaRemate: Date,
        observaciones: String
    },
    // Información de trazabilidad
    userId: {
        type: String,
        required: true,
        index: true
    },
    creatorId: {
        type: String,
        required: true
    },
    creatorName: {
        type: String,
        required: true
    },
    creatorEmail: {
        type: String,
        required: true
    },
    creatorRole: {
        type: String,
        required: true
    },
    // Observaciones generales
    observaciones: {
        type: String,
        trim: true
    }
}, {
    timestamps: true,
    collection: 'garantias'
});

// Índices para optimizar consultas
garantiaSchema.index({ prestamoId: 1 });
garantiaSchema.index({ userId: 1, estado: 1 });
garantiaSchema.index({ tipo: 1 });
garantiaSchema.index({ 'propietario.documento.numero': 1 });
garantiaSchema.index({ 'valores.comercial': 1 });
garantiaSchema.index({ fechaConstitucion: -1 });
garantiaSchema.index({ createdAt: -1 });

// Middleware para generar código automático
garantiaSchema.pre('save', async function(next) {
    if (this.isNew && !this.codigo) {
        const ultimaGarantia = await this.constructor.findOne(
            { userId: this.userId },
            {},
            { sort: { codigo: -1 } }
        );
        
        let numeroSecuencial = 1;
        if (ultimaGarantia && ultimaGarantia.codigo) {
            const match = ultimaGarantia.codigo.match(/GAR(\d+)$/);
            if (match) {
                numeroSecuencial = parseInt(match[1]) + 1;
            }
        }
        
        this.codigo = `GAR${numeroSecuencial.toString().padStart(3, '0')}`;
    }
    
    // Calcular valor de realización si no está definido (80% del valor comercial por defecto)
    if (this.isNew && !this.valores.realizacion && this.valores.comercial) {
        this.valores.realizacion = Math.round(this.valores.comercial * 0.8);
    }
    
    next();
});

// Middleware para registrar cambios de estado
garantiaSchema.pre('save', function(next) {
    if (!this.isNew && this.isModified('estado')) {
        const estadoAnterior = this.$__.estado;
        if (estadoAnterior !== this.estado) {
            this.historialEstados.push({
                estadoAnterior: estadoAnterior,
                estadoNuevo: this.estado,
                fecha: new Date(),
                responsable: this.creatorName || 'Sistema',
                motivo: 'Cambio de estado',
                observaciones: `Estado cambiado de ${estadoAnterior} a ${this.estado}`
            });
        }
    }
    next();
});

// Métodos de instancia
garantiaSchema.methods.aprobar = function(valorTasacion = null) {
    this.estado = 'aprobada';
    if (valorTasacion) {
        this.valores.tasacion = valorTasacion;
        this.valores.realizacion = Math.round(valorTasacion * 0.8);
    }
    
    this.evaluacion.fechaEvaluacion = new Date();
    return this.save();
};

garantiaSchema.methods.rechazar = function(motivo = '') {
    this.estado = 'rechazada';
    this.observaciones = (this.observaciones || '') + `\nRechazada: ${motivo}`;
    return this.save();
};

garantiaSchema.methods.activar = function() {
    if (this.estado === 'aprobada') {
        this.estado = 'activa';
        this.fechaConstitucion = new Date();
        return this.save();
    }
    throw new Error('La garantía debe estar aprobada para activarse');
};

garantiaSchema.methods.liberar = function(motivo = '') {
    if (['activa'].includes(this.estado)) {
        this.estado = 'liberada';
        this.fechaLiberacion = new Date();
        this.observaciones = (this.observaciones || '') + `\nLiberada: ${motivo}`;
        return this.save();
    }
    throw new Error('Solo se pueden liberar garantías activas');
};

garantiaSchema.methods.ejecutar = function(datosEjecucion) {
    if (this.estado === 'activa') {
        this.estado = 'ejecutada';
        this.fechaEjecucion = new Date();
        
        this.ejecucion = {
            motivo: datosEjecucion.motivo || 'Incumplimiento de pago',
            valorObtenido: datosEjecucion.valorObtenido || 0,
            gastos: datosEjecucion.gastos || 0,
            valorNeto: (datosEjecucion.valorObtenido || 0) - (datosEjecucion.gastos || 0),
            fechaRemate: datosEjecucion.fechaRemate,
            observaciones: datosEjecucion.observaciones || ''
        };
        
        return this.save();
    }
    throw new Error('Solo se pueden ejecutar garantías activas');
};

garantiaSchema.methods.calcularCobertura = function(montoCredito) {
    const valorRealizacion = this.valores.realizacion || this.valores.comercial * 0.8;
    const porcentajeCobertura = (valorRealizacion / montoCredito) * 100;
    
    return {
        valorRealizacion: valorRealizacion,
        montoCredito: montoCredito,
        porcentajeCobertura: Math.round(porcentajeCobertura * 100) / 100,
        suficiente: porcentajeCobertura >= 100,
        exceso: Math.max(0, valorRealizacion - montoCredito),
        deficit: Math.max(0, montoCredito - valorRealizacion)
    };
};

garantiaSchema.methods.validarDocumentacion = function() {
    const documentosRequeridos = this.obtenerDocumentosRequeridos();
    const documentosPresentes = this.documentos.map(doc => doc.tipo);
    
    const faltantes = documentosRequeridos.filter(req => !documentosPresentes.includes(req));
    const vencidos = this.documentos.filter(doc => 
        doc.fechaVencimiento && doc.fechaVencimiento < new Date()
    );
    
    return {
        completa: faltantes.length === 0,
        documentosFaltantes: faltantes,
        documentosVencidos: vencidos,
        porcentajeCompletitud: Math.round(((documentosRequeridos.length - faltantes.length) / documentosRequeridos.length) * 100)
    };
};

garantiaSchema.methods.obtenerDocumentosRequeridos = function() {
    const documentosBase = ['tasacion'];
    
    switch (this.tipo) {
        case 'hipotecaria':
            return [...documentosBase, 'escritura', 'certificado_registral'];
        case 'vehicular':
            return [...documentosBase, 'tarjeta_propiedad'];
        case 'fianza_personal':
            return [...documentosBase];
        case 'deposito_garantia':
            return [...documentosBase, 'certificado_deposito'];
        case 'aval_bancario':
            return [...documentosBase, 'carta_aval'];
        default:
            return documentosBase;
    }
};

garantiaSchema.methods.verificarSeguros = function() {
    const hoy = new Date();
    const segurosVigentes = this.seguros.filter(seguro => 
        seguro.estado === 'vigente' && seguro.fechaVencimiento > hoy
    );
    
    const segurosVencidos = this.seguros.filter(seguro => 
        seguro.fechaVencimiento <= hoy
    );
    
    const segurosPorVencer = this.seguros.filter(seguro => {
        const diasParaVencer = (seguro.fechaVencimiento - hoy) / (1000 * 60 * 60 * 24);
        return seguro.estado === 'vigente' && diasParaVencer <= 30 && diasParaVencer > 0;
    });
    
    return {
        vigentes: segurosVigentes,
        vencidos: segurosVencidos,
        porVencer: segurosPorVencer,
        totalCobertura: segurosVigentes.reduce((sum, seguro) => sum + (seguro.cobertura || 0), 0)
    };
};

// Métodos estáticos
garantiaSchema.statics.obtenerPorPrestamo = function(prestamoId) {
    return this.find({ prestamoId }).sort({ createdAt: -1 });
};

garantiaSchema.statics.obtenerPorUsuario = function(userId, estado = null) {
    const filtro = { userId };
    if (estado) {
        if (Array.isArray(estado)) {
            filtro.estado = { $in: estado };
        } else {
            filtro.estado = estado;
        }
    }
    return this.find(filtro).sort({ createdAt: -1 });
};

garantiaSchema.statics.obtenerPorTipo = function(tipo, userId = null) {
    const filtro = { tipo };
    if (userId) {
        filtro.userId = userId;
    }
    return this.find(filtro).sort({ createdAt: -1 });
};

garantiaSchema.statics.obtenerProximasVencer = function(dias = 30, userId = null) {
    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(hoy.getDate() + dias);
    
    const filtro = {
        estado: 'activa',
        'seguros.fechaVencimiento': { $gte: hoy, $lte: fechaLimite }
    };
    if (userId) {
        filtro.userId = userId;
    }
    
    return this.find(filtro).sort({ 'seguros.fechaVencimiento': 1 });
};

garantiaSchema.statics.obtenerEstadisticas = async function(userId = null) {
    const filtro = userId ? { userId } : {};
    
    const pipeline = [
        { $match: filtro },
        {
            $group: {
                _id: null,
                totalGarantias: { $sum: 1 },
                garantiasActivas: {
                    $sum: { $cond: [{ $eq: ['$estado', 'activa'] }, 1, 0] }
                },
                garantiasPendientes: {
                    $sum: { $cond: [{ $eq: ['$estado', 'pendiente_evaluacion'] }, 1, 0] }
                },
                garantiasEjecutadas: {
                    $sum: { $cond: [{ $eq: ['$estado', 'ejecutada'] }, 1, 0] }
                },
                valorTotalComercial: { $sum: '$valores.comercial' },
                valorTotalTasacion: { $sum: '$valores.tasacion' },
                valorTotalRealizacion: { $sum: '$valores.realizacion' }
            }
        }
    ];
    
    // Estadísticas por tipo
    const pipelineTipo = [
        { $match: filtro },
        {
            $group: {
                _id: '$tipo',
                cantidad: { $sum: 1 },
                valorTotal: { $sum: '$valores.comercial' }
            }
        }
    ];
    
    const [estadisticasGenerales, estadisticasPorTipo] = await Promise.all([
        this.aggregate(pipeline),
        this.aggregate(pipelineTipo)
    ]);
    
    return {
        general: estadisticasGenerales[0] || {
            totalGarantias: 0,
            garantiasActivas: 0,
            garantiasPendientes: 0,
            garantiasEjecutadas: 0,
            valorTotalComercial: 0,
            valorTotalTasacion: 0,
            valorTotalRealizacion: 0
        },
        porTipo: estadisticasPorTipo
    };
};

module.exports = mongoose.model('Garantia', garantiaSchema);
