const express = require('express');
const router = express.Router();
const { obtenerFechaActual, convertirFechaAFechaLocal, convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');
const { authenticate } = require('../middleware/authenticate');
const gestionService = require('../services/gestionPersonalService');
const integracionService = require('../services/integracionGestionService');
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
    const userId = req.user.clerk_id;
    const userRole = req.user.role;
    
    let query = {};
    
    // Lógica basada en roles
    if (userRole === 'super_admin') {
      query = {};
    } else if (userRole === 'admin') {
      query = {};
    } else {
      query = { colaboradorUserId: userId };
    }
    
    // Obtener TODOS los registros (sin paginación para calcular totales correctos)
    const registros = await GestionPersonal.find(query)
      .sort({ fechaDeGestion: -1 });
    
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
    const userId = req.user.clerk_id;
    const userRole = req.user.role;
    
    let query = {};
    
    // Lógica basada en roles
    if (userRole === 'super_admin') {
      query = {
        is_active: true
      };
    } else if (userRole === 'admin') {
      query = {
        role: { $ne: 'super_admin' },
        is_active: true
      };
    } else {
      query = {
        clerk_id: { $ne: userId },
        role: 'user',
        is_active: true
      };
    }
    
    const colaboradores = await User.find(query, 'clerk_id nombre_negocio email role sueldo departamento');
    
    res.json(colaboradores);
  } catch (error) {
    console.error('Error al obtener colaboradores:', error);
    res.status(500).json({ message: 'Error al obtener colaboradores' });
  }
});

// Obtener resumen de cobros para todos los colaboradores
router.get('/cobros-resumen', authenticate, async (req, res) => {
  try {
    // Obtener todos los colaboradores activos (todos los roles excepto inactivos)
    const colaboradores = await User.find({ 
      is_active: true,
      role: { $in: ['user', 'admin', 'super_admin'] }
    }, 'clerk_id nombre_negocio role');
    
    // Obtener resumen de cobros para cada colaborador usando función CORREGIDA (como GestionPersonalList)
    const resumenTodos = {
      resumen: {
        totalFaltantes: 0,
        totalGastosImprevistos: 0,
        cobrosDetalle: []
      }
    };
    
    for (const colaborador of colaboradores) {
      try {
        const resumenColaborador = await integracionService.obtenerResumenCobrosColaboradorCorregido(
          colaborador.clerk_id
        );
        
        if (resumenColaborador) {
          // Sumar totales
          resumenTodos.resumen.totalFaltantes += resumenColaborador.totalFaltantes || 0;
          resumenTodos.resumen.totalGastosImprevistos += resumenColaborador.totalGastosImprevistos || 0;
          
          // Agregar detalles de cobros con información del colaborador
          if (resumenColaborador.cobrosDetalle) {
            const cobrosConColaborador = resumenColaborador.cobrosDetalle.map(cobro => ({
              ...cobro,
              colaboradorUserId: colaborador.clerk_id,
              vendedorUserId: colaborador.clerk_id,
              colaboradorNombre: colaborador.nombre_negocio
            }));
            resumenTodos.resumen.cobrosDetalle.push(...cobrosConColaborador);
          }
        }
      } catch (err) {
        // Error silencioso para evitar spam de logs
      }
    }
    
    res.json({
      success: true,
      ...resumenTodos,
      totalColaboradores: colaboradores.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al obtener resumen de cobros para todos:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener resumen de cobros', 
      error: error.message 
    });
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
    const userId = req.user.clerk_id;
    const {
      colaboradorUserId,
      fechaDeGestion,
      descripcion,
      monto = 0,
      faltante = 0,
      adelanto = 0,
      incluirDatosCobros = false
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
    }

    // Obtener información completa del colaborador
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
      incluirDatosCobros,
      colaboradorInfo: {
        nombre: colaborador.nombre_negocio || 'Sin nombre',
        email: colaborador.email,
        sueldo: colaborador.sueldo || 0,
        departamento: colaborador.departamento || 'ventas'
      }
    };

    // Crear registro usando el servicio
    const nuevoRegistro = await gestionService.crearRegistro(datosRegistro);

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

// NUEVA RUTA: Obtener estadísticas mejoradas con datos automáticos de cobros
router.get('/colaborador/:colaboradorId/estadisticas-mejoradas', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id;
    const { colaboradorId } = req.params;

    console.log(`🔍 Obteniendo estadísticas mejoradas para colaborador: ${colaboradorId}`);

    const estadisticasMejoradas = await gestionService.obtenerEstadisticasColaboradorConCobros(
      userId, 
      colaboradorId
    );
    
    res.json({
      success: true,
      colaboradorId,
      estadisticas: estadisticasMejoradas,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al obtener estadísticas mejoradas:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener estadísticas mejoradas',
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

// ====== NUEVO ENDPOINT: DIAGNÓSTICO DE RELACIONES ======

// Diagnóstico completo de la relación Ventas → Cobros → Gestión Personal
router.get('/diagnostico/:colaboradorUserId', authenticate, async (req, res) => {
  try {
    const { colaboradorUserId } = req.params;
    
    console.log('🔍 Iniciando diagnóstico para colaborador:', colaboradorUserId);
    
    const diagnostico = await integracionService.diagnosticarRelacionVentasCobrosGestion(
      colaboradorUserId
    );
    
    res.json({
      success: true,
      colaboradorUserId,
      diagnostico,
      timestamp: new Date().toISOString(),
      mensaje: 'Diagnóstico completado exitosamente'
    });
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al realizar diagnóstico', 
      error: error.message 
    });
  }
});

// ====== ENDPOINTS PARA INTEGRACIÓN CON COBROS ======

// Obtener resumen de cobros (faltantes y gastos) de un colaborador - VERSIÓN CORREGIDA
router.get('/cobros-resumen/:colaboradorUserId', authenticate, async (req, res) => {
  try {
    const { colaboradorUserId } = req.params;
    const { fechaInicio, fechaFin, metodo = 'corregido' } = req.query;
    
    console.log(`🔍 Obteniendo resumen de cobros para: ${colaboradorUserId} (método: ${metodo})`);
    
    let resumen;
    
    // Usar el método corregido por defecto
    if (metodo === 'corregido' || !metodo) {
      resumen = await integracionService.obtenerResumenCobrosColaboradorCorregido(
        colaboradorUserId
      );
    } else if (metodo === 'original') {
      resumen = await integracionService.obtenerResumenCobrosColaborador(
        colaboradorUserId,
        fechaInicio,
        fechaFin
      );
    } else if (metodo === 'simple') {
      resumen = await integracionService.obtenerResumenCobrosColaboradorSimple(
        colaboradorUserId
      );
    } else {
      return res.status(400).json({
        message: 'Método no válido. Use: corregido, original, o simple'
      });
    }
    
    res.json({
      success: true,
      metodoUsado: metodo === 'corregido' || !metodo ? 'corregido' : metodo,
      colaboradorUserId,
      resumen,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al obtener resumen de cobros:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener resumen de cobros', 
      error: error.message 
    });
  }
});

// Obtener datos sugeridos para crear un nuevo registro de gestión
router.get('/datos-sugeridos/:colaboradorUserId', authenticate, async (req, res) => {
  try {
    const { colaboradorUserId } = req.params;
    const { fechaGestion } = req.query;
    
    if (!fechaGestion) {
      return res.status(400).json({ 
        message: 'La fecha de gestión es requerida' 
      });
    }
    
    console.log('Obteniendo datos sugeridos para:', colaboradorUserId, 'fecha:', fechaGestion);
    
    const datosSugeridos = await integracionService.obtenerDatosSugeridosGestion(
      colaboradorUserId,
      fechaGestion
    );
    
    res.json(datosSugeridos);
  } catch (error) {
    console.error('Error al obtener datos sugeridos:', error);
    res.status(500).json({ 
      message: 'Error al obtener datos sugeridos', 
      error: error.message 
    });
  }
});

// Obtener historial completo de un colaborador (ventas, cobros, gestión)
router.get('/historial-completo/:colaboradorUserId', authenticate, async (req, res) => {
  try {
    const { colaboradorUserId } = req.params;
    const { limite } = req.query;
    
    console.log('Obteniendo historial completo para:', colaboradorUserId);
    
    const historial = await integracionService.obtenerHistorialCompletoColaborador(
      colaboradorUserId,
      limite ? parseInt(limite) : 50
    );
    
    res.json(historial);
  } catch (error) {
    console.error('Error al obtener historial completo:', error);
    res.status(500).json({ 
      message: 'Error al obtener historial completo', 
      error: error.message 
    });
  }
});

// Crear registro con datos sugeridos automáticamente
router.post('/crear-con-sugerencias', authenticate, async (req, res) => {
  try {
    const userId = req.user.clerk_id;
    const {
      colaboradorUserId,
      fechaDeGestion,
      usarDatosSugeridos = true,
      descripcionPersonalizada,
      montoAdicional = 0,
      faltanteAdicional = 0,
      adelantoAdicional = 0
    } = req.body;

    console.log('Creando registro con sugerencias para:', colaboradorUserId);

    // Obtener datos sugeridos
    const datosSugeridos = await integracionService.obtenerDatosSugeridosGestion(
      colaboradorUserId,
      fechaDeGestion
    );

    // Verificar si ya existe un registro para esta fecha
    if (datosSugeridos.registroExistente) {
      return res.status(400).json({
        message: 'Ya existe un registro para esta fecha',
        registroExistente: datosSugeridos.registroExistente
      });
    }

    // Preparar datos para el nuevo registro
    const datosRegistro = {
      userId,
      colaboradorUserId,
      fechaDeGestion,
      descripcion: descripcionPersonalizada || datosSugeridos.datosSugeridos.descripcionSugerida,
      monto: montoAdicional,
      faltante: usarDatosSugeridos ? 
        (datosSugeridos.datosSugeridos.faltante + faltanteAdicional) : 
        faltanteAdicional,
      adelanto: adelantoAdicional,
      pagodiario: datosSugeridos.datosSugeridos.pagodiario,
      colaboradorInfo: {
        nombre: datosSugeridos.colaborador.nombre,
        email: datosSugeridos.colaborador.email,
        sueldo: datosSugeridos.colaborador.sueldo,
        departamento: datosSugeridos.colaborador.departamento
      },
      datosSugeridos: usarDatosSugeridos,
      fuenteDatos: usarDatosSugeridos ? 'automatico_cobros' : 'manual'
    };

    // Si se usaron datos sugeridos, agregar referencias a cobros
    if (usarDatosSugeridos && datosSugeridos.resumenCobros.cobrosDetalle.length > 0) {
      datosRegistro.cobrosRelacionados = datosSugeridos.resumenCobros.cobrosDetalle.map(cobro => ({
        cobroId: cobro.cobroId,
        montoFaltante: cobro.faltantes,
        montoGastoImprevisto: cobro.gastosImprevistos
      }));
    }

    // Crear el registro usando el servicio existente
    const nuevoRegistro = await gestionService.crearRegistro(datosRegistro);

    res.status(201).json({
      message: 'Registro creado exitosamente con datos sugeridos',
      registro: nuevoRegistro,
      datosSugeridos: datosSugeridos.datosSugeridos,
      resumenCobros: datosSugeridos.resumenCobros
    });

  } catch (error) {
    console.error('Error al crear registro con sugerencias:', error);
    res.status(500).json({ 
      message: 'Error al crear registro con sugerencias', 
      error: error.message 
    });
  }
});

module.exports = router;
