// The modules compiled Svelte components import, plus Svelte's public ones.
import * as Svelte from 'svelte';
import * as Animate from 'svelte/animate';
import * as Easing from 'svelte/easing';
import * as Events from 'svelte/events';
import * as Client from 'svelte/internal/client';
import * as DiscloseVersion from 'svelte/internal/disclose-version';
import * as LegacyFlag from 'svelte/internal/flags/legacy';
import * as Motion from 'svelte/motion';
import * as Reactivity from 'svelte/reactivity';
import * as Store from 'svelte/store';
import * as Transition from 'svelte/transition';
import { register } from './register';

register({
  svelte: Svelte,
  'svelte/animate': Animate,
  'svelte/easing': Easing,
  'svelte/events': Events,
  'svelte/internal/client': Client,
  'svelte/internal/disclose-version': DiscloseVersion,
  'svelte/internal/flags/legacy': LegacyFlag,
  'svelte/motion': Motion,
  'svelte/reactivity': Reactivity,
  'svelte/store': Store,
  'svelte/transition': Transition,
});
