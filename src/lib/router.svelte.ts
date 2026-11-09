export type Route =
  | { name: 'home' }
  | { name: 'tasks' }
  | { name: 'history' }
  | { name: 'settings' }
  | { name: 'session'; id: string; fresh: boolean };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'tasks') return { name: 'tasks' };
  if (parts[0] === 'history') return { name: 'history' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'session' && parts[1]) {
    return { name: 'session', id: parts[1], fresh: new URLSearchParams(query).has('fresh') };
  }
  return { name: 'home' };
}

export const router = $state({ route: parse(location.hash) });

window.addEventListener('hashchange', () => {
  router.route = parse(location.hash);
  window.scrollTo(0, 0);
});

export function navigate(path: string) {
  location.hash = path;
}
