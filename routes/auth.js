const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { clerkClient } = require('@clerk/clerk-sdk-node');
const { authenticate } = require('../middleware/authenticate');
const router = express.Router();

// Ruta especial para verificar el rol del usuario sin restricciones de 'de_baja'
// Esta ruta se usa específicamente para la redirección basada en roles
router.get('/user-role-check', async (req, res) => {
  try {
    // Verificar el formato del header de autorización
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        message: 'Formato de autorización inválido',
        details: 'El header de autorización debe comenzar con "Bearer "' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        message: 'Token no proporcionado',
        details: 'No se encontró un token en el header de autorización'
      });
    }

    // Verificar token con Clerk
    let session;
    try {
      session = await clerkClient.verifyToken(token);
      if (!session) {
        return res.status(401).json({ 
          message: 'Token inválido',
          details: 'El token proporcionado no pudo ser verificado'
        });
      }
    } catch (verifyError) {
      console.error('Error al verificar token:', verifyError);
      return res.status(401).json({ 
        message: 'Token inválido',
        details: 'Error al verificar el token'
      });
    }

    // Obtener información del usuario de Clerk
    let clerkUser;
    try {
      clerkUser = await clerkClient.users.getUser(session.sub);
      if (!clerkUser) {
        return res.status(401).json({ 
          message: 'Usuario no encontrado',
          details: 'No se encontró el usuario en Clerk'
        });
      }
    } catch (clerkError) {
      console.error('Error al obtener usuario de Clerk:', clerkError);
      return res.status(401).json({ 
        message: 'Error al obtener información del usuario',
        details: 'No se pudo obtener la información del usuario de Clerk'
      });
    }

    // Buscar usuario en nuestra base de datos
    let user = await User.findOne({ clerk_id: session.sub });
    
    if (!user) {
      // Crear usuario si no existe
      user = new User({
        clerk_id: session.sub,
        email: clerkUser.emailAddresses[0].emailAddress,
        nombre_negocio: clerkUser.firstName || 'Usuario',
        role: 'user',
        is_active: true
      });
      
      await user.save();
      console.log('Nuevo usuario creado:', user);
    }

    // Devolver información del usuario SIN restricciones de rol
    // Esto permite que los usuarios de_baja sean redirigidos a la página correcta
    res.json({ 
      message: 'Información de rol obtenida exitosamente',
      user: {
        _id: user._id,
        clerk_id: user.clerk_id,
        email: user.email,
        role: user.role,
        nombre_negocio: user.nombre_negocio,
        is_active: user.is_active
      }
    });
  } catch (error) {
    console.error('Error en verificación de rol:', error);
    res.status(500).json({ message: 'Error al verificar rol', error: error.message });
  }
});

// Ruta protegida para obtener perfil del usuario
router.get('/user-profile', authenticate, async (req, res) => {
  try {
    console.log('User profile request for:', req.user); // Debug log
    const user = await User.findOne({ clerk_id: req.user.clerk_id })
      .select('-__v');
    
    if (!user) {
      console.log('User not found in database:', req.user.clerk_id); // Debug log
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    res.json({ 
      message: 'Perfil de usuario obtenido exitosamente',
      user: {
        ...user.toObject(),
        permissions: {
          can_create_notes: true,
          can_edit_own_notes: true,
          can_view_all_notes: ['admin', 'super_admin'].includes(user.role),
          can_edit_all_notes: ['admin', 'super_admin'].includes(user.role),
          can_delete_notes: ['admin', 'super_admin'].includes(user.role),
          can_manage_users: user.role === 'super_admin',
          can_view_dashboard: ['admin', 'super_admin'].includes(user.role)
        }
      }
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ message: 'Error al obtener perfil', error: error.message });
  }
});

// Ruta para registrar un usuario
router.post('/register', async (req, res) => {
  console.log('Registration request received:', req.body); // Debug log
  const { email, nombre_negocio, clerk_id } = req.body;

  try {
    // Validar datos requeridos
    if (!email || !clerk_id) {
      console.log('Missing required fields:', { email, clerk_id }); // Debug log
      return res.status(400).json({ 
        message: 'Email y clerk_id son requeridos',
        received: { email, clerk_id, nombre_negocio }
      });
    }

    // Verificar si ya existe un usuario con ese email o clerk_id
    const existingUser = await User.findOne({
      $or: [{ email }, { clerk_id }]
    });
    
    if (existingUser) {
      console.log('User already exists:', existingUser); // Debug log
      return res.json({ 
        message: 'Usuario ya registrado',
        user: {
          id: existingUser._id,
          email: existingUser.email,
          role: existingUser.role
        }
      });
    }

    // Crear nuevo usuario con rol por defecto 'user'
    const newUser = new User({ 
      email, 
      nombre_negocio: nombre_negocio || 'Mi Negocio',
      clerk_id,
      role: 'user'
    });
    
    await newUser.save();
    console.log('New user created:', newUser); // Debug log
    
    res.status(201).json({ 
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('Error in registration:', err);
    res.status(500).json({ message: 'Error al registrar al usuario', error: err.message });
  }
});

// Ruta de login/verificación (ahora usando solo Clerk)
router.post('/verify-session', async (req, res) => {
  const { token } = req.body;

  try {
    if (!token) {
      return res.status(400).json({ message: 'Token requerido' });
    }

    // Verificar token con Clerk
    const session = await clerkClient.verifyToken(token);
    
    if (!session) {
      return res.status(401).json({ message: 'Token inválido' });
    }

    // Buscar usuario en la base de datos
    const user = await User.findOne({ clerk_id: session.sub });
    
    if (!user) {
      return res.status(404).json({ 
        message: 'Usuario no encontrado en la base de datos',
        clerk_id: session.sub
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ message: 'Usuario desactivado' });
    }

    res.json({ 
      message: 'Sesión verificada exitosamente',
      user: {
        id: user._id,
        clerk_id: user.clerk_id,
        email: user.email,
        nombre_negocio: user.nombre_negocio,
        role: user.role,
        is_active: user.is_active,
        permissions: {
          can_create_notes: true,
          can_edit_own_notes: true,
          can_view_all_notes: ['admin', 'super_admin'].includes(user.role),
          can_edit_all_notes: ['admin', 'super_admin'].includes(user.role),
          can_delete_notes: ['admin', 'super_admin'].includes(user.role),
          can_manage_users: user.role === 'super_admin',
          can_view_dashboard: ['admin', 'super_admin'].includes(user.role)
        }
      }
    });
  } catch (err) {
    console.error('Error verificando sesión:', err);
    res.status(500).json({ message: 'Error en la verificación de sesión', error: err.message });
  }
});

// Ruta para actualizar perfil del usuario
router.put('/update-profile', authenticate, async (req, res) => {
  const { nombre_negocio } = req.body;
  
  try {
    if (!nombre_negocio) {
      return res.status(400).json({ message: 'Nombre del negocio es requerido' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { clerk_id: req.user.id },
      { nombre_negocio, updated_at: Date.now() },
      { new: true }
    ).select('-__v');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ message: 'Error al actualizar perfil', error: error.message });
  }
});

// Ruta para actualizar el perfil de un usuario específico (solo para admin y super_admin)
router.put('/update-profile/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Obtener el usuario actual y el usuario objetivo
    const [currentUser, targetUser] = await Promise.all([
      User.findOne({ clerk_id: req.user.clerk_id }),
      User.findById(userId)
    ]);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Verificar permisos
    if (currentUser.role !== 'super_admin') {
      // Si no es super_admin, verificar restricciones adicionales
      if (currentUser.role === 'admin') {
        // Los admin solo pueden editar usuarios normales
        if (targetUser.role !== 'user') {
          return res.status(403).json({ 
            message: 'No tienes permisos para editar este usuario' 
          });
        }
      } else {
        // Usuarios normales solo pueden editar su propio perfil
        if (targetUser._id.toString() !== currentUser._id.toString()) {
          return res.status(403).json({ 
            message: 'Solo puedes editar tu propio perfil' 
          });
        }
      }
    }

    // Realizar la actualización
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    );

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ 
      message: 'Error al actualizar perfil', 
      error: error.message 
    });
  }
});

// Ruta para obtener información básica de roles (para el frontend)
router.get('/roles-info', authenticate, (req, res) => {
  const rolesInfo = {
    user: {
      name: 'Usuario',
      permissions: ['crear_notas', 'editar_propias_notas', 'ver_propias_notas']
    },
    admin: {
      name: 'Administrador',
      permissions: ['crear_notas', 'editar_todas_notas', 'ver_todas_notas', 'eliminar_notas', 'ver_dashboard']
    },
    super_admin: {
      name: 'Super Administrador',
      permissions: ['todos_permisos', 'gestionar_usuarios', 'asignar_roles', 'ver_estadisticas']
    }
  };

  res.json({
    roles: rolesInfo,
    current_user_role: req.user.role
  });
});

// Ruta para verificar el estado de autenticación
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const session = await clerkClient.verifyToken(token);
    res.json({ valid: true, session });
  } catch (error) {
    console.error('Error verificando token:', error);
    res.status(401).json({ valid: false, error: error.message });
  }
});

// Ruta para registrar un nuevo usuario desde Clerk
router.post('/register', async (req, res) => {
  console.log('Recibida solicitud de registro:', req.body); // Debug log

  try {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const session = await clerkClient.verifyToken(token);
    const { email } = req.body;

    // Verificar si el usuario ya existe
    let user = await User.findOne({ clerk_id: session.sub });
    
    if (user) {
      console.log('Usuario ya existe:', user); // Debug log
      return res.json({
        message: 'Usuario ya registrado',
        user: {
          id: user._id,
          email: user.email,
          role: user.role
        }
      });
    }

    // Crear nuevo usuario
    user = new User({
      clerk_id: session.sub,
      email: email || session.claims.email,
      role: 'user',
      is_active: true
    });

    await user.save();
    console.log('Nuevo usuario creado:', user); // Debug log

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ message: 'Error al registrar usuario', error: error.message });
  }
});

// Ruta para obtener el perfil propio
router.get('/my-profile', authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ clerk_id: req.user.clerk_id })
      .select('-__v');
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    res.json({
      message: 'Perfil obtenido exitosamente',
      user: user
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ message: 'Error al obtener perfil', error: error.message });
  }
});

// Ruta para actualizar el perfil propio
router.put('/update-my-profile', authenticate, async (req, res) => {
  try {
    const { nombre_negocio, email } = req.body;
    
    // Validaciones básicas
    if (!nombre_negocio && !email) {
      return res.status(400).json({ message: 'No se proporcionaron datos para actualizar' });
    }

    const updateData = {};
    if (nombre_negocio) updateData.nombre_negocio = nombre_negocio;
    if (email) updateData.email = email;
    updateData.updated_at = Date.now();

    const updatedUser = await User.findOneAndUpdate(
      { clerk_id: req.user.clerk_id },
      updateData,
      { new: true }
    ).select('-__v');

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ message: 'Error al actualizar perfil', error: error.message });
  }
});

// Ruta para obtener lista de usuarios (para admins y super_admins)
router.get('/users', authenticate, async (req, res) => {
  try {
    console.log('=== Users List Request ===');
    console.log('User requesting:', req.user);
    
    if (!req.user || !req.user.role) {
      return res.status(401).json({ 
        message: 'Usuario no autenticado correctamente'
      });
    }

    // Solo admins y super_admins pueden ver la lista de usuarios
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'No tienes permisos para ver la lista de usuarios'
      });
    }

    console.log('Fetching users for role:', req.user.role);
      // Obtener todos los usuarios activos
    let query = { is_active: true };
    
    // Si es admin, puede ver usuarios normales + sí mismo
    // Si es super_admin, puede ver todos (users, admins) + sí mismo
    if (req.user.role === 'admin') {
      query.$or = [
        { role: 'user' },
        { clerk_id: req.user.clerk_id } // Incluir al admin actual
      ];
    } else if (req.user.role === 'super_admin') {
      query.role = { $in: ['user', 'admin', 'super_admin'] }; // Incluir todos incluyendo super_admin actual
    }

    const users = await User.find(query)
      .select('clerk_id email nombre_negocio role')
      .sort({ nombre_negocio: 1, email: 1 });

    console.log('Found users:', users.length);

    // Mapear los usuarios a un formato consistente
    const userList = users.map(user => ({
      clerk_id: user.clerk_id,
      email: user.email,
      nombre_negocio: user.nombre_negocio,
      role: user.role
    }));

    console.log('Sending user list:', userList.length, 'usuarios');

    res.status(200).json(userList);
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ 
      message: 'Error al obtener la lista de usuarios',
      error: error.message 
    });
  }
});

module.exports = router;