import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider,
} from '@tanstack/react-router';
import { authQuery, getSnippet, languagesQuery, type Code, type Language } from './api';
import { Login } from './Login';
import { Workspace, Logo, draftKey, starter } from './Workspace';
import { takePendingWorkspace } from './import';
import { load } from './storage';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function EditorPage() {
  const { lang } = editorRoute.useParams();
  const { data, isPending, error } = useQuery(languagesQuery);
  if (isPending) return <Message title="Loading…" />;
  if (error) return <Message title="Runverse can't reach its server." text={error.message} />;
  const l = data.find(x => x.id === lang);
  if (!l) return <Message title={`“${lang}” isn't a language Runverse knows.`} languages={data} />;
  if (!l.installed) return <Message title={`${l.name} isn't installed on this server yet.`} languages={data} />;
  const draft = takePendingWorkspace(l.id) ?? load<Code>(draftKey(l.id));
  // `key` gives each language a fresh workspace instead of carrying files across.
  return <Workspace key={l.id} lang={l} initial={draft?.files?.length ? draft : starter(l)} persist />;
}

function SnippetPage() {
  const { id } = snippetRoute.useParams();
  const langs = useQuery(languagesQuery);
  const snippet = useQuery({ queryKey: ['snippet', id], queryFn: () => getSnippet(id), staleTime: Infinity });
  if (langs.isPending || snippet.isPending) return <Message title="Loading…" />;
  if (snippet.error) return <Message title="This link doesn't work." text={snippet.error.message} languages={langs.data} />;
  if (langs.error) return <Message title="Runverse can't reach its server." text={langs.error.message} />;
  const l = langs.data.find(x => x.id === snippet.data.language);
  if (!l) return <Message title="This snippet uses a language this server doesn't have." languages={langs.data} />;
  return <Workspace key={id} lang={l} initial={snippet.data} persist={false} expiresAt={snippet.data.expiresAt} />;
}

function Message({ title, text, languages }: { title: string; text?: string; languages?: Language[] }) {
  return (
    <div className="message">
      <a className="brand" href="/"><Logo /><span>runverse</span></a>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
      {languages && (
        <>
          <p>Pick a language or a framework to start coding:</p>
          {(['language', 'framework'] as const).map(group => (
            <ul key={group} className="lang-list" aria-label={group === 'language' ? 'Languages' : 'Frameworks'}>
              {languages.filter(l => l.installed && l.group === group).map(l => (
                <li key={l.id}><Link to="/editor/$lang" params={{ lang: l.id }}>{l.name}</Link></li>
              ))}
            </ul>
          ))}
        </>
      )}
    </div>
  );
}

const KIND_LABEL = { browser: 'Runs in your browser', server: 'Runs on the server' } as const;

// /editor: choose what to start, languages and frameworks side by side.
function StartPage() {
  const { data, isPending, error } = useQuery(languagesQuery);
  if (isPending) return <Message title="Loading…" />;
  if (error) return <Message title="Runverse can't reach its server." text={error.message} />;
  const groups = [
    { id: 'language', title: 'Languages', text: 'A program with its input and output.' },
    { id: 'framework', title: 'Frameworks', text: 'A starter project with a live preview.' },
  ] as const;
  return (
    <div className="start">
      <a className="brand" href="/"><Logo /><span>runverse</span></a>
      <h1>What do you want to build?</h1>
      {groups.map(group => {
        const items = data.filter(l => l.group === group.id);
        return (
          <section key={group.id} className="start-group" aria-labelledby={`start-${group.id}`}>
            <h2 id={`start-${group.id}`}>{group.title} <span>{group.text}</span></h2>
            <ul className="start-grid">
              {items.map(l => (
                <li key={l.id}>
                  {l.installed ? (
                    <Link className="start-card" to="/editor/$lang" params={{ lang: l.id }}>
                      <strong>{l.name}</strong>
                      <span>{[l.base, l.version].filter(Boolean).join(' · ') || (l.kind ? KIND_LABEL[l.kind] : 'In your browser')}</span>
                    </Link>
                  ) : (
                    <span className="start-card is-missing" title="Not installed on this server">
                      <strong>{l.name}</strong>
                      <span>Not installed</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// With sign-in on, nothing but the sign-in page is shown until there is a session.
function AuthGate() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery(authQuery);
  useEffect(() => {
    const again = () => qc.invalidateQueries({ queryKey: ['auth'] });
    addEventListener('rv-unauthorized', again);
    return () => removeEventListener('rv-unauthorized', again);
  }, [qc]);
  // Only the first check shows "Loading…". A later refetch (even one that fails) must not throw the editor away.
  const settled = useRef(false);
  if (!isPending) settled.current = true;
  if (isPending && !settled.current) return <Message title="Loading…" />;
  // If the auth check itself fails, let the pages show their own "can't reach its server" message.
  if (data?.authEnabled && !data.authenticated) return <Login />;
  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: AuthGate,
  notFoundComponent: () => <Message title="This page doesn't exist." />,
});
const editorIndex = createRoute({ getParentRoute: () => rootRoute, path: '/editor', component: StartPage });
const editorRoute = createRoute({ getParentRoute: () => rootRoute, path: '/editor/$lang', component: EditorPage });
const snippetRoute = createRoute({ getParentRoute: () => rootRoute, path: '/s/$id', component: SnippetPage });

const router = createRouter({ routeTree: rootRoute.addChildren([editorIndex, editorRoute, snippetRoute]) });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
