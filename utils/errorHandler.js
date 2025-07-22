const winston = require('winston');

// Configurar logger para errores
const logger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

/**
 * Clase para manejo consistente de errores en el módulo de producción
 */
class ErrorHandler {
    /**
     * Procesar y formatear errores de manera consistente
     * @param {Error} error - Error original
     * @param {string} operation - Operación donde ocurrió el error
     * @param {Object} context - Contexto adicional (usuario, datos, etc.)
     */
    static handle(error, operation, context = {}) {
        // Generar ID único para tracking
        const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const errorResponse = {
            success: false,
            message: this.getUserFriendlyMessage(error),
            operation: operation,
            errorId: errorId,
            timestamp: new Date().toISOString()
        };

        // Log completo para debugging (incluyendo stack trace)
        const logData = {
            errorId,
            operation,
            originalMessage: error.message,
            stack: error.stack,
            context: context,
            timestamp: new Date().toISOString()
        };

        logger.error('Error en módulo de producción:', logData);
        
        return errorResponse;
    }

    /**
     * Convertir errores técnicos en mensajes amigables para el usuario
     */
    static getUserFriendlyMessage(error) {
        const technicalErrors = {
            'CastError': 'ID de producto no válido',
            'ValidationError': 'Datos de entrada no válidos',
            'MongoError': 'Error de base de datos',
            'TypeError': 'Error en el procesamiento de datos',
            'ReferenceError': 'Recurso no encontrado'
        };

        // Errores específicos del módulo de producción
        if (error.message.includes('insuficiente')) {
            return 'Stock insuficiente para completar la operación';
        }
        
        if (error.message.includes('no encontrado')) {
            return 'El recurso solicitado no fue encontrado';
        }
        
        if (error.message.includes('ya existe')) {
            return 'Ya existe un registro con estos datos';
        }

        // Mapear errores técnicos
        for (const [errorType, friendlyMessage] of Object.entries(technicalErrors)) {
            if (error.constructor.name === errorType || error.message.includes(errorType)) {
                return friendlyMessage;
            }
        }

        // Si no hay mapeo específico, retornar el mensaje original (pero limpiado)
        return this.sanitizeErrorMessage(error.message);
    }

    /**
     * Limpiar mensajes de error de información técnica sensible
     */
    static sanitizeErrorMessage(message) {
        // Remover rutas de archivos
        message = message.replace(/\/[^\s]*\/[^\s]*/g, '[ruta del archivo]');
        
        // Remover información de MongoDB
        message = message.replace(/MongoError:|MongoDB/gi, 'Error de base de datos');
        
        // Limitar longitud del mensaje
        if (message.length > 200) {
            message = message.substring(0, 200) + '...';
        }

        return message;
    }

    /**
     * Middleware de Express para manejo automático de errores
     */
    static middleware() {
        return (error, req, res, next) => {
            const context = {
                url: req.originalUrl,
                method: req.method,
                user: req.user?.email || 'Anónimo',
                body: req.body,
                params: req.params,
                query: req.query
            };

            const errorResponse = this.handle(error, `${req.method} ${req.originalUrl}`, context);
            
            // Determinar código de estado HTTP apropiado
            let statusCode = 500;
            
            if (error.name === 'ValidationError') statusCode = 400;
            if (error.name === 'CastError') statusCode = 400;
            if (error.message.includes('no encontrado')) statusCode = 404;
            if (error.message.includes('ya existe')) statusCode = 409;
            if (error.message.includes('insuficiente')) statusCode = 422;
            
            res.status(statusCode).json(errorResponse);
        };
    }

    /**
     * Wrapper para funciones async que maneja errores automáticamente
     */
    static asyncWrapper(operation) {
        return (fn) => {
            return async (req, res, next) => {
                try {
                    await fn(req, res, next);
                } catch (error) {
                    const context = {
                        user: req.user?.email || 'Anónimo',
                        body: req.body,
                        params: req.params
                    };
                    
                    const errorResponse = this.handle(error, operation, context);
                    
                    let statusCode = 500;
                    if (error.name === 'ValidationError') statusCode = 400;
                    if (error.name === 'CastError') statusCode = 400;
                    if (error.message.includes('no encontrado')) statusCode = 404;
                    if (error.message.includes('ya existe')) statusCode = 409;
                    
                    res.status(statusCode).json(errorResponse);
                }
            };
        };
    }
}

module.exports = ErrorHandler;
