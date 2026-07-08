import { Gauge, Monitor, MonitorCog, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import {
  useUserPreferences,
  type AccentPreference,
  type DensityPreference,
  type ThemeModePreference
} from '../../preferences/UserPreferences';

const themes: Array<{ value: ThemeModePreference; label: string; icon: typeof Moon }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun }
];

const accents: Array<{ value: AccentPreference; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'terracotta', label: 'Terracotta' }
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
            <span className="settings-label">Mode</span>
            <div className="view-toggle" role="group" aria-label="Mode">
              {themes.map((theme) => {
                const Icon = theme.icon;
                return (
                  <Button
                    key={theme.value}
                    variant="ghost"
                    size="compact"
                    className={preferences.theme === theme.value ? 'is-active' : ''}
                    aria-pressed={preferences.theme === theme.value}
                    onClick={() => preferences.setTheme(theme.value)}
                  >
                    <Icon aria-hidden="true" size={16} />
                    {theme.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">Accent</span>
            <div className="view-toggle" role="group" aria-label="Accent">
              {accents.map((accent) => (
                <Button
                  key={accent.value}
                  variant="ghost"
                  size="compact"
                  className={preferences.accent === accent.value ? 'is-active' : ''}
                  aria-pressed={preferences.accent === accent.value}
                  onClick={() => preferences.setAccent(accent.value)}
                >
                  <span className={`accent-swatch accent-swatch-${accent.value}`} aria-hidden="true" />
                  {accent.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">Density</span>
            <div className="view-toggle" role="group" aria-label="Density">
              {densities.map((density) => (
                <Button
                  key={density.value}
                  variant="ghost"
                  size="compact"
                  className={preferences.density === density.value ? 'is-active' : ''}
                  aria-pressed={preferences.density === density.value}
                  onClick={() => preferences.setDensity(density.value)}
                >
                  <Gauge aria-hidden="true" size={16} />
                  {density.label}
                </Button>
              ))}
            </div>
          </div>

          <dl className="settings-facts">
            <div>
              <dt>Resolved</dt>
              <dd className="font-mono-data">{preferences.resolvedTheme}</dd>
            </div>
          </dl>
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
