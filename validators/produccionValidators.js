const Joi = require('joi');

/**
 * Esquemas de validación para el módulo de producción
 */
class ProductionValidators {
    
    // Validadores base reutilizables
    static get baseSchemas() {
        return {
            objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Debe ser un ID válido de MongoDB'),
            nombre: Joi.string().min(3).max(100).trim().required().messages({
                'string.empty': 'El nombre es requerido',
                'string.min': 'El nombre debe tener al menos 3 caracteres',
                'string.max': 'El nombre no puede exceder 100 caracteres'
            }),
            cantidad: Joi.number().positive().precision(2).required().messages({
                'number.base': 'La cantidad debe ser un número',
                'number.positive': 'La cantidad debe ser mayor a 0'
            }),
            unidadMedida: Joi.string().valid('kg', 'gr', 'lt', 'ml', 'unidad', 'pieza').required(),
            precio: Joi.number().min(0).precision(2).optional(),
            observaciones: Joi.string().max(500).optional()
        };
    }

    // Validación para crear ingrediente
    static get crearIngrediente() {
        return Joi.object({
            nombre: this.baseSchemas.nombre,
            productoReferencia: this.baseSchemas.objectId,
            unidadMedida: this.baseSchemas.unidadMedida,
            cantidad: this.baseSchemas.cantidad,
            precioUnitario: this.baseSchemas.precio,
            activo: Joi.boolean().default(true)
        });
    }

    // Validación para crear material
    static get crearMaterial() {
        return Joi.object({
            nombre: this.baseSchemas.nombre,
            productoReferencia: this.baseSchemas.objectId,
            unidadMedida: this.baseSchemas.unidadMedida,
            cantidad: this.baseSchemas.cantidad,
            precioUnitario: this.baseSchemas.precio,
            proveedor: Joi.string().max(100).optional(),
            numeroLote: Joi.string().max(50).optional(),
            fechaVencimiento: Joi.date().greater('now').optional(),
            ubicacionAlmacen: Joi.string().max(100).optional(),
            stockMinimo: Joi.number().min(0).default(0),
            activo: Joi.boolean().default(true)
        });
    }

    // Validación para crear receta
    static get crearReceta() {
        return Joi.object({
            nombre: this.baseSchemas.nombre,
            descripcion: Joi.string().max(500).optional(),
            ingredientes: Joi.array().items(
                Joi.object({
                    ingrediente: this.baseSchemas.objectId,
                    cantidad: this.baseSchemas.cantidad,
                    unidadMedida: this.baseSchemas.unidadMedida
                })
            ).min(1).required().messages({
                'array.min': 'Debe agregar al menos un ingrediente'
            }),
            rendimiento: Joi.object({
                cantidad: this.baseSchemas.cantidad,
                unidadMedida: this.baseSchemas.unidadMedida
            }).required(),
            tiempoPreparacion: Joi.number().min(0).default(0),
            dificultad: Joi.string().valid('facil', 'media', 'dificil').default('media'),
            observaciones: this.baseSchemas.observaciones,
            activo: Joi.boolean().default(true)
        });
    }

    // Validación para crear producción manual
    static get crearProduccionManual() {
        return Joi.object({
            nombre: this.baseSchemas.nombre,
            cantidadProducida: this.baseSchemas.cantidad,
            unidadMedida: this.baseSchemas.unidadMedida,
            ingredientesUtilizados: Joi.array().items(
                Joi.object({
                    ingrediente: this.baseSchemas.objectId,
                    cantidad: this.baseSchemas.cantidad,
                    costoUnitario: this.baseSchemas.precio
                })
            ).optional().default([]),
            recetasUtilizadas: Joi.array().items(
                Joi.object({
                    receta: this.baseSchemas.objectId,
                    cantidad: this.baseSchemas.cantidad,
                    costoUnitario: this.baseSchemas.precio
                })
            ).optional().default([]),
            costoTotal: this.baseSchemas.precio,
            observaciones: this.baseSchemas.observaciones,
            operador: Joi.string().min(2).max(50).required()
        }).custom((value, helpers) => {
            // Al menos debe tener ingredientes o recetas utilizadas
            if (value.ingredientesUtilizados.length === 0 && value.recetasUtilizadas.length === 0) {
                return helpers.error('custom.minItems', {
                    message: 'Debe incluir al menos un ingrediente o una receta'
                });
            }
            return value;
        });
    }

    // Validación para crear producción desde receta
    static get crearProduccionDesdeReceta() {
        return Joi.object({
            recetaId: this.baseSchemas.objectId,
            cantidad: this.baseSchemas.cantidad,
            observaciones: this.baseSchemas.observaciones,
            operador: Joi.string().min(2).max(50).required()
        });
    }

    // Validación para actualizar cantidad
    static get actualizarCantidad() {
        return Joi.object({
            cantidad: this.baseSchemas.cantidad,
            motivo: Joi.string().min(5).max(200).required().messages({
                'string.min': 'El motivo debe tener al menos 5 caracteres',
                'string.empty': 'El motivo es requerido'
            })
        });
    }

    // Validación para ajustar inventario
    static get ajustarInventario() {
        return Joi.object({
            ajuste: Joi.number().not(0).precision(2).required().messages({
                'number.base': 'El ajuste debe ser un número',
                'any.invalid': 'El ajuste no puede ser 0'
            }),
            motivo: Joi.string().min(5).max(200).required()
        });
    }

    // Validación para consumir/usar producto
    static get consumirProducto() {
        return Joi.object({
            cantidad: this.baseSchemas.cantidad,
            motivo: Joi.string().min(5).max(200).default('Consumo manual')
        });
    }

    // Validación para filtros de consulta
    static get filtrosConsulta() {
        return Joi.object({
            buscar: Joi.string().max(100).optional(),
            unidadMedida: this.baseSchemas.unidadMedida.optional(),
            activo: Joi.boolean().optional(),
            fechaInicio: Joi.date().optional(),
            fechaFin: Joi.date().greater(Joi.ref('fechaInicio')).optional(),
            operador: Joi.string().max(50).optional(),
            limite: Joi.number().integer().min(1).max(500).default(50),
            pagina: Joi.number().integer().min(1).default(1)
        });
    }

    // Middleware de validación de Express
    static validate(schema) {
        return (req, res, next) => {
            const { error, value } = schema.validate(req.body, {
                abortEarly: false,
                allowUnknown: false,
                stripUnknown: true
            });

            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context?.value
                }));

                return res.status(400).json({
                    success: false,
                    message: 'Errores de validación',
                    errors: errors,
                    timestamp: new Date().toISOString()
                });
            }

            // Reemplazar req.body con los datos validados y limpiados
            req.body = value;
            next();
        };
    }

    // Validación de query parameters
    static validateQuery(schema) {
        return (req, res, next) => {
            const { error, value } = schema.validate(req.query, {
                abortEarly: false,
                allowUnknown: true,
                stripUnknown: true
            });

            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));

                return res.status(400).json({
                    success: false,
                    message: 'Parámetros de consulta inválidos',
                    errors: errors
                });
            }

            req.query = value;
            next();
        };
    }

    // Validación de parámetros de URL
    static validateParams(schema) {
        return (req, res, next) => {
            const { error, value } = schema.validate(req.params);

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Parámetros de URL inválidos',
                    details: error.details[0].message
                });
            }

            req.params = value;
            next();
        };
    }
}

module.exports = ProductionValidators;
