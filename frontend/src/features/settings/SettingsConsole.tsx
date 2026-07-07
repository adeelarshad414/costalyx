import { Gauge, MonitorCog, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useUserPreferences, type DensityPreference, type ThemePreference } from '../../preferences/UserPreferences';

const themes: Array<{ value: ThemePreference; label: string; icon: typeof Moon }> = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun }
];

const densities: Array<{ value: DensityPreference; label: string }> = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

export function SettingsConsole() {
  const auth = useAuth();
  const preferences = useUserPreferences();

  return (
    <section className="panel settings-console" aria-label="Settings">
      <div className="settings-header">
        <div>
          <p className="section-kicker">Workspace</p>
          <h2>Settings</h2>
        </div>
        <span className="status-chip font-mono-data">{auth.role ?? 'signed-out'}</span>
      </div>

      <div className="settings-grid">
        <section className="settings-card" aria-label="Appearance settings">
          <div className="settings-card-heading">
            <MonitorCog aria-hidden="true" size={18} />
            <h3>Appearance</h3>
          </div>

          <div className="settings-row">
            <span className="settings-label">Theme</span>
            <div className="view-toggle" role="group" aria-label="Theme">
              {themes.map((theme) => {
                const Icon = theme.icon;
                return (
                  <button
                    key={theme.value}
                    type="button"
                    className={preferences.theme === theme.value ? 'is-active' : ''}
                    aria-pressed={preferences.theme === theme.value}
                    onClick={() => preferences.setTheme(theme.value)}
                  >
                    <Icon aria-hidden="true" size={16} />
                    {theme.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">Density</span>
            <div className="view-toggle" role="group" aria-label="Density">
              {densities.map((density) => (
                <button
                  key={density.value}
                  type="button"
                  className={preferences.density === density.value ? 'is-active' : ''}
                  aria-pressed={preferences.density === density.value}
                  onClick={() => preferences.setDensity(density.value)}
                >
                  <Gauge aria-hidden="true" size={16} />
                  {density.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-card" aria-label="Session settings">
          <div className="settings-card-heading">
            <ShieldCheck aria-hidden="true" size={18} />
            <h3>Session</h3>
          </div>

          <dl className="settings-facts">
            <div>
              <dt>Status</dt>
              <dd className="font-mono-data">{auth.status}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd className="font-mono-data">{auth.role ?? 'none'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
