import type { UserProfile } from "../net/profile";

function formatMoney(n: number | undefined): string {
  // `?? 0`: perfiles guardados antes de agregar gastosMensuales no lo traen.
  return (n ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

/** Card en escritorio, barra lateral deslizable en móvil (ver App.css
 *  ".bn-sidebar" y su breakpoint). Muestra el perfil que da contexto al
 *  agente y el botón para salir y crear otro — todo lo que se ve aquí es
 *  lo mismo que se manda con cada mensaje (ver net/useSocket.ts). */
export default function ProfileSidebar({
  profile,
  open,
  onClose,
  onLogout,
}: {
  profile: UserProfile;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      {open && <div className="bn-sidebar__scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`bn-sidebar${open ? " bn-sidebar--open" : ""}`}>
        <div className="bn-sidebar__card">
          <span className="bn-sidebar__eyebrow">Tu contexto</span>
          <h2 className="bn-sidebar__name">{profile.nombre}</h2>
          <dl className="bn-sidebar__stats">
            <div>
              <dt>Ingreso mensual</dt>
              <dd>{formatMoney(profile.ingresoMensual)}</dd>
            </div>
            <div>
              <dt>Ahorrado</dt>
              <dd>{formatMoney(profile.ahorro)}</dd>
            </div>
            <div>
              <dt>Invertido</dt>
              <dd>{formatMoney(profile.inversion)}</dd>
            </div>
            <div>
              <dt>Gastos mensuales</dt>
              <dd>{formatMoney(profile.gastosMensuales)}</dd>
            </div>
          </dl>
          <button type="button" className="bn-sidebar__logout" onClick={onLogout}>
            Salir y crear otro
          </button>
        </div>
      </aside>
    </>
  );
}
