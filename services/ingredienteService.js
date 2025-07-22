const Ingrediente = require('../models/produccion/Ingrediente');
const MovimientoInventario = require('../models/produccion/MovimientoInventario');

class IngredienteService {
    // Validar nombre único
    async validarNombreUnico(nombre, idExcluir = null) {
        try {
            const query = { 
                nombre: { $regex: new RegExp(`^${nombre.trim()}$`, 'i') },
                activo: true 
            };
            
            if (idExcluir) {
                query._id = { $ne: idExcluir };
            }
            
            const ingredienteExistente = await Ingrediente.findOne(query);
            return !ingredienteExistente;
        } catch (error) {
            throw new Error(`Error al validar nombre: ${error.message}`);
        }
    }

    // Crear nuevo ingrediente
    async crearIngrediente(datosIngrediente) {
        try {
            // Validar que no exista un ingrediente con el mismo nombre
            const ingredienteExistente = await Ingrediente.findOne({ 
                nombre: { $regex: new RegExp(`^${datosIngrediente.nombre.trim()}$`, 'i') },
                activo: true 
            });
            
            if (ingredienteExistente) {
                throw new Error(`Ya existe un ingrediente con el nombre "${datosIngrediente.nombre}". Por favor, use un nombre diferente.`);
            }

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
            // Si el error es de MongoDB por índice único
            if (error.code === 11000) {
                throw new Error(`Ya existe un ingrediente con el nombre "${datosIngrediente.nombre}". Por favor, use un nombre diferente.`);
            }
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
            const CatalogoProduccion = require('../models/produccion/CatalogoProduccion');
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

    // Verificar si un nombre de ingrediente está disponible
    async verificarNombreDisponible(nombre, idExcluir = null) {
        try {
            return await this.validarNombreUnico(nombre, idExcluir);
        } catch (error) {
            throw new Error(`Error al verificar nombre: ${error.message}`);
        }
    }
}

module.exports = new IngredienteService();
