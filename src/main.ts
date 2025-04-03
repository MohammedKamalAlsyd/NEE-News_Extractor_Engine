// src/main.ts
import { log, LogLevel } from 'crawlee';
import { extractNewsFromDomain } from './utils/CrawlNewsWebsites.js';
import { writeFile, rm, readdir } from 'fs/promises';
import path from 'path';

// --- Target Website Lists ---

// List 1: Global News Websites (Sample - shortened for brevity, add more as needed)
const globalNewsWebsites: string[] = [
    "apnews.com",          // Associated Press (AP) News
    "reuters.com",
    "bbc.com",             // BBC News (often redirects from bbc.co.uk/news)
    "cnn.com",
    "nytimes.com",         // The New York Times
    "wsj.com",             // The Wall Street Journal
    "washingtonpost.com",
    "theguardian.com",
    "ft.com",              // Financial Times
    "aljazeera.com",       // Al Jazeera English (usually)
    "bloomberg.com",       // Bloomberg News
    "npr.org",             // NPR
    "lemonde.fr",
    "spiegel.de",          // Der Spiegel
    "elpais.com",
    "economist.com",
    "france24.com",
    "dw.com",              // Deutsche Welle
    // "news.google.com",    // Aggregators are hard to scrape reliably for *articles*
    // "news.apple.com",     // Aggregator - skip
    "thetimes.co.uk",
    "telegraph.co.uk",
    "latimes.com",         // Los Angeles Times
    "usatoday.com",
    "cbc.ca/news",         // CBC News (use specific path if needed, but domain should work)
    "abc.net.au/news",     // ABC News Australia
    "nhk.or.jp/nhkworld/", // NHK World-Japan
    "rt.com",
    "xinhuanet.com",       // Xinhua News Agency
    // "people.cn",          // People's Daily Online (may require specific handling)
    "scmp.com",            // South China Morning Post
    "timesofindia.indiatimes.com",
    "thehindu.com",
    "asahi.com",
    "yomiuri.co.jp",
    "straitstimes.com",
    "politico.com",
    "axios.com",
    "huffpost.com",
    "vox.com",
    // "buzzfeednews.com",   // Scaled back - may not be reliable
    "vice.com/en/section/news", // Vice News
    "theintercept.com",
    "propublica.org",
    // Add more from your list...
];

// List 2: Middle East News Websites (Sample)
const middleEastNewsWebsites: string[] = [
    "aljazeera.net",       // Al Jazeera (Arabic) - distinct from .com
    "alarabiya.net",       // Al Arabiya (Arabic and English often on same TLD)
    "skynewsarabia.com",
    "aawsat.com",          // Asharq Al-Awsat
    "arabnews.com",
    "alriyadh.com",
    "okaz.com.sa",
    // "spa.gov.sa",         // Agencies might list press releases differently
    "thenationalnews.com", // The National (UAE)
    "gulfnews.com",
    "khaleejtimes.com",
    "albayan.ae",
    "emaratalyoum.com",
    // "wam.ae",             // Agency
    "ahram.org.eg",        // Al-Ahram
    "egyptindependent.com",
    "dailynewsegypt.com",
    // "madamasr.com",       // Independent, may face access issues
    "youm7.com",
    // "mena.org.eg",        // Agency
    "kuwaittimes.com",
    "arabtimesonline.com",
    "alqabas.com",
    "alraimedia.com",
    // "kuna.net.kw",        // Agency
    "thepeninsulaqatar.com",
    "gulf-times.com",
    "al-sharq.com",        // Al Sharq (Qatar)
    // "raya.com",           // Al Raya (Qatar) - Check domain/structure
    // "qna.org.qa",         // Agency
    "timesofoman.com",
    "omandaily.om",        // Oman Daily Observer (often redirects)
    "alwatan.com",         // Al Watan (Oman) - Check domain
    // "omannews.gov.om",    // Agency
    "gdnoline.com",        // Gulf Daily News (Bahrain)
    "alayam.com",          // Al Ayam (Bahrain)
    // Add more from your list...
     "ajnet.me", // From original example
     "masrawy.com", // From original example
];

// Interface for the extracted news article data (Simplified)
interface NewsArticle {
  link: string;
  image?: string | null; // Optional image URL
}



/**
 * Main application entry point.
 */
async function cleanUpStorage() {
  log.info('--- Cleaning up previous storage directories ---');
  const storageRoot = process.cwd();
  const defaultStoragePath = path.join(storageRoot, 'storage');
  let cleanedCount = 0;
  const errors = [];

  // Remove default 'storage' directory
  try {
      await rm(defaultStoragePath, { recursive: true, force: true });
      log.debug(`Removed default storage: ${defaultStoragePath}`);
      cleanedCount++;
  } catch (e: any) {
      if (e.code !== 'ENOENT') { // Ignore if it doesn't exist
          errors.push(`Could not remove default storage directory ${defaultStoragePath}: ${e.message}`);
      } else {
           log.debug(`Default storage directory not found, skipping: ${defaultStoragePath}`);
      }
  }

  // Remove domain-specific 'storage_*' directories
  try {
      const filesAndDirs = await readdir(storageRoot);
      const domainStorageDirs = filesAndDirs.filter(f => f.startsWith('storage_') && !f.includes('.')); // Basic check for directory pattern

      if (domainStorageDirs.length > 0) {
           log.debug(`Found domain storage dirs to remove: ${domainStorageDirs.join(', ')}`);
      }

      for (const dir of domainStorageDirs) {
          const dirPath = path.join(storageRoot, dir);
          try {
              // Double check it looks like one of our dirs before deleting
               if (dir.startsWith('storage_')) {
                  await rm(dirPath, { recursive: true, force: true });
                   log.debug(`Removed domain storage: ${dirPath}`);
                  cleanedCount++;
               }
          } catch (e: any) {
               errors.push(`Could not remove domain storage directory ${dirPath}: ${e.message}`);
          }
      }
  } catch (e: any) {
      errors.push(`Error reading directory for domain storage cleanup: ${e.message}`);
  }

  log.info(`--- Storage cleanup finished. Removed ${cleanedCount} directories.${errors.length > 0 ? ' Errors encountered:' : ''} ---`);
  if (errors.length > 0) {
      errors.forEach(err => log.error(err));
  }
}


/**
* Main application entry point.
*/
(async () => {
  log.setLevel(LogLevel.INFO); // Adjust log level as needed (DEBUG for more detail)

  // --- Clean up storage before starting ---
  await cleanUpStorage();
  // ---------------------------------------

  const allDomains = [...new Set([...globalNewsWebsites, ...middleEastNewsWebsites])];
  const results: Record<string, NewsArticle[]> = {};
  log.info(`---> Starting scraping process for ${allDomains.length} domains... <---`);

  const BATCH_SIZE = 5; // Keep concurrency manageable
  for (let i = 0; i < allDomains.length; i += BATCH_SIZE) {
      const batch = allDomains.slice(i, i + BATCH_SIZE);
      log.info(`---> Processing Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allDomains.length / BATCH_SIZE)}: ${batch.join(', ')} <---`);

      const batchPromises = batch.map(async (domain) => {
          try {
              // Each call now runs with its own isolated storage
              const articles = await extractNewsFromDomain(domain, 50, 10);
              results[domain] = articles;
               log.info(`---> Finished: ${domain}, Found: ${articles.length} articles <---`);
          } catch (error) {
              // Errors during the crawl within extractNewsFromDomain should be logged there.
              // This catch is for unexpected errors *outside* the crawler.run promise resolution.
              log.error(`!!! Unexpected error processing domain ${domain}: ${(error as Error).message}`, { stack: (error as Error).stack });
              results[domain] = []; // Store empty array on error
          }
      });

      // Wait for all promises in the current batch to settle (resolve or reject)
      await Promise.allSettled(batchPromises);

      // Optional delay between batches
      if (i + BATCH_SIZE < allDomains.length) {
          const delaySeconds = 5;
           log.info(`---> Batch finished, waiting ${delaySeconds} seconds... <---`);
          await new Promise(f => setTimeout(f, 1000));
      }
  }

  log.info("---> All scraping batches finished ---");

  // --- Output Results ---
  let totalArticles = 0;
  log.info("--- Aggregated Results ---");
  for (const domain in results) {
      log.info(`Domain: ${domain} - Found ${results[domain].length} articles`);
      totalArticles += results[domain].length;
  }
  log.info(`---> Total unique articles extracted across all domains: ${totalArticles} <---`);

  // --- Save results ---
  try {
      const outputPath = path.resolve(process.cwd(), 'news_results.json');
      await writeFile(outputPath, JSON.stringify(results, null, 2));
      log.info(`Results saved successfully to ${outputPath}`);
  } catch (writeError) {
      log.error(`Failed to write results to file: ${(writeError as Error).message}`);
  }

})();