const request = require('supertest');
const app = require('../server'); // Asegúrate de exportar tu app de Express en server.js
const mongoose = require('mongoose');
const CatalogoProducto = require('../models/CatalogoProducto');
const Inventario = require('../models/Inventario');

// Mock de autenticación (ajusta según tu middleware real)
jest.mock('../middleware/authenticate', () => ({
  authenticate: (req, res, next) => { req.user = { clerk_id: 'testuser', email: 'test@test.com', role: 'admin' }; next(); },
  requireAdmin: (req, res, next) => next(),
  requireUser: (req, res, next) => next(),
  requireSuperAdmin: (req, res, next) => next()
}));

describe('Inventario API', () => {
  let server;
  let catalogo;

  beforeAll(async () => {
    server = app.listen(4001);
    // No vuelvas a conectar mongoose, ya está conectado por server.js
    await CatalogoProducto.deleteMany({});
    await Inventario.deleteMany({});
    catalogo = await CatalogoProducto.create({ codigoCatalogo: 'SKU123', nombre: 'Producto Test', descripcion: 'desc', categoria: 'cat' });
  });

  afterAll(async () => {
    await CatalogoProducto.deleteMany({});
    await Inventario.deleteMany({});
    await mongoose.connection.close();
    server.close();
  });

  it('debe agregar stock a inventario', async () => {
    const res = await request(server)
      .post('/api/inventario/ingreso')
      .send({ codigoCatalogo: 'SKU123', cantidad: 10 });
    expect(res.statusCode).toBe(201);
    expect(res.body.cantidad).toBe(10);
  });

  it('debe listar inventario', async () => {
    const res = await request(server)
      .get('/api/inventario')
      .send();
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].catalogo.codigoCatalogo).toBe('SKU123');
  });

  it('debe registrar venta', async () => {
    const inventario = await Inventario.findOne({ catalogo: catalogo._id });
    const res = await request(server)
      .post('/api/inventario/venta')
      .send({ inventarioId: inventario._id, cantidad: 2 });
    expect(res.statusCode).toBe(200);
    expect(res.body.cantidad).toBe(8);
  });

  it('debe registrar devolución', async () => {
    const inventario = await Inventario.findOne({ catalogo: catalogo._id });
    const res = await request(server)
      .post('/api/inventario/devolucion')
      .send({ inventarioId: inventario._id, cantidad: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body.cantidad).toBe(9);
  });
});
