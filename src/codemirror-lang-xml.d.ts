declare module '@codemirror/lang-xml' {
  import type { LanguageSupport } from '@codemirror/language';

  export interface XMLConfig {
    elements?: Record<string, string[]>;
    top?: string;
  }

  export function xml(config?: XMLConfig): LanguageSupport;
}
