import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { closePool, idPlatillo, loginAs, query, resetDatabase, stock } from './helpers.js';

before(resetDatabase);
after(closePool);

// Sucursal Central (id 1) no tiene turno abierto en los datos de demo.
const CENTRAL = 1;
const ESCALON = 2;

let cajero; // prueba@origenes.sv, cajero de Central
let turno;
let latte;

describe('Caja, ventas e inventario', () => {
  before(async () => {
    cajero = await loginAs('prueba@origenes.sv');
    latte = await idPlatillo('Latte Grande');
  });

  it('un barista no puede abrir caja; un cajero sí, una sola vez', async () => {
    const barista = await loginAs('jose.flores@origenes.sv');
    const negado = await barista.post('/turnos', { montoInicial: '20.00' });
    assert.equal(negado.status, 403);

    const res = await cajero.post('/turnos', { montoInicial: '20.00' });
    assert.equal(res.status, 201);
    assert.equal(res.body.estado, 'ABIERTO');
    assert.equal(res.body.sucursalId, CENTRAL);
    turno = res.body;

    const duplicado = await cajero.post('/turnos', { montoInicial: '20.00' });
    assert.equal(duplicado.status, 409);
    assert.equal(duplicado.body.error.code, 'TURNO_YA_ABIERTO');
  });

  it('vender un Latte Grande descuenta su receta solo en la sucursal que vende', async () => {
    const insumos = ['Café de especialidad', 'Leche entera', 'Vaso 16oz', 'Tapadera', 'Viñeta'];
    const antes = await Promise.all(insumos.map((i) => stock(CENTRAL, i)));
    const otraSucursal = await stock(ESCALON, 'Leche entera');

    const res = await cajero.post('/ventas', {
      turnoId: turno.id,
      tipoDoc: 'FACTURA',
      metodoPago: 'EFECTIVO',
      items: [{ platilloId: latte, cantidad: 1 }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    // Precio al público $3.50 con IVA incluido.
    assert.equal(res.body.total, '3.50');
    assert.equal(res.body.subtotal, '3.10');
    assert.equal(res.body.iva, '0.40');
    assert.equal(res.body.items[0].precioUnitario, '3.50');

    const despues = await Promise.all(insumos.map((i) => stock(CENTRAL, i)));
    assert.deepEqual(
      antes.map((a, i) => a - despues[i]),
      [18, 250, 1, 1, 1],
    );
    assert.equal(await stock(ESCALON, 'Leche entera'), otraSucursal);
  });

  it('agrupa el consumo de insumos compartidos y numera por sucursal y tipo', async () => {
    const [{ max }] = await query(
      "SELECT max(numero) FROM ventas WHERE sucursal_id = $1 AND tipo_doc = 'FACTURA'",
      [CENTRAL],
    );
    const leche = await stock(CENTRAL, 'Leche entera');
    const cappuccino = await idPlatillo('Cappuccino');
    const agua = await idPlatillo('Botella de agua');
    const res = await cajero.post('/ventas', {
      turnoId: turno.id,
      tipoDoc: 'FACTURA',
      metodoPago: 'TARJETA',
      items: [
        { platilloId: latte, cantidad: 2 },
        { platilloId: cappuccino, cantidad: 1 },
        { platilloId: agua, cantidad: 3 },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.numero, max + 1);
    assert.equal(await stock(CENTRAL, 'Leche entera'), leche - 2 * 250 - 150);
  });

  it('rechaza cantidades no enteras y productos inactivos', async () => {
    const decimal = await cajero.post('/ventas', {
      turnoId: turno.id, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
      items: [{ platilloId: latte, cantidad: 1.5 }],
    });
    assert.equal(decimal.status, 400);
    const inactivo = await cajero.post('/ventas', {
      turnoId: turno.id, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
      items: [{ platilloId: await idPlatillo('Pumpkin Spice Latte'), cantidad: 1 }],
    });
    assert.equal(inactivo.status, 409);
    assert.equal(inactivo.body.error.code, 'PLATILLO_NO_DISPONIBLE');
  });

  it('si falta un insumo (tapadera) no se guarda nada', async () => {
    await query(
      `UPDATE inventario_sucursal SET stock_actual = 0
       WHERE sucursal_id = $1 AND insumo_id = (SELECT id FROM insumos WHERE nombre = 'Tapadera')`,
      [CENTRAL],
    );
    const cafe = await stock(CENTRAL, 'Café de especialidad');
    const [{ count: ventasAntes }] = await query('SELECT count(*)::int FROM ventas');

    const res = await cajero.post('/ventas', {
      turnoId: turno.id, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
      items: [{ platilloId: latte, cantidad: 1 }],
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'STOCK_INSUFICIENTE');
    assert.equal(res.body.error.details[0].insumo, 'Tapadera');
    assert.equal(await stock(CENTRAL, 'Café de especialidad'), cafe);
    const [{ count: ventasDespues }] = await query('SELECT count(*)::int FROM ventas');
    assert.equal(ventasDespues, ventasAntes);

    await query(
      `UPDATE inventario_sucursal SET stock_actual = 1000
       WHERE sucursal_id = $1 AND insumo_id = (SELECT id FROM insumos WHERE nombre = 'Tapadera')`,
      [CENTRAL],
    );
  });

  it('dos cajeros compiten por el último vaso: una venta, sin stock negativo', async () => {
    const otro = await loginAs('ana.rivas@origenes.sv');
    const turnoOtro = (await otro.post('/turnos', { montoInicial: '0' })).body;
    await query(
      `UPDATE inventario_sucursal SET stock_actual = 1
       WHERE sucursal_id = $1 AND insumo_id = (SELECT id FROM insumos WHERE nombre = 'Vaso 16oz')`,
      [CENTRAL],
    );
    const vender = (browser, turnoId) =>
      browser.post('/ventas', {
        turnoId, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
        items: [{ platilloId: latte, cantidad: 1 }],
      });
    const resultados = await Promise.all([vender(cajero, turno.id), vender(otro, turnoOtro.id)]);
    const estados = resultados.map((r) => r.status).sort();
    assert.deepEqual(estados, [201, 409]);
    assert.equal(await stock(CENTRAL, 'Vaso 16oz'), 0);
    assert.ok((await stock(ESCALON, 'Vaso 16oz')) > 0, 'otra sucursal conserva sus existencias');

    await query(
      `UPDATE inventario_sucursal SET stock_actual = 500
       WHERE sucursal_id = $1 AND insumo_id = (SELECT id FROM insumos WHERE nombre = 'Vaso 16oz')`,
      [CENTRAL],
    );
  });

  it('un cajero no puede cobrar en el turno de otro', async () => {
    const otro = await loginAs('ana.rivas@origenes.sv');
    const res = await otro.post('/ventas', {
      turnoId: turno.id, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
      items: [{ platilloId: latte, cantidad: 1 }],
    });
    assert.equal(res.status, 403);
  });

  it('reintento con la misma clave devuelve la misma venta; otro contenido, 409', async () => {
    const clave = randomUUID();
    const pedido = {
      turnoId: turno.id, tipoDoc: 'FACTURA', metodoPago: 'BITCOIN', claveOperacion: clave,
      items: [{ platilloId: latte, cantidad: 1 }],
    };
    const primera = await cajero.post('/ventas', pedido);
    const segunda = await cajero.post('/ventas', pedido);
    assert.equal(primera.status, 201);
    assert.equal(segunda.status, 200);
    assert.equal(segunda.body.id, primera.body.id);

    const distinta = await cajero.post('/ventas', { ...pedido, items: [{ platilloId: latte, cantidad: 2 }] });
    assert.equal(distinta.status, 409);
    assert.equal(distinta.body.error.code, 'CLAVE_REUTILIZADA');
  });
});

describe('CCF y clientes fiscales', () => {
  let clienteId;

  it('CCF sin cliente se rechaza antes de cobrar; factura sin cliente funciona', async () => {
    const sinCliente = await cajero.post('/ventas', {
      turnoId: turno.id, tipoDoc: 'CCF', metodoPago: 'TARJETA',
      items: [{ platilloId: latte, cantidad: 1 }],
    });
    assert.equal(sinCliente.status, 400);
    assert.equal(sinCliente.body.error.code, 'CLIENTE_REQUERIDO');
  });

  it('alta de dos fichas con NRC nulo; NIT duplicado responde 409', async () => {
    const base = {
      nombre: 'Café de Ejemplo, S.A. de C.V.', direccion: 'San Salvador',
      giro: 'Servicios de alimentación', tipo_contribuyente: 'juridica', tamano_contribuyente: 'pequeno',
    };
    const a = await cajero.post('/clientes', { ...base, nit: '06141111111010', nrc: null });
    const b = await cajero.post('/clientes', { ...base, nombre: 'Otra', nit: '0614-222222-101-0' });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.equal(b.status, 201);
    assert.equal(b.body.nit, '06142222221010');
    clienteId = a.body.id;

    const dup = await cajero.post('/clientes', { ...base, nit: '06141111111010' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'NIT_DUPLICADO');
  });

  it('emitir CCF a una ficha sin NRC pide completarlo', async () => {
    const res = await cajero.post('/ventas', {
      turnoId: turno.id, tipoDoc: 'CCF', metodoPago: 'TARJETA', clienteId,
      items: [{ platilloId: latte, cantidad: 1 }],
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NRC_REQUERIDO');
  });

  it('CCF con cliente guarda la fotografía fiscal; renombrar no altera la reimpresión', async () => {
    await cajero.put(`/clientes/${clienteId}`, { nrc: '0123456' });
    const venta = await cajero.post('/ventas', {
      turnoId: turno.id, tipoDoc: 'CCF', metodoPago: 'TARJETA', clienteId,
      items: [{ platilloId: latte, cantidad: 1 }],
    });
    assert.equal(venta.status, 201);
    assert.equal(venta.body.cliente.nombre, 'Café de Ejemplo, S.A. de C.V.');
    assert.equal(venta.body.cliente.nrc, '0123456');

    await cajero.put(`/clientes/${clienteId}`, { nombre: 'Nuevo Nombre, S.A.' });
    const busqueda = await cajero.get('/clientes?buscar=Nuevo');
    assert.equal(busqueda.body.items[0].nombre, 'Nuevo Nombre, S.A.');
    const reimpresion = await cajero.get(`/ventas/${venta.body.id}`);
    assert.equal(reimpresion.body.cliente.nombre, 'Café de Ejemplo, S.A. de C.V.');
  });

  it('busca clientes por NIT parcial', async () => {
    const res = await cajero.get('/clientes?buscar=061411');
    assert.equal(res.status, 200);
    assert.ok(res.body.items.some((c) => c.id === clienteId));
  });

  it('RR. HH. no accede al directorio fiscal', async () => {
    const rrhh = await loginAs('rrhh@origenes.sv');
    assert.equal((await rrhh.get('/clientes?buscar=06')).status, 403);
  });
});

describe('Cierre de caja', () => {
  it('cuadra por medio de pago: solo el efectivo incluye el fondo', async () => {
    const cajera = await loginAs('ana.rivas@origenes.sv');
    const actual = (await cajera.get('/turnos/actual')).body.turno;
    await query('UPDATE turnos_caja SET monto_inicial = 20 WHERE id = $1', [actual.id]);
    await query('DELETE FROM detalle_venta WHERE venta_id IN (SELECT id FROM ventas WHERE turno_id = $1)', [actual.id]);
    await query('DELETE FROM ventas WHERE turno_id = $1', [actual.id]);

    // Venta en efectivo de $10.00 (Pancakes $5.00 × 2).
    const venta = await cajera.post('/ventas', {
      turnoId: actual.id, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
      items: [{ platilloId: await idPlatillo('Pancakes'), cantidad: 2 }],
    });
    assert.equal(venta.body.total, '10.00');

    const cierre = await cajera.post(`/turnos/${actual.id}/cierre`, {
      efectivoContado: '29.00', tarjetaReportada: '0', bitcoinReportado: '0',
    });
    assert.equal(cierre.status, 200);
    assert.equal(cierre.body.estado, 'CERRADO');
    const efectivo = cierre.body.arqueo.medios.find((m) => m.metodo === 'EFECTIVO');
    assert.equal(efectivo.esperado, '30.00');
    assert.equal(efectivo.diferencia, '-1.00');

    const tarde = await cajera.post('/ventas', {
      turnoId: actual.id, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
      items: [{ platilloId: latte, cantidad: 1 }],
    });
    assert.equal(tarde.status, 409);
    assert.equal(tarde.body.error.code, 'TURNO_CERRADO');
  });

  it('cierre concurrente con un cobro: la venta entra al turno o se rechaza', async () => {
    const res = await cajero.get('/turnos/actual');
    const turnoId = res.body.turno.id;
    const [venta, cierre] = await Promise.all([
      cajero.post('/ventas', {
        turnoId, tipoDoc: 'FACTURA', metodoPago: 'EFECTIVO',
        items: [{ platilloId: latte, cantidad: 1 }],
      }),
      cajero.post(`/turnos/${turnoId}/cierre`, {
        efectivoContado: '0', tarjetaReportada: '0', bitcoinReportado: '0',
      }),
    ]);
    assert.equal(cierre.status, 200);
    const efectivo = cierre.body.arqueo.medios.find((m) => m.metodo === 'EFECTIVO');
    const [{ total }] = await query(
      "SELECT COALESCE(sum(total),0)::numeric(12,2) AS total FROM ventas WHERE turno_id = $1 AND metodo_pago = 'EFECTIVO'",
      [turnoId],
    );
    assert.equal(efectivo.vendido, total, 'el arqueo incluye todo lo que quedó en el turno');
    if (venta.status === 201) assert.equal(venta.body.turnoId, turnoId);
    else assert.equal(venta.body.error.code, 'TURNO_CERRADO');
  });

  it('un cajero no ve datos de otra sucursal', async () => {
    assert.equal((await cajero.get(`/inventario?sucursalId=${ESCALON}`)).status, 403);
    const propio = await cajero.get('/inventario/alertas');
    assert.equal(propio.status, 200);
    assert.ok(propio.body.items.every((i) => i.sucursalId === CENTRAL));
  });
});
