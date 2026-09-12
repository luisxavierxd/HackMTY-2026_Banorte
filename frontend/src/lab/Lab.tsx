/**
 * Lab — offline gallery of all A2UI fixtures.
 * Activated with ?lab=1 in the URL.
 * Renders each fixture as a complete surface without any backend.
 */
import { useState, useEffect, type ReactNode } from "react";

// Vite glob import — loads all fixture JSON files at build time
const fixtureModules = import.meta.glob<{ default: unknown }>("./fixtures/*.json", { eager: true });

interface FixtureEntry {
  name: string;
  data: any;
}

function loadFixtures(): FixtureEntry[] {
  return Object.entries(fixtureModules).map(([path, mod]) => ({
    name: path.replace("./fixtures/", "").replace(".json", "").replace(/_/g, " "),
    data: (mod as any).default ?? mod,
  }));
}

interface LabProps {
  renderSurface: (surfaceEvent: any) => ReactNode;
}

export default function Lab({ renderSurface }: LabProps) {
  const [fixtures] = useState(loadFixtures);
  const [active, setActive] = useState(0);

  useEffect(() => {
    document.title = `Lab — ${fixtures[active]?.name ?? "GenUI"}`;
  }, [active, fixtures]);

  if (fixtures.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--bn-mute)" }}>
        Sin fixtures. Corre <code>python scripts/dump_fixtures.py</code> primero.
      </div>
    );
  }

  return (
    <div className="lab">
      <nav className="lab-nav">
        {fixtures.map((f, i) => (
          <button
            key={f.name}
            className={`lab-chip ${i === active ? "lab-chip--active" : ""}`}
            onClick={() => setActive(i)}
          >
            {f.name}
          </button>
        ))}
      </nav>
      <div className="lab-surface">{renderSurface(fixtures[active].data)}</div>
      <style>{`
        .lab { display: flex; flex-direction: column; min-height: 100dvh; }
        .lab-nav {
          display: flex; gap: 6px; padding: 12px 16px;
          overflow-x: auto; flex-shrink: 0;
          border-bottom: 1px solid var(--bn-line);
          background: var(--bn-surface);
        }
        .lab-chip {
          padding: 6px 14px; border-radius: 999px; border: 1px solid var(--bn-line);
          background: transparent; color: var(--bn-mute); font-size: 13px;
          cursor: pointer; white-space: nowrap; transition: all 150ms;
        }
        .lab-chip:hover { border-color: var(--bn-gray); }
        .lab-chip--active {
          background: var(--bn-red); color: #fff; border-color: var(--bn-red);
        }
        .lab-surface { flex: 1; padding: 16px; }
      `}</style>
    </div>
  );
}
