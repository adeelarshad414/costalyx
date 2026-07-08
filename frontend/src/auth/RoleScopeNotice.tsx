import { Banner } from '../components/Overlays';
import { useUserPreferences } from '../preferences/UserPreferences';
import { useAuth } from './AuthProvider';

const roleCopy = {
  viewer: {
    title: 'Viewer access',
    badge: 'Read-only mode',
    detail: 'You can inspect costs, exports, statements, and saved views without changing cloud or billing data.',
    guardrail: 'Analyst and admin actions stay hidden so you do not discover permissions through broken clicks.'
  },
  analyst: {
    title: 'Analyst access',
    badge: 'Guided action mode',
    detail: 'You can tune allocations, investigate anomalies, and prepare optimization work with approval guardrails.',
    guardrail: 'Admin-only account, credential, user, and operator controls stay hidden until an admin grants access.'
  }
} as const;

export function RoleScopeNotice() {
  const auth = useAuth();
  const preferences = useUserPreferences();

  if (auth.status !== 'authenticated' || auth.role === 'admin' || !auth.role) {
    return null;
  }

  const copy = roleCopy[auth.role];
  const bannerId = `role-scope-${auth.role}`;
  if (preferences.dismissedBanners[bannerId]) {
    return null;
  }

  return (
    <Banner
      title={copy.title}
      badge={copy.badge}
      detail={`${copy.detail} ${copy.guardrail}`}
      tone="info"
      ariaLabel="Access scope"
      onDismiss={() => preferences.dismissBanner(bannerId)}
    />
  );
}
