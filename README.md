# Backend API - Sistema de Login y Gestión

## 🚀 Despliegue en Render.com

### Requisitos previos
- Cuenta en MongoDB Atlas (o base de datos MongoDB en la nube)
- Cuenta en Render.com
- Cuenta en Clerk para autenticación

### Variables de entorno necesarias en Render

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key_here
CORS_ORIGINS=https://your-frontend-domain.com
NODE_ENV=production
PORT=5000
```

### Pasos para desplegar

1. **Crear nuevo Web Service en Render**
   - Conectar repositorio de GitHub
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node.js

2. **Configurar variables de entorno**
   - Ir a Environment tab
   - Agregar todas las variables listadas arriba

3. **Configurar base de datos**
   - Usar MongoDB Atlas (recomendado)
   - Asegurar que la IP de Render esté en la whitelist de MongoDB

### Endpoints disponibles

#### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario

#### Notas
- `GET /api/notes` - Obtener notas
- `POST /api/notes/create` - Crear nota
- `PATCH /api/notes/:id/complete` - Completar nota
- `PATCH /api/notes/:id/review` - Aprobar/rechazar nota
- `GET /api/notes/approved` - Obtener notas aprobadas

#### Health Check
- `GET /health` - Estado del servidor
- `GET /api/health` - Estado detallado

### Tecnologías utilizadas
- Node.js + Express
- MongoDB + Mongoose
- Clerk Authentication
- CORS habilitado

### Estructura del proyecto
```
backend/
├── config/           # Configuraciones
├── middleware/       # Middlewares personalizados
├── models/          # Modelos de MongoDB
├── routes/          # Rutas de la API
├── services/        # Lógica de negocio
├── utils/           # Utilidades
├── server.js        # Archivo principal
└── package.json     # Dependencias
```