import * as Preact from 'preact';
import * as Hooks from 'preact/hooks';
import * as JSXRuntime from 'preact/jsx-runtime';
import { register } from './register';

register({
  preact: Preact,
  'preact/hooks': Hooks,
  'preact/jsx-runtime': JSXRuntime,
  'preact/jsx-dev-runtime': JSXRuntime,
});
