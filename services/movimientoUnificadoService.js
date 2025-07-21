const Ingrediente = require('../models/pruduccion/Ingrediente');
const Material = require('../models/pruduccion/Material');
const RecetaProducto = require('../models/pruduccion/RecetaProducto');
const CatalogoProduccion = require('../models/pruduccion/CatalogoProduccion');
const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');

class MovimientoUnificadoService {
    
    /**
     * Obtener todos los productos de un tipo específico
     */
    async obtenerProductosPorTipo(tipoProducto) {
        try {
            console.log('🔍 Obteniendo productos para tipo:', tipoProducto);
            
            let productos = [];
            
            switch (tipoProducto) {
                case 'ingredientes':
                    productos = await Ingrediente.find({ activo: true })
                        .populate('productoReferencia', 'nombre codigo')
                        .sort({ nombre: 1 });
                    break;
                    
                case 'materiales':
                    productos = await Material.find({ activo: true })
                        .populate('productoReferencia', 'nombre codigo')
                        .sort({ nombre: 1 });
                    break;
                    
                case 'recetas':
                    productos = await RecetaProducto.find({ activo: true })
                        .sort({ nombre: 1 });
                    break;
                    
                case 'produccion':
                    productos = await CatalogoProduccion.find({ 
                        activo: true,
                        moduloSistema: { $in: ['produccion', 'productos'] }
                    })
                        .sort({ nombre: 1 });
                    break;
                    
                default:
                    throw new Error(`Tipo de producto no válido: ${tipoProducto}`);
            }
            
            console.log(`✅ ${productos.length} productos encontrados para ${tipoProducto}`);
            return productos;
            
        } catch (error) {
            console.error('❌ Error al obtener productos por tipo:', error);
            throw new Error(`Error al obtener productos: ${error.message}`);
        }
    }
    
    /**
     * Agregar cantidad a un producto específico
     */
    async agregarCantidad(tipoProducto, productoId, cantidad, motivo, operador, precio = null, consumirIngredientes = false, ingredientesUtilizados = [], recetasUtilizadas = [], costoTotal = 0, observaciones = '') {
        try {
            console.log('📝 Agregando cantidad:', {
                tipoProducto,
                productoId,
                cantidad,
                motivo,
                operador,
                precio,
                consumirIngredientes,
                ingredientesUtilizados: ingredientesUtilizados?.length || 0,
                recetasUtilizadas: recetasUtilizadas?.length || 0,
                costoTotal,
                observaciones
            });
            
            if (!cantidad || cantidad <= 0) {
                throw new Error('La cantidad debe ser mayor a 0');
            }
            
            let producto, tipoItem, cantidadAnterior, cantidadNueva;
            
            switch (tipoProducto) {
                case 'ingredientes':
                    producto = await Ingrediente.findById(productoId);
                    if (!producto) throw new Error('Ingrediente no encontrado');
                    
                    cantidadAnterior = producto.cantidad;
                    producto.cantidad += cantidad;
                    cantidadNueva = producto.cantidad;
                    tipoItem = 'Ingrediente';
                    
                    // Actualizar precio si se proporciona
                    if (precio !== null && precio !== undefined && precio >= 0) {
                        producto.precioUnitario = precio;
                    }
                    
                    await producto.save();
                    break;
                    
                case 'materiales':
                    producto = await Material.findById(productoId);
                    if (!producto) throw new Error('Material no encontrado');
                    
                    cantidadAnterior = producto.cantidad;
                    producto.cantidad += cantidad;
                    cantidadNueva = producto.cantidad;
                    tipoItem = 'Material';
                    
                    await producto.save();
                    break;
                    
                case 'recetas':
                    producto = await RecetaProducto.findById(productoId).populate('ingredientes.ingrediente');
                    if (!producto) throw new Error('Receta no encontrada');
                    
                    // Si se debe consumir ingredientes, verificar disponibilidad y consumir
                    if (consumirIngredientes && producto.ingredientes && producto.ingredientes.length > 0) {
                        console.log(`🍳 Produciendo receta con consumo de ingredientes - Cantidad: ${cantidad}`);
                        
                        // Verificar disponibilidad
                        const faltantes = await producto.verificarDisponibilidadCompleta(cantidad);
                        if (faltantes.length > 0) {
                            throw new Error(`Ingredientes insuficientes: ${faltantes.map(f => `${f.ingrediente} (falta ${f.faltante})`).join(', ')}`);
                        }
                        
                        // Consumir ingredientes usando el método correcto del modelo
                        for (const ingredienteReceta of producto.ingredientes) {
                            const cantidadAConsumir = ingredienteReceta.cantidad * cantidad;
                            const ingrediente = ingredienteReceta.ingrediente;
                            
                            console.log(`🔻 Consumiendo ${cantidadAConsumir} de ${ingrediente.nombre}`);
                            
                            // Guardar cantidades para el movimiento
                            const disponibleAnterior = ingrediente.cantidad - ingrediente.procesado;
                            const procesadoAnterior = ingrediente.procesado;
                            
                            // Usar el método consumir() del modelo (como en recetaService)
                            const exito = await ingrediente.consumir(
                                cantidadAConsumir,
                                `Consumo para producción de receta: ${producto.nombre} (${cantidad} lote${cantidad > 1 ? 's' : ''})`,
                                operador || 'Sistema'
                            );
                            
                            if (!exito) {
                                throw new Error(`Error al consumir ingrediente ${ingrediente.nombre}`);
                            }
                            
                            await ingrediente.save();
                            
                            // Registrar movimiento de salida del ingrediente usando el método correcto
                            const disponibleNuevo = ingrediente.cantidad - ingrediente.procesado;
                            const movimientoSalida = {
                                tipo: 'salida',
                                item: ingrediente._id,
                                tipoItem: 'Ingrediente',
                                cantidad: cantidadAConsumir,
                                cantidadAnterior: disponibleAnterior,
                                cantidadNueva: disponibleNuevo,
                                motivo: `Consumo para producción de receta: ${producto.nombre} (${cantidad} lote${cantidad > 1 ? 's' : ''})`,
                                operador: operador || 'Sistema'
                            };
                            
                            console.log(`📝 Registrando movimiento de salida para ingrediente: ${ingrediente.nombre}`, {
                                disponibleAnterior,
                                disponibleNuevo,
                                procesadoAnterior,
                                procesadoNuevo: ingrediente.procesado
                            });
                            await MovimientoInventario.registrarMovimiento(movimientoSalida);
                        }
                    }
                    
                    // Agregar al inventario de la receta
                    cantidadAnterior = producto.inventario?.cantidadProducida || 0;
                    if (!producto.inventario) {
                        producto.inventario = { cantidadProducida: 0 };
                    }
                    
                    // Calcular unidades producidas considerando el rendimiento
                    const rendimientoPorLote = producto.rendimiento?.cantidad || 1;
                    const unidadesProducidas = cantidad * rendimientoPorLote;
                    
                    console.log(`📦 Produciendo ${cantidad} lote(s) × ${rendimientoPorLote} unidades/lote = ${unidadesProducidas} unidades`);
                    
                    producto.inventario.cantidadProducida += unidadesProducidas;
                    cantidadNueva = producto.inventario.cantidadProducida;
                    tipoItem = 'RecetaProducto';
                    
                    await producto.save();
                    break;
                    
                case 'produccion':
                    producto = await CatalogoProduccion.findById(productoId);
                    if (!producto) throw new Error('Producto de catálogo no encontrado');
                    
                    console.log(`🏭 Produciendo: ${producto.nombre} - Cantidad: ${cantidad}`);
                    
                    // Si hay ingredientes y recetas para consumir, procesarlos
                    if ((ingredientesUtilizados && ingredientesUtilizados.length > 0) || (recetasUtilizadas && recetasUtilizadas.length > 0)) {
                        console.log('🔍 Procesando consumo de recursos para producción...');
                        
                        // Consumir ingredientes
                        if (ingredientesUtilizados && ingredientesUtilizados.length > 0) {
                            console.log('🔍 Ingredientes a consumir:', ingredientesUtilizados);
                            
                            for (const ingredienteData of ingredientesUtilizados) {
                                console.log(`🔍 Buscando ingrediente con ID: ${ingredienteData.ingrediente}`);
                                
                                const ingrediente = await Ingrediente.findById(ingredienteData.ingrediente);
                                if (!ingrediente) {
                                    console.log('❌ Ingrediente no encontrado. Verificando en otros modelos...');
                                    
                                    // Verificar si el ID pertenece a otro modelo
                                    const catalogoItem = await CatalogoProduccion.findById(ingredienteData.ingrediente);
                                    if (catalogoItem) {
                                        console.log(`💡 El ID pertenece a un item del catálogo: ${catalogoItem.nombre} (tipo: ${catalogoItem.moduloSistema})`);
                                    }
                                    
                                    throw new Error(`Ingrediente con ID ${ingredienteData.ingrediente} no encontrado`);
                                }
                                
                                console.log(`✅ Ingrediente encontrado: ${ingrediente.nombre}`);
                                
                                const disponible = (ingrediente.cantidad || 0) - (ingrediente.procesado || 0);
                                if (ingredienteData.cantidadUtilizada > disponible) {
                                    throw new Error(`Stock insuficiente de ${ingrediente.nombre}. Disponible: ${disponible}, necesario: ${ingredienteData.cantidadUtilizada}`);
                                }
                                
                                console.log(`🔻 Consumiendo ${ingredienteData.cantidadUtilizada} de ${ingrediente.nombre}`);
                                
                                // Consumir ingrediente
                                const exito = await ingrediente.consumir(
                                    ingredienteData.cantidadUtilizada,
                                    `Consumo para producción de: ${producto.nombre} (${cantidad} unidad${cantidad > 1 ? 'es' : ''}) - ${observaciones || motivo}`,
                                    operador || 'Sistema'
                                );
                                
                                if (!exito) {
                                    throw new Error(`Error al consumir ingrediente ${ingrediente.nombre}`);
                                }
                                
                                await ingrediente.save();
                                
                                // Registrar movimiento de salida del ingrediente
                                await MovimientoInventario.registrarMovimiento({
                                    tipo: 'salida',
                                    item: ingrediente._id,
                                    tipoItem: 'Ingrediente',
                                    cantidad: ingredienteData.cantidadUtilizada,
                                    cantidadAnterior: (ingrediente.cantidad || 0) - (ingrediente.procesado || 0) + ingredienteData.cantidadUtilizada,
                                    cantidadNueva: (ingrediente.cantidad || 0) - (ingrediente.procesado || 0),
                                    motivo: `Consumo para producción: ${producto.nombre}`,
                                    operador: operador || 'Sistema'
                                });
                            }
                        }
                        
                        // Consumir recetas
                        if (recetasUtilizadas && recetasUtilizadas.length > 0) {
                            for (const recetaData of recetasUtilizadas) {
                                const receta = await RecetaProducto.findById(recetaData.receta);
                                if (!receta) {
                                    throw new Error(`Receta con ID ${recetaData.receta} no encontrada`);
                                }
                                
                                const disponible = receta.inventario?.cantidadProducida || 0;
                                if (recetaData.cantidadUtilizada > disponible) {
                                    throw new Error(`Stock insuficiente de receta ${receta.nombre}. Disponible: ${disponible}, necesario: ${recetaData.cantidadUtilizada}`);
                                }
                                
                                console.log(`🔻 Consumiendo ${recetaData.cantidadUtilizada} de receta ${receta.nombre}`);
                                
                                // Reducir stock de receta
                                if (!receta.inventario) {
                                    receta.inventario = { cantidadProducida: 0 };
                                }
                                receta.inventario.cantidadProducida -= recetaData.cantidadUtilizada;
                                
                                await receta.save();
                                
                                // Registrar movimiento de salida de la receta
                                await MovimientoInventario.registrarMovimiento({
                                    tipo: 'salida',
                                    item: receta._id,
                                    tipoItem: 'RecetaProducto',
                                    cantidad: recetaData.cantidadUtilizada,
                                    cantidadAnterior: disponible,
                                    cantidadNueva: receta.inventario.cantidadProducida,
                                    motivo: `Consumo para producción: ${producto.nombre}`,
                                    operador: operador || 'Sistema'
                                });
                            }
                        }
                    }
                    
                    cantidadAnterior = producto.cantidad || 0;
                    producto.cantidad = (producto.cantidad || 0) + cantidad;
                    cantidadNueva = producto.cantidad;
                    tipoItem = 'CatalogoProduccion';
                    
                    await producto.save();
                    
                    console.log(`✅ Producción completada: ${producto.nombre} - Stock: ${cantidadAnterior} → ${cantidadNueva}`);
                    break;
                    
                default:
                    throw new Error(`Tipo de producto no válido: ${tipoProducto}`);
            }
            
            // Registrar el movimiento
            const movimientoData = {
                tipo: 'entrada',
                item: producto._id,
                tipoItem: tipoItem,
                cantidad: tipoProducto === 'recetas' ? (cantidadNueva - cantidadAnterior) : cantidad, // Para recetas, registrar unidades reales producidas
                cantidadAnterior: cantidadAnterior,
                cantidadNueva: cantidadNueva,
                motivo: motivo || 'Entrada manual desde gestión unificada',
                operador: operador || 'Sistema'
            };

            // Agregar información adicional para recetas
            if (tipoProducto === 'recetas') {
                const rendimiento = producto.rendimiento?.cantidad || 1;
                movimientoData.observaciones = `Producción de ${cantidad} lote(s), rendimiento: ${rendimiento} unidades/lote`;
            }
            
            // Agregar información adicional para producción
            if (tipoProducto === 'produccion') {
                let detalles = [];
                if (ingredientesUtilizados && ingredientesUtilizados.length > 0) {
                    detalles.push(`Ingredientes consumidos: ${ingredientesUtilizados.length}`);
                }
                if (recetasUtilizadas && recetasUtilizadas.length > 0) {
                    detalles.push(`Recetas consumidas: ${recetasUtilizadas.length}`);
                }
                if (costoTotal > 0) {
                    detalles.push(`Costo total: S/.${costoTotal.toFixed(2)}`);
                }
                
                movimientoData.observaciones = `Producción: ${cantidad} unidad${cantidad > 1 ? 'es' : ''}. ${detalles.join(', ')}`;
                if (observaciones) {
                    movimientoData.observaciones += ` - Observaciones: ${observaciones}`;
                }
            }

            // Agregar precio al movimiento si se proporciona (para ingredientes y materiales)
            if ((tipoProducto === 'ingredientes' || tipoProducto === 'materiales') && precio !== null && precio !== undefined) {
                movimientoData.precio = precio;
            }

            const movimiento = await MovimientoInventario.registrarMovimiento(movimientoData);
            
            // Debug log específico para recetas
            if (tipoProducto === 'recetas') {
                console.log('🧪 MOVIMIENTO RECETA CREADO:', {
                    id: movimiento._id,
                    tipoItem: movimiento.tipoItem,
                    itemId: movimiento.itemId,
                    tipoMovimiento: movimiento.tipoMovimiento,
                    cantidad: movimiento.cantidad,
                    fechaCreacion: movimiento.fechaCreacion
                });
            }
            
            console.log('✅ Cantidad agregada exitosamente:', producto._id);
            
            return {
                producto,
                movimiento,
                cantidadAnterior,
                cantidadNueva,
                cantidadAgregada: cantidad
            };
            
        } catch (error) {
            console.error('❌ Error al agregar cantidad:', error);
            throw new Error(`Error al agregar cantidad: ${error.message}`);
        }
    }

    /**
     * Eliminar movimiento y revertir stock
     */
    async eliminarMovimiento(movimientoId, operador) {
        try {
            console.log('🗑️ Eliminando movimiento:', movimientoId);
            
            // Buscar el movimiento con el producto poblado
            const movimiento = await MovimientoInventario.findById(movimientoId)
                .populate('item');
                
            if (!movimiento) {
                throw new Error('Movimiento no encontrado');
            }

            // Solo permitir eliminar movimientos de entrada para evitar problemas
            if (movimiento.tipo !== 'entrada') {
                throw new Error('Solo se pueden eliminar movimientos de entrada');
            }

            const producto = movimiento.item;
            if (!producto) {
                throw new Error('Producto asociado al movimiento no encontrado');
            }

            // Revertir el stock según el tipo de producto
            switch (movimiento.tipoItem) {
                case 'Ingrediente':
                    // Para ingredientes, restar de la cantidad total
                    if (producto.cantidad < movimiento.cantidad) {
                        throw new Error(`No se puede eliminar: cantidad insuficiente. Actual: ${producto.cantidad}, a revertir: ${movimiento.cantidad}`);
                    }
                    producto.cantidad -= movimiento.cantidad;
                    await producto.save();
                    break;

                case 'Material':
                    if (producto.cantidad < movimiento.cantidad) {
                        throw new Error(`No se puede eliminar: cantidad insuficiente. Actual: ${producto.cantidad}, a revertir: ${movimiento.cantidad}`);
                    }
                    producto.cantidad -= movimiento.cantidad;
                    await producto.save();
                    break;

                case 'RecetaProducto':
                    // Para recetas, restar del inventario producido
                    if (producto.inventario.cantidadProducida < movimiento.cantidad) {
                        throw new Error(`No se puede eliminar: cantidad insuficiente. Actual: ${producto.inventario.cantidadProducida}, a revertir: ${movimiento.cantidad}`);
                    }
                    producto.inventario.cantidadProducida -= movimiento.cantidad;
                    await producto.save();
                    break;

                case 'CatalogoProduccion':
                    if ((producto.cantidad || 0) < movimiento.cantidad) {
                        throw new Error(`No se puede eliminar: cantidad insuficiente. Actual: ${producto.cantidad || 0}, a revertir: ${movimiento.cantidad}`);
                    }
                    producto.cantidad = (producto.cantidad || 0) - movimiento.cantidad;
                    await producto.save();
                    break;

                default:
                    throw new Error(`Tipo de item no reconocido: ${movimiento.tipoItem}`);
            }

            // Crear movimiento de reversión
            await MovimientoInventario.registrarMovimiento({
                tipo: 'salida',
                item: producto._id,
                tipoItem: movimiento.tipoItem,
                cantidad: movimiento.cantidad,
                cantidadAnterior: movimiento.cantidadNueva,
                cantidadNueva: movimiento.cantidadAnterior,
                motivo: `Reversión por eliminación de movimiento: ${movimiento.motivo}`,
                operador: operador,
                precio: movimiento.precio // Mantener el precio de referencia
            });

            // Eliminar el movimiento original
            await MovimientoInventario.findByIdAndDelete(movimientoId);

            console.log('✅ Movimiento eliminado y stock revertido exitosamente');

            return {
                success: true,
                message: 'Movimiento eliminado exitosamente',
                cantidadRevertida: movimiento.cantidad,
                productoAfectado: producto.nombre
            };

        } catch (error) {
            console.error('❌ Error al eliminar movimiento:', error);
            throw new Error(`Error al eliminar movimiento: ${error.message}`);
        }
    }
    
    /**
     * Obtener historial de movimientos unificado
     */
    async obtenerHistorialMovimientos(filtros = {}) {
        try {
            console.log('📊 Obteniendo historial de movimientos:', filtros);
            
            const {
                tipoProducto,
                tipoMovimiento,
                fechaInicio,
                fechaFin,
                operador,
                limite = 50,
                pagina = 1
            } = filtros;
            
            let queryFiltros = {};
            
            // Filtrar por tipo de item si se especifica tipo de producto
            if (tipoProducto) {
                const tipoItemMap = {
                    'ingredientes': 'Ingrediente',
                    'materiales': 'Material',
                    'recetas': 'RecetaProducto',
                    'produccion': 'CatalogoProduccion'
                };
                queryFiltros.tipoItem = tipoItemMap[tipoProducto];
            }
            
            // Filtrar por tipo de movimiento
            if (tipoMovimiento) {
                queryFiltros.tipo = tipoMovimiento;
            }
            
            // Filtrar por operador
            if (operador) {
                queryFiltros.operador = { $regex: operador, $options: 'i' };
            }
            
            // Filtrar por fechas
            if (fechaInicio || fechaFin) {
                queryFiltros.fecha = {};
                if (fechaInicio) queryFiltros.fecha.$gte = new Date(fechaInicio);
                if (fechaFin) queryFiltros.fecha.$lte = new Date(fechaFin);
            }
            
            const skip = (parseInt(pagina) - 1) * parseInt(limite);
            
            console.log('🔍 Query filters para historial:', queryFiltros);
            
            // Debug: Contar TODOS los movimientos sin filtros
            const totalMovimientosSinFiltro = await MovimientoInventario.countDocuments();
            console.log(`📦 Total de movimientos en la BD (sin filtros): ${totalMovimientosSinFiltro}`);
            
            // Debug: Contar movimientos con filtro de tipo
            if (queryFiltros.tipoItem) {
                const totalConFiltroTipo = await MovimientoInventario.countDocuments({ tipoItem: queryFiltros.tipoItem });
                console.log(`📦 Total de movimientos para tipoItem '${queryFiltros.tipoItem}': ${totalConFiltroTipo}`);
            }
            
            // Hacer la consulta básica
            let movimientosQuery = await MovimientoInventario.find(queryFiltros)
                .populate({
                    path: 'item',
                    select: 'nombre codigo productoReferencia unidadMedida precioUnitario'
                })
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(parseInt(limite));

            console.log(`📦 Total movimientos encontrados para query: ${movimientosQuery.length}`);
            
            // VALIDACIÓN: Asegurarnos de que movimientosQuery es un array
            if (!Array.isArray(movimientosQuery)) {
                console.error('🚨 PROBLEMA: movimientosQuery no es un array:', typeof movimientosQuery, movimientosQuery);
                throw new Error('Error interno: movimientosQuery no es un array');
            }

            // Hacer populate adicional solo para los tipos que tienen productoReferencia
            const movimientos = await Promise.all(
                movimientosQuery.map(async (movimiento) => {
                    if (movimiento.item && movimiento.item.productoReferencia && 
                        ['Ingrediente', 'Material'].includes(movimiento.tipoItem)) {
                        
                        await movimiento.populate({
                            path: 'item.productoReferencia',
                            select: 'nombre codigo'
                        });
                    }
                    return movimiento;
                })
            );
            
            const total = await MovimientoInventario.countDocuments(queryFiltros);
            
            console.log(`✅ ${movimientos.length} movimientos obtenidos de ${total} total`);
            
            // VALIDACIÓN: Asegurarnos de que movimientos es un array antes de devolverlo
            if (!Array.isArray(movimientos)) {
                console.error('🚨 PROBLEMA: movimientos no es un array antes del return:', typeof movimientos, movimientos);
                throw new Error('Error interno: movimientos no es un array');
            }
            
            if (tipoProducto === 'recetas') {
                console.log('🧪 Movimientos de recetas encontrados:', movimientos.map(m => ({
                    id: m._id,
                    tipoItem: m.tipoItem,
                    itemNombre: m.item?.nombre,
                    tipo: m.tipo,
                    cantidad: m.cantidad
                })));
            }
            
            const resultadoFinal = {
                movimientos,
                total,
                pagina: parseInt(pagina),
                totalPaginas: Math.ceil(total / parseInt(limite))
            };
            
            console.log('📋 RESULTADO FINAL DEL HISTORIAL:', {
                movimientosCount: resultadoFinal.movimientos?.length,
                movimientosType: Array.isArray(resultadoFinal.movimientos) ? 'array' : typeof resultadoFinal.movimientos,
                total: resultadoFinal.total,
                pagina: resultadoFinal.pagina
            });
            
            return resultadoFinal;
            
        } catch (error) {
            console.error('❌ Error al obtener historial:', error);
            throw new Error(`Error al obtener historial: ${error.message}`);
        }
    }
    
    /**
     * Obtener estadísticas de movimientos
     */
    async obtenerEstadisticas(filtros = {}) {
        try {
            console.log('📈 Generando estadísticas de movimientos');
            
            const { fechaInicio, fechaFin } = filtros;
            
            let queryFiltros = {};
            if (fechaInicio || fechaFin) {
                queryFiltros.fecha = {};
                if (fechaInicio) queryFiltros.fecha.$gte = new Date(fechaInicio);
                if (fechaFin) queryFiltros.fecha.$lte = new Date(fechaFin);
            }
            
            // Estadísticas por tipo de item
            const porTipoItem = await MovimientoInventario.aggregate([
                { $match: queryFiltros },
                {
                    $group: {
                        _id: '$tipoItem',
                        total: { $sum: 1 },
                        entradas: {
                            $sum: {
                                $cond: [{ $eq: ['$tipo', 'entrada'] }, 1, 0]
                            }
                        },
                        salidas: {
                            $sum: {
                                $cond: [{ $eq: ['$tipo', 'salida'] }, 1, 0]
                            }
                        }
                    }
                },
                { $sort: { total: -1 } }
            ]);
            
            // Estadísticas por tipo de movimiento
            const porTipoMovimiento = await MovimientoInventario.aggregate([
                { $match: queryFiltros },
                {
                    $group: {
                        _id: '$tipo',
                        total: { $sum: 1 },
                        cantidadTotal: { $sum: '$cantidad' }
                    }
                },
                { $sort: { total: -1 } }
            ]);
            
            // Total de movimientos
            const totalMovimientos = await MovimientoInventario.countDocuments(queryFiltros);
            
            console.log('✅ Estadísticas generadas exitosamente');
            
            return {
                totalMovimientos,
                porTipoItem,
                porTipoMovimiento
            };
            
        } catch (error) {
            console.error('❌ Error al generar estadísticas:', error);
            throw new Error(`Error al generar estadísticas: ${error.message}`);
        }
    }
    
    /**
     * Obtener detalles de un producto específico con su historial
     */
    async obtenerDetalleProducto(tipoProducto, productoId) {
        try {
            console.log('🔍 Obteniendo detalles del producto:', { tipoProducto, productoId });
            
            let producto, tipoItem;
            
            switch (tipoProducto) {
                case 'ingredientes':
                    producto = await Ingrediente.findById(productoId)
                        .populate('productoReferencia', 'nombre codigo');
                    tipoItem = 'Ingrediente';
                    break;
                    
                case 'materiales':
                    producto = await Material.findById(productoId)
                        .populate('productoReferencia', 'nombre codigo');
                    tipoItem = 'Material';
                    break;
                    
                case 'recetas':
                    producto = await RecetaProducto.findById(productoId)
                        .populate('productoReferencia', 'nombre codigo');
                    tipoItem = 'RecetaProducto';
                    break;
                    
                case 'produccion':
                    producto = await CatalogoProduccion.findById(productoId)
                        .populate('tipoProduccion', 'nombre icono');
                    tipoItem = 'CatalogoProduccion';
                    break;
                    
                default:
                    throw new Error(`Tipo de producto no válido: ${tipoProducto}`);
            }
            
            if (!producto) {
                throw new Error('Producto no encontrado');
            }
            
            // Obtener historial de movimientos del producto
            const movimientos = await MovimientoInventario.find({
                item: productoId,
                tipoItem: tipoItem
            })
                .sort({ fecha: -1 })
                .limit(20);
            
            console.log('✅ Detalles del producto obtenidos exitosamente');
            
            return {
                producto,
                movimientos
            };
            
        } catch (error) {
            console.error('❌ Error al obtener detalles del producto:', error);
            throw new Error(`Error al obtener detalles: ${error.message}`);
        }
    }
    
    /**
     * Eliminar un movimiento de inventario y revertir su efecto
     */
    async eliminarMovimiento(movimientoId, operador) {
        try {
            console.log('🗑️ Eliminando movimiento:', movimientoId);
            
            // Buscar el movimiento
            const movimiento = await MovimientoInventario.findById(movimientoId)
                .populate('item');
                
            if (!movimiento) {
                throw new Error('Movimiento no encontrado');
            }
            
            console.log('📝 Movimiento a eliminar:', {
                tipo: movimiento.tipo,
                tipoItem: movimiento.tipoItem,
                cantidad: movimiento.cantidad,
                motivo: movimiento.motivo
            });
            
            // Solo permitir eliminar movimientos de entrada manual
            if (movimiento.tipo !== 'entrada') {
                throw new Error('Solo se pueden eliminar movimientos de entrada');
            }
            
            let producto;
            
            // Revertir el efecto según el tipo de producto
            switch (movimiento.tipoItem) {
                case 'Ingrediente':
                    producto = await Ingrediente.findById(movimiento.item);
                    if (!producto) throw new Error('Ingrediente no encontrado');
                    
                    // Revertir: reducir cantidad total
                    const cantidadAnteriorIng = producto.cantidad;
                    producto.cantidad = Math.max(0, producto.cantidad - movimiento.cantidad);
                    
                    await producto.save();
                    
                    // Registrar movimiento de reversión
                    await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        item: producto._id,
                        tipoItem: 'Ingrediente',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnteriorIng,
                        cantidadNueva: producto.cantidad,
                        motivo: `Reversión por eliminación de movimiento: ${movimiento.motivo}`,
                        operador: operador || 'Sistema'
                    });
                    
                    break;
                    
                case 'Material':
                    producto = await Material.findById(movimiento.item);
                    if (!producto) throw new Error('Material no encontrado');
                    
                    // Revertir: reducir cantidad total
                    const cantidadAnteriorMat = producto.cantidad;
                    producto.cantidad = Math.max(0, producto.cantidad - movimiento.cantidad);
                    
                    await producto.save();
                    
                    // Registrar movimiento de reversión
                    await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        item: producto._id,
                        tipoItem: 'Material',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnteriorMat,
                        cantidadNueva: producto.cantidad,
                        motivo: `Reversión por eliminación de movimiento: ${movimiento.motivo}`,
                        operador: operador || 'Sistema'
                    });
                    
                    break;
                    
                case 'RecetaProducto':
                    producto = await RecetaProducto.findById(movimiento.item);
                    if (!producto) throw new Error('Receta no encontrada');
                    
                    // Revertir: reducir inventario de la receta
                    if (!producto.inventario) {
                        producto.inventario = { cantidadProducida: 0, cantidadUtilizada: 0 };
                    }
                    
                    const cantidadAnteriorRec = producto.inventario.cantidadProducida;
                    producto.inventario.cantidadProducida = Math.max(0, producto.inventario.cantidadProducida - movimiento.cantidad);
                    
                    await producto.save();
                    
                    // Registrar movimiento de reversión
                    await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        item: producto._id,
                        tipoItem: 'RecetaProducto',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnteriorRec,
                        cantidadNueva: producto.inventario.cantidadProducida,
                        motivo: `Reversión por eliminación de movimiento: ${movimiento.motivo}`,
                        operador: operador || 'Sistema'
                    });
                    
                    break;
                    
                case 'CatalogoProduccion':
                    producto = await CatalogoProduccion.findById(movimiento.item);
                    if (!producto) throw new Error('Producto de catálogo no encontrado');
                    
                    // Revertir: reducir cantidad del catálogo
                    const cantidadAnteriorCat = producto.cantidad || 0;
                    producto.cantidad = Math.max(0, (producto.cantidad || 0) - movimiento.cantidad);
                    
                    await producto.save();
                    
                    // Registrar movimiento de reversión
                    await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        item: producto._id,
                        tipoItem: 'CatalogoProduccion',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnteriorCat,
                        cantidadNueva: producto.cantidad,
                        motivo: `Reversión por eliminación de movimiento: ${movimiento.motivo}`,
                        operador: operador || 'Sistema'
                    });
                    
                    break;
                    
                default:
                    throw new Error(`Tipo de producto no válido: ${movimiento.tipoItem}`);
            }
            
            // Eliminar el movimiento original
            await MovimientoInventario.findByIdAndDelete(movimientoId);
            
            console.log('✅ Movimiento eliminado y stock revertido exitosamente');
            
            return {
                success: true,
                mensaje: 'Movimiento eliminado y stock revertido exitosamente',
                producto,
                cantidadRevertida: movimiento.cantidad
            };
            
        } catch (error) {
            console.error('❌ Error al eliminar movimiento:', error);
            throw new Error(`Error al eliminar movimiento: ${error.message}`);
        }
    }
}

module.exports = new MovimientoUnificadoService();
