const Residuo = require('../models/Residuo');
const Ingrediente = require('../models/produccion/Ingrediente');
const Material = require('../models/produccion/Material');
const RecetaProducto = require('../models/produccion/RecetaProducto');
const Produccion = require('../models/produccion/Produccion');

class ResiduoService {
    
    // Registrar un residuo y actualizar inventario
    async registrarResiduo(datosResiduo, usuario) {
        const { tipoProducto, productoId, cantidadPerdida } = datosResiduo;
        
        try {
            // 1. Verificar que el producto existe y tiene stock suficiente
            const producto = await this.obtenerProductoPorTipo(tipoProducto, productoId);
            if (!producto) {
                throw new Error(`${tipoProducto} no encontrado`);
            }

            // 2. Validar stock disponible
            const stockDisponible = this.obtenerStockDisponible(tipoProducto, producto);
            if (stockDisponible < cantidadPerdida) {
                throw new Error(`Stock insuficiente. Disponible: ${stockDisponible}, Solicitado: ${cantidadPerdida}`);
            }

            // 3. Calcular costo estimado
            const costoEstimado = this.calcularCostoEstimado(tipoProducto, producto, cantidadPerdida);

            // 4. Crear registro de residuo
            const residuo = new Residuo({
                ...datosResiduo,
                productoNombre: producto.nombre,
                unidadMedida: this.obtenerUnidadMedida(tipoProducto, producto),
                costoEstimado,
                operador: usuario
            });

            // 5. Actualizar inventario del producto
            await this.actualizarInventario(tipoProducto, productoId, cantidadPerdida);

            // 6. Guardar residuo
            await residuo.save();
            
            return residuo;

        } catch (error) {
            console.error('❌ Error al registrar residuo:', error);
            throw error;
        }
    }

    // Obtener producto por tipo y ID
    async obtenerProductoPorTipo(tipoProducto, productoId) {
        switch (tipoProducto) {
            case 'ingrediente':
                return await Ingrediente.findById(productoId);
            case 'material':
                return await Material.findById(productoId);
            case 'receta':
                return await RecetaProducto.findById(productoId);
            case 'produccion':
                return await Produccion.findById(productoId);
            default:
                throw new Error(`Tipo de producto no válido: ${tipoProducto}`);
        }
    }

    // Obtener stock disponible según el tipo de producto
    obtenerStockDisponible(tipoProducto, producto) {
        switch (tipoProducto) {
            case 'ingrediente':
                return (producto.cantidad || 0) - (producto.procesado || 0);
            case 'material':
                return (producto.cantidad || 0) - (producto.consumido || 0);
            case 'receta':
                return (producto.inventario?.cantidadProducida || 0) - (producto.inventario?.cantidadUtilizada || 0);
            case 'produccion':
                return producto.cantidadProducida || 0;
            default:
                return 0;
        }
    }

    // Obtener unidad de medida según el tipo de producto
    obtenerUnidadMedida(tipoProducto, producto) {
        switch (tipoProducto) {
            case 'ingrediente':
            case 'material':
                return producto.unidadMedida || 'unidad';
            case 'receta':
                return producto.rendimiento?.unidadMedida || 'unidad';
            case 'produccion':
                return producto.unidadMedida || 'unidad';
            default:
                return 'unidad';
        }
    }

    // Calcular costo estimado de la pérdida
    calcularCostoEstimado(tipoProducto, producto, cantidad) {
        switch (tipoProducto) {
            case 'ingrediente':
                return (producto.precioUnitario || 0) * cantidad;
            case 'material':
                return (producto.precioUnitario || 0) * cantidad;
            case 'receta':
                return (producto.costoProduccion || 0) * cantidad;
            case 'produccion':
                return (producto.costoTotal || 0) * (cantidad / (producto.cantidadProducida || 1));
            default:
                return 0;
        }
    }

    // Actualizar inventario del producto
    async actualizarInventario(tipoProducto, productoId, cantidadPerdida) {
        switch (tipoProducto) {
            case 'ingrediente':
                await Ingrediente.findByIdAndUpdate(
                    productoId,
                    { $inc: { procesado: cantidadPerdida } }
                );
                break;
            case 'material':
                await Material.findByIdAndUpdate(
                    productoId,
                    { $inc: { consumido: cantidadPerdida } }
                );
                break;
            case 'receta':
                await RecetaProducto.findByIdAndUpdate(
                    productoId,
                    { $inc: { 'inventario.cantidadUtilizada': cantidadPerdida } }
                );
                break;
            case 'produccion':
                // Para producciones, solo registramos la pérdida sin modificar el stock
                // ya que representa producto terminado perdido
                break;
        }
    }

    // Obtener lista de residuos con filtros
    async obtenerResiduos(filtros = {}, limite = 50, pagina = 1) {
        try {
            const query = { activo: true };

            // Aplicar filtros
            if (filtros.fechaInicio && filtros.fechaFin) {
                query.fecha = {
                    $gte: new Date(filtros.fechaInicio),
                    $lte: new Date(filtros.fechaFin)
                };
            }

            if (filtros.tipoProducto) {
                query.tipoProducto = filtros.tipoProducto;
            }

            if (filtros.motivo) {
                query.motivo = filtros.motivo;
            }

            if (filtros.operador) {
                query.operador = { $regex: filtros.operador, $options: 'i' };
            }

            if (filtros.buscar) {
                query.productoNombre = { $regex: filtros.buscar, $options: 'i' };
            }

            const skip = (pagina - 1) * limite;
            const total = await Residuo.countDocuments(query);
            const residuos = await Residuo.find(query)
                .sort({ fecha: -1 })
                .skip(skip)
                .limit(limite);

            return {
                residuos,
                total,
                pagina: parseInt(pagina),
                totalPaginas: Math.ceil(total / limite),
                limite: parseInt(limite)
            };

        } catch (error) {
            console.error('❌ Error al obtener residuos:', error);
            throw error;
        }
    }

    // Obtener productos por tipo para el selector
    async obtenerProductosPorTipo(tipoProducto) {
        try {
            let productos = [];

            switch (tipoProducto) {
                case 'ingrediente':
                    productos = await Ingrediente.find({ 
                        activo: true,
                        $expr: { $gt: [{ $subtract: ['$cantidad', { $ifNull: ['$procesado', 0] }] }, 0] }
                    }).select('_id nombre cantidad procesado unidadMedida precioUnitario');
                    break;
                case 'material':
                    productos = await Material.find({ 
                        activo: true,
                        $expr: { $gt: [{ $subtract: ['$cantidad', { $ifNull: ['$consumido', 0] }] }, 0] }
                    }).select('_id nombre cantidad consumido unidadMedida precioUnitario');
                    break;
                case 'receta':
                    productos = await RecetaProducto.find({ 
                        activo: true,
                        'inventario.cantidadProducida': { $gt: 0 }
                    }).select('_id nombre inventario costoProduccion rendimiento');
                    break;
                case 'produccion':
                    productos = await Produccion.find({ 
                        estado: 'completada',
                        cantidadProducida: { $gt: 0 }
                    }).select('_id nombre cantidadProducida costoTotal fechaProduccion unidadMedida');
                    break;
            }

            return productos;

        } catch (error) {
            console.error('❌ Error al obtener productos:', error);
            throw error;
        }
    }

    // Eliminar residuo (soft delete)
    async eliminarResiduo(residuoId, usuario) {
        try {
            const residuo = await Residuo.findById(residuoId);
            if (!residuo) {
                throw new Error('Residuo no encontrado');
            }

            // Verificar que solo se puede eliminar el mismo día
            const hoy = new Date();
            const fechaResiduo = new Date(residuo.fecha);
            if (hoy.toDateString() !== fechaResiduo.toDateString()) {
                throw new Error('Solo se pueden eliminar residuos del día actual');
            }

            // Revertir el inventario
            await this.revertirInventario(residuo);

            // Soft delete
            residuo.activo = false;
            await residuo.save();

            return residuo;

        } catch (error) {
            console.error('❌ Error al eliminar residuo:', error);
            throw error;
        }
    }

    // Revertir cambios en inventario
    async revertirInventario(residuo) {
        const { tipoProducto, productoId, cantidadPerdida } = residuo;

        switch (tipoProducto) {
            case 'ingrediente':
                await Ingrediente.findByIdAndUpdate(
                    productoId,
                    { $inc: { procesado: -cantidadPerdida } }
                );
                break;
            case 'material':
                await Material.findByIdAndUpdate(
                    productoId,
                    { $inc: { consumido: -cantidadPerdida } }
                );
                break;
            case 'receta':
                await RecetaProducto.findByIdAndUpdate(
                    productoId,
                    { $inc: { 'inventario.cantidadUtilizada': -cantidadPerdida } }
                );
                break;
            case 'produccion':
                // No se revierte para producciones
                break;
        }
    }

    // Obtener estadísticas básicas
    async obtenerEstadisticas() {
        try {
            const hoy = new Date();
            const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

            const [
                totalResiduosMes,
                costoTotalMes,
                residuosPorTipo,
                residuosPorMotivo
            ] = await Promise.all([
                Residuo.countDocuments({
                    activo: true,
                    fecha: { $gte: inicioMes }
                }),
                Residuo.aggregate([
                    { $match: { activo: true, fecha: { $gte: inicioMes } } },
                    { $group: { _id: null, total: { $sum: '$costoEstimado' } } }
                ]),
                Residuo.aggregate([
                    { $match: { activo: true, fecha: { $gte: inicioMes } } },
                    { $group: { _id: '$tipoProducto', count: { $sum: 1 }, costo: { $sum: '$costoEstimado' } } }
                ]),
                Residuo.aggregate([
                    { $match: { activo: true, fecha: { $gte: inicioMes } } },
                    { $group: { _id: '$motivo', count: { $sum: 1 } } }
                ])
            ]);

            return {
                totalResiduosMes,
                costoTotalMes: costoTotalMes[0]?.total || 0,
                residuosPorTipo,
                residuosPorMotivo
            };

        } catch (error) {
            console.error('❌ Error al obtener estadísticas:', error);
            throw error;
        }
    }
}

module.exports = new ResiduoService();
