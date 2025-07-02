// check-and-update-user-role.js - Script para verificar y actualizar el rol del usuario
require('dotenv').config({ path: '.env.production' });
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkAndUpdateUserRole() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Buscar todos los usuarios
    const users = await User.find({}).select('clerk_id email role nombre_negocio');
    
    console.log('\n📋 Current users in database:');
    console.log('================================');
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. Email: ${user.email}`);
      console.log(`   Clerk ID: ${user.clerk_id}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Business: ${user.nombre_negocio || 'N/A'}`);
      console.log('   ---');
    });

    if (users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }

    // Si solo hay un usuario, asumir que es el super admin
    if (users.length === 1) {
      const user = users[0];
      if (user.role !== 'super_admin') {
        console.log(`\n🔧 Updating user ${user.email} to super_admin role...`);
        
        await User.findByIdAndUpdate(user._id, {
          role: 'super_admin',
          updated_at: new Date()
        });
        
        console.log('✅ User role updated to super_admin');
      } else {
        console.log(`\n✅ User ${user.email} already has super_admin role`);
      }
    } else {
      console.log('\n⚠️  Multiple users found. Please specify which user should be super_admin');
      console.log('You can run this script with a specific email:');
      console.log('node check-and-update-user-role.js your-email@example.com');
    }

    // Verificar el resultado
    const updatedUsers = await User.find({}).select('email role');
    console.log('\n📋 Updated user roles:');
    updatedUsers.forEach(user => {
      console.log(`  ${user.email}: ${user.role}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Si se proporciona un email como argumento, actualizar ese usuario específico
const targetEmail = process.argv[2];

if (targetEmail) {
  updateSpecificUser(targetEmail);
} else {
  checkAndUpdateUserRole();
}

async function updateSpecificUser(email) {
  try {
    console.log(`🔌 Connecting to MongoDB to update ${email}...`);
    await mongoose.connect(process.env.MONGODB_URI);
    
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`❌ User with email ${email} not found`);
      return;
    }
    
    console.log(`🔧 Updating ${email} to super_admin role...`);
    await User.findByIdAndUpdate(user._id, {
      role: 'super_admin',
      updated_at: new Date()
    });
    
    console.log('✅ User role updated to super_admin');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkAndUpdateUserRole();
