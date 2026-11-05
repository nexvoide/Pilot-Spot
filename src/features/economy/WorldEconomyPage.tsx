import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { bubbleSize, fetchMeasurement, type Measurement, type Period } from './data';

import { markets, type Node } from './markets';

const marketProxies: Record<string, {source: 'binance' | 'fred' | 'finnhub'; series: string; label: string}> = {
  stocks: {source:'fred', series:'SP500', label:'S&P 500 index'},
  bonds: {source:'finnhub', series:'BND', label:'BND US bond ETF'},
  forex: {source:'fred', series:'DEXUSEU', label:'EUR / USD reference'},
  commodities: {source:'finnhub', series:'GLD', label:'GLD gold ETF'},
  crypto: {source:'binance', series:'BTCUSDT', label:'BTC / USDT'},
};
const periods: Period[] = ['24H', '7D', '30D', '90D'];
const date = (value: string | number) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', ...(typeof value === 'number' || value.includes('T') ? { timeStyle: 'short' as const } : { timeZone: 'UTC' }) });

export function WorldEconomyPage() {
  const [path, setPath] = useState<Node[]>([]);
  const [period, setPeriod] = useState<Period>('24H');
  const current = path.at(-1);
  const nodes = current ? current.children ?? [] : markets.map((node) => ({...node, source: marketProxies[node.id].source, series: marketProxies[node.id].series}));
  const queries = useQueries({ queries: nodes.map((node) => ({
    queryKey: ['economy', node.source ?? node.id, node.series, period],
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchMeasurement(node.source!, node.series!, period, signal),
    enabled: !!node.source && !!node.series,
    staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false,
  })) });
  const measurements = queries.map((query) => query.data ?? null);
  const entries = nodes.map((node, index) => ({ node, index, measurement: measurements[index], query: queries[index] }));
  const visibleEntries = entries.filter(({node, measurement, query}) => period === '24H' || measurement !== null || (!!node.source && node.source !== 'finnhub' && query.isLoading));
  const max = Math.max(0, ...measurements.map((measurement) => measurement ? Math.abs(measurement.value) : 0));
  const selectedMeasurement = useMemo(() => {
    if (!current || current.children || !current.source || !current.series) return null;
    return current;
  }, [current]);
  const detailQuery = useQuery({
    queryKey: ['economy', selectedMeasurement?.source, selectedMeasurement?.series, period],
    queryFn: ({ signal }) => fetchMeasurement(selectedMeasurement!.source!, selectedMeasurement!.series!, period, signal),
    enabled: !!selectedMeasurement,
    staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false,
  });
  return (
    <div className="economy-page">
      <h1 className="economy-page-title">World Economy Flow</h1>
      <div className="economy-controls"><div className="economy-periods" role="group" aria-label="Time period">{periods.map((item) => <button type="button" key={item} aria-pressed={period === item} onClick={() => setPeriod(item)}>{item}</button>)}</div></div>
      <section className="economy-explorer" aria-label="Market explorer">
        <div className="economy-section-head"><div><p className="economy-kicker">PRICE PERFORMANCE <span> / </span> {period}</p><h2>{current?.name ?? 'Explore global markets'}</h2><p>{current?.subtitle ?? (current ? 'Explore the available categories and individual assets.' : 'Choose a market to explore its assets and available data.')}</p></div>{path.length > 0 && <button className="economy-back" type="button" onClick={() => setPath((items) => items.slice(0, -1))}>← Back</button>}</div>
        <div className="economy-breadcrumb"><button type="button" onClick={() => setPath([])}>World</button>{path.map((item, index) => <span key={item.id}> <b>/</b> <button type="button" onClick={() => setPath(path.slice(0, index + 1))}>{item.name}</button></span>)}</div>
        {current && !current.children ? <Detail node={current} measurement={detailQuery?.data ?? null} loading={detailQuery?.isLoading ?? false} error={detailQuery?.isError ?? false} /> : <>
          <div className="economy-bubbles" aria-label="Market bubbles">{visibleEntries.map(({ node, index, measurement }) => {
            const loading = !!node.source && queries[index].isLoading;
            const error = !!node.source && queries[index].isError;
            const value = measurement?.value ?? null;
            const tone = value === null ? 'neutral' : value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
            return <button key={node.id} className={`economy-bubble economy-bubble-${tone}`} style={{ '--bubble-size': `${bubbleSize(value, max)}px` } as React.CSSProperties} type="button" onClick={() => setPath([...path, node])}><span className="economy-bubble-name">{node.name}</span><strong>{loading ? 'Loading…' : value === null ? error ? 'Unavailable' : node.children ? 'Data unavailable' : 'No data' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`}</strong><small>{measurement ? `${current ? measurement.source : marketProxies[node.id]?.label} · proxy` : node.subtitle ?? (node.children ? 'View market' : 'Data unavailable')}</small></button>;
          })}</div>
          {visibleEntries.length === 0 && <p className="economy-scale" role="status">No price data is available for this period.</p>}
        </>}
      </section>

    </div>
  );
}
function Detail({ node, measurement, loading, error }: { node: Node; measurement: Measurement | null; loading: boolean; error: boolean }) {
  return <div className="economy-detail"><p className="economy-kicker">{node.subtitle ?? node.name}</p><strong>{loading ? 'Loading…' : measurement ? `${measurement.value > 0 ? '+' : ''}${measurement.value.toFixed(2)}%` : 'Data unavailable'}</strong><p>{error ? 'The source is unavailable or rate limited. FRED series require a free server-side key.' : measurement ? `${measurement.classification} · ${measurement.source} · ${measurement.unit}` : 'No comparable source is currently integrated for this asset.'}</p>{measurement && <p>{measurement.periodDescription ? `${measurement.periodDescription} · Quote ${date(measurement.end)}` : `Observation period: ${date(measurement.start)} → ${date(measurement.end)}`}<br />Last fetched: {date(measurement.updated)}{measurement.source === 'FRED' && ' · Daily data can be delayed and skip non-business days.'}</p>}</div>;
}
