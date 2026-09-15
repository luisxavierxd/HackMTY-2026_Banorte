/**
 * Las 6 tools del dominio de educación financiera — puerto de
 * legacy/mcp_servers/educacion_financiera/server.py.
 *
 * El orden de las operaciones aritméticas está copiado línea por línea del
 * Python a propósito: en punto flotante `a * b / c` no siempre da lo mismo
 * que `a * (b / c)`, y los goldens comparan con tolerancia 1e-9.
 *
 * Todo redondeo pasa por `roundTo` (banker's rounding). Python lo usa tanto
 * en `round()` como en el mini-lenguaje de formato (`f"{x:,.0f}"`), así que
 * también lo usan los helpers de formato de abajo.
 */
import { readStore } from "./store";
import { round2, roundTo } from "./types";

// ── Constantes didácticas ──────────────────────────────────────────────

export const INFLACION_ANUAL_MX = 0.045;

// ── Helpers de formato ─────────────────────────────────────────────────
// Reproducen el mini-lenguaje de formato de Python. Ojo: `format()` redondea
// half-to-even igual que `round()` — verificado contra CPython:
//   f"{1840.5:,.0f}" -> "1,840"   (no "1,841")
//   f"{0.125:.0%}"   -> "12%"     (no "13%")
// Por eso se redondea con `roundTo` ANTES de formatear, en vez de dejarle el
// redondeo a `toLocaleString`, que redondea half-away-from-zero.

/**
 * Python conserva el signo cuando un negativo chico se redondea a cero:
 * `f"{-0.05:,.0f}"` da `"-0"`, no `"0"`. `roundTo` normaliza el -0 (lo
 * correcto para un campo numérico), así que el signo se repone aquí, solo
 * para el texto.
 */
function withSign(original: number, rounded: number, formatted: string): string {
  return rounded === 0 && original < 0 ? `-${formatted}` : formatted;
}

/** `f"{x:,.0f}"` — separador de miles, sin decimales. */
function f0(x: number): string {
  const r = roundTo(x, 0);
  const s = r.toLocaleString("en-US", {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return withSign(x, r, s);
}

/** `f"{x:.0%}"` — porcentaje sin decimales. */
function pct0(x: number): string {
  const r = roundTo(x * 100, 0);
  return `${withSign(x, r, String(r))}%`;
}

/** `f"{x:.1%}"` — porcentaje con un decimal. */
function pct1(x: number): string {
  const r = roundTo(x * 100, 1);
  return `${withSign(x, r, r.toFixed(1))}%`;
}

/** `f"{x:.0f}"` — entero suelto, sin separador de miles. */
function d0(x: number): string {
  const r = roundTo(x, 0);
  return withSign(x, r, String(r));
}

// ── Tools ──────────────────────────────────────────────────────────────

export interface InteresCompuestoArgs {
  capital?: number;
  tasa_anual?: number;
  meses?: number;
}

export function explicarInteresCompuesto(args: InteresCompuestoArgs = {}) {
  const capital = args.capital ?? 10000.0;
  const tasaAnual = args.tasa_anual ?? 0.3;
  const meses = args.meses ?? 24;

  const i = tasaAnual / 12;
  const serie: Array<Record<string, number>> = [];
  let saldo = capital;
  let interesAcum = 0.0;
  for (let m = 1; m <= meses; m++) {
    const interes = saldo * i;
    interesAcum += interes;
    saldo += interes;
    serie.push({
      mes: m,
      saldo: round2(saldo),
      interes_acumulado: round2(interesAcum),
    });
  }

  return {
    concepto: "interes_compuesto",
    parametros: { capital, tasa_anual: tasaAnual, meses },
    serie,
    resumen: {
      saldo_final: round2(saldo),
      interes_total: round2(interesAcum),
      factor_crecimiento: roundTo(saldo / capital, 4),
    },
    explicacion:
      `Con una tasa anual de ${pct0(tasaAnual)}, una deuda de ` +
      `$${f0(capital)} se convierte en $${f0(saldo)} en ${meses} meses ` +
      `si no se paga nada — el interés genera más interés.`,
  };
}

export interface PagoMinimoVsFijoArgs {
  pago_fijo?: number | null;
}

export function compararPagoMinimoVsFijo(args: PagoMinimoVsFijoArgs = {}) {
  const st = readStore();
  const t = st.tarjetas[0];
  const saldoIni = t.saldo;
  const tasa = t.tasa_anual;
  const minimo = t.pago_minimo;
  // `pago_fijo or round(minimo * 2, 2)` — en Python el `or` también cae al
  // default con 0, no solo con None. `||` tiene esa misma semántica.
  const fijo = (args.pago_fijo ?? 0) || round2(minimo * 2);
  const i = tasa / 12;

  function simular(pagoMensual: number, tope = 600): Array<Record<string, number>> {
    let saldo = saldoIni;
    let pagado = 0.0;
    const serie: Array<Record<string, number>> = [];
    let mes = 0;
    while (saldo > 0.01 && mes < tope) {
      mes += 1;
      const interes = saldo * i;
      const pagoReal = Math.min(pagoMensual, saldo + interes);
      saldo = saldo + interes - pagoReal;
      pagado += pagoReal;
      serie.push({
        mes,
        saldo: round2(Math.max(saldo, 0)),
        pagado_acumulado: round2(pagado),
      });
    }
    return serie;
  }

  const serieMinimo = simular(minimo);
  const serieFijo = simular(fijo);

  // Ojo: el costo sale del valor YA REDONDEADO del último punto de la serie,
  // no del acumulador sin redondear. Igual que el Python.
  const costoMinimo = serieMinimo.length ? serieMinimo[serieMinimo.length - 1].pagado_acumulado : 0;
  const costoFijo = serieFijo.length ? serieFijo[serieFijo.length - 1].pagado_acumulado : 0;

  return {
    concepto: "pago_minimo_vs_fijo",
    saldo_inicial: saldoIni,
    escenarios: {
      pago_minimo: {
        pago_mensual: minimo,
        meses_para_liquidar: serieMinimo.length,
        costo_total: costoMinimo,
        serie: serieMinimo,
      },
      pago_fijo: {
        pago_mensual: fijo,
        meses_para_liquidar: serieFijo.length,
        costo_total: costoFijo,
        serie: serieFijo,
      },
    },
    resumen: {
      ahorro: round2(costoMinimo - costoFijo),
      meses_menos: serieMinimo.length - serieFijo.length,
    },
    explicacion:
      `Pagando $${f0(fijo)}/mes en vez de solo el mínimo ($${f0(minimo)}), ` +
      `liquidas ${serieMinimo.length - serieFijo.length} meses antes y ` +
      `ahorras $${f0(costoMinimo - costoFijo)} en intereses.`,
  };
}

export interface MetaAhorroArgs {
  meta?: number;
  plazo_meses?: number;
  tasa_ahorro_anual?: number;
}

export function simularMetaAhorro(args: MetaAhorroArgs = {}) {
  const meta = args.meta ?? 50000.0;
  const plazoMeses = args.plazo_meses ?? 12;
  const tasaAhorroAnual = args.tasa_ahorro_anual ?? 0.08;

  const i = tasaAhorroAnual / 12;

  const aporteSin = meta / plazoMeses;
  let aporteCon: number;
  if (i > 0) {
    aporteCon = (meta * i) / ((1 + i) ** plazoMeses - 1);
  } else {
    aporteCon = aporteSin;
  }

  const serieSin: Array<Record<string, number>> = [];
  const serieCon: Array<Record<string, number>> = [];
  let acumSin = 0.0;
  let acumCon = 0.0;
  for (let m = 1; m <= plazoMeses; m++) {
    acumSin += aporteSin;
    serieSin.push({ mes: m, acumulado: round2(acumSin), aportacion_mes: round2(aporteSin) });

    // el rendimiento se calcula sobre el acumulado ANTES de la aportación
    const rendimiento = acumCon * i;
    acumCon = acumCon + aporteCon + rendimiento;
    serieCon.push({ mes: m, acumulado: round2(acumCon), aportacion_mes: round2(aporteCon) });
  }

  return {
    concepto: "meta_ahorro",
    parametros: { meta, plazo_meses: plazoMeses, tasa_ahorro_anual: tasaAhorroAnual },
    escenarios: {
      sin_rendimiento: {
        aporte_mensual: round2(aporteSin),
        total_aportado: round2(aporteSin * plazoMeses),
        serie: serieSin,
      },
      con_rendimiento: {
        aporte_mensual: round2(aporteCon),
        total_aportado: round2(aporteCon * plazoMeses),
        rendimiento_ganado: round2(meta - aporteCon * plazoMeses),
        serie: serieCon,
      },
    },
    resumen: {
      ahorro_mensual_gracias_a_rendimiento: round2(aporteSin - aporteCon),
    },
    explicacion:
      `Para juntar $${f0(meta)} en ${plazoMeses} meses, necesitas ` +
      `$${f0(aporteSin)}/mes sin rendimiento, o $${f0(aporteCon)}/mes ` +
      `con rendimiento al ${pct0(tasaAhorroAnual)} anual — te ahorras ` +
      `$${f0(aporteSin - aporteCon)} por mes.`,
  };
}

export interface CatArgs {
  monto?: number;
  plazo_meses?: number;
  tasa_anual?: number;
  comision_apertura?: number;
  seguro_mensual?: number;
}

export function explicarCat(args: CatArgs = {}) {
  const monto = args.monto ?? 100000.0;
  const plazoMeses = args.plazo_meses ?? 12;
  const tasaAnual = args.tasa_anual ?? 0.289;
  const comisionApertura = args.comision_apertura ?? 0.01;
  const seguroMensual = args.seguro_mensual ?? 150.0;

  const i = tasaAnual / 12;
  let pagoBase: number;
  if (i === 0) {
    pagoBase = monto / plazoMeses;
  } else {
    pagoBase = (monto * i) / (1 - (1 + i) ** -plazoMeses);
  }

  const comision = monto * comisionApertura;
  const netoRecibido = monto - comision;

  const serie: Array<Record<string, number>> = [];
  let saldo = monto;
  let totalInteres = 0.0;
  let totalSeguro = 0.0;
  for (let m = 1; m <= plazoMeses; m++) {
    const interes = saldo * i;
    const capital = pagoBase - interes;
    saldo = Math.max(saldo - capital, 0);
    totalInteres += interes;
    totalSeguro += seguroMensual;
    serie.push({
      mes: m,
      pago_base: round2(pagoBase),
      interes: round2(interes),
      capital: round2(capital),
      seguro: round2(seguroMensual),
      pago_total: round2(pagoBase + seguroMensual),
      saldo: round2(saldo),
    });
  }

  const costoTotal = pagoBase * plazoMeses + totalSeguro + comision;
  const flujos = [-netoRecibido, ...Array<number>(plazoMeses).fill(pagoBase + seguroMensual)];
  const cat = tirAnualizada(flujos);

  return {
    concepto: "cat",
    parametros: {
      monto,
      plazo_meses: plazoMeses,
      tasa_anual: tasaAnual,
      comision_apertura: comisionApertura,
      seguro_mensual: seguroMensual,
    },
    serie,
    desglose_costo: {
      capital: round2(monto),
      intereses: round2(totalInteres),
      comision_apertura: round2(comision),
      seguros: round2(totalSeguro),
      costo_total: round2(costoTotal),
    },
    resumen: {
      tasa_anual: tasaAnual,
      cat_aproximado: cat,
      diferencia: roundTo(cat - tasaAnual, 4),
      neto_recibido: round2(netoRecibido),
    },
    explicacion:
      `La tasa es ${pct1(tasaAnual)}, pero el CAT es ${pct1(cat)} porque ` +
      `incluye la comisión de apertura ($${f0(comision)}) y el seguro ` +
      `($${f0(seguroMensual)}/mes = $${f0(totalSeguro)} total). ` +
      `El CAT es el costo REAL anualizado de todo junto.`,
  };
}

export interface InflacionArgs {
  monto?: number;
  anios?: number;
  inflacion_anual?: number;
}

export function visualizarInflacion(args: InflacionArgs = {}) {
  const monto = args.monto ?? 10000.0;
  const anios = args.anios ?? 5;
  const inflacionAnual = args.inflacion_anual ?? INFLACION_ANUAL_MX;

  const serie: Array<Record<string, number>> = [];
  for (let a = 1; a <= anios; a++) {
    const poder = monto / (1 + inflacionAnual) ** a;
    serie.push({
      anio: a,
      valor_nominal: round2(monto),
      poder_compra_real: round2(poder),
      // usa el `poder` SIN redondear, igual que el Python
      perdida_porcentual: round2((1 - poder / monto) * 100),
    });
  }

  return {
    concepto: "inflacion",
    parametros: { monto, anios, inflacion_anual: inflacionAnual },
    serie,
    resumen: {
      poder_compra_final: round2(monto / (1 + inflacionAnual) ** anios),
      perdida_total: round2(monto - monto / (1 + inflacionAnual) ** anios),
    },
    explicacion:
      `$${f0(monto)} de hoy equivalen a ` +
      `$${f0(monto / (1 + inflacionAnual) ** anios)} en ${anios} años ` +
      `con inflación de ${pct1(inflacionAnual)}. Si no inviertes, pierdes ` +
      `poder de compra cada año.`,
  };
}

export interface Regla503020Args {
  ingreso_mensual?: number | null;
}

export function regla503020(args: Regla503020Args = {}) {
  const st = readStore();
  // mismo `or` que el Python: 0 también cae al default del perfil
  const ingreso = (args.ingreso_mensual ?? 0) || st.cliente.ingreso_mensual;

  const CATEGORIAS_NECESIDADES = new Set([
    "despensa",
    "vivienda",
    "transporte",
    "salud",
    "servicios",
  ]);
  const CATEGORIAS_DESEOS = new Set(["comida fuera", "entretenimiento", "ropa", "suscripciones"]);

  let gastoNec = 0.0;
  let gastoDes = 0.0;
  let gastoOtro = 0.0;
  for (const mov of st.movimientos) {
    if (mov.monto >= 0) continue;
    const cat = mov.categoria;
    const montoAbs = -mov.monto;
    if (CATEGORIAS_NECESIDADES.has(cat)) {
      gastoNec += montoAbs;
    } else if (CATEGORIAS_DESEOS.has(cat)) {
      gastoDes += montoAbs;
    } else {
      gastoOtro += montoAbs;
    }
  }

  const idealNec = ingreso * 0.5;
  const idealDes = ingreso * 0.3;
  const idealAho = ingreso * 0.2;

  const gastoTotal = gastoNec + gastoDes + gastoOtro;
  const ahorroReal = ingreso - gastoTotal;

  const comparacion = [
    {
      grupo: "necesidades",
      porcentaje_ideal: 50,
      ideal: round2(idealNec),
      real: round2(gastoNec),
      diferencia: round2(idealNec - gastoNec),
      status: gastoNec <= idealNec ? "ok" : "excedido",
    },
    {
      grupo: "deseos",
      porcentaje_ideal: 30,
      ideal: round2(idealDes),
      real: round2(gastoDes),
      diferencia: round2(idealDes - gastoDes),
      status: gastoDes <= idealDes ? "ok" : "excedido",
    },
    {
      grupo: "ahorro_e_inversión",
      porcentaje_ideal: 20,
      ideal: round2(idealAho),
      real: round2(ahorroReal),
      diferencia: round2(ahorroReal - idealAho),
      status: ahorroReal >= idealAho ? "ok" : "insuficiente",
    },
  ];

  return {
    concepto: "regla_50_30_20",
    ingreso_mensual: round2(ingreso),
    comparacion,
    resumen: {
      gasto_total: round2(gastoTotal),
      ahorro_real: round2(ahorroReal),
      ahorro_como_porcentaje: ingreso ? round2((ahorroReal / ingreso) * 100) : 0,
    },
    explicacion:
      `De tu ingreso de $${f0(ingreso)}, la regla dice destinar ` +
      `$${f0(idealNec)} a necesidades, $${f0(idealDes)} a deseos ` +
      `y $${f0(idealAho)} a ahorro. Hoy ahorras $${f0(ahorroReal)} ` +
      `(${d0((ahorroReal / ingreso) * 100)}% de tu ingreso).`,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

/** TIR mensual biseccionada y anualizada (compuesta). 80 iteraciones fijas. */
export function tirAnualizada(flujos: number[]): number {
  let lo = 0.0;
  let hi = 1.0;
  for (let n = 0; n < 80; n++) {
    const mid = (lo + hi) / 2;
    // suma de izquierda a derecha desde 0, como el `sum()` de Python
    let vp = 0;
    for (let t = 0; t < flujos.length; t++) {
      vp += flujos[t] / (1 + mid) ** t;
    }
    if (vp > 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return roundTo((1 + (lo + hi) / 2) ** 12 - 1, 4);
}
