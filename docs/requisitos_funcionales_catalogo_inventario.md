# Documento de Requisitos Funcionales

## Gestión de Catálogo e Inventario de Productos

### 1. Objetivo
Implementar un sistema de catálogo de productos que permita:
- Registrar productos únicos por nombre/código en el catálogo.
- Al crear un producto, si ya existe en el catálogo, incrementar la cantidad en el inventario en vez de crear un nuevo registro.
- Evitar la duplicidad de nombres de productos en el inventario.
- Mantener la trazabilidad y consistencia del stock.

---

### 2. Requisitos Funcionales

#### RF1. Catálogo de Productos
- RF1.1: El sistema debe contar con un modelo de catálogo de productos, donde cada producto tiene un código único (`codigoCatalogo`), nombre, descripción y categoría.
- RF1.2: No se permite registrar dos productos con el mismo nombre o código en el catálogo.

#### RF2. Creación de Productos en Inventario
- RF2.1: Al intentar crear un producto, el sistema debe buscar primero en el catálogo si existe un producto con el mismo nombre o código.
- RF2.2: Si el producto existe en el catálogo, el sistema debe incrementar la cantidad del producto existente en el inventario, en vez de crear un nuevo registro.
- RF2.3: Si el producto no existe en el catálogo, el sistema debe permitir crear un nuevo producto en el catálogo y en el inventario.

#### RF3. Actualización de Inventario
- RF3.1: El sistema debe permitir incrementar o decrementar la cantidad de un producto existente en el inventario, manteniendo la referencia al catálogo.
- RF3.2: El sistema debe registrar cada movimiento de inventario (ingreso, venta, devolución, etc.) para trazabilidad.

#### RF4. Integridad y Consistencia
- RF4.1: No se debe permitir la creación de productos con nombres o códigos duplicados en el catálogo.
- RF4.2: El inventario debe estar siempre sincronizado con el catálogo, es decir, cada producto en inventario debe estar asociado a un producto en el catálogo.

#### RF5. Consultas y Reportes
- RF5.1: El sistema debe permitir consultar el catálogo de productos y el inventario actual.
- RF5.2: El sistema debe permitir filtrar productos por nombre, código, categoría, y cantidad disponible.

---

### 3. Casos de Uso

- CU1: Registrar un nuevo producto en el catálogo e inventario.
- CU2: Ingresar stock de un producto existente (incrementar cantidad).
- CU3: Consultar productos del catálogo y su stock actual.
- CU4: Prevenir la creación de productos duplicados por nombre o código.

---

### 4. Requisitos No Funcionales (Opcionales)
- RNF1: El sistema debe ser accesible vía API REST.
- RNF2: El sistema debe validar los datos de entrada y mostrar mensajes claros de error.
- RNF3: El sistema debe ser escalable para soportar un gran número de productos.

---

### 5. Glosario
- **Catálogo de Productos:** Lista maestra de productos únicos por nombre/código.
- **Inventario:** Registro de existencias y movimientos de cada producto.
- **Stock:** Cantidad disponible de un producto en inventario.

---

### 6. Notas
- El catálogo es la fuente de verdad para los productos.
- El inventario solo puede tener productos que existan en el catálogo.
- Toda operación de ingreso de stock debe asociarse a un producto del catálogo.
