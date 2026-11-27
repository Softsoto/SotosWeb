// Tipos del SDK de Sotos (versión 1) · © 2026 Sebastian Sotomontes · MIT
// Para el autocompletado: /// <reference path="sotos-sdk.d.ts" /> al inicio de tu app.js

declare namespace Sotos {
  type Permission = "files.read" | "files.write" | "storage" | "notify" | "user";
  interface FileRef { id: string; name: string; size: number; type: string; ext?: string; mtime?: number; /** vino de «Desde este equipo» */ local?: true }
  interface Theme { dark: boolean; accent: string }
  interface Info { app: { id: string; name: string; version: string }; lang: string; theme: Theme; user?: { name: string } }
  interface PickOptions { title?: string; /** tipos de Sotos: "img", "audio", "video", "pdf", "docx", "xlsx", "txt", "code"… */ types?: string[]; /** extensiones sin punto */ exts?: string[]; multiple?: boolean }
  interface SaveOptions { name: string; data: Blob | ArrayBuffer | ArrayBufferView | string | object; type?: string; title?: string }
  interface Events { theme: Theme; open: FileRef }
  interface SDK {
    readonly version: 1;
    readonly ready: Promise<Info>;
    user(): Promise<{ name: string; lang: string; avatar: string | null }>;
    files: {
      pick(options?: PickOptions): Promise<FileRef[]>;
      read(file: FileRef | string): Promise<Blob>;
      save(options: SaveOptions): Promise<FileRef | null>;
      write(file: FileRef | string, data: SaveOptions["data"]): Promise<FileRef>;
      /** archivos que la persona ya le dio a la app antes (en este navegador) y que siguen existiendo */
      recent(): Promise<FileRef[]>;
      forget(file: FileRef | string): Promise<boolean>;
      pickFolder(options?: { title?: string }): Promise<FileRef | null>;
      saveIn(folder: FileRef | string, options: { name: string; data: SaveOptions["data"]; type?: string }): Promise<FileRef>;
    };
    notify(n: { title: string; body?: string } | string): Promise<true>;
    storage: { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<true>; remove(key: string): Promise<true>; keys(): Promise<string[]> };
    window: { setTitle(title: string): Promise<true>; close(): Promise<true> };
    on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): () => void;
  }
}
declare const sotos: Sotos.SDK;
