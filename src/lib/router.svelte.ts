export type Route = { name: 'home' } | { name: 'tasks' } | { name: 'history' } | { name: 'settings' };

function parse(hash: string): Route {
  const [path] = hash.replace(/^#/, '').split('?');
  const first = path.split('/').filter(Boolean)[0];
  if (first === 'tasks' || first === 'history' || first === 'settings') return { name: first };
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
