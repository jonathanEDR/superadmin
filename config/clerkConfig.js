// config/clerkConfig.js
const { Clerk } = require('@clerk/clerk-sdk-node');
require('dotenv').config();

// Inicializar Clerk correctamente
const clerkClient = new Clerk({
  secretKey: process.env.CLERK_SECRET_KEY
});

// Exportar la instancia inicializada
module.exports = clerkClient;