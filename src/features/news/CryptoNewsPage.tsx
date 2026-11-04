import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const newsResponseSchema = z.object({
  articles: z.array(
    z.object({
      title: z.string().trim().min(1),
      link: z.string().url(),
      source: z.string().trim().min(1),
      pubDate: z.string().optional(),
      description: z.string().nullish(),
    }),
  ),
});

const cryptoTerms = /\b(?:crypto(?:currency|currencies)?|bitcoin|btc|ethereum|ether|eth|solana|sol|blockchain|web3|defi|stablecoins?|altcoins?|binance|coinbase|tokens?|on[- ]chain|xrp|ripple|dogecoin|doge|cardano|avalanche|polygon|chainlink|litecoin|sui|usdt|usdc|nfts?|decentralized finance)\b/i;
const newsCategories = ['bitcoin', 'ethereum', 'solana', 'defi'] as const;

async function fetchNews(signal: AbortSignal) {
  const results = await Promise.allSettled(newsCategories.map(async (category) => {
    const response = await fetch(`https://cryptocurrency.cv/api/news?category=${category}&limit=20`, { signal });
    if (!response.ok) throw new Error('Unable to load crypto news.');
    return newsResponseSchema.parse(await response.json()).articles;
  }));
  if (signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
  const succeeded = results.filter((result) => result.status === 'fulfilled');
  if (succeeded.length === 0) throw new Error('Unable to load crypto news.');

  const unique = new Map<string, z.infer<typeof newsResponseSchema>['articles'][number]>();
  for (const result of succeeded) {
    for (const article of result.value) {
      const url = new URL(article.link);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && cryptoTerms.test(`${article.title} ${article.description ?? ''}`)) {
        unique.set(article.link, article);
      }
    }
  }
  return [...unique.values()].sort((a, b) => {
    const left = Date.parse(a.pubDate ?? '');
    const right = Date.parse(b.pubDate ?? '');
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function CryptoNewsPage() {
  const news = useQuery({
    queryKey: ['crypto-news'],
    queryFn: ({ signal }) => fetchNews(signal),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  return (
    <section className="news-page" aria-labelledby="news-title">
      <div className="news-heading">
        <div>
          <p className="news-eyebrow">THE LATEST</p>
          <h1 id="news-title">Crypto news</h1>
          <p>Recent headlines from across the crypto market.</p>
        </div>
        <button type="button" className="news-refresh" onClick={() => void news.refetch()} disabled={news.isFetching}>
          {news.isFetching && !news.isLoading ? 'Refreshing…' : 'Refresh news'}
        </button>
      </div>
      <p className="news-caption">Updates every 5 minutes · Headlines provided by Free Crypto News API</p>
      {news.isLoading && <p className="news-message" role="status">Loading the latest headlines…</p>}
      {news.isError && !news.data && (
        <div className="news-message" role="alert">
          <p>News is unavailable right now. Please try again.</p>
          <button type="button" className="news-refresh" onClick={() => void news.refetch()}>Try again</button>
        </div>
      )}
      {news.isError && news.data && <p className="news-message" role="status">Could not refresh. Showing the last retrieved headlines.</p>}
      {news.data && news.data.length === 0 && <p className="news-message">No headlines are available right now.</p>}
      {news.data && news.data.length > 0 && (
        <ul className="news-list">
          {news.data.map((article) => (
            <li key={article.link}>
              <a className="news-article" href={article.link} target="_blank" rel="noopener noreferrer">
                <span className="news-article-meta"><strong>{article.source}</strong><span>{formatDate(article.pubDate)}</span></span>
                <span className="news-article-title">{article.title}</span>
                <span className="news-read">Read article <span aria-hidden="true">↗</span></span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
