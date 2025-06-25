// Función para obtener la fecha y hora actual en formato ISO
const getFechaHoraActual = () => {
    const now = new Date();
    return now.toISOString();
};

// Función para obtener la fecha actual en formato ISO (solo fecha)
const obtenerFechaActual = () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
};

// Función para convertir fecha a fecha local
const convertirFechaAFechaLocal = (fecha) => {
    if (!fecha) return null;
    const fechaObj = new Date(fecha);
    return fechaObj.toISOString().split('T')[0];
};

// Función para convertir fecha a UTC local
const convertirFechaALocalUtc = (fecha) => {
    if (!fecha) return null;
    const fechaObj = new Date(fecha);
    return fechaObj.toISOString();
};

// Función para validar formato de fecha
const validarFormatoFecha = (fecha) => {
    if (!fecha) return false;
    const fechaObj = new Date(fecha);
    return fechaObj instanceof Date && !isNaN(fechaObj);
};

// Función para formatear fecha para mostrar
const formatearFecha = (fecha) => {
    if (!fecha) return '';
    const fechaObj = new Date(fecha);
    return fechaObj.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

// Función para obtener el principio del día (00:00:00)
const getInicioDia = (fecha) => {
    const fechaObj = new Date(fecha);
    fechaObj.setHours(0, 0, 0, 0);
    return fechaObj;
};

// Función para obtener el final del día (23:59:59)
const getFinDia = (fecha) => {
    const fechaObj = new Date(fecha);
    fechaObj.setHours(23, 59, 59, 999);
    return fechaObj;
};

module.exports = {
    getFechaHoraActual,
    obtenerFechaActual,
    convertirFechaAFechaLocal,
    convertirFechaALocalUtc,
    validarFormatoFecha,
    formatearFecha,
    getInicioDia,
    getFinDia
};
