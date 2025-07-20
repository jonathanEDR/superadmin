const Produccion = require('../models/pruduccion/Produccion');
const RecetaProducto = require('../models/pruduccion/RecetaProducto');
const Ingrediente = require('../models/pruduccion/Ingrediente');
const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');
const inventarioService = require('./inventarioService');

class ProduccionService {
    // Crear nueva producción desde receta
    async crearProduccionDesdeReceta(recetaId, cantidadAPrducir, operador, observaciones = '') {
        try {
            const receta = await RecetaProducto.findById(recetaId)
                .populate('ingredientes.ingrediente');

            if (!receta) {
                throw new Error('Receta no encontrada');
            }

            // Verificar disponibilidad de ingredientes
            const verificacion = await receta.verificarDisponibilidadCompleta(cantidadAPrducir);
            if (!verificacion.disponible) {
                throw new Error(`Ingredientes insuficientes: ${JSON.stringify(verificacion.faltantes)}`);
            }

            // Crear items de producción basados en la receta
            const items = receta.ingredientes.map(item => ({
                ingrediente: item.ingrediente._id,
                cantidadUtilizada: item.cantidad * cantidadAPrducir
            }));

            // Mapear ingredientes para el servicio de inventario
            const ingredientesUtilizados = receta.ingredientes.map(item => ({
                ingrediente: item.ingrediente._id,
                cantidad: item.cantidad * cantidadAPrducir
            }));

            const produccion = new Produccion({
                nombre: receta.nombre,
                receta: recetaId,
                items,
                cantidadProducida: cantidadAPrducir * receta.rendimiento.cantidad,
                unidadMedida: receta.rendimiento.unidadMedida,
                operador,
                observaciones,
                tipo: 'receta'
            });

            await produccion.save();
            
            // Actualizar inventarios usando el servicio
            await inventarioService.procesarProduccion(
                ingredientesUtilizados, 
                [], // No se usan recetas en este caso
                produccion._id, 
                operador
            );
            
            // Agregar la receta producida al inventario
            await receta.agregarAlInventario(cantidadAPrducir, `Producción ${produccion._id}`);
            
            await produccion.calcularCosto();

            return await produccion.populate(['receta', 'items.ingrediente']);
        } catch (error) {
            throw new Error(`Error al crear producción: ${error.message}`);
        }
    }

    // Crear producción manual
    async crearProduccionManual(datosProduccion) {
        try {
            console.log('📥 Datos recibidos en crearProduccionManual:', JSON.stringify(datosProduccion, null, 2));
            
            const { ingredientesUtilizados = [], recetasUtilizadas = [], ...otrosDatos } = datosProduccion;
            
            console.log('🔍 Ingredientes utilizados:', ingredientesUtilizados);
            console.log('🔍 Recetas utilizadas:', recetasUtilizadas);
            console.log('🔍 Otros datos:', otrosDatos);
            
            // Validar campos requeridos
            if (!otrosDatos.nombre || otrosDatos.nombre.trim() === '') {
                throw new Error('El nombre de la producción es requerido');
            }
            
            if (!otrosDatos.cantidadProducida || otrosDatos.cantidadProducida <= 0) {
                throw new Error('La cantidad producida debe ser mayor a 0');
            }
            
            if (!otrosDatos.unidadMedida || otrosDatos.unidadMedida.trim() === '') {
                throw new Error('La unidad de medida es requerida');
            }
            
            if (!otrosDatos.operador || otrosDatos.operador.trim() === '') {
                throw new Error('El operador es requerido');
            }
            
            // Mapear ingredientes para verificación
            const ingredientesParaVerificar = ingredientesUtilizados.map(item => {
                console.log('🧩 Mapeando ingrediente:', item);
                const cantidad = item.cantidadUtilizada || item.cantidad || 0;
                console.log('📊 Cantidad mapeada:', cantidad);
                return {
                    ingrediente: item.ingrediente,
                    cantidad: cantidad
                };
            });
            
            // Mapear recetas para verificación
            const recetasParaVerificar = recetasUtilizadas.map(item => {
                console.log('🍳 Mapeando receta:', item);
                const cantidad = item.cantidadUtilizada || item.cantidad || 0;
                console.log('📊 Cantidad mapeada:', cantidad);
                return {
                    receta: item.receta,
                    cantidad: cantidad
                };
            });
            
            console.log('✅ Ingredientes para verificar:', ingredientesParaVerificar);
            console.log('✅ Recetas para verificar:', recetasParaVerificar);
            
            // Verificar disponibilidad completa usando el servicio de inventario
            console.log('🔍 Iniciando verificación de disponibilidad...');
            const verificacion = await inventarioService.verificarDisponibilidadCompleta(
                ingredientesParaVerificar, 
                recetasParaVerificar
            );
            
            console.log('📋 Resultado de verificación:', verificacion);
            
            if (!verificacion.disponible) {
                console.log('❌ Inventario insuficiente:', verificacion.problemas);
                throw new Error(`Inventario insuficiente: ${verificacion.problemas.join(', ')}`);
            }

            console.log('💾 Creando producción...');
            const produccion = new Produccion({
                ...otrosDatos,
                ingredientesUtilizados,
                recetasUtilizadas,
                tipo: 'manual',
                estado: 'planificada'
            });

            console.log('💾 Guardando producción...');
            await produccion.save();
            console.log('✅ Producción guardada:', produccion._id);
            
            // Actualizar inventarios usando el servicio
            console.log('📦 Procesando inventarios...');
            await inventarioService.procesarProduccion(
                ingredientesParaVerificar, 
                recetasParaVerificar,
                produccion._id, 
                otrosDatos.operador || 'sistema'
            );
            console.log('✅ Inventarios actualizados');
            
            // Marcar como completada
            console.log('✅ Marcando como completada...');
            produccion.estado = 'completada';
            await produccion.save();
            console.log('✅ Producción completada');
            
            console.log('💰 Calculando costo...');
            await produccion.calcularCosto();
            console.log('✅ Costo calculado');

            console.log('🔄 Populando datos...');
            const produccionCompleta = await produccion.populate([
                'ingredientesUtilizados.ingrediente',
                'recetasUtilizadas.receta'
            ]);
            console.log('✅ Producción manual creada exitosamente:', produccionCompleta._id);

            return produccionCompleta;
        } catch (error) {
            console.error('❌ Error en crearProduccionManual:', error.message);
            console.error('📍 Stack trace:', error.stack);
            throw new Error(`Error al crear producción manual: ${error.message}`);
        }
    }

    // Ejecutar producción
    async ejecutarProduccion(id, operador) {
        try {
            const produccion = await Produccion.findById(id)
                .populate(['items.ingrediente', 'receta']);

            if (!produccion) {
                throw new Error('Producción no encontrada');
            }

            if (produccion.estado !== 'planificada') {
                throw new Error('Solo se pueden ejecutar producciones planificadas');
            }

            // Si es una producción basada en receta (items)
            if (produccion.items && produccion.items.length > 0) {
                // Mapear items para el servicio de inventario
                const ingredientesUtilizados = produccion.items.map(item => ({
                    ingrediente: item.ingrediente._id,
                    cantidad: item.cantidadUtilizada
                }));

                // Actualizar inventarios
                await inventarioService.procesarProduccion(
                    ingredientesUtilizados,
                    [],
                    produccion._id,
                    operador
                );
                
                // Si hay una receta asociada, agregar al inventario
                if (produccion.receta) {
                    const cantidadProducida = Math.floor(produccion.cantidadProducida / produccion.receta.rendimiento.cantidad);
                    await produccion.receta.agregarAlInventario(cantidadProducida, `Producción ${produccion._id}`);
                }
            }

            // Marcar como completada
            produccion.estado = 'completada';
            await produccion.save();

            return produccion;
        } catch (error) {
            throw new Error(`Error al ejecutar producción: ${error.message}`);
        }
    }

    // Obtener todas las producciones
    async obtenerProducciones(filtros = {}, limite = 50, pagina = 1) {
        try {
            const skip = (pagina - 1) * limite;
            
            const producciones = await Produccion.find(filtros)
                .populate(['receta', 'items.ingrediente'])
                .sort({ fechaProduccion: -1 })
                .skip(skip)
                .limit(limite);

            const total = await Produccion.countDocuments(filtros);

            return {
                producciones,
                total,
                pagina,
                totalPaginas: Math.ceil(total / limite)
            };
        } catch (error) {
            throw new Error(`Error al obtener producciones: ${error.message}`);
        }
    }

    // Obtener producción por ID
    async obtenerProduccionPorId(id) {
        try {
            const produccion = await Produccion.findById(id)
                .populate(['receta', 'items.ingrediente']);

            if (!produccion) {
                throw new Error('Producción no encontrada');
            }

            return produccion;
        } catch (error) {
            throw new Error(`Error al obtener producción: ${error.message}`);
        }
    }

    // Cancelar producción
    async cancelarProduccion(id, motivo, operador) {
        try {
            const produccion = await Produccion.findById(id);

            if (!produccion) {
                throw new Error('Producción no encontrada');
            }

            if (produccion.estado === 'completada') {
                throw new Error('No se puede cancelar una producción completada');
            }

            produccion.estado = 'cancelada';
            produccion.observaciones = `${produccion.observaciones || ''} | Cancelada: ${motivo}`;
            await produccion.save();

            return produccion;
        } catch (error) {
            throw new Error(`Error al cancelar producción: ${error.message}`);
        }
    }

    // Obtener reportes de producción
    async obtenerReporteProduccion(fechaInicio, fechaFin) {
        try {
            const filtros = {
                fechaProduccion: {
                    $gte: new Date(fechaInicio),
                    $lte: new Date(fechaFin)
                }
            };

            const producciones = await Produccion.find(filtros)
                .populate(['receta', 'items.ingrediente']);

            const resumen = {
                totalProducciones: producciones.length,
                produccionesCompletadas: producciones.filter(p => p.estado === 'completada').length,
                produccionesCanceladas: producciones.filter(p => p.estado === 'cancelada').length,
                costoTotal: producciones.reduce((sum, p) => sum + p.costoTotal, 0),
                productosMasProducidos: this.calcularProductosMasProducidos(producciones)
            };

            return {
                resumen,
                producciones
            };
        } catch (error) {
            throw new Error(`Error al obtener reporte: ${error.message}`);
        }
    }

    // Eliminar producción
    async eliminarProduccion(id) {
        try {
            console.log('🗑️ Eliminando producción:', id);
            
            const produccion = await Produccion.findById(id);

            if (!produccion) {
                throw new Error('Producción no encontrada');
            }

            console.log(`📋 Producción a eliminar: "${produccion.nombre}" - Estado: ${produccion.estado}`);

            // Si la producción está completada, necesitamos revertir el inventario
            if (produccion.estado === 'completada') {
                console.log('⚠️ Producción completada - revirtiendo inventario...');
                
                // Mapear ingredientes para revertir (compatible con estructura antigua y nueva)
                const ingredientesParaRevertir = [];
                
                // Estructura nueva: ingredientesUtilizados
                if (produccion.ingredientesUtilizados && produccion.ingredientesUtilizados.length > 0) {
                    ingredientesParaRevertir.push(...produccion.ingredientesUtilizados.map(item => ({
                        ingrediente: item.ingrediente,
                        cantidadUtilizada: item.cantidadUtilizada || 0
                    })));
                }
                
                // Estructura antigua: items (para compatibilidad)
                if (produccion.items && produccion.items.length > 0) {
                    ingredientesParaRevertir.push(...produccion.items.map(item => ({
                        ingrediente: item.ingrediente,
                        cantidadUtilizada: item.cantidadUtilizada || 0
                    })));
                }
                
                // Mapear recetas para revertir
                const recetasParaRevertir = (produccion.recetasUtilizadas || []).map(item => ({
                    receta: item.receta,
                    cantidadUtilizada: item.cantidadUtilizada || 0
                }));
                
                console.log('📦 Ingredientes a revertir:', ingredientesParaRevertir);
                console.log('🍳 Recetas a revertir:', recetasParaRevertir);
                
                // Solo revertir si hay algo que revertir
                if (ingredientesParaRevertir.length > 0 || recetasParaRevertir.length > 0) {
                    // Revertir inventario usando el servicio
                    await inventarioService.revertirProduccion(
                        ingredientesParaRevertir,
                        recetasParaRevertir,
                        produccion._id,
                        'sistema'
                    );
                    
                    console.log('✅ Inventario revertido exitosamente');
                } else {
                    console.log('ℹ️ No hay ingredientes o recetas que revertir');
                }
            }

            await Produccion.findByIdAndDelete(id);
            
            console.log(`✅ Producción "${produccion.nombre}" eliminada exitosamente`);
            return { 
                message: 'Producción eliminada exitosamente',
                inventarioRevertido: produccion.estado === 'completada'
            };
        } catch (error) {
            console.error('❌ Error al eliminar producción:', error);
            throw new Error(`Error al eliminar producción: ${error.message}`);
        }
    }

    // Método auxiliar para calcular productos más producidos
    calcularProductosMasProducidos(producciones) {
        const conteo = {};
        
        producciones.forEach(produccion => {
            if (produccion.estado === 'completada') {
                const nombre = produccion.nombre;
                conteo[nombre] = (conteo[nombre] || 0) + produccion.cantidadProducida;
            }
        });

        return Object.entries(conteo)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([nombre, cantidad]) => ({ nombre, cantidad }));
    }
}

module.exports = new ProduccionService();
