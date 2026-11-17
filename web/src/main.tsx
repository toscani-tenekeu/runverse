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
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import './index.css';

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

function Brand() {
  return (
    <a className="flex items-center gap-2 text-[15px] font-semibold tracking-tight" href="/">
      <Logo /><span>runverse</span>
    </a>
  );
}

function LanguageLinks({ languages }: { languages: Language[] }) {
  return (
    <div className="grid gap-3">
      {(['language', 'framework'] as const).map(group => (
        <ul key={group} className="flex flex-wrap gap-1.5" aria-label={group === 'language' ? 'Languages' : 'Frameworks'}>
          {languages.filter(l => l.installed && l.group === group).map(l => (
            <li key={l.id}>
              <Link to="/editor/$lang" params={{ lang: l.id }} className="hover:bg-accent inline-flex h-7 items-center rounded-md border px-2.5 text-[13px]">{l.name}</Link>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function Message({ title, text, languages }: { title: string; text?: string; languages?: Language[] }) {
  return (
    <div className="bg-chrome h-svh overflow-y-auto">
      <div className="mx-auto grid max-w-2xl gap-5 px-6 py-16">
        <Brand />
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {text && <p className="text-muted-foreground">{text}</p>}
        {languages && (
          <>
            <p className="text-muted-foreground">Pick a language or a framework to start coding:</p>
            <LanguageLinks languages={languages} />
          </>
        )}
      </div>
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
    <div className="bg-chrome h-svh overflow-y-auto">
      <div className="mx-auto grid max-w-4xl gap-8 px-6 py-12">
        <Brand />
        <h1 className="text-2xl font-semibold tracking-tight">What do you want to build?</h1>
        {groups.map(group => {
          const items = data.filter(l => l.group === group.id);
          return (
            <section key={group.id} className="grid gap-3" aria-labelledby={`start-${group.id}`}>
              <h2 id={`start-${group.id}`} className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold tracking-wider uppercase">{group.title}</span>
                <span className="text-muted-foreground text-xs">{group.text}</span>
              </h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
                {items.map(l => (
                  <li key={l.id}>
                    {l.installed ? (
                      <Link
                        to="/editor/$lang" params={{ lang: l.id }}
                        className="bg-background hover:border-primary/60 hover:bg-accent/40 grid gap-0.5 rounded-md border px-3 py-2.5 transition-colors"
                      >
                        <strong className="text-[13px] font-medium">{l.name}</strong>
                        <span className="text-muted-foreground truncate text-xs">{[l.base, l.version].filter(Boolean).join(' ') || (l.kind ? KIND_LABEL[l.kind] : 'In your browser')}</span>
                      </Link>
                    ) : (
                      <span className={cn('grid gap-0.5 rounded-md border border-dashed px-3 py-2.5 opacity-60')} title="Not installed on this server">
                        <strong className="text-[13px] font-medium">{l.name}</strong>
                        <span className="text-muted-foreground text-xs">Not installed</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
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
      <TooltipProvider delayDuration={400}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" toastOptions={{ className: 'text-[13px]' }} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
