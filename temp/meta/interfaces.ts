// src/interfaces.ts
export interface NewsArticle {
    link: string;
    image?: string | null;
    domain: string;
  }
  
  export interface RawNewsRecord {
    rank: number;
    domain: string;
    faviconUrl: string;
    additionalInfo: { searchUrl: string };
    source: 'GOOGLE' | 'BING' | 'DUCKDUCKGO' | 'SIMILARWEB' | 'AHREFS';
  }