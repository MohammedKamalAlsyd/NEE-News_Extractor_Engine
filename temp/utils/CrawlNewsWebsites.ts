// src/utils/CrawlNewsWebsites.ts
import { PlaywrightCrawler, utils, Dataset, Request } from 'crawlee';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { URL } from 'url';
import type { Element } from 'domhandler';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logInfo, logWarning, logError } from './logger.js';
import { NewsArticle } from '../meta/interfaces.js';
import { ARTICLES_LINKS_DIR } from '../meta/constants.js';

interface DomainSelectors {
  articleLinkSelector: string;
  imageSelector: string;
  cookieSelector: string;
}

// Load domain selectors from JSON file
async function loadDomainSelectors(): Promise<Record<string, DomainSelectors>> {
  const selectorsPath = path.join(process.cwd(), 'src', 'domain_selectors.json');
  try {
    const content = await fs.readFile(selectorsPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    await logError(`Failed to load domain selectors: ${error}`);
    return { default: { articleLinkSelector: 'a[href]', imageSelector: 'img', cookieSelector: 'button[class*=\'cookie\']' } };
  }
}

// Heuristic Function
function isLikelyArticleLink(url: URL, domain: string): boolean {
  const cleanDomain = domain.replace(/^www\./i, '');
  if (!url.hostname.endsWith(cleanDomain)) return false;

  const urlPath = url.pathname;
  if (!urlPath || urlPath === '/' || url.protocol === 'javascript:' || url.hash) return false;

  const pathSegments = urlPath.split('/').filter(Boolean);
  if (pathSegments.length < 1 && !/\d/.test(urlPath) && !/\.(html|htm|php|asp|aspx|story)$/i.test(urlPath)) return false;
  if (/^\/?(\d{4}|\d{4}\/\d{2}|\d{4}\/\d{2}\/\d{2})\/?$/.test(urlPath)) return false;

  if (urlPath.includes('-') || /\.(html|htm|php|asp|aspx|story)$/i.test(urlPath)) return true;

  const lastSegment = pathSegments[pathSegments.length - 1];
  if (lastSegment && /(category|tag|section|topic|author|user|profile|search|contact|about|privacy|terms|login|register|video|gallery|live)\b/i.test(lastSegment)) return false;

  return pathSegments.length >= 2;
}

// Extract article data
function extractArticleData(linkElement: Element, $: CheerioAPI, currentUrl: string, domain: string, imageSelector: string): Omit<NewsArticle, 'domain'> | null {
  const $link = $(linkElement);
  const href = $link.attr('href');
  if (!href) return null;

  let linkUrl: URL;
  try {
    linkUrl = new URL(href, currentUrl);
    if (!['http:', 'https:'].includes(linkUrl.protocol)) return null;
  } catch (e) {
    logWarning(`Invalid URL found: ${href} on ${domain}`, domain);
    return null;
  }

  const link = linkUrl.href;
  let image: string | null = null;
  let $imgTag: cheerio.Cheerio<Element> | null = null;

  $imgTag = $link.find(imageSelector).first();
  if (!$imgTag || $imgTag.length === 0) $imgTag = $link.prev('img').first();
  if (!$imgTag || $imgTag.length === 0) $imgTag = $link.next('img').first();
  if (!$imgTag || $imgTag.length === 0) {
    const $container = $link.closest('article, li, .item, .card, .post');
    if ($container.length > 0) $imgTag = $container.find('img').first();
  }
  if (!$imgTag || $imgTag.length === 0) $imgTag = $link.siblings('img').first();

  if ($imgTag && $imgTag.length > 0) {
    const src = $imgTag.attr('src');
    const srcset = $imgTag.attr('srcset');
    let imageSrc: string | undefined;

    if (srcset) {
      const sources = srcset.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
      if (sources.length > 0) imageSrc = sources[sources.length - 1];
    }
    if (!imageSrc && src) imageSrc = src;

    const width = parseInt($imgTag.attr('width') || '0', 10);
    const height = parseInt($imgTag.attr('height') || '0', 10);
    if ((width > 0 && width < 50) || (height > 0 && height < 50) || (imageSrc && /placeholder|spacer|blank|transparent/i.test(imageSrc))) {
      imageSrc = undefined;
    }

    if (imageSrc && !imageSrc.startsWith('data:')) {
      try {
        image = new URL(imageSrc, currentUrl).href;
      } catch (imgErr) {
        logWarning(`Invalid image src found: ${imageSrc} in ${domain}`, domain);
        image = null;
      }
    }
  }

  return { link, image };
}

// Main Extraction Function
export async function extractNewsFromDomain(
  targetDomain: string,
  maxArticlesPerDomain: number = 50,
  maxPagesToCrawl: number = 10
): Promise<NewsArticle[]> {
  const cleanDomain = targetDomain.toLowerCase().replace(/^www\./i, '');
  const logContext = cleanDomain;
  const startUrl = `https://${cleanDomain}/`;
  const outputDir = path.join(process.cwd(), ARTICLES_LINKS_DIR);
  const outputFilename = path.join(outputDir, `${cleanDomain}.json`);

  await logInfo(`Starting crawl for domain: ${cleanDomain}`, logContext);
  await logInfo(`Config: Max Articles=${maxArticlesPerDomain}, Max Pages=${maxPagesToCrawl}`, logContext);
  await logInfo(`Output will be saved to: ${outputFilename}`, logContext);

  try {
    await fs.mkdir(outputDir, { recursive: true });
    await logInfo(`Ensured output directory exists: ${outputDir}`, logContext);
  } catch (err) {
    await logError(`Failed to create output directory: ${err}`, logContext);
    throw new Error(`Failed to create output directory: ${err instanceof Error ? err.message : String(err)}`);
  }

  let articlesExtractedCount = 0;
  const processedLinksInThisRun = new Set<string>();
  let crawlFailed = false;

  const domainSelectors = await loadDomainSelectors();
  const { articleLinkSelector, imageSelector, cookieSelector } = domainSelectors[cleanDomain] || domainSelectors['default'];
  await logInfo(`Using selectors - Article: ${articleLinkSelector}, Image: ${imageSelector}, Cookie: ${cookieSelector}`, logContext);

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: maxPagesToCrawl,
    navigationTimeoutSecs: 60,

    requestHandler: async ({ page, request, enqueueLinks }) => {
      const currentUrl = page.url();
      await logInfo(`Processing page: ${currentUrl}`, logContext);

      if (articlesExtractedCount >= maxArticlesPerDomain) {
        await logInfo(`Article limit (${maxArticlesPerDomain}) reached. Skipping further extraction on ${currentUrl}.`, logContext);
        return;
      }

      await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size

      // Handle cookie consent
      try {
        const cookieButton = page.locator(cookieSelector);
        await cookieButton.waitFor({ state: 'visible', timeout: 1500 });
        await cookieButton.click({ timeout: 3000 });
        await logInfo(`Clicked cookie consent button on ${currentUrl}`, logContext);
        await page.waitForTimeout(500 + Math.random() * 500);
      } catch (e) {
        await logInfo(`No cookie consent button found or clickable with selector ${cookieSelector} on ${currentUrl}`, logContext);
      }

      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      } catch (e) {
        await logWarning(`waitForLoadState timed out on ${currentUrl}`, logContext);
      }
      await utils.sleep(1500 + Math.random() * 1000);

      const html = await page.content();
      const $ = cheerio.load(html);

      const potentialArticleElements: Element[] = [];
      $(articleLinkSelector).each((_i, el) => {
        if ($(el).closest('header, footer, nav, aside').length > 0) return;
        const href = $(el).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

        try {
          const absoluteUrl = new URL(href, currentUrl);
          if (isLikelyArticleLink(absoluteUrl, cleanDomain)) potentialArticleElements.push(el as Element);
        } catch (e) {}
      });
      await logInfo(`Found ${potentialArticleElements.length} potential article links on ${currentUrl}`, logContext);

      let extractedCountOnPage = 0;
      for (const linkElement of potentialArticleElements) {
        if (articlesExtractedCount >= maxArticlesPerDomain) break;

        const articleData = extractArticleData(linkElement, $, currentUrl, cleanDomain, imageSelector);
        if (articleData && !processedLinksInThisRun.has(articleData.link)) {
          processedLinksInThisRun.add(articleData.link);
          const fullArticleData: NewsArticle = { ...articleData, domain: cleanDomain };
          await Dataset.pushData(fullArticleData);
          articlesExtractedCount++;
          extractedCountOnPage++;
        }
      }
      if (extractedCountOnPage > 0) {
        await logInfo(`Extracted ${extractedCountOnPage} new articles on this page. Total: ${articlesExtractedCount}`, logContext);
      }

      if (articlesExtractedCount < maxArticlesPerDomain) {
        await enqueueLinks({ strategy: 'same-hostname', globs: [`https://${cleanDomain}/**/*`] });
        await logInfo(`Enqueued further links from ${currentUrl}`, logContext);
      }
    },

    failedRequestHandler: async ({ request }: { request: Request }) => {
      crawlFailed = true;
      await logError(`Failed to process request: ${request.url}`, logContext);
    },
  });

  try {
    await crawler.run([startUrl]);
    await logInfo(`Crawler run finished for ${cleanDomain}.`, logContext);
  } catch (error) {
    crawlFailed = true;
    await logError(`Crawler run encountered a critical error for ${cleanDomain}`, logContext, error);
  }

  let finalArticles: NewsArticle[] = [];
  try {
    const dataset = await Dataset.open();
    const { items } = await dataset.getData();
    await logInfo(`Retrieved ${items.length} items from dataset for ${cleanDomain}.`, logContext);

    const uniqueArticlesMap = new Map<string, NewsArticle>();
    for (const item of items) {
      if (item && 'link' in item && 'domain' in item && item.domain === cleanDomain) {
        if (!uniqueArticlesMap.has(item.link) || (item.image && !uniqueArticlesMap.get(item.link)?.image)) {
          uniqueArticlesMap.set(item.link, item as NewsArticle);
        }
      }
    }
    finalArticles = Array.from(uniqueArticlesMap.values());

    await logInfo(`Found ${finalArticles.length} unique articles for ${cleanDomain}.`, logContext);

    if (finalArticles.length > 0) {
      await fs.writeFile(outputFilename, JSON.stringify(finalArticles, null, 2), 'utf-8');
      await logInfo(`Successfully saved ${finalArticles.length} articles to ${outputFilename}`, logContext);
    } else {
      await logWarning(`No unique articles extracted for ${cleanDomain}. No file saved.`, logContext);
    }
  } catch (error) {
    await logError(`Failed to process or save dataset results for ${cleanDomain}`, logContext, error);
    crawlFailed = true;
  }

  if (!crawlFailed && finalArticles.length === 0) {
    const message = `Crawl for ${cleanDomain} completed successfully, but no articles were extracted.`;
    await logError(message, logContext);
    throw new Error(message);
  }

  await logInfo(`Finished processing domain: ${cleanDomain}. Returning ${finalArticles.length} articles.`, logContext);
  return finalArticles;
}