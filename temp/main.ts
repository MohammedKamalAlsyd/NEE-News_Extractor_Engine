// src/main.ts
import { log, LogLevel } from 'crawlee';
import { extractNewsFromDomain } from './utils/CrawlNewsWebsites.js'; // Import from .ts
import { writeFile, rm, readdir } from 'fs/promises';
import * as path from 'path'; // Use * as path for consistency
import { ARTICLES_LINKS_DIR } from './meta/constants.js';

const globalNewsWebsites: string[] = [
  "apnews.com", "reuters.com", "bbc.com", "cnn.com", "nytimes.com", "wsj.com", "washingtonpost.com",
  "theguardian.com", "ft.com", "aljazeera.com", "bloomberg.com", "npr.org", "lemonde.fr", "spiegel.de",
  "elpais.com", "economist.com", "france24.com", "dw.com", "thetimes.co.uk", "telegraph.co.uk",
  "latimes.com", "usatoday.com", "cbc.ca/news", "abc.net.au/news", "nhk.or.jp/nhkworld/", "rt.com",
  "xinhuanet.com", "scmp.com", "timesofindia.indiatimes.com", "thehindu.com", "asahi.com",
  "yomiuri.co.jp", "straitstimes.com", "politico.com", "axios.com", "huffpost.com", "vox.com",
  "vice.com/en/section/news", "theintercept.com", "propublica.org"
];

const middleEastNewsWebsites: string[] = [
  "aljazeera.net", "alarabiya.net", "skynewsarabia.com", "aawsat.com", "arabnews.com", "alriyadh.com",
  "okaz.com.sa", "thenationalnews.com", "gulfnews.com", "khaleejtimes.com", "albayan.ae",
  "emaratalyoum.com", "ahram.org.eg", "egyptindependent.com", "dailynewsegypt.com", "youm7.com",
  "kuwaittimes.com", "arabtimesonline.com", "alqabas.com", "alraimedia.com", "thepeninsulaqatar.com",
  "gulf-times.com", "al-sharq.com", "timesofoman.com", "omandaily.om", "alwatan.com", "gdnoline.com",
  "alayam.com", "ajnet.me", "masrawy.com"
];

async function cleanUpStorage(): Promise<void> {
  log.info('--- Cleaning up previous storage directories ---');
  const storageRoot = process.cwd();
  const defaultStoragePath = path.join(storageRoot, 'storage');
  let cleanedCount = 0;
  const errors: string[] = [];

  try {
    await rm(defaultStoragePath, { recursive: true, force: true });
    log.debug(`Removed default storage`);
    cleanedCount++;
  } catch (e) {
    const error = e as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') errors.push(`Could not remove default storage directory: ${error.message}`);
    else log.debug(`Default storage directory not found, skipping`);
  }

  try {
    const filesAndDirs = await readdir(storageRoot);
    const domainStorageDirs = filesAndDirs.filter(f => f.startsWith('storage_') && !f.includes('.'));
    if (domainStorageDirs.length > 0) log.debug(`Found domain storage dirs to remove: ${domainStorageDirs.join(', ')}`);

    for (const dir of domainStorageDirs) {
      const dirPath = path.join(storageRoot, dir);
      try {
        if (dir.startsWith('storage_')) {
          await rm(dirPath, { recursive: true, force: true });
          log.debug(`Removed domain storage`);
          cleanedCount++;
        }
      } catch (e) {
        errors.push(`Could not remove domain storage directory: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push(`Error reading directory for domain storage cleanup: ${(e as Error).message}`);
  }

  log.info(`--- Storage cleanup finished. Removed ${cleanedCount} directories.${errors.length > 0 ? ' Errors encountered:' : ''} ---`);
  if (errors.length > 0) errors.forEach(err => log.error(err));
}

(async () => {
  log.setLevel(LogLevel.INFO);
  await cleanUpStorage();

  const allDomains = [...new Set([...globalNewsWebsites, ...middleEastNewsWebsites])];
  const results: Record<string, any[]> = {};
  log.info(`---> Starting scraping process for ${allDomains.length} domains... <---`);

  const BATCH_SIZE = 2;
  for (let i = 0; i < allDomains.length; i += BATCH_SIZE) {
    const batch = allDomains.slice(i, i + BATCH_SIZE);
    log.info(`---> Processing Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allDomains.length / BATCH_SIZE)}: ${batch.join(', ')} <---`);

    const batchPromises = batch.map(async (domain) => {
      try {
        const articles = await extractNewsFromDomain(domain, 50, 10);
        results[domain] = articles;
        log.info(`---> Finished: ${domain}, Found: ${articles.length} articles <---`);
      } catch (error) {
        log.error(`Error processing domain ${domain}: ${(error as Error).message}`, { stack: (error as Error).stack });
        results[domain] = [];
      }
    });

    await Promise.allSettled(batchPromises);

    if (i + BATCH_SIZE < allDomains.length) {
      const delaySeconds = 15;
      log.info(`---> Batch finished, waiting ${delaySeconds} seconds... <---`);
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    }
  }

  log.info("---> All scraping batches finished ---");

  let totalArticles = 0;
  log.info("--- Aggregated Results ---");
  for (const domain in results) {
    log.info(`Domain: ${domain} - Found ${results[domain].length} articles`);
    totalArticles += results[domain].length;
  }
  log.info(`---> Total unique articles extracted across all domains: ${totalArticles} <---`);

  try {
    const outputPath = path.resolve(process.cwd(), ARTICLES_LINKS_DIR, 'news_results.json');
    await writeFile(outputPath, JSON.stringify(results, null, 2));
    log.info(`Results saved successfully to ${outputPath}`);
  } catch (writeError) {
    log.error(`Failed to write results to file: ${(writeError as Error).message}`);
  }
})();