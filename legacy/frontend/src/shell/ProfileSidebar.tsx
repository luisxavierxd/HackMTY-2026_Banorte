import type { UserProfile } from "../net/profile";
import { relativeDate, type ConversationRecord } from "../net/conversations";

function formatMoney(n: number | undefined): string {
  // `?? 0`: perfiles guardados antes de agregar gastosMensuales no lo traen.
  return (n ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13h8l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ProfileSidebarProps {
  profile: UserProfile;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  conversations: ConversationRecord[];
  activeId: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

/** Card en escritorio, barra lateral deslizable en móvil (ver App.css
 *  ".bn-sidebar" y su breakpoint). Persistente en toda la app (landing y
 *  conversación activa) al estilo dark liquid-glass del Figma. Muestra el
 *  perfil que da contexto al agente, el historial de conversaciones
 *  (net/conversations.ts) y el botón para salir y crear otro. */
export default function ProfileSidebar({
  profile,
  open,
  onClose,
  onLogout,
  conversations,
  activeId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
}: ProfileSidebarProps) {
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

          <button type="button" className="bn-sidebar__new" onClick={onNewConversation}>
            <PlusIcon /> Nueva conversación
          </button>

          <div className="bn-sidebar__conversations" role="list">
            {conversations.map((c) => (
              <div
                key={c.id}
                role="listitem"
                className={`bn-sidebar__conversation${
                  c.id === activeId ? " bn-sidebar__conversation--active" : ""
                }`}
              >
                <button
                  type="button"
                  className="bn-sidebar__conversation-select"
                  onClick={() => onSelectConversation(c.id)}
                  title={c.title || "Nueva conversación"}
                >
                  <span className="bn-sidebar__conversation-title">{c.title || "Nueva conversación"}</span>
                  <span className="bn-sidebar__conversation-date">{relativeDate(c.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="bn-sidebar__conversation-delete"
                  aria-label="Borrar conversación"
                  onClick={() => onDeleteConversation(c.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>

          <button type="button" className="bn-sidebar__logout" onClick={onLogout}>
            Salir y crear otro
          </button>
        </div>
      </aside>
    </>
  );
}
