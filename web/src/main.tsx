import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  createRootRoute, createRoute, createRouter, redirect, Link, Outlet, RouterProvider,
} from '@tanstack/react-router';
import { getSnippet, languagesQuery, type Code, type Language } from './api';
import { Workspace, Logo, draftKey } from './Workspace';
import { load } from './storage';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

const starter = (l: Language): Code => ({ language: l.id, files: [{ name: l.file, content: l.template }], stdin: '' });

function EditorPage() {
  const { lang } = editorRoute.useParams();
  const { data, isPending, error } = useQuery(languagesQuery);
  if (isPending) return <Message title="Loading…" />;
  if (error) return <Message title="Runverse can't reach its server." text={error.message} />;
  const l = data.find(x => x.id === lang);
  if (!l) return <Message title={`“${lang}” isn't a language Runverse knows.`} languages={data} />;
  if (!l.installed) return <Message title={`${l.name} isn't installed on this server yet.`} languages={data} />;
  const draft = load<Code>(draftKey(l.id));
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
  return <Workspace key={id} lang={l} initial={snippet.data} persist={false} />;
}

function Message({ title, text, languages }: { title: string; text?: string; languages?: Language[] }) {
  return (
    <div className="message">
      <a className="brand" href="/"><Logo /><span>runverse</span></a>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
      {languages && (
        <>
          <p>Pick a language to start coding:</p>
          <ul className="lang-list">
            {languages.filter(l => l.installed).map(l => (
              <li key={l.id}><Link to="/editor/$lang" params={{ lang: l.id }}>{l.name}</Link></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => <Message title="This page doesn't exist." />,
});
const editorIndex = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor',
  beforeLoad: () => { throw redirect({ to: '/editor/$lang', params: { lang: 'python' } }); },
});
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
