const winston = require('winston');
require('winston-daily-rotate-file');

/**
 * Sistema de logging estructurado para el módulo de producción
 */
class Logger {
    constructor() {
        this.createDirectories();
        this.setupLoggers();
    }

    createDirectories() {
        const fs = require('fs');
        const path = require('path');
        
        const logDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    setupLoggers() {
        // Logger general
        this.general = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.DailyRotateFile({
                    filename: 'logs/general-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxSize: '20m',
                    maxFiles: '14d'
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.timestamp({ format: 'HH:mm:ss' }),
                        winston.format.printf(({ timestamp, level, message, module, operation }) => {
                            const moduleStr = module ? `[${module}]` : '';
                            const operationStr = operation ? `(${operation})` : '';
                            return `${timestamp} ${level} ${moduleStr}${operationStr}: ${message}`;
                        })
                    )
                })
            ]
        });

        // Logger específico para producción
        this.produccion = winston.createLogger({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.DailyRotateFile({
                    filename: 'logs/produccion-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxSize: '20m',
                    maxFiles: '30d'
                })
            ]
        });

        // Logger para inventario
        this.inventario = winston.createLogger({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.DailyRotateFile({
                    filename: 'logs/inventario-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxSize: '20m',
                    maxFiles: '30d'
                })
            ]
        });

        // Logger para errores críticos
        this.error = winston.createLogger({
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.DailyRotateFile({
                    filename: 'logs/error-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxSize: '20m',
                    maxFiles: '90d' // Mantener errores por 3 meses
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ]
        });
    }

    /**
     * Log de información general
     */
    info(message, meta = {}) {
        this.general.info(message, { module: 'PRODUCCION', ...meta });
    }

    /**
     * Log de debug/desarrollo
     */
    debug(message, meta = {}) {
        this.general.debug(message, { module: 'PRODUCCION', ...meta });
    }

    /**
     * Log de advertencias
     */
    warn(message, meta = {}) {
        this.general.warn(message, { module: 'PRODUCCION', ...meta });
    }

    /**
     * Log de errores
     */
    error(message, error = null, meta = {}) {
        const errorData = {
            module: 'PRODUCCION',
            message: message,
            ...meta
        };

        if (error) {
            errorData.error = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        }

        this.error.error(errorData);
    }

    /**
     * Log específico para operaciones de producción
     */
    produccionLog(operation, data, user = 'sistema') {
        this.produccion.info({
            operation: operation,
            user: user,
            timestamp: new Date().toISOString(),
            data: data
        });
    }

    /**
     * Log específico para movimientos de inventario
     */
    inventarioLog(tipo, item, cantidad, operador, motivo) {
        this.inventario.info({
            tipo: tipo,
            item: item,
            cantidad: cantidad,
            operador: operador,
            motivo: motivo,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Generar correlation ID para tracking de operaciones
     */
    generateCorrelationId() {
        return `PROD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Middleware para agregar correlation ID a las requests
     */
    correlationMiddleware() {
        return (req, res, next) => {
            req.correlationId = this.generateCorrelationId();
            
            // Log de inicio de request
            this.info(`Request iniciado: ${req.method} ${req.originalUrl}`, {
                correlationId: req.correlationId,
                user: req.user?.email || 'Anónimo',
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });

            // Log de respuesta
            const originalSend = res.send;
            res.send = function(data) {
                logger.info(`Request completado: ${req.method} ${req.originalUrl}`, {
                    correlationId: req.correlationId,
                    statusCode: res.statusCode,
                    duration: Date.now() - req.startTime
                });
                originalSend.call(this, data);
            };

            req.startTime = Date.now();
            next();
        };
    }
}

// Crear instancia singleton
const logger = new Logger();

module.exports = logger;
