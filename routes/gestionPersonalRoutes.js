const express = require('express');
const router = express.Router();
const { obtenerFechaActual, convertirFechaAFechaLocal, convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');
const { authenticate } = require('../middleware/authenticate');
const gestionService = require('../services/gestionPersonalService');
const GestionPersonal = require('../models/GestionPersonal');
const User = require('../models/User');

// RUTA TEMPORAL PARA MIGRAR DATOS - EJECUTAR UNA SOLA VEZ
router.post('/migrate-data', authenticate, async (req, res) => {
  try {
    console.log('Iniciando migración de datos...');
    
    // Obtener todos los registros
    const todosLosRegistros = await GestionPersonal.find({});
    console.log('Total de registros encontrados:', todosLosRegistros.length);
    
    let migrados = 0;
    
    for (const registro of todosLosRegistros) {
      // Si el userId es un ObjectId de MongoDB, buscar el clerk_id correspondiente
      if (registro.userId && registro.userId.length === 24) { // ObjectId de MongoDB tiene 24 caracteres
        const usuario = await User.findById(registro.userId);
        if (usuario && usuario.clerk_id) {
          console.log(`Migrando registro ${registro._id}: ${registro.userId} -> ${usuario.clerk_id}`);
          
          // Actualizar el registro con el clerk_id
          await GestionPersonal.findByIdAndUpdate(registro._id, {
            userId: usuario.clerk_id
          });
          migrados++;
        }
      }
    }
    
    console.log(`Migración completada. ${migrados} registros migrados.`);
    res.json({ 
      message: 'Migración completada', 
      totalRegistros: todosLosRegistros.length,
      registrosMigrados: migrados 
    });
  } catch (error) {
    console.error('Error en migración:', error);
    res.status(500).json({ message: 'Error en migración', error: error.message });
  }
});

// Obtener todos los registros de gestión personal según el rol del usuario
router.get('/', authenticate, async (req, res) => {
  try {    
    const userId = req.user.clerk_id; // Usar clerk_id en lugar de _id
    const userRole = req.user.role; // Obtener el rol del usuario
    
    console.log('Buscando registros para userId (clerk_id):', userId, 'con rol:', userRole); // Debug
    
    let query = {};
    
    // Lógica basada en roles
    if (userRole === 'super_admin') {
      // Super Admin ve TODOS los registros del sistema
      query = {};
      console.log('Super Admin: obteniendo TODOS los registros');
    } else if (userRole === 'admin') {
      // Admin ve TODOS los registros del sistema
      query = {};
      console.log('Admin: obteniendo TODOS los registros');
    } else {
      // Users normales solo ven registros donde ellos son el colaborador
      query = { colaboradorUserId: userId };
      console.log('User: obteniendo solo registros como colaborador');
    }
    
    // Obtener TODOS los registros (sin paginación para calcular totales correctos)
    const registros = await GestionPersonal.find(query)
      .sort({ fechaDeGestion: -1 });
      
    console.log('Registros encontrados:', registros.length); // Debug
    if (registros.length > 0) {
      console.log('Primer registro:', registros[0]); // Debug
      console.log('UserId del primer registro:', registros[0].userId); // Debug
    }
    
    // Devolver todos los registros (la paginación se manejará en el frontend)
    res.json(registros);
  } catch (error) {
    console.error('Error al obtener registros:', error);
    res.status(500).json({ message: 'Error al obtener registros de gestión' });
  }
});

// Obtener todos los colaboradores según el rol del usuario
router.get('/colaboradores', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id; // Usar clerk_id en lugar de _id
    const userRole = req.user.role; // Obtener el rol del usuario
    
    let query = {};
      // Lógica basada en roles
    if (userRole === 'super_admin') {
      // Super Admin ve todos los usuarios activos (incluyendo a sí mismo)
      query = {
        is_active: true
      };
      console.log('Super Admin: obteniendo TODOS los colaboradores (incluyendo super_admin)');    } else if (userRole === 'admin') {
      // Admin ve todos los usuarios excepto super_admin
      query = {
        role: { $ne: 'super_admin' },
        is_active: true
      };
      console.log('Admin: obteniendo colaboradores (admin y user)');
    } else {
      // Users normales no deberían acceder a esta ruta, pero por seguridad
      query = {
        clerk_id: { $ne: userId },
        role: 'user',
        is_active: true
      };
      console.log('User: acceso limitado a colaboradores');
    }
    
    const colaboradores = await User.find(query, 'clerk_id nombre_negocio email role sueldo departamento');
    
    console.log('Colaboradores encontrados:', colaboradores.length); // Debug
    if (colaboradores.length > 0) {
      console.log('Primer colaborador:', colaboradores[0]); // Debug
    }    
    res.json(colaboradores);
  } catch (error) {
    console.error('Error al obtener colaboradores:', error);
    res.status(500).json({ message: 'Error al obtener colaboradores' });
  }
});

// Obtener todos los registros donde el usuario actual es el colaborador
router.get('/mis-registros', authenticate, async (req, res) => {
  try {
    const colaboradorUserId = req.user.clerk_id; // El usuario actual como colaborador
    console.log('Buscando registros para colaboradorUserId:', colaboradorUserId); // Debug
    
    const registros = await GestionPersonal.find({ 
      colaboradorUserId: colaboradorUserId 
    }).sort({ fechaHora: -1 }); // Ordenar por fechaHora en lugar de fechaDeGestion
    
    console.log('Registros encontrados para colaborador:', registros.length); // Debug
    
    // Obtener información adicional del usuario que registró cada entrada
    const registrosConInfo = await Promise.all(
      registros.map(async (registro) => {
        try {
          const registrador = await User.findOne({ clerk_id: registro.userId });
          return {
            ...registro.toObject(),
            registradoPorNombre: registrador ? registrador.nombre_negocio : 'Usuario no encontrado'
          };
        } catch (error) {
          console.error('Error al obtener info del registrador:', error);
          return {
            ...registro.toObject(),
            registradoPorNombre: 'N/A'
          };
        }
      })
    );
    
    if (registrosConInfo.length > 0) {
      console.log('Primer registro del colaborador:', registrosConInfo[0]); // Debug
    }
    
    res.json(registrosConInfo);
  } catch (error) {
    console.error('Error al obtener mis registros:', error);
    res.status(500).json({ message: 'Error al obtener mis registros como colaborador' });
  }
});

// Crear nuevo registro de gestión personal
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id; // Usar clerk_id en lugar de _id
    console.log('Creando registro para userId (clerk_id):', userId); // Debug
    const {
      colaboradorUserId,
      fechaDeGestion,
      descripcion,
      monto = 0,
      faltante = 0,
      adelanto = 0
    } = req.body;

    // Validaciones
    if (!colaboradorUserId) {
      return res.status(400).json({ message: 'ID de colaborador es requerido' });
    }
    if (!fechaDeGestion) {
      return res.status(400).json({ message: 'Fecha de gestión es requerida' });
    }
    if (!descripcion || descripcion.trim() === '') {
      return res.status(400).json({ message: 'Descripción es requerida' });
    }

    // Validar que los valores numéricos sean válidos
    const numericos = { monto, faltante, adelanto };
    for (const [campo, valor] of Object.entries(numericos)) {
      if (typeof valor !== 'number' || isNaN(valor) || valor < 0) {
        return res.status(400).json({
          message: `El campo ${campo} debe ser un número válido mayor o igual a 0`
        });
      }
    }    // Obtener información completa del colaborador
    // Permitir que Super Admin se registre a sí mismo
    const colaborador = await User.findOne({
      clerk_id: colaboradorUserId,
      is_active: true
    });
    
    if (!colaborador) {
      return res.status(404).json({ message: 'Colaborador no encontrado' });
    }

    // Convertir fecha
    const fechaDeGestionUtc = convertirFechaALocalUtc(fechaDeGestion);

    // Preparar datos del registro
    const datosRegistro = {
      userId,
      colaboradorUserId,
      fechaDeGestion: fechaDeGestionUtc,
      descripcion: descripcion.trim(),
      monto: parseFloat(monto) || 0,
      faltante: parseFloat(faltante) || 0,
      adelanto: parseFloat(adelanto) || 0,
      colaboradorInfo: {
        nombre: colaborador.nombre_negocio || 'Sin nombre',
        email: colaborador.email,
        sueldo: colaborador.sueldo || 0,
        departamento: colaborador.departamento || 'ventas'
      }
    };    // Crear registro (pago diario se calcula automáticamente)
    const nuevoRegistro = new GestionPersonal(datosRegistro);
    await nuevoRegistro.save();
    
    console.log('Registro creado:', nuevoRegistro); // Debug

    res.status(201).json(nuevoRegistro);
  } catch (error) {
    console.error('Error al crear registro:', error);
    res.status(500).json({
      message: 'Error al crear registro de gestión',
      error: error.message
    });
  }
});

// Eliminar registro por ID
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const registroEliminado = await GestionPersonal.findByIdAndDelete(id);
    if (!registroEliminado) {
      return res.status(404).json({ message: 'Registro no encontrado' });
    }
    res.json({ message: 'Registro eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar registro:', error);
    res.status(500).json({
      message: 'Error al eliminar registro de gestión',
      error: error.message
    });
  }
});

// Obtener registros de un colaborador específico
router.get('/colaborador/:colaboradorId', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id; // Usar clerk_id
    const { colaboradorId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const filtros = {};
    if (fechaInicio && fechaFin) {
      filtros.fechaInicio = fechaInicio;
      filtros.fechaFin = fechaFin;
    }

    const registros = await gestionService.obtenerRegistrosPorColaborador(
      userId, 
      colaboradorId, 
      filtros
    );
    
    res.json(registros);
  } catch (error) {
    console.error('Error al obtener registros del colaborador:', error);
    res.status(500).json({ 
      message: 'Error al obtener registros del colaborador',
      error: error.message 
    });
  }
});

// Obtener estadísticas de un colaborador
router.get('/colaborador/:colaboradorId/estadisticas', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id; // Usar clerk_id
    const { colaboradorId } = req.params;

    const estadisticas = await gestionService.obtenerEstadisticasColaborador(
      userId, 
      colaboradorId
    );
    
    res.json(estadisticas);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ 
      message: 'Error al obtener estadísticas',
      error: error.message 
    });
  }
});

// Actualizar registro existente
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id; // Usar clerk_id
    const { id } = req.params;
    
    const registroActualizado = await gestionService.actualizarRegistro(
      userId, 
      id, 
      req.body
    );
    
    res.json(registroActualizado);
  } catch (error) {
    console.error('Error al actualizar registro:', error);
    res.status(500).json({
      message: 'Error al actualizar registro',
      error: error.message
    });
  }
});

// Ruta para exportar datos (para reportes)
router.get('/export', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id; // Usar clerk_id
    const { fechaInicio, fechaFin, colaboradorId } = req.query;

    let query = { userId };
    
    // Aplicar filtros
    if (colaboradorId) {
      query.colaboradorUserId = colaboradorId;
    }
    
    if (fechaInicio && fechaFin) {
      query.fechaDeGestion = {
        $gte: convertirFechaALocalUtc(fechaInicio),
        $lte: convertirFechaALocalUtc(fechaFin)
      };
    }

    // Obtener registros con información del colaborador
    const registros = await GestionPersonal.find(query)
      .populate('colaboradorUserId', 'nombre_negocio email role')
      .sort({ fechaDeGestion: -1 });

    // Calcular totales
    const totales = registros.reduce((acc, registro) => ({
      totalGastos: acc.totalGastos + (registro.monto || 0),
      totalFaltantes: acc.totalFaltantes + (registro.faltante || 0),
      totalAdelantos: acc.totalAdelantos + (registro.adelanto || 0),
      totalPagosDiarios: acc.totalPagosDiarios + (registro.pagodiario || 0)
    }), {
      totalGastos: 0,
      totalFaltantes: 0,
      totalAdelantos: 0,
      totalPagosDiarios: 0
    });

    totales.totalAPagar = totales.totalPagosDiarios - (totales.totalFaltantes + totales.totalAdelantos);

    res.json({
      registros,
      totales,
      filtros: {
        fechaInicio,
        fechaFin,
        colaboradorId
      },
      totalRegistros: registros.length
    });
  } catch (error) {
    console.error('Error al exportar datos:', error);
    res.status(500).json({
      message: 'Error al exportar datos',
      error: error.message
    });
  }
});

// Nuevo endpoint: Obtener resumen de pagos pendientes de un colaborador
router.get('/resumen/:colaboradorUserId', async (req, res) => {
  try {
    const colaboradorUserId = req.params.colaboradorUserId;
    const GestionPersonal = require('../models/GestionPersonal');
    const PagoRealizado = require('../models/PagoRealizado');

    // Sumar todos los montos de registros de gestion personal para el colaborador
    const registros = await GestionPersonal.find({ colaboradorUserId });
    const totalRegistros = registros.reduce((sum, reg) => sum + (reg.monto || 0), 0);

    // Sumar todos los pagos realizados para el colaborador
    const pagos = await PagoRealizado.find({ colaboradorUserId });
    const totalPagos = pagos.reduce((sum, pago) => sum + (pago.monto || 0), 0);

    // El monto pendiente es la diferencia
    const montoPendiente = totalRegistros - totalPagos;

    res.json({ montoPendiente });
  } catch (error) {
    console.error('Error al obtener resumen de colaborador:', error);
    res.status(500).json({ message: 'Error al obtener resumen', error: error.message });
  }
});

module.exports = router;
