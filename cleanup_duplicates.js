// Script para eliminar productos duplicados
db.productos.aggregate([
  {
    $group: {
      _id: { catalogoProductoId: "$catalogoProductoId", categoryId: "$categoryId" },
      docs: { $push: "$$ROOT" },
      count: { $sum: 1 }
    }
  },
  {
    $match: {
      count: { $gt: 1 }
    }
  }
]).forEach(function(group) {
  // Ordenar por fecha de creación y mantener solo el más reciente
  group.docs.sort(function(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  // Eliminar todos excepto el primero (más reciente)
  for (let i = 1; i < group.docs.length; i++) {
    db.productos.deleteOne({ _id: group.docs[i]._id });
    print('Eliminado producto duplicado: ' + group.docs[i]._id);
  }
});

print('Limpieza de duplicados completada');
