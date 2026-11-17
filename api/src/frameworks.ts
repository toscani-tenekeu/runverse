// Frameworks offered next to the languages. Frontend frameworks are bundled and run in the
// visitor's browser, like HTML, CSS & JS. Backend frameworks run in Piston: every request in
// the preview runs the app once, through a small harness (see harness.ts).
import type { Language } from './languages.js';

type File = { name: string; content: string };
const files = (list: Record<string, string>): File[] => Object.entries(list).map(([name, content]) => ({ name, content }));

const page = (title: string, mount: string, script: string, extraHead = '') => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>${extraHead}
  </head>
  <body>
    <div id="${mount}"></div>
    <script type="module" src="/src/${script}"></script>
  </body>
</html>
`;

const BASE_CSS = `:root {
  font-family: system-ui, sans-serif;
  color: #15233a;
  background: #edf0f4;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
}

main {
  text-align: center;
}

button {
  padding: 10px 18px;
  border: 0;
  border-radius: 10px;
  background: #f2b630;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
`;

// ---- Frontend --------------------------------------------------------------------------------

const REACT = files({
  'index.html': page('React app', 'root', 'main.jsx'),
  'src/main.jsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  'src/App.jsx': `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>Hello, React!</h1>
      <p>Edit src/App.jsx and the preview updates.</p>
      <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
    </main>
  );
}
`,
  'src/index.css': BASE_CSS,
});

const VUE = files({
  'index.html': page('Vue app', 'app', 'main.js'),
  'src/main.js': `import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');
`,
  'src/App.vue': `<script setup>
import Counter from './components/Counter.vue';
</script>

<template>
  <main>
    <h1>Hello, Vue!</h1>
    <p>Edit src/App.vue and the preview updates.</p>
    <Counter :start="0" />
  </main>
</template>

<style scoped>
h1 {
  color: #42b883;
}
</style>
`,
  'src/components/Counter.vue': `<script setup>
import { ref } from 'vue';

const props = defineProps({ start: { type: Number, default: 0 } });
const count = ref(props.start);
</script>

<template>
  <button @click="count++">Clicked {{ count }} times</button>
</template>
`,
  'src/style.css': BASE_CSS,
});

const SVELTE = files({
  'index.html': page('Svelte app', 'app', 'main.js'),
  'src/main.js': `import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

mount(App, { target: document.getElementById('app') });
`,
  'src/App.svelte': `<script>
  let count = $state(0);
  let double = $derived(count * 2);
</script>

<main>
  <h1>Hello, Svelte!</h1>
  <p>Edit src/App.svelte and the preview updates.</p>
  <button onclick={() => count++}>Clicked {count} times</button>
  <p>Double: {double}</p>
</main>

<style>
  h1 {
    color: #ff3e00;
  }
</style>
`,
  'src/app.css': BASE_CSS,
});

const PREACT = files({
  'index.html': page('Preact app', 'app', 'main.jsx'),
  'src/main.jsx': `import { render } from 'preact';
import { useState } from 'preact/hooks';
import './style.css';

function App() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>Hello, Preact!</h1>
      <p>React's API in 4 KB. Edit src/main.jsx and the preview updates.</p>
      <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
    </main>
  );
}

render(<App />, document.getElementById('app'));
`,
  'src/style.css': BASE_CSS,
});

const ALPINE = files({
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Alpine.js page</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <main x-data="{ count: 0, open: false }">
      <h1>Hello, Alpine.js!</h1>
      <p>Behaviour written right in the HTML.</p>
      <button @click="count++">Clicked <span x-text="count"></span> times</button>
      <p><a href="#" @click.prevent="open = !open">Show more</a></p>
      <p x-show="open" x-transition>Alpine keeps this in sync with no build step.</p>
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
  'src/main.js': `import Alpine from 'alpinejs';

window.Alpine = Alpine;
Alpine.start();
`,
  'src/style.css': BASE_CSS,
});

const TAILWIND = files({
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tailwind CSS page</title>
    <style type="text/tailwindcss">
      @theme {
        --color-brand: #f2b630;
      }
    </style>
  </head>
  <body class="grid min-h-screen place-items-center bg-slate-100 text-slate-800">
    <main class="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
      <h1 class="text-3xl font-bold">Hello, Tailwind!</h1>
      <p class="mt-2 text-slate-500">Style with utility classes. Edit index.html and the preview updates.</p>
      <button class="mt-6 rounded-xl bg-brand px-5 py-2.5 font-semibold hover:brightness-95">A button</button>
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`,
  'src/main.js': `// Tailwind CSS builds the styles for the classes it finds in the page.
import '@tailwindcss/browser';
`,
});

// ---- Backend ---------------------------------------------------------------------------------

const SITE_CSS = `body {
  font-family: system-ui, sans-serif;
  max-width: 640px;
  margin: 40px auto;
  padding: 0 16px;
  color: #15233a;
  background: #edf0f4;
}

nav a {
  margin-right: 12px;
}

form {
  display: flex;
  gap: 8px;
}

input,
button {
  padding: 8px 12px;
  border-radius: 8px;
  font: inherit;
}

button {
  border: 0;
  background: #f2b630;
  font-weight: 600;
  cursor: pointer;
}
`;

const FLASK = files({
  'app.py': `from flask import Flask, render_template, request

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/hello", methods=["GET", "POST"])
def hello():
    name = request.values.get("name", "").strip() or "stranger"
    return render_template("hello.html", name=name)


@app.route("/api/time")
def time():
    from datetime import datetime, timezone

    return {"now": datetime.now(timezone.utc).isoformat()}
`,
  'templates/base.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{% block title %}Flask app{% endblock %}</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
</head>
<body>
  <nav><a href="{{ url_for('home') }}">Home</a> <a href="{{ url_for('time') }}">API</a></nav>
  {% block content %}{% endblock %}
</body>
</html>
`,
  'templates/index.html': `{% extends "base.html" %}
{% block content %}
<h1>Hello, Flask!</h1>
<p>Each page you open here runs app.py in the sandbox.</p>
<form method="post" action="{{ url_for('hello') }}">
  <input name="name" placeholder="Your name">
  <button>Say hello</button>
</form>
{% endblock %}
`,
  'templates/hello.html': `{% extends "base.html" %}
{% block content %}
<h1>Hello, {{ name }}!</h1>
<p><a href="{{ url_for('home') }}">Back</a></p>
{% endblock %}
`,
  'static/style.css': SITE_CSS,
});

const DJANGO = files({
  'manage.py': `#!/usr/bin/env python
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysite.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
`,
  'mysite/__init__.py': '',
  'mysite/settings.py': `from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = "runverse-sandbox-only"
DEBUG = True
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "pages",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
]

ROOT_URLCONF = "mysite.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    }
]

# Every request starts from your files, so a database lives only for that request.
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}

STATIC_URL = "static/"
USE_TZ = True
`,
  'mysite/urls.py': `from django.urls import include, path

urlpatterns = [
    path("", include("pages.urls")),
]
`,
  'pages/__init__.py': '',
  'pages/urls.py': `from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("hello/", views.hello, name="hello"),
    path("api/time/", views.time, name="time"),
]
`,
  'pages/views.py': `from datetime import datetime, timezone

from django.http import JsonResponse
from django.shortcuts import render


def home(request):
    return render(request, "pages/home.html")


def hello(request):
    name = request.POST.get("name", "").strip() or "stranger"
    return render(request, "pages/hello.html", {"name": name})


def time(request):
    return JsonResponse({"now": datetime.now(timezone.utc).isoformat()})
`,
  'pages/templates/pages/base.html': `{% load static %}<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{% block title %}Django site{% endblock %}</title>
  <link rel="stylesheet" href="{% static 'pages/style.css' %}">
</head>
<body>
  <nav><a href="{% url 'home' %}">Home</a> <a href="{% url 'time' %}">API</a></nav>
  {% block content %}{% endblock %}
</body>
</html>
`,
  'pages/templates/pages/home.html': `{% extends "pages/base.html" %}
{% block content %}
<h1>Hello, Django!</h1>
<p>Each page you open here runs your project in the sandbox.</p>
<form method="post" action="{% url 'hello' %}">
  {% csrf_token %}
  <input name="name" placeholder="Your name">
  <button>Say hello</button>
</form>
{% endblock %}
`,
  'pages/templates/pages/hello.html': `{% extends "pages/base.html" %}
{% block content %}
<h1>Hello, {{ name }}!</h1>
<p><a href="{% url 'home' %}">Back</a></p>
{% endblock %}
`,
  'pages/static/pages/style.css': SITE_CSS,
});

const FASTAPI = files({
  'main.py': `from datetime import datetime, timezone

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

app = FastAPI(title="My API")
templates = Jinja2Templates(directory="templates")

items = [{"id": 1, "name": "Keyboard"}, {"id": 2, "name": "Mouse"}]


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request, "index.html", {"items": items})


@app.post("/hello", response_class=HTMLResponse)
def hello(request: Request, name: str = Form("stranger")):
    return templates.TemplateResponse(request, "hello.html", {"name": name})


@app.get("/api/items")
def list_items():
    return items


@app.get("/api/time")
def time():
    return {"now": datetime.now(timezone.utc).isoformat()}
`,
  'templates/index.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>FastAPI app</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <nav><a href="/">Home</a> <a href="/api/items">API</a> <a href="/docs">Docs</a></nav>
  <h1>Hello, FastAPI!</h1>
  <ul>
    {% for item in items %}<li>{{ item.name }}</li>{% endfor %}
  </ul>
  <form method="post" action="/hello">
    <input name="name" placeholder="Your name">
    <button>Say hello</button>
  </form>
  <p><button id="time" type="button">Ask the API for the time</button> <span id="now"></span></p>
  <script>
    document.getElementById('time').addEventListener('click', async () => {
      const response = await fetch('/api/time');
      const data = await response.json();
      document.getElementById('now').textContent = data.now;
    });
  </script>
</body>
</html>
`,
  'templates/hello.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hello</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <h1>Hello, {{ name }}!</h1>
  <p><a href="/">Back</a></p>
</body>
</html>
`,
  'static/style.css': SITE_CSS,
});

const EXPRESS = files({
  'server.js': `const express = require('express');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.render('index', { title: 'Hello, Express!' });
});

app.post('/hello', (req, res) => {
  res.render('hello', { name: req.body.name || 'stranger' });
});

app.get('/api/time', (req, res) => {
  res.json({ now: new Date().toISOString() });
});

app.listen(3000, () => console.log('Listening on port 3000'));
`,
  'views/index.ejs': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title><%= title %></title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1><%= title %></h1>
  <p>Each page you open here runs server.js in the sandbox.</p>
  <form method="post" action="/hello">
    <input name="name" placeholder="Your name">
    <button>Say hello</button>
  </form>
  <p><button id="time" type="button">Ask the API for the time</button> <span id="now"></span></p>
  <script src="/app.js"></script>
</body>
</html>
`,
  'views/hello.ejs': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Hello</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>Hello, <%= name %>!</h1>
  <p><a href="/">Back</a></p>
</body>
</html>
`,
  'public/style.css': SITE_CSS,
  'public/app.js': `document.getElementById('time').addEventListener('click', async () => {
  const response = await fetch('/api/time');
  const data = await response.json();
  document.getElementById('now').textContent = data.now;
});
`,
});

const LARAVEL = files({
  'routes/web.php': `<?php

use App\\Http\\Controllers\\PageController;
use Illuminate\\Support\\Facades\\Route;

Route::get('/', [PageController::class, 'home'])->name('home');
Route::post('/hello', [PageController::class, 'hello'])->name('hello');

Route::get('/api/time', fn () => ['now' => now()->toIso8601String()])->name('time');
`,
  'app/Http/Controllers/PageController.php': `<?php

namespace App\\Http\\Controllers;

use Illuminate\\Http\\Request;

class PageController extends Controller
{
    public function home()
    {
        return view('home');
    }

    public function hello(Request $request)
    {
        $name = trim($request->input('name', '')) ?: 'stranger';

        return view('hello', ['name' => $name]);
    }
}
`,
  'resources/views/layout.blade.php': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>@yield('title', 'Laravel app')</title>
  <link rel="stylesheet" href="{{ asset('css/app.css') }}">
</head>
<body>
  <nav><a href="{{ route('home') }}">Home</a> <a href="{{ route('time') }}">API</a></nav>
  @yield('content')
</body>
</html>
`,
  'resources/views/home.blade.php': `@extends('layout')

@section('content')
<h1>Hello, Laravel!</h1>
<p>Each page you open here runs your app in the sandbox. The rest of the Laravel
skeleton (config, bootstrap, vendor) is provided; add a file to override it.</p>
<form method="post" action="{{ route('hello') }}">
  @csrf
  <input name="name" placeholder="Your name">
  <button>Say hello</button>
</form>
@endsection
`,
  'resources/views/hello.blade.php': `@extends('layout')

@section('content')
<h1>Hello, {{ $name }}!</h1>
<p><a href="{{ route('home') }}">Back</a></p>
@endsection
`,
  'public/css/app.css': SITE_CSS,
});

type Framework = Omit<Language, 'group'>;

const FRAMEWORKS: Framework[] = [
  // Frontend: bundled in the browser, no install needed.
  { id: 'react', name: 'React', pkg: '', runtime: '', kind: 'browser', base: 'JavaScript', file: 'src/App.jsx', mode: 'javascript', template: '', files: REACT },
  { id: 'vue', name: 'Vue', pkg: '', runtime: '', kind: 'browser', base: 'JavaScript', file: 'src/App.vue', mode: 'vue', template: '', files: VUE },
  { id: 'svelte', name: 'Svelte', pkg: '', runtime: '', kind: 'browser', base: 'JavaScript', file: 'src/App.svelte', mode: 'html', template: '', files: SVELTE },
  { id: 'preact', name: 'Preact', pkg: '', runtime: '', kind: 'browser', base: 'JavaScript', file: 'src/main.jsx', mode: 'javascript', template: '', files: PREACT },
  { id: 'alpine', name: 'Alpine.js', pkg: '', runtime: '', kind: 'browser', base: 'JavaScript', file: 'index.html', mode: 'html', template: '', files: ALPINE },
  { id: 'tailwind', name: 'Tailwind CSS', pkg: '', runtime: '', kind: 'browser', base: 'CSS', file: 'index.html', mode: 'html', template: '', files: TAILWIND },
  // Backend: a Piston package each, built by piston-packages/<id>.sh.
  { id: 'laravel', name: 'Laravel', pkg: 'custom:laravel', runtime: 'laravel', kind: 'server', base: 'PHP', file: 'routes/web.php', mode: 'php', template: '', files: LARAVEL },
  { id: 'django', name: 'Django', pkg: 'custom:django', runtime: 'django', kind: 'server', base: 'Python', file: 'pages/views.py', mode: 'python', template: '', files: DJANGO },
  { id: 'flask', name: 'Flask', pkg: 'custom:flask', runtime: 'flask', kind: 'server', base: 'Python', file: 'app.py', mode: 'python', template: '', files: FLASK },
  { id: 'fastapi', name: 'FastAPI', pkg: 'custom:fastapi', runtime: 'fastapi', kind: 'server', base: 'Python', file: 'main.py', mode: 'python', template: '', files: FASTAPI },
  { id: 'express', name: 'Express', pkg: 'custom:express', runtime: 'express', kind: 'server', base: 'Node.js', file: 'server.js', mode: 'javascript', template: '', files: EXPRESS },
];

export const frameworks = (): Language[] =>
  FRAMEWORKS.map(f => ({ ...f, group: 'framework', template: f.files!.find(x => x.name === f.file)!.content }));
