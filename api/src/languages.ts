// One entry per language shown on the landing page.
// `pkg` is the Piston package to install, `runtime` the Piston language used to execute.
export interface Language {
  id: string;
  name: string;
  pkg: string;
  runtime: string;
  file: string;
  mode: string; // syntax highlighting mode used by the editor
  template: string;
}

export const LANGUAGES: Language[] = [
  {
    id: 'c', name: 'C', pkg: 'gcc', runtime: 'c', file: 'main.c', mode: 'cpp',
    template: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, Runverse!\\n");\n    return 0;\n}\n',
  },
  {
    id: 'cpp', name: 'C++', pkg: 'gcc', runtime: 'c++', file: 'main.cpp', mode: 'cpp',
    template: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, Runverse!" << std::endl;\n    return 0;\n}\n',
  },
  {
    id: 'csharp', name: 'C#', pkg: 'mono', runtime: 'csharp', file: 'Program.cs', mode: 'csharp',
    template: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, Runverse!");\n    }\n}\n',
  },
  {
    id: 'java', name: 'Java', pkg: 'java', runtime: 'java', file: 'Main.java', mode: 'java',
    template: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Runverse!");\n    }\n}\n',
  },
  {
    id: 'python', name: 'Python', pkg: 'python', runtime: 'python', file: 'main.py', mode: 'python',
    template: 'import sys\n\n# Type a name in the input box, or leave it empty.\nname = sys.stdin.readline().strip() or "Runverse"\nprint(f"Hello, {name}!")\n',
  },
  {
    id: 'javascript', name: 'JavaScript', pkg: 'node', runtime: 'javascript', file: 'main.js', mode: 'javascript',
    template: 'console.log("Hello, Runverse!");\n',
  },
  {
    id: 'typescript', name: 'TypeScript', pkg: 'typescript', runtime: 'typescript', file: 'main.ts', mode: 'typescript',
    template: 'const greet = (name: string): string => `Hello, ${name}!`;\n\nconsole.log(greet("Runverse"));\n',
  },
  {
    id: 'go', name: 'Go', pkg: 'go', runtime: 'go', file: 'main.go', mode: 'go',
    template: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, Runverse!")\n}\n',
  },
  {
    id: 'rust', name: 'Rust', pkg: 'rust', runtime: 'rust', file: 'main.rs', mode: 'rust',
    template: 'fn main() {\n    println!("Hello, Runverse!");\n}\n',
  },
  {
    id: 'php', name: 'PHP', pkg: 'php', runtime: 'php', file: 'main.php', mode: 'php',
    template: '<?php\n\necho "Hello, Runverse!\\n";\n',
  },
  {
    id: 'kotlin', name: 'Kotlin', pkg: 'kotlin', runtime: 'kotlin', file: 'main.kt', mode: 'kotlin',
    template: 'fun main() {\n    println("Hello, Runverse!")\n}\n',
  },
  {
    id: 'swift', name: 'Swift', pkg: 'swift', runtime: 'swift', file: 'main.swift', mode: 'swift',
    template: 'print("Hello, Runverse!")\n',
  },
  {
    id: 'ruby', name: 'Ruby', pkg: 'ruby', runtime: 'ruby', file: 'main.rb', mode: 'ruby',
    template: 'puts "Hello, Runverse!"\n',
  },
  {
    id: 'dart', name: 'Dart', pkg: 'dart', runtime: 'dart', file: 'main.dart', mode: 'dart',
    template: 'void main() {\n  print("Hello, Runverse!");\n}\n',
  },
  {
    id: 'lua', name: 'Lua', pkg: 'lua', runtime: 'lua', file: 'main.lua', mode: 'lua',
    template: 'print("Hello, Runverse!")\n',
  },
  {
    id: 'bash', name: 'Bash', pkg: 'bash', runtime: 'bash', file: 'main.sh', mode: 'shell',
    template: '#!/bin/bash\n\necho "Hello, Runverse!"\n',
  },
  {
    id: 'r', name: 'R', pkg: 'rscript', runtime: 'rscript', file: 'main.r', mode: 'r',
    template: 'cat("Hello, Runverse!\\n")\n',
  },
  {
    id: 'haskell', name: 'Haskell', pkg: 'haskell', runtime: 'haskell', file: 'main.hs', mode: 'haskell',
    template: 'main :: IO ()\nmain = putStrLn "Hello, Runverse!"\n',
  },
  {
    id: 'scala', name: 'Scala', pkg: 'scala', runtime: 'scala', file: 'main.scala', mode: 'scala',
    template: '@main def hello(): Unit =\n  println("Hello, Runverse!")\n',
  },
  {
    id: 'elixir', name: 'Elixir', pkg: 'elixir', runtime: 'elixir', file: 'main.exs', mode: 'elixir',
    template: 'IO.puts("Hello, Runverse!")\n',
  },
  {
    id: 'perl', name: 'Perl', pkg: 'perl', runtime: 'perl', file: 'main.pl', mode: 'perl',
    template: 'use strict;\nuse warnings;\n\nprint "Hello, Runverse!\\n";\n',
  },
  {
    id: 'clojure', name: 'Clojure', pkg: 'clojure', runtime: 'clojure', file: 'main.clj', mode: 'clojure',
    template: '(println "Hello, Runverse!")\n',
  },
  {
    id: 'zig', name: 'Zig', pkg: 'zig', runtime: 'zig', file: 'main.zig', mode: 'zig',
    template: 'const std = @import("std");\n\npub fn main() !void {\n    try std.io.getStdOut().writer().print("Hello, Runverse!\\n", .{});\n}\n',
  },
  {
    id: 'sqlite', name: 'SQLite', pkg: 'sqlite3', runtime: 'sqlite3', file: 'main.sql', mode: 'sql',
    template: "CREATE TABLE greetings (text TEXT);\nINSERT INTO greetings VALUES ('Hello, Runverse!');\nSELECT text FROM greetings;\n",
  },
];

export const byId = new Map(LANGUAGES.map(l => [l.id, l]));
