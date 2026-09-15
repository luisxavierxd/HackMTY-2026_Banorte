/**
 * Estado sintético congelado — puerto de `SEED` en
 * legacy/mcp_servers/common/store.py.
 *
 * En el harness Python esto se persiste en `data/state.json` y las tools de
 * otros dominios lo mutan. En el navegador no hay persistencia y las 6 tools
 * de educación financiera son de CONSULTA (no mutan nada), así que basta con
 * la semilla. `readStore()` devuelve una copia profunda para que ninguna tool
 * pueda contaminar a la siguiente.
 */

export interface Cliente {
  id: string;
  nombre: string;
  segmento: string;
  score_interno: number;
  ingreso_mensual: number;
  antiguedad_meses: number;
}

export interface Cuenta {
  id: string;
  tipo: string;
  alias: string;
  saldo: number;
}

export interface Tarjeta {
  id: string;
  alias: string;
  saldo: number;
  limite: number;
  tasa_anual: number;
  pago_minimo: number;
  fecha_corte: string;
}

export interface Movimiento {
  fecha: string;
  concepto: string;
  categoria: string;
  monto: number;
}

export interface StoreState {
  cliente: Cliente;
  cuentas: Cuenta[];
  tarjetas: Tarjeta[];
  movimientos: Movimiento[];
  planes_aplicados: unknown[];
  eventos: unknown[];
}

const SEED: StoreState = {
  cliente: {
    id: "CU-40218",
    nombre: "Ana Ramírez",
    segmento: "nomina",
    score_interno: 712,
    ingreso_mensual: 28500.0,
    antiguedad_meses: 41,
  },
  cuentas: [
    { id: "AC-001", tipo: "nomina", alias: "Cuenta de nómina", saldo: 21430.55 },
    { id: "AC-002", tipo: "ahorro", alias: "Ahorro Meta", saldo: 58200.0 },
  ],
  tarjetas: [
    {
      id: "TC-771",
      alias: "Tarjeta Clásica",
      saldo: 18400.0,
      limite: 45000.0,
      tasa_anual: 0.389,
      pago_minimo: 1840.0,
      fecha_corte: "2026-09-28",
    },
  ],
  movimientos: [
    { fecha: "2026-09-08", concepto: "Supermercado", categoria: "despensa", monto: -1840.2 },
    { fecha: "2026-09-07", concepto: "Gasolina", categoria: "transporte", monto: -900.0 },
    { fecha: "2026-09-05", concepto: "Suscripciones", categoria: "servicios", monto: -449.0 },
    { fecha: "2026-09-04", concepto: "Restaurante", categoria: "comida fuera", monto: -1210.5 },
    { fecha: "2026-09-01", concepto: "Depósito de nómina", categoria: "ingreso", monto: 28500.0 },
    { fecha: "2026-08-28", concepto: "Pago tarjeta TC-771", categoria: "credito", monto: -1840.0 },
    { fecha: "2026-08-26", concepto: "Farmacia", categoria: "salud", monto: -620.9 },
    { fecha: "2026-08-22", concepto: "Renta", categoria: "vivienda", monto: -9500.0 },
  ],
  planes_aplicados: [],
  eventos: [],
};

/** Copia profunda, como el `json.loads(json.dumps(SEED))` del Python. */
export function readStore(): StoreState {
  return JSON.parse(JSON.stringify(SEED)) as StoreState;
}
