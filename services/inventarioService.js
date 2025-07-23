const Ingrediente = require('../models/produccion/Ingrediente');
const RecetaProducto = require('../models/produccion/RecetaProducto');
const MovimientoInventario = require('../models/produccion/MovimientoInventario');
const movimientoUnificadoService = require('./movimientoUnificadoService');

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
            
            const motivo = `Producción manual tradicional - ID: ${produccionId}`;
            
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

    /**
     * Revierte una producción restaurando SOLO el inventario consumido directamente
     * NO restaura los ingredientes que se usaron para hacer las recetas (esos siguen gastados)
     */
    async revertirProduccion(ingredientesUtilizados, recetasUtilizadas, produccionId, operador = 'sistema') {
        const movimientos = [];
        
        try {
            console.log('🔄 === INICIANDO REVERSIÓN DE PRODUCCIÓN ===');
            console.log('🔄 ID de producción:', produccionId);
            console.log('🔄 Operador:', operador);
            console.log('📥 DATOS RECIBIDOS:');
            console.log('   - ingredientesUtilizados cantidad:', ingredientesUtilizados?.length || 0);
            console.log('   - recetasUtilizadas cantidad:', recetasUtilizadas?.length || 0);
            console.log('   - ingredientesUtilizados:', JSON.stringify(ingredientesUtilizados, null, 2));
            console.log('   - recetasUtilizadas:', JSON.stringify(recetasUtilizadas, null, 2));
            
            // 🔧 NUEVO: Verificar si esta es una producción que debería usar los métodos unificados
            try {
                // Buscar movimientos con el ID de producción en diferentes patrones
                const movimientosRelacionados = await MovimientoInventario.find({
                    $or: [
                        // Patrón nuevo: ID en el motivo
                        { motivo: { $regex: `ID: ${produccionId}`, $options: 'i' } },
                        // Patrón nuevo: ID en detalles
                        { 'detalles.produccionId': produccionId }
                    ]
                });
                
                console.log(`🔍 Búsqueda de movimientos para ID ${produccionId}:`);
                console.log(`   - Movimientos encontrados: ${movimientosRelacionados.length}`);
                
                if (movimientosRelacionados.length > 0) {
                    // Verificar si es una producción de receta o tradicional
                    const esReceta = movimientosRelacionados.some(mov => 
                        mov.motivo && mov.motivo.includes('Producción de receta')
                    );
                    
                    const esTradicional = movimientosRelacionados.some(mov => 
                        mov.motivo && (
                            mov.motivo.includes('Producción tradicional') ||
                            mov.motivo.includes('completada')
                        )
                    );
                    
                    console.log(`   - Es receta: ${esReceta}`);
                    console.log(`   - Es tradicional: ${esTradicional}`);
                    
                    if (esReceta) {
                        console.log(`🍳 DETECTADA PRODUCCIÓN DE RECETA - usando revertirProduccionReceta`);
                        return await movimientoUnificadoService.revertirProduccionReceta(produccionId, operador);
                    } else if (esTradicional) {
                        console.log(`📦 DETECTADA PRODUCCIÓN TRADICIONAL - usando revertirProduccionTradicional`);
                        return await movimientoUnificadoService.revertirProduccionTradicional(produccionId, operador);
                    }
                }
            } catch (searchError) {
                console.log(`ℹ️ Error en búsqueda de movimientos:`, searchError.message);
            }
            
            // 🔧 FALLBACK: Si no se detectó ningún patrón moderno, usar método manual tradicional
            console.log(`⚠️ FALLBACK - No se encontraron movimientos unificados, procesando manualmente`);
            console.log(`📦 REVERSIÓN MANUAL - procesando ingredientes y recetas directamente`);
            
            const motivo = `Eliminación producción ${produccionId}`;
            
            // 1. Restaurar ingredientes directos (CORREGIDO: aumentar cantidad Y reducir procesado)
            if (ingredientesUtilizados && ingredientesUtilizados.length > 0) {
                console.log('📦 Restaurando ingredientes directos:', ingredientesUtilizados.length);
                
                for (const [index, item] of ingredientesUtilizados.entries()) {
                    console.log(`🔍 Procesando ingrediente ${index + 1}/${ingredientesUtilizados.length}:`);
                    console.log(`   - Datos del item:`, JSON.stringify(item, null, 2));
                    console.log(`   - ID del ingrediente: ${item.ingrediente}`);
                    console.log(`   - Cantidad a restaurar: ${item.cantidadUtilizada || item.cantidad || 0}`);
                    
                    const ingrediente = await Ingrediente.findById(item.ingrediente);
                    if (ingrediente) {
                        const cantidadARestaurar = item.cantidadUtilizada || item.cantidad || 0;
                        
                        console.log(`🔍 Restaurando ingrediente ${ingrediente.nombre}:`);
                        console.log(`   - Cantidad actual: ${ingrediente.cantidad}`);
                        console.log(`   - Procesado actual: ${ingrediente.procesado}`);
                        console.log(`   - Cantidad a restaurar: ${cantidadARestaurar}`);
                        
                        // CORREGIDO: Restaurar tanto el stock disponible como el procesado
                        const cantidadAnterior = ingrediente.cantidad;
                        const procesadoAnterior = ingrediente.procesado;
                        
                        // ✅ SOLUCIÓN: Restaurar la cantidad disponible (lo que se consumió)
                        ingrediente.cantidad += cantidadARestaurar;
                        
                        // ✅ SOLUCIÓN: Reducir el procesado (revertir el consumo registrado)
                        ingrediente.procesado = Math.max(0, ingrediente.procesado - cantidadARestaurar);
                        
                        await ingrediente.save();
                        
                        console.log(`   - Nueva cantidad: ${ingrediente.cantidad} (+${cantidadARestaurar})`);
                        console.log(`   - Nuevo procesado: ${ingrediente.procesado} (-${cantidadARestaurar})`);
                        
                        // Crear movimiento de restauración con campos correctos
                        const movimiento = new MovimientoInventario({
                            tipo: 'entrada', // ✅ CORRECTO: enum válido
                            tipoItem: 'Ingrediente', // ✅ CORRECTO: enum válido (con mayúscula)
                            item: ingrediente._id, // ✅ CORRECTO: campo 'item' no 'itemId'
                            cantidad: cantidadARestaurar,
                            cantidadAnterior: cantidadAnterior, // ✅ CORRECTO: cantidad anterior
                            cantidadNueva: ingrediente.cantidad, // ✅ CORRECTO: cantidad nueva
                            motivo: `${motivo} - Restauración de ingrediente`,
                            operador
                        });
                        
                        await movimiento.save();
                        movimientos.push(movimiento);
                        
                        console.log(`✅ Restaurado ingrediente ${ingrediente.nombre}: +${cantidadARestaurar} stock disponible, -${cantidadARestaurar} procesado`);
                    } else {
                        console.error(`❌ INGREDIENTE NO ENCONTRADO:`);
                        console.error(`   - ID buscado: ${item.ingrediente}`);
                        console.error(`   - Tipo de ID: ${typeof item.ingrediente}`);
                        console.error(`   - Item completo:`, JSON.stringify(item, null, 2));
                        
                        // Intentar buscar por nombre como fallback
                        console.log(`🔍 Intentando buscar ingrediente por otros medios...`);
                        const ingredientePorNombre = await Ingrediente.findOne({ 
                            $or: [
                                { _id: item.ingrediente },
                                { nombre: item.ingrediente }
                            ]
                        });
                        
                        if (ingredientePorNombre) {
                            console.log(`✅ Ingrediente encontrado por búsqueda alternativa: ${ingredientePorNombre.nombre}`);
                            
                            // Procesar este ingrediente usando el código de arriba
                            const cantidadARestaurar = item.cantidadUtilizada || item.cantidad || 0;
                            
                            console.log(`🔍 Restaurando ingrediente ${ingredientePorNombre.nombre}:`);
                            console.log(`   - Cantidad actual: ${ingredientePorNombre.cantidad}`);
                            console.log(`   - Procesado actual: ${ingredientePorNombre.procesado}`);
                            console.log(`   - Cantidad a restaurar: ${cantidadARestaurar}`);
                            
                            // Restaurar tanto el stock disponible como el procesado
                            const cantidadAnterior = ingredientePorNombre.cantidad;
                            const procesadoAnterior = ingredientePorNombre.procesado;
                            
                            // Restaurar la cantidad disponible (lo que se consumió)
                            ingredientePorNombre.cantidad += cantidadARestaurar;
                            
                            // Reducir el procesado (revertir el consumo registrado)
                            ingredientePorNombre.procesado = Math.max(0, ingredientePorNombre.procesado - cantidadARestaurar);
                            
                            await ingredientePorNombre.save();
                            
                            console.log(`   - Nueva cantidad: ${ingredientePorNombre.cantidad} (+${cantidadARestaurar})`);
                            console.log(`   - Nuevo procesado: ${ingredientePorNombre.procesado} (-${cantidadARestaurar})`);
                            
                            // Crear movimiento de restauración
                            const movimiento = new MovimientoInventario({
                                tipo: 'entrada',
                                tipoItem: 'Ingrediente',
                                item: ingredientePorNombre._id,
                                cantidad: cantidadARestaurar,
                                cantidadAnterior: cantidadAnterior,
                                cantidadNueva: ingredientePorNombre.cantidad,
                                motivo: `${motivo} - Restauración de ingrediente`,
                                operador
                            });
                            
                            await movimiento.save();
                            movimientos.push(movimiento);
                            
                            console.log(`✅ Restaurado ingrediente ${ingredientePorNombre.nombre}: +${cantidadARestaurar} stock disponible, -${cantidadARestaurar} procesado`);
                        } else {
                            console.error(`❌ INGREDIENTE DEFINITIVAMENTE NO ENCONTRADO: ${item.ingrediente}`);
                            console.error(`⚠️ Este error impedirá la reposición completa del stock`);
                        }
                    }
                }
            }
            
            // 2. Restaurar SOLO recetas (reducir cantidadUtilizada)
            if (recetasUtilizadas && recetasUtilizadas.length > 0) {
                console.log('🍳 Restaurando recetas:', recetasUtilizadas.length);
                
                for (const item of recetasUtilizadas) {
                    const receta = await RecetaProducto.findById(item.receta);
                    if (receta) {
                        const cantidadARestaurar = item.cantidadUtilizada || item.cantidad || 0;
                        
                        console.log(`🔍 Restaurando receta ${receta.nombre}:`);
                        console.log(`   - Cantidad utilizada actual: ${receta.inventario?.cantidadUtilizada || 0}`);
                        console.log(`   - Cantidad a restaurar: ${cantidadARestaurar}`);
                        
                        // Restaurar inventario de la receta
                        if (!receta.inventario) {
                            receta.inventario = { cantidadProducida: 0, cantidadUtilizada: 0 };
                        }
                        
                        const cantidadUtilizadaAnterior = receta.inventario.cantidadUtilizada;
                        receta.inventario.cantidadUtilizada = Math.max(0, receta.inventario.cantidadUtilizada - cantidadARestaurar);
                        receta.inventarioDisponible = receta.inventario.cantidadProducida - receta.inventario.cantidadUtilizada;
                        
                        await receta.save();
                        
                        console.log(`   - Nueva cantidad utilizada: ${receta.inventario.cantidadUtilizada}`);
                        console.log(`   - Nuevo disponible: ${receta.inventarioDisponible}`);
                        
                        // Crear movimiento de restauración con campos correctos
                        const movimiento = new MovimientoInventario({
                            tipo: 'entrada', // ✅ CORRECTO: enum válido
                            tipoItem: 'RecetaProducto', // ✅ CORRECTO: enum válido (nombre del modelo)
                            item: receta._id, // ✅ CORRECTO: campo 'item' no 'itemId'
                            cantidad: cantidadARestaurar,
                            cantidadAnterior: cantidadUtilizadaAnterior, // ✅ CORRECTO: valor anterior
                            cantidadNueva: receta.inventario.cantidadUtilizada, // ✅ CORRECTO: valor nuevo
                            motivo: `${motivo} - Restauración de receta`,
                            operador
                        });
                        
                        await movimiento.save();
                        movimientos.push(movimiento);
                        
                        console.log(`✅ Restaurada receta ${receta.nombre}: +${cantidadARestaurar} disponible`);
                    } else {
                        console.log(`⚠️ Receta no encontrada: ${item.receta}`);
                    }
                }
            }
            
            console.log(`✅ Producción ${produccionId} revertida exitosamente`);
            console.log(`📊 Resumen: ${movimientos.length} movimientos de reversión creados`);
            
            return {
                success: true,
                movimientos,
                mensaje: 'Inventario restaurado exitosamente',
                ingredientesRestaurados: ingredientesUtilizados?.length || 0,
                recetasRestauradas: recetasUtilizadas?.length || 0
            };
            
        } catch (error) {
            console.error('❌ Error al revertir producción:', error);
            throw new Error(`Error al revertir producción: ${error.message}`);
        }
    }
}

module.exports = new InventarioService();
