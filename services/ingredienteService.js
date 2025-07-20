const Ingrediente = require('../models/pruduccion/Ingrediente');
const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');

class IngredienteService {
    // Crear nuevo ingrediente
    async crearIngrediente(datosIngrediente) {
        try {
            const ingrediente = new Ingrediente(datosIngrediente);
            await ingrediente.save();

            // Registrar movimiento inicial si tiene cantidad
            if (ingrediente.cantidad > 0) {
                await MovimientoInventario.registrarMovimiento({
                    tipo: 'entrada',
                    item: ingrediente._id,
                    tipoItem: 'Ingrediente',
                    cantidad: ingrediente.cantidad,
                    cantidadAnterior: 0,
                    cantidadNueva: ingrediente.cantidad,
                    motivo: 'Registro inicial de ingrediente',
                    operador: 'Sistema'
                });
            }

            return ingrediente;
        } catch (error) {
            throw new Error(`Error al crear ingrediente: ${error.message}`);
        }
    }

    // Obtener todos los ingredientes
    async obtenerIngredientes(filtros = {}) {
        try {
            const query = { activo: true, ...filtros };
            return await Ingrediente.find(query)
                .populate('productoReferencia', 'nombre codigo tipoProduccion')
                .sort({ nombre: 1 });
        } catch (error) {
            throw new Error(`Error al obtener ingredientes: ${error.message}`);
        }
    }

    // Obtener productos del catálogo disponibles para ingredientes
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

    // Obtener ingrediente por ID
    async obtenerIngredientePorId(id) {
        try {
            const ingrediente = await Ingrediente.findById(id);
            if (!ingrediente) {
                throw new Error('Ingrediente no encontrado');
            }
            return ingrediente;
        } catch (error) {
            throw new Error(`Error al obtener ingrediente: ${error.message}`);
        }
    }

    // Actualizar cantidad de ingrediente
    async actualizarCantidad(id, nuevaCantidad, motivo, operador) {
        try {
            const ingrediente = await this.obtenerIngredientePorId(id);
            const cantidadAnterior = ingrediente.cantidad;
            
            ingrediente.cantidad = nuevaCantidad;
            await ingrediente.save();

            // Registrar movimiento
            await MovimientoInventario.registrarMovimiento({
                tipo: nuevaCantidad > cantidadAnterior ? 'entrada' : 'salida',
                item: ingrediente._id,
                tipoItem: 'Ingrediente',
                cantidad: Math.abs(nuevaCantidad - cantidadAnterior),
                cantidadAnterior,
                cantidadNueva: nuevaCantidad,
                motivo,
                operador
            });

            return ingrediente;
        } catch (error) {
            throw new Error(`Error al actualizar cantidad: ${error.message}`);
        }
    }

    // Ajustar inventario
    async ajustarInventario(id, cantidadAjuste, motivo, operador) {
        try {
            const ingrediente = await this.obtenerIngredientePorId(id);
            const cantidadAnterior = ingrediente.cantidad;
            const nuevaCantidad = cantidadAnterior + cantidadAjuste;

            if (nuevaCantidad < 0) {
                throw new Error('La cantidad resultante no puede ser negativa');
            }

            ingrediente.cantidad = nuevaCantidad;
            await ingrediente.save();

            // Registrar movimiento
            await MovimientoInventario.registrarMovimiento({
                tipo: 'ajuste',
                item: ingrediente._id,
                tipoItem: 'Ingrediente',
                cantidad: Math.abs(cantidadAjuste),
                cantidadAnterior,
                cantidadNueva: nuevaCantidad,
                motivo,
                operador
            });

            return ingrediente;
        } catch (error) {
            throw new Error(`Error al ajustar inventario: ${error.message}`);
        }
    }

    // Obtener movimientos de un ingrediente
    async obtenerMovimientos(id, limite = 50) {
        try {
            return await MovimientoInventario.find({
                item: id,
                tipoItem: 'Ingrediente'
            })
            .sort({ fecha: -1 })
            .limit(limite);
        } catch (error) {
            throw new Error(`Error al obtener movimientos: ${error.message}`);
        }
    }
}

module.exports = new IngredienteService();
