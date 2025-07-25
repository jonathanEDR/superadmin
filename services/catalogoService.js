console.log('[LOG] catalogoService.js cargado');
const CatalogoProducto = require('../models/CatalogoProducto');
console.log('[LOG] CatalogoProducto importado:', typeof CatalogoProducto);

const catalogoService = {
  async getCatalogo() {
    console.log('[LOG] getCatalogo llamado');
    console.log('[DEBUG] CatalogoProducto typeof:', typeof CatalogoProducto);
    console.log('[DEBUG] CatalogoProducto keys:', Object.keys(CatalogoProducto));
    if (typeof CatalogoProducto.find !== 'function') {
      console.error('[ERROR] CatalogoProducto.find is not a function!');
    }
    return await CatalogoProducto.find({}, 'codigoproducto nombre descripcion activo');
  },
  async addProducto(data) {
    console.log('[LOG] addProducto llamado con:', data);
    if (!data.codigoproducto || !data.nombre) {
      console.error('[ERROR] Código y nombre son requeridos');
      throw { status: 400, message: 'Código y nombre son requeridos' };
    }
    const existeCodigo = await CatalogoProducto.findOne({ codigoproducto: data.codigoproducto });
    if (existeCodigo) {
      console.error('[ERROR] Ya existe un producto con este código');
      throw { status: 409, message: 'Ya existe un producto con este código' };
    }
    const existeNombre = await CatalogoProducto.findOne({ nombre: data.nombre });
    if (existeNombre) {
      console.error('[ERROR] Ya existe un producto con este nombre');
      throw { status: 409, message: 'Ya existe un producto con este nombre' };
    }
    const producto = new CatalogoProducto({
      codigoproducto: data.codigoproducto,
      nombre: data.nombre,
      descripcion: data.descripcion || '',
      activo: data.activo !== undefined ? data.activo : true
    });
    console.log('[LOG] Nuevo producto a guardar:', producto);
    return await producto.save();
  },
  async editProducto(id, data) {
    console.log('[LOG] editProducto llamado con id:', id, 'y data:', data);
    const update = {};
    if (data.codigoproducto) update.codigoproducto = data.codigoproducto;
    if (data.nombre) update.nombre = data.nombre;
    if (data.descripcion !== undefined) update.descripcion = data.descripcion;
    if (typeof data.activo === 'boolean') update.activo = data.activo;
    const producto = await CatalogoProducto.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!producto) {
      console.error('[ERROR] Producto no encontrado para editar');
      throw { status: 404, message: 'Producto no encontrado' };
    }
    return producto;
  },
  async setEstado(id, activo) {
    const producto = await CatalogoProducto.findByIdAndUpdate(id, { activo }, { new: true });
    if (!producto) throw { status: 404, message: 'Producto no encontrado' };
    return producto;
  },

  // Eliminar producto del catálogo
  async deleteProducto(id) {
    const producto = await CatalogoProducto.findByIdAndDelete(id);
    if (!producto) throw { status: 404, message: 'Producto no encontrado' };
    return producto;
  }
};

module.exports = catalogoService;
