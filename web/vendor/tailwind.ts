// Importing it is enough: Tailwind CSS watches the page and writes the styles its classes need.
import '@tailwindcss/browser';
import { register } from './register';

register({ '@tailwindcss/browser': {} });
