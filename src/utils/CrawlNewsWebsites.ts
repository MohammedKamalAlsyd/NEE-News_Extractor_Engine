import { PlaywrightCrawler, utils, Dataset, Request } from 'crawlee'; // Import Dataset, Request
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { URL } from 'url';
import type { Element } from 'domhandler';
import * as path from 'path';
import * as fs from 'fs/promises'; // Import fs.promises
import { logInfo, logWarning, logError } from './logger.js'; // Import custom logger

// Interface for the extracted news article data (Simplified)
interface NewsArticle {
    link: string;
    image?: string | null; // Optional image URL
    domain: string; // Add domain for easier grouping later
}

// --- Heuristic Function to Identify Likely Article Links ---
/**
 * Checks if a URL is likely an article link based on common patterns.
 * Filters out common non-article paths.
 * @param url - The URL object to check.
 * @param domain - The base domain we are crawling.
 * @returns boolean - True if it seems like an article link on the target domain.
 */
function isLikelyArticleLink(url: URL, domain: string): boolean {
    // Ensure it's on the same domain or a known subdomain pattern (e.g., www.)
    const cleanDomain = domain.replace(/^www\./i, '');
    if (!url.hostname.endsWith(cleanDomain)) {
        return false;
    }

    const urlPath = url.pathname; // Renamed from 'path' to avoid conflict

    // Basic checks: non-empty path, avoid simple root/section paths, ignore fragments/javascript
    if (!urlPath || urlPath === '/' || url.protocol === 'javascript:' || url.hash) {
        return false;
    }

    const pathSegments = urlPath.split('/').filter(Boolean);

    // Rule 1: Often have multiple path segments (e.g., /category/article-slug)
    // Avoid simple category pages unless they contain digits or specific extensions
    if (pathSegments.length < 2) {
        // Allow paths like /article-slug-123.html or /12345/story
        if (!/\d/.test(urlPath) && !/\.(html|htm|php|asp|aspx|story)$/i.test(urlPath)) {
            // logDebug(`[isLikelyArticleLink] Filtered out short path: ${url.href}`, domain); // Use logInfo for debug now
            return false;
        }
    }

     // Rule 2: Often contain numbers (date parts, IDs)
    if (/\d/.test(urlPath)) {
        // Check if it looks like *only* a date or year (less likely an article)
        if (/^\/?(\d{4}|\d{4}\/\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2})\/?$/.test(urlPath)) {
             // logDebug(`[isLikelyArticleLink] Filtered out date-only path: ${url.href}`, domain);
            return false; // Likely an archive page
        }
        return true; // Contains numbers, good chance it's an article
    }

    // Rule 3: Often contain hyphens or end with common article extensions
    if (urlPath.includes('-') || /\.(html|htm|php|asp|aspx|story)$/i.test(urlPath)) {
        return true;
    }

    // Rule 4: Avoid common non-article keywords in the *last* path segment
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment && /(category|tag|section|topic|author|user|profile|search|contact|about|privacy|terms|login|register|video|gallery|live)\b/i.test(lastSegment)) {
        // logDebug(`[isLikelyArticleLink] Filtered out keyword path: ${url.href}`, domain);
        return false;
    }

    // If path depth is sufficient and doesn't match negative patterns, consider it likely
    if (pathSegments.length >= 2) {
         return true;
    }

    // logDebug(`[isLikelyArticleLink] Filtered out potential non-article link: ${url.href}`, domain);
    return false;
}


// --- Helper: Extract article data from a candidate link element ---
/**
 * Attempts to extract a valid article link and image from a candidate link element.
 * @param linkElement - The candidate <a> HTML element.
 * @param $ - The Cheerio instance for the current page.
 * @param currentUrl - The URL of the page where the link was found.
 * @param domain - The target domain name.
 * @returns NewsArticle object if successful, otherwise null.
 */
function extractArticleData(linkElement: Element, $: CheerioAPI, currentUrl: string, domain: string): Omit<NewsArticle, 'domain'> | null {
    const $link = $(linkElement);
    const href = $link.attr('href');
    if (!href) return null;

    let linkUrl: URL;
    try {
        linkUrl = new URL(href, currentUrl);
        // Ensure it's an http/https link
        if (!['http:', 'https:'].includes(linkUrl.protocol)) {
           // logDebug(`Skipping non-http(s) link: ${href}`, domain);
            return null;
        }
    } catch (e) {
        logWarning(`Invalid URL found: ${href} on ${currentUrl}`, domain);
        return null;
    }

    const link = linkUrl.href;

    // --- Image Extraction Logic ---
    let image: string | null = null;
    let $imgTag: cheerio.Cheerio<Element> | null = null;

    // 1. Look for an image *inside* the link element
    $imgTag = $link.find('img').first();

    // 2. If not inside, look for an image immediately preceding or following the link within the *same parent*
    if (!$imgTag || $imgTag.length === 0) {
        $imgTag = $link.prev('img').first();
    }
    if (!$imgTag || $imgTag.length === 0) {
         $imgTag = $link.next('img').first();
    }
    // 3. If not adjacent, look within the *closest common container* (article, li, div.item etc.) that holds the link
    if (!$imgTag || $imgTag.length === 0) {
        // More robust container finding: look for common semantic or structural elements
        const $container = $link.closest('article, li, .item, .card, .post, [class*="item"], [class*="card"], [class*="post"], [class*="teaser"], figure');
         if ($container.length > 0) {
            // Find the first image within this container - assumes visual proximity implies relevance
            $imgTag = $container.find('img').first();
         }
    }

     // 4. Fallback: If no container found, check siblings more broadly (less reliable)
     if (!$imgTag || $imgTag.length === 0) {
         $imgTag = $link.siblings('img').first();
     }


    // If an image tag was found, extract its source
    if ($imgTag && $imgTag.length > 0) {
        const src = $imgTag.attr('src');
        const srcset = $imgTag.attr('srcset');
        let imageSrc: string | undefined = undefined;

        // Prioritize srcset for potentially higher resolution, take the last one listed
        if (srcset) {
            const sources = srcset.split(',')
                                  .map((s: string) => s.trim().split(' ')[0])
                                  .filter(Boolean); // Filter out empty strings
            if (sources.length > 0) {
                 imageSrc = sources[sources.length - 1];
            }
        }
         // Fallback to src if srcset is missing or unparseable
        if (!imageSrc && src) {
            imageSrc = src;
        }

        // Ignore tiny or placeholder images (common for icons, spacers)
        const width = parseInt($imgTag.attr('width') || '0', 10);
        const height = parseInt($imgTag.attr('height') || '0', 10);
        // Check if dimensions are present OR if the src looks like a placeholder
        if ( (width > 0 && width < 50) || (height > 0 && height < 50) || (imageSrc && /placeholder|spacer|blank|transparent/i.test(imageSrc)) ) {
           // logDebug(`Skipping potentially small/placeholder image (w:${width}, h:${height}) for link: ${link}`, domain);
            imageSrc = undefined; // Reset imageSrc if it's too small or placeholder
        }

        if (imageSrc && !imageSrc.startsWith('data:')) { // Ignore inline data URIs
            try {
                image = new URL(imageSrc, currentUrl).href;
            } catch (imgErr) {
                logWarning(`Invalid image src found: ${imageSrc} in ${currentUrl}`, domain);
                image = null; // Ensure image is null if URL parsing fails
            }
        }
    }
    // --- End Image Extraction ---

    // Return the potential article data (without domain, added in handler)
    return { link, image };
}

/**
 * Extracts news article links and associated images from a given news website domain.
 * Uses heuristics to identify article links and find related images.
 * Saves results to data/<domain_name_part>.json
 * @param targetDomain - The target domain name (e.g., "bbc.com", "aljazeera.net")
 * @param maxArticlesPerDomain - Maximum number of unique articles to extract for this domain.
 * @param maxPagesToCrawl - Maximum number of pages to crawl within the domain (acts as a crawl depth/breadth limit).
 * @returns Promise<NewsArticle[]> - A promise resolving to the list of extracted articles.
 * @throws Error if crawl finishes successfully but no articles were extracted.
 */
export async function extractNewsFromDomain(
    targetDomain: string,
    maxArticlesPerDomain: number = 50,
    maxPagesToCrawl: number = 10
): Promise<NewsArticle[]> {

    // Clean domain for logging and comparison
    const cleanDomain = targetDomain.toLowerCase().replace(/^www\./i, '');
    const logContext = cleanDomain; // Use clean domain for logger context

    const startUrl = `https://${cleanDomain}/`; // Ensure https
    const dataDir = path.resolve(process.cwd(), 'data');
    const domainNamePart = cleanDomain.split('.').slice(0, -1).join('.') || cleanDomain; // e.g., bbc.com -> bbc, news.google.com -> news.google
    const outputFilename = path.join(dataDir, `${domainNamePart}.json`);

    await logInfo(`Starting crawl for domain: ${cleanDomain}`, logContext);
    await logInfo(`Config: Max Articles=${maxArticlesPerDomain}, Max Pages=${maxPagesToCrawl}`, logContext);
    await logInfo(`Output will be saved to: ${outputFilename}`, logContext);

    // Ensure data directory exists
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch (err) {
        await logError(`Failed to create data directory: ${dataDir}`, logContext, err);
        throw new Error(`Failed to create data directory: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- DATASET and State ---
    // Use the default dataset for this crawl run. Data is pushed within the handler.
    // We need local state to track article count and processed links *for this specific run*
    // because Dataset is append-only during the crawl.
    let articlesExtractedCount = 0;
    const processedLinksInThisRun = new Set<string>();
    // -------------------------

    let crawlFailed = false; // Flag to track if the crawl itself errored


    const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: maxPagesToCrawl, // Limit pages visited by this crawl instance
        navigationTimeoutSecs: 60,
        // No explicit requestQueue needed when using Dataset.pushData unless you need fine-grained queue control
        // Crawlee will use a default queue associated with this run.

        requestHandler: async ({ page, request, enqueueLinks }) => {
            const currentUrl = page.url();
            await logInfo(`Processing page: ${currentUrl}`, logContext);

            // Check if we already have enough articles
            if (articlesExtractedCount >= maxArticlesPerDomain) {
                await logInfo(`Article limit (${maxArticlesPerDomain}) reached for ${cleanDomain}. Skipping further extraction on ${currentUrl}.`, logContext);
                // Stop processing this page and don't enqueue more links from it
                return;
            }


            // --- Page Interaction & Content Extraction ---
            // Using mobile viewport potentially avoids some complex desktop layouts/ads
            await page.setViewportSize({ width: 390, height: 844 });
            // await logInfo(`Set viewport to mobile size.`, logContext); // Less verbose log

            try {
                 // Wait for content, but don't fail entirely if it times out (some pages might be slow/problematic)
                 await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
            } catch (e) {
                 await logWarning(`waitForLoadState timed out on ${currentUrl}`, logContext);
            }
            await utils.sleep(1500 + Math.random() * 1000); // Small random delay

            const html = await page.content();
            const $ = cheerio.load(html);
            // -------------------------------------------


            // --- Find Potential Article Links ---
            const potentialArticleElements: Element[] = [];
            $('a[href]').each((_i, el) => {
                // Skip links in common non-content sections
                 if ($(el).closest('header, footer, nav, aside, .header, .footer, .navigation, .sidebar, #header, #footer, #nav, #sidebar, [role="navigation"], [role="banner"], [role="contentinfo"]').length > 0) return;

                 const href = $(el).attr('href');
                 if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;

                 try {
                     const absoluteUrl = new URL(href, currentUrl);
                     // Check if it's on the target domain and looks like an article
                     if (isLikelyArticleLink(absoluteUrl, cleanDomain)) {
                          potentialArticleElements.push(el);
                     }
                 } catch (e) {
                      // logWarning(`Invalid URL found during scan: ${href} on ${currentUrl}. Error: ${e.message}`, logContext); // Can be noisy
                 }
            });
            await logInfo(`Found ${potentialArticleElements.length} potential article links on ${currentUrl}`, logContext);
            // ------------------------------------


            // --- Extract Article Data & Push to Dataset ---
            let extractedCountOnPage = 0;
            for (const linkElement of potentialArticleElements) {
                if (articlesExtractedCount >= maxArticlesPerDomain) break; // Check limit again

                const articleData = extractArticleData(linkElement, $, currentUrl, cleanDomain);

                if (articleData && !processedLinksInThisRun.has(articleData.link)) {
                    processedLinksInThisRun.add(articleData.link); // Track locally for this run

                    // Add domain info and push to dataset
                    const fullArticleData: NewsArticle = {
                         ...articleData,
                         domain: cleanDomain
                    };
                    await Dataset.pushData(fullArticleData);

                    articlesExtractedCount++; // Increment global count for this run
                    extractedCountOnPage++;
                   // await logInfo(`Extracted: ${articleData.link} ${articleData.image ? '(with image)' : '(no image found)'}`, logContext); // Can be noisy
                }
            }
            if (extractedCountOnPage > 0) {
                await logInfo(`Extracted ${extractedCountOnPage} new articles on this page. Total for run: ${articlesExtractedCount}`, logContext);
            }
            // ------------------------------------------


            // --- Enqueue More Links if Needed ---
            if (articlesExtractedCount < maxArticlesPerDomain) {
                await enqueueLinks({
                    // Strategy: Add links from the same hostname.
                    // Glob patterns can restrict to paths likely containing articles if needed.
                    strategy: 'same-hostname',
                    // Example glob to focus crawl - adjust based on site structure if necessary
                    // globs: [`https://${cleanDomain}/**/*`],
                    // Transform request to maybe add metadata if needed later
                    // transformRequestFunction: (request) => { ... }
                });
                await logInfo(`Enqueued further links from ${currentUrl}`, logContext);
            } else {
                await logInfo(`Article limit reached for ${cleanDomain}, not enqueuing further links from ${currentUrl}.`, logContext);
            }
            // ------------------------------------
        },

        failedRequestHandler: async ({ request }: { request: Request }) => {
             // Explicitly type the destructured argument
             crawlFailed = true; // Mark that at least one request failed
             await logError(`Failed to process request: ${request.url}`, logContext);
             // Note: The request is automatically retried based on crawler config (maxRequestRetries)
        },

        // preNavigationHooks: [
        //     // Example: Block resources like images or CSS to potentially speed up loading
        //    async ({ page, request }) => {
        //         await page.route('**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}', route => route.abort());
        //    },
        // ],
    });
    // --- End Crawler Instantiation ---


    try {
        // Run the crawler. It will process requests starting from the queue.
        await crawler.run([startUrl]); // Pass the start URL here
        await logInfo(`Crawler run finished for ${cleanDomain}.`, logContext);
    } catch (error) {
        crawlFailed = true; // Mark crawl as failed if crawler.run() throws
        await logError(`Crawler run encountered a critical error for ${cleanDomain}`, logContext, error);
        // Decide if you want to re-throw or handle it. Re-throwing stops execution.
        // throw error; // Uncomment if a critical crawl error should stop everything
    }

    // --- Process and Save Results ---
    let finalArticles: NewsArticle[] = [];
    try {
        const dataset = await Dataset.open(); // Opens the default dataset for this run
        const { items } = await dataset.getData();
        await logInfo(`Retrieved ${items.length} items from dataset for ${cleanDomain}.`, logContext);

        // Deduplicate based on link (Dataset might contain duplicates if multiple pages link to the same article)
        const uniqueArticlesMap = new Map<string, NewsArticle>();
        for (const item of items) {
            // Basic validation, although pushData should ideally enforce structure
            if (item && typeof item === 'object' && 'link' in item && 'domain' in item && item.domain === cleanDomain) {
                 // Prioritize keeping entries with images if duplicates exist
                if (!uniqueArticlesMap.has(item.link) || (item.image && !uniqueArticlesMap.get(item.link)?.image)) {
                    uniqueArticlesMap.set(item.link, item as NewsArticle);
                }
            }
        }
        finalArticles = Array.from(uniqueArticlesMap.values());

        await logInfo(`Found ${finalArticles.length} unique articles for ${cleanDomain}.`, logContext);

        // Save the unique articles to the JSON file
        if (finalArticles.length > 0) {
            await fs.writeFile(outputFilename, JSON.stringify(finalArticles, null, 2), 'utf-8');
            await logInfo(`Successfully saved ${finalArticles.length} articles to ${outputFilename}`, logContext);
        } else {
            await logWarning(`No unique articles were extracted or found in the dataset for ${cleanDomain}. No file saved.`, logContext);
            // Optionally delete an empty file if it was created previously?
            try {
                await fs.unlink(outputFilename); // Attempt to remove empty file
            } catch (e: any) {
                if (e.code !== 'ENOENT') { // Ignore if file doesn't exist
                    await logWarning(`Could not remove potentially empty file: ${outputFilename}`, logContext);
                }
            }
        }

    } catch (error) {
        await logError(`Failed to process or save dataset results for ${cleanDomain}`, logContext, error);
        // If saving fails, the data might be lost unless the dataset persists somewhere
        // depending on Crawlee storage configuration.
        crawlFailed = true; // Mark failure if post-processing fails
    }

    // --- Final Check and Return ---
    if (!crawlFailed && finalArticles.length === 0) {
        // If the crawl technically succeeded (no errors threw) but we found nothing, throw a specific error.
        const message = `Crawl for ${cleanDomain} completed successfully, but no articles were extracted.`;
        await logError(message, logContext); // Log it as an error condition
        throw new Error(message);
    }

    if (crawlFailed && finalArticles.length === 0) {
         await logWarning(`Crawl for ${cleanDomain} finished with errors and no articles were extracted.`, logContext);
         // Don't throw here, as an error was already logged during the crawl/saving phase.
         // Let the caller decide how to handle partial/failed crawls.
    }

    await logInfo(`Finished processing domain: ${cleanDomain}. Returning ${finalArticles.length} articles.`, logContext);
    return finalArticles; // Return the unique articles found
    // ------------------------------------
}
