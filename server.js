const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const { PORT, ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY } = process.env;
let UID = null;

// Autenticación contra Odoo (usa API Key como password)
async function authenticate() {
  const res = await axios.post(`${ODOO_URL}/web/session/authenticate`, {
    jsonrpc: "2.0",
    method: "call",
    params: { db: ODOO_DB, login: ODOO_LOGIN, password: ODOO_API_KEY },
    id: Date.now()
  }, { headers: { "Content-Type": "application/json" }});
  const uid = res.data?.result?.uid;
  if (!uid) throw new Error("No se pudo autenticar contra Odoo");
  UID = uid;
}

async function odooExecute(model, method, args = [], kwargs = {}) {
  if (!UID) await authenticate();
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, UID, ODOO_API_KEY, model, method, args, kwargs]
    },
    id: Date.now()
  };
  const res = await axios.post(`${ODOO_URL}/jsonrpc`, body,
    { headers: { "Content-Type": "application/json" }});
  if (res.data.error) throw new Error(res.data.error.data.message);
  return res.data.result;
}

/* --------- RUTAS --------- */

// ping (prueba rápida)
app.get("/api/ping", (_, res) => res.json({ ok: true }));

// Listar clientes (solo los que son clientes)
app.get("/api/clientes", async (req, res) => {
  try {
    const result = await odooExecute(
      "res.partner", "search_read",
      [[["customer_rank", ">", 0]]],
      { fields: ["id","name","email","phone"], limit: 50 }
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Crear cliente
// Crear cliente (marca como cliente con customer_rank=1)
app.post("/api/clientes", async (req, res) => {
  try {
    const { name, email, phone, vat } = req.body || {};
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const id = await odooExecute("res.partner", "create", [{
      name,
      email: email || null,
      phone: phone || null,
      vat:   vat   || null,   // RUC/DNI si quieres guardarlo
      customer_rank: 1,       // << clave para que aparezca en "Clientes"
      company_type: "person", // opcional
    }]);

    res.json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Ventas: resumen por rango (suma en Odoo vía read_group)
// Ventas: resumen por rango (sumando en Node para evitar issues con read_group en monetarios)
app.get("/api/ventas/resumen", async (req, res) => {
  try {
    const { desde, hasta } = req.query; // YYYY-MM-DD
    if (!desde || !hasta) {
      return res.status(400).json({ error: "Faltan 'desde' y 'hasta' (YYYY-MM-DD)" });
    }

    const domain = [
      ["date_order", ">=", String(desde)],
      ["date_order", "<",  String(hasta)],
      ["state", "in", ["sale", "done"]],
    ];

    // 1) Buscar IDs sin límite
    const ids = await odooExecute("sale.order", "search", [domain], { limit: 0 });

    // 2) Leer montos (y datos útiles por si quieres depurar)
    const orders = ids.length
      ? await odooExecute("sale.order", "read", [ids, ["amount_total", "state", "date_order", "currency_id"]])
      : [];

    // 3) Sumar total y contar
    const total = orders.reduce((s, o) => s + (o.amount_total || 0), 0);
    const cantidad = orders.length;

    res.json({ total, cantidad, desde, hasta });
  } catch (e) {
    console.error("ERROR /api/ventas/resumen:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// Ventas por mes en un rango de meses (YYYY-MM a YYYY-MM, inclusive)
app.get("/api/ventas/meses", async (req, res) => {
  try {
    const { desde, hasta } = req.query; // formato 'YYYY-MM'
    if (!desde || !hasta) {
      return res.status(400).json({ error: "Faltan 'desde' y 'hasta' en formato YYYY-MM" });
    }

    // Parseo simple YYYY-MM
    const [y1, m1] = desde.split("-").map(Number);
    const [y2, m2] = hasta.split("-").map(Number);
    if (!y1 || !m1 || !y2 || !m2) {
      return res.status(400).json({ error: "Formato inválido. Usa YYYY-MM" });
    }

    // Limitar a 36 meses para evitar abusos
    const periodos = [];
    let y = y1, m = m1; // m = 1..12
    let guard = 0;

    function ymStr(yy, mm) { return `${yy}-${String(mm).padStart(2,"0")}`; }
    function firstDay(yy, mm) { return `${ymStr(yy, mm)}-01`; }
    function nextMonth(yy, mm) {
      const ny = mm === 12 ? yy + 1 : yy;
      const nm = mm === 12 ? 1 : mm + 1;
      return [ny, nm];
    }

    // Itera desde y1-m1 hasta y2-m2 inclusive
    while ((y < y2) || (y === y2 && m <= m2)) {
      const desdeDia = firstDay(y, m);
      const [ny, nm] = nextMonth(y, m);
      const hastaDia = firstDay(ny, nm);

      // Re-uso de la lógica de suma segura (search + read)
      const domain = [
        ["date_order", ">=", desdeDia],
        ["date_order", "<",  hastaDia],
        ["state", "in", ["sale","done"]],
      ];
      const ids = await odooExecute("sale.order", "search", [domain], { limit: 0 });
      const orders = ids.length
        ? await odooExecute("sale.order", "read", [ids, ["amount_total"]])
        : [];
      const total = orders.reduce((s,o)=> s + (o.amount_total || 0), 0);
      const cantidad = orders.length;

      periodos.push({ mes: ymStr(y, m), total, cantidad });

      [y, m] = nextMonth(y, m);
      if (++guard > 40) break; // safety
    }

    res.json({ periodos });
  } catch (e) {
    console.error("ERROR /api/ventas/meses:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PRODUCTOS =====================

// Listar productos (templates)
app.get("/api/productos", async (req, res) => {
  try {
    const { q } = req.query;
    const domain = q
      ? [["|", ["name", "ilike", String(q)], ["default_code", "ilike", String(q)]]]
      : [["active", "=", true]];
    const items = await odooExecute(
      "product.template", "search_read",
      [domain],
      { fields: ["id","name","default_code","list_price","barcode","tracking","product_variant_id","type"], limit: 100 }
    );
    const mapped = items.map(p => ({
      ...p,
      variant_id: Array.isArray(p.product_variant_id) ? p.product_variant_id[0] : null,
      variant_name: Array.isArray(p.product_variant_id) ? p.product_variant_id[1] : null,
    }));
    res.json(mapped);
  } catch (e) {
    console.error("ERROR /api/productos:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// Crear producto
app.post("/api/productos", async (req, res) => {
  try {
    const { name, sku, price, barcode, tracking = "none" } = req.body || {};
    if (!name) return res.status(400).json({ error: "Falta 'name'" });
    const templateId = await odooExecute("product.template", "create", [{
      name,
      default_code: sku || null,
      list_price: typeof price === "number" ? price : 0,
      barcode: barcode || null,
      tracking,        // "none" | "lot" | "serial"
      type: "product", // almacenable
      sale_ok: true,
      purchase_ok: true,
    }]);
    const [tpl] = await odooExecute("product.template", "read", [[templateId], ["product_variant_id"]]);
    const variant_id = Array.isArray(tpl.product_variant_id) ? tpl.product_variant_id[0] : null;
    res.json({ template_id: templateId, variant_id });
  } catch (e) {
    console.error("ERROR POST /api/productos:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// Crear series para una variante
app.post("/api/productos/:variantId/seriales", async (req, res) => {
  try {
    const variantId = parseInt(req.params.variantId, 10);
    const { serials } = req.body || {};
    if (!variantId) return res.status(400).json({ error: "variantId inválido" });
    if (!Array.isArray(serials) || serials.length === 0)
      return res.status(400).json({ error: "Debe enviar 'serials' como array" });

    const created = [];
    for (const s of serials) {
      const lotId = await odooExecute("stock.production.lot", "create", [{
        name: String(s),
        product_id: variantId,
      }]);
      created.push(lotId);
    }
    res.json({ created });
  } catch (e) {
    console.error("ERROR POST /api/productos/:variantId/seriales:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===================== INVENTARIO =====================
app.get("/api/inventario", async (req, res) => {
  try {
    const { variant_id } = req.query;
    const domain = [["location_id.usage","=","internal"]];
    if (variant_id) domain.push(["product_id","=", Number(variant_id)]);

    const quants = await odooExecute(
      "stock.quant", "search_read",
      [domain],
      { fields: ["product_id","location_id","quantity","reserved_quantity"], limit: 200 }
    );

    const totales = {};
    for (const q of quants) {
      const pid = Array.isArray(q.product_id) ? q.product_id[0] : q.product_id;
      if (!totales[pid]) totales[pid] = { product_id: pid, quantity: 0, reserved: 0, available: 0, by_location: [] };
      totales[pid].quantity += q.quantity || 0;
      totales[pid].reserved += q.reserved_quantity || 0;
      totales[pid].by_location.push({
        location: Array.isArray(q.location_id) ? q.location_id[1] : String(q.location_id),
        quantity: q.quantity || 0,
        reserved: q.reserved_quantity || 0,
      });
    }
    for (const pid of Object.keys(totales)) {
      totales[pid].available = totales[pid].quantity - totales[pid].reserved;
    }
    res.json({ quants, totales: Object.values(totales) });
  } catch (e) {
    console.error("ERROR /api/inventario:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PROVEEDORES =====================
// Listar proveedores (partners con supplier_rank > 0). Soporta búsqueda ?q=
app.get("/api/proveedores", async (req, res) => {
  try {
    const { q } = req.query;

    // Siempre filtramos por proveedores
    const domain = [
      ["supplier_rank", ">", 0],
      ["active", "=", true],
    ];

    // Búsqueda opcional por nombre, RUC (vat), email o teléfono
    if (q) {
      domain.push("|", "|", "|",
        ["name",  "ilike", String(q)],
        ["vat",   "ilike", String(q)],
        ["email", "ilike", String(q)],
        ["phone", "ilike", String(q)]
      );
    }

    const items = await odooExecute(
      "res.partner",
      "search_read",
      [domain],
      { fields: ["id","name","vat","email","phone","supplier_rank"], limit: 100 }
    );

    res.json(items);
  } catch (e) {
    console.error("ERROR /api/proveedores:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message, raw: e?.response?.data });
  }
});

// Crear proveedor (marca supplier_rank=1)
app.post("/api/proveedores", async (req, res) => {
  try {
    const { name, email, phone, vat } = req.body || {};
    if (!name) return res.status(400).json({ error: "Falta 'name'" });

    const id = await odooExecute("res.partner", "create", [{
      name,
      email: email || null,
      phone: phone || null,
      vat:   vat   || null,   // RUC en Perú
      supplier_rank: 1,
      company_type: "company", // opcional: tratarlos como empresa
    }]);

    res.json({ id });
  } catch (e) {
    console.error("ERROR POST /api/proveedores:", e?.response?.data || e.message);
    res.status(500).json({ error: e.message, raw: e?.response?.data });
  }
});


app.listen(PORT, () => console.log(`API lista en http://localhost:${PORT}`));
