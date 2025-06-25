const GestionPersonal = require('../models/GestionPersonal');
const User = require('../models/User');
const { convertirFechaALocalUtc } = require('../utils/fechaHoraUtils');

// Función auxiliar para validar y parsear números
const parsearNumero = (valor, defecto = 0) => {
  const num = parseFloat(valor);
  return isNaN(num) ? defecto : num;
};

// Crear nuevo registro
const crearRegistro = async (data) => {
  const {
    userId, // Clerk ID del usuario autenticado
    colaboradorUserId, // Clerk ID del colaborador
    fechaDeGestion,
    descripcion,
    monto,
    faltante = 0,
    adelanto = 0,
    pagodiario = 0,
    diasLaborados = 1
  } = data;

  if (!userId) {
    throw new Error('userId es requerido');
  }

  // Buscar al colaborador (usuario)
  const colaborador = await User.findOne({
    clerk_id: colaboradorUserId,
    role: { $ne: 'super_admin' },
    is_active: true
  });
  if (!colaborador) {
    throw new Error('Colaborador no encontrado');
  }

  const fechaDeGestionUtc = convertirFechaALocalUtc(fechaDeGestion);

  // Crear el nuevo registro de gestión personal
  const nuevoRegistro = new GestionPersonal({
    userId,
    colaboradorUserId,
    fechaDeGestion: fechaDeGestionUtc,
    descripcion: descripcion.trim(),
    monto: parsearNumero(monto),
    faltante: parsearNumero(faltante),
    adelanto: parsearNumero(adelanto),
    pagodiario: parsearNumero(pagodiario, 0),
    diasLaborados: parseInt(diasLaborados) || 1
  });

  await nuevoRegistro.save();
  return nuevoRegistro;
};

// Obtener registros por colaborador
const obtenerRegistrosPorColaborador = async (userId, colaboradorUserId, filtros = {}) => {
  try {
    const query = { 
      userId, 
      colaboradorUserId 
    };

    // Aplicar filtros de fecha si se proporcionan
    if (filtros.fechaInicio && filtros.fechaFin) {
      query.fechaDeGestion = {
        $gte: new Date(filtros.fechaInicio),
        $lte: new Date(filtros.fechaFin)
      };
    }

    const registros = await GestionPersonal.find(query)
      .sort({ fechaDeGestion: -1 });
    
    return registros;
  } catch (error) {
    throw new Error('Error al obtener registros del colaborador: ' + error.message);
  }
};

// Obtener estadísticas de un colaborador
const obtenerEstadisticasColaborador = async (userId, colaboradorUserId) => {
  try {
    const registros = await GestionPersonal.find({ userId, colaboradorUserId });
    
    const estadisticas = registros.reduce((stats, registro) => ({
      totalGastos: stats.totalGastos + (registro.monto || 0),
      totalFaltantes: stats.totalFaltantes + (registro.faltante || 0),
      totalAdelantos: stats.totalAdelantos + (registro.adelanto || 0),
      totalPagosDiarios: stats.totalPagosDiarios + (registro.pagodiario || 0),
      totalRegistros: stats.totalRegistros + 1
    }), {
      totalGastos: 0,
      totalFaltantes: 0,
      totalAdelantos: 0,
      totalPagosDiarios: 0,
      totalRegistros: 0
    });

    // Calcular total a pagar
    estadisticas.totalAPagar = estadisticas.totalPagosDiarios - (estadisticas.totalFaltantes + estadisticas.totalAdelantos);

    return estadisticas;
  } catch (error) {
    throw new Error('Error al calcular estadísticas: ' + error.message);
  }
};

// Actualizar registro existente
const actualizarRegistro = async (userId, registroId, datosActualizados) => {
  try {
    const registro = await GestionPersonal.findOne({ _id: registroId, userId });
    
    if (!registro) {
      throw new Error('Registro no encontrado');
    }

    // Validar colaborador si se está cambiando
    if (datosActualizados.colaboradorUserId && datosActualizados.colaboradorUserId !== registro.colaboradorUserId) {
      const colaborador = await User.findOne({
        clerk_id: datosActualizados.colaboradorUserId,
        role: { $ne: 'super_admin' },
        is_active: true
      });
      
      if (!colaborador) {
        throw new Error('Colaborador no encontrado');
      }
    }

    // Actualizar campos
    const camposPermitidos = ['fechaDeGestion', 'descripcion', 'monto', 'faltante', 'adelanto', 'pagodiario', 'diasLaborados'];
    camposPermitidos.forEach(campo => {
      if (datosActualizados[campo] !== undefined) {
        if (campo === 'fechaDeGestion') {
          registro[campo] = convertirFechaALocalUtc(datosActualizados[campo]);
        } else if (['monto', 'faltante', 'adelanto', 'pagodiario'].includes(campo)) {
          registro[campo] = parsearNumero(datosActualizados[campo]);
        } else if (campo === 'diasLaborados') {
          registro[campo] = parseInt(datosActualizados[campo]) || 1;
        } else {
          registro[campo] = datosActualizados[campo];
        }
      }
    });

    await registro.save();
    return registro;
  } catch (error) {
    throw new Error('Error al actualizar registro: ' + error.message);
  }
};

module.exports = {
  crearRegistro,
  obtenerRegistrosPorColaborador,
  obtenerEstadisticasColaborador,
  actualizarRegistro
};
