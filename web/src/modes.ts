import type { Extension } from '@codemirror/state';
import { StreamLanguage, type StreamParser } from '@codemirror/language';

const legacy = (p: Promise<StreamParser<unknown>>) => p.then(parser => StreamLanguage.define(parser));

// Syntax highlighting per language, loaded on demand so the first page stays small.
const loaders: Record<string, () => Promise<Extension>> = {
  cpp: () => import('@codemirror/lang-cpp').then(m => m.cpp()),
  java: () => import('@codemirror/lang-java').then(m => m.java()),
  python: () => import('@codemirror/lang-python').then(m => m.python()),
  javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  typescript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
  go: () => import('@codemirror/lang-go').then(m => m.go()),
  rust: () => import('@codemirror/lang-rust').then(m => m.rust()),
  php: () => import('@codemirror/lang-php').then(m => m.php()),
  html: () => import('@codemirror/lang-html').then(m => m.html()),
  css: () => import('@codemirror/lang-css').then(m => m.css()),
  sql: () => import('@codemirror/lang-sql').then(m => m.sql()),
  csharp: () => legacy(import('@codemirror/legacy-modes/mode/clike').then(m => m.csharp)),
  kotlin: () => legacy(import('@codemirror/legacy-modes/mode/clike').then(m => m.kotlin)),
  scala: () => legacy(import('@codemirror/legacy-modes/mode/clike').then(m => m.scala)),
  dart: () => legacy(import('@codemirror/legacy-modes/mode/clike').then(m => m.dart)),
  zig: () => legacy(import('@codemirror/legacy-modes/mode/clike').then(m => m.c)),
  swift: () => legacy(import('@codemirror/legacy-modes/mode/swift').then(m => m.swift)),
  ruby: () => legacy(import('@codemirror/legacy-modes/mode/ruby').then(m => m.ruby)),
  elixir: () => legacy(import('@codemirror/legacy-modes/mode/ruby').then(m => m.ruby)),
  lua: () => legacy(import('@codemirror/legacy-modes/mode/lua').then(m => m.lua)),
  shell: () => legacy(import('@codemirror/legacy-modes/mode/shell').then(m => m.shell)),
  r: () => legacy(import('@codemirror/legacy-modes/mode/r').then(m => m.r)),
  haskell: () => legacy(import('@codemirror/legacy-modes/mode/haskell').then(m => m.haskell)),
  perl: () => legacy(import('@codemirror/legacy-modes/mode/perl').then(m => m.perl)),
  clojure: () => legacy(import('@codemirror/legacy-modes/mode/clojure').then(m => m.clojure)),
};

export const loadMode = (mode: string): Promise<Extension> => loaders[mode]?.() ?? Promise.resolve([]);
