import { useEffect, useRef } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { loadMode } from './modes';

// Colours come from CSS variables, so the editor follows the light/dark theme without rebuilding.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syn-type)' },
  { tag: [t.definition(t.variableName), t.propertyName], color: 'var(--ed-ink)' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--syn-meta)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--ed-bg)', color: 'var(--ed-ink)' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.65' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '14px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'var(--ed-bg)', color: 'var(--ed-muted)', border: 'none', paddingLeft: '8px' },
  '.cm-activeLine': { backgroundColor: 'var(--ed-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ed-ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(242,182,48,.25) !important' },
  '&.cm-focused': { outline: 'none' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(242,182,48,.2)', outline: '1px solid rgba(242,182,48,.5)' },
  '.cm-placeholder': { color: 'var(--ed-muted)' },
});

interface Props {
  fileKey: string; // a stable id per file, so each file keeps its own undo history
  value: string;
  mode: string;
  onChange: (value: string) => void;
  onRun: () => void;
  fontSize: number;
  wrap: boolean;
  onCursor?: (pos: { line: number; col: number }) => void;
}

const sizeTheme = (px: number) => EditorView.theme({ '&': { fontSize: `${px}px` } });

export function CodeEditor({ fileKey, value, mode, onChange, onRun, fontSize, wrap, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const language = useRef(new Compartment());
  const modeExt = useRef<Extension>([]);
  const sizeC = useRef(new Compartment());
  const wrapC = useRef(new Compartment());
  const handlers = useRef({ onChange, onRun, onCursor });
  handlers.current = { onChange, onRun, onCursor };
  const prefs = useRef({ fontSize, wrap });
  prefs.current = { fontSize, wrap };
  const prefExtensions = () => [sizeC.current.of(sizeTheme(prefs.current.fontSize)), wrapC.current.of(prefs.current.wrap ? EditorView.lineWrapping : [])];
  const reconfigurePrefs = (v: EditorView) => v.dispatch({ effects: [sizeC.current.reconfigure(sizeTheme(prefs.current.fontSize)), wrapC.current.reconfigure(prefs.current.wrap ? EditorView.lineWrapping : [])] });
  const reportCursor = (state: EditorState) => {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    handlers.current.onCursor?.({ line: line.number, col: head - line.from + 1 });
  };
  // Put the caret in the code right away on a computer; on a phone that would pop the keyboard up.
  const focusEditor = () => { if (matchMedia('(pointer: fine)').matches) view.current?.focus(); };

  const makeState = (doc: string) => EditorState.create({
    doc,
    extensions: [
      lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
      history(), bracketMatching(), indentOnInput(),
      keymap.of([
        { key: 'Mod-Enter', preventDefault: true, run: () => (handlers.current.onRun(), true) },
        indentWithTab, ...defaultKeymap, ...historyKeymap,
      ]),
      syntaxHighlighting(highlight), theme, ...prefExtensions(),
      language.current.of(modeExt.current),
      EditorView.updateListener.of(u => {
        if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
        if (u.selectionSet || u.docChanged) reportCursor(u.state);
      }),
    ],
  });

  useEffect(() => {
    view.current = new EditorView({ parent: host.current!, state: makeState(value) });
    states.current.set(fileKey, view.current.state);
    reportCursor(view.current.state);
    focusEditor();
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch files: stash the current state, restore (or create) the next one.
  const shownKey = useRef(fileKey);
  useEffect(() => {
    const v = view.current!;
    if (shownKey.current !== fileKey) {
      states.current.set(shownKey.current, v.state);
      shownKey.current = fileKey;
      const next = states.current.get(fileKey);
      v.setState(next && next.doc.toString() === value ? next : makeState(value));
      v.dispatch({ effects: language.current.reconfigure(modeExt.current) });
      reconfigurePrefs(v);
      reportCursor(v.state);
      focusEditor();
    } else if (v.state.doc.toString() !== value) {
      // Content replaced from outside (reset, shared snippet loaded).
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey, value]);

  useEffect(() => { if (view.current) reconfigurePrefs(view.current); }, [fontSize, wrap]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    loadMode(mode).then(ext => {
      if (!alive) return;
      modeExt.current = ext;
      view.current?.dispatch({ effects: language.current.reconfigure(ext) });
    });
    return () => { alive = false; };
  }, [mode]);

  return <div className="code" ref={host} />;
}
