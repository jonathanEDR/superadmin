# 💰 Módulo de Finanzas - Sistema Integrado

## 📋 Resumen Ejecutivo

El **Módulo de Finanzas** es un sistema completo para la gestión financiera empresarial que incluye:

- 🏦 **Gestión de Cuentas Bancarias**: Administración de múltiples cuentas bancarias
- 💸 **Movimientos Bancarios**: Registro y seguimiento de transacciones bancarias
- 📊 **Flujo de Caja**: Proyecciones y control de flujos de efectivo
- 💰 **Préstamos y Financiamiento**: Gestión completa de préstamos
- 💳 **Pagos de Financiamiento**: Control de pagos de préstamos
- 🛡️ **Garantías**: Administración de garantías y colaterales

---

## 🏗️ Arquitectura del Módulo

### Estructura de Directorios
```
backend/
├── models/finanzas/
│   ├── CuentaBancaria.js      # Modelo de cuentas bancarias
│   ├── MovimientoBancario.js  # Modelo de transacciones bancarias
│   ├── FlujoCaja.js          # Modelo de flujo de caja
│   ├── Prestamo.js           # Modelo de préstamos
│   ├── PagoFinanciamiento.js # Modelo de pagos de préstamos
│   └── Garantia.js           # Modelo de garantías
├── services/
│   ├── finanzasService.js             # Lógica de negocio principal
│   ├── cuentasBancariasService.js     # Servicios de cuentas bancarias
│   ├── movimientosBancariosService.js # Servicios de movimientos
│   ├── prestamosService.js            # Servicios de préstamos
│   ├── pagosFinanciamientoService.js  # Servicios de pagos
│   └── garantiasService.js            # Servicios de garantías
└── routes/
    ├── finanzasRoutes.js             # Rutas principales y dashboard
    ├── cuentasBancariasRoutes.js     # API de cuentas bancarias
    ├── prestamosRoutes.js            # API de préstamos
    ├── pagosFinanciamientoRoutes.js  # API de pagos de financiamiento
    └── garantiasRoutes.js            # API de garantías
```

---

## 🔧 Instalación y Configuración

### 1. Dependencias Requeridas
```bash
npm install mongoose express bcryptjs jsonwebtoken cors
```

### 2. Variables de Entorno
```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/tu-base-datos

# Configuración de zona horaria
TZ=America/Lima

# Autenticación
JWT_SECRET=tu-jwt-secret-key
```

### 3. Integración en el Servidor
El módulo ya está integrado en `server.js` con las siguientes rutas:

```javascript
// Rutas del módulo de finanzas
app.use('/api/finanzas', finanzasRoutes);
app.use('/api/cuentas-bancarias', cuentasBancariasRoutes);
app.use('/api/prestamos', prestamosRoutes);
app.use('/api/pagos-financiamiento', pagosFinanciamientoRoutes);
app.use('/api/garantias', garantiasRoutes);
```

---

## 📊 Modelos de Datos

### 🏦 CuentaBancaria
```javascript
{
  codigo: String,           // Código único autogenerado
  entidadFinanciera: {
    nombre: String,         // Nombre del banco
    codigo: String,         // Código del banco
    tipo: String           // Banco, cooperativa, financiera
  },
  numeroCuenta: String,     // Número de cuenta
  tipoCuenta: String,       // ahorro, corriente, plazo_fijo
  moneda: String,           // PEN, USD, EUR
  saldo: {
    disponible: Number,     // Saldo disponible
    contable: Number,       // Saldo contable
    bloqueado: Number       // Saldo bloqueado
  },
  estado: String,           // activa, inactiva, cerrada
  fechaApertura: Date,
  fechaCierre: Date,
  userId: String,
  // Métodos: depositar(), retirar(), bloquearFondos(), etc.
}
```

### 💸 MovimientoBancario
```javascript
{
  codigo: String,           // Código único
  cuentaId: ObjectId,       // Referencia a cuenta
  tipo: String,             // ingreso, egreso
  categoria: String,        // transferencia, deposito, retiro, etc.
  monto: Number,
  descripcion: String,
  fecha: Date,
  referencia: String,       // Número de referencia bancaria
  estado: String,           // pendiente, procesado, rechazado
  saldoAnterior: Number,
  saldoPosterior: Number,
  userId: String
}
```

### 💰 Prestamo
```javascript
{
  codigo: String,           // Código único
  entidadFinanciera: Object, // Datos del prestamista
  prestatario: Object,      // Datos del prestatario
  tipoCredito: String,      // personal, hipotecario, vehicular, etc.
  montoSolicitado: Number,
  montoAprobado: Number,
  tasaInteres: {
    porcentaje: Number,
    tipo: String,           // fija, variable
    periodo: String         // anual, mensual
  },
  plazo: {
    cantidad: Number,
    unidad: String          // meses, años
  },
  cuota: Number,
  fechaDesembolso: Date,
  fechaVencimiento: Date,
  estado: String,           // solicitado, aprobado, desembolsado, etc.
  garantias: [ObjectId],    // Referencias a garantías
  userId: String,
  // Métodos: calcularCuota(), generarCronograma(), etc.
}
```

### 💳 PagoFinanciamiento
```javascript
{
  codigo: String,
  prestamoId: ObjectId,     // Referencia al préstamo
  numeroCuota: Number,
  fechaVencimiento: Date,
  fechaPago: Date,
  montos: {
    capital: Number,
    interes: Number,
    mora: Number,
    total: Number
  },
  metodoPago: String,       // transferencia, efectivo, cheque
  estado: String,           // pendiente, pagado, vencido
  comprobante: String,      // Número de comprobante
  userId: String
}
```

### 🛡️ Garantia
```javascript
{
  codigo: String,
  prestamoId: ObjectId,     // Referencia al préstamo
  tipo: String,             // hipotecaria, vehicular, fianza_personal
  descripcion: String,
  bien: {
    nombre: String,
    descripcion: String,
    caracteristicas: Object
  },
  valores: {
    comercial: Number,      // Valor comercial
    tasacion: Number,       // Valor de tasación
    realizacion: Number     // Valor de realización
  },
  propietario: Object,      // Datos del propietario
  ubicacion: Object,        // Ubicación del bien
  documentacion: Array,     // Lista de documentos
  seguros: Array,           // Seguros asociados
  estado: String,           // pendiente_evaluacion, aprobada, activa, etc.
  userId: String,
  // Métodos: calcularCobertura(), aprobar(), ejecutar(), etc.
}
```

---

## 🛠️ Servicios Principales

### 🏦 CuentasBancariasService
- `crearCuenta()` - Crear nueva cuenta bancaria
- `obtenerCuentas()` - Listar cuentas con filtros
- `actualizarSaldo()` - Actualizar saldo de cuenta
- `bloquearFondos()` - Bloquear fondos específicos
- `cerrarCuenta()` - Cerrar cuenta bancaria

### 💸 MovimientosBancariosService
- `registrarMovimiento()` - Registrar nueva transacción
- `obtenerMovimientos()` - Obtener historial de movimientos
- `procesarTransferencia()` - Procesar transferencia entre cuentas
- `conciliarMovimientos()` - Conciliar movimientos bancarios

### 💰 PrestamosService
- `crearSolicitud()` - Crear solicitud de préstamo
- `evaluarSolicitud()` - Evaluar y aprobar solicitud
- `desembolsar()` - Realizar desembolso
- `generarCronograma()` - Generar cronograma de pagos
- `calcularEstadisticas()` - Calcular métricas del préstamo

### 💳 PagosFinanciamientoService
- `registrarPago()` - Registrar pago de cuota
- `calcularMora()` - Calcular mora por retraso
- `obtenerCronograma()` - Obtener cronograma de pagos
- `procesarPagoAutomatico()` - Procesar pagos automáticos

### 🛡️ GarantiasService
- `crearGarantia()` - Crear nueva garantía
- `aprobarGarantia()` - Aprobar garantía
- `calcularCobertura()` - Calcular cobertura de garantía
- `ejecutarGarantia()` - Ejecutar garantía
- `validarDocumentacion()` - Validar documentación

---

## 🌐 API Endpoints

### 🏦 Cuentas Bancarias (`/api/cuentas-bancarias`)
```
GET    /                    # Listar cuentas
POST   /                    # Crear cuenta
GET    /:id                 # Obtener cuenta por ID
PUT    /:id                 # Actualizar cuenta
DELETE /:id                 # Eliminar cuenta
POST   /:id/depositar       # Realizar depósito
POST   /:id/retirar         # Realizar retiro
GET    /:id/movimientos     # Obtener movimientos de la cuenta
POST   /:id/bloquear-fondos # Bloquear fondos
GET    /resumen             # Resumen de cuentas
```

### 💰 Préstamos (`/api/prestamos`)
```
GET    /                    # Listar préstamos
POST   /                    # Crear solicitud
GET    /:id                 # Obtener préstamo por ID
PUT    /:id                 # Actualizar préstamo
DELETE /:id                 # Eliminar préstamo
POST   /:id/evaluar         # Evaluar solicitud
POST   /:id/aprobar         # Aprobar préstamo
POST   /:id/desembolsar     # Desembolsar préstamo
GET    /:id/cronograma      # Obtener cronograma
POST   /:id/refinanciar     # Refinanciar préstamo
GET    /estadisticas        # Estadísticas de préstamos
```

### 💳 Pagos de Financiamiento (`/api/pagos-financiamiento`)
```
GET    /                    # Listar pagos
POST   /                    # Registrar pago
GET    /:id                 # Obtener pago por ID
PUT    /:id                 # Actualizar pago
DELETE /:id                 # Eliminar pago
GET    /prestamo/:id        # Pagos de un préstamo
POST   /lote               # Procesar pagos en lote
GET    /vencidos           # Pagos vencidos
GET    /proximos-vencer    # Pagos próximos a vencer
```

### 🛡️ Garantías (`/api/garantias`)
```
GET    /                    # Listar garantías
POST   /                    # Crear garantía
GET    /:id                 # Obtener garantía por ID
PUT    /:id                 # Actualizar garantía
DELETE /:id                 # Eliminar garantía
POST   /:id/aprobar         # Aprobar garantía
POST   /:id/rechazar        # Rechazar garantía
POST   /:id/activar         # Activar garantía
POST   /:id/ejecutar        # Ejecutar garantía
GET    /:id/cobertura       # Calcular cobertura
GET    /prestamo/:id        # Garantías de un préstamo
```

### 📊 Dashboard Financiero (`/api/finanzas`)
```
GET    /resumen             # Resumen financiero general
GET    /flujo-caja          # Flujo de caja
GET    /proyecciones        # Proyecciones financieras
GET    /kpis                # Indicadores clave
GET    /alertas             # Alertas financieras
```

---

## 🔐 Seguridad y Autenticación

### Middleware de Autenticación
- Todas las rutas requieren autenticación
- Validación de JWT tokens
- Control de acceso por usuario

### Validaciones de Negocio
- Validación de saldos antes de movimientos
- Verificación de límites de crédito
- Validación de estados de préstamos
- Control de integridad de datos

---

## 📈 Características Principales

### ✅ Funcionalidades Implementadas

#### 🏦 Gestión Bancaria
- ✅ Múltiples cuentas bancarias por usuario
- ✅ Diferentes tipos de cuenta (ahorro, corriente, plazo fijo)
- ✅ Soporte para múltiples monedas
- ✅ Control de saldos (disponible, contable, bloqueado)
- ✅ Historial completo de movimientos

#### 💰 Gestión de Préstamos
- ✅ Solicitudes de préstamo completas
- ✅ Evaluación y aprobación automática
- ✅ Cálculo automático de cuotas
- ✅ Generación de cronogramas de pago
- ✅ Soporte para refinanciamiento

#### 💳 Control de Pagos
- ✅ Registro automático de pagos
- ✅ Cálculo de mora automático
- ✅ Procesamiento en lote
- ✅ Alertas de vencimiento
- ✅ Múltiples métodos de pago

#### 🛡️ Gestión de Garantías
- ✅ Múltiples tipos de garantía
- ✅ Cálculo automático de cobertura
- ✅ Gestión de documentación
- ✅ Control de seguros
- ✅ Proceso de ejecución

#### 📊 Reportes y Análisis
- ✅ Dashboard financiero completo
- ✅ Flujo de caja proyectado
- ✅ KPIs financieros
- ✅ Alertas automáticas
- ✅ Estadísticas detalladas

---

## 🚀 Próximas Funcionalidades

### 🔮 Roadmap de Desarrollo

#### Fase 3: Inversiones y Portfolio
- 📈 Gestión de inversiones
- 💹 Seguimiento de portfolio
- 🎯 Análisis de rendimiento
- 📊 Rebalanceo automático

#### Fase 4: Planificación Financiera
- 🎯 Presupuestos y metas
- 📅 Planificación a largo plazo
- 🔍 Análisis de escenarios
- 📈 Proyecciones avanzadas

#### Fase 5: Integraciones
- 🏦 Conexión con APIs bancarias
- 💳 Integración con pasarelas de pago
- 📱 Notificaciones push
- 📧 Reportes por email

---

## 🧪 Testing y Validación

### Estructura de Tests
```bash
# Ejecutar validación básica
cd backend
node -c server.js  # Validar sintaxis

# Verificar estructura de archivos
ls models/finanzas/
ls routes/
ls services/
```

### Tests Unitarios Recomendados
```javascript
// Ejemplo de test para CuentaBancaria
describe('CuentaBancaria Model', () => {
  test('should create account with valid data', async () => {
    // Test implementation
  });
  
  test('should calculate balance correctly', async () => {
    // Test implementation
  });
});
```

---

## 📞 Soporte y Mantenimiento

### Logs y Monitoreo
- Logs detallados en consola
- Tracking de operaciones críticas
- Alertas automáticas de errores
- Métricas de rendimiento

### Mantenimiento
- Backup automático de datos
- Limpieza de logs antiguos
- Actualización de índices de base de datos
- Optimización de consultas

---

## 👥 Contribución

### Estándares de Código
- Comentarios en español
- Nombres descriptivos
- Validaciones completas
- Manejo de errores consistente

### Estructura de Commits
```
feat(finanzas): agregar nueva funcionalidad
fix(prestamos): corregir cálculo de interés
docs(api): actualizar documentación de endpoints
```

---

## 📄 Licencia

Este módulo es parte del sistema integral de gestión empresarial.

---

**🎯 Estado del Proyecto: ✅ COMPLETADO**

- ✅ Modelos de datos implementados
- ✅ Servicios de negocio completados  
- ✅ APIs REST funcionales
- ✅ Integración con servidor principal
- ✅ Documentación completa
- ✅ Validaciones de seguridad
- ✅ Estructura modular y escalable

**El módulo de finanzas está listo para producción y uso inmediato.** 🚀
