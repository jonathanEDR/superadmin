const Ingrediente = require('../models/pruduccion/Ingrediente');
const RecetaProducto = require('../models/pruduccion/RecetaProducto');
const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');

class InventarioService {
    
    /**
     * Actualiza el inventario de ingredientes cuando se utilizan
     */
    async actualizarInventarioIngredientes(ingredientesUtilizados, motivo = 'Utilizado en producción', operador = 'sistema') {
        const movimientos = [];
        
        for (const item of ingredientesUtilizados) {
            const ingrediente = await Ingrediente.findById(item.ingrediente);
            if (!ingrediente) {
                throw new Error(`Ingrediente no encontrado: ${item.ingrediente}`);
            }
            
            // Verificar disponibilidad
            if (!ingrediente.verificarDisponibilidad(item.cantidad)) {
                throw new Error(`Ingrediente insuficiente: ${ingrediente.nombre}. Disponible: ${ingrediente.total}, Requerido: ${item.cantidad}`);
            }
            
            // Actualizar procesado
            const cantidadAnterior = ingrediente.procesado;
            ingrediente.procesado += item.cantidad;
            await ingrediente.save();
            
            // Registrar movimiento
            const movimiento = await MovimientoInventario.registrarMovimiento({
                tipo: 'salida',
                item: ingrediente._id,
                tipoItem: 'Ingrediente',
                cantidad: item.cantidad,
                cantidadAnterior: cantidadAnterior,
                cantidadNueva: ingrediente.procesado,
                motivo: motivo,
                operador: operador
            });
            
            movimientos.push(movimiento);
        }
        
        return movimientos;
    }
    
    /**
     * Actualiza el inventario de recetas cuando se utilizan
     */
    async actualizarInventarioRecetas(recetasUtilizadas, motivo = 'Utilizada en producción', operador = 'sistema') {
        const movimientos = [];
        
        for (const item of recetasUtilizadas) {
            const receta = await RecetaProducto.findById(item.receta);
            if (!receta) {
                throw new Error(`Receta no encontrada: ${item.receta}`);
            }
            
            // Verificar disponibilidad
            if (!receta.verificarDisponibilidadInventario(item.cantidad)) {
                throw new Error(`Inventario de receta insuficiente: ${receta.nombre}. Disponible: ${receta.inventarioDisponible}, Requerido: ${item.cantidad}`);
            }
            
            // Usar receta (actualiza inventario y registra movimiento)
            await receta.usarReceta(item.cantidad, motivo);
            
            // Obtener el movimiento que se registró
            const movimiento = await MovimientoInventario.findOne({
                item: receta._id,
                tipoItem: 'RecetaProducto'
            }).sort({ createdAt: -1 }).limit(1);
            
            movimientos.push(movimiento);
        }
        
        return movimientos;
    }
    
    /**
     * Verifica la disponibilidad total antes de procesar una producción
     */
    async verificarDisponibilidadCompleta(ingredientesRequeridos, recetasRequeridas) {
        const problemas = [];
        
        // Verificar ingredientes
        for (const item of ingredientesRequeridos) {
            const ingrediente = await Ingrediente.findById(item.ingrediente);
            if (!ingrediente) {
                problemas.push(`Ingrediente no encontrado: ${item.ingrediente}`);
                continue;
            }
            
            if (!ingrediente.verificarDisponibilidad(item.cantidad)) {
                problemas.push(`${ingrediente.nombre}: requerido ${item.cantidad}, disponible ${ingrediente.total}`);
            }
        }
        
        // Verificar recetas
        for (const item of recetasRequeridas) {
            const receta = await RecetaProducto.findById(item.receta);
            if (!receta) {
                problemas.push(`Receta no encontrada: ${item.receta}`);
                continue;
            }
            
            if (!receta.verificarDisponibilidadInventario(item.cantidad)) {
                problemas.push(`${receta.nombre}: requerido ${item.cantidad}, disponible ${receta.inventarioDisponible}`);
            }
        }
        
        return {
            disponible: problemas.length === 0,
            problemas
        };
    }
    
    /**
     * Procesa una producción completa actualizando todos los inventarios
     */
    async procesarProduccion(ingredientesUtilizados, recetasUtilizadas, produccionId, operador = 'sistema') {
        const movimientos = [];
        
        try {
            // Verificar disponibilidad completa primero
            const verificacion = await this.verificarDisponibilidadCompleta(ingredientesUtilizados, recetasUtilizadas);
            if (!verificacion.disponible) {
                throw new Error(`Inventario insuficiente: ${verificacion.problemas.join(', ')}`);
            }
            
            const motivo = `Producción ${produccionId}`;
            
            // Actualizar ingredientes
            if (ingredientesUtilizados.length > 0) {
                const movimientosIngredientes = await this.actualizarInventarioIngredientes(ingredientesUtilizados, motivo, operador);
                movimientos.push(...movimientosIngredientes);
            }
            
            // Actualizar recetas
            if (recetasUtilizadas.length > 0) {
                const movimientosRecetas = await this.actualizarInventarioRecetas(recetasUtilizadas, motivo, operador);
                movimientos.push(...movimientosRecetas);
            }
            
            return {
                success: true,
                movimientos
            };
            
        } catch (error) {
            throw new Error(`Error al procesar producción: ${error.message}`);
        }
    }
    
    /**
     * Obtiene estadísticas del inventario
     */
    async obtenerEstadisticasInventario() {
        // Estadísticas de ingredientes
        const ingredientes = await Ingrediente.find({ activo: true });
        const estadisticasIngredientes = {
            total: ingredientes.length,
            conStock: ingredientes.filter(i => i.total > 0).length,
            sinStock: ingredientes.filter(i => i.total <= 0).length,
            valorTotal: ingredientes.reduce((total, i) => total + (i.cantidad * i.precioUnitario), 0)
        };
        
        // Estadísticas de recetas
        const recetas = await RecetaProducto.find({ activo: true });
        const estadisticasRecetas = {
            total: recetas.length,
            conInventario: recetas.filter(r => r.inventarioDisponible > 0).length,
            sinInventario: recetas.filter(r => r.inventarioDisponible <= 0).length
        };
        
        return {
            ingredientes: estadisticasIngredientes,
            recetas: estadisticasRecetas
        };
    }
}

module.exports = new InventarioService();
