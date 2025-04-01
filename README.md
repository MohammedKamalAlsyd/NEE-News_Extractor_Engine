# NEE - News Extractor Engine

NEE (News Extractor Engine) is a production-ready TypeScript boilerplate designed for extracting news data from multiple sources, including Ahrefs, SimilarWeb, and Google search. Leveraging Crawlee's PlaywrightCrawler, NEE provides a scalable and type-safe foundation for aggregating news data from any country, making it an ideal starting point for robust web scraping applications.


## Changelog

### V0.1 - Initial Release

- Multi-source news extraction from Ahrefs, SimilarWeb, and Google.
- Integrated **PlaywrightCrawler** for seamless headless browsing.
- Fully implemented in **TypeScript** for type safety and maintainability.
- Modular routing system with dedicated handlers for different sources.
- Configurable settings via `config.json` and `config.ts`.
- Professional logging system (`logger.ts`) with daily log files.
- Localization support for fetching and processing country data.
- Polygon data integration for mapping (compatible with Google Maps & Leaflet).
- Robust error handling and logging across all modules.