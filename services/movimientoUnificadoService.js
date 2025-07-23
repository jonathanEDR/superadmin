const mongoose = require('mongoose');
const Ingrediente = require('../models/produccion/Ingrediente');
const Material = require('../models/produccion/Material');
const RecetaProducto = require('../models/produccion/RecetaProducto');
const CatalogoProduccion = require('../models/produccion/CatalogoProduccion');
const MovimientoInventario = require('../models/produccion/MovimientoInventario');
const InventarioProducto = require('../models/produccion/InventarioProducto');
const Produccion = require('../models/produccion/Produccion');

class MovimientoUnificadoService {
    
    /**
     * Sincronizar CatalogoProduccion con InventarioProducto
     * Solo incluye productos que tienen producciones completadas
     */
    async sincronizarInventarioProduccion() {
        try {
            // Obtener productos que tienen producciones completadas
            const produccionesCompletadas = await Produccion.find({
                estado: 'completada'
            });

            if (produccionesCompletadas.length === 0) {
                return;
            }

            // Agrupar por nombre de producto y sumar cantidades
            const productosConStock = new Map();

            for (const produccion of produccionesCompletadas) {
                if (!produccion.nombre) continue;

                const nombreProducto = produccion.nombre;
                const cantidad = produccion.cantidadProducida || 0;

                if (productosConStock.has(nombreProducto)) {
                    const existing = productosConStock.get(nombreProducto);
                    existing.cantidad += cantidad;
                } else {
                    productosConStock.set(nombreProducto, {
                        nombre: nombreProducto,
                        cantidad: cantidad,
                        unidadMedida: produccion.unidadMedida
                    });
                }
                
                console.log(`📦 Producción: ${nombreProducto} +${cantidad} unidades`);
            }

            console.log(`🏭 Productos únicos con stock real: ${productosConStock.size}`);

            // Buscar productos en catálogo que coincidan con las producciones
            for (const [nombreProducto, stockData] of productosConStock) {
                // Buscar el producto en el catálogo por nombre
                const productoCatalogo = await CatalogoProduccion.findOne({
                    nombre: nombreProducto,
                    activo: true
                });

                if (!productoCatalogo) {
                    console.log(`⚠️ Producto '${nombreProducto}' no encontrado en catálogo activo`);
                    continue;
                }

                if (stockData.cantidad <= 0) continue;

                // Verificar si ya existe en InventarioProducto
                let inventarioExistente = await InventarioProducto.findOne({
                    catalogoProductoId: productoCatalogo._id
                });

                if (!inventarioExistente) {
                    // Crear registro en InventarioProducto SOLO si tiene producciones completadas
                    inventarioExistente = new InventarioProducto({
                        catalogoProductoId: productoCatalogo._id,
                        stock: stockData.cantidad,
                        unidadMedida: stockData.unidadMedida || 'unidad',
                        costoUnitario: 0,
                        observaciones: 'Sincronizado automáticamente desde producciones completadas'
                    });
                    
                    await inventarioExistente.save();
                    console.log(`✅ Sincronizado: ${nombreProducto} - Stock: ${stockData.cantidad} (desde producciones completadas)`);
                } else {
                    // Actualizar stock basado en producciones completadas
                    if (inventarioExistente.stock !== stockData.cantidad) {
                        inventarioExistente.stock = stockData.cantidad;
                        inventarioExistente.fechaUltimaActualizacion = new Date();
                        await inventarioExistente.save();
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error en sincronización:', error);
        }
    }

    /**
     * Obtener todos los productos de un tipo específico
     */
    async obtenerProductosPorTipo(tipoProducto) {
        try {
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
                    // Buscar todos los productos de producción en el catálogo
                    const productosProduccion = await CatalogoProduccion.find({
                        moduloSistema: 'produccion',
                        activo: true
                    }).sort({ nombre: 1 });

                    if (productosProduccion.length === 0) {
                        productos = [];
                        break;
                    }

                    // Para cada producto, buscar su inventario actual
                    productos = [];
                    for (const productoCatalogo of productosProduccion) {
                        const inventarioItem = await InventarioProducto.findOne({
                            catalogoProductoId: productoCatalogo._id
                        });

                        const stockActual = inventarioItem?.stock || 0;

                        // Solo incluir productos que tienen stock actual
                        if (stockActual > 0) {
                            productos.push({
                                ...productoCatalogo.toObject(),
                                cantidad: stockActual,
                                stock: stockActual,
                                cantidadProducida: stockActual,
                                inventarioProductoId: inventarioItem?._id || null,
                                catalogoProductoId: productoCatalogo._id
                            });
                        }
                    }
                    break;
                    
                default:
                    throw new Error(`Tipo de producto no válido: ${tipoProducto}`);
            }
            
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
            if (!cantidad || cantidad <= 0) {
                throw new Error('La cantidad debe ser mayor a 0');
            }
            
            let producto, tipoItem, cantidadAnterior, cantidadNueva;
            
            // Declarar IDs únicos al inicio para que estén disponibles en todo el scope
            let produccionRecetaId = null;
            let produccionTradicionalId = null;
            
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
                    
                    // Generar ID único de producción para rastrear movimientos
                    produccionRecetaId = new mongoose.Types.ObjectId();
                    
                    // Si se debe consumir ingredientes, verificar disponibilidad y consumir
                    if (consumirIngredientes && producto.ingredientes && producto.ingredientes.length > 0) {
                        // Verificar disponibilidad
                        const faltantes = await producto.verificarDisponibilidadCompleta(cantidad);
                        if (faltantes.length > 0) {
                            throw new Error(`Ingredientes insuficientes: ${faltantes.map(f => `${f.ingrediente} (falta ${f.faltante})`).join(', ')}`);
                        }
                        
                        // Consumir ingredientes usando el método correcto del modelo
                        for (const ingredienteReceta of producto.ingredientes) {
                            const cantidadAConsumir = ingredienteReceta.cantidad * cantidad;
                            const ingrediente = ingredienteReceta.ingrediente;
                            
                            // Incluir ID de producción en el motivo
                            const motivoConsumo = `Producción de receta: ${producto.nombre} (${cantidad} lote${cantidad > 1 ? 's' : ''}) - ID: ${produccionRecetaId}`;
                            
                            // Verificar disponibilidad antes de consumir
                            const disponible = ingrediente.cantidad - ingrediente.procesado;
                            if (disponible < cantidadAConsumir) {
                                throw new Error(`Ingrediente ${ingrediente.nombre} insuficiente. Disponible: ${disponible}, Requerido: ${cantidadAConsumir}`);
                            }
                            
                            // 🔧 CORRECCIÓN: Usar el método consumir() del modelo que ya registra el movimiento
                            const exito = await ingrediente.consumir(
                                cantidadAConsumir,
                                motivoConsumo,
                                operador || 'Sistema'
                            );
                            
                            if (!exito) {
                                throw new Error(`Error al consumir ingrediente ${ingrediente.nombre}`);
                            }
                            
                            await ingrediente.save();
                            
                            console.log(`✅ Ingrediente ${ingrediente.nombre} consumido: ${cantidadAConsumir} unidades`);
                            console.log(`📊 Nuevo estado - Stock: ${ingrediente.cantidad}, Procesado: ${ingrediente.procesado}, Disponible: ${ingrediente.cantidad - ingrediente.procesado}`);
                            
                            // ✅ NO registramos movimiento adicional porque el método consumir() ya lo hace
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
                    
                    // 🔧 CORRECCIÓN: Guardar el ID de producción para referencia posterior
                    motivo = `Producción de receta: ${producto.nombre} (${cantidad} lote${cantidad > 1 ? 's' : ''}) - ID: ${produccionRecetaId}`;
                    
                    await producto.save();
                    break;
                    
                case 'produccion':
                    producto = await CatalogoProduccion.findById(productoId);
                    if (!producto) throw new Error('Producto de catálogo no encontrado');
                    
                    console.log(`🏭 Produciendo: ${producto.nombre} - Cantidad: ${cantidad}`);
                    
                    // 🔧 CORRECCIÓN: Generar ID único de producción para rastrear movimientos (similar a recetas)
                    produccionTradicionalId = new mongoose.Types.ObjectId();
                    console.log(`🏭 Iniciando producción tradicional con ID: ${produccionTradicionalId}`);
                    
                    // Solo consumir recursos si se especifica explícitamente
                    if (consumirIngredientes && ((ingredientesUtilizados && ingredientesUtilizados.length > 0) || (recetasUtilizadas && recetasUtilizadas.length > 0))) {
                        console.log('🔍 Procesando consumo de recursos para producción REAL...');
                        
                        // Consumir ingredientes
                        if (ingredientesUtilizados && ingredientesUtilizados.length > 0) {
                            for (const ingredienteData of ingredientesUtilizados) {
                                const ingrediente = await Ingrediente.findById(ingredienteData.ingrediente);
                                if (!ingrediente) {
                                    throw new Error(`Ingrediente con ID ${ingredienteData.ingrediente} no encontrado`);
                                }
                                
                                const disponible = (ingrediente.cantidad || 0) - (ingrediente.procesado || 0);
                                if (ingredienteData.cantidadUtilizada > disponible) {
                                    throw new Error(`Stock insuficiente de ${ingrediente.nombre}. Disponible: ${disponible}, necesario: ${ingredienteData.cantidadUtilizada}`);
                                }
                                
                                console.log(`🔻 Consumiendo ${ingredienteData.cantidadUtilizada} de ${ingrediente.nombre}`);
                                console.log(`📊 Stock actual: ${ingrediente.cantidad}, Procesado: ${ingrediente.procesado}, Disponible: ${disponible}`);
                                
                                // 🔧 CORRECCIÓN: Incluir ID de producción en el motivo
                                const motivoConsumo = `Producción tradicional: ${producto.nombre} (${cantidad} unidad${cantidad > 1 ? 'es' : ''}) - ID: ${produccionTradicionalId}`;
                                
                                // Verificar disponibilidad antes de consumir
                                if (disponible < ingredienteData.cantidadUtilizada) {
                                    throw new Error(`Ingrediente ${ingrediente.nombre} insuficiente. Disponible: ${disponible}, Requerido: ${ingredienteData.cantidadUtilizada}`);
                                }
                                
                                // 🔧 CORRECCIÓN: Usar el método consumir() del modelo que ya registra el movimiento
                                const exito = await ingrediente.consumir(
                                    ingredienteData.cantidadUtilizada,
                                    motivoConsumo,
                                    operador || 'Sistema'
                                );
                                
                                if (!exito) {
                                    throw new Error(`Error al consumir ingrediente ${ingrediente.nombre}`);
                                }
                                
                                await ingrediente.save();
                                
                                console.log(`✅ Ingrediente ${ingrediente.nombre} consumido: ${ingredienteData.cantidadUtilizada} unidades`);
                                console.log(`📊 Nuevo estado - Stock: ${ingrediente.cantidad}, Procesado: ${ingrediente.procesado}, Disponible: ${ingrediente.cantidad - ingrediente.procesado}`);
                                
                                // ✅ NO registramos movimiento adicional porque el método consumir() ya lo hace
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
                                console.log(`📊 Stock actual de receta: ${disponible}`);
                                
                                // 🔧 CORRECCIÓN: Incluir ID de producción en el motivo y usar registro manual
                                const motivoConsumo = `Producción tradicional: ${producto.nombre} (${cantidad} unidad${cantidad > 1 ? 'es' : ''}) - ID: ${produccionTradicionalId}`;
                                
                                // Reducir stock de receta
                                if (!receta.inventario) {
                                    receta.inventario = { cantidadProducida: 0 };
                                }
                                
                                const stockAnterior = receta.inventario.cantidadProducida;
                                receta.inventario.cantidadProducida -= recetaData.cantidadUtilizada;
                                
                                await receta.save();
                                
                                // 🔧 CORRECCIÓN: Registrar movimiento manual con ID de producción
                                await MovimientoInventario.registrarMovimiento({
                                    tipo: 'salida',
                                    tipoMovimiento: 'consumo',
                                    item: receta._id,
                                    tipoItem: 'RecetaProducto',
                                    cantidad: recetaData.cantidadUtilizada,
                                    cantidadAnterior: stockAnterior,
                                    cantidadNueva: receta.inventario.cantidadProducida,
                                    motivo: motivoConsumo,
                                    operador: operador || 'Sistema'
                                });
                                
                                console.log(`✅ Receta ${receta.nombre} consumida: ${recetaData.cantidadUtilizada} unidades`);
                            }
                        }
                    } else {
                        console.log('ℹ️ Modo producción simple - Solo agregando producto final');
                    }
                    
                    // Trabajar con InventarioProducto como fuente de verdad
                    console.log(`📦 Agregando ${cantidad} unidades al inventario`);
                    
                    // Buscar el producto en inventario
                    let inventarioProducto = await InventarioProducto.findOne({
                        catalogoProductoId: productoId
                    }).populate({
                        path: 'catalogoProductoId',
                        model: 'CatalogoProduccion'
                    });
                    
                    if (!inventarioProducto) {
                        // Crear nueva entrada en inventario
                        console.log(`📦 Creando nueva entrada en inventario para: ${producto.nombre}`);
                        
                        inventarioProducto = new InventarioProducto({
                            catalogoProductoId: productoId,
                            stock: cantidad,
                            unidadMedida: producto.unidadMedida || 'unidad',
                            costoUnitario: 0,
                            observaciones: observaciones || 'Creado automáticamente desde producción'
                        });
                        
                        cantidadAnterior = 0;
                        cantidadNueva = cantidad;
                    } else {
                        // Agregar cantidad al inventario existente
                        producto = inventarioProducto.catalogoProductoId;
                        
                        if (!producto) {
                            // Buscar manualmente el producto del catálogo
                            producto = await CatalogoProduccion.findById(productoId);
                            if (!producto) {
                                throw new Error('Producto de catálogo no encontrado');
                            }
                        }
                        
                        // Actualizar stock
                        const resultado = inventarioProducto.actualizarStock(cantidad, 'agregar');
                        cantidadAnterior = resultado.cantidadAnterior;
                        cantidadNueva = resultado.cantidadNueva;
                        
                        console.log(`📈 Stock actualizado: ${cantidadAnterior} + ${cantidad} = ${cantidadNueva}`);
                    }
                    
                    await inventarioProducto.save();
                    
                    // Verificar que se guardó correctamente
                    const verificacion = await InventarioProducto.findById(inventarioProducto._id);
                    console.log(`✅ Stock guardado exitosamente: ${verificacion.stock} unidades`);
                    
                    tipoItem = 'CatalogoProduccion';
                    break;
                    
                default:
                    throw new Error(`Tipo de producto no válido: ${tipoProducto}`);
            }
            
                // Para producción, usar la función especializada que guarda los detalles correctos
                if (tipoProducto === 'produccion') {
                    // Preparar ingredientes para registrarProductoProducido con nombres reales
                    const ingredientesParaRegistro = [];
                    if (ingredientesUtilizados && ingredientesUtilizados.length > 0) {
                        for (const ing of ingredientesUtilizados) {
                            const ingrediente = await Ingrediente.findById(ing.ingrediente);
                            ingredientesParaRegistro.push({
                                nombre: ingrediente ? ingrediente.nombre : `Ingrediente ${ing.ingrediente}`,
                                ingrediente: ing.ingrediente,
                                cantidad: ing.cantidadUtilizada,
                                costo: (ing.precioUnitario || 0) * ing.cantidadUtilizada
                            });
                        }
                    }
                    
                    // Preparar recetas para registrarProductoProducido con nombres reales
                    const recetasParaRegistro = [];
                    if (recetasUtilizadas && recetasUtilizadas.length > 0) {
                        for (const rec of recetasUtilizadas) {
                            const receta = await RecetaProducto.findById(rec.receta);
                            recetasParaRegistro.push({
                                nombre: receta ? receta.nombre : `Receta ${rec.receta}`,
                                receta: rec.receta,
                                cantidad: rec.cantidadUtilizada,
                                costo: (rec.precioUnitario || 0) * rec.cantidadUtilizada
                            });
                        }
                    }
                    
                    // CORRECCIÓN: Solo registrar el movimiento para historial, NO modificar inventario
                    const resultadoProduccion = await this.registrarMovimientoProduccion(
                        producto.nombre,
                        cantidad,
                        producto.unidadMedida || 'unidad',
                        costoTotal,
                        produccionTradicionalId ? produccionTradicionalId.toString() : `produccion-${Date.now()}`,
                        operador || 'Sistema',
                        ingredientesParaRegistro,
                        recetasParaRegistro,
                        observaciones,
                        cantidadAnterior,
                        cantidadNueva
                    );
                    
                    return {
                        producto: resultadoProduccion.producto,
                        movimiento: resultadoProduccion.movimiento,
                        cantidadAnterior: cantidadAnterior,
                        cantidadNueva: cantidadNueva,
                        cantidadAgregada: cantidad
                    };
                }            // Para otros tipos de productos (ingredientes, materiales, recetas) usar el método anterior
            // Para otros tipos de productos (ingredientes, materiales, recetas) usar el método anterior
            const movimientoData = {
                tipo: 'entrada',
                tipoMovimiento: tipoProducto === 'produccion' ? 'produccion' : 'manual',
                item: producto._id,
                tipoItem: tipoItem,
                cantidad: tipoProducto === 'recetas' ? (cantidadNueva - cantidadAnterior) : cantidad,
                cantidadAnterior: cantidadAnterior,
                cantidadNueva: cantidadNueva,
                motivo: motivo || 'Entrada desde gestión unificada',
                operador: operador || 'Sistema'
            };

            // Para producción, incluir el ID del producto en el motivo
            if (tipoProducto === 'produccion') {
                let motivoLimpio = movimientoData.motivo || 'Entrada de producción';
                
                if (motivoLimpio.match(/[^a-zA-Z0-9\s:.\-_,]/)) {
                    motivoLimpio = `Producción: ${producto.nombre} - ${cantidad} unidades`;
                }
                
                if (motivoLimpio.toLowerCase().includes('producción')) {
                    movimientoData.motivo = `${motivoLimpio} - ID: ${producto._id}`;
                } else {
                    movimientoData.motivo = `Producción: ${motivoLimpio} - ID: ${producto._id}`;
                }
            }

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

            // Agregar precio al movimiento si se proporciona
            if ((tipoProducto === 'ingredientes' || tipoProducto === 'materiales') && precio !== null && precio !== undefined) {
                movimientoData.precio = precio;
            }

            const movimiento = await MovimientoInventario.registrarMovimiento(movimientoData);
            
            console.log(`✅ Movimiento registrado: ${movimiento._id} - ${tipoProducto} - ${producto.nombre}`);
            
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
     * Registrar solo el movimiento de producción para historial (sin modificar inventario)
     */
    async registrarMovimientoProduccion(nombreProducto, cantidadProducida, unidadMedida, costoTotal, produccionId, operador, ingredientesConsumidos = [], recetasConsumidas = [], observaciones = '', stockAnterior = 0, stockNuevo = 0) {
        try {
            // 1. Buscar producto en el catálogo de producción
            let productoCatalogo = await CatalogoProduccion.findOne({
                nombre: nombreProducto,
                moduloSistema: 'produccion'
            });

            if (!productoCatalogo) {
                productoCatalogo = new CatalogoProduccion({
                    nombre: nombreProducto,
                    descripcion: `Producto generado desde producción - ${nombreProducto}`,
                    categoria: 'Producto Final',
                    unidadMedida: unidadMedida || 'unidad',
                    moduloSistema: 'produccion',
                    activo: true,
                    precio: costoTotal > 0 ? (costoTotal / cantidadProducida) : 0
                });
                await productoCatalogo.save();
            }

            // 2. Crear SOLO el movimiento de historial (NO modificar inventario)
            const movimientoData = {
                tipo: 'entrada',
                tipoMovimiento: 'produccion',
                item: productoCatalogo._id,
                tipoItem: 'CatalogoProduccion',
                cantidad: cantidadProducida,
                cantidadAnterior: stockAnterior,
                cantidadNueva: stockNuevo,
                costoTotal: costoTotal,
                motivo: `Producción tradicional completada: ${nombreProducto} - ID: ${produccionId}`,
                operador: operador,
                detalles: {
                    esProduccionReal: true,
                    produccionId: produccionId,
                    ingredientesConsumidos: ingredientesConsumidos.map(ing => ({
                        nombre: ing.nombre || `Ingrediente ${ing.ingrediente}`,
                        cantidad: ing.cantidad || ing.cantidadUtilizada || 0,
                        costo: ing.costo || 0
                    })),
                    recetasConsumidas: recetasConsumidas.map(rec => ({
                        nombre: rec.nombre || `Receta ${rec.receta}`,
                        cantidad: rec.cantidad || rec.cantidadUtilizada || 0,
                        costo: rec.costo || 0
                    })),
                    costoProduccion: costoTotal,
                    rendimiento: `${cantidadProducida} ${unidadMedida || 'unidades'}`
                }
            };

            if (observaciones) {
                movimientoData.observaciones = observaciones;
            }

            const movimiento = await MovimientoInventario.registrarMovimiento(movimientoData);

            return {
                producto: productoCatalogo,
                movimiento: movimiento
            };

        } catch (error) {
            console.error('❌ Error al registrar movimiento de producción:', error);
            throw new Error(`Error al registrar movimiento de producción: ${error.message}`);
        }
    }

    /**
     * Registrar producto producido en el inventario
     * Especializado para cuando se completa una producción
     */
    async registrarProductoProducido(nombreProducto, cantidadProducida, unidadMedida, costoTotal, produccionId, operador, ingredientesConsumidos = [], recetasConsumidas = [], observaciones = '') {
        try {
            console.log('🏭 Registrando producto producido:', {
                nombreProducto,
                cantidadProducida,
                unidadMedida,
                costoTotal,
                produccionId,
                operador
            });
            
            // 🔍 DEBUG: Verificar datos de ingredientes y recetas
            console.log('🔍 DEBUG - Ingredientes consumidos recibidos:', ingredientesConsumidos);
            console.log('🔍 DEBUG - Recetas consumidas recibidas:', recetasConsumidas);

            // 1. Buscar o crear producto en el catálogo de producción
            let productoCatalogo = await CatalogoProduccion.findOne({
                nombre: nombreProducto,
                moduloSistema: 'produccion'
            });

            if (!productoCatalogo) {
                console.log('📦 Creando nuevo producto en catálogo:', nombreProducto);
                productoCatalogo = new CatalogoProduccion({
                    nombre: nombreProducto,
                    descripcion: `Producto generado desde producción - ${nombreProducto}`,
                    categoria: 'Producto Final',
                    unidadMedida: unidadMedida || 'unidad',
                    moduloSistema: 'produccion',
                    activo: true,
                    precio: costoTotal > 0 ? (costoTotal / cantidadProducida) : 0
                });
                await productoCatalogo.save();
                console.log('✅ Producto creado en catálogo:', productoCatalogo._id);
            }

            // 2. Buscar o crear entrada en inventario de productos
            let inventarioProducto = await InventarioProducto.findOne({
                catalogoProductoId: productoCatalogo._id
            }).populate('catalogoProductoId');

            const stockAnterior = inventarioProducto ? inventarioProducto.stock : 0;
            const stockNuevo = stockAnterior + cantidadProducida;

            if (!inventarioProducto) {
                console.log('📦 Creando nueva entrada en inventario para:', nombreProducto);
                inventarioProducto = new InventarioProducto({
                    catalogoProductoId: productoCatalogo._id,
                    nombre: nombreProducto, // NUEVO: Agregar nombre directamente
                    stock: cantidadProducida,
                    unidadMedida: unidadMedida || 'unidad',
                    costoUnitario: costoTotal > 0 ? (costoTotal / cantidadProducida) : 0,
                    observaciones: `Generado desde producción ${produccionId}`
                });
                await inventarioProducto.save();
                console.log('✅ Nueva entrada en inventario creada');
            } else {
                inventarioProducto.stock = stockNuevo;
                inventarioProducto.fechaUltimaActualizacion = new Date();
                if (costoTotal > 0) {
                    inventarioProducto.costoUnitario = costoTotal / cantidadProducida;
                }
                // NUEVO: Asegurar que el nombre esté presente
                if (!inventarioProducto.nombre) {
                    inventarioProducto.nombre = nombreProducto;
                }
                await inventarioProducto.save();
                console.log('✅ Inventario actualizado');
            }

            // 3. Crear movimiento de inventario específico para producción
            const movimientoData = {
                tipo: 'entrada',
                tipoMovimiento: 'produccion',
                item: productoCatalogo._id,
                tipoItem: 'CatalogoProduccion',
                cantidad: cantidadProducida,
                cantidadAnterior: stockAnterior,
                cantidadNueva: stockNuevo,
                costoTotal: costoTotal,
                motivo: `Producción tradicional completada: ${nombreProducto} - ID: ${produccionId}`, // 🔧 CORRECCIÓN: Incluir ID en motivo
                operador: operador,
                detalles: {
                    esProduccionReal: true,
                    produccionId: produccionId,
                    ingredientesConsumidos: ingredientesConsumidos.map(ing => ({
                        nombre: ing.nombre || `Ingrediente ${ing.ingrediente}`,
                        cantidad: ing.cantidad || ing.cantidadUtilizada || 0,
                        costo: ing.costo || 0
                    })),
                    recetasConsumidas: recetasConsumidas.map(rec => ({
                        nombre: rec.nombre || `Receta ${rec.receta}`,
                        cantidad: rec.cantidad || rec.cantidadUtilizada || 0,
                        costo: rec.costo || 0
                    })),
                    costoProduccion: costoTotal,
                    rendimiento: `${cantidadProducida} ${unidadMedida || 'unidades'}`
                }
            };

            if (observaciones) {
                movimientoData.observaciones = observaciones;
            }

            console.log('📝 Datos del movimiento de producción:', movimientoData);
            const movimiento = await MovimientoInventario.registrarMovimiento(movimientoData);
            
            console.log('✅ Movimiento de producción registrado:', movimiento._id);

            return {
                producto: productoCatalogo,
                inventario: inventarioProducto,
                movimiento: movimiento,
                stockAnterior,
                stockNuevo,
                cantidadAgregada: cantidadProducida
            };

        } catch (error) {
            console.error('❌ Error al registrar producto producido:', error);
            throw new Error(`Error al registrar producto producido: ${error.message}`);
        }
    }

    /**
     * Eliminar un movimiento de inventario y revertir su efecto
     */
    async obtenerHistorialMovimientos(filtros = {}) {
        try {
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
                queryFiltros.tipoMovimiento = tipoMovimiento;
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
            
            console.log('🔍 Consultando historial:', queryFiltros);
            
            // Hacer la consulta básica
            let movimientosQuery = await MovimientoInventario.find(queryFiltros)
                .populate({
                    path: 'item',
                    select: 'nombre codigo productoReferencia unidadMedida precioUnitario'
                })
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(parseInt(limite));

            console.log(`📦 ${movimientosQuery.length} movimientos encontrados`);
            
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
            
            const resultadoFinal = {
                movimientos,
                total,
                pagina: parseInt(pagina),
                totalPaginas: Math.ceil(total / parseInt(limite))
            };
            
            console.log(`✅ ${movimientos.length} de ${total} movimientos obtenidos`);
            
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
                    
                    // 🔧 NUEVA LÓGICA: Verificar si es una producción de receta con ID
                    const esProduccionDeReceta = movimiento.motivo?.includes('Producción de receta:') && 
                                                 movimiento.motivo?.includes('ID:');
                    
                    if (esProduccionDeReceta) {
                        console.log('🍳 DETECTADA PRODUCCIÓN DE RECETA - usando revertirProduccionReceta');
                        
                        // Extraer ID de producción del motivo
                        const idMatch = movimiento.motivo.match(/ID:\s*([a-fA-F0-9]{24})/);
                        if (idMatch) {
                            const produccionId = idMatch[1];
                            console.log(`🔄 Revirtiendo producción de receta con ID: ${produccionId}`);
                            
                            // Usar el método especializado que revierte recetas E ingredientes
                            const resultadoReversion = await this.revertirProduccionReceta(produccionId, operador);
                            console.log('✅ Producción de receta revertida usando método especializado:', resultadoReversion);
                            
                            // No necesitamos hacer nada más, el método especializado maneja todo
                            break;
                        } else {
                            console.log('⚠️ No se pudo extraer ID de producción, usando reversión simple');
                        }
                    }
                    
                    // 📝 REVERSIÓN SIMPLE (para movimientos manuales de recetas)
                    console.log('📝 Reversión simple de receta (sin consumo de ingredientes)');
                    
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
                    
                    console.log('🔄 Revirtiendo movimiento de producción...');
                    
                    // 🔧 NUEVA LÓGICA: Verificar si es una producción tradicional con ID
                    const esProduccionTradicional = movimiento.motivo?.includes('Producción tradicional completada:') && 
                                                   movimiento.motivo?.includes('ID:');
                    
                    if (esProduccionTradicional) {
                        console.log('🏭 DETECTADA PRODUCCIÓN TRADICIONAL - usando revertirProduccionTradicional');
                        
                        // Extraer ID de producción del motivo
                        const idMatch = movimiento.motivo.match(/ID:\s*([a-fA-F0-9]{24})/);
                        if (idMatch) {
                            const produccionId = idMatch[1];
                            console.log(`🔄 Revirtiendo producción tradicional con ID: ${produccionId}`);
                            
                            // Usar el método especializado que revierte producto final, recetas E ingredientes
                            const resultadoReversion = await this.revertirProduccionTradicional(produccionId, operador);
                            console.log('✅ Producción tradicional revertida usando método especializado:', resultadoReversion);
                            
                            // No necesitamos hacer nada más, el método especializado maneja todo
                            break;
                        } else {
                            console.log('⚠️ No se pudo extraer ID de producción, usando reversión simple');
                        }
                    }
                    
                    // 📝 REVERSIÓN SIMPLE (para movimientos manuales de productos)
                    console.log('📝 Reversión simple de producto (sin consumo de recursos)');
                    
                    // 1. Revertir cantidad del catálogo
                    const cantidadAnteriorCat = producto.cantidad || 0;
                    producto.cantidad = Math.max(0, (producto.cantidad || 0) - movimiento.cantidad);
                    await producto.save();
                    console.log(`📊 Catálogo: ${cantidadAnteriorCat} → ${producto.cantidad}`);
                    
                    // 2. NUEVO: Revertir stock en InventarioProducto
                    const inventarioProducto = await InventarioProducto.findOne({
                        catalogoProductoId: producto._id
                    });
                    
                    if (inventarioProducto) {
                        const stockAnterior = inventarioProducto.stock || 0;
                        inventarioProducto.stock = Math.max(0, stockAnterior - movimiento.cantidad);
                        inventarioProducto.fechaUltimaActualizacion = new Date();
                        await inventarioProducto.save();
                        console.log(`📦 Inventario: ${stockAnterior} → ${inventarioProducto.stock}`);
                    } else {
                        console.log('⚠️ No se encontró entrada en InventarioProducto para este producto');
                    }
                    
                    // 3. Registrar movimiento de reversión
                    await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        tipoMovimiento: 'ajuste',
                        item: producto._id,
                        tipoItem: 'CatalogoProduccion',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnteriorCat,
                        cantidadNueva: producto.cantidad,
                        motivo: `Reversión por eliminación de movimiento: ${movimiento.motivo}`,
                        operador: operador || 'Sistema',
                        detalles: {
                            movimientoOriginalId: movimientoId,
                            esReversion: true,
                            stockInventarioAnterior: inventarioProducto ? (inventarioProducto.stock + movimiento.cantidad) : 0,
                            stockInventarioNuevo: inventarioProducto ? inventarioProducto.stock : 0
                        }
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

    /**
     * Actualizar la cantidad producida en los registros de producción existentes
     * Esto mantiene sincronizados los movimientos con las producciones
     */
    async actualizarCantidadProduccion(nombreProducto, cantidadAdicional, operador) {
        try {
            // Buscar la producción más reciente de este producto que esté completada
            const produccionExistente = await Produccion.findOne({
                nombre: nombreProducto,
                estado: 'completada'
            }).sort({ fechaProduccion: -1 }); // La más reciente
            
            if (produccionExistente) {
                const cantidadAnterior = produccionExistente.cantidadProducida;
                produccionExistente.cantidadProducida += cantidadAdicional;
                
                // Agregar una nota en las observaciones para rastrear el incremento
                const fechaActual = new Date().toLocaleString('es-ES');
                const nuevaObservacion = `[${fechaActual}] Incremento de ${cantidadAdicional} unidades agregado por ${operador}`;
                
                if (produccionExistente.observaciones) {
                    produccionExistente.observaciones += `\n${nuevaObservacion}`;
                } else {
                    produccionExistente.observaciones = nuevaObservacion;
                }
                
                await produccionExistente.save();
                
                console.log(`✅ Producción actualizada: ${cantidadAnterior} → ${produccionExistente.cantidadProducida} (${nombreProducto})`);
                
                return {
                    success: true,
                    produccionActualizada: produccionExistente,
                    cantidadAnterior,
                    cantidadNueva: produccionExistente.cantidadProducida
                };
            } else {
                console.log(`⚠️ No se encontró producción completada para: ${nombreProducto}`);
                return {
                    success: false,
                    mensaje: `No se encontró producción completada para: ${nombreProducto}`
                };
            }
            
        } catch (error) {
            console.error('❌ Error al actualizar cantidad en producción:', error);
            throw new Error(`Error al actualizar cantidad en producción: ${error.message}`);
        }
    }

    /**
     * 🔧 NUEVO: Método para revertir producciones tradicionales usando el ID
     */
    async revertirProduccionTradicional(produccionId, operador = 'sistema') {
        try {
            console.log(`🔄 === REVIRTIENDO PRODUCCIÓN TRADICIONAL ===`);
            console.log(`🔄 ID de producción: ${produccionId}`);
            console.log(`🔄 Operador: ${operador}`);
            
            // Buscar todos los movimientos relacionados con esta producción
            const movimientosRelacionados = await MovimientoInventario.find({
                motivo: { $regex: `ID: ${produccionId}`, $options: 'i' }
            }).populate('item');
            
            console.log(`📋 Movimientos encontrados: ${movimientosRelacionados.length}`);
            
            if (movimientosRelacionados.length === 0) {
                throw new Error(`No se encontraron movimientos para la producción ${produccionId}`);
            }
            
            // Separar movimientos por tipo
            const movimientosIngredientes = movimientosRelacionados.filter(m => m.tipoItem === 'Ingrediente');
            const movimientosRecetas = movimientosRelacionados.filter(m => m.tipoItem === 'RecetaProducto');
            const movimientosProductos = movimientosRelacionados.filter(m => m.tipoItem === 'CatalogoProduccion');
            
            console.log(`📦 Movimientos de ingredientes a revertir: ${movimientosIngredientes.length}`);
            console.log(`🍳 Movimientos de recetas a revertir: ${movimientosRecetas.length}`);
            console.log(`🏭 Movimientos de productos finales a revertir: ${movimientosProductos.length}`);
            
            const movimientosReversion = [];
            
            // 1. Revertir ingredientes
            for (const movimiento of movimientosIngredientes) {
                const ingrediente = await Ingrediente.findById(movimiento.item);
                if (ingrediente) {
                    console.log(`🔄 Revirtiendo ingrediente: ${ingrediente.nombre} (reducir procesado: -${movimiento.cantidad})`);
                    
                    // CORREGIDO: Solo reducir procesado, NO tocar cantidad total
                    const cantidadAnterior = ingrediente.cantidad; // NO CAMBIA
                    const procesadoAnterior = ingrediente.procesado;
                    
                    // SOLO reducir procesado (la cantidad total no se toca)
                    ingrediente.procesado = Math.max(0, ingrediente.procesado - movimiento.cantidad);
                    
                    await ingrediente.save();
                    
                    // Crear movimiento de reversión (registra la reducción de procesado)
                    const movimientoReversion = await MovimientoInventario.registrarMovimiento({
                        tipo: 'ajuste', // Usar tipo válido
                        item: ingrediente._id,
                        tipoItem: 'Ingrediente',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: procesadoAnterior, // Usar procesado anterior
                        cantidadNueva: ingrediente.procesado, // Usar procesado nuevo
                        motivo: `Reversión de procesado por eliminación de producción - ID: ${produccionId}`,
                        operador: operador,
                        detalles: {
                            tipo: 'reversion_procesado',
                            cantidadTotal: ingrediente.cantidad, // Mantener referencia que no cambió
                            procesadoAnterior: procesadoAnterior,
                            procesadoNuevo: ingrediente.procesado
                        }
                    });
                    
                    movimientosReversion.push(movimientoReversion);
                    console.log(`✅ Ingrediente ${ingrediente.nombre} revertido: procesado ${procesadoAnterior} → ${ingrediente.procesado} (cantidad total NO cambió: ${ingrediente.cantidad})`);
                }
            }
            
            // 2. Revertir recetas
            for (const movimiento of movimientosRecetas) {
                const receta = await RecetaProducto.findById(movimiento.item);
                if (receta) {
                    console.log(`🔄 Revirtiendo receta: ${receta.nombre} (+${movimiento.cantidad})`);
                    
                    // Restaurar stock de receta
                    const cantidadAnterior = receta.inventario?.cantidadProducida || 0;
                    if (!receta.inventario) {
                        receta.inventario = { cantidadProducida: 0, cantidadUtilizada: 0 };
                    }
                    
                    receta.inventario.cantidadProducida += movimiento.cantidad;
                    receta.inventarioDisponible = receta.inventario.cantidadProducida - (receta.inventario.cantidadUtilizada || 0);
                    
                    await receta.save();
                    
                    // Crear movimiento de reversión
                    const movimientoReversion = await MovimientoInventario.registrarMovimiento({
                        tipo: 'entrada',
                        item: receta._id,
                        tipoItem: 'RecetaProducto',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnterior,
                        cantidadNueva: receta.inventario.cantidadProducida,
                        motivo: `Reversión de producción tradicional - ID: ${produccionId}`,
                        operador: operador
                    });
                    
                    movimientosReversion.push(movimientoReversion);
                    console.log(`✅ Receta ${receta.nombre} revertida: +${movimiento.cantidad} stock`);
                }
            }
            
            // 3. Revertir productos finales
            for (const movimiento of movimientosProductos) {
                const producto = await CatalogoProduccion.findById(movimiento.item);
                if (producto) {
                    console.log(`🔄 Revirtiendo producto final: ${producto.nombre} (-${movimiento.cantidad})`);
                    
                    // Revertir cantidad del catálogo (si se usa)
                    const cantidadAnteriorCat = producto.cantidad || 0;
                    producto.cantidad = Math.max(0, (producto.cantidad || 0) - movimiento.cantidad);
                    await producto.save();
                    
                    // Revertir stock en InventarioProducto
                    const inventarioProducto = await InventarioProducto.findOne({
                        catalogoProductoId: producto._id
                    });
                    
                    if (inventarioProducto) {
                        const stockAnterior = inventarioProducto.stock || 0;
                        inventarioProducto.stock = Math.max(0, stockAnterior - movimiento.cantidad);
                        inventarioProducto.fechaUltimaActualizacion = new Date();
                        await inventarioProducto.save();
                        
                        console.log(`📦 Inventario revertido: ${stockAnterior} → ${inventarioProducto.stock}`);
                    }
                    
                    // Crear movimiento de reversión
                    const movimientoReversion = await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        item: producto._id,
                        tipoItem: 'CatalogoProduccion',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnteriorCat,
                        cantidadNueva: producto.cantidad,
                        motivo: `Reversión de producción tradicional - ID: ${produccionId}`,
                        operador: operador
                    });
                    
                    movimientosReversion.push(movimientoReversion);
                    console.log(`✅ Producto ${producto.nombre} revertido: -${movimiento.cantidad} stock`);
                }
            }
            
            console.log(`✅ Producción tradicional ${produccionId} revertida exitosamente`);
            console.log(`📊 Total movimientos de reversión creados: ${movimientosReversion.length}`);
            
            return {
                success: true,
                movimientosRevertidos: movimientosRelacionados.length,
                movimientosCreados: movimientosReversion.length,
                ingredientesRevertidos: movimientosIngredientes.length,
                recetasRevertidas: movimientosRecetas.length,
                productosRevertidos: movimientosProductos.length,
                mensaje: 'Producción tradicional revertida exitosamente'
            };
            
        } catch (error) {
            console.error('❌ Error al revertir producción tradicional:', error);
            throw new Error(`Error al revertir producción tradicional: ${error.message}`);
        }
    }

    /**
     * 🔧 NUEVO: Método para revertir producciones de recetas usando el ID
     */
    async revertirProduccionReceta(produccionId, operador = 'sistema') {
        try {
            console.log(`🔄 === REVIRTIENDO PRODUCCIÓN DE RECETA ===`);
            console.log(`🔄 ID de producción: ${produccionId}`);
            console.log(`🔄 Operador: ${operador}`);
            
            // Buscar todos los movimientos relacionados con esta producción
            const movimientosRelacionados = await MovimientoInventario.find({
                motivo: { $regex: `ID: ${produccionId}`, $options: 'i' }
            }).populate('item');
            
            console.log(`📋 Movimientos encontrados: ${movimientosRelacionados.length}`);
            
            if (movimientosRelacionados.length === 0) {
                throw new Error(`No se encontraron movimientos para la producción ${produccionId}`);
            }
            
            // Separar movimientos de ingredientes y recetas
            const movimientosIngredientes = movimientosRelacionados.filter(m => m.tipoItem === 'Ingrediente');
            const movimientosRecetas = movimientosRelacionados.filter(m => m.tipoItem === 'RecetaProducto');
            
            console.log(`📦 Movimientos de ingredientes a revertir: ${movimientosIngredientes.length}`);
            console.log(`🍳 Movimientos de recetas a revertir: ${movimientosRecetas.length}`);
            
            const movimientosReversion = [];
            
            // 1. Revertir ingredientes
            for (const movimiento of movimientosIngredientes) {
                const ingrediente = await Ingrediente.findById(movimiento.item);
                if (ingrediente) {
                    console.log(`🔄 Revirtiendo ingrediente: ${ingrediente.nombre} (+${movimiento.cantidad})`);
                    
                    // Restaurar stock disponible
                    const cantidadAnterior = ingrediente.cantidad;
                    ingrediente.cantidad += movimiento.cantidad;
                    
                    // Reducir procesado
                    ingrediente.procesado = Math.max(0, ingrediente.procesado - movimiento.cantidad);
                    
                    await ingrediente.save();
                    
                    // Crear movimiento de reversión
                    const movimientoReversion = await MovimientoInventario.registrarMovimiento({
                        tipo: 'entrada',
                        item: ingrediente._id,
                        tipoItem: 'Ingrediente',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnterior,
                        cantidadNueva: ingrediente.cantidad,
                        motivo: `Reversión de producción de receta - ID: ${produccionId}`,
                        operador: operador
                    });
                    
                    movimientosReversion.push(movimientoReversion);
                    console.log(`✅ Ingrediente ${ingrediente.nombre} revertido: +${movimiento.cantidad} stock`);
                }
            }
            
            // 2. Revertir recetas
            for (const movimiento of movimientosRecetas) {
                const receta = await RecetaProducto.findById(movimiento.item);
                if (receta) {
                    console.log(`🔄 Revirtiendo receta: ${receta.nombre} (-${movimiento.cantidad})`);
                    
                    // Reducir stock de receta producida
                    const cantidadAnterior = receta.inventario?.cantidadProducida || 0;
                    if (!receta.inventario) {
                        receta.inventario = { cantidadProducida: 0, cantidadUtilizada: 0 };
                    }
                    
                    receta.inventario.cantidadProducida = Math.max(0, receta.inventario.cantidadProducida - movimiento.cantidad);
                    receta.inventarioDisponible = receta.inventario.cantidadProducida - (receta.inventario.cantidadUtilizada || 0);
                    
                    await receta.save();
                    
                    // Crear movimiento de reversión
                    const movimientoReversion = await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        item: receta._id,
                        tipoItem: 'RecetaProducto',
                        cantidad: movimiento.cantidad,
                        cantidadAnterior: cantidadAnterior,
                        cantidadNueva: receta.inventario.cantidadProducida,
                        motivo: `Reversión de producción de receta - ID: ${produccionId}`,
                        operador: operador
                    });
                    
                    movimientosReversion.push(movimientoReversion);
                    console.log(`✅ Receta ${receta.nombre} revertida: -${movimiento.cantidad} stock`);
                }
            }
            
            console.log(`✅ Producción de receta ${produccionId} revertida exitosamente`);
            console.log(`📊 Total movimientos de reversión creados: ${movimientosReversion.length}`);
            
            return {
                success: true,
                movimientosRevertidos: movimientosRelacionados.length,
                movimientosCreados: movimientosReversion.length,
                ingredientesRevertidos: movimientosIngredientes.length,
                recetasRevertidas: movimientosRecetas.length,
                mensaje: 'Producción de receta revertida exitosamente'
            };
            
        } catch (error) {
            console.error('❌ Error al revertir producción de receta:', error);
            throw new Error(`Error al revertir producción de receta: ${error.message}`);
        }
    }
}

module.exports = new MovimientoUnificadoService();
