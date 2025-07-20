const RecetaProducto = require('../models/pruduccion/RecetaProducto');
const Ingrediente = require('../models/pruduccion/Ingrediente');

class RecetaService {
    // Crear nueva receta
    async crearReceta(datosReceta, consumirIngredientes = true) {
        try {
            console.log('🆕 Creando nueva receta:', datosReceta.nombre);
            console.log('🔧 Consumir ingredientes:', consumirIngredientes);
            console.log('📋 Datos completos recibidos:', JSON.stringify(datosReceta, null, 2));
            
            // Validar datos requeridos
            if (!datosReceta.nombre || datosReceta.nombre.trim() === '') {
                throw new Error('El nombre de la receta es requerido');
            }
            
            if (!datosReceta.rendimiento) {
                throw new Error('El rendimiento es requerido');
            }
            
            if (!datosReceta.rendimiento.cantidad || datosReceta.rendimiento.cantidad <= 0) {
                throw new Error('La cantidad de rendimiento debe ser mayor a 0');
            }
            
            if (!datosReceta.rendimiento.unidadMedida) {
                throw new Error('La unidad de medida del rendimiento es requerida');
            }
            
            if (!datosReceta.ingredientes || datosReceta.ingredientes.length === 0) {
                throw new Error('Debe agregar al menos un ingrediente');
            }

            console.log('✅ Validación inicial exitosa');
            
            // Verificar que no exista una receta con el mismo nombre
            const recetaExistente = await RecetaProducto.findOne({ 
                nombre: datosReceta.nombre.trim(),
                activo: true 
            });
            
            if (recetaExistente) {
                throw new Error(`Ya existe una receta activa con el nombre "${datosReceta.nombre.trim()}". Por favor, elige un nombre diferente.`);
            }
            
            console.log('✅ Verificación de nombre único exitosa');
            
            // Verificar que todos los ingredientes existen y tienen suficiente cantidad
            const ingredientesIds = datosReceta.ingredientes.map(item => item.ingrediente);
            const ingredientesExistentes = await Ingrediente.find({
                _id: { $in: ingredientesIds },
                activo: true
            });

            if (ingredientesExistentes.length !== ingredientesIds.length) {
                throw new Error('Uno o más ingredientes no existen o están inactivos');
            }

            console.log('🧪 Verificando disponibilidad de ingredientes...');

            // Verificar disponibilidad de cada ingrediente (solo si vamos a consumir)
            const ingredientesAConsumir = [];
            for (const itemReceta of datosReceta.ingredientes) {
                // Validar estructura del ingrediente
                if (!itemReceta.ingrediente) {
                    throw new Error('ID del ingrediente es requerido');
                }
                
                if (!itemReceta.cantidad || itemReceta.cantidad <= 0) {
                    throw new Error('La cantidad del ingrediente debe ser mayor a 0');
                }
                
                if (!itemReceta.unidadMedida) {
                    throw new Error('La unidad de medida del ingrediente es requerida');
                }
                
                const ingrediente = ingredientesExistentes.find(
                    ing => ing._id.toString() === itemReceta.ingrediente.toString()
                );
                
                if (!ingrediente) {
                    throw new Error(`Ingrediente no encontrado: ${itemReceta.ingrediente}`);
                }

                if (consumirIngredientes) {
                    const disponible = ingrediente.cantidad - ingrediente.procesado;
                    console.log(`📊 ${ingrediente.nombre}: Disponible ${disponible}, Requerido ${itemReceta.cantidad}`);
                    
                    if (disponible < itemReceta.cantidad) {
                        throw new Error(
                            `Ingrediente ${ingrediente.nombre}: cantidad insuficiente. ` +
                            `Disponible: ${disponible} ${ingrediente.unidadMedida}, ` +
                            `Requerido: ${itemReceta.cantidad} ${itemReceta.unidadMedida}`
                        );
                    }

                    // Preparar para consumo
                    ingredientesAConsumir.push({
                        ingrediente,
                        cantidadAConsumir: itemReceta.cantidad
                    });
                }
            }

            console.log('✅ Disponibilidad verificada. Procediendo a crear receta...');

            // Limpiar y preparar datos para MongoDB
            const datosLimpios = {
                nombre: datosReceta.nombre.trim(),
                descripcion: datosReceta.descripcion || '',
                categoria: 'preparado', // 🎯 CORRECCIÓN: Siempre empezar en preparado
                tiempoPreparacion: Number(datosReceta.tiempoPreparacion) || 0,
                rendimiento: {
                    cantidad: Number(datosReceta.rendimiento.cantidad),
                    unidadMedida: datosReceta.rendimiento.unidadMedida
                },
                ingredientes: datosReceta.ingredientes.map(item => ({
                    ingrediente: item.ingrediente,
                    cantidad: Number(item.cantidad),
                    unidadMedida: item.unidadMedida
                })),
                activo: datosReceta.activo !== undefined ? datosReceta.activo : true,
                // 🎯 AGREGAR: Estados iniciales del flujo de trabajo
                estadoProceso: 'borrador',
                faseActual: 'preparado'
            };

            console.log('📝 Datos limpios para MongoDB:', JSON.stringify(datosLimpios, null, 2));

            // Crear la receta
            const receta = new RecetaProducto(datosLimpios);
            await receta.save();
            
            console.log(`✅ Receta "${receta.nombre}" creada exitosamente con ID: ${receta._id}`);
            
            if (consumirIngredientes) {
                console.log(`🔄 Consumiendo ingredientes...`);

                // Consumir ingredientes del inventario
                for (const { ingrediente, cantidadAConsumir } of ingredientesAConsumir) {
                    const exito = await ingrediente.consumir(
                        cantidadAConsumir, 
                        `Consumido para crear receta: ${receta.nombre}`,
                        'sistema'
                    );
                    if (exito) {
                        await ingrediente.save();
                        console.log(`📉 Consumido ${cantidadAConsumir} ${ingrediente.unidadMedida} de ${ingrediente.nombre}`);
                    } else {
                        // Esto no debería pasar ya que verificamos antes, pero por seguridad
                        throw new Error(`Error al consumir ingrediente ${ingrediente.nombre}`);
                    }
                }

                // Agregar la cantidad producida al inventario de la receta
                const cantidadProducida = datosLimpios.rendimiento.cantidad;
                await receta.agregarAlInventario(cantidadProducida, 'Producción inicial de receta');
                
                console.log(`📈 Agregado ${cantidadProducida} ${receta.rendimiento.unidadMedida} al inventario de la receta`);
                console.log(`🎉 Receta "${receta.nombre}" creada exitosamente y ingredientes consumidos`);
            } else {
                console.log(`✅ Receta "${receta.nombre}" creada exitosamente (sin consumir ingredientes)`);
            }
            
            return await receta.populate('ingredientes.ingrediente');
        } catch (error) {
            console.error('❌ Error al crear receta:', error);
            
            // Si el error es de validación de MongoDB, dar más detalles
            if (error.name === 'ValidationError') {
                const errores = Object.values(error.errors).map(err => err.message);
                throw new Error(`Errores de validación: ${errores.join(', ')}`);
            }
            
            // Si el error es de duplicado (nombre único)
            if (error.code === 11000) {
                // Extraer el nombre duplicado del error
                const nombreDuplicado = error.keyValue?.nombre || 'desconocido';
                throw new Error(`Ya existe una receta con el nombre "${nombreDuplicado}". Por favor, elige un nombre diferente.`);
            }
            
            // Si es un error de MongoDB Server
            if (error.name === 'MongoServerError' && error.code === 11000) {
                const nombreDuplicado = error.keyValue?.nombre || 'desconocido';
                throw new Error(`Ya existe una receta con el nombre "${nombreDuplicado}". Por favor, elige un nombre diferente.`);
            }
            
            throw new Error(`Error al crear receta: ${error.message}`);
        }
    }

    // Obtener todas las recetas
    async obtenerRecetas(filtros = {}) {
        try {
            const query = { activo: true, ...filtros };
            return await RecetaProducto.find(query)
                .populate('ingredientes.ingrediente')
                .sort({ nombre: 1 });
        } catch (error) {
            throw new Error(`Error al obtener recetas: ${error.message}`);
        }
    }

    // Obtener receta por ID
    async obtenerRecetaPorId(id) {
        try {
            const receta = await RecetaProducto.findById(id)
                .populate('ingredientes.ingrediente');
            
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            return receta;
        } catch (error) {
            throw new Error(`Error al obtener receta: ${error.message}`);
        }
    }

    // Verificar disponibilidad para producir
    async verificarDisponibilidad(id, cantidadAPrducir = 1) {
        try {
            const receta = await this.obtenerRecetaPorId(id);
            return await receta.verificarDisponibilidadCompleta(cantidadAPrducir);
        } catch (error) {
            throw new Error(`Error al verificar disponibilidad: ${error.message}`);
        }
    }

    // Calcular costo de producción
    async calcularCosto(id, cantidadAPrducir = 1) {
        try {
            const receta = await this.obtenerRecetaPorId(id);
            const costoUnitario = await receta.calcularCostoTotal();
            
            return {
                costoUnitario,
                costoTotal: costoUnitario * cantidadAPrducir,
                cantidad: cantidadAPrducir
            };
        } catch (error) {
            throw new Error(`Error al calcular costo: ${error.message}`);
        }
    }

    // Actualizar receta
    async actualizarReceta(id, datosActualizados) {
        try {
            console.log('🔧 Actualizando receta:', id);
            console.log('📝 Datos recibidos:', JSON.stringify(datosActualizados, null, 2));

            const recetaAnterior = await this.obtenerRecetaPorId(id);

            // Verificar nuevos ingredientes si se están actualizando
            if (datosActualizados.ingredientes && datosActualizados.ingredientes.length > 0) {
                console.log('🧪 Verificando ingredientes...');
                
                const ingredientesIds = datosActualizados.ingredientes.map(item => {
                    // Manejar tanto objetos como strings para el ID del ingrediente
                    const ingredienteId = typeof item.ingrediente === 'object' 
                        ? item.ingrediente._id || item.ingrediente 
                        : item.ingrediente;
                    return ingredienteId;
                }).filter(id => id); // Filtrar IDs válidos

                if (ingredientesIds.length > 0) {
                    const ingredientesExistentes = await Ingrediente.find({
                        _id: { $in: ingredientesIds },
                        activo: true
                    });

                    console.log(`✅ Ingredientes encontrados: ${ingredientesExistentes.length}/${ingredientesIds.length}`);

                    if (ingredientesExistentes.length !== ingredientesIds.length) {
                        const faltantes = ingredientesIds.filter(id => 
                            !ingredientesExistentes.some(ing => ing._id.toString() === id.toString())
                        );
                        console.log('❌ Ingredientes faltantes:', faltantes);
                        throw new Error(`Uno o más ingredientes no existen o están inactivos: ${faltantes.join(', ')}`);
                    }

                    // Verificar disponibilidad de nuevos ingredientes (solo si es necesario)
                    // Esta validación se puede relajar para la edición
                    console.log('✅ Validación de ingredientes exitosa');
                }
            }

            // Preparar datos para actualización
            const datosLimpios = {
                ...datosActualizados
            };

            // Si hay ingredientes, asegurar que solo tengan el ID
            if (datosLimpios.ingredientes) {
                datosLimpios.ingredientes = datosLimpios.ingredientes.map(item => ({
                    ingrediente: typeof item.ingrediente === 'object' 
                        ? item.ingrediente._id || item.ingrediente 
                        : item.ingrediente,
                    cantidad: Number(item.cantidad),
                    unidadMedida: item.unidadMedida
                }));
            }

            console.log('📝 Datos limpios para actualización:', JSON.stringify(datosLimpios, null, 2));

            // Actualizar la receta
            const recetaActualizada = await RecetaProducto.findByIdAndUpdate(
                id, 
                datosLimpios, 
                { new: true, runValidators: true }
            ).populate('ingredientes.ingrediente');

            if (!recetaActualizada) {
                throw new Error('Receta no encontrada');
            }

            console.log(`✅ Receta "${recetaActualizada.nombre}" actualizada exitosamente`);
            
            return recetaActualizada;
        } catch (error) {
            console.error('❌ Error al actualizar receta:', error);
            throw new Error(`Error al actualizar receta: ${error.message}`);
        }
    }

    // Cambiar categoría de receta
    async cambiarCategoria(id, nuevaCategoria) {
        try {
            const receta = await this.obtenerRecetaPorId(id);

            // Verificaciones específicas según el cambio
            if (receta.categoria === 'preparado' && nuevaCategoria === 'producto_terminado') {
                console.log(`🔄 Cambiando receta "${receta.nombre}" de preparado a producto terminado`);
                
                // Aquí puedes agregar validaciones específicas si es necesario
                // Por ejemplo: verificar que tenga inventario suficiente, etc.
            }

            receta.categoria = nuevaCategoria;
            await receta.save();

            console.log(`✅ Receta "${receta.nombre}" cambiada a categoria "${nuevaCategoria}"`);
            
            return await receta.populate('ingredientes.ingrediente');
        } catch (error) {
            throw new Error(`Error al cambiar categoría de receta: ${error.message}`);
        }
    }

    // Desactivar/eliminar receta
    async desactivarReceta(id) {
        try {
            console.log('🗑️ Desactivando receta:', id);
            
            const receta = await this.obtenerRecetaPorId(id);
            console.log(`📋 Receta a desactivar: "${receta.nombre}"`);

            // Verificar si la receta tiene ingredientes que necesitan ser restaurados
            if (receta.ingredientes && receta.ingredientes.length > 0) {
                console.log('🔄 Restaurando ingredientes al inventario...');
                
                // Restaurar cada ingrediente consumido
                for (const itemReceta of receta.ingredientes) {
                    const ingrediente = await Ingrediente.findById(itemReceta.ingrediente);
                    
                    if (ingrediente && ingrediente.activo) {
                        const cantidadARestaurar = itemReceta.cantidad;
                        const procesadoAnterior = ingrediente.procesado;
                        
                        // Usar el método restaurar del modelo
                        const exito = await ingrediente.restaurar(
                            cantidadARestaurar,
                            `Restaurado por eliminación de receta: ${receta.nombre}`,
                            'sistema'
                        );
                        
                        if (exito) {
                            await ingrediente.save();
                            console.log(`📈 Restaurado ${cantidadARestaurar} ${ingrediente.unidadMedida} de ${ingrediente.nombre}`);
                            console.log(`   Procesado: ${procesadoAnterior} → ${ingrediente.procesado}`);
                        } else {
                            console.warn(`⚠️ No se puede restaurar ${cantidadARestaurar} de ${ingrediente.nombre} - procesado actual: ${ingrediente.procesado}`);
                        }
                    } else {
                        console.warn(`⚠️ Ingrediente ${itemReceta.ingrediente} no encontrado o inactivo`);
                    }
                }
            }

            // Eliminar inventario de la receta (si existe)
            if (receta.inventario && receta.inventario.cantidadProducida > 0) {
                console.log(`📉 Eliminando ${receta.inventario.cantidadProducida} ${receta.rendimiento.unidadMedida} del inventario de recetas`);
                
                // Registrar movimiento de salida del inventario de recetas
                try {
                    const MovimientoInventario = require('../models/pruduccion/MovimientoInventario');
                    await MovimientoInventario.registrarMovimiento({
                        tipo: 'salida',
                        item: receta._id,
                        tipoItem: 'RecetaProducto',
                        cantidad: receta.inventario.cantidadProducida,
                        cantidadAnterior: receta.inventario.cantidadProducida,
                        cantidadNueva: 0,
                        motivo: `Eliminado por desactivación de receta: ${receta.nombre}`,
                        operador: 'sistema'
                    });
                } catch (error) {
                    console.warn('No se pudo registrar movimiento de inventario de recetas:', error.message);
                }

                // Resetear el inventario de la receta
                receta.inventario.cantidadProducida = 0;
                receta.inventario.cantidadUtilizada = 0;
            }

            // Desactivar la receta
            receta.activo = false;
            await receta.save();

            console.log(`✅ Receta "${receta.nombre}" desactivada e inventario restaurado`);
            
            return receta;
        } catch (error) {
            console.error('❌ Error al desactivar receta:', error);
            throw new Error(`Error al desactivar receta: ${error.message}`);
        }
    }

    // ============= NUEVOS MÉTODOS PARA FLUJO DE TRABAJO =============
    
    // Iniciar proceso de producción
    async iniciarProceso(recetaId) {
        try {
            console.log('🚀 Iniciando proceso para receta:', recetaId);
            
            const receta = await RecetaProducto.findById(recetaId);
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            if (!receta.activo) {
                throw new Error('No se puede iniciar proceso en una receta inactiva');
            }
            
            const recetaActualizada = await receta.iniciarProceso();
            await recetaActualizada.populate('ingredientes.ingrediente');
            
            console.log('✅ Proceso iniciado exitosamente');
            return recetaActualizada;
        } catch (error) {
            console.error('❌ Error al iniciar proceso:', error);
            throw new Error(`Error al iniciar proceso: ${error.message}`);
        }
    }

    // Avanzar a la siguiente fase del proceso
    async avanzarFase(recetaId, datosAdicionales = {}) {
        try {
            console.log('⏭️ Avanzando fase para receta:', recetaId);
            console.log('📋 Datos adicionales:', JSON.stringify(datosAdicionales, null, 2));
            
            const receta = await RecetaProducto.findById(recetaId);
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            // Validar ingredientes adicionales si se proporcionan
            if (datosAdicionales.ingredientesAdicionales && datosAdicionales.ingredientesAdicionales.length > 0) {
                const ingredientesIds = datosAdicionales.ingredientesAdicionales.map(item => item.ingrediente);
                const ingredientesExistentes = await Ingrediente.find({
                    _id: { $in: ingredientesIds },
                    activo: true
                });
                
                if (ingredientesExistentes.length !== ingredientesIds.length) {
                    throw new Error('Uno o más ingredientes adicionales no existen o están inactivos');
                }
                
                // Verificar disponibilidad de ingredientes adicionales
                for (const itemReceta of datosAdicionales.ingredientesAdicionales) {
                    const ingrediente = ingredientesExistentes.find(
                        ing => ing._id.toString() === itemReceta.ingrediente.toString()
                    );
                    
                    if (ingrediente) {
                        const disponible = ingrediente.cantidad - ingrediente.procesado;
                        if (disponible < itemReceta.cantidad) {
                            throw new Error(
                                `Ingrediente adicional ${ingrediente.nombre}: cantidad insuficiente. ` +
                                `Disponible: ${disponible} ${ingrediente.unidadMedida}, ` +
                                `Requerido: ${itemReceta.cantidad} ${itemReceta.unidadMedida}`
                            );
                        }
                    }
                }
            }
            
            const recetaActualizada = await receta.avanzarAProximaFase(datosAdicionales);
            await recetaActualizada.populate('ingredientes.ingrediente');
            
            console.log('✅ Fase avanzada exitosamente a:', recetaActualizada.faseActual);
            return recetaActualizada;
        } catch (error) {
            console.error('❌ Error al avanzar fase:', error);
            throw new Error(`Error al avanzar fase: ${error.message}`);
        }
    }

    // Agregar ingrediente a la fase actual
    async agregarIngredienteAFaseActual(recetaId, ingredienteData) {
        try {
            console.log('➕ Agregando ingrediente a fase actual:', recetaId);
            
            const receta = await RecetaProducto.findById(recetaId);
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            // Validar ingrediente
            const ingrediente = await Ingrediente.findById(ingredienteData.ingrediente);
            if (!ingrediente || !ingrediente.activo) {
                throw new Error('Ingrediente no encontrado o inactivo');
            }
            
            // Verificar disponibilidad
            const disponible = ingrediente.cantidad - ingrediente.procesado;
            if (disponible < ingredienteData.cantidad) {
                throw new Error(
                    `Ingrediente ${ingrediente.nombre}: cantidad insuficiente. ` +
                    `Disponible: ${disponible} ${ingrediente.unidadMedida}, ` +
                    `Requerido: ${ingredienteData.cantidad} ${ingredienteData.unidadMedida}`
                );
            }
            
            const recetaActualizada = await receta.agregarIngredienteAFaseActual(ingredienteData);
            await recetaActualizada.populate('ingredientes.ingrediente');
            
            console.log('✅ Ingrediente agregado exitosamente a la fase actual');
            return recetaActualizada;
        } catch (error) {
            console.error('❌ Error al agregar ingrediente a fase actual:', error);
            throw new Error(`Error al agregar ingrediente: ${error.message}`);
        }
    }

    // Pausar proceso
    async pausarProceso(recetaId, motivo = '') {
        try {
            console.log('⏸️ Pausando proceso para receta:', recetaId);
            
            const receta = await RecetaProducto.findById(recetaId);
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            const recetaActualizada = await receta.pausarProceso(motivo);
            await recetaActualizada.populate('ingredientes.ingrediente');
            
            console.log('✅ Proceso pausado exitosamente');
            return recetaActualizada;
        } catch (error) {
            console.error('❌ Error al pausar proceso:', error);
            throw new Error(`Error al pausar proceso: ${error.message}`);
        }
    }

    // Reanudar proceso
    async reanudarProceso(recetaId) {
        try {
            console.log('▶️ Reanudando proceso para receta:', recetaId);
            
            const receta = await RecetaProducto.findById(recetaId);
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            const recetaActualizada = await receta.reanudarProceso();
            await recetaActualizada.populate('ingredientes.ingrediente');
            
            console.log('✅ Proceso reanudado exitosamente');
            return recetaActualizada;
        } catch (error) {
            console.error('❌ Error al reanudar proceso:', error);
            throw new Error(`Error al reanudar proceso: ${error.message}`);
        }
    }

    // 🎯 NUEVO: Reiniciar receta al estado inicial
    async reiniciarReceta(recetaId, motivo = 'Reinicio manual') {
        try {
            console.log('🔄 Reiniciando receta:', recetaId);
            
            const receta = await RecetaProducto.findById(recetaId);
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            const recetaActualizada = await receta.reiniciarReceta(motivo);
            await recetaActualizada.populate('ingredientes.ingrediente');
            
            console.log('✅ Receta reiniciada exitosamente');
            return recetaActualizada;
        } catch (error) {
            console.error('❌ Error al reiniciar receta:', error);
            throw new Error(`Error al reiniciar receta: ${error.message}`);
        }
    }

    // ============= MÉTODOS PARA FLUJO DE TRABAJO =============
    
    // Avanzar fase del proceso de producción
    async avanzarFase(recetaId, datosAdicionales = {}) {
        try {
            console.log('🚀 Avanzando fase de receta:', recetaId);
            console.log('📋 Datos adicionales:', JSON.stringify(datosAdicionales, null, 2));
            
            const receta = await RecetaProducto.findById(recetaId);
            if (!receta) {
                throw new Error('Receta no encontrada');
            }
            
            console.log('📍 Receta actual encontrada:', receta.nombre);
            console.log('📊 Fase actual:', receta.categoria);
            
            // Determinar siguiente fase
            const siguienteFase = this.obtenerSiguienteFase(receta.categoria);
            let nuevaFase = siguienteFase;
            
            // Si la receta ya está terminada, permitir modificaciones sin cambiar de fase
            if (!siguienteFase && receta.categoria === 'producto_terminado') {
                console.log('⚙️ Receta terminada: permitiendo modificaciones sin cambio de fase');
                nuevaFase = 'producto_terminado'; // Mantener la misma fase
            } else if (!siguienteFase) {
                throw new Error('La receta está en una fase no reconocida');
            }
            
            console.log('🎯 Nueva fase:', nuevaFase);
            
            // Procesar ingredientes adicionales si los hay
            if (datosAdicionales.ingredientesAdicionales && datosAdicionales.ingredientesAdicionales.length > 0) {
                console.log('🧪 Procesando ingredientes adicionales...');
                
                const ingredientesAdicionales = datosAdicionales.ingredientesAdicionales;
                const ingredientesIds = ingredientesAdicionales.map(item => item.ingrediente);
                
                // Verificar existencia y disponibilidad
                const ingredientesExistentes = await Ingrediente.find({
                    _id: { $in: ingredientesIds },
                    activo: true
                });
                
                const ingredientesAConsumir = [];
                
                for (const itemReceta of ingredientesAdicionales) {
                    const ingrediente = ingredientesExistentes.find(ing => 
                        ing._id.toString() === itemReceta.ingrediente.toString()
                    );
                    
                    if (!ingrediente) {
                        throw new Error(`Ingrediente no encontrado: ${itemReceta.ingrediente}`);
                    }

                    const disponible = ingrediente.cantidad - ingrediente.procesado;
                    console.log(`📊 ${ingrediente.nombre}: Disponible ${disponible}, Requerido ${itemReceta.cantidad}`);
                    
                    if (disponible < itemReceta.cantidad) {
                        throw new Error(
                            `Ingrediente ${ingrediente.nombre}: cantidad insuficiente. ` +
                            `Disponible: ${disponible} ${ingrediente.unidadMedida}, ` +
                            `Requerido: ${itemReceta.cantidad} ${itemReceta.unidadMedida}`
                        );
                    }

                    ingredientesAConsumir.push({
                        ingrediente,
                        cantidadAConsumir: itemReceta.cantidad
                    });
                }
                
                // Agregar ingredientes a la receta
                for (const item of ingredientesAdicionales) {
                    receta.ingredientes.push({
                        ingrediente: item.ingrediente,
                        cantidad: Number(item.cantidad),
                        unidadMedida: item.unidadMedida
                    });
                }
                
                console.log('📝 Ingredientes adicionales agregados a la receta');
                
                // Consumir ingredientes del inventario
                console.log('🔄 Consumiendo ingredientes adicionales...');
                for (const { ingrediente, cantidadAConsumir } of ingredientesAConsumir) {
                    const exito = await ingrediente.consumir(
                        cantidadAConsumir, 
                        `Consumido al avanzar receta "${receta.nombre}" a ${nuevaFase}`,
                        'sistema'
                    );
                    if (exito) {
                        await ingrediente.save();
                        console.log(`📉 Consumido ${cantidadAConsumir} ${ingrediente.unidadMedida} de ${ingrediente.nombre}`);
                    } else {
                        throw new Error(`Error al consumir ingrediente ${ingrediente.nombre}`);
                    }
                }
            }
            
            // Actualizar fase y notas
            receta.categoria = nuevaFase;
            
            // 🎯 CORRECCIÓN: También actualizar faseActual para consistencia
            const mapeoFaseActual = {
                'preparado': 'preparado',
                'producto_intermedio': 'intermedio',
                'producto_terminado': 'terminado'
            };
            receta.faseActual = mapeoFaseActual[nuevaFase] || 'preparado';
            
            console.log(`🔄 Actualizando: categoria="${nuevaFase}", faseActual="${receta.faseActual}"`);
            
            if (datosAdicionales.notas) {
                if (!receta.notas) receta.notas = [];
                receta.notas.push({
                    fecha: new Date(),
                    texto: datosAdicionales.notas,
                    fase: receta.categoria
                });
            }
            
            if (datosAdicionales.notasNuevaFase) {
                if (!receta.notas) receta.notas = [];
                receta.notas.push({
                    fecha: new Date(),
                    texto: datosAdicionales.notasNuevaFase,
                    fase: siguienteFase
                });
            }
            
            await receta.save();
            
            console.log(`✅ Receta "${receta.nombre}" avanzada exitosamente a ${siguienteFase}`);
            
            // Repoblar la receta para devolver datos completos
            const recetaCompleta = await RecetaProducto.findById(recetaId)
                .populate('ingredientes.ingrediente', 'nombre unidadMedida precioUnitario cantidad procesado')
                .lean();
                
            return recetaCompleta;
            
        } catch (error) {
            console.error('❌ Error al avanzar fase:', error);
            throw new Error(`Error al avanzar fase: ${error.message}`);
        }
    }
    
    // Obtener siguiente fase en el flujo
    obtenerSiguienteFase(faseActual) {
        const flujo = {
            'preparado': 'producto_intermedio',
            'producto_intermedio': 'producto_terminado',
            'producto_terminado': null // Ya está terminado
        };
        
        return flujo[faseActual] || null;
    }
}

module.exports = new RecetaService();
