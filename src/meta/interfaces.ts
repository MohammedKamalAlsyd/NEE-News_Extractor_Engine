// src/interfaces.ts
export interface NewsArticle {
    link: string;
    image?: string | null;
    domain: string;
  }
  
  export interface ProcessedCountry {
    name: string;
    // Add other properties as needed based on your data structure
  }
  
  export interface RawNewsRecord {
    rank: number;
    domain: string;
    faviconUrl: string;
    additionalInfo: { searchUrl: string };
    source: 'GOOGLE' | 'BING' | 'DUCKDUCKGO' | 'BRAVE' | 'ECOSIA' | 'SIMILARWEB' | 'AHREFS';
  }