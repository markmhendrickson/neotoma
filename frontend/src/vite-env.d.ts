/// <reference types="vite/client" />

declare module 'tabulator-tables' {
  export class Tabulator {
    constructor(element: HTMLElement, options: any);
    destroy(): void;
    setData(data: any[]): void;
    on(event: string, callback: (...args: any[]) => void): void;
    getColumns(): any[];
  }
}

