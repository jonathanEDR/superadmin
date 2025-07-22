const CatalogoProduccion = require('../models/produccion/CatalogoProduccion');
const mongoose = require('mongoose');

class CatalogoProduccionService {
    
    // ==================== GESTIÓN DE MÓDULOS DEL SISTEMA ====================
    
    obtenerModulosDisponibles() {
        return [
            { 
                id: 'ingredientes', 
                nombre: 'Ingredientes', 
                descripcion: 'Productos para gestión de ingredientes',
                icono: '🥬',
                color: '#10B981'
            },
            { 
                id: 'materiales', 
                nombre: 'Materiales', 
                descripcion: 'Productos para gestión de materiales',
                icono: '🧱',
                color: '#F59E0B'
            },
            { 
                id: 'recetas', 
                nombre: 'Recetas', 
                descripcion: 'Productos para gestión de recetas',
                icono: '📝',
                color: '#8B5CF6'
            },
            { 
                id: 'produccion', 
                nombre: 'Producción', 
                descripcion: 'Productos para gestión de producción',
                icono: '🏭',
                color: '#3B82F6'
            }
        ];
    }
    
    // ==================== GESTIÓN DEL CATÁLOGO ====================
    
    async obtenerProductosCatalogo(filtros = {}) {
        try {
            let query = {};
            
            if (filtros.activo !== undefined) {
                query.activo = filtros.activo;
            }
            
            if (filtros.moduloSistema) {
                query.moduloSistema = filtros.moduloSistema;
            }
            
            if (filtros.categoria) {
                query.categoria = { $regex: filtros.categoria, $options: 'i' };
            }
            
            if (filtros.buscar) {
                query.$or = [
                    { nombre: { $regex: filtros.buscar, $options: 'i' } },
                    { codigo: { $regex: filtros.buscar, $options: 'i' } },
                    { descripcion: { $regex: filtros.buscar, $options: 'i' } }
                ];
            }
            
            // Usar aggregation para incluir información del inventario
            const pipeline = [
                { $match: query },
                { $sort: { codigo: 1 } },
                
                // Lookup para obtener stock actual del inventario
                {
                    $lookup: {
                        from: 'inventarioproductos',
                        localField: '_id',
                        foreignField: 'catalogoProductoId',
                        as: 'inventarioInfo'
                    }
                },
                
                // Agregar campo stockActual
                {
                    $addFields: {
                        stockActual: {
                            $ifNull: [
                                { $arrayElemAt: ['$inventarioInfo.stock', 0] },
                                0
                            ]
                        },
                        costoUnitarioInventario: {
                            $ifNull: [
                                { $arrayElemAt: ['$inventarioInfo.costoUnitario', 0] },
                                '$precio'
                            ]
                        }
                    }
                }
            ];
            
            return await CatalogoProduccion.aggregate(pipeline);
        } catch (error) {
            throw new Error(`Error al obtener productos del catálogo: ${error.message}`);
        }
    }
    
    async obtenerProductoCatalogoPorId(id) {
        try {
            // Usar aggregation para incluir información del inventario
            const pipeline = [
                { $match: { _id: mongoose.Types.ObjectId(id) } },
                
                // Lookup para obtener stock actual del inventario
                {
                    $lookup: {
                        from: 'inventarioproductos',
                        localField: '_id',
                        foreignField: 'catalogoProductoId',
                        as: 'inventarioInfo'
                    }
                },
                
                // Agregar campo stockActual
                {
                    $addFields: {
                        stockActual: {
                            $ifNull: [
                                { $arrayElemAt: ['$inventarioInfo.stock', 0] },
                                0
                            ]
                        },
                        costoUnitarioInventario: {
                            $ifNull: [
                                { $arrayElemAt: ['$inventarioInfo.costoUnitario', 0] },
                                '$precio'
                            ]
                        }
                    }
                }
            ];
            
            const resultado = await CatalogoProduccion.aggregate(pipeline);
            const producto = resultado[0];
                
            if (!producto) {
                throw new Error('Producto no encontrado en el catálogo');
            }
            
            return producto;
        } catch (error) {
            throw new Error(`Error al obtener producto del catálogo: ${error.message}`);
        }
    }
    
    async crearProductoCatalogo(datos, usuario) {
        try {
            console.log('🔄 Creando producto en catálogo:', datos);
            
            const producto = new CatalogoProduccion({
                ...datos,
                creadoPor: usuario?.userId || 'sistema'
            });
            
            const productoCreaado = await producto.save();
            console.log('✅ Producto creado:', productoCreaado);
            
            return productoCreaado;
        } catch (error) {
            console.error('❌ Error al crear producto:', error);
            if (error.code === 11000) {
                throw new Error('Ya existe un producto con ese código');
            }
            throw new Error(`Error al crear producto: ${error.message}`);
        }
    }
    
    async actualizarProductoCatalogo(id, datos) {
        try {
            console.log('🔄 Actualizando producto:', id, datos);
            
            const producto = await CatalogoProduccion.findByIdAndUpdate(
                id, 
                datos, 
                { new: true, runValidators: true }
            );
            
            if (!producto) {
                throw new Error('Producto no encontrado en el catálogo');
            }
            
            console.log('✅ Producto actualizado:', producto);
            return producto;
        } catch (error) {
            console.error('❌ Error al actualizar producto:', error);
            throw new Error(`Error al actualizar producto: ${error.message}`);
        }
    }
    
    async desactivarProductoCatalogo(id) {
        try {
            console.log('🔄 Desactivando producto:', id);
            
            const producto = await CatalogoProduccion.findByIdAndUpdate(
                id,
                { activo: false },
                { new: true }
            );
            
            if (!producto) {
                throw new Error('Producto no encontrado');
            }
            
            console.log('✅ Producto desactivado:', producto);
            return producto;
        } catch (error) {
            console.error('❌ Error al desactivar producto:', error);
            throw new Error(`Error al desactivar producto: ${error.message}`);
        }
    }
    
    async activarProductoCatalogo(id) {
        try {
            console.log('🔄 Activando producto:', id);
            
            const producto = await CatalogoProduccion.findByIdAndUpdate(
                id,
                { activo: true },
                { new: true }
            );
            
            if (!producto) {
                throw new Error('Producto no encontrado');
            }
            
            console.log('✅ Producto activado:', producto);
            return producto;
        } catch (error) {
            console.error('❌ Error al activar producto:', error);
            throw new Error(`Error al activar producto: ${error.message}`);
        }
    }

    async eliminarProductoCatalogo(id) {
        try {
            console.log('🔄 Eliminando producto completamente:', id);
            
            const producto = await CatalogoProduccion.findByIdAndDelete(id);
            
            if (!producto) {
                throw new Error('Producto no encontrado');
            }
            
            console.log('✅ Producto eliminado completamente');
            return { success: true, message: 'Producto eliminado exitosamente' };
        } catch (error) {
            console.error('❌ Error al eliminar producto:', error);
            throw new Error(`Error al eliminar producto: ${error.message}`);
        }
    }
    
    async obtenerEstadisticasCatalogo() {
        try {
            const [totalProductos, productosActivos, estadisticasPorModulo] = await Promise.all([
                CatalogoProduccion.countDocuments(),
                CatalogoProduccion.countDocuments({ activo: true }),
                CatalogoProduccion.aggregate([
                    {
                        $group: {
                            _id: '$moduloSistema',
                            total: { $sum: 1 },
                            activos: { 
                                $sum: { $cond: [{ $eq: ['$activo', true] }, 1, 0] } 
                            }
                        }
                    }
                ])
            ]);
            
            const modulosConProductos = estadisticasPorModulo.length;
            
            return {
                totalProductos,
                productosActivos,
                productosInactivos: totalProductos - productosActivos,
                modulosConProductos,
                estadisticasPorModulo
            };
        } catch (error) {
            throw new Error(`Error al obtener estadísticas: ${error.message}`);
        }
    }
    
    async generarCodigoAutomatico(moduloSistema) {
        try {
            const prefijos = {
                ingredientes: 'ING',
                materiales: 'MAT', 
                recetas: 'REC',
                produccion: 'PRO'
            };
            
            const prefijo = prefijos[moduloSistema] || 'GEN';
            
            // Buscar el último código para este módulo
            const ultimoProducto = await CatalogoProduccion.findOne({
                codigo: { $regex: `^${prefijo}-` }
            }).sort({ codigo: -1 });
            
            let siguienteNumero = 1;
            
            if (ultimoProducto && ultimoProducto.codigo) {
                const numeroActual = parseInt(ultimoProducto.codigo.split('-')[1]) || 0;
                siguienteNumero = numeroActual + 1;
            }
            
            // Formatear con ceros a la izquierda (4 dígitos)
            const numeroFormateado = String(siguienteNumero).padStart(4, '0');
            
            return `${prefijo}-${numeroFormateado}`;
        } catch (error) {
            // Fallback en caso de error
            console.warn('Error al generar código desde BD, usando fallback:', error.message);
            const prefijos = {
                ingredientes: 'ING',
                materiales: 'MAT', 
                recetas: 'REC',
                produccion: 'PRO'
            };
            
            const prefijo = prefijos[moduloSistema] || 'GEN';
            const numero = String(Math.floor(Math.random() * 9000) + 1000);
            
            return `${prefijo}-${numero}`;
        }
    }
    
    // ==================== MÉTODOS PARA INGREDIENTES/MATERIALES ====================
    
    async obtenerProductosParaIngredientes() {
        return this.obtenerProductosCatalogo({ 
            moduloSistema: 'ingredientes', 
            activo: true 
        });
    }
    
    async obtenerProductosParaMateriales() {
        return this.obtenerProductosCatalogo({ 
            moduloSistema: 'materiales', 
            activo: true 
        });
    }
    
    async obtenerProductosParaRecetas() {
        return this.obtenerProductosCatalogo({ 
            moduloSistema: 'recetas', 
            activo: true 
        });
    }
    
    async obtenerProductosParaProduccion() {
        return this.obtenerProductosCatalogo({ 
            moduloSistema: 'produccion', 
            activo: true 
        });
    }
}

module.exports = new CatalogoProduccionService();
