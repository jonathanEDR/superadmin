const XLSX = require('xlsx');
const Category = require('../models/Category');
const CatalogoProducto = require('../models/CatalogoProducto');
const Producto = require('../models/Producto');

const bulkUploadService = {
  /**
   * Generar Excel pre-poblado con todas las combinaciones posibles
   * de categorías y productos del catálogo
   */
  async generatePrePopulatedExcel() {
    try {
      console.log('[bulkUpload] Generando Excel pre-poblado');

      // 1. Obtener todas las categorías activas
      const categorias = await Category.find({ estado: 'activo' })
        .sort({ nombre: 1 })
        .lean();

      // 2. Obtener todos los productos del catálogo activos
      const catalogoProductos = await CatalogoProducto.find({ activo: true })
        .sort({ nombre: 1 })
        .lean();

      console.log(`[bulkUpload] ${categorias.length} categorías, ${catalogoProductos.length} productos del catálogo`);

      if (categorias.length === 0) {
        throw {
          status: 400,
          message: 'No hay categorías activas disponibles. Por favor, crea al menos una categoría primero.'
        };
      }

      if (catalogoProductos.length === 0) {
        throw {
          status: 400,
          message: 'No hay productos en el catálogo disponibles. Por favor, agrega productos al catálogo primero.'
        };
      }

      // 3. Generar todas las combinaciones posibles
      const combinaciones = [];

      for (const categoria of categorias) {
        for (const producto of catalogoProductos) {
          // Verificar si ya existe esta combinación
          const existe = await Producto.findOne({
            categoryId: categoria._id,
            catalogoProductoId: producto._id
          });

          // Solo agregar si NO existe (para evitar duplicados)
          if (!existe) {
            combinaciones.push({
              categoryId: categoria._id.toString(),
              categoria: categoria.nombre,
              catalogoProductoId: producto._id.toString(),
              codigo: producto.codigoproducto || producto.codigoProducto || '',
              nombre: producto.nombre,
              precio: '', // Vacío para que el usuario lo llene
              cantidad: '', // Vacío para que el usuario lo llene
              descripcion: producto.descripcion || ''
            });
          }
        }
      }

      console.log(`[bulkUpload] ${combinaciones.length} combinaciones disponibles para agregar`);

      if (combinaciones.length === 0) {
        throw {
          status: 400,
          message: 'No hay combinaciones disponibles para agregar. Todas las combinaciones de categorías y productos ya están registradas.',
          details: `Total de categorías: ${categorias.length}, Total de productos: ${catalogoProductos.length}`
        };
      }

      // 4. Crear Excel
      const worksheet = XLSX.utils.json_to_sheet(combinaciones);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos Disponibles');

      // 5. Configurar anchos de columna
      worksheet['!cols'] = [
        { wch: 25 },  // categoryId
        { wch: 15 },  // categoria
        { wch: 25 },  // catalogoProductoId
        { wch: 12 },  // codigo
        { wch: 35 },  // nombre
        { wch: 10 },  // precio
        { wch: 10 },  // cantidad
        { wch: 40 }   // descripcion
      ];

      // 6. Agregar instrucciones en una segunda hoja
      const instrucciones = [
        { paso: '1️⃣', instruccion: 'Llena las columnas PRECIO y CANTIDAD para los productos que deseas agregar' },
        { paso: '2️⃣', instruccion: 'ELIMINA las filas de productos que NO quieras agregar' },
        { paso: '3️⃣', instruccion: 'NO modifiques las columnas: categoryId, catalogoProductoId, codigo, nombre, categoria' },
        { paso: '4️⃣', instruccion: 'El precio debe ser mayor a 0' },
        { paso: '5️⃣', instruccion: 'La cantidad debe ser mayor o igual a 0' },
        { paso: '6️⃣', instruccion: 'Guarda el archivo y súbelo en el sistema' },
        { paso: '', instruccion: '' },
        { paso: '✅', instruccion: 'VENTAJAS DE ESTE SISTEMA:' },
        { paso: '', instruccion: '• Cero errores de tipeo en nombres o códigos' },
        { paso: '', instruccion: '• IDs correctos garantizados desde el inicio' },
        { paso: '', instruccion: '• Solo necesitas llenar precio y cantidad' },
        { paso: '', instruccion: '• El sistema evita duplicados automáticamente' }
      ];

      const worksheetInstrucciones = XLSX.utils.json_to_sheet(instrucciones);
      worksheetInstrucciones['!cols'] = [
        { wch: 8 },   // paso
        { wch: 100 }  // instruccion
      ];
      XLSX.utils.book_append_sheet(workbook, worksheetInstrucciones, 'Instrucciones');

      // 7. Generar buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return {
        buffer,
        stats: {
          categorias: categorias.length,
          catalogoProductos: catalogoProductos.length,
          combinacionesDisponibles: combinaciones.length
        }
      };

    } catch (error) {
      console.error('[bulkUpload] Error al generar Excel:', error);
      throw error.status ? error : {
        status: 500,
        message: 'Error al generar archivo Excel',
        details: error.message
      };
    }
  },

  /**
   * Procesar Excel completado por el usuario
   */
  async processCompletedExcel(fileBuffer, userData) {
    try {
      console.log('[bulkUpload] Procesando Excel completado');

      // 1. Parsear Excel
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      console.log(`[bulkUpload] ${data.length} filas recibidas`);

      if (data.length === 0) {
        throw { status: 400, message: 'El archivo Excel está vacío' };
      }

      if (data.length > 1000) {
        throw {
          status: 400,
          message: 'El archivo excede el límite de 1000 productos'
        };
      }

      // 2. Validar estructura
      this.validateExcelStructure(data[0]);

      // 3. Procesar cada fila
      const results = {
        totalRows: data.length,
        created: [],
        skipped: [],
        failed: [],
        summary: {
          created: 0,
          skipped: 0,
          failed: 0
        }
      };

      for (let i = 0; i < data.length; i++) {
        const rowData = data[i];
        const rowNumber = i + 2; // +2 porque Excel empieza en 1 y tiene header

        try {
          // Validar que tenga precio y cantidad (filas sin llenar se saltan)
          if (!rowData.precio || rowData.precio === '' || !rowData.cantidad || rowData.cantidad === '') {
            results.skipped.push({
              row: rowNumber,
              codigo: rowData.codigo,
              nombre: rowData.nombre,
              razon: 'Precio o cantidad vacíos'
            });
            results.summary.skipped++;
            continue;
          }

          const result = await this.processRowMejorado(rowData, userData, rowNumber);

          results.created.push(result);
          results.summary.created++;

        } catch (error) {
          console.error(`[bulkUpload] Error en fila ${rowNumber}:`, error);
          results.failed.push({
            row: rowNumber,
            data: {
              codigo: rowData.codigo,
              nombre: rowData.nombre,
              categoria: rowData.categoria
            },
            error: error.message || 'Error desconocido'
          });
          results.summary.failed++;
        }
      }

      console.log('[bulkUpload] Procesamiento completado:', results.summary);

      return results;

    } catch (error) {
      console.error('[bulkUpload] Error al procesar Excel:', error);
      throw error.status ? error : {
        status: 500,
        message: 'Error al procesar el archivo Excel',
        details: error.message
      };
    }
  },

  /**
   * Validar estructura del Excel
   */
  validateExcelStructure(firstRow) {
    const requiredColumns = [
      'categoryId',
      'categoria',
      'catalogoProductoId',
      'codigo',
      'nombre',
      'precio',
      'cantidad'
    ];

    const missingColumns = [];

    for (const column of requiredColumns) {
      if (!(column in firstRow)) {
        missingColumns.push(column);
      }
    }

    if (missingColumns.length > 0) {
      throw {
        status: 400,
        message: `Columnas faltantes en el archivo: ${missingColumns.join(', ')}`,
        details: 'El archivo no tiene el formato correcto. Por favor, descarga la plantilla nuevamente y no modifiques los nombres de las columnas.'
      };
    }
  },

  /**
   * Procesar fila con IDs ya proporcionados (enfoque mejorado)
   */
  async processRowMejorado(rowData, userData, rowNumber) {
    // 1. Validar datos básicos
    const precio = parseFloat(rowData.precio);
    const cantidad = parseInt(rowData.cantidad);

    if (isNaN(precio) || precio <= 0) {
      throw new Error(`Precio inválido: "${rowData.precio}" (debe ser un número mayor a 0)`);
    }

    if (isNaN(cantidad) || cantidad < 0) {
      throw new Error(`Cantidad inválida: "${rowData.cantidad}" (debe ser un número mayor o igual a 0)`);
    }

    // 2. Validar que los IDs existan
    const categoria = await Category.findById(rowData.categoryId);
    if (!categoria) {
      throw new Error(`Categoría no encontrada con ID: ${rowData.categoryId}`);
    }

    const catalogoProducto = await CatalogoProducto.findById(rowData.catalogoProductoId);
    if (!catalogoProducto) {
      throw new Error(`Producto del catálogo no encontrado con ID: ${rowData.catalogoProductoId}`);
    }

    // 3. Verificar duplicados
    const existe = await Producto.findOne({
      categoryId: rowData.categoryId,
      catalogoProductoId: rowData.catalogoProductoId
    });

    if (existe) {
      throw new Error(`El producto "${rowData.nombre}" ya existe en la categoría "${rowData.categoria}"`);
    }

    // 4. Crear producto
    const nuevoProducto = new Producto({
      codigoProducto: catalogoProducto.codigoproducto || catalogoProducto.codigoProducto,
      nombre: catalogoProducto.nombre,
      precio: precio,
      cantidad: cantidad,
      cantidadVendida: 0,
      cantidadRestante: cantidad,
      categoryId: rowData.categoryId,
      categoryName: categoria.nombre,
      catalogoProductoId: rowData.catalogoProductoId,
      userId: userData.userId,
      creatorId: userData.creatorId,
      creatorName: userData.creatorName,
      creatorEmail: userData.creatorEmail,
      creatorRole: userData.creatorRole,
      activo: true,
      status: 'activo'
    });

    await nuevoProducto.save();

    return {
      row: rowNumber,
      codigo: rowData.codigo,
      nombre: rowData.nombre,
      categoria: rowData.categoria,
      precio: precio,
      cantidad: cantidad,
      productoId: nuevoProducto._id
    };
  }
};

module.exports = bulkUploadService;
