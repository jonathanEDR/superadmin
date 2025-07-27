#!/usr/bin/env node

/**
 * Script para probar que el mismo producto se puede crear en diferentes categorías
 */

const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Category = require('../models/Category');
const CatalogoProducto = require('../models/CatalogoProducto');

require('dotenv').config();

const DB_CONNECTION = process.env.DB_CONNECTION || 'mongodb://localhost:27017/loginSystem';

async function conectarDB() {
  try {
    await mongoose.connect(DB_CONNECTION);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
  }
}

async function prepararDatosDePrueba() {
  console.log('\n📋 === PREPARANDO DATOS DE PRUEBA ===\n');

  try {
    // 1. Verificar categorías existentes
    console.log('1️⃣ Verificando categorías...');
    let categorias = await Category.find({});
    
    if (categorias.length < 2) {
      console.log('   📝 Creando categorías de prueba...');
      
      const categoriasData = [
        { nombre: 'Pizzas Familiares', descripcion: 'Pizzas para compartir en familia' },
        { nombre: 'Pizzas Personales', descripcion: 'Pizzas individuales' },
        { nombre: 'Bebidas', descripcion: 'Bebidas refrescantes' }
      ];

      for (const catData of categoriasData) {
        const categoriaExistente = await Category.findOne({ nombre: catData.nombre });
        if (!categoriaExistente) {
          const nuevaCategoria = new Category(catData);
          await nuevaCategoria.save();
          console.log(`   ✅ Categoría creada: ${catData.nombre}`);
        }
      }
      
      categorias = await Category.find({});
    }

    console.log(`   📊 Total categorías disponibles: ${categorias.length}`);
    categorias.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat.nombre} (ID: ${cat._id})`);
    });

    // 2. Verificar productos del catálogo
    console.log('\\n2️⃣ Verificando productos del catálogo...');
    const catalogos = await CatalogoProducto.find({ activo: true }).limit(5);
    
    console.log(`   📊 Productos disponibles en catálogo: ${catalogos.length}`);
    catalogos.forEach((cat, index) => {
      console.log(`   ${index + 1}. ${cat.codigoproducto} - ${cat.nombre} (ID: ${cat._id})`);
    });

    return { categorias, catalogos };

  } catch (error) {
    console.error('❌ Error preparando datos:', error);
    throw error;
  }
}

async function probarCreacionProductos() {
  console.log('\\n🧪 === PROBANDO CREACIÓN DE PRODUCTOS ===\\n');

  try {
    const { categorias, catalogos } = await prepararDatosDePrueba();

    if (categorias.length < 2) {
      console.log('❌ Se necesitan al menos 2 categorías para la prueba');
      return;
    }

    if (catalogos.length < 1) {
      console.log('❌ Se necesita al menos 1 producto en el catálogo para la prueba');
      return;
    }

    // Tomar el primer producto del catálogo y las primeras dos categorías
    const productoCatalogo = catalogos[0];
    const categoria1 = categorias[0];
    const categoria2 = categorias[1];

    console.log(`🎯 Probando con producto: ${productoCatalogo.nombre} (${productoCatalogo.codigoproducto})`);
    console.log(`📂 En categorías: "${categoria1.nombre}" y "${categoria2.nombre}"`);

    // 3. Crear el mismo producto en la primera categoría
    console.log('\\n3️⃣ Creando producto en primera categoría...');
    const producto1Data = {
      catalogoProductoId: productoCatalogo._id,
      categoryId: categoria1._id,
      precio: 25.50,
      cantidad: 10,
      creatorName: 'Sistema Test',
      creatorEmail: 'test@sistema.com',
      creatorId: 'test-user-id',
      creatorRole: 'admin'
    };

    const producto1 = new Producto({
      ...producto1Data,
      nombre: productoCatalogo.nombre.toLowerCase(),
      codigoProducto: productoCatalogo.codigoproducto,
      categoryName: categoria1.nombre
    });

    await producto1.save();
    console.log(`   ✅ Producto creado en "${categoria1.nombre}"`);
    console.log(`      - ID: ${producto1._id}`);
    console.log(`      - Código: ${producto1.codigoProducto}`);
    console.log(`      - Precio: S/ ${producto1.precio}`);
    console.log(`      - Cantidad: ${producto1.cantidad}`);

    // 4. Crear el mismo producto en la segunda categoría (diferente precio)
    console.log('\\n4️⃣ Creando el mismo producto en segunda categoría...');
    const producto2Data = {
      catalogoProductoId: productoCatalogo._id,
      categoryId: categoria2._id,
      precio: 15.00, // Precio diferente
      cantidad: 20,   // Cantidad diferente
      creatorName: 'Sistema Test',
      creatorEmail: 'test@sistema.com',
      creatorId: 'test-user-id',
      creatorRole: 'admin'
    };

    const producto2 = new Producto({
      ...producto2Data,
      nombre: productoCatalogo.nombre.toLowerCase(),
      codigoProducto: productoCatalogo.codigoproducto,
      categoryName: categoria2.nombre
    });

    await producto2.save();
    console.log(`   ✅ Mismo producto creado en "${categoria2.nombre}"`);
    console.log(`      - ID: ${producto2._id}`);
    console.log(`      - Código: ${producto2.codigoProducto} (igual al anterior)`);
    console.log(`      - Precio: S/ ${producto2.precio} (diferente)`);
    console.log(`      - Cantidad: ${producto2.cantidad} (diferente)`);

    // 5. Intentar crear duplicado en la misma categoría (debe fallar)
    console.log('\\n5️⃣ Intentando crear duplicado en la misma categoría (debe fallar)...');
    try {
      const productoDuplicado = new Producto({
        ...producto1Data,
        nombre: productoCatalogo.nombre.toLowerCase(),
        codigoProducto: productoCatalogo.codigoproducto,
        categoryName: categoria1.nombre,
        precio: 30.00 // Precio diferente, pero misma categoría
      });

      await productoDuplicado.save();
      console.log('   ❌ ERROR: No debería haber permitido el duplicado');
    } catch (error) {
      if (error.code === 11000) {
        console.log(`   ✅ Correcto: Duplicado rechazado como esperado`);
        console.log(`      Error: ${error.message}`);
      } else {
        throw error;
      }
    }

    // 6. Mostrar resumen final
    console.log('\\n📊 === RESUMEN DE LA PRUEBA ===');
    const todosLosProductos = await Producto.find({}).populate('categoryId');
    
    console.log(`\\n✅ Total productos creados: ${todosLosProductos.length}`);
    todosLosProductos.forEach((p, index) => {
      console.log(`   ${index + 1}. ${p.nombre} (${p.codigoProducto})`);
      console.log(`      Categoría: ${p.categoryId?.nombre || p.categoryName}`);
      console.log(`      Precio: S/ ${p.precio}`);
      console.log(`      Cantidad: ${p.cantidad}`);
      console.log('');
    });

    console.log('🎉 === PRUEBA EXITOSA ===');
    console.log('✅ El mismo producto puede estar en diferentes categorías');
    console.log('✅ Cada combinación tiene su propio precio y cantidad');
    console.log('✅ Los duplicados en la misma categoría son rechazados');

  } catch (error) {
    console.error('❌ Error durante las pruebas:', error);
    throw error;
  }
}

async function main() {
  try {
    await conectarDB();
    await probarCreacionProductos();
    
  } catch (error) {
    console.error('❌ Error en el proceso:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\\n🔌 Conexión cerrada');
    process.exit(0);
  }
}

// Ejecutar solo si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { prepararDatosDePrueba, probarCreacionProductos };
