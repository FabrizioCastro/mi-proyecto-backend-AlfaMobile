const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuración PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'alfa_mobile_db',
  password: process.env.DB_PASSWORD || 'tu_password',
  port: process.env.DB_PORT || 5433,
});

// Función para crear todas las tablas
async function crearTablas() {
  try {
    console.log("🔄 Creando tablas en PostgreSQL...");

    // Tabla puestos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS puestos (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla empleados
    await pool.query(`
      CREATE TABLE IF NOT EXISTS empleados (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        work_email VARCHAR(255),
        work_phone VARCHAR(100),
        identification_id VARCHAR(50),
        job_id INTEGER REFERENCES puestos(id),
        fecha_ingreso DATE,
        salario DECIMAL(10,2),
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla clientes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(100),
        vat VARCHAR(20),
        street VARCHAR(255),
        city VARCHAR(100),
        customer_rank INTEGER DEFAULT 1,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla proveedores
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proveedores (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(100),
        vat VARCHAR(20),
        supplier_rank INTEGER DEFAULT 1,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla productos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        price DECIMAL(10,2) DEFAULT 0,
        cost DECIMAL(10,2) DEFAULT 0,
        barcode VARCHAR(100),
        type VARCHAR(50) DEFAULT 'consu',
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla ventas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER REFERENCES clientes(id),
        date_order DATE NOT NULL,
        amount_total DECIMAL(10,2) DEFAULT 0,
        state VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla inventario
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventario (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES productos(id),
        location_name VARCHAR(255),
        quantity DECIMAL(10,2) DEFAULT 0,
        reserved_quantity DECIMAL(10,2) DEFAULT 0,
        available_quantity DECIMAL(10,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ============ NUEVAS TABLAS PARA EL SISTEMA DE PROVEEDORES ============

    // Tabla marcas (global para todos los proveedores)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS marcas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        descripcion TEXT,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla modelos (global para todos los proveedores)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS modelos (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        marca_id INTEGER REFERENCES marcas(id),
        descripcion TEXT,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(name, marca_id)
      )
    `);

    // Tabla pedidos (de proveedores)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos_proveedor (
        id SERIAL PRIMARY KEY,
        proveedor_id INTEGER REFERENCES proveedores(id),
        numero_pedido VARCHAR(100) UNIQUE,
        fecha_pedido DATE NOT NULL,
        fecha_entrega DATE,
        estado VARCHAR(50) DEFAULT 'pendiente',
        total DECIMAL(12,2) DEFAULT 0,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla productos_detallados (cada producto con IMEI único)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos_detallados (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER REFERENCES pedidos_proveedor(id),
        modelo_id INTEGER REFERENCES modelos(id),
        imei_1 VARCHAR(20) UNIQUE,
        imei_2 VARCHAR(20),
        costo DECIMAL(10,2) NOT NULL,
        fecha_ingreso DATE NOT NULL,
        estado VARCHAR(50) DEFAULT 'en_stock',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla cuentas_por_pagar
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
        id SERIAL PRIMARY KEY,
        proveedor_id INTEGER REFERENCES proveedores(id),
        pedido_id INTEGER REFERENCES pedidos_proveedor(id),
        monto DECIMAL(12,2) NOT NULL,
        fecha_vencimiento DATE,
        estado VARCHAR(50) DEFAULT 'pendiente',
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log("✅ Todas las tablas creadas en PostgreSQL");
  } catch (error) {
    console.error("❌ Error creando tablas:", error);
  }
}
// ===================== ACTUALIZAR CUENTAS POR PAGAR =====================
async function actualizarTablaCuentasPorPagar() {
  try {
    // Agregar columnas nuevas si no existen
    await pool.query(`
      DO $$ 
      BEGIN
        -- Agregar egreso_id si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='cuentas_por_pagar' AND column_name='egreso_id') THEN
          ALTER TABLE cuentas_por_pagar ADD COLUMN egreso_id INTEGER REFERENCES egresos(id);
        END IF;
        
        -- Agregar fecha_registro si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='cuentas_por_pagar' AND column_name='fecha_registro') THEN
          ALTER TABLE cuentas_por_pagar ADD COLUMN fecha_registro DATE;
        END IF;
        
        -- Agregar fecha_pago si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='cuentas_por_pagar' AND column_name='fecha_pago') THEN
          ALTER TABLE cuentas_por_pagar ADD COLUMN fecha_pago DATE;
        END IF;
        
        -- Agregar pagado si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='cuentas_por_pagar' AND column_name='pagado') THEN
          ALTER TABLE cuentas_por_pagar ADD COLUMN pagado BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    
    console.log("✅ Tabla cuentas_por_pagar actualizada");
  } catch (e) {
    console.error("Error actualizando cuentas_por_pagar:", e);
  }
}

// Agregar columna tipo_egreso a egresos para identificar origen
async function actualizarTablaEgresos() {
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='egresos' AND column_name='origen') THEN
          ALTER TABLE egresos ADD COLUMN origen VARCHAR(50) DEFAULT 'manual';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='egresos' AND column_name='pedido_proveedor_id') THEN
          ALTER TABLE egresos ADD COLUMN pedido_proveedor_id INTEGER REFERENCES pedidos_proveedor(id);
        END IF;
      END $$;
    `);
    console.log("✅ Tabla egresos actualizada");
  } catch (e) {
    console.error("Error actualizando egresos:", e);
  }
}

// ===================== ACTUALIZAR TABLA EGRESOS CON PAGADO =====================
async function actualizarTablaEgresosPagado() {
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        -- Agregar pagado si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='egresos' AND column_name='pagado') THEN
          ALTER TABLE egresos ADD COLUMN pagado BOOLEAN DEFAULT false;
        END IF;
        
        -- Agregar fecha_pago si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='egresos' AND column_name='fecha_pago') THEN
          ALTER TABLE egresos ADD COLUMN fecha_pago DATE;
        END IF;
      END $$;
    `);
    console.log("✅ Tabla egresos actualizada con pagado y fecha_pago");
  } catch (e) {
    console.error("Error actualizando egresos con pagado:", e);
  }
}

// ===================== CREAR TABLA CUENTAS POR COBRAR =====================
async function crearTablaCuentasPorCobrar() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
        id SERIAL PRIMARY KEY,
        venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
        cliente_id INTEGER REFERENCES clientes(id),
        monto DECIMAL(12,2) NOT NULL,
        fecha_registro DATE NOT NULL,
        fecha_vencimiento DATE,
        fecha_cobro DATE,
        cobrado BOOLEAN DEFAULT false,
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Tabla cuentas_por_cobrar verificada");
  } catch (e) {
    console.error("Error creando cuentas_por_cobrar:", e);
  }
}

// ACTUALIZAR TABLA VENTAS CON CAMPOS DE PAGO
async function actualizarTablaVentasPagado() {
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        -- Agregar pagado si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='ventas' AND column_name='pagado') THEN
          ALTER TABLE ventas ADD COLUMN pagado BOOLEAN DEFAULT false;
        END IF;
        
        -- Agregar fecha_pago si no existe
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='ventas' AND column_name='fecha_pago') THEN
          ALTER TABLE ventas ADD COLUMN fecha_pago DATE;
        END IF;
      END $$;
    `);
    console.log("✅ Tabla ventas actualizada con pagado y fecha_pago");
  } catch (e) {
    console.error("Error actualizando ventas con pagado:", e);
  }
}

// 1. ACTUALIZAR TABLA VENTAS - Agregar campo 'anulado'
async function actualizarTablaVentasAnulado() {
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='ventas' AND column_name='anulado') THEN
          ALTER TABLE ventas ADD COLUMN anulado BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log("✅ Tabla ventas actualizada con campo anulado");
  } catch (e) {
    console.error("Error actualizando ventas con anulado:", e);
  }
}

// 2. ACTUALIZAR TABLA EGRESOS - Agregar campo 'eliminado'
async function actualizarTablaEgresosEliminado() {
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name='egresos' AND column_name='eliminado') THEN
          ALTER TABLE egresos ADD COLUMN eliminado BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log("✅ Tabla egresos actualizada con campo eliminado");
  } catch (e) {
    console.error("Error actualizando egresos con eliminado:", e);
  }
}

// Llamar las funciones al inicio
crearTablas();
crearTablaTiposEgreso();
crearTablaEgresos();
actualizarTablaEgresos();
actualizarTablaEgresosPagado();
actualizarTablaCuentasPorPagar();
crearTablaVentasDetalle();
crearTablaCuentasPorCobrar(); // 👈 NUEVO
agregarUpdatedAtPedidos();
actualizarTablaVentasPagado();
actualizarTablaVentasAnulado();
actualizarTablaEgresosEliminado();

const PORT = process.env.PORT || 3001;

/* --------- RUTAS --------- */

// ping (prueba rápida)
app.get("/api/ping", (_, res) => res.json({ ok: true }));

// ===================== CLIENTES =====================
app.get("/api/clientes", async (req, res) => {
  try {
    const { q } = req.query;
    
    let query = `SELECT * FROM clientes WHERE activo = true`;
    let params = [];

    if (q) {
      query += ` AND (name ILIKE $1 OR email ILIKE $1 OR vat ILIKE $1)`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/clientes:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/clientes", async (req, res) => {
  try {
    const { name, email, phone, vat, street, city } = req.body;
    
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const result = await pool.query(
      `INSERT INTO clientes (name, email, phone, vat, street, city) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id`,
      [name, email, phone, vat, street, city]
    );

    res.json({ id: result.rows[0].id });
  } catch (e) {
    console.error("ERROR POST /api/clientes:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== EMPLEADOS =====================
app.get("/api/empleados", async (req, res) => {
  try {
    const { q, incluir_eliminados } = req.query;
    
    let query = `
      SELECT e.*, p.name as job_name 
      FROM empleados e 
      LEFT JOIN puestos p ON e.job_id = p.id 
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;

    if (!incluir_eliminados || incluir_eliminados === 'false') {
      query += ` AND e.activo = true`;
    }

    if (q) {
      paramCount++;
      query += ` AND (e.name ILIKE $${paramCount} OR e.work_email ILIKE $${paramCount} OR e.identification_id ILIKE $${paramCount})`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY e.name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/empleados:", e);
    res.status(500).json({ error: e.message });
  }
});

// CREAR EMPLEADO
app.post("/api/empleados", async (req, res) => {
  try {
    const {
      name,
      work_email,
      work_phone,
      job_id,
      identification_id,
      fecha_ingreso,
      salario
    } = req.body;

    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const result = await pool.query(
      `INSERT INTO empleados (name, work_email, work_phone, job_id, identification_id, fecha_ingreso, salario)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [name, work_email, work_phone, job_id, identification_id, fecha_ingreso, salario]
    );

    res.json({ 
      id: result.rows[0].id,
      message: "Empleado creado correctamente"
    });
  } catch (e) {
    console.error("ERROR POST /api/empleados:", e);
    res.status(500).json({ error: e.message });
  }
});

// ACTUALIZAR EMPLEADO
app.put("/api/empleados/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      work_email,
      work_phone,
      job_id,
      identification_id,
      fecha_ingreso,
      salario
    } = req.body;

    const existe = await pool.query('SELECT id FROM empleados WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    await pool.query(
      `UPDATE empleados 
       SET name = $1, work_email = $2, work_phone = $3, job_id = $4, 
           identification_id = $5, fecha_ingreso = $6, salario = $7,
           updated_at = NOW()
       WHERE id = $8`,
      [name, work_email, work_phone, job_id, identification_id, fecha_ingreso, salario, id]
    );

    res.json({ message: "Empleado actualizado correctamente" });
  } catch (e) {
    console.error("ERROR PUT /api/empleados:", e);
    res.status(500).json({ error: e.message });
  }
});

// ELIMINAR EMPLEADO
app.delete("/api/empleados/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existe = await pool.query('SELECT id FROM empleados WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: "Empleado no encontrado" });
    }

    await pool.query(
      'UPDATE empleados SET activo = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({ message: "Empleado eliminado correctamente" });
  } catch (e) {
    console.error("ERROR DELETE /api/empleados:", e);
    res.status(500).json({ error: e.message });
  }
});

// RECUPERAR EMPLEADO
app.put("/api/empleados/:id/recuperar", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      'UPDATE empleados SET activo = true, updated_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({ message: "Empleado recuperado correctamente" });
  } catch (e) {
    console.error("ERROR recuperar empleado:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PUESTOS =====================
app.get("/api/puestos", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM puestos ORDER BY name');
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/puestos:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/puestos", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const result = await pool.query(
      'INSERT INTO puestos (name) VALUES ($1) RETURNING id',
      [name]
    );

    res.json({ id: result.rows[0].id });
  } catch (e) {
    console.error("ERROR POST /api/puestos:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PROVEEDORES =====================
app.get("/api/proveedores", async (req, res) => {
  try {
    const { q } = req.query;
    
    let query = `SELECT * FROM proveedores WHERE activo = true`;
    let params = [];

    if (q) {
      query += ` AND (name ILIKE $1 OR email ILIKE $1 OR vat ILIKE $1)`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/proveedores:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/proveedores", async (req, res) => {
  try {
    const { name, email, phone, vat } = req.body;
    
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const result = await pool.query(
      `INSERT INTO proveedores (name, email, phone, vat) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id`,
      [name, email, phone, vat]
    );

    res.json({ id: result.rows[0].id });
  } catch (e) {
    console.error("ERROR POST /api/proveedores:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PRODUCTOS =====================
app.get("/api/productos", async (req, res) => {
  try {
    const { q } = req.query;
    
    let query = `SELECT * FROM productos WHERE activo = true`;
    let params = [];

    if (q) {
      query += ` AND (name ILIKE $1 OR sku ILIKE $1 OR barcode ILIKE $1)`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/productos:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/productos", async (req, res) => {
  try {
    const { name, sku, price, cost, barcode } = req.body;
    
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const result = await pool.query(
      `INSERT INTO productos (name, sku, price, cost, barcode) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [name, sku, price, cost, barcode]
    );

    res.json({ id: result.rows[0].id });
  } catch (e) {
    console.error("ERROR POST /api/productos:", e);
    res.status(500).json({ error: e.message });
  }
});



// ===================== VENTAS =====================
app.get("/api/ventas/resumen", async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    
    if (!desde || !hasta) {
      return res.status(400).json({ error: "Faltan 'desde' y 'hasta' (YYYY-MM-DD)" });
    }

    const result = await pool.query(
      `SELECT COUNT(*) as cantidad, COALESCE(SUM(amount_total), 0) as total
       FROM ventas 
       WHERE date_order >= $1 AND date_order <= $2 AND state = 'done'`,
      [desde, hasta]
    );

    const { cantidad, total } = result.rows[0];
    
    res.json({ 
      total: parseFloat(total),
      cantidad: parseInt(cantidad),
      desde, 
      hasta 
    });
  } catch (e) {
    console.error("ERROR /api/ventas/resumen:", e);
    res.status(500).json({ error: e.message });
  }
});



// ===================== MARCAS =====================

// LISTAR MARCAS
app.get("/api/marcas", async (req, res) => {
  try {
    const { q } = req.query;
    
    let query = `SELECT * FROM marcas WHERE activo = true`;
    let params = [];

    if (q) {
      query += ` AND name ILIKE $1`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/marcas:", e);
    res.status(500).json({ error: e.message });
  }
});

// CREAR MARCA
app.post("/api/marcas", async (req, res) => {
  try {
    const { name, descripcion } = req.body;
    
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const result = await pool.query(
      `INSERT INTO marcas (name, descripcion) 
       VALUES ($1, $2) 
       RETURNING id, name, descripcion`,
      [name, descripcion]
    );

    res.json({ 
      id: result.rows[0].id,
      message: "Marca creada correctamente",
      marca: result.rows[0]
    });
  } catch (e) {
    console.error("ERROR POST /api/marcas:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== MODELOS =====================

// LISTAR MODELOS (con información de marca)
app.get("/api/modelos", async (req, res) => {
  try {
    const { q, marca_id } = req.query;
    
    let query = `
      SELECT m.*, ma.name as marca_name 
      FROM modelos m 
      LEFT JOIN marcas ma ON m.marca_id = ma.id 
      WHERE m.activo = true
    `;
    let params = [];
    let paramCount = 0;

    if (marca_id) {
      paramCount++;
      query += ` AND m.marca_id = $${paramCount}`;
      params.push(marca_id);
    }

    if (q) {
      paramCount++;
      query += ` AND m.name ILIKE $${paramCount}`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY ma.name, m.name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/modelos:", e);
    res.status(500).json({ error: e.message });
  }
});

// CREAR MODELO
app.post("/api/modelos", async (req, res) => {
  try {
    const { name, marca_id, descripcion } = req.body;
    
    if (!name) return res.status(400).json({ error: "Falta 'name'" });
    if (!marca_id) return res.status(400).json({ error: "Falta 'marca_id'" });

    // Verificar que la marca existe
    const marcaExiste = await pool.query('SELECT id FROM marcas WHERE id = $1 AND activo = true', [marca_id]);
    if (marcaExiste.rows.length === 0) {
      return res.status(404).json({ error: "Marca no encontrada" });
    }

    const result = await pool.query(
      `INSERT INTO modelos (name, marca_id, descripcion) 
       VALUES ($1, $2, $3) 
       RETURNING id, name, marca_id, descripcion`,
      [name, marca_id, descripcion]
    );

    res.json({ 
      id: result.rows[0].id,
      message: "Modelo creado correctamente",
      modelo: result.rows[0]
    });
  } catch (e) {
    console.error("ERROR POST /api/modelos:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PEDIDOS PROVEEDOR =====================

// MODIFICAR: GET /api/pedidos-proveedor (agregar total calculado y count productos)
app.get("/api/pedidos-proveedor", async (req, res) => {
  try {
    const { proveedor_id } = req.query;
    
    let query = `
      SELECT 
        pp.*, 
        p.name as proveedor_name,
        COALESCE(SUM(pd.costo), 0) as total,  -- 👈 Total calculado en tiempo real (de productos activos)
        COUNT(pd.id) FILTER (WHERE pd.estado != 'eliminado') as productos_count  -- 👈 Solo activos
      FROM pedidos_proveedor pp 
      LEFT JOIN proveedores p ON pp.proveedor_id = p.id
      LEFT JOIN productos_detallados pd ON pp.id = pd.pedido_id
      WHERE 1=1
    `;
    let params = [];
    if (proveedor_id) {
      query += ` AND pp.proveedor_id = $1`;
      params.push(proveedor_id);
    }
    query += ` GROUP BY pp.id, p.name ORDER BY pp.fecha_pedido DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);  // Ahora trae total y productos_count actualizados
  } catch (e) {
    console.error("ERROR /api/pedidos-proveedor:", e);
    res.status(500).json({ error: e.message });
  }
});



// ===================== PRODUCTOS DETALLADOS =====================

// LISTAR PRODUCTOS POR PEDIDO
app.get("/api/productos-detallados", async (req, res) => {
  try {
    const { pedido_id } = req.query;
    
    if (!pedido_id) {
      return res.status(400).json({ error: "Falta pedido_id" });
    }

    const result = await pool.query(
      `SELECT pd.*, m.name as modelo_name, ma.name as marca_name 
       FROM productos_detallados pd 
       LEFT JOIN modelos m ON pd.modelo_id = m.id 
       LEFT JOIN marcas ma ON m.marca_id = ma.id 
       WHERE pd.pedido_id = $1 
       ORDER BY pd.created_at DESC`,
      [pedido_id]
    );

    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/productos-detallados:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PRODUCTOS DETALLADOS =====================
app.post("/api/productos-detallados", async (req, res) => {
  try {
    const { pedido_id, modelo_id, imei_1, imei_2, costo, fecha_ingreso } = req.body;
    
    if (!pedido_id || !modelo_id || !imei_1 || !costo || !fecha_ingreso) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Verificar que el pedido existe
    const pedidoExiste = await pool.query('SELECT id FROM pedidos_proveedor WHERE id = $1', [pedido_id]);
    if (pedidoExiste.rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    // 👈 NUEVO: Verificar que el modelo existe y está activo
    const modeloExiste = await pool.query('SELECT id FROM modelos WHERE id = $1 AND activo = true', [modelo_id]);
    if (modeloExiste.rows.length === 0) {
      return res.status(404).json({ error: "Modelo no encontrado o inactivo" });
    }

    const result = await pool.query(
      `INSERT INTO productos_detallados (pedido_id, modelo_id, imei_1, imei_2, costo, fecha_ingreso, estado) 
       VALUES ($1, $2, $3, $4, $5, $6, 'en_stock')  -- Estado por defecto 'en_stock'
       RETURNING id, imei_1, costo, fecha_ingreso`,
      [pedido_id, modelo_id, imei_1, imei_2, costo, fecha_ingreso]
    );

    const nuevoId = result.rows[0].id;

    // 👈 CRÍTICO: Recalcular total del pedido después del insert
    await recalcularTotalPedido(pedido_id);

    console.log(`✅ Producto agregado: ID ${nuevoId}, Pedido ${pedido_id}, Costo S/ ${costo}`);  // DEBUG

    res.json({ 
      id: nuevoId,
      message: "Producto agregado correctamente"
    });
  } catch (e) {
    console.error("❌ ERROR POST /api/productos-detallados:", e);
    res.status(500).json({ error: e.message });
  }
});


// ACTUALIZAR TOTAL DE PEDIDO (también actualiza egreso y cuenta por pagar)
async function recalcularTotalPedido(pedidoId) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Sumar costos de productos activos del pedido
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(costo), 0) as total 
       FROM productos_detallados 
       WHERE pedido_id = $1 AND estado = 'en_stock'`,
      [pedidoId]
    );
    
    const total = parseFloat(totalResult.rows[0].total);

    // Actualizar pedido
    await client.query(
      `UPDATE pedidos_proveedor 
       SET total = $1, updated_at = NOW()
       WHERE id = $2`,
      [total, pedidoId]
    );
    
    // Actualizar egreso asociado
    await client.query(
      `UPDATE egresos 
       SET monto = $1 
       WHERE pedido_proveedor_id = $2`,
      [total, pedidoId]
    );
    
    // Actualizar cuenta por pagar asociada
    await client.query(
      `UPDATE cuentas_por_pagar 
       SET monto = $1 
       WHERE pedido_id = $2`,
      [total, pedidoId]
    );
    
    await client.query('COMMIT');
    
    console.log(`💰 Total recalculado para pedido ${pedidoId}: S/ ${total.toFixed(2)}`);
    return total;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error recalculando total de pedido:", error);
    throw error;
  } finally {
    client.release();
  }
}

// ===================== INVENTARIO JERÁRQUICO =====================
app.get("/api/inventario", async (req, res) => {
  try {
    const { q } = req.query;  // Filtro opcional por búsqueda

    let query = `
      SELECT 
        ma.id as marca_id,
        ma.name as marca,
        m.id as modelo_id,
        m.name as modelo,
        pd.id as producto_id,
        pd.imei_1,
        pd.imei_2,
        pd.costo,
        pd.fecha_ingreso,
        pd.estado,
        pr.name as proveedor
      FROM productos_detallados pd
      INNER JOIN modelos m ON pd.modelo_id = m.id
      INNER JOIN marcas ma ON m.marca_id = ma.id
      LEFT JOIN pedidos_proveedor pp ON pd.pedido_id = pp.id
      LEFT JOIN proveedores pr ON pp.proveedor_id = pr.id
      WHERE pd.estado = 'en_stock'
    `;
    let params = [];

    // Filtro de búsqueda
    if (q) {
      query += ` AND (
        LOWER(ma.name) LIKE $${params.length + 1} OR 
        LOWER(m.name) LIKE $${params.length + 1} OR 
        LOWER(pd.imei_1) LIKE $${params.length + 1} OR
        LOWER(pr.name) LIKE $${params.length + 1}
      )`;
      params.push(`%${q.toLowerCase()}%`);
    }

    query += ` ORDER BY ma.name, m.name, pd.fecha_ingreso DESC`;

    const result = await pool.query(query, params);
    
    // Agrupar por marca > modelo > unidades
    const inventarioJerarquico = {};
    
    result.rows.forEach(row => {
      const marcaKey = row.marca_id;
      
      if (!inventarioJerarquico[marcaKey]) {
        inventarioJerarquico[marcaKey] = {
          marca_id: row.marca_id,
          marca: row.marca,
          stock_total: 0,
          modelos: {}
        };
      }
      
      const modeloKey = row.modelo_id;
      
      if (!inventarioJerarquico[marcaKey].modelos[modeloKey]) {
        inventarioJerarquico[marcaKey].modelos[modeloKey] = {
          modelo_id: row.modelo_id,
          modelo: row.modelo,
          stock: 0,
          unidades: []
        };
      }
      
      inventarioJerarquico[marcaKey].modelos[modeloKey].unidades.push({
        producto_id: row.producto_id,
        imei_1: row.imei_1,
        imei_2: row.imei_2,
        costo: parseFloat(row.costo),
        fecha_ingreso: row.fecha_ingreso,
        proveedor: row.proveedor,
        estado: row.estado
      });
      
      inventarioJerarquico[marcaKey].modelos[modeloKey].stock++;
      inventarioJerarquico[marcaKey].stock_total++;
    });
    
    // Convertir objetos a arrays
    const inventarioFinal = Object.values(inventarioJerarquico).map(marca => ({
      ...marca,
      modelos: Object.values(marca.modelos)
    }));

    console.log(`📦 Inventario jerárquico: ${inventarioFinal.length} marcas`);
    res.json(inventarioFinal);
  } catch (e) {
    console.error("❌ ERROR /api/inventario:", e);
    res.status(500).json({ error: 'Error al obtener inventario', details: e.message });
  }
});

// NUEVA: PUT /api/productos-detallados/:id (para editar producto, ej: cambiar costo)
app.put("/api/productos-detallados/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { imei_1, imei_2, costo, fecha_ingreso, estado } = req.body;
    // Verificar producto existe
    const productoExiste = await pool.query('SELECT id, pedido_id FROM productos_detallados WHERE id = $1', [id]);
    if (productoExiste.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    const pedidoId = productoExiste.rows[0].pedido_id;
    // Actualizar (solo campos proporcionados, pero para simplicidad actualizamos todos)
    await pool.query(
      `UPDATE productos_detallados 
       SET imei_1 = $1, imei_2 = $2, costo = $3, fecha_ingreso = $4, estado = COALESCE($5, estado)
       WHERE id = $6`,
      [imei_1, imei_2, costo, fecha_ingreso, estado, id]
    );
    // 👈 Recalcular total (si cambió costo o estado a 'eliminado')
    await recalcularTotalPedido(pedidoId);
    res.json({ message: "Producto actualizado correctamente" });
  } catch (e) {
    console.error("ERROR PUT /api/productos-detallados:", e);
    res.status(500).json({ error: e.message });
  }
});

// NUEVA: GET /api/ventas/meses (para comparador en Ventas.tsx)
app.get("/api/ventas/meses", async (req, res) => {
  try {
    const { desde, hasta } = req.query;  // YYYY-MM formato
    
    if (!desde || !hasta) {
      return res.status(400).json({ error: "Faltan 'desde' y 'hasta' (YYYY-MM)" });
    }
    const result = await pool.query(
      `SELECT 
         TO_CHAR(date_order, 'YYYY-MM') as mes,
         COUNT(*) as cantidad,
         COALESCE(SUM(amount_total), 0) as total
       FROM ventas 
       WHERE TO_CHAR(date_order, 'YYYY-MM') >= $1 
         AND TO_CHAR(date_order, 'YYYY-MM') <= $2 
         AND state = 'done'
       GROUP BY TO_CHAR(date_order, 'YYYY-MM')
       ORDER BY mes`,
      [desde, hasta]
    );
    res.json({ 
      periodos: result.rows.map(row => ({
        mes: row.mes,
        total: parseFloat(row.total),
        cantidad: parseInt(row.cantidad)
      }))
    });
  } catch (e) {
    console.error("ERROR /api/ventas/meses:", e);
    res.status(500).json({ error: e.message });
  }
});

// Opcional: Agregar columna updated_at a pedidos_proveedor si no existe (ejecuta una vez en DB)
async function agregarUpdatedAtPedidos() {
  try {
    await pool.query(`
      ALTER TABLE pedidos_proveedor 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
    `);
    console.log("✅ Columna updated_at agregada a pedidos_proveedor");
  } catch (e) {
    console.error("Error agregando updated_at:", e);
  }
}

// ===================== VENTAS DETALLADAS =====================

// Crear tabla ventas_detalle si no existe
async function crearTablaVentasDetalle() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas_detalle (
        id SERIAL PRIMARY KEY,
        venta_id INTEGER REFERENCES ventas(id) ON DELETE CASCADE,
        producto_detallado_id INTEGER REFERENCES productos_detallados(id),
        precio_venta DECIMAL(10,2) NOT NULL,
        costo DECIMAL(10,2) NOT NULL,
        margen DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Tabla ventas_detalle verificada");
  } catch (e) {
    console.error("Error creando ventas_detalle:", e);
  }
}
crearTablaVentasDetalle();

app.get("/api/ventas", async (req, res) => {
  try {
    const { desde, hasta, cliente_id, incluir_anuladas } = req.query;
    
    let query = `
      SELECT 
        v.*,
        c.name as cliente_name,
        c.vat as cliente_dni,
        COUNT(vd.id) as productos_count,
        COALESCE(SUM(vd.precio_venta), 0) as total_real
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN ventas_detalle vd ON v.id = vd.venta_id
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;

    // Por defecto, NO mostrar anuladas
    if (incluir_anuladas !== 'true') {
      query += ` AND (v.anulado = false OR v.anulado IS NULL)`;
    }

    if (desde) {
      paramCount++;
      query += ` AND v.date_order >= $${paramCount}`;
      params.push(desde);
    }
    if (hasta) {
      paramCount++;
      query += ` AND v.date_order <= $${paramCount}`;
      params.push(hasta);
    }
    if (cliente_id) {
      paramCount++;
      query += ` AND v.cliente_id = $${paramCount}`;
      params.push(cliente_id);
    }

    query += ` GROUP BY v.id, c.name, c.vat ORDER BY v.date_order DESC, v.id DESC`;

    const result = await pool.query(query, params);
    
    const ventasProcesadas = result.rows.map(venta => ({
      ...venta,
      total_real: parseFloat(venta.total_real) || 0,
      pagado: venta.pagado || false,
      fecha_pago: venta.fecha_pago || null,
      anulado: venta.anulado || false
    }));
    
    res.json(ventasProcesadas);
  } catch (e) {
    console.error("ERROR /api/ventas:", e);
    res.status(500).json({ error: e.message });
  }
});




// OBTENER DETALLE DE UNA VENTA
app.get("/api/ventas/:id/detalle", async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        vd.*,
        ma.name as marca,
        m.name as modelo,
        pd.imei_1,
        pd.imei_2,
        pr.name as proveedor
      FROM ventas_detalle vd
      INNER JOIN productos_detallados pd ON vd.producto_detallado_id = pd.id
      INNER JOIN modelos m ON pd.modelo_id = m.id
      INNER JOIN marcas ma ON m.marca_id = ma.id
      LEFT JOIN pedidos_proveedor pp ON pd.pedido_id = pp.id
      LEFT JOIN proveedores pr ON pp.proveedor_id = pr.id
      WHERE vd.venta_id = $1
      ORDER BY vd.id`,
      [id]
    );
    
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/ventas/:id/detalle:", e);
    res.status(500).json({ error: e.message });
  }
});

// CREAR VENTA (con cuenta por cobrar automática Y pagado=false)
app.post("/api/ventas", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { cliente_id, date_order, productos, fecha_vencimiento } = req.body;
    
    if (!cliente_id || !date_order || !productos || productos.length === 0) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    // Calcular total
    const amount_total = productos.reduce((sum, p) => sum + parseFloat(p.precio_venta), 0);

    // 👇 CREAR VENTA CON pagado=false POR DEFECTO
    const ventaResult = await client.query(
      `INSERT INTO ventas (cliente_id, date_order, amount_total, state, pagado) 
       VALUES ($1, $2, $3, 'done', false) 
       RETURNING id`,
      [cliente_id, date_order, amount_total]
    );
    
    const venta_id = ventaResult.rows[0].id;

    // Insertar detalle y actualizar estado de productos
    for (const producto of productos) {
      const { producto_detallado_id, precio_venta } = producto;
      
      // Obtener costo del producto
      const costoResult = await client.query(
        'SELECT costo FROM productos_detallados WHERE id = $1',
        [producto_detallado_id]
      );
      
      if (costoResult.rows.length === 0) {
        throw new Error(`Producto ${producto_detallado_id} no encontrado`);
      }
      
      const costo = parseFloat(costoResult.rows[0].costo);
      const margen = parseFloat(precio_venta) - costo;

      // Insertar detalle
      await client.query(
        `INSERT INTO ventas_detalle (venta_id, producto_detallado_id, precio_venta, costo, margen) 
         VALUES ($1, $2, $3, $4, $5)`,
        [venta_id, producto_detallado_id, precio_venta, costo, margen]
      );

      // Marcar producto como vendido
      await client.query(
        `UPDATE productos_detallados 
         SET estado = 'vendido' 
         WHERE id = $1`,
        [producto_detallado_id]
      );
    }

    // Crear cuenta por cobrar automáticamente
    await client.query(
      `INSERT INTO cuentas_por_cobrar (venta_id, cliente_id, monto, fecha_registro, fecha_vencimiento, cobrado) 
       VALUES ($1, $2, $3, $4, $5, false)`,
      [venta_id, cliente_id, amount_total, date_order, fecha_vencimiento || null]
    );

    await client.query('COMMIT');
    
    res.json({ 
      id: venta_id, 
      message: "Venta y cuenta por cobrar creadas correctamente",
      total: amount_total
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR POST /api/ventas:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});


app.delete("/api/ventas/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;

    const existe = await client.query('SELECT id FROM ventas WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    // Marcar venta como anulada
    await client.query('UPDATE ventas SET anulado = true WHERE id = $1', [id]);
    
    // Obtener productos de la venta
    const productosResult = await client.query(
      'SELECT producto_detallado_id FROM ventas_detalle WHERE venta_id = $1',
      [id]
    );

    // Devolver productos al stock
    for (const row of productosResult.rows) {
      await client.query(
        `UPDATE productos_detallados SET estado = 'en_stock' WHERE id = $1`,
        [row.producto_detallado_id]
      );
    }

    await client.query('COMMIT');
    
    res.json({ message: "Venta anulada correctamente" });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR DELETE /api/ventas:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});


// MARCAR VENTA COMO PAGADA (sincroniza con cuenta por cobrar)
app.put("/api/ventas/:id/pagar", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const fecha_pago = new Date().toISOString().split('T')[0];
    
    // Verificar que la venta existe
    const ventaExiste = await client.query('SELECT id FROM ventas WHERE id = $1', [id]);
    if (ventaExiste.rows.length === 0) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }
    
    // Marcar venta como pagada
    await client.query(
      `UPDATE ventas 
       SET pagado = true, fecha_pago = $1 
       WHERE id = $2`,
      [fecha_pago, id]
    );
    
    // Marcar cuenta por cobrar asociada como cobrada
    await client.query(
      `UPDATE cuentas_por_cobrar 
       SET cobrado = true, fecha_cobro = $1 
       WHERE venta_id = $2`,
      [fecha_pago, id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      message: "Venta y cuenta por cobrar marcadas como pagadas",
      fecha_pago 
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR PUT /api/ventas/:id/pagar:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
// ===================== TIPOS DE EGRESO =====================

// Crear tabla tipos_egreso
async function crearTablaTiposEgreso() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tipos_egreso (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        descripcion TEXT,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Tabla tipos_egreso verificada");
  } catch (e) {
    console.error("Error creando tipos_egreso:", e);
  }
}
crearTablaTiposEgreso();

// LISTAR TIPOS DE EGRESO
app.get("/api/tipos-egreso", async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tipos_egreso WHERE activo = true ORDER BY name'
    );
    res.json(result.rows);
  } catch (e) {
    console.error("ERROR /api/tipos-egreso:", e);
    res.status(500).json({ error: e.message });
  }
});

// CREAR TIPO DE EGRESO
app.post("/api/tipos-egreso", async (req, res) => {
  try {
    const { name, descripcion } = req.body;
    
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const result = await pool.query(
      `INSERT INTO tipos_egreso (name, descripcion) 
       VALUES ($1, $2) 
       RETURNING id, name, descripcion`,
      [name, descripcion]
    );

    res.json({ 
      id: result.rows[0].id,
      message: "Tipo de egreso creado correctamente"
    });
  } catch (e) {
    console.error("ERROR POST /api/tipos-egreso:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== EGRESOS =====================

// Crear tabla egresos
async function crearTablaEgresos() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS egresos (
        id SERIAL PRIMARY KEY,
        tipo_egreso_id INTEGER REFERENCES tipos_egreso(id),
        monto DECIMAL(12,2) NOT NULL,
        fecha DATE NOT NULL,
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Tabla egresos verificada");
  } catch (e) {
    console.error("Error creando egresos:", e);
  }
}
crearTablaEgresos();

// LISTAR EGRESOS (con info de cuenta por pagar Y nombre del proveedor)
app.get("/api/egresos", async (req, res) => {
  try {
    const { desde, hasta, incluir_eliminados } = req.query;
    
    let query = `
      SELECT 
        e.*,
        te.name as tipo_egreso_name,
        cpp.id as cuenta_por_pagar_id,
        cpp.pagado as cuenta_pagada,
        cpp.fecha_pago as cuenta_fecha_pago,
        pp.numero_pedido,
        pr.name as proveedor_name
      FROM egresos e
      LEFT JOIN tipos_egreso te ON e.tipo_egreso_id = te.id
      LEFT JOIN cuentas_por_pagar cpp ON e.id = cpp.egreso_id
      LEFT JOIN pedidos_proveedor pp ON e.pedido_proveedor_id = pp.id
      LEFT JOIN proveedores pr ON pp.proveedor_id = pr.id
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;

    // Por defecto, NO mostrar eliminados
    if (incluir_eliminados !== 'true') {
      query += ` AND (e.eliminado = false OR e.eliminado IS NULL)`;
    }

    if (desde) {
      paramCount++;
      query += ` AND e.fecha >= $${paramCount}`;
      params.push(desde);
    }
    if (hasta) {
      paramCount++;
      query += ` AND e.fecha <= $${paramCount}`;
      params.push(hasta);
    }

    query += ` ORDER BY e.fecha DESC, e.id DESC`;

    const result = await pool.query(query, params);
    
    const egresosProcesados = result.rows.map(egreso => ({
      ...egreso,
      monto: parseFloat(egreso.monto) || 0,
      pagado: egreso.pagado || egreso.cuenta_pagada || false,
      fecha_pago: egreso.fecha_pago || egreso.cuenta_fecha_pago || null,
      eliminado: egreso.eliminado || false
    }));
    
    res.json(egresosProcesados);
  } catch (e) {
    console.error("ERROR /api/egresos:", e);
    res.status(500).json({ error: e.message });
  }
});


// ELIMINAR EGRESO (también elimina cuenta por pagar asociada)
app.delete("/api/egresos/:id", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;

    const existe = await client.query('SELECT id FROM egresos WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ error: "Egreso no encontrado" });
    }

    // Marcar como eliminado (soft delete)
    await client.query('UPDATE egresos SET eliminado = true WHERE id = $1', [id]);

    await client.query('COMMIT');
    
    res.json({ message: "Egreso eliminado correctamente" });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR DELETE /api/egresos:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// MARCAR EGRESO COMO PAGADO (sincroniza con cuenta por pagar)
app.put("/api/egresos/:id/pagar", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const fecha_pago = new Date().toISOString().split('T')[0];
    
    // Verificar que el egreso existe
    const egresoExiste = await client.query('SELECT id FROM egresos WHERE id = $1', [id]);
    if (egresoExiste.rows.length === 0) {
      return res.status(404).json({ error: "Egreso no encontrado" });
    }
    
    // Marcar egreso como pagado
    await client.query(
      `UPDATE egresos 
       SET pagado = true, fecha_pago = $1 
       WHERE id = $2`,
      [fecha_pago, id]
    );
    
    // Marcar cuenta por pagar asociada como pagada
    await client.query(
      `UPDATE cuentas_por_pagar 
       SET pagado = true, fecha_pago = $1 
       WHERE egreso_id = $2`,
      [fecha_pago, id]
    );
    
    await client.query('COMMIT');
    
    res.json({ 
      message: "Egreso y cuenta por pagar marcados como pagados",
      fecha_pago 
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR PUT /api/egresos/:id/pagar:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// CREAR EGRESO OTROOOO
app.post("/api/egresos", async (req, res) => { 
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { tipo_egreso_id, monto, fecha, descripcion, fecha_vencimiento, origen, pedido_proveedor_id } = req.body;
    
    if (!tipo_egreso_id || !monto || !fecha) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Crear egreso
    const egresoResult = await client.query(
      `INSERT INTO egresos (tipo_egreso_id, monto, fecha, descripcion, origen, pedido_proveedor_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id`,
      [tipo_egreso_id, monto, fecha, descripcion || null, origen || 'manual', pedido_proveedor_id || null]
    );
    
    const egreso_id = egresoResult.rows[0].id;

    // Crear cuenta por pagar automáticamente
    await client.query(
      `INSERT INTO cuentas_por_pagar (egreso_id, monto, fecha_registro, fecha_vencimiento, descripcion, pagado) 
       VALUES ($1, $2, $3, $4, $5, false)`,
      [egreso_id, monto, fecha, fecha_vencimiento || null, descripcion || null]
    );

    await client.query('COMMIT');
    
    res.json({ 
      id: egreso_id,
      message: "Egreso y cuenta por pagar creados correctamente"
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR POST /api/egresos:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// CREAR PEDIDO (ACTUALIZADO con egreso automático)
app.post("/api/pedidos-proveedor", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { proveedor_id, numero_pedido, fecha_pedido, fecha_entrega, observaciones } = req.body;
    
    if (!proveedor_id || !numero_pedido || !fecha_pedido) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Crear pedido
    const pedidoResult = await client.query(
      `INSERT INTO pedidos_proveedor (proveedor_id, numero_pedido, fecha_pedido, fecha_entrega, observaciones) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, numero_pedido, fecha_pedido, estado`,
      [proveedor_id, numero_pedido, fecha_pedido, fecha_entrega, observaciones]
    );
    
    const pedido_id = pedidoResult.rows[0].id;

    // Buscar o crear tipo de egreso "Pedidos a Proveedores"
    let tipoEgresoResult = await client.query(
      `SELECT id FROM tipos_egreso WHERE name = 'Pedidos a Proveedores' LIMIT 1`
    );
    
    let tipo_egreso_id;
    if (tipoEgresoResult.rows.length === 0) {
      const nuevoTipo = await client.query(
        `INSERT INTO tipos_egreso (name, descripcion) 
         VALUES ('Pedidos a Proveedores', 'Egresos generados automáticamente por pedidos a proveedores') 
         RETURNING id`
      );
      tipo_egreso_id = nuevoTipo.rows[0].id;
    } else {
      tipo_egreso_id = tipoEgresoResult.rows[0].id;
    }

    // Crear egreso automático (monto inicial en 0, se actualizará al agregar productos)
    const egresoResult = await client.query(
      `INSERT INTO egresos (tipo_egreso_id, monto, fecha, descripcion, origen, pedido_proveedor_id) 
       VALUES ($1, $2, $3, $4, 'pedido_proveedor', $5) 
       RETURNING id`,
      [tipo_egreso_id, 0, fecha_pedido, `Pedido ${numero_pedido}`, pedido_id]
    );
    
    const egreso_id = egresoResult.rows[0].id;

    // Crear cuenta por pagar automáticamente CON fecha_registro
    await client.query(
      `INSERT INTO cuentas_por_pagar (proveedor_id, pedido_id, egreso_id, monto, fecha_registro, descripcion, pagado) 
       VALUES ($1, $2, $3, $4, $5, $6, false)`,
      [proveedor_id, pedido_id, egreso_id, 0, fecha_pedido, `Pedido ${numero_pedido}`]
    );

    await client.query('COMMIT');
    
    res.json({ 
      id: pedido_id,
      message: "Pedido, egreso y cuenta por pagar creados correctamente"
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR POST /api/pedidos-proveedor:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ===================== CUENTAS POR PAGAR =====================

// ===================== CUENTAS POR PAGAR =====================

// LISTAR CUENTAS POR PAGAR (ACTUALIZADO)
app.get("/api/cuentas-por-pagar", async (req, res) => {
  try {
    const { pendientes } = req.query;
    
    let query = `
      SELECT 
        cpp.*,
        pr.name as proveedor_name,
        te.name as tipo_egreso_name,
        e.descripcion as egreso_descripcion,
        e.origen as egreso_origen,
        e.fecha as egreso_fecha,
        e.eliminado as egreso_eliminado,
        pp.numero_pedido
      FROM cuentas_por_pagar cpp
      LEFT JOIN proveedores pr ON cpp.proveedor_id = pr.id
      LEFT JOIN egresos e ON cpp.egreso_id = e.id
      LEFT JOIN tipos_egreso te ON e.tipo_egreso_id = te.id
      LEFT JOIN pedidos_proveedor pp ON cpp.pedido_id = pp.id
      WHERE (e.eliminado = false OR e.eliminado IS NULL)
    `;
    
    if (pendientes === 'true') {
      query += ` AND cpp.pagado = false`;
    }
    
    query += ` ORDER BY 
      CASE WHEN cpp.pagado = false THEN 0 ELSE 1 END,
      cpp.fecha_vencimiento ASC NULLS LAST, 
      cpp.fecha_registro DESC`;
    
    const result = await pool.query(query);
    
    const cuentasProcesadas = result.rows.map(cuenta => ({
      ...cuenta,
      monto: parseFloat(cuenta.monto) || 0,
      fecha_registro: cuenta.fecha_registro || cuenta.egreso_fecha,
      descripcion: cuenta.descripcion || cuenta.egreso_descripcion
    }));
    
    res.json(cuentasProcesadas);
  } catch (e) {
    console.error("ERROR /api/cuentas-por-pagar:", e);
    res.status(500).json({ error: e.message });
  }
});

// MARCAR CUENTA COMO PAGADA
app.put("/api/cuentas-por-pagar/:id/pagar", async (req, res) => {
  try {
    const { id } = req.params;
    const fecha_pago = new Date().toISOString().split('T')[0];
    
    await pool.query(
      `UPDATE cuentas_por_pagar 
       SET pagado = true, fecha_pago = $1 
       WHERE id = $2`,
      [fecha_pago, id]
    );
    
    res.json({ 
      message: "Cuenta marcada como pagada",
      fecha_pago 
    });
  } catch (e) {
    console.error("ERROR PUT /api/cuentas-por-pagar/:id/pagar:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== CUENTAS POR COBRAR =====================

// LISTAR CUENTAS POR COBRAR
app.get("/api/cuentas-por-cobrar", async (req, res) => {
  try {
    const { pendientes } = req.query;
    
    let query = `
      SELECT 
        cpc.*,
        c.name as cliente_name,
        c.email as cliente_email,
        c.phone as cliente_phone,
        v.date_order as fecha_venta,
        v.anulado as venta_anulada
      FROM cuentas_por_cobrar cpc
      LEFT JOIN clientes c ON cpc.cliente_id = c.id
      LEFT JOIN ventas v ON cpc.venta_id = v.id
      WHERE (v.anulado = false OR v.anulado IS NULL)
    `;
    
    if (pendientes === 'true') {
      query += ` AND cpc.cobrado = false`;
    }
    
    query += ` ORDER BY 
      CASE WHEN cpc.cobrado = false THEN 0 ELSE 1 END,
      cpc.fecha_vencimiento ASC NULLS LAST, 
      cpc.fecha_registro DESC`;
    
    const result = await pool.query(query);
    
    const cuentasProcesadas = result.rows.map(cuenta => ({
      ...cuenta,
      monto: parseFloat(cuenta.monto) || 0
    }));
    
    res.json(cuentasProcesadas);
  } catch (e) {
    console.error("ERROR /api/cuentas-por-cobrar:", e);
    res.status(500).json({ error: e.message });
  }
});

// MARCAR CUENTA POR COBRAR COMO COBRADA
app.put("/api/cuentas-por-cobrar/:id/cobrar", async (req, res) => {
  try {
    const { id } = req.params;
    const fecha_cobro = new Date().toISOString().split('T')[0];
    
    await pool.query(
      `UPDATE cuentas_por_cobrar 
       SET cobrado = true, fecha_cobro = $1 
       WHERE id = $2`,
      [fecha_cobro, id]
    );
    
    res.json({ 
      message: "Cuenta marcada como cobrada",
      fecha_cobro 
    });
  } catch (e) {
    console.error("ERROR PUT /api/cuentas-por-cobrar/:id/cobrar:", e);
    res.status(500).json({ error: e.message });
  }
});

// DESMARCAR VENTA COMO PAGADA
app.put("/api/ventas/:id/desmarcar-pago", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    await client.query(
      `UPDATE ventas SET pagado = false, fecha_pago = NULL WHERE id = $1`,
      [id]
    );
    
    await client.query(
      `UPDATE cuentas_por_cobrar SET cobrado = false, fecha_cobro = NULL WHERE venta_id = $1`,
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ message: "Venta desmarcada como pagada correctamente" });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR PUT /api/ventas/:id/desmarcar-pago:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// RECUPERAR VENTA ANULADA
app.put("/api/ventas/:id/recuperar", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;

    const venta = await client.query('SELECT id, anulado FROM ventas WHERE id = $1', [id]);
    
    if (venta.rows.length === 0) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }
    
    if (!venta.rows[0].anulado) {
      return res.status(400).json({ error: "La venta no está anulada" });
    }

    // Obtener productos de la venta
    const productosResult = await client.query(
      'SELECT producto_detallado_id FROM ventas_detalle WHERE venta_id = $1',
      [id]
    );

    // Marcar productos como vendidos nuevamente
    for (const row of productosResult.rows) {
      await client.query(
        `UPDATE productos_detallados SET estado = 'vendido' WHERE id = $1`,
        [row.producto_detallado_id]
      );
    }

    // Desmarcar como anulada
    await client.query('UPDATE ventas SET anulado = false WHERE id = $1', [id]);

    await client.query('COMMIT');
    
    res.json({ message: "Venta recuperada correctamente" });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR PUT /api/ventas/:id/recuperar:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});


// DESMARCAR EGRESO COMO PAGADO
app.put("/api/egresos/:id/desmarcar-pago", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    await client.query(
      `UPDATE egresos SET pagado = false, fecha_pago = NULL WHERE id = $1`,
      [id]
    );
    
    await client.query(
      `UPDATE cuentas_por_pagar SET pagado = false, fecha_pago = NULL WHERE egreso_id = $1`,
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({ message: "Egreso desmarcado como pagado correctamente" });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR PUT /api/egresos/:id/desmarcar-pago:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});


// RECUPERAR EGRESO ELIMINADO
app.put("/api/egresos/:id/recuperar", async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;

    const egreso = await client.query('SELECT id, eliminado FROM egresos WHERE id = $1', [id]);
    
    if (egreso.rows.length === 0) {
      return res.status(404).json({ error: "Egreso no encontrado" });
    }
    
    if (!egreso.rows[0].eliminado) {
      return res.status(400).json({ error: "El egreso no está eliminado" });
    }

    // Desmarcar como eliminado
    await client.query('UPDATE egresos SET eliminado = false WHERE id = $1', [id]);

    await client.query('COMMIT');
    
    res.json({ message: "Egreso recuperado correctamente" });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("ERROR PUT /api/egresos/:id/recuperar:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// COMPARATIVO FINANCIERO - Ingresos vs Egresos
app.get("/api/comparativo-financiero", async (req, res) => {
  try {
    const { desde, hasta, agrupacion } = req.query;
    
    if (!desde || !hasta) {
      return res.status(400).json({ error: "Faltan parámetros 'desde' y 'hasta'" });
    }

    const validAgrupaciones = ['dia', 'mes', 'año'];
    const agrupar = validAgrupaciones.includes(agrupacion) ? agrupacion : 'mes';

    // Determinar formato SQL según agrupación
    let formatSQL;
    if (agrupar === 'dia') {
      formatSQL = "TO_CHAR(v.date_order, 'YYYY-MM-DD')";
      formatSQLEgresos = "TO_CHAR(e.fecha, 'YYYY-MM-DD')";
    } else if (agrupar === 'año') {
      formatSQL = "TO_CHAR(v.date_order, 'YYYY')";
      formatSQLEgresos = "TO_CHAR(e.fecha, 'YYYY')";
    } else {
      formatSQL = "TO_CHAR(v.date_order, 'YYYY-MM')";
      formatSQLEgresos = "TO_CHAR(e.fecha, 'YYYY-MM')";
    }

    // INGRESOS - Solo ventas PAGADAS y NO ANULADAS
    const ingresosQuery = `
      SELECT 
        ${formatSQL} as periodo,
        COALESCE(SUM(vd.precio_venta), 0) as total_ingresos,
        COUNT(DISTINCT v.id) as cantidad_ventas
      FROM ventas v
      LEFT JOIN ventas_detalle vd ON v.id = vd.venta_id
      WHERE v.date_order >= $1 
        AND v.date_order <= $2
        AND v.pagado = true
        AND (v.anulado = false OR v.anulado IS NULL)
      GROUP BY ${formatSQL}
      ORDER BY periodo
    `;

    // EGRESOS - Solo egresos PAGADOS y NO ELIMINADOS
    const egresosQuery = `
      SELECT 
        ${formatSQLEgresos} as periodo,
        COALESCE(SUM(e.monto), 0) as total_egresos,
        COUNT(e.id) as cantidad_egresos
      FROM egresos e
      WHERE e.fecha >= $1 
        AND e.fecha <= $2
        AND e.pagado = true
        AND (e.eliminado = false OR e.eliminado IS NULL)
      GROUP BY ${formatSQLEgresos}
      ORDER BY periodo
    `;

    const [ingresosResult, egresosResult] = await Promise.all([
      pool.query(ingresosQuery, [desde, hasta]),
      pool.query(egresosQuery, [desde, hasta])
    ]);

    // Combinar resultados
    const periodosMap = new Map();

    ingresosResult.rows.forEach(row => {
      periodosMap.set(row.periodo, {
        periodo: row.periodo,
        ingresos: parseFloat(row.total_ingresos) || 0,
        cantidad_ventas: parseInt(row.cantidad_ventas) || 0,
        egresos: 0,
        cantidad_egresos: 0,
        utilidad: 0
      });
    });

    egresosResult.rows.forEach(row => {
      if (periodosMap.has(row.periodo)) {
        const periodo = periodosMap.get(row.periodo);
        periodo.egresos = parseFloat(row.total_egresos) || 0;
        periodo.cantidad_egresos = parseInt(row.cantidad_egresos) || 0;
      } else {
        periodosMap.set(row.periodo, {
          periodo: row.periodo,
          ingresos: 0,
          cantidad_ventas: 0,
          egresos: parseFloat(row.total_egresos) || 0,
          cantidad_egresos: parseInt(row.cantidad_egresos) || 0,
          utilidad: 0
        });
      }
    });

    const periodos = Array.from(periodosMap.values())
      .map(p => ({
        ...p,
        utilidad: p.ingresos - p.egresos
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));

    const totales = {
      ingresos_totales: periodos.reduce((sum, p) => sum + p.ingresos, 0),
      egresos_totales: periodos.reduce((sum, p) => sum + p.egresos, 0),
      utilidad_total: 0,
      total_ventas: periodos.reduce((sum, p) => sum + p.cantidad_ventas, 0),
      total_egresos: periodos.reduce((sum, p) => sum + p.cantidad_egresos, 0)
    };
    totales.utilidad_total = totales.ingresos_totales - totales.egresos_totales;

    let mejorPeriodo = null;
    let peorPeriodo = null;
    
    if (periodos.length > 0) {
      mejorPeriodo = periodos.reduce((max, p) => 
        p.utilidad > max.utilidad ? p : max
      , periodos[0]);
      
      peorPeriodo = periodos.reduce((min, p) => 
        p.utilidad < min.utilidad ? p : min
      , periodos[0]);
    }

    res.json({
      agrupacion: agrupar,
      desde,
      hasta,
      periodos,
      totales,
      mejorPeriodo,
      peorPeriodo
    });

  } catch (e) {
    console.error("ERROR /api/comparativo-financiero:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== AGREGAR ESTE ENDPOINT EN TU server.js =====================
// Colócalo ANTES de app.listen (al final del archivo, junto con los otros endpoints)

app.get("/api/comparar-periodos", async (req, res) => {
  try {
    const { fecha1_desde, fecha1_hasta, fecha2_desde, fecha2_hasta } = req.query;
    
    if (!fecha1_desde || !fecha1_hasta || !fecha2_desde || !fecha2_hasta) {
      return res.status(400).json({ 
        error: "Faltan parámetros obligatorios: fecha1_desde, fecha1_hasta, fecha2_desde, fecha2_hasta" 
      });
    }

    // PERIODO 1 - Ingresos (solo ventas PAGADAS y NO ANULADAS)
    const ingresos1Query = `
      SELECT 
        COALESCE(SUM(vd.precio_venta), 0) as total,
        COUNT(DISTINCT v.id) as cantidad
      FROM ventas v
      LEFT JOIN ventas_detalle vd ON v.id = vd.venta_id
      WHERE v.date_order >= $1 
        AND v.date_order <= $2
        AND v.pagado = true
        AND (v.anulado = false OR v.anulado IS NULL)
    `;

    // PERIODO 1 - Egresos (solo egresos PAGADOS y NO ELIMINADOS)
    const egresos1Query = `
      SELECT 
        COALESCE(SUM(e.monto), 0) as total,
        COUNT(e.id) as cantidad
      FROM egresos e
      WHERE e.fecha >= $1 
        AND e.fecha <= $2
        AND e.pagado = true
        AND (e.eliminado = false OR e.eliminado IS NULL)
    `;

    // PERIODO 2 - Ingresos
    const ingresos2Query = `
      SELECT 
        COALESCE(SUM(vd.precio_venta), 0) as total,
        COUNT(DISTINCT v.id) as cantidad
      FROM ventas v
      LEFT JOIN ventas_detalle vd ON v.id = vd.venta_id
      WHERE v.date_order >= $1 
        AND v.date_order <= $2
        AND v.pagado = true
        AND (v.anulado = false OR v.anulado IS NULL)
    `;

    // PERIODO 2 - Egresos
    const egresos2Query = `
      SELECT 
        COALESCE(SUM(e.monto), 0) as total,
        COUNT(e.id) as cantidad
      FROM egresos e
      WHERE e.fecha >= $1 
        AND e.fecha <= $2
        AND e.pagado = true
        AND (e.eliminado = false OR e.eliminado IS NULL)
    `;

    // Ejecutar todas las consultas en paralelo
    const [ing1, eg1, ing2, eg2] = await Promise.all([
      pool.query(ingresos1Query, [fecha1_desde, fecha1_hasta]),
      pool.query(egresos1Query, [fecha1_desde, fecha1_hasta]),
      pool.query(ingresos2Query, [fecha2_desde, fecha2_hasta]),
      pool.query(egresos2Query, [fecha2_desde, fecha2_hasta])
    ]);

    const ingresos1 = parseFloat(ing1.rows[0].total) || 0;
    const cantidad_ventas1 = parseInt(ing1.rows[0].cantidad) || 0;
    const egresos1 = parseFloat(eg1.rows[0].total) || 0;
    const cantidad_egresos1 = parseInt(eg1.rows[0].cantidad) || 0;
    const utilidad1 = ingresos1 - egresos1;

    const ingresos2 = parseFloat(ing2.rows[0].total) || 0;
    const cantidad_ventas2 = parseInt(ing2.rows[0].cantidad) || 0;
    const egresos2 = parseFloat(eg2.rows[0].total) || 0;
    const cantidad_egresos2 = parseInt(eg2.rows[0].cantidad) || 0;
    const utilidad2 = ingresos2 - egresos2;

    // Generar labels automáticos
    const generarLabel = (desde, hasta) => {
      if (desde === hasta) {
        const [y, m, d] = desde.split('-');
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`;
      }
      
      const [yD, mD] = desde.split('-');
      const [yH, mH] = hasta.split('-');
      
      if (yD === yH && mD === mH) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return `${meses[parseInt(mD) - 1]} ${yD}`;
      }
      
      if (desde.endsWith('-01-01') && hasta.endsWith('-12-31') && yD === yH) {
        return `Año ${yD}`;
      }
      
      return `${desde} - ${hasta}`;
    };

    res.json({
      periodo1: {
        label: generarLabel(fecha1_desde, fecha1_hasta),
        datos: {
          ingresos: ingresos1,
          egresos: egresos1,
          utilidad: utilidad1,
          cantidad_ventas: cantidad_ventas1,
          cantidad_egresos: cantidad_egresos1
        }

        
      },
      periodo2: {
        label: generarLabel(fecha2_desde, fecha2_hasta),
        datos: {
          ingresos: ingresos2,
          egresos: egresos2,
          utilidad: utilidad2,
          cantidad_ventas: cantidad_ventas2,
          cantidad_egresos: cantidad_egresos2
        }
      },
      diferencia: {
        ingresos: ingresos2 - ingresos1,
        egresos: egresos2 - egresos1,
        utilidad: utilidad2 - utilidad1
      }
    });

  } catch (e) {
    console.error("ERROR /api/comparar-periodos:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== AGREGAR ESTE ENDPOINT EN TU server.js =====================
// Colócalo junto con los otros endpoints, antes de app.listen

app.get("/api/comparar-ventas", async (req, res) => {
  try {
    const { fecha1_desde, fecha1_hasta, fecha2_desde, fecha2_hasta } = req.query;
    
    if (!fecha1_desde || !fecha1_hasta || !fecha2_desde || !fecha2_hasta) {
      return res.status(400).json({ 
        error: "Faltan parámetros obligatorios: fecha1_desde, fecha1_hasta, fecha2_desde, fecha2_hasta" 
      });
    }

    // PERIODO 1 - Ventas (solo ventas PAGADAS y NO ANULADAS)
    const ventas1Query = `
      SELECT 
        COALESCE(SUM(vd.precio_venta), 0) as total_ventas,
        COUNT(DISTINCT v.id) as cantidad_ventas
      FROM ventas v
      LEFT JOIN ventas_detalle vd ON v.id = vd.venta_id
      WHERE v.date_order >= $1 
        AND v.date_order <= $2
        AND v.pagado = true
        AND (v.anulado = false OR v.anulado IS NULL)
    `;

    // PERIODO 2 - Ventas
    const ventas2Query = `
      SELECT 
        COALESCE(SUM(vd.precio_venta), 0) as total_ventas,
        COUNT(DISTINCT v.id) as cantidad_ventas
      FROM ventas v
      LEFT JOIN ventas_detalle vd ON v.id = vd.venta_id
      WHERE v.date_order >= $1 
        AND v.date_order <= $2
        AND v.pagado = true
        AND (v.anulado = false OR v.anulado IS NULL)
    `;

    // Ejecutar consultas en paralelo
    const [v1, v2] = await Promise.all([
      pool.query(ventas1Query, [fecha1_desde, fecha1_hasta]),
      pool.query(ventas2Query, [fecha2_desde, fecha2_hasta])
    ]);

    const total_ventas1 = parseFloat(v1.rows[0].total_ventas) || 0;
    const cantidad_ventas1 = parseInt(v1.rows[0].cantidad_ventas) || 0;
    const ticket_promedio1 = cantidad_ventas1 > 0 ? total_ventas1 / cantidad_ventas1 : 0;

    const total_ventas2 = parseFloat(v2.rows[0].total_ventas) || 0;
    const cantidad_ventas2 = parseInt(v2.rows[0].cantidad_ventas) || 0;
    const ticket_promedio2 = cantidad_ventas2 > 0 ? total_ventas2 / cantidad_ventas2 : 0;

    // Generar labels automáticos
    const generarLabel = (desde, hasta) => {
      if (desde === hasta) {
        const [y, m, d] = desde.split('-');
        const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`;
      }
      
      const [yD, mD] = desde.split('-');
      const [yH, mH] = hasta.split('-');
      
      if (yD === yH && mD === mH) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return `${meses[parseInt(mD) - 1]} ${yD}`;
      }
      
      if (desde.endsWith('-01-01') && hasta.endsWith('-12-31') && yD === yH) {
        return `Año ${yD}`;
      }
      
      return `${desde} - ${hasta}`;
    };

    res.json({
      periodo1: {
        label: generarLabel(fecha1_desde, fecha1_hasta),
        datos: {
          total_ventas: total_ventas1,
          cantidad_ventas: cantidad_ventas1,
          ticket_promedio: ticket_promedio1
        }
      },
      periodo2: {
        label: generarLabel(fecha2_desde, fecha2_hasta),
        datos: {
          total_ventas: total_ventas2,
          cantidad_ventas: cantidad_ventas2,
          ticket_promedio: ticket_promedio2
        }
      },
      diferencia: {
        total_ventas: total_ventas2 - total_ventas1,
        cantidad_ventas: cantidad_ventas2 - cantidad_ventas1,
        ticket_promedio: ticket_promedio2 - ticket_promedio1
      }
    });

  } catch (e) {
    console.error("ERROR /api/comparar-ventas:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== FIN DEL ENDPOINT =====================

// Llama a la función al inicio (después de crearTablas)
agregarUpdatedAtPedidos();


app.listen(PORT, () => {
  console.log(`🚀 API PostgreSQL lista en http://localhost:${PORT}`);
  console.log(`📊 Base de datos: PostgreSQL`);
});

