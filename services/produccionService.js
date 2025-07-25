const Produccion = require('../models/produccion/Produccion');
const RecetaProducto = require('../models/produccion/RecetaProducto');
const Ingrediente = require('../models/produccion/Ingrediente');
const MovimientoInventario = require('../models/produccion/MovimientoInventario');
const CatalogoProduccion = require('../models/produccion/CatalogoProduccion');
const InventarioProducto = require('../models/produccion/InventarioProducto');
const inventarioService = require('./inventarioService');
const movimientoUnificadoService = require('./movimientoUnificadoService');

class ProduccionService {
    // Validar nombre único de producción
    async validarNombreUnico(nombre, idExcluir = null) {
        try {
            const query = { 
                nombre: { $regex: new RegExp(`^${nombre.trim()}$`, 'i') },
                estado: { $ne: 'cancelada' } // Excluir producciones canceladas
            };
            
            if (idExcluir) {
                query._id = { $ne: idExcluir };
            }
            
            const produccionExistente = await Produccion.findOne(query);
            return !produccionExistente;
        } catch (error) {
            throw new Error(`Error al validar nombre: ${error.message}`);
        }
    }

    // Verificar si un nombre de producción está disponible
    async verificarNombreDisponible(nombre, idExcluir = null) {
        try {
            return await this.validarNombreUnico(nombre, idExcluir);
        } catch (error) {
            throw new Error(`Error al verificar nombre: ${error.message}`);
        }
    }

    // Crear nueva producción desde receta
    async crearProduccionDesdeReceta(recetaId, cantidadAPrducir, operador, observaciones = '') {
        try {
            const receta = await RecetaProducto.findById(recetaId)
                .populate('ingredientes.ingrediente');

            if (!receta) {
                throw new Error('Receta no encontrada');
            }

            // Validar que no exista una producción con el mismo nombre
            const nombreEsUnico = await this.validarNombreUnico(receta.nombre);
            if (!nombreEsUnico) {
                throw new Error(`Ya existe una producción activa con el nombre "${receta.nombre}". Por favor, use un nombre diferente o complete/cancele la producción existente.`);
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
            const { ingredientesUtilizados = [], recetasUtilizadas = [], ...otrosDatos } = datosProduccion;
            
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
            
            // Validar que no exista una producción con el mismo nombre
            const nombreEsUnico = await this.validarNombreUnico(otrosDatos.nombre);
            if (!nombreEsUnico) {
                throw new Error(`Ya existe una producción activa con el nombre "${otrosDatos.nombre}". Por favor, use un nombre diferente o complete/cancele la producción existente.`);
            }
            
            // Mapear ingredientes para verificación
            const ingredientesParaVerificar = ingredientesUtilizados.map(item => {
                const cantidad = item.cantidadUtilizada || item.cantidad || 0;
                return {
                    ingrediente: item.ingrediente,
                    cantidad: cantidad
                };
            });
            
            // Mapear recetas para verificación
            const recetasParaVerificar = recetasUtilizadas.map(item => {
                const cantidad = item.cantidadUtilizada || item.cantidad || 0;
                return {
                    receta: item.receta,
                    cantidad: cantidad
                };
            });
            
            // Verificar disponibilidad completa usando el servicio de inventario
            const verificacion = await inventarioService.verificarDisponibilidadCompleta(
                ingredientesParaVerificar, 
                recetasParaVerificar
            );
            
            if (!verificacion.disponible) {
                throw new Error(`Inventario insuficiente: ${verificacion.problemas.join(', ')}`);
            }

            const produccion = new Produccion({
                ...otrosDatos,
                ingredientesUtilizados,
                recetasUtilizadas,
                tipo: 'manual',
                estado: 'planificada'
            });

            await produccion.save();
            
            // Actualizar inventarios usando el servicio
            await inventarioService.procesarProduccion(
                ingredientesParaVerificar, 
                recetasParaVerificar,
                produccion._id, 
                otrosDatos.operador || 'sistema'
            );
            
            // Marcar como completada
            produccion.estado = 'completada';
            await produccion.save();
            
            await produccion.calcularCosto();

            // Registrar el producto final en el inventario
            await movimientoUnificadoService.registrarProductoProducido(
                otrosDatos.nombre,
                otrosDatos.cantidadProducida,
                otrosDatos.unidadMedida,
                produccion.costoTotal || otrosDatos.costoTotal || 0,
                produccion._id,
                otrosDatos.operador,
                ingredientesUtilizados,
                recetasUtilizadas,
                otrosDatos.observaciones || ''
            );

            const produccionCompleta = await produccion.populate([
                'ingredientesUtilizados.ingrediente',
                'recetasUtilizadas.receta'
            ]);

            return produccionCompleta;
        } catch (error) {
            console.error('❌ Error en crearProduccionManual:', error.message);
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

            // Calcular costo
            await produccion.calcularCosto();

            // Registrar el producto final en el inventario
            const ingredientesParaHistorial = produccion.ingredientesUtilizados?.map(item => ({
                nombre: item.ingrediente?.nombre || 'N/A',
                cantidad: item.cantidadUtilizada || item.cantidad || 0,
                costo: 0
            })) || [];

            const recetasParaHistorial = produccion.recetasUtilizadas?.map(item => ({
                nombre: item.receta?.nombre || 'N/A',
                cantidad: item.cantidadUtilizada || item.cantidad || 0,
                costo: 0
            })) || [];

            await movimientoUnificadoService.registrarProductoProducido(
                produccion.nombre,
                produccion.cantidadProducida,
                produccion.unidadMedida,
                produccion.costoTotal || 0,
                produccion._id,
                operador,
                ingredientesParaHistorial,
                recetasParaHistorial,
                produccion.observaciones || ''
            );

            return produccion;
        } catch (error) {
            throw new Error(`Error al ejecutar producción: ${error.message}`);
        }
    }

    // Obtener todas las producciones
    async obtenerProducciones(filtros = {}, limite = 50, pagina = 1) {
        try {
            const skip = (pagina - 1) * limite;
            
            // Pipeline simplificado que usa los datos directos de producción
            const pipeline = [
                { $match: filtros },
                { $sort: { fechaProduccion: -1 } },
                { $skip: skip },
                { $limit: limite },
                
                // Lookup para obtener datos del catálogo PRIMERO
                {
                    $lookup: {
                        from: 'catalogoproduccions',
                        let: { nombreProduccion: '$nombre' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$nombre', '$$nombreProduccion'] },
                                            { $eq: ['$moduloSistema', 'produccion'] },
                                            { $eq: ['$activo', true] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: 'catalogoInfo'
                    }
                },
                
                // Lookup para popular receta si existe
                {
                    $lookup: {
                        from: 'recetaproductos',
                        localField: 'receta',
                        foreignField: '_id',
                        as: 'receta'
                    }
                },
                
                // Lookup para popular ingredientes en items
                {
                    $lookup: {
                        from: 'ingredientes',
                        localField: 'items.ingrediente',
                        foreignField: '_id',
                        as: 'ingredientesInfo'
                    }
                },

                // Lookup para popular recetas en recetasUtilizadas
                {
                    $lookup: {
                        from: 'recetaproductos',
                        localField: 'recetasUtilizadas.receta',
                        foreignField: '_id',
                        as: 'recetasUtilizadasInfo'
                    }
                },

                // Lookup para popular ingredientes en ingredientesUtilizados
                {
                    $lookup: {
                        from: 'ingredientes',
                        localField: 'ingredientesUtilizados.ingrediente',
                        foreignField: '_id',
                        as: 'ingredientesUtilizadosInfo'
                    }
                },
                
                // Proyección final para agregar campos calculados
                {
                    $addFields: {
                        stockActual: 0,
                        cantidadProducidaOriginal: '$cantidadProducida',
                        receta: { $arrayElemAt: ['$receta', 0] },
                        // Mejorar la información de items con datos de ingredientes
                        items: {
                            $map: {
                                input: '$items',
                                as: 'item',
                                in: {
                                    ingrediente: {
                                        $arrayElemAt: [
                                            {
                                                $filter: {
                                                    input: '$ingredientesInfo',
                                                    cond: { $eq: ['$$this._id', '$$item.ingrediente'] }
                                                }
                                            },
                                            0
                                        ]
                                    },
                                    cantidadUtilizada: '$$item.cantidadUtilizada'
                                }
                            }
                        },
                        // Mapear recetas utilizadas con información completa
                        recetasUtilizadas: {
                            $map: {
                                input: { $ifNull: ['$recetasUtilizadas', []] },
                                as: 'recetaItem',
                                in: {
                                    receta: {
                                        $arrayElemAt: [
                                            {
                                                $filter: {
                                                    input: '$recetasUtilizadasInfo',
                                                    cond: { $eq: ['$$this._id', '$$recetaItem.receta'] }
                                                }
                                            },
                                            0
                                        ]
                                    },
                                    cantidadUtilizada: '$$recetaItem.cantidadUtilizada',
                                    costoUnitario: '$$recetaItem.costoUnitario'
                                }
                            }
                        },
                        // Mapear ingredientes utilizados con información completa
                        ingredientesUtilizados: {
                            $map: {
                                input: { $ifNull: ['$ingredientesUtilizados', []] },
                                as: 'ingredienteItem',
                                in: {
                                    ingrediente: {
                                        $arrayElemAt: [
                                            {
                                                $filter: {
                                                    input: '$ingredientesUtilizadosInfo',
                                                    cond: { $eq: ['$$this._id', '$$ingredienteItem.ingrediente'] }
                                                }
                                            },
                                            0
                                        ]
                                    },
                                    cantidadUtilizada: '$$ingredienteItem.cantidadUtilizada',
                                    costoUnitario: '$$ingredienteItem.costoUnitario',
                                    unidadMedida: '$$ingredienteItem.unidadMedida'
                                }
                            }
                        }
                    }
                }
            ];
            
            // Ejecutar aggregation pipeline optimizado
            const producciones = await Produccion.aggregate(pipeline);
            
            // Agregar stock manualmente después del pipeline
            for (let produccion of producciones) {
                if (produccion.catalogoInfo && produccion.catalogoInfo.length > 0) {
                    const catalogoId = produccion.catalogoInfo[0]._id;
                    
                    // Buscar inventario usando el catalogoId
                    const inventario = await InventarioProducto.findOne({
                        catalogoProductoId: catalogoId
                    });
                    
                    if (inventario) {
                        produccion.stockActual = inventario.stock || inventario.cantidad || 0;
                    }
                }
            }
            
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

    // Obtener producciones agrupadas por producto con cantidades acumulativas
    async obtenerProduccionesAgrupadas(filtros = {}, limite = 50, pagina = 1) {
        try {
            // Pipeline para agrupar por producto y sumar cantidades
            const pipeline = [
                { $match: filtros },
                
                // Agrupar por nombre de producto
                {
                    $group: {
                        _id: '$nombre',
                        cantidadProducida: { $sum: '$cantidadProducida' },
                        costoTotal: { $sum: '$costoTotal' },
                        ultimaProduccion: { $max: '$fechaProduccion' },
                        totalProducciones: { $sum: 1 },
                        estados: { $addToSet: '$estado' },
                        operadores: { $addToSet: '$operador' },
                        // Mantener datos del primer documento para referencia
                        primerDocumento: { $first: '$$ROOT' }
                    }
                },
                
                // Agregar lookup para obtener datos del catálogo
                {
                    $lookup: {
                        from: 'catalogoproduccions',
                        let: { nombreProducto: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$nombre', '$$nombreProducto'] },
                                            { $eq: ['$moduloSistema', 'produccion'] },
                                            { $eq: ['$activo', true] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: 'catalogoInfo'
                    }
                },
                
                // Proyección final
                {
                    $project: {
                        _id: '$primerDocumento._id',
                        nombre: '$_id',
                        cantidadProducida: 1,
                        costoTotal: 1,
                        fechaProduccion: '$ultimaProduccion',
                        totalProducciones: 1,
                        estado: {
                            $cond: {
                                if: { $in: ['en_proceso', '$estados'] },
                                then: 'en_proceso',
                                else: {
                                    $cond: {
                                        if: { $in: ['planificada', '$estados'] },
                                        then: 'planificada',
                                        else: 'completada'
                                    }
                                }
                            }
                        },
                        operador: { $arrayElemAt: ['$operadores', 0] },
                        unidadMedida: '$primerDocumento.unidadMedida',
                        catalogoInfo: 1,
                        // Campos adicionales para compatibilidad
                        receta: '$primerDocumento.receta',
                        items: '$primerDocumento.items',
                        ingredientesUtilizados: '$primerDocumento.ingredientesUtilizados',
                        recetasUtilizadas: '$primerDocumento.recetasUtilizadas'
                    }
                },
                
                // Ordenar por fecha de última producción
                { $sort: { fechaProduccion: -1 } },
                
                // Paginación
                { $skip: (pagina - 1) * limite },
                { $limit: limite }
            ];
            
            // Ejecutar aggregation pipeline
            const produccionesAgrupadas = await Produccion.aggregate(pipeline);
            
            // Contar total de grupos (productos únicos)
            const totalPipeline = [
                { $match: filtros },
                { $group: { _id: '$nombre' } },
                { $count: 'total' }
            ];
            
            const totalResult = await Produccion.aggregate(totalPipeline);
            const total = totalResult.length > 0 ? totalResult[0].total : 0;

            return {
                producciones: produccionesAgrupadas,
                total,
                pagina,
                totalPaginas: Math.ceil(total / limite)
            };
        } catch (error) {
            throw new Error(`Error al obtener producciones agrupadas: ${error.message}`);
        }
    }

    // Obtener producción por ID
    async obtenerProduccionPorId(id) {
        try {
            const produccion = await Produccion.findById(id)
                .populate([
                    'receta',
                    'items.ingrediente',
                    'recetasUtilizadas.receta',
                    'ingredientesUtilizados.ingrediente'
                ]);

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
            const produccion = await Produccion.findById(id);

            if (!produccion) {
                throw new Error('Producción no encontrada');
            }

            // Si la producción está completada, necesitamos revertir el inventario
            if (produccion.estado === 'completada') {
                // Revertir stock del producto en InventarioProducto
                try {
                    // Buscar el producto en el catálogo
                    const productoCatalogo = await CatalogoProduccion.findOne({
                        nombre: produccion.nombre,
                        moduloSistema: 'produccion',
                        activo: true
                    });
                    
                    if (productoCatalogo) {
                        // Buscar el item en inventario
                        const inventarioItem = await InventarioProducto.findOne({
                            catalogoProductoId: productoCatalogo._id
                        });
                        
                        if (inventarioItem) {
                            const cantidadARestar = produccion.cantidadProducida || 0;
                            
                            // Usar el método del modelo para revertir el stock
                            const resultado = inventarioItem.actualizarStock(cantidadARestar, 'restar');
                            
                            await inventarioItem.save();
                            
                            // Registrar el movimiento de reversión
                            const movimientoReversion = await MovimientoInventario.registrarMovimiento({
                                tipo: 'salida',
                                item: productoCatalogo._id,
                                tipoItem: 'CatalogoProduccion',
                                cantidad: cantidadARestar,
                                cantidadAnterior: resultado.cantidadAnterior,
                                cantidadNueva: resultado.cantidadNueva,
                                motivo: `Reversión por eliminación de producción: ${produccion.nombre} - ID: ${produccion._id}`,
                                operador: 'Sistema'
                            });
                        }
                    }
                } catch (stockError) {
                    console.error('❌ Error al revertir stock del producto:', stockError);
                    throw new Error(`Error al revertir stock: ${stockError.message}`);
                }
                
                // Poblar datos antes de procesar (con manejo de errores para referencias huérfanas)
                try {
                    await produccion.populate([
                        'ingredientesUtilizados.ingrediente',
                        'recetasUtilizadas.receta',
                        'items.ingrediente'
                    ]);
                } catch (populateError) {
                    console.warn('⚠️ Error al poblar referencias, continuando con datos disponibles:', populateError.message);
                    // Continuar sin poblar si hay referencias huérfanas
                }
                
                // Mapear ingredientes para revertir (compatible con estructura antigua y nueva)
                const ingredientesParaRevertir = [];
                
                // Estructura nueva: ingredientesUtilizados (PRIORIDAD)
                if (produccion.ingredientesUtilizados && produccion.ingredientesUtilizados.length > 0) {
                    for (const item of produccion.ingredientesUtilizados) {
                        // Verificar que el ingrediente existe y no es huérfano
                        if (item.ingrediente && item.ingrediente._id) {
                            ingredientesParaRevertir.push({
                                ingrediente: item.ingrediente._id,
                                cantidadUtilizada: item.cantidadUtilizada || 0
                            });
                        } else {
                            console.warn(`⚠️ Ingrediente huérfano encontrado en producción ${produccion._id}:`, item);
                        }
                    }
                }
                // Estructura antigua: items (solo si no hay ingredientesUtilizados)
                else if (produccion.items && produccion.items.length > 0) {
                    for (const item of produccion.items) {
                        // Verificar que el ingrediente existe y no es huérfano
                        if (item.ingrediente && item.ingrediente._id) {
                            ingredientesParaRevertir.push({
                                ingrediente: item.ingrediente._id,
                                cantidadUtilizada: item.cantidadUtilizada || 0
                            });
                        } else {
                            console.warn(`⚠️ Ingrediente huérfano encontrado en items de producción ${produccion._id}:`, item);
                        }
                    }
                }
                
                // Mapear recetas para revertir
                const recetasParaRevertir = [];
                if (produccion.recetasUtilizadas && produccion.recetasUtilizadas.length > 0) {
                    for (const item of produccion.recetasUtilizadas) {
                        // Verificar que la receta existe y no es huérfana
                        if (item.receta && item.receta._id) {
                            recetasParaRevertir.push({
                                receta: item.receta._id,
                                cantidadUtilizada: item.cantidadUtilizada || 0
                            });
                        } else {
                            console.warn(`⚠️ Receta huérfana encontrada en producción ${produccion._id}:`, item);
                        }
                    }
                }
                
                // Solo revertir si hay algo que revertir
                if (ingredientesParaRevertir.length > 0 || recetasParaRevertir.length > 0) {
                    // Revertir inventario usando el servicio
                    const resultadoReversion = await inventarioService.revertirProduccion(
                        ingredientesParaRevertir,
                        recetasParaRevertir,
                        produccion._id,
                        'sistema'
                    );
                }
            }

            await Produccion.findByIdAndDelete(id);
            
            return { 
                message: 'Producción eliminada exitosamente',
                inventarioRevertido: produccion.estado === 'completada',
                nombreProducto: produccion.nombre,
                cantidadRevertida: produccion.estado === 'completada' ? (produccion.cantidadProducida || 0) : 0
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

    // 🧹 UTILIDAD: Limpiar datos huérfanos en producciones
    async limpiarDatosHuerfanos() {
        try {
            console.log('🧹 Iniciando limpieza de datos huérfanos en producciones...');
            
            // Obtener todas las producciones
            const producciones = await Produccion.find({});
            let produccionesCorregidas = 0;
            let ingredientesHuerfanosLimpiados = 0;
            let recetasHuerfanasLimpiadas = 0;

            for (const produccion of producciones) {
                let produccionModificada = false;

                // Verificar ingredientesUtilizados
                if (produccion.ingredientesUtilizados && produccion.ingredientesUtilizados.length > 0) {
                    const ingredientesOriginales = produccion.ingredientesUtilizados.length;
                    produccion.ingredientesUtilizados = produccion.ingredientesUtilizados.filter(item => {
                        return item.ingrediente && item.ingrediente.toString().length === 24; // ObjectId válido
                    });
                    
                    const ingredientesLimpiados = ingredientesOriginales - produccion.ingredientesUtilizados.length;
                    if (ingredientesLimpiados > 0) {
                        ingredientesHuerfanosLimpiados += ingredientesLimpiados;
                        produccionModificada = true;
                        console.log(`🧹 Limpiados ${ingredientesLimpiados} ingredientes huérfanos en producción ${produccion._id}`);
                    }
                }

                // Verificar items (estructura antigua)
                if (produccion.items && produccion.items.length > 0) {
                    const itemsOriginales = produccion.items.length;
                    produccion.items = produccion.items.filter(item => {
                        return item.ingrediente && item.ingrediente.toString().length === 24; // ObjectId válido
                    });
                    
                    const itemsLimpiados = itemsOriginales - produccion.items.length;
                    if (itemsLimpiados > 0) {
                        ingredientesHuerfanosLimpiados += itemsLimpiados;
                        produccionModificada = true;
                        console.log(`🧹 Limpiados ${itemsLimpiados} items huérfanos en producción ${produccion._id}`);
                    }
                }

                // Verificar recetasUtilizadas
                if (produccion.recetasUtilizadas && produccion.recetasUtilizadas.length > 0) {
                    const recetasOriginales = produccion.recetasUtilizadas.length;
                    produccion.recetasUtilizadas = produccion.recetasUtilizadas.filter(item => {
                        return item.receta && item.receta.toString().length === 24; // ObjectId válido
                    });
                    
                    const recetasLimpiadas = recetasOriginales - produccion.recetasUtilizadas.length;
                    if (recetasLimpiadas > 0) {
                        recetasHuerfanasLimpiadas += recetasLimpiadas;
                        produccionModificada = true;
                        console.log(`🧹 Limpiadas ${recetasLimpiadas} recetas huérfanas en producción ${produccion._id}`);
                    }
                }

                // Guardar si se modificó
                if (produccionModificada) {
                    await produccion.save();
                    produccionesCorregidas++;
                }
            }

            const resumen = {
                produccionesRevisadas: producciones.length,
                produccionesCorregidas,
                ingredientesHuerfanosLimpiados,
                recetasHuerfanasLimpiadas
            };

            console.log('✅ Limpieza de datos huérfanos completada:', resumen);
            return resumen;

        } catch (error) {
            console.error('❌ Error en limpieza de datos huérfanos:', error);
            throw new Error(`Error en limpieza: ${error.message}`);
        }
    }
}

module.exports = new ProduccionService();
