const mongoose = require('mongoose');

/**
 * Script para crear índices optimizados para el módulo de producción
 * Ejecutar después de corregir las rutas y estructuras
 */
class DatabaseIndexes {
    
    /**
     * Crear todos los índices necesarios
     */
    static async createIndexes() {
        try {
            console.log('🔧 Iniciando creación de índices para módulo de producción...');

            // Índices para CatalogoProduccion
            await this.createCatalogoProduccionIndexes();
            
            // Índices para Ingredientes
            await this.createIngredienteIndexes();
            
            // Índices para Materiales
            await this.createMaterialIndexes();
            
            // Índices para Recetas
            await this.createRecetaIndexes();
            
            // Índices para Produccion
            await this.createProduccionIndexes();
            
            // Índices para MovimientoInventario
            await this.createMovimientoInventarioIndexes();
            
            // Índices para InventarioProducto
            await this.createInventarioProductoIndexes();

            console.log('✅ Todos los índices creados exitosamente');

        } catch (error) {
            console.error('❌ Error al crear índices:', error);
            throw error;
        }
    }

    static async createCatalogoProduccionIndexes() {
        const collection = mongoose.connection.collection('catalogoproduccions');
        
        await collection.createIndexes([
            // Búsquedas por nombre (frecuente)
            { key: { nombre: 1 }, name: 'idx_nombre' },
            
            // Búsquedas por módulo del sistema (muy frecuente)
            { key: { moduloSistema: 1, activo: 1 }, name: 'idx_modulo_activo' },
            
            // Búsquedas combinadas frecuentes
            { key: { nombre: 1, moduloSistema: 1, activo: 1 }, name: 'idx_nombre_modulo_activo' },
            
            // Código único
            { key: { codigo: 1 }, name: 'idx_codigo_unique', unique: true, sparse: true },
            
            // Texto completo para búsquedas
            { key: { nombre: 'text', descripcion: 'text' }, name: 'idx_texto_busqueda' }
        ]);
        
        console.log('✅ Índices de CatalogoProduccion creados');
    }

    static async createIngredienteIndexes() {
        const collection = mongoose.connection.collection('ingredientes');
        
        await collection.createIndexes([
            // Búsquedas por nombre (único)
            { key: { nombre: 1 }, name: 'idx_nombre_unique', unique: true },
            
            // Filtros frecuentes
            { key: { activo: 1 }, name: 'idx_activo' },
            { key: { unidadMedida: 1 }, name: 'idx_unidad_medida' },
            
            // Relación con catálogo
            { key: { productoReferencia: 1 }, name: 'idx_producto_referencia' },
            
            // Consultas de stock/disponibilidad
            { key: { cantidad: 1, procesado: 1 }, name: 'idx_stock_disponible' },
            
            // Búsquedas combinadas
            { key: { activo: 1, unidadMedida: 1 }, name: 'idx_activo_unidad' },
            
            // Texto para búsquedas
            { key: { nombre: 'text' }, name: 'idx_texto_ingrediente' }
        ]);
        
        console.log('✅ Índices de Ingredientes creados');
    }

    static async createMaterialIndexes() {
        const collection = mongoose.connection.collection('materials');
        
        await collection.createIndexes([
            // Búsquedas por nombre (único)
            { key: { nombre: 1 }, name: 'idx_nombre_unique', unique: true },
            
            // Filtros frecuentes
            { key: { activo: 1 }, name: 'idx_activo' },
            { key: { unidadMedida: 1 }, name: 'idx_unidad_medida' },
            { key: { proveedor: 1 }, name: 'idx_proveedor' },
            
            // Relación con catálogo
            { key: { productoReferencia: 1 }, name: 'idx_producto_referencia' },
            
            // Gestión de stock bajo
            { key: { cantidad: 1, stockMinimo: 1 }, name: 'idx_stock_minimo' },
            
            // Vencimientos
            { key: { fechaVencimiento: 1 }, name: 'idx_fecha_vencimiento' },
            
            // Lotes
            { key: { numeroLote: 1 }, name: 'idx_numero_lote' },
            
            // Texto para búsquedas
            { key: { nombre: 'text', proveedor: 'text' }, name: 'idx_texto_material' }
        ]);
        
        console.log('✅ Índices de Materiales creados');
    }

    static async createRecetaIndexes() {
        const collection = mongoose.connection.collection('recetaproductos');
        
        await collection.createIndexes([
            // Nombre único
            { key: { nombre: 1 }, name: 'idx_nombre_unique', unique: true },
            
            // Filtros frecuentes
            { key: { activo: 1 }, name: 'idx_activo' },
            { key: { dificultad: 1 }, name: 'idx_dificultad' },
            
            // Ingredientes (para consultas de disponibilidad)
            { key: { 'ingredientes.ingrediente': 1 }, name: 'idx_ingredientes_referencia' },
            
            // Fechas de creación/modificación
            { key: { createdAt: -1 }, name: 'idx_fecha_creacion' },
            
            // Texto para búsquedas
            { key: { nombre: 'text', descripcion: 'text' }, name: 'idx_texto_receta' }
        ]);
        
        console.log('✅ Índices de Recetas creados');
    }

    static async createProduccionIndexes() {
        const collection = mongoose.connection.collection('produccions');
        
        await collection.createIndexes([
            // Nombre único para producciones activas
            { 
                key: { nombre: 1, estado: 1 }, 
                name: 'idx_nombre_estado_unique',
                partialFilterExpression: { estado: { $ne: 'cancelada' } }
            },
            
            // Filtros frecuentes
            { key: { estado: 1 }, name: 'idx_estado' },
            { key: { tipo: 1 }, name: 'idx_tipo' },
            { key: { operador: 1 }, name: 'idx_operador' },
            
            // Fechas (muy importantes para reportes)
            { key: { fechaProduccion: -1 }, name: 'idx_fecha_produccion' },
            { key: { fechaProduccion: -1, estado: 1 }, name: 'idx_fecha_estado' },
            
            // Relación con recetas
            { key: { receta: 1 }, name: 'idx_receta' },
            
            // Ingredientes utilizados (para trazabilidad)
            { key: { 'ingredientesUtilizados.ingrediente': 1 }, name: 'idx_ingredientes_utilizados' },
            { key: { 'recetasUtilizadas.receta': 1 }, name: 'idx_recetas_utilizadas' },
            
            // Costos y cantidades
            { key: { costoTotal: 1 }, name: 'idx_costo_total' },
            { key: { cantidadProducida: 1 }, name: 'idx_cantidad_producida' },
            
            // Compuesto para optimizar consultas frecuentes
            { 
                key: { estado: 1, fechaProduccion: -1, operador: 1 }, 
                name: 'idx_estado_fecha_operador' 
            },
            
            // Texto para búsquedas
            { key: { nombre: 'text', observaciones: 'text' }, name: 'idx_texto_produccion' }
        ]);
        
        console.log('✅ Índices de Producciones creados');
    }

    static async createMovimientoInventarioIndexes() {
        const collection = mongoose.connection.collection('movimientoinventarios');
        
        await collection.createIndexes([
            // Filtros más frecuentes
            { key: { tipo: 1 }, name: 'idx_tipo' },
            { key: { tipoItem: 1 }, name: 'idx_tipo_item' },
            { key: { item: 1 }, name: 'idx_item' },
            { key: { operador: 1 }, name: 'idx_operador' },
            
            // Fechas (crítico para reportes)
            { key: { fecha: -1 }, name: 'idx_fecha' },
            
            // Consultas combinadas más frecuentes
            { key: { item: 1, fecha: -1 }, name: 'idx_item_fecha' },
            { key: { tipoItem: 1, tipo: 1, fecha: -1 }, name: 'idx_tipo_item_tipo_fecha' },
            { key: { operador: 1, fecha: -1 }, name: 'idx_operador_fecha' },
            
            // Para obtener último movimiento de un item
            { key: { item: 1, tipoItem: 1, fecha: -1 }, name: 'idx_ultimo_movimiento' },
            
            // Para reportes de rango de fechas
            { key: { fecha: -1, tipo: 1, tipoItem: 1 }, name: 'idx_fecha_tipo_filtros' },
            
            // Texto para búsquedas en motivos
            { key: { motivo: 'text' }, name: 'idx_texto_motivo' }
        ]);
        
        console.log('✅ Índices de MovimientoInventario creados');
    }

    static async createInventarioProductoIndexes() {
        const collection = mongoose.connection.collection('inventarioproductos');
        
        await collection.createIndexes([
            // Relación con catálogo (única)
            { key: { catalogoProductoId: 1 }, name: 'idx_catalogo_producto_unique', unique: true },
            
            // Stock y disponibilidad
            { key: { stock: 1 }, name: 'idx_stock' },
            { key: { stock: 1, stockMinimo: 1 }, name: 'idx_stock_minimo' },
            
            // Fechas para control
            { key: { fechaUltimaActualizacion: -1 }, name: 'idx_fecha_actualizacion' },
            { key: { createdAt: -1 }, name: 'idx_fecha_creacion' },
            
            // Unidades de medida para filtros
            { key: { unidadMedida: 1 }, name: 'idx_unidad_medida' }
        ]);
        
        console.log('✅ Índices de InventarioProducto creados');
    }

    /**
     * Eliminar índices si es necesario (para desarrollo)
     */
    static async dropIndexes() {
        try {
            const collections = [
                'catalogoproduccions',
                'ingredientes', 
                'materials',
                'recetaproductos',
                'produccions',
                'movimientoinventarios',
                'inventarioproductos'
            ];

            for (const collectionName of collections) {
                try {
                    const collection = mongoose.connection.collection(collectionName);
                    await collection.dropIndexes();
                    console.log(`✅ Índices eliminados de ${collectionName}`);
                } catch (error) {
                    console.warn(`⚠️ No se pudieron eliminar índices de ${collectionName}:`, error.message);
                }
            }
        } catch (error) {
            console.error('❌ Error al eliminar índices:', error);
        }
    }

    /**
     * Mostrar información de índices existentes
     */
    static async showIndexes() {
        try {
            const collections = [
                'catalogoproduccions',
                'ingredientes', 
                'materials',
                'recetaproductos',
                'produccions',
                'movimientoinventarios',
                'inventarioproductos'
            ];

            for (const collectionName of collections) {
                try {
                    const collection = mongoose.connection.collection(collectionName);
                    const indexes = await collection.listIndexes().toArray();
                    
                    console.log(`\n📊 Índices de ${collectionName}:`);
                    indexes.forEach(index => {
                        console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
                    });
                } catch (error) {
                    console.warn(`⚠️ No se pudo obtener información de ${collectionName}:`, error.message);
                }
            }
        } catch (error) {
            console.error('❌ Error al mostrar índices:', error);
        }
    }
}

module.exports = DatabaseIndexes;

// Si se ejecuta directamente
if (require.main === module) {
    (async () => {
        try {
            // Conectar a MongoDB
            await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/produccion', {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });

            console.log('🔗 Conectado a MongoDB');

            // Crear índices
            await DatabaseIndexes.createIndexes();
            
            // Mostrar índices creados
            await DatabaseIndexes.showIndexes();

            // Desconectar
            await mongoose.disconnect();
            console.log('✅ Proceso completado');
        } catch (error) {
            console.error('❌ Error en el proceso:', error);
            process.exit(1);
        }
    })();
}
