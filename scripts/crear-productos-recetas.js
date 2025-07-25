const mongoose = require('mongoose');
const CatalogoProduccion = require('../models/produccion/CatalogoProduccion');
require('dotenv').config();

async function crearProductosParaRecetas() {
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventario');
        console.log('✅ Conectado a MongoDB');

        // Productos de ejemplo para recetas
        const productosRecetas = [
            {
                codigo: 'REC001',
                nombre: 'Torta de Chocolate',
                descripcion: 'Torta clásica de chocolate con cobertura',
                moduloSistema: 'recetas',
                unidadMedida: 'unidad',
                categoria: 'postres',
                subcategoria: 'tortas',
                costoEstimado: 25.00,
                activo: true,
                creadoPor: 'Sistema'
            },
            {
                codigo: 'REC002',
                nombre: 'Pan Integral',
                descripcion: 'Pan integral casero con semillas',
                moduloSistema: 'recetas',
                unidadMedida: 'unidad',
                categoria: 'panaderia',
                subcategoria: 'panes',
                costoEstimado: 8.50,
                activo: true,
                creadoPor: 'Sistema'
            },
            {
                codigo: 'REC003',
                nombre: 'Ensalada César',
                descripcion: 'Ensalada césar con pollo y crutones',
                moduloSistema: 'recetas',
                unidadMedida: 'porcion',
                categoria: 'ensaladas',
                subcategoria: 'principales',
                costoEstimado: 15.00,
                activo: true,
                creadoPor: 'Sistema'
            },
            {
                codigo: 'REC004',
                nombre: 'Pasta Carbonara',
                descripcion: 'Pasta con salsa carbonara tradicional',
                moduloSistema: 'recetas',
                unidadMedida: 'porcion',
                categoria: 'pastas',
                subcategoria: 'principales',
                costoEstimado: 18.00,
                activo: true,
                creadoPor: 'Sistema'
            },
            {
                codigo: 'REC005',
                nombre: 'Jugo Natural de Naranja',
                descripcion: 'Jugo natural de naranja recién exprimido',
                moduloSistema: 'recetas',
                unidadMedida: 'lt',
                categoria: 'bebidas',
                subcategoria: 'jugos',
                costoEstimado: 5.00,
                activo: true,
                creadoPor: 'Sistema'
            }
        ];

        console.log('\n🔍 Verificando productos existentes...');
        
        // Verificar cuáles productos ya existen
        for (const producto of productosRecetas) {
            const existente = await CatalogoProduccion.findOne({ 
                codigo: producto.codigo 
            });
            
            if (existente) {
                console.log(`⚠️  Producto ${producto.codigo} - ${producto.nombre} ya existe`);
            } else {
                // Crear el producto
                const nuevoProducto = new CatalogoProduccion(producto);
                await nuevoProducto.save();
                console.log(`✅ Producto creado: ${producto.codigo} - ${producto.nombre}`);
            }
        }

        // Mostrar todos los productos de recetas
        console.log('\n📋 Productos disponibles para recetas:');
        const productosRecetasDb = await CatalogoProduccion.find({ 
            moduloSistema: 'recetas', 
            activo: true 
        }).sort({ codigo: 1 });

        productosRecetasDb.forEach(producto => {
            console.log(`  - ${producto.codigo}: ${producto.nombre} (${producto.categoria})`);
        });

        console.log(`\n✅ Total: ${productosRecetasDb.length} productos disponibles para recetas`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Desconectado de MongoDB');
    }
}

// Ejecutar
crearProductosParaRecetas();
