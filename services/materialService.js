const Material = require('../models/pruduccion/Material');
const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');

class MaterialService {
    // Crear nuevo material
    async crearMaterial(datosMaterial) {
        try {
            const material = new Material(datosMaterial);
            await material.save();

            // Registrar movimiento inicial si tiene cantidad
            if (material.cantidad > 0) {
                await MovimientoInventario.registrarMovimiento({
                    tipo: 'entrada',
                    item: material._id,
                    tipoItem: 'Material',
                    cantidad: material.cantidad,
                    cantidadAnterior: 0,
                    cantidadNueva: material.cantidad,
                    motivo: 'Registro inicial de material',
                    operador: 'Sistema'
                });
            }

            return material;
        } catch (error) {
            throw new Error(`Error al crear material: ${error.message}`);
        }
    }

    // Obtener todos los materiales
    async obtenerMateriales(filtros = {}) {
        try {
            const query = { activo: true, ...filtros };
            return await Material.find(query)
                .populate('productoReferencia', 'nombre codigo tipoProduccion')
                .sort({ nombre: 1 });
        } catch (error) {
            throw new Error(`Error al obtener materiales: ${error.message}`);
        }
    }

    // Obtener productos del catálogo disponibles para materiales
    async obtenerProductosCatalogo() {
        try {
            const CatalogoProduccion = require('../models/pruduccion/CatalogoProduccion');
            return await CatalogoProduccion.find({ activo: true })
                .populate('tipoProduccion', 'nombre icono')
                .select('codigo nombre descripcion tipoProduccion unidadMedida')
                .sort({ nombre: 1 });
        } catch (error) {
            throw new Error(`Error al obtener productos del catálogo: ${error.message}`);
        }
    }

    // Obtener material por ID
    async obtenerMaterialPorId(id) {
        try {
            const material = await Material.findById(id)
                .populate('productoReferencia', 'nombre codigo tipoProduccion');
            if (!material) {
                throw new Error('Material no encontrado');
            }
            return material;
        } catch (error) {
            throw new Error(`Error al obtener material: ${error.message}`);
        }
    }

    // Actualizar cantidad de material
    async actualizarCantidad(id, nuevaCantidad, motivo, operador) {
        try {
            const material = await Material.findById(id);
            if (!material) {
                throw new Error('Material no encontrado');
            }

            await material.ajustar(nuevaCantidad, motivo, operador);
            await material.save();

            return material;
        } catch (error) {
            throw new Error(`Error al actualizar cantidad: ${error.message}`);
        }
    }

    // Ajustar inventario
    async ajustarInventario(id, cantidadAjuste, motivo, operador) {
        try {
            const material = await Material.findById(id);
            if (!material) {
                throw new Error('Material no encontrado');
            }

            const nuevaCantidad = material.cantidad + cantidadAjuste;
            
            if (nuevaCantidad < 0) {
                throw new Error('La cantidad resultante no puede ser negativa');
            }

            await material.ajustar(nuevaCantidad, motivo, operador);
            await material.save();

            return material;
        } catch (error) {
            throw new Error(`Error al ajustar inventario: ${error.message}`);
        }
    }

    // Consumir material
    async consumirMaterial(id, cantidad, motivo, operador) {
        try {
            const material = await Material.findById(id);
            if (!material) {
                throw new Error('Material no encontrado');
            }

            const exito = await material.consumir(cantidad, motivo, operador);
            if (!exito) {
                throw new Error(`Stock insuficiente. Disponible: ${material.disponible}, Requerido: ${cantidad}`);
            }

            await material.save();
            return material;
        } catch (error) {
            throw new Error(`Error al consumir material: ${error.message}`);
        }
    }

    // Restaurar material
    async restaurarMaterial(id, cantidad, motivo, operador) {
        try {
            const material = await Material.findById(id);
            if (!material) {
                throw new Error('Material no encontrado');
            }

            const exito = await material.restaurar(cantidad, motivo, operador);
            if (!exito) {
                throw new Error(`No se puede restaurar más de lo consumido. Consumido: ${material.consumido}, Intentando restaurar: ${cantidad}`);
            }

            await material.save();
            return material;
        } catch (error) {
            throw new Error(`Error al restaurar material: ${error.message}`);
        }
    }

    // Agregar stock
    async agregarStock(id, cantidad, motivo, operador) {
        try {
            const material = await Material.findById(id);
            if (!material) {
                throw new Error('Material no encontrado');
            }

            await material.agregarStock(cantidad, motivo, operador);
            await material.save();

            return material;
        } catch (error) {
            throw new Error(`Error al agregar stock: ${error.message}`);
        }
    }

    // Obtener movimientos de un material
    async obtenerMovimientos(id, limite = 50) {
        try {
            return await MovimientoInventario.find({
                item: id,
                tipoItem: 'Material'
            })
            .sort({ fecha: -1 })
            .limit(limite);
        } catch (error) {
            throw new Error(`Error al obtener movimientos: ${error.message}`);
        }
    }

    // Obtener materiales con bajo stock
    async obtenerMaterialesBajoStock() {
        try {
            const materiales = await Material.find({ 
                activo: true,
                $expr: { 
                    $lte: [
                        { $subtract: ['$cantidad', '$consumido'] }, 
                        '$stockMinimo'
                    ] 
                }
            })
            .populate('productoReferencia', 'nombre codigo tipoProduccion')
            .sort({ nombre: 1 });

            return materiales;
        } catch (error) {
            throw new Error(`Error al obtener materiales con bajo stock: ${error.message}`);
        }
    }

    // Obtener estadísticas de materiales
    async obtenerEstadisticas() {
        try {
            const [estadisticas] = await Material.aggregate([
                {
                    $match: { activo: true }
                },
                {
                    $group: {
                        _id: null,
                        totalMateriales: { $sum: 1 },
                        stockTotal: { 
                            $sum: { $subtract: ['$cantidad', '$consumido'] } 
                        },
                        valorTotal: { 
                            $sum: { 
                                $multiply: [
                                    { $subtract: ['$cantidad', '$consumido'] },
                                    '$precioUnitario'
                                ] 
                            } 
                        },
                        materialesBajoStock: {
                            $sum: {
                                $cond: [
                                    { 
                                        $lte: [
                                            { $subtract: ['$cantidad', '$consumido'] }, 
                                            '$stockMinimo'
                                        ] 
                                    },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]);

            return estadisticas || {
                totalMateriales: 0,
                stockTotal: 0,
                valorTotal: 0,
                materialesBajoStock: 0
            };
        } catch (error) {
            throw new Error(`Error al obtener estadísticas: ${error.message}`);
        }
    }

    // Desactivar material
    async desactivarMaterial(id) {
        try {
            const material = await Material.findById(id);
            if (!material) {
                throw new Error('Material no encontrado');
            }

            material.activo = false;
            await material.save();

            return material;
        } catch (error) {
            throw new Error(`Error al desactivar material: ${error.message}`);
        }
    }

    // Activar material
    async activarMaterial(id) {
        try {
            const material = await Material.findById(id);
            if (!material) {
                throw new Error('Material no encontrado');
            }

            material.activo = true;
            await material.save();

            return material;
        } catch (error) {
            throw new Error(`Error al activar material: ${error.message}`);
        }
    }
}

module.exports = new MaterialService();
